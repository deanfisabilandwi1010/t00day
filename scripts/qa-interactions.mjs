// Uji alur utama: node scripts/qa-interactions.mjs <outDir> [baseUrl]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = process.argv[2] ?? "qa-out";
const base = process.argv[3] ?? "http://localhost:3210";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const results = [];
const check = (name, pass, extra = "") => results.push(`${pass ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 62 });

// ---------- Desktop ----------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => sessionStorage.setItem("tooday-intro", "1"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto(base, { waitUntil: "networkidle" });

  // Filter menu
  await page.locator("#menu").scrollIntoViewIfNeeded();
  await page.locator(".menu-filters .chip", { hasText: "Matcha" }).click();
  await page.waitForTimeout(400);
  check("filter Matcha menampilkan 3 kartu", (await page.locator(".menu-grid .card").count()) === 3);
  check("status filter diumumkan", (await page.locator("#menu [role=status]").innerText()).includes("3 menu kategori Matcha"));
  await shot(page, "d-menu-matcha");
  await page.locator(".menu-filters .chip", { hasText: "Semua" }).click();
  check("filter Semua menampilkan 14 kartu", (await page.locator(".menu-grid .card").count()) === 14);
  await page.locator(".menu-grid").scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await shot(page, "d-menu-all");

  // Dialog detail dengan keyboard
  const card = page.locator(".card", { hasText: "Dirty Tooday Coffe" }).locator(".card-hit");
  await card.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  check("dialog detail terbuka", await page.locator("dialog[open] #product-dialog-title").isVisible());
  check("fokus berada di dalam dialog", await page.evaluate(() => !!document.activeElement?.closest("dialog[open]")));
  await shot(page, "d-dialog");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  check("Escape menutup dialog", (await page.locator("dialog[open]").count()) === 0);
  check("fokus kembali ke kartu pemicu", await card.evaluate((element) => element === document.activeElement));
  check("scroll halaman tidak terkunci setelah tutup", (await page.evaluate(() => document.documentElement.style.overflow)) === "");

  // Simpan + ringkasan
  await page.locator(".card", { hasText: "Dirty Tooday Coffe" }).locator(".card-add").click();
  const matchaAdd = page.locator(".card", { has: page.locator(".card-name", { hasText: /^Matcha Latte$/ }) }).locator(".card-add");
  await matchaAdd.click();
  await matchaAdd.click();
  await page.waitForTimeout(1000);
  check("penghitung pilihan = 3", (await page.locator(".order-count").innerText()).trim() === "3");
  await page.locator("#order-toggle").click();
  await page.waitForTimeout(500);
  const total = await page.locator(".summary-total strong").innerText();
  check("total = Rp90.000 (20.000 + 2 x 35.000)", total === "Rp90.000", total);
  await shot(page, "d-summary");
  await page.locator(".summary-list .stepper button[aria-label=Kurangi]").first().click();
  await page.waitForTimeout(200);
  check("qty 0 menghapus baris", (await page.locator(".summary-list li").count()) === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // Menu unggulan membuka dialog
  await page.locator("#pilihan").scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await shot(page, "d-featured");
  await page.locator(".price-tag").first().click();
  await page.waitForTimeout(500);
  check("label harga unggulan membuka detail", (await page.locator("dialog[open] #product-dialog-title").innerText()) === "Matcha Latte");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.locator("#cerita").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await shot(page, "d-story");

  // Pairing
  await page.locator("#pairing").scrollIntoViewIfNeeded();
  await page.locator(".pairing-picker .chip", { hasText: "Dark Choco" }).click();
  await page.waitForTimeout(900);
  check("pairing mengganti minuman", (await page.locator(".pairing-lines dt").first().innerText()) === "Dark Choco");
  await shot(page, "d-pairing");

  await page.locator("#kunjungi").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await shot(page, "d-cta");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1600);
  await shot(page, "d-hero");

  // Tautan
  const dead = await page.evaluate(() =>
    [...document.querySelectorAll("a")]
      .map((anchor) => anchor.getAttribute("href"))
      .filter((href) => !href || href === "#" || (href.startsWith("#") && !document.querySelector(href))),
  );
  check("tidak ada tautan mati", dead.length === 0, dead.join(","));
  check("tanpa error konsol (desktop)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------- Mobile ----------
{
  const context = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.addInitScript(() => sessionStorage.setItem("tooday-intro", "1"));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot(page, "m-hero");
  const burger = page.getByRole("button", { name: "Buka navigasi" });
  await burger.click();
  await page.waitForTimeout(500);
  check("nav mobile terbuka", await page.locator("dialog[open] .mobile-nav").isVisible());
  await shot(page, "m-nav");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  check("Escape menutup nav mobile", (await page.locator("dialog[open]").count()) === 0);
  check("fokus kembali ke tombol burger", await burger.evaluate((element) => element === document.activeElement));
  await burger.click();
  await page.waitForTimeout(400);
  await page.locator(".mobile-nav li a", { hasText: "Menu" }).click();
  await page.waitForTimeout(1800);
  const menuTop = await page.evaluate(() => Math.round(document.querySelector("#menu").getBoundingClientRect().top));
  check("tautan nav mobile menggulir ke #menu", Math.abs(menuTop) < 120, `top=${menuTop}`);
  await page.locator(".menu-grid").scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await shot(page, "m-menu");
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, a")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const skip = element.classList.contains("skip-link") || element.classList.contains("inline-link");
        return rect.width > 0 && !skip && (rect.height < 43 || rect.width < 43);
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return `${element.className || element.textContent.trim().slice(0, 20)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
      }),
  );
  check("target sentuh minimal 44px", small.length === 0, [...new Set(small)].slice(0, 8).join("; "));
  await page.locator(".card-hit").nth(5).click();
  await page.waitForTimeout(700);
  await shot(page, "m-dialog");
  await context.close();
}

// ---------- Reduced motion ----------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.addInitScript(() => sessionStorage.setItem("tooday-intro", "1"));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => ({
    lenis: document.documentElement.classList.contains("lenis"),
    hidden: [...document.querySelectorAll("[data-reveal]")].filter((element) => getComputedStyle(element).opacity !== "1").length,
    marquee: getComputedStyle(document.querySelector(".marquee-track")).animationName,
    doodles: [...document.querySelectorAll(".doodle path")].filter((path) => getComputedStyle(path).strokeDashoffset !== "0px" && getComputedStyle(path).strokeDashoffset !== "0").length,
  }));
  check("reduced-motion: Lenis nonaktif", !state.lenis);
  check("reduced-motion: semua konten reveal tampil", state.hidden === 0, `${state.hidden} tersembunyi`);
  check("reduced-motion: marquee statis", state.marquee === "none", state.marquee);
  check("reduced-motion: coretan tampil utuh", state.doodles === 0, String(state.doodles));
  await context.close();
}

// ---------- Tanpa JavaScript ----------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.addInitScript(() => sessionStorage.setItem("tooday-intro", "1"));
  await page.goto(base, { waitUntil: "load" });
  const text = await page.locator("#menu").innerText();
  check("tanpa JS: menu dan harga terbaca", text.includes("Hi Tooday Coffe") && text.includes("Rp22.000"));
  check("tanpa JS: html tidak diberi kelas js", !(await page.locator("html.js").count()));
  await context.close();
}

await browser.close();
console.log(results.join("\n"));
process.exit(results.some((line) => line.startsWith("FAIL")) ? 1 : 0);
