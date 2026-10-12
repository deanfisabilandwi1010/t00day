"use client";

import { useEffect } from "react";

/**
 * Menandai elemen [data-reveal] dengan .is-in saat pertama kali terlihat.
 * State tersembunyi hanya berlaku di bawah html.js, jadi konten tetap terbaca tanpa JS.
 */
export function RevealObserver() {
  useEffect(() => {
    // Memberi tahu skrip failsafe di layout bahwa observer berjalan.
    (window as Window & { __toodayReveal?: boolean }).__toodayReveal = true;
    const elements = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return null;
}
