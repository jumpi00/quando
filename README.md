# Whenly

Crei un evento, mandi il link, ognuno segna quando è libero e vedi subito gli orari migliori.

- Nessun account: basta il link.
- Griglia a trascinamento (mouse e touch).
- Heatmap di gruppo con dettaglio "chi c'è / chi manca".
- Filtro per persone: escludi qualcuno dal calcolo con un clic.
- Classifica degli orari migliori con durata minima.
- Password facoltativa per partecipante, per modificare la propria risposta da qualsiasi dispositivo.
- Aggiornamento in tempo reale quando qualcuno risponde.
- Fuso orario: chi crea l'evento lo sceglie, chi risponde vede gli orari convertiti nel proprio fuso (modificabile).
- Descrizione dell'evento e contatti dell'organizzatore cliccabili (email, telefono/WhatsApp, link), facoltativi.
- Link di gestione per l'organizzatore: conferma l'orario finale, che tutti possono aggiungere a Google Calendar, Outlook o Apple (.ics).
- Accessibile da tastiera (frecce + spazio) e con screen reader.
- Banner per connessione assente o database non raggiungibile; scadenza dell'evento visibile.
- Informativa privacy (`privacy.js`), favicon ⏱️ e anteprima per i link condivisi (`og.png`).
- Lingua: si apre nella lingua del dispositivo (IT, EN, ES, FR, DE; altrimenti inglese), con selettore in alto.

## File

| File | Cosa contiene |
|---|---|
| `index.html` | Struttura della pagina |
| `styles.css` | Stile (tema chiaro/scuro automatico) |
| `app.js` | Pagine "crea evento" ed "evento", griglie, classifica |
| `i18n.js` | Traduzioni (per aggiungere una lingua, copia il blocco `en`) |
| `tz.js` | Conversioni di fuso orario |
| `privacy.js` | Informativa privacy (IT/EN) |
| `store.js` | Salvataggio dati: Supabase oppure localStorage |
| `config.js` | Chiavi Supabase |
| `sql/` | Schema del database, da eseguire in ordine |

## Limiti attuali

- Gli eventi vengono cancellati automaticamente il giorno dopo la loro ultima data, nel fuso dell'evento (`sql/004-cleanup.sql`).
- `.github/workflows/keepalive.yml` legge dal database ogni 3 giorni per evitare la pausa del piano gratuito di Supabase. GitHub sospende i workflow programmati dopo 60 giorni senza commit: in quel caso basta riattivarlo dalla scheda Actions.

- Chi risponde senza password può essere modificato da chiunque scriva lo stesso nome.
- Una password dimenticata non si recupera (si può cancellare la riga da Supabase → Table Editor → `response_secrets`).
