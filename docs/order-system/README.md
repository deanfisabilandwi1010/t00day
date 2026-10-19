# Sistem pesanan QR Tooday — arsitektur

Alur: **scan QR → pilih menu → kirim pesanan → bayar di kasir → tunggu pesanan**. Satu project Next.js, satu database Postgres, tiga permukaan:

| Permukaan | Route | Pengguna |
|---|---|---|
| Web pengunjung | `/order`, `/pesanan/[id]` | Pengunjung di HP, tanpa login |
| Web kasir "Tooday Counter" | `/kasir/login`, `/kasir`, `/kasir/qr` | Staf yang login |
| Layar antrean | `/antrean` | Layar publik (TV), read-only |

Homepage `/` tidak berubah, kecuali tiga hal: "Pilihanku" memakai keranjang yang sama dengan `/order`, ada CTA **Pesan di outlet** (di Pilihanku, CTA akhir, dan menu mobile), dan preloader hanya berjalan di beranda.

Setup dan deployment ada di [SETUP.md](SETUP.md). Panduan staf ada di [SOP_KASIR.md](SOP_KASIR.md). Hasil uji ada di [TEST_RESULTS.md](TEST_RESULTS.md).

## Keputusan arsitektur

| Kebutuhan | Pilihan | Alasan |
|---|---|---|
| Data dan transaksi | PostgreSQL (Supabase di produksi), schema `tooday` | Transaksi, row lock, constraint unik. Schema terpisah dari `public` sehingga tidak ikut terekspos di Data API Supabase. |
| Akses database | Hanya dari Route Handler Next.js lewat `DATABASE_URL` (driver `postgres`) | Semua mutasi bisnis berjalan di server, dalam satu transaksi. Browser tidak pernah menyentuh tabel. |
| Sesi pengunjung | Cookie HttpOnly berisi token acak; DB menyimpan hash SHA-256 | Tanpa form, tanpa nomor HP/email. Dibuat saat pertama kali mengirim pesanan. |
| Login staf | Email + password (scrypt), sesi server-side (cookie HttpOnly, SameSite=Strict, 14 jam) | Auth sungguhan tanpa password di kode. Akses dicek dari `staff_memberships` per outlet di setiap operasi. |
| Sinkronisasi antarperangkat | Polling berversi (`feed_version`) + nudge Supabase Realtime opsional | Lihat bagian "Sinkronisasi". |
| Validasi | Zod (`src/lib/validation/order.ts`) | |
| Hosting | Netlify existing (Next.js runtime, Route Handlers) | Tidak perlu backend kedua. |

**Penyimpangan dari rekomendasi brief (Supabase Auth + Realtime + RLS sebagai jalur akses):** brief menyebut Supabase Auth/Realtime sebagai rekomendasi, bukan syarat. Implementasi ini memilih semua akses data lewat server dengan role pemilik database, sehingga:

- RLS tetap diaktifkan di semua tabel **tanpa policy** (deny-all) dan semua hak `anon`/`authenticated` dicabut. Ini lapis kedua; lapis pertama adalah tidak adanya akses langsung dari browser.
- "Authenticated ≠ kasir" dijamin oleh pemeriksaan membership aktif per outlet di `requireStaff()`, bukan oleh peran database.
- Seluruh alur bisa diuji lokal dengan Postgres biasa tanpa layanan Supabase.

## Struktur kode

```text
supabase/migrations/20261015000000_order_system.sql   schema, constraint, index, RLS, view queue_public, trigger nudge
src/lib/order/types.ts          tipe bersama, label status, transisi aksi staf yang sah
src/lib/order/cart.ts           keranjang Pilihanku (localStorage) + kunci submit yang belum pasti
src/lib/order/client.ts         fetch API, useFeed (polling berversi), jam, chime
src/lib/order/realtime.ts       nudge Supabase Realtime opsional
src/lib/validation/order.ts     skema Zod semua request
src/lib/server/db.ts            koneksi + withOutletLock (kunci baris service_state)
src/lib/server/auth.ts          sesi tamu, login/sesi staf, membership, rate limit
src/lib/server/order-service.ts menu publik, submit idempoten, tampilan & batal oleh tamu
src/lib/server/queue-service.ts aturan antrean, aksi kasir, pengaturan, feed kasir & layar publik
src/app/api/**                  Route Handler (tipis: validasi → otorisasi → service)
src/components/qr-order/        OrderApp (/order), TicketView (/pesanan/[id])
src/components/kasir/           KasirApp, LoginForm, QrStudio
src/components/antrean/         BoardApp (/antrean)
src/styles/order-system.css     gaya semua permukaan baru (token dari globals.css)
scripts/db/*, scripts/staff-create.mjs, scripts/qr-generate.mjs, scripts/qa-order-flow.mjs
tests/order-system.test.mjs     integration test lewat HTTP + Postgres
```

## Model status

`order_status` dan `payment_status` dipisah, kombinasinya dikunci oleh constraint `orders_status_combo` (PAID tidak pernah bersama CANCELLED/EXPIRED).

| order_status | payment_status | Arti | Aksi berikut yang sah |
|---|---|---|---|
| WAITING_PAYMENT | UNPAID | Menunggu giliran bayar | CALLED, CANCELLED, EXPIRED |
| CALLED | UNPAID | Diminta ke kasir | QUEUED (konfirmasi bayar), DEFERRED, CANCELLED |
| DEFERRED | UNPAID | Dilewati sementara | WAITING_PAYMENT, CANCELLED, EXPIRED |
| QUEUED | PAID | Menunggu dibuat | PREPARING |
| PREPARING | PAID | Sedang dibuat | READY |
| READY | PAID | Siap diambil | COMPLETED |
| COMPLETED / CANCELLED / EXPIRED | — | Terminal | — |

PAID berarti **kasir mencatat bahwa pembayaran fisik sudah diterima**. Tidak ada gateway, tidak ada verifikasi bank, dan pengunjung tidak punya aksi "sudah bayar".

## Aturan antrean (semua di server, dalam transaksi)

Setiap mutasi yang memengaruhi antrean memanggil `withOutletLock()`, yang mengunci baris `service_state` outlet (`SELECT … FOR UPDATE`). Akibatnya semua keputusan antrean satu outlet berjalan berurutan.

**Submit pesanan** (`createOrder`):

1. Cek idempotency key milik sesi. Key + payload sama → order yang sama. Key sama + payload beda → 409.
2. Kedaluwarsakan order belum bayar yang lewat batas (default 120 menit).
3. Tolak bila order ditutup, sesi punya ≥3 order belum bayar, menu habis/nonaktif, harga kosong, atau harga/total kiriman browser berbeda dari harga database (409 `PRICE_CHANGED` beserta harga baru).
4. Ambil nomor dari `outlet_counters` (UPDATE atomik di bawah kunci). Constraint unik `(outlet_id, queue_number)` sebagai pengaman.
5. Bila loket siap dan tidak ada order CALLED/WAITING_PAYMENT → **CALLED** langsung. Selain itu **WAITING_PAYMENT**.
6. Simpan order, snapshot item (nama, harga, catatan), request idempotensi, audit event, naikkan `feed_version`, commit.

**Nomor**: integer per outlet, tidak di-reset harian, tampil minimal tiga digit (`T-001`, `T-1000`). `business_date` (zona outlet) disimpan terpisah untuk laporan.

**Urutan antrean bayar**: `queue_entered_at`, lalu nomor. **Antrean dibuat**: `paid_at`, lalu nomor. "Ada N pesanan di depanmu" dihitung server (CALLED + WAITING yang lebih awal), bukan dari selisih nomor.

**Auto-call-next** (default aktif): setelah konfirmasi bayar, lewati, batalkan order yang dipanggil, atau loket dilanjutkan, server memanggil WAITING_PAYMENT terlama dalam transaksi yang sama. Index unik parsial `orders_one_called_per_outlet` menjamin maksimal satu CALLED per outlet.

**Pengaturan terpisah**: "Terima order baru" (`outlets.accepting_orders`), "Pemanggilan kasir / jeda" (`service_state.counter_ready`), "Panggil otomatis" (`service_state.auto_call_next`). Tidak ada yang bergantung pada tab kasir sedang terbuka.

**Kedaluwarsa**: WAITING_PAYMENT/DEFERRED lewat `expires_at` menjadi EXPIRED. Dijalankan di dalam setiap transaksi mutasi dan saat kasir/layar/tiket membaca data (`maybeExpire`, hanya mengunci bila memang ada yang jatuh tempo). CALLED tidak pernah kedaluwarsa otomatis. Karena bayar, batal, dan kedaluwarsa semuanya terjadi di bawah kunci yang sama dan mengecek state terkini, hanya satu hasil yang sah.

**Aksi staf** memakai `expectedVersion` (version check) dan `idempotencyKey`. Versi berbeda → 409 `STATE_CHANGED` beserta state terbaru. Retry dengan key yang sama mengembalikan respons tersimpan (`staff_mutations`), jadi konfirmasi bayar tidak tercatat dua kali. `payment_records.order_id` unik. Nominal diambil dari `orders.total_rupiah`, bukan dari browser.

## Sinkronisasi

- Setiap transaksi yang mengubah tampilan menaikkan `service_state.feed_version`.
- Kasir (2,5 dtk), layar (3 dtk), dan tiket (4 dtk) mengambil snapshot berkala. Kasir dan layar mengirim `?v=<versi>`; bila tidak berubah, server menjawab `{changed:false}` tanpa query besar. Tab tersembunyi turun ke 15 dtk; saat gagal ada backoff sampai 15 dtk. Tab kembali fokus/online langsung mengambil ulang.
- Snapshot terakhir **dipertahankan** saat koneksi gagal, ditandai "Menghubungkan kembali… / Koneksi terputus. Status mungkin belum terbaru." Tidak pernah dikosongkan menjadi "tidak ada antrean".
- Tiket menolak snapshot dengan `version` lebih kecil dari yang sudah tampil (status tidak mundur).
- **Nudge Realtime (opsional, belum diverifikasi di Supabase sungguhan):** bila migration berjalan di Supabase, trigger `service_state_feed_notify` mengirim broadcast berisi `{v: feed_version}` saja ke topic publik `tooday-feed:<slug>`. Bila `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` diisi, klien langsung mengambil snapshot saat menerima nudge. Tidak ada data pesanan yang lewat kanal ini. Tanpa konfigurasi, polling saja tetap berfungsi.

## API

Semua respons `Cache-Control: no-store`. Semua POST/PATCH wajib `Content-Type: application/json` dan header `Origin` yang sama dengan host situs (proteksi CSRF untuk sesi cookie).

| Method & route | Otorisasi | Perilaku |
|---|---|---|
| `GET /api/menu?outlet=&table=` | Publik | Konteks outlet (buka/tutup, kasir siap, meja valid/tidak) + menu aktif, harga, ketersediaan |
| `POST /api/orders` | Sesi tamu (dibuat otomatis) | Submit idempoten. Body: `outlet, idempotencyKey, orderType, table?, nickname?, lines[{sku, quantity, note?, expectedUnitPrice}], expectedTotal` |
| `GET /api/orders?outlet=` | Sesi tamu | Pesanan aktif/baru selesai milik sesi ini |
| `GET /api/orders/[id]` | Pemilik sesi | Status + rincian + jumlah di depan. Order orang lain → 404 |
| `GET /api/orders/by-key/[key]` | Pemilik sesi | Memulihkan hasil submit yang responsnya hilang |
| `POST /api/orders/[id]/cancel` | Pemilik sesi | Hanya WAITING_PAYMENT/DEFERRED |
| `POST /api/kasir/login`, `POST /api/kasir/logout`, `GET /api/kasir/me` | — / staf | Rate limit 6 percobaan per email dan 20 per IP per 15 menit |
| `GET /api/kasir/snapshot?outlet=&v=` | Staf outlet | Pengaturan, order aktif lengkap, menu |
| `GET /api/kasir/history?outlet=&from=&to=&code=` | Staf outlet | Order terminal per tanggal bisnis + total pembayaran tercatat |
| `GET /api/kasir/orders/[id]?outlet=` | Staf outlet | Rincian + riwayat tindakan + catatan pembayaran |
| `POST /api/kasir/orders/[id]/action` | Staf outlet | `action`: confirm-payment, recall, defer*, requeue, cancel*, start, ready, recall-ready, complete. Wajib `expectedVersion`, `idempotencyKey`; *wajib `reason` |
| `POST /api/kasir/call-next` | Staf outlet | Panggil WAITING_PAYMENT terlama bila tidak ada yang sedang dipanggil |
| `PATCH /api/kasir/settings` | Staf outlet | `acceptingOrders`, `counterReady`, `autoCallNext` |
| `PATCH /api/kasir/menu/[sku]` | Staf outlet | `available` (tersedia/habis) |
| `GET /api/kasir/menu-admin?outlet=` | **Manager** | Semua section dan menu, termasuk yang diarsipkan |
| `POST /api/kasir/menu-admin` | **Manager** | `op`: `create-section`, `update-section` (nama, urutan `move`, `active`), `create-item`, `update-item` (nama, deskripsi, harga, foto dari daftar tetap, section, urutan, tampil/arsip, tersedia). Tidak ada hapus permanen |
| `POST /api/kasir/menu-images?outlet=&label=` | **Manager** | Body = file gambar (WebP/JPEG/PNG, ≤1,5 MB). Mengembalikan `url` foto |
| `GET /api/menu-images/[id]` | Publik | Foto menu unggahan, cache 1 tahun |
| `GET /api/kasir/report?outlet=&from=&to=` | **Manager** | Rekap pembayaran: ringkasan, per hari, per jam, per menu, per kasir, per metode, daftar transaksi (≤31 hari). Maks. 366 hari |
| `GET /api/antrean?outlet=&v=` | Publik | Hanya kode, status, dan id event panggilan. Dibaca dari view `queue_public` |

Kode error: `VALIDATION`, `ORDERS_CLOSED`, `ITEM_UNAVAILABLE`, `PRICE_CHANGED`, `PRICE_MISSING`, `IDEMPOTENCY_CONFLICT`, `STATE_CHANGED`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `TOO_MANY_ACTIVE`, `BAD_ORIGIN`, `SERVER`. Klien membedakan error pasti (4xx, order tidak dibuat) dari hasil belum diketahui (jaringan/5xx), dan untuk yang kedua mencari order lewat key sebelum mengizinkan kirim ulang.

## Pencatatan, laporan, dan kelola menu

- **Banner "Pembayaran tercatat hari ini"** di kasir (semua staf): total rupiah dan jumlah transaksi hari ini, plus yang diterima oleh staf yang sedang login. Diambil dari `payment_records`, menurut tanggal pembayaran diterima (Asia/Jakarta).
- **Tab Laporan** (hanya peran `manager`, dicek juga di server): harian atau bulanan, unduh CSV (pemisah `;`, langsung rapi di Excel) dan cetak. Angka ini catatan kasir, bukan rekonsiliasi bank.
- **Tab Menu** untuk manager menjadi **Kelola menu**: tambah/ganti nama/urutkan/arsipkan section, tambah/ubah/urutkan/arsipkan menu, pilih foto dari daftar foto produk yang ada (`src/lib/order/menu-images.ts`), tandai habis. Semua perubahan tercatat di `order_events` dan langsung tampil di `/order`. Kasir biasa tetap hanya melihat saklar tersedia/habis.
- **Unggah foto:** di form menu, tombol **Unggah** mengecilkan foto di browser (sisi terpanjang 900 px, WebP/JPEG) lalu mengirimnya ke `POST /api/kasir/menu-images` (manager). Server memeriksa isi file (magic bytes JPG/PNG/WebP, maks. 1,5 MB), menyimpannya di tabel `menu_images`, dan menyajikannya di `GET /api/menu-images/<id>` dengan cache `immutable` dan `nosniff`. Menu hanya boleh memakai foto dari daftar foto produk atau foto unggahan outlet yang sama.
- **Homepage ikut Kelola menu.** `LiveMenuProvider` (`src/data/live-menu.tsx`) merender homepage dulu dari `src/data/menu.json`, lalu mengganti dengan data `/api/menu` (dimuat ulang saat tab kembali aktif, maks. tiap 60 detik). Filter menu, kartu, panel kategori (rel), detail, dan Pilihanku mengikuti section/menu live: section baru mendapat filter dan panel sendiri, menu diarsipkan hilang, menu habis tidak bisa disimpan. Empat panel kategori awal tetap memakai judul kurasinya. Bila API gagal, homepage tetap tampil dengan menu statis.

## Data

Tabel di schema `tooday`: `outlets`, `service_state`, `outlet_counters`, `dining_tables`, `menu_sections`, `menu_items`, `menu_images`, `guest_sessions`, `staff_users`, `staff_memberships`, `staff_sessions`, `rate_events`, `orders`, `order_items`, `payment_records`, `order_events`, `order_requests`, `staff_mutations`, view `queue_public`. Uang dalam integer rupiah, waktu `timestamptz` dari server, tampilan Asia/Jakarta. Tidak ada tombol UI yang menghapus order, pembayaran, atau audit.

**Tidak dibuat di V1** (sesuai brief): payment gateway/QRIS/kartu, unggah bukti transfer, delivery, loyalty, split bill, stok bahan, printer, POS pihak ketiga, opsi varian (data menu saat ini tidak memiliki varian, jadi UI varian tidak ditampilkan), pajak/biaya layanan (belum ada konfigurasi resmi), pembatalan/ubah nominal setelah bayar.

## Batasan yang perlu diketahui

- **QR bukan bukti kehadiran.** Tautan bisa dibagikan dari luar outlet. Order tetap harus dibayar di kasir sebelum dibuat, dan kasir bisa membatalkan order yang tidak datang (atau order kedaluwarsa sendiri setelah 120 menit).
- **Sesi tamu terikat perangkat/browser.** Bila cookie dihapus atau pengunjung pindah HP, tiket tidak bisa dibuka lagi. Pengunjung cukup menunjukkan/menyebut kode ke kasir; kode saja tidak membuka detail.
- **Harga di seed belum terverifikasi.** `src/data/menu.json` ditranskripsi dari foto papan menu (lihat SETUP).
- Sisi Supabase (pooler, trigger Realtime, deploy Netlify) belum diuji pada layanan sungguhan dari lingkungan ini; lihat TEST_RESULTS.
