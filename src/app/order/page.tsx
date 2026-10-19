import { Suspense } from "react";
import type { Metadata } from "next";
import { OrderApp } from "@/components/qr-order/OrderApp";
import "@/styles/order-system.css";

export const metadata: Metadata = {
  title: "Pesan di Tooday — pilih, kirim, bayar di kasir",
  description: "Pilih menu Tooday dari HP, kirim pesanan, lalu bayar di kasir.",
  robots: { index: false },
};

export default function OrderPage() {
  return (
    <Suspense fallback={<div className="qo" aria-busy="true" />}>
      <OrderApp />
    </Suspense>
  );
}
