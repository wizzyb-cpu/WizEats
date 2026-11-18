-- WizEats database foundation
-- Run this in the Supabase SQL Editor for your project.

create extension if not exists pgcrypto;

create type public.order_status as enum ('pending_payment','paid','preparing','ready','picked_up','cancelled');
create type public.payment_status as enum ('pending','successful','failed','refunded');
create type public.user_role as enum ('customer','admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price_ngn integer not null check(price_ngn > 0),
  category text not null,
  image_url text,
  is_available boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  pickup_location text not null check (pickup_location in ('NFSA','Relaxation Centre','Phase 2 Gate')),
  subtotal_ngn integer not null check(subtotal_ngn > 0),
  currency text not null default 'NGN' check(currency='NGN'),
  order_status public.order_status not null default 'pending_payment',
  payment_status public.payment_status not null default 'pending',
  payment_provider text not null default 'flutterwave',
  tx_ref text unique not null,
  flw_transaction_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_name_snapshot text not null,
  unit_price_ngn integer not null check(unit_price_ngn > 0),
  quantity integer not null check(quantity between 1 and 30),
  line_total_ngn integer not null check(line_total_ngn = unit_price_ngn * quantity)
);

create index orders_customer_id_idx on public.orders(customer_id);
create index orders_created_at_idx on public.orders(created_at desc);
create index orders_payment_status_idx on public.orders(payment_status);

-- Create a profile automatically for each new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id,full_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Admin status is never client-editable.
alter table public.profiles enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'); $$;

create policy "profiles read own or admin" on public.profiles
for select to authenticated using (id=auth.uid() or public.is_admin());
create policy "customers may edit own basic profile" on public.profiles
for update to authenticated using (id=auth.uid()) with check (id=auth.uid() and role='customer');

create policy "anyone can read available menu" on public.menu_items
for select to anon, authenticated using (is_available=true or public.is_admin());
create policy "admins manage menu" on public.menu_items
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins can view orders" on public.orders
for select to authenticated using (public.is_admin());
create policy "admins can update orders" on public.orders
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins can view order items" on public.order_items
for select to authenticated using (public.is_admin());

-- Seed the menu with the current prices and products.
insert into public.menu_items(name,description,price_ngn,category,display_order) values
('Fried Rice & Chicken','Fried rice served with chicken.',4000,'Rice',1),
('Fried Rice & Egg','Fried rice served with egg.',3000,'Rice',2),
('Stir-Fried Spaghetti with Fish','Stir-fried spaghetti served with fish.',3000,'Pasta',3),
('Stir-Fried Spaghetti with Egg','Stir-fried spaghetti served with egg.',2500,'Pasta',4),
('Potato Porridge','Potato porridge.',2000,'Meals',5),
('French Fries with Sauce','French fries served with sauce.',1500,'Sides',6),
('Meat Pie (2 pieces)','Meat pie, 2 pieces per order.',1500,'Snacks',7),
('Chocolate Donuts (5 pieces)','Chocolate donuts, 5 pieces per order.',2000,'Snacks',8);
