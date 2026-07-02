import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const FRED_API_KEY = process.env.FRED_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Indicadores que mais afetam WDO e WIN
const INDICATORS = [
  { code: 'CPIAUCSL', name_pt: 'Inflação ao Consumidor (EUA)', description_pt: 'Mede a variação de preços nos EUA. Sobe = pressão pro Fed subir juros = dólar tende a fortalecer.', frequency: 'monthly' },
  { code: 'PAYEMS', name_pt: 'Payroll - Empregos não-agrícolas (EUA)', description_pt: 'Novo emprego criado nos EUA. Acima do esperado = economia forte = pode fortalecer o dólar.', frequency: 'monthly' },
  { code: 'DFF', name_pt: 'Taxa de Juros do Fed', description_pt: 'Juros básicos dos EUA. Afeta diretamente o fluxo de dólar pro mundo todo.', frequency: 'daily' },
  { code: 'DGS10', name_pt: 'Treasury 10 anos (EUA)', description_pt: 'Juro de longo prazo dos EUA. Sobe = geralmente dólar fortalece e bolsas caem.', frequency: 'daily' },
  { code: 'DTWEXBGS', name_pt: 'Índice do Dólar (DXY ampliado)', description_pt: 'Força do dólar frente a uma cesta de moedas. Correlação direta e forte com o WDO.', frequency: 'daily' },
  { code: 'UNRATE', name_pt: 'Taxa de Desemprego (EUA)', description_pt: 'Sobe = economia enfraquecendo = pode pressionar o Fed a cortar juros.', frequency: 'monthly' },
];

async function fetchFredSeries(code) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${code}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=6`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao buscar ${code}: ${res.status}`);
  const data = await res.json();
  return data.observations.filter(o => o.value !== '.');
}

async function run() {
  console.log('Iniciando busca de indicadores do FRED...');

  for (const ind of INDICATORS) {
    try {
      const { data: upserted, error: upsertError } = await supabase
        .from('indicators')
        .upsert(
          {
            code: ind.code,
            name_pt: ind.name_pt,
            description_pt: ind.description_pt,
            source: 'fred',
            country: 'US',
            frequency: ind.frequency,
          },
          { onConflict: 'code' }
        )
        .select()
        .single();

      if (upsertError) throw upsertError;
      const indicatorId = upserted.id;

      const observations = await fetchFredSeries(ind.code);

      for (let i = 0; i < observations.length; i++) {
        const obs = observations[i];
        const previous = observations[i + 1] ? parseFloat(observations[i + 1].value) : null;

        const { error: releaseError } = await supabase
          .from('indicator_releases')
          .upsert(
            {
              indicator_id: indicatorId,
              release_date: obs.date,
              actual_value: parseFloat(obs.value),
              previous_value: previous,
            },
            { onConflict: 'indicator_id,release_date' }
          );

        if (releaseError) console.error(`Erro ao salvar ${ind.code} em ${obs.date}:`, releaseError.message);
      }

      console.log(`✅ ${ind.code} atualizado (${observations.length} pontos)`);
    } catch (err) {
      console.error(`❌ Falha em ${ind.code}:`, err.message);
    }
  }

  console.log('Finalizado.');
}

run();
