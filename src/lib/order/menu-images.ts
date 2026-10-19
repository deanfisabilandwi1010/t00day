// Foto produk yang boleh dipilih manager untuk menu. Daftar tertutup: server menolak URL lain,
// jadi tidak ada gambar eksternal atau path sembarang yang bisa disisipkan lewat form.
export const MENU_IMAGES = [
  { url: "/assets/tooday/products/coffee-layered.webp", label: "Kopi susu berlapis" },
  { url: "/assets/tooday/products/coffee-brown-mixed.webp", label: "Kopi susu" },
  { url: "/assets/tooday/products/americano.webp", label: "Americano" },
  { url: "/assets/tooday/products/matcha-latte.webp", label: "Matcha latte" },
  { url: "/assets/tooday/products/matcha-biscoff.webp", label: "Matcha Biscoff" },
  { url: "/assets/tooday/products/dark-choco.webp", label: "Dark choco" },
  { url: "/assets/tooday/products/choco-light.webp", label: "Cokelat susu" },
  { url: "/assets/tooday/products/mango-yakult.webp", label: "Mango Yakult" },
  { url: "/assets/tooday/products/lychee-yakult.webp", label: "Lychee Yakult" },
  { url: "/assets/tooday/products/fruitpunch-yakult.webp", label: "Fruitpunch Yakult" },
  { url: "/assets/tooday/products/buttertteok.webp", label: "ButterTteok" },
] as const;

export const MENU_IMAGE_URLS: readonly string[] = MENU_IMAGES.map((image) => image.url);

/** Foto unggahan manager disajikan dari database lewat route ini. */
export const UPLOADED_PHOTO = /^\/api\/menu-images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** Foto unggahan sudah dikecilkan saat diunggah; tidak perlu dioptimasi ulang oleh next/image. */
export function isUploadedPhoto(src: string | null | undefined): boolean {
  return Boolean(src && UPLOADED_PHOTO.test(src));
}
