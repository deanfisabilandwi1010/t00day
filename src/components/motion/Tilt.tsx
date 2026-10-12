"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap, MQ } from "@/lib/motion";

interface TiltProps {
  children: ReactNode;
  className?: string;
  /** Kemiringan maksimum dalam derajat. */
  max?: number;
}

/** Memiringkan isi mengikuti pointer. Hanya untuk pointer presisi tanpa reduced-motion. */
export function Tilt({ children, className = "", max = 7 }: TiltProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const mm = gsap.matchMedia();

    mm.add(`${MQ.motionOk} and ${MQ.finePointer}`, () => {
      const inner = element.firstElementChild;
      if (!inner) return;
      const rotateX = gsap.quickTo(inner, "rotationX", { duration: 0.6, ease: "power3.out" });
      const rotateY = gsap.quickTo(inner, "rotationY", { duration: 0.6, ease: "power3.out" });

      const onMove = (event: PointerEvent) => {
        const rect = element.getBoundingClientRect();
        rotateY(((event.clientX - rect.left) / rect.width - 0.5) * max * 2);
        rotateX(((event.clientY - rect.top) / rect.height - 0.5) * -max * 2);
      };
      const onLeave = () => {
        rotateX(0);
        rotateY(0);
      };
      element.addEventListener("pointermove", onMove);
      element.addEventListener("pointerleave", onLeave);
      return () => {
        element.removeEventListener("pointermove", onMove);
        element.removeEventListener("pointerleave", onLeave);
      };
    });

    return () => mm.revert();
  }, [max]);

  return (
    <div ref={ref} className={`tilt ${className}`}>
      <div className="tilt-inner">{children}</div>
    </div>
  );
}
