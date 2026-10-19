import { connection, type NextRequest } from "next/server";
import { requireGuest } from "@/lib/server/auth";
import { ApiError, handle, json } from "@/lib/server/http";
import { getGuestOrder } from "@/lib/server/order-service";
import { uuidSchema } from "@/lib/validation/order";

export const GET = handle(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await connection();
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) throw new ApiError(404, "NOT_FOUND", "Pesanan tidak ditemukan di perangkat ini.");
  const guestId = await requireGuest(request);
  return json({ order: await getGuestOrder(guestId, id.data) });
});
