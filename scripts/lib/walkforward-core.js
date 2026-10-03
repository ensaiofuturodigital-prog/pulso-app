// Motor do teste cego (walk-forward) — parte de cálculo puro, sem banco.
// Regra de ouro: a previsão de um dia SÓ usa dados de dias anteriores a ele
// no TREINO. O modelo é re-treinado mês a mês, só com o que existia antes
// do primeiro dia daquele mês.

const DAY_MS = 86400000;
const dMs = (s) => Date.parse(s + 'T12:00:00Z');
const clip = (x, a, b) => Math.max(a, Math.min(b, x));
const sigmoid = (z) => 1 / (1 + Math.exp(-clip(z, -30, 30)));
const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

// prices: [{date, open, close}] em ordem. releasesByDate: {data: [{id, actual, previous}]}
// variant: 'consenso' = surpresa de verdade: realizado contra a Projeção (cai pro anterior se não houver Projeção)
//          'depois'   = surpresa contra o valor anterior
//          'antes'    = só sabe QUAIS indicadores estão agendados no dia, não o resultado
export function buildSamples(prices, releasesByDate, indicatorIds, variant) {
  const names = ['bias', 'dow1', 'dow2', 'dow3', 'dow4', 'dow5', 'mom1', 'mom5'];
  indicatorIds.forEach((id) => {
    if (variant === 'depois' || variant === 'consenso') { names.push('s' + id); names.push('x' + id); }
    else names.push('a' + id);
  });
  const idx = {}; names.forEach((n, i) => { idx[n] = i; });

  const samples = [];
  for (let i = 6; i < prices.length; i++) {
    const p = prices[i];
    if (p.open == null || p.close == null || p.close === p.open) continue; // sem direção = fora
    const f = [[idx.bias, 1]];
    const dow = new Date(dMs(p.date)).getUTCDay();
    if (dow >= 1 && dow <= 5) f.push([idx['dow' + dow], 1]);
    const c1 = prices[i - 1].close, c2 = prices[i - 2].close, c6 = prices[i - 6].close;
    const mom1 = c2 ? clip((c1 / c2 - 1) / 0.01, -3, 3) : 0;
    const mom5 = c6 ? clip((c1 / c6 - 1) / 0.02, -3, 3) : 0;
    f.push([idx.mom1, mom1], [idx.mom5, mom5]);
    const rel = releasesByDate[p.date] || [];
    for (const r of rel) {
      if (variant === 'depois' || variant === 'consenso') {
        const ref = (variant === 'consenso' && r.expected != null) ? r.expected : r.previous;
        const s = ref == null ? 0 : sgn(r.actual - ref);
        if (s !== 0) { f.push([idx['s' + r.id], s]); f.push([idx['x' + r.id], s * sgn(mom5)]); }
      } else {
        f.push([idx['a' + r.id], 1]);
      }
    }
    samples.push({ date: p.date, y: p.close > p.open ? 1 : 0, f, ev: rel.length > 0 });
  }
  return { samples, nFeatures: names.length, names };
}

export function newModel(n) { return { w: new Float64Array(n), g: new Float64Array(n) }; }

export function predict(model, f) {
  let z = 0; for (const [j, v] of f) z += model.w[j] * v; return sigmoid(z);
}

// Treino online com Adagrad (passo adaptativo por parâmetro: indicador raro
// não é esmagado) e peso maior pros dados recentes (meia-vida em anos).
export function train(model, samples, nowDate, { epochs = 3, lr = 0.15, l2 = 1e-4, halfLifeYears = 3 } = {}) {
  const now = dMs(nowDate);
  const order = samples.map((_, i) => i);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const sw = samples.map((s) => Math.pow(0.5, (now - dMs(s.date)) / DAY_MS / 365.25 / halfLifeYears));
  for (let e = 0; e < epochs; e++) {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (const k of order) {
      const s = samples[k];
      const err = (predict(model, s.f) - s.y) * sw[k];
      for (const [j, v] of s.f) {
        const grad = err * v + (j === 0 ? 0 : l2 * model.w[j]);
        model.g[j] += grad * grad;
        model.w[j] -= (lr * grad) / (Math.sqrt(model.g[j]) + 1e-8);
      }
    }
  }
}

// Teste cego: a cada mês, treina só com dias ANTERIORES ao mês e prevê o mês.
export function runWalkForward(samples, nFeatures, { startDate = '2013-01-01', warmEpochs = 12, monthEpochs = 3, ...opt } = {}) {
  const model = newModel(nFeatures);
  const preds = [];
  const months = [...new Set(samples.map((s) => s.date.slice(0, 7)))].sort();
  let trained = false;
  for (const m of months) {
    const monthStart = m + '-01';
    if (monthStart < startDate) continue;
    const past = samples.filter((s) => s.date < monthStart);
    if (past.length < 200) continue;
    train(model, past, monthStart, { ...opt, epochs: trained ? monthEpochs : warmEpochs });
    trained = true;
    for (const s of samples) if (s.date.slice(0, 7) === m) {
      preds.push({ pred_date: s.date, p_up: predict(model, s.f), label_up: s.y === 1, model_asof: monthStart, ev: s.ev });
    }
  }
  return preds;
}

const bucketOf = (p) => { const c = Math.max(p, 1 - p); return c < 0.55 ? '50-55' : c < 0.6 ? '55-60' : c < 0.65 ? '60-65' : '65+'; };

export function summarize(preds) {
  const acc = {};
  const add = (year, bucket, p) => {
    const k = year + '|' + bucket;
    acc[k] = acc[k] || { year, bucket, n: 0, hits: 0, ups: 0 };
    acc[k].n++; acc[k].ups += p.label_up ? 1 : 0; acc[k].hits += ((p.p_up >= 0.5) === p.label_up) ? 1 : 0;
  };
  for (const p of preds) {
    const y = Number(p.pred_date.slice(0, 4)); const b = bucketOf(p.p_up);
    add(y, 'todos', p); add(y, b, p); add(0, 'todos', p); add(0, b, p);
    const t = p.ev ? 'evento' : 'sem-evento'; add(y, t, p); add(0, t, p);
  }
  return Object.values(acc).sort((a, b) => a.year - b.year || a.bucket.localeCompare(b.bucket));
}
