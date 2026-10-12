import { RevealObserver } from "@/components/motion/RevealObserver";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { OrderProvider } from "@/components/order/OrderProvider";
import { BrandStory } from "@/components/sections/BrandStory";
import { Featured } from "@/components/sections/Featured";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { Gallery } from "@/components/sections/Gallery";
import { Hero } from "@/components/sections/Hero";
import { MenuExplorer } from "@/components/sections/MenuExplorer";
import { PairingSection } from "@/components/sections/PairingSection";
import { SiteFooter } from "@/components/sections/SiteFooter";
import { SiteHeader } from "@/components/sections/SiteHeader";
import { Marquee } from "@/components/ui/Marquee";

// Kata pita: kategori dari papan menu, plus frasa penutup dari arah desain pemilik.
const RIBBON = ["Coffee", "Matcha", "Butter Tteok", "Goood Days"];

export default function Home() {
  return (
    <OrderProvider>
      <SmoothScroll />
      <RevealObserver />
      <a href="#main" className="skip-link">
        Lewati ke konten
      </a>
      <SiteHeader />
      <main id="main">
        <Hero />
        <Marquee className="ribbon" duration={32} repeat={4}>
          <ul className="ribbon-list">
            {RIBBON.map((word) => (
              <li key={word}>{word}</li>
            ))}
          </ul>
        </Marquee>
        <Featured />
        <MenuExplorer />
        <BrandStory />
        <PairingSection />
        <Gallery />
        <FinalCTA />
      </main>
      <SiteFooter />
    </OrderProvider>
  );
}
