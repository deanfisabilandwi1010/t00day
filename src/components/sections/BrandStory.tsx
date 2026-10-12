import Image from "next/image";
import { Parallax } from "@/components/motion/Parallax";
import { SplitTitle } from "@/components/motion/SplitTitle";
import { Doodle } from "@/components/ui/Doodle";
import { Mascot } from "@/components/ui/Mascot";
import { PillLink } from "@/components/ui/Pill";

export function BrandStory() {
  return (
    <section id="cerita" className="story" aria-labelledby="story-title">
      <figure className="story-figure">
        <Parallax distance={70} className="story-photo">
          <Image
            src="/assets/tooday/editorial/storefront-original.webp"
            alt="Tampak depan outlet Tooday Coffee di malam hari: jendela berstiker karakter Tooday, lampu hangat, dan tiga bangku merah"
            width={1200}
            height={1600}
            sizes="(min-width: 1024px) 54vw, 100vw"
          />
        </Parallax>
        <figcaption>Butter Tteok &amp; Tooday Coffee — foto outlet dari Tooday</figcaption>
      </figure>

      <div className="story-panel">
        <Doodle shape="cloud" className="story-doodle--cloud" />
        <p className="eyebrow" data-reveal>
          Cerita
        </p>
        <SplitTitle id="story-title" className="display-lg story-title" text={"A little note\nfor tooday."} />
        <p className="story-text" data-reveal>
          Pilihan kopi, matcha, minuman non-kopi, dan ButterTteok dalam satu suasana Tooday. Kalimat di atas tertulis
          di kaca jendela outlet, jadi sapaan kecil sebelum kamu memilih.
        </p>
        <div data-reveal>
          <PillLink href="#menu" tone="cream">
            Lihat Menu
          </PillLink>
        </div>
        <Doodle shape="spark" className="story-doodle--spark" />
        <Mascot name="boy-with-cup" className="story-mascot" sizes="(min-width: 1024px) 230px, 140px" />
      </div>
    </section>
  );
}
