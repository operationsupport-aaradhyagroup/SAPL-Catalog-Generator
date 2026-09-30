-- Run once in Supabase Dashboard > SQL Editor.
-- This is intentionally separate from all Bhoodhan tables.
create table if not exists public.aaradhya_catalogue_workspace (
  id text primary key default 'default',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.aaradhya_catalogue_workspace enable row level security;

create policy "Aaradhya catalogue read" on public.aaradhya_catalogue_workspace
  for select to anon using (true);

create policy "Aaradhya catalogue write" on public.aaradhya_catalogue_workspace
  for insert to anon with check (true);

create policy "Aaradhya catalogue update" on public.aaradhya_catalogue_workspace
  for update to anon using (true) with check (true);
