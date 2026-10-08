-- Password facoltativa per partecipante.
-- Esegui dopo 001-schema.sql: Supabase → SQL Editor → New query → Run.
--
-- Le password sono salvate cifrate (bcrypt) in una tabella che il sito non può
-- leggere. Le risposte si scrivono solo tramite save_response(), che controlla
-- la password se il nome ne ha una.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.response_secrets (
  event_id       text not null,
  name           text not null,
  password_hash  text not null,
  primary key (event_id, name),
  foreign key (event_id, name) references public.responses(event_id, name) on delete cascade
);
alter table public.response_secrets enable row level security;
-- Nessuna policy: la tabella non è accessibile dal sito, solo dalle funzioni sotto.

-- Il sito non scrive più direttamente nella tabella delle risposte.
drop policy if exists "responses: create" on public.responses;
drop policy if exists "responses: update" on public.responses;
drop policy if exists "responses: delete" on public.responses;

-- true se il nome è libero, non ha password, o la password è corretta.
create or replace function public.check_password(p_event_id text, p_name text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text;
begin
  select password_hash into h
  from response_secrets
  where event_id = p_event_id and name = p_name;
  if h is null then
    return true;
  end if;
  return coalesce(p_password, '') <> '' and crypt(p_password, h) = h;
end;
$$;

create or replace function public.save_response(p_event_id text, p_name text, p_password text, p_slots jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if length(trim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception 'Nome non valido';
  end if;
  if jsonb_typeof(p_slots) <> 'array' then
    raise exception 'Disponibilità non valide';
  end if;
  if not check_password(p_event_id, p_name, p_password) then
    raise exception 'Password errata' using errcode = '28P01';
  end if;

  insert into responses (event_id, name, slots, updated_at)
  values (p_event_id, p_name, p_slots, now())
  on conflict (event_id, name) do update
    set slots = excluded.slots, updated_at = now();

  -- La prima password impostata per un nome resta quella.
  if coalesce(p_password, '') <> '' then
    insert into response_secrets (event_id, name, password_hash)
    values (p_event_id, p_name, crypt(p_password, gen_salt('bf')))
    on conflict (event_id, name) do nothing;
  end if;
end;
$$;

grant execute on function public.check_password(text, text, text) to anon, authenticated;
grant execute on function public.save_response(text, text, text, jsonb) to anon, authenticated;
