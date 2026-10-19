import { Suspense } from "react";
import type { Metadata } from "next";
import { TicketView } from "@/components/qr-order/TicketView";
import "@/styles/order-system.css";

export const metadata: Metadata = {
  title: "Pesananmu · Tooday",
  robots: { index: false },
};

export default function TicketPage() {
  return (
    <Suspense fallback={<div className="ticket-page" aria-busy="true" />}>
      <TicketView />
    </Suspense>
  );
}
