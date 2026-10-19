import { connection, type NextRequest } from "next/server";
import { ApiError, handle, json } from "@/lib/server/http";
import { publicMenu } from "@/lib/server/order-service";
import { slugSchema } from "@/lib/validation/order";

export const GET = handle(async (request: NextRequest) => {
  await connection();
  const params = request.nextUrl.searchParams;
  const outlet = slugSchema.safeParse(params.get("outlet") ?? process.env.NEXT_PUBLIC_DEFAULT_OUTLET ?? "tooday-main");
  if (!outlet.success) throw new ApiError(404, "NOT_FOUND", "Outlet tidak dikenali. Coba pindai ulang QR di outlet.");
  const table = params.get("table");
  const validTable = table && /^[A-Za-z0-9-]{1,10}$/.test(table) ? table : null;
  const result = await publicMenu(outlet.data, validTable);
  if (table && !validTable) result.outlet.tableInvalid = true;
  return json(result);
});
