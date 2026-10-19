import { connection, type NextRequest } from "next/server";
import { readMenuImage } from "@/lib/server/menu-service";
import { uuidSchema } from "@/lib/validation/order";

/**
 * Foto menu unggahan, publik. Isi untuk satu id tidak pernah berubah (foto baru = id baru),
 * jadi boleh di-cache lama oleh browser dan CDN Netlify.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const id = uuidSchema.safeParse((await params).id);
  const image = id.success ? await readMenuImage(id.data) : null;
  if (!image) return new Response("Foto tidak ditemukan", { status: 404, headers: { "Cache-Control": "no-store" } });
  const cache = "public, max-age=31536000, immutable";
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.content_type,
      "Cache-Control": cache,
      "CDN-Cache-Control": cache,
      "Netlify-CDN-Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
