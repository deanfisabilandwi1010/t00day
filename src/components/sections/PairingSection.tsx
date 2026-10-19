"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Plus } from "lucide-react";
import { useLiveMenu } from "@/data/live-menu";
import { formatPrice } from "@/lib/format";
import { useOrder } from "@/components/order/OrderProvider";
import { SplitTitle } from "@/components/motion/SplitTitle";
import { Doodle } from "@/components/ui/Doodle";
import { Mascot } from "@/components/ui/Mascot";
import { PillButton } from "@/components/ui/Pill";

const DRINK_IDS = ["matcha-latte", "dirty-tooday-coffe", "dark-choco", "mango-yakult"];

/** Saran penyajian interaktif: pilih minuman untuk disandingkan dengan ButterTteok. Bukan paket harga. */
export function PairingSection() {
  const [drinkId, setDrinkId] = useState(DRINK_IDS[0]);
  const { add } = useOrder();
  const stageRef = useRef<HTMLDivElement>(null);
  const { find } = useLiveMenu();
  const snack = find("butertteok")!;
  const drink = find(drinkId)!;

  return (
    <section id="pairing" className="pairing" aria-labelledby="pairing-title">
      <div className="pairing-inner">
        <div className="pairing-copy">
          <p className="eyebrow" data-reveal>
            Saran menikmati
          </p>
          <SplitTitle id="pairing-title" className="display-lg pairing-title" drift={60} text={"Satu teguk,\nsatu gigitan,\nulangi."} />
          <p className="pairing-text" data-reveal="left">
            Pilih minumannya, lihat pasangannya. Ini ide menikmati, bukan paket: tiap menu tetap dipesan dan dihargai
            sendiri.
          </p>

          <div className="pairing-picker" role="group" aria-label="Pilih minuman pendamping" data-reveal="left">
            {DRINK_IDS.map((id) => (
              <button key={id} type="button" className="chip" aria-pressed={drinkId === id} onClick={() => setDrinkId(id)}>
                {find(id)?.name}
                {find(id)?.availability === false && <span className="out-badge">Habis</span>}
              </button>
            ))}
          </div>

          <dl className="pairing-lines" aria-live="polite" data-reveal="left">
            {[drink, snack].map((item) => (
              <div key={item.id}>
                <dt>{item.name}</dt>
                <dd>{item.availability === false ? <span className="out-badge">Habis</span> : formatPrice(item.price)}</dd>
              </div>
            ))}
          </dl>

          <div data-reveal>
            <PillButton
              icon={<Plus aria-hidden="true" size={18} strokeWidth={2.5} />}
              disabled={drink.availability === false || snack.availability === false}
              onClick={() => {
                add(drink.id, 1, stageRef.current);
                add(snack.id, 1);
              }}
            >
              Simpan keduanya
            </PillButton>
          </div>
        </div>

        <div className="pairing-visual">
          <div className="patch pairing-patch--a" />
          <div className="patch pairing-patch--b" />
          <div ref={stageRef} className="pairing-stage" data-reveal="right">
            {/* key memicu animasi masuk setiap minuman berganti */}
            <div key={drink.id} className="pairing-drink">
              <Image src={drink.image!} alt={drink.alt} width={1086} height={1448} sizes="(min-width: 1024px) 24vw, 46vw" />
            </div>
            <div className="pairing-snack">
              <Image src={snack.image!} alt={snack.alt} width={1086} height={1448} sizes="(min-width: 1024px) 26vw, 50vw" />
            </div>
          </div>
          <Mascot name="girl-head" className="pairing-mascot" sizes="(min-width: 1024px) 140px, 84px" />
          <p className="pairing-note" data-reveal>
            Kombinasi kecil
            <br />
            untuk jeda hari ini.
          </p>
          <Doodle shape="swirl" className="pairing-doodle--a" />
          <Doodle shape="spark" className="pairing-doodle--b" />
        </div>
      </div>
    </section>
  );
}
