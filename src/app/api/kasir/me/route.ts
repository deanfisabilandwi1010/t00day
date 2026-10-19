import { connection, type NextRequest } from "next/server";
import { findStaff } from "@/lib/server/auth";
import { ApiError, handle, json } from "@/lib/server/http";

export const GET = handle(async (request: NextRequest) => {
  await connection();
  const staff = await findStaff(request);
  if (!staff) throw new ApiError(401, "UNAUTHORIZED", "Belum masuk.");
  return json({
    name: staff.displayName,
    email: staff.email,
    outlets: staff.memberships.map((entry) => ({ slug: entry.slug, name: entry.name, role: entry.role })),
  });
});
