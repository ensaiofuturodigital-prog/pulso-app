// Lê o texto colado do calendário econômico do Trading Economics e devolve uma
// lista de eventos estruturados: { date, time, country, event, actual, previous, consensus, forecast }
//
// Formato esperado (copiado e colado direto da tabela do site, com tabs):
//   Wednesday July 29 2026	Actual	Previous	Consensus	Forecast
//   08:00 AM
//   US
//   MBA 30-Year Mortgage Rate JUL/24	6.76%	6.69%
//   ...

const DAY_RE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (\w+ \d{1,2} \d{4})\tActual/;
const TIME_RE = /^(\d{1,2}):(\d{2}) (AM|PM)/;
const COUNTRY_RE = /^(US|EA|BR)$/;
const MONTHS = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };

function normalizeEvent(raw) {
  let name = raw;
  name = name.replace(/\s+(Flash|Adv|Final|Prel|2nd Est)\b/g, '');
  name = name.replace(/\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\/\d{1,2}\b/g, '');
  name = name.replace(/\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/g, '');
  name = name.replace(/\s+Q[1-4]\b/g, '');
  return name.trim();
}

function parseDayHeader(line) {
  const m = DAY_RE.exec(line);
  if (!m) return null;
  const [, , dateStr] = m;
  const [monthName, day, year] = dateStr.split(' ');
  const month = MONTHS[monthName];
  if (month === undefined) return null;
  const d = new Date(Date.UTC(parseInt(year), month, parseInt(day)));
  return d.toISOString().slice(0, 10);
}

export function parseCalendarText(rawText) {
  const lines = rawText.split('\n').map(l => l.replace(/\r$/, ''));
  const events = [];
  let currentDate = null;
  let currentTime = null;
  let currentCountry = null;

  for (const line of lines) {
    const dayDate = parseDayHeader(line);
    if (dayDate) {
      currentDate = dayDate;
      currentTime = null;
      currentCountry = null;
      continue;
    }
    const trimmed = line.trim();
    const tm = TIME_RE.exec(trimmed);
    if (tm && trimmed.length <= 8) {
      let hh = parseInt(tm[1]);
      const mm = tm[2];
      if (tm[3] === 'PM' && hh !== 12) hh += 12;
      if (tm[3] === 'AM' && hh === 12) hh = 0;
      currentTime = `${String(hh).padStart(2, '0')}:${mm}:00`;
      continue;
    }
    if (COUNTRY_RE.test(trimmed)) {
      currentCountry = trimmed;
      continue;
    }
    if (!trimmed) continue;

    const cols = line.split('\t');
    const eventName = normalizeEvent(cols[0].trim());
    if (!currentDate || !eventName || !currentCountry) continue;

    events.push({
      date: currentDate,
      time: currentTime,
      country: currentCountry,
      event: eventName,
      actual: (cols[1] || '').trim() || null,
      previous: (cols[2] || '').trim() || null,
      consensus: (cols[3] || '').trim() || null,
      forecast: (cols[4] || '').trim() || null,
    });
    currentTime = null; // não deixa a hora "vazar" pro próximo evento sem hora própria
  }

  return events;
}

// Converte string tipo "3.75%", "187K", "$-77.6B", "5.6" pra número puro (sem
// unidade). Preserva a unidade separadamente pra referência futura se precisar.
export function parseNumericValue(raw) {
  if (!raw) return null;
  let s = raw.replace(/[$,]/g, '').trim();
  let multiplier = 1;
  if (/K$/i.test(s)) { multiplier = 1e3; s = s.slice(0, -1); }
  else if (/M$/i.test(s)) { multiplier = 1e6; s = s.slice(0, -1); }
  else if (/B$/i.test(s)) { multiplier = 1e9; s = s.slice(0, -1); }
  else if (/T$/i.test(s)) { multiplier = 1e12; s = s.slice(0, -1); }
  s = s.replace('%', '');
  const num = parseFloat(s);
  if (isNaN(num)) return null;
  return num * multiplier;
}
