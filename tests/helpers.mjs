// Helper integration test: server Next.js yang berjalan + database Postgres yang sama.
import postgres from "postgres";
import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { promisify } from "node:util";

export const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3100";
export const sql = postgres(process.env.DATABASE_URL, { max: 4, prepare: false, onnotice: () => {} });
const scryptAsync = promisify(scrypt);

export const PASSWORD = "uji-coba-kasir-123";

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${Buffer.from(hash).toString("base64")}`;
}

/** Klien HTTP dengan cookie jar sendiri: satu instance = satu perangkat/browser. */
export class Client {
  constructor(name = "client") {
    this.name = name;
    this.cookies = new Map();
    // Tiap klien uji memakai IP berbeda agar rate limit per jaringan tidak saling mengganggu.
    // Di Netlify, IP diambil dari x-nf-client-connection-ip yang diisi platform, bukan header ini.
    this.ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  }

  async request(method, path, body, { origin = BASE, headers = {} } = {}) {
    const cookie = [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; ");
    const response = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(origin ? { origin } : {}),
        ...(cookie ? { cookie } : {}),
        "x-forwarded-for": this.ip,
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const index = pair.indexOf("=");
      const key = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (value === "" || /max-age=0/i.test(line)) this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: response.status, data, headers: response.headers };
  }

  get(path) {
    return this.request("GET", path);
  }
  post(path, body, options) {
    return this.request("POST", path, body, options);
  }
  patch(path, body, options) {
    return this.request("PATCH", path, body, options);
  }
}

export const MENU = [
  { sku: "kopi-a", name: "Kopi A", category: "Coffee", price: 22000 },
  { sku: "matcha-b", name: "Matcha B", category: "Matcha", price: 35000 },
  { sku: "teok-c", name: "Teok C", category: "Cemal-cemil", price: 20000 },
  { sku: "tanpa-harga", name: "Tanpa Harga", category: "Non-Coffee", price: null },
];

/** Outlet baru yang terisolasi untuk satu skenario, lengkap dengan menu dan dua staf. */
export async function createFixture({ accepting = true } = {}) {
  const slug = `t-${randomBytes(5).toString("hex")}`;
  const [outlet] = await sql`
    insert into tooday.outlets (slug, name, accepting_orders) values (${slug}, ${"Outlet Uji " + slug}, ${accepting}) returning id`;
  await sql`insert into tooday.service_state (outlet_id) values (${outlet.id})`;
  await sql`insert into tooday.outlet_counters (outlet_id) values (${outlet.id})`;
  let sort = 0;
  for (const item of MENU) {
    sort += 1;
    await sql`
      insert into tooday.menu_items (outlet_id, sku, name, category, price_rupiah, sort_order)
      values (${outlet.id}, ${item.sku}, ${item.name}, ${item.category}, ${item.price}, ${sort})`;
  }
  await sql`insert into tooday.dining_tables (outlet_id, code) values (${outlet.id}, 'M03')`;

  const passwordHash = await hashPassword(PASSWORD);
  const staff = [];
  for (const label of ["kasir1", "kasir2"]) {
    const email = `${label}-${slug}@uji.local`;
    const [user] = await sql`
      insert into tooday.staff_users (email, display_name, password_hash) values (${email}, ${label}, ${passwordHash}) returning id`;
    await sql`insert into tooday.staff_memberships (user_id, outlet_id, role) values (${user.id}, ${outlet.id}, 'cashier')`;
    staff.push({ email, id: user.id });
  }
  return { slug, outletId: outlet.id, staff };
}

export async function loginAs(email) {
  const client = new Client(email);
  const result = await client.post("/api/kasir/login", { email, password: PASSWORD });
  if (result.status !== 200) throw new Error(`Login gagal ${result.status}: ${JSON.stringify(result.data)}`);
  return client;
}

const PRICES = Object.fromEntries(MENU.map((item) => [item.sku, item.price]));

/** Payload order yang sah berdasarkan harga fixture. */
export function orderPayload(slug, lines = [{ sku: "kopi-a", quantity: 1 }], extra = {}) {
  const full = lines.map((line) => ({ ...line, expectedUnitPrice: line.expectedUnitPrice ?? PRICES[line.sku] ?? 1 }));
  return {
    outlet: slug,
    idempotencyKey: randomUUID(),
    orderType: "TAKEAWAY",
    lines: full,
    expectedTotal: full.reduce((sum, line) => sum + line.expectedUnitPrice * line.quantity, 0),
    ...extra,
  };
}

export async function submit(client, slug, lines, extra) {
  return client.post("/api/orders", orderPayload(slug, lines, extra));
}

export async function staffAction(client, slug, order, action, extra = {}) {
  return client.post(`/api/kasir/orders/${order.id}/action`, {
    outlet: slug,
    action,
    expectedVersion: order.version,
    idempotencyKey: randomUUID(),
    ...extra,
  });
}

export async function snapshot(client, slug) {
  const result = await client.get(`/api/kasir/snapshot?outlet=${slug}`);
  if (result.status !== 200) throw new Error(`Snapshot gagal ${result.status}`);
  return result.data;
}
