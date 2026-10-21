// Lê as cotações e os eventos do Supabase e roda o teste para frente de WDO e WIN.
// Grava o resultado em motores-out/resultado.json (não altera nenhuma tabela).
import fs from 'fs';
import path from 'path';
import { walkForward } from './walkforward.js';

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!URL_BASE || !KEY) { console.error('SUPABASE_URL/SUPABASE_KEY não configurados'); process.exit(1); }

async function lerTudo(caminho) {
  const linhas = [];
  for (let ini = 0; ; ini += 1000) {
    const res = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${ini}-${ini + 999}`, 'Range-Unit': 'items' },
    });
    if (!res.ok && res.status !== 206) throw new Error(`${caminho}: HTTP ${res.status}`);
    const p = await res.json();
    linhas.push(...p);
    if (p.length < 1000) break;
  }
  return linhas;
}

async function run() {
  const precos = await lerTudo('price_daily?select=asset,price_date,open,close&order=price_date.asc');
  const eventos = await lerTudo("calendar_events?select=event_date,country,event_name,actual_value,forecast_value&country=eq.US&actual_value=not.is.null&forecast_value=not.is.null");

  const porAtivo = (a) => precos.filter(p => p.asset === a && p.open != null && p.close != null)
    .map(p => ({ date: p.price_date, open: +p.open, close: +p.close }));
  const wdo = porAtivo('WDO');
  const win = porAtivo('WIN');

  // variação do dólar no pregão anterior (close a close), indexada pela data do dia seguinte
  const dolarMapa = new Map();
  for (let i = 1; i < wdo.length; i++) dolarMapa.set(wdo[i].date, wdo[i - 1].close / (wdo[i - 2]?.close ?? wdo[i - 1].close) - 1);
  const dolarOntem = (date) => {
    const idx = wdo.findIndex(b => b.date === date);
    if (idx < 2) return null;
    return wdo[idx - 1].close / wdo[idx - 2].close - 1;
  };

  // surpresa do dado dos EUA no dia (real - projeção), só o sinal
  const surpresaMapa = new Map();
  for (const e of eventos) {
    const s = Math.sign(+e.actual_value - +e.forecast_value);
    if (!surpresaMapa.has(e.event_date)) surpresaMapa.set(e.event_date, s);
    else surpresaMapa.set(e.event_date, surpresaMapa.get(e.event_date) + s);
  }
  const surpresaEua = (date) => (surpresaMapa.has(date) ? surpresaMapa.get(date) : null);

  const saida = {
    gerado_em: new Date().toISOString(),
    alta_definida_como: 'fechamento acima da abertura do próprio dia',
    WDO: walkForward(wdo, { surpresaEua }),
    WIN: walkForward(win, { dolarOntem, surpresaEua }),
    observacao: 'Cada ano é escolhido só com dados de anos anteriores. Resultado fora da amostra.',
  };
  fs.mkdirSync('motores-out', { recursive: true });
  fs.writeFileSync(path.join('motores-out', 'resultado.json'), JSON.stringify(saida, null, 2));
  console.log('WDO total:', JSON.stringify(saida.WDO.total));
  console.log('WIN total:', JSON.stringify(saida.WIN.total));
}

run().catch(err => { console.error('Falha:', err.message); process.exitCode = 1; });
