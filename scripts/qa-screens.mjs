// Inspeksi viewport: node scripts/qa-screens.mjs <outDir> [baseUrl]
// Memakai Edge terpasang (channel msedge) agar tidak perlu mengunduh browser.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = process.argv[2] ?? "qa-out";
const base = process.argv[3] ?? "http://localhost:3210";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const problems = [];

for (const width of [360, 390, 768, 1024, 1440]) {
  const height = width < 768 ? 760 : 900;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1024, isMobile: width < 768 });
  const page = await context.newPage();
  await page.addInitScript(() => sessionStorage.setItem("tooday-intro", "1"));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`[${width}] console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`[${width}] pageerror: ${error.message}`));
  page.on("requestfailed", (request) => problems.push(`[${width}] failed: ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`[${width}] ${response.status()}: ${response.url()}`);
  });

  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const shoot = width === 390 || width === 1440;
  let index = 0;
  for (let y = 0; y < total; y += Math.round(height * 0.9)) {
    await page.evaluate((value) => window.scrollTo(0, value), y);
    await page.waitForTimeout(shoot ? 700 : 150);
    if (shoot) {
      await page.screenshot({ path: `${out}/w${width}-${String(index).padStart(2, "0")}.jpg`, type: "jpeg", quality: 60 });
    }
    index += 1;
  }

  const report = await page.evaluate(() => {
    const doc = document.documentElement;
    const wide = [...document.querySelectorAll("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.right > doc.clientWidth + 1 || rect.left < -1);
      })
      .filter((element) => !element.closest(".marquee, .gallery-viewport, .menu-filters, .rail, .hero, .featured, .story, .pill, dialog"))
      .slice(0, 8)
      .map((element) => `${element.tagName}.${element.className}`);
    const broken = [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src);
    return { overflowX: doc.scrollWidth - doc.clientWidth, wide, broken, hidden: document.querySelectorAll("[data-reveal]:not(.is-in)").length };
  });
  console.log(width, JSON.stringify(report));
  await context.close();
}

await browser.close();
console.log(problems.length ? `PROBLEMS\n${[...new Set(problems)].join("\n")}` : "no console/network problems");
