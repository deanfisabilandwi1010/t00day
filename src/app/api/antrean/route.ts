import { connection, type NextRequest } from "next/server";
import { ApiError, handle, json } from "@/lib/server/http";
import { findOutlet } from "@/lib/server/order-service";
import { publicFeed } from "@/lib/server/queue-service";
import { slugSchema } from "@/lib/validation/order";

/** Feed layar antrean publik: hanya kode dan status. */
export const GET = handle(async (request: NextRequest) => {
  await connection();
  const params = request.nextUrl.searchParams;
  const outlet = slugSchema.safeParse(params.get("outlet") ?? process.env.NEXT_PUBLIC_DEFAULT_OUTLET ?? "tooday-main");
  if (!outlet.success) throw new ApiError(404, "NOT_FOUND", "Outlet tidak dikenali.");
  const row = await findOutlet(outlet.data);
  const since = Number(params.get("v"));
  return json(await publicFeed(row, Number.isSafeInteger(since) && since > 0 ? since : null));
});
