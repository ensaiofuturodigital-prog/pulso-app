import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Calcula a probabilidade histórica de alta do WDO e do WIN nos dias em que
// NENHUM indicador de importância média/alta (2 ou 3) foi divulgado.
//
// Compara dois jeitos de calcular essa probabilidade:
//   "geral"      -> uma única % usando todos os dias sem indicador juntos
//   "dia_semana" -> uma % separada pra cada dia da semana (seg/ter/qua/qui/sex)
//
// Testa os dois de forma retroativa contra o que realmente aconteceu em cada
// dia do histórico, e guarda só o método que acertou mais vezes a direção
// (subiu/desceu). Não mistura os dois nem inventa número — é sempre um dos
// dois, o que teve mais acerto real.

async function getBusyDates() {
  // Datas em que existiu divulgação de indicador com importância >= 2
  const { data, error } = await supabase
    .from('release_schedule')
    .select('release_date, indicators!inner(importance)')
    .gte('indicators.importance', 2);
  if (error) throw error;
  return new Set((data || []).map(r => r.release_date));
}

function weekdayOf(dateStr) {
  // 0=domingo...6=sábado (padrão JS). Só vamos usar 1-5 na prática (B3 não
  // abre sáb/dom, então não vai ter candle nesses dias de qualquer jeito).
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.getUTCDay();
}

async function computeForAsset(asset, busyDates) {
  const { data: rows, error } = await supabase
    .from('price_daily')
    .select('price_date, open, close')
    .eq('asset', asset)
    .order('price_date', { ascending: true });
  if (error) throw error;

  const noIndicatorDays = (rows || [])
    .filter(r => !busyDates.has(r.price_date))
    .map(r => ({
      date: r.price_date,
      weekday: weekdayOf(r.price_date),
      up: r.close > r.open ? true : (r.close < r.open ? false : null), // null = flat, ignora
    }))
    .filter(r => r.up !== null);

  if (noIndicatorDays.length < 10) {
    console.log(`⚠️  ${asset}: só ${noIndicatorDays.length} dia(s) sem indicador — amostra pequena demais, pulando.`);
    return null;
  }

  // Candidato 1: geral
  const totalUp = noIndicatorDays.filter(d => d.up).length;
  const pctGeral = (totalUp / noIndicatorDays.length) * 100;

  // Candidato 2: por dia da semana
  const byWeekday = {};
  for (const d of noIndicatorDays) {
    byWeekday[d.weekday] = byWeekday[d.weekday] || { up: 0, total: 0 };
    byWeekday[d.weekday].total += 1;
    if (d.up) byWeekday[d.weekday].up += 1;
  }
  const pctByWeekday = {};
  for (const wd of Object.keys(byWeekday)) {
    pctByWeekday[wd] = (byWeekday[wd].up / byWeekday[wd].total) * 100;
  }

  // Teste retroativo: quantas vezes cada método acertou a direção real
  let hitsGeral = 0, hitsWeekday = 0;
  for (const d of noIndicatorDays) {
    const predGeral = pctGeral >= 50;
    const predWeekday = pctByWeekday[d.weekday] >= 50;
    if (predGeral === d.up) hitsGeral += 1;
    if (predWeekday === d.up) hitsWeekday += 1;
  }

  const winner = hitsWeekday > hitsGeral ? 'dia_semana' : 'geral';
  console.log(`${asset}: geral acertou ${hitsGeral}/${noIndicatorDays.length}, dia_semana acertou ${hitsWeekday}/${noIndicatorDays.length} -> vencedor: ${winner}`);

  return { winner, pctGeral, pctByWeekday, byWeekday, sampleGeral: noIndicatorDays.length };
}

async function saveResult(asset, result) {
  // Limpa o que existia antes pra esse ativo (troca de método precisa apagar
  // as linhas do método anterior, senão sobra lixo misturado)
  await supabase.from('baseline_stats').delete().eq('asset', asset);

  if (result.winner === 'geral') {
    const { error } = await supabase.from('baseline_stats').insert({
      asset, weekday: null, pct_up: result.pctGeral, sample_size: result.sampleGeral, method: 'geral',
    });
    if (error) throw error;
    console.log(`✅ ${asset}: salvo método 'geral' (${result.pctGeral.toFixed(1)}% alta, ${result.sampleGeral} dias)`);
  } else {
    const rows = Object.keys(result.pctByWeekday)
      .filter(wd => wd >= 1 && wd <= 5) // só dias úteis
      .map(wd => ({
        asset, weekday: parseInt(wd), pct_up: result.pctByWeekday[wd],
        sample_size: result.byWeekday[wd].total, method: 'dia_semana',
      }));
    const { error } = await supabase.from('baseline_stats').insert(rows);
    if (error) throw error;
    console.log(`✅ ${asset}: salvo método 'dia_semana' (${rows.length} linhas)`);
  }
}

async function run() {
  console.log('Calculando baseline de dias sem indicador...');
  const busyDates = await getBusyDates();
  console.log(`${busyDates.size} data(s) com indicador de importância média/alta.`);

  for (const asset of ['WDO', 'WIN']) {
    const result = await computeForAsset(asset, busyDates);
    if (result) await saveResult(asset, result);
  }
  console.log('Finalizado.');
}

run().catch(err => { console.error('❌ Falha geral:', err.message); process.exitCode = 1; });
