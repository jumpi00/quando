import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const isLocal = !(SUPABASE_URL && SUPABASE_ANON_KEY);

function newId() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => abc[b % abc.length]).join('');
}

// --- Modalità locale: localStorage, sincronizzata tra schede ---------------
function localBackend() {
  const read = key => {
    try { return JSON.parse(localStorage.getItem(key)) ?? {}; } catch { return {}; }
  };
  const write = (key, val) => localStorage.setItem(key, JSON.stringify(val));

  return {
    async createEvent(ev) {
      const id = newId();
      const events = read('quando:events');
      events[id] = { ...ev, id, created_at: new Date().toISOString() };
      write('quando:events', events);
      return id;
    },
    async getEvent(id) {
      return read('quando:events')[id] ?? null;
    },
    async listResponses(eventId) {
      return Object.values(read('quando:responses')[eventId] ?? {});
    },
    async saveResponse(eventId, name, slots) {
      const all = read('quando:responses');
      all[eventId] ??= {};
      all[eventId][name] = { name, slots, updated_at: new Date().toISOString() };
      write('quando:responses', all);
    },
    subscribe(eventId, cb) {
      const onStorage = e => { if (e.key === 'quando:responses') cb(); };
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

  return {
    async createEvent(ev) {
      const id = newId();
      check(await db.from('events').insert({ ...ev, id }));
      return id;
    },
    async getEvent(id) {
      return check(await db.from('events').select('*').eq('id', id).maybeSingle());
    },
    async listResponses(eventId) {
      return check(await db.from('responses').select('name, slots, updated_at').eq('event_id', eventId));
    },
    async saveResponse(eventId, name, slots) {
      check(await db.from('responses').upsert(
        { event_id: eventId, name, slots, updated_at: new Date().toISOString() },
        { onConflict: 'event_id,name' },
      ));
    },
    subscribe(eventId, cb) {
      const channel = db.channel(`responses:${eventId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'responses', filter: `event_id=eq.${eventId}` },
          () => cb())
        .subscribe();
      return () => db.removeChannel(channel);
    },
  };
}

export const store = isLocal ? localBackend() : await supabaseBackend();
