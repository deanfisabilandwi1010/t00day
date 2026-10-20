import "server-only";
import type { StaffContext } from "./auth";
import { bumpFeed, db, withOutletLock, type Tx } from "./db";
import { ApiError } from "./http";
import { logEvent } from "./queue-service";

/**
 * Lokasi QR Antar di area Tooday (mis. "Outlet A – meja 3"). Dikelola manager; setiap lokasi punya
 * kode untuk QR khusus (?antar=<kode>) sehingga lokasi langsung terisi saat dipindai.
 */
export interface DeliveryLocation {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export type LocationInput =
  | { op: "create-location"; name: string }
  | { op: "update-location"; id: string; name?: string; active?: boolean; move?: "up" | "down" };

export async function listLocations(outletId: string): Promise<DeliveryLocation[]> {
  return db()<DeliveryLocation[]>`
    select id, code, name, active from tooday.delivery_locations
    where outlet_id = ${outletId} order by active desc, sort_order, name`;
}

function slugify(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 34) || "lokasi"
  );
}

async function uniqueCode(tx: Tx, outletId: string, name: string) {
  const base = slugify(name);
  const taken = new Set((await tx<{ code: string }[]>`select code from tooday.delivery_locations where outlet_id = ${outletId}`).map((row) => row.code));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

async function nameTaken(tx: Tx, outletId: string, name: string, exceptId: string | null) {
  const [row] = await tx`
    select 1 from tooday.delivery_locations
    where outlet_id = ${outletId} and lower(name) = lower(${name}) and (${exceptId}::uuid is null or id <> ${exceptId}::uuid)`;
  return Boolean(row);
}

export async function applyLocationChange(staff: StaffContext, input: LocationInput) {
  return withOutletLock(staff.outletId, async (tx, outlet) => {
    if (input.op === "create-location") {
      if (await nameTaken(tx, outlet.id, input.name, null)) throw new ApiError(409, "VALIDATION", `Lokasi "${input.name}" sudah ada.`);
      const code = await uniqueCode(tx, outlet.id, input.name);
      const [max] = await tx<{ max: number | null }[]>`select max(sort_order) as max from tooday.delivery_locations where outlet_id = ${outlet.id}`;
      await tx`
        insert into tooday.delivery_locations (outlet_id, name, code, sort_order)
        values (${outlet.id}, ${input.name}, ${code}, ${(max.max ?? 0) + 10})`;
      await logEvent(tx, { outletId: outlet.id, actorType: "STAFF", actorId: staff.userId, action: "LOCATION_CREATED", detail: { name: input.name, code } });
    } else {
      const [location] = await tx<{ id: string; name: string }[]>`
        select id, name from tooday.delivery_locations where id = ${input.id} and outlet_id = ${outlet.id} for update`;
      if (!location) throw new ApiError(404, "NOT_FOUND", "Lokasi tidak ditemukan.");
      if (input.name !== undefined && input.name !== location.name) {
        if (await nameTaken(tx, outlet.id, input.name, location.id)) throw new ApiError(409, "VALIDATION", `Lokasi "${input.name}" sudah ada.`);
        // Kode QR tidak berubah saat nama diganti, supaya QR yang sudah dicetak tetap berlaku.
        await tx`update tooday.delivery_locations set name = ${input.name} where id = ${location.id}`;
      }
      if (input.active !== undefined) await tx`update tooday.delivery_locations set active = ${input.active} where id = ${location.id}`;
      if (input.move) {
        const order = (await tx<{ id: string }[]>`
          select id from tooday.delivery_locations where outlet_id = ${outlet.id} and active order by sort_order, name`).map((row) => row.id);
        const index = order.indexOf(location.id);
        const target = input.move === "up" ? index - 1 : index + 1;
        if (index >= 0 && target >= 0 && target < order.length) {
          [order[index], order[target]] = [order[target], order[index]];
          for (const [position, id] of order.entries()) {
            await tx`update tooday.delivery_locations set sort_order = ${(position + 1) * 10} where id = ${id}`;
          }
        }
      }
      await logEvent(tx, { outletId: outlet.id, actorType: "STAFF", actorId: staff.userId, action: "LOCATION_UPDATED", detail: { ...input, id: location.id } });
    }
    await bumpFeed(tx, outlet.id);
    return { locations: await tx<DeliveryLocation[]>`
      select id, code, name, active from tooday.delivery_locations where outlet_id = ${outlet.id} order by active desc, sort_order, name` };
  });
}
