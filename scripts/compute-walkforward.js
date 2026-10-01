import { createClient } from '@supabase/supabase-js';
import { buildSamples, runWalkForward, summarize } from './lib/walkforward-core.js';

// TESTE CEGO (walk-forward) — experimental, roda em paralelo.
// Só LÊ: indicators, indicator_releases, price_daily.
// Só ESCREVE: wf_predictions e wf_summary (tabelas novas). Não apaga nada,
// não mexe em indicator_stats/accuracy_log e NÃO envia nada ao Telegram.

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const LOG = [];
const _log = console.log.bind(console);
console.log = (...a) => { const t = a.join(' '); LOG.push(t); _log(t); };
async function flushLog() {
  try {
    const rows = LOG.join('\n').split('\n').map((line) => ({ line: line.slice(0, 2000) }));
    if (rows.length) await supabase.from('wf_log').insert(rows);
  } catch (e) { _log('log não gravado:', e.message); }
}

async function fetchAll(table, select, orderCol, filter = (q) => q) {
  let all = [], from = 0;
  while (true) {
    const { data, error } = await filter(supabase.from(table).select(select).order(orderCol, { ascending: true }).range(from, from + 999));
    if (error) throw error;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function upsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw error;
  }
}

async function run() {
  const indicators = await fetchAll('indicators', 'id, code', 'id');
  const rels = await fetchAll('indicator_releases', 'indicator_id, release_date, actual_value, previous_value', 'release_date');
  const ids = indicators.map((i) => i.id);
  const relByDate = {};
  for (const r of rels) {
    if (r.actual_value == null) continue;
    (relByDate[r.release_date] = relByDate[r.release_date] || []).push({ id: r.indicator_id, actual: Number(r.actual_value), previous: r.previous_value == null ? null : Number(r.previous_value) });
  }
  console.log(`Indicadores: ${ids.length} | divulgações com valor: ${rels.filter((r) => r.actual_value != null).length}`);

  for (const asset of ['WDO', 'WIN']) {
    const px = (await fetchAll('price_daily', 'price_date, open, close', 'price_date', (q) => q.eq('asset', asset)))
      .map((p) => ({ date: p.price_date, open: Number(p.open), close: Number(p.close) }));
    for (const variant of ['depois', 'antes']) {
      const { samples, nFeatures } = buildSamples(px, relByDate, ids, variant);
      const preds = runWalkForward(samples, nFeatures);
      const sum = summarize(preds);
      const tot = sum.find((s) => s.year === 0 && s.bucket === 'todos');
      const alwaysUp = (100 * tot.ups / tot.n).toFixed(1);
      console.log(`\n=== ${asset} / ${variant} === ${tot.n} dias previstos às cegas | acerto ${(100 * tot.hits / tot.n).toFixed(1)}% | (sempre-alta teria ${alwaysUp}%)`);
      for (const s of sum.filter((x) => x.year === 0 && x.bucket !== 'todos')) console.log(`  confiança ${s.bucket}: ${(100 * s.hits / s.n).toFixed(1)}% em ${s.n} dias`);
      console.log('  por ano: ' + sum.filter((x) => x.year > 0 && x.bucket === 'todos').map((x) => `${x.year}:${(100 * x.hits / x.n).toFixed(0)}%`).join(' '));
      await upsert('wf_predictions', preds.map((p) => ({ asset, variant, ...p })), 'asset,variant,pred_date');
      await upsert('wf_summary', sum.map((s) => ({ asset, variant, ...s, updated_at: new Date().toISOString() })), 'asset,variant,year,bucket');
    }
  }
  console.log('\nFinalizado. Nada foi apagado e nada foi enviado ao Telegram.');
}
run().then(flushLog).catch(async (e) => { console.log('❌ Falha: ' + (e && (e.message || JSON.stringify(e))) + ' | ' + (e && e.stack ? e.stack.split('\n')[1] : '')); await flushLog(); process.exitCode = 1; });
