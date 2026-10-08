# Whenly

Un When2meet essenziale: crei un evento, mandi il link, ognuno segna quando è libero e vedi subito gli orari migliori.

- Nessun account: basta il link.
- Griglia a trascinamento (mouse e touch).
- Heatmap di gruppo con dettaglio "chi c'è / chi manca".
- Filtro per persone: escludi qualcuno dal calcolo con un clic.
- Classifica degli orari migliori con durata minima.
- Password facoltativa per partecipante, per modificare la propria risposta da qualsiasi dispositivo.
- Aggiornamento in tempo reale quando qualcuno risponde.
- Fuso orario: chi crea l'evento lo sceglie, chi risponde vede gli orari convertiti nel proprio fuso (modificabile).
- Descrizione dell'evento e contatti dell'organizzatore cliccabili (email, telefono/WhatsApp, link), facoltativi.
- Lingua: si apre nella lingua del dispositivo (IT, EN, ES, FR, DE; altrimenti inglese), con selettore in alto.

Sito statico (HTML/CSS/JS, nessuna build) + [Supabase](https://supabase.com) gratuito come database.

## Provarla in locale

```bash
python3 -m http.server 5173
```

Apri http://localhost:5173. Senza Supabase configurato l'app gira in **modalità locale**: i dati restano nel browser, utile per provarla ma non per condividerla.

## Metterla online

### 1. Database (Supabase, ~5 minuti)

1. Crea un account e un nuovo progetto su supabase.com (piano Free).
2. Vai su **SQL Editor → New query**, incolla il contenuto di `sql/001-schema.sql` e premi **Run**. Ripeti con `sql/002-password.sql` `sql/003-description-contact.sql` e `sql/004-cleanup.sql`.
3. Vai su **Project Settings → API** e copia **Project URL** e la chiave **anon public**.
4. Incollale in `config.js`.

La chiave `anon` è pensata per stare nel codice pubblico. Come su When2meet, chiunque abbia il link di un evento può vederlo e rispondere.

### 2. Hosting (GitHub Pages)

1. Crea un repository su GitHub e carica questa cartella.
2. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, cartella `/ (root)`.
3. Dopo un minuto il sito è su `https://<utente>.github.io/<repo>/`.

## File

| File | Cosa contiene |
|---|---|
| `index.html` | Struttura della pagina |
| `styles.css` | Stile (tema chiaro/scuro automatico) |
| `app.js` | Pagine "crea evento" ed "evento", griglie, classifica |
| `i18n.js` | Traduzioni (per aggiungere una lingua, copia il blocco `en`) |
| `tz.js` | Conversioni di fuso orario |
| `store.js` | Salvataggio dati: Supabase oppure localStorage |
| `config.js` | Chiavi Supabase |
| `sql/` | Schema del database, da eseguire in ordine |

## Limiti attuali

- Gli eventi vengono cancellati automaticamente il giorno dopo la loro ultima data, nel fuso dell'evento (`sql/004-cleanup.sql`).
- `.github/workflows/keepalive.yml` legge dal database ogni 3 giorni per evitare la pausa del piano gratuito di Supabase. GitHub sospende i workflow programmati dopo 60 giorni senza commit: in quel caso basta riattivarlo dalla scheda Actions.

- Chi risponde senza password può essere modificato da chiunque scriva lo stesso nome.
- Una password dimenticata non si recupera (si può cancellare la riga da Supabase → Table Editor → `response_secrets`).
