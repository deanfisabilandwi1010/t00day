"use client";

import { ShoppingBag } from "lucide-react";
import { useOrder } from "@/components/order/OrderProvider";
import { PillButton } from "@/components/ui/Pill";

export function OpenListButton() {
  const { openList, count } = useOrder();

  return (
    <PillButton tone="outline" onClick={openList} aria-haspopup="dialog" icon={<ShoppingBag aria-hidden="true" size={17} strokeWidth={2.25} />}>
      Buka pilihanku{count > 0 ? ` (${count})` : ""}
    </PillButton>
  );
}
