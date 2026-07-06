import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchAllRows(table, select, filters = (q) => q, orderCol = 'release_date') {
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

function findIndexOnOrBefore(sortedDates, targetDate) {
  let lo = 0, hi = sortedDates.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDates[mid].date <= targetDate) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

// Olha as variações (diferença entre divulgações consecutivas) e verifica se as
// últimas 3 fugiram muito do padrão histórico (z-score > 2 em cima da linha de base).
function detectStructuralBreak(actualValues) {
  const vals = actualValues.filter(v => v !== null && v !== undefined);
  if (vals.length < 8) return null;

  const diffs = [];
  for (let i = 1; i < vals.length; i++) diffs.push(vals[i] - vals[i - 1]);

  const RECENT = 3;
  const baseline = diffs.slice(0, diffs.length - RECENT);
  if (baseline.length < 5) return null;

  const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
  const variance = baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / (baseline.length - 1);
  const std = Math.sqrt(variance);
  if (!std) return null;

  const recentDiffs = diffs.slice(diffs.length - RECENT);
  const hasBreak = recentDiffs.some(d => Math.abs((d - mean) / std) > 2);
  return hasBreak
    ? 'Quebra estrutural detectada: a variação dos últimos registros fugiu bastante do padrão histórico. Use a probabilidade abaixo com mais cautela.'
    : null;
}

function buildDirectionFn(series) {
  return function (targetDate) {
    const idx = findIndexOnOrBefore(series, targetDate);
    if (idx <= 0) return null;
    const today = series[idx].value;
    const prev = series[idx - 1].value;
    if (today > prev) return 'up';
    if (today < prev) return 'down';
    return 'flat';
  };
}

async function loadMarketSeries(code) {
  const { data: ind, error } = await supabase.from('indicators').select('id').eq('code', code).single();
  if (error || !ind) { console.log(`⚠️  Série de mercado ${code} não encontrada — rode o fetch correspondente primeiro.`); return null; }
  const rows = await fetchAllRows('indicator_releases', 'release_date, actual_value', (q) => q.eq('indicator_id', ind.id));
  const series = rows.map(r => ({ date: r.release_date, value: r.actual_value }));
  console.log(`Série ${code} carregada: ${series.length} pontos (${series[0]?.date} a ${series[series.length - 1]?.date}).`);
  return { id: ind.id, series };
}

async function run() {
  console.log('Calculando estatísticas de correlação com USD/BRL (WDO) e Ibovespa (WIN)...');

  const usd = await loadMarketSeries('BCB_USDBRL');
  const ibov = await loadMarketSeries('IBOV');
  if (!usd) throw new Error('Sem série do dólar — impossível continuar.');

  const usdDirectionOn = buildDirectionFn(usd.series);
  const ibovDirectionOn = ibov ? buildDirectionFn(ibov.series) : () => null;

  const excludeCodes = ['BCB_USDBRL', 'IBOV'];
  const { data: indicators } = await supabase.from('indicators').select('id, code').not('code', 'in', `(${excludeCodes.join(',')})`);

  for (const ind of indicators) {
    try {
      const releases = await fetchAllRows(
        'indicator_releases',
        'release_date, actual_value, previous_value',
        (q) => q.eq('indicator_id', ind.id)
      );

      let up = 0, down = 0;
      let usdUpAfterUp = 0, usdUpAfterDown = 0;
      let ibovUpAfterUp = 0, ibovUpAfterDown = 0, ibovSampleUp = 0, ibovSampleDown = 0;
      let firstDate = null, lastDate = null;

      for (const r of releases) {
        if (r.previous_value === null || r.previous_value === undefined) continue;
        const trend = r.actual_value > r.previous_value ? 'up' : r.actual_value < r.previous_value ? 'down' : null;
        if (!trend) continue;

        const usdDir = usdDirectionOn(r.release_date);
        if (!usdDir || usdDir === 'flat') continue;

        if (!firstDate) firstDate = r.release_date;
        lastDate = r.release_date;

        if (trend === 'up') { up++; if (usdDir === 'up') usdUpAfterUp++; }
        else { down++; if (usdDir === 'up') usdUpAfterDown++; }

        const ibovDir = ibovDirectionOn(r.release_date);
        if (ibovDir && ibovDir !== 'flat') {
          if (trend === 'up') { ibovSampleUp++; if (ibovDir === 'up') ibovUpAfterUp++; }
          else { ibovSampleDown++; if (ibovDir === 'up') ibovUpAfterDown++; }
        }
      }

      const sampleSize = up + down;
      if (sampleSize === 0) { console.log(`⏭️  ${ind.code}: sem amostra suficiente ainda`); continue; }

      const alertText = detectStructuralBreak(releases.map(r => r.actual_value));

      const { error } = await supabase.from('indicator_stats').upsert({
        indicator_id: ind.id,
        sample_size: sampleSize,
        times_indicator_up: up,
        times_indicator_down: down,
        pct_usd_up_after_indicator_up: up > 0 ? Math.round((usdUpAfterUp / up) * 1000) / 10 : null,
        pct_usd_up_after_indicator_down: down > 0 ? Math.round((usdUpAfterDown / down) * 1000) / 10 : null,
        pct_ibov_up_after_indicator_up: ibovSampleUp > 0 ? Math.round((ibovUpAfterUp / ibovSampleUp) * 1000) / 10 : null,
        pct_ibov_up_after_indicator_down: ibovSampleDown > 0 ? Math.round((ibovUpAfterDown / ibovSampleDown) * 1000) / 10 : null,
        first_date: firstDate,
        last_date: lastDate,
        alert_text: alertText,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'indicator_id' });

      if (error) throw error;
      console.log(`✅ ${ind.code}: amostra de ${sampleSize} divulgações (${firstDate} a ${lastDate})`);
    } catch (err) {
      console.error(`❌ Falha em ${ind.code}:`, err.message);
    }
  }

  console.log('Finalizado.');
}

run();
