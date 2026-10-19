import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/server/auth";
import { assertSameOrigin, handle, json, readJson } from "@/lib/server/http";
import { updateSettings } from "@/lib/server/queue-service";
import { settingsSchema } from "@/lib/validation/order";

export const PATCH = handle(async (request: NextRequest) => {
  assertSameOrigin(request);
  const { outlet, ...input } = await readJson(request, settingsSchema);
  const staff = await requireStaff(request, outlet);
  return json(await updateSettings(staff, input));
});
