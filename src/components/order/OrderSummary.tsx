"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Copy, Store, Trash2 } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { Mascot } from "@/components/ui/Mascot";
import { PillButton, PillLink } from "@/components/ui/Pill";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Sheet } from "@/components/ui/Sheet";
import { scrollToTarget } from "@/lib/motion";
import { useOrder, type OrderLine } from "./OrderProvider";

function toText(lines: OrderLine[], total: number): string {
  const rows = lines.map((line) => `${line.qty}x ${line.item.name} — ${formatPrice(line.item.price)}`);
  return ["Pilihanku di Tooday:", ...rows, `Perkiraan total: ${formatPrice(total)}`].join("\n");
}

/**
 * Daftar pilihan di homepage. Belum terkirim ke kasir: pengunjung melanjutkan ke /order untuk
 * mengecek dan mengirim pesanan, lalu membayar di kasir. Keranjangnya sama dengan /order.
 */
export function OrderSummary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lines, count, total, setQty, clear } = useOrder();
  const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");

  async function copyList() {
    try {
      await navigator.clipboard.writeText(toText(lines, total));
      setCopyState("done");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2600);
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy="order-summary-title">
      <div className="summary">
        <p className="eyebrow">{count > 0 ? `${count} item` : "Masih kosong"}</p>
        <h2 id="order-summary-title" className="detail-title">
          Pilihanku
        </h2>

        {lines.length === 0 ? (
          <div className="summary-empty">
            <Mascot name="boy-peeking" reveal="now" className="summary-mascot" sizes="150px" />
            <p>Belum ada yang kamu simpan. Jelajahi menu, lalu tekan tanda tambah di menu yang bikin ingin coba.</p>
            <PillButton
              tone="olive"
              onClick={() => {
                onClose();
                scrollToTarget("#menu");
              }}
            >
              Lihat Menu
            </PillButton>
          </div>
        ) : (
          <>
            <ul className="summary-list">
              {lines.map(({ item, qty }) => (
                <li key={item.id}>
                  <div className="summary-thumb">
                    {item.image ? (
                      <Image src={item.image} alt="" width={1086} height={1448} sizes="64px" />
                    ) : (
                      <span aria-hidden="true">{item.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="summary-info">
                    <p className="summary-name">{item.name}</p>
                    <p className="summary-price">{formatPrice(item.price)}</p>
                  </div>
                  <QuantityStepper value={qty} onChange={(value) => setQty(item.id, value)} label={item.name} min={0} />
                </li>
              ))}
            </ul>

            <div className="summary-total">
              <span>Perkiraan total</span>
              <strong>{formatPrice(total)}</strong>
            </div>
            <p className="summary-note">
              Belum terkirim ke kasir. Lanjutkan untuk mengecek pilihan dan mengirim pesanan; pembayarannya di kasir.
              Harga dan ketersediaan mengikuti menu aktif di outlet.
            </p>

            <div className="summary-actions">
              <PillLink href="/order" icon={<Store aria-hidden="true" size={17} strokeWidth={2.25} />}>
                Pesan di outlet
              </PillLink>
              <PillButton
                tone="outline"
                onClick={copyList}
                icon={
                  copyState === "done" ? (
                    <Check aria-hidden="true" size={18} strokeWidth={2.5} />
                  ) : (
                    <Copy aria-hidden="true" size={17} strokeWidth={2.25} />
                  )
                }
              >
                {copyState === "done" ? "Tersalin" : "Salin daftar"}
              </PillButton>
            </div>
            <p className="summary-status" role="status">
              {copyState === "done" && "Daftar tersalin. Tunjukkan atau kirim saat memesan."}
              {copyState === "failed" && "Gagal menyalin. Coba lagi atau catat manual."}
            </p>
            <button type="button" className="text-link summary-clear" onClick={clear}>
              <Trash2 aria-hidden="true" size={15} /> Kosongkan
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
