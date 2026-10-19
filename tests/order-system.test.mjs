// Integration test alur pesanan–kasir–antrean lewat HTTP sungguhan ke server Next.js + Postgres.
// Jalankan: npm run test:api  (server harus berjalan, lihat docs/order-system/TEST_RESULTS.md)
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { BASE, Client, createFixture, loginAs, orderPayload, snapshot, sql, staffAction, submit } from "./helpers.mjs";

after(() => sql.end());

const ordersOf = (outletId) => sql`select * from tooday.orders where outlet_id = ${outletId} order by queue_number`;

describe("menu dan konteks QR", () => {
  test("menu publik memuat harga server, meja valid dan tidak valid", async () => {
    const fx = await createFixture();
    const guest = new Client();
    const ok = await guest.get(`/api/menu?outlet=${fx.slug}&table=M03`);
    assert.equal(ok.status, 200);
    assert.equal(ok.data.outlet.table, "M03");
    assert.equal(ok.data.items.find((item) => item.sku === "kopi-a").price, 22000);
    assert.equal(ok.data.items.find((item) => item.sku === "tanpa-harga").price, null);
    assert.match(ok.headers.get("cache-control"), /no-store/);

    const bad = await guest.get(`/api/menu?outlet=${fx.slug}&table=ZZ9`);
    assert.equal(bad.data.outlet.table, null);
    assert.equal(bad.data.outlet.tableInvalid, true);

    const unknown = await guest.get(`/api/menu?outlet=tidak-ada-outlet`);
    assert.equal(unknown.status, 404);
  });
});

describe("antrean bayar", () => {
  test("kasir siap dan kosong: order langsung dipanggil", async () => {
    const fx = await createFixture();
    const guest = new Client();
    const result = await submit(guest, fx.slug, [{ sku: "kopi-a", quantity: 2 }]);
    assert.equal(result.status, 201);
    const order = result.data.order;
    assert.equal(order.status, "CALLED");
    assert.equal(order.payment, "UNPAID");
    assert.equal(order.calledOnSubmit, true);
    assert.equal(order.total, 44000);
    assert.equal(order.code, "T-001");
    assert.ok(guest.cookies.get("tooday_guest"), "cookie sesi tamu dipasang");
  });

  test("kasir ramai: order baru menunggu, jumlah di depan dihitung server", async () => {
    const fx = await createFixture();
    const first = await submit(new Client(), fx.slug);
    const second = await submit(new Client(), fx.slug);
    const third = await submit(new Client(), fx.slug);
    assert.equal(first.data.order.status, "CALLED");
    assert.equal(second.data.order.status, "WAITING_PAYMENT");
    assert.equal(second.data.order.ahead, 1);
    assert.equal(third.data.order.ahead, 2);
    assert.equal(third.data.order.calledOnSubmit, false);
  });

  test("kasir dijeda dan antrean kosong: menunggu, tidak mengklaim kasir siap", async () => {
    const fx = await createFixture();
    const kasir = await loginAs(fx.staff[0].email);
    const paused = await kasir.patch("/api/kasir/settings", { outlet: fx.slug, counterReady: false });
    assert.equal(paused.status, 200);

    const guest = new Client();
    const result = await submit(guest, fx.slug);
    assert.equal(result.data.order.status, "WAITING_PAYMENT");
    assert.equal(result.data.order.ahead, 0);
    assert.equal(result.data.order.counterReady, false);

    // Melanjutkan loket memanggil order itu secara atomik.
    await kasir.patch("/api/kasir/settings", { outlet: fx.slug, counterReady: true });
    const after = await guest.get(`/api/orders/${result.data.order.id}`);
    assert.equal(after.data.order.status, "CALLED");
  });

  test("10 submit bersamaan: 10 kode unik, maksimal satu CALLED", async () => {
    const fx = await createFixture();
    const results = await Promise.all(Array.from({ length: 10 }, () => submit(new Client(), fx.slug)));
    assert.deepEqual(results.map((r) => r.status), Array(10).fill(201));
    const codes = new Set(results.map((r) => r.data.order.code));
    assert.equal(codes.size, 10);
    const rows = await ordersOf(fx.outletId);
    assert.equal(rows.length, 10);
    assert.deepEqual(rows.map((row) => row.queue_number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(rows.filter((row) => row.order_status === "CALLED").length, 1);
    // Yang dipanggil adalah yang masuk paling awal.
    assert.equal(rows.find((row) => row.order_status === "CALLED").queue_number, 1);
  });
});

describe("idempotensi submit", () => {
  test("double tap dengan key sama: satu order", async () => {
    const fx = await createFixture();
    const guest = new Client();
    // Request pertama membuat sesi; dua request berikut berlomba dengan key sama.
    await guest.get(`/api/menu?outlet=${fx.slug}`);
    const payload = orderPayload(fx.slug, [{ sku: "matcha-b", quantity: 1 }]);
    const warm = await guest.post("/api/orders", orderPayload(fx.slug)); // memastikan cookie sesi ada
    assert.equal(warm.status, 201);
    const [a, b, c] = await Promise.all([guest.post("/api/orders", payload), guest.post("/api/orders", payload), guest.post("/api/orders", payload)]);
    const ids = new Set([a, b, c].map((r) => r.data.order.id));
    assert.equal(ids.size, 1);
    assert.equal([a, b, c].filter((r) => r.status === 201).length, 1, "hanya satu yang membuat order");
    const rows = await ordersOf(fx.outletId);
    assert.equal(rows.length, 2);
  });

  test("key sama dengan payload berbeda ditolak", async () => {
    const fx = await createFixture();
    const guest = new Client();
    const payload = orderPayload(fx.slug);
    assert.equal((await guest.post("/api/orders", payload)).status, 201);
    const changed = { ...payload, lines: [{ sku: "kopi-a", quantity: 3, expectedUnitPrice: 22000 }], expectedTotal: 66000 };
    const conflict = await guest.post("/api/orders", changed);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.data.error.code, "IDEMPOTENCY_CONFLICT");
    assert.equal((await ordersOf(fx.outletId)).length, 1);
  });

  test("respons hilang setelah commit: order ditemukan lagi lewat key", async () => {
    const fx = await createFixture();
    const guest = new Client();
    const payload = orderPayload(fx.slug);
    const created = await guest.post("/api/orders", payload);
    const recovered = await guest.get(`/api/orders/by-key/${payload.idempotencyKey}`);
    assert.equal(recovered.data.order.id, created.data.order.id);
    const unknown = await guest.get(`/api/orders/by-key/${randomUUID()}`);
    assert.equal(unknown.data.order, null);
    // Sesi lain tidak bisa memulihkan order dengan key orang lain.
    const other = await new Client().get(`/api/orders/by-key/${payload.idempotencyKey}`);
    assert.equal(other.data.order, null);
  });
});

describe("validasi harga dan menu", () => {
  test("manipulasi harga/quantity ditolak, harga resmi dipakai", async () => {
    const fx = await createFixture();
    const guest = new Client();
    const cheap = await submit(guest, fx.slug, [{ sku: "matcha-b", quantity: 1, expectedUnitPrice: 1000 }]);
    assert.equal(cheap.status, 409);
    assert.equal(cheap.data.error.code, "PRICE_CHANGED");
    assert.equal(cheap.data.error.detail.total, 35000);

    const zero = await submit(guest, fx.slug, [{ sku: "kopi-a", quantity: 0 }]);
    assert.equal(zero.status, 400);
    const many = await submit(guest, fx.slug, [{ sku: "kopi-a", quantity: 21 }]);
    assert.equal(many.status, 400);
    const negative = await guest.post("/api/orders", { ...orderPayload(fx.slug), expectedTotal: -5 });
    assert.equal(negative.status, 400);

    const unknown = await submit(guest, fx.slug, [{ sku: "tidak-ada", quantity: 1, expectedUnitPrice: 5000 }]);
    assert.equal(unknown.data.error.code, "ITEM_UNAVAILABLE");
    const unpriced = await submit(guest, fx.slug, [{ sku: "tanpa-harga", quantity: 1, expectedUnitPrice: 5000 }]);
    assert.equal(unpriced.data.error.code, "PRICE_MISSING");
    assert.equal((await ordersOf(fx.outletId)).length, 0);
  });

  test("harga berubah sebelum submit: konflik dulu, lalu diterima setelah disetujui", async () => {
    const fx = await createFixture();
    const guest = new Client();
    await sql`update tooday.menu_items set price_rupiah = 24000 where outlet_id = ${fx.outletId} and sku = 'kopi-a'`;
    const stale = await submit(guest, fx.slug, [{ sku: "kopi-a", quantity: 2 }]);
    assert.equal(stale.data.error.code, "PRICE_CHANGED");
    assert.equal(stale.data.error.detail.prices["kopi-a"], 24000);
    const agreed = await submit(guest, fx.slug, [{ sku: "kopi-a", quantity: 2, expectedUnitPrice: 24000 }]);
    assert.equal(agreed.status, 201);
    assert.equal(agreed.data.order.total, 48000);
    // Snapshot harga di order tidak ikut berubah bila menu diubah lagi.
    await sql`update tooday.menu_items set price_rupiah = 30000 where outlet_id = ${fx.outletId} and sku = 'kopi-a'`;
    const later = await guest.get(`/api/orders/${agreed.data.order.id}`);
    assert.equal(later.data.order.items[0].unitPrice, 24000);
    assert.equal(later.data.order.total, 48000);
  });

  test("menu habis dan order ditutup ditolak dengan pesan jelas", async () => {
    const fx = await createFixture();
    const kasir = await loginAs(fx.staff[0].email);
    const soldOut = await kasir.patch(`/api/kasir/menu/teok-c`, { outlet: fx.slug, available: false });
    assert.equal(soldOut.status, 200);
    const guest = new Client();
    const result = await submit(guest, fx.slug, [{ sku: "teok-c", quantity: 1 }]);
    assert.equal(result.data.error.code, "ITEM_UNAVAILABLE");
    assert.deepEqual(result.data.error.detail.names, ["Teok C"]);

    await kasir.patch("/api/kasir/settings", { outlet: fx.slug, acceptingOrders: false });
    const closed = await submit(guest, fx.slug, [{ sku: "kopi-a", quantity: 1 }]);
    assert.equal(closed.status, 409);
    assert.equal(closed.data.error.code, "ORDERS_CLOSED");
    assert.equal((await ordersOf(fx.outletId)).length, 0);
  });
});

describe("keamanan dan hak akses", () => {
  test("pengunjung memanggil API bayar: ditolak tanpa perubahan", async () => {
    const fx = await createFixture();
    const guest = new Client();
    const { data } = await submit(guest, fx.slug);
    const attempt = await staffAction(guest, fx.slug, data.order, "confirm-payment");
    assert.equal(attempt.status, 401);
    guest.cookies.set("tooday_staff", "token-palsu");
    assert.equal((await staffAction(guest, fx.slug, data.order, "confirm-payment")).status, 401);
    const [row] = await ordersOf(fx.outletId);
    assert.equal(row.payment_status, "UNPAID");
    const [payments] = await sql`select count(*)::int as n from tooday.payment_records where order_id = ${data.order.id}`;
    assert.equal(payments.n, 0);
  });

  test("staf outlet lain tidak bisa mengakses outlet ini", async () => {
    const a = await createFixture();
    const b = await createFixture();
    const order = (await submit(new Client(), a.slug)).data.order;
    const outsider = await loginAs(b.staff[0].email);
    assert.equal((await outsider.get(`/api/kasir/snapshot?outlet=${a.slug}`)).status, 403);
    assert.equal((await staffAction(outsider, a.slug, order, "confirm-payment")).status, 403);
    // Memakai slug outlet sendiri dengan id order outlet lain: tidak ditemukan.
    assert.equal((await staffAction(outsider, b.slug, order, "confirm-payment")).status, 404);
    assert.equal((await outsider.get(`/api/kasir/orders/${order.id}?outlet=${b.slug}`)).status, 404);
  });

  test("tamu membuka order orang lain: tidak ditemukan", async () => {
    const fx = await createFixture();
    const owner = new Client();
    const order = (await submit(owner, fx.slug)).data.order;
    const stranger = new Client();
    await submit(stranger, fx.slug);
    assert.equal((await stranger.get(`/api/orders/${order.id}`)).status, 404);
    assert.equal((await new Client().get(`/api/orders/${order.id}`)).status, 401);
    assert.equal((await stranger.post(`/api/orders/${order.id}/cancel`, {})).status, 404);
  });

  test("origin asing dan login salah ditolak", async () => {
    const fx = await createFixture();
    const guest = new Client();
    const foreign = await guest.request("POST", "/api/orders", orderPayload(fx.slug), { origin: "https://evil.example" });
    assert.equal(foreign.status, 403);
    const noOrigin = await guest.request("POST", "/api/orders", orderPayload(fx.slug), { origin: null });
    assert.equal(noOrigin.status, 403);
    const wrong = await new Client().post("/api/kasir/login", { email: fx.staff[0].email, password: "salah-sekali" });
    assert.equal(wrong.status, 401);
    assert.equal((await ordersOf(fx.outletId)).length, 0);
  });

  test("layar publik hanya berisi kode dan status", async () => {
    const fx = await createFixture();
    await submit(new Client(), fx.slug, [{ sku: "kopi-a", quantity: 1, note: "rahasia" }], { nickname: "Budi" });
    await submit(new Client(), fx.slug);
    const feed = await new Client().get(`/api/antrean?outlet=${fx.slug}`);
    assert.equal(feed.status, 200);
    const text = JSON.stringify(feed.data);
    for (const forbidden of ["Budi", "rahasia", "22000", "Kopi A", "kasir1", fx.outletId]) {
      assert.ok(!text.includes(forbidden), `payload publik tidak boleh memuat ${forbidden}`);
    }
    assert.equal(feed.data.called.code, "T-001");
    assert.deepEqual(Object.keys(feed.data.called).sort(), ["callEventId", "code", "readyEventId", "status"]);
    assert.deepEqual(feed.data.waiting.map((entry) => entry.code), ["T-002"]);
    const unchanged = await new Client().get(`/api/antrean?outlet=${fx.slug}&v=${feed.data.feedVersion}`);
    assert.equal(unchanged.data.changed, false);
  });
});

describe("pembayaran dan aksi kasir", () => {
  test("konfirmasi dua kali: satu payment record, retry konsisten", async () => {
    const fx = await createFixture();
    const kasir = await loginAs(fx.staff[0].email);
    const order = (await submit(new Client(), fx.slug, [{ sku: "matcha-b", quantity: 1 }, { sku: "teok-c", quantity: 1 }])).data.order;
    const body = { outlet: fx.slug, action: "confirm-payment", expectedVersion: order.version, idempotencyKey: randomUUID() };
    const [a, b] = await Promise.all([
      kasir.post(`/api/kasir/orders/${order.id}/action`, body),
      kasir.post(`/api/kasir/orders/${order.id}/action`, body),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.deepEqual(a.data, b.data);
    assert.equal(a.data.order.status, "QUEUED");
    assert.equal(a.data.order.payment, "PAID");
    const again = await kasir.post(`/api/kasir/orders/${order.id}/action`, { ...body, idempotencyKey: randomUUID() });
    assert.equal(again.status, 409);
    assert.equal(again.data.error.code, "STATE_CHANGED");
    const payments = await sql`select amount_rupiah, received_by from tooday.payment_records where order_id = ${order.id}`;
    assert.equal(payments.length, 1);
    assert.equal(payments[0].amount_rupiah, 55000, "nominal dari order, bukan dari browser");
    assert.equal(payments[0].received_by, fx.staff[0].id);
  });

  test("dua kasir beraksi bersamaan: hanya satu yang diterapkan", async () => {
    const fx = await createFixture();
    const [k1, k2] = await Promise.all([loginAs(fx.staff[0].email), loginAs(fx.staff[1].email)]);
    const order = (await submit(new Client(), fx.slug)).data.order;
    const [a, b] = await Promise.all([staffAction(k1, fx.slug, order, "confirm-payment"), staffAction(k2, fx.slug, order, "confirm-payment")]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const loser = a.status === 409 ? a : b;
    assert.equal(loser.data.error.detail.order.status, "QUEUED", "pihak yang kalah menerima state terbaru");
    const [count] = await sql`select count(*)::int as n from tooday.payment_records where order_id = ${order.id}`;
    assert.equal(count.n, 1);
  });

  test("bayar vs batal bersamaan: tidak ada PAID + CANCELLED", async () => {
    for (let round = 0; round < 5; round += 1) {
      const fx = await createFixture();
      const [k1, k2] = await Promise.all([loginAs(fx.staff[0].email), loginAs(fx.staff[1].email)]);
      const order = (await submit(new Client(), fx.slug)).data.order;
      const [pay, cancel] = await Promise.all([
        staffAction(k1, fx.slug, order, "confirm-payment"),
        staffAction(k2, fx.slug, order, "cancel", { reason: "uji race" }),
      ]);
      assert.equal([pay.status, cancel.status].filter((status) => status === 200).length, 1);
      const [row] = await ordersOf(fx.outletId);
      assert.ok(
        (row.order_status === "QUEUED" && row.payment_status === "PAID") || (row.order_status === "CANCELLED" && row.payment_status === "UNPAID"),
      );
    }
  });

  test("bayar vs kedaluwarsa: order kedaluwarsa tidak bisa dibayar", async () => {
    const fx = await createFixture();
    const kasir = await loginAs(fx.staff[0].email);
    await submit(new Client(), fx.slug);
    const guest = new Client();
    const waiting = (await submit(guest, fx.slug)).data.order;
    await sql`update tooday.orders set expires_at = now() - interval '1 minute' where id = ${waiting.id}`;
    const view = await guest.get(`/api/orders/${waiting.id}`);
    assert.equal(view.data.order.status, "EXPIRED");
    const pay = await staffAction(kasir, fx.slug, waiting, "confirm-payment");
    assert.equal(pay.status, 409);
    const [row] = await sql`select order_status, payment_status from tooday.orders where id = ${waiting.id}`;
    assert.deepEqual({ ...row }, { order_status: "EXPIRED", payment_status: "UNPAID" });
  });

  test("lewati dan kembalikan: nomor tetap, posisi ke ekor, audit tercatat", async () => {
    const fx = await createFixture();
    const kasir = await loginAs(fx.staff[0].email);
    const guestA = new Client();
    const a = (await submit(guestA, fx.slug)).data.order;
    const b = (await submit(new Client(), fx.slug)).data.order;
    const c = (await submit(new Client(), fx.slug)).data.order;

    const noReason = await staffAction(kasir, fx.slug, a, "defer");
    assert.equal(noReason.status, 400);
    const deferred = await staffAction(kasir, fx.slug, a, "defer", { reason: "Belum datang" });
    assert.equal(deferred.data.order.status, "DEFERRED");
    assert.equal(deferred.data.calledNext, b.id, "order berikutnya otomatis dipanggil");
    assert.equal((await guestA.get(`/api/orders/${a.id}`)).data.order.status, "DEFERRED");

    const requeued = await staffAction(kasir, fx.slug, deferred.data.order, "requeue");
    assert.equal(requeued.data.order.status, "WAITING_PAYMENT");
    assert.equal(requeued.data.order.code, "T-001");
    const view = await guestA.get(`/api/orders/${a.id}`);
    assert.equal(view.data.order.ahead, 2, "di belakang B (dipanggil) dan C (menunggu)");

    const detail = await kasir.get(`/api/kasir/orders/${a.id}?outlet=${fx.slug}`);
    const actions = detail.data.events.map((event) => event.action);
    assert.deepEqual(actions, ["CREATED", "AUTO_CALLED", "DEFERRED", "REQUEUED"]);
    assert.equal(detail.data.events[2].reason, "Belum datang");
    assert.equal(detail.data.events[2].actor, "kasir1");
    void c;
  });

  test("pelanggan batal: hanya saat menunggu, bukan saat dipanggil", async () => {
    const fx = await createFixture();
    const guestA = new Client();
    const guestB = new Client();
    const a = (await submit(guestA, fx.slug)).data.order;
    const b = (await submit(guestB, fx.slug)).data.order;
    const calledCancel = await guestA.post(`/api/orders/${a.id}/cancel`, {});
    assert.equal(calledCancel.status, 409);
    const ok = await guestB.post(`/api/orders/${b.id}/cancel`, {});
    assert.equal(ok.status, 200);
    assert.equal(ok.data.order.status, "CANCELLED");
  });

  test("siklus lengkap dan transisi tidak sah ditolak", async () => {
    const fx = await createFixture();
    const kasir = await loginAs(fx.staff[0].email);
    const guest = new Client();
    let order = (await submit(guest, fx.slug)).data.order;
    const early = await staffAction(kasir, fx.slug, order, "start");
    assert.equal(early.status, 409, "belum dibayar tidak boleh mulai dibuat");

    for (const [action, expected] of [
      ["confirm-payment", "QUEUED"],
      ["start", "PREPARING"],
      ["ready", "READY"],
      ["recall-ready", "READY"],
      ["complete", "COMPLETED"],
    ]) {
      const result = await staffAction(kasir, fx.slug, order, action);
      assert.equal(result.status, 200, `${action}: ${JSON.stringify(result.data)}`);
      order = result.data.order;
      assert.equal(order.status, expected);
      const mine = await guest.get(`/api/orders/${order.id}`);
      assert.equal(mine.data.order.status, expected, "tiket pelanggan tersinkron");
    }
    const cancelPaid = await staffAction(kasir, fx.slug, order, "cancel", { reason: "coba" });
    assert.equal(cancelPaid.status, 409, "order lunas tidak bisa dibatalkan");
  });

  test("antrean dibuat diurutkan berdasarkan waktu bayar", async () => {
    const fx = await createFixture();
    const kasir = await loginAs(fx.staff[0].email);
    await kasir.patch("/api/kasir/settings", { outlet: fx.slug, autoCallNext: false });
    const a = (await submit(new Client(), fx.slug)).data.order; // T-001 dipanggil
    const b = (await submit(new Client(), fx.slug)).data.order; // T-002 menunggu
    // Lewati T-001, panggil T-002 manual, bayar T-002 dulu, lalu T-001.
    const deferred = (await staffAction(kasir, fx.slug, a, "defer", { reason: "ke toilet" })).data.order;
    const called = await kasir.post("/api/kasir/call-next", { outlet: fx.slug, idempotencyKey: randomUUID() });
    assert.equal(called.data.calledId, b.id);
    const snap1 = await snapshot(kasir, fx.slug);
    const bNow = snap1.orders.find((order) => order.id === b.id);
    await staffAction(kasir, fx.slug, bNow, "confirm-payment");
    const back = (await staffAction(kasir, fx.slug, deferred, "requeue")).data.order;
    await kasir.post("/api/kasir/call-next", { outlet: fx.slug, idempotencyKey: randomUUID() });
    const aNow = (await snapshot(kasir, fx.slug)).orders.find((order) => order.id === back.id);
    await staffAction(kasir, fx.slug, aNow, "confirm-payment");
    const feed = await new Client().get(`/api/antrean?outlet=${fx.slug}`);
    assert.deepEqual(feed.data.preparing.map((entry) => entry.code), ["T-002", "T-001"]);
  });

  test("panggil ulang membuat event baru, layar dapat membedakannya", async () => {
    const fx = await createFixture();
    const kasir = await loginAs(fx.staff[0].email);
    const order = (await submit(new Client(), fx.slug)).data.order;
    const before = (await new Client().get(`/api/antrean?outlet=${fx.slug}`)).data.called.callEventId;
    await staffAction(kasir, fx.slug, order, "recall");
    const afterRecall = (await new Client().get(`/api/antrean?outlet=${fx.slug}`)).data.called.callEventId;
    assert.ok(afterRecall > before);
  });
});

describe("tengah malam dan kedaluwarsa", () => {
  test("order aktif dari kemarin tetap di antrean dan nomor tidak reset", async () => {
    const fx = await createFixture();
    const old = (await submit(new Client(), fx.slug)).data.order;
    await sql`
      update tooday.orders set business_date = business_date - 1, created_at = created_at - interval '1 day',
             queue_entered_at = queue_entered_at - interval '1 day'
      where id = ${old.id}`;
    const fresh = (await submit(new Client(), fx.slug)).data.order;
    assert.equal(fresh.code, "T-002");
    assert.equal(fresh.status, "WAITING_PAYMENT");
    assert.equal(fresh.ahead, 1);
  });

  test("format kode minimal tiga digit dan tetap unik setelah 999", async () => {
    const fx = await createFixture();
    await sql`update tooday.outlet_counters set next_number = 999 where outlet_id = ${fx.outletId}`;
    const a = (await submit(new Client(), fx.slug)).data.order;
    const b = (await submit(new Client(), fx.slug)).data.order;
    assert.equal(a.code, "T-999");
    assert.equal(b.code, "T-1000");
  });
});

describe("database constraints", () => {
  test("database menolak dua CALLED dan PAID + CANCELLED", async () => {
    const fx = await createFixture();
    await submit(new Client(), fx.slug);
    const second = (await submit(new Client(), fx.slug)).data.order;
    await assert.rejects(sql`update tooday.orders set order_status = 'CALLED' where id = ${second.id}`, /orders_one_called_per_outlet/);
    await assert.rejects(
      sql`update tooday.orders set payment_status = 'PAID', paid_at = now(), order_status = 'CANCELLED' where id = ${second.id}`,
      /orders_status_combo/,
    );
  });
});

test("server yang diuji", () => {
  assert.ok(BASE);
});
