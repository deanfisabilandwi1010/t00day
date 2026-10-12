"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap, MQ } from "@/lib/motion";

interface ParallaxProps {
  children: ReactNode;
  className?: string;
  /** Pergeseran vertikal total dalam px selama elemen melintasi viewport. */
  distance?: number;
  rotate?: number;
  /** Skala akhir; gambar dalam bingkai butuh > 1 agar tepinya tidak terlihat. */
  scaleTo?: number;
}

/** Parallax ringan khusus desktop. Di touch dan reduced-motion elemen diam. */
export function Parallax({ children, className = "", distance = 40, rotate = 0, scaleTo }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const mm = gsap.matchMedia();

    mm.add(`${MQ.motionOk} and ${MQ.desktop}`, () => {
      gsap.fromTo(
        element,
        { y: distance / 2, rotate: -rotate / 2, scale: scaleTo ? 1 : undefined },
        {
          y: -distance / 2,
          rotate: rotate / 2,
          scale: scaleTo,
          ease: "none",
          scrollTrigger: { trigger: element.parentElement, start: "top bottom", end: "bottom top", scrub: true },
        },
      );
    });

    return () => mm.revert();
  }, [distance, rotate, scaleTo]);

  return (
    <div ref={ref} className={`will-change-transform ${className}`}>
      {children}
    </div>
  );
}
