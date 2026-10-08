// Conversioni di fuso orario con le sole API Intl del browser.
const pad = n => String(n).padStart(2, '0');

export const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const formatters = new Map();
function wallClock(ms, tz) {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }));
  }
  const p = {};
  for (const { type, value } of formatters.get(tz).formatToParts(ms)) p[type] = value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
}

// Scarto in minuti del fuso rispetto a UTC in un dato istante.
export function offsetMinutes(ms, tz) {
  const w = wallClock(ms, tz);
  return Math.round((Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) - Math.floor(ms / 60000) * 60000) / 60000);
}

// Data "YYYY-MM-DD" + minuti dalla mezzanotte, nel fuso tz → istante UTC (ms).
export function zonedToUtc(date, min, tz) {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, min);
  const first = offsetMinutes(guess, tz);
  const second = offsetMinutes(guess - first * 60000, tz);
  return guess - second * 60000;
}

// Istante UTC (ms) → { date: "YYYY-MM-DD", min } nel fuso tz.
export function utcToZoned(ms, tz) {
  const w = wallClock(ms, tz);
  return { date: `${w.y}-${pad(w.mo)}-${pad(w.d)}`, min: w.h * 60 + w.mi };
}

export function fmtOffset(off) {
  const a = Math.abs(off);
  return `UTC${off < 0 ? '−' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export const tzName = tz => tz.replaceAll('_', ' ');

let zones;
// <option> per tutti i fusi, ordinati per scarto attuale.
export function timeZoneOptions(selected) {
  if (!zones) {
    let names = [];
    try { names = Intl.supportedValuesOf('timeZone'); } catch {}
    if (!names.includes('UTC')) names.push('UTC');
    const now = Date.now();
    zones = names
      .map(z => ({ z, off: offsetMinutes(now, z) }))
      .sort((a, b) => a.off - b.off || a.z.localeCompare(b.z));
  }
  const list = zones.some(o => o.z === selected)
    ? zones
    : [{ z: selected, off: offsetMinutes(Date.now(), selected) }, ...zones];
  return list
    .map(o => `<option value="${o.z}"${o.z === selected ? ' selected' : ''}>(${fmtOffset(o.off)}) ${tzName(o.z)}</option>`)
    .join('');
}
