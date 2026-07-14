import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// API SIDRA do IBGE — oficial, gratuita, sem chave.
// Documentação: https://servicodados.ibge.gov.br/api/docs/agregados?versao=3
// Pedimos "v/all" (todas as variáveis da tabela) e escolhemos, no código, a
// variável "Número-índice" — assim não dependemos de acertar o ID exato da
// variável de cabeçalho, só do texto padrão que o IBGE sempre usa.
const SERIES = [
  {
    code: 'IBGE_INPC', table: 1736,
    name_pt: 'INPC - Inflação (Brasil)',
    description_pt: 'Índice Nacional de Preços ao Consumidor. Mede a inflação para famílias de renda mais baixa (1 a 5 salários mínimos). Sai no mesmo dia do IPCA.',
    typical_time_brt: '9h',
  },
  {
    code: 'IBGE_PMC', table: 8880,
    name_pt: 'PMC - Vendas no Varejo (Brasil)',
    description_pt: 'Pesquisa Mensal de Comércio. Mede o volume de vendas do varejo brasileiro — termômetro do consumo das famílias.',
    typical_time_brt: '9h',
  },
  {
    code: 'IBGE_PMS', table: 8688,
    name_pt: 'PMS - Setor de Serviços (Brasil)',
    description_pt: 'Pesquisa Mensal de Serviços. Mede o volume de receita do setor de serviços, o maior peso do PIB brasileiro.',
    typical_time_brt: '9h',
  },
  {
    code: 'IBGE_PIM', table: 8888,
    name_pt: 'PIM-PF - Produção Industrial (Brasil)',
    description_pt: 'Pesquisa Industrial Mensal - Produção Física. Mede a produção da indústria brasileira.',
    typical_time_brt: '9h',
  },
  {
    code: 'IBGE_IPP', table: 6903,
    name_pt: 'IPP - Preços ao Produtor (Brasil)',
    description_pt: 'Índice de Preços ao Produtor. Mede a inflação "na porta de fábrica", antes de chegar ao consumidor — costuma antecipar movimentos do IPCA.',
    typical_time_brt: '9h',
  },
];

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchIndiceSeries(table) {
  // "n1/1" (Brasil) é mais confiável que "n1/all" nem toda tabela do SIDRA
  // tem a unidade territorial configurada para aceitar "all".
  const url = `https://apisidra.ibge.gov.br/values/t/${table}/n1/1/v/all/p/all`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`SIDRA respondeu HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length < 2) throw new Error('Resposta vazia/inesperada da SIDRA');

  const rows = data.slice(1); // primeira linha é o cabeçalho de nomes de coluna

  // Agrupa por variável (D2N) pra escolher a série "de cabeçalho" (número-índice).
  const byVar = {};
  for (const r of rows) {
    const varName = r.D2N || '';
    if (!byVar[varName]) byVar[varName] = [];
    byVar[varName].push(r);
  }
  const varNames = Object.keys(byVar);
  console.log(`   Variáveis encontradas na tabela ${table}: ${varNames.join(' | ')}`);

  // Preferência: "número-índice" > qualquer "índice" > a variável com mais pontos.
  let chosen = varNames.find(v => v.toLowerCase().includes('número-índice'))
    || varNames.find(v => v.toLowerCase().includes('índice'))
    || varNames.sort((a, b) => byVar[b].length - byVar[a].length)[0];

  if (!chosen) throw new Error('Nenhuma variável utilizável encontrada');
  console.log(`   Usando variável: "${chosen}"`);

  return byVar[chosen]
    .map(r => {
      const periodCode = r.D3C; // formato YYYYMM
      const year = periodCode.slice(0, 4);
      const month = periodCode.slice(4, 6);
      const value = parseFloat(r.V);
      return { date: `${year}-${month}-01`, value };
    })
    .filter(o => !isNaN(o.value))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function run() {
  for (const serie of SERIES) {
    try {
      console.log(`Buscando ${serie.code} (tabela SIDRA ${serie.table})...`);

      const { data: upserted, error: upsertError } = await supabase
        .from('indicators')
        .upsert({
          code: serie.code,
          name_pt: serie.name_pt,
          description_pt: serie.description_pt,
          source: 'ibge',
          country: 'BR',
          frequency: 'monthly',
          typical_time_brt: serie.typical_time_brt,
        }, { onConflict: 'code' })
        .select()
        .single();
      if (upsertError) throw upsertError;
      const indicatorId = upserted.id;

      const observations = await fetchIndiceSeries(serie.table);
      if (observations.length === 0) { console.log(`⚠️  ${serie.code}: nenhum dado retornado`); continue; }

      const rows = observations.map((obs, i) => ({
        indicator_id: indicatorId,
        release_date: obs.date,
        actual_value: obs.value,
        previous_value: i > 0 ? observations[i - 1].value : null,
      }));

      for (const batch of chunk(rows, 500)) {
        const { error } = await supabase.from('indicator_releases').upsert(batch, { onConflict: 'indicator_id,release_date' });
        if (error) console.error(`Erro no lote de ${serie.code}:`, error.message);
      }

      console.log(`✅ ${serie.code}: ${rows.length} pontos históricos (desde ${observations[0].date} até ${observations[observations.length - 1].date})`);
    } catch (err) {
      console.error(`❌ ${serie.code}:`, err.message);
    }
  }
  console.log('Finalizado. Nota: essas 5 séries ainda não têm calendário de divulgação automático' +
    ' (release_schedule) — aparecem no histórico, mas não no "Resumo de hoje" até isso ser configurado.');
}

run().catch(err => { console.error('❌ Falha geral:', err.message); process.exitCode = 1; });
