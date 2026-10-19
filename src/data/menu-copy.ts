// Tanpa import: dibaca juga oleh scripts/db/seed.mjs (Node menjalankan file .ts ini langsung),
// sehingga deskripsi di database pesanan sama dengan homepage.
// Copy publik per item, berdasarkan keterangan di papan menu. Ejaan nama sudah dirapikan atas
// konfirmasi pemilik; ejaan asli papan menu tersimpan di sourceName.
export const PUBLIC_COPY: Record<string, { description: string | null; alt: string }> = {
  // Empat menu kopi di bawah memakai foto kopi berlapis yang sama untuk sementara (keputusan pemilik).
  "hi-tooday-coffe": { description: "Kopi susu basic.", alt: "Segelas kopi susu dingin Tooday dengan lapisan kopi dan susu dalam cup berlabel" },
  "good-tooday-coffe": { description: "Kopi susu strong.", alt: "Segelas kopi susu dingin Tooday dengan lapisan kopi dan susu dalam cup berlabel" },
  // Nama dikoreksi pemilik: papan menu menulis "Out After Drak (kopi susu outside)".
  "out-after-drak": { description: "Kopi susu dengan susu oat.", alt: "Segelas kopi susu dingin Tooday dengan lapisan kopi dan susu dalam cup berlabel" },
  "dirty-tooday-coffe": {
    description: "Americano.",
    alt: "Segelas americano dingin Tooday dalam cup berlabel",
  },
  "biscoff-coffe-latte": { description: "Kopi latte dengan Biscoff.", alt: "Segelas kopi susu dingin Tooday dengan lapisan kopi dan susu dalam cup berlabel" },
  "matcha-latte": {
    description: "Matcha latte.",
    alt: "Segelas matcha latte dingin Tooday dalam cup berlabel",
  },
  // Nama dikoreksi pemilik: papan menu menulis "out", yang dimaksud "oat".
  // Sementara memakai foto Matcha Latte (keputusan pemilik).
  "matcha-out-latte": {
    description: "Matcha latte dengan susu oat.",
    alt: "Segelas matcha latte dingin Tooday dalam cup berlabel",
  },
  "matcha-biscoff-latte": {
    description: "Matcha latte dengan Biscoff.",
    alt: "Segelas matcha Biscoff latte Tooday dengan lapisan hijau dan karamel",
  },
  "dark-choco": {
    description: "Minuman cokelat.",
    alt: "Segelas minuman cokelat gelap Tooday dalam cup berlabel",
  },
  "choco-hazelnat": {
    description: "Cokelat hazelnut.",
    alt: "Segelas minuman cokelat hazelnut Tooday dalam cup berlabel",
  },
  "mango-yakult": {
    description: "Yakult rasa mangga.",
    alt: "Segelas mango Yakult Tooday berwarna kuning",
  },
  "lycee-yakult": {
    description: "Yakult rasa leci.",
    alt: "Segelas lychee Yakult Tooday berwarna putih bening",
  },
  "fruitpunch-yakult": {
    description: "Yakult fruitpunch.",
    alt: "Segelas fruitpunch Yakult Tooday berwarna merah muda",
  },
  butertteok: {
    description: "Empat potong ButterTteok dalam satu porsi.",
    alt: "Empat potong ButterTteok dalam kotak kuning dengan kantong kertas Tooday",
  },
};
