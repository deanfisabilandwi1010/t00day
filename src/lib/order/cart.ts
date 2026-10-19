"use client";

import { useSyncExternalStore } from "react";
import { LIMITS, type OrderType } from "./types";

/**
 * Keranjang "Pilihanku" bersama untuk homepage dan /order. Hanya draft di perangkat ini:
 * tidak ada yang terkirim ke kasir sampai pengunjung menekan "Kirim pesanan" dan server menyimpannya.
 */
export interface CartLine {
  sku: string;
  qty: number;
  note?: string;
}

export interface CartState {
  lines: CartLine[];
  orderType: OrderType;
  nickname: string;
}

/** Percobaan submit yang hasilnya belum pasti. Disimpan sampai server memberi jawaban. */
export interface PendingSubmit {
  key: string;
  outlet: string;
  startedAt: number;
}

const CART_KEY = "tooday-cart-v1";
const PENDING_KEY = "tooday-pending-v1";
const EMPTY: CartState = { lines: [], orderType: "DINE_IN", nickname: "" };

let state: CartState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function read(): CartState {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<CartState>;
    const lines = Array.isArray(parsed.lines)
      ? parsed.lines
          .filter((line): line is CartLine => typeof line?.sku === "string" && Number.isInteger(line.qty) && line.qty > 0)
          .map((line) => ({ sku: line.sku, qty: Math.min(LIMITS.qtyMax, line.qty), note: typeof line.note === "string" ? line.note.slice(0, LIMITS.noteMax) : undefined }))
          .slice(0, LIMITS.linesMax)
      : [];
    return {
      lines,
      orderType: parsed.orderType === "TAKEAWAY" ? "TAKEAWAY" : "DINE_IN",
      nickname: typeof parsed.nickname === "string" ? parsed.nickname.slice(0, LIMITS.nicknameMax) : "",
    };
  } catch {
    return EMPTY;
  }
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  state = read();
  window.addEventListener("storage", (event) => {
    if (event.key !== CART_KEY) return;
    state = read();
    listeners.forEach((listener) => listener());
  });
}

function commit(next: CartState) {
  state = next;
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(next));
  } catch {
    // Penyimpanan penuh/diblokir: keranjang tetap berfungsi selama tab terbuka.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  ensureLoaded();
  return state;
}

export function useCart(): CartState {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

/** Satu baris per kombinasi menu + catatan; catatan berbeda = baris berbeda. */
const sameLine = (line: CartLine, sku: string, note?: string) => line.sku === sku && (line.note ?? "") === (note ?? "");

export const cart = {
  add(sku: string, qty = 1, note?: string) {
    ensureLoaded();
    const cleanNote = note?.trim().slice(0, LIMITS.noteMax) || undefined;
    const existing = state.lines.find((line) => sameLine(line, sku, cleanNote));
    const lines = existing
      ? state.lines.map((line) => (line === existing ? { ...line, qty: Math.min(LIMITS.qtyMax, line.qty + qty) } : line))
      : [...state.lines, { sku, qty: Math.min(LIMITS.qtyMax, qty), note: cleanNote }].slice(0, LIMITS.linesMax);
    commit({ ...state, lines });
  },
  setQty(index: number, qty: number) {
    ensureLoaded();
    const lines = qty <= 0 ? state.lines.filter((_, i) => i !== index) : state.lines.map((line, i) => (i === index ? { ...line, qty: Math.min(LIMITS.qtyMax, qty) } : line));
    commit({ ...state, lines });
  },
  /** Mengatur total jumlah satu menu (dipakai homepage yang tidak memakai catatan). */
  setSkuQty(sku: string, qty: number) {
    ensureLoaded();
    const others = state.lines.filter((line) => line.sku !== sku);
    const first = state.lines.find((line) => line.sku === sku);
    commit({ ...state, lines: qty <= 0 ? others : [...others, { sku, qty: Math.min(LIMITS.qtyMax, qty), note: first?.note }] });
  },
  setNote(index: number, note: string) {
    ensureLoaded();
    commit({ ...state, lines: state.lines.map((line, i) => (i === index ? { ...line, note: note.slice(0, LIMITS.noteMax) || undefined } : line)) });
  },
  remove(index: number) {
    cart.setQty(index, 0);
  },
  setOrderType(orderType: OrderType) {
    ensureLoaded();
    commit({ ...state, orderType });
  },
  setNickname(nickname: string) {
    ensureLoaded();
    commit({ ...state, nickname: nickname.slice(0, LIMITS.nicknameMax) });
  },
  clear() {
    ensureLoaded();
    commit({ ...state, lines: [] });
  },
};

export const pending = {
  get(): PendingSubmit | null {
    try {
      const raw = window.localStorage.getItem(PENDING_KEY);
      return raw ? (JSON.parse(raw) as PendingSubmit) : null;
    } catch {
      return null;
    }
  },
  set(value: Omit<PendingSubmit, "startedAt">) {
    try {
      window.localStorage.setItem(PENDING_KEY, JSON.stringify({ ...value, startedAt: Date.now() }));
    } catch {}
  },
  clear() {
    try {
      window.localStorage.removeItem(PENDING_KEY);
    } catch {}
  },
};
