"use client";

import { useRef, useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";
import type { MenuItem } from "@/data/menu";
import { TILE } from "@/data/tiles";
import { formatPrice } from "@/lib/format";
import { Doodle } from "@/components/ui/Doodle";
import { Mascot } from "@/components/ui/Mascot";
import { MenuPhoto } from "@/components/ui/MenuPhoto";
import { PillButton } from "@/components/ui/Pill";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Sheet } from "@/components/ui/Sheet";
import { useOrder } from "./OrderProvider";

interface ProductDialogProps {
  item: MenuItem | null;
  open: boolean;
  onClose: () => void;
}

export function ProductDialog({ item, open, onClose }: ProductDialogProps) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="product-dialog-title">
      {/* key mereset jumlah dan memutar ulang animasi dekorasi setiap kali produk berganti */}
      {item && <ProductDetail key={item.id} item={item} onClose={onClose} />}
    </Sheet>
  );
}

function ProductDetail({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const { add, openList } = useOrder();
  const [qty, setQty] = useState(1);
  const mediaRef = useRef<HTMLDivElement>(null);
  const tile = TILE[item.id];

  return (
    <article className="detail">
      <div
        ref={mediaRef}
        className={`detail-media ${tile ? "" : "detail-media--dark"}`}
        style={{ "--tile": tile } as CSSProperties}
      >
        <div className="patch detail-patch" aria-hidden="true" />
        <Doodle shape="spark" animate="auto" className="detail-doodle--a" />
        <Doodle shape="loop" animate="auto" className="detail-doodle--b" />
        {item.image ? (
          <MenuPhoto src={item.image} alt={item.alt} sizes="(min-width: 768px) 360px, 70vw" className="detail-product" />
        ) : (
          <p className="detail-nophoto">
            <span aria-hidden="true">{item.category}</span>
            Foto menu ini menyusul.
          </p>
        )}
        <Mascot name="boy-peeking" reveal="now" className="detail-peek" sizes="130px" />
      </div>

      <div className="detail-body">
        <p className="eyebrow">
          <span className="sparkle" aria-hidden="true" /> {item.category}
        </p>
        <h2 id="product-dialog-title" className="detail-title">
          {item.name}
        </h2>
        {item.description && <p className="detail-desc">{item.description}</p>}
        <p className="detail-price">{formatPrice(item.price)}</p>

        <dl className="detail-facts">
          <div>
            <dt>Ketersediaan</dt>
            <dd>
              {item.availability === null
                ? "Tanyakan langsung di outlet"
                : item.availability
                  ? "Tersedia"
                  : "Sedang kosong"}
            </dd>
          </div>
          <div>
            <dt>Harga</dt>
            <dd>Mengikuti papan menu Tooday, dikonfirmasi saat memesan</dd>
          </div>
        </dl>

        <div className="detail-actions">
          <QuantityStepper value={qty} onChange={setQty} label={item.name} />
          <PillButton
            icon={<Plus aria-hidden="true" size={18} strokeWidth={2.5} />}
            disabled={item.availability === false}
            onClick={() => {
              add(item.id, qty, mediaRef.current);
              onClose();
            }}
          >
            {item.availability === false ? "Lagi habis" : "Masukkan ke Pilihanku"}
          </PillButton>
        </div>

        <div className="detail-foot">
          <button type="button" className="text-link" onClick={openList}>
            Lihat pilihanku
          </button>
          <Mascot name="girl-head" reveal="now" className="detail-buddy" sizes="110px" />
        </div>
      </div>
    </article>
  );
}
