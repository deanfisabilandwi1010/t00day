import "server-only";
import postgres, { type Sql, type TransactionSql } from "postgres";

declare global {
  var __toodaySql: Sql | undefined;
}

/**
 * Koneksi Postgres milik server. DATABASE_URL tidak pernah berprefix NEXT_PUBLIC sehingga tidak
 * masuk bundle browser. prepare:false agar aman di pooler transaksi Supabase (port 6543).
 */
export function db(): Sql {
  if (!globalThis.__toodaySql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL belum dikonfigurasi");
    globalThis.__toodaySql = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
  }
  return globalThis.__toodaySql;
}

export type Tx = TransactionSql;

export interface LockedOutlet {
  id: string;
  slug: string;
  name: string;
  accepting_orders: boolean;
  unpaid_ttl_minutes: number;
  timezone: string;
  payment_methods: string[];
  counter_ready: boolean;
  auto_call_next: boolean;
  /** int8 dikembalikan sebagai string oleh driver. */
  feed_version: string;
  version: number;
}

/**
 * Menjalankan fn dalam satu transaksi setelah mengunci baris service_state outlet.
 * Semua mutasi antrean satu outlet melewati kunci ini, jadi berjalan berurutan.
 */
export async function withOutletLock<T>(outletId: string, fn: (tx: Tx, outlet: LockedOutlet) => Promise<T>): Promise<T> {
  return (await db().begin(async (tx) => {
    const [outlet] = await tx<LockedOutlet[]>`
      select o.id, o.slug, o.name, o.accepting_orders, o.unpaid_ttl_minutes, o.timezone, o.payment_methods,
             s.counter_ready, s.auto_call_next, s.feed_version, s.version
      from tooday.service_state s
      join tooday.outlets o on o.id = s.outlet_id
      where s.outlet_id = ${outletId}
      for update of s`;
    if (!outlet) throw new Error(`Outlet ${outletId} tidak memiliki service_state`);
    return fn(tx, outlet);
  })) as T;
}

/** Menaikkan feed_version; dipanggil di akhir setiap transaksi yang mengubah tampilan antrean. */
export async function bumpFeed(tx: Tx, outletId: string): Promise<number> {
  const [row] = await tx<{ feed_version: string }[]>`
    update tooday.service_state set feed_version = feed_version + 1, updated_at = now()
    where outlet_id = ${outletId}
    returning feed_version`;
  return Number(row.feed_version);
}
