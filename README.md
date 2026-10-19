# Tooday — website

Situs Tooday (kopi, matcha, non-coffee, ButterTteok) plus sistem pesanan QR: pengunjung memesan dari HP, membayar di kasir, dan memantau antrean. Next.js App Router, React, TypeScript strict, Tailwind CSS 4, GSAP ScrollTrigger, Lenis, PostgreSQL (Supabase).

| Route | Isi |
|---|---|
| `/` | Homepage |
| `/order` | Menu cepat dari QR, Pilihanku, kirim pesanan |
| `/pesanan/[id]` | Tiket dan status pesanan pengunjung |
| `/kasir/login`, `/kasir`, `/kasir/qr` | Tooday Counter untuk staf, QR siap cetak |
| `/antrean` | Layar antrean publik |

Dokumentasi sistem pesanan: [docs/order-system/](docs/order-system/README.md) (arsitektur, [setup](docs/order-system/SETUP.md), [SOP kasir](docs/order-system/SOP_KASIR.md), [hasil uji](docs/order-system/TEST_RESULTS.md)).

## Menjalankan

```bash
npm install
cp .env.example .env.local   # isi DATABASE_URL; lihat docs/order-system/SETUP.md
npm run db:local && npm run db:migrate && npm run db:seed -- --open
npm run dev        # http://localhost:3000
npm run build
npm run start
npm run lint
```

## Struktur

| Lokasi | Isi |
|---|---|
| `src/app` | Layout, halaman, `globals.css` (token merek dan seluruh gaya) |
| `src/components/sections` | Seksi halaman, urut dari ticker sampai footer |
| `src/components/order` | Daftar "Pilihanku", dialog detail produk |
| `src/components/motion` | Smooth scroll, reveal, judul per huruf, teks wipe, parallax |
| `src/components/ui` | Tombol pil, marquee, sheet (dialog), stepper |
| `src/data` | `menu.json`, `brand.json`, dan pembungkus bertipe |
| `public/assets/tooday` | Aset yang dipakai situs |
| `asset/` | Paket aset asli (sumber JPEG, master PNG, prompt) — tidak diubah |
| `docs/` | Audit aset, token merek, daftar data yang belum ada |
| `scripts/` | Pemeriksaan Playwright, database lokal, staf, QR |
| `src/app/api`, `src/lib/server` | API dan logika pesanan/antrean (server) |
| `supabase/migrations` | Schema database pesanan |
| `tests/` | Integration test API (`npm run test:api`) |

## Mengubah konten

- Menu dan harga: `src/data/menu.json`. Copy publik per item: `PUBLIC_COPY` di `src/data/menu.ts`.
- Instagram, WhatsApp, alamat, jam buka, logo: `src/data/brand.json`.
- Dua menu di seksi pilihan: `id` pada `FeaturedItem` di `src/components/sections/Featured.tsx`.
- Warna ubin kartu menu: `TILE` di `src/components/sections/MenuExplorer.tsx`.
- Minuman di saran menikmati: `DRINK_IDS` di `src/components/sections/PairingSection.tsx`.

## Pemeriksaan

Jalankan `npm run build && npx next start -p 3210`, lalu:

```bash
node scripts/qa-interactions.mjs qa-out   # alur utama, keyboard, reduced-motion, tanpa JS
node scripts/qa-screens.mjs qa-out        # overflow dan gambar rusak di 360/390/768/1024/1440
```

Skrip memakai Microsoft Edge yang terpasang (`channel: "msedge"`).

Sistem pesanan: `npm run test:api` dan `npm run qa:order` (butuh server dan database berjalan; lihat `docs/order-system/TEST_RESULTS.md`).

Baca `docs/content-gaps.md` sebelum rilis: alamat, jam buka, dan master logo belum tersedia. Harga menu di database pesanan harus diverifikasi pemilik sebelum order dibuka.
