"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";

/** Menjeda semua animasi berulang (marquee, floating) lewat atribut di <html>. */
export function MotionToggle() {
  const [paused, setPaused] = useState(false);

  function toggle() {
    const next = !paused;
    setPaused(next);
    if (next) document.documentElement.dataset.motion = "paused";
    else delete document.documentElement.dataset.motion;
  }

  return (
    <button type="button" className="motion-toggle" onClick={toggle} aria-pressed={paused}>
      {paused ? <Play aria-hidden="true" size={13} /> : <Pause aria-hidden="true" size={13} />}
      <span>{paused ? "Lanjutkan animasi" : "Jeda animasi"}</span>
    </button>
  );
}
