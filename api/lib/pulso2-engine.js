// PULSO 2 — motor de sinais (aba nova, independente do Painel atual).
// Tudo aqui é cálculo puro (sem banco): recebe dados e devolve o resultado.
// Regras de ouro:
//  - só usa dados ANTERIORES ao dia previsto (nada do futuro);
//  - só mostra probabilidade diferente de 50% quando há sinal estável;
//  - as estatísticas são recalculadas do histórico a cada consulta.

export const ENGINE_VERSION = 'p2-1.0';

/* ---------------- datas e dias úteis (B3) ---------------- */
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const parse = (s) => new Date(s + 'T12:00:00Z');
export const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
export const weekday = (s) => parse(s).getUTCDay(); // 0=dom ... 6=sáb

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad2(month)}-${pad2(day)}`;
}

// Dias em que a B3 não opera, com o nome do feriado.
export function b3HolidayMap(y) {
  const e = easter(y);
  const m = {
    [`${y}-01-01`]: 'Confraternização Universal',
    [addDays(e, -48)]: 'Carnaval (segunda)',
    [addDays(e, -47)]: 'Carnaval (terça)',
    [addDays(e, -2)]: 'Sexta-feira Santa',
    [`${y}-04-21`]: 'Tiradentes',
    [`${y}-05-01`]: 'Dia do Trabalho',
    [addDays(e, 60)]: 'Corpus Christi',
    [`${y}-09-07`]: 'Independência',
    [`${y}-10-12`]: 'Nossa Senhora Aparecida',
    [`${y}-11-02`]: 'Finados',
    [`${y}-11-15`]: 'Proclamação da República',
    [`${y}-12-24`]: 'Véspera de Natal (sem pregão)',
    [`${y}-12-25`]: 'Natal',
    [`${y}-12-31`]: 'Véspera de Ano Novo (sem pregão)',
  };
  if (y >= 2024) m[`${y}-11-20`] = 'Consciência Negra';
  return m;
}

export function holidayName(s, extra = {}) {
  return extra[s] || b3HolidayMap(Number(s.slice(0, 4)))[s] || null;
}
export function isBusinessDay(s, extra = {}) {
  const w = weekday(s);
  return w >= 1 && w <= 5 && !holidayName(s, extra);
}
export function prevBusinessDay(s, extra = {}) {
  let d = addDays(s, -1);
  while (!isBusinessDay(d, extra)) d = addDays(d, -1);
  return d;
}
export function nextBusinessDays(fromS, n, extra = {}, includeFrom = true) {
  const out = []; let d = includeFrom ? fromS : addDays(fromS, 1);
  while (out.length < n) { if (isBusinessDay(d, extra)) out.push(d); d = addDays(d, 1); }
  return out;
}

/* ---------------- estatística básica ---------------- */
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const quantile = (sorted, q) => { const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo); };

/* ---------------- sinais de direção (só preço) ---------------- */
// bars: [{d, o, h, l, c}] em ordem crescente. Features para prever o dia i usando só barras < i.
export function featuresFor(bars, i, aux) {
  if (i < 25) return null;
  const c = (k) => bars[k].c;
  const win = []; for (let k = i - 20; k <= i - 1; k++) win.push(c(k));
  const s = sd(win);
  const up = (k) => bars[k].c > bars[k].o;
  const f = {
    z20: s > 0 ? (c(i - 1) - mean(win)) / s : 0,
    s3: (up(i - 1) ? 1 : 0) + (up(i - 2) ? 1 : 0) + (up(i - 3) ? 1 : 0),
    mom5: c(i - 1) / c(i - 5) - 1,
  };
  // Dado do OUTRO ativo, mas só da véspera (nunca do mesmo dia): quanto o dólar se mexeu dentro do pregão anterior.
  if (aux && aux.partner) { const pb = aux.partner[bars[i - 1].d]; f.w_intra = pb ? pb.c / pb.o - 1 : null; }
  return f;
}

export const RULES = [
  { id: 'exaustao_baixo', txt: 'Fechou muito abaixo da média de 20 dias (2 desvios)', test: (f) => f.z20 < -2 },
  { id: 'exaustao_alto', txt: 'Fechou muito acima da média de 20 dias (2 desvios)', test: (f) => f.z20 > 2 },
  { id: 'tres_quedas', txt: '3 dias seguidos de queda', test: (f) => f.s3 === 0 },
  { id: 'tres_altas', txt: '3 dias seguidos de alta', test: (f) => f.s3 === 3 },
  { id: 'queda_5d', txt: 'Caiu mais de 2% em 5 dias', test: (f) => f.mom5 < -0.02 },
  { id: 'alta_5d', txt: 'Subiu mais de 2% em 5 dias', test: (f) => f.mom5 > 0.02 },
  { id: 'dolar_subiu_dia', txt: 'O dólar subiu mais de 0,5% dentro do pregão anterior', only: 'WIN', test: (f) => f.w_intra != null && f.w_intra > 0.005 },
  { id: 'gap_queda', txt: 'Abriu em queda de mais de 0,3%', test: (f) => f.gap < -0.003, needsOpen: true },
  { id: 'gap_alta', txt: 'Abriu em alta de mais de 0,3%', test: (f) => f.gap > 0.003, needsOpen: true },
];

const START = '2012-01-01', SPLIT = '2020-01-01';

export function ruleStats(bars, aux, asset) {
  const rules = RULES.filter((r) => !r.only || r.only === asset);
  const acc = {}; for (const r of rules) acc[r.id] = { n: 0, up: 0, n1: 0, up1: 0, n2: 0, up2: 0 };
  for (let i = 25; i < bars.length; i++) {
    const b = bars[i]; if (b.d < START || b.c === b.o) continue;
    const f = featuresFor(bars, i, aux); if (!f) continue;
    f.gap = b.o / bars[i - 1].c - 1; if (Math.abs(f.gap) >= 0.03) continue;
    const y = b.c > b.o ? 1 : 0;
    for (const r of rules) if (r.test(f)) {
      const a = acc[r.id]; a.n++; a.up += y;
      if (b.d < SPLIT) { a.n1++; a.up1 += y; } else { a.n2++; a.up2 += y; }
    }
  }
  const out = {};
  for (const r of rules) {
    const a = acc[r.id]; const p = a.n ? a.up / a.n : 0.5;
    const p1 = a.n1 ? a.up1 / a.n1 : 0.5, p2 = a.n2 ? a.up2 / a.n2 : 0.5;
    const z = a.n ? (p - 0.5) / Math.sqrt(0.25 / a.n) : 0;
    // Só vale se: amostra boa, força estatística >= 2 (acima do acaso) e mesma direção nas duas metades do histórico.
    const stable = a.n >= 100 && Math.abs(z) >= 2 && a.n1 >= 30 && a.n2 >= 30 && (p1 - 0.5) * (p - 0.5) > 0 && (p2 - 0.5) * (p - 0.5) > 0;
    const edge = (p - 0.5) * a.n / (a.n + 200); // encolhe pro 50%: protege contra o "garimpo" do histórico
    out[r.id] = { id: r.id, txt: r.txt, needsOpen: !!r.needsOpen, n: a.n, p, p1, p2, n1: a.n1, n2: a.n2, z, stable, edge };
  }
  return out;
}

export function activeSignals(bars, stats, extra = {}, aux, asset) {
  // bars: até o último fechamento disponível (prevê o dia seguinte)
  const f = featuresFor(bars, bars.length, aux); // índice virtual = dia a prever
  const out = [];
  if (!f) return out;
  Object.assign(f, extra);
  for (const r of RULES) {
    if (r.only && r.only !== asset) continue;
    if (r.needsOpen && f.gap === undefined) continue;
    if (r.test(f) && stats[r.id]) out.push(stats[r.id]);
  }
  return out;
}

export function combine(signals) {
  const used = signals.filter((s) => s.stable);
  if (!used.length) return { p_up: 0.5, used };
  const e = mean(used.map((s) => s.edge));
  return { p_up: Math.max(0.35, Math.min(0.65, 0.5 + e)), used };
}

export const labelFor = (p) => (p >= 0.52 ? 'Leve viés de alta' : p <= 0.48 ? 'Leve viés de baixa' : 'Sem vantagem estatística');

/* ---------------- troca de contrato (série contínua sem ajuste) ---------------- */
// WDO: o contrato muda no 1º pregão do mês. WIN: muda logo depois do vencimento
// (quarta-feira mais próxima do dia 15 dos meses pares). Nesses dias a abertura
// "salta" por causa do custo de carregamento, e isso NÃO é movimento de mercado.
export const WIN_ROLL_OFFSET = 1; // nº de pregões depois do vencimento
export function winExpiry(y, m) {
  const d = new Date(Date.UTC(y, m - 1, 15, 12)); const w = d.getUTCDay();
  let off = (3 - w + 7) % 7; if (off > 3) off -= 7;
  d.setUTCDate(15 + off); return ymd(d);
}
export function isRollDate(asset, dateS, extra = {}) {
  if (asset === 'WDO') return prevBusinessDay(dateS, extra).slice(0, 7) !== dateS.slice(0, 7);
  if (asset === 'WIN') {
    const [y, m] = [Number(dateS.slice(0, 4)), Number(dateS.slice(5, 7))];
    if (m % 2) return false;
    return nextBusinessDays(winExpiry(y, m), WIN_ROLL_OFFSET, extra, false)[WIN_ROLL_OFFSET - 1] === dateS;
  }
  return false;
}
export function rollDays(asset, bars) {
  const s = new Set();
  if (asset === 'WDO') { let last = ''; for (const b of bars) { const m = b.d.slice(0, 7); if (m !== last) { s.add(b.d); last = m; } } }
  if (asset === 'WIN') {
    const years = [...new Set(bars.map((b) => b.d.slice(0, 4)))];
    for (const y of years) for (const m of [2, 4, 6, 8, 10, 12]) {
      const exp = winExpiry(Number(y), m);
      const k = bars.findIndex((b) => b.d > exp);
      if (k >= 0 && k + WIN_ROLL_OFFSET - 1 < bars.length) s.add(bars[k + WIN_ROLL_OFFSET - 1].d);
    }
  }
  return s;
}
// Ajuste "em razão": tira o salto da troca de contrato (a abertura do dia da troca passa a coincidir
// com o fechamento anterior). Multiplica só as barras ANTERIORES, então não usa nada do futuro.
export function adjustBars(bars, roll) {
  const out = new Array(bars.length); let cum = 1;
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i];
    out[i] = { d: b.d, o: b.o * cum, h: b.h * cum, l: b.l * cum, c: b.c * cum };
    if (roll.has(b.d) && i > 0) { const f = b.o / bars[i - 1].c; if (f > 0.5 && f < 2) cum *= f; }
  }
  return out;
}

/* ---------------- placar honesto (teste cego do próprio Pulso 2) ---------------- */
// A cada ano, escolhe as regras estáveis usando SÓ os anos anteriores e prevê o ano seguinte.
export function blindBacktest(bars, aux, asset, { from = 2016, withOpen = false } = {}) {
  const years = [...new Set(bars.map((b) => Number(b.d.slice(0, 4))))].filter((y) => y >= from);
  const byYear = []; let n = 0, hits = 0, ups = 0, total = 0;
  for (const Y of years) {
    const start = bars.findIndex((b) => b.d >= `${Y}-01-01`);
    if (start < 0) continue;
    const stats = ruleStats(bars.slice(0, start), aux, asset);
    let yn = 0, yh = 0, yu = 0, yt = 0;
    for (let i = start; i < bars.length && bars[i].d < `${Y + 1}-01-01`; i++) {
      const b = bars[i]; if (b.c === b.o) continue;
      const f = featuresFor(bars, i, aux); if (!f) continue;
      if (withOpen) { f.gap = b.o / bars[i - 1].c - 1; if (Math.abs(f.gap) >= 0.03) f.gap = 0; }
      yt++;
      const sig = [];
      for (const r of RULES) {
        if (r.only && r.only !== asset) continue;
        if (r.needsOpen && !withOpen) continue;
        if (r.test(f) && stats[r.id]) sig.push(stats[r.id]);
      }
      const c = combine(sig); if (!c.used.length || Math.abs(c.p_up - 0.5) < 0.005) continue;
      const y = b.c > b.o; yn++; yu += y ? 1 : 0; yh += ((c.p_up >= 0.5) === y) ? 1 : 0;
    }
    byYear.push({ y: Y, n: yn, hits: yh, days: yt }); n += yn; hits += yh; ups += yu; total += yt;
  }
  return { n, hits, acc: n ? hits / n : null, base_up: n ? ups / n : null, days: total, coverage: total ? n / total : 0, z: n ? ((hits / n - 0.5) / Math.sqrt(0.25 / n)) : 0, by_year: byYear };
}

export function amplitudeBlind(bars, { from = 2016 } = {}) {
  const years = [...new Set(bars.map((b) => Number(b.d.slice(0, 4))))].filter((y) => y >= from);
  const rng = bars.map((b) => (b.h - b.l) / b.o);
  const P = [], A = []; let inBand = 0;
  for (const Y of years) {
    const start = bars.findIndex((b) => b.d >= `${Y}-01-01`); if (start < 0) continue;
    const m = amplitudeModel(bars.slice(0, start));
    for (let i = start; i < bars.length && bars[i].d < `${Y + 1}-01-01`; i++) {
      if (!(rng[i] > 0)) continue;
      const pred = m.a + m.b * mean(rng.slice(i - 5, i));
      P.push(pred); A.push(rng[i]);
      if (rng[i] >= pred * m.q25 && rng[i] <= pred * m.q75) inBand++;
    }
  }
  const mp = mean(P), ma = mean(A); let sxy = 0, sxx = 0, syy = 0;
  for (let k = 0; k < P.length; k++) { sxy += (P[k] - mp) * (A[k] - ma); sxx += (P[k] - mp) ** 2; syy += (A[k] - ma) ** 2; }
  return { n: P.length, in_band: P.length ? inBand / P.length : null, corr: sxy / Math.sqrt(sxx * syy) };
}

/* ---------------- amplitude (tamanho do movimento) ---------------- */
export function amplitudeModel(bars) {
  const rng = bars.map((b) => (b.h - b.l) / b.o);
  const xs = [], ys = [], ds = [];
  for (let i = 25; i < bars.length; i++) {
    if (bars[i].d < START || !(rng[i] > 0)) continue;
    xs.push(mean(rng.slice(i - 5, i))); ys.push(rng[i]); ds.push(i);
  }
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0; for (let k = 0; k < xs.length; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sxx += (xs[k] - mx) ** 2; }
  const b = sxy / sxx, a = my - b * mx;
  const ratios = ys.map((y, k) => y / (a + b * xs[k])).sort((p, q) => p - q);
  const corr = sxy / Math.sqrt(sxx * ys.reduce((s, y) => s + (y - my) ** 2, 0));
  const last5 = mean(rng.slice(-5)), last20 = mean(rng.slice(-20));
  return { a, b, corr, q25: quantile(ratios, 0.25), q75: quantile(ratios, 0.75), base: a + b * last5, last5, last20, lastClose: bars[bars.length - 1].c };
}

export const EVENT_FACTORS = { PAYEMS: 1.2, UNRATE: 1.2, DFF: 1.17, CPIAUCSL: 1.13, INV_US_CORE_CPI_MOM: 1.13 };
// Dias de reação às eleições (1º turno e 2º turno, se houver). Antes: 1,75x a média em 9 de 10 casos.
export const ELECTION_REACTION = { '2026-10-05': 'Reação ao 1º turno das eleições', '2026-10-26': 'Reação ao 2º turno das eleições (se houver)' };
const ELECTION_FACTOR = 1.5;

export function amplitudeFor(model, dayEvents, dateS) {
  let factor = 1; const why = [];
  for (const e of dayEvents) { const f = EVENT_FACTORS[e.indicator_code]; if (f && f > 1) { factor = Math.max(factor, f); why.push(e.event_name); } }
  if (ELECTION_REACTION[dateS]) { factor = Math.max(factor, ELECTION_FACTOR); why.push(ELECTION_REACTION[dateS]); }
  const pct = model.base * factor, lo = pct * model.q25, hi = pct * model.q75;
  const px = model.lastClose;
  return { pct, pts: pct * px, low_pct: lo, high_pct: hi, low_pts: lo * px, high_pts: hi * px, factor, why, vs_media20: pct / model.last20 };
}

/* ---------------- cenário: surpresa dos indicadores dos EUA ---------------- */
export const US_INDEX_CODES = ['PAYEMS', 'INV_US_ADP', 'INV_US_AHE_MOM', 'CPIAUCSL', 'INV_US_CORE_CPI_MOM', 'RSAFS', 'INV_US_CORE_RETAIL', 'ISM_US_MFG_PMI', 'ISM_US_SVC_PMI', 'GDPC1', 'INV_US_PHILLY', 'INV_US_CB_CONF', 'UNRATE'];

export function usScenarioStats(releases, bars) {
  // releases: [{code, date, actual, expected}] — só os que têm Projeção
  const byDate = {};
  for (const r of releases) {
    if (r.date < START || r.actual == null || r.expected == null || r.actual === r.expected) continue;
    byDate[r.date] = (byDate[r.date] || 0) + Math.sign(r.actual - r.expected) * (r.code === 'UNRATE' ? -1 : 1);
  }
  const px = {}; for (const b of bars) if (b.c !== b.o) px[b.d] = b.c > b.o ? 1 : 0;
  const acc = { strong: [0, 0], weak: [0, 0], weak_extreme: [0, 0] };
  for (const [d, s] of Object.entries(byDate)) {
    if (s === 0 || px[d] === undefined) continue;
    const y = px[d];
    if (s > 0) { acc.strong[0]++; acc.strong[1] += y; }
    if (s < 0) { acc.weak[0]++; acc.weak[1] += y; }
    if (s <= -2) { acc.weak_extreme[0]++; acc.weak_extreme[1] += y; }
  }
  const o = {}; for (const [k, [n, u]] of Object.entries(acc)) o[k] = { n, p: n ? u / n : null };
  return o;
}

/* ---------------- montagem do resultado ---------------- */
const IMPORTANT_NAME = /FOMC|Taxa-alvo|Selic|Payroll|Desemprego|IPC|IPCA|PIB|ISM/i;

export function buildForecast({ today, barsByAsset, events, releases, liveRows = [], horizon = 10 }) {
  // feriados extras vindos do calendário colado (Brasil)
  const extraHol = {};
  // (Quarta-feira de Cinzas o Investing marca como feriado, mas a B3 abre às 13h — continua sendo dia útil)
  for (const e of events) if (e.is_holiday && e.country === 'BR' && !/cinzas/i.test(e.event_name)) extraHol[e.event_date] = e.event_name.replace(/^Brasil - /, '');

  const lastBarDate = {};
  for (const a of Object.keys(barsByAsset)) { const b = barsByAsset[a]; lastBarDate[a] = b.length ? b[b.length - 1].d : null; }
  const todayHasBar = Object.values(lastBarDate).every((d) => d === today);
  const startFrom = isBusinessDay(today, extraHol) && !todayHasBar ? today : addDays(today, 1);
  const days = nextBusinessDays(startFrom, horizon, extraHol, true);

  // Série ajustada para troca de contrato (só nos cálculos de gap/média/tendência); os preços reais seguem em barsByAsset.
  const rolls = {}, bars = {}, aux = {};
  for (const a of Object.keys(barsByAsset)) { rolls[a] = rollDays(a, barsByAsset[a]); bars[a] = adjustBars(barsByAsset[a], rolls[a]); }
  const wdoByDate = {}; for (const b of (barsByAsset.WDO || [])) wdoByDate[b.d] = b;
  aux.WIN = { partner: wdoByDate }; // o WIN usa o que o dólar fez na véspera

  const models = {};
  for (const a of Object.keys(barsByAsset)) {
    models[a] = { stats: ruleStats(bars[a], aux[a], a), amp: amplitudeModel(bars[a]), us: usScenarioStats(releases, barsByAsset[a]) };
  }

  const eventsByDate = {};
  for (const e of events) {
    if (e.is_holiday || e.is_month_start_placeholder) continue;
    if (!(e.indicator_code || IMPORTANT_NAME.test(e.event_name))) continue;
    (eventsByDate[e.event_date] = eventsByDate[e.event_date] || []).push(e);
  }

  const first = days[0];
  const needBar = prevBusinessDay(first, extraHol);
  const out = { engine: ENGINE_VERSION, generated_for: today, last_price_date: lastBarDate, days: [], skipped: [], live: null, stale: {} };

  for (const a of Object.keys(barsByAsset)) {
    const stale = !lastBarDate[a] || lastBarDate[a] < needBar;
    out.stale[a] = stale ? { need: needBar, have: lastBarDate[a] } : null;
  }

  // dias ignorados (fins de semana e feriados) dentro do período mostrado
  for (let d = startFrom; d <= days[days.length - 1]; d = addDays(d, 1)) {
    if (!isBusinessDay(d, extraHol)) out.skipped.push({ date: d, why: weekday(d) === 0 ? 'Domingo' : weekday(d) === 6 ? 'Sábado' : holidayName(d, extraHol) });
  }

  for (const d of days) {
    const dayEvents = (eventsByDate[d] || []).sort((x, y) => (x.event_time || '').localeCompare(y.event_time || ''));
    const day = { date: d, is_first: d === first, events: dayEvents.slice(0, 14), assets: {} };
    const hasUs = dayEvents.some((e) => US_INDEX_CODES.includes(e.indicator_code));
    for (const a of Object.keys(barsByAsset)) {
      const m = models[a];
      let p = 0.5, used = [], all = [];
      if (d === first && !out.stale[a]) {
        all = activeSignals(bars[a], m.stats, {}, aux[a], a);
        const c = combine(all); p = c.p_up; used = c.used;
      }
      day.assets[a] = {
        p_up: p, label: labelFor(p),
        signals: all.map((s) => ({ id: s.id, txt: s.txt, n: s.n, p: s.p, p1: s.p1, p2: s.p2, stable: s.stable, edge: s.edge })),
        amp: amplitudeFor(m.amp, dayEvents, d),
        scenario: hasUs ? m.us : null,
        reason: d !== first ? 'Os sinais de direção dependem do fechamento do dia anterior; só ficam disponíveis para o próximo pregão.' : (out.stale[a] ? 'Preços desatualizados — cole as cotações em "Atualizar dados".' : null),
      };
    }
    out.days.push(day);
  }

  // dados para o campo "abertura de hoje" (regra do gap)
  out.gap_rules = {};
  for (const a of Object.keys(barsByAsset)) {
    const s = models[a].stats;
    out.gap_rules[a] = { last_close: barsByAsset[a][barsByAsset[a].length - 1]?.c, roll_day: isRollDate(a, first, extraHol), queda: s.gap_queda, alta: s.gap_alta,
      base_edges: (out.days[0]?.assets[a].signals || []).filter((x) => x.stable).map((x) => x.edge) };
  }

  // placar ao vivo: previsões congeladas antes do dia, comparadas com o resultado
  const results = {};
  for (const a of Object.keys(barsByAsset)) { results[a] = {}; for (const b of barsByAsset[a]) results[a][b.d] = b.c > b.o ? 'alta' : b.c < b.o ? 'baixa' : 'neutro'; }
  const rows = liveRows.map((r) => {
    const res = results[r.asset]?.[r.target_date] || null;
    const pred = r.p_up >= 0.5 ? 'alta' : 'baixa';
    return { asset: r.asset, date: r.target_date, p_up: Number(r.p_up), result: res, hit: res && res !== 'neutro' ? (pred === res) : null, directional: Math.abs(Number(r.p_up) - 0.5) >= 0.02 };
  }).sort((x, y) => y.date.localeCompare(x.date));
  const scored = rows.filter((r) => r.hit !== null && r.directional);
  out.live = { rows: rows.slice(0, 30), n_scored: scored.length, hits: scored.filter((r) => r.hit).length };

  // placar honesto + qualidade dos dados
  out.scoreboard = { from: 2016, direction: {}, amplitude: {} };
  out.data_quality = {};
  for (const a of Object.keys(barsByAsset)) {
    out.scoreboard.direction[a] = {
      pre: blindBacktest(bars[a], aux[a], a, { withOpen: false }),
      open: blindBacktest(bars[a], aux[a], a, { withOpen: true }),
    };
    out.scoreboard.amplitude[a] = amplitudeBlind(bars[a]);
    const raw = barsByAsset[a]; let rs = 0, rn = 0, os = 0, on = 0;
    for (let i = 1; i < raw.length; i++) {
      const g = raw[i].o / raw[i - 1].c - 1; if (!(Math.abs(g) < 0.2)) continue;
      if (rolls[a].has(raw[i].d)) { rs += g; rn++; } else { os += g; on++; }
    }
    out.data_quality[a] = { roll_days: rn, roll_mean_gap: rn ? rs / rn : null, other_mean_gap: on ? os / on : null };
  }

  out.models = Object.fromEntries(Object.keys(models).map((a) => [a, { amp_corr: models[a].amp.corr, last5_pct: models[a].amp.last5, last20_pct: models[a].amp.last20 }]));
  return out;
}
