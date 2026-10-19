"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Maximize, Volume2, VolumeX, WifiOff } from "lucide-react";
import { brand } from "@/data/brand";
import { chime, formatTime, useClock, useFeed } from "@/lib/order/client";
import type { PublicQueueEntry, PublicQueueFeed } from "@/lib/order/types";
import { Mascot } from "@/components/ui/Mascot";

const DEFAULT_OUTLET = process.env.NEXT_PUBLIC_DEFAULT_OUTLET ?? "tooday-main";
const PREP_PAGE = 12;
const READY_PAGE = 8;
const ROTATE_MS = 8000;

/** Rotasi halaman bila daftar melebihi kapasitas layar. */
function usePage<T>(items: T[], size: number) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));
  useEffect(() => {
    if (pages <= 1) return;
    const timer = window.setInterval(() => setPage((current) => (current + 1) % pages), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [pages]);
  const current = page % pages;
  return { items: items.slice(current * size, current * size + size), page: current, pages };
}

export function BoardApp() {
  const params = useSearchParams();
  const raw = params.get("outlet") ?? DEFAULT_OUTLET;
  const outlet = /^[a-z0-9][a-z0-9-]{1,39}$/.test(raw) ? raw : DEFAULT_OUTLET;
  const clock = useClock(10000);
  const { data, health, updatedAt } = useFeed<PublicQueueFeed & { changed: true }>({
    url: `/api/antrean?outlet=${outlet}`,
    intervalMs: 3000,
    outlet,
    versionOf: (feed) => feed.feedVersion,
  });

  const [sound, setSound] = useState<"off" | "chime" | "voice">("off");
  const audio = useRef<AudioContext | null>(null);
  // Event id tertinggi yang sudah diumumkan. Reconnect hanya mengumumkan event yang lebih baru.
  const announced = useRef<{ call: number; ready: number } | null>(null);
  const [pulseKey, setPulseKey] = useState<number | null>(null);

  useEffect(() => {
    if (!data) return;
    const callId = data.called?.callEventId ?? 0;
    const readyId = Math.max(0, ...data.ready.map((entry) => entry.readyEventId ?? 0));
    if (announced.current === null) {
      announced.current = { call: callId, ready: readyId };
      return;
    }
    const last = announced.current;
    if (callId > last.call && data.called) {
      setPulseKey(callId);
      if (sound !== "off") chime(audio.current);
      if (sound === "voice") speak(`Nomor ${spell(data.called.code)}, silakan ke kasir.`);
    } else if (readyId > last.ready) {
      const entry = data.ready.find((item) => item.readyEventId === readyId);
      if (sound !== "off") chime(audio.current, [1175, 1568]);
      if (sound === "voice" && entry) speak(`Nomor ${spell(entry.code)}, pesananmu siap.`);
    }
    announced.current = { call: Math.max(last.call, callId), ready: Math.max(last.ready, readyId) };
  }, [data, sound]);

  function cycleSound() {
    const next = sound === "off" ? "chime" : sound === "chime" ? "voice" : "off";
    if (next !== "off") {
      const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Context) {
        audio.current ??= new Context();
        void audio.current.resume();
        chime(audio.current, [988]);
      }
    }
    setSound(next);
  }

  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const prep = usePage(data?.preparing ?? [], PREP_PAGE);
  const ready = usePage(data?.ready ?? [], READY_PAGE);
  const stale = health === "reconnecting" || health === "offline";
  const empty = data && !data.called && data.waiting.length === 0 && data.preparing.length === 0 && data.ready.length === 0;

  return (
    <div className="board">
      <div className="board-checker" aria-hidden="true" />
      <header className="board-head">
        <Image src={brand.logo.src} alt={brand.logo.alt} width={brand.logo.width} height={brand.logo.height} sizes="200px" className="board-logo" preload />
        <h1 className="board-title">Your tooday is on the way</h1>
        <p className="board-clock tabular">{formatTime(clock)}</p>
      </header>

      {stale && (
        <p className="board-stale" role="status">
          <WifiOff aria-hidden="true" size={22} /> Koneksi terputus. Status mungkin belum terbaru.
          {updatedAt && <span> Terakhir {formatTime(updatedAt)}</span>}
        </p>
      )}

      {!data && !stale && <p className="board-loading">Memuat antrean…</p>}

      {empty ? (
        <main id="main" className="board-empty">
          <Mascot name="boy-with-cup" reveal="now" className="board-empty-mascot" sizes="320px" />
          <p>Belum ada antrean. Pilih yang enak untuk tooday!</p>
        </main>
      ) : (
        data && (
          <main id="main" className="board-grid">
            <section className="board-panel board-panel--call" aria-labelledby="board-call">
              <h2 id="board-call" className="board-panel-title">
                Silakan ke kasir
              </h2>
              {data.called ? (
                <div className="board-called">
                  <Mascot name="boy-pointing" reveal="now" className="board-pointer" sizes="220px" />
                  <p key={pulseKey ?? 0} className={`board-called-code tabular ${pulseKey === data.called.callEventId ? "is-pulse" : ""}`}>
                    {data.called.code}
                  </p>
                </div>
              ) : (
                <p className="board-called-none">{data.counterReady ? "Menunggu nomor berikutnya" : "Kasir sedang jeda sebentar"}</p>
              )}
              {data.waiting.length > 0 && (
                <div className="board-next">
                  <p className="board-next-label">Berikutnya</p>
                  <ul>
                    {data.waiting.slice(0, 6).map((entry) => (
                      <li key={entry.code} className="tabular">
                        {entry.code}
                      </li>
                    ))}
                  </ul>
                  {data.waiting.length > 6 && <p className="board-more">+{data.waiting.length - 6} lagi</p>}
                </div>
              )}
            </section>

            <section className="board-panel board-panel--prep" aria-labelledby="board-prep">
              <h2 id="board-prep" className="board-panel-title">
                Sedang disiapkan
              </h2>
              {prep.items.length === 0 ? (
                <p className="board-none">Belum ada yang dibuat</p>
              ) : (
                <ul className="board-codes">
                  {prep.items.map((entry: PublicQueueEntry) => (
                    <li key={entry.code} className={`board-code board-code--${entry.status.toLowerCase()}`}>
                      <span className="tabular">{entry.code}</span>
                      <small>{entry.status === "PREPARING" ? "Sedang dibuat" : "Antre dibuat"}</small>
                    </li>
                  ))}
                </ul>
              )}
              {prep.pages > 1 && <p className="board-page">Halaman {prep.page + 1}/{prep.pages}</p>}
            </section>

            <section className="board-panel board-panel--ready" aria-labelledby="board-ready">
              <h2 id="board-ready" className="board-panel-title">
                Siap diambil
              </h2>
              {ready.items.length === 0 ? (
                <p className="board-none">Belum ada yang siap</p>
              ) : (
                <ul className="board-codes board-codes--ready">
                  {ready.items.map((entry) => (
                    <li key={entry.code} className="board-code board-code--ready">
                      <span className="tabular">{entry.code}</span>
                    </li>
                  ))}
                </ul>
              )}
              {ready.pages > 1 && <p className="board-page">Halaman {ready.page + 1}/{ready.pages}</p>}
              <Mascot name="girl-head" reveal="now" className="board-girl" sizes="160px" />
            </section>
          </main>
        )
      )}

      <div className="board-ops" aria-label="Kontrol operator">
        <button type="button" onClick={cycleSound} aria-label={`Suara: ${sound === "off" ? "mati" : sound === "chime" ? "bunyi" : "bunyi dan baca nomor"}`}>
          {sound === "off" ? <VolumeX aria-hidden="true" size={18} /> : <Volume2 aria-hidden="true" size={18} />}
          {sound === "off" ? "Suara mati" : sound === "chime" ? "Bunyi" : "Bunyi + baca"}
        </button>
        <button type="button" onClick={fullscreen}>
          <Maximize aria-hidden="true" size={18} /> Layar penuh
        </button>
      </div>
    </div>
  );
}

function spell(code: string) {
  return code.replace("T-", "T ").split("").join(" ");
}

function speak(text: string) {
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  } catch {}
}
