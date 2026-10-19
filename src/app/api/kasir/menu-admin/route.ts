import { connection, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/server/auth";
import { ApiError, assertSameOrigin, handle, json, readJson } from "@/lib/server/http";
import { applyMenuChange, menuAdmin } from "@/lib/server/menu-service";
import { menuAdminSchema, slugSchema } from "@/lib/validation/order";

/** Kelola menu: daftar lengkap section dan menu (termasuk yang diarsipkan). Hanya manager. */
export const GET = handle(async (request: NextRequest) => {
  await connection();
  const outlet = slugSchema.safeParse(request.nextUrl.searchParams.get("outlet"));
  if (!outlet.success) throw new ApiError(400, "VALIDATION", "Outlet tidak valid.");
  const staff = await requireStaff(request, outlet.data, ["manager"]);
  return json(await menuAdmin(staff));
});

/** Satu perubahan menu per permintaan: create-section, update-section, create-item, update-item. */
export const POST = handle(async (request: NextRequest) => {
  assertSameOrigin(request);
  const input = await readJson(request, menuAdminSchema);
  const staff = await requireStaff(request, input.outlet, ["manager"]);
  return json(await applyMenuChange(staff, input));
});
