// Memotret hero di lebar sempit dan memeriksa tumpang-tindih catatan dengan produk:
// node scripts/qa-hero-mobile.mjs <outDir> [baseUrl]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = process.argv[2] ?? "qa-out";
const base = process.argv[3] ?? "http://localhost:3210";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });

for (const width of [320, 360, 390, 430, 768]) {
  const context = await browser.newContext({ viewport: { width, height: 760 }, hasTouch: true, isMobile: width < 768 });
  const page = await context.newPage();
  await page.addInitScript(() => sessionStorage.setItem("tooday-intro", "1"));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const gap = await page.evaluate(() => {
    const note = document.querySelector(".hero-note").getBoundingClientRect();
    const product = document.querySelector(".hero-product img").getBoundingClientRect();
    // Bagian atas gambar punya margin transparan sekitar 1,5% sebelum tutup cup.
    return Math.round(product.top + product.height * 0.015 - note.bottom);
  });
  console.log(width, `jarak catatan ke tutup cup: ${gap}px`);
  await page.locator(".hero-visual").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -90));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/hero-${width}.jpg`, type: "jpeg", quality: 70 });
  await context.close();
}

await browser.close();
