import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const FRED_API_KEY = process.env.FRED_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Indicadores que mais afetam WDO e WIN
const INDICATORS = [
  { code: 'CPIAUCSL', name_pt: 'Inflação ao Consumidor - CPI (EUA)', description_pt: 'Mede a variação de preços nos EUA. Sobe = pressão pro Fed subir juros = dólar tende a fortalecer.', frequency: 'monthly' },
  { code: 'CPILFESL', name_pt: 'Núcleo do CPI - Core CPI (EUA)', description_pt: 'Inflação sem alimentos e energia. É o que o Fed mais observa por ser menos volátil.', frequency: 'monthly' },
  { code: 'PPIACO', name_pt: 'Inflação ao Produtor - PPI (EUA)', description_pt: 'Preços na porta de fábrica. Costuma antecipar movimentos futuros do CPI.', frequency: 'monthly' },
  { code: 'PAYEMS', name_pt: 'Payroll - Empregos não-agrícolas (EUA)', description_pt: 'Novo emprego criado nos EUA. Acima do esperado = economia forte = pode fortalecer o dólar.', frequency: 'monthly' },
  { code: 'ICSA', name_pt: 'Pedidos de Seguro-Desemprego (EUA)', description_pt: 'Dado semanal e mais rápido de saúde do mercado de trabalho americano.', frequency: 'weekly' },
  { code: 'UNRATE', name_pt: 'Taxa de Desemprego (EUA)', description_pt: 'Sobe = economia enfraquecendo = pode pressionar o Fed a cortar juros.', frequency: 'monthly' },
  { code: 'DFF', name_pt: 'Taxa de Juros do Fed', description_pt: 'Juros básicos dos EUA. Afeta diretamente o fluxo de dólar pro mundo todo.', frequency: 'daily' },
  { code: 'DGS10', name_pt: 'Treasury 10 anos (EUA)', description_pt: 'Juro de longo prazo dos EUA. Sobe = geralmente dólar fortalece e bolsas caem.', frequency: 'daily' },
  { code: 'DTWEXBGS', name_pt: 'Índice do Dólar (DXY ampliado)', description_pt: 'Força do dólar frente a uma cesta de moedas. Correlação direta e forte com o WDO.', frequency: 'daily' },
  { code: 'RSAFS', name_pt: 'Vendas no Varejo (EUA)', description_pt: 'Termômetro do consumo americano. Forte = economia aquecida.', frequency: 'monthly' },
  { code: 'HOUST', name_pt: 'Início de Construções - Housing Starts (EUA)', description_pt: 'Novo canteiro de obras iniciado. Sensível a juros altos.', frequency: 'monthly' },
  { code: 'PERMIT', name_pt: 'Alvarás de Construção (EUA)', description_pt: 'Antecipa novas construções — indicador adiantado do setor imobiliário.', frequency: 'monthly' },
  { code: 'UMCSENT', name_pt: 'Confiança do Consumidor - Michigan (EUA)', description_pt: 'Como o consumidor americano está se sentindo sobre a economia.', frequency: 'monthly' },
  { code: 'GDPC1', name_pt: 'PIB Real (EUA)', description_pt: 'Crescimento econômico trimestral dos EUA — o dado mais amplo de todos.', frequency: 'quarterly' },
  { code: 'PCEPILFE', name_pt: 'Núcleo do PCE (medida preferida do Fed)', description_pt: 'O indicador de inflação que o próprio Fed diz observar mais de perto.', frequency: 'monthly' },
  { code: 'BOPGSTB', name_pt: 'Balança Comercial (EUA)', description_pt: 'Diferença entre exportações e importações americanas.', frequency: 'monthly' },
];

// Busca o máximo de histórico que o FRED permitir (cada série tem uma data de início diferente)
const HISTORY_START = '1995-01-01';

async function fetchFredSeries(code) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${code}&api_key=${FRED_API_KEY}&file_type=json&sort_order=asc&observation_start=${HISTORY_START}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao buscar ${code}: ${res.status}`);
  const data = await res.json();
  return data.observations.filter(o => o.value !== '.');
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function run() {
  console.log('Iniciando busca de histórico completo do FRED...');

  for (const ind of INDICATORS) {
    try {
      const { data: upserted, error: upsertError } = await supabase
        .from('indicators')
        .upsert(
          { code: ind.code, name_pt: ind.name_pt, description_pt: ind.description_pt, source: 'fred', country: 'US', frequency: ind.frequency },
          { onConflict: 'code' }
        )
        .select()
        .single();
      if (upsertError) throw upsertError;
      const indicatorId = upserted.id;

      const observations = await fetchFredSeries(ind.code);
      if (observations.length === 0) { console.log(`⚠️  ${ind.code}: nenhum dado retornado`); continue; }

      const rows = observations.map((obs, i) => ({
        indicator_id: indicatorId,
        release_date: obs.date,
        actual_value: parseFloat(obs.value),
        previous_value: i > 0 ? parseFloat(observations[i - 1].value) : null,
      }));

      for (const batch of chunk(rows, 500)) {
        const { error } = await supabase.from('indicator_releases').upsert(batch, { onConflict: 'indicator_id,release_date' });
        if (error) console.error(`Erro no lote de ${ind.code}:`, error.message);
      }

      console.log(`✅ ${ind.code}: ${rows.length} pontos históricos (desde ${observations[0].date})`);
    } catch (err) {
      console.error(`❌ Falha em ${ind.code}:`, err.message);
    }
  }

  console.log('Finalizado.');
}

run();
