"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap, MQ } from "@/lib/motion";
import { SplitTitle } from "@/components/motion/SplitTitle";
import { Doodle } from "@/components/ui/Doodle";
import { Mascot } from "@/components/ui/Mascot";
import { PillLink } from "@/components/ui/Pill";

export function Hero() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const mm = gsap.matchMedia();

    // Saat scroll: produk membesar pelan dan teks menjauh.
    mm.add(`${MQ.motionOk} and ${MQ.desktop}`, () => {
      gsap
        .timeline({
          defaults: { ease: "none" },
          scrollTrigger: { trigger: section, start: "top top", end: "bottom top", scrub: true },
        })
        .to("[data-hero-product]", { scale: 1.1, yPercent: 5 }, 0)
        .to("[data-hero-copy]", { yPercent: -12, opacity: 0.3 }, 0);
    }, section);

    // Maskot, checker, dan coretan mengikuti pointer dengan kedalaman berbeda.
    mm.add(`${MQ.motionOk} and ${MQ.finePointer}`, () => {
      const layers = gsap.utils.toArray<HTMLElement>("[data-depth]", section).map((element) => ({
        depth: Number(element.dataset.depth),
        x: gsap.quickTo(element, "x", { duration: 0.9, ease: "power3.out" }),
        y: gsap.quickTo(element, "y", { duration: 0.9, ease: "power3.out" }),
      }));

      const onMove = (event: PointerEvent) => {
        const rect = section.getBoundingClientRect();
        const nx = (event.clientX - rect.left) / rect.width - 0.5;
        const ny = (event.clientY - rect.top) / rect.height - 0.5;
        layers.forEach((layer) => {
          layer.x(nx * layer.depth);
          layer.y(ny * layer.depth);
        });
      };
      section.addEventListener("pointermove", onMove);
      return () => section.removeEventListener("pointermove", onMove);
    }, section);

    return () => mm.revert();
  }, []);

  return (
    <section id="top" ref={ref} className="hero" aria-labelledby="hero-title">
      <div className="hero-inner">
        <div className="hero-copy" data-hero-copy>
          <p className="eyebrow hero-in" style={{ animationDelay: "80ms" }}>
            Tooday House
          </p>
          <SplitTitle as="h1" id="hero-title" immediate className="hero-title" text={"Make\nevery day,\ntooday!"} />
          <p className="hero-sub hero-in" style={{ animationDelay: "520ms" }}>
            Kopi, matcha, dan ButterTteok untuk hari-hari yang lebih seru.
          </p>
          <div className="hero-cta hero-in" style={{ animationDelay: "620ms" }}>
            <PillLink href="#menu">Jelajahi Menu</PillLink>
            <a href="#cerita" className="text-link">
              Kenalan dengan Tooday
            </a>
            <Doodle shape="loop" className="hero-doodle-cta" />
          </div>
        </div>

        <div className="hero-visual">
          <div className="patch hero-patch--a" data-depth="18" />
          <div className="patch hero-patch--b" data-depth="-14" />

          <div className="hero-layer hero-layer--boy" data-depth="26">
            <Mascot name="boy-head" reveal="now" sizes="(min-width: 1024px) 150px, 84px" />
          </div>
          <div className="hero-layer hero-layer--girl" data-depth="-22">
            <Mascot name="girl-head" reveal="now" sizes="(min-width: 1024px) 160px, 88px" />
          </div>

          <div className="hero-product hero-pop">
            <div data-hero-product>
              <div data-depth="-8">
                <Image
                  src="/assets/tooday/addons/pairing-coffee-matcha-buttertteok.webp"
                  alt="Kopi susu dan matcha latte Tooday mengapit sekotak berisi empat ButterTteok"
                  width={1536}
                  height={1024}
                  sizes="(min-width: 1024px) 56vw, 100vw"
                  preload
                  className="floaty floaty--slow"
                />
              </div>
            </div>
          </div>

          <p className="hero-note hero-in" style={{ animationDelay: "900ms" }} data-depth="12">
            Good Coffee
            <br />
            Good Day
          </p>
          <Doodle shape="spark" className="hero-doodle-spark" />
          <Doodle shape="swirl" className="hero-doodle-swirl" />
        </div>
      </div>
    </section>
  );
}
