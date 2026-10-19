import type { NextRequest } from "next/server";
import { applyStaffCookie, loginStaff, rateLimit } from "@/lib/server/auth";
import { assertSameOrigin, clientIp, handle, json, readJson } from "@/lib/server/http";
import { loginSchema } from "@/lib/validation/order";

export const POST = handle(async (request: NextRequest) => {
  assertSameOrigin(request);
  const input = await readJson(request, loginSchema);
  const message = "Terlalu banyak percobaan masuk. Tunggu 15 menit lalu coba lagi.";
  await rateLimit(`login-ip:${clientIp(request)}`, 20, 900, message);
  await rateLimit(`login-email:${input.email.toLowerCase()}`, 6, 900, message);
  const { token } = await loginStaff(input.email, input.password);
  const response = json({ ok: true });
  applyStaffCookie(response, token);
  return response;
});
