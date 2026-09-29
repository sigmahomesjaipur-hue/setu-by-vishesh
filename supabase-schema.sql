-- Run this in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null,
  role text not null check (role in ('admin', 'employee')),
  department text,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  leave_balance integer not null default 12 check (leave_balance >= 0),
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email text;

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  radius integer not null check (radius between 20 and 5000),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  site_id uuid references public.sites(id),
  check_in_at timestamptz,
  check_out_at timestamptz,
  check_in_latitude double precision,
  check_in_longitude double precision,
  check_in_accuracy double precision,
  check_out_latitude double precision,
  check_out_longitude double precision,
  check_out_accuracy double precision,
  attendance_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (employee_id, attendance_date)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  due_date date not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  reason text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  deducted_days integer not null default 0,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.workspace_settings (
  id text primary key default 'default',
  legacy_radius integer not null default 100 check (legacy_radius between 20 and 5000),
  check_in_cutoff time not null default '19:00',
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.sites enable row level security;
alter table public.attendance enable row level security;
alter table public.tasks enable row level security;
alter table public.leave_requests enable row level security;
alter table public.workspace_settings enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and lower(role) = 'admin' and lower(status) = 'active') $$;

drop policy if exists "users read own or admins read profiles" on public.profiles;
drop policy if exists "admins manage profiles" on public.profiles;
drop policy if exists "authenticated users read enabled sites" on public.sites;
drop policy if exists "admins manage sites" on public.sites;
drop policy if exists "authenticated users read workspace settings" on public.workspace_settings;
drop policy if exists "admins manage workspace settings" on public.workspace_settings;
drop policy if exists "admins insert workspace settings" on public.workspace_settings;
drop policy if exists "admins update workspace settings" on public.workspace_settings;
drop policy if exists "employees read own attendance" on public.attendance;
drop policy if exists "employees create own attendance" on public.attendance;
drop policy if exists "employees update own attendance" on public.attendance;
drop policy if exists "admins manage attendance" on public.attendance;
drop policy if exists "employees read own tasks" on public.tasks;
drop policy if exists "admins manage tasks" on public.tasks;
drop policy if exists "employees complete own tasks" on public.tasks;
drop policy if exists "employees read own leave" on public.leave_requests;
drop policy if exists "employees submit leave" on public.leave_requests;
drop policy if exists "admins review leave" on public.leave_requests;

create policy "users read own or admins read profiles" on public.profiles for select
using (id = auth.uid() or public.is_admin());
create policy "admins manage profiles" on public.profiles for all
using (public.is_admin()) with check (public.is_admin());

create policy "authenticated users read enabled sites" on public.sites for select
using (auth.uid() is not null and enabled);
create policy "admins manage sites" on public.sites for all
using (public.is_admin()) with check (public.is_admin());
create policy "authenticated users read workspace settings" on public.workspace_settings for select
using (auth.uid() is not null);
create policy "admins manage workspace settings" on public.workspace_settings for all
using (public.is_admin()) with check (public.is_admin());
create policy "admins insert workspace settings" on public.workspace_settings for insert
with check (public.is_admin());
create policy "admins update workspace settings" on public.workspace_settings for update
using (public.is_admin()) with check (public.is_admin());

create policy "employees read own attendance" on public.attendance for select
using (employee_id = auth.uid() or public.is_admin());
create policy "employees create own attendance" on public.attendance for insert
with check (employee_id = auth.uid());
create policy "employees update own attendance" on public.attendance for update
using (employee_id = auth.uid()) with check (employee_id = auth.uid());
create policy "admins manage attendance" on public.attendance for all
using (public.is_admin()) with check (public.is_admin());

create policy "employees read own tasks" on public.tasks for select
using (employee_id = auth.uid() or public.is_admin());
create policy "admins manage tasks" on public.tasks for all
using (public.is_admin()) with check (public.is_admin());
create policy "employees complete own tasks" on public.tasks for update
using (employee_id = auth.uid()) with check (employee_id = auth.uid() and completed = true);

create policy "employees read own leave" on public.leave_requests for select
using (employee_id = auth.uid() or public.is_admin());
create policy "employees submit leave" on public.leave_requests for insert
with check (employee_id = auth.uid() and status = 'Pending' and deducted_days = 0);
create policy "admins review leave" on public.leave_requests for update
using (public.is_admin()) with check (public.is_admin());

drop function if exists public.approve_leave(uuid);

create function public.approve_leave(request_id uuid)
returns public.leave_requests
language plpgsql security definer set search_path = public
as $$
declare
  request_row public.leave_requests;
  requested_days integer;
begin
  if not public.is_admin() then raise exception 'Only active admins can approve leave'; end if;
  select * into request_row from public.leave_requests where id = request_id for update;
  if request_row is null then raise exception 'Leave request not found'; end if;
  if request_row.status <> 'Pending' then return request_row; end if;
  requested_days := (request_row.end_date - request_row.start_date) + 1;
  update public.profiles
    set leave_balance = leave_balance - requested_days
    where id = request_row.employee_id and leave_balance >= requested_days;
  if not found then raise exception 'Insufficient leave balance'; end if;
  update public.leave_requests
    set status = 'Approved', deducted_days = requested_days, reviewed_by = auth.uid(), reviewed_at = now()
    where id = request_id
    returning * into request_row;
  return request_row;
end;
$$;

grant execute on function public.approve_leave(uuid) to authenticated;

create or replace function public.admin_set_leave_balance(target_employee uuid, new_balance integer)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  saved_balance integer;
begin
  if not public.is_admin() then raise exception 'Only active admins can change leave balances'; end if;
  if target_employee is null then raise exception 'Employee profile ID is required'; end if;
  if new_balance is null or new_balance < 0 then raise exception 'Leave balance must be zero or greater'; end if;
  update public.profiles
    set leave_balance = new_balance
    where id = target_employee and lower(role) = 'employee'
    returning leave_balance into saved_balance;
  if not found then raise exception 'No employee profile found for ID %', target_employee; end if;
  return saved_balance;
end;
$$;

grant execute on function public.admin_set_leave_balance(uuid, integer) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
    alter publication supabase_realtime add table public.tasks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leave_requests') then
    alter publication supabase_realtime add table public.leave_requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance') then
    alter publication supabase_realtime add table public.attendance;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspace_settings') then
    alter publication supabase_realtime add table public.workspace_settings;
  end if;
end $$;

insert into public.workspace_settings (id, legacy_radius, check_in_cutoff)
values ('default', 100, '19:00')
on conflict (id) do nothing;
