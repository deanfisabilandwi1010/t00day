# Tooday — website

Situs satu halaman untuk Tooday (kopi, matcha, non-coffee, ButterTteok). Next.js App Router, React, TypeScript strict, Tailwind CSS 4, GSAP ScrollTrigger, Lenis.

## Menjalankan

```bash
npm install
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
| `scripts/` | Pemeriksaan Playwright |

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

Baca `docs/content-gaps.md` sebelum rilis: kanal order, alamat, jam buka, dan master logo belum tersedia.
