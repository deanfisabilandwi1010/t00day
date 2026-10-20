// Uji alur lintas sesi di browser: pengunjung (HP) → kasir (tablet) → layar antrean (TV).
// Pemakaian: node --env-file-if-exists=.env.local scripts/qa-order-flow.mjs <outDir> [baseUrl]
// Butuh: server berjalan, outlet tooday-main dibuka, akun staf QA_STAFF_EMAIL/QA_STAFF_PASSWORD.
// Antrean outlet dikosongkan dulu (order aktif ditandai EXPIRED) agar skenario "kasir kosong" dapat diuji.
import { mkdirSync } from "node:fs";
import postgres from "postgres";
import { chromium } from "playwright";

const out = process.argv[2] ?? "qa-out/order";
const base = process.argv[3] ?? "http://localhost:3100";
const email = process.env.QA_STAFF_EMAIL ?? "kasir@tooday.local";
const password = process.env.QA_STAFF_PASSWORD ?? "kasir-lokal-123";
mkdirSync(out, { recursive: true });

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const [outlet] = await sql`select id from tooday.outlets where slug = 'tooday-main'`;
await sql`
  update tooday.orders set order_status = 'EXPIRED', closed_at = now(), close_reason = 'Reset QA', expires_at = null
  where outlet_id = ${outlet.id} and payment_status = 'UNPAID' and order_status in ('WAITING_PAYMENT', 'CALLED', 'DEFERRED')`;
await sql`
  update tooday.orders set order_status = 'COMPLETED', completed_at = now(), closed_at = now()
  where outlet_id = ${outlet.id} and order_status in ('QUEUED', 'PREPARING', 'READY')`;
await sql`update tooday.outlets set accepting_orders = true where id = ${outlet.id}`;
await sql`update tooday.menu_items set available = true where outlet_id = ${outlet.id}`;
await sql`update tooday.service_state set counter_ready = true, auto_call_next = true, feed_version = feed_version + 1 where outlet_id = ${outlet.id}`;

// Jumlah menu aktif menurut server (menu bisa bertambah lewat Kelola menu).
const menuCount = (await (await fetch(`${base}/api/menu?outlet=tooday-main`)).json()).items.length;
const browser = await chromium.launch({ channel: "msedge" });
const results = [];
const check = (name, pass, extra = "") => {
  results.push(`${pass ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
};
// Jeda singkat agar animasi masuk (sheet, tiket, maskot) selesai sebelum diambil gambarnya.
const shot = async (page, name, fullPage = false) => {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage });
};
const errorsOf = (page, bucket) => {
  page.on("pageerror", (error) => bucket.push(error.message));
  page.on("console", (message) => message.type() === "error" && bucket.push(message.text()));
};
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const errors = [];

// ---------- Pengunjung A: kasir siap dan kosong ----------
const guestA = await browser.newContext(phone);
const a = await guestA.newPage();
errorsOf(a, errors);
const started = Date.now();
await a.goto(`${base}/order?outlet=tooday-main&source=qr`);
await a.locator(".qo-card").first().waitFor();
check("menu QR tampil tanpa preloader", (await a.locator(".loader").count()) === 0 && Date.now() - started < 15000, `${Date.now() - started} ms`);
check("sapaan pendek tampil", (await a.locator(".qo-hello-title").innerText()).includes("sudah siap pilih"));
check("semua menu aktif dimuat dari server", (await a.locator(".qo-card").count()) === menuCount, `${menuCount} menu`);
check("390px tanpa scroll horizontal (/order)", await noOverflow(a));
await shot(a, "01-order-menu-390");

await a.getByRole("button", { name: "Tambah Hi Tooday Coffee" }).click();
await a.getByRole("button", { name: "Tambah Hi Tooday Coffee" }).click();
check("Tambah hanya mengubah keranjang (belum ada order)", (await sql`select count(*)::int as n from tooday.orders where outlet_id = ${outlet.id} and order_status in ('WAITING_PAYMENT','CALLED')`)[0].n === 0);
check("sticky bar menghitung 2 item · Rp44.000", (await a.locator(".qo-sticky-sum").innerText()).replace(/\s/g, " ").includes("2 item · Rp44.000"));

// Detail + catatan + pairing (dua SKU terpisah, harga normal)
await a.getByRole("button", { name: "Lihat detail ButterTteok (4 pcs)" }).click();
await a.locator("#qo-note").fill("Tolong dipotong dua");
await a.getByRole("button", { name: /Masukkan ke Pilihanku/ }).click();
await a.locator(".qo-sticky-btn").click();
await a.locator("#qo-cart-title").waitFor();
check("keranjang berisi 2 baris terpisah", (await a.locator(".qo-lines li").count()) === 2);
check("total = 2×22.000 + 20.000", (await a.locator(".qo-total strong").innerText()).includes("64.000"));
check("instruksi bayar di kasir tampil", (await a.locator(".qo-paynote").innerText()).includes("Pembayaran dilakukan di kasir."));
await a.locator("#qo-nickname").fill("Dewi");
await shot(a, "02-cart-review-390");
await a.getByRole("button", { name: "Kirim pesanan" }).click();
await a.waitForURL(/\/pesanan\//);
await a.locator(".ticket-title").waitFor();
const ticketA = await a.locator(".ticket-code").innerText();
check("tiket kasir kosong: langsung ke kasir", (await a.locator(".ticket-text").first().innerText()).includes("langsung ke kasir"), ticketA);
check("tiket menyebut belum dibayar + total", (await a.locator(".ticket-sum").innerText()).includes("Belum dibayar"));
check("keranjang kosong setelah server menyimpan", (await a.evaluate(() => JSON.parse(localStorage.getItem("tooday-cart-v1") ?? "{}").lines?.length ?? 0)) === 0);
check("390px tanpa scroll horizontal (tiket)", await noOverflow(a));
await shot(a, "03-ticket-direct-390", true);

// ---------- Pengunjung B: kasir ramai ----------
const guestB = await browser.newContext({ ...phone, viewport: { width: 360, height: 780 } });
const b = await guestB.newPage();
errorsOf(b, errors);
await b.goto(`${base}/order?outlet=tooday-main&source=qr`);
await b.getByRole("button", { name: "Tambah Matcha Latte" }).click();
await b.locator(".qo-sticky-btn").click();
await b.getByRole("radio", { name: "Takeaway" }).check();
await b.getByRole("button", { name: "Kirim pesanan" }).click();
await b.waitForURL(/\/pesanan\//);
await b.locator(".ticket-title").waitFor();
const ticketB = await b.locator(".ticket-code").innerText();
check("tiket ramai: ada 1 pesanan di depan", (await b.locator(".ticket-text").first().innerText()).includes("Ada 1 pesanan di depanmu"), ticketB);
check("360px tanpa scroll horizontal (tiket antrean)", await noOverflow(b));
await shot(b, "04-ticket-queue-360", true);

// ---------- Layar antrean ----------
const tv = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const board = await tv.newPage();
errorsOf(board, errors);
await board.goto(`${base}/antrean?outlet=tooday-main`);
await board.locator(".board-called-code").waitFor();
check("layar: nomor dipanggil sesuai", (await board.locator(".board-called-code").innerText()) === ticketA);
check("layar: berikutnya memuat nomor B", (await board.locator(".board-next").innerText()).includes(ticketB));
const boardText = await board.locator("body").innerText();
check("layar: tidak menampilkan nama/catatan/harga", !boardText.includes("Dewi") && !boardText.includes("dipotong") && !boardText.includes("Rp"));
await shot(board, "05-board-called-1920");

// ---------- Kasir ----------
const tablet = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const k = await tablet.newPage();
errorsOf(k, errors);
await k.goto(`${base}/kasir`);
await k.waitForURL(/\/kasir\/login/);
await shot(k, "06-kasir-login");
await k.locator("#kasir-email").fill(email);
await k.locator("#kasir-password").fill(password);
await k.getByRole("button", { name: "Masuk" }).click();
await k.waitForURL(/\/kasir$/);
await k.locator(".kasir-ticket").first().waitFor();
check("kasir: label BELUM DIBAYAR tampil", (await k.locator(".kasir-unpaid").count()) >= 2);
await k.locator(".kasir-ticket", { hasText: ticketA }).click();
await k.locator(".kasir-card-code", { hasText: ticketA }).waitFor();
check("kasir: catatan pelanggan terlihat", (await k.locator(".kasir-card").innerText()).includes("Tolong dipotong dua"));
await shot(k, "07-kasir-dashboard-1180");
await k.getByRole("button", { name: "Konfirmasi pembayaran diterima" }).click();
check("kasir: modal bertanya nominal dan kode", (await k.locator(".kasir-dialog-title").innerText()).includes(`Rp64.000 untuk ${ticketA}`));
await shot(k, "08-kasir-pay-modal");
await k.getByRole("button", { name: "Ya, pembayaran diterima" }).click();
await k.locator(".kasir-badge--olive").waitFor();

// Sinkronisasi lintas sesi
await a.locator(".ticket-title", { hasText: "Pembayaran sudah diterima." }).waitFor({ timeout: 12000 });
check("pelanggan A: status berubah jadi sudah dibayar (lintas sesi)", true);
await b.locator(".ticket-title", { hasText: "Giliranmu" }).waitFor({ timeout: 12000 });
check("pelanggan B: otomatis dipanggil setelah A bayar", true);
await shot(b, "09-ticket-called-360", true);
await board.locator(".board-called-code", { hasText: ticketB }).waitFor({ timeout: 12000 });
check("layar: nomor B dipanggil, A di sedang disiapkan", (await board.locator(".board-panel--prep").innerText()).includes(ticketA));

// Produksi sampai selesai
await k.getByRole("tab", { name: /Dibuat/ }).click();
await k.locator(".kasir-ticket", { hasText: ticketA }).click();
await k.getByRole("button", { name: "Mulai dibuat" }).click();
await a.locator(".ticket-title", { hasText: "Lagi disiapin" }).waitFor({ timeout: 12000 });
await k.getByRole("button", { name: "Siap diambil" }).click();
await a.locator(".ticket-title", { hasText: "pesananmu siap" }).waitFor({ timeout: 12000 });
check("pelanggan A: siap diambil", true);
await board.locator(".board-panel--ready", { hasText: ticketA }).waitFor({ timeout: 12000 });
await shot(board, "10-board-ready-1920");
await shot(a, "11-ticket-ready-390", true);
await k.getByRole("tab", { name: /Siap/ }).click();
await k.locator(".kasir-ticket", { hasText: ticketA }).click();
await k.getByRole("button", { name: /Selesaikan/ }).click();
await a.locator(".ticket-title", { hasText: "Selamat menikmati" }).waitFor({ timeout: 12000 });
check("siklus lengkap tersinkron sampai selesai", true);
await k.locator("details.kasir-log summary").click().catch(() => {});
await shot(k, "12-kasir-after-complete-1180");

// Lewati B lalu kembalikan
await k.getByRole("tab", { name: /Kasir/ }).click();
await k.locator(".kasir-ticket", { hasText: ticketB }).click();
await k.getByRole("button", { name: "Lewati sementara" }).click();
await k.getByRole("button", { name: "Belum datang ke kasir" }).click();
await k.getByRole("button", { name: "Lewati", exact: true }).click();
await b.locator(".ticket-title", { hasText: "Nomormu terlewat" }).waitFor({ timeout: 12000 });
check("pelanggan B: melihat nomor terlewat", true);
await k.getByRole("button", { name: "Kembalikan ke antrean" }).click();
await b.locator(".ticket-title", { hasText: "Giliranmu" }).waitFor({ timeout: 12000 });
check("pelanggan B: dipanggil lagi setelah dikembalikan (antrean kosong)", (await b.locator(".ticket-code").innerText()) === ticketB);

// Menu habis dan order ditutup
await k.getByRole("tab", { name: "Menu" }).click();
await k.getByRole("switch", { name: "Mango Yakult tersedia" }).click();
await k.getByRole("switch", { name: "Mango Yakult tersedia" }).and(k.locator(".is-off")).waitFor();
const guestC = await browser.newContext(phone);
const c = await guestC.newPage();
errorsOf(c, errors);
await c.goto(`${base}/order?outlet=tooday-main`);
await c.locator(".qo-card").first().waitFor();
check("menu habis: label Lagi habis + CTA nonaktif", (await c.locator(".qo-card", { hasText: "Mango Yakult" }).innerText()).includes("Lagi habis") && (await c.getByRole("button", { name: "Mango Yakult tidak bisa dipesan" }).isDisabled()));
await shot(c, "13-order-soldout-390");

// Homepage: menu habis langsung terlihat tanpa diklik (kartu menu dan daftar panel kategori).
const soldHome = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const sh = await soldHome.newPage();
errorsOf(sh, errors);
await sh.addInitScript(() => sessionStorage.setItem("tooday-intro", "1"));
await sh.goto(base, { waitUntil: "networkidle" });
await sh.locator(".rail-list button.is-out", { hasText: "Mango Yakult" }).waitFor({ timeout: 15000 });
check("homepage: label Habis di daftar panel kategori", /^habis$/i.test((await sh.locator(".rail-list button.is-out .out-badge").first().innerText()).trim()));
check("homepage: kartu menu habis berlabel dan tombol + nonaktif", (await sh.locator(".menu-grid .card", { hasText: "Mango Yakult" }).locator(".card-out").count()) === 1 && (await sh.getByRole("button", { name: "Mango Yakult lagi habis" }).isDisabled()));
await sh.locator(".rail-list button.is-out", { hasText: "Mango Yakult" }).scrollIntoViewIfNeeded();
await shot(sh, "28-home-soldout-rail-1440");
await soldHome.close();

await k.getByRole("switch", { name: /Terima order baru/ }).click();
await c.getByRole("button", { name: "Tambah Dark Choco" }).click();
await c.locator(".qo-sticky-btn").click();
await c.reload();
await c.locator(".qo-banner--closed").first().waitFor();
await c.locator(".qo-sticky-btn").click();
check("order ditutup: kirim nonaktif, keranjang tetap", (await c.getByRole("button", { name: "Kirim pesanan" }).isDisabled()) && (await c.locator(".qo-lines li").count()) === 1);
await shot(c, "14-order-closed-390");
await k.getByRole("switch", { name: /Terima order baru/ }).click();
await k.getByRole("switch", { name: "Mango Yakult tersedia" }).click();

// Kasir dijeda + antrean bayar kosong (B diselesaikan dulu)
await k.getByRole("tab", { name: /Kasir/ }).click();
await k.locator(".kasir-ticket", { hasText: ticketB }).click();
await k.getByRole("button", { name: "Batalkan" }).click();
await k.getByRole("button", { name: "Pelanggan membatalkan" }).click();
await k.getByRole("button", { name: "Batalkan pesanan" }).click();
await b.locator(".ticket-title", { hasText: "dibatalkan" }).waitFor({ timeout: 12000 });
await k.getByRole("switch", { name: /Pemanggilan kasir/ }).click();
await k.locator(".kasir-toggle.is-off", { hasText: "Panggilan dijeda" }).waitFor();
await c.reload();
await c.locator(".qo-sticky-btn").click();
await c.getByRole("button", { name: "Kirim pesanan" }).click();
await c.waitForURL(/\/pesanan\//);
await c.locator(".ticket-title").waitFor();
check("kasir dijeda: tidak mengklaim kasir siap", (await c.locator(".ticket-text").first().innerText()).includes("Kasir sedang melayani keperluan lain"));
await shot(c, "15-ticket-paused-390", true);
await k.getByRole("switch", { name: /Pemanggilan kasir/ }).click();
await c.locator(".ticket-title", { hasText: "Giliranmu" }).waitFor({ timeout: 12000 });
check("lanjutkan panggilan: pelanggan langsung dipanggil", true);

// Koneksi putus di layar: snapshot dipertahankan
await tv.setOffline(true);
await board.locator(".board-stale").waitFor({ timeout: 20000 });
check("layar offline: penanda stale tanpa mengosongkan antrean", (await board.locator(".board-called-code").count()) === 1);
await shot(board, "16-board-offline-1920");
await tv.setOffline(false);
await board.locator(".board-stale").waitFor({ state: "detached", timeout: 20000 });
check("layar pulih setelah koneksi kembali", true);

// Kasir offline: tombol pembayaran nonaktif
await tablet.setOffline(true);
await k.locator(".kasir-conn--reconnecting, .kasir-conn--offline").waitFor({ timeout: 20000 });
await k.locator(".kasir-ticket").first().click();
const payButton = k.getByRole("button", { name: "Konfirmasi pembayaran diterima" });
check("kasir offline: konfirmasi bayar nonaktif", (await payButton.count()) === 1 && (await payButton.isDisabled()));
await shot(k, "17-kasir-offline-1180");
await tablet.setOffline(false);

// Homepage tetap utuh dan terhubung ke keranjang yang sama
const home = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const h = await home.newPage();
errorsOf(h, errors);
await h.addInitScript(() => sessionStorage.setItem("tooday-intro", "1"));
await h.goto(base, { waitUntil: "networkidle" });
check("homepage: hero tetap ada", (await h.locator(".hero-title").count()) === 1);
await h.locator("#menu").scrollIntoViewIfNeeded();
await h.locator(".card-add").first().click();
await h.locator("#order-toggle").click();
await h.locator(".summary a", { hasText: "Pesan di outlet" }).waitFor();
check("homepage: Pilihanku punya CTA Pesan di outlet", true);
await shot(h, "18-home-pilihanku-1440");
await h.locator(".summary a", { hasText: "Pesan di outlet" }).click();
await h.waitForURL(/\/order/);
await h.locator(".qo-sticky-btn").waitFor();
check("homepage → /order: keranjang yang sama terbawa", (await h.locator(".qo-sticky-sum").innerText()).includes("1 item"));

// Reduced motion + keyboard di halaman order
const calm = await browser.newContext({ ...phone, reducedMotion: "reduce", isMobile: false, hasTouch: false });
const r = await calm.newPage();
errorsOf(r, errors);
await r.goto(`${base}/order?outlet=tooday-main`);
await r.locator(".qo-card").first().waitFor();
await r.keyboard.press("Tab");
let reached = false;
for (let i = 0; i < 25 && !reached; i += 1) {
  await r.keyboard.press("Tab");
  reached = await r.evaluate(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Tambah ") ?? false);
}
await r.keyboard.press("Enter");
check("keyboard: tombol Tambah bisa dicapai dan dipakai", reached && (await r.locator(".qo-sticky-btn").count()) === 1);
await r.locator(".qo-sticky-btn").focus();
await r.keyboard.press("Enter");
await r.locator("#qo-cart-title").waitFor();
await r.keyboard.press("Escape");
await r.waitForTimeout(400);
check("keyboard: Escape menutup Pilihanku", !(await r.locator("dialog[open]").count()));
check("reduced motion: informasi lengkap", (await r.locator(".qo-card").count()) === menuCount);

// Kasir di tablet portrait dan HP: tidak ada konten yang terpotong di kanan.
const clipped = () => k.evaluate(() => [...document.querySelectorAll(".kasir-body, .kasir-list, .kasir-detail, .kasir-controls")].some((el) => el.getBoundingClientRect().right > window.innerWidth + 1));
await k.goto(`${base}/kasir`);
await k.locator(".kasir-stats").waitFor();
for (const width of [768, 390]) {
  await k.setViewportSize({ width, height: width === 768 ? 1024 : 844 });
  await k.waitForTimeout(300);
  check(`kasir ${width}px: tidak terpotong`, !(await clipped()));
  await shot(k, `${width === 768 ? "20" : "21"}-kasir-${width}`, true);
}
await k.setViewportSize({ width: 1180, height: 820 });
const desk = await home.newPage();
await desk.goto(`${base}/order?outlet=tooday-main`);
await desk.locator(".qo-card").first().waitFor();
check("order 1440px: tanpa scroll horizontal", await noOverflow(desk));
await shot(desk, "22-order-1440");

// Pencatatan: kasir melihat total hari ini, tetapi tidak punya tab Laporan.
await k.goto(`${base}/kasir`);
await k.locator(".kasir-till-total").waitFor();
const tillText = await k.locator(".kasir-till").innerText();
check("kasir: total pembayaran hari ini tampil", /Rp[\d.]+/.test(tillText) && tillText.includes("transaksi"), tillText.replace(/\s+/g, " "));
check("kasir: tab Laporan tidak tersedia untuk peran kasir", (await k.getByRole("tab", { name: "Laporan" }).count()) === 0);

// Manager: laporan harian dan bulanan.
const office = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const m = await office.newPage();
errorsOf(m, errors);
await m.goto(`${base}/kasir/login`);
await m.locator("#kasir-email").fill(process.env.QA_MANAGER_EMAIL ?? "manager@tooday.local");
await m.locator("#kasir-password").fill(process.env.QA_MANAGER_PASSWORD ?? "manager-lokal-123");
await m.getByRole("button", { name: "Masuk" }).click();
await m.waitForURL(/\/kasir$/);
await m.locator(".kasir-till-total").waitFor();
const tillTotal = (await m.locator(".kasir-till-total").innerText()).trim();
await m.getByRole("tab", { name: "Laporan" }).click();
await m.locator(".report-card--main dd").waitFor();
check("manager: laporan harian = total tercatat hari ini", (await m.locator(".report-card--main dd").innerText()).trim() === tillTotal, tillTotal);
check("manager: daftar transaksi harian tampil", (await m.locator(".report-section h3", { hasText: "Daftar transaksi" }).count()) === 1);
await shot(m, "23-report-daily-1366", true);
await m.getByRole("tab", { name: "Bulanan" }).click();
await m.locator(".report-section h3", { hasText: "Per hari" }).waitFor();
check("manager: laporan bulanan memuat tabel per hari", (await m.locator(".report-section--wide tbody tr").count()) >= 1);
await shot(m, "24-report-monthly-1366", true);
const download = m.waitForEvent("download");
await m.getByRole("button", { name: "Unduh CSV" }).click();
check("manager: CSV laporan terunduh", (await (await download).suggestedFilename()).startsWith("tooday-laporan-"));

// Manager: kelola menu — section baru, menu baru lewat form, tampil di halaman pesan, lalu diarsipkan lagi.
const sectionName = `Cemilan Uji ${Date.now().toString().slice(-5)}`;
await m.getByRole("tab", { name: "Menu" }).click();
await m.locator(".mm-section").first().waitFor();
await shot(m, "25-menu-manager-1366", true);
await m.getByRole("button", { name: "Section baru" }).click();
await m.locator("#mm-section-name").fill(sectionName);
await m.getByRole("button", { name: "Buat section" }).click();
await m.locator(".mm-section-name", { hasText: sectionName }).waitFor();
await m.getByRole("button", { name: `Tambah menu di ${sectionName}` }).click();
await m.locator("#mm-name").fill("Tteok Keju Uji");
await m.locator("#mm-price").fill("21000");
await m.locator("#mm-desc").fill("Menu uji otomatis.");
// Unggah foto asli (JPEG dari paket aset): dikecilkan di browser lalu disimpan di database.
await m.locator(".mm-photo-upload input[type=file]").setInputFiles("asset/source-assets/WhatsApp Image 2026-10-12 at 10.59.45.jpeg");
await m.locator(".mm-photo.is-on img.is-photo").waitFor({ timeout: 20000 });
check("kelola menu: foto baru terunggah dan langsung terpilih", true);
check("kelola menu: pratinjau mengikuti isian", (await m.locator(".mm-preview").innerText()).includes("Rp21.000"));
await shot(m, "26-menu-item-form-1366");
await m.getByRole("button", { name: "Tambahkan menu" }).click();
await m.locator(".mm-item-name", { hasText: "Tteok Keju Uji" }).waitFor();
const guestMenu = await office.newPage();
await guestMenu.goto(`${base}/order?outlet=tooday-main`);
await guestMenu.locator(".qo-section-title", { hasText: sectionName }).waitFor();
check("kelola menu: section & menu baru tampil di /order", (await guestMenu.locator(".qo-card", { hasText: "Tteok Keju Uji" }).innerText()).includes("Rp21.000"));
await guestMenu.close();

// Homepage ikut data Kelola menu: filter, kartu, dan panel kategori untuk section baru; detail tetap bisa dibuka.
const homeLive = await office.newPage();
errorsOf(homeLive, errors);
await homeLive.addInitScript(() => sessionStorage.setItem("tooday-intro", "1"));
await homeLive.goto(base, { waitUntil: "networkidle" });
await homeLive.locator(".menu-filters .chip", { hasText: sectionName }).waitFor({ timeout: 15000 });
await homeLive.locator(".menu-filters .chip", { hasText: sectionName }).click();
const liveCard = homeLive.locator(".menu-grid .card", { hasText: "Tteok Keju Uji" });
check("homepage: filter section baru menampilkan menu baru", (await homeLive.locator(".menu-grid .card").count()) === 1 && (await liveCard.innerText()).includes("Rp21.000"));
check("homepage: foto unggahan tampil di kartu", (await liveCard.locator("img.is-photo").count()) === 1);
check("homepage: panel kategori untuk section baru", (await homeLive.locator(".rail-panel", { hasText: sectionName }).count()) === 1);
await liveCard.locator(".card-hit").click();
await homeLive.locator("#product-dialog-title", { hasText: "Tteok Keju Uji" }).waitFor();
await homeLive.getByRole("button", { name: /Masukkan ke Pilihanku/ }).click();
await homeLive.waitForTimeout(500);
check("homepage: menu baru bisa disimpan ke Pilihanku", (await homeLive.locator(".order-count").innerText()).trim() !== "0");
await homeLive.locator("#menu").scrollIntoViewIfNeeded();
await shot(homeLive, "27-home-live-section-1366");
await homeLive.close();
await m.getByRole("button", { name: `Arsipkan section ${sectionName}` }).click();
// Tunggu kartu section benar-benar hilang (daftar arsip bisa sudah ada dari putaran uji sebelumnya).
await m.locator(".mm-section-name", { hasText: sectionName }).waitFor({ state: "detached" });
check("kelola menu: section diarsipkan pindah ke daftar arsip", (await m.locator(".mm-section-name", { hasText: sectionName }).count()) === 0);
const afterArchive = await office.newPage();
await afterArchive.goto(`${base}/order?outlet=tooday-main`);
await afterArchive.locator(".qo-card").first().waitFor();
check("kelola menu: section diarsipkan hilang dari /order", (await afterArchive.locator(".qo-section-title", { hasText: sectionName }).count()) === 0);
await afterArchive.close();


// QR Antar: manager menambah lokasi, kasir membuka QR Antar, pengunjung pesan dari QR lokasi,
// kasir terima → buat → antar → terima pembayaran tunai. Pesanan antar tidak tampil di layar TV.
const placeName = `Outlet Uji ${Date.now().toString().slice(-5)} – meja 2`;
await m.goto(`${base}/kasir/qr?outlet=tooday-main`);
await m.locator("#qr-location-name").waitFor();
await m.locator("#qr-location-name").fill(placeName);
await m.getByRole("button", { name: "Tambah lokasi" }).click();
const placeRow = m.locator(".qr-location-list li", { hasText: placeName });
await placeRow.waitFor();
await placeRow.getByRole("button", { name: "Buat QR" }).click();
await m.locator(".qr-card--antar .qr-table", { hasText: placeName }).waitFor();
const antarUrl = (await m.locator(".qr-tools code").innerText()).trim();
check("QR Antar: kartu lokasi memuat ?antar=", antarUrl.includes("antar=") && antarUrl.includes("source=qr-antar"), antarUrl);
await shot(m, "29-qr-antar-card");

await k.setViewportSize({ width: 1180, height: 820 });
await k.goto(`${base}/kasir`);
await k.locator(".kasir-stats").waitFor();
const deliveryToggle = k.getByRole("switch", { name: /Pesanan antar/ });
if ((await deliveryToggle.getAttribute("aria-checked")) !== "true") await deliveryToggle.click();
await k.locator(".kasir-toggle.is-on", { hasText: "QR Antar dibuka" }).waitFor();

const antarGuest = await browser.newContext(phone);
const ag = await antarGuest.newPage();
errorsOf(ag, errors);
await ag.goto(antarUrl.replace(/^https?:\/\/[^/]+/, base));
await ag.locator(".qo-card").first().waitFor();
check("QR Antar: sapaan menyebut lokasi", (await ag.locator(".qo-hello-sub").innerText()).includes(placeName));
await ag.getByRole("button", { name: "Tambah Matcha Latte" }).click();
await ag.locator(".qo-sticky-btn").click();
await ag.locator("#qo-cart-title").waitFor();
check("QR Antar: pilihan antar & lokasi terisi otomatis", (await ag.getByRole("radio", { name: /QR Antar/ }).isChecked()) && (await ag.locator("#qo-location").inputValue()) !== "");
await ag.getByRole("button", { name: "Kirim pesanan antar" }).click();
check("QR Antar: nama panggilan wajib", (await ag.locator(".qo-submit-status [role=alert]").innerText()).includes("nama panggilan"));
await ag.locator("#qo-nickname").fill("Bima");
await ag.locator("#qo-delivery-detail").fill("kaos hijau");
await ag.getByRole("radio", { name: "Tunai" }).check();
await shot(ag, "30-order-antar-390");
await ag.getByRole("button", { name: "Kirim pesanan antar" }).click();
await ag.waitForURL(/\/pesanan\//);
await ag.locator(".ticket-title", { hasText: "Pesanan antar terkirim" }).waitFor();
const antarCode = (await ag.locator(".ticket-code").innerText()).trim();
check("QR Antar: tiket menunggu diterima kasir", true, antarCode);

await k.getByRole("tab", { name: /Antar/ }).click();
await k.locator(".kasir-ticket", { hasText: antarCode }).click();
check("kasir: slip antar memuat lokasi, nama, dan tagihan", (await k.locator(".kasir-slip").innerText()).includes(placeName) && (await k.locator(".kasir-slip").innerText()).includes("Bima"));
await shot(k, "31-kasir-antar-slip-1180");
await k.getByRole("button", { name: "Terima pesanan antar" }).click();
await ag.locator(".ticket-title", { hasText: "Pesananmu diterima" }).waitFor({ timeout: 12000 });
await k.getByRole("button", { name: "Mulai dibuat" }).click();
await k.getByRole("button", { name: "Siap diantar" }).click();
await k.getByRole("button", { name: "Antar sekarang" }).click();
await ag.locator(".ticket-title", { hasText: "sedang diantar" }).waitFor({ timeout: 12000 });
check("pengunjung: tiket 'sedang diantar' dengan tagihan", (await ag.locator(".ticket-text").first().innerText()).includes("tunai"));
await shot(ag, "32-ticket-delivering-390", true);
const antarFeed = await (await fetch(`${base}/api/antrean?outlet=tooday-main`)).text();
check("layar publik: pesanan antar tidak tampil", !antarFeed.includes(antarCode));
await k.getByRole("button", { name: /Pembayaran diterima/ }).click();
await k.getByRole("radio", { name: "Tunai" }).check();
await k.getByRole("button", { name: "Ya, pembayaran diterima" }).click();
await ag.locator(".ticket-title", { hasText: "Selamat menikmati" }).waitFor({ timeout: 12000 });
check("QR Antar: lunas saat diterima, tiket selesai", true);
await antarGuest.close();

// Rapikan: tutup QR Antar dan arsipkan lokasi uji agar putaran berikutnya bersih.
await k.getByRole("switch", { name: /Pesanan antar/ }).click();
await m.goto(`${base}/kasir/qr?outlet=tooday-main`);
await m.locator(".qr-location-list li", { hasText: placeName }).getByRole("button", { name: `Arsipkan ${placeName}` }).click();
await m.locator(".qr-location-list li", { hasText: placeName }).waitFor({ state: "detached" });

// Kartu QR siap cetak (halaman staf)
await k.goto(`${base}/kasir/qr?outlet=tooday-main`);
await k.locator(".qr-code svg").waitFor();
check("QR: kartu memuat judul dan tiga langkah", (await k.locator(".qr-title").innerText()).includes("bayar di kasir") && (await k.locator(".qr-steps li").count()) === 3);
await shot(k, "19-qr-card", true);

await browser.close();
await sql.end();

const realErrors = errors.filter((message) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::ERR|status of 4\d\d/.test(message));
check("tidak ada error JS di halaman", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
console.log(results.join("\n"));
const failed = results.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exit(failed ? 1 : 0);
