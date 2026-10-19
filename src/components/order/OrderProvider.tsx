"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { MenuItem } from "@/data/menu";
import { useLiveMenu } from "@/data/live-menu";
import { cart, useCart } from "@/lib/order/cart";
import { gsap, MQ } from "@/lib/motion";
import { OrderSummary } from "./OrderSummary";
import { ProductDialog } from "./ProductDialog";

export interface OrderLine {
  item: MenuItem;
  qty: number;
}

interface OrderContextValue {
  lines: OrderLine[];
  count: number;
  /** Jumlah harga yang diketahui; item tanpa harga tidak dihitung. */
  total: number;
  add: (id: string, qty?: number, from?: HTMLElement | null) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
  openList: () => void;
  openDetail: (id: string) => void;
}

const OrderContext = createContext<OrderContextValue | null>(null);

export const ORDER_TOGGLE_ID = "order-toggle";

export function useOrder(): OrderContextValue {
  const value = useContext(OrderContext);
  if (!value) throw new Error("useOrder harus dipakai di dalam OrderProvider");
  return value;
}

/** Gambar produk melayang ke tombol "Pilihanku" sebagai umpan balik visual. */
function flyToList(from: HTMLElement | null | undefined) {
  const target = document.getElementById(ORDER_TOGGLE_ID);
  const image = from?.querySelector("img") ?? (from instanceof HTMLImageElement ? from : null);
  if (!target || !image || !window.matchMedia(MQ.motionOk).matches) return;

  const start = image.getBoundingClientRect();
  const end = target.getBoundingClientRect();
  if (!start.width || !end.width) return;

  const ghost = image.cloneNode() as HTMLImageElement;
  ghost.removeAttribute("srcset");
  ghost.removeAttribute("sizes");
  ghost.src = image.currentSrc || image.src;
  ghost.alt = "";
  ghost.className = "fly-ghost";
  Object.assign(ghost.style, {
    left: `${start.left}px`,
    top: `${start.top}px`,
    width: `${start.width}px`,
    height: `${start.height}px`,
  });
  document.body.appendChild(ghost);

  gsap.to(ghost, {
    x: end.left + end.width / 2 - (start.left + start.width / 2),
    y: end.top + end.height / 2 - (start.top + start.height / 2),
    scale: Math.max(0.08, 28 / start.width),
    rotate: 18,
    opacity: 0.4,
    duration: 0.7,
    ease: "power3.in",
    onComplete: () => {
      ghost.remove();
      gsap.fromTo(target, { scale: 1.18 }, { scale: 1, duration: 0.4, ease: "back.out(3)" });
    },
  });
}

/**
 * Pilihanku di homepage memakai keranjang yang sama dengan halaman /order (localStorage di perangkat ini).
 * Menyimpan ke Pilihanku tidak mengirim apa pun ke kasir; pengiriman hanya terjadi di /order setelah review.
 */
export function OrderProvider({ children }: { children: ReactNode }) {
  const cartState = useCart();
  const { find } = useLiveMenu();
  const [listOpen, setListOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const add = useCallback((id: string, qty = 1, from?: HTMLElement | null) => {
    cart.add(id, qty);
    setAnnouncement(`${qty} ${find(id)?.name ?? "Menu"} ditambahkan ke pilihanmu.`);
    flyToList(from);
  }, [find]);

  const setQty = useCallback((id: string, qty: number) => cart.setSkuQty(id, qty), []);

  const clear = useCallback(() => cart.clear(), []);
  const openList = useCallback(() => {
    setDetailOpen(false);
    setListOpen(true);
  }, []);
  const openDetail = useCallback((id: string) => {
    setDetailId(id);
    setDetailOpen(true);
  }, []);

  const value = useMemo<OrderContextValue>(() => {
    // Baris dengan catatan berbeda (dibuat di /order) digabung per menu untuk tampilan ringkas homepage.
    const quantities = new Map<string, number>();
    for (const line of cartState.lines) {
      if (find(line.sku)) quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.qty);
    }
    const lines = [...quantities].map(([id, qty]) => ({ item: find(id)!, qty }));
    return {
      lines,
      count: lines.reduce((sum, line) => sum + line.qty, 0),
      total: lines.reduce((sum, line) => sum + (line.item.price ?? 0) * line.qty, 0),
      add,
      setQty,
      clear,
      openList,
      openDetail,
    };
  }, [cartState.lines, find, add, setQty, clear, openList, openDetail]);

  return (
    <OrderContext.Provider value={value}>
      {children}
      <ProductDialog item={detailId ? find(detailId) : null} open={detailOpen} onClose={() => setDetailOpen(false)} />
      <OrderSummary open={listOpen} onClose={() => setListOpen(false)} />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </OrderContext.Provider>
  );
}
