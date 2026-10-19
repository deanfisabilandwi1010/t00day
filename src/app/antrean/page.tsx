import { Suspense } from "react";
import type { Metadata } from "next";
import { BoardApp } from "@/components/antrean/BoardApp";
import "@/styles/order-system.css";

export const metadata: Metadata = {
  title: "Antrean · Tooday",
  robots: { index: false },
};

export default function AntreanPage() {
  return (
    <Suspense fallback={<div className="board" aria-busy="true" />}>
      <BoardApp />
    </Suspense>
  );
}
