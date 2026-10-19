import "server-only";
import { createHash } from "node:crypto";
import { formatCode, type GuestOrderView, type OutletInfo, type PublicMenuItem } from "@/lib/order/types";
import type { CreateOrderInput } from "@/lib/validation/order";
import { bumpFeed, db, withOutletLock, type Tx } from "./db";
import { ApiError } from "./http";
import { expireDue, itemsView, loadItems, logEvent, maybeExpire, type ItemRow, type OrderRow } from "./queue-service";

export interface OutletRow {
  id: string;
  slug: string;
  name: string;
  accepting_orders: boolean;
  counter_ready: boolean;
  feed_version: string;
}

export async function findOutlet(slug: string): Promise<OutletRow> {
  const [outlet] = await db()<OutletRow[]>`
    select o.id, o.slug, o.name, o.accepting_orders, s.counter_ready, s.feed_version
    from tooday.outlets o join tooday.service_state s on s.outlet_id = o.id
    where o.slug = ${slug}`;
  if (!outlet) throw new ApiError(404, "NOT_FOUND", "Outlet tidak dikenali. Coba pindai ulang QR di outlet.");
  return outlet;
}

/** Menu publik + konteks outlet/meja. Parameter meja dicocokkan dengan data aktif di server. */
export async function publicMenu(slug: string, tableCode: string | null): Promise<{ outlet: OutletInfo; items: PublicMenuItem[]; feedVersion: number }> {
  const outlet = await findOutlet(slug);
  let table: string | null = null;
  let tableInvalid = false;
  if (tableCode) {
    const [row] = await db()<{ code: string }[]>`
      select code from tooday.dining_tables where outlet_id = ${outlet.id} and code = ${tableCode} and active`;
    if (row) table = row.code;
    else tableInvalid = true;
  }
  const items = await db()<
    { sku: string; name: string; category: string; description: string | null; price_rupiah: number | null; image_url: string | null; available: boolean; version: number }[]
  >`
    select sku, name, category, description, price_rupiah, image_url, available, version
    from tooday.menu_items where outlet_id = ${outlet.id} and active
    order by sort_order, name`;
  return {
    outlet: {
      slug: outlet.slug,
      name: outlet.name,
      acceptingOrders: outlet.accepting_orders,
      counterReady: outlet.counter_ready,
      table,
      tableInvalid,
    },
    items: items.map((item) => ({
      sku: item.sku,
      name: item.name,
      category: item.category,
      description: item.description,
      price: item.price_rupiah,
      image: item.image_url,
      available: item.available,
      version: item.version,
    })),
    feedVersion: Number(outlet.feed_version),
  };
}

// ---------------------------------------------------------------------------
// Tampilan order untuk tamu
// ---------------------------------------------------------------------------
async function guestView(sql: Tx | ReturnType<typeof db>, order: OrderRow, items: ItemRow[]): Promise<GuestOrderView> {
  const [state] = await sql<{ counter_ready: boolean; feed_version: string }[]>`
    select counter_ready, feed_version from tooday.service_state where outlet_id = ${order.outlet_id}`;
  let ahead: number | null = null;
  if (order.order_status === "WAITING_PAYMENT") {
    // Dihitung dari urutan antrean di server, bukan dari selisih nomor.
    const [row] = await sql<{ ahead: number }[]>`
      select count(*)::int as ahead from tooday.orders
      where outlet_id = ${order.outlet_id}
        and (order_status = 'CALLED'
          or (order_status = 'WAITING_PAYMENT'
              and (queue_entered_at, queue_number) < (${order.queue_entered_at}::timestamptz, ${order.queue_number}::int)))`;
    ahead = row.ahead;
  }
  return {
    id: order.id,
    code: formatCode(order.queue_number),
    status: order.order_status,
    payment: order.payment_status,
    orderType: order.order_type,
    table: order.table_code,
    nickname: order.nickname,
    total: order.total_rupiah,
    items: itemsView(items),
    createdAt: order.created_at.toISOString(),
    calledOnSubmit: order.first_called_at !== null && order.first_called_at.getTime() === order.created_at.getTime(),
    ahead,
    counterReady: state.counter_ready,
    callEventId: order.call_event_id === null ? null : Number(order.call_event_id),
    readyEventId: order.ready_event_id === null ? null : Number(order.ready_event_id),
    version: order.version,
    feedVersion: Number(state.feed_version),
  };
}

async function viewById(sql: Tx | ReturnType<typeof db>, orderId: string): Promise<GuestOrderView> {
  const [order] = await sql<OrderRow[]>`select * from tooday.orders where id = ${orderId}`;
  const items = await loadItems(sql, [orderId]);
  return guestView(sql, order, items.get(orderId) ?? []);
}

/** Order hanya terbaca oleh sesi tamu yang membuatnya. Order milik orang lain = tidak ditemukan. */
export async function getGuestOrder(guestId: string, orderId: string): Promise<GuestOrderView> {
  const sql = db();
  const [order] = await sql<OrderRow[]>`
    select * from tooday.orders where id = ${orderId} and guest_session_id = ${guestId}`;
  if (!order) throw new ApiError(404, "NOT_FOUND", "Pesanan tidak ditemukan di perangkat ini.");
  if (order.expires_at && order.expires_at <= new Date() && ["WAITING_PAYMENT", "DEFERRED"].includes(order.order_status)) {
    await maybeExpire(order.outlet_id);
    return viewById(sql, orderId);
  }
  const items = await loadItems(sql, [orderId]);
  return guestView(sql, order, items.get(orderId) ?? []);
}

export async function getGuestOrderByKey(guestId: string, key: string): Promise<GuestOrderView | null> {
  const [row] = await db()<{ order_id: string }[]>`
    select order_id from tooday.order_requests where guest_session_id = ${guestId} and idempotency_key = ${key}`;
  return row ? getGuestOrder(guestId, row.order_id) : null;
}

export async function listGuestOrders(guestId: string, outletSlug: string) {
  const rows = await db()<{ id: string; queue_number: number; order_status: string; total_rupiah: number; created_at: Date }[]>`
    select o.id, o.queue_number, o.order_status, o.total_rupiah, o.created_at
    from tooday.orders o join tooday.outlets t on t.id = o.outlet_id
    where o.guest_session_id = ${guestId} and t.slug = ${outletSlug}
      and (o.order_status not in ('COMPLETED', 'CANCELLED', 'EXPIRED') or o.closed_at > now() - interval '3 hours')
    order by o.created_at desc limit 10`;
  return rows.map((row) => ({
    id: row.id,
    code: formatCode(row.queue_number),
    status: row.order_status,
    total: row.total_rupiah,
    createdAt: row.created_at.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Submit order
// ---------------------------------------------------------------------------
function requestHash(input: CreateOrderInput): string {
  const canonical = JSON.stringify({
    outlet: input.outlet,
    orderType: input.orderType,
    table: input.orderType === "DINE_IN" ? (input.table ?? null) : null,
    nickname: input.nickname ?? null,
    lines: input.lines.map((line) => [line.sku, line.quantity, line.note ?? null]),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

const MAX_ACTIVE_PER_SESSION = 3;

export async function createOrder(guestId: string, input: CreateOrderInput): Promise<{ order: GuestOrderView; replayed: boolean }> {
  const outlet = await findOutlet(input.outlet);
  const hash = requestHash(input);

  return withOutletLock(outlet.id, async (tx, locked) => {
    // 1. Idempotensi: key yang sama mengembalikan order yang sama; payload berbeda ditolak.
    const [previous] = await tx<{ request_hash: string; order_id: string }[]>`
      select request_hash, order_id from tooday.order_requests
      where guest_session_id = ${guestId} and idempotency_key = ${input.idempotencyKey}`;
    if (previous) {
      if (previous.request_hash !== hash) {
        throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Permintaan ini bentrok dengan pesanan yang sudah terkirim. Muat ulang halaman.");
      }
      return { order: await viewById(tx, previous.order_id), replayed: true };
    }

    await expireDue(tx, locked.id);

    if (!locked.accepting_orders) {
      throw new ApiError(409, "ORDERS_CLOSED", "Maaf, pemesanan lewat QR sedang ditutup. Pilihanmu tetap tersimpan; pesan langsung ke kasir, ya.");
    }

    const [active] = await tx<{ count: number }[]>`
      select count(*)::int as count from tooday.orders
      where guest_session_id = ${guestId} and order_status in ('WAITING_PAYMENT', 'CALLED', 'DEFERRED')`;
    if (active.count >= MAX_ACTIVE_PER_SESSION) {
      throw new ApiError(429, "TOO_MANY_ACTIVE", "Kamu masih punya beberapa pesanan yang belum dibayar. Selesaikan dulu di kasir, ya.");
    }

    // 2. Harga dan ketersediaan dari database; harga kiriman browser hanya pembanding.
    const skus = [...new Set(input.lines.map((line) => line.sku))];
    const menu = await tx<{ id: string; sku: string; name: string; category: string; price_rupiah: number | null; active: boolean; available: boolean }[]>`
      select id, sku, name, category, price_rupiah, active, available from tooday.menu_items
      where outlet_id = ${locked.id} and sku = any(${skus}::text[])`;
    const bySku = new Map(menu.map((item) => [item.sku, item]));

    const unavailable = skus.filter((sku) => !bySku.get(sku)?.active || !bySku.get(sku)?.available);
    if (unavailable.length > 0) {
      throw new ApiError(409, "ITEM_UNAVAILABLE", "Ada menu yang sedang habis. Hapus dulu dari Pilihanku, lalu kirim lagi.", {
        skus: unavailable,
        names: unavailable.map((sku) => bySku.get(sku)?.name ?? sku),
      });
    }
    const unpriced = skus.filter((sku) => bySku.get(sku)!.price_rupiah === null);
    if (unpriced.length > 0) {
      throw new ApiError(409, "PRICE_MISSING", "Harga menu ini belum tersedia untuk dipesan lewat QR. Tanyakan langsung ke kasir, ya.", {
        skus: unpriced,
      });
    }

    const lines = input.lines.map((line, index) => {
      const item = bySku.get(line.sku)!;
      const unit = item.price_rupiah!;
      return { ...line, position: index + 1, item, unit, subtotal: unit * line.quantity };
    });
    const total = lines.reduce((sum, line) => sum + line.subtotal, 0);

    const priceChanged = lines.some((line) => line.expectedUnitPrice !== line.unit) || input.expectedTotal !== total;
    if (priceChanged) {
      throw new ApiError(409, "PRICE_CHANGED", "Harga ada yang berubah. Cek total terbaru, lalu kirim lagi kalau sudah oke.", {
        prices: Object.fromEntries(menu.map((item) => [item.sku, item.price_rupiah])),
        total,
      });
    }

    // 3. Meja: hanya untuk dine-in, harus aktif di outlet ini.
    let table: { id: string; code: string } | null = null;
    if (input.orderType === "DINE_IN" && input.table) {
      const [row] = await tx<{ id: string; code: string }[]>`
        select id, code from tooday.dining_tables where outlet_id = ${locked.id} and code = ${input.table} and active`;
      if (!row) throw new ApiError(400, "VALIDATION", "Kode meja tidak dikenali. Hapus meja atau pindai ulang QR di meja.");
      table = row;
    }

    // 4. Nomor urut atomik per outlet (baris counter terkunci oleh UPDATE, di bawah kunci outlet).
    const [counter] = await tx<{ number: number }[]>`
      update tooday.outlet_counters set next_number = next_number + 1
      where outlet_id = ${locked.id}
      returning next_number - 1 as number`;

    // 5. Kasir siap dan tidak ada yang dipanggil/menunggu → langsung dipanggil. Selain itu masuk antrean bayar.
    const [busy] = await tx`
      select 1 from tooday.orders
      where outlet_id = ${locked.id} and order_status in ('CALLED', 'WAITING_PAYMENT') limit 1`;
    const callNow = locked.counter_ready && !busy;

    const [order] = await tx<{ id: string }[]>`
      insert into tooday.orders (
        outlet_id, guest_session_id, queue_number, display_code, order_type, table_id, table_code, nickname,
        order_status, payment_status, total_rupiah, item_count, queue_entered_at, business_date, expires_at,
        first_called_at, called_at, call_event_id
      ) values (
        ${locked.id}, ${guestId}, ${counter.number}, ${formatCode(counter.number)}, ${input.orderType},
        ${table?.id ?? null}, ${table?.code ?? null}, ${input.nickname ?? null},
        ${callNow ? "CALLED" : "WAITING_PAYMENT"}, 'UNPAID', ${total},
        ${lines.reduce((sum, line) => sum + line.quantity, 0)}, now(),
        (now() at time zone ${locked.timezone})::date,
        now() + make_interval(mins => ${locked.unpaid_ttl_minutes}),
        ${callNow ? tx`now()` : null}, ${callNow ? tx`now()` : null},
        ${callNow ? tx`nextval('tooday.display_event_seq')` : null}
      ) returning id`;

    for (const line of lines) {
      await tx`
        insert into tooday.order_items (order_id, position, menu_item_id, sku, name_snapshot, category_snapshot,
                                        unit_price_rupiah, quantity, note, subtotal_rupiah)
        values (${order.id}, ${line.position}, ${line.item.id}, ${line.sku}, ${line.item.name}, ${line.item.category},
                ${line.unit}, ${line.quantity}, ${line.note ?? null}, ${line.subtotal})`;
    }

    await tx`
      insert into tooday.order_requests (guest_session_id, idempotency_key, request_hash, order_id)
      values (${guestId}, ${input.idempotencyKey}, ${hash}, ${order.id})`;

    await logEvent(tx, {
      outletId: locked.id,
      orderId: order.id,
      actorType: "GUEST",
      action: "CREATED",
      to: "WAITING_PAYMENT",
      detail: { total, items: lines.length },
    });
    if (callNow) {
      await logEvent(tx, { outletId: locked.id, orderId: order.id, actorType: "SYSTEM", action: "AUTO_CALLED", from: "WAITING_PAYMENT", to: "CALLED" });
    }

    await bumpFeed(tx, locked.id);
    return { order: await viewById(tx, order.id), replayed: false };
  });
}

export async function cancelByGuest(guestId: string, orderId: string) {
  const [owned] = await db()<{ outlet_id: string }[]>`
    select outlet_id from tooday.orders where id = ${orderId} and guest_session_id = ${guestId}`;
  if (!owned) throw new ApiError(404, "NOT_FOUND", "Pesanan tidak ditemukan di perangkat ini.");

  return withOutletLock(owned.outlet_id, async (tx) => {
    await expireDue(tx, owned.outlet_id);
    const [order] = await tx<OrderRow[]>`select * from tooday.orders where id = ${orderId} for update`;
    if (order.order_status === "CALLED") {
      throw new ApiError(409, "STATE_CHANGED", "Nomormu sedang dipanggil. Sampaikan langsung ke kasir kalau ingin membatalkan.");
    }
    if (!["WAITING_PAYMENT", "DEFERRED"].includes(order.order_status) || order.payment_status !== "UNPAID") {
      throw new ApiError(409, "STATE_CHANGED", "Pesanan ini sudah tidak bisa dibatalkan dari HP.", { order: await viewById(tx, orderId) });
    }
    await tx`
      update tooday.orders set order_status = 'CANCELLED', closed_at = now(), close_reason = 'Dibatalkan pelanggan',
             expires_at = null, updated_at = now(), version = version + 1
      where id = ${orderId}`;
    await logEvent(tx, {
      outletId: owned.outlet_id,
      orderId,
      actorType: "GUEST",
      action: "CANCELLED",
      from: order.order_status,
      to: "CANCELLED",
      reason: "Dibatalkan pelanggan",
    });
    await bumpFeed(tx, owned.outlet_id);
    return { order: await viewById(tx, orderId) };
  });
}
