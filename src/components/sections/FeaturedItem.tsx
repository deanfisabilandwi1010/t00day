"use client";

import { ArrowUpRight } from "lucide-react";
import { getItem } from "@/data/menu";
import { formatPrice } from "@/lib/format";
import { useOrder } from "@/components/order/OrderProvider";

export function FeaturedItem({ index, id, from }: { index: string; id: string; from: "left" | "right" }) {
  const { openDetail } = useOrder();
  const item = getItem(id);

  return (
    <div className="featured-item" data-reveal={from}>
      <p className="featured-index" aria-hidden="true">
        {index}
      </p>
      <h3 className="featured-name">{item.name}</h3>
      {item.description && <p className="featured-desc">{item.description}</p>}
      <button type="button" className="price-tag" onClick={() => openDetail(item.id)} aria-haspopup="dialog">
        {formatPrice(item.price)}
        <span className="sr-only">, lihat detail {item.name}</span>
        <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}
