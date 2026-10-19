import { connection, type NextRequest } from "next/server";
import { findGuest } from "@/lib/server/auth";
import { ApiError, handle, json } from "@/lib/server/http";
import { getGuestOrderByKey } from "@/lib/server/order-service";
import { uuidSchema } from "@/lib/validation/order";

/** Memulihkan hasil submit yang responsnya hilang: cari order dengan idempotency key yang sama. */
export const GET = handle(async (request: NextRequest, { params }: { params: Promise<{ key: string }> }) => {
  await connection();
  const key = uuidSchema.safeParse((await params).key);
  if (!key.success) throw new ApiError(400, "VALIDATION", "Kunci tidak valid.");
  const guestId = await findGuest(request);
  return json({ order: guestId ? await getGuestOrderByKey(guestId, key.data) : null });
});
