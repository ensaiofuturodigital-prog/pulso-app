import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Séries do Banco Central (API pública SGS, sem necessidade de chave)
const SERIES = [
  { code: '432', series_id: 'BCB_SELIC', name_pt: 'Meta Selic (Copom)', description_pt: 'Taxa básica de juros definida pelo Banco Central. Afeta diretamente o custo do dinheiro no Brasil e o DI futuro.', frequency: 'event' },
  { code: '433', series_id: 'BCB_IPCA', name_pt: 'IPCA - Inflação oficial (Brasil)', description_pt: 'Inflação oficial do Brasil. Acima do esperado pressiona o Banco Central a manter ou subir juros.', frequency: 'monthly' },
  { code: '1', series_id: 'BCB_USDBRL', name_pt: 'Câmbio USD/BRL (PTAX)', description_pt: 'Cotação oficial do dólar frente ao real. Referência direta para o WDO.', frequency: 'daily' },
];

async function fetchBcbSeries(code) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/8?formato=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao buscar série ${code}: ${res.status}`);
  const data = await res.json();
  // BCB retorna do mais antigo pro mais novo — invertemos pra ficar igual ao padrão do FRED (mais novo primeiro)
  return data.reverse().map(d => ({
    date: d.data.split('/').reverse().join('-'), // "dd/mm/aaaa" -> "aaaa-mm-dd"
    value: parseFloat(d.valor.replace(',', '.')),
  }));
}

async function run() {
  console.log('Iniciando busca de indicadores do Banco Central...');

  for (const serie of SERIES) {
    try {
      const { data: upserted, error: upsertError } = await supabase
        .from('indicators')
        .upsert(
          {
            code: serie.series_id,
            name_pt: serie.name_pt,
            description_pt: serie.description_pt,
            source: 'bcb',
            country: 'BR',
            frequency: serie.frequency,
          },
          { onConflict: 'code' }
        )
        .select()
        .single();

      if (upsertError) throw upsertError;
      const indicatorId = upserted.id;

      const observations = await fetchBcbSeries(serie.code);

      for (let i = 0; i < observations.length; i++) {
        const obs = observations[i];
        const previous = observations[i + 1] ? observations[i + 1].value : null;

        const { error: releaseError } = await supabase
          .from('indicator_releases')
          .upsert(
            {
              indicator_id: indicatorId,
              release_date: obs.date,
              actual_value: obs.value,
              previous_value: previous,
            },
            { onConflict: 'indicator_id,release_date' }
          );

        if (releaseError) console.error(`Erro ao salvar ${serie.series_id} em ${obs.date}:`, releaseError.message);
      }

      console.log(`✅ ${serie.series_id} atualizado (${observations.length} pontos)`);
    } catch (err) {
      console.error(`❌ Falha em ${serie.series_id}:`, err.message);
    }
  }

  console.log('Finalizado.');
}

run();
