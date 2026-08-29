// Lê o texto colado do calendário econômico do Investing.com (em português)
// e devolve uma lista de eventos estruturados: { date, time, country, event,
// actual, previous, consensus, forecast } — mesmo formato de saída do leitor
// do Trading Economics, pra não precisar mudar nada em ingest.js.
//
// O Investing.com copia em DOIS layouts diferentes dependendo de como o texto
// é selecionado no navegador (varia por zoom, navegador, como você arrasta a
// seleção) — o Pulso reconhece os dois automaticamente:
//
// Layout A — tudo numa linha só, separado por tab:
//   Segunda, 17 de Agosto de 2026
//   08:00	  BRL		IGP-10 - Índice de Inflação (Mensal) (Aug)	-0,5%	0,1%	-1,1%
//
// Layout B — cada campo numa linha:
//   segunda-feira, 3 de agosto de 2026
//   05:00
//   EU
//   PMI Industrial  (Jul)
//   51,9	52,0	
//   52,0
//   (nessa segunda linha de valores, a única coisa é o "Anterior"; a linha
//   de cima traz "Atual" e "Projeção" separados por tab)
//
// Números em formato brasileiro/europeu (ponto = milhar, vírgula = decimal),
// igual ao "Dados Históricos" do Investing.com — reaproveita a mesma lógica
// de parsePrice.js.

const WEEKDAY_RE = /^(Segunda|Terça|Quarta|Quinta|Sexta|Sábado|Domingo)(-feira)?,\s*(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})\s*$/i;
const TIME_ONLY_RE = /^(\d{1,2}):(\d{2})$/;
const TIME_TAB_RE = /^(\d{1,2}):(\d{2})\t/;

const MONTHS_PT = {
  janeiro: 0, fevereiro: 1, 'março': 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

// Moeda (Layout A, coluna "Moe.") -> código de país usado no resto do Pulso.
const CURRENCY_TO_COUNTRY = { USD: 'US', EUR: 'EA', BRL: 'BR' };
// Layout B já vem com o código de país direto ("BR"/"US"/"EU") — só aceita
// esses três, que são os que o Pulso rastreia.
const VALID_COUNTRY_CODES = ['BR', 'US', 'EU', 'EA'];

function parseDayHeaderPT(line) {
  const m = WEEKDAY_RE.exec(line.trim());
  if (!m) return null;
  const [, , , day, monthName, year] = m;
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
  // Bug corrigido em 27/08/2026: o Investing.com às vezes mostra o mês em
  // português ("Ago", "Set") e às vezes em inglês ("Aug", "Sep") dependendo
  // de qual parte do site você copia — antes só tirava o inglês, então um
  // nome como "PMI Industrial (Ago)" nunca batia com o mapa de indicadores
  // (o "(Ago)" ficava grudado e não existia entrada igual no dicionário).
  out = out.replace(/\s+\((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\)\s*$/i, '');
  out = out.replace(/\s+\((Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)\)\s*$/i, '');
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

function normalizeCountry(raw) {
  const c = (raw || '').trim().toUpperCase();
  if (CURRENCY_TO_COUNTRY[c]) return CURRENCY_TO_COUNTRY[c]; // "USD"/"EUR"/"BRL"
  if (VALID_COUNTRY_CODES.includes(c)) return c === 'EU' ? 'EA' : c; // já é "BR"/"US"/"EU"
  return null;
}

export function parseCalendarTextInvesting(rawText) {
  const lines = rawText.split('\n').map(l => l.replace(/\r$/, ''));
  const events = [];
  let currentDate = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const dayDate = parseDayHeaderPT(line);
    if (dayDate) { currentDate = dayDate; i++; continue; }
    if (!currentDate) { i++; continue; } // ignora tudo antes do primeiro cabeçalho de dia

    // --- Layout A: tudo numa linha só, separada por tab ---
    if (TIME_TAB_RE.test(line)) {
      const cols = line.split('\t');
      const timeM = TIME_ONLY_RE.exec(cols[0].trim());
      const country = normalizeCountry(cols[1]);
      const eventName = normalizeEventPT((cols[3] || '').trim());
      if (timeM && country && eventName) {
        events.push({
          date: currentDate,
          time: `${cols[0].trim().padStart(5, '0')}:00`,
          country,
          event: eventName,
          actual: (cols[4] || '').trim() || null,
          previous: (cols[6] || '').trim() || null,
          consensus: null,
          forecast: (cols[5] || '').trim() || null,
        });
      }
      i++;
      continue;
    }

    // --- Layout B: cada campo numa linha (hora / país / evento / valores) ---
    const timeM = TIME_ONLY_RE.exec(line.trim());
    if (timeM) {
      const country = normalizeCountry(lines[i + 1]);
      const eventNameRaw = lines[i + 2];
      if (!country || eventNameRaw === undefined) { i++; continue; }
      const eventName = normalizeEventPT(eventNameRaw);

      // Junta as linhas de valor seguintes (pula linhas em branco) até achar
      // o próximo evento (hora), o próximo dia, ou o fim do texto.
      let j = i + 3;
      const valueLines = [];
      while (j < lines.length && valueLines.length < 2) {
        const l = lines[j];
        if (l.trim() === '') { j++; continue; }
        if (TIME_ONLY_RE.test(l.trim()) || TIME_TAB_RE.test(l) || parseDayHeaderPT(l)) break;
        valueLines.push(l);
        j++;
      }

      let actual = null, forecast = null, previous = null;
      if (valueLines.length === 1) {
        if (valueLines[0].includes('\t')) {
          const parts = valueLines[0].split('\t').map(s => s.trim()).filter(s => s !== '');
          actual = parts[0] || null;
          forecast = parts[1] || null;
        } else {
          actual = valueLines[0].trim() || null;
        }
      } else if (valueLines.length === 2) {
        const parts = valueLines[0].split('\t').map(s => s.trim()).filter(s => s !== '');
        actual = parts[0] || null;
        forecast = parts[1] || null;
        previous = valueLines[1].trim() || null;
      }

      if (eventName) {
        events.push({
          date: currentDate,
          time: `${line.trim().padStart(5, '0')}:00`,
          country,
          event: eventName,
          actual,
          previous,
          consensus: null,
          forecast,
        });
      }
      i = j;
      continue;
    }

    i++;
  }

  return events;
}

// Detecta se o texto colado é do Trading Economics (inglês) ou do Investing.com
// (português, em qualquer um dos dois layouts) pra rotear pro parser certo
// automaticamente em ingest.js.
export function looksLikeInvestingCalendar(rawText) {
  return /^\s*Tempo\s*Atual\s*:/m.test(rawText) || rawText.split('\n').some(l => WEEKDAY_RE.test(l.trim()));
}
