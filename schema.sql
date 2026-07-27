-- =========================================================
-- NAFA TECH — Sistem Manajemen Customer & Antrian Pengerjaan
-- Jalankan file ini di: Supabase Dashboard > SQL Editor > New query > Run
-- =========================================================

-- Aktifkan extension untuk generate UUID & random id
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- 1. JENIS LAYANAN (bisa ditambah/edit manual dari dashboard)
-- ---------------------------------------------------------
create table if not exists service_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_hours numeric not null default 4 check (default_hours between 3 and 6),
  default_price numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into service_types (name, default_hours, default_price) values
  ('Jasa pembuatan website', 4, 500000),
  ('Jasa pembuatan web app sistem pesan menu resto QR', 5, 750000),
  ('Jasa pembuatan web app absensi digital untuk instansi maupun guru', 4, 600000);

-- ---------------------------------------------------------
-- 2. LANDING PAGE SUMBER ORDER (bisa ditambah/edit manual)
-- ---------------------------------------------------------
create table if not exists landing_pages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into landing_pages (name, url) values
  ('Jasa Absensi Guru', 'https://rifkyanhar.github.io/Jasa-Absensi-Guru-/'),
  ('Jasa Meja Pintar', 'https://rifkyanhar.github.io/jasa-meja-pintar/'),
  ('Etalase Digital / NAFA Tech', 'https://rifkyanhar.github.io/Etalasedigital/');

-- ---------------------------------------------------------
-- 3. ORDERAN / ANTRIAN
--    queue_number naik otomatis & tidak pernah diulang -> urutan FIFO
-- ---------------------------------------------------------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  queue_number bigserial,
  customer_name text not null,
  contact text,
  notes text,
  service_type_id uuid references service_types(id),
  landing_page_id uuid references landing_pages(id),
  estimated_hours numeric not null default 4 check (estimated_hours between 3 and 6),
  status text not null default 'waiting' check (status in ('waiting','in_progress','done','cancelled')),
  created_at timestamptz not null default now(),   -- waktu order masuk
  started_at timestamptz,                          -- waktu mulai dikerjakan
  completed_at timestamptz,                        -- waktu selesai dikerjakan
  price numeric,                                   -- harga jasa (diisi/diedit admin)
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','failed','expired')),
  midtrans_order_id text unique,                   -- order_id yang dikirim ke Midtrans (beda dari id/queue_number)
  paid_at timestamptz                              -- waktu pembayaran dikonfirmasi Midtrans
);

create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_created_at on orders(created_at);

-- Auto isi "price" dari harga default jenis layanan saat order baru dibuat
-- (kalau price tidak diisi manual). Admin masih bisa edit manual nanti.
create or replace function set_order_default_price()
returns trigger as $$
begin
  if new.price is null then
    select default_price into new.price from service_types where id = new.service_type_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_order_default_price on orders;
create trigger trg_set_order_default_price
  before insert on orders
  for each row execute function set_order_default_price();

-- ---------------------------------------------------------
-- 4. AFTER SALES / TROUBLESHOOTING
-- ---------------------------------------------------------
create table if not exists after_sales (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete set null,
  issue_type text not null,
  description text,
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  created_at timestamptz not null default now()
);

-- =========================================================
-- ROW LEVEL SECURITY
-- Aturan: siapa saja (LP) boleh KIRIM order baru (insert),
-- tapi hanya admin yang login (authenticated) yang boleh
-- melihat/mengubah data di dashboard.
-- =========================================================
alter table service_types enable row level security;
alter table landing_pages enable row level security;
alter table orders enable row level security;
alter table after_sales enable row level security;

-- service_types: publik boleh baca (dropdown di form LP), admin boleh semua
create policy "public read service_types" on service_types for select using (true);
create policy "admin manage service_types" on service_types for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- landing_pages: publik boleh baca, admin boleh semua
create policy "public read landing_pages" on landing_pages for select using (true);
create policy "admin manage landing_pages" on landing_pages for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- orders: publik HANYA boleh insert (kirim order baru dari LP), tidak boleh baca/ubah
create policy "public insert orders" on orders for insert with check (true);
create policy "admin manage orders" on orders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- after_sales: hanya admin yang login
create policy "admin manage after_sales" on after_sales for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- =========================================================
-- VIEW PUBLIK UNTUK HALAMAN STATUS ANTRIAN (status.html)
-- Customer boleh lihat nomor antrian, jenis layanan, status,
-- dan waktu — TANPA nama/kontak customer lain (privasi terjaga).
-- View ini otomatis mengabaikan RLS tabel orders (aman, kolom
-- sensitif memang tidak diikutsertakan sama sekali).
-- =========================================================
create or replace view public_queue as
select
  o.queue_number,
  st.name as service_name,
  o.status,
  o.created_at,
  o.started_at,
  o.estimated_hours,
  case when o.started_at is not null
    then o.started_at + (o.estimated_hours || ' hours')::interval
    else null end as estimated_done_at
from orders o
left join service_types st on st.id = o.service_type_id
where o.status in ('waiting','in_progress');

grant select on public_queue to anon, authenticated;
