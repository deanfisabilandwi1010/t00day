import type { CSSProperties, ElementType } from "react";

interface SplitTitleProps {
  text: string;
  as?: ElementType;
  className?: string;
  id?: string;
  /** Tanpa observer: animasi berjalan saat load (dipakai hero). */
  immediate?: boolean;
  /** Jarak geser menyamping (px) mengikuti scroll; lihat DriftObserver. */
  drift?: number;
}

/** Judul yang naik huruf demi huruf. Baris dipisah dengan "\n". Screen reader membaca aria-label utuh. */
export function SplitTitle({ text, as: Tag = "h2", className = "", id, immediate = false, drift }: SplitTitleProps) {
  const lines = text.split("\n").map((line) => line.split(" "));
  // Indeks huruf global menentukan jeda stagger.
  const offsets: number[][] = [];
  let total = 0;
  for (const words of lines) {
    const row: number[] = [];
    for (const word of words) {
      row.push(total);
      total += Array.from(word).length;
    }
    offsets.push(row);
  }

  return (
    <Tag
      id={id}
      aria-label={text.replace(/\n/g, " ")}
      className={`split ${immediate ? "split--now" : ""} ${className}`}
      {...(immediate ? {} : { "data-reveal": "" })}
      data-drift={drift}
    >
      <span aria-hidden="true">
        {lines.map((words, lineIndex) => (
          <span key={lineIndex} className="split-line">
            {words.map((word, wordIndex) => (
              <span key={wordIndex} className="split-word">
                {Array.from(word).map((char, charIndex) => (
                  <span
                    key={charIndex}
                    className="split-char"
                    style={{ "--i": offsets[lineIndex][wordIndex] + charIndex } as CSSProperties}
                  >
                    {char}
                  </span>
                ))}
              </span>
            ))}
          </span>
        ))}
      </span>
    </Tag>
  );
}
