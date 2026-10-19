import type { NextRequest } from "next/server";
import { requireGuest } from "@/lib/server/auth";
import { ApiError, assertSameOrigin, handle, json } from "@/lib/server/http";
import { cancelByGuest } from "@/lib/server/order-service";
import { uuidSchema } from "@/lib/validation/order";

export const POST = handle(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) throw new ApiError(404, "NOT_FOUND", "Pesanan tidak ditemukan di perangkat ini.");
  const guestId = await requireGuest(request);
  return json(await cancelByGuest(guestId, id.data));
});
