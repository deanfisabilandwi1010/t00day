import "server-only";
import { MENU_IMAGE_URLS, UPLOADED_PHOTO } from "@/lib/order/menu-images";
import type { MenuAdminInput } from "@/lib/validation/order";
import type { StaffContext } from "./auth";
import { bumpFeed, db, withOutletLock, type Tx } from "./db";
import { ApiError } from "./http";
import { logEvent } from "./queue-service";

/**
 * Kelola menu oleh manager: section dan item. Tidak ada hapus permanen karena pesanan lama
 * mereferensikan menu; "arsipkan" menyembunyikannya dari halaman pesan. Perubahan harga hanya
 * berlaku untuk pesanan baru (pesanan lama menyimpan snapshot harga).
 */

export interface AdminSection {
  id: string;
  name: string;
  active: boolean;
  items: AdminItem[];
}

export interface AdminItem {
  sku: string;
  name: string;
  description: string | null;
  price: number | null;
  image: string | null;
  active: boolean;
  available: boolean;
}

export async function menuAdmin(staff: StaffContext): Promise<{ sections: AdminSection[]; uploads: { url: string; label: string | null }[] }> {
  const sql = db();
  const sections = await sql<{ id: string; name: string; active: boolean }[]>`
    select id, name, active from tooday.menu_sections where outlet_id = ${staff.outletId}
    order by active desc, sort_order, name`;
  const items = await sql<{ section_id: string; sku: string; name: string; description: string | null; price_rupiah: number | null; image_url: string | null; active: boolean; available: boolean }[]>`
    select section_id, sku, name, description, price_rupiah, image_url, active, available
    from tooday.menu_items where outlet_id = ${staff.outletId}
    order by active desc, sort_order, name`;
  const uploads = await sql<{ id: string; label: string | null }[]>`
    select id, label from tooday.menu_images where outlet_id = ${staff.outletId} order by created_at desc limit 40`;
  return {
    uploads: uploads.map((upload) => ({ url: `/api/menu-images/${upload.id}`, label: upload.label })),
    sections: sections.map((section) => ({
      ...section,
      items: items
        .filter((item) => item.section_id === section.id)
        .map((item) => ({
          sku: item.sku,
          name: item.name,
          description: item.description,
          price: item.price_rupiah,
          image: item.image_url,
          active: item.active,
          available: item.available,
        })),
    })),
  };
}

function slugify(name: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  return base || "menu";
}

async function uniqueSku(tx: Tx, outletId: string, name: string) {
  const base = slugify(name);
  const taken = new Set(
    (await tx<{ sku: string }[]>`select sku from tooday.menu_items where outlet_id = ${outletId} and sku like ${base + "%"}`).map((row) => row.sku),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Foto menu hanya boleh dari daftar foto produk atau foto unggahan outlet ini sendiri. */
async function checkImage(tx: Tx, outletId: string, image: string | null | undefined) {
  if (!image || MENU_IMAGE_URLS.includes(image)) return;
  const id = UPLOADED_PHOTO.exec(image)?.[1];
  if (id) {
    const [row] = await tx`select 1 from tooday.menu_images where id = ${id} and outlet_id = ${outletId}`;
    if (row) return;
  }
  throw new ApiError(400, "VALIDATION", "Foto harus dipilih dari daftar foto menu Tooday atau foto yang sudah diunggah.");
}

// ---------------------------------------------------------------------------
// Unggah foto
// ---------------------------------------------------------------------------
const MAX_PHOTO_BYTES = 1_500_000;

/** Tipe ditentukan dari isi file (magic bytes), bukan dari header yang dikirim browser. */
function sniffImage(bytes: Buffer): "image/webp" | "image/jpeg" | "image/png" | null {
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

export async function saveMenuImage(staff: StaffContext, bytes: Buffer, label: string | null) {
  if (bytes.length === 0) throw new ApiError(400, "VALIDATION", "File foto kosong.");
  if (bytes.length > MAX_PHOTO_BYTES) throw new ApiError(413, "VALIDATION", "Foto terlalu besar (maks. 1,5 MB setelah dikecilkan).");
  const type = sniffImage(bytes);
  if (!type) throw new ApiError(415, "VALIDATION", "File bukan foto JPG, PNG, atau WebP.");
  const [row] = await db()<{ id: string }[]>`
    insert into tooday.menu_images (outlet_id, content_type, bytes, byte_size, label, created_by)
    values (${staff.outletId}, ${type}, ${bytes}, ${bytes.length}, ${label}, ${staff.userId})
    returning id`;
  return { url: `/api/menu-images/${row.id}` };
}

export async function readMenuImage(id: string) {
  const [row] = await db()<{ content_type: string; bytes: Buffer }[]>`
    select content_type, bytes from tooday.menu_images where id = ${id}`;
  return row ?? null;
}

async function sectionOf(tx: Tx, outletId: string, id: string) {
  const [section] = await tx<{ id: string; name: string; sort_order: number; active: boolean }[]>`
    select id, name, sort_order, active from tooday.menu_sections where id = ${id} and outlet_id = ${outletId} for update`;
  if (!section) throw new ApiError(404, "NOT_FOUND", "Section tidak ditemukan.");
  return section;
}

async function nameTaken(tx: Tx, outletId: string, name: string, exceptId: string | null) {
  const [row] = await tx`
    select 1 from tooday.menu_sections
    where outlet_id = ${outletId} and lower(name) = lower(${name}) and (${exceptId}::uuid is null or id <> ${exceptId}::uuid)`;
  return Boolean(row);
}

/** Tukar posisi dengan tetangga atas/bawah. Urutan dinormalkan dulu agar selalu berjarak 10. */
async function moveRow(tx: Tx, table: "menu_sections" | "menu_items", scope: { outletId: string; sectionId?: string }, key: string, direction: "up" | "down") {
  const rows =
    table === "menu_sections"
      ? await tx<{ key: string }[]>`select id::text as key from tooday.menu_sections where outlet_id = ${scope.outletId} and active order by sort_order, name`
      : await tx<{ key: string }[]>`select sku as key from tooday.menu_items where section_id = ${scope.sectionId!} and active order by sort_order, name`;
  const order = rows.map((row) => row.key);
  const index = order.indexOf(key);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  for (const [position, value] of order.entries()) {
    if (table === "menu_sections") await tx`update tooday.menu_sections set sort_order = ${(position + 1) * 10} where id = ${value}`;
    else await tx`update tooday.menu_items set sort_order = ${(position + 1) * 10} where section_id = ${scope.sectionId!} and sku = ${value}`;
  }
}

export async function applyMenuChange(staff: StaffContext, input: MenuAdminInput) {
  return withOutletLock(staff.outletId, async (tx, outlet) => {
    const audit = (action: string, detail: Record<string, unknown>) =>
      logEvent(tx, { outletId: outlet.id, actorType: "STAFF", actorId: staff.userId, action, detail });

    switch (input.op) {
      case "create-section": {
        if (await nameTaken(tx, outlet.id, input.name, null)) throw new ApiError(409, "VALIDATION", `Section "${input.name}" sudah ada.`);
        const [max] = await tx<{ max: number | null }[]>`select max(sort_order) as max from tooday.menu_sections where outlet_id = ${outlet.id}`;
        const [created] = await tx<{ id: string }[]>`
          insert into tooday.menu_sections (outlet_id, name, sort_order) values (${outlet.id}, ${input.name}, ${(max.max ?? 0) + 10}) returning id`;
        await audit("SECTION_CREATED", { id: created.id, name: input.name });
        break;
      }
      case "update-section": {
        const section = await sectionOf(tx, outlet.id, input.id);
        if (input.name !== undefined && input.name !== section.name) {
          if (await nameTaken(tx, outlet.id, input.name, section.id)) throw new ApiError(409, "VALIDATION", `Section "${input.name}" sudah ada.`);
          await tx`update tooday.menu_sections set name = ${input.name}, updated_at = now() where id = ${section.id}`;
        }
        if (input.active !== undefined && input.active !== section.active) {
          await tx`update tooday.menu_sections set active = ${input.active}, updated_at = now() where id = ${section.id}`;
        }
        if (input.move) await moveRow(tx, "menu_sections", { outletId: outlet.id }, section.id, input.move);
        await audit("SECTION_UPDATED", { id: section.id, name: input.name ?? section.name, active: input.active, move: input.move });
        break;
      }
      case "create-item": {
        await sectionOf(tx, outlet.id, input.sectionId);
        await checkImage(tx, outlet.id, input.image);
        const sku = await uniqueSku(tx, outlet.id, input.name);
        const [max] = await tx<{ max: number | null }[]>`select max(sort_order) as max from tooday.menu_items where section_id = ${input.sectionId}`;
        await tx`
          insert into tooday.menu_items (outlet_id, section_id, sku, name, description, price_rupiah, image_url, sort_order)
          values (${outlet.id}, ${input.sectionId}, ${sku}, ${input.name}, ${input.description ?? null}, ${input.price}, ${input.image ?? null}, ${(max.max ?? 0) + 10})`;
        await audit("MENU_CREATED", { sku, name: input.name, price: input.price });
        break;
      }
      case "update-item": {
        const [item] = await tx<{ sku: string; section_id: string; name: string; price_rupiah: number | null }[]>`
          select sku, section_id, name, price_rupiah from tooday.menu_items where outlet_id = ${outlet.id} and sku = ${input.sku} for update`;
        if (!item) throw new ApiError(404, "NOT_FOUND", "Menu tidak ditemukan.");
        if (input.sectionId) await sectionOf(tx, outlet.id, input.sectionId);
        await checkImage(tx, outlet.id, input.image);
        const sectionChanged = input.sectionId !== undefined && input.sectionId !== item.section_id;
        let sortOrder: number | null = null;
        if (sectionChanged) {
          const [max] = await tx<{ max: number | null }[]>`select max(sort_order) as max from tooday.menu_items where section_id = ${input.sectionId!}`;
          sortOrder = (max.max ?? 0) + 10;
        }
        await tx`
          update tooday.menu_items set
            name = coalesce(${input.name ?? null}, name),
            description = case when ${input.description !== undefined} then ${input.description ?? null} else description end,
            price_rupiah = case when ${input.price !== undefined} then ${input.price ?? null}::int else price_rupiah end,
            image_url = case when ${input.image !== undefined} then ${input.image ?? null} else image_url end,
            section_id = coalesce(${input.sectionId ?? null}::uuid, section_id),
            sort_order = coalesce(${sortOrder}::int, sort_order),
            active = coalesce(${input.active ?? null}::boolean, active),
            available = coalesce(${input.available ?? null}::boolean, available),
            version = version + 1, updated_at = now()
          where outlet_id = ${outlet.id} and sku = ${item.sku}`;
        if (input.move) await moveRow(tx, "menu_items", { outletId: outlet.id, sectionId: input.sectionId ?? item.section_id }, item.sku, input.move);
        await audit("MENU_UPDATED", {
          sku: item.sku,
          ...(input.price !== undefined && input.price !== item.price_rupiah ? { priceFrom: item.price_rupiah, priceTo: input.price } : {}),
          ...(input.name && input.name !== item.name ? { nameFrom: item.name, nameTo: input.name } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(sectionChanged ? { sectionId: input.sectionId } : {}),
          ...(input.move ? { move: input.move } : {}),
        });
        break;
      }
    }
    // Halaman pesan dan kasir mengambil menu baru pada pembaruan berikutnya.
    await bumpFeed(tx, outlet.id);
    return { ok: true };
  });
}
