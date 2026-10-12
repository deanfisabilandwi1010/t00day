import type { CSSProperties, ReactNode } from "react";

interface MarqueeProps {
  children: ReactNode;
  className?: string;
  /** Detik untuk satu putaran penuh. */
  duration?: number;
  reverse?: boolean;
  /** Jumlah pengulangan isi dalam satu salinan agar strip selalu penuh. */
  repeat?: number;
}

/**
 * Marquee CSS murni. Salinan kedua disembunyikan dari screen reader,
 * dan animasi berhenti pada reduced-motion atau saat pengunjung menjeda motion.
 */
export function Marquee({ children, className = "", duration = 40, reverse = false, repeat = 4 }: MarqueeProps) {
  const style = { "--marquee-duration": `${duration}s` } as CSSProperties;
  const group = (hidden: boolean) => (
    <div className="marquee-group" aria-hidden={hidden || undefined}>
      {Array.from({ length: repeat }, (_, index) => (
        <div key={index} className="marquee-item" aria-hidden={index > 0 || undefined}>
          {children}
        </div>
      ))}
    </div>
  );

  return (
    <div className={`marquee ${reverse ? "marquee--reverse" : ""} ${className}`} style={style}>
      <div className="marquee-track">
        {group(false)}
        {group(true)}
      </div>
    </div>
  );
}
