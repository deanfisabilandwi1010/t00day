"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { brand } from "@/data/brand";
import { gsap, MQ } from "@/lib/motion";
import { SplitTitle } from "@/components/motion/SplitTitle";
import { Doodle } from "@/components/ui/Doodle";
import { Mascot } from "@/components/ui/Mascot";

const G = "/assets/tooday/gallery";
const A = "/assets/tooday";

type Card =
  | { kind: "photo"; src: string; w: number; h: number; alt: string; tall?: boolean }
  | { kind: "slogan" | "pairing" | "handle"; tall?: boolean };

// Selang-seling foto dokumentasi asli dan kartu merek; kartu "tall" membuat ritme tinggi-rendah.
const CARDS: Card[] = [
  { kind: "photo", src: `${G}/matcha-latte.webp`, w: 900, h: 1200, alt: "Foto asli: matcha latte Tooday di latar hijau zaitun", tall: true },
  { kind: "photo", src: `${G}/buttertteok-box.webp`, w: 900, h: 1200, alt: "Foto asli: empat ButterTteok dalam kotak kuning di samping kantong kertas berlabel Tooday" },
  { kind: "slogan", tall: true },
  { kind: "photo", src: `${A}/editorial/brand-collage-original.webp`, w: 1254, h: 1254, alt: "Materi promosi Tooday: tujuh cup minuman dan ButterTteok di latar hijau" },
  { kind: "photo", src: `${A}/editorial/storefront-original.webp`, w: 1200, h: 1600, alt: "Foto asli: tampak depan outlet Tooday Coffee di malam hari", tall: true },
  { kind: "photo", src: `${G}/fruitpunch-yakult.webp`, w: 900, h: 1200, alt: "Foto asli: fruitpunch Yakult Tooday berwarna merah muda" },
  { kind: "pairing", tall: true },
  { kind: "photo", src: `${G}/americano.webp`, w: 900, h: 1200, alt: "Foto asli: americano dingin Tooday" },
  { kind: "photo", src: `${G}/mango-yakult.webp`, w: 900, h: 1200, alt: "Foto asli: mango Yakult Tooday berwarna kuning", tall: true },
  { kind: "handle" },
  { kind: "photo", src: `${G}/dark-choco.webp`, w: 900, h: 1200, alt: "Foto asli: minuman cokelat gelap Tooday", tall: true },
];

/** Kecepatan dasar strip dalam px per detik. */
const SPEED = 46;

function CardView({ card }: { card: Card }) {
  const size = "(min-width: 1024px) 26vw, 62vw";

  if (card.kind === "photo") {
    return <Image src={card.src} alt={card.alt} width={card.w} height={card.h} sizes={size} draggable={false} />;
  }
  if (card.kind === "slogan") {
    return (
      <div className="gcard gcard--red">
        <Doodle shape="cloud" className="gcard-doodle--cloud" />
        <p className="gcard-title">{brand.tagline}</p>
        <Mascot name="boy-with-cup" reveal="now" className="gcard-mascot" sizes="220px" />
      </div>
    );
  }
  if (card.kind === "pairing") {
    return (
      <div className="gcard gcard--olive">
        <p className="gcard-title">
          Good Coffee
          <br />
          Good Day
        </p>
        <Doodle shape="loop" className="gcard-doodle--loop" />
        <Image
          src={`${A}/addons/pairing-matcha-buttertteok-stack.webp`}
          alt="Matcha latte Tooday di samping tumpukan ButterTteok"
          width={1536}
          height={1024}
          sizes="(min-width: 1024px) 34vw, 80vw"
          draggable={false}
          className="gcard-product"
        />
      </div>
    );
  }
  return (
    <div className="gcard gcard--yellow">
      <div className="patch gcard-patch" />
      <Mascot name="girl-head" reveal="now" className="gcard-mascot gcard-mascot--center" sizes="200px" />
      <p className="gcard-handle">{brand.instagramHandle}</p>
    </div>
  );
}

/**
 * Strip galeri yang berjalan sendiri dan bisa diseret. Tanpa JS atau pada reduced-motion,
 * strip menjadi daftar yang digulir manual (kelas .is-live tidak pernah terpasang).
 */
export function Gallery() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const mm = gsap.matchMedia();

    mm.add(MQ.motionOk, () => {
      viewport.classList.add("is-live");
      const setX = gsap.quickSetter(track, "x", "px");
      let x = 0;
      let visible = false;
      let hovering = false;
      let drag: { id: number; lastX: number } | null = null;
      // Kecepatan mengejar target dengan halus agar berhenti/jalan tidak mendadak.
      let velocity = -SPEED;

      const half = () => track.scrollWidth / 2;
      const wrap = () => {
        const width = half();
        if (!width) return;
        if (x <= -width) x += width;
        else if (x > 0) x -= width;
      };

      const tick = (_time: number, deltaMs: number) => {
        if (!visible || drag) return;
        const paused = hovering || document.documentElement.dataset.motion === "paused";
        velocity += ((paused ? 0 : -SPEED) - velocity) * 0.08;
        if (Math.abs(velocity) < 0.05) return;
        x += velocity * (deltaMs / 1000);
        wrap();
        setX(x);
      };
      gsap.ticker.add(tick);

      const observer = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { rootMargin: "20% 0px" });
      observer.observe(viewport);

      const onEnter = (event: PointerEvent) => {
        if (event.pointerType === "mouse") hovering = true;
      };
      const onLeave = () => (hovering = false);
      const onDown = (event: PointerEvent) => {
        drag = { id: event.pointerId, lastX: event.clientX };
        viewport.classList.add("is-dragging");
      };
      const onMove = (event: PointerEvent) => {
        if (!drag || event.pointerId !== drag.id) return;
        x += event.clientX - drag.lastX;
        drag.lastX = event.clientX;
        wrap();
        setX(x);
      };
      const onUp = (event: PointerEvent) => {
        if (!drag || event.pointerId !== drag.id) return;
        drag = null;
        velocity = 0;
        viewport.classList.remove("is-dragging");
      };

      viewport.addEventListener("pointerenter", onEnter);
      viewport.addEventListener("pointerleave", onLeave);
      viewport.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);

      return () => {
        gsap.ticker.remove(tick);
        observer.disconnect();
        viewport.removeEventListener("pointerenter", onEnter);
        viewport.removeEventListener("pointerleave", onLeave);
        viewport.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        viewport.classList.remove("is-live", "is-dragging");
        gsap.set(track, { clearProps: "transform" });
      };
    });

    return () => mm.revert();
  }, []);

  const group = (hidden: boolean) => (
    <ul className="gallery-group" aria-hidden={hidden || undefined}>
      {CARDS.map((card, index) => (
        <li key={index} className={`gallery-item ${card.tall ? "gallery-item--tall" : ""}`}>
          <CardView card={card} />
        </li>
      ))}
    </ul>
  );

  return (
    <section className="gallery" aria-labelledby="gallery-title">
      <div className="gallery-head">
        <SplitTitle id="gallery-title" className="display-md" text="Tooday, apa adanya." />
        <p data-reveal>
          Foto dan materi asli dari Tooday, diselingi sapaan dari maskotnya. Seret untuk melihat lebih cepat, lalu
          intip kabar terbaru di{" "}
          <a href={brand.instagramUrl} target="_blank" rel="noreferrer" className="inline-link">
            {brand.instagramHandle}
          </a>
          .
        </p>
      </div>

      <div ref={viewportRef} className="gallery-viewport" tabIndex={0} role="group" aria-label="Galeri foto Tooday">
        <div ref={trackRef} className="gallery-track">
          {group(false)}
          {group(true)}
        </div>
      </div>
    </section>
  );
}
