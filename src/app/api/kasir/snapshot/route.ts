import { connection, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/server/auth";
import { ApiError, handle, json } from "@/lib/server/http";
import { kasirSnapshot } from "@/lib/server/queue-service";
import { slugSchema } from "@/lib/validation/order";

export const GET = handle(async (request: NextRequest) => {
  await connection();
  const params = request.nextUrl.searchParams;
  const outlet = slugSchema.safeParse(params.get("outlet"));
  if (!outlet.success) throw new ApiError(400, "VALIDATION", "Outlet tidak valid.");
  const staff = await requireStaff(request, outlet.data);
  const since = Number(params.get("v"));
  return json(await kasirSnapshot(staff, Number.isSafeInteger(since) && since > 0 ? since : null));
});
