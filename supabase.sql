-- Esegui questo script una volta in Supabase → SQL Editor → New query → Run.

create table if not exists public.events (
  id            text primary key,
  title         text not null,
  dates         jsonb not null,          -- ["2026-10-12", "2026-10-13", ...]
  start_minute  int  not null,           -- es. 540 = 09:00
  end_minute    int  not null,           -- es. 1080 = 18:00
  slot_minutes  int  not null default 30,
  timezone      text not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.responses (
  event_id    text not null references public.events(id) on delete cascade,
  name        text not null,
  slots       jsonb not null default '[]', -- ["2026-10-12T09:00", ...]
  updated_at  timestamptz not null default now(),
  primary key (event_id, name)
);

-- Accesso pubblico tramite link (nessun account), come When2meet.
alter table public.events    enable row level security;
alter table public.responses enable row level security;

create policy "events: read"    on public.events    for select using (true);
create policy "events: create"  on public.events    for insert with check (true);
create policy "responses: read"   on public.responses for select using (true);
create policy "responses: create" on public.responses for insert with check (true);
create policy "responses: update" on public.responses for update using (true);

-- Aggiornamento in tempo reale della vista di gruppo.
alter publication supabase_realtime add table public.responses;
