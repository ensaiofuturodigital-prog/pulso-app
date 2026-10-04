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
export function featuresFor(bars, i) {
  if (i < 25) return null;
  const c = (k) => bars[k].c;
  const win = []; for (let k = i - 20; k <= i - 1; k++) win.push(c(k));
  const s = sd(win);
  const up = (k) => bars[k].c > bars[k].o;
  return {
    z20: s > 0 ? (c(i - 1) - mean(win)) / s : 0,
    s3: (up(i - 1) ? 1 : 0) + (up(i - 2) ? 1 : 0) + (up(i - 3) ? 1 : 0),
    mom5: c(i - 1) / c(i - 5) - 1,
  };
}

export const RULES = [
  { id: 'exaustao_baixo', txt: 'Fechou muito abaixo da média de 20 dias (2 desvios)', test: (f) => f.z20 < -2 },
  { id: 'exaustao_alto', txt: 'Fechou muito acima da média de 20 dias (2 desvios)', test: (f) => f.z20 > 2 },
  { id: 'tres_quedas', txt: '3 dias seguidos de queda', test: (f) => f.s3 === 0 },
  { id: 'tres_altas', txt: '3 dias seguidos de alta', test: (f) => f.s3 === 3 },
  { id: 'queda_5d', txt: 'Caiu mais de 2% em 5 dias', test: (f) => f.mom5 < -0.02 },
  { id: 'alta_5d', txt: 'Subiu mais de 2% em 5 dias', test: (f) => f.mom5 > 0.02 },
  { id: 'gap_queda', txt: 'Abriu em queda de mais de 0,3%', test: (f) => f.gap < -0.003, needsOpen: true },
  { id: 'gap_alta', txt: 'Abriu em alta de mais de 0,3%', test: (f) => f.gap > 0.003, needsOpen: true },
];

const START = '2012-01-01', SPLIT = '2020-01-01';

export function ruleStats(bars) {
  const acc = {}; for (const r of RULES) acc[r.id] = { n: 0, up: 0, n1: 0, up1: 0, n2: 0, up2: 0 };
  for (let i = 25; i < bars.length; i++) {
    const b = bars[i]; if (b.d < START || b.c === b.o) continue;
    const f = featuresFor(bars, i); if (!f) continue;
    f.gap = b.o / bars[i - 1].c - 1; if (Math.abs(f.gap) >= 0.03) continue;
    const y = b.c > b.o ? 1 : 0;
    for (const r of RULES) if (r.test(f)) {
      const a = acc[r.id]; a.n++; a.up += y;
      if (b.d < SPLIT) { a.n1++; a.up1 += y; } else { a.n2++; a.up2 += y; }
    }
  }
  const out = {};
  for (const r of RULES) {
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

export function activeSignals(bars, stats, extra = {}) {
  // bars: até o último fechamento disponível (prevê o dia seguinte)
  const f = featuresFor(bars, bars.length); // índice virtual = dia a prever
  const out = [];
  if (!f) return out;
  Object.assign(f, extra);
  for (const r of RULES) {
    if (r.needsOpen && f.gap === undefined) continue;
    if (r.test(f)) out.push(stats[r.id]);
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

  const models = {};
  for (const a of Object.keys(barsByAsset)) {
    const bars = barsByAsset[a];
    models[a] = { stats: ruleStats(bars), amp: amplitudeModel(bars), us: usScenarioStats(releases, bars) };
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
        all = activeSignals(barsByAsset[a], m.stats);
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
    out.gap_rules[a] = { last_close: barsByAsset[a][barsByAsset[a].length - 1]?.c, queda: s.gap_queda, alta: s.gap_alta,
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

  out.models = Object.fromEntries(Object.keys(models).map((a) => [a, { amp_corr: models[a].amp.corr, last5_pct: models[a].amp.last5, last20_pct: models[a].amp.last20 }]));
  return out;
}
