"use client";

import { useEffect } from "react";
import { gsap, MQ } from "@/lib/motion";

/**
 * Elemen ber-atribut data-drift="<px>" bergeser menyamping mengikuti scroll:
 * nilai positif bergerak ke kanan saat halaman turun, negatif ke kiri.
 */
export function DriftObserver() {
  useEffect(() => {
    const mm = gsap.matchMedia();

    mm.add(MQ.motionOk, () => {
      // Di layar sempit jaraknya dikecilkan agar teks tidak keluar dari tepi.
      const scale = window.matchMedia(MQ.desktop).matches ? 1 : 0.4;
      gsap.utils.toArray<HTMLElement>("[data-drift]").forEach((element) => {
        const distance = Number(element.dataset.drift) * scale;
        gsap.fromTo(
          element,
          { x: -distance / 2 },
          {
            x: distance / 2,
            ease: "none",
            scrollTrigger: { trigger: element, start: "top bottom", end: "bottom top", scrub: true },
          },
        );
      });
    });

    return () => mm.revert();
  }, []);

  return null;
}
