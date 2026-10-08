import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const isLocal = !(SUPABASE_URL && SUPABASE_ANON_KEY);

function randomString(length) {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => abc[b % abc.length]).join('');
}
const newId = () => randomString(10);
const newAdminKey = () => randomString(24);

// Errore di rete o servizio non raggiungibile (es. database Supabase in pausa),
// da distinguere dagli errori "normali" come una password sbagliata.
export function isConnectionError(err) {
  if (!err) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err.name === 'TypeError' || err.code === 'CONNECTION') return true;
  if (Number(err.status) >= 500) return true;
  return /failed to fetch|fetch failed|networkerror|load failed|network request failed|timeout/i.test(String(err.message ?? err));
}

// --- Modalità locale: localStorage, sincronizzata tra schede ---------------
function localBackend() {
  const read = key => {
    try { return JSON.parse(localStorage.getItem(key)) ?? {}; } catch { return {}; }
  };
  const write = (key, val) => localStorage.setItem(key, JSON.stringify(val));

  return {
    async createEvent(ev) {
      const id = newId(), adminKey = newAdminKey();
      const events = read('quando:events');
      events[id] = { ...ev, id, created_at: new Date().toISOString() };
      write('quando:events', events);
      const admins = read('quando:local-admins');
      admins[id] = adminKey;
      write('quando:local-admins', admins);
      return { id, adminKey };
    },
    async getEvent(id) {
      return read('quando:events')[id] ?? null;
    },
    async listResponses(eventId) {
      return Object.values(read('quando:responses')[eventId] ?? {});
    },
    async checkPassword(eventId, name, password) {
      const secret = read('quando:secrets')[eventId]?.[name];
      return !secret || secret === password;
    },
    async saveResponse(eventId, name, password, slots) {
      if (!(await this.checkPassword(eventId, name, password))) throw new Error('Password errata');
      if (password) {
        const secrets = read('quando:secrets');
        secrets[eventId] ??= {};
        secrets[eventId][name] ??= password;
        write('quando:secrets', secrets);
      }
      const all = read('quando:responses');
      all[eventId] ??= {};
      all[eventId][name] = { name, slots, updated_at: new Date().toISOString() };
      write('quando:responses', all);
    },
    async checkAdmin(eventId, adminKey) {
      return !!adminKey && read('quando:local-admins')[eventId] === adminKey;
    },
    async setFinal(eventId, adminKey, final) {
      if (!(await this.checkAdmin(eventId, adminKey))) throw new Error('Non autorizzato');
      const events = read('quando:events');
      events[eventId].final = final;
      write('quando:events', events);
    },
    subscribe(eventId, { onResponses, onEvent }) {
      const onStorage = e => {
        if (e.key === 'quando:responses') onResponses();
        if (e.key === 'quando:events') onEvent();
      };
      addEventListener('storage', onStorage);
      return () => removeEventListener('storage', onStorage);
    },
  };
}

// --- Supabase -------------------------------------------------------------
async function supabaseBackend() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const check = ({ data, error }) => { if (error) throw error; return data; };
  // Funzione SQL non ancora installata (script non eseguito).
  const missingFunction = error => error?.code === 'PGRST202';

  return {
    async createEvent(ev) {
      const id = newId(), adminKey = newAdminKey();
      const { error } = await db.rpc('create_event', { p_event: { ...ev, id }, p_admin_key: adminKey });
      if (!error) return { id, adminKey };
      if (!missingFunction(error)) throw error;
      // Database senza sql/005: evento creato senza link di gestione.
      check(await db.from('events').insert({ ...ev, id }));
      return { id, adminKey: null };
    },
    async getEvent(id) {
      return check(await db.from('events').select('*').eq('id', id).maybeSingle());
    },
    async listResponses(eventId) {
      return check(await db.from('responses').select('name, slots, updated_at').eq('event_id', eventId));
    },
    async checkPassword(eventId, name, password) {
      return check(await db.rpc('check_password', { p_event_id: eventId, p_name: name, p_password: password }));
    },
    async saveResponse(eventId, name, password, slots) {
      check(await db.rpc('save_response', { p_event_id: eventId, p_name: name, p_password: password, p_slots: slots }));
    },
    async checkAdmin(eventId, adminKey) {
      if (!adminKey) return false;
      const { data, error } = await db.rpc('check_admin', { p_event_id: eventId, p_admin_key: adminKey });
      if (missingFunction(error)) return false;
      if (error) throw error;
      return data === true;
    },
    async setFinal(eventId, adminKey, final) {
      check(await db.rpc('set_final', { p_event_id: eventId, p_admin_key: adminKey, p_final: final }));
    },
    subscribe(eventId, { onResponses, onEvent }) {
      const channel = db.channel(`event:${eventId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'responses', filter: `event_id=eq.${eventId}` },
          () => onResponses())
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
          () => onEvent())
        .subscribe();
      return () => db.removeChannel(channel);
    },
  };
}

// Se la libreria di Supabase non si carica (es. offline), il sito si apre lo
// stesso e ogni operazione restituisce un errore di connessione.
function unreachableBackend(cause) {
  const fail = async () => {
    const err = new Error(String(cause?.message ?? cause));
    err.code = 'CONNECTION';
    throw err;
  };
  return {
    createEvent: fail, getEvent: fail, listResponses: fail, checkPassword: fail,
    saveResponse: fail, checkAdmin: fail, setFinal: fail,
    subscribe: () => () => {},
  };
}

let backend;
if (isLocal) backend = localBackend();
else {
  try { backend = await supabaseBackend(); }
  catch (err) { backend = unreachableBackend(err); }
}
export const store = backend;
