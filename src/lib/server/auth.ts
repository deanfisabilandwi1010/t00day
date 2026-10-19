import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextRequest, NextResponse } from "next/server";
import { db } from "./db";
import { ApiError } from "./http";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;

export const GUEST_COOKIE = "tooday_guest";
export const STAFF_COOKIE = "tooday_staff";
const GUEST_MAX_AGE = 60 * 60 * 24 * 30;
const STAFF_MAX_AGE = 60 * 60 * 14;

const secure = process.env.NODE_ENV === "production";

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

// ---------------------------------------------------------------------------
// Sesi tamu: tanpa form, dibuat saat pertama kali mengirim pesanan. Token acak di cookie HttpOnly,
// database hanya menyimpan hash-nya. Order hanya dapat dibaca oleh sesi yang membuatnya.
// ---------------------------------------------------------------------------
export async function findGuest(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(GUEST_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const [row] = await db()<{ id: string }[]>`
    update tooday.guest_sessions set last_seen_at = now()
    where token_hash = ${hashToken(token)}
    returning id`;
  return row?.id ?? null;
}

export async function requireGuest(request: NextRequest): Promise<string> {
  const id = await findGuest(request);
  if (!id) throw new ApiError(401, "UNAUTHORIZED", "Sesi pesananmu tidak ditemukan di perangkat ini.");
  return id;
}

/** Mengembalikan sesi yang ada atau membuat yang baru; cookie baru dipasang lewat applyGuestCookie. */
export async function ensureGuest(request: NextRequest): Promise<{ id: string; newToken: string | null }> {
  const existing = await findGuest(request);
  if (existing) return { id: existing, newToken: null };
  const token = newToken();
  const [row] = await db()<{ id: string }[]>`
    insert into tooday.guest_sessions (token_hash) values (${hashToken(token)}) returning id`;
  return { id: row.id, newToken: token };
}

export function applyGuestCookie(response: NextResponse, token: string | null) {
  if (!token) return;
  response.cookies.set(GUEST_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_MAX_AGE,
  });
}

// ---------------------------------------------------------------------------
// Staf: email + password (scrypt), sesi server-side dengan token acak. Hak akses dicek dari
// keanggotaan aktif per outlet pada setiap operasi, bukan dari cookie atau flag di browser.
// ---------------------------------------------------------------------------
export interface StaffIdentity {
  userId: string;
  sessionId: string;
  email: string;
  displayName: string;
  memberships: { outletId: string; slug: string; name: string; role: "cashier" | "manager" }[];
}

export interface StaffContext {
  userId: string;
  displayName: string;
  outletId: string;
  outletSlug: string;
  role: "cashier" | "manager";
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Hash tiruan untuk email yang tidak terdaftar, supaya waktu respons tidak membocorkan keberadaan akun.
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

export async function loginStaff(email: string, password: string): Promise<{ token: string; userId: string }> {
  const [user] = await db()<{ id: string; password_hash: string; active: boolean }[]>`
    select id, password_hash, active from tooday.staff_users where email = ${email.trim().toLowerCase()}`;
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) throw new ApiError(401, "UNAUTHORIZED", "Email atau password salah.");

  const [membership] = await db()`
    select 1 from tooday.staff_memberships where user_id = ${user.id} and active limit 1`;
  if (!membership) throw new ApiError(403, "FORBIDDEN", "Akun ini belum terdaftar di outlet mana pun.");

  const token = newToken();
  await db()`
    insert into tooday.staff_sessions (token_hash, user_id, expires_at)
    values (${hashToken(token)}, ${user.id}, now() + make_interval(secs => ${STAFF_MAX_AGE}))`;
  return { token, userId: user.id };
}

export function applyStaffCookie(response: NextResponse, token: string | null) {
  response.cookies.set(STAFF_COOKIE, token ?? "", {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: token ? STAFF_MAX_AGE : 0,
  });
}

export async function logoutStaff(request: NextRequest) {
  const token = request.cookies.get(STAFF_COOKIE)?.value;
  if (!token) return;
  await db()`update tooday.staff_sessions set revoked_at = now() where token_hash = ${hashToken(token)} and revoked_at is null`;
}

export async function findStaff(request: NextRequest): Promise<StaffIdentity | null> {
  const token = request.cookies.get(STAFF_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const rows = await db()<
    { session_id: string; user_id: string; email: string; display_name: string; outlet_id: string | null; slug: string | null; name: string | null; role: "cashier" | "manager" | null }[]
  >`
    select s.id as session_id, u.id as user_id, u.email, u.display_name,
           o.id as outlet_id, o.slug, o.name, m.role
    from tooday.staff_sessions s
    join tooday.staff_users u on u.id = s.user_id and u.active
    left join tooday.staff_memberships m on m.user_id = u.id and m.active
    left join tooday.outlets o on o.id = m.outlet_id
    where s.token_hash = ${hashToken(token)} and s.revoked_at is null and s.expires_at > now()
    order by o.name`;
  if (rows.length === 0) return null;
  return {
    userId: rows[0].user_id,
    sessionId: rows[0].session_id,
    email: rows[0].email,
    displayName: rows[0].display_name,
    memberships: rows
      .filter((row) => row.outlet_id)
      .map((row) => ({ outletId: row.outlet_id!, slug: row.slug!, name: row.name!, role: row.role! })),
  };
}

/** Staf yang login dan memiliki keanggotaan aktif di outlet yang diminta. */
export async function requireStaff(
  request: NextRequest,
  outletSlug: string,
  roles: readonly ("cashier" | "manager")[] = ["cashier", "manager"],
): Promise<StaffContext> {
  const staff = await findStaff(request);
  if (!staff) throw new ApiError(401, "UNAUTHORIZED", "Sesi staf berakhir. Silakan masuk lagi.");
  const membership = staff.memberships.find((entry) => entry.slug === outletSlug);
  if (!membership || !roles.includes(membership.role)) {
    throw new ApiError(403, "FORBIDDEN", "Akunmu tidak memiliki akses ke outlet ini.");
  }
  return {
    userId: staff.userId,
    displayName: staff.displayName,
    outletId: membership.outletId,
    outletSlug: membership.slug,
    role: membership.role,
  };
}

// ---------------------------------------------------------------------------
// Rate limit sederhana berbasis tabel (bekerja lintas instance serverless).
// ---------------------------------------------------------------------------
export async function rateLimit(bucket: string, max: number, windowSeconds: number, message: string) {
  const [row] = await db()<{ count: number }[]>`
    with recent as (
      select count(*)::int as count from tooday.rate_events
      where bucket = ${bucket} and created_at > now() - make_interval(secs => ${windowSeconds})
    ), ins as (
      insert into tooday.rate_events (bucket) select ${bucket} from recent where recent.count < ${max}
    )
    select count from recent`;
  if (row.count >= max) throw new ApiError(429, "RATE_LIMITED", message);
  // Bersihkan baris lama sesekali.
  if (Math.random() < 0.02) await db()`delete from tooday.rate_events where created_at < now() - interval '1 day'`;
}
