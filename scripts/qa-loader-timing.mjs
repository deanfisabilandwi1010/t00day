// Mengukur berapa lama layar pembuka TERLIHAT (sejak first contentful paint sampai halaman mulai terbuka),
// di desktop dan di ponsel dengan jaringan/CPU diperlambat: node scripts/qa-loader-timing.mjs [baseUrl]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3210";
const browser = await chromium.launch({ channel: "msedge" });

const PROFILES = [
  { label: "desktop", viewport: { width: 1440, height: 900 }, mobile: false },
  { label: "ponsel, jaringan cepat", viewport: { width: 390, height: 760 }, mobile: true },
  { label: "ponsel, 4G lambat + CPU 4x lebih lambat", viewport: { width: 390, height: 760 }, mobile: true, slow: true },
];

for (const profile of PROFILES) {
  const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.mobile, hasTouch: profile.mobile });
  const page = await context.newPage();
  if (profile.slow) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await page.goto(base, { waitUntil: "commit" });
  await page.waitForFunction(() => document.documentElement.classList.contains("is-revealing"), null, { timeout: 30000, polling: 30 });
  const timing = await page.evaluate(() => {
    const paint = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
    return { paint: paint === null ? null : Math.round(paint), reveal: Math.round(performance.now()) };
  });
  const visible = timing.paint === null ? "?" : timing.reveal - timing.paint;
  console.log(`${profile.label}: paint pertama ${timing.paint} ms, mulai terbuka ${timing.reveal} ms → pembuka terlihat ${visible} ms`);
  await context.close();
}

await browser.close();
