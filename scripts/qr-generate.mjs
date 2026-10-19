// Membuat file QR (PNG + SVG) untuk URL pemesanan dari domain yang dikonfigurasi.
// Pemakaian: NEXT_PUBLIC_SITE_URL=https://domain-final node scripts/qr-generate.mjs [--outlet tooday-main] [--table M03] [--out docs/order-system/qr]
// QR hanya tautan masuk; bukan bukti kehadiran di outlet. Uji pindai dengan minimal dua HP sebelum dicetak.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const site = process.env.NEXT_PUBLIC_SITE_URL;
if (!site) {
  console.error("Isi NEXT_PUBLIC_SITE_URL dengan domain final, mis. https://toodaycoffe.netlify.app");
  process.exit(1);
}
const outlet = flag("--outlet", process.env.NEXT_PUBLIC_DEFAULT_OUTLET ?? "tooday-main");
const table = flag("--table", null);
const out = path.resolve(flag("--out", "docs/order-system/qr"));

const url = new URL("/order", site);
url.searchParams.set("outlet", outlet);
if (table) url.searchParams.set("table", table);
url.searchParams.set("source", "qr");
const target = url.toString();

const options = { errorCorrectionLevel: "M", margin: 4, color: { dark: "#202817", light: "#ffffff" } };
const name = `tooday-qr-${outlet}${table ? `-${table}` : ""}`;
mkdirSync(out, { recursive: true });
await QRCode.toFile(path.join(out, `${name}.png`), target, { ...options, width: 1200 });
writeFileSync(path.join(out, `${name}.svg`), await QRCode.toString(target, { ...options, type: "svg" }));
console.log(`QR untuk ${target}\n→ ${path.join(out, name)}.png / .svg`);
