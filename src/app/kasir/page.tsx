import type { Metadata } from "next";
import { KasirApp } from "@/components/kasir/KasirApp";
import "@/styles/order-system.css";

export const metadata: Metadata = {
  title: "Tooday Counter",
  robots: { index: false, follow: false },
};

// Halaman hanya kerangka; data dan hak akses selalu diperiksa oleh API (/api/kasir/*).
export default function KasirPage() {
  return <KasirApp />;
}
