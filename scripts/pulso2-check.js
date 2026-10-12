// Conferência do Pulso 2 com os dados REAIS. Só lê. Grava o resultado em wf_log (para eu poder ler).
import { createClient } from '@supabase/supabase-js';
import { loadInputs } from '../api/lib/pulso2-data.js';
import { buildForecast, ruleStats, amplitudeModel, usScenarioStats, isBusinessDay, winExpiry, rollDays, adjustBars } from '../api/lib/pulso2-engine.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const L = []; const log = (...a) => { const t = a.join(' '); L.push(t); console.log(t); };
const f1 = (x) => (100 * x).toFixed(1) + '%';

async function main() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const inp = await loadInputs(supabase, today);
  log(`== CONFERÊNCIA PULSO2 (${today}) ==`);
  for (const a of ['WDO', 'WIN']) {
    const b = inp.barsByAsset[a];
    log(`${a}: ${b.length} barras, ${b[0].d} a ${b[b.length - 1].d}`);
    const rolls = rollDays(a, b); const adj = adjustBars(b, rolls);
    const aux = a === 'WIN' ? { partner: Object.fromEntries(inp.barsByAsset.WDO.map((x) => [x.d, x])) } : undefined;
    const st = ruleStats(adj, aux, a);
    for (const r of Object.values(st)) log(`  ${a} ${r.id}: n=${r.n} alta=${f1(r.p)} (2012-19 ${f1(r.p1)} n=${r.n1} | 2020-26 ${f1(r.p2)} n=${r.n2}) z=${r.z.toFixed(2)} estável=${r.stable} ajuste=${(100 * r.edge).toFixed(1)}pts`);
    const am = amplitudeModel(adj);
    log(`  ${a} amplitude: corr=${am.corr.toFixed(2)} base=${(100 * am.base).toFixed(2)}% últ5=${(100 * am.last5).toFixed(2)}% últ20=${(100 * am.last20).toFixed(2)}% q25=${am.q25.toFixed(2)} q75=${am.q75.toFixed(2)} lastClose=${am.lastClose}`);
    const us = usScenarioStats(inp.releases, b);
    log(`  ${a} EUA: mais fortes ${f1(us.strong.p)} (n=${us.strong.n}) | mais fracos ${f1(us.weak.p)} (n=${us.weak.n}) | bem mais fracos ${f1(us.weak_extreme.p)} (n=${us.weak_extreme.n})`);
  }
  {
    const w = inp.barsByAsset.WIN;
    for (const off of [0, 1, 2, 3]) {
      let sum = 0, n = 0;
      for (const y of [...new Set(w.map((x) => x.d.slice(0, 4)))]) for (const m of [2, 4, 6, 8, 10, 12]) {
        const k = w.findIndex((x) => x.d > winExpiry(Number(y), m)); const i = k + off - 1; if (k < 0 || i < 1 || i >= w.length) continue;
        const g = w[i].o / w[i - 1].c - 1; if (Math.abs(g) < 0.2) { sum += g; n++; }
      }
      log(`  WIN rolagem: ${off} pregão(ões) depois do vencimento -> salto médio ${(100 * sum / n).toFixed(3)}% em ${n} trocas`);
    }
  }
  const out = buildForecast({ today, ...inp });
  log(`dias mostrados: ${out.days.map((d) => d.date.slice(5)).join(' ')}`);
  log(`ignorados: ${out.skipped.map((s) => s.date.slice(5) + ' ' + s.why).join('; ')}`);
  log(`stale: ${JSON.stringify(out.stale)}`);
  for (const d of out.days.slice(0, 3)) for (const a of ['WDO', 'WIN']) { const x = d.assets[a]; log(`  ${d.date} ${a}: p=${f1(x.p_up)} ${x.label} | amp ~${Math.round(x.amp.pts)}pts (${x.amp.vs_media20.toFixed(2)}x) fator=${x.amp.factor} ${x.amp.why.join('+')} | eventos=${d.events.length} cenárioEUA=${!!x.scenario}`); }
  log('QUALIDADE: ' + JSON.stringify(out.data_quality));
  const sb = out.scoreboard;
  for (const a of ['WDO', 'WIN']) {
    for (const mode of ['pre', 'open']) { const r = sb.direction[a][mode]; log(`PLACAR ${a} ${mode === 'pre' ? 'antes da abertura' : 'com abertura (gap)'}: ${r.n} previsões em ${r.days} dias (cobertura ${(100 * r.coverage).toFixed(1)}%) acerto=${r.acc == null ? '-' : (100 * r.acc).toFixed(1) + '%'} sempre-alta=${r.base_up == null ? '-' : (100 * r.base_up).toFixed(1) + '%'} z=${r.z.toFixed(2)}`); log('   por ano: ' + r.by_year.map((y) => `${y.y}:${y.n ? Math.round(100 * y.hits / y.n) : '-'}%(${y.n})`).join(' ')); }
    const am = sb.amplitude[a]; log(`PLACAR amplitude ${a}: ${am.n} dias, faixa de 50% acertou ${(100 * am.in_band).toFixed(1)}%, correlação ${am.corr.toFixed(2)}`);
  }
  const bad = out.days.filter((d) => !isBusinessDay(d.date)).length;
  log(`TESTE: dias não-úteis dentro da lista = ${bad} (esperado 0)`);
}
main().then(async () => { await supabase.from('wf_log').insert(L.map((line) => ({ line: line.slice(0, 2000) }))); })
  .catch(async (e) => { L.push('FALHA: ' + e.message); await supabase.from('wf_log').insert(L.map((line) => ({ line: line.slice(0, 2000) }))); process.exitCode = 1; });
