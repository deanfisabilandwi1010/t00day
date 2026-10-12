import Image from "next/image";
import { Parallax } from "@/components/motion/Parallax";
import { SplitTitle } from "@/components/motion/SplitTitle";
import { Tilt } from "@/components/motion/Tilt";
import { Doodle } from "@/components/ui/Doodle";
import { FeaturedItem } from "./FeaturedItem";

/** Dua menu pilihan dengan foto terkuat. Tidak diberi label "terlaris" karena tidak ada datanya. */
export function Featured() {
  return (
    <section id="pilihan" className="featured" aria-labelledby="featured-title">
      <div className="featured-inner">
        <SplitTitle id="featured-title" className="display-lg featured-title" text={"Yang bikin\nhari jadi\ntooday."} />

        <Tilt className="featured-visual">
          <Parallax distance={40}>
            <div data-reveal="pop">
              <Image
                src="/assets/tooday/addons/pairing-matcha-buttertteok-stack.webp"
                alt="Segelas matcha latte Tooday di samping tumpukan tiga ButterTteok di atas alas kotak-kotak kuning"
                width={1536}
                height={1024}
                sizes="(min-width: 1024px) 52vw, 100vw"
              />
            </div>
          </Parallax>
        </Tilt>

        <div className="featured-items">
          <FeaturedItem index="01" id="matcha-latte" />
          <FeaturedItem index="02" id="butertteok" />
        </div>

        <Doodle shape="loop" className="featured-doodle--a" />
        <Doodle shape="squiggle" className="featured-doodle--b" />
        <Doodle shape="spark" className="featured-doodle--c" />
      </div>
    </section>
  );
}
