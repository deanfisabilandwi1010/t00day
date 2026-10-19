import Image from "next/image";
import { isUploadedPhoto } from "@/lib/order/menu-images";

interface MenuPhotoProps {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
}

/**
 * Foto menu. Foto produk Tooday berupa potongan cup tanpa latar (ditampilkan utuh/contain);
 * foto unggahan manager biasanya berlatar, jadi diberi kelas is-photo agar mengisi bingkai (cover).
 * Foto unggahan sudah dikecilkan saat diunggah, sehingga tidak dioptimasi ulang.
 */
export function MenuPhoto({ src, alt, sizes, className = "" }: MenuPhotoProps) {
  const uploaded = isUploadedPhoto(src);
  return (
    <Image
      src={src}
      alt={alt}
      width={1086}
      height={1448}
      sizes={sizes}
      unoptimized={uploaded}
      className={`${className} ${uploaded ? "is-photo" : ""}`.trim() || undefined}
    />
  );
}
