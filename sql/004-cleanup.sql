-- Pulizia automatica: ogni ora cancella gli eventi la cui ultima data è già
-- passata, cioè dal giorno dopo l'ultima data (nel fuso orario dell'evento).
-- Risposte e password collegate vengono cancellate insieme all'evento
-- (on delete cascade).
-- Esegui dopo 003: Supabase → SQL Editor → New query → Run.
-- Si può rieseguire: il job "whenly-cleanup" viene aggiornato, non duplicato.

create extension if not exists pg_cron;

select cron.schedule(
  'whenly-cleanup',
  '0 * * * *',
  $$
    delete from public.events e
    where (
      select max(d::date)
      from jsonb_array_elements_text(e.dates) as d
    ) < (now() at time zone e.timezone)::date
  $$
);

-- Controllo: deve comparire una riga "whenly-cleanup" con schedule "0 * * * *".
select jobid, jobname, schedule, active from cron.job where jobname = 'whenly-cleanup';
