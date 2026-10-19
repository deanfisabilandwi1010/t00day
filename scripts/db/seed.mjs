// Mengisi outlet dan menu dari src/data/menu.json.
//
// PERHATIAN: harga di menu.json ditranskripsi dari foto papan menu dan BELUM diverifikasi pemilik.
// Untuk produksi, jalankan dengan --closed (default) lalu verifikasi harga sebelum membuka order.
// Pemakaian: node --env-file-if-exists=.env.local scripts/db/seed.mjs [--open] [--slug tooday-main] [--name Tooday]
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { PUBLIC_COPY } from "../../src/data/menu-copy.ts";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const slug = flag("--slug", "tooday-main");
const name = flag("--name", "Tooday");
const open = args.includes("--open");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL belum diisi.");
  process.exit(1);
}

const menu = JSON.parse(readFileSync("src/data/menu.json", "utf8"));
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  await sql.begin(async (tx) => {
    const [outlet] = await tx`
      insert into tooday.outlets (slug, name, accepting_orders)
      values (${slug}, ${name}, ${open})
      on conflict (slug) do update set name = excluded.name
      returning id`;
    await tx`insert into tooday.service_state (outlet_id) values (${outlet.id}) on conflict do nothing`;
    await tx`insert into tooday.outlet_counters (outlet_id) values (${outlet.id}) on conflict do nothing`;

    // Seed hanya mengisi yang belum ada. Menu yang sudah diubah manager lewat "Kelola menu" tidak ditimpa.
    const sectionIds = new Map();
    let sectionOrder = 0;
    for (const category of [...new Set(menu.map((item) => item.category))]) {
      sectionOrder += 10;
      await tx`
        insert into tooday.menu_sections (outlet_id, name, sort_order)
        select ${outlet.id}, ${category}, ${sectionOrder}
        where not exists (select 1 from tooday.menu_sections where outlet_id = ${outlet.id} and lower(name) = lower(${category}))`;
      const [section] = await tx`
        select id from tooday.menu_sections where outlet_id = ${outlet.id} and lower(name) = lower(${category})`;
      sectionIds.set(category, section.id);
    }
    let order = 0;
    for (const item of menu) {
      order += 10;
      await tx`
        insert into tooday.menu_items (outlet_id, sku, name, section_id, description, price_rupiah, image_url, sort_order)
        values (${outlet.id}, ${item.id}, ${item.name}, ${sectionIds.get(item.category)}, ${PUBLIC_COPY[item.id]?.description ?? null}, ${item.price}, ${item.image}, ${order})
        on conflict (outlet_id, sku) do nothing`;
    }
    console.log(`Outlet "${slug}" dan ${menu.length} menu siap. Penerimaan order: ${open ? "DIBUKA" : "ditutup"}.`);
  });
} finally {
  await sql.end();
}
