-- Pulizia automatica: ogni notte alle 03:00 (UTC) cancella gli eventi la cui
-- ultima data è passata da più di 30 giorni. Risposte e password collegate
-- vengono cancellate insieme all'evento (on delete cascade).
-- Esegui dopo 003: Supabase → SQL Editor → New query → Run.
-- Per cambiare i giorni, modifica "30" e riesegui: il job viene aggiornato.

create extension if not exists pg_cron;

select cron.schedule(
  'whenly-cleanup',
  '0 3 * * *',
  $$
    delete from public.events e
    where (
      select max(d::date)
      from jsonb_array_elements_text(e.dates) as d
    ) < current_date - 30
  $$
);

-- Controllo: deve comparire una riga "whenly-cleanup".
select jobid, jobname, schedule, active from cron.job where jobname = 'whenly-cleanup';
