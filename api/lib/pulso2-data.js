// Carregamento dos dados do Pulso 2 (só leitura). Usado pelo endpoint e pelo teste de conferência.
import { addDays, US_INDEX_CODES } from './pulso2-engine.js';

export async function fetchAll(build) {
  let all = [], from = 0;
  while (true) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

export async function loadInputs(supabase, today) {
  const barsByAsset = {};
  for (const asset of ['WDO', 'WIN']) {
    const rows = await fetchAll(() => supabase.from('price_daily').select('price_date, open, high, low, close').eq('asset', asset).order('price_date', { ascending: true }));
    barsByAsset[asset] = rows
      .filter((r) => r.open != null && r.close != null && r.high != null && r.low != null)
      .map((r) => ({ d: r.price_date, o: Number(r.open), h: Number(r.high), l: Number(r.low), c: Number(r.close) }));
  }
  const events = await fetchAll(() => supabase.from('calendar_events')
    .select('event_date, event_time, country, event_name, period_ref, actual_raw, forecast_raw, previous_raw, indicator_code, is_holiday, is_month_start_placeholder')
    .gte('event_date', today).lte('event_date', addDays(today, 40)).in('country', ['US', 'BR', 'EA'])
    .order('event_date', { ascending: true }));
  const { data: inds, error: e1 } = await supabase.from('indicators').select('id, code').in('code', US_INDEX_CODES);
  if (e1) throw new Error(e1.message);
  const codeById = Object.fromEntries(inds.map((i) => [i.id, i.code]));
  const rel = await fetchAll(() => supabase.from('indicator_releases')
    .select('indicator_id, release_date, actual_value, expected_value')
    .in('indicator_id', inds.map((i) => i.id)).not('expected_value', 'is', null).gte('release_date', '2012-01-01')
    .order('release_date', { ascending: true }));
  const releases = rel.map((r) => ({ code: codeById[r.indicator_id], date: r.release_date, actual: Number(r.actual_value), expected: Number(r.expected_value) }));
  const { data: liveRows, error: e2 } = await supabase.from('pulso2_live').select('asset, target_date, p_up');
  if (e2) throw new Error(e2.message);
  return { barsByAsset, events, releases, liveRows: liveRows || [] };
}
