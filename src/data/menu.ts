import rawMenu from "./menu.json";

export const CATEGORIES = ["Coffee", "Matcha", "Non-Coffee", "Cemal-cemil"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface MenuItem {
  id: string;
  slug: string;
  name: string;
  /** Ejaan persis seperti di papan menu sumber. */
  sourceName: string;
  category: Category;
  description: string | null;
  price: number | null;
  currency: "IDR";
  image: string | null;
  alt: string;
  variants: string[];
  /** null = belum diketahui, bukan habis. */
  availability: boolean | null;
  sourceFile: string;
  /** false sampai pemilik mengonfirmasi pemetaan foto dan harga. */
  verified: boolean;
}

// Copy publik per item, berdasarkan keterangan di papan menu. Ejaan nama sudah dirapikan atas
// konfirmasi pemilik; ejaan asli papan menu tersimpan di sourceName.
const PUBLIC_COPY: Record<string, { description: string | null; alt: string }> = {
  "hi-tooday-coffe": { description: "Kopi susu basic.", alt: "" },
  "good-tooday-coffe": { description: "Kopi susu strong.", alt: "" },
  // Nama dikoreksi pemilik: papan menu menulis "Out After Drak (kopi susu outside)".
  "out-after-drak": { description: "Kopi susu dengan susu oat.", alt: "" },
  "dirty-tooday-coffe": {
    description: "Americano.",
    alt: "Segelas americano dingin Tooday dalam cup berlabel",
  },
  "biscoff-coffe-latte": { description: "Kopi latte dengan Biscoff.", alt: "" },
  "matcha-latte": {
    description: "Matcha latte.",
    alt: "Segelas matcha latte dingin Tooday dalam cup berlabel",
  },
  // Nama dikoreksi pemilik: papan menu menulis "out", yang dimaksud "oat".
  "matcha-out-latte": { description: "Matcha latte dengan susu oat.", alt: "" },
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

export const menu: MenuItem[] = rawMenu.map((item) => ({
  id: item.id,
  slug: item.id,
  name: item.name,
  sourceName: item.sourceName,
  category: item.category as Category,
  description: PUBLIC_COPY[item.id]?.description ?? null,
  price: item.price,
  currency: "IDR",
  image: item.image,
  alt: PUBLIC_COPY[item.id]?.alt ?? "",
  variants: [],
  availability: item.available,
  sourceFile: item.priceSource,
  verified: false,
}));

export function getItem(id: string): MenuItem {
  const item = menu.find((entry) => entry.id === id);
  if (!item) throw new Error(`Menu item tidak ditemukan: ${id}`);
  return item;
}

export function byCategory(category: Category): MenuItem[] {
  return menu.filter((item) => item.category === category);
}
