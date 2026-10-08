import { store, isLocal } from './store.js';

// --- Utilità ----------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = n => String(n).padStart(2, '0');
const hhmm = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = s => new Date(`${s}T12:00:00`);
const slotKey = (date, min) => `${date}T${hhmm(min)}`;

const fmt = (opts) => new Intl.DateTimeFormat('it-IT', opts);
const fWeekday = fmt({ weekday: 'short' });
const fDayMonth = fmt({ day: 'numeric', month: 'short' });
const fLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fMonth = fmt({ month: 'short' });
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function fmtDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

function fmtDateRange(dates) {
  if (dates.length === 1) return cap(fLong.format(parseDate(dates[0])));
  return `${fDayMonth.format(parseDate(dates[0]))} – ${fDayMonth.format(parseDate(dates.at(-1)))} · ${dates.length} giorni`;
}

const recent = {
  list() {
    try { return JSON.parse(localStorage.getItem('quando:recent')) ?? []; } catch { return []; }
  },
  add(item) {
    const items = [item, ...this.list().filter(i => i.id !== item.id)].slice(0, 8);
    try { localStorage.setItem('quando:recent', JSON.stringify(items)); } catch {}
  },
};

const myName = {
  get(eventId) { try { return localStorage.getItem(`quando:name:${eventId}`) || ''; } catch { return ''; } },
  set(eventId, name) {
    try { name ? localStorage.setItem(`quando:name:${eventId}`, name) : localStorage.removeItem(`quando:name:${eventId}`); } catch {}
  },
};

// Selezione a rettangolo con trascinamento (mouse e touch), come When2meet.
// Le celle selezionabili hanno data-k (chiave), data-c (colonna), data-r (riga).
function rectSelect(root, { getSet, setSet, onEnd }) {
  let start = null, mode = false, snapshot = null;

  const cellAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-k]');
    return el && root.contains(el) ? el : null;
  };
  const apply = cur => {
    const [c0, c1] = [+start.dataset.c, +cur.dataset.c].sort((a, b) => a - b);
    const [r0, r1] = [+start.dataset.r, +cur.dataset.r].sort((a, b) => a - b);
    const next = new Set(snapshot);
    root.querySelectorAll('[data-k]:not([data-off])').forEach(el => {
      const c = +el.dataset.c, r = +el.dataset.r;
      if (c >= c0 && c <= c1 && r >= r0 && r <= r1) {
        mode ? next.add(el.dataset.k) : next.delete(el.dataset.k);
      }
    });
    setSet(next);
  };

  root.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const el = e.target.closest('[data-k]');
    if (!el || el.hasAttribute('data-off')) return;
    e.preventDefault();
    root.setPointerCapture(e.pointerId);
    snapshot = new Set(getSet());
    mode = !snapshot.has(el.dataset.k);
    start = el;
    apply(el);
  });
  root.addEventListener('pointermove', e => {
    if (!start) return;
    const el = cellAt(e.clientX, e.clientY);
    if (el) apply(el);
  });
  const stop = () => {
    if (!start) return;
    start = null;
    onEnd?.();
  };
  root.addEventListener('pointerup', stop);
  root.addEventListener('pointercancel', stop);
}

// --- Router -----------------------------------------------------------------
const app = $('#app');
let cleanup = () => {};

async function route() {
  cleanup();
  cleanup = () => {};
  scrollTo(0, 0);
  const m = location.hash.match(/^#\/e\/([A-Za-z0-9]+)/);
  try {
    if (m) await renderEvent(m[1]);
    else renderCreate();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="card"><h2>Qualcosa è andato storto</h2><p class="muted">${esc(err.message ?? err)}</p><a class="btn" href="#/">Torna all'inizio</a></div>`;
  }
}

$('#footer').innerHTML = isLocal
  ? `Modalità locale: i dati restano solo in questo browser. Per condividere i link, configura Supabase in <code>config.js</code>.`
  : '';
addEventListener('hashchange', route);
route();

// --- Crea evento --------------------------------------------------------------
function renderCreate() {
  const selected = new Set();
  const today = new Date();
  const todayIso = isoDate(today);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  let weekOffset = 0;
  const WEEKS = 5;

  const hourOptions = (sel, from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .map(h => `<option value="${h * 60}"${h === sel ? ' selected' : ''}>${pad(h)}:00</option>`).join('');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const recents = recent.list();

  app.innerHTML = `
    <section class="hero">
      <h1>Trova l'orario giusto per tutti</h1>
      <p>Scegli i giorni possibili, invia il link e guarda in un colpo d'occhio quando sono liberi tutti.</p>
    </section>
    <div class="create-layout">
      <form class="card stack" id="create" novalidate>
        <label class="field">
          <span>Nome dell'evento</span>
          <input type="text" name="title" placeholder="Es. Call di kickoff con il cliente" maxlength="120" autocomplete="off">
        </label>
        <div class="field">
          <div class="row-between">
            <span class="label">Giorni possibili</span>
            <div class="cal-nav">
              <button type="button" class="btn" data-nav="-1" aria-label="Settimane precedenti">‹</button>
              <span id="cal-range"></span>
              <button type="button" class="btn" data-nav="1" aria-label="Settimane successive">›</button>
            </div>
          </div>
          <p class="hint">Clicca o trascina per selezionare più giorni.</p>
          <div class="cal" id="cal"></div>
          <p class="hint" id="cal-count"></p>
        </div>
        <div class="field-row">
          <label class="field"><span>Dalle</span><select name="start">${hourOptions(9, 0, 23)}</select></label>
          <label class="field"><span>Alle</span><select name="end">${hourOptions(18, 1, 24)}</select></label>
          <label class="field"><span>Intervallo</span>
            <select name="slot">
              <option value="15">15 min</option>
              <option value="30" selected>30 min</option>
              <option value="60">1 ora</option>
            </select>
          </label>
        </div>
        <p class="hint">Fuso orario: ${esc(tz)}</p>
        <div>
          <button class="btn primary" type="submit">Crea evento</button>
          <p class="error" id="err"></p>
        </div>
      </form>
      <aside class="card recent">
        <h2>I tuoi eventi</h2>
        ${recents.length
          ? `<ul>${recents.map(r => `<li><a href="#/e/${esc(r.id)}"><b>${esc(r.title)}</b><span>${esc(r.subtitle ?? '')}</span></a></li>`).join('')}</ul>`
          : `<p class="hint">Gli eventi che crei o apri compariranno qui.</p>`}
      </aside>
    </div>`;

  const cal = $('#cal');
  const form = $('#create');

  function drawCal() {
    const start = new Date(monday);
    start.setDate(monday.getDate() + weekOffset * 7);
    let html = ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(d => `<div class="cal-dow">${d}</div>`).join('');
    for (let r = 0; r < WEEKS; r++) {
      for (let c = 0; c < 7; c++) {
        const d = new Date(start);
        d.setDate(start.getDate() + r * 7 + c);
        const k = isoDate(d);
        const past = k < todayIso;
        const showMonth = d.getDate() === 1 || (r === 0 && c === 0);
        html += `<div class="cal-day${selected.has(k) ? ' on' : ''}${k === todayIso ? ' today' : ''}"
          data-k="${k}" data-c="${c}" data-r="${r}"${past ? ' data-off' : ''}>
          ${showMonth ? `<small>${fMonth.format(d)}</small>` : ''}${d.getDate()}</div>`;
      }
    }
    cal.innerHTML = html;
    const end = new Date(start);
    end.setDate(start.getDate() + WEEKS * 7 - 1);
    $('#cal-range').textContent = `${fDayMonth.format(start)} – ${fDayMonth.format(end)}`;
    $('[data-nav="-1"]').disabled = weekOffset <= 0;
    updateCount();
  }
  function updateCount() {
    $('#cal-count').textContent = selected.size
      ? `${selected.size} ${selected.size === 1 ? 'giorno selezionato' : 'giorni selezionati'}`
      : 'Nessun giorno selezionato';
  }

  rectSelect(cal, {
    getSet: () => selected,
    setSet: next => {
      selected.clear();
      next.forEach(k => selected.add(k));
      cal.querySelectorAll('[data-k]').forEach(el => el.classList.toggle('on', selected.has(el.dataset.k)));
      updateCount();
    },
  });
  form.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => {
    weekOffset = Math.max(0, weekOffset + +btn.dataset.nav * 4);
    drawCal();
  }));
  drawCal();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#err');
    const title = form.title.value.trim();
    const start = +form.start.value, end = +form.end.value;
    if (!title) { err.textContent = 'Dai un nome all\'evento.'; form.title.focus(); return; }
    if (!selected.size) { err.textContent = 'Seleziona almeno un giorno.'; return; }
    if (end <= start) { err.textContent = 'L\'orario di fine deve essere dopo quello di inizio.'; return; }
    err.textContent = '';
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Creazione…';
    try {
      const id = await store.createEvent({
        title,
        dates: [...selected].sort(),
        start_minute: start,
        end_minute: end,
        slot_minutes: +form.slot.value,
        timezone: tz,
      });
      location.hash = `#/e/${id}`;
    } catch (ex) {
      err.textContent = `Impossibile creare l'evento: ${ex.message ?? ex}`;
      btn.disabled = false;
      btn.textContent = 'Crea evento';
    }
  });
}

// --- Pagina evento ------------------------------------------------------------
async function renderEvent(id) {
  app.innerHTML = `<p class="muted">Caricamento…</p>`;
  const ev = await store.getEvent(id);
  if (!ev) {
    app.innerHTML = `<div class="card"><h2>Evento non trovato</h2><p class="muted">Il link potrebbe essere sbagliato o l'evento non esiste più.</p><a class="btn" href="#/">Crea un nuovo evento</a></div>`;
    return;
  }

  const dates = ev.dates;
  const times = [];
  for (let m = ev.start_minute; m < ev.end_minute; m += ev.slot_minutes) times.push(m);
  const subtitle = `${fmtDateRange(dates)} · ${hhmm(ev.start_minute)}–${hhmm(ev.end_minute)}`;
  recent.add({ id, title: ev.title, subtitle });

  let responses = await store.listResponses(id);
  let me = myName.get(id);
  let mySlots = new Set(responses.find(r => r.name === me)?.slots ?? []);
  const excluded = new Set();
  const durOptions = [30, 60, 90, 120, 180].filter(d => d >= ev.slot_minutes && d <= ev.end_minute - ev.start_minute);
  let minDuration = durOptions.includes(60) ? 60 : durOptions[0] ?? ev.slot_minutes;

  app.innerHTML = `
    <header class="event-head">
      <div>
        <a href="#/" class="back">← Nuovo evento</a>
        <h1>${esc(ev.title)}</h1>
        <p class="meta">${esc(subtitle)} · ${esc(ev.timezone)}</p>
      </div>
      <button class="btn" id="copy">Copia link da condividere</button>
    </header>
    <div class="event-cols">
      <section class="card" id="mine"></section>
      <section class="card" id="group">
        <div class="row-between">
          <h2>Disponibilità del gruppo</h2>
          <span class="muted" id="group-count"></span>
        </div>
        <div class="chips" id="people"></div>
        <div class="legend" id="legend"></div>
        <div class="grid-wrap"><div class="grid readonly" id="group-grid"></div></div>
        <div class="hover-info" id="hover-info"></div>
      </section>
    </div>
    <section class="card best">
      <div class="row-between">
        <h2>Orari migliori</h2>
        <label class="cal-nav">Durata minima
          <select id="min-dur" style="width:auto">${durOptions.map(d => `<option value="${d}"${d === minDuration ? ' selected' : ''}>${fmtDuration(d)}</option>`).join('')}</select>
        </label>
      </div>
      <ol id="best-list"></ol>
    </section>`;

  const gridCols = `grid-template-columns: 52px repeat(${dates.length}, minmax(44px, 1fr))`;
  function gridHTML() {
    let h = `<div class="g-corner"></div>`;
    dates.forEach(d => {
      const dt = parseDate(d);
      h += `<div class="g-head"><span>${fWeekday.format(dt)}</span><b>${fDayMonth.format(dt)}</b></div>`;
    });
    times.forEach((m, r) => {
      h += `<div class="g-time">${m % 60 === 0 || r === 0 ? hhmm(m) : ''}</div>`;
      dates.forEach((d, c) => {
        const cls = ['g-cell'];
        if (m % 60 === 0) cls.push('hour');
        if (r === 0) cls.push('first');
        if (r === times.length - 1) cls.push('last');
        h += `<div class="${cls.join(' ')}" data-k="${slotKey(d, m)}" data-c="${c}" data-r="${r}"></div>`;
      });
    });
    return h;
  }

  // Le risposte di tutti, con le mie sostituite dallo stato locale (più aggiornato).
  function people() {
    const map = new Map(responses.map(r => [r.name, new Set(r.slots)]));
    if (me && (mySlots.size || map.has(me))) map.set(me, mySlots);
    return [...map.entries()]
      .map(([name, slots]) => ({ name, slots }))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }

  // --- La mia disponibilità
  const mine = $('#mine');
  let saveTimer = null;

  function renderMine() {
    if (!me) {
      mine.innerHTML = `
        <h2>La tua disponibilità</h2>
        <p class="hint">Inserisci il tuo nome per indicare quando sei libero. Se hai già risposto, usa lo stesso nome per modificare.</p>
        <form class="join" id="join">
          <input type="text" name="name" placeholder="Il tuo nome" maxlength="40" autocomplete="name" required>
          <button class="btn primary">Continua</button>
        </form>`;
      $('#join').addEventListener('submit', e => {
        e.preventDefault();
        const name = e.target.name.value.trim();
        if (!name) return;
        me = name;
        myName.set(id, me);
        mySlots = new Set(responses.find(r => r.name === me)?.slots ?? []);
        renderMine();
        renderGroup();
      });
      return;
    }
    mine.innerHTML = `
      <div class="row-between">
        <h2>La tua disponibilità</h2>
        <span class="muted">${esc(me)} · <button class="link-btn" id="change-name">non sei tu?</button></span>
      </div>
      <p class="hint">Trascina sulle caselle in cui sei libero. Trascina di nuovo per togliere.</p>
      <div class="grid-wrap"><div class="grid paint" id="my-grid" style="${gridCols}">${gridHTML()}</div></div>
      <p class="status" id="save-status"></p>`;
    const grid = $('#my-grid');
    const paint = () => grid.querySelectorAll('[data-k]').forEach(el => el.classList.toggle('on', mySlots.has(el.dataset.k)));
    paint();
    rectSelect(grid, {
      getSet: () => mySlots,
      setSet: next => { mySlots = next; paint(); renderGroup(); },
      onEnd: scheduleSave,
    });
    $('#change-name').addEventListener('click', () => {
      me = '';
      myName.set(id, '');
      renderMine();
      renderGroup();
    });
  }

  function scheduleSave() {
    const status = $('#save-status');
    status.textContent = 'Salvataggio…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const name = me, slots = [...mySlots].sort();
      try {
        await store.saveResponse(id, name, slots);
        const existing = responses.find(r => r.name === name);
        if (existing) existing.slots = slots;
        else responses.push({ name, slots });
        if ($('#save-status')) $('#save-status').textContent = 'Salvato ✓';
      } catch (ex) {
        if ($('#save-status')) $('#save-status').textContent = `Errore nel salvataggio: ${ex.message ?? ex}`;
      }
    }, 500);
  }

  // --- Vista di gruppo
  const groupGrid = $('#group-grid');
  groupGrid.setAttribute('style', gridCols);
  groupGrid.innerHTML = gridHTML();
  const hoverInfo = $('#hover-info');
  const defaultHover = 'Passa sopra (o tocca) una casella per vedere chi è disponibile.';
  let hoverKey = null;

  function availability() {
    const all = people();
    const included = all.filter(p => !excluded.has(p.name));
    const byKey = new Map();
    for (const d of dates) for (const m of times) {
      const k = slotKey(d, m);
      byKey.set(k, included.filter(p => p.slots.has(k)).map(p => p.name));
    }
    return { all, included, byKey };
  }

  function renderGroup() {
    const { all, included, byKey } = availability();
    const total = included.length;

    $('#group-count').textContent = `${all.length} ${all.length === 1 ? 'risposta' : 'risposte'}`;
    $('#people').innerHTML = all.length
      ? all.map(p => `<button class="chip${excluded.has(p.name) ? ' off' : ''}" data-name="${esc(p.name)}" title="Includi/escludi dal calcolo">${esc(p.name)}${p.name === me ? ' (tu)' : ''}</button>`).join('')
      : '';
    $('#legend').innerHTML = total
      ? `<span>0/${total}</span><span class="legend-bar">${Array.from({ length: Math.min(total, 8) + 1 }, (_, i) => `<i style="background:${heat(i / Math.min(total, 8))}"></i>`).join('')}</span><span>${total}/${total} disponibili</span>`
      : '';

    groupGrid.querySelectorAll('[data-k]').forEach(el => {
      const n = byKey.get(el.dataset.k).length;
      el.style.background = total ? heat(n / total) : '';
    });
    showHover(hoverKey, byKey, included);
    renderBest(byKey, included);
  }

  function heat(ratio) {
    if (ratio <= 0) return 'var(--cell)';
    return `color-mix(in oklch, var(--accent) ${Math.round(15 + ratio * 85)}%, var(--cell))`;
  }

  function showHover(key, byKey, included) {
    groupGrid.querySelectorAll('.hover').forEach(el => el.classList.remove('hover'));
    if (!key || !included.length) { hoverInfo.innerHTML = included.length ? defaultHover : 'Ancora nessuna risposta: condividi il link per raccogliere le disponibilità.'; return; }
    groupGrid.querySelector(`[data-k="${key}"]`)?.classList.add('hover');
    const [d, t] = key.split('T');
    const [h, m] = t.split(':').map(Number);
    const yes = byKey.get(key);
    const no = included.map(p => p.name).filter(n => !yes.includes(n));
    hoverInfo.innerHTML = `<b>${esc(cap(fLong.format(parseDate(d))))}, ${t}–${hhmm(h * 60 + m + ev.slot_minutes)}</b> · ${yes.length}/${included.length}<br>
      ${yes.length ? `Disponibili: <b>${yes.map(esc).join(', ')}</b>` : 'Nessuno disponibile'}
      ${no.length ? `<br>Non disponibili: ${no.map(esc).join(', ')}` : ''}`;
  }

  const onHover = e => {
    const el = e.target.closest('[data-k]');
    if (!el) return;
    hoverKey = el.dataset.k;
    const { byKey, included } = availability();
    showHover(hoverKey, byKey, included);
  };
  groupGrid.addEventListener('pointerover', onHover);
  groupGrid.addEventListener('pointerdown', onHover);

  $('#people').addEventListener('click', e => {
    const chip = e.target.closest('[data-name]');
    if (!chip) return;
    const name = chip.dataset.name;
    excluded.has(name) ? excluded.delete(name) : excluded.add(name);
    renderGroup();
  });

  // --- Orari migliori: blocchi consecutivi in cui lo stesso gruppo è libero.
  function renderBest(byKey, included) {
    const list = $('#best-list');
    if (!included.length) {
      list.innerHTML = `<p class="empty">Gli orari migliori appariranno qui appena qualcuno risponde.</p>`;
      return;
    }
    const minSlots = Math.max(1, Math.ceil(minDuration / ev.slot_minutes));
    const blocks = [];
    for (const d of dates) {
      const sets = times.map(m => new Set(byKey.get(slotKey(d, m))));
      for (let i = 0; i + minSlots <= times.length; i++) {
        let group = new Set(sets[i]);
        for (let j = i + 1; j < i + minSlots; j++) group = new Set([...group].filter(n => sets[j].has(n)));
        if (!group.size) continue;
        let end = i + minSlots;
        while (end < times.length && [...group].every(n => sets[end].has(n))) end++;
        // Scarta i blocchi che iniziano dentro un blocco precedente con lo stesso gruppo.
        if (i > 0 && [...group].every(n => sets[i - 1].has(n))) continue;
        blocks.push({ date: d, from: i, to: end, group });
      }
    }
    blocks.sort((a, b) => b.group.size - a.group.size || (b.to - b.from) - (a.to - a.from) || a.date.localeCompare(b.date) || a.from - b.from);
    const top = blocks.slice(0, 6);
    if (!top.length) {
      list.innerHTML = `<p class="empty">Nessun blocco di almeno ${fmtDuration(minDuration)} in cui qualcuno sia disponibile. Prova a ridurre la durata minima.</p>`;
      return;
    }
    list.innerHTML = top.map((b, i) => {
      const start = times[b.from], end = times[b.to - 1] + ev.slot_minutes;
      const missing = included.map(p => p.name).filter(n => !b.group.has(n));
      const full = !missing.length;
      return `<li data-block="${i}">
        <span class="rank">${i + 1}</span>
        <div class="when">
          <b>${esc(cap(fLong.format(parseDate(b.date))))} · ${hhmm(start)}–${hhmm(end)}</b>
          <span>${fmtDuration(end - start)} · ${full ? 'Ci sono tutti' : `Manca: ${missing.map(esc).join(', ')}`}</span>
        </div>
        <span class="score${full ? ' full' : ''}">${b.group.size}/${included.length}</span>
      </li>`;
    }).join('');

    list.querySelectorAll('[data-block]').forEach(li => {
      const b = top[+li.dataset.block];
      const keys = times.slice(b.from, b.to).map(m => slotKey(b.date, m));
      li.addEventListener('pointerenter', () => keys.forEach((k, idx) => {
        const el = groupGrid.querySelector(`[data-k="${k}"]`);
        el?.classList.add('hl');
        if (idx === 0) el?.classList.add('hl-top');
        if (idx === keys.length - 1) el?.classList.add('hl-bottom');
      }));
      li.addEventListener('pointerleave', () => groupGrid.querySelectorAll('.hl').forEach(el => el.classList.remove('hl', 'hl-top', 'hl-bottom')));
    });
  }

  $('#min-dur').addEventListener('change', e => { minDuration = +e.target.value; renderGroup(); });

  $('#copy').addEventListener('click', async e => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(location.href);
      btn.textContent = 'Link copiato ✓';
    } catch {
      prompt('Copia questo link:', location.href);
    }
    setTimeout(() => { btn.textContent = 'Copia link da condividere'; }, 2000);
  });

  renderMine();
  renderGroup();

  // Aggiornamento in tempo reale quando qualcun altro risponde.
  cleanup = store.subscribe(id, async () => {
    responses = await store.listResponses(id);
    renderGroup();
  });
}
