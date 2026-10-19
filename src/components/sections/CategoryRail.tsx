"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FILTER_EVENT, type MenuItem } from "@/data/menu";
import { useLiveMenu } from "@/data/live-menu";
import { formatPrice } from "@/lib/format";
import { gsap, MQ, ScrollTrigger, scrollToTarget } from "@/lib/motion";
import { useOrder } from "@/components/order/OrderProvider";
import { Mascot } from "@/components/ui/Mascot";
import { MenuPhoto } from "@/components/ui/MenuPhoto";
import { PillButton } from "@/components/ui/Pill";
import { ArrowUpRight } from "lucide-react";

type Theme = "cream" | "olive" | "red" | "yellow";
/** Gerak gambar saat disorot (sekali jalan, setelah kursor diam sejenak): dikocok, berputar, bersulang, atau melompat. */
type Motion = "shake" | "spin" | "cheers" | "jump";

interface PanelStyle {
  word: string;
  title: string;
  theme: Theme;
  motion: Motion;
  images: string[];
}

/** Panel kurasi untuk empat kategori awal. Section baru dari "Kelola menu" mendapat panel otomatis. */
const CURATED: (PanelStyle & { category: string })[] = [
  { category: "Coffee", word: "coffee", title: "Kopi buat\nhari apa pun.", theme: "cream", motion: "shake", images: ["dirty-tooday-coffe"] },
  { category: "Matcha", word: "matcha", title: "Matcha,\ntiga cara.", theme: "olive", motion: "spin", images: ["matcha-biscoff-latte"] },
  { category: "Non-Coffee", word: "non-coffee", title: "Bukan kopi\njuga ada.", theme: "red", motion: "cheers", images: ["dark-choco", "mango-yakult"] },
  { category: "Cemal-cemil", word: "buttertteok", title: "Teman\nminumnya.", theme: "yellow", motion: "jump", images: ["butertteok"] },
];

const THEMES: Theme[] = ["cream", "olive", "red", "yellow"];
const MOTIONS: Motion[] = ["shake", "spin", "cheers", "jump"];

interface Panel extends PanelStyle {
  category: string;
  items: MenuItem[];
  photos: MenuItem[];
}

/**
 * Kategori sebagai panel menyamping (satu panel per section menu aktif).
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
  const { sections, items: allItems } = useLiveMenu();

  // Urutan dan isi mengikuti section live. Kategori awal memakai judul kurasi; yang baru memakai nama section.
  const panels = useMemo<Panel[]>(() => {
    return sections
      .map((section, index) => {
        const items = allItems.filter((item) => item.sectionId === section.id);
        const curated = CURATED.find((panel) => panel.category === section.name);
        const style: PanelStyle = curated ?? {
          word: section.name.toLowerCase(),
          title: section.name,
          theme: THEMES[index % THEMES.length],
          motion: MOTIONS[index % MOTIONS.length],
          images: [],
        };
        const curatedPhotos = style.images.map((id) => items.find((item) => item.id === id)).filter((item): item is MenuItem => Boolean(item?.image));
        const photos = curatedPhotos.length > 0 ? curatedPhotos : items.filter((item) => item.image).slice(0, 2);
        return { ...style, category: section.name, items, photos };
      })
      .filter((panel) => panel.items.length > 0);
  }, [sections, allItems]);
  const count = panels.length;
  const countRef = useRef(count);

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
            setActive(Math.round(self.progress * (countRef.current - 1)));
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
    scrollToTarget(top + (index / Math.max(1, count - 1)) * travel);
  }

  // Jumlah panel bisa berubah saat menu live masuk: ukur ulang panjang geser.
  useEffect(() => {
    countRef.current = count;
    ScrollTrigger.refresh();
  }, [count]);

  function showInMenu(category: string) {
    window.dispatchEvent(new CustomEvent(FILTER_EVENT, { detail: category }));
    scrollToTarget("#menu");
  }

  return (
    <section ref={sectionRef} className="rail" aria-labelledby="rail-title" style={{ "--panels": count } as CSSProperties}>
      <div className="rail-sticky">
        <h2 id="rail-title" className="sr-only">
          Kategori menu Tooday
        </h2>

        <div ref={trackRef} className="rail-track">
          {panels.map((panel, index) => {
            const items = panel.items;
            return (
              <article key={panel.category} className={`rail-panel rail-panel--${panel.theme}`} data-motion={panel.motion}>
                <p className="rail-word" aria-hidden="true">
                  {panel.word}
                </p>

                <div className="rail-copy">
                  <p className="eyebrow">
                    {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")} · {panel.category}
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

                <div className={`rail-visual rail-visual--${Math.max(1, panel.photos.length)}`}>
                  {panel.photos.length === 0 && <Mascot name="boy-with-cup" reveal="peek" className="rail-cup rail-cup--mascot" sizes="(min-width: 1024px) 26vw, 46vw" />}
                  {panel.photos.map((item, imageIndex) => {
                    const id = item.id;
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
                        <MenuPhoto src={item.image!} alt={item.alt} sizes="(min-width: 1024px) 30vw, 52vw" />
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
            {panels.map((panel, index) => (
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
