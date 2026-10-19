-- Foto menu yang diunggah manager. Disimpan di database (bukan layanan storage terpisah) karena
-- ukurannya kecil: browser mengecilkan foto ke WebP/JPEG ±900 px sebelum mengunggah.
-- Disajikan publik lewat /api/menu-images/<id> dengan cache panjang (id tidak pernah berubah isinya).

create table tooday.menu_images (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references tooday.outlets (id) on delete restrict,
  content_type text not null check (content_type in ('image/webp', 'image/jpeg', 'image/png')),
  bytes bytea not null,
  byte_size integer not null check (byte_size between 1 and 2000000),
  label text check (char_length(label) <= 80),
  created_by uuid not null references tooday.staff_users (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index menu_images_outlet on tooday.menu_images (outlet_id, created_at desc);

alter table tooday.menu_images enable row level security;
revoke all on tooday.menu_images from public;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on tooday.menu_images from %I', r);
    end if;
  end loop;
end $$;
