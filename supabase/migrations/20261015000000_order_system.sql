-- Tooday QR order, kasir, dan layar antrean.
--
-- Semua tabel berada di schema `tooday`, bukan `public`, supaya tidak ikut terekspos lewat
-- Data API Supabase. Aplikasi hanya mengakses database dari server (Route Handler Next.js)
-- memakai DATABASE_URL; browser tidak pernah membaca/menulis tabel ini secara langsung.

create schema if not exists tooday;

-- ---------------------------------------------------------------------------
-- Outlet dan state layanan
-- ---------------------------------------------------------------------------
create table tooday.outlets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name text not null check (char_length(name) between 1 and 80),
  timezone text not null default 'Asia/Jakarta',
  accepting_orders boolean not null default false,
  -- Batas waktu order belum dibayar (WAITING_PAYMENT/DEFERRED), dalam menit.
  unpaid_ttl_minutes integer not null default 120 check (unpaid_ttl_minutes between 5 and 1440),
  -- Label metode bayar untuk pencatatan internal. Kosong = kasir tidak memilih metode.
  payment_methods text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Satu baris per outlet. Baris ini dikunci (FOR UPDATE) oleh setiap mutasi antrean,
-- sehingga semua keputusan antrean satu outlet berjalan berurutan.
create table tooday.service_state (
  outlet_id uuid primary key references tooday.outlets (id) on delete restrict,
  counter_ready boolean not null default true,
  auto_call_next boolean not null default true,
  -- Naik setiap kali ada perubahan yang terlihat di kasir/layar/tiket. Dipakai klien untuk polling murah.
  feed_version bigint not null default 1,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table tooday.outlet_counters (
  outlet_id uuid primary key references tooday.outlets (id) on delete restrict,
  next_number integer not null default 1 check (next_number > 0)
);

create table tooday.dining_tables (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references tooday.outlets (id) on delete restrict,
  code text not null check (code ~ '^[A-Za-z0-9-]{1,10}$'),
  active boolean not null default true,
  unique (outlet_id, code)
);

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------
create table tooday.menu_items (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references tooday.outlets (id) on delete restrict,
  sku text not null check (sku ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (category in ('Coffee', 'Matcha', 'Non-Coffee', 'Cemal-cemil')),
  description text,
  -- null = harga belum ditetapkan; item seperti ini tidak dapat dipesan (tidak pernah dianggap Rp0).
  price_rupiah integer check (price_rupiah > 0),
  image_url text,
  sort_order integer not null default 0,
  active boolean not null default true,
  available boolean not null default true,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (outlet_id, sku)
);

-- ---------------------------------------------------------------------------
-- Identitas: sesi tamu dan staf
-- ---------------------------------------------------------------------------
create table tooday.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 dari token cookie. Token mentah tidak pernah disimpan.
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table tooday.staff_users (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and position('@' in email) > 1),
  display_name text not null check (char_length(display_name) between 1 and 40),
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (email)
);

create table tooday.staff_memberships (
  user_id uuid not null references tooday.staff_users (id) on delete restrict,
  outlet_id uuid not null references tooday.outlets (id) on delete restrict,
  role text not null check (role in ('cashier', 'manager')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, outlet_id)
);

create table tooday.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  user_id uuid not null references tooday.staff_users (id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

-- Rate limit login dan submit: satu baris per percobaan, dibersihkan berkala.
create table tooday.rate_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index rate_events_bucket_time on tooday.rate_events (bucket, created_at);

-- ---------------------------------------------------------------------------
-- Pesanan
-- ---------------------------------------------------------------------------
create sequence tooday.display_event_seq;

create table tooday.orders (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references tooday.outlets (id) on delete restrict,
  guest_session_id uuid not null references tooday.guest_sessions (id) on delete restrict,
  queue_number integer not null check (queue_number > 0),
  display_code text not null,
  order_type text not null check (order_type in ('DINE_IN', 'TAKEAWAY')),
  table_id uuid references tooday.dining_tables (id) on delete restrict,
  table_code text,
  nickname text check (char_length(nickname) between 1 and 30),
  order_status text not null check (
    order_status in ('WAITING_PAYMENT', 'CALLED', 'DEFERRED', 'QUEUED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'EXPIRED')
  ),
  payment_status text not null check (payment_status in ('UNPAID', 'PAID')),
  total_rupiah integer not null check (total_rupiah > 0),
  item_count integer not null check (item_count > 0),
  -- Urutan antrean bayar. Diperbarui saat order dikembalikan dari DEFERRED ke ekor antrean.
  queue_entered_at timestamptz not null,
  first_called_at timestamptz,
  called_at timestamptz,
  call_event_id bigint,
  paid_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  ready_event_id bigint,
  completed_at timestamptz,
  closed_at timestamptz,
  close_reason text check (char_length(close_reason) <= 200),
  defer_reason text check (char_length(defer_reason) <= 200),
  business_date date not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (outlet_id, queue_number),
  -- Kombinasi status yang sah. PAID tidak pernah berdampingan dengan CANCELLED/EXPIRED.
  constraint orders_status_combo check (
    (payment_status = 'UNPAID' and order_status in ('WAITING_PAYMENT', 'CALLED', 'DEFERRED', 'CANCELLED', 'EXPIRED'))
    or (payment_status = 'PAID' and order_status in ('QUEUED', 'PREPARING', 'READY', 'COMPLETED') and paid_at is not null)
  ),
  constraint orders_table_dine_in check (table_id is null or order_type = 'DINE_IN')
);

-- Satu loket: paling banyak satu order CALLED per outlet.
create unique index orders_one_called_per_outlet on tooday.orders (outlet_id) where order_status = 'CALLED';
create index orders_payment_queue on tooday.orders (outlet_id, order_status, queue_entered_at, queue_number)
  where order_status in ('WAITING_PAYMENT', 'CALLED', 'DEFERRED');
create index orders_production_queue on tooday.orders (outlet_id, order_status, paid_at, queue_number)
  where order_status in ('QUEUED', 'PREPARING', 'READY');
create index orders_outlet_created on tooday.orders (outlet_id, created_at desc);
create index orders_guest on tooday.orders (guest_session_id, created_at desc);
create index orders_expiry on tooday.orders (outlet_id, expires_at) where order_status in ('WAITING_PAYMENT', 'DEFERRED');

create table tooday.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references tooday.orders (id) on delete restrict,
  position smallint not null,
  menu_item_id uuid not null references tooday.menu_items (id) on delete restrict,
  sku text not null,
  name_snapshot text not null,
  category_snapshot text not null,
  unit_price_rupiah integer not null check (unit_price_rupiah > 0),
  quantity integer not null check (quantity between 1 and 20),
  note text check (char_length(note) <= 200),
  subtotal_rupiah integer not null check (subtotal_rupiah = unit_price_rupiah * quantity),
  unique (order_id, position)
);

create table tooday.payment_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references tooday.orders (id) on delete restrict,
  amount_rupiah integer not null check (amount_rupiah > 0),
  method text,
  received_by uuid not null references tooday.staff_users (id) on delete restrict,
  received_at timestamptz not null default now()
);

-- Audit: perubahan order dan pengaturan outlet. Tidak ada UI yang menghapus baris ini.
create table tooday.order_events (
  id bigint generated always as identity primary key,
  outlet_id uuid not null references tooday.outlets (id) on delete restrict,
  order_id uuid references tooday.orders (id) on delete restrict,
  actor_type text not null check (actor_type in ('GUEST', 'STAFF', 'SYSTEM')),
  actor_id uuid,
  action text not null,
  from_status text,
  to_status text,
  reason text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index order_events_order on tooday.order_events (order_id, id);
create index order_events_outlet on tooday.order_events (outlet_id, id desc);

-- Idempotensi submit pesanan: satu key per sesi tamu, disimpan dalam transaksi yang sama dengan order.
create table tooday.order_requests (
  guest_session_id uuid not null references tooday.guest_sessions (id) on delete restrict,
  idempotency_key uuid not null,
  request_hash text not null,
  order_id uuid not null references tooday.orders (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (guest_session_id, idempotency_key)
);

-- Idempotensi aksi staf (konfirmasi bayar, panggil, dst.): retry dengan key sama mengembalikan hasil yang sama.
create table tooday.staff_mutations (
  staff_user_id uuid not null references tooday.staff_users (id) on delete restrict,
  idempotency_key uuid not null,
  action text not null,
  order_id uuid references tooday.orders (id) on delete restrict,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (staff_user_id, idempotency_key)
);

-- ---------------------------------------------------------------------------
-- Proyeksi layar antrean publik: hanya kode dan status, tanpa nama, item, harga, atau staf.
-- ---------------------------------------------------------------------------
create view tooday.queue_public as
select
  o.outlet_id,
  o.display_code,
  o.queue_number,
  o.order_status as status,
  case when o.payment_status = 'PAID' then o.paid_at else o.queue_entered_at end as sort_at,
  o.call_event_id,
  o.ready_event_id
from tooday.orders o
where o.order_status in ('WAITING_PAYMENT', 'CALLED', 'QUEUED', 'PREPARING', 'READY');

-- ---------------------------------------------------------------------------
-- Hak akses. Server memakai role pemilik (postgres) yang melewati RLS.
-- RLS tetap aktif tanpa policy sebagai lapis kedua: role lain tidak bisa membaca apa pun.
-- ---------------------------------------------------------------------------
alter table tooday.outlets enable row level security;
alter table tooday.service_state enable row level security;
alter table tooday.outlet_counters enable row level security;
alter table tooday.dining_tables enable row level security;
alter table tooday.menu_items enable row level security;
alter table tooday.guest_sessions enable row level security;
alter table tooday.staff_users enable row level security;
alter table tooday.staff_memberships enable row level security;
alter table tooday.staff_sessions enable row level security;
alter table tooday.rate_events enable row level security;
alter table tooday.orders enable row level security;
alter table tooday.order_items enable row level security;
alter table tooday.payment_records enable row level security;
alter table tooday.order_events enable row level security;
alter table tooday.order_requests enable row level security;
alter table tooday.staff_mutations enable row level security;

revoke all on schema tooday from public;
revoke all on all tables in schema tooday from public;
revoke all on all sequences in schema tooday from public;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema tooday from %I', r);
      execute format('revoke all on all tables in schema tooday from %I', r);
      execute format('revoke all on all sequences in schema tooday from %I', r);
      execute format('alter default privileges in schema tooday revoke all on tables from %I', r);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Nudge Realtime (khusus Supabase). Setiap feed_version naik, kirim broadcast berisi angka
-- versi saja ke topic publik "tooday-feed:<slug>". Klien lalu mengambil snapshot lewat API.
-- Di Postgres biasa (tanpa schema realtime) blok ini dilewati dan klien memakai polling.
-- ---------------------------------------------------------------------------
do $outer$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    create or replace function tooday.notify_feed() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
    begin
      perform realtime.send(
        jsonb_build_object('v', new.feed_version),
        'feed',
        'tooday-feed:' || (select o.slug from tooday.outlets o where o.id = new.outlet_id),
        false
      );
      return null;
    end
    $fn$;
    revoke all on function tooday.notify_feed() from public;
    create trigger service_state_feed_notify
      after update of feed_version on tooday.service_state
      for each row execute function tooday.notify_feed();
  end if;
end
$outer$;
