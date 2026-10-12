// Memeriksa kursor maskot: node scripts/qa-cursor.mjs [baseUrl]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3210";
const browser = await chromium.launch({ channel: "msedge" });

const read = (page) =>
  page.evaluate(() => ({
    body: getComputedStyle(document.body).cursor,
    link: getComputedStyle(document.querySelector(".pill")).cursor,
    button: getComputedStyle(document.querySelector(".card-add")).cursor,
    gallery: getComputedStyle(document.querySelector(".gallery-strip")).cursor,
  }));

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await desktop.goto(base, { waitUntil: "networkidle" });
console.log("desktop", JSON.stringify(await read(desktop), null, 1));
for (const file of ["tooday-default.png", "tooday-default@2x.png", "tooday-pointer.png", "tooday-pointer@2x.png"]) {
  const response = await desktop.request.get(`${base}/assets/tooday/cursor/${file}`);
  console.log(file, response.status(), response.headers()["content-type"]);
}

const context = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });
const mobile = await context.newPage();
await mobile.goto(base, { waitUntil: "networkidle" });
console.log("touch", JSON.stringify(await read(mobile)));

await browser.close();
