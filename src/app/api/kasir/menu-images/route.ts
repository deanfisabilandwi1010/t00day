import type { NextRequest } from "next/server";
import { rateLimit, requireStaff } from "@/lib/server/auth";
import { ApiError, assertSameOrigin, handle, json } from "@/lib/server/http";
import { saveMenuImage } from "@/lib/server/menu-service";
import { slugSchema } from "@/lib/validation/order";

/** Unggah satu foto menu (body = file gambar mentah, sudah dikecilkan di browser). Hanya manager. */
export const POST = handle(async (request: NextRequest) => {
  assertSameOrigin(request, ["image/webp", "image/jpeg", "image/png"]);
  const params = request.nextUrl.searchParams;
  const outlet = slugSchema.safeParse(params.get("outlet"));
  if (!outlet.success) throw new ApiError(400, "VALIDATION", "Outlet tidak valid.");
  const staff = await requireStaff(request, outlet.data, ["manager"]);
  await rateLimit(`photo-upload:${staff.userId}`, 40, 3600, "Terlalu banyak unggahan foto. Coba lagi sebentar lagi.");
  if (Number(request.headers.get("content-length") ?? 0) > 1_500_000) {
    throw new ApiError(413, "VALIDATION", "Foto terlalu besar (maks. 1,5 MB setelah dikecilkan).");
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  const label = params.get("label")?.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 80) || null;
  return json(await saveMenuImage(staff, bytes, label), { status: 201 });
});
