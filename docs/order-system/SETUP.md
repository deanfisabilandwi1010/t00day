# Setup sistem pesanan QR

Urutan: database → migration → outlet & menu → staf pertama → env Netlify → deploy → uji → QR → buka order.

## 1. Lokal (untuk mencoba dan menjalankan tes)

Butuh Node.js (diuji dengan v26) dan Microsoft Edge (dipakai skrip Playwright). Docker tidak diperlukan.

```bash
npm install
cp .env.example .env.local
# isi: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/tooday

npm run db:local          # Postgres lokal (paket embedded-postgres) di port 54329
npm run db:migrate        # menjalankan supabase/migrations/*.sql
npm run db:seed -- --open # outlet tooday-main + 14 menu dari src/data/menu.json, order dibuka (khusus lokal)
STAFF_PASSWORD='minimal-10-karakter' npm run staff:create -- --email kasir@tooday.local --name "Kasir 1" --outlet tooday-main --role cashier

npm run dev               # http://localhost:3000/order , /kasir , /antrean
```

Data Postgres lokal disimpan di `~/.tooday/pg` (di luar folder project, karena file WAL yang terus berubah akan memicu reload `next dev`). Matikan dengan `npm run db:local:stop`. Data lokal adalah data demo, terpisah dari produksi.

## 2. Supabase (produksi)

1. Buat project Supabase, region terdekat dengan pengguna (mis. Singapore).
2. **Migration.** Pilih salah satu:
   - SQL Editor → tempel isi `supabase/migrations/20261015000000_order_system.sql` → Run; atau
   - dari komputer: isi `DATABASE_URL` dengan connection string Supabase (lihat langkah 3), lalu `npm run db:migrate` (mencatat migration di `tooday_meta.migrations`).
   Migration membuat schema `tooday` (bukan `public`), mengaktifkan RLS tanpa policy di semua tabel, dan mencabut akses `anon`/`authenticated`. Jangan menambahkan schema `tooday` ke "Exposed schemas" Data API.
3. **Connection string.** Project Settings → Database → Connection string → **Transaction pooler** (port 6543). Driver sudah memakai `prepare: false`, yang dibutuhkan mode ini.
4. **Outlet dan menu.**
   ```bash
   DATABASE_URL='postgres://…pooler…:6543/postgres' npm run db:seed -- --slug tooday-main --name "Tooday"
   ```
   Tanpa `--open`, outlet dibuat dengan **order ditutup**. Harga di `menu.json` ditranskripsi dari foto papan menu dan **belum diverifikasi pemilik**. Sebelum membuka order, cocokkan harga di tabel `tooday.menu_items` (Table Editor atau SQL), mis.:
   ```sql
   update tooday.menu_items set price_rupiah = 23000, version = version + 1, updated_at = now()
   where sku = 'hi-tooday-coffe' and outlet_id = (select id from tooday.outlets where slug = 'tooday-main');
   ```
   Item dengan `price_rupiah` kosong tetap tampil tetapi tidak bisa dipesan lewat QR. Pesanan yang sudah masuk menyimpan snapshot harga, jadi perubahan harga hanya berlaku untuk order baru.
5. **Staf pertama.**
   ```bash
   STAFF_PASSWORD='…' DATABASE_URL='…' npm run staff:create -- --email pengelola@… --name "Pengelola" --outlet tooday-main --role manager
   ```
   Jalankan ulang dengan email yang sama untuk mengganti password; semua sesi lama otomatis dicabut. Menonaktifkan staf: `update tooday.staff_memberships set active = false where user_id = (select id from tooday.staff_users where email = '…');`
6. **Opsional, meja bernomor.** QR per meja hanya berlaku untuk kode yang terdaftar:
   ```sql
   insert into tooday.dining_tables (outlet_id, code) select id, 'M03' from tooday.outlets where slug = 'tooday-main';
   ```
7. **Opsional, metode bayar untuk catatan internal.** Kosong secara default (kasir tidak memilih metode). Isi hanya dengan metode yang memang dipakai outlet:
   ```sql
   update tooday.outlets set payment_methods = '{Tunai}' where slug = 'tooday-main';
   ```
8. **Opsional, nudge Realtime.** Trigger dibuat otomatis oleh migration bila fungsi `realtime.send` ada (Supabase). Isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (tombol Connect → Framework, atau Project Settings → API Keys). Pastikan Realtime mengizinkan channel publik (Realtime → Settings). Bagian ini **belum diuji di Supabase sungguhan**: setelah deploy, buka `/antrean` dan `/kasir` berdampingan, konfirmasi pembayaran, dan pastikan layar berubah kurang dari 1 detik. Bila tidak, polling tetap memperbarui dalam ±3 detik.

## 3. Netlify

Site configuration → Environment variables:

| Variabel | Nilai | Rahasia |
|---|---|---|
| `DATABASE_URL` | connection string pooler Supabase | **Ya**, scope Functions/Runtime |
| `NEXT_PUBLIC_SITE_URL` | domain final, mis. `https://toodaycoffe.netlify.app` | Tidak |
| `NEXT_PUBLIC_DEFAULT_OUTLET` | `tooday-main` | Tidak |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | opsional, untuk nudge Realtime | Tidak (publishable key memang publik) |
| `DATABASE_POOL_MAX` | opsional, default 5 | Tidak |

Jangan pernah memberi prefix `NEXT_PUBLIC_` pada `DATABASE_URL`. Variabel `NEXT_PUBLIC_*` dibaca saat build, jadi **deploy ulang** setelah mengubahnya.

Project memakai Next.js App Router dengan Route Handlers; Netlify menjalankannya sebagai fungsi server secara otomatis. Tidak perlu `netlify.toml`, rewrite SPA, atau static export. Deep link (`/pesanan/<id>`, `/kasir`, `/antrean`, `/api/*`) ditangani router Next.

**Catatan biaya:** tanpa nudge Realtime, setiap layar kasir/antrean dan tiket yang terbuka memanggil fungsi server setiap 2,5–4 detik (respons kecil, tetapi tetap dihitung sebagai invocation). Cek kuota paket Netlify, atau aktifkan nudge Realtime dan naikkan interval polling di `KasirApp`/`BoardApp`/`TicketView`.

## 4. Uji setelah deploy (wajib sebelum go-live)

1. `https://<domain>/api/menu?outlet=tooday-main` mengembalikan 14 menu dengan harga yang sudah diverifikasi.
2. Login di `/kasir` dari tablet kasir. Buka `/antrean` di TV, klik **Layar penuh**, dan aktifkan suara bila perlu.
3. Dari dua HP berbeda (jaringan seluler, bukan Wi-Fi yang sama), pesan lewat `/order`, lalu jalani satu siklus penuh: dipanggil → bayar → dibuat → siap → selesai. Pastikan tiket di HP dan layar ikut berubah.
4. Matikan Wi-Fi tablet sebentar: tombol konfirmasi bayar harus nonaktif dan label koneksi berubah.
5. Hapus/batalkan order uji lewat aksi **Batalkan** (jangan hapus baris di database).

## 5. QR

- Halaman staf `/kasir/qr`: kartu siap cetak (logo, "Scan, pilih, lalu bayar di kasir.", QR, tiga langkah, URL teks), tombol **Cetak / PDF** dan **Unduh PNG**. Isi kode meja bila outlet memakai QR per meja.
- Atau dari terminal: `NEXT_PUBLIC_SITE_URL=https://<domain> npm run qr -- --outlet tooday-main [--table M03]` → `docs/order-system/qr/*.png|svg`.
- File yang sudah dibuat: `docs/order-system/qr/tooday-qr-tooday-main.png` untuk `https://toodaycoffe.netlify.app/order?outlet=tooday-main&source=qr`. Isinya sudah diverifikasi dengan decoder perangkat lunak, **belum dengan kamera HP**. Pindai dengan minimal dua HP (Android dan iPhone) dari jarak meja sebelum mencetak, dan buat ulang bila domain final berbeda.
- Jaga area putih di sekitar QR (quiet zone); jangan menempel stiker atau ornamen di atas modul QR.

## 6. Membuka order

Setelah harga diverifikasi dan uji di langkah 4 lolos: login kasir → nyalakan **Terima order baru**. Untuk menutup sementara, matikan saklar yang sama; pengunjung tetap bisa melihat menu dan menyimpan pilihan, tetapi tombol kirim nonaktif dengan pesan yang jelas.

## Pemeliharaan

- Tabel `rate_events` dibersihkan otomatis (baris >1 hari). Tabel lain tidak perlu dibersihkan untuk volume satu outlet.
- Migration baru: tambahkan file `supabase/migrations/<timestamp>_<nama>.sql`, lalu `npm run db:migrate`.
- Backup: aktifkan backup harian Supabase. Order, pembayaran, dan audit tidak pernah dihapus oleh aplikasi.
