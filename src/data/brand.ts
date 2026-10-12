import rawBrand from "./brand.json";

export const brand = {
  name: rawBrand.name,
  tagline: rawBrand.tagline,
  instagramHandle: rawBrand.instagramHandle,
  instagramUrl: rawBrand.instagramUrl,
  // Kanal order, alamat, dan jam buka belum tersedia; UI menyembunyikan blok terkait selama null.
  whatsapp: rawBrand.whatsapp as string | null,
  address: rawBrand.address as string | null,
  openingHours: rawBrand.openingHours as string | null,
  logo: {
    src: rawBrand.logo,
    width: 1536,
    height: 1024,
    alt: "Tooday — Make every day, tooday!",
  },
} as const;
