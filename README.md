# Quando

Un When2meet essenziale: crei un evento, mandi il link, ognuno segna quando è libero e vedi subito gli orari migliori.

- Nessun account: basta il link.
- Griglia a trascinamento (mouse e touch).
- Heatmap di gruppo con dettaglio "chi c'è / chi manca".
- Filtro per persone: escludi qualcuno dal calcolo con un clic.
- Classifica degli orari migliori con durata minima.
- Aggiornamento in tempo reale quando qualcuno risponde.

Sito statico (HTML/CSS/JS, nessuna build) + [Supabase](https://supabase.com) gratuito come database.

## Provarla in locale

```bash
python3 -m http.server 5173
```

Apri http://localhost:5173. Senza Supabase configurato l'app gira in **modalità locale**: i dati restano nel browser, utile per provarla ma non per condividerla.

## Metterla online

### 1. Database (Supabase, ~5 minuti)

1. Crea un account e un nuovo progetto su supabase.com (piano Free).
2. Vai su **SQL Editor → New query**, incolla il contenuto di `supabase.sql` e premi **Run**.
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
| `store.js` | Salvataggio dati: Supabase oppure localStorage |
| `config.js` | Chiavi Supabase |
| `supabase.sql` | Schema del database |

## Limiti attuali

- Gli orari sono nel fuso di chi crea l'evento (mostrato in pagina).
- Nessuna password per partecipante: chi conosce il link può modificare la risposta di un altro scrivendo lo stesso nome.
