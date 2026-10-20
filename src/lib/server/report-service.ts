import "server-only";
import type { StaffContext } from "./auth";
import { db } from "./db";
import { ApiError } from "./http";

/**
 * Rekap transaksi dari payment_records: hanya pembayaran yang sudah dikonfirmasi kasir.
 * Tanggal mengikuti waktu pembayaran diterima di zona waktu outlet (bukan waktu order dibuat),
 * sehingga order yang dibuat 23.55 dan dibayar 00.05 tercatat di hari pembayaran.
 */

export interface TodayTotals {
  date: string;
  paidTotal: number;
  paidCount: number;
  mineTotal: number;
  mineCount: number;
}

export async function todayTotals(staff: StaffContext): Promise<TodayTotals> {
  const [row] = await db()<{ date: string; total: string | null; count: number; mine_total: string | null; mine_count: number }[]>`
    with today as (
      select (now() at time zone timezone)::date as d, timezone from tooday.outlets where id = ${staff.outletId}
    )
    select (select to_char(d, 'YYYY-MM-DD') from today) as date,
           sum(p.amount_rupiah)::bigint as total,
           count(*)::int as count,
           sum(p.amount_rupiah) filter (where p.received_by = ${staff.userId})::bigint as mine_total,
           count(*) filter (where p.received_by = ${staff.userId})::int as mine_count
    from tooday.payment_records p
    join tooday.orders o on o.id = p.order_id
    cross join today
    where o.outlet_id = ${staff.outletId} and (p.received_at at time zone today.timezone)::date = today.d`;
  return {
    date: row.date,
    paidTotal: Number(row.total ?? 0),
    paidCount: row.count,
    mineTotal: Number(row.mine_total ?? 0),
    mineCount: row.mine_count,
  };
}

export interface SalesReport {
  from: string;
  to: string;
  timezone: string;
  summary: {
    revenue: number;
    transactions: number;
    avgTicket: number;
    itemsSold: number;
    cancelled: number;
    expired: number;
    /** Pesanan QR Antar yang sudah dibuat/diantar tetapi tidak dibayar. */
    undelivered: number;
    undeliveredAmount: number;
  };
  /** Pemasukan per jalur: Kasir (bayar di counter) dan QR Antar (bayar saat diantar). */
  byChannel: { channel: string; transactions: number; revenue: number }[];
  byDay: { date: string; transactions: number; revenue: number; itemsSold: number }[];
  byItem: { sku: string; name: string; quantity: number; revenue: number }[];
  byStaff: { name: string; transactions: number; revenue: number }[];
  byMethod: { method: string; transactions: number; revenue: number }[];
  byHour: { hour: number; transactions: number; revenue: number }[];
  /** Daftar transaksi; hanya diisi untuk rentang ≤ 31 hari. */
  transactions: { code: string; paidAt: string; total: number; items: number; staff: string; method: string | null; orderType: string }[] | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function salesReport(staff: StaffContext, from: string, to: string): Promise<SalesReport> {
  if (!DATE.test(from) || !DATE.test(to) || from > to) throw new ApiError(400, "VALIDATION", "Rentang tanggal tidak valid.");
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (!Number.isFinite(days) || days > 366) throw new ApiError(400, "VALIDATION", "Rentang laporan maksimal 366 hari.");

  const sql = db();
  const [outlet] = await sql<{ timezone: string }[]>`select timezone from tooday.outlets where id = ${staff.outletId}`;
  const tz = outlet.timezone;

  // Pembayaran dalam rentang (tanggal lokal outlet), beserta order dan kasir penerimanya.
  const paid = sql`
    select p.id as payment_id, p.amount_rupiah, p.method, p.received_at,
           (p.received_at at time zone ${tz})::date as local_date,
           extract(hour from p.received_at at time zone ${tz})::int as local_hour,
           o.id as order_id, o.queue_number, o.order_type, o.item_count, o.fulfillment, u.display_name
    from tooday.payment_records p
    join tooday.orders o on o.id = p.order_id
    join tooday.staff_users u on u.id = p.received_by
    where o.outlet_id = ${staff.outletId}
      and (p.received_at at time zone ${tz})::date between ${from}::date and ${to}::date`;

  const [summary] = await sql<{ revenue: string | null; transactions: number; items: string | null }[]>`
    with paid as (${paid})
    select sum(amount_rupiah)::bigint as revenue, count(*)::int as transactions, sum(item_count)::bigint as items from paid`;
  const [closed] = await sql<{ cancelled: number; expired: number; undelivered: number; undelivered_amount: string | null }[]>`
    select count(*) filter (where order_status = 'CANCELLED')::int as cancelled,
           count(*) filter (where order_status = 'EXPIRED')::int as expired,
           count(*) filter (where order_status = 'UNDELIVERED')::int as undelivered,
           sum(total_rupiah) filter (where order_status = 'UNDELIVERED')::bigint as undelivered_amount
    from tooday.orders
    where outlet_id = ${staff.outletId} and closed_at is not null
      and (closed_at at time zone ${tz})::date between ${from}::date and ${to}::date`;
  const byDay = await sql<{ date: string; transactions: number; revenue: string; items: string }[]>`
    with paid as (${paid})
    select to_char(local_date, 'YYYY-MM-DD') as date, count(*)::int as transactions,
           sum(amount_rupiah)::bigint as revenue, sum(item_count)::bigint as items
    from paid group by local_date order by local_date`;
  const byItem = await sql<{ sku: string; name: string; quantity: string; revenue: string }[]>`
    with paid as (${paid})
    select i.sku, min(i.name_snapshot) as name, sum(i.quantity)::bigint as quantity, sum(i.subtotal_rupiah)::bigint as revenue
    from paid join tooday.order_items i on i.order_id = paid.order_id
    group by i.sku order by revenue desc, quantity desc`;
  const byStaff = await sql<{ name: string; transactions: number; revenue: string }[]>`
    with paid as (${paid})
    select display_name as name, count(*)::int as transactions, sum(amount_rupiah)::bigint as revenue
    from paid group by display_name order by revenue desc`;
  const byChannel = await sql<{ channel: string; transactions: number; revenue: string }[]>`
    with paid as (${paid})
    select case when fulfillment = 'DELIVERY' then 'QR Antar' else 'Kasir' end as channel,
           count(*)::int as transactions, sum(amount_rupiah)::bigint as revenue
    from paid group by 1 order by revenue desc`;
  const byMethod = await sql<{ method: string; transactions: number; revenue: string }[]>`
    with paid as (${paid})
    select coalesce(method, 'Tidak dicatat') as method, count(*)::int as transactions, sum(amount_rupiah)::bigint as revenue
    from paid group by 1 order by revenue desc`;
  const byHour = await sql<{ hour: number; transactions: number; revenue: string }[]>`
    with paid as (${paid})
    select local_hour as hour, count(*)::int as transactions, sum(amount_rupiah)::bigint as revenue
    from paid group by local_hour order by local_hour`;

  let transactions: SalesReport["transactions"] = null;
  if (days <= 31) {
    const rows = await sql<{ queue_number: number; received_at: Date; amount_rupiah: number; item_count: number; display_name: string; method: string | null; order_type: string }[]>`
      with paid as (${paid})
      select queue_number, received_at, amount_rupiah, item_count, display_name, method, order_type
      from paid order by received_at desc limit 1000`;
    transactions = rows.map((row) => ({
      code: `T-${String(row.queue_number).padStart(3, "0")}`,
      paidAt: row.received_at.toISOString(),
      total: row.amount_rupiah,
      items: row.item_count,
      staff: row.display_name,
      method: row.method,
      orderType: row.order_type,
    }));
  }

  const revenue = Number(summary.revenue ?? 0);
  return {
    from,
    to,
    timezone: tz,
    summary: {
      revenue,
      transactions: summary.transactions,
      avgTicket: summary.transactions ? Math.round(revenue / summary.transactions) : 0,
      itemsSold: Number(summary.items ?? 0),
      cancelled: closed.cancelled,
      expired: closed.expired,
      undelivered: closed.undelivered,
      undeliveredAmount: Number(closed.undelivered_amount ?? 0),
    },
    byDay: byDay.map((row) => ({ date: row.date, transactions: row.transactions, revenue: Number(row.revenue), itemsSold: Number(row.items) })),
    byItem: byItem.map((row) => ({ sku: row.sku, name: row.name, quantity: Number(row.quantity), revenue: Number(row.revenue) })),
    byStaff: byStaff.map((row) => ({ name: row.name, transactions: row.transactions, revenue: Number(row.revenue) })),
    byChannel: byChannel.map((row) => ({ channel: row.channel, transactions: row.transactions, revenue: Number(row.revenue) })),
    byMethod: byMethod.map((row) => ({ method: row.method, transactions: row.transactions, revenue: Number(row.revenue) })),
    byHour: byHour.map((row) => ({ hour: row.hour, transactions: row.transactions, revenue: Number(row.revenue) })),
    transactions,
  };
}
