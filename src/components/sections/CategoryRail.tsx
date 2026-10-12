"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { byCategory, FILTER_EVENT, getItem, type Category } from "@/data/menu";
import { formatPrice } from "@/lib/format";
import { gsap, MQ, scrollToTarget } from "@/lib/motion";
import { useOrder } from "@/components/order/OrderProvider";
import { Mascot } from "@/components/ui/Mascot";
import { PillButton } from "@/components/ui/Pill";
import { ArrowUpRight } from "lucide-react";

type Theme = "cream" | "olive" | "red" | "yellow";
/** Gerak gambar saat disorot (sekali jalan, setelah kursor diam sejenak): dikocok, berputar, bersulang, atau melompat. */
type Motion = "shake" | "spin" | "cheers" | "jump";

const PANELS: { category: Category; word: string; title: string; theme: Theme; motion: Motion; images: string[] }[] = [
  { category: "Coffee", word: "coffee", title: "Kopi buat\nhari apa pun.", theme: "cream", motion: "shake", images: ["dirty-tooday-coffe"] },
  { category: "Matcha", word: "matcha", title: "Matcha,\ntiga cara.", theme: "olive", motion: "spin", images: ["matcha-biscoff-latte"] },
  { category: "Non-Coffee", word: "non-coffee", title: "Bukan kopi\njuga ada.", theme: "red", motion: "cheers", images: ["dark-choco", "mango-yakult"] },
  { category: "Cemal-cemil", word: "buttertteok", title: "Teman\nminumnya.", theme: "yellow", motion: "jump", images: ["butertteok"] },
];

/**
 * Empat kategori sebagai panel menyamping.
 * Desktop: seksi menempel (sticky) dan scroll vertikal menggeser panel ke kiri.
 * Mobile, reduced-motion, atau tanpa JS: carousel yang digeser dengan jari (scroll-snap).
 */
export function CategoryRail() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // Menu yang terakhir diklik tetap membesar, supaya jelas mana yang sedang dibuka.
  const [picked, setPicked] = useState<string | null>(null);
  const { openDetail } = useOrder();

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;
    const mm = gsap.matchMedia();

    mm.add(`${MQ.motionOk} and ${MQ.desktop}`, () => {
      // Tata letak menempel dipasang oleh komponen ini sendiri, tepat sebelum GSAP mengukurnya.
      section.classList.add("is-pinned");
      const tween = gsap.to(track, {
        // Lebar panel = lebar area tampil (tanpa scrollbar), jadi panel berikutnya tidak mengintip.
        x: () => -(track.scrollWidth - track.clientWidth),
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            section.style.setProperty("--p", self.progress.toFixed(4));
            setActive(Math.round(self.progress * (PANELS.length - 1)));
          },
        },
      });
      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
        gsap.set(track, { clearProps: "transform" });
        section.style.removeProperty("--p");
        section.classList.remove("is-pinned");
      };
    });

    return () => mm.revert();
  }, []);

  function goTo(index: number) {
    const section = sectionRef.current;
    if (!section) return;
    const travel = section.offsetHeight - window.innerHeight;
    const top = section.getBoundingClientRect().top + window.scrollY;
    scrollToTarget(top + (index / (PANELS.length - 1)) * travel);
  }

  function showInMenu(category: Category) {
    window.dispatchEvent(new CustomEvent(FILTER_EVENT, { detail: category }));
    scrollToTarget("#menu");
  }

  return (
    <section ref={sectionRef} className="rail" aria-labelledby="rail-title">
      <div className="rail-sticky">
        <h2 id="rail-title" className="sr-only">
          Empat kategori menu Tooday
        </h2>

        <div ref={trackRef} className="rail-track">
          {PANELS.map((panel, index) => {
            const items = byCategory(panel.category);
            return (
              <article key={panel.category} className={`rail-panel rail-panel--${panel.theme}`} data-motion={panel.motion}>
                <p className="rail-word" aria-hidden="true">
                  {panel.word}
                </p>

                <div className="rail-copy">
                  <p className="eyebrow">
                    0{index + 1} / 0{PANELS.length} · {panel.category}
                  </p>
                  <h3 className="display-lg rail-title">
                    {panel.title.split("\n").map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </h3>
                  <ul className="rail-list">
                    {items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={picked === item.id ? "is-picked" : undefined}
                          onClick={() => {
                            setPicked(item.id);
                            openDetail(item.id);
                          }}
                          aria-haspopup="dialog"
                        >
                          <span className="rail-name">
                            {item.name}
                            <ArrowUpRight aria-hidden="true" className="rail-arrow" size={18} strokeWidth={3} />
                          </span>
                          <span className="rail-dots" aria-hidden="true" />
                          <span className="rail-price">{formatPrice(item.price)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <PillButton tone={panel.theme === "red" ? "cream" : "red"} onClick={() => showInMenu(panel.category)}>
                    Lihat di menu
                  </PillButton>
                </div>

                <div className={`rail-visual rail-visual--${panel.images.length}`}>
                  {panel.images.map((id, imageIndex) => {
                    const item = getItem(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        className="rail-cup"
                        style={{ "--n": imageIndex } as CSSProperties}
                        onClick={() => {
                          setPicked(id);
                          openDetail(id);
                        }}
                        aria-haspopup="dialog"
                        aria-label={`Lihat detail ${item.name}`}
                      >
                        <Image src={item.image!} alt={item.alt} width={1086} height={1448} sizes="(min-width: 1024px) 30vw, 52vw" />
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>

        <p className="rail-hint" aria-hidden="true">
          Geser ke samping →
        </p>

        <div className="rail-progress">
          <div className="rail-line" aria-hidden="true">
            <Mascot name="boy-head" reveal="now" className="rail-walker" sizes="56px" />
          </div>
          <ol>
            {PANELS.map((panel, index) => (
              <li key={panel.category}>
                <button type="button" onClick={() => goTo(index)} aria-current={index === active ? "step" : undefined}>
                  {panel.category}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
