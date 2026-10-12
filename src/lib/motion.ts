"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

export const MQ = {
  motionOk: "(prefers-reduced-motion: no-preference)",
  desktop: "(min-width: 1024px)",
  finePointer: "(hover: hover) and (pointer: fine)",
} as const;

// Satu instance Lenis untuk seluruh halaman; null di perangkat sentuh dan reduced-motion.
let lenis: Lenis | null = null;

export function setLenis(instance: Lenis | null) {
  lenis = instance;
}

let locks = 0;

/** Kunci scroll halaman selama dialog/drawer terbuka. */
export function lockScroll() {
  locks += 1;
  document.documentElement.style.overflow = "hidden";
  lenis?.stop();
}

export function unlockScroll() {
  locks = Math.max(0, locks - 1);
  if (locks > 0) return;
  document.documentElement.style.overflow = "";
  lenis?.start();
}

export function scrollToTarget(target: string | HTMLElement | number) {
  if (lenis) {
    lenis.scrollTo(target, { offset: 0 });
    return;
  }
  const reduced = !window.matchMedia(MQ.motionOk).matches;
  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
  if (typeof target === "number") {
    window.scrollTo({ top: target, behavior });
    return;
  }
  const element = typeof target === "string" ? document.querySelector(target) : target;
  element?.scrollIntoView({ behavior, block: "start" });
}
