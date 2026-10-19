import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/server/auth";
import { ApiError, assertSameOrigin, handle, json, readJson } from "@/lib/server/http";
import { performStaffAction } from "@/lib/server/queue-service";
import { staffActionSchema, uuidSchema } from "@/lib/validation/order";

export const POST = handle(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) throw new ApiError(404, "NOT_FOUND", "Pesanan tidak ditemukan.");
  const input = await readJson(request, staffActionSchema);
  const staff = await requireStaff(request, input.outlet);
  return json(await performStaffAction(staff, id.data, input));
});
