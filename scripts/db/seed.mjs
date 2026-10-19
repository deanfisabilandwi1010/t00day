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

    let order = 0;
    for (const item of menu) {
      order += 10;
      await tx`
        insert into tooday.menu_items (outlet_id, sku, name, category, description, price_rupiah, image_url, sort_order)
        values (${outlet.id}, ${item.id}, ${item.name}, ${item.category}, ${PUBLIC_COPY[item.id]?.description ?? null}, ${item.price}, ${item.image}, ${order})
        on conflict (outlet_id, sku) do update set
          name = excluded.name, category = excluded.category, description = excluded.description, image_url = excluded.image_url,
          sort_order = excluded.sort_order, updated_at = now(), version = tooday.menu_items.version + 1`;
    }
    console.log(`Outlet "${slug}" dan ${menu.length} menu siap. Penerimaan order: ${open ? "DIBUKA" : "ditutup"}.`);
  });
} finally {
  await sql.end();
}
