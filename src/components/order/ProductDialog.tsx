"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Plus } from "lucide-react";
import type { MenuItem } from "@/data/menu";
import { formatPrice } from "@/lib/format";
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
      {/* key mereset jumlah setiap kali produk berganti */}
      {item && <ProductDetail key={item.id} item={item} onClose={onClose} />}
    </Sheet>
  );
}

function ProductDetail({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const { add, openList } = useOrder();
  const [qty, setQty] = useState(1);
  const mediaRef = useRef<HTMLDivElement>(null);

  return (
    <article className="detail">
      <div ref={mediaRef} className="detail-media">
        {item.image ? (
          <Image src={item.image} alt={item.alt} width={1086} height={1448} sizes="(min-width: 768px) 360px, 70vw" />
        ) : (
          <p className="detail-nophoto">
            <span aria-hidden="true">{item.category}</span>
            Foto menu ini menyusul.
          </p>
        )}
      </div>

      <div className="detail-body">
        <p className="eyebrow">{item.category}</p>
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
            onClick={() => {
              add(item.id, qty, mediaRef.current);
              onClose();
            }}
          >
            Simpan ke pilihanku
          </PillButton>
        </div>
        <button type="button" className="text-link" onClick={openList}>
          Lihat pilihanku
        </button>
      </div>
    </article>
  );
}
