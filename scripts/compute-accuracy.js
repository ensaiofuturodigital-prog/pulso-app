import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Confere, pra cada dia que já tem candle de WDO e/ou WIN, se a previsão de
// Alta/Baixa que o Painel do dia mostrou bateu com o que realmente aconteceu.
// Usa EXATAMENTE a mesma conta que o site usa em "Probabilidades para o dia"
// (loadDailySummary, em app.js) — se um dia mudar de fórmula lá, precisa
// mudar aqui junto, senão o placar fica mentindo.
//
// Grava o resultado em accuracy_log (um registro por ativo por dia), pra o
// site só ler pronto em vez de recalcular tudo no navegador toda vez.

const NON_DISPLAY_CODES = ['BCB_USDBRL', 'IBOV', 'DTWEXBGS', 'DGS10', 'DCOILWTICO', 'CPIAUCSL', 'HOUST', 'PERMIT'];

function trendClass(actual, previous) {
  if (previous === null || previous === undefined || actual === previous) return 'flat';
  return actual > previous ? 'up' : 'down';
}

async function fetchAllRows(table, select, filters = (q) => q, orderCol = 'price_date') {
  let all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    let query = supabase.from(table).select(select).order(orderCol, { ascending: true }).range(from, from + pageSize - 1);
    query = filters(query);
    const { data, error } = await query;
    if (error) throw error;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function loadStaticData() {
  const [indicators, statsRows, baseRows, releases, schedule] = await Promise.all([
    fetchAllRows('indicators', 'id, code, importance', undefined, 'id'),
    fetchAllRows('indicator_stats', '*', undefined, 'indicator_id'),
    supabase.from('baseline_stats').select('*').in('asset', ['WDO', 'WIN']).then(r => { if (r.error) throw r.error; return r.data; }),
    fetchAllRows('indicator_releases', 'indicator_id, release_date, actual_value, previous_value', undefined, 'release_date'),
    fetchAllRows('release_schedule', 'indicator_id, release_date', undefined, 'release_date'),
  ]);

  const indicatorById = {};
  indicators.forEach(i => { indicatorById[i.id] = i; });

  const statsByIndicator = {};
  statsRows.forEach(s => { statsByIndicator[s.indicator_id] = s; });

  // release mais recente <= a data, por indicador (mesma regra do site)
  const releasesByIndicator = {};
  releases.forEach(r => {
    if (!releasesByIndicator[r.indicator_id]) releasesByIndicator[r.indicator_id] = [];
    releasesByIndicator[r.indicator_id].push(r);
  });
  Object.values(releasesByIndicator).forEach(arr => arr.sort((a, b) => a.release_date.localeCompare(b.release_date)));

  function mostRecentRelease(indicatorId, dateStr) {
    const arr = releasesByIndicator[indicatorId];
    if (!arr) return null;
    let ans = null;
    for (const r of arr) {
      if (r.release_date <= dateStr) ans = r; else break;
    }
    return ans;
  }

  const scheduleByDate = {};
  schedule.forEach(s => {
    if (!scheduleByDate[s.release_date]) scheduleByDate[s.release_date] = [];
    scheduleByDate[s.release_date].push(s.indicator_id);
  });

  const baselineByAsset = { WDO: baseRows.filter(r => r.asset === 'WDO'), WIN: baseRows.filter(r => r.asset === 'WIN') };

  return { indicatorById, statsByIndicator, releasesByIndicator, scheduleByDate, baselineByAsset, mostRecentRelease };
}

function pickBaseline(rows, weekday) {
  return rows.find(r => r.weekday === weekday) || rows.find(r => r.weekday === null) || null;
}

// Reproduz o cálculo de aggProb / aggProbIbov do app.js pra uma data.
function computeAggProb(dateStr, ctx) {
  const { indicatorById, statsByIndicator, scheduleByDate, baselineByAsset, mostRecentRelease } = ctx;
  const scheduledIds = scheduleByDate[dateStr] || [];
  const indicators = scheduledIds
    .map(id => indicatorById[id])
    .filter(ind => ind && !NON_DISPLAY_CODES.includes(ind.code));

  let weightedSum = 0, weightTotal = 0, weightedSumIbov = 0, weightTotalIbov = 0;

  if (indicators.length === 0) {
    const weekday = new Date(dateStr + 'T12:00:00Z').getUTCDay();
    const wdoBase = pickBaseline(baselineByAsset.WDO, weekday);
    const winBase = pickBaseline(baselineByAsset.WIN, weekday);
    return {
      aggProb: wdoBase ? Math.round(wdoBase.pct_up) : null,
      weightTotal: wdoBase ? wdoBase.sample_size : 0,
      aggProbIbov: winBase ? Math.round(winBase.pct_up) : null,
      weightTotalIbov: winBase ? winBase.sample_size : 0,
    };
  }

  for (const ind of indicators) {
    const s = statsByIndicator[ind.id];
    if (!s || (s.sample_size || 0) < 5) continue;
    const rel = mostRecentRelease(ind.id, dateStr);
    const trend = rel ? trendClass(rel.actual_value, rel.previous_value) : 'flat';

    let prob, probIbov;
    if (trend === 'up') {
      prob = s.pct_usd_up_after_indicator_up;
      probIbov = s.pct_ibov_up_after_indicator_up;
    } else if (trend === 'down') {
      prob = s.pct_usd_up_after_indicator_down;
      probIbov = s.pct_ibov_up_after_indicator_down;
    } else {
      const pUp = s.pct_usd_up_after_indicator_up, pDown = s.pct_usd_up_after_indicator_down;
      prob = (pUp != null && pDown != null) ? (pUp + pDown) / 2 : (pUp ?? pDown);
      const pUpI = s.pct_ibov_up_after_indicator_up, pDownI = s.pct_ibov_up_after_indicator_down;
      probIbov = (pUpI != null && pDownI != null) ? (pUpI + pDownI) / 2 : (pUpI ?? pDownI);
    }
    if (prob != null) { weightedSum += prob * s.sample_size; weightTotal += s.sample_size; }
    if (probIbov != null) { weightedSumIbov += probIbov * s.sample_size; weightTotalIbov += s.sample_size; }
  }

  return {
    aggProb: weightTotal > 0 ? Math.round(weightedSum / weightTotal) : null,
    weightTotal,
    aggProbIbov: weightTotalIbov > 0 ? Math.round(weightedSumIbov / weightTotalIbov) : null,
    weightTotalIbov,
  };
}

async function computeForAsset(asset, ctx) {
  const priceRows = await fetchAllRows('price_daily', 'price_date, open, close', (q) => q.eq('asset', asset));
  const rows = [];

  for (const p of priceRows) {
    if (p.open == null || p.close == null) continue;
    const actualTrend = trendClass(p.close, p.open);
    if (actualTrend === 'flat') continue; // sem direção clara, não dá pra julgar acerto/erro

    const { aggProb, weightTotal, aggProbIbov, weightTotalIbov } = computeAggProb(p.price_date, ctx);
    const prob = asset === 'WDO' ? aggProb : aggProbIbov;
    const sample = asset === 'WDO' ? weightTotal : weightTotalIbov;
    if (prob == null) continue; // sem previsão pra esse dia, não entra no placar

    const predictedDirection = prob >= 50 ? 'up' : 'down';
    rows.push({
      asset,
      price_date: p.price_date,
      predicted_pct_up: prob,
      predicted_direction: predictedDirection,
      actual_direction: actualTrend,
      hit: predictedDirection === actualTrend,
      sample_size: sample,
    });
  }
  return rows;
}

async function saveRows(rows) {
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from('accuracy_log').upsert(chunk, { onConflict: 'asset,price_date' });
    if (error) throw error;
  }
}

async function run() {
  console.log('Calculando placar de acerto/erro (WDO e WIN)...');
  const ctx = await loadStaticData();

  for (const asset of ['WDO', 'WIN']) {
    const rows = await computeForAsset(asset, ctx);
    await saveRows(rows);
    const hits = rows.filter(r => r.hit).length;
    console.log(`✅ ${asset}: ${rows.length} dia(s) avaliado(s), ${hits} acerto(s) (${rows.length ? ((hits / rows.length) * 100).toFixed(1) : '0'}%)`);
  }
  console.log('Finalizado.');
}

run().catch(err => { console.error('❌ Falha geral:', err.message); process.exitCode = 1; });
