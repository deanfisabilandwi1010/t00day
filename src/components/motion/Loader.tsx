"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { brand } from "@/data/brand";
import { lockScroll, ScrollTrigger, unlockScroll } from "@/lib/motion";
import { SplitTitle } from "@/components/motion/SplitTitle";
import { Doodle } from "@/components/ui/Doodle";
import { Mascot } from "@/components/ui/Mascot";

/** Kunci sessionStorage; harus sama dengan skrip inline di layout. */
const SEEN_KEY = "tooday-intro";
const MIN_MS = 1700;
const MAX_WAIT_MS = 2600;
/** Durasi keluar: konten mengecil (350 ms) lalu sapuan coretan (950 ms). */
const EXIT_MS = 1300;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Layar pembuka sekali per sesi. Tampil lewat kelas html.is-loading yang dipasang
 * skrip inline di layout (sebelum paint), jadi tidak berkedip dan tidak muncul
 * tanpa JS atau pada reduced-motion. Klik atau tombol apa pun melewatinya.
 */
export function Loader() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const element = ref.current;
    if (!element || !root.classList.contains("is-loading")) return;

    lockScroll();
    let leaving = false;
    let timer = 0;

    const leave = () => {
      if (leaving) return;
      leaving = true;
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        // Penyimpanan diblokir: intro hanya akan tampil lagi di kunjungan berikutnya.
      }
      element.classList.add("is-leaving");
      // Hero mulai beranimasi saat sapuan baru berjalan, bukan setelah selesai.
      window.setTimeout(() => root.classList.add("is-revealing"), 450);
      timer = window.setTimeout(() => {
        root.classList.remove("is-loading", "is-revealing");
        unlockScroll();
        ScrollTrigger.refresh();
      }, EXIT_MS);
    };

    const pageReady = new Promise<void>((resolve) => {
      if (document.readyState === "complete") resolve();
      else window.addEventListener("load", () => resolve(), { once: true });
    });
    const ready = Promise.race([Promise.all([document.fonts.ready, pageReady]), wait(Math.max(0, MAX_WAIT_MS - performance.now()))]);
    // Durasi minimum dihitung sejak halaman dibuka, bukan sejak hydration.
    Promise.all([wait(Math.max(0, MIN_MS - performance.now())), ready]).then(leave);

    element.addEventListener("click", leave);
    window.addEventListener("keydown", leave);
    return () => {
      element.removeEventListener("click", leave);
      window.removeEventListener("keydown", leave);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div ref={ref} className="loader">
      <div className="loader-fill" />
      <svg className="loader-scribble" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-10 5 110-5-10 30 110 20-10 55 110 45-10 80 110 70-10 105 110 95" pathLength={1} />
      </svg>

      <p className="sr-only" role="status">
        Memuat Tooday. Tekan tombol apa saja untuk melewati.
      </p>

      <div className="loader-decor" aria-hidden="true">
        <div className="patch loader-patch--a" />
        <div className="patch loader-patch--b" />
        <Mascot name="girl-head" reveal="now" className="loader-peek loader-peek--girl" sizes="170px" />
        <Mascot name="boy-peeking" reveal="now" className="loader-peek loader-peek--boy" sizes="190px" />
        <Doodle shape="loop" className="loader-doodle--a" />
        <Doodle shape="spark" className="loader-doodle--b" />
        <Doodle shape="swirl" className="loader-doodle--c" />
        <Doodle shape="cloud" className="loader-doodle--d" />
      </div>

      <div className="loader-content" aria-hidden="true">
        <Mascot name="boy-with-cup" reveal="now" className="loader-mascot" sizes="300px" />
        <div className="loader-dots">
          {[0, 1, 2].map((index) => (
            <Image
              key={index}
              src="/assets/tooday/decor/buttertteok-floating.webp"
              alt=""
              width={1312}
              height={1199}
              sizes="72px"
              loading="eager"
              style={{ animationDelay: `${index * 130}ms` }}
            />
          ))}
        </div>
        <SplitTitle as="p" immediate className="loader-title" text={brand.tagline} />
        <p className="loader-caption">Sebentar ya, lagi disiapin…</p>
      </div>
    </div>
  );
}
