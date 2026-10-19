import { connection, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/server/auth";
import { ApiError, handle, json } from "@/lib/server/http";
import { kasirOrderDetail } from "@/lib/server/queue-service";
import { slugSchema, uuidSchema } from "@/lib/validation/order";

export const GET = handle(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await connection();
  const outlet = slugSchema.safeParse(request.nextUrl.searchParams.get("outlet"));
  const id = uuidSchema.safeParse((await params).id);
  if (!outlet.success || !id.success) throw new ApiError(404, "NOT_FOUND", "Pesanan tidak ditemukan.");
  const staff = await requireStaff(request, outlet.data);
  return json(await kasirOrderDetail(staff, id.data));
});
