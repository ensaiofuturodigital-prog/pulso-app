import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Séries do Banco Central (API pública SGS, sem necessidade de chave).
// BCB_USDBRL também funciona como nosso "termômetro de mercado" pra
// cruzar com os outros indicadores (câmbio reage rápido a tudo).
const SERIES = [
  { code: '432', series_id: 'BCB_SELIC', name_pt: 'Meta Selic (Copom)', description_pt: 'Taxa básica de juros definida pelo Banco Central. Afeta diretamente o custo do dinheiro no Brasil e o DI futuro.', frequency: 'event' },
  { code: '433', series_id: 'BCB_IPCA', name_pt: 'IPCA - Inflação oficial (Brasil)', description_pt: 'Inflação oficial do Brasil. Acima do esperado pressiona o Banco Central a manter ou subir juros.', frequency: 'monthly' },
  { code: '1', series_id: 'BCB_USDBRL', name_pt: 'Câmbio USD/BRL (PTAX)', description_pt: 'Cotação oficial do dólar frente ao real. Referência direta para o WDO — também usamos essa série para medir a reação do mercado a outros indicadores.', frequency: 'daily' },
];

// Datas iniciais mais realistas por série (evita pedir 40 anos de uma série mensal e tomar timeout)
const START_DATE = { '432': '2000-01-01', '433': '2000-01-01', '1': '1999-01-01' };

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchBcbSeries(code) {
  const start = START_DATE[code] || '2000-01-01';
  const [y, m, d] = start.split('-');
  const dataInicial = `${d}/${m}/${y}`;
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${dataInicial}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao buscar série ${code}: ${res.status}`);
  const data = await res.json();
  // BCB já retorna do mais antigo pro mais novo — mantemos essa ordem
  return data.map(d => ({
    date: d.data.split('/').reverse().join('-'),
    value: parseFloat(d.valor.replace(',', '.')),
  }));
}

async function run() {
  console.log('Iniciando busca de histórico completo do Banco Central...');

  for (const serie of SERIES) {
    try {
      const { data: upserted, error: upsertError } = await supabase
        .from('indicators')
        .upsert(
          { code: serie.series_id, name_pt: serie.name_pt, description_pt: serie.description_pt, source: 'bcb', country: 'BR', frequency: serie.frequency },
          { onConflict: 'code' }
        )
        .select()
        .single();
      if (upsertError) throw upsertError;
      const indicatorId = upserted.id;

      const observations = await fetchBcbSeries(serie.code);
      if (observations.length === 0) { console.log(`⚠️  ${serie.series_id}: nenhum dado retornado`); continue; }

      const rows = observations.map((obs, i) => ({
        indicator_id: indicatorId,
        release_date: obs.date,
        actual_value: obs.value,
        previous_value: i > 0 ? observations[i - 1].value : null,
      }));

      for (const batch of chunk(rows, 500)) {
        const { error } = await supabase.from('indicator_releases').upsert(batch, { onConflict: 'indicator_id,release_date' });
        if (error) console.error(`Erro no lote de ${serie.series_id}:`, error.message);
      }

      console.log(`✅ ${serie.series_id}: ${rows.length} pontos históricos (desde ${observations[0].date})`);
    } catch (err) {
      console.error(`❌ Falha em ${serie.series_id}:`, err.message);
    }
  }

  console.log('Finalizado.');
}

run();
