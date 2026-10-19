"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, LogOut, Megaphone, MonitorPlay, QrCode, Search, Wifi, WifiOff } from "lucide-react";
import { brand } from "@/data/brand";
import { formatPrice } from "@/lib/format";
import { api, chime, formatTime, newKey, RequestError, useClock, useFeed } from "@/lib/order/client";
import { STATUS_LABEL, type OrderEventView, type OrderStatus, type StaffAction, type StaffOrderView } from "@/lib/order/types";
import { Mascot } from "@/components/ui/Mascot";
import { Modal } from "@/components/ui/Modal";

interface Snapshot {
  changed: true;
  feedVersion: number;
  outlet: { slug: string; name: string; timezone: string; acceptingOrders: boolean; counterReady: boolean; autoCallNext: boolean; paymentMethods: string[] };
  staff: { name: string; role: string };
  orders: StaffOrderView[];
  menu: { sku: string; name: string; category: string; price: number | null; available: boolean }[];
  serverTime: string;
}

interface Me {
  name: string;
  email: string;
  outlets: { slug: string; name: string; role: string }[];
}

interface Detail {
  order: StaffOrderView;
  events: OrderEventView[];
  payment: { amount: number; method: string | null; receivedBy: string; receivedAt: string } | null;
}

type Tab = "bayar" | "dibuat" | "siap" | "riwayat" | "menu";

const EVENT_LABEL: Record<string, string> = {
  CREATED: "Order masuk",
  AUTO_CALLED: "Dipanggil otomatis",
  CALLED: "Dipanggil",
  RECALLED: "Dipanggil ulang",
  DEFERRED: "Dilewati sementara",
  REQUEUED: "Dikembalikan ke antrean",
  PAYMENT_CONFIRMED: "Pembayaran diterima",
  PREPARING: "Mulai dibuat",
  READY: "Siap diambil",
  READY_RECALLED: "Panggil ulang pengambilan",
  COMPLETED: "Diserahkan",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Kedaluwarsa",
};

const byTime = (key: keyof StaffOrderView) => (a: StaffOrderView, b: StaffOrderView) =>
  String(a[key] ?? "").localeCompare(String(b[key] ?? "")) || a.queueNumber - b.queueNumber;

function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

export function KasirApp() {
  const router = useRouter();
  const clock = useClock(10000);
  const [me, setMe] = useState<Me | null>(null);
  const [outlet, setOutlet] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/api/kasir/me")
      .then((result) => {
        setMe(result);
        let saved: string | null = null;
        try {
          saved = window.localStorage.getItem("tooday-kasir-outlet");
        } catch {}
        setOutlet(result.outlets.find((entry) => entry.slug === saved)?.slug ?? result.outlets[0]?.slug ?? null);
      })
      .catch(() => router.replace("/kasir/login"));
  }, [router]);

  const { data: snap, health, updatedAt, refresh } = useFeed<Snapshot>({
    url: outlet ? `/api/kasir/snapshot?outlet=${outlet}` : null,
    intervalMs: 2500,
    outlet,
    versionOf: (data) => data.feedVersion,
    onError: (error) => {
      if (error.status === 401 || error.status === 403) router.replace("/kasir/login");
    },
  });

  const [tab, setTab] = useState<Tab>("bayar");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<null | { kind: "pay" | "defer" | "cancel"; order: StaffOrderView }>(null);
  const [reconcile, setReconcile] = useState<StaffOrderView | null>(null);
  const keys = useRef(new Map<string, string>());

  // Notifikasi order baru: banner + bunyi opsional, tanpa duplikasi per id.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!snap) return;
    const ids = snap.orders.map((order) => order.id);
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const added = snap.orders.filter((order) => !seen.current!.has(order.id) && order.payment === "UNPAID").map((order) => order.code);
    ids.forEach((id) => seen.current!.add(id));
    if (added.length > 0) {
      setFresh((current) => [...current, ...added].slice(-6));
      if (sound) chime(audio.current);
    }
  }, [snap, sound]);

  const orders = useMemo(() => snap?.orders ?? [], [snap]);
  const groups = useMemo(() => {
    const of = (...statuses: OrderStatus[]) => orders.filter((order) => statuses.includes(order.status));
    return {
      called: of("CALLED"),
      waiting: of("WAITING_PAYMENT").sort(byTime("queueEnteredAt")),
      deferred: of("DEFERRED").sort(byTime("queueEnteredAt")),
      production: of("QUEUED", "PREPARING").sort(byTime("paidAt")),
      ready: of("READY").sort(byTime("readyAt")),
    };
  }, [orders]);
  const unpaidCount = groups.called.length + groups.waiting.length + groups.deferred.length;

  const selected = orders.find((order) => order.id === selectedId) ?? (detail?.order.id === selectedId ? detail.order : null);

  // Riwayat tindakan untuk order terpilih; dimuat ulang saat versinya berubah.
  const selectedVersion = selected?.version;
  useEffect(() => {
    if (!selectedId || !outlet) return;
    let cancelled = false;
    api<Detail>(`/api/kasir/orders/${selectedId}?outlet=${outlet}`)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedVersion, outlet]);

  const run = useCallback(
    async (order: StaffOrderView, action: StaffAction, extra: { reason?: string; method?: string } = {}) => {
      if (!outlet) return false;
      // Key per (order, aksi, versi): retry setelah koneksi putus memakai key yang sama sehingga tidak tercatat dua kali.
      const slot = `${order.id}:${action}:${order.version}`;
      const key = keys.current.get(slot) ?? newKey();
      keys.current.set(slot, key);
      setBusy(slot);
      setNotice(null);
      try {
        await api(`/api/kasir/orders/${order.id}/action`, {
          method: "POST",
          body: { outlet, action, expectedVersion: order.version, idempotencyKey: key, ...extra },
        });
        keys.current.delete(slot);
        if (action === "confirm-payment") setReconcile(null);
        await refresh(true);
        return true;
      } catch (error) {
        const failure = error instanceof RequestError ? error : new RequestError(0, "NETWORK", "Koneksi terputus.");
        if (failure.uncertain) {
          if (action === "confirm-payment") setReconcile(order);
          else setNotice({ tone: "warn", text: "Koneksi bermasalah, status belum pasti. Tunggu tersambung lalu coba lagi; aksi yang sama tidak akan tercatat dua kali." });
        } else {
          keys.current.delete(slot);
          setNotice({ tone: "warn", text: failure.message });
          await refresh(true);
        }
        return false;
      } finally {
        setBusy(null);
      }
    },
    [outlet, refresh],
  );

  async function callNext() {
    if (!outlet) return;
    setBusy("call-next");
    setNotice(null);
    try {
      const result = await api<{ calledId: string | null }>("/api/kasir/call-next", { method: "POST", body: { outlet, idempotencyKey: newKey() } });
      if (!result.calledId) setNotice({ tone: "info", text: "Tidak ada antrean bayar yang menunggu." });
      else setSelectedId(result.calledId);
      await refresh(true);
    } catch (error) {
      setNotice({ tone: "warn", text: error instanceof RequestError ? error.message : "Gagal memanggil." });
    } finally {
      setBusy(null);
    }
  }

  async function updateSettings(patch: { acceptingOrders?: boolean; counterReady?: boolean; autoCallNext?: boolean }) {
    if (!outlet) return;
    setBusy("settings");
    try {
      await api("/api/kasir/settings", { method: "PATCH", body: { outlet, ...patch } });
      await refresh(true);
    } catch (error) {
      setNotice({ tone: "warn", text: error instanceof RequestError ? error.message : "Gagal menyimpan pengaturan." });
    } finally {
      setBusy(null);
    }
  }

  async function setAvailability(sku: string, available: boolean) {
    if (!outlet) return;
    setBusy(`menu:${sku}`);
    try {
      await api(`/api/kasir/menu/${sku}`, { method: "PATCH", body: { outlet, available } });
      await refresh(true);
    } catch (error) {
      setNotice({ tone: "warn", text: error instanceof RequestError ? error.message : "Gagal menyimpan." });
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    try {
      await api("/api/kasir/logout", { method: "POST", body: {} });
    } finally {
      router.replace("/kasir/login");
    }
  }

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

  const online = health === "live";
  const digits = query.replace(/\D/g, "");
  const matches = (order: StaffOrderView) => !digits || String(order.queueNumber).includes(digits.replace(/^0+/, "") || "0");

  if (!me || !outlet) {
    return (
      <main id="main" className="kasir-loading">
        <p>Memuat Tooday Counter…</p>
      </main>
    );
  }

  return (
    <div className="kasir">
      <header className="kasir-head">
        <Image src={brand.logo.src} alt={brand.logo.alt} width={brand.logo.width} height={brand.logo.height} sizes="96px" className="kasir-logo" preload />
        <div className="kasir-head-title">
          <p className="kasir-app">Tooday Counter</p>
          {me.outlets.length > 1 ? (
            <select
              aria-label="Outlet"
              value={outlet}
              onChange={(event) => {
                setOutlet(event.target.value);
                setSelectedId(null);
                try {
                  window.localStorage.setItem("tooday-kasir-outlet", event.target.value);
                } catch {}
              }}
            >
              {me.outlets.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="kasir-outlet">{snap?.outlet.name ?? me.outlets[0]?.name}</p>
          )}
        </div>
        <div className="kasir-head-meta">
          <span className={`kasir-conn kasir-conn--${health}`} role="status">
            {online ? <Wifi aria-hidden="true" size={16} /> : <WifiOff aria-hidden="true" size={16} />}
            {online ? "Tersambung" : health === "connecting" ? "Menghubungkan…" : health === "offline" ? "Offline" : "Menghubungkan kembali…"}
            {!online && updatedAt && <span className="kasir-muted"> · data {formatTime(updatedAt)}</span>}
          </span>
          <span className="kasir-clock tabular" aria-label="Jam">
            {formatTime(clock)}
          </span>
          <span className="kasir-staff">{me.name}</span>
          <button type="button" className="kasir-icon" onClick={logout} aria-label="Keluar">
            <LogOut aria-hidden="true" size={18} />
          </button>
        </div>
      </header>

      {snap && (
        <section className="kasir-controls" aria-label="Pengaturan outlet">
          <Toggle
            label="Terima order baru"
            on={snap.outlet.acceptingOrders}
            onLabel="Order QR dibuka"
            offLabel="Order QR ditutup"
            disabled={busy === "settings" || !online}
            onChange={(value) => updateSettings({ acceptingOrders: value })}
          />
          <Toggle
            label="Pemanggilan kasir"
            on={snap.outlet.counterReady}
            onLabel="Kasir siap"
            offLabel="Panggilan dijeda"
            disabled={busy === "settings" || !online}
            onChange={(value) => updateSettings({ counterReady: value })}
          />
          <Toggle
            label="Panggil otomatis"
            on={snap.outlet.autoCallNext}
            onLabel="Otomatis"
            offLabel="Manual"
            disabled={busy === "settings" || !online}
            onChange={(value) => updateSettings({ autoCallNext: value })}
          />
          <div className="kasir-controls-links">
            <button type="button" className="kasir-chip" onClick={toggleSound} aria-pressed={sound}>
              {sound ? <Bell aria-hidden="true" size={16} /> : <BellOff aria-hidden="true" size={16} />}
              {sound ? "Suara aktif" : "Aktifkan suara"}
            </button>
            <Link href={`/antrean?outlet=${outlet}`} target="_blank" className="kasir-chip">
              <MonitorPlay aria-hidden="true" size={16} /> Layar antrean
            </Link>
            <Link href={`/kasir/qr?outlet=${outlet}`} className="kasir-chip">
              <QrCode aria-hidden="true" size={16} /> QR
            </Link>
          </div>
        </section>
      )}

      {fresh.length > 0 && (
        <div className="kasir-fresh" role="status">
          <strong>{fresh.length === 1 ? "1 pesanan baru masuk" : `${fresh.length} pesanan baru masuk`}</strong>: {fresh.join(", ")}
          <button type="button" className="inline-link" onClick={() => setFresh([])}>
            Tandai sudah dilihat
          </button>
        </div>
      )}
      {notice && (
        <div className={`kasir-notice kasir-notice--${notice.tone}`} role="alert">
          {notice.text}
          <button type="button" className="inline-link" onClick={() => setNotice(null)}>
            Tutup
          </button>
        </div>
      )}
      {reconcile && (
        <div className="kasir-notice kasir-notice--warn" role="alert">
          <strong>Status pembayaran {reconcile.code} belum pasti karena koneksi.</strong> Jangan minta pelanggan membayar ulang. Simpan uangnya, tunggu
          sampai tersambung, lalu tekan tombol di bawah. Sistem tidak akan mencatat pembayaran dua kali.
          <div className="kasir-row">
            <button type="button" className="qo-btn qo-btn--olive" disabled={!online || busy !== null} onClick={() => run(reconcile, "confirm-payment")}>
              Coba konfirmasi lagi
            </button>
            <button type="button" className="inline-link" onClick={() => setReconcile(null)}>
              Sembunyikan
            </button>
          </div>
        </div>
      )}

      {snap && (
        <dl className="kasir-stats">
          <Stat label="Belum dibayar" value={unpaidCount} tone="red" />
          <Stat label="Menunggu dibuat" value={groups.production.filter((order) => order.status === "QUEUED").length} />
          <Stat label="Sedang dibuat" value={groups.production.filter((order) => order.status === "PREPARING").length} />
          <Stat label="Siap diambil" value={groups.ready.length} tone="olive" />
        </dl>
      )}

      <div className="kasir-body">
        <section className="kasir-list" aria-label="Daftar pesanan">
          <div className="kasir-tabs" role="tablist" aria-label="Tahap">
            {(
              [
                ["bayar", "Kasir", unpaidCount],
                ["dibuat", "Dibuat", groups.production.length],
                ["siap", "Siap", groups.ready.length],
                ["riwayat", "Riwayat", null],
                ["menu", "Menu", null],
              ] as const
            ).map(([key, label, count]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className="kasir-tab" onClick={() => setTab(key)}>
                {label}
                {count !== null && <span className="kasir-tab-count tabular">{count}</span>}
              </button>
            ))}
          </div>

          {tab !== "menu" && tab !== "riwayat" && (
            <label className="kasir-search">
              <Search aria-hidden="true" size={16} />
              <span className="sr-only">Cari kode pesanan</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kode, mis. 042" inputMode="numeric" />
            </label>
          )}

          {!snap && <p className="kasir-muted kasir-pad">Memuat pesanan…</p>}

          {snap && tab === "bayar" && (
            <>
              {groups.called.length === 0 && (
                <div className="kasir-callnext">
                  <p>
                    {groups.waiting.length > 0
                      ? `${groups.waiting.length} pesanan menunggu dipanggil.`
                      : snap.outlet.counterReady
                        ? "Belum ada yang perlu dipanggil."
                        : "Pemanggilan sedang dijeda."}
                  </p>
                  <button type="button" className="qo-btn qo-btn--red" onClick={callNext} disabled={groups.waiting.length === 0 || busy !== null || !online}>
                    <Megaphone aria-hidden="true" size={18} /> Panggil berikutnya
                  </button>
                </div>
              )}
              <OrderGroup title="Dipanggil ke kasir" orders={groups.called.filter(matches)} selectedId={selectedId} onSelect={setSelectedId} />
              <OrderGroup title="Antrean bayar" orders={groups.waiting.filter(matches)} selectedId={selectedId} onSelect={setSelectedId} numbered />
              <OrderGroup title="Dilewati sementara" orders={groups.deferred.filter(matches)} selectedId={selectedId} onSelect={setSelectedId} />
              {unpaidCount === 0 && <EmptyState text="Antrean bayar kosong. Order baru akan muncul di sini." />}
            </>
          )}
          {snap && tab === "dibuat" && (
            <>
              <OrderGroup title="Antrean dibuat (urut waktu bayar)" orders={groups.production.filter(matches)} selectedId={selectedId} onSelect={setSelectedId} />
              {groups.production.length === 0 && <EmptyState text="Belum ada pesanan yang perlu dibuat." />}
            </>
          )}
          {snap && tab === "siap" && (
            <>
              <OrderGroup title="Siap diambil" orders={groups.ready.filter(matches)} selectedId={selectedId} onSelect={setSelectedId} />
              {groups.ready.length === 0 && <EmptyState text="Tidak ada pesanan yang menunggu diambil." />}
            </>
          )}
          {snap && tab === "riwayat" && <History outlet={outlet} selectedId={selectedId} onSelect={setSelectedId} />}
          {snap && tab === "menu" && (
            <MenuAvailability menu={snap.menu} busy={busy} disabled={!online} onToggle={setAvailability} />
          )}
        </section>

        <aside className="kasir-detail" aria-label="Rincian pesanan">
          {selected ? (
            <OrderDetail
              order={selected}
              detail={detail?.order.id === selected.id ? detail : null}
              busy={busy}
              online={online}
              onAction={(action) => {
                if (action === "confirm-payment") setModal({ kind: "pay", order: selected });
                else if (action === "defer") setModal({ kind: "defer", order: selected });
                else if (action === "cancel") setModal({ kind: "cancel", order: selected });
                else void run(selected, action);
              }}
            />
          ) : (
            <div className="kasir-detail-empty">
              <Mascot name="girl-head" reveal="now" className="kasir-detail-mascot" sizes="110px" />
              <p>Pilih pesanan untuk melihat rincian dan aksinya.</p>
            </div>
          )}
        </aside>
      </div>

      <Modal open={modal?.kind === "pay"} onClose={() => setModal(null)} labelledBy="pay-title">
        {modal?.kind === "pay" && (
          <PayDialog
            order={modal.order}
            methods={snap?.outlet.paymentMethods ?? []}
            online={online}
            busy={busy !== null}
            onConfirm={async (method) => {
              // Berhasil atau gagal, modal ditutup; kegagalan tampil sebagai banner (termasuk langkah rekonsiliasi).
              await run(modal.order, "confirm-payment", method ? { method } : {});
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
      <Modal open={modal?.kind === "defer" || modal?.kind === "cancel"} onClose={() => setModal(null)} labelledBy="reason-title">
        {modal && modal.kind !== "pay" && (
          <ReasonDialog
            kind={modal.kind}
            order={modal.order}
            busy={busy !== null}
            onConfirm={async (reason) => {
              if (await run(modal.order, modal.kind === "defer" ? "defer" : "cancel", { reason })) setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function Toggle({ label, on, onLabel, offLabel, disabled, onChange }: { label: string; on: boolean; onLabel: string; offLabel: string; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`kasir-toggle ${on ? "is-on" : "is-off"}`} disabled={disabled} onClick={() => onChange(!on)}>
      <span className="kasir-toggle-track" aria-hidden="true">
        <span className="kasir-toggle-thumb" />
      </span>
      <span>
        <span className="kasir-toggle-label">{label}</span>
        <span className="kasir-toggle-state">{on ? onLabel : offLabel}</span>
      </span>
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "red" | "olive" }) {
  return (
    <div className={`kasir-stat ${tone ? `kasir-stat--${tone}` : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="kasir-empty">
      <Mascot name="boy-peeking" reveal="now" className="kasir-empty-mascot" sizes="120px" />
      <p>{text}</p>
    </div>
  );
}

function OrderGroup({ title, orders, selectedId, onSelect, numbered }: { title: string; orders: StaffOrderView[]; selectedId: string | null; onSelect: (id: string) => void; numbered?: boolean }) {
  if (orders.length === 0) return null;
  return (
    <div className="kasir-group">
      <h2 className="kasir-group-title">
        {title} <span className="tabular">({orders.length})</span>
      </h2>
      <ul className="kasir-tickets">
        {orders.map((order, index) => (
          <li key={order.id}>
            <button type="button" className={`kasir-ticket kasir-ticket--${order.status.toLowerCase()}`} aria-pressed={selectedId === order.id} onClick={() => onSelect(order.id)}>
              <span className="kasir-ticket-code tabular">{order.code}</span>
              <span className="kasir-ticket-info">
                <span className="kasir-ticket-status">
                  {order.payment === "UNPAID" && <strong className="kasir-unpaid">BELUM DIBAYAR</strong>} {STATUS_LABEL[order.status]}
                  {numbered ? ` · urutan ${index + 1}` : ""}
                </span>
                <span className="kasir-ticket-sub">
                  {order.items.reduce((sum, item) => sum + item.quantity, 0)} item · {order.orderType === "DINE_IN" ? "Dine-in" : "Takeaway"}
                  {order.table ? ` · Meja ${order.table}` : ""}
                  {order.nickname ? ` · ${order.nickname}` : ""}
                </span>
              </span>
              <span className="kasir-ticket-right">
                <strong className="tabular">{formatPrice(order.total)}</strong>
                <span className="kasir-muted tabular">{formatTime(order.createdAt)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ACTIONS: Partial<Record<OrderStatus, { action: StaffAction; label: string; tone: "red" | "olive" | "outline" | "ghost" }[]>> = {
  CALLED: [
    { action: "confirm-payment", label: "Konfirmasi pembayaran diterima", tone: "red" },
    { action: "recall", label: "Panggil ulang", tone: "outline" },
    { action: "defer", label: "Lewati sementara", tone: "outline" },
    { action: "cancel", label: "Batalkan", tone: "ghost" },
  ],
  WAITING_PAYMENT: [{ action: "cancel", label: "Batalkan", tone: "ghost" }],
  DEFERRED: [
    { action: "requeue", label: "Kembalikan ke antrean", tone: "olive" },
    { action: "cancel", label: "Batalkan", tone: "ghost" },
  ],
  QUEUED: [{ action: "start", label: "Mulai dibuat", tone: "olive" }],
  PREPARING: [{ action: "ready", label: "Siap diambil", tone: "red" }],
  READY: [
    { action: "complete", label: "Selesaikan · sudah diserahkan", tone: "olive" },
    { action: "recall-ready", label: "Panggil ulang pengambilan", tone: "outline" },
  ],
};

function OrderDetail({ order, detail, busy, online, onAction }: { order: StaffOrderView; detail: Detail | null; busy: string | null; online: boolean; onAction: (action: StaffAction) => void }) {
  const actions = ACTIONS[order.status] ?? [];
  return (
    <article className="kasir-card" aria-labelledby="kasir-detail-code">
      <div className="kasir-card-head">
        <p id="kasir-detail-code" className="kasir-card-code tabular">
          {order.code}
        </p>
        <div>
          {order.payment === "UNPAID" && order.status !== "CANCELLED" && order.status !== "EXPIRED" ? (
            <p className="kasir-badge kasir-badge--red">BELUM DIBAYAR</p>
          ) : order.payment === "PAID" ? (
            <p className="kasir-badge kasir-badge--olive">LUNAS</p>
          ) : null}
          <p className="kasir-card-status">{STATUS_LABEL[order.status]}</p>
        </div>
      </div>
      <p className="kasir-card-meta">
        Masuk {formatTime(order.createdAt)} · {order.orderType === "DINE_IN" ? "Dine-in" : "Takeaway"}
        {order.table ? ` · Meja ${order.table}` : ""}
        {order.nickname ? ` · ${order.nickname}` : ""}
      </p>
      {order.deferReason && order.status === "DEFERRED" && <p className="kasir-card-meta">Alasan dilewati: {order.deferReason}</p>}
      {order.closeReason && <p className="kasir-card-meta">Keterangan: {order.closeReason}</p>}

      <ul className="kasir-items">
        {order.items.map((item, index) => (
          <li key={`${item.sku}-${index}`}>
            <span className="kasir-qty tabular">{item.quantity}×</span>
            <span>
              {item.name}
              {item.note && <span className="kasir-note">Catatan: {item.note}</span>}
            </span>
            <span className="tabular">{formatPrice(item.subtotal)}</span>
          </li>
        ))}
      </ul>
      <p className="kasir-total">
        <span>Total</span>
        <strong className="tabular">{formatPrice(order.total)}</strong>
      </p>
      {detail?.payment && (
        <p className="kasir-card-meta">
          Dibayar {formatPrice(detail.payment.amount)} · diterima {detail.payment.receivedBy} · {formatTime(detail.payment.receivedAt)}
          {detail.payment.method ? ` · ${detail.payment.method}` : ""}
        </p>
      )}

      {actions.length > 0 && (
        <div className="kasir-actions">
          {actions.map(({ action, label, tone }) => {
            const needsServer = action === "confirm-payment";
            return (
              <button
                key={action}
                type="button"
                className={`qo-btn qo-btn--${tone} ${action === "confirm-payment" ? "qo-btn--block" : ""}`}
                disabled={busy !== null || (needsServer && !online)}
                onClick={() => onAction(action)}
              >
                {busy?.startsWith(`${order.id}:${action}`) ? "Menyimpan…" : label}
              </button>
            );
          })}
          {!online && order.status === "CALLED" && <p className="kasir-muted kasir-small">Konfirmasi pembayaran butuh koneksi ke server.</p>}
        </div>
      )}

      {detail && detail.events.length > 0 && (
        <details className="kasir-log">
          <summary>Riwayat tindakan ({detail.events.length})</summary>
          <ol>
            {detail.events.map((event) => (
              <li key={event.id}>
                <span className="tabular">{formatTime(event.at, true)}</span> {EVENT_LABEL[event.action] ?? event.action} · {event.actor}
                {event.reason ? ` · “${event.reason}”` : ""}
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}

function PayDialog({ order, methods, online, busy, onConfirm, onCancel }: { order: StaffOrderView; methods: string[]; online: boolean; busy: boolean; onConfirm: (method: string | null) => void; onCancel: () => void }) {
  const [method, setMethod] = useState<string>(methods[0] ?? "");
  return (
    <div className="kasir-dialog">
      <p className="eyebrow">Konfirmasi pembayaran</p>
      <h2 id="pay-title" className="kasir-dialog-title">
        Pembayaran <span className="tabular">{formatPrice(order.total)}</span> untuk {order.code} sudah diterima di kasir?
      </h2>
      <ul className="kasir-items kasir-items--compact">
        {order.items.map((item, index) => (
          <li key={`${item.sku}-${index}`}>
            <span className="kasir-qty tabular">{item.quantity}×</span>
            <span>{item.name}</span>
            <span className="tabular">{formatPrice(item.subtotal)}</span>
          </li>
        ))}
      </ul>
      {methods.length > 0 && (
        <div className="qo-field">
          <label htmlFor="pay-method">Metode (catatan internal)</label>
          <select id="pay-method" value={method} onChange={(event) => setMethod(event.target.value)}>
            {methods.map((entry) => (
              <option key={entry}>{entry}</option>
            ))}
          </select>
        </div>
      )}
      <p className="kasir-muted kasir-small">Tekan hanya setelah uang/pembayaran benar-benar diterima. Nominal diambil dari pesanan.</p>
      <div className="kasir-row">
        <button type="button" className="qo-btn qo-btn--red" disabled={!online || busy} onClick={() => onConfirm(method || null)}>
          {busy ? "Menyimpan…" : "Ya, pembayaran diterima"}
        </button>
        <button type="button" className="qo-btn qo-btn--outline" onClick={onCancel}>
          Batal
        </button>
      </div>
    </div>
  );
}

function ReasonDialog({ kind, order, busy, onConfirm, onCancel }: { kind: "defer" | "cancel"; order: StaffOrderView; busy: boolean; onConfirm: (reason: string) => void; onCancel: () => void }) {
  const presets = kind === "defer" ? ["Belum datang ke kasir", "Pelanggan minta waktu"] : ["Pelanggan membatalkan", "Menu tidak bisa dipenuhi", "Pesanan dobel"];
  const [reason, setReason] = useState("");
  return (
    <form
      className="kasir-dialog"
      onSubmit={(event) => {
        event.preventDefault();
        if (reason.trim()) onConfirm(reason.trim());
      }}
    >
      <p className="eyebrow">{kind === "defer" ? "Lewati sementara" : "Batalkan pesanan"}</p>
      <h2 id="reason-title" className="kasir-dialog-title">
        {kind === "defer" ? `Lewati ${order.code} sementara?` : `Batalkan ${order.code}?`}
      </h2>
      <p className="kasir-muted">
        {kind === "defer"
          ? "Slot kasir dilepas dan nomor berikutnya dipanggil. Pelanggan diminta memberi tahu kasir saat siap."
          : "Hanya untuk pesanan yang belum dibayar. Riwayat tetap tersimpan dan nomor tidak dipakai ulang."}
      </p>
      <div className="kasir-presets">
        {presets.map((preset) => (
          <button key={preset} type="button" className="kasir-chip" aria-pressed={reason === preset} onClick={() => setReason(preset)}>
            {preset}
          </button>
        ))}
      </div>
      <div className="qo-field">
        <label htmlFor="reason-input">Alasan</label>
        <input id="reason-input" value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} required />
      </div>
      <div className="kasir-row">
        <button type="submit" className={`qo-btn ${kind === "cancel" ? "qo-btn--red" : "qo-btn--olive"}`} disabled={busy || !reason.trim()}>
          {busy ? "Menyimpan…" : kind === "defer" ? "Lewati" : "Batalkan pesanan"}
        </button>
        <button type="button" className="qo-btn qo-btn--outline" onClick={onCancel}>
          Kembali
        </button>
      </div>
    </form>
  );
}

function History({ outlet, selectedId, onSelect }: { outlet: string; selectedId: string | null; onSelect: (id: string) => void }) {
  const [from, setFrom] = useState(todayJakarta);
  const [to, setTo] = useState(todayJakarta);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ orders: StaffOrderView[]; paidTotal: number; paidCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ outlet, from, to });
      if (code.trim()) params.set("code", code.trim());
      setResult(await api(`/api/kasir/history?${params}`));
    } catch (failure) {
      setError(failure instanceof RequestError ? failure.message : "Gagal memuat riwayat.");
    }
  }, [outlet, from, to, code]);

  // Memuat ulang otomatis saat rentang tanggal berubah; kode dicari lewat tombol.
  useEffect(() => {
    let cancelled = false;
    api<{ orders: StaffOrderView[]; paidTotal: number; paidCount: number }>(`/api/kasir/history?${new URLSearchParams({ outlet, from, to })}`)
      .then((value) => {
        if (!cancelled) setResult(value);
      })
      .catch((failure) => {
        if (!cancelled) setError(failure instanceof RequestError ? failure.message : "Gagal memuat riwayat.");
      });
    return () => {
      cancelled = true;
    };
  }, [outlet, from, to]);

  return (
    <div className="kasir-history">
      <form
        className="kasir-history-filter"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label>
          Dari <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          Sampai <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label>
          Kode <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" placeholder="042" />
        </label>
        <button type="submit" className="qo-btn qo-btn--outline">
          Cari
        </button>
      </form>
      {error && <p className="kasir-notice kasir-notice--warn">{error}</p>}
      {result && (
        <>
          <p className="kasir-muted kasir-pad">
            {result.paidCount} pembayaran tercatat · <strong className="tabular">{formatPrice(result.paidTotal)}</strong>
          </p>
          {result.orders.length === 0 ? (
            <EmptyState text="Belum ada pesanan selesai/batal pada rentang ini." />
          ) : (
            <OrderGroup title="Pesanan selesai, batal, dan kedaluwarsa" orders={result.orders} selectedId={selectedId} onSelect={onSelect} />
          )}
        </>
      )}
    </div>
  );
}

function MenuAvailability({ menu, busy, disabled, onToggle }: { menu: Snapshot["menu"]; busy: string | null; disabled: boolean; onToggle: (sku: string, available: boolean) => void }) {
  return (
    <ul className="kasir-menu">
      {menu.map((item) => (
        <li key={item.sku}>
          <span>
            <strong>{item.name}</strong>
            <span className="kasir-muted">
              {" "}
              · {item.category} · {item.price === null ? "harga belum diisi" : formatPrice(item.price)}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={item.available}
            aria-label={`${item.name} tersedia`}
            className={`kasir-avail ${item.available ? "is-on" : "is-off"}`}
            disabled={disabled || busy === `menu:${item.sku}`}
            onClick={() => onToggle(item.sku, !item.available)}
          >
            {item.available ? "Tersedia" : "Habis"}
          </button>
        </li>
      ))}
    </ul>
  );
}
