"use client";

import { useRef } from "react";
import Image from "next/image";
import { brand } from "@/data/brand";
import { SplitTitle } from "@/components/motion/SplitTitle";

const G = "/assets/tooday/gallery";

// Foto dokumentasi asli dari Tooday (bukan cutout olahan).
const PHOTOS = [
  { src: `${G}/buttertteok-box.webp`, w: 900, h: 1200, alt: "Foto asli: empat ButterTteok dalam kotak kuning di samping kantong kertas berlabel Tooday" },
  { src: `${G}/matcha-latte.webp`, w: 900, h: 1200, alt: "Foto asli: matcha latte Tooday di latar hijau zaitun" },
  { src: "/assets/tooday/editorial/brand-collage-original.webp", w: 1254, h: 1254, alt: "Materi promosi Tooday: tujuh cup minuman dan ButterTteok di latar hijau" },
  { src: `${G}/fruitpunch-yakult.webp`, w: 900, h: 1200, alt: "Foto asli: fruitpunch Yakult Tooday berwarna merah muda" },
  { src: `${G}/americano.webp`, w: 900, h: 1200, alt: "Foto asli: americano dingin Tooday" },
  { src: `${G}/mango-yakult.webp`, w: 900, h: 1200, alt: "Foto asli: mango Yakult Tooday berwarna kuning" },
  { src: `${G}/dark-choco.webp`, w: 900, h: 1200, alt: "Foto asli: minuman cokelat gelap Tooday" },
];

/** Strip foto yang bisa digeser dengan drag, wheel/trackpad, sentuhan, atau keyboard. */
export function Gallery() {
  const ref = useRef<HTMLUListElement>(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });

  function onPointerDown(event: React.PointerEvent<HTMLUListElement>) {
    if (event.pointerType !== "mouse" || !ref.current) return;
    drag.current = { active: true, startX: event.clientX, startScroll: ref.current.scrollLeft, moved: false };
    ref.current.setPointerCapture(event.pointerId);
    ref.current.classList.add("is-dragging");
  }

  function onPointerMove(event: React.PointerEvent<HTMLUListElement>) {
    if (!drag.current.active || !ref.current) return;
    ref.current.scrollLeft = drag.current.startScroll - (event.clientX - drag.current.startX);
  }

  function onPointerUp(event: React.PointerEvent<HTMLUListElement>) {
    if (!drag.current.active || !ref.current) return;
    drag.current.active = false;
    ref.current.releasePointerCapture(event.pointerId);
    ref.current.classList.remove("is-dragging");
  }

  return (
    <section className="gallery" aria-labelledby="gallery-title">
      <div className="gallery-head">
        <SplitTitle id="gallery-title" className="display-md" text="Tooday, apa adanya." />
        <p data-reveal>
          Foto dan materi asli dari Tooday. Geser untuk melihat semuanya, lalu intip kabar terbaru di{" "}
          <a href={brand.instagramUrl} target="_blank" rel="noreferrer" className="inline-link">
            {brand.instagramHandle}
          </a>
          .
        </p>
      </div>

      <ul
        ref={ref}
        className="gallery-strip"
        tabIndex={0}
        aria-label="Galeri foto Tooday, bisa digeser"
        data-lenis-prevent-touch
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {PHOTOS.map((photo, index) => (
          <li key={photo.src} className="gallery-item" data-reveal="pop" style={{ transitionDelay: `${index * 60}ms` }}>
            <Image src={photo.src} alt={photo.alt} width={photo.w} height={photo.h} sizes="(min-width: 1024px) 24vw, 62vw" draggable={false} />
          </li>
        ))}
      </ul>
    </section>
  );
}
