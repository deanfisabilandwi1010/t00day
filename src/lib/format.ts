const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/** Harga null berarti belum diketahui dan tidak boleh tampil sebagai Rp0. */
export function formatPrice(price: number | null): string {
  return price === null ? "Tanya di outlet" : idr.format(price).replace(/\s/g, "");
}
