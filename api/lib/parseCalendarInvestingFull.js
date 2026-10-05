// Leitor "guarda tudo" do calendário do Investing.com (português).
// Diferente do leitor antigo (parseCalendarInvesting.js), este NÃO descarta
// nada: feriados, qualquer país, qualquer evento, mesmo os que o Pulso ainda
// não sabe traduzir pra um indicador. Linhas que não consegue entender vão
// pra lista `ignoradas` (que o site mostra), nunca somem em silêncio.
import { parseNumberPT, parseDayHeaderPT, normalizeEventPT } from './parseCalendarInvesting.js';

const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const TIME_TAB_RE = /^(\d{1,2}):(\d{2})\t/;
const ALLDAY_RE = /^dia\s+todo$/i;
const CC_RE = /^[A-Z]{2,3}$/;
const CURRENCY_TO_COUNTRY = { USD: 'US', EUR: 'EA', BRL: 'BR' };
const HEADER_WORDS = new Set(['hora', 'moeda', 'evento', 'import.', 'imp.', 'atual', 'projeção', 'projecao', 'previsão', 'anterior', 'tempo', 'moe.']);
const PERIOD_RE = /\s+\((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez|Q[1-4])\)\s*$/i;

// "Agora" no horário de Brasília (o calendário colado e o pregão são em Brasília).
function brtNow(now) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  return { date, hm };
}

function normalizeCountry(raw) {
  const c = (raw || '').trim().toUpperCase();
  if (CURRENCY_TO_COUNTRY[c]) return CURRENCY_TO_COUNTRY[c];
  if (c === 'EU') return 'EA';
  return c;
}
const pad = (t) => t.replace(/^(\d):/, '0$1:');
const isBoundary = (l) => {
  const t = l.trim();
  return TIME_RE.test(t) || ALLDAY_RE.test(t) || CC_RE.test(t) || TIME_TAB_RE.test(l) || !!parseDayHeaderPT(l);
};

function buildEvent({ date, time, allDay, country, nameRaw, actual, forecast, previous, rawValues, isHoliday }) {
  const eventRaw = nameRaw.replace(/\s{2,}/g, ' ').trim();
  const pm = PERIOD_RE.exec(eventRaw);
  const period = pm ? pm[1] : null;
  const isPlaceholder = !!period && date.endsWith('-01') && (time === '06:00' || time === '07:00');
  return {
    date, time, allDay: allDay || (isHoliday && !time), country,
    eventRaw, event: normalizeEventPT(nameRaw), period,
    isHoliday, isPlaceholder,
    actual, forecast, previous, rawValues,
    actualValue: parseNumberPT(actual), forecastValue: parseNumberPT(forecast), previousValue: parseNumberPT(previous),
    consensus: null,
  };
}

export function parseCalendarFull(rawText, now = new Date()) {
  const lines = rawText.split('\n').map((l) => l.replace(/\r$/, ''));
  const events = [], ignoradas = [];
  const { date: todayStr, hm: nowHM } = brtNow(now);
  let date = null, i = 0;

  while (i < lines.length) {
    const line = lines[i], t = line.trim();
    const d = parseDayHeaderPT(line);
    if (d) { date = d; i++; continue; }
    if (t === '') { i++; continue; }
    if (!date) { if (!HEADER_WORDS.has(t.toLowerCase())) ignoradas.push(`(antes do 1º dia) ${t}`); i++; continue; }

    // Layout A: tudo numa linha, separado por tab
    if (TIME_TAB_RE.test(line)) {
      const c = line.split('\t').map((s) => s.trim());
      const nameRaw = c[3] || '';
      if (!nameRaw) { ignoradas.push(`${date} ${t}`); i++; continue; }
      events.push(buildEvent({ date, time: pad(c[0]), allDay: false, country: normalizeCountry(c[1]), nameRaw, actual: c[4] || null, forecast: c[5] || null, previous: c[6] || null, rawValues: c.slice(4).join('\t'), isHoliday: false }));
      i++; continue;
    }

    // Layout B: [hora | "Dia todo" | nada] / país / evento / valores...
    let time = '', allDay = false, j = i;
    if (TIME_RE.test(t)) { time = pad(t); j = i + 1; }
    else if (ALLDAY_RE.test(t)) { allDay = true; j = i + 1; }
    else if (!CC_RE.test(t)) { ignoradas.push(`${date} ${t}`); i++; continue; }

    while (j < lines.length && lines[j].trim() === '') j++;
    const cTxt = (lines[j] || '').trim();
    if (!CC_RE.test(cTxt)) { ignoradas.push(`${date} ${t}`); i++; continue; }
    const country = normalizeCountry(cTxt);
    j++;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j >= lines.length || isBoundary(lines[j])) { ignoradas.push(`${date} ${t} ${cTxt}`); i = j; continue; }
    const nameRaw = lines[j];
    j++;

    const values = [];
    while (j < lines.length) {
      const l = lines[j];
      if (l.trim() === '') { j++; continue; }
      if (isBoundary(l)) break;
      values.push(l);
      j++;
    }

    let actual = null, forecast = null, previous = null, isHoliday = false;
    // Futuro = data depois de hoje, ou hoje com horário que ainda não chegou (no futuro o 1º número é a PROJEÇÃO, não o resultado).
    const future = date > todayStr || (date === todayStr && !!time && time > nowHM);
    if (values.length && /^feriado\b/i.test(values[0].trim())) isHoliday = true;
    else if (values.length >= 2) {
      const c = values[0].split('\t').map((s) => s.trim());
      if (future) { forecast = c[0] || null; } // evento que ainda não saiu: 1º número = Projeção
      else { actual = c[0] || null; forecast = c[1] || null; }
      previous = values[1].split('\t')[0].trim() || null;
    } else if (values.length === 1) {
      const c = values[0].split('\t').map((s) => s.trim());
      if (c.length > 1) {
        if (future) { forecast = c[0] || null; previous = c[1] || null; }
        else { actual = c[0] || null; forecast = c[1] || null; }
      } else if (future) previous = c[0] || null;
      else actual = c[0] || null;
    }
    events.push(buildEvent({ date, time, allDay, country, nameRaw, actual, forecast, previous, rawValues: values.join(' ¦ '), isHoliday }));
    i = j;
  }
  return { events, ignoradas };
}
