import Image from "next/image";
import { brand } from "@/data/brand";
import { MotionToggle } from "@/components/ui/MotionToggle";

const LINKS = [
  { href: "#menu", label: "Menu" },
  { href: "#cerita", label: "Cerita" },
  { href: "#pairing", label: "Saran menikmati" },
];

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <div className="patch footer-patch" aria-hidden="true" />
          <a href="#top" className="footer-logo" aria-label="Tooday, kembali ke atas">
            <Image src={brand.logo.src} alt={brand.logo.alt} width={brand.logo.width} height={brand.logo.height} sizes="260px" />
          </a>
          <div className="patch footer-patch" aria-hidden="true" />
        </div>

        <nav aria-label="Navigasi footer">
          <ul className="footer-links">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="nav-link">
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a href={brand.instagramUrl} target="_blank" rel="noreferrer" className="nav-link">
                {brand.instagramHandle}
                <span className="sr-only"> di Instagram (tab baru)</span>
              </a>
            </li>
          </ul>
        </nav>

        <div className="footer-bottom">
          <p>© {brand.name}. Harga mengikuti papan menu dan dapat berubah.</p>
          <p>Gambar produk potongan dan komposisi adalah visual olahan dari foto Tooday.</p>
          <MotionToggle />
        </div>
      </div>
    </footer>
  );
}
