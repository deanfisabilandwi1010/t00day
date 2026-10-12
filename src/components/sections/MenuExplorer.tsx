"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { Plus } from "lucide-react";
import { byCategory, CATEGORIES, menu, type Category, type MenuItem } from "@/data/menu";
import { formatPrice } from "@/lib/format";
import { ScrollTrigger } from "@/lib/motion";
import { useOrder } from "@/components/order/OrderProvider";
import { SplitTitle } from "@/components/motion/SplitTitle";
import { Doodle } from "@/components/ui/Doodle";
import { Mascot } from "@/components/ui/Mascot";

type Filter = "Semua" | Category;

const FILTERS: { value: Filter; count: number }[] = [
  { value: "Semua", count: menu.length },
  ...CATEGORIES.map((category) => ({ value: category as Filter, count: byCategory(category).length })),
];

// Warna ubin kartu mengikuti warna minuman pada foto; hanya latar, bukan warna merek.
const TILE: Record<string, string> = {
  "dirty-tooday-coffe": "#d3b697",
  "matcha-latte": "#c9d6a6",
  "matcha-biscoff-latte": "#d5d79c",
  "dark-choco": "#c4a088",
  "choco-hazelnat": "#d8bba1",
  "mango-yakult": "#f5dd8f",
  "lycee-yakult": "#ebe5c4",
  "fruitpunch-yakult": "#f4c9c5",
  butertteok: "#f6e39c",
};

export function MenuExplorer() {
  const [filter, setFilter] = useState<Filter>("Semua");
  const filtered = filter === "Semua" ? menu : byCategory(filter);
  // Menu berfoto tampil lebih dulu; urutan papan menu dipertahankan di tiap kelompok.
  const items = [...filtered.filter((item) => item.image), ...filtered.filter((item) => !item.image)];

  // Tinggi grid berubah saat filter berganti; trigger di bawahnya perlu dihitung ulang.
  useEffect(() => {
    ScrollTrigger.refresh();
  }, [filter]);

  return (
    <section id="menu" className="menu" aria-labelledby="menu-title">
      <div className="menu-inner">
        <div className="menu-head">
          <Doodle shape="spark" className="menu-doodle--a" />
          <SplitTitle id="menu-title" className="display-md menu-title" text="Pilih yang bikin ingin coba." />
          <Doodle shape="spark" className="menu-doodle--b" />
          <Mascot name="girl-head" className="menu-mascot" sizes="(min-width: 1024px) 130px, 76px" />
        </div>

        <div className="menu-filters" role="group" aria-label="Filter kategori menu">
          {FILTERS.map(({ value, count }) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value}
              <span className="chip-count" aria-hidden="true">
                {count}
              </span>
            </button>
          ))}
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          Menampilkan {items.length} menu{filter === "Semua" ? "" : ` kategori ${filter}`}.
        </p>

        {items.length === 0 ? (
          <p className="menu-empty">Belum ada menu di kategori ini.</p>
        ) : (
          <ul key={filter} className="menu-grid">
            {items.map((item, index) => (
              <ProductCard key={item.id} item={item} index={index} />
            ))}
          </ul>
        )}

        <p className="menu-note">
          Harga mengikuti papan menu Tooday dan dapat berubah. Ketersediaan dikonfirmasi saat memesan.
        </p>

        <Mascot name="boy-peeking" className="menu-mascot-peek" sizes="(min-width: 1024px) 170px, 110px" />
        <Doodle shape="squiggle" className="menu-doodle--c" />
        <Doodle shape="swirl" className="menu-doodle--d" />
      </div>
    </section>
  );
}

function ProductCard({ item, index }: { item: MenuItem; index: number }) {
  const { add, openDetail } = useOrder();
  const ref = useRef<HTMLLIElement>(null);
  const style = { "--tile": TILE[item.id], "--i": index } as CSSProperties;

  return (
    <li ref={ref} className={`card ${item.image ? "" : "card--type"}`} style={style}>
      <button type="button" className="card-hit" onClick={() => openDetail(item.id)} aria-haspopup="dialog">
        <span className="card-media">
          {item.image ? (
            <Image src={item.image} alt={item.alt} width={1086} height={1448} sizes="(min-width: 1024px) 24vw, 44vw" />
          ) : (
            <span className="card-nophoto" aria-hidden="true">
              <span className="sparkle" />
              {item.category}
            </span>
          )}
        </span>
        <span className="card-text">
          <span className="card-name">{item.name}</span>
          {item.description && <span className="card-desc">{item.description}</span>}
          <span className="card-price">{formatPrice(item.price)}</span>
        </span>
        <span className="sr-only">Lihat detail</span>
      </button>
      <button
        type="button"
        className="card-add"
        aria-label={`Simpan ${item.name} ke pilihanku`}
        onClick={() => add(item.id, 1, ref.current)}
      >
        <Plus aria-hidden="true" size={20} strokeWidth={2.5} />
      </button>
    </li>
  );
}
