type Shape = "squiggle" | "loop" | "spark" | "swirl" | "cloud" | "burst";

const SHAPES: Record<Shape, { viewBox: string; paths: string[]; filled?: boolean }> = {
  squiggle: {
    viewBox: "0 0 120 80",
    paths: ["M8 62c14-28 40-46 56-32 13 12-5 31-19 22-15-10 7-40 35-43 13-1 23 3 32 10"],
  },
  loop: {
    viewBox: "0 0 140 90",
    paths: ["M8 74c20 6 44-6 52-26 7-18-4-34-17-28-14 7-8 34 16 36 26 2 50-16 72-44"],
  },
  spark: {
    viewBox: "0 0 70 60",
    paths: ["M8 50 26 38", "M30 10l7 22", "M60 12 50 32"],
  },
  swirl: {
    viewBox: "0 0 70 90",
    paths: ["M14 16c18-12 42 0 32 18-5 9-18 10-18 10s24-4 28 14c4 19-24 28-42 14"],
  },
  burst: {
    viewBox: "0 0 80 80",
    paths: ["M40 6v16", "M40 58v16", "M6 40h16", "M58 40h16", "M16 16l11 11", "M53 53l11 11", "M64 16 53 27", "M27 53 16 64"],
  },
  cloud: {
    viewBox: "0 0 130 80",
    filled: true,
    paths: ["M30 74a24 24 0 0 1 3-47 32 32 0 0 1 60-4 22 22 0 0 1 9 51z"],
  },
};

interface DoodleProps {
  shape: Shape;
  className?: string;
}

/**
 * Coretan dekoratif bergaya papan menu Tooday. Bentuk geometris sederhana,
 * bukan bagian logo. Garis "tergambar" saat masuk viewport (lihat .doodle di globals.css).
 */
export function Doodle({ shape, className = "" }: DoodleProps) {
  const { viewBox, paths, filled } = SHAPES[shape];

  return (
    <svg
      viewBox={viewBox}
      className={`doodle ${filled ? "doodle--filled" : ""} ${className}`}
      aria-hidden="true"
      focusable="false"
      data-reveal="draw"
    >
      {paths.map((d) => (
        <path key={d} d={d} pathLength={1} />
      ))}
    </svg>
  );
}
