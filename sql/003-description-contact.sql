-- Descrizione e contatti dell'organizzatore (entrambi facoltativi).
-- Esegui dopo 002-password.sql: Supabase → SQL Editor → New query → Run.

alter table public.events
  add column if not exists description text
    check (description is null or char_length(description) <= 500);

-- { "email": "...", "phone": "...", "url": "..." }
alter table public.events
  add column if not exists contact jsonb
    check (contact is null or jsonb_typeof(contact) = 'object');
