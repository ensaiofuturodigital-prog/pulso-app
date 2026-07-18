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
  { code: 'DCOILWTICO', name_pt: 'Petróleo WTI', description_pt: 'Preço do petróleo bruto americano. Pesa no Ibovespa via Petrobras e afeta o câmbio de países exportadores.', frequency: 'daily' },
  { code: 'RSAFS', name_pt: 'Vendas no Varejo (EUA)', description_pt: 'Termômetro do consumo americano. Forte = economia aquecida.', frequency: 'monthly' },
  { code: 'HOUST', name_pt: 'Início de Construções - Housing Starts (EUA)', description_pt: 'Novo canteiro de obras iniciado. Sensível a juros altos.', frequency: 'monthly' },
  { code: 'PERMIT', name_pt: 'Alvarás de Construção (EUA)', description_pt: 'Antecipa novas construções — indicador adiantado do setor imobiliário.', frequency: 'monthly' },
  { code: 'UMCSENT', name_pt: 'Confiança do Consumidor - Michigan (EUA)', description_pt: 'Como o consumidor americano está se sentindo sobre a economia.', frequency: 'monthly' },
  { code: 'GDPC1', name_pt: 'PIB Real (EUA)', description_pt: 'Crescimento econômico trimestral dos EUA — o dado mais amplo de todos.', frequency: 'quarterly' },
  { code: 'PCEPILFE', name_pt: 'Núcleo do PCE (medida preferida do Fed)', description_pt: 'O indicador de inflação que o próprio Fed diz observar mais de perto.', frequency: 'monthly' },
  { code: 'BOPGSTB', name_pt: 'Balança Comercial (EUA)', description_pt: 'Diferença entre exportações e importações americanas.', frequency: 'monthly' },
  { code: 'ECBMRRFR', name_pt: 'Taxa de Juros do BCE (Zona do Euro)', description_pt: 'Taxa básica de juros da Zona do Euro, definida pelo Banco Central Europeu. Compete diretamente com o Fed na força do dólar frente ao euro.', frequency: 'event' },
  { code: 'ECBDFR', name_pt: 'Taxa de Depósito do BCE (Zona do Euro)', description_pt: 'Taxa que o BCE paga aos bancos por depósitos overnight — termômetro extra da política monetária europeia.', frequency: 'event' },
  { code: 'LRHUTTTTEZM156S', name_pt: 'Taxa de Desemprego - Zona do Euro', description_pt: 'Desemprego na Zona do Euro. Enfraquecimento pode pressionar o BCE a cortar juros, o que tende a fortalecer o dólar frente ao euro.', frequency: 'monthly', source_override: 'eurostat' },
  { code: 'CP0000EZ19M086NEST', name_pt: 'Inflação HICP - Zona do Euro', description_pt: 'Inflação oficial da Zona do Euro. Acima do esperado pressiona o BCE a manter ou subir juros.', frequency: 'monthly' },
];

// Busca o máximo de histórico que o FRED permitir (cada série tem uma data de início diferente)
const HISTORY_START = '1995-01-01';

const EU_CODES = ['ECBMRRFR', 'ECBDFR', 'LRHUTTTTEZM156S', 'CP0000EZ19M086NEST'];

// ---------------------------------------------------------------------------
// FONTE: FRED (Federal Reserve Economic Data)
// ---------------------------------------------------------------------------
async function fetchFredSeries(code) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${code}&api_key=${FRED_API_KEY}&file_type=json&sort_order=asc&observation_start=${HISTORY_START}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao buscar ${code}: ${res.status}`);
  const data = await res.json();
  return data.observations
    .filter(o => o.value !== '.')
    .map(o => ({ date: o.date, value: o.value }));
}

// ---------------------------------------------------------------------------
// FONTE: Eurostat (usada quando a série da OCDE no FRED foi descontinuada,
// como é o caso da LRHUTTTTEZM156S — parada desde jan/2023).
// Dataset "une_rt_m" (Unemployment by sex and age - monthly data), filtrado
// para Zona do Euro (EA20), total, ajustado sazonalmente, % da população ativa.
// Não precisa de chave de API.
// ---------------------------------------------------------------------------
async function fetchEurostatSeries({ dataset, params }) {
  const qs = new URLSearchParams({ format: 'JSON', lang: 'EN', ...params }).toString();
  const url = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?${qs}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao buscar Eurostat ${dataset}: ${res.status}`);
  const data = await res.json();

  const timeIndex = data?.dimension?.time?.category?.index;
  if (!timeIndex) throw new Error(`Eurostat ${dataset}: resposta sem dimensão de tempo (verifique os parâmetros/filtros)`);

  const values = data.value || {};
  const isArray = Array.isArray(values);

  const observations = Object.entries(timeIndex)
    .map(([period, idx]) => {
      const raw = isArray ? values[idx] : values[String(idx)];
      if (raw === undefined || raw === null) return null;
      // período no formato "YYYY-MM" -> "YYYY-MM-01"
      const date = /^\d{4}-\d{2}$/.test(period) ? `${period}-01` : period;
      if (date < HISTORY_START) return null;
      return { date, value: String(raw) };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  return observations;
}

async function fetchEuroAreaUnemployment() {
  return fetchEurostatSeries({
    dataset: 'une_rt_m',
    params: { geo: 'EA20', s_adj: 'SA', unit: 'PC_ACT', sex: 'T', age: 'TOTAL' },
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function run() {
  console.log('Iniciando busca de histórico completo do FRED (+ Eurostat para séries descontinuadas)...');

  for (const ind of INDICATORS) {
    try {
      const { data: upserted, error: upsertError } = await supabase
        .from('indicators')
        .upsert(
          { code: ind.code, name_pt: ind.name_pt, description_pt: ind.description_pt, source: 'fred', country: EU_CODES.includes(ind.code) ? 'EU' : 'US', frequency: ind.frequency },
          { onConflict: 'code' }
        )
        .select()
        .single();
      if (upsertError) throw upsertError;
      const indicatorId = upserted.id;

      const observations = ind.source_override === 'eurostat'
        ? await fetchEuroAreaUnemployment()
        : await fetchFredSeries(ind.code);

      if (observations.length === 0) { console.log(`⚠️  ${ind.code}: nenhum dado retornado`); continue; }

      // Payroll: FRED entrega o NÍVEL total de empregos (ex: 158.984 mil).
      // O número que o mercado comenta é a VARIAÇÃO mês a mês (ex: +192K).
      // Convertemos aqui pra bater com o que todo mundo usa como "o Payroll".
      let obsForRows = observations;
      if (ind.code === 'PAYEMS') {
        obsForRows = observations.slice(1).map((o, i) => ({
          date: o.date,
          value: Math.round(o.value - observations[i].value),
        }));
      }

      // Antes de sobrescrever, verifica qual era a observação mais recente que já
      // tínhamos, pra saber se a mais nova de agora é realmente inédita (ou seja,
      // "acabou de sair"). É isso que alimenta o selo "✅ Saiu hoje" no site.
      const { data: prevLatestRows } = await supabase
        .from('indicator_releases')
        .select('release_date')
        .eq('indicator_id', indicatorId)
        .order('release_date', { ascending: false })
        .limit(1);
      const prevLatestDate = prevLatestRows && prevLatestRows[0] ? prevLatestRows[0].release_date : null;
      const newestObsDate = obsForRows[obsForRows.length - 1].date;
      const isFreshRelease = newestObsDate !== prevLatestDate;

      const rows = obsForRows.map((obs, i) => ({
        indicator_id: indicatorId,
        release_date: obs.date,
        actual_value: parseFloat(obs.value),
        previous_value: i > 0 ? parseFloat(obsForRows[i - 1].value) : null,
      }));

      for (const batch of chunk(rows, 500)) {
        const { error } = await supabase.from('indicator_releases').upsert(batch, { onConflict: 'indicator_id,release_date' });
        if (error) console.error(`Erro no lote de ${ind.code}:`, error.message);
      }

      // Update separado e pontual, só nessa linha — não mexe no resto do histórico.
      if (isFreshRelease) {
        await supabase.from('indicator_releases')
          .update({ fetched_at: new Date().toISOString() })
          .eq('indicator_id', indicatorId).eq('release_date', newestObsDate);
        console.log(`🆕 ${ind.code}: divulgação nova detectada (${newestObsDate})`);
      }

      const fonte = ind.source_override === 'eurostat' ? 'Eurostat' : 'FRED';
      console.log(`✅ ${ind.code} [${fonte}]: ${rows.length} pontos históricos (desde ${observations[0].date} até ${observations[observations.length - 1].date})`);
    } catch (err) {
      console.error(`❌ Falha em ${ind.code}:`, err.message);
    }
  }

  console.log('Finalizado.');
}

run();
