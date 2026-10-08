import { store, isLocal } from './store.js';
import { LANGS, lang, setLang, t } from './i18n.js';
import { deviceTz, timeZoneOptions, tzName, utcToZoned, zonedToUtc } from './tz.js';

// --- Utilità ----------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = n => String(n).padStart(2, '0');
const hhmm = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = s => new Date(`${s}T12:00:00`);
const slotKey = (date, min) => `${date}T${hhmm(min)}`;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Formattatori di date nella lingua corrente (ricreati a ogni cambio lingua).
let F;
function buildFormatters() {
  const f = opts => new Intl.DateTimeFormat(lang, opts);
  F = {
    weekday: f({ weekday: 'short' }),
    narrow: f({ weekday: 'narrow' }),
    dayMonth: f({ day: 'numeric', month: 'short' }),
    long: f({ weekday: 'long', day: 'numeric', month: 'long' }),
    month: f({ month: 'short' }),
  };
}

function fmtDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

function fmtDateRange(dates) {
  if (dates.length === 1) return cap(F.long.format(parseDate(dates[0])));
  return `${F.dayMonth.format(parseDate(dates[0]))} – ${F.dayMonth.format(parseDate(dates.at(-1)))} · ${t('nDays', dates.length)}`;
}

// --- Contatti dell'organizzatore ----------------------------------------------
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const phoneDigits = phone => String(phone ?? '').replace(/(?!^\+)[^\d]/g, '');

function normalizeUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

const icon = path => `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const CHEVRON_LEFT = icon('<path d="m15 18-6-6 6-6"/>').replace('width="15" height="15"', 'width="20" height="20"');
const CHEVRON_RIGHT = icon('<path d="m9 18 6-6-6-6"/>').replace('width="15" height="15"', 'width="20" height="20"');
const ICONS = {
  email: icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  phone: icon('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  whatsapp: icon('<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 10c.5 2 2 3.5 4 4l1.2-1.2 2 .9c-.3 1.1-1.2 1.8-2.3 1.8C10.8 15.5 8.5 13.2 8.5 10.1c0-1.1.7-2 1.8-2.3l.9 2z"/>'),
  link: icon('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
};

// Link cliccabili; i valori vengono ricontrollati qui perché arrivano dal database.
function contactLinks(contact) {
  if (!contact || typeof contact !== 'object') return '';
  const items = [];
  if (EMAIL_RE.test(contact.email ?? '')) {
    items.push(`<a class="contact" href="mailto:${esc(contact.email)}">${ICONS.email}${esc(contact.email)}</a>`);
  }
  const digits = phoneDigits(contact.phone);
  if (digits.replace('+', '').length >= 6) {
    items.push(`<a class="contact" href="tel:${esc(digits)}">${ICONS.phone}${esc(contact.phone)}</a>`);
    if (digits.startsWith('+')) {
      items.push(`<a class="contact" href="https://wa.me/${digits.slice(1)}" target="_blank" rel="noopener">${ICONS.whatsapp}WhatsApp</a>`);
    }
  }
  const url = normalizeUrl(contact.url);
  if (url) {
    const shown = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    items.push(`<a class="contact" href="${esc(url)}" target="_blank" rel="noopener">${ICONS.link}${esc(shown)}</a>`);
  }
  return items.length ? `<div class="contacts"><span>${t('contactOrganizer')}</span>${items.join('')}</div>` : '';
}

const prefs = {
  get(key, fallback) { try { return localStorage.getItem(`quando:${key}`) || fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`quando:${key}`, value); } catch {} },
};

// Le versioni precedenti salvavano qui un elenco degli eventi aperti: lo cancelliamo.
try { localStorage.removeItem('quando:recent'); } catch {}

// Chi sta rispondendo a un evento su questo dispositivo (nome + password facoltativa).
const session = {
  get(eventId) {
    try { return JSON.parse(localStorage.getItem(`quando:me:${eventId}`)) ?? { name: '', password: '' }; }
    catch { return { name: '', password: '' }; }
  },
  set(eventId, value) {
    try {
      value ? localStorage.setItem(`quando:me:${eventId}`, JSON.stringify(value)) : localStorage.removeItem(`quando:me:${eventId}`);
    } catch {}
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

// --- Router e intestazione -------------------------------------------------
const app = $('#app');
let cleanup = () => {};

function renderChrome() {
  document.documentElement.lang = lang;
  $('#lang-label').textContent = t('language');
  $('#lang').innerHTML = Object.entries(LANGS)
    .map(([code, label]) => `<option value="${code}"${code === lang ? ' selected' : ''}>${label}</option>`).join('');
  $('#footer-note').innerHTML = isLocal ? t('localMode') : '';
  const theme = prefs.get('theme', 'auto');
  const labels = { auto: t('themeAuto'), light: t('themeLight'), dark: t('themeDark') };
  $('#theme-switch').setAttribute('aria-label', t('theme'));
  $('#theme-switch').querySelectorAll('[data-theme-set]').forEach(btn => {
    btn.textContent = labels[btn.dataset.themeSet];
    btn.setAttribute('aria-pressed', String(btn.dataset.themeSet === theme));
  });
}

$('#theme-switch').addEventListener('click', e => {
  const btn = e.target.closest('[data-theme-set]');
  if (!btn) return;
  const theme = btn.dataset.themeSet;
  prefs.set('theme', theme);
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  renderChrome();
});

async function route() {
  cleanup();
  cleanup = () => {};
  buildFormatters();
  renderChrome();
  const m = location.hash.match(/^#\/e\/([A-Za-z0-9]+)/);
  try {
    if (m) await renderEvent(m[1]);
    else renderCreate();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="card"><h2>${t('errorTitle')}</h2><p class="muted">${esc(err.message ?? err)}</p><a class="btn" href="#/">${t('backHome')}</a></div>`;
  }
}

$('#lang').addEventListener('change', e => {
  setLang(e.target.value);
  route();
});
addEventListener('hashchange', () => { scrollTo(0, 0); route(); });
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

  app.innerHTML = `
    <div class="create-page">
    <section class="hero">
      <h1>${t('heroTitle')}</h1>
      <p>${t('heroText')}</p>
    </section>
    <div class="create-layout">
      <form class="card stack create-form" id="create" novalidate>
        <label class="field f-title">
          <span>${t('eventName')}</span>
          <input type="text" name="title" placeholder="${esc(t('eventNamePh'))}" maxlength="120" autocomplete="off">
        </label>
        <div class="field f-cal">
          <div class="row-between">
            <span class="label">${t('days')}</span>
            <div class="cal-nav">
              <button type="button" class="btn" data-nav="-1" aria-label="${esc(t('prevWeeks'))}">${CHEVRON_LEFT}</button>
              <span id="cal-range"></span>
              <button type="button" class="btn" data-nav="1" aria-label="${esc(t('nextWeeks'))}">${CHEVRON_RIGHT}</button>
            </div>
          </div>
          <p class="hint">${t('daysHint')}</p>
          <div class="cal" id="cal"></div>
          <p class="hint" id="cal-count"></p>
        </div>
        <div class="field-row f-times">
          <label class="field"><span>${t('from')}</span><select name="start">${hourOptions(9, 0, 23)}</select></label>
          <label class="field"><span>${t('to')}</span><select name="end">${hourOptions(18, 1, 24)}</select></label>
          <label class="field"><span>${t('interval')}</span>
            <select name="slot">
              ${[15, 30, 60].map(m => `<option value="${m}"${m === 30 ? ' selected' : ''}>${fmtDuration(m)}</option>`).join('')}
            </select>
          </label>
        </div>
        <label class="field f-tz">
          <span>${t('timezone')}</span>
          <select name="tz">${timeZoneOptions(deviceTz)}</select>
        </label>
        <details class="f-extra">
          <summary>${t('moreDetails')}</summary>
          <div class="extra-fields">
            <label class="field">
              <span>${t('description')}</span>
              <textarea name="description" rows="3" maxlength="500" placeholder="${esc(t('descriptionPh'))}"></textarea>
            </label>
            <div class="field">
              <span class="label">${t('contacts')}</span>
              <p class="hint">${t('contactsHint')}</p>
              <div class="contact-fields">
                <input type="email" name="email" placeholder="${esc(t('email'))}" autocomplete="email" maxlength="120">
                <input type="tel" name="phone" placeholder="${esc(t('phonePh'))}" autocomplete="tel" maxlength="30">
                <input type="text" name="url" placeholder="${esc(t('linkPh'))}" autocomplete="url" maxlength="200">
              </div>
            </div>
          </div>
        </details>
        <div class="f-submit">
          <button class="btn primary" type="submit">${t('create')}</button>
          <p class="error" id="err"></p>
        </div>
      </form>
    </div>
    </div>`;

  const cal = $('#cal');
  const form = $('#create');
  // 1–7 gennaio 2024 = lunedì–domenica, per avere le iniziali dei giorni nella lingua corrente.
  const dow = Array.from({ length: 7 }, (_, i) => F.narrow.format(new Date(2024, 0, 1 + i)));

  function drawCal() {
    const start = new Date(monday);
    start.setDate(monday.getDate() + weekOffset * 7);
    let html = dow.map(d => `<div class="cal-dow">${d}</div>`).join('');
    for (let r = 0; r < WEEKS; r++) {
      for (let c = 0; c < 7; c++) {
        const d = new Date(start);
        d.setDate(start.getDate() + r * 7 + c);
        const k = isoDate(d);
        const past = k < todayIso;
        const showMonth = d.getDate() === 1 || (r === 0 && c === 0);
        html += `<div class="cal-day${selected.has(k) ? ' on' : ''}${k === todayIso ? ' today' : ''}"
          data-k="${k}" data-c="${c}" data-r="${r}"${past ? ' data-off' : ''}>
          ${showMonth ? `<small>${F.month.format(d)}</small>` : ''}${d.getDate()}</div>`;
      }
    }
    cal.innerHTML = html;
    const end = new Date(start);
    end.setDate(start.getDate() + WEEKS * 7 - 1);
    $('#cal-range').textContent = `${F.dayMonth.format(start)} – ${F.dayMonth.format(end)}`;
    $('[data-nav="-1"]').disabled = weekOffset <= 0;
    updateCount();
  }
  function updateCount() {
    $('#cal-count').textContent = t('daysSelected', selected.size);
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
    if (!title) { err.textContent = t('errTitle'); form.title.focus(); return; }
    if (!selected.size) { err.textContent = t('errDays'); return; }
    if (end <= start) { err.textContent = t('errTime'); return; }
    const description = form.description.value.trim();
    const contact = {};
    const email = form.email.value.trim(), phone = form.phone.value.trim(), url = normalizeUrl(form.url.value);
    if (email && !EMAIL_RE.test(email)) { err.textContent = t('errEmail'); form.email.focus(); return; }
    if (phone && phoneDigits(phone).replace('+', '').length < 6) { err.textContent = t('errPhone'); form.phone.focus(); return; }
    if (url === null) { err.textContent = t('errUrl'); form.url.focus(); return; }
    if (email) contact.email = email;
    if (phone) contact.phone = phone;
    if (url) contact.url = url;
    err.textContent = '';
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = t('creating');
    try {
      const id = await store.createEvent({
        title,
        dates: [...selected].sort(),
        start_minute: start,
        end_minute: end,
        slot_minutes: +form.slot.value,
        timezone: form.tz.value,
        // Inviati solo se compilati, così il sito funziona anche su database senza queste colonne.
        ...(description && { description }),
        ...(Object.keys(contact).length && { contact }),
      });
      location.hash = `#/e/${id}`;
    } catch (ex) {
      err.textContent = `${t('errCreate')} ${ex.message ?? ex}`;
      btn.disabled = false;
      btn.textContent = t('create');
    }
  });
}

// --- Griglia nel fuso di chi guarda -------------------------------------------
// Le risposte sono salvate con chiavi nel fuso dell'evento ("2026-10-09T10:00").
// Qui ogni slot viene riposizionato nel fuso scelto da chi guarda.
function buildLayout(ev, viewTz) {
  const slots = [];
  for (const d of ev.dates) {
    for (let m = ev.start_minute; m < ev.end_minute; m += ev.slot_minutes) {
      const key = slotKey(d, m);
      const pos = viewTz === ev.timezone ? { date: d, min: m } : utcToZoned(zonedToUtc(d, m, ev.timezone), viewTz);
      slots.push({ key, ...pos });
    }
  }
  const dates = [...new Set(slots.map(s => s.date))].sort();
  const times = [...new Set(slots.map(s => s.min))].sort((a, b) => a - b);
  const byPos = new Map(slots.map(s => [`${s.date}|${s.min}`, s.key]));
  const byKey = new Map(slots.map(s => [s.key, s]));
  return {
    dates, times,
    keys: slots.map(s => s.key),
    at: (d, m) => byPos.get(`${d}|${m}`) ?? null,
    pos: key => byKey.get(key),
  };
}

// --- Pagina evento ------------------------------------------------------------
async function renderEvent(id) {
  app.innerHTML = `<p class="muted">${t('loading')}</p>`;
  const ev = await store.getEvent(id);
  if (!ev) {
    app.innerHTML = `<div class="card"><h2>${t('notFound')}</h2><p class="muted">${t('notFoundText')}</p><a class="btn" href="#/">${t('createNew')}</a></div>`;
    return;
  }

  const viewTz = prefs.get('tz', deviceTz);
  const L = buildLayout(ev, viewTz);
  const { dates, times } = L;
  const slot = ev.slot_minutes;

  let responses = await store.listResponses(id);
  let { name: me, password: myPassword } = session.get(id);
  let mySlots = new Set(responses.find(r => r.name === me)?.slots ?? []);
  const excluded = new Set();
  const durOptions = [30, 60, 90, 120, 180].filter(d => d >= slot && d <= ev.end_minute - ev.start_minute);
  let minDuration = durOptions.includes(60) ? 60 : durOptions[0] ?? slot;

  app.innerHTML = `
    <div class="event-page">
    <header class="event-head">
      <div>
        <a href="#/" class="back">${t('newEvent')}</a>
        <h1>${esc(ev.title)}</h1>
        ${ev.description ? `<p class="event-desc">${esc(ev.description)}</p>` : ''}
        ${contactLinks(ev.contact)}
        <p class="meta">${esc(fmtDateRange(dates))} · ${hhmm(times[0])}–${hhmm(times.at(-1) + slot)}</p>
        <label class="tz-pick">
          <span>${t('showTimesIn')}</span>
          <select id="view-tz">${timeZoneOptions(viewTz)}</select>
        </label>
        ${viewTz !== ev.timezone ? `<p class="hint">${esc(t('createdIn', tzName(ev.timezone)))}</p>` : ''}
      </div>
      <button class="btn" id="copy">${t('copyLink')}</button>
    </header>
    <div class="event-cols">
      <section class="card" id="mine"></section>
      <section class="card" id="group">
        <div class="row-between">
          <h2>${t('groupTitle')}</h2>
          <span class="muted" id="group-count"></span>
        </div>
        <div class="chips" id="people"></div>
        <div class="legend" id="legend"></div>
        <div class="day-pager" data-pager></div>
        <div class="grid-wrap"><div class="grid readonly" id="group-grid"></div></div>
        <div class="hover-info" id="hover-info"></div>
      </section>
    </div>
    <section class="card best">
      <div class="row-between">
        <h2>${t('bestTitle')}</h2>
        <label class="cal-nav">${t('minDuration')}
          <select id="min-dur" style="width:auto">${durOptions.map(d => `<option value="${d}"${d === minDuration ? ' selected' : ''}>${fmtDuration(d)}</option>`).join('')}</select>
        </label>
      </div>
      <ol id="best-list"></ol>
    </section>
    </div>`;

  $('#view-tz').addEventListener('change', e => {
    prefs.set('tz', e.target.value);
    route();
  });

  // Su schermi stretti i giorni si sfogliano a gruppi, così la griglia non scorre in orizzontale.
  let pageStart = 0;
  let perPage = dates.length;
  function measurePerPage() {
    const width = $('#group').clientWidth - 40;
    return Math.max(2, Math.min(dates.length, Math.floor((width - 52) / 46)));
  }
  function visibleDates() {
    pageStart = Math.max(0, Math.min(pageStart, dates.length - perPage));
    return dates.slice(pageStart, pageStart + perPage);
  }
  const gridCols = () => `grid-template-columns: 52px repeat(${visibleDates().length}, minmax(0, 1fr)); --rows: ${times.length}`;
  function renderPagers() {
    const shown = visibleDates();
    const html = dates.length > perPage
      ? `<button type="button" class="btn" data-page="-1" aria-label="${esc(t('prevDays'))}"${pageStart === 0 ? ' disabled' : ''}>${CHEVRON_LEFT}</button>
         <span>${F.dayMonth.format(parseDate(shown[0]))} – ${F.dayMonth.format(parseDate(shown.at(-1)))} · ${pageStart + 1}–${pageStart + shown.length} / ${dates.length}</span>
         <button type="button" class="btn" data-page="1" aria-label="${esc(t('nextDays'))}"${pageStart + perPage >= dates.length ? ' disabled' : ''}>${CHEVRON_RIGHT}</button>`
      : '';
    app.querySelectorAll('[data-pager]').forEach(el => { el.innerHTML = html; el.hidden = !html; });
  }
  function redrawGrids() {
    if (me) renderMine();
    drawGroupGrid();
    renderGroup();
    renderPagers();
  }
  function onPage(e) {
    const btn = e.target.closest('[data-page]');
    if (!btn) return;
    pageStart += +btn.dataset.page * perPage;
    redrawGrids();
  }
  app.addEventListener('click', onPage);
  function onResize() {
    const next = measurePerPage();
    if (next !== perPage) { perPage = next; redrawGrids(); }
  }
  addEventListener('resize', onResize);

  function gridHTML() {
    const dates = visibleDates();
    let h = `<div class="g-corner"></div>`;
    dates.forEach(d => {
      const dt = parseDate(d);
      h += `<div class="g-head"><span>${F.weekday.format(dt)}</span><b>${F.dayMonth.format(dt)}</b></div>`;
    });
    times.forEach((m, r) => {
      // Stacco visivo quando le righe non sono consecutive (es. dopo mezzanotte in un altro fuso).
      const afterGap = r > 0 && m - times[r - 1] !== slot;
      const beforeGap = r < times.length - 1 && times[r + 1] - m !== slot;
      const onHour = afterGap || (m - times[0]) % 60 === 0;
      const gap = afterGap ? ' gap' : '';
      h += `<div class="g-time${gap}">${onHour ? hhmm(m) : ''}</div>`;
      dates.forEach((d, c) => {
        const key = L.at(d, m);
        if (!key) { h += `<div class="g-empty${gap}"></div>`; return; }
        const cls = ['g-cell'];
        if (afterGap) cls.push('gap');
        if (onHour) cls.push('hour');
        if (r === 0 || afterGap || !L.at(d, times[r - 1])) cls.push('first');
        if (r === times.length - 1 || beforeGap || !L.at(d, times[r + 1])) cls.push('last');
        h += `<div class="${cls.join(' ')}" data-k="${key}" data-c="${c}" data-r="${r}"></div>`;
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
      .sort((a, b) => a.name.localeCompare(b.name, lang));
  }

  // --- La mia disponibilità
  const mine = $('#mine');
  let saveTimer = null;

  function renderMine() {
    if (!me) {
      mine.innerHTML = `
        <h2>${t('yourAvailability')}</h2>
        <p class="hint">${t('joinHint')}</p>
        <form class="join-form" id="join">
          <label class="field"><span>${t('name')}</span>
            <input type="text" name="name" maxlength="40" autocomplete="username" required>
          </label>
          <label class="field"><span>${t('password')} <span class="muted">${t('optional')}</span></span>
            <input type="password" name="password" maxlength="72" autocomplete="current-password">
          </label>
          <button class="btn primary">${t('continue')}</button>
        </form>
        <p class="hint">${t('passwordHint')}</p>
        <p class="error" id="join-err"></p>`;
      $('#join').addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.target;
        const name = form.name.value.trim();
        const password = form.password.value;
        if (!name) return;
        const btn = form.querySelector('button');
        btn.disabled = true;
        try {
          if (!(await store.checkPassword(id, name, password))) {
            $('#join-err').textContent = password ? t('errWrongPw') : t('errProtected');
            form.password.focus();
            return;
          }
          me = name;
          myPassword = password;
          session.set(id, { name, password });
          mySlots = new Set(responses.find(r => r.name === me)?.slots ?? []);
          renderMine();
          renderGroup();
        } catch (ex) {
          $('#join-err').textContent = `${t('error')} ${ex.message ?? ex}`;
        } finally {
          btn.disabled = false;
        }
      });
      return;
    }
    mine.innerHTML = `
      <div class="row-between">
        <h2>${t('yourAvailability')}</h2>
        <span class="muted">${myPassword ? `<span title="${esc(t('protected'))}">🔒</span> ` : ''}${esc(me)} · <button class="link-btn" id="change-name">${t('logout')}</button></span>
      </div>
      <p class="hint">${t('paintHint')}</p>
      <div class="day-pager" data-pager></div>
      <div class="grid-wrap"><div class="grid paint" id="my-grid" style="${gridCols()}">${gridHTML()}</div></div>
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
      myPassword = '';
      session.set(id, null);
      renderMine();
      renderGroup();
    });
  }

  function scheduleSave() {
    const status = $('#save-status');
    status.textContent = t('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const name = me, slots = [...mySlots].sort();
      try {
        await store.saveResponse(id, name, myPassword, slots);
        const existing = responses.find(r => r.name === name);
        if (existing) existing.slots = slots;
        else responses.push({ name, slots });
        if ($('#save-status')) $('#save-status').textContent = t('saved');
      } catch (ex) {
        if ($('#save-status')) $('#save-status').textContent = `${t('saveError')} ${ex.message ?? ex}`;
      }
    }, 500);
  }

  // --- Vista di gruppo
  const groupGrid = $('#group-grid');
  function drawGroupGrid() {
    groupGrid.setAttribute('style', gridCols());
    groupGrid.innerHTML = gridHTML();
  }
  const hoverInfo = $('#hover-info');
  let hoverKey = null;

  function availability() {
    const all = people();
    const included = all.filter(p => !excluded.has(p.name));
    const byKey = new Map(L.keys.map(k => [k, included.filter(p => p.slots.has(k)).map(p => p.name)]));
    return { all, included, byKey };
  }

  function renderGroup() {
    const { all, included, byKey } = availability();
    const total = included.length;

    $('#group-count').textContent = t('responses', all.length);
    $('#people').innerHTML = all
      .map(p => `<button class="chip${excluded.has(p.name) ? ' off' : ''}" data-name="${esc(p.name)}" title="${esc(t('toggleTitle'))}">${esc(p.name)}${p.name === me ? ` ${t('you')}` : ''}</button>`)
      .join('');
    $('#legend').innerHTML = total
      ? `<span>0/${total}</span><span class="legend-bar">${Array.from({ length: Math.min(total, 8) + 1 }, (_, i) => `<i style="background:${heat(i / Math.min(total, 8))}"></i>`).join('')}</span><span>${total}/${total} ${t('legendAvailable')}</span>`
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
    if (!key || !included.length) { hoverInfo.innerHTML = included.length ? t('hoverDefault') : t('noResponses'); return; }
    groupGrid.querySelector(`[data-k="${key}"]`)?.classList.add('hover');
    const { date, min } = L.pos(key);
    const yes = byKey.get(key);
    const no = included.map(p => p.name).filter(n => !yes.includes(n));
    hoverInfo.innerHTML = `<b>${esc(cap(F.long.format(parseDate(date))))}, ${hhmm(min)}–${hhmm(min + slot)}</b> · ${yes.length}/${included.length}<br>
      ${yes.length ? `${t('available')}: <b>${yes.map(esc).join(', ')}</b>` : t('nobody')}
      ${no.length ? `<br>${t('unavailable')}: ${no.map(esc).join(', ')}` : ''}`;
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

  // Sequenze di slot consecutivi per ogni giorno, nel fuso di chi guarda.
  function runsOfDay(d) {
    const runs = [];
    let run = [];
    times.forEach((m, r) => {
      const key = L.at(d, m);
      const contiguous = run.length && m - run.at(-1).min === slot;
      if (!key || (run.length && !contiguous)) { if (run.length) runs.push(run); run = []; }
      if (key) run.push({ key, min: m });
    });
    if (run.length) runs.push(run);
    return runs;
  }

  // --- Orari migliori: blocchi consecutivi in cui lo stesso gruppo è libero.
  function renderBest(byKey, included) {
    const list = $('#best-list');
    if (!included.length) {
      list.innerHTML = `<p class="empty">${t('bestEmpty')}</p>`;
      return;
    }
    const minSlots = Math.max(1, Math.ceil(minDuration / slot));
    const blocks = [];
    for (const d of dates) {
      for (const run of runsOfDay(d)) {
        const sets = run.map(s => new Set(byKey.get(s.key)));
        for (let i = 0; i + minSlots <= run.length; i++) {
          let group = new Set(sets[i]);
          for (let j = i + 1; j < i + minSlots; j++) group = new Set([...group].filter(n => sets[j].has(n)));
          if (!group.size) continue;
          // Scarta i blocchi che iniziano dentro un blocco precedente con lo stesso gruppo.
          if (i > 0 && [...group].every(n => sets[i - 1].has(n))) continue;
          let end = i + minSlots;
          while (end < run.length && [...group].every(n => sets[end].has(n))) end++;
          blocks.push({ date: d, slots: run.slice(i, end), group });
        }
      }
    }
    blocks.sort((a, b) => b.group.size - a.group.size || b.slots.length - a.slots.length
      || a.date.localeCompare(b.date) || a.slots[0].min - b.slots[0].min);
    const top = blocks.slice(0, 6);
    if (!top.length) {
      list.innerHTML = `<p class="empty">${t('bestNone', fmtDuration(minDuration))}</p>`;
      return;
    }
    list.innerHTML = top.map((b, i) => {
      const start = b.slots[0].min, end = b.slots.at(-1).min + slot;
      const missing = included.map(p => p.name).filter(n => !b.group.has(n));
      const full = !missing.length;
      return `<li data-block="${i}">
        <span class="rank">${i + 1}</span>
        <div class="when">
          <b>${esc(cap(F.long.format(parseDate(b.date))))} · ${hhmm(start)}–${hhmm(end)}</b>
          <span>${fmtDuration(end - start)} · ${full ? t('everyone') : esc(t('missing', missing.join(', ')))}</span>
        </div>
        <span class="score${full ? ' full' : ''}">${b.group.size}/${included.length}</span>
      </li>`;
    }).join('');

    list.querySelectorAll('[data-block]').forEach(li => {
      const keys = top[+li.dataset.block].slots.map(s => s.key);
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
      btn.textContent = t('linkCopied');
    } catch {
      prompt(t('copyPrompt'), location.href);
    }
    setTimeout(() => { btn.textContent = t('copyLink'); }, 2000);
  });

  perPage = measurePerPage();
  renderMine();
  drawGroupGrid();
  renderGroup();
  renderPagers();

  // Aggiornamento in tempo reale quando qualcun altro risponde.
  const unsubscribe = store.subscribe(id, async () => {
    responses = await store.listResponses(id);
    renderGroup();
  });
  cleanup = () => {
    unsubscribe();
    removeEventListener('resize', onResize);
    app.removeEventListener('click', onPage);
  };
}
