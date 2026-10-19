import { connection, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/server/auth";
import { ApiError, handle, json } from "@/lib/server/http";
import { salesReport } from "@/lib/server/report-service";
import { slugSchema } from "@/lib/validation/order";

/** Rekap transaksi harian/bulanan. Hanya untuk peran manager di outlet tersebut. */
export const GET = handle(async (request: NextRequest) => {
  await connection();
  const params = request.nextUrl.searchParams;
  const outlet = slugSchema.safeParse(params.get("outlet"));
  if (!outlet.success) throw new ApiError(400, "VALIDATION", "Outlet tidak valid.");
  const staff = await requireStaff(request, outlet.data, ["manager"]);
  return json(await salesReport(staff, params.get("from") ?? "", params.get("to") ?? ""));
});
