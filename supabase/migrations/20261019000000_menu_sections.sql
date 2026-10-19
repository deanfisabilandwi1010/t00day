-- Section menu yang bisa dikelola manager (sebelumnya kategori dikunci ke 4 nama tetap).
-- Item menu menunjuk ke section lewat section_id; nama kategori diambil dari section.

create table tooday.menu_sections (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references tooday.outlets (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order integer not null default 0,
  -- false = diarsipkan: section dan semua menunya tidak tampil di halaman pesan.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index menu_sections_outlet_name on tooday.menu_sections (outlet_id, lower(name));

insert into tooday.menu_sections (outlet_id, name, sort_order)
select outlet_id, category,
       case category when 'Coffee' then 10 when 'Matcha' then 20 when 'Non-Coffee' then 30 when 'Cemal-cemil' then 40 else 50 end
from (select distinct outlet_id, category from tooday.menu_items) existing;

alter table tooday.menu_items add column section_id uuid references tooday.menu_sections (id) on delete restrict;
update tooday.menu_items i set section_id = s.id
from tooday.menu_sections s
where s.outlet_id = i.outlet_id and s.name = i.category;
alter table tooday.menu_items alter column section_id set not null;
-- Kolom lama tidak dihapus agar versi aplikasi sebelumnya tetap berjalan selama deploy berlangsung.
-- Aplikasi sekarang hanya memakai section_id; kolom category tidak lagi diisi untuk menu baru.
alter table tooday.menu_items drop constraint if exists menu_items_category_check;
alter table tooday.menu_items alter column category drop not null;
alter table tooday.menu_items add constraint menu_items_description_length check (char_length(description) <= 200);
alter table tooday.menu_items add constraint menu_items_price_max check (price_rupiah <= 10000000);
create index menu_items_section on tooday.menu_items (section_id, sort_order);

alter table tooday.menu_sections enable row level security;
revoke all on tooday.menu_sections from public;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on tooday.menu_sections from %I', r);
    end if;
  end loop;
end $$;
