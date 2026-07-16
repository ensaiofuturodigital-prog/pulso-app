import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Dólar à vista (USD/BRL) via Yahoo Finance — gratuito, sem chave, mesmo
// esquema já usado no fetch-ibov.js. Trocamos a PTAX (Banco Central) por essa
// fonte porque a PTAX é só uma foto do meio-dia; o Yahoo traz o dia inteiro
// (abertura, máxima, mínima, fechamento) — muito mais parecido com o
// candlestick que o trader vê no WDO. Não é o WDO em si (que é um futuro,
// com um pequeno "custo de carrego" embutido pela taxa de juros), mas é a
// referência gratuita mais próxima que existe.
const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/BRL=X?range=1mo&interval=1d';
const ASSET = 'USDBRL';
const INDICATOR_CODE = 'BCB_USDBRL'; // mantém o mesmo código pra não quebrar o resto do site

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toDateString(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

async function run() {
  console.log('Buscando histórico do dólar à vista USD/BRL (Yahoo Finance)...');

  const { data: upserted, error: upsertError } = await supabase
    .from('indicators')
    .upsert(
      {
        code: INDICATOR_CODE,
        name_pt: 'Câmbio USD/BRL (dólar à vista)',
        description_pt: 'Dólar à vista frente ao real, com abertura/máxima/mínima/fechamento do dia (Yahoo Finance). Referência de mercado usada para medir a reação do WDO/WIN aos indicadores — próxima do candlestick do dólar futuro, mas não idêntica (o futuro embute um pequeno custo de carrego pela taxa de juros).',
        source: 'yahoo',
        country: 'US',
        frequency: 'daily',
      },
      { onConflict: 'code' }
    )
    .select()
    .single();
  if (upsertError) throw upsertError;
  const indicatorId = upserted.id;

  const res = await fetch(YAHOO_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  console.log(`Yahoo respondeu HTTP ${res.status}`);
  if (!res.ok) throw new Error(`Yahoo respondeu ${res.status}`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('Formato de resposta inesperado do Yahoo');

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const { open = [], high = [], low = [], close = [] } = quote;

  const observations = timestamps
    .map((ts, i) => ({ date: toDateString(ts), open: open[i], high: high[i], low: low[i], close: close[i] }))
    .filter(o => o.close !== null && o.close !== undefined && !isNaN(o.close));

  console.log(`Pontos brutos: ${timestamps.length} | Observações válidas: ${observations.length}`);
  if (observations.length === 0) throw new Error('Nenhum dado válido retornado pelo Yahoo');

  // 1) Tabela price_daily: guarda abertura/máxima/mínima/fechamento pra exibir no site
  const priceRows = observations.map(o => ({
    asset: ASSET,
    price_date: o.date,
    open: o.open ?? null,
    high: o.high ?? null,
    low: o.low ?? null,
    close: o.close,
  }));
  for (const batch of chunk(priceRows, 500)) {
    const { error } = await supabase.from('price_daily').upsert(batch, { onConflict: 'asset,price_date' });
    if (error) console.error('Erro no lote de price_daily (USDBRL):', error.message);
  }

  // 2) indicator_releases: mantém o fechamento como actual_value, pro resto do
  //    site (cálculo de probabilidade, retro-check) continuar funcionando igual.
  const releaseRows = observations.map((obs, i) => ({
    indicator_id: indicatorId,
    release_date: obs.date,
    actual_value: obs.close,
    previous_value: i > 0 ? observations[i - 1].close : null,
  }));
  for (const batch of chunk(releaseRows, 500)) {
    const { error } = await supabase.from('indicator_releases').upsert(batch, { onConflict: 'indicator_id,release_date' });
    if (error) console.error('Erro no lote de indicator_releases (USDBRL):', error.message);
  }

  console.log(`✅ USD/BRL: ${observations.length} pontos históricos (desde ${observations[0].date} até ${observations[observations.length - 1].date})`);
}

run().catch(err => { console.error('❌ Falha:', err.message); process.exitCode = 1; });
