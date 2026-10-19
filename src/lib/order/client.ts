"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiErrorBody, ApiErrorCode } from "./types";
import { subscribeFeedNudge } from "./realtime";

/** Error dari server (ada kode) vs kegagalan jaringan (hasil belum diketahui). */
export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | "NETWORK",
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }

  /** true bila permintaan mungkin sudah diproses server tetapi responsnya tidak sampai. */
  get uncertain() {
    return this.code === "NETWORK" || this.status >= 500;
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), init?.timeoutMs ?? 12000);
  let response: Response;
  try {
    response = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new RequestError(0, "NETWORK", "Koneksi terputus.");
  } finally {
    window.clearTimeout(timer);
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const body = data as ApiErrorBody | null;
    throw new RequestError(
      response.status,
      body?.error?.code ?? "SERVER",
      body?.error?.message ?? "Server sedang bermasalah. Coba lagi sebentar lagi.",
      body?.error?.detail,
    );
  }
  return data as T;
}

export function newKey(): string {
  const webCrypto: Crypto = globalThis.crypto;
  if (typeof webCrypto.randomUUID === "function") return webCrypto.randomUUID();
  // Cadangan untuk browser lama (randomUUID hanya ada di konteks aman): UUID v4 dari getRandomValues.
  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type FeedHealth = "connecting" | "live" | "reconnecting" | "offline";

interface FeedOptions<T> {
  /** URL dasar; versi terakhir ditambahkan sebagai ?v= agar server cukup menjawab "tidak berubah". */
  url: string | null;
  intervalMs: number;
  outlet: string | null;
  /** Ambil feedVersion dari data penuh. */
  versionOf?: (data: T) => number;
  /** Tolak snapshot yang lebih tua dari yang sudah tampil (mis. respons datang terlambat). */
  isStale?: (current: T, incoming: T) => boolean;
  onError?: (error: RequestError) => void;
}

/**
 * Sinkronisasi antarperangkat: database adalah sumber kebenaran, klien mengambil snapshot berkala
 * (lebih jarang saat tab tersembunyi), langsung saat tab kembali fokus/online, dan saat ada nudge
 * Realtime. Snapshot terakhir dipertahankan saat koneksi gagal dan ditandai stale.
 */
export function useFeed<T>({ url, intervalMs, outlet, versionOf, isStale, onError }: FeedOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [health, setHealth] = useState<FeedHealth>("connecting");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const versionRef = useRef<number | null>(null);
  const inflight = useRef(false);
  const queued = useRef(false);
  const failures = useRef(0);
  const errorRef = useRef(onError);
  const versionOfRef = useRef(versionOf);
  const staleRef = useRef(isStale);
  useEffect(() => {
    errorRef.current = onError;
    versionOfRef.current = versionOf;
    staleRef.current = isStale;
  });

  const refresh = useCallback(
    async (force = false) => {
      if (!url) return;
      // Satu permintaan pada satu waktu; permintaan yang datang saat sibuk digabung menjadi satu putaran lagi.
      if (inflight.current) {
        queued.current = true;
        return;
      }
      inflight.current = true;
      try {
        let again = true;
        while (again) {
          again = false;
          queued.current = false;
          try {
            const separator = url.includes("?") ? "&" : "?";
            const target = !force && versionRef.current !== null && versionOfRef.current ? `${url}${separator}v=${versionRef.current}` : url;
            const result = await api<T & { changed?: boolean; feedVersion?: number }>(target, { timeoutMs: 8000 });
            failures.current = 0;
            setHealth("live");
            setUpdatedAt(new Date());
            if (result.changed !== false) {
              if (versionOfRef.current) versionRef.current = versionOfRef.current(result);
              setData((current) => (current && staleRef.current?.(current, result) ? current : result));
            }
          } catch (error) {
            const failure = error instanceof RequestError ? error : new RequestError(0, "NETWORK", "Koneksi terputus.");
            if (failure.code === "NETWORK" || failure.status >= 500) {
              failures.current += 1;
              setHealth(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "reconnecting");
            }
            errorRef.current?.(failure);
          }
          again = queued.current;
        }
      } finally {
        inflight.current = false;
      }
    },
    [url],
  );

  useEffect(() => {
    if (!url) return;
    versionRef.current = null;
    let timer: number;
    let cancelled = false;
    const loop = async () => {
      await refresh();
      if (cancelled) return;
      const hidden = document.visibilityState === "hidden";
      // Backoff ringan saat gagal; tab tersembunyi cukup diperbarui jarang.
      const delay = hidden ? Math.max(intervalMs, 15000) : failures.current > 0 ? Math.min(intervalMs * 2 ** failures.current, 15000) : intervalMs;
      timer = window.setTimeout(loop, delay);
    };
    void loop();

    const wake = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const online = () => void refresh();
    const offline = () => setHealth("offline");
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const unsubscribe = outlet ? subscribeFeedNudge(outlet, () => void refresh()) : () => {};
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      unsubscribe();
    };
  }, [url, intervalMs, outlet, refresh]);

  return { data, setData, health, updatedAt, refresh };
}

export function useClock(intervalMs = 15000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function formatTime(date: Date | string | null, withSeconds = false): string {
  if (!date) return "–";
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    timeZone: "Asia/Jakarta",
  }).format(typeof date === "string" ? new Date(date) : date);
}

/** Bunyi pendek lewat WebAudio. Hanya dipanggil setelah pengguna menekan "Aktifkan suara". */
export function chime(context: AudioContext | null, notes: number[] = [880, 1175]) {
  if (!context) return;
  const start = context.currentTime;
  notes.forEach((frequency, index) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + index * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.25, start + index * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.18 + 0.32);
    osc.connect(gain).connect(context.destination);
    osc.start(start + index * 0.18);
    osc.stop(start + index * 0.18 + 0.34);
  });
}
