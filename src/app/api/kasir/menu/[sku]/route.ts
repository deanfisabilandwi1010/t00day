import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/server/auth";
import { ApiError, assertSameOrigin, handle, json, readJson } from "@/lib/server/http";
import { setMenuAvailability } from "@/lib/server/queue-service";
import { availabilitySchema } from "@/lib/validation/order";

export const PATCH = handle(async (request: NextRequest, { params }: { params: Promise<{ sku: string }> }) => {
  assertSameOrigin(request);
  const { sku } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(sku)) throw new ApiError(404, "NOT_FOUND", "Menu tidak ditemukan.");
  const input = await readJson(request, availabilitySchema);
  const staff = await requireStaff(request, input.outlet);
  return json(await setMenuAvailability(staff, sku, input.available));
});
