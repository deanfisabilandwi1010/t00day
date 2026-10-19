import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { ApiErrorBody, ApiErrorCode } from "@/lib/order/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

const NO_STORE = { "Cache-Control": "no-store, max-age=0", Vary: "Cookie" };

export function json<T>(body: T, init?: { status?: number }): NextResponse<T> {
  return NextResponse.json(body, { status: init?.status ?? 200, headers: NO_STORE });
}

export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, ...(error.detail === undefined ? {} : { detail: error.detail }) } },
      { status: error.status, headers: NO_STORE },
    );
  }
  console.error("[api]", error);
  return NextResponse.json(
    { error: { code: "SERVER", message: "Server sedang bermasalah. Coba lagi sebentar lagi." } },
    { status: 500, headers: NO_STORE },
  );
}

/**
 * Proteksi CSRF untuk cookie sesi: setiap mutasi wajib datang dari origin situs ini
 * (header Origin cocok dengan Host) dan memakai JSON. Form lintas situs tidak bisa memenuhi keduanya.
 */
export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  let ok = false;
  if (origin && host) {
    try {
      ok = new URL(origin).host === host || allowed.includes(origin);
    } catch {
      ok = false;
    }
  }
  if (!ok) throw new ApiError(403, "BAD_ORIGIN", "Permintaan ditolak karena tidak berasal dari situs Tooday.");
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/json")) throw new ApiError(415, "VALIDATION", "Format permintaan tidak dikenali.");
}

export async function readJson<T extends z.ZodType>(request: NextRequest, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "VALIDATION", "Isi permintaan tidak valid.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION", "Data yang dikirim tidak valid.", z.flattenError(parsed.error).fieldErrors);
  }
  return parsed.data;
}

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-nf-client-connection-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Pembungkus handler: semua error dikonversi ke JSON yang konsisten. */
export function handle<C>(fn: (request: NextRequest, context: C) => Promise<Response>) {
  return async (request: NextRequest, context: C): Promise<Response> => {
    try {
      return await fn(request, context);
    } catch (error) {
      // Sinyal internal Next (mis. prerender connection()) harus diteruskan, bukan dijadikan 500.
      unstable_rethrow(error);
      return errorResponse(error);
    }
  };
}
