import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Ibovespa via Stooq (gratuito, sem chave). Usamos como proxy do WIN,
// já que o preço real do mini-índice da B3 não é gratuito.
const STOOQ_URL = 'https://stooq.com/q/d/l/?s=%5Ebvsp&i=d';

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function run() {
  console.log('Buscando histórico do Ibovespa (Stooq)...');

  const { data: upserted, error: upsertError } = await supabase
    .from('indicators')
    .upsert(
      {
        code: 'IBOV',
        name_pt: 'Ibovespa (proxy do WIN)',
        description_pt: 'Índice da bolsa brasileira. Usado como referência gratuita pra estimar a reação do WIN, já que o preço real do mini-índice não é público de graça.',
        source: 'stooq',
        country: 'BR',
        frequency: 'daily',
      },
      { onConflict: 'code' }
    )
    .select()
    .single();
  if (upsertError) throw upsertError;
  const indicatorId = upserted.id;

  const res = await fetch(STOOQ_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept': 'text/csv,*/*',
    },
  });
  console.log(`Stooq respondeu HTTP ${res.status}`);
  if (!res.ok) throw new Error(`Stooq respondeu ${res.status}`);
  const csv = await res.text();

  console.log('Primeiros 200 caracteres da resposta (diagnóstico):');
  console.log(csv.slice(0, 200));

  const lines = csv.trim().split('\n').slice(1); // remove cabeçalho
  const observations = lines
    .map(line => {
      const [date, , , , close] = line.split(',');
      return { date, value: parseFloat(close) };
    })
    .filter(o => o.date && !isNaN(o.value));

  console.log(`Linhas brutas: ${lines.length} | Observações válidas: ${observations.length}`);

  if (observations.length === 0) throw new Error('Nenhum dado válido após o parsing — veja o trecho da resposta acima pra diagnosticar.');

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

run().catch(err => console.error('❌ Falha:', err.message));
