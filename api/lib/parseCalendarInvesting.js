// Lê o texto colado do calendário econômico do Investing.com (em português)
// e devolve uma lista de eventos estruturados: { date, time, country, event,
// actual, previous, consensus, forecast } — mesmo formato de saída do leitor
// do Trading Economics, pra não precisar mudar nada em ingest.js.
//
// Formato esperado (copiado e colado direto da tabela do site, com tabs):
//   Tempo	Moe.	Imp.	Evento	Atual	Projeção	Anterior
//   Segunda, 17 de Agosto de 2026
//   08:00	  BRL		IGP-10 - Índice de Inflação (Mensal) (Aug)	-0,5%	0,1%	-1,1%
//   ...
// Números em formato brasileiro/europeu (ponto = milhar, vírgula = decimal),
// igual ao "Dados Históricos" do Investing.com — reaproveita a mesma lógica
// de parsePrice.js.

const WEEKDAY_RE = /^(Segunda|Terça|Quarta|Quinta|Sexta|Sábado|Domingo),\s*(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})\s*$/i;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

const MONTHS_PT = {
  janeiro: 0, fevereiro: 1, 'março': 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

// Moeda (como aparece na coluna "Moe.") -> código de país usado no resto do
// Pulso (mesma convenção do parseCalendar.js do Trading Economics).
const CURRENCY_TO_COUNTRY = { USD: 'US', EUR: 'EA', BRL: 'BR' };

function parseDayHeaderPT(line) {
  const m = WEEKDAY_RE.exec(line.trim());
  if (!m) return null;
  const [, , day, monthName, year] = m;
  const month = MONTHS_PT[monthName.toLowerCase()];
  if (month === undefined) return null;
  const d = new Date(Date.UTC(parseInt(year), month, parseInt(day)));
  return d.toISOString().slice(0, 10);
}

// Só tira o marcador de mês/trimestre no fim do nome ("(Jul)", "(Aug)", "(Q3)")
// — de propósito NÃO mexe em "(Mensal)"/"(Anual)"/"(sem Ajuste Sazonal)" etc,
// porque no Investing.com esses qualificadores mudam qual série é (ex: CPI
// mensal vs anual são eventos diferentes), diferente do Trading Economics.
function normalizeEventPT(name) {
  let out = name.trim();
  out = out.replace(/\s+\((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\)\s*$/i, '');
  out = out.replace(/\s+\(Q[1-4]\)\s*$/i, '');
  return out.replace(/\s{2,}/g, ' ').trim();
}

// Igual ao parseEuroNumber do parsePrice.js: ponto = separador de milhar,
// vírgula = decimal. Com sufixo K/M/B/T de multiplicador, igual ao
// parseNumericValue do Trading Economics.
export function parseNumberPT(raw) {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  let multiplier = 1;
  if (/K$/i.test(s)) { multiplier = 1e3; s = s.slice(0, -1); }
  else if (/M$/i.test(s)) { multiplier = 1e6; s = s.slice(0, -1); }
  else if (/B$/i.test(s)) { multiplier = 1e9; s = s.slice(0, -1); }
  else if (/T$/i.test(s)) { multiplier = 1e12; s = s.slice(0, -1); }
  s = s.replace('%', '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(s);
  if (isNaN(num)) return null;
  return num * multiplier;
}

export function parseCalendarTextInvesting(rawText) {
  const lines = rawText.split('\n').map(l => l.replace(/\r$/, ''));
  const events = [];
  let currentDate = null;

  for (const line of lines) {
    const dayDate = parseDayHeaderPT(line);
    if (dayDate) { currentDate = dayDate; continue; }
    if (!currentDate) continue; // ignora tudo antes do primeiro cabeçalho de dia (calendário mini, "Aplicar" etc)

    if (!line.includes('\t')) continue;
    const cols = line.split('\t');
    const timeM = TIME_RE.exec(cols[0].trim());
    if (!timeM) continue; // não é linha de evento (cabeçalho de coluna, legenda etc)

    const currency = (cols[1] || '').trim();
    const country = CURRENCY_TO_COUNTRY[currency];
    if (!country) continue; // moeda que o Pulso ainda não rastreia

    const eventNameRaw = (cols[3] || '').trim();
    const eventName = normalizeEventPT(eventNameRaw);
    if (!eventName) continue;

    const actual = (cols[4] || '').trim() || null;
    const forecast = (cols[5] || '').trim() || null; // "Projeção"
    const previous = (cols[6] || '').trim() || null; // "Anterior"

    let hh = parseInt(timeM[1]);
    const time = `${String(hh).padStart(2, '0')}:${timeM[2]}:00`;

    events.push({
      date: currentDate,
      time,
      country,
      event: eventName,
      actual,
      previous,
      consensus: null, // Investing.com não separa consenso de projeção
      forecast,
    });
  }

  return events;
}

// Detecta se o texto colado é do Trading Economics (inglês) ou do Investing.com
// (português) pra rotear pro parser certo automaticamente em ingest.js.
export function looksLikeInvestingCalendar(rawText) {
  return /^\s*Tempo\s*Atual\s*:/m.test(rawText) || /^(Segunda|Terça|Quarta|Quinta|Sexta|Sábado|Domingo), \d{1,2} de \w+ de \d{4}/m.test(rawText);
}
