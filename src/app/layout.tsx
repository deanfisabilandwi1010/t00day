import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { DM_Sans, Fredoka } from "next/font/google";
import "lenis/dist/lenis.css";
import "./globals.css";

// Fredoka: display membulat yang senada dengan huruf logo. DM Sans: teks menu dan harga.
const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tooday — Kopi, Matcha & ButterTteok",
  description:
    "Jeda kecil, nikmatnya terasa. Lihat menu Tooday: kopi, matcha, minuman non-coffee, dan ButterTteok. Make every day, tooday!",
  openGraph: {
    title: "Tooday — Kopi, Matcha & ButterTteok",
    description: "Kopi, matcha, minuman favorit, dan ButterTteok untuk menemani harimu.",
    locale: "id_ID",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#3C4A26",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={`${fredoka.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        {/* Menandai JS aktif sebelum paint, agar state awal animasi tidak berkedip dan konten tetap tampil tanpa JS. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js');setTimeout(function(){if(!window.__toodayReveal)document.documentElement.classList.remove('js')},4000)" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
