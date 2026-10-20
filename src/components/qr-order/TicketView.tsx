"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Bell, BellOff, ChevronDown, WifiOff } from "lucide-react";
import { brand } from "@/data/brand";
import { formatPrice } from "@/lib/format";
import { api, chime, formatTime, RequestError, useFeed } from "@/lib/order/client";
import type { GuestOrderView } from "@/lib/order/types";
import { Mascot } from "@/components/ui/Mascot";
import { Sheet } from "@/components/ui/Sheet";
import { DEFAULT_OUTLET } from "./OrderApp";

interface Copy {
  eyebrow?: string;
  title: string;
  lead?: string;
  text: string;
  codeLabel: string;
  mascot: "boy-pointing" | "girl-head" | "boy-with-cup" | "boy-peeking";
  /** Tahap aktif pada STEPS (1-4); 5 = semua selesai; 0 = tidak ditampilkan. */
  step: 0 | 1 | 2 | 3 | 4 | 5;
}

/** Teks untuk pesanan QR Antar: diterima kasir, dibuat, diantar, lalu dibayar saat diterima. */
function deliveryCopy(order: GuestOrderView): Copy {
  const place = order.delivery?.location ?? "lokasimu";
  const pay = order.delivery?.payHint === "TUNAI" ? "uang tunai" : order.delivery?.payHint === "QRIS" ? "aplikasi untuk scan QRIS" : "pembayaran (QRIS atau tunai)";
  const base = { codeLabel: "Kode pesananmu" } as const;
  switch (order.status) {
    case "DELIVERY_REQUESTED":
      return { ...base, title: "Pesanan antar terkirim!", lead: "Tunggu kasir menerima pesananmu.", text: `Setelah diterima, pesanan dibuat lalu diantar ke ${place}.`, mascot: "girl-head", step: 1 };
    case "QUEUED":
      return { ...base, title: "Pesananmu diterima!", text: `Sebentar lagi dibuat, lalu diantar ke ${place}.`, mascot: "girl-head", step: 2 };
    case "PREPARING":
      return { ...base, title: "Lagi disiapin buat kamu.", text: `Setelah siap, langsung diantar ke ${place}.`, mascot: "girl-head", step: 3 };
    case "READY":
      return { ...base, title: "Pesananmu siap!", text: `Sebentar lagi diantar ke ${place}. Siapkan ${pay}, ya.`, mascot: "boy-with-cup", step: 3 };
    case "DELIVERING":
      return { ...base, title: "Pesananmu sedang diantar!", lead: `Ke ${place}.`, text: `Bayar saat pesanan diterima. Siapkan ${pay} untuk ${formatPrice(order.total)}.`, mascot: "boy-pointing", step: 4 };
    case "COMPLETED":
      return { ...base, title: "Selamat menikmati tooday!", text: "Terima kasih, pembayaran sudah diterima.", mascot: "boy-with-cup", step: 5 };
    case "CANCELLED":
      return {
        ...base,
        title: "Pesanan antar tidak diproses.",
        text: order.closeReason && order.closeReason !== "Dibatalkan pelanggan" ? `Keterangan kasir: ${order.closeReason}` : "Pesanan ini dibatalkan dan tidak perlu dibayar.",
        mascot: "boy-peeking",
        step: 0,
      };
    case "UNDELIVERED":
      return { ...base, title: "Pesanan tidak bisa diserahkan.", text: "Hubungi kasir Tooday kalau ada kendala, ya.", mascot: "boy-peeking", step: 0 };
    default:
      return {
        ...base,
        title: "Pesanan kedaluwarsa.",
        text: "Pesanan antar belum diterima kasir sampai batas waktu. Kamu bisa pesan lagi kapan saja.",
        mascot: "boy-peeking",
        step: 0,
      };
  }
}

/** Teks per status, mengikuti brief. Semua angka antrean berasal dari server. */
function copyFor(order: GuestOrderView): Copy {
  if (order.fulfillment === "DELIVERY") return deliveryCopy(order);
  switch (order.status) {
    case "CALLED":
      return order.calledOnSubmit
        ? {
            title: "Pesananmu sudah masuk!",
            lead: "Lakukan pembayaran di kasir.",
            text: "Kasir siap melayani. Yuk, langsung ke kasir dan tunjukkan kode ini.",
            codeLabel: "Kode pesananmu",
            mascot: "boy-pointing",
            step: 2,
          }
        : {
            title: `Giliranmu, ${order.code}!`,
            text: "Yuk, ke kasir untuk melakukan pembayaran.",
            codeLabel: "Nomor antrean bayarmu",
            mascot: "boy-pointing",
            step: 2,
          };
    case "WAITING_PAYMENT": {
      const ahead = order.ahead ?? 0;
      return {
        title: "Pesananmu sudah masuk!",
        lead: "Lakukan pembayaran di kasir.",
        text:
          ahead > 0
            ? `Ada ${ahead} pesanan di depanmu. Tunggu nomormu dipanggil di layar.`
            : order.counterReady
              ? "Kamu berikutnya. Tunggu nomormu dipanggil di layar, ya."
              : "Kasir sedang melayani keperluan lain. Tunggu nomormu dipanggil, ya.",
        codeLabel: "Nomor antrean bayarmu",
        mascot: "girl-head",
        step: 2,
      };
    }
    case "DEFERRED":
      return {
        title: "Nomormu terlewat.",
        text: "Silakan beri tahu kasir saat sudah siap.",
        codeLabel: "Nomor antrean bayarmu",
        mascot: "boy-peeking",
        step: 2,
      };
    case "QUEUED":
      return { title: "Pembayaran sudah diterima.", text: "Pesananmu masuk antrean dibuat.", codeLabel: "Kode pesananmu", mascot: "girl-head", step: 3 };
    case "PREPARING":
      return { title: "Lagi disiapin buat kamu.", text: `Pantau kode ${order.code} di layar pesanan, ya.`, codeLabel: "Kode pesananmu", mascot: "girl-head", step: 3 };
    case "READY":
      return { title: `${order.code}, pesananmu siap!`, text: "Silakan ambil di area pengambilan.", codeLabel: "Kode pesananmu", mascot: "boy-with-cup", step: 4 };
    case "COMPLETED":
      return { title: "Selamat menikmati tooday!", text: "Terima kasih sudah mampir.", codeLabel: "Kode pesananmu", mascot: "boy-with-cup", step: 5 };
    case "CANCELLED":
      return {
        title: "Pesanan dibatalkan.",
        text: "Pesanan ini tidak diproses dan tidak perlu dibayar.",
        codeLabel: "Kode pesanan",
        mascot: "boy-peeking",
        step: 0,
      };
    case "EXPIRED":
      return {
        title: "Pesanan kedaluwarsa.",
        text: "Pesanan belum dibayar sampai batas waktu, jadi tidak diproses. Kamu bisa pesan lagi kapan saja.",
        codeLabel: "Kode pesanan",
        mascot: "boy-peeking",
        step: 0,
      };
    default:
      return { title: "Status pesanan diperbarui.", text: "Muat ulang halaman bila tampilan belum berubah.", codeLabel: "Kode pesanan", mascot: "girl-head", step: 0 };
  }
}

function stampFor(order: GuestOrderView): { label: string; tone: "red" | "olive" | "muted" } {
  if (order.status === "CANCELLED") return { label: "Dibatalkan", tone: "muted" };
  if (order.status === "EXPIRED") return { label: "Kedaluwarsa", tone: "muted" };
  if (order.status === "UNDELIVERED") return { label: "Tidak diserahkan", tone: "muted" };
  if (order.payment === "PAID") return { label: "Sudah dibayar", tone: "olive" };
  if (order.fulfillment === "DELIVERY") return { label: "Bayar saat diterima", tone: "red" };
  return { label: "Belum dibayar", tone: "red" };
}

const STEPS = ["Terkirim", "Bayar di kasir", "Dibuat", "Siap diambil"];
const DELIVERY_STEPS = ["Terkirim", "Diterima", "Dibuat", "Diantar"];

export function TicketView() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const outletParam = params.get("outlet");
  const outlet = outletParam && /^[a-z0-9][a-z0-9-]{1,39}$/.test(outletParam) ? outletParam : DEFAULT_OUTLET;

  const [fatal, setFatal] = useState<string | null>(null);
  const { data, setData, health, updatedAt, refresh } = useFeed<{ order: GuestOrderView }>({
    url: fatal ? null : `/api/orders/${encodeURIComponent(id)}`,
    intervalMs: 4000,
    outlet,
    // Respons lama tidak boleh memundurkan status yang sudah tampil.
    isStale: (current, incoming) => incoming.order.version < current.order.version,
    onError: (error) => {
      if (error.status === 401 || error.status === 404) setFatal(error.message);
    },
  });
  const order = data?.order ?? null;

  const [details, setDetails] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelState, setCancelState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const lastEvent = useRef<string | null>(null);

  // Saat dipanggil atau pesanan siap: getar singkat, judul tab berubah, dan bunyi bila diaktifkan.
  useEffect(() => {
    if (!order) return;
    const marker =
      order.status === "CALLED"
        ? `call-${order.callEventId}`
        : order.status === "DELIVERING"
          ? "delivering"
          : order.status === "READY" && order.fulfillment === "COUNTER"
            ? `ready-${order.readyEventId}`
            : null;
    const previous = lastEvent.current;
    lastEvent.current = marker;
    document.title = order.status === "CALLED" ? `Giliranmu! ${order.code} · Tooday` : order.status === "READY" ? `${order.code} siap! · Tooday` : `${order.code} · Tooday`;
    if (!marker || previous === null || previous === marker) return;
    try {
      navigator.vibrate?.([180, 80, 180]);
    } catch {}
    if (sound) chime(audio.current);
  }, [order, sound]);

  function toggleSound() {
    if (sound) {
      setSound(false);
      return;
    }
    const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Context) {
      audio.current ??= new Context();
      void audio.current.resume();
      chime(audio.current, [988]);
    }
    setSound(true);
  }

  async function cancel() {
    if (!order) return;
    setCancelState({ busy: true, error: null });
    try {
      const result = await api<{ order: GuestOrderView }>(`/api/orders/${order.id}/cancel`, { method: "POST", body: {} });
      setData(result);
      setConfirmCancel(false);
      setCancelState({ busy: false, error: null });
    } catch (error) {
      const message = error instanceof RequestError ? error.message : "Gagal membatalkan. Coba lagi.";
      setCancelState({ busy: false, error: message });
      void refresh(true);
    }
  }

  if (fatal) {
    return (
      <div className="ticket-page">
        <TicketTop />
        <main id="main" className="ticket-wrap">
          <div className="ticket ticket--plain">
            <Mascot name="boy-peeking" reveal="now" className="ticket-mascot" sizes="140px" />
            <h1 className="ticket-title">Pesanan tidak ditemukan di perangkat ini.</h1>
            <p className="ticket-text">
              Status pesanan hanya bisa dibuka dari HP yang dipakai untuk memesan. Kalau kamu sudah memesan, tunjukkan kode pesananmu ke kasir, ya.
            </p>
            <Link href={`/order?outlet=${encodeURIComponent(outlet)}`} className="qo-btn qo-btn--olive">
              Kembali ke menu
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="ticket-page">
        <TicketTop />
        <main id="main" className="ticket-wrap" aria-busy="true">
          <div className="ticket ticket--loading">
            <p className="ticket-text">{health === "reconnecting" || health === "offline" ? "Menghubungkan kembali…" : "Memuat pesananmu…"}</p>
          </div>
        </main>
      </div>
    );
  }

  const copy = copyFor(order);
  const stamp = stampFor(order);
  const isDelivery = order.fulfillment === "DELIVERY";
  const cancellable = order.status === "WAITING_PAYMENT" || order.status === "DEFERRED" || order.status === "DELIVERY_REQUESTED";
  const live = !["COMPLETED", "CANCELLED", "EXPIRED", "UNDELIVERED"].includes(order.status);
  const steps = isDelivery ? DELIVERY_STEPS : STEPS;
  const stale = health === "reconnecting" || health === "offline";

  return (
    <div className="ticket-page">
      <TicketTop />
      <main id="main" className="ticket-wrap">
        {stale && (
          <p className="qo-banner ticket-stale" role="status">
            <WifiOff aria-hidden="true" size={16} /> Menghubungkan kembali… Terakhir diperbarui {formatTime(updatedAt)}. Status mungkin belum terbaru.
          </p>
        )}

        <article className={`ticket ticket--${order.status.toLowerCase()}`} aria-labelledby="ticket-title">
          <Mascot name={copy.mascot} reveal="now" className={`ticket-mascot ticket-mascot--${copy.mascot}`} sizes="150px" />
          <div className="ticket-head" key={`${order.status}-${order.callEventId ?? ""}`}>
            <h1 id="ticket-title" className="ticket-title">
              {copy.title}
            </h1>
            {copy.lead && <p className="ticket-lead">{copy.lead}</p>}
            <p className="ticket-text" role="status" aria-live="polite">
              {copy.text}
            </p>
          </div>

          <div className="ticket-code-block">
            <p className="ticket-code-label">{copy.codeLabel}</p>
            <p className={`ticket-code ${order.status === "CALLED" || order.status === "READY" || order.status === "DELIVERING" ? "is-hot" : ""}`}>{order.code}</p>
            <p className={`ticket-stamp ticket-stamp--${stamp.tone}`}>{stamp.label}</p>
          </div>

          <div className="ticket-perf" aria-hidden="true" />

          <p className="ticket-sum">
            <span>{order.payment === "PAID" ? "Sudah dibayar" : isDelivery ? "Bayar saat diterima" : "Belum dibayar"}</span>
            <span aria-hidden="true">·</span>
            <span>
              Total <strong className="tabular">{formatPrice(order.total)}</strong>
            </span>
          </p>
          {order.delivery && (
            <p className="ticket-delivery">
              <strong>QR Antar</strong> ke {order.delivery.location}
              {order.delivery.detail ? ` · ${order.delivery.detail}` : ""}
              {order.delivery.payHint ? ` · bayar ${order.delivery.payHint === "QRIS" ? "QRIS" : "tunai"}` : ""}
            </p>
          )}
          <p className="ticket-meta">
            {isDelivery ? "Diantar" : order.orderType === "DINE_IN" ? "Dine-in" : "Takeaway"}
            {order.table ? ` · Meja ${order.table}` : ""}
            {order.nickname ? ` · ${order.nickname}` : ""} · {formatTime(order.createdAt)}
          </p>

          {copy.step > 0 && (
            <ol className="ticket-steps" aria-label="Tahap pesanan">
              {steps.map((label, index) => {
                const step = index + 1;
                const state = step < copy.step ? "done" : step === copy.step ? "now" : "next";
                return (
                  <li key={label} className={`is-${state}`} aria-current={state === "now" ? "step" : undefined}>
                    <span className="ticket-step-dot" aria-hidden="true" />
                    {label}
                  </li>
                );
              })}
            </ol>
          )}

          <button type="button" className="ticket-toggle" aria-expanded={details} aria-controls="ticket-items" onClick={() => setDetails((value) => !value)}>
            {details ? "Tutup rincian" : "Lihat rincian"} <ChevronDown aria-hidden="true" size={18} className={details ? "is-open" : ""} />
          </button>
          <div id="ticket-items" hidden={!details}>
            <ul className="ticket-items">
              {order.items.map((item, index) => (
                <li key={`${item.sku}-${index}`}>
                  <span className="tabular">{item.quantity}×</span>
                  <span>
                    {item.name}
                    {item.note && <em className="ticket-note">Catatan: {item.note}</em>}
                  </span>
                  <span className="tabular">{formatPrice(item.subtotal)}</span>
                </li>
              ))}
            </ul>
            {order.items.some((item) => item.note) && <p className="qo-hint">Permintaan khusus akan dikonfirmasi kasir.</p>}
          </div>

          <div className="checker ticket-checker" aria-hidden="true" />
        </article>

        <div className="ticket-actions">
          {live && (
            <button type="button" className="qo-btn qo-btn--outline" onClick={toggleSound} aria-pressed={sound}>
              {sound ? <Bell aria-hidden="true" size={17} /> : <BellOff aria-hidden="true" size={17} />}
              {sound ? "Bunyi panggilan aktif" : "Aktifkan bunyi panggilan"}
            </button>
          )}
          {cancellable && (
            <button type="button" className="qo-btn qo-btn--ghost" onClick={() => setConfirmCancel(true)}>
              Batalkan pesanan
            </button>
          )}
          {order.status === "CALLED" && <p className="qo-hint">Mau membatalkan? Sampaikan langsung ke kasir, ya.</p>}
          <Link href={`/order?outlet=${encodeURIComponent(outlet)}`} className="text-link">
            {live ? "Kembali ke menu" : "Pesan lagi"}
          </Link>
        </div>
        <p className="ticket-foot">
          {isDelivery ? "Pesanan diantar oleh kasir Tooday." : "Pengambilan di counter."} Halaman ini diperbarui otomatis{updatedAt ? ` · ${formatTime(updatedAt, true)}` : ""}.
        </p>
      </main>

      <Sheet open={confirmCancel} onClose={() => setConfirmCancel(false)} labelledBy="cancel-title">
        <div className="qo-cart">
          <h2 id="cancel-title" className="detail-title">
            Batalkan {order.code}?
          </h2>
          <p>Pesanan ini belum dibayar. Kalau dibatalkan, nomornya tidak akan dipanggil lagi.</p>
          {cancelState.error && (
            <p className="qo-banner qo-banner--closed" role="alert">
              {cancelState.error}
            </p>
          )}
          <div className="qo-row">
            <button type="button" className="qo-btn qo-btn--red" onClick={cancel} disabled={cancelState.busy}>
              {cancelState.busy ? "Membatalkan…" : "Ya, batalkan"}
            </button>
            <button type="button" className="qo-btn qo-btn--outline" onClick={() => setConfirmCancel(false)}>
              Tidak jadi
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function TicketTop() {
  return (
    <header className="ticket-top">
      <Link href="/" className="qo-logo" aria-label="Tooday, ke beranda">
        <Image src={brand.logo.src} alt={brand.logo.alt} width={brand.logo.width} height={brand.logo.height} sizes="110px" />
      </Link>
    </header>
  );
}
