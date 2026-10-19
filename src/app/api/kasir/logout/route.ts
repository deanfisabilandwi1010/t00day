import type { NextRequest } from "next/server";
import { applyStaffCookie, logoutStaff } from "@/lib/server/auth";
import { assertSameOrigin, handle, json } from "@/lib/server/http";

export const POST = handle(async (request: NextRequest) => {
  assertSameOrigin(request);
  await logoutStaff(request);
  const response = json({ ok: true });
  applyStaffCookie(response, null);
  return response;
});
