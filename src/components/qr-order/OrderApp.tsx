"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Minus, Plus, ReceiptText, ShoppingBag, Trash2, WifiOff } from "lucide-react";
import { brand } from "@/data/brand";
import { formatPrice } from "@/lib/format";
import { cart, pending, useCart, type CartLine } from "@/lib/order/cart";
import { api, newKey, RequestError, useFeed } from "@/lib/order/client";
import { LIMITS, STATUS_LABEL, type DeliveryPayment, type Fulfillment, type GuestOrderView, type OrderStatus, type OutletInfo, type PublicMenuItem } from "@/lib/order/types";
import { Mascot } from "@/components/ui/Mascot";
import { MenuPhoto } from "@/components/ui/MenuPhoto";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Sheet } from "@/components/ui/Sheet";

export const DEFAULT_OUTLET = process.env.NEXT_PUBLIC_DEFAULT_OUTLET ?? "tooday-main";

interface MenuResponse {
  outlet: OutletInfo;
  /** Urutan section mengikuti pengaturan manager di "Kelola menu". */
  sections: { id: string; name: string }[];
  items: PublicMenuItem[];
  feedVersion: number;
}

interface ActiveOrder {
  id: string;
  code: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "checking" }
  | { kind: "error"; message: string; tone: "warn" | "offline" };

const slugPattern = /^[a-z0-9][a-z0-9-]{1,39}$/;

export function OrderApp() {
  const params = useSearchParams();
  const router = useRouter();
  const rawOutlet = params.get("outlet") ?? DEFAULT_OUTLET;
  const outlet = slugPattern.test(rawOutlet) ? rawOutlet : DEFAULT_OUTLET;
  const table = params.get("table");
  // QR per lokasi antar: ?antar=<kode lokasi> → pilihan QR Antar dan lokasinya langsung terisi.
  const antar = params.get("antar");
  const menuUrl = `/api/menu?outlet=${encodeURIComponent(outlet)}${table ? `&table=${encodeURIComponent(table)}` : ""}${antar ? `&antar=${encodeURIComponent(antar)}` : ""}`;

  const [loadError, setLoadError] = useState<string | null>(null);
  const { data: menu, health, refresh: refreshMenu } = useFeed<MenuResponse>({
    url: menuUrl,
    intervalMs: 30000,
    outlet,
    onError: (error) => setLoadError(error.code === "NETWORK" ? null : error.message),
  });

  const cartState = useCart();
  const [detailSku, setDetailSku] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });
  // Pilihan cara terima. null = belum dipilih: QR lokasi otomatis memilih QR Antar.
  const [modeChoice, setModeChoice] = useState<Fulfillment | null>(null);
  const [locationChoice, setLocationChoice] = useState<string | null>(null);
  const [deliveryDetail, setDeliveryDetail] = useState("");
  const [payHint, setPayHint] = useState<DeliveryPayment>("QRIS");
  const [active, setActive] = useState<ActiveOrder[]>([]);

  const bySku = useMemo(() => new Map((menu?.items ?? []).map((item) => [item.sku, item])), [menu]);
  const sections = menu?.sections ?? [];

  const count = cartState.lines.reduce((sum, line) => sum + line.qty, 0);
  const total = cartState.lines.reduce((sum, line) => sum + (bySku.get(line.sku)?.price ?? 0) * line.qty, 0);
  const qtyBySku = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cartState.lines) map.set(line.sku, (map.get(line.sku) ?? 0) + line.qty);
    return map;
  }, [cartState.lines]);

  const loadActive = useCallback(async () => {
    try {
      const result = await api<{ orders: ActiveOrder[] }>(`/api/orders?outlet=${encodeURIComponent(outlet)}`);
      setActive(result.orders.filter((order) => !["COMPLETED", "CANCELLED", "EXPIRED"].includes(order.status)));
    } catch {
      // Daftar pesanan aktif hanya pintasan; gagal memuat tidak menghalangi memesan.
    }
  }, [outlet]);

  // Pulihkan percobaan kirim yang hasilnya belum pasti (mis. tab ditutup saat mengirim).
  const recoverPending = useCallback(async (): Promise<GuestOrderView | null> => {
    const stored = pending.get();
    if (!stored) return null;
    const result = await api<{ order: GuestOrderView | null }>(`/api/orders/by-key/${stored.key}`);
    if (result.order) {
      pending.clear();
      cart.clear();
      return result.order;
    }
    return null;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadActive();
      void recoverPending()
        .then((order) => {
          if (order) router.push(`/pesanan/${order.id}?outlet=${encodeURIComponent(outlet)}`);
        })
        .catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadActive, recoverPending, router, outlet]);

  const toastCount = useRef(0);
  const showToast = (text: string) => {
    toastCount.current += 1;
    setToast({ id: toastCount.current, text });
  };
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function addQuick(item: PublicMenuItem) {
    cart.add(item.sku, 1);
    showToast(`${item.name} masuk ke Pilihanku`);
  }

  function openDetail(sku: string) {
    setDetailSku(sku);
    setDetailOpen(true);
  }

  const deliveryOpen = menu?.outlet.acceptingDelivery ?? false;
  const mode: Fulfillment = deliveryOpen ? (modeChoice ?? (menu?.outlet.presetLocation ? "DELIVERY" : "COUNTER")) : "COUNTER";
  const location = locationChoice ?? menu?.outlet.presetLocation ?? "";
  const presetName = menu?.outlet.deliveryLocations.find((entry) => entry.code === menu.outlet.presetLocation)?.name ?? null;

  async function send() {
    if (submit.kind === "sending" || submit.kind === "checking") return;
    if (!menu) return;
    if (mode === "DELIVERY" && (!location || !cartState.nickname.trim())) {
      setSubmit({ kind: "error", tone: "warn", message: "Untuk QR Antar, pilih lokasi dan isi nama panggilan supaya kasir bisa menemukanmu." });
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSubmit({ kind: "error", tone: "offline", message: "Koneksi terputus. Pilihanmu tetap tersimpan. Coba lagi saat tersambung." });
      return;
    }

    // Satu percobaan = satu key, disimpan sebelum mengirim dan dipakai ulang sampai hasilnya pasti.
    const stored = pending.get();
    const key = stored && stored.outlet === outlet ? stored.key : newKey();
    pending.set({ key, outlet });

    const lines = cartState.lines.map((line) => ({
      sku: line.sku,
      quantity: line.qty,
      note: line.note,
      expectedUnitPrice: bySku.get(line.sku)?.price ?? 0,
    }));
    setSubmit({ kind: "sending" });
    try {
      const result = await api<{ order: GuestOrderView }>("/api/orders", {
        method: "POST",
        timeoutMs: 15000,
        body: {
          outlet,
          idempotencyKey: key,
          orderType: cartState.orderType,
          table: mode === "COUNTER" && cartState.orderType === "DINE_IN" ? menu.outlet.table : null,
          nickname: cartState.nickname || undefined,
          fulfillment: mode,
          ...(mode === "DELIVERY" ? { delivery: { location, detail: deliveryDetail || undefined, payHint } } : {}),
          lines,
          expectedTotal: total,
        },
      });
      // Keranjang dikosongkan hanya setelah server mengembalikan order yang tersimpan.
      pending.clear();
      cart.clear();
      router.push(`/pesanan/${result.order.id}?outlet=${encodeURIComponent(outlet)}`);
    } catch (error) {
      const failure = error instanceof RequestError ? error : new RequestError(0, "NETWORK", "Koneksi terputus.");
      if (failure.uncertain) {
        await confirmUnknown();
        return;
      }
      // Jawaban pasti dari server: order tidak dibuat, key boleh dibuang.
      pending.clear();
      if (failure.code === "PRICE_CHANGED" || failure.code === "ITEM_UNAVAILABLE" || failure.code === "PRICE_MISSING" || failure.code === "ORDERS_CLOSED") {
        await refreshMenu(true);
      }
      setSubmit({ kind: "error", tone: "warn", message: failure.message });
    }
  }

  /** Respons hilang: cek dulu apakah order sudah tersimpan sebelum membolehkan kirim ulang. */
  async function confirmUnknown() {
    setSubmit({ kind: "checking" });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1500 + attempt * 1000));
      try {
        const order = await recoverPending();
        if (order) {
          router.push(`/pesanan/${order.id}?outlet=${encodeURIComponent(outlet)}`);
          return;
        }
        // Server menjawab dan order dengan key ini tidak ada: memang belum terkirim.
        setSubmit({ kind: "error", tone: "offline", message: "Koneksi terputus. Pilihanmu tetap tersimpan. Coba lagi saat tersambung." });
        return;
      } catch {
        // Masih belum bisa menghubungi server; coba lagi.
      }
    }
    setSubmit({
      kind: "error",
      tone: "offline",
      message: "Kami belum bisa memastikan pesananmu. Jangan kirim ulang dari HP lain; coba lagi di sini saat sinyal pulih, atau tunjukkan layar ini ke kasir.",
    });
  }

  const detailItem = detailSku ? (bySku.get(detailSku) ?? null) : null;
  const accepting = menu?.outlet.acceptingOrders ?? true;

  return (
    <div className="qo">
      <header className="qo-bar">
        <Link href="/" className="qo-logo" aria-label="Tooday, ke beranda">
          <Image src={brand.logo.src} alt={brand.logo.alt} width={brand.logo.width} height={brand.logo.height} sizes="110px" preload />
        </Link>
        <div className="qo-bar-context">
          {menu?.outlet.table && <span className="qo-chip">Meja {menu.outlet.table}</span>}
          {health === "offline" || health === "reconnecting" ? (
            <span className="qo-chip qo-chip--warn" role="status">
              <WifiOff aria-hidden="true" size={14} /> Menghubungkan…
            </span>
          ) : null}
        </div>
        <button type="button" className="qo-bag" onClick={() => setCartOpen(true)} aria-haspopup="dialog">
          <ShoppingBag aria-hidden="true" size={18} />
          <span className="sr-only">Buka Pilihanku,</span>
          <span className="qo-bag-count" aria-label={`${count} item`}>
            {count}
          </span>
        </button>
      </header>

      <main id="main" className="qo-main">
        <section className="qo-hello" aria-labelledby="qo-hello-title">
          <Mascot name="boy-head" reveal="now" className="qo-hello-mascot" sizes="96px" />
          <div>
            <h1 id="qo-hello-title" className="qo-hello-title">
              Halo, sudah siap pilih yang enak?
            </h1>
            <p className="qo-hello-sub">
              {mode === "DELIVERY" && presetName ? `Pilih dari sini, nanti kami antar ke ${presetName}. Bayar saat pesanan diterima.` : "Pilih dari sini. Pembayarannya nanti di kasir, ya."}
            </p>
            {menu && <p className="qo-hello-outlet">{menu.outlet.name}</p>}
          </div>
        </section>

        {menu?.outlet.tableInvalid && (
          <p className="qo-banner" role="status">
            Kode meja di QR tidak dikenali. Kamu tetap bisa memesan; sebutkan mejamu ke kasir, ya.
          </p>
        )}
        {menu && !accepting && (
          <p className="qo-banner qo-banner--closed" role="status">
            <strong>Pemesanan lewat QR sedang ditutup.</strong> Kamu tetap bisa lihat menu dan menyimpan pilihan; pesan langsung ke kasir, ya.
          </p>
        )}

        {active.length > 0 && (
          <nav className="qo-active" aria-label="Pesanan aktifmu">
            <p className="eyebrow">Pesanan aktifmu</p>
            <ul>
              {active.map((order) => (
                <li key={order.id}>
                  <Link href={`/pesanan/${order.id}?outlet=${encodeURIComponent(outlet)}`} className="qo-active-link">
                    <ReceiptText aria-hidden="true" size={18} />
                    <span className="qo-active-code">{order.code}</span>
                    <span>{STATUS_LABEL[order.status]}</span>
                    <ArrowRight aria-hidden="true" size={16} className="qo-active-arrow" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {!menu && !loadError && <MenuSkeleton />}
        {!menu && loadError && (
          <div className="qo-empty" role="alert">
            <p>{loadError}</p>
            <button type="button" className="qo-btn qo-btn--outline" onClick={() => refreshMenu(true)}>
              Coba lagi
            </button>
          </div>
        )}
        {!menu && !loadError && health === "reconnecting" && (
          <p className="qo-banner" role="status">
            Menu belum termuat karena koneksi. Kami coba lagi otomatis.
          </p>
        )}

        {menu && (
          <>
            <nav className="qo-cats" aria-label="Kategori menu">
              {sections.map((section) => (
                <a key={section.id} href={`#sec-${section.id}`} className="chip qo-cat">
                  {section.name}
                </a>
              ))}
            </nav>

            {sections.map((section) => (
              <section key={section.id} id={`sec-${section.id}`} className="qo-section" aria-labelledby={`sec-title-${section.id}`}>
                <h2 id={`sec-title-${section.id}`} className="qo-section-title">
                  {section.name}
                </h2>
                <ul className="qo-grid">
                  {menu.items
                    .filter((item) => item.sectionId === section.id)
                    .map((item) => (
                      <li key={item.sku}>
                        <ProductCard item={item} inCart={qtyBySku.get(item.sku) ?? 0} onOpen={() => openDetail(item.sku)} onAdd={() => addQuick(item)} />
                      </li>
                    ))}
                </ul>
              </section>
            ))}
            <p className="qo-foot">
              Harga mengikuti menu yang aktif di kasir. Foto menu adalah ilustrasi.
            </p>
          </>
        )}
      </main>

      {count > 0 && (
        <div className="qo-sticky">
          <button type="button" className="qo-sticky-btn" onClick={() => setCartOpen(true)} aria-haspopup="dialog">
            <span className="qo-sticky-sum">
              {count} item · <span className="tabular">{formatPrice(total)}</span>
            </span>
            <span className="qo-sticky-cta">
              Lihat Pilihanku <ArrowRight aria-hidden="true" size={18} />
            </span>
          </button>
        </div>
      )}

      <p className={`qo-toast ${toast ? "is-on" : ""}`} role="status" aria-live="polite" key={toast?.id}>
        {toast?.text}
      </p>

      <Sheet open={detailOpen} onClose={() => setDetailOpen(false)} labelledBy="qo-detail-title">
        {detailItem && (
          <ProductDetail
            key={detailItem.sku}
            item={detailItem}
            onAdd={(qty, note) => {
              cart.add(detailItem.sku, qty, note);
              setDetailOpen(false);
              showToast(`${qty} ${detailItem.name} masuk ke Pilihanku`);
            }}
          />
        )}
      </Sheet>

      <Sheet open={cartOpen} onClose={() => setCartOpen(false)} labelledBy="qo-cart-title" className="sheet--tall">
        <CartPanel
          lines={cartState.lines}
          bySku={bySku}
          orderType={cartState.orderType}
          nickname={cartState.nickname}
          delivery={{
            open: deliveryOpen,
            mode,
            locations: menu?.outlet.deliveryLocations ?? [],
            location,
            detail: deliveryDetail,
            payHint,
            setMode: setModeChoice,
            setLocation: setLocationChoice,
            setDetail: setDeliveryDetail,
            setPayHint,
          }}
          table={menu?.outlet.table ?? null}
          accepting={accepting}
          total={total}
          submit={submit}
          onSend={send}
          onDismissError={() => setSubmit({ kind: "idle" })}
          onBrowse={() => setCartOpen(false)}
        />
      </Sheet>
    </div>
  );
}

function ProductCard({ item, inCart, onOpen, onAdd }: { item: PublicMenuItem; inCart: number; onOpen: () => void; onAdd: () => void }) {
  const orderable = item.available && item.price !== null;
  return (
    <article className={`qo-card ${item.available ? "" : "is-out"}`}>
      <button type="button" className="qo-card-hit" onClick={onOpen} aria-haspopup="dialog" aria-label={`Lihat detail ${item.name}`} />
      <div className="qo-card-media">
        {item.image ? (
          <MenuPhoto src={item.image} alt="" sizes="(min-width: 900px) 140px, 96px" />
        ) : (
          <span aria-hidden="true">{item.name.charAt(0)}</span>
        )}
        {!item.available && <span className="qo-out-label">Lagi habis</span>}
      </div>
      <div className="qo-card-text">
        <h3 className="qo-card-name">{item.name}</h3>
        {item.description && <p className="qo-card-desc">{item.description}</p>}
        <p className="qo-card-price tabular">{item.price === null ? "Harga tanya kasir" : formatPrice(item.price)}</p>
        {inCart > 0 && <p className="qo-card-incart">{inCart} di Pilihanku</p>}
      </div>
      <button type="button" className="qo-add" onClick={onAdd} disabled={!orderable} aria-label={orderable ? `Tambah ${item.name}` : `${item.name} tidak bisa dipesan`}>
        {orderable ? (
          <>
            <Plus aria-hidden="true" size={16} strokeWidth={2.75} /> Tambah
          </>
        ) : item.available ? (
          "Di kasir"
        ) : (
          "Habis"
        )}
      </button>
    </article>
  );
}

function ProductDetail({ item, onAdd }: { item: PublicMenuItem; onAdd: (qty: number, note: string) => void }) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const orderable = item.available && item.price !== null;
  return (
    <article className="qo-detail">
      <div className="qo-detail-media">
        <div className="patch qo-detail-patch" aria-hidden="true" />
        {item.image ? (
          <MenuPhoto src={item.image} alt={`Foto ilustrasi ${item.name}`} sizes="(min-width: 640px) 260px, 50vw" />
        ) : (
          <p className="qo-detail-nophoto">Foto menyusul</p>
        )}
      </div>
      <p className="eyebrow">{item.category}</p>
      <h2 id="qo-detail-title" className="detail-title">
        {item.name}
      </h2>
      {item.description && <p className="detail-desc">{item.description}</p>}
      <p className="qo-detail-price tabular">{item.price === null ? "Harga belum tersedia untuk QR" : formatPrice(item.price)}</p>
      {!item.available && <p className="qo-banner qo-banner--closed">Lagi habis. Coba menu lain dulu, ya.</p>}

      {orderable && (
        <>
          <div className="qo-field">
            <label htmlFor="qo-note">
              Catatan <span className="qo-optional">(opsional)</span>
            </label>
            <textarea
              id="qo-note"
              value={note}
              maxLength={LIMITS.noteMax}
              rows={2}
              onChange={(event) => setNote(event.target.value)}
              aria-describedby="qo-note-hint"
            />
            <p id="qo-note-hint" className="qo-hint">
              Permintaan khusus akan dikonfirmasi kasir. {note.length}/{LIMITS.noteMax}
            </p>
          </div>
          <div className="qo-detail-actions">
            <QuantityStepper value={qty} onChange={setQty} label={item.name} />
            <button type="button" className="qo-btn qo-btn--red qo-btn--grow" onClick={() => onAdd(qty, note)}>
              Masukkan ke Pilihanku · <span className="tabular">{formatPrice(item.price! * qty)}</span>
            </button>
          </div>
          <p className="qo-hint">Tambah hanya mengisi Pilihanku; belum terkirim ke kasir.</p>
        </>
      )}
    </article>
  );
}

interface DeliveryControls {
  open: boolean;
  mode: Fulfillment;
  locations: { code: string; name: string }[];
  location: string;
  detail: string;
  payHint: DeliveryPayment;
  setMode: (mode: Fulfillment) => void;
  setLocation: (code: string) => void;
  setDetail: (detail: string) => void;
  setPayHint: (hint: DeliveryPayment) => void;
}

interface CartPanelProps {
  delivery: DeliveryControls;
  lines: CartLine[];
  bySku: Map<string, PublicMenuItem>;
  orderType: "DINE_IN" | "TAKEAWAY";
  nickname: string;
  table: string | null;
  accepting: boolean;
  total: number;
  submit: SubmitState;
  onSend: () => void;
  onDismissError: () => void;
  onBrowse: () => void;
}

function CartPanel({ delivery, lines, bySku, orderType, nickname, table, accepting, total, submit, onSend, onDismissError, onBrowse }: CartPanelProps) {
  const isDelivery = delivery.mode === "DELIVERY";
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  const problems = lines.filter((line) => {
    const item = bySku.get(line.sku);
    return !item || !item.available || item.price === null;
  });
  const busy = submit.kind === "sending" || submit.kind === "checking";
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (submit.kind === "error" || submit.kind === "checking") errorRef.current?.focus();
  }, [submit]);

  if (lines.length === 0) {
    return (
      <div className="qo-cart">
        <p className="eyebrow">Masih kosong</p>
        <h2 id="qo-cart-title" className="detail-title">
          Pilihanku
        </h2>
        <div className="qo-cart-empty">
          <Mascot name="boy-peeking" reveal="now" className="summary-mascot" sizes="150px" />
          <p>Belum ada yang kamu pilih. Tekan &ldquo;Tambah&rdquo; di menu yang bikin ingin coba.</p>
          <button type="button" className="qo-btn qo-btn--olive" onClick={onBrowse}>
            Lihat menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="qo-cart">
      <p className="eyebrow">{count} item</p>
      <h2 id="qo-cart-title" className="detail-title">
        Pilihanku
      </h2>

      <ul className="qo-lines">
        {lines.map((line, index) => {
          const item = bySku.get(line.sku);
          const problem = !item ? "Tidak tersedia lagi" : !item.available ? "Lagi habis" : item.price === null ? "Harga tanya kasir" : null;
          return (
            <li key={`${line.sku}-${line.note ?? ""}`} className={problem ? "has-problem" : ""}>
              <div className="summary-thumb">
                {item?.image ? <MenuPhoto src={item.image} alt="" sizes="56px" /> : <span aria-hidden="true">{(item?.name ?? line.sku).charAt(0)}</span>}
              </div>
              <div className="qo-line-info">
                <p className="summary-name">{item?.name ?? line.sku}</p>
                {line.note && <p className="qo-line-note">Catatan: {line.note}</p>}
                <p className="qo-line-price tabular">
                  {problem ? <strong className="qo-problem">{problem}</strong> : `${formatPrice(item!.price)} · ${formatPrice(item!.price! * line.qty)}`}
                </p>
              </div>
              <div className="qo-line-actions">
                <div className="stepper qo-stepper" role="group" aria-label={`Jumlah ${item?.name ?? line.sku}`}>
                  <button type="button" onClick={() => cart.setQty(index, line.qty - 1)} aria-label="Kurangi" disabled={busy}>
                    <Minus aria-hidden="true" size={16} />
                  </button>
                  <output aria-live="polite">{line.qty}</output>
                  <button type="button" onClick={() => cart.setQty(index, line.qty + 1)} aria-label="Tambah" disabled={busy || line.qty >= LIMITS.qtyMax}>
                    <Plus aria-hidden="true" size={16} />
                  </button>
                </div>
                <button type="button" className="qo-remove" onClick={() => cart.remove(index)} aria-label={`Hapus ${item?.name ?? line.sku}`} disabled={busy}>
                  <Trash2 aria-hidden="true" size={17} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" className="text-link qo-more" onClick={onBrowse}>
        <Plus aria-hidden="true" size={16} /> Tambah menu lain
      </button>

      {delivery.open && (
        <fieldset className="qo-field qo-type">
          <legend>Cara terima pesanan</legend>
          <div className="qo-choice">
            {(
              [
                ["COUNTER", "Ambil di counter", "Bayar di kasir, ambil saat nomormu siap."],
                ["DELIVERY", "QR Antar", "Diantar ke tempatmu di area Tooday. Bayar saat diterima."],
              ] as const
            ).map(([value, title, text]) => (
              <label key={value} className={delivery.mode === value ? "is-on" : ""}>
                <input type="radio" name="fulfillment" value={value} checked={delivery.mode === value} onChange={() => delivery.setMode(value)} disabled={busy} />
                <span className="qo-choice-title">{title}</span>
                <span className="qo-choice-text">{text}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {isDelivery && (
        <div className="qo-delivery">
          <div className="qo-field">
            <label htmlFor="qo-location">Antar ke mana?</label>
            <select
              id="qo-location"
              value={delivery.location}
              onChange={(event) => {
                delivery.setLocation(event.target.value);
                if (submit.kind === "error") onDismissError();
              }}
              disabled={busy}
              required
            >
              <option value="" disabled>
                Pilih lokasi
              </option>
              {delivery.locations.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
          <div className="qo-field">
            <label htmlFor="qo-delivery-detail">
              Petunjuk tambahan <span className="qo-optional">(opsional)</span>
            </label>
            <input
              id="qo-delivery-detail"
              value={delivery.detail}
              maxLength={80}
              placeholder="mis. meja pojok, baju merah"
              onChange={(event) => delivery.setDetail(event.target.value)}
              disabled={busy}
            />
          </div>
          <fieldset className="qo-field">
            <legend>Bayar saat diterima pakai</legend>
            <div className="qo-segment">
              {(["QRIS", "TUNAI"] as const).map((hint) => (
                <label key={hint} className={delivery.payHint === hint ? "is-on" : ""}>
                  <input type="radio" name="pay-hint" value={hint} checked={delivery.payHint === hint} onChange={() => delivery.setPayHint(hint)} disabled={busy} />
                  {hint === "QRIS" ? "QRIS" : "Tunai"}
                </label>
              ))}
            </div>
            <p className="qo-hint">Kasir membawa QRIS{delivery.payHint === "TUNAI" ? " dan kembalian" : ""} saat mengantar.</p>
          </fieldset>
        </div>
      )}

      <fieldset className="qo-field qo-type" hidden={isDelivery}>
        <legend>Makan di mana?</legend>
        <div className="qo-segment">
          {(["DINE_IN", "TAKEAWAY"] as const).map((type) => (
            <label key={type} className={orderType === type ? "is-on" : ""}>
              <input type="radio" name="order-type" value={type} checked={orderType === type} onChange={() => cart.setOrderType(type)} disabled={busy} />
              {type === "DINE_IN" ? "Dine-in" : "Takeaway"}
            </label>
          ))}
        </div>
        {orderType === "DINE_IN" && table && <p className="qo-hint">Meja {table}. Pesanan tetap diambil di counter.</p>}
      </fieldset>

      <div className="qo-field">
        <label htmlFor="qo-nickname">
          Nama panggilan {isDelivery ? <span className="qo-required">(wajib untuk QR Antar)</span> : <span className="qo-optional">(opsional)</span>}
        </label>
        <input
          id="qo-nickname"
          type="text"
          autoComplete="nickname"
          value={nickname}
          maxLength={LIMITS.nicknameMax}
          required={isDelivery}
          onChange={(event) => {
            cart.setNickname(event.target.value);
            if (submit.kind === "error") onDismissError();
          }}
          disabled={busy}
          aria-describedby="qo-nickname-hint"
        />
        <p id="qo-nickname-hint" className="qo-hint">
          {isDelivery ? "Dipakai kasir untuk menemukanmu saat mengantar. Tidak perlu nomor HP." : "Biar kasir gampang menyapa. Tidak perlu nomor HP."}
        </p>
      </div>

      <div className="qo-total">
        <span>Total</span>
        <strong className="tabular">{formatPrice(total)}</strong>
      </div>

      <div className="qo-paynote">
        {isDelivery ? (
          <>
            <p>
              <strong>Bayar saat pesanan diterima.</strong>
            </p>
            <p>Kasir menerima pesananmu dulu, lalu membuat dan mengantarnya. Siapkan QRIS atau tunai sesuai total.</p>
          </>
        ) : (
          <>
            <p>
              <strong>Pembayaran dilakukan di kasir.</strong>
            </p>
            <p>Cek pilihanmu dulu. Pesanan akan mulai dibuat setelah pembayaran dikonfirmasi.</p>
          </>
        )}
      </div>

      <div ref={errorRef} tabIndex={-1} className="qo-submit-status" aria-live="assertive">
        {submit.kind === "checking" && <p className="qo-banner">Kami sedang memastikan pesananmu. Jangan kirim ulang dulu, ya.</p>}
        {submit.kind === "error" && (
          <p className={`qo-banner ${submit.tone === "offline" ? "" : "qo-banner--closed"}`} role="alert">
            {submit.message}{" "}
            <button type="button" className="inline-link" onClick={onDismissError}>
              Oke
            </button>
          </p>
        )}
        {problems.length > 0 && submit.kind !== "error" && (
          <p className="qo-banner qo-banner--closed">Hapus menu yang ditandai dulu sebelum mengirim.</p>
        )}
        {!accepting && <p className="qo-banner qo-banner--closed">Pemesanan lewat QR sedang ditutup. Pilihanmu tetap tersimpan.</p>}
      </div>

      <button type="button" className="qo-btn qo-btn--red qo-btn--block" onClick={onSend} disabled={busy || problems.length > 0 || !accepting} aria-disabled={busy}>
        {submit.kind === "sending" ? "Mengirim pesanan…" : submit.kind === "checking" ? "Memastikan pesanan…" : isDelivery ? "Kirim pesanan antar" : "Kirim pesanan"}
      </button>
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="qo-skeleton" aria-busy="true" aria-label="Memuat menu">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="qo-skeleton-row" />
      ))}
    </div>
  );
}
