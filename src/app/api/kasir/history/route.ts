import { connection, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/server/auth";
import { ApiError, handle, json } from "@/lib/server/http";
import { kasirHistory } from "@/lib/server/queue-service";
import { slugSchema } from "@/lib/validation/order";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = handle(async (request: NextRequest) => {
  await connection();
  const params = request.nextUrl.searchParams;
  const outlet = slugSchema.safeParse(params.get("outlet"));
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!outlet.success || !DATE.test(from) || !DATE.test(to)) throw new ApiError(400, "VALIDATION", "Filter tanggal tidak valid.");
  const staff = await requireStaff(request, outlet.data);
  const code = params.get("code")?.replace(/\D/g, "");
  return json(await kasirHistory(staff, from, to, code ? Number(code) : null));
});
