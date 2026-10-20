-- QR Antar: pengunjung di area Tooday memesan, kasir menerima dulu, pesanan dibuat lalu diantar,
-- dan pembayaran (QRIS atau tunai) diterima saat diantar. Kebalikan dari jalur counter, jadi status
-- dan aturan pembayarannya dipisah lewat kolom fulfillment. Pesanan lama otomatis 'COUNTER'.

alter table tooday.outlets add column accepting_delivery boolean not null default false;

-- Lokasi antar di area Tooday, dikelola manager. code dipakai di QR per lokasi (?antar=<code>).
create table tooday.delivery_locations (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references tooday.outlets (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  code text not null check (code ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (outlet_id, code)
);
create unique index delivery_locations_outlet_name on tooday.delivery_locations (outlet_id, lower(name));

alter table tooday.orders
  add column fulfillment text not null default 'COUNTER' check (fulfillment in ('COUNTER', 'DELIVERY')),
  add column delivery_location_id uuid references tooday.delivery_locations (id) on delete restrict,
  add column delivery_location_name text,
  add column delivery_detail text check (char_length(delivery_detail) <= 80),
  add column delivery_pay_hint text check (delivery_pay_hint in ('QRIS', 'TUNAI')),
  add column accepted_at timestamptz,
  add column delivering_at timestamptz;

-- Status baru: DELIVERY_REQUESTED (menunggu diterima kasir), DELIVERING (sedang diantar),
-- UNDELIVERED (gagal diantar / tidak dibayar, terminal).
alter table tooday.orders drop constraint if exists orders_order_status_check;
alter table tooday.orders add constraint orders_order_status_check check (
  order_status in ('WAITING_PAYMENT', 'CALLED', 'DEFERRED', 'QUEUED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'EXPIRED',
                   'DELIVERY_REQUESTED', 'DELIVERING', 'UNDELIVERED')
);

alter table tooday.orders drop constraint orders_status_combo;
alter table tooday.orders add constraint orders_status_combo check (
  (fulfillment = 'COUNTER' and (
    (payment_status = 'UNPAID' and order_status in ('WAITING_PAYMENT', 'CALLED', 'DEFERRED', 'CANCELLED', 'EXPIRED'))
    or (payment_status = 'PAID' and order_status in ('QUEUED', 'PREPARING', 'READY', 'COMPLETED') and paid_at is not null)
  ))
  or (fulfillment = 'DELIVERY' and (
    -- Pesanan antar dibuat sebelum dibayar; lunas hanya bersamaan dengan selesai diserahkan.
    (payment_status = 'UNPAID' and order_status in ('DELIVERY_REQUESTED', 'QUEUED', 'PREPARING', 'READY', 'DELIVERING', 'CANCELLED', 'EXPIRED', 'UNDELIVERED'))
    or (payment_status = 'PAID' and order_status = 'COMPLETED' and paid_at is not null)
  ))
);
alter table tooday.orders add constraint orders_delivery_fields check (
  fulfillment = 'COUNTER' or (delivery_location_name is not null and nickname is not null)
);

create index orders_delivery_active on tooday.orders (outlet_id, order_status, created_at)
  where fulfillment = 'DELIVERY' and order_status in ('DELIVERY_REQUESTED', 'QUEUED', 'PREPARING', 'READY', 'DELIVERING');
create index orders_expiry_delivery on tooday.orders (outlet_id, expires_at) where order_status = 'DELIVERY_REQUESTED';

-- Layar antrean publik hanya untuk pesanan di counter; pesanan antar tidak ditampilkan.
create or replace view tooday.queue_public as
select
  o.outlet_id,
  o.display_code,
  o.queue_number,
  o.order_status as status,
  case when o.payment_status = 'PAID' then o.paid_at else o.queue_entered_at end as sort_at,
  o.call_event_id,
  o.ready_event_id
from tooday.orders o
where o.fulfillment = 'COUNTER' and o.order_status in ('WAITING_PAYMENT', 'CALLED', 'QUEUED', 'PREPARING', 'READY');

alter table tooday.delivery_locations enable row level security;
revoke all on tooday.delivery_locations from public;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on tooday.delivery_locations from %I', r);
      execute format('revoke all on tooday.queue_public from %I', r);
    end if;
  end loop;
end $$;
