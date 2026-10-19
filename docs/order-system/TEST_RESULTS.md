# Hasil uji — sistem pesanan QR

Dijalankan 15 Oktober 2026 di Windows 10, Node 26.7, Microsoft Edge (Playwright 1.64), **build produksi** (`next build` + `next start`) dengan Postgres 17.10 lokal (`npm run db:local`). Bukan Supabase, bukan Netlify.

| Pemeriksaan | Perintah | Hasil |
|---|---|---|
| Typecheck | `npm run typecheck` | Lolos, 0 error |
| Lint | `npm run lint` | Lolos, 0 error, 0 warning |
| Build | `npm run build` | Lolos; route API dinamis, halaman pesanan/kasir/antrean statis + data dari API |
| Integration test (HTTP + database) | `npm run test:api` | **29/29 lolos** |
| Alur lintas sesi di browser | `npm run qa:order` | **46/46 lolos**, screenshot di `screenshots/` |
| Regresi homepage (skrip lama) | `node scripts/qa-interactions.mjs` | **26/26 lolos** |
| Overflow homepage 360–1440 px | `node scripts/qa-screens.mjs` | `overflowX: 0` di semua lebar, tanpa gambar rusak atau error konsol. Di 1440 px skrip menandai 2 SVG coretan dekoratif sebagai "wide"; tidak menimbulkan scroll horizontal. Belum saya bandingkan apakah tanda ini sudah ada sebelum perubahan. |

Cara mengulang: `npm run db:local && npm run db:migrate && npm run db:seed -- --open`, buat staf `kasir@tooday.local` / `kasir-lokal-123` dengan `npm run staff:create`, `npm run build && npx next start -p 3100`, lalu jalankan perintah di atas. Skrip QA mengosongkan antrean outlet `tooday-main` lokal sebelum mulai (menandai order lama EXPIRED/COMPLETED); jangan arahkan ke database produksi.

## Skenario penerimaan brief

| Skenario | Bukti | Status |
|---|---|---|
| Scan QR outlet: menu cepat, konteks benar, tanpa preloader | E2E: menu tampil ±0,4 dtk, tanpa `.loader`, sapaan tampil; API: meja valid/tidak valid | Lolos |
| Tambah dan ubah jumlah: cart benar, belum membuat order | E2E: 0 order di DB setelah Tambah; sticky "2 item · Rp44.000" | Lolos |
| Pairing: dua item independen tanpa diskon | E2E: Hi Tooday Coffee ×2 + ButterTteok = Rp64.000 (harga normal); homepage "Simpan keduanya" menambah 2 SKU | Lolos |
| Kasir siap dan kosong: satu kode, langsung ke kasir | API + E2E (tiket "Kasir siap melayani…") | Lolos |
| Kasir ramai: jumlah di depan dari server | API (1 lalu 2 di depan) + E2E | Lolos |
| Kasir dijeda, antrean kosong: tidak mengklaim kasir siap | API + E2E ("Kasir sedang melayani keperluan lain"), lalu dipanggil saat dilanjutkan | Lolos |
| 10 submit bersamaan: 10 kode unik, ≤1 CALLED | API: nomor 1–10, satu CALLED (nomor 1) | Lolos |
| Double tap + retry: satu order per key; payload beda ditolak | API: 3 request paralel key sama → 1 order; payload beda → 409 | Lolos |
| Respons hilang sesudah commit | API: `by-key` mengembalikan order yang sama; sesi lain tidak bisa | Lolos |
| Manipulasi harga/quantity | API: harga palsu → `PRICE_CHANGED` dengan total resmi; qty 0/21, total negatif → 400 | Lolos |
| Harga berubah sebelum submit | API: konflik lalu diterima setelah harga disetujui; snapshot tidak ikut berubah | Lolos |
| Menu habis / order ditutup | API (pesan jelas) + E2E (label "Lagi habis", tombol nonaktif, cart tetap) | Lolos |
| Pengunjung memanggil API bayar | API: 401, tanpa payment record | Lolos |
| Kasir konfirmasi dua kali | API: retry key sama → respons identik; key baru → 409; 1 payment record, nominal dari order | Lolos |
| Dua kasir bersamaan | API: 200 + 409, pihak kalah menerima state terbaru | Lolos |
| Bayar vs batal / kedaluwarsa | API: 5 putaran race bayar-vs-batal tanpa PAID+CANCELLED; order kedaluwarsa tidak bisa dibayar; constraint DB menolak kombinasi | Lolos |
| Lewati dan kembalikan | API + E2E: nomor tetap, pindah ke ekor, audit `DEFERRED`/`REQUEUED` dengan nama staf dan alasan | Lolos |
| Akses lintas outlet | API: 403 snapshot/aksi; 404 untuk order outlet lain | Lolos |
| Tamu membuka order orang lain | API: 404 (sesi lain), 401 (tanpa sesi), batal ditolak | Lolos |
| Display publik minimal | API: payload tanpa nama, catatan, harga, nama item, staf, id outlet; E2E: teks layar tanpa nama/catatan/Rp | Lolos |
| Reconnect/refresh | E2E: layar offline → penanda stale, nomor tetap tampil, pulih otomatis; tiket menolak snapshot versi lebih lama | Lolos (bunyi tidak berulang setelah reconnect: logika ada, **tidak diuji otomatis**) |
| Tengah malam | API: order aktif dari "kemarin" tetap dihitung di depan, nomor lanjut T-002; T-999 → T-1000 | Lolos (disimulasikan dengan menggeser tanggal di DB) |
| Siklus selesai tersinkron | E2E: bayar → dibuat → siap → selesai, tiket HP dan layar TV ikut berubah dari sesi kasir | Lolos |
| Koneksi gagal: tanpa fake success | E2E: kasir offline → tombol bayar nonaktif; klien membedakan error pasti dari hasil belum diketahui dan mengecek `by-key` | Lolos (alur "respons hilang" di UI diuji lewat API, bukan dengan memutus jaringan di tengah submit) |
| Mobile dan keyboard | E2E: 360/390 px tanpa scroll horizontal; kasir 768/390/1180 tidak terpotong; Tab sampai tombol Tambah, Enter, Escape menutup sheet | Lolos |
| Reduced motion | E2E: 14 menu tampil dengan `reducedMotion: reduce`; CSS mematikan animasi tiket/papan | Lolos |
| Refresh deep link di deployment | Lokal: `/pesanan/<id>`, `/kasir`, `/antrean`, `/api/*` berjalan di `next start` | **Belum diverifikasi di Netlify** |
| QR | `docs/order-system/qr/tooday-qr-tooday-main.png` didekode ulang dengan jsQR → `https://toodaycoffe.netlify.app/order?outlet=tooday-main&source=qr` | **Belum dipindai dengan kamera HP** |

## Screenshot (`screenshots/`)

| File | Isi |
|---|---|
| `01-order-menu-390.png` | Menu cepat dari QR, HP 390 px |
| `02-cart-review-390.png` | Pilihanku: jumlah, catatan, dine-in/takeaway, nama panggilan, total |
| `03-ticket-direct-390.png` | Tiket langsung ke kasir |
| `04-ticket-queue-360.png` | Tiket antrean bayar, "Ada 1 pesanan di depanmu", HP 360 px |
| `05-board-called-1920.png`, `10-board-ready-1920.png` | Layar antrean TV |
| `06-kasir-login.png`, `07-kasir-dashboard-1180.png`, `08-kasir-pay-modal.png` | Login, dashboard, konfirmasi bayar |
| `09-ticket-called-360.png`, `11-ticket-ready-390.png`, `15-ticket-paused-390.png` | "Giliranmu", "pesananmu siap", kasir dijeda |
| `13-order-soldout-390.png`, `14-order-closed-390.png` | Menu habis, order ditutup |
| `16-board-offline-1920.png`, `17-kasir-offline-1180.png` | Status koneksi putus |
| `18-home-pilihanku-1440.png` | Homepage: Pilihanku dengan CTA "Pesan di outlet" |
| `20-kasir-768.png`, `21-kasir-390.png`, `22-order-1440.png` | Tablet portrait, HP, desktop |
| `19-qr-card.png` | Kartu QR siap cetak |

## Bug yang ditemukan dan diperbaiki selama pengujian

- Teks kartu menu menutupi tombol detail sehingga mengetuk nama menu tidak membuka detail.
- Bar Pilihanku dan header sticky bisa menutupi elemen yang difokus (ditambah `scroll-padding`).
- Kode panggilan di layar TV pecah dua baris ("T-" / "001").
- Penanda tahap di tiket menyorot "Terkirim" padahal pelanggan sedang di tahap bayar.
- Dashboard kasir terpotong di kanan pada HP; menu desktop 3 kolom terlalu sempit.
- Deskripsi menu di `/order` memakai catatan internal `menu.json`; sekarang memakai copy publik yang sama dengan homepage.
- Data Postgres lokal di dalam folder project memicu reload terus-menerus pada `next dev`; dipindah ke `~/.tooday/pg`.

## Belum diverifikasi (wajib sebelum go-live)

1. **Supabase sungguhan**: migration di project Supabase, koneksi lewat transaction pooler, trigger nudge Realtime (`realtime.send`) dan klien Realtime.
2. **Deploy Netlify**: build, env, Route Handlers, cookie `Secure` di HTTPS, header `Origin`/`Host` di balik proxy Netlify (bila POST ditolak `BAD_ORIGIN`, isi `ALLOWED_ORIGINS` dengan domain situs).
3. **Uji lintas perangkat fisik**: semua uji di atas memakai beberapa sesi browser terpisah di satu komputer. Lakukan minimal satu siklus dengan HP sungguhan + tablet kasir + TV (lihat SETUP langkah 4).
4. **Pindai QR** dengan minimal dua HP sebelum cetak.
5. **Harga menu**: masih hasil transkripsi foto papan menu; harus diverifikasi pemilik.
6. Pembacaan nomor (speech synthesis) di layar TV bergantung pada suara bahasa Indonesia yang terpasang di perangkat TV/browser.
