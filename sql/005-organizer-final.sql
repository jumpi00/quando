-- Link di gestione per l'organizzatore e orario finale confermato.
-- Esegui dopo 004: Supabase → SQL Editor → New query → Run.
--
-- Alla creazione il sito genera una chiave segreta (nel link di gestione).
-- Qui ne salviamo solo l'impronta cifrata, in una tabella che il sito non può
-- leggere; serve a dimostrare chi è l'organizzatore per confermare l'orario.

create extension if not exists pgcrypto with schema extensions;

-- Orario confermato: { "start": "2026-10-20T10:00", "minutes": 60 } (fuso dell'evento)
alter table public.events
  add column if not exists final jsonb
    check (final is null or jsonb_typeof(final) = 'object');

create table if not exists public.event_secrets (
  event_id   text primary key references public.events(id) on delete cascade,
  admin_hash text not null
);
alter table public.event_secrets enable row level security;
-- Nessuna policy: la tabella non è accessibile dal sito, solo dalle funzioni sotto.

-- Crea evento + chiave dell'organizzatore in un'unica operazione.
create or replace function public.create_event(p_event jsonb, p_admin_key text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if length(coalesce(p_admin_key, '')) < 20 then
    raise exception 'Chiave non valida';
  end if;
  insert into events (id, title, dates, start_minute, end_minute, slot_minutes, timezone, description, contact)
  values (
    p_event->>'id',
    p_event->>'title',
    p_event->'dates',
    (p_event->>'start_minute')::int,
    (p_event->>'end_minute')::int,
    (p_event->>'slot_minutes')::int,
    p_event->>'timezone',
    nullif(p_event->>'description', ''),
    p_event->'contact'
  );
  insert into event_secrets (event_id, admin_hash)
  values (p_event->>'id', crypt(p_admin_key, gen_salt('bf')));
end;
$$;

create or replace function public.check_admin(p_event_id text, p_admin_key text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text;
begin
  select admin_hash into h from event_secrets where event_id = p_event_id;
  return h is not null and coalesce(p_admin_key, '') <> '' and crypt(p_admin_key, h) = h;
end;
$$;

-- Conferma (o annulla, con p_final null) l'orario finale.
create or replace function public.set_final(p_event_id text, p_admin_key text, p_final jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not check_admin(p_event_id, p_admin_key) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if p_final is not null and (
    jsonb_typeof(p_final) <> 'object'
    or coalesce(p_final->>'start', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'
    or coalesce((p_final->>'minutes')::int, 0) not between 5 and 1440
  ) then
    raise exception 'Orario non valido';
  end if;
  update events set final = p_final where id = p_event_id;
end;
$$;

grant execute on function public.create_event(jsonb, text) to anon, authenticated;
grant execute on function public.check_admin(text, text) to anon, authenticated;
grant execute on function public.set_final(text, text, jsonb) to anon, authenticated;

-- La conferma dell'orario arriva in tempo reale anche a chi ha già la pagina aperta.
do $$
begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end;
$$;
