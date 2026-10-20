"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { Archive, ArchiveRestore, ArrowDown, ArrowLeft, ArrowUp, Download, MapPin, Pencil, Plus, Printer, QrCode } from "lucide-react";
import { brand } from "@/data/brand";
import { api, RequestError } from "@/lib/order/client";
import { Mascot } from "@/components/ui/Mascot";

const DEFAULT_OUTLET = process.env.NEXT_PUBLIC_DEFAULT_OUTLET ?? "tooday-main";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

interface Location {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

/** URL tujuan QR. Dibangun dari domain final yang dikonfigurasi (NEXT_PUBLIC_SITE_URL). */
export function orderUrl(base: string, outlet: string, table: string | null, antar: string | null = null) {
  const url = new URL("/order", base);
  url.searchParams.set("outlet", outlet);
  if (antar) url.searchParams.set("antar", antar);
  else if (table) url.searchParams.set("table", table);
  url.searchParams.set("source", antar ? "qr-antar" : "qr");
  return url.toString();
}

export function QrStudio() {
  const router = useRouter();
  const params = useSearchParams();
  const outlet = params.get("outlet") ?? DEFAULT_OUTLET;
  const [table, setTable] = useState("");
  const [antar, setAntar] = useState<string | null>(null);
  const [svg, setSvg] = useState("");
  const [isManager, setIsManager] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  // Domain final dari NEXT_PUBLIC_SITE_URL; tanpa itu dipakai origin halaman ini (ditandai sebagai lokal di bawah).
  const origin = useSyncExternalStore(
    () => () => {},
    () => SITE_URL || window.location.origin,
    () => SITE_URL,
  );

  const loadLocations = useCallback(async () => {
    try {
      const result = await api<{ locations: Location[] }>(`/api/kasir/delivery-locations?outlet=${outlet}`);
      setLocations(result.locations);
    } catch {
      // Daftar lokasi hanya pelengkap; QR outlet tetap bisa dibuat.
    }
  }, [outlet]);

  useEffect(() => {
    api<{ outlets: { slug: string; role: string }[] }>("/api/kasir/me")
      .then((me) => {
        setIsManager(me.outlets.some((entry) => entry.slug === outlet && entry.role === "manager"));
        void loadLocations();
      })
      .catch(() => router.replace("/kasir/login"));
  }, [router, outlet, loadLocations]);

  const location = locations.find((entry) => entry.code === antar && entry.active) ?? null;
  const cleanTable = /^[A-Za-z0-9-]{1,10}$/.test(table) ? table : null;
  const target = useMemo(
    () => (origin ? orderUrl(origin, outlet, location ? null : cleanTable, location?.code ?? null) : ""),
    [origin, outlet, cleanTable, location],
  );
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
    link.download = `tooday-qr-${outlet}${location ? `-antar-${location.code}` : cleanTable ? `-${cleanTable}` : ""}.png`;
    link.click();
  }

  return (
    <div className="qr-studio">
      <header className="qr-tools no-print">
        <Link href="/kasir" className="text-link">
          <ArrowLeft aria-hidden="true" size={18} /> Kembali ke kasir
        </Link>

        <div className="qr-mode" role="tablist" aria-label="Jenis QR">
          <button type="button" role="tab" aria-selected={!location} className="kasir-tab" onClick={() => setAntar(null)}>
            <QrCode aria-hidden="true" size={16} /> QR pesan di counter
          </button>
          {locations.some((entry) => entry.active) && (
            <button
              type="button"
              role="tab"
              aria-selected={Boolean(location)}
              className="kasir-tab"
              onClick={() => setAntar(location?.code ?? locations.find((entry) => entry.active)?.code ?? null)}
            >
              <MapPin aria-hidden="true" size={16} /> QR Antar per lokasi
            </button>
          )}
        </div>

        {location ? (
          <div className="qo-field">
            <label htmlFor="qr-location">Lokasi QR Antar</label>
            <select id="qr-location" value={location.code} onChange={(event) => setAntar(event.target.value)}>
              {locations
                .filter((entry) => entry.active)
                .map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.name}
                  </option>
                ))}
            </select>
          </div>
        ) : (
          <div className="qo-field">
            <label htmlFor="qr-table">
              Kode meja <span className="qo-optional">(opsional, harus terdaftar di outlet)</span>
            </label>
            <input id="qr-table" value={table} maxLength={10} onChange={(event) => setTable(event.target.value.toUpperCase())} placeholder="mis. M03" />
          </div>
        )}
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

      <main id="main" className={`qr-card ${location ? "qr-card--antar" : ""}`}>
        <Image src={brand.logo.src} alt={brand.logo.alt} width={brand.logo.width} height={brand.logo.height} sizes="220px" className="qr-logo" />
        <h1 className="qr-title">{location ? "Pesan dari sini, kami antar." : "Scan, pilih, lalu bayar di kasir."}</h1>
        {location ? <p className="qr-table">{location.name}</p> : cleanTable && <p className="qr-table">Meja {cleanTable}</p>}
        <div className="qr-code" role="img" aria-label={`Kode QR menuju ${target}`} dangerouslySetInnerHTML={{ __html: svg }} />
        <ol className="qr-steps">
          <li>Pilih menu</li>
          <li>Kirim pesanan</li>
          <li>{location ? "Bayar saat diantar" : "Bayar di kasir"}</li>
        </ol>
        {location && <p className="qr-note">Bayar pakai QRIS atau tunai saat pesanan diterima.</p>}
        <p className="qr-url">{target.replace(/^https?:\/\//, "")}</p>
        <Mascot name={location ? "boy-with-cup" : "boy-pointing"} reveal="now" className="qr-mascot" sizes="120px" />
        <div className="checker qr-checker" aria-hidden="true" />
      </main>

      <LocationManager
        outlet={outlet}
        locations={locations}
        canEdit={isManager}
        onChanged={setLocations}
        onPick={(code) => {
          setAntar(code);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </div>
  );
}

/** Daftar lokasi QR Antar di area Tooday. Semua staf bisa melihat dan membuat QR; hanya manager yang mengubah. */
function LocationManager({
  outlet,
  locations,
  canEdit,
  onChanged,
  onPick,
}: {
  outlet: string;
  locations: Location[];
  canEdit: boolean;
  onChanged: (locations: Location[]) => void;
  onPick: (code: string) => void;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ locations: Location[] }>("/api/kasir/delivery-locations", { method: "POST", body: { outlet, ...body } });
      onChanged(result.locations);
      return true;
    } catch (failure) {
      setError(failure instanceof RequestError ? failure.message : "Gagal menyimpan lokasi.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (name.trim() && (await change({ op: "create-location", name: name.trim() }))) setName("");
  }

  const active = locations.filter((entry) => entry.active);
  const archived = locations.filter((entry) => !entry.active);

  return (
    <section className="qr-locations no-print" aria-labelledby="qr-locations-title">
      <h2 id="qr-locations-title" className="qr-locations-title">
        <MapPin aria-hidden="true" size={20} /> Lokasi QR Antar
      </h2>
      <p className="kasir-muted kasir-small">
        Tempat di area Tooday yang bisa dipesani antar (mis. &ldquo;Outlet Bakso – meja 3&rdquo;). Setiap lokasi punya QR sendiri: saat dipindai, pilihan QR
        Antar dan lokasinya langsung terisi. Mengganti nama tidak mengubah QR yang sudah dicetak.
      </p>
      {error && (
        <p className="kasir-notice kasir-notice--warn" role="alert">
          {error}
        </p>
      )}
      {canEdit && (
        <form className="qr-location-add" onSubmit={add}>
          <label className="sr-only" htmlFor="qr-location-name">
            Nama lokasi baru
          </label>
          <input id="qr-location-name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="mis. Outlet Bakso – meja 3" />
          <button type="submit" className="qo-btn qo-btn--red" disabled={busy || !name.trim()}>
            <Plus aria-hidden="true" size={18} /> Tambah lokasi
          </button>
        </form>
      )}
      {active.length === 0 ? (
        <p className="kasir-empty">Belum ada lokasi antar.{canEdit ? " Tambahkan lokasi pertama di atas." : " Minta pengelola menambahkan lokasi."}</p>
      ) : (
        <ul className="qr-location-list">
          {active.map((entry, index) => (
            <li key={entry.id}>
              {editing?.id === entry.id ? (
                <form
                  className="qr-location-edit"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (editing.name.trim() && (await change({ op: "update-location", id: entry.id, name: editing.name.trim() }))) setEditing(null);
                  }}
                >
                  <label className="sr-only" htmlFor={`edit-${entry.id}`}>
                    Nama lokasi
                  </label>
                  <input id={`edit-${entry.id}`} value={editing.name} maxLength={60} onChange={(event) => setEditing({ id: entry.id, name: event.target.value })} autoFocus />
                  <button type="submit" className="kasir-chip" disabled={busy}>
                    Simpan
                  </button>
                  <button type="button" className="kasir-chip" onClick={() => setEditing(null)}>
                    Batal
                  </button>
                </form>
              ) : (
                <>
                  <span className="qr-location-name">
                    <strong>{entry.name}</strong>
                    <span className="kasir-muted"> · kode {entry.code}</span>
                  </span>
                  <span className="qr-location-tools">
                    <button type="button" className="kasir-chip" onClick={() => onPick(entry.code)}>
                      <QrCode aria-hidden="true" size={16} /> Buat QR
                    </button>
                    {canEdit && (
                      <>
                        <button type="button" className="mm-icon" disabled={busy || index === 0} aria-label={`Naikkan ${entry.name}`} onClick={() => change({ op: "update-location", id: entry.id, move: "up" })}>
                          <ArrowUp aria-hidden="true" size={16} />
                        </button>
                        <button
                          type="button"
                          className="mm-icon"
                          disabled={busy || index === active.length - 1}
                          aria-label={`Turunkan ${entry.name}`}
                          onClick={() => change({ op: "update-location", id: entry.id, move: "down" })}
                        >
                          <ArrowDown aria-hidden="true" size={16} />
                        </button>
                        <button type="button" className="mm-icon" disabled={busy} aria-label={`Ganti nama ${entry.name}`} onClick={() => setEditing({ id: entry.id, name: entry.name })}>
                          <Pencil aria-hidden="true" size={16} />
                        </button>
                        <button type="button" className="mm-icon" disabled={busy} aria-label={`Arsipkan ${entry.name}`} onClick={() => change({ op: "update-location", id: entry.id, active: false })}>
                          <Archive aria-hidden="true" size={16} />
                        </button>
                      </>
                    )}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <details className="mm-archive">
          <summary>Lokasi diarsipkan ({archived.length})</summary>
          <ul>
            {archived.map((entry) => (
              <li key={entry.id}>
                <span>{entry.name}</span>
                {canEdit && (
                  <button type="button" className="kasir-chip" disabled={busy} onClick={() => change({ op: "update-location", id: entry.id, active: true })}>
                    <ArchiveRestore aria-hidden="true" size={16} /> Aktifkan lagi
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
