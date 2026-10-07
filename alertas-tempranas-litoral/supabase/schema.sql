-- Ejecuta este archivo en Supabase > SQL Editor
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role text not null default 'viewer' check (role in ('viewer','bienestar','coordinator','admin')),
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "users can read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "admins can read all profiles"
on public.profiles for select
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='admin'));

create policy "users can update own password flag"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Para marcar manualmente tu primer administrador después de crearlo en Authentication:
-- insert into public.profiles (id,email,full_name,role,must_change_password)
-- select id,email,'Sandra Paola Avila','admin',false from auth.users where email='TU_CORREO';
