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
// ---------------------------------------------------------------------------
// MOTOR ESTATÍSTICO AVANÇADO
// Substitui a % histórica "crua" por uma estimativa que combina 3 métodos:
// 1) Wilson ajustado (mesmo já usado, mas com correção pra amostras pequenas)
// 2) Ponderação: divulgações com desvio maior (surpresas mais fortes) pesam mais
// 3) Bayesiano (Beta-Binomial): evita que poucas divulgações pareçam mais
//    conclusivas do que realmente são
// Também calcula um teste de significância (a diferença observada é estatisticamente
// real ou pode ser só acaso?). NUNCA gera texto de recomendação de operação —
// só os números e uma classificação de confiabilidade.
// ---------------------------------------------------------------------------
function combinacao(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n - k) k = n - k;
  let resultado = 1;
  for (let i = 1; i <= k; i++) resultado *= (n - k + i) / i;
  return resultado;
}
function binomialProb(k, n, p) {
  if (k < 0 || k > n) return 0;
  return combinacao(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}
function binomialAcumulada(k, n, p) {
  let soma = 0;
  for (let i = 0; i <= k; i++) soma += binomialProb(i, n, p);
  return soma;
}
function testeBinomial(k, n) {
  if (n === 0) return { p_valor: 1, significativo: false };
  const p = 0.5;
  let p_valor = k <= n / 2 ? 2 * binomialAcumulada(k, n, p) : 2 * (1 - binomialAcumulada(k - 1, n, p));
  p_valor = Math.min(1, p_valor);
  return { p_valor: Math.round(p_valor * 10000) / 10000, significativo: p_valor < 0.05 };
}
function wilsonAjustado(k, n, z = 1.96) {
  if (!n) return { p_ajustado: 0.5, inferior: 0, superior: 1 };
  const p = k / n, z2 = z * z, denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    p_ajustado: (k + z2 / 2) / (n + z2), // encolhe em direção a 50% quando a amostra é pequena
    inferior: Math.max(0, center - margin),
    superior: Math.min(1, center + margin),
  };
}
function probabilidadePonderada(eventos) {
  // Divulgações com desvio (surpresa) maior pesam mais no cálculo.
  if (!eventos.length) return 0.5;
  const desvios = eventos.map(e => Math.abs(e.desvio));
  const desvioMedio = desvios.reduce((a, b) => a + b, 0) / desvios.length;
  if (desvioMedio === 0) return eventos.filter(e => e.sucesso).length / eventos.length;
  let somaPesos = 0, somaPonderada = 0;
  for (const e of eventos) {
    const peso = 1 + Math.abs(e.desvio) / desvioMedio;
    somaPesos += peso;
    if (e.sucesso) somaPonderada += peso;
  }
  return somaPesos > 0 ? somaPonderada / somaPesos : 0.5;
}
function bayesiano(k, n, alpha = 1, beta = 1) {
  const novoAlpha = alpha + k, novoBeta = beta + (n - k);
  return novoAlpha / (novoAlpha + novoBeta);
}
function analiseCombinada(eventos) {
  // eventos: [{ sucesso: bool, desvio: number }]
  const n = eventos.length;
  const k = eventos.filter(e => e.sucesso).length;
  if (n === 0) return null;

  const wilson = wilsonAjustado(k, n);
  const ponderada = probabilidadePonderada(eventos);
  const bayes = bayesiano(k, n);
  const teste = testeBinomial(k, n);

  const probFinal = (wilson.p_ajustado * 0.4 + ponderada * 0.3 + bayes * 0.3) * 100;
  const ciWidth = (wilson.superior - wilson.inferior) * 100;
  let confiabilidade = 'baixa';
  if (n >= 30 && ciWidth < 20) confiabilidade = 'alta';
  else if (n >= 10 && ciWidth < 30) confiabilidade = 'media';

  return {
    n,
    pct: Math.round(probFinal * 10) / 10,
    ci_low: Math.round(wilson.inferior * 1000) / 10,
    ci_high: Math.round(wilson.superior * 1000) / 10,
    p_valor: teste.p_valor,
    significativo: teste.significativo,
    level: confiabilidade,
  };
}
// ---------------------------------------------------------------------------

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
 
// ---------------------------------------------------------------------------
// INTERVALO DE CONFIANÇA DE WILSON
// Nota: o cálculo de intervalo/confiança agora é feito pelo motor avançado
// (analiseCombinada), que já inclui Wilson ajustado + ponderação + Bayesiano.

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
      const eventsUsdUp = [], eventsUsdDown = [], eventsIbovUp = [], eventsIbovDown = [];

      for (const r of releases) {
        if (r.previous_value === null || r.previous_value === undefined) continue;
        const trend = r.actual_value > r.previous_value ? 'up' : r.actual_value < r.previous_value ? 'down' : null;
        if (!trend) continue;

        const usdDir = usdDirectionOn(r.release_date);
        if (!usdDir || usdDir === 'flat') continue;

        if (!firstDate) firstDate = r.release_date;
        lastDate = r.release_date;
        const desvio = Math.abs(r.actual_value - r.previous_value);

        if (trend === 'up') {
          up++;
          if (usdDir === 'up') usdUpAfterUp++;
          eventsUsdUp.push({ sucesso: usdDir === 'up', desvio });
        } else {
          down++;
          if (usdDir === 'up') usdUpAfterDown++;
          eventsUsdDown.push({ sucesso: usdDir === 'up', desvio });
        }

        const ibovDir = ibovDirectionOn(r.release_date);
        if (ibovDir && ibovDir !== 'flat') {
          if (trend === 'up') {
            ibovSampleUp++;
            if (ibovDir === 'up') ibovUpAfterUp++;
            eventsIbovUp.push({ sucesso: ibovDir === 'up', desvio });
          } else {
            ibovSampleDown++;
            if (ibovDir === 'up') ibovUpAfterDown++;
            eventsIbovDown.push({ sucesso: ibovDir === 'up', desvio });
          }
        }
      }

      const sampleSize = up + down;
      if (sampleSize === 0) { console.log(`⏭️  ${ind.code}: sem amostra suficiente ainda`); continue; }

      const alertText = detectStructuralBreak(releases.map(r => r.actual_value));

      const confidence = {
        usd_up: analiseCombinada(eventsUsdUp),
        usd_down: analiseCombinada(eventsUsdDown),
        ibov_up: analiseCombinada(eventsIbovUp),
        ibov_down: analiseCombinada(eventsIbovDown),
      };

      // A % principal exibida no site passa a ser a estimativa combinada
      // (mais robusta que a % histórica crua), com fallback pra crua se o
      // motor avançado não tiver amostra suficiente.
      const pctUsdUp = confidence.usd_up?.pct ?? (up > 0 ? Math.round((usdUpAfterUp / up) * 1000) / 10 : null);
      const pctUsdDown = confidence.usd_down?.pct ?? (down > 0 ? Math.round((usdUpAfterDown / down) * 1000) / 10 : null);
      const pctIbovUp = confidence.ibov_up?.pct ?? (ibovSampleUp > 0 ? Math.round((ibovUpAfterUp / ibovSampleUp) * 1000) / 10 : null);
      const pctIbovDown = confidence.ibov_down?.pct ?? (ibovSampleDown > 0 ? Math.round((ibovUpAfterDown / ibovSampleDown) * 1000) / 10 : null);

      const { error } = await supabase.from('indicator_stats').upsert({
        indicator_id: ind.id,
        sample_size: sampleSize,
        times_indicator_up: up,
        times_indicator_down: down,
        pct_usd_up_after_indicator_up: pctUsdUp,
        pct_usd_up_after_indicator_down: pctUsdDown,
        pct_ibov_up_after_indicator_up: pctIbovUp,
        pct_ibov_up_after_indicator_down: pctIbovDown,
        confidence,
        first_date: firstDate,
        last_date: lastDate,
        alert_text: alertText,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'indicator_id' });

      if (error) throw error;
      console.log(`✅ ${ind.code}: amostra de ${sampleSize} divulgações (${firstDate} a ${lastDate}) — confiança: ${confidence.usd_up?.level ?? 'n/a'}`);
    } catch (err) {
      console.error(`❌ Falha em ${ind.code}:`, err.message);
    }
  }
 
  console.log('Finalizado.');
}
 
run();
