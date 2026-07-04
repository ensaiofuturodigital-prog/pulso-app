import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Encontra, numa lista ordenada de [data, valor], o índice do último ponto
// com data <= alvo (ou seja, o dia de pregão mais próximo, pra trás, da divulgação)
function findIndexOnOrBefore(sortedDates, targetDate) {
  let lo = 0, hi = sortedDates.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDates[mid].date <= targetDate) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

async function run() {
  console.log('Calculando estatísticas de correlação com o USD/BRL...');

  const { data: usdIndicator, error: usdErr } = await supabase
    .from('indicators').select('id').eq('code', 'BCB_USDBRL').single();
  if (usdErr || !usdIndicator) throw new Error('Indicador BCB_USDBRL não encontrado — rode o fetch-bcb.js primeiro.');

  const { data: usdReleasesRaw } = await supabase
    .from('indicator_releases')
    .select('release_date, actual_value')
    .eq('indicator_id', usdIndicator.id)
    .order('release_date', { ascending: true });

  const usdSeries = usdReleasesRaw.map(r => ({ date: r.release_date, value: r.actual_value }));
  console.log(`Série do dólar carregada: ${usdSeries.length} pontos.`);

  function usdDirectionOn(targetDate) {
    const idx = findIndexOnOrBefore(usdSeries, targetDate);
    if (idx <= 0) return null; // sem dia anterior pra comparar
    const today = usdSeries[idx].value;
    const prev = usdSeries[idx - 1].value;
    if (today > prev) return 'up';
    if (today < prev) return 'down';
    return 'flat';
  }

  const { data: indicators } = await supabase
    .from('indicators').select('id, code').neq('code', 'BCB_USDBRL');

  for (const ind of indicators) {
    try {
      const { data: releases } = await supabase
        .from('indicator_releases')
        .select('release_date, actual_value, previous_value')
        .eq('indicator_id', ind.id)
        .order('release_date', { ascending: true });

      let up = 0, down = 0, usdUpAfterUp = 0, usdUpAfterDown = 0;
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
      }

      const sampleSize = up + down;
      if (sampleSize === 0) { console.log(`⏭️  ${ind.code}: sem amostra suficiente ainda`); continue; }

      const { error } = await supabase.from('indicator_stats').upsert({
        indicator_id: ind.id,
        sample_size: sampleSize,
        times_indicator_up: up,
        times_indicator_down: down,
        pct_usd_up_after_indicator_up: up > 0 ? Math.round((usdUpAfterUp / up) * 1000) / 10 : null,
        pct_usd_up_after_indicator_down: down > 0 ? Math.round((usdUpAfterDown / down) * 1000) / 10 : null,
        first_date: firstDate,
        last_date: lastDate,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'indicator_id' });

      if (error) throw error;
      console.log(`✅ ${ind.code}: amostra de ${sampleSize} divulgações calculada`);
    } catch (err) {
      console.error(`❌ Falha em ${ind.code}:`, err.message);
    }
  }

  console.log('Finalizado.');
}

run();
