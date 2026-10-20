// Tipe dan aturan yang dipakai bersama oleh server dan klien. Tidak boleh mengimpor modul server.

export const ORDER_STATUSES = [
  "WAITING_PAYMENT",
  "CALLED",
  "DEFERRED",
  "QUEUED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  // Jalur QR Antar
  "DELIVERY_REQUESTED",
  "DELIVERING",
  "UNDELIVERED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = "UNPAID" | "PAID";
export type OrderType = "DINE_IN" | "TAKEAWAY";
/** COUNTER: bayar di kasir lalu dibuat. DELIVERY (QR Antar): diterima kasir, dibuat, diantar, dibayar saat diterima. */
export type Fulfillment = "COUNTER" | "DELIVERY";
export type DeliveryPayment = "QRIS" | "TUNAI";

export const PAYMENT_QUEUE: readonly OrderStatus[] = ["WAITING_PAYMENT", "CALLED", "DEFERRED"];
export const PRODUCTION_QUEUE: readonly OrderStatus[] = ["QUEUED", "PREPARING", "READY"];
export const TERMINAL: readonly OrderStatus[] = ["COMPLETED", "CANCELLED", "EXPIRED", "UNDELIVERED"];

export const LIMITS = {
  noteMax: 200,
  nicknameMax: 30,
  qtyMax: 20,
  linesMax: 20,
  reasonMax: 200,
} as const;

/** Aksi staf terhadap satu order. Transisi yang sah diperiksa ulang di server. */
export type StaffAction =
  | "confirm-payment"
  | "recall"
  | "defer"
  | "requeue"
  | "cancel"
  | "start"
  | "ready"
  | "recall-ready"
  | "complete"
  // QR Antar
  | "accept"
  | "reject"
  | "deliver"
  | "confirm-delivery"
  | "undelivered";

/** Status asal yang sah untuk tiap aksi, per jalur pesanan. Aksi yang tidak tercantum = tidak berlaku. */
const ACTION_FROM: Record<Fulfillment, Partial<Record<StaffAction, readonly OrderStatus[]>>> = {
  COUNTER: {
    "confirm-payment": ["CALLED"],
    recall: ["CALLED"],
    defer: ["CALLED"],
    requeue: ["DEFERRED"],
    cancel: ["WAITING_PAYMENT", "CALLED", "DEFERRED"],
    start: ["QUEUED"],
    ready: ["PREPARING"],
    "recall-ready": ["READY"],
    complete: ["READY"],
  },
  DELIVERY: {
    accept: ["DELIVERY_REQUESTED"],
    reject: ["DELIVERY_REQUESTED"],
    cancel: ["QUEUED"],
    start: ["QUEUED"],
    ready: ["PREPARING"],
    deliver: ["READY"],
    // Lunas sekaligus selesai saat pesanan diserahkan (boleh langsung dari READY bila tidak sempat menekan "Antar").
    "confirm-delivery": ["READY", "DELIVERING"],
    undelivered: ["READY", "DELIVERING"],
  },
};

export function actionAllowed(action: StaffAction, fulfillment: Fulfillment, status: OrderStatus): boolean {
  return ACTION_FROM[fulfillment][action]?.includes(status) ?? false;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  WAITING_PAYMENT: "Menunggu bayar",
  CALLED: "Dipanggil ke kasir",
  DEFERRED: "Dilewati sementara",
  QUEUED: "Menunggu dibuat",
  PREPARING: "Sedang dibuat",
  READY: "Siap diambil",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Kedaluwarsa",
  DELIVERY_REQUESTED: "Menunggu diterima",
  DELIVERING: "Sedang diantar",
  UNDELIVERED: "Gagal diantar",
};

/** Label status untuk pesanan antar (READY berarti siap diantar, bukan siap diambil). */
export function statusLabel(status: OrderStatus, fulfillment: Fulfillment): string {
  if (fulfillment === "DELIVERY" && status === "READY") return "Siap diantar";
  if (fulfillment === "DELIVERY" && status === "QUEUED") return "Diterima, menunggu dibuat";
  return STATUS_LABEL[status];
}

export interface DeliveryInfo {
  location: string;
  detail: string | null;
  payHint: DeliveryPayment | null;
}

export function formatCode(queueNumber: number): string {
  return `T-${String(queueNumber).padStart(3, "0")}`;
}

export interface PublicMenuItem {
  sku: string;
  name: string;
  sectionId: string;
  /** Nama section menu (mis. Coffee, Cemal-cemil). */
  category: string;
  description: string | null;
  price: number | null;
  image: string | null;
  available: boolean;
  version: number;
}

export interface OutletInfo {
  slug: string;
  name: string;
  acceptingOrders: boolean;
  counterReady: boolean;
  /** Kode meja bila parameter table valid dan aktif; null bila tidak ada/tidak valid. */
  table: string | null;
  tableInvalid: boolean;
  /** QR Antar dibuka dan ada lokasi antar aktif. */
  acceptingDelivery: boolean;
  deliveryLocations: { code: string; name: string }[];
  /** Lokasi dari QR per lokasi (?antar=<code>) bila valid. */
  presetLocation: string | null;
}

export interface OrderLineView {
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  note: string | null;
  subtotal: number;
}

/** Tampilan order untuk pemiliknya (tamu). Tidak berisi data staf. */
export interface GuestOrderView {
  id: string;
  code: string;
  status: OrderStatus;
  payment: PaymentStatus;
  fulfillment: Fulfillment;
  delivery: DeliveryInfo | null;
  orderType: OrderType;
  table: string | null;
  nickname: string | null;
  total: number;
  items: OrderLineView[];
  createdAt: string;
  /** true bila order langsung dipanggil saat dikirim (kasir kosong). */
  calledOnSubmit: boolean;
  /** Jumlah order di depan pada antrean bayar (termasuk yang sedang dipanggil). Hanya untuk WAITING_PAYMENT. */
  ahead: number | null;
  counterReady: boolean;
  callEventId: number | null;
  readyEventId: number | null;
  version: number;
  feedVersion: number;
  /** Alasan bila pesanan dibatalkan/ditolak/gagal diantar (teks dari kasir, tampil sebagai teks biasa). */
  closeReason: string | null;
}

export interface StaffOrderView extends Omit<GuestOrderView, "calledOnSubmit" | "ahead" | "counterReady" | "feedVersion" | "closeReason"> {
  queueNumber: number;
  queueEnteredAt: string;
  calledAt: string | null;
  paidAt: string | null;
  readyAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  deferReason: string | null;
  expiresAt: string | null;
  acceptedAt: string | null;
  deliveringAt: string | null;
}

export interface OrderEventView {
  id: number;
  action: string;
  actor: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  at: string;
}

export interface PublicQueueEntry {
  code: string;
  status: "WAITING_PAYMENT" | "CALLED" | "QUEUED" | "PREPARING" | "READY";
  callEventId: number | null;
  readyEventId: number | null;
}

export interface PublicQueueFeed {
  outlet: { slug: string; name: string };
  feedVersion: number;
  counterReady: boolean;
  called: PublicQueueEntry | null;
  waiting: PublicQueueEntry[];
  preparing: PublicQueueEntry[];
  ready: PublicQueueEntry[];
  serverTime: string;
}

export type ApiErrorCode =
  | "VALIDATION"
  | "ORDERS_CLOSED"
  | "ITEM_UNAVAILABLE"
  | "PRICE_CHANGED"
  | "PRICE_MISSING"
  | "IDEMPOTENCY_CONFLICT"
  | "STATE_CHANGED"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "TOO_MANY_ACTIVE"
  | "BAD_ORIGIN"
  | "SERVER";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; detail?: unknown };
}
