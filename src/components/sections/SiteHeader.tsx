"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AtSign, Menu as MenuIcon, ShoppingBag } from "lucide-react";
import { brand } from "@/data/brand";
import { scrollToTarget } from "@/lib/motion";
import { ORDER_TOGGLE_ID, useOrder } from "@/components/order/OrderProvider";
import { PillLink } from "@/components/ui/Pill";
import { Sheet } from "@/components/ui/Sheet";

const LINKS = [
  { href: "#menu", label: "Menu" },
  { href: "#cerita", label: "Cerita" },
  { href: "#pairing", label: "Saran menikmati" },
];

export function SiteHeader() {
  const { count, openList } = useOrder();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function goFromDrawer(href: string) {
    setMenuOpen(false);
    // Tunggu panel tertutup dan scroll terbuka kembali.
    window.setTimeout(() => scrollToTarget(href), 260);
  }

  return (
    <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
      <div className="site-header-inner">
        <a href="#top" className="site-logo" aria-label="Tooday, kembali ke atas">
          <Image src={brand.logo.src} alt={brand.logo.alt} width={brand.logo.width} height={brand.logo.height} sizes="130px" preload />
        </a>

        <nav className="site-nav" aria-label="Navigasi utama">
          <ul>
            {LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="nav-link">
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a href={brand.instagramUrl} target="_blank" rel="noreferrer" className="nav-link">
                Instagram
                <span className="sr-only"> (tab baru)</span>
              </a>
            </li>
          </ul>
        </nav>

        <div className="site-actions">
          <button type="button" id={ORDER_TOGGLE_ID} className="order-toggle" onClick={openList} aria-haspopup="dialog">
            <ShoppingBag aria-hidden="true" size={18} />
            <span className="order-toggle-label">Pilihanku</span>
            <span className="order-count" aria-label={`${count} item`}>
              {count}
            </span>
          </button>
          <PillLink href="#menu" className="site-cta">
            Jelajahi Menu
          </PillLink>
          <button
            type="button"
            className="icon-btn site-burger"
            onClick={() => setMenuOpen(true)}
            aria-haspopup="dialog"
            aria-label="Buka navigasi"
          >
            <MenuIcon aria-hidden="true" size={20} />
          </button>
        </div>
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} labelledBy="mobile-nav-title" className="sheet--nav">
        <nav aria-labelledby="mobile-nav-title" className="mobile-nav">
          <p id="mobile-nav-title" className="eyebrow">
            Navigasi
          </p>
          <ul>
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={(event) => {
                    event.preventDefault();
                    goFromDrawer(link.href);
                  }}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <a href={brand.instagramUrl} target="_blank" rel="noreferrer" className="mobile-nav-ig">
            <AtSign aria-hidden="true" size={18} /> {brand.instagramHandle}
          </a>
        </nav>
      </Sheet>
    </header>
  );
}
