import { AtSign } from "lucide-react";
import { brand } from "@/data/brand";
import { SplitTitle } from "@/components/motion/SplitTitle";
import { Doodle } from "@/components/ui/Doodle";
import { PillLink } from "@/components/ui/Pill";
import { OpenListButton } from "./OpenListButton";

export function FinalCTA() {
  return (
    <section id="kunjungi" className="cta" aria-labelledby="cta-title">
      <div className="cta-inner">
        <div className="cta-title-wrap">
          <Doodle shape="spark" className="cta-doodle--a" />
          <SplitTitle id="cta-title" className="display-md cta-title" drift={50} text={"Sudah ketemu\npilihanmu?"} />
        </div>

        <div className="cta-actions" data-reveal="right">
          <PillLink href="#menu">Lihat Menu</PillLink>
          <OpenListButton />
          <PillLink href="/order" tone="olive">
            Pesan di outlet
          </PillLink>
          <p className="cta-order-note">Di outlet? Pilih dari HP, kirim pesanan, lalu bayar di kasir.</p>
        </div>

        <a href={brand.instagramUrl} target="_blank" rel="noreferrer" className="cta-ig" data-reveal>
          <AtSign aria-hidden="true" size={22} strokeWidth={2.25} />
          {brand.instagramHandle.replace("@", "")}
          <span className="sr-only"> di Instagram (tab baru)</span>
          <Doodle shape="spark" className="cta-doodle--b" />
        </a>
      </div>
    </section>
  );
}
