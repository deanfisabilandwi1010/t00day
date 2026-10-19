import rawMenu from "./menu.json";
import { PUBLIC_COPY } from "./menu-copy";

export const CATEGORIES = ["Coffee", "Matcha", "Non-Coffee", "Cemal-cemil"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface MenuItem {
  id: string;
  slug: string;
  name: string;
  /** Ejaan persis seperti di papan menu sumber. */
  sourceName: string;
  /** Section menu. Di data statis sama dengan nama kategori; di data live berupa id section. */
  sectionId: string;
  /** Nama section (Coffee, Matcha, … atau section baru dari Kelola menu). */
  category: string;
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


export const menu: MenuItem[] = rawMenu.map((item) => ({
  id: item.id,
  slug: item.id,
  name: item.name,
  sourceName: item.sourceName,
  sectionId: item.category,
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

/** Event window untuk mengganti filter menu dari seksi lain; detail = Category. */
export const FILTER_EVENT = "tooday:filter";

export function getItem(id: string): MenuItem {
  const item = menu.find((entry) => entry.id === id);
  if (!item) throw new Error(`Menu item tidak ditemukan: ${id}`);
  return item;
}

export function byCategory(category: string): MenuItem[] {
  return menu.filter((item) => item.category === category);
}
