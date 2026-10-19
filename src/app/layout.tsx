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
      <body>
        {/* Skrip awal: menandai JS aktif (kelas js) dan memasang is-loading untuk layar pembuka (sekali per
            sesi, hanya di beranda, tidak pada reduced-motion). Halaman pesan/kasir/antrean tidak memakai preloader. Berjalan sebelum isi body dilukis, jadi tidak berkedip.
            Bila bundel gagal berjalan dalam 4 detik, kedua kelas dilepas agar halaman tetap terbuka.
            SENGAJA di <body>, bukan <head>: host seperti Netlify menyisipkan komentar ke <head>, dan elemen
            React di sana lalu gagal hydration sehingga React merender ulang halaman dan menghapus kelas ini. */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: "var d=document.documentElement;d.classList.add('js');try{if(location.pathname==='/'&&!sessionStorage.getItem('tooday-intro')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)d.classList.add('is-loading')}catch(e){}setTimeout(function(){if(!window.__toodayReveal)d.classList.remove('js','is-loading')},4000)" }} />
        {children}
      </body>
    </html>
  );
}
