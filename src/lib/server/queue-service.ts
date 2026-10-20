import "server-only";
import {
  formatCode,
  actionAllowed,
  TERMINAL,
  type OrderEventView,
  type OrderStatus,
  type PublicQueueEntry,
  type PublicQueueFeed,
  type StaffAction,
  type StaffOrderView,
} from "@/lib/order/types";
import type { StaffContext } from "./auth";
import { bumpFeed, db, withOutletLock, type LockedOutlet, type Tx } from "./db";
import { ApiError } from "./http";
import { todayTotals } from "./report-service";

// ---------------------------------------------------------------------------
// Baris database dan pemetaan ke tampilan
// ---------------------------------------------------------------------------
export interface OrderRow {
  id: string;
  outlet_id: string;
  guest_session_id: string;
  queue_number: number;
  order_type: "DINE_IN" | "TAKEAWAY";
  fulfillment: "COUNTER" | "DELIVERY";
  delivery_location_name: string | null;
  delivery_detail: string | null;
  delivery_pay_hint: "QRIS" | "TUNAI" | null;
  accepted_at: Date | null;
  delivering_at: Date | null;
  table_code: string | null;
  nickname: string | null;
  order_status: OrderStatus;
  payment_status: "UNPAID" | "PAID";
  total_rupiah: number;
  queue_entered_at: Date;
  first_called_at: Date | null;
  called_at: Date | null;
  call_event_id: string | null;
  paid_at: Date | null;
  ready_at: Date | null;
  ready_event_id: string | null;
  closed_at: Date | null;
  close_reason: string | null;
  defer_reason: string | null;
  expires_at: Date | null;
  created_at: Date;
  version: number;
}

export interface ItemRow {
  order_id: string;
  sku: string;
  name_snapshot: string;
  unit_price_rupiah: number;
  quantity: number;
  note: string | null;
  subtotal_rupiah: number;
}

const iso = (value: Date | null) => (value ? value.toISOString() : null);
const num = (value: string | null) => (value === null ? null : Number(value));

export function itemsView(items: ItemRow[]) {
  return items.map((item) => ({
    sku: item.sku,
    name: item.name_snapshot,
    unitPrice: item.unit_price_rupiah,
    quantity: item.quantity,
    note: item.note,
    subtotal: item.subtotal_rupiah,
  }));
}

export function deliveryView(order: OrderRow) {
  return order.fulfillment === "DELIVERY"
    ? { location: order.delivery_location_name ?? "", detail: order.delivery_detail, payHint: order.delivery_pay_hint }
    : null;
}

export function staffView(order: OrderRow, items: ItemRow[]): StaffOrderView {
  return {
    id: order.id,
    code: formatCode(order.queue_number),
    queueNumber: order.queue_number,
    status: order.order_status,
    payment: order.payment_status,
    fulfillment: order.fulfillment,
    delivery: deliveryView(order),
    acceptedAt: iso(order.accepted_at),
    deliveringAt: iso(order.delivering_at),
    orderType: order.order_type,
    table: order.table_code,
    nickname: order.nickname,
    total: order.total_rupiah,
    items: itemsView(items),
    createdAt: order.created_at.toISOString(),
    queueEnteredAt: order.queue_entered_at.toISOString(),
    calledAt: iso(order.called_at),
    paidAt: iso(order.paid_at),
    readyAt: iso(order.ready_at),
    closedAt: iso(order.closed_at),
    closeReason: order.close_reason,
    deferReason: order.defer_reason,
    expiresAt: iso(order.expires_at),
    callEventId: num(order.call_event_id),
    readyEventId: num(order.ready_event_id),
    version: order.version,
  };
}

export async function loadItems(sql: Tx | ReturnType<typeof db>, orderIds: string[]): Promise<Map<string, ItemRow[]>> {
  const map = new Map<string, ItemRow[]>();
  if (orderIds.length === 0) return map;
  const rows = await sql<ItemRow[]>`
    select order_id, sku, name_snapshot, unit_price_rupiah, quantity, note, subtotal_rupiah
    from tooday.order_items where order_id = any(${orderIds}::uuid[])
    order by order_id, position`;
  for (const row of rows) {
    const list = map.get(row.order_id) ?? [];
    list.push(row);
    map.set(row.order_id, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
export interface EventInput {
  outletId: string;
  orderId?: string | null;
  actorType: "GUEST" | "STAFF" | "SYSTEM";
  actorId?: string | null;
  action: string;
  from?: string | null;
  to?: string | null;
  reason?: string | null;
  detail?: Record<string, unknown> | null;
}

export async function logEvent(tx: Tx, event: EventInput) {
  await tx`
    insert into tooday.order_events (outlet_id, order_id, actor_type, actor_id, action, from_status, to_status, reason, detail)
    values (${event.outletId}, ${event.orderId ?? null}, ${event.actorType}, ${event.actorId ?? null}, ${event.action},
            ${event.from ?? null}, ${event.to ?? null}, ${event.reason ?? null}, ${event.detail ? tx.json(event.detail as never) : null})`;
}

// ---------------------------------------------------------------------------
// Aturan antrean. Semua fungsi di bawah dipanggil di dalam withOutletLock.
// ---------------------------------------------------------------------------

/** Order belum dibayar yang melewati batas waktu menjadi EXPIRED. CALLED tidak pernah kedaluwarsa otomatis. */
export async function expireDue(tx: Tx, outletId: string): Promise<number> {
  const rows = await tx<{ id: string; from_status: string }[]>`
    with due as (
      select id, order_status from tooday.orders
      where outlet_id = ${outletId} and order_status in ('WAITING_PAYMENT', 'DEFERRED', 'DELIVERY_REQUESTED') and expires_at <= now()
      for update
    )
    update tooday.orders o
    set order_status = 'EXPIRED', closed_at = now(), close_reason = 'Melewati batas waktu sebelum dibayar',
        updated_at = now(), version = o.version + 1
    from due where o.id = due.id
    returning o.id, due.order_status as from_status`;
  for (const row of rows) {
    await logEvent(tx, { outletId, orderId: row.id, actorType: "SYSTEM", action: "EXPIRED", from: row.from_status, to: "EXPIRED" });
  }
  return rows.length;
}

/** Memanggil order WAITING_PAYMENT terlama ke kasir. Mengembalikan id order yang dipanggil. */
export async function callOldest(tx: Tx, outletId: string, actor: { type: "SYSTEM" | "STAFF"; id?: string }): Promise<string | null> {
  const [row] = await tx<{ id: string }[]>`
    update tooday.orders
    set order_status = 'CALLED', called_at = now(), first_called_at = coalesce(first_called_at, now()),
        call_event_id = nextval('tooday.display_event_seq'), updated_at = now(), version = version + 1
    where id = (
      select id from tooday.orders
      where outlet_id = ${outletId} and order_status = 'WAITING_PAYMENT'
      order by queue_entered_at, queue_number
      limit 1
      for update
    )
    returning id`;
  if (!row) return null;
  await logEvent(tx, {
    outletId,
    orderId: row.id,
    actorType: actor.type,
    actorId: actor.id,
    action: actor.type === "SYSTEM" ? "AUTO_CALLED" : "CALLED",
    from: "WAITING_PAYMENT",
    to: "CALLED",
  });
  return row.id;
}

async function hasCalled(tx: Tx, outletId: string): Promise<boolean> {
  const [row] = await tx`select 1 from tooday.orders where outlet_id = ${outletId} and order_status = 'CALLED'`;
  return Boolean(row);
}

/** Auto-call-next: bila loket siap, auto aktif, dan tidak ada yang sedang dipanggil. */
export async function autoCallNext(tx: Tx, outlet: Pick<LockedOutlet, "id" | "counter_ready" | "auto_call_next">) {
  if (!outlet.counter_ready || !outlet.auto_call_next) return null;
  if (await hasCalled(tx, outlet.id)) return null;
  return callOldest(tx, outlet.id, { type: "SYSTEM" });
}

/**
 * Pemeliharaan di luar mutasi: bila ada order yang sudah lewat batas, kedaluwarsakan dalam transaksi
 * berkunci. Pemeriksaan awal tanpa kunci agar polling biasa tetap murah.
 */
export async function maybeExpire(outletId: string) {
  const [due] = await db()`
    select 1 from tooday.orders
    where outlet_id = ${outletId} and order_status in ('WAITING_PAYMENT', 'DEFERRED', 'DELIVERY_REQUESTED') and expires_at <= now()
    limit 1`;
  if (!due) return;
  await withOutletLock(outletId, async (tx) => {
    if ((await expireDue(tx, outletId)) > 0) await bumpFeed(tx, outletId);
  });
}

// ---------------------------------------------------------------------------
// Aksi staf
// ---------------------------------------------------------------------------
async function replayMutation(tx: Tx, staff: StaffContext, key: string, action: string) {
  const [row] = await tx<{ action: string; response: unknown }[]>`
    select action, response from tooday.staff_mutations where staff_user_id = ${staff.userId} and idempotency_key = ${key}`;
  if (!row) return null;
  if (row.action !== action) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Kunci permintaan sudah dipakai untuk aksi lain.");
  return row.response;
}

async function saveMutation(tx: Tx, staff: StaffContext, key: string, action: string, orderId: string | null, response: unknown) {
  await tx`
    insert into tooday.staff_mutations (staff_user_id, idempotency_key, action, order_id, response)
    values (${staff.userId}, ${key}, ${action}, ${orderId}, ${tx.json(response as never)})`;
}

async function orderForUpdate(tx: Tx, outletId: string, orderId: string): Promise<OrderRow> {
  const [order] = await tx<OrderRow[]>`
    select * from tooday.orders where id = ${orderId} and outlet_id = ${outletId} for update`;
  if (!order) throw new ApiError(404, "NOT_FOUND", "Pesanan tidak ditemukan di outlet ini.");
  return order;
}

async function orderView(tx: Tx, orderId: string): Promise<StaffOrderView> {
  const [order] = await tx<OrderRow[]>`select * from tooday.orders where id = ${orderId}`;
  const items = await loadItems(tx, [orderId]);
  return staffView(order, items.get(orderId) ?? []);
}

export interface StaffActionInput {
  action: StaffAction;
  expectedVersion: number;
  idempotencyKey: string;
  reason?: string;
  method?: string;
}

export async function performStaffAction(staff: StaffContext, orderId: string, input: StaffActionInput) {
  return withOutletLock(staff.outletId, async (tx, outlet) => {
    const replay = await replayMutation(tx, staff, input.idempotencyKey, input.action);
    if (replay) return replay as { order: StaffOrderView; calledNext: string | null };

    await expireDue(tx, outlet.id);
    const order = await orderForUpdate(tx, outlet.id, orderId);
    const current = () => orderView(tx, order.id);

    if (order.version !== input.expectedVersion || !actionAllowed(input.action, order.fulfillment, order.order_status)) {
      throw new ApiError(409, "STATE_CHANGED", "Pesanan ini baru saja berubah. Tampilan sudah diperbarui, cek lagi sebelum melanjutkan.", {
        order: await current(),
      });
    }

    const from = order.order_status;
    const reason = input.reason?.trim() || null;
    const actor = { outletId: outlet.id, orderId: order.id, actorType: "STAFF" as const, actorId: staff.userId };
    let to: OrderStatus = from;
    let afterRelease = false;

    switch (input.action) {
      case "confirm-payment": {
        const method = input.method?.trim() || null;
        if (method && !outlet.payment_methods.includes(method)) {
          throw new ApiError(400, "VALIDATION", "Metode pembayaran tidak dikenal untuk outlet ini.");
        }
        // Nominal diambil dari order yang tersimpan, bukan dari browser.
        await tx`
          insert into tooday.payment_records (order_id, amount_rupiah, method, received_by)
          values (${order.id}, ${order.total_rupiah}, ${method}, ${staff.userId})`;
        await tx`
          update tooday.orders set order_status = 'QUEUED', payment_status = 'PAID', paid_at = now(), expires_at = null,
                 updated_at = now(), version = version + 1
          where id = ${order.id}`;
        to = "QUEUED";
        afterRelease = true;
        await logEvent(tx, { ...actor, action: "PAYMENT_CONFIRMED", from, to, detail: { amount: order.total_rupiah, method } });
        break;
      }
      case "recall": {
        await tx`
          update tooday.orders set call_event_id = nextval('tooday.display_event_seq'), called_at = now(),
                 updated_at = now(), version = version + 1
          where id = ${order.id}`;
        await logEvent(tx, { ...actor, action: "RECALLED", from, to });
        break;
      }
      case "defer": {
        if (!reason) throw new ApiError(400, "VALIDATION", "Tulis alasan singkat sebelum melewati nomor ini.");
        await tx`
          update tooday.orders set order_status = 'DEFERRED', defer_reason = ${reason}, updated_at = now(), version = version + 1
          where id = ${order.id}`;
        to = "DEFERRED";
        afterRelease = true;
        await logEvent(tx, { ...actor, action: "DEFERRED", from, to, reason });
        break;
      }
      case "requeue": {
        // Nomor tetap; posisi pindah ke ekor antrean dan batas waktu diperpanjang.
        await tx`
          update tooday.orders set order_status = 'WAITING_PAYMENT', queue_entered_at = now(),
                 expires_at = now() + make_interval(mins => ${outlet.unpaid_ttl_minutes}),
                 updated_at = now(), version = version + 1
          where id = ${order.id}`;
        to = "WAITING_PAYMENT";
        afterRelease = true;
        await logEvent(tx, { ...actor, action: "REQUEUED", from, to, reason });
        break;
      }
      case "cancel": {
        if (!reason) throw new ApiError(400, "VALIDATION", "Tulis alasan pembatalan.");
        await tx`
          update tooday.orders set order_status = 'CANCELLED', closed_at = now(), close_reason = ${reason},
                 expires_at = null, updated_at = now(), version = version + 1
          where id = ${order.id}`;
        to = "CANCELLED";
        afterRelease = from === "CALLED";
        await logEvent(tx, { ...actor, action: "CANCELLED", from, to, reason });
        break;
      }
      case "start": {
        await tx`update tooday.orders set order_status = 'PREPARING', updated_at = now(), version = version + 1 where id = ${order.id}`;
        to = "PREPARING";
        await logEvent(tx, { ...actor, action: "PREPARING", from, to });
        break;
      }
      case "ready": {
        await tx`
          update tooday.orders set order_status = 'READY', ready_at = now(),
                 ready_event_id = nextval('tooday.display_event_seq'), updated_at = now(), version = version + 1
          where id = ${order.id}`;
        to = "READY";
        await logEvent(tx, { ...actor, action: "READY", from, to });
        break;
      }
      case "recall-ready": {
        await tx`
          update tooday.orders set ready_event_id = nextval('tooday.display_event_seq'), updated_at = now(), version = version + 1
          where id = ${order.id}`;
        await logEvent(tx, { ...actor, action: "READY_RECALLED", from, to });
        break;
      }
      // ---------------- QR Antar ----------------
      case "accept": {
        await tx`
          update tooday.orders set order_status = 'QUEUED', accepted_at = now(), expires_at = null,
                 updated_at = now(), version = version + 1
          where id = ${order.id}`;
        to = "QUEUED";
        await logEvent(tx, { ...actor, action: "DELIVERY_ACCEPTED", from, to });
        break;
      }
      case "reject": {
        if (!reason) throw new ApiError(400, "VALIDATION", "Tulis alasan singkat kenapa pesanan antar ditolak.");
        await tx`
          update tooday.orders set order_status = 'CANCELLED', closed_at = now(), close_reason = ${reason},
                 expires_at = null, updated_at = now(), version = version + 1
          where id = ${order.id}`;
        to = "CANCELLED";
        await logEvent(tx, { ...actor, action: "DELIVERY_REJECTED", from, to, reason });
        break;
      }
      case "deliver": {
        await tx`
          update tooday.orders set order_status = 'DELIVERING', delivering_at = now(), updated_at = now(), version = version + 1
          where id = ${order.id}`;
        to = "DELIVERING";
        await logEvent(tx, { ...actor, action: "DELIVERING", from, to });
        break;
      }
      case "confirm-delivery": {
        const method = input.method?.trim().toUpperCase();
        if (method !== "QRIS" && method !== "TUNAI") {
          throw new ApiError(400, "VALIDATION", "Pilih metode pembayaran yang diterima: QRIS atau tunai.");
        }
        // Lunas dan selesai sekaligus; nominal dari pesanan yang tersimpan.
        await tx`
          insert into tooday.payment_records (order_id, amount_rupiah, method, received_by)
          values (${order.id}, ${order.total_rupiah}, ${method}, ${staff.userId})`;
        await tx`
          update tooday.orders set order_status = 'COMPLETED', payment_status = 'PAID', paid_at = now(),
                 completed_at = now(), closed_at = now(), updated_at = now(), version = version + 1
          where id = ${order.id}`;
        to = "COMPLETED";
        await logEvent(tx, { ...actor, action: "DELIVERY_PAID", from, to, detail: { amount: order.total_rupiah, method } });
        break;
      }
      case "undelivered": {
        if (!reason) throw new ApiError(400, "VALIDATION", "Tulis alasan kenapa pesanan gagal diantar/dibayar.");
        await tx`
          update tooday.orders set order_status = 'UNDELIVERED', closed_at = now(), close_reason = ${reason},
                 updated_at = now(), version = version + 1
          where id = ${order.id}`;
        to = "UNDELIVERED";
        await logEvent(tx, { ...actor, action: "UNDELIVERED", from, to, reason, detail: { amount: order.total_rupiah } });
        break;
      }
      case "complete": {
        await tx`
          update tooday.orders set order_status = 'COMPLETED', completed_at = now(), closed_at = now(),
                 updated_at = now(), version = version + 1
          where id = ${order.id}`;
        to = "COMPLETED";
        await logEvent(tx, { ...actor, action: "COMPLETED", from, to });
        break;
      }
    }

    const calledNext = afterRelease ? await autoCallNext(tx, outlet) : null;
    await bumpFeed(tx, outlet.id);
    const response = { order: await current(), calledNext };
    await saveMutation(tx, staff, input.idempotencyKey, input.action, order.id, response);
    return response;
  });
}

/** "Panggil berikutnya" manual. Ditolak bila masih ada nomor yang sedang dipanggil. */
export async function callNext(staff: StaffContext, idempotencyKey: string) {
  return withOutletLock(staff.outletId, async (tx, outlet) => {
    const replay = await replayMutation(tx, staff, idempotencyKey, "call-next");
    if (replay) return replay as { calledId: string | null };
    await expireDue(tx, outlet.id);
    if (await hasCalled(tx, outlet.id)) {
      throw new ApiError(409, "STATE_CHANGED", "Masih ada nomor yang sedang dipanggil. Selesaikan atau lewati dulu.");
    }
    const calledId = await callOldest(tx, outlet.id, { type: "STAFF", id: staff.userId });
    await bumpFeed(tx, outlet.id);
    const response = { calledId };
    await saveMutation(tx, staff, idempotencyKey, "call-next", calledId, response);
    return response;
  });
}

export interface SettingsInput {
  acceptingOrders?: boolean;
  acceptingDelivery?: boolean;
  counterReady?: boolean;
  autoCallNext?: boolean;
}

export async function updateSettings(staff: StaffContext, input: SettingsInput) {
  return withOutletLock(staff.outletId, async (tx, outlet) => {
    const changes: Record<string, { from: boolean; to: boolean }> = {};
    if (input.acceptingOrders !== undefined && input.acceptingOrders !== outlet.accepting_orders) {
      await tx`update tooday.outlets set accepting_orders = ${input.acceptingOrders} where id = ${outlet.id}`;
      changes.acceptingOrders = { from: outlet.accepting_orders, to: input.acceptingOrders };
    }
    if (input.acceptingDelivery !== undefined) {
      const [row] = await tx<{ accepting_delivery: boolean }[]>`select accepting_delivery from tooday.outlets where id = ${outlet.id}`;
      if (row.accepting_delivery !== input.acceptingDelivery) {
        await tx`update tooday.outlets set accepting_delivery = ${input.acceptingDelivery} where id = ${outlet.id}`;
        changes.acceptingDelivery = { from: row.accepting_delivery, to: input.acceptingDelivery };
      }
    }
    const counterReady = input.counterReady ?? outlet.counter_ready;
    const autoCall = input.autoCallNext ?? outlet.auto_call_next;
    if (counterReady !== outlet.counter_ready || autoCall !== outlet.auto_call_next) {
      await tx`
        update tooday.service_state set counter_ready = ${counterReady}, auto_call_next = ${autoCall}, version = version + 1
        where outlet_id = ${outlet.id}`;
      if (counterReady !== outlet.counter_ready) changes.counterReady = { from: outlet.counter_ready, to: counterReady };
      if (autoCall !== outlet.auto_call_next) changes.autoCallNext = { from: outlet.auto_call_next, to: autoCall };
    }
    if (Object.keys(changes).length === 0) return { changed: false };

    await logEvent(tx, { outletId: outlet.id, actorType: "STAFF", actorId: staff.userId, action: "SETTINGS_CHANGED", detail: changes });
    // Melanjutkan loket langsung memanggil nomor berikutnya (atomik dalam transaksi yang sama).
    await autoCallNext(tx, { id: outlet.id, counter_ready: counterReady, auto_call_next: autoCall });
    await bumpFeed(tx, outlet.id);
    return { changed: true };
  });
}

export async function setMenuAvailability(staff: StaffContext, sku: string, available: boolean) {
  return withOutletLock(staff.outletId, async (tx, outlet) => {
    const [item] = await tx<{ available: boolean }[]>`
      select available from tooday.menu_items where outlet_id = ${outlet.id} and sku = ${sku} for update`;
    if (!item) throw new ApiError(404, "NOT_FOUND", "Menu tidak ditemukan.");
    if (item.available === available) return { changed: false };
    await tx`
      update tooday.menu_items set available = ${available}, version = version + 1, updated_at = now()
      where outlet_id = ${outlet.id} and sku = ${sku}`;
    await logEvent(tx, {
      outletId: outlet.id,
      actorType: "STAFF",
      actorId: staff.userId,
      action: available ? "MENU_AVAILABLE" : "MENU_SOLD_OUT",
      detail: { sku },
    });
    await bumpFeed(tx, outlet.id);
    return { changed: true };
  });
}

// ---------------------------------------------------------------------------
// Bacaan untuk kasir dan layar publik
// ---------------------------------------------------------------------------
async function feedVersion(outletId: string): Promise<number> {
  const [row] = await db()<{ feed_version: string }[]>`select feed_version from tooday.service_state where outlet_id = ${outletId}`;
  return Number(row.feed_version);
}

export async function kasirSnapshot(staff: StaffContext, since: number | null) {
  await maybeExpire(staff.outletId);
  const version = await feedVersion(staff.outletId);
  if (since !== null && since === version) return { changed: false as const, feedVersion: version };

  const sql = db();
  const [settings] = await sql<
    { name: string; accepting_orders: boolean; accepting_delivery: boolean; counter_ready: boolean; auto_call_next: boolean; payment_methods: string[]; timezone: string; feed_version: string }[]
  >`
    select o.name, o.accepting_orders, o.accepting_delivery, o.payment_methods, o.timezone, s.counter_ready, s.auto_call_next, s.feed_version
    from tooday.outlets o join tooday.service_state s on s.outlet_id = o.id where o.id = ${staff.outletId}`;
  const orders = await sql<OrderRow[]>`
    select * from tooday.orders
    where outlet_id = ${staff.outletId} and order_status <> all(${[...TERMINAL]}::text[])
    order by queue_number`;
  const items = await loadItems(sql, orders.map((order) => order.id));
  const menu = await sql<{ sku: string; name: string; category: string; price_rupiah: number | null; available: boolean }[]>`
    select i.sku, i.name, s.name as category, i.price_rupiah, i.available
    from tooday.menu_items i join tooday.menu_sections s on s.id = i.section_id
    where i.outlet_id = ${staff.outletId} and i.active and s.active
    order by s.sort_order, s.name, i.sort_order, i.name`;
  const today = await todayTotals(staff);

  return {
    changed: true as const,
    // Versi dibaca dalam query yang sama dengan pengaturan; bila berubah sementara, polling berikutnya menyusul.
    feedVersion: Number(settings.feed_version),
    outlet: {
      slug: staff.outletSlug,
      name: settings.name,
      timezone: settings.timezone,
      acceptingOrders: settings.accepting_orders,
      acceptingDelivery: settings.accepting_delivery,
      counterReady: settings.counter_ready,
      autoCallNext: settings.auto_call_next,
      paymentMethods: settings.payment_methods,
    },
    staff: { name: staff.displayName, role: staff.role },
    // Pembayaran tercatat hari ini (tanggal lokal outlet). Ikut berubah karena konfirmasi bayar menaikkan feed_version.
    today,
    orders: orders.map((order) => staffView(order, items.get(order.id) ?? [])),
    menu: menu.map((item) => ({ sku: item.sku, name: item.name, category: item.category, price: item.price_rupiah, available: item.available })),
    serverTime: new Date().toISOString(),
  };
}

export async function kasirHistory(staff: StaffContext, from: string, to: string, code: number | null) {
  const sql = db();
  const orders = await sql<OrderRow[]>`
    select * from tooday.orders
    where outlet_id = ${staff.outletId}
      and business_date between ${from}::date and ${to}::date
      and order_status = any(${[...TERMINAL]}::text[])
      and (${code}::int is null or queue_number = ${code}::int)
    order by created_at desc
    limit 200`;
  const items = await loadItems(sql, orders.map((order) => order.id));
  // Total mengikuti tanggal pembayaran diterima (sama dengan laporan), bukan tanggal order dibuat.
  const [sum] = await sql<{ paid_total: string | null; paid_count: number }[]>`
    select sum(p.amount_rupiah)::bigint as paid_total, count(*)::int as paid_count
    from tooday.payment_records p
    join tooday.orders o on o.id = p.order_id
    join tooday.outlets t on t.id = o.outlet_id
    where o.outlet_id = ${staff.outletId}
      and (p.received_at at time zone t.timezone)::date between ${from}::date and ${to}::date`;
  return {
    orders: orders.map((order) => staffView(order, items.get(order.id) ?? [])),
    paidTotal: Number(sum.paid_total ?? 0),
    paidCount: sum.paid_count,
  };
}

export async function kasirOrderDetail(staff: StaffContext, orderId: string) {
  const sql = db();
  const [order] = await sql<OrderRow[]>`select * from tooday.orders where id = ${orderId} and outlet_id = ${staff.outletId}`;
  if (!order) throw new ApiError(404, "NOT_FOUND", "Pesanan tidak ditemukan di outlet ini.");
  const items = await loadItems(sql, [orderId]);
  const events = await sql<
    { id: string; action: string; actor_type: string; display_name: string | null; from_status: string | null; to_status: string | null; reason: string | null; created_at: Date }[]
  >`
    select e.id, e.action, e.actor_type, u.display_name, e.from_status, e.to_status, e.reason, e.created_at
    from tooday.order_events e left join tooday.staff_users u on u.id = e.actor_id and e.actor_type = 'STAFF'
    where e.order_id = ${orderId} order by e.id`;
  const [payment] = await sql<{ amount_rupiah: number; method: string | null; display_name: string; received_at: Date }[]>`
    select p.amount_rupiah, p.method, u.display_name, p.received_at
    from tooday.payment_records p join tooday.staff_users u on u.id = p.received_by where p.order_id = ${orderId}`;
  const actorLabel = (type: string, name: string | null) => (type === "STAFF" ? (name ?? "Staf") : type === "GUEST" ? "Pelanggan" : "Sistem");
  return {
    order: staffView(order, items.get(orderId) ?? []),
    events: events.map<OrderEventView>((event) => ({
      id: Number(event.id),
      action: event.action,
      actor: actorLabel(event.actor_type, event.display_name),
      fromStatus: event.from_status,
      toStatus: event.to_status,
      reason: event.reason,
      at: event.created_at.toISOString(),
    })),
    payment: payment
      ? { amount: payment.amount_rupiah, method: payment.method, receivedBy: payment.display_name, receivedAt: payment.received_at.toISOString() }
      : null,
  };
}

export async function publicFeed(outlet: { id: string; slug: string; name: string }, since: number | null) {
  await maybeExpire(outlet.id);
  const sql = db();
  const [state] = await sql<{ feed_version: string; counter_ready: boolean }[]>`
    select feed_version, counter_ready from tooday.service_state where outlet_id = ${outlet.id}`;
  const version = Number(state.feed_version);
  if (since !== null && since === version) return { changed: false as const, feedVersion: version };

  // Hanya kolom dari proyeksi queue_public: kode, status, urutan, id event. Tidak ada data pelanggan.
  const rows = await sql<{ display_code: string; status: PublicQueueEntry["status"]; call_event_id: string | null; ready_event_id: string | null }[]>`
    select display_code, status, call_event_id, ready_event_id
    from tooday.queue_public where outlet_id = ${outlet.id}
    order by sort_at, queue_number`;
  const entry = (row: (typeof rows)[number]): PublicQueueEntry => ({
    code: row.display_code,
    status: row.status,
    callEventId: num(row.call_event_id),
    readyEventId: num(row.ready_event_id),
  });
  const feed: PublicQueueFeed = {
    outlet: { slug: outlet.slug, name: outlet.name },
    feedVersion: version,
    counterReady: state.counter_ready,
    called: rows.filter((row) => row.status === "CALLED").map(entry)[0] ?? null,
    waiting: rows.filter((row) => row.status === "WAITING_PAYMENT").map(entry),
    preparing: rows.filter((row) => row.status === "QUEUED" || row.status === "PREPARING").map(entry),
    ready: rows.filter((row) => row.status === "READY").map(entry),
    serverTime: new Date().toISOString(),
  };
  return { changed: true as const, ...feed };
}
