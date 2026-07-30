// Lê o texto colado da tabela de "Dados Históricos" do Investing.com (WDO/WIN)
// e devolve uma lista de candles: { date, open, high, low, close }
//
// Formato esperado (copiado direto da tabela, com tabs), formato numérico
// europeu (ponto = milhar, vírgula = decimal):
//   28.07.2026	5.131,50	5.122,50	5.135,00	5.114,00	1,61M	+0.28%
//   (Data, Último, Abertura, Máxima, Mínima, Vol., Var%)

function parseEuroNumber(s) {
  if (!s) return null;
  const cleaned = s.trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

export function parsePriceText(rawText) {
  const lines = rawText.split('\n').map(l => l.replace(/\r$/, ''));
  const rows = [];

  for (const line of lines) {
    const cols = line.split('\t').map(c => c.trim());
    if (cols.length < 5) continue;
    const dm = DATE_RE.exec(cols[0]);
    if (!dm) continue; // pula cabeçalho e linhas que não começam com data
    const [, dd, mm, yyyy] = dm;
    const isoDate = `${yyyy}-${mm}-${dd}`;
    const close = parseEuroNumber(cols[1]);
    const open = parseEuroNumber(cols[2]);
    const high = parseEuroNumber(cols[3]);
    const low = parseEuroNumber(cols[4]);
    if (close === null) continue;
    rows.push({ date: isoDate, open, high, low, close });
  }

  return rows;
}
