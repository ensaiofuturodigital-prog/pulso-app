import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Ibovespa via Yahoo Finance (gratuito, sem chave). Usamos como proxy do WIN,
// já que o preço real do mini-índice da B3 não é gratuito. (Trocamos da Stooq
// pra cá porque a Stooq bloqueia pedidos automáticos com verificação de robô.)
const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=1mo&interval=1d';

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toDateString(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

async function run() {
  console.log('Buscando histórico do Ibovespa (Yahoo Finance)...');

  const { data: upserted, error: upsertError } = await supabase
    .from('indicators')
    .upsert(
      {
        code: 'IBOV',
        name_pt: 'Ibovespa (proxy do WIN)',
        description_pt: 'Índice da bolsa brasileira. Usado como referência gratuita pra estimar a reação do WIN, já que o preço real do mini-índice não é público de graça.',
        source: 'yahoo',
        country: 'BR',
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
  const closes = result.indicators?.quote?.[0]?.close || [];

  const observations = timestamps
    .map((ts, i) => ({ date: toDateString(ts), value: closes[i] }))
    .filter(o => o.value !== null && o.value !== undefined && !isNaN(o.value));

  console.log(`Pontos brutos: ${timestamps.length} | Observações válidas: ${observations.length}`);
  if (observations.length === 0) throw new Error('Nenhum dado válido retornado pelo Yahoo');

  const rows = observations.map((obs, i) => ({
    indicator_id: indicatorId,
    release_date: obs.date,
    actual_value: obs.value,
    previous_value: i > 0 ? observations[i - 1].value : null,
  }));

  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from('indicator_releases').upsert(batch, { onConflict: 'indicator_id,release_date' });
    if (error) console.error('Erro no lote do Ibovespa:', error.message);
  }

  console.log(`✅ IBOV: ${rows.length} pontos históricos (desde ${observations[0].date} até ${observations[observations.length - 1].date})`);
}

run().catch(err => { console.error('❌ Falha:', err.message); process.exitCode = 1; });
