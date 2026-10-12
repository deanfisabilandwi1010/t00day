// Memeriksa layar pembuka dan galeri berjalan: node scripts/qa-intro.mjs <outDir> [baseUrl]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = process.argv[2] ?? "qa-out";
const base = process.argv[3] ?? "http://localhost:3210";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const results = [];
const check = (name, pass, extra = "") => results.push(`${pass ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
const loading = (page) => page.evaluate(() => document.documentElement.classList.contains("is-loading"));

for (const [label, viewport] of [["d", { width: 1440, height: 900 }], ["m", { width: 390, height: 760 }]]) {
  const context = await browser.newContext({ viewport, isMobile: label === "m", hasTouch: label === "m" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const start = Date.now();
  await page.goto(base, { waitUntil: "commit" });
  for (let frame = 0; frame < 12; frame++) {
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/intro-${label}-${String(frame).padStart(2, "0")}.jpg`, type: "jpeg", quality: 60 });
    if (frame === 1) check(`[${label}] layar pembuka tampil saat kunjungan pertama`, await loading(page));
  }
  await page.waitForFunction(() => !document.documentElement.classList.contains("is-loading"), null, { timeout: 8000 });
  check(`[${label}] layar pembuka selesai sendiri`, true, `${Date.now() - start} ms sejak navigasi`);
  check(`[${label}] scroll terbuka kembali`, (await page.evaluate(() => document.documentElement.style.overflow)) === "");
  check(`[${label}] judul hero tampil`, await page.locator("#hero-title").isVisible());

  await page.reload({ waitUntil: "commit" });
  await page.waitForTimeout(400);
  check(`[${label}] tidak tampil lagi di sesi yang sama`, !(await loading(page)));

  // Galeri berjalan
  await page.waitForLoadState("networkidle");
  await page.locator(".gallery-viewport").scrollIntoViewIfNeeded();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(600);
  const readX = () => page.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".gallery-track")).transform).m41);
  const x1 = await readX();
  await page.waitForTimeout(1200);
  const x2 = await readX();
  check(`[${label}] galeri bergerak sendiri`, x2 < x1 - 20, `${Math.round(x1)} → ${Math.round(x2)}`);
  await page.locator(".gallery-viewport").evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 160));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/gallery-${label}.jpg`, type: "jpeg", quality: 65 });
  check(`[${label}] tanpa error halaman`, errors.length === 0, errors.join(" | "));
  await context.close();
}

// Lewati dengan tombol
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector(".loader") && document.readyState !== "loading");
  await page.waitForTimeout(700);
  await page.keyboard.press("Enter");
  const start = Date.now();
  await page.waitForFunction(() => !document.documentElement.classList.contains("is-loading"), null, { timeout: 6000 });
  check("tombol keyboard melewati layar pembuka", Date.now() - start < 1700, `${Date.now() - start} ms`);
  await page.close();
}

// Reduced motion dan tanpa JS
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  check("reduced-motion: tanpa layar pembuka", !(await loading(page)));
  await page.waitForLoadState("networkidle");
  check("reduced-motion: galeri tidak berjalan", !(await page.locator(".gallery-viewport.is-live").count()));
  await context.close();
}
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "load" });
  check("tanpa JS: layar pembuka tidak menutupi halaman", !(await page.locator(".loader").isVisible()));
  await context.close();
}

await browser.close();
console.log(results.join("\n"));
process.exit(results.some((line) => line.startsWith("FAIL")) ? 1 : 0);
