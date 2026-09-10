-- RESTest schema
-- Rode no SQL Editor do Supabase (Dashboard → SQL → New query)

create extension if not exists "pgcrypto";

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  name text not null,
  color text not null default 'bg-emerald-400',
  variables jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  name text not null,
  method text not null check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  url text not null default '',
  headers jsonb not null default '[]'::jsonb,
  body text not null default '',
  item_type text not null default 'request' check (item_type in ('request', 'separator')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collections_workspace_id_idx on public.collections (workspace_id);
create index if not exists collections_position_idx on public.collections (position);
create index if not exists requests_collection_id_idx on public.requests (collection_id);
create index if not exists requests_position_idx on public.requests (collection_id, position);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at
before update on public.collections
for each row execute function public.set_updated_at();

drop trigger if exists requests_set_updated_at on public.requests;
create trigger requests_set_updated_at
before update on public.requests
for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;
alter table public.collections enable row level security;
alter table public.requests enable row level security;

-- MVP: acesso liberado via publishable key.
-- Troque por policies por usuário quando o Auth estiver pronto.
drop policy if exists "workspaces_all" on public.workspaces;
create policy "workspaces_all" on public.workspaces for all using (true) with check (true);

drop policy if exists "collections_all" on public.collections;
create policy "collections_all" on public.collections for all using (true) with check (true);

drop policy if exists "requests_all" on public.requests;
create policy "requests_all" on public.requests for all using (true) with check (true);
