import Image from "next/image";

const MASCOTS = {
  "boy-head": { width: 800, height: 667 },
  "boy-peeking": { width: 800, height: 533 },
  "boy-with-cup": { width: 800, height: 800 },
  "girl-head": { width: 800, height: 728 },
  "boy-pointing": { width: 800, height: 800 },
} as const;

interface MascotProps {
  name: keyof typeof MASCOTS;
  className?: string;
  sizes?: string;
  /** "peek" muncul dari bawah saat terlihat; "now" tampil dengan animasi load (hero). */
  reveal?: "peek" | "now";
}

/** Karakter Tooday dari aset addons. Murni dekoratif, jadi alt kosong. */
export function Mascot({ name, className = "", sizes = "200px", reveal = "peek" }: MascotProps) {
  const { width, height } = MASCOTS[name];

  return (
    <div
      className={`mascot ${reveal === "now" ? "mascot--now" : ""} ${className}`}
      aria-hidden="true"
      {...(reveal === "peek" ? { "data-reveal": "peek" } : {})}
    >
      <Image src={`/assets/tooday/addons/mascot-${name}.webp`} alt="" width={width} height={height} sizes={sizes} />
    </div>
  );
}
