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
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = "UNPAID" | "PAID";
export type OrderType = "DINE_IN" | "TAKEAWAY";

export const PAYMENT_QUEUE: readonly OrderStatus[] = ["WAITING_PAYMENT", "CALLED", "DEFERRED"];
export const PRODUCTION_QUEUE: readonly OrderStatus[] = ["QUEUED", "PREPARING", "READY"];
export const TERMINAL: readonly OrderStatus[] = ["COMPLETED", "CANCELLED", "EXPIRED"];

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
  | "complete";

export const STAFF_ACTION_FROM: Record<StaffAction, readonly OrderStatus[]> = {
  "confirm-payment": ["CALLED"],
  recall: ["CALLED"],
  defer: ["CALLED"],
  requeue: ["DEFERRED"],
  cancel: ["WAITING_PAYMENT", "CALLED", "DEFERRED"],
  start: ["QUEUED"],
  ready: ["PREPARING"],
  "recall-ready": ["READY"],
  complete: ["READY"],
};

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
};

export function formatCode(queueNumber: number): string {
  return `T-${String(queueNumber).padStart(3, "0")}`;
}

export interface PublicMenuItem {
  sku: string;
  name: string;
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
}

export interface StaffOrderView extends Omit<GuestOrderView, "calledOnSubmit" | "ahead" | "counterReady" | "feedVersion"> {
  queueNumber: number;
  queueEnteredAt: string;
  calledAt: string | null;
  paidAt: string | null;
  readyAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  deferReason: string | null;
  expiresAt: string | null;
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
