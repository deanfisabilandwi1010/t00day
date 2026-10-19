// Membuat/memperbarui akun staf dan keanggotaannya di satu outlet.
// Password dibaca dari env STAFF_PASSWORD agar tidak tersimpan di riwayat shell.
// Pemakaian:
//   STAFF_PASSWORD='...' node --env-file-if-exists=.env.local scripts/staff-create.mjs \
//     --email kasir@tooday.id --name "Kasir 1" --outlet tooday-main --role cashier
import postgres from "postgres";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const email = flag("--email")?.trim().toLowerCase();
const displayName = flag("--name")?.trim();
const outletSlug = flag("--outlet") ?? "tooday-main";
const role = flag("--role") ?? "cashier";
const password = process.env.STAFF_PASSWORD ?? "";

if (!email || !displayName || !["cashier", "manager"].includes(role)) {
  console.error("Wajib: --email, --name, --role cashier|manager (opsional --outlet).");
  process.exit(1);
}
if (password.length < 10) {
  console.error("STAFF_PASSWORD minimal 10 karakter.");
  process.exit(1);
}

// Format harus sama dengan verifyPassword di src/lib/server/auth.ts.
const N = 16384, r = 8, p = 1, keylen = 64;
const salt = randomBytes(16);
const hash = await scryptAsync(password, salt, keylen, { N, r, p });
const passwordHash = `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${Buffer.from(hash).toString("base64")}`;

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
try {
  await sql.begin(async (tx) => {
    const [outlet] = await tx`select id from tooday.outlets where slug = ${outletSlug}`;
    if (!outlet) throw new Error(`Outlet ${outletSlug} tidak ditemukan.`);
    const [user] = await tx`
      insert into tooday.staff_users (email, display_name, password_hash)
      values (${email}, ${displayName}, ${passwordHash})
      on conflict (email) do update set display_name = excluded.display_name, password_hash = excluded.password_hash, active = true
      returning id`;
    await tx`
      insert into tooday.staff_memberships (user_id, outlet_id, role)
      values (${user.id}, ${outlet.id}, ${role})
      on conflict (user_id, outlet_id) do update set role = excluded.role, active = true`;
    // Password berubah: semua sesi lama dicabut.
    await tx`update tooday.staff_sessions set revoked_at = now() where user_id = ${user.id} and revoked_at is null`;
  });
  console.log(`Staf ${email} (${role}) aktif di ${outletSlug}.`);
} finally {
  await sql.end();
}
