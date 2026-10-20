import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/server/auth";
import { applyLocationChange, listLocations } from "@/lib/server/delivery-service";
import { ApiError, assertSameOrigin, handle, json, readJson } from "@/lib/server/http";
import { slugSchema } from "@/lib/validation/order";

const name = z
  .string()
  .transform((value) => value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Nama lokasi wajib diisi.").max(60));

const schema = z.discriminatedUnion("op", [
  z.object({ outlet: slugSchema, op: z.literal("create-location"), name }).strict(),
  z
    .object({
      outlet: slugSchema,
      op: z.literal("update-location"),
      id: z.uuid(),
      name: name.optional(),
      active: z.boolean().optional(),
      move: z.enum(["up", "down"]).optional(),
    })
    .strict(),
]);

/** Daftar lokasi QR Antar (semua staf outlet, termasuk yang diarsipkan). */
export const GET = handle(async (request: NextRequest) => {
  await connection();
  const outlet = slugSchema.safeParse(request.nextUrl.searchParams.get("outlet"));
  if (!outlet.success) throw new ApiError(400, "VALIDATION", "Outlet tidak valid.");
  const staff = await requireStaff(request, outlet.data);
  return json({ locations: await listLocations(staff.outletId) });
});

/** Tambah/ubah lokasi. Hanya manager. */
export const POST = handle(async (request: NextRequest) => {
  assertSameOrigin(request);
  const { outlet, ...input } = await readJson(request, schema);
  const staff = await requireStaff(request, outlet, ["manager"]);
  return json(await applyLocationChange(staff, input));
});
