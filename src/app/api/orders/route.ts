import { connection, type NextRequest } from "next/server";
import { applyGuestCookie, ensureGuest, findGuest, GUEST_COOKIE, rateLimit } from "@/lib/server/auth";
import { ApiError, assertSameOrigin, clientIp, handle, json, readJson } from "@/lib/server/http";
import { createOrder, listGuestOrders } from "@/lib/server/order-service";
import { createOrderSchema, slugSchema } from "@/lib/validation/order";

/** Kirim pesanan. Sesi tamu dibuat otomatis (cookie HttpOnly) bila belum ada. */
export const POST = handle(async (request: NextRequest) => {
  assertSameOrigin(request);
  const input = await readJson(request, createOrderSchema);
  const ip = clientIp(request);
  // Satu Wi-Fi outlet bisa dipakai banyak pengunjung, jadi batas per IP longgar; batas utama per sesi.
  await rateLimit(`order-ip:${ip}`, 60, 60, "Terlalu banyak pesanan dari jaringan ini. Tunggu sebentar, ya.");
  if (!request.cookies.get(GUEST_COOKIE)) {
    await rateLimit(`guest-new:${ip}`, 40, 600, "Terlalu banyak sesi baru dari jaringan ini. Tunggu sebentar, ya.");
  }
  const guest = await ensureGuest(request);
  await rateLimit(`order-guest:${guest.id}`, 10, 60, "Kamu mengirim terlalu cepat. Tunggu sebentar, ya.");

  const result = await createOrder(guest.id, input);
  const response = json(result, { status: result.replayed ? 200 : 201 });
  applyGuestCookie(response, guest.newToken);
  return response;
});

/** Pesanan milik sesi ini di outlet tertentu (aktif dan yang baru selesai). */
export const GET = handle(async (request: NextRequest) => {
  await connection();
  const outlet = slugSchema.safeParse(request.nextUrl.searchParams.get("outlet"));
  if (!outlet.success) throw new ApiError(400, "VALIDATION", "Outlet tidak valid.");
  const guestId = await findGuest(request);
  return json({ orders: guestId ? await listGuestOrders(guestId, outlet.data) : [] });
});
