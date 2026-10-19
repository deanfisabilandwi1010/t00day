"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PublicMenuItem } from "@/lib/order/types";
import { CATEGORIES, menu as staticMenu, type MenuItem } from "./menu";
import { PUBLIC_COPY } from "./menu-copy";

/**
 * Menu homepage: dirender dulu dari data statis (cepat, terbaca tanpa JS), lalu diganti menu
 * live dari database yang dikelola manager lewat "Kelola menu". Section dan menu baru ikut
 * muncul; menu yang diarsipkan hilang; harga dan status habis mengikuti kasir.
 */
export interface MenuSection {
  id: string;
  name: string;
}

interface LiveMenuValue {
  sections: MenuSection[];
  items: MenuItem[];
  /** true setelah data dari server berhasil dimuat. */
  live: boolean;
  /** Cari menu; bila tidak ada di data live (mis. diarsipkan), jatuh ke data statis. */
  find: (id: string) => MenuItem | null;
  inSection: (sectionId: string) => MenuItem[];
}

const OUTLET = process.env.NEXT_PUBLIC_DEFAULT_OUTLET ?? "tooday-main";
const REFRESH_MS = 60_000;

const STATIC_SECTIONS: MenuSection[] = CATEGORIES.map((category) => ({ id: category, name: category }));
const staticById = new Map(staticMenu.map((item) => [item.id, item]));

function fromServer(item: PublicMenuItem): MenuItem {
  return {
    id: item.sku,
    slug: item.sku,
    name: item.name,
    sourceName: item.name,
    sectionId: item.sectionId,
    category: item.category,
    description: item.description,
    price: item.price,
    currency: "IDR",
    image: item.image,
    alt: PUBLIC_COPY[item.sku]?.alt ?? (item.image ? `Foto ${item.name}` : ""),
    variants: [],
    availability: item.available,
    sourceFile: "",
    verified: true,
  };
}

const LiveMenuContext = createContext<LiveMenuValue | null>(null);

export function LiveMenuProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<{ sections: MenuSection[]; items: MenuItem[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let last = 0;
    const load = async () => {
      if (Date.now() - last < REFRESH_MS) return;
      last = Date.now();
      try {
        const response = await fetch(`/api/menu?outlet=${OUTLET}`, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { sections: MenuSection[]; items: PublicMenuItem[] };
        // Database kosong/salah konfigurasi: tetap pakai menu statis, jangan kosongkan halaman.
        if (!cancelled && body.items.length > 0) setData({ sections: body.sections, items: body.items.map(fromServer) });
      } catch {
        // Gagal memuat: homepage tetap memakai menu statis.
      }
    };
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const value = useMemo<LiveMenuValue>(() => {
    const sections = data?.sections ?? STATIC_SECTIONS;
    const items = data?.items ?? staticMenu;
    const byId = new Map(items.map((item) => [item.id, item]));
    return {
      sections,
      items,
      live: data !== null,
      find: (id) => byId.get(id) ?? staticById.get(id) ?? null,
      inSection: (sectionId) => items.filter((item) => item.sectionId === sectionId),
    };
  }, [data]);

  return <LiveMenuContext.Provider value={value}>{children}</LiveMenuContext.Provider>;
}

export function useLiveMenu(): LiveMenuValue {
  const value = useContext(LiveMenuContext);
  if (!value) throw new Error("useLiveMenu harus dipakai di dalam LiveMenuProvider");
  return value;
}

/** Satu menu (untuk seksi kurasi seperti Pilihan dan Saran menikmati). */
export function useMenuItem(id: string): MenuItem {
  return useLiveMenu().find(id) ?? staticById.get(id)!;
}
