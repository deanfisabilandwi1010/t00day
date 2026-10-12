"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap, MQ, ScrollTrigger, setLenis } from "@/lib/motion";

/**
 * Smooth scroll hanya untuk pointer presisi tanpa reduced-motion.
 * Perangkat sentuh tetap memakai scroll native.
 */
export function SmoothScroll() {
  useEffect(() => {
    const mm = gsap.matchMedia();

    mm.add(`${MQ.motionOk} and ${MQ.finePointer}`, () => {
      const lenis = new Lenis({
        lerp: 0.1,
        smoothWheel: true,
        syncTouch: false,
        anchors: true,
      });
      setLenis(lenis);

      const onScroll = () => ScrollTrigger.update();
      const raf = (time: number) => lenis.raf(time * 1000);
      lenis.on("scroll", onScroll);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);

      return () => {
        gsap.ticker.remove(raf);
        lenis.destroy();
        setLenis(null);
      };
    });

    return () => mm.revert();
  }, []);

  return null;
}
