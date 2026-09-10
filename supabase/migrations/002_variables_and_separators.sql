-- Variables + separators for simplified collection runner
-- Run in the Supabase SQL Editor if the project already exists

alter table public.collections
  add column if not exists variables jsonb not null default '[]'::jsonb;

alter table public.requests
  add column if not exists item_type text not null default 'request';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'requests_item_type_check'
  ) then
    alter table public.requests
      add constraint requests_item_type_check
      check (item_type in ('request', 'separator'));
  end if;
end $$;
