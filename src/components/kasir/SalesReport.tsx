"use client";

import { useEffect, useState } from "react";
import { Archive, Download, Printer, Receipt, ShoppingBag, Sparkles, TrendingUp, Trophy } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { api, formatTime, RequestError } from "@/lib/order/client";
import { Mascot } from "@/components/ui/Mascot";

interface Report {
  from: string;
  to: string;
  timezone: string;
  summary: { revenue: number; transactions: number; avgTicket: number; itemsSold: number; cancelled: number; expired: number };
  byDay: { date: string; transactions: number; revenue: number; itemsSold: number }[];
  byItem: { sku: string; name: string; quantity: number; revenue: number }[];
  byStaff: { name: string; transactions: number; revenue: number }[];
  byMethod: { method: string; transactions: number; revenue: number }[];
  byHour: { hour: number; transactions: number; revenue: number }[];
  transactions: { code: string; paidAt: string; total: number; items: number; staff: string; method: string | null; orderType: string }[] | null;
}

type Mode = "harian" | "bulanan";

const todayJakarta = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

function monthRange(month: string) {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const longDate = (date: string) =>
  new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

/** CSV dengan pemisah titik koma + BOM agar langsung rapi dibuka di Excel berbahasa Indonesia. */
function downloadCsv(name: string, rows: (string | number)[][]) {
  const text = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function SalesReport({ outlet }: { outlet: string }) {
  const [mode, setMode] = useState<Mode>("harian");
  const [day, setDay] = useState(todayJakarta);
  const [month, setMonth] = useState(() => todayJakarta().slice(0, 7));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const range = mode === "harian" ? { from: day, to: day } : monthRange(month);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      api<Report>(`/api/kasir/report?${new URLSearchParams({ outlet, ...range })}`)
        .then((value) => {
          if (!cancelled) setReport(value);
        })
        .catch((failure) => {
          if (!cancelled) setError(failure instanceof RequestError ? failure.message : "Gagal memuat laporan.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // range dihitung ulang setiap render; cukup bergantung pada nilai mentahnya.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlet, mode, day, month]);

  const title = mode === "harian" ? longDate(day) : monthLabel(month);

  function exportCsv() {
    if (!report) return;
    const header = [["Laporan transaksi Tooday", title], ["Dasar", "Pembayaran yang dikonfirmasi kasir, tanggal diterima (" + report.timezone + ")"], []];
    const summary = [
      ["Pendapatan tercatat", report.summary.revenue],
      ["Transaksi", report.summary.transactions],
      ["Rata-rata per transaksi", report.summary.avgTicket],
      ["Item terjual", report.summary.itemsSold],
      ["Dibatalkan", report.summary.cancelled],
      ["Kedaluwarsa", report.summary.expired],
      [],
    ];
    const detail =
      mode === "harian"
        ? [["Jam bayar", "Kode", "Item", "Total", "Kasir", "Metode", "Jenis"], ...(report.transactions ?? []).map((t) => [formatTime(t.paidAt), t.code, t.items, t.total, t.staff, t.method ?? "", t.orderType === "DINE_IN" ? "Dine-in" : "Takeaway"])]
        : [["Tanggal", "Transaksi", "Item", "Pendapatan"], ...report.byDay.map((d) => [d.date, d.transactions, d.itemsSold, d.revenue])];
    const items = [[], ["Menu", "Terjual", "Pendapatan"], ...report.byItem.map((i) => [i.name, i.quantity, i.revenue])];
    const staff = [[], ["Kasir", "Transaksi", "Pendapatan"], ...report.byStaff.map((s) => [s.name, s.transactions, s.revenue])];
    downloadCsv(`tooday-laporan-${mode === "harian" ? day : month}.csv`, [...header, ...summary, ...detail, ...items, ...staff]);
  }

  const showMethods = report && report.byMethod.some((m) => m.method !== "Tidak dicatat");

  return (
    <div className="report">
      <div className="report-controls no-print">
        <div className="report-mode" role="tablist" aria-label="Jenis laporan">
          {(["harian", "bulanan"] as const).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={mode === value} className="kasir-tab" onClick={() => setMode(value)}>
              {value === "harian" ? "Harian" : "Bulanan"}
            </button>
          ))}
        </div>
        {mode === "harian" ? (
          <label className="report-picker">
            Tanggal <input type="date" value={day} max={todayJakarta()} onChange={(event) => event.target.value && setDay(event.target.value)} />
          </label>
        ) : (
          <label className="report-picker">
            Bulan <input type="month" value={month} max={todayJakarta().slice(0, 7)} onChange={(event) => event.target.value && setMonth(event.target.value)} />
          </label>
        )}
        <div className="report-actions">
          <button type="button" className="kasir-chip" onClick={exportCsv} disabled={!report}>
            <Download aria-hidden="true" size={16} /> Unduh CSV
          </button>
          <button type="button" className="kasir-chip" onClick={() => window.print()} disabled={!report}>
            <Printer aria-hidden="true" size={16} /> Cetak
          </button>
        </div>
      </div>

      <header className="report-hero">
        <div className="report-hero-checker" aria-hidden="true" />
        <div className="report-hero-text">
          <p className="eyebrow">
            <Sparkles aria-hidden="true" size={14} /> Rekap {mode === "harian" ? "harian" : "bulanan"}
          </p>
          <h2 className="report-title">{title}</h2>
          <p className="report-note">
            Dihitung dari pembayaran yang dikonfirmasi kasir, menurut tanggal pembayaran diterima (WIB). Bukan bukti setoran bank; cocokkan dengan kas saat tutup.
          </p>
        </div>
        <Mascot name={mode === "harian" ? "girl-head" : "boy-with-cup"} reveal="now" className="report-hero-mascot" sizes="130px" />
      </header>

      {error && <p className="kasir-notice kasir-notice--warn">{error}</p>}
      {loading && !report && <p className="kasir-muted kasir-pad">Memuat laporan…</p>}

      {report && (
        <div className={loading ? "report-body is-loading" : "report-body"} aria-busy={loading}>
          <dl className="report-cards">
            <div className="report-card report-card--main">
              <dt>
                <TrendingUp aria-hidden="true" size={16} /> Pendapatan tercatat
              </dt>
              <dd className="tabular">{formatPrice(report.summary.revenue)}</dd>
            </div>
            <div className="report-card report-card--yellow">
              <dt>
                <Receipt aria-hidden="true" size={16} /> Transaksi
              </dt>
              <dd className="tabular">{report.summary.transactions}</dd>
            </div>
            <div className="report-card report-card--green">
              <dt>
                <Sparkles aria-hidden="true" size={16} /> Rata-rata / transaksi
              </dt>
              <dd className="tabular">{formatPrice(report.summary.avgTicket)}</dd>
            </div>
            <div className="report-card report-card--pink">
              <dt>
                <ShoppingBag aria-hidden="true" size={16} /> Item terjual
              </dt>
              <dd className="tabular">{report.summary.itemsSold}</dd>
            </div>
            <div className="report-card report-card--latte">
              <dt>
                <Archive aria-hidden="true" size={16} /> Batal / kedaluwarsa
              </dt>
              <dd className="tabular">
                {report.summary.cancelled} / {report.summary.expired}
              </dd>
            </div>
          </dl>

          {report.summary.transactions === 0 ? (
            <div className="kasir-empty report-empty">
              <Mascot name="boy-peeking" reveal="now" className="kasir-empty-mascot" sizes="120px" />
              <p>Belum ada pembayaran tercatat pada {mode === "harian" ? "tanggal" : "bulan"} ini.</p>
            </div>
          ) : (
            <div className="report-grid">
              {mode === "bulanan" && (
                <section className="report-section report-section--wide">
                  <h3>Per hari</h3>
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th scope="col">Tanggal</th>
                        <th scope="col">Transaksi</th>
                        <th scope="col">Item</th>
                        <th scope="col">Pendapatan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byDay.map((row) => (
                        <tr key={row.date}>
                          <th scope="row">
                            <button
                              type="button"
                              className="inline-link"
                              onClick={() => {
                                setDay(row.date);
                                setMode("harian");
                              }}
                            >
                              {dayLabel(row.date)}
                            </button>
                          </th>
                          <td className="tabular">{row.transactions}</td>
                          <td className="tabular">{row.itemsSold}</td>
                          <td className="tabular">{formatPrice(row.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Total</th>
                        <td className="tabular">{report.summary.transactions}</td>
                        <td className="tabular">{report.summary.itemsSold}</td>
                        <td className="tabular">{formatPrice(report.summary.revenue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <p className="kasir-muted kasir-small">Hari tanpa transaksi tidak ditampilkan. Ketuk tanggal untuk melihat rincian hariannya.</p>
                </section>
              )}

              <section className="report-section report-section--top">
                <h3>
                  <Trophy aria-hidden="true" size={18} /> Menu terlaris
                </h3>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th scope="col">Menu</th>
                      <th scope="col">Terjual</th>
                      <th scope="col">Pendapatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byItem.map((row, index) => (
                      <tr key={row.sku}>
                        <th scope="row">
                          <span className={`report-rank ${index < 3 ? `report-rank--${index + 1}` : ""}`} aria-label={`Peringkat ${index + 1}`}>
                            {index + 1}
                          </span>
                          {row.name}
                        </th>
                        <td className="tabular">{row.quantity}</td>
                        <td className="tabular">{formatPrice(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="report-section">
                <h3>Per kasir penerima</h3>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th scope="col">Kasir</th>
                      <th scope="col">Transaksi</th>
                      <th scope="col">Pendapatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byStaff.map((row) => (
                      <tr key={row.name}>
                        <th scope="row">{row.name}</th>
                        <td className="tabular">{row.transactions}</td>
                        <td className="tabular">{formatPrice(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {showMethods && (
                  <>
                    <h3>Per metode</h3>
                    <table className="report-table">
                      <tbody>
                        {report.byMethod.map((row) => (
                          <tr key={row.method}>
                            <th scope="row">{row.method}</th>
                            <td className="tabular">{row.transactions}</td>
                            <td className="tabular">{formatPrice(row.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </section>

              {mode === "harian" && (
                <>
                  <section className="report-section">
                    <h3>Per jam</h3>
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th scope="col">Jam</th>
                          <th scope="col">Transaksi</th>
                          <th scope="col">Pendapatan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.byHour.map((row) => (
                          <tr key={row.hour}>
                            <th scope="row" className="tabular">
                              {String(row.hour).padStart(2, "0")}.00–{String(row.hour).padStart(2, "0")}.59
                            </th>
                            <td className="tabular">{row.transactions}</td>
                            <td className="tabular">{formatPrice(row.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                  <section className="report-section">
                    <h3>Daftar transaksi ({report.transactions?.length ?? 0})</h3>
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th scope="col">Jam</th>
                          <th scope="col" className="is-left">Kode</th>
                          <th scope="col">Total</th>
                          <th scope="col" className="is-left">Kasir</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(report.transactions ?? []).map((row) => (
                          <tr key={`${row.code}-${row.paidAt}`}>
                            <td className="tabular is-left">{formatTime(row.paidAt)}</td>
                            <th scope="row" className="tabular">
                              {row.code}
                            </th>
                            <td className="tabular">{formatPrice(row.total)}</td>
                            <td>
                              {row.staff}
                              {row.method ? ` · ${row.method}` : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
