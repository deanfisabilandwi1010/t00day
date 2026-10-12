// Memeriksa rel kategori horizontal dan arah galeri: node scripts/qa-rail.mjs <outDir> [baseUrl]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = process.argv[2] ?? "qa-out";
const base = process.argv[3] ?? "http://localhost:3210";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const results = [];
const check = (name, pass, extra = "") => results.push(`${pass ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
const SKIP = () => sessionStorage.setItem("tooday-intro", "1");
const trackX = (page, selector) => page.evaluate((sel) => Math.round(new DOMMatrixReadOnly(getComputedStyle(document.querySelector(sel)).transform).m41), selector);

// ---------- Desktop: seksi menempel, scroll menggeser panel ----------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(SKIP);
  await page.goto(base, { waitUntil: "networkidle" });
  const rail = await page.evaluate(() => {
    const element = document.querySelector(".rail");
    return { top: element.getBoundingClientRect().top + window.scrollY, height: element.offsetHeight };
  });
  const travel = rail.height - 900;
  const seen = [];
  for (const [index, fraction] of [0, 0.34, 0.67, 1].entries()) {
    await page.evaluate((y) => window.scrollTo(0, y), rail.top + travel * fraction);
    await page.waitForTimeout(900);
    seen.push(await trackX(page, ".rail-track"));
    await page.screenshot({ path: `${out}/rail-d-${index}.jpg`, type: "jpeg", quality: 62 });
  }
  check("desktop: panel bergeser ke kiri mengikuti scroll", seen.every((x, i) => i === 0 || x < seen[i - 1] - 800), seen.join(" → "));
  check("desktop: panel terakhir pas di layar", Math.abs(seen[3] + 1440 * 3) < 4, String(seen[3]));
  check("desktop: indikator aktif = kategori terakhir", (await page.locator(".rail-progress [aria-current=step]").innerText()) === "Cemal-cemil");
  check("desktop: tidak ada overflow horizontal", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);

  await page.locator(".rail-progress button", { hasText: "Matcha" }).click();
  await page.waitForTimeout(1800);
  check("desktop: klik indikator melompat ke panel Matcha", Math.abs((await trackX(page, ".rail-track")) + 1440) < 60, String(await trackX(page, ".rail-track")));

  await page.locator(".rail-panel--olive .pill").click();
  await page.waitForTimeout(2200);
  check("desktop: 'Lihat di menu' memasang filter Matcha", (await page.locator(".menu-filters .chip[aria-pressed=true]").innerText()).startsWith("Matcha"));
  check("desktop: halaman bergulir ke menu", Math.abs(await page.evaluate(() => document.querySelector("#menu").getBoundingClientRect().top)) < 160);

  // Galeri mengikuti arah scroll
  await page.locator(".gallery-viewport").evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 300));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(800);
  const a1 = await trackX(page, ".gallery-track");
  await page.waitForTimeout(1200);
  const a2 = await trackX(page, ".gallery-track");
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(1600);
  const b1 = await trackX(page, ".gallery-track");
  await page.waitForTimeout(1200);
  const b2 = await trackX(page, ".gallery-track");
  check("galeri: jalan ke kiri setelah scroll turun", a2 < a1, `${a1} → ${a2}`);
  check("galeri: berbalik ke kanan setelah scroll naik", b2 > b1, `${b1} → ${b2}`);
  check("desktop: tanpa error halaman", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------- Mobile: carousel geser ----------
{
  const context = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.addInitScript(SKIP);
  await page.goto(base, { waitUntil: "networkidle" });
  const info = await page.evaluate(() => {
    const rail = document.querySelector(".rail");
    const track = document.querySelector(".rail-track");
    return { railHeight: rail.offsetHeight, sticky: getComputedStyle(document.querySelector(".rail-sticky")).position, scrollable: track.scrollWidth > track.clientWidth + 50, overflow: getComputedStyle(track).overflowX };
  });
  check("mobile: seksi tidak menempel", info.sticky === "relative" && info.railHeight < 1000, JSON.stringify(info));
  check("mobile: panel bisa digeser menyamping", info.scrollable && info.overflow === "auto");
  await page.locator(".rail").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/rail-m-0.jpg`, type: "jpeg", quality: 65 });
  await page.locator(".rail-track").evaluate((element) => element.scrollTo({ left: element.clientWidth * 0.9 * 2, behavior: "instant" }));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/rail-m-1.jpg`, type: "jpeg", quality: 65 });
  check("mobile: tidak ada overflow horizontal halaman", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);
  await context.close();
}

// ---------- Reduced motion: carousel juga di desktop ----------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  check("reduced-motion: seksi tidak menempel", (await page.evaluate(() => getComputedStyle(document.querySelector(".rail-sticky")).position)) === "relative");
  check("reduced-motion: konten masuk-samping tampil", (await page.evaluate(() => [...document.querySelectorAll('[data-reveal="left"], [data-reveal="right"]')].filter((element) => getComputedStyle(element).opacity !== "1").length)) === 0);
  await context.close();
}

await browser.close();
console.log(results.join("\n"));
process.exit(results.some((line) => line.startsWith("FAIL")) ? 1 : 0);
