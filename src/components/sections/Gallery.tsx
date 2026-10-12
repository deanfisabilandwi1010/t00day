"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Image from "next/image";
import { brand } from "@/data/brand";
import { gsap, MQ } from "@/lib/motion";
import { SplitTitle } from "@/components/motion/SplitTitle";
import { Doodle } from "@/components/ui/Doodle";
import { Mascot } from "@/components/ui/Mascot";

const G = "/assets/tooday/gallery";
const A = "/assets/tooday";

type Card = { caption: string } & (
  | { kind: "photo"; src: string; w: number; h: number; alt: string }
  | { kind: "slogan" | "pairing" | "handle" }
);

// Foto dokumentasi dan materi asli Tooday, diselingi kartu merek. Semua tampil sebagai polaroid berukuran sama.
const CARDS: Card[] = [
  { kind: "photo", caption: "Outlet Tooday", src: `${A}/editorial/storefront-original.webp`, w: 1200, h: 1600, alt: "Foto asli: tampak depan outlet Tooday Coffee di malam hari dengan tiga bangku merah" },
  { kind: "photo", caption: "Matcha Latte", src: `${G}/matcha-latte.webp`, w: 900, h: 1200, alt: "Foto asli: matcha latte Tooday di latar hijau zaitun" },
  { kind: "photo", caption: "Poster ButterTteok", src: `${A}/editorial/buttertteok-poster-original.webp`, w: 1132, h: 1600, alt: "Poster Tooday: tumpukan ButterTteok di latar merah dengan tulisan Butter Tteok" },
  { kind: "slogan", caption: "Halo dari Tooday!" },
  { kind: "photo", caption: "ButterTteok, 4 pcs", src: `${G}/buttertteok-box.webp`, w: 900, h: 1200, alt: "Foto asli: empat ButterTteok dalam kotak kuning di samping kantong kertas berlabel Tooday" },
  { kind: "photo", caption: "Semua kumpul", src: `${A}/editorial/brand-collage-original.webp`, w: 1254, h: 1254, alt: "Materi promosi Tooday: tujuh cup minuman dan ButterTteok di latar hijau" },
  { kind: "photo", caption: "Fruitpunch Yakult", src: `${G}/fruitpunch-yakult.webp`, w: 900, h: 1200, alt: "Foto asli: fruitpunch Yakult Tooday berwarna merah muda" },
  { kind: "pairing", caption: "Teman ngopi" },
  { kind: "photo", caption: "Americano", src: `${G}/americano.webp`, w: 900, h: 1200, alt: "Foto asli: americano dingin Tooday" },
  { kind: "photo", caption: "Mango Yakult", src: `${G}/mango-yakult.webp`, w: 900, h: 1200, alt: "Foto asli: mango Yakult Tooday berwarna kuning" },
  { kind: "handle", caption: "Sampai ketemu!" },
  { kind: "photo", caption: "Dark Choco", src: `${G}/dark-choco.webp`, w: 900, h: 1200, alt: "Foto asli: minuman cokelat gelap Tooday" },
];

// Kemiringan tiap polaroid di tali, berulang.
const TILTS = [-3, 2, -1.5, 3, -2.5, 1.5];

/** Kecepatan dasar strip dalam px per detik. */
const SPEED = 46;

function CardView({ card }: { card: Card }) {
  const size = "(min-width: 1024px) 22vw, 56vw";

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
 * Jemuran polaroid: foto berukuran sama dijepit di tali, berjalan sendiri, bisa diseret,
 * dan berbalik arah mengikuti arah scroll halaman. Tanpa JS atau pada reduced-motion,
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
      // -1 = ke kiri (scroll turun), 1 = ke kanan (scroll naik).
      let direction = -1;
      let lastScroll = window.scrollY;

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
        velocity += ((paused ? 0 : SPEED * direction) - velocity) * 0.08;
        if (Math.abs(velocity) < 0.05) return;
        x += velocity * (deltaMs / 1000);
        wrap();
        setX(x);
      };
      gsap.ticker.add(tick);

      const observer = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { rootMargin: "20% 0px" });
      observer.observe(viewport);

      // Scroll halaman ikut mendorong jemuran dan menentukan arah jalannya.
      const onScroll = () => {
        const delta = window.scrollY - lastScroll;
        lastScroll = window.scrollY;
        if (!delta) return;
        direction = delta > 0 ? -1 : 1;
        if (!visible || drag) return;
        x -= Math.max(-120, Math.min(120, delta)) * 0.3;
        wrap();
        setX(x);
      };
      window.addEventListener("scroll", onScroll, { passive: true });

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
        window.removeEventListener("scroll", onScroll);
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
        <li
          key={index}
          className="polaroid"
          style={{ "--tilt": `${TILTS[index % TILTS.length]}deg`, "--delay": `${(index % 5) * -0.7}s` } as CSSProperties}
        >
          <span className="polaroid-pin" aria-hidden="true" />
          <div className="polaroid-swing">
            <div className="polaroid-photo">
              <CardView card={card} />
            </div>
            <p className="polaroid-caption">{card.caption}</p>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="gallery" aria-labelledby="gallery-title">
      <div className="gallery-head">
        <SplitTitle id="gallery-title" className="display-md" drift={70} text="Tooday, apa adanya." />
        <p data-reveal="right">
          Foto dan materi asli dari Tooday, dijepit satu-satu di tali. Seret untuk melihat lebih cepat, lalu
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
