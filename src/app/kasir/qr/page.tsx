import { Suspense } from "react";
import type { Metadata } from "next";
import { QrStudio } from "@/components/kasir/QrStudio";
import "@/styles/order-system.css";

export const metadata: Metadata = {
  title: "QR pesanan · Tooday Counter",
  robots: { index: false, follow: false },
};

export default function QrPage() {
  return (
    <Suspense fallback={null}>
      <QrStudio />
    </Suspense>
  );
}
