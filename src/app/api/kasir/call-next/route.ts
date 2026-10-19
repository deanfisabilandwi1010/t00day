import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/server/auth";
import { assertSameOrigin, handle, json, readJson } from "@/lib/server/http";
import { callNext } from "@/lib/server/queue-service";
import { callNextSchema } from "@/lib/validation/order";

export const POST = handle(async (request: NextRequest) => {
  assertSameOrigin(request);
  const input = await readJson(request, callNextSchema);
  const staff = await requireStaff(request, input.outlet);
  return json(await callNext(staff, input.idempotencyKey));
});
