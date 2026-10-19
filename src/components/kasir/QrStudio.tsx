"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { brand } from "@/data/brand";
import { api } from "@/lib/order/client";
import { Mascot } from "@/components/ui/Mascot";

const DEFAULT_OUTLET = process.env.NEXT_PUBLIC_DEFAULT_OUTLET ?? "tooday-main";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

/** URL tujuan QR. Dibangun dari domain final yang dikonfigurasi (NEXT_PUBLIC_SITE_URL). */
export function orderUrl(base: string, outlet: string, table: string | null) {
  const url = new URL("/order", base);
  url.searchParams.set("outlet", outlet);
  if (table) url.searchParams.set("table", table);
  url.searchParams.set("source", "qr");
  return url.toString();
}

export function QrStudio() {
  const router = useRouter();
  const params = useSearchParams();
  const outlet = params.get("outlet") ?? DEFAULT_OUTLET;
  const [table, setTable] = useState("");
  const [svg, setSvg] = useState("");
  // Domain final dari NEXT_PUBLIC_SITE_URL; tanpa itu dipakai origin halaman ini (ditandai sebagai lokal di bawah).
  const origin = useSyncExternalStore(
    () => () => {},
    () => SITE_URL || window.location.origin,
    () => SITE_URL,
  );

  useEffect(() => {
    api("/api/kasir/me").catch(() => router.replace("/kasir/login"));
  }, [router]);

  const cleanTable = /^[A-Za-z0-9-]{1,10}$/.test(table) ? table : null;
  const target = useMemo(() => (origin ? orderUrl(origin, outlet, cleanTable) : ""), [origin, outlet, cleanTable]);
  const localOnly = /localhost|127\.0\.0\.1|192\.168\./.test(origin);

  useEffect(() => {
    if (!target) return;
    // Error correction M + quiet zone 4 modul (standar). Warna gelap pekat di atas putih polos.
    QRCode.toString(target, { type: "svg", errorCorrectionLevel: "M", margin: 4, color: { dark: "#202817", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [target]);

  async function downloadPng() {
    const data = await QRCode.toDataURL(target, { errorCorrectionLevel: "M", margin: 4, width: 1200, color: { dark: "#202817", light: "#ffffff" } });
    const link = document.createElement("a");
    link.href = data;
    link.download = `tooday-qr-${outlet}${cleanTable ? `-${cleanTable}` : ""}.png`;
    link.click();
  }

  return (
    <div className="qr-studio">
      <header className="qr-tools no-print">
        <Link href="/kasir" className="text-link">
          <ArrowLeft aria-hidden="true" size={18} /> Kembali ke kasir
        </Link>
        <div className="qo-field">
          <label htmlFor="qr-table">
            Kode meja <span className="qo-optional">(opsional, harus terdaftar di outlet)</span>
          </label>
          <input id="qr-table" value={table} maxLength={10} onChange={(event) => setTable(event.target.value.toUpperCase())} placeholder="mis. M03" />
        </div>
        <p className="kasir-small">
          Tujuan: <code>{target}</code>
        </p>
        {localOnly && (
          <p className="qo-banner qo-banner--closed">
            Domain masih lokal. Isi NEXT_PUBLIC_SITE_URL dengan domain final sebelum mencetak, lalu uji pindai dengan minimal dua HP.
          </p>
        )}
        <div className="kasir-row">
          <button type="button" className="qo-btn qo-btn--olive" onClick={() => window.print()}>
            <Printer aria-hidden="true" size={18} /> Cetak / PDF
          </button>
          <button type="button" className="qo-btn qo-btn--outline" onClick={downloadPng} disabled={!target}>
            <Download aria-hidden="true" size={18} /> Unduh PNG
          </button>
        </div>
      </header>

      <main id="main" className="qr-card">
        <Image src={brand.logo.src} alt={brand.logo.alt} width={brand.logo.width} height={brand.logo.height} sizes="220px" className="qr-logo" />
        <h1 className="qr-title">Scan, pilih, lalu bayar di kasir.</h1>
        {cleanTable && <p className="qr-table">Meja {cleanTable}</p>}
        <div className="qr-code" role="img" aria-label={`Kode QR menuju ${target}`} dangerouslySetInnerHTML={{ __html: svg }} />
        <ol className="qr-steps">
          <li>Pilih menu</li>
          <li>Kirim pesanan</li>
          <li>Bayar di kasir</li>
        </ol>
        <p className="qr-url">{target.replace(/^https?:\/\//, "")}</p>
        <Mascot name="boy-pointing" reveal="now" className="qr-mascot" sizes="120px" />
        <div className="checker qr-checker" aria-hidden="true" />
      </main>
    </div>
  );
}
