import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────────────────────────────────
// MODELO DOS 5 INDICADORES-PILAR
// Não substitui o compute-stats.js — roda em paralelo, grava em pillar_stats
// (tabela nova). O site continua usando indicator_stats normalmente até
// decidirmos trocar.
//
// Ideia (conversada com o usuário em 27-28/09/2026):
// 1) Cruza a surpresa do indicador (atual vs anterior — expected_value ainda
//    não é preenchido no ingest, então usamos a mesma base do compute-stats.js
//    por enquanto) com o MOMENTUM do WDO nos 5 pregões antes da divulgação
//    (efeito "já precificado" — ex: payroll fraco numa semana em que o
//    mercado já vinha caindo tende a fechar em alta, não em baixa).
// 2) Calcula separado pra "todo o histórico" e "últimos 5 anos", já que a
//    força das divulgações vem caindo (percepção do usuário, plausível dado
//    o forward guidance dos bancos centrais ter ficado muito mais comum).
// ─────────────────────────────────────────────────────────────────────────

const PILLAR_CODES = ['PAYEMS', 'CPILFESL', 'DFF', 'ISM_US_MFG_PMI', 'ICSA'];
// Nota: usamos CPILFESL (núcleo do CPI) em vez de CPIAUCSL porque CPIAUCSL
// ainda não tem nenhuma divulgação colada no banco. Trocar é so mudar aqui.

async function fetchAllRows(table, select, filters = (q) => q, orderCol) {
  let all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    let query = supabase.from(table).select(select);
    if (orderCol) query = query.order(orderCol, { ascending: true });
    query = query.range(from, from + pageSize - 1);
    query = filters(query);
    const { data, error } = await query;
    if (error) throw error;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function combinacao(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n - k) k = n - k;
  let r = 1;
  for (let i = 1; i <= k; i++) r *= (n - k + i) / i;
  return r;
}
function binomialProb(k, n, p) { return combinacao(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k); }
function binomialAcumulada(k, n, p) { let s = 0; for (let i = 0; i <= k; i++) s += binomialProb(i, n, p); return s; }
function testeBinomial(k, n) {
  if (n === 0) return { p_valor: 1, significativo: false };
  const p_valor = Math.min(1, k <= n / 2 ? 2 * binomialAcumulada(k, n, 0.5) : 2 * (1 - binomialAcumulada(k - 1, n, 0.5)));
  return { p_valor: Math.round(p_valor * 10000) / 10000, significativo: p_valor < 0.05 };
}
function wilsonAjustado(k, n, z = 1.96) {
  if (!n) return { pct: 50, inferior: 0, superior: 100 };
  const p = k / n, z2 = z * z, denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    pct: Math.round(((k + z2 / 2) / (n + z2)) * 1000) / 10,
    inferior: Math.round(Math.max(0, center - margin) * 1000) / 10,
    superior: Math.round(Math.min(100, center + margin) * 1000) / 10,
  };
}

async function loadPriceSeries(asset) {
  const rows = await fetchAllRows('price_daily', 'price_date, open, close', (q) => q.eq('asset', asset), 'price_date');
  return rows.filter(r => r.open != null && r.close != null);
}

// Retorno acumulado do WDO nos N pregões ANTERIORES à data (exclusive) da divulgação.
function momentumBefore(priceSeries, dateStr, n = 5) {
  const idx = priceSeries.findIndex(r => r.price_date >= dateStr);
  const cut = idx === -1 ? priceSeries.length : idx;
  if (cut < n) return null; // não tem histórico suficiente antes dessa data
  const window = priceSeries.slice(cut - n, cut);
  const startPrice = window[0].open;
  const endPrice = window[window.length - 1].close;
  if (!startPrice) return null;
  const retorno = (endPrice - startPrice) / startPrice;
  return retorno > 0.001 ? 'subiu' : retorno < -0.001 ? 'caiu' : 'neutro';
}

function directionOnDate(priceSeries, dateStr) {
  const row = priceSeries.find(r => r.price_date === dateStr);
  if (!row) return null;
  if (row.close > row.open) return 'up';
  if (row.close < row.open) return 'down';
  return 'flat';
}

async function computeForIndicator(code, wdoSeries) {
  const { data: ind } = await supabase.from('indicators').select('id').eq('code', code).single();
  if (!ind) { console.log(`⏭️  ${code}: indicador não encontrado na tabela indicators`); return; }

  const releases = await fetchAllRows(
    'indicator_releases',
    'release_date, actual_value, previous_value',
    (q) => q.eq('indicator_id', ind.id).gte('release_date', '2011-01-01'),
    'release_date'
  );

  if (releases.length === 0) { console.log(`⏭️  ${code}: sem divulgações a partir de 2011 ainda — nada pra calcular.`); return; }

  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const fiveYearsAgoStr = fiveYearsAgo.toISOString().slice(0, 10);

  // cenarios[periodo][momentum][surpresa] = { sucessos, total }
  const cenarios = { all: {}, last5y: {} };
  for (const periodo of ['all', 'last5y']) {
    for (const mom of ['subiu', 'caiu', 'neutro']) {
      cenarios[periodo][mom] = { subiu: { k: 0, n: 0 }, caiu: { k: 0, n: 0 } };
    }
  }

  let usados = 0;
  for (const r of releases) {
    if (r.previous_value === null || r.previous_value === undefined) continue;
    const surpresa = r.actual_value > r.previous_value ? 'subiu' : r.actual_value < r.previous_value ? 'caiu' : null;
    if (!surpresa) continue;

    const dirDia = directionOnDate(wdoSeries, r.release_date);
    if (!dirDia || dirDia === 'flat') continue;

    const momentum = momentumBefore(wdoSeries, r.release_date, 5);
    if (!momentum) continue;

    usados++;
    const acertoWdoSobe = dirDia === 'up' ? 1 : 0;

    cenarios.all[momentum][surpresa].n++;
    cenarios.all[momentum][surpresa].k += acertoWdoSobe;

    if (r.release_date >= fiveYearsAgoStr) {
      cenarios.last5y[momentum][surpresa].n++;
      cenarios.last5y[momentum][surpresa].k += acertoWdoSobe;
    }
  }

  console.log(`${code}: ${releases.length} divulgações no banco, ${usados} usadas (tinham anterior + preço no dia + momentum calculável)`);

  const rows = [];
  for (const periodo of ['all', 'last5y']) {
    for (const mom of ['subiu', 'caiu', 'neutro']) {
      for (const surpresa of ['subiu', 'caiu']) {
        const { k, n } = cenarios[periodo][mom][surpresa];
        if (n < 3) continue; // amostra pequena demais pra sequer reportar
        const wilson = wilsonAjustado(k, n);
        const teste = testeBinomial(k, n);
        rows.push({
          indicator_code: code,
          period: periodo,
          momentum_bucket: mom,
          surprise_bucket: surpresa,
          sample_size: n,
          pct_wdo_up: wilson.pct,
          ci_low: wilson.inferior,
          ci_high: wilson.superior,
          p_valor: teste.p_valor,
          significativo: teste.significativo,
          computed_at: new Date().toISOString(),
        });
      }
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('pillar_stats').upsert(rows, { onConflict: 'indicator_code,period,momentum_bucket,surprise_bucket' });
    if (error) throw error;
  }
  console.log(`✅ ${code}: ${rows.length} cenário(s) salvos em pillar_stats.`);
}

async function run() {
  console.log('Calculando modelo dos 5 indicadores-pilar (surpresa x momentum pré-divulgação)...');
  const wdoSeries = await loadPriceSeries('WDO');
  console.log(`Preço WDO carregado: ${wdoSeries.length} dias.`);

  for (const code of PILLAR_CODES) {
    try {
      await computeForIndicator(code, wdoSeries);
    } catch (err) {
      console.error(`❌ Falha em ${code}:`, err.message);
    }
  }
  console.log('Finalizado.');
}

run().catch((err) => {
  console.error('Erro fatal em compute-pillar-stats.js:', err);
  process.exit(1);
});
