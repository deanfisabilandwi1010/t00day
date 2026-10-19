// Menjalankan file SQL di supabase/migrations yang belum tercatat, berurutan, masing-masing dalam transaksi.
// Pemakaian: node --env-file-if-exists=.env.local scripts/db/migrate.mjs
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL belum diisi.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const dir = path.resolve("supabase/migrations");

try {
  await sql`create schema if not exists tooday_meta`;
  await sql`revoke all on schema tooday_meta from public`;
  await sql`create table if not exists tooday_meta.migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql`select name from tooday_meta.migrations`).map((row) => row.name));

  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const body = readFileSync(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into tooday_meta.migrations (name) values (${file})`;
    });
    console.log(`✓ ${file}`);
  }
  console.log("Migration selesai.");
} finally {
  await sql.end();
}
