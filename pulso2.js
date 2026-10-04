// PULSO 2 — interface da aba nova. Só mostra o que o endpoint /api/pulso2 calcula.
// Não depende do app.js nem altera nada das outras abas.

const root = document.getElementById('pulso2Root');
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const FLAG = { US: '🇺🇸', BR: '🇧🇷', EA: '🇪🇺' };
const pct = (x, d = 0) => (100 * x).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
const num = (x) => Math.round(x).toLocaleString('pt-BR');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dayLabel = (d) => { const [y, m, dd] = d.split('-'); const w = new Date(d + 'T12:00:00Z').getUTCDay(); return `${DOW[w]}, ${dd}/${m}/${y}`; };
const short = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
const todayBRT = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

function injectStyles() {
  if (document.getElementById('pulso2-style')) return;
  const st = document.createElement('style'); st.id = 'pulso2-style';
  st.textContent = `
  .p2-note{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin:0 0 14px;color:var(--text-dim);font-size:13px;line-height:1.5}
  .p2-warn{border-color:var(--amber);background:#F2B84B14;color:var(--text)}
  .p2-day{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);margin:0 0 12px;overflow:hidden}
  .p2-day>summary{cursor:pointer;list-style:none;padding:14px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
  .p2-day>summary::-webkit-details-marker{display:none}
  .p2-title{font-family:var(--font-display);font-size:17px;font-weight:600;color:var(--text)}
  .p2-badge{font-size:11px;padding:3px 8px;border-radius:99px;background:var(--gold-dim);color:var(--gold);white-space:nowrap}
  .p2-body{padding:0 16px 16px}
  .p2-grid{display:grid;grid-template-columns:1fr;gap:12px}
  @media(min-width:760px){.p2-grid{grid-template-columns:1fr 1fr}}
  .p2-asset{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px}
  .p2-asset h3{margin:0 0 6px;font-size:13px;letter-spacing:.08em;color:var(--text-dim);font-weight:600}
  .p2-prob{font-family:var(--font-mono);font-size:34px;font-weight:600;line-height:1.1}
  .p2-up{color:var(--teal)} .p2-down{color:var(--coral)} .p2-flat{color:var(--text)}
  .p2-label{font-size:13px;color:var(--text-dim);margin:2px 0 10px}
  .p2-amp{font-size:13px;color:var(--text);margin:8px 0;line-height:1.45}
  .p2-amp small,.p2-sig small,.p2-ev small{color:var(--text-faint)}
  .p2-sig{font-size:12.5px;margin:4px 0;padding-left:10px;border-left:2px solid var(--border);color:var(--text-dim)}
  .p2-sig.on{border-left-color:var(--gold);color:var(--text)}
  .p2-ev{font-size:13px;padding:6px 0;border-top:1px solid var(--border);color:var(--text)}
  .p2-box{margin-top:10px;padding:10px 12px;border:1px dashed var(--border);border-radius:var(--radius-sm);font-size:12.5px;color:var(--text-dim);line-height:1.5}
  .p2-open{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;font-size:12.5px;color:var(--text-dim)}
  .p2-open input{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:6px 8px;width:130px;font-family:var(--font-mono)}
  .p2-tbl{width:100%;border-collapse:collapse;font-size:13px}
  .p2-tbl th,.p2-tbl td{padding:6px 8px;border-bottom:1px solid var(--border);text-align:left;color:var(--text)}
  .p2-tbl th{color:var(--text-faint);font-weight:500;font-size:12px}
  .p2-hit{color:var(--teal)} .p2-miss{color:var(--coral)}
  .p2-skip{font-size:12px;color:var(--text-faint);margin:6px 0 14px}
  `;
  document.head.appendChild(st);
}

function probBlock(a, id) {
  const cls = a.p_up >= 0.52 ? 'p2-up' : a.p_up <= 0.48 ? 'p2-down' : 'p2-flat';
  return `<div class="p2-prob ${cls}" id="${id}-p">${pct(a.p_up)}</div><div class="p2-label" id="${id}-l">probabilidade de alta · ${esc(a.label)}</div>`;
}

function assetBlock(asset, a, day, data, isToday) {
  const id = `p2-${asset}-${day.date}`;
  const amp = a.amp;
  const sig = a.signals.length
    ? a.signals.map((s) => `<div class="p2-sig ${s.stable ? 'on' : ''}">${esc(s.txt)}<br><small>histórico: sobe em ${pct(s.p, 1)} dos casos (${s.n} dias${s.stable ? '' : ' · informativo, não entra na conta'})</small></div>`).join('')
    : (day.is_first && !a.reason ? '<div class="p2-sig">Nenhum sinal estatístico ativo para este pregão.</div>' : '');
  const why = amp.why.length ? ` <small>(inclui: ${esc(amp.why.join(', '))})</small>` : '';
  let gap = '';
  if (isToday && data.gap_rules[asset]?.last_close) {
    gap = `<div class="p2-open">Abertura de hoje (${asset}): <input type="number" step="0.5" inputmode="decimal" id="${id}-open" placeholder="ex.: ${num(data.gap_rules[asset].last_close)}"> <span id="${id}-gap"></span></div>`;
  }
  let scen = '';
  if (a.scenario && a.scenario.weak?.n) {
    const s = a.scenario;
    scen = `<div class="p2-box"><b>Cenário dos dados dos EUA hoje</b> (histórico desde 2012):<br>• Mais fracos que a Projeção → ${asset} fecha em alta em ${pct(s.weak.p)} dos dias (${s.weak.n} dias)${s.weak_extreme.n ? `; bem mais fracos: ${pct(s.weak_extreme.p)} (${s.weak_extreme.n})` : ''}.<br>• Mais fortes que a Projeção → ${pct(s.strong.p)} (${s.strong.n} dias).<br><small>Vale só depois da divulgação; antes dela, não há vantagem.</small></div>`;
  }
  return `<div class="p2-asset"><h3>${asset}</h3>${probBlock(a, id)}
    <div class="p2-amp"><b>Movimento esperado:</b> ~${num(amp.pts)} pts (${amp.vs_media20.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× a média de 20 dias)${why}<br><small>Metade dos dias fica entre ${num(amp.low_pts)} e ${num(amp.high_pts)} pts (máxima − mínima).</small></div>
    ${sig}${a.reason && !day.is_first ? '' : ''}${gap}${scen}</div>`;
}

function eventsBlock(events) {
  if (!events.length) return '';
  return `<div style="margin-top:12px">${events.map((e) => {
    const hora = e.event_time ? e.event_time.slice(0, 5) : '--:--';
    const per = e.period_ref ? ` (${esc(e.period_ref)})` : '';
    const proj = e.forecast_raw ? `Projeção ${esc(e.forecast_raw)}` : 'sem Projeção';
    const ant = e.previous_raw ? ` · Anterior ${esc(e.previous_raw)}` : '';
    const real = e.actual_raw ? ` · <b>Atual ${esc(e.actual_raw)}</b>` : '';
    return `<div class="p2-ev">${hora} ${FLAG[e.country] || esc(e.country)} ${esc(e.event_name)}${per}<br><small>${proj}${ant}${real}</small></div>`;
  }).join('')}</div>`;
}

function render(data) {
  const today = todayBRT();
  const first = data.days[0];
  let html = '';
  html += `<div class="p2-note"><b>Como ler.</b> Aqui o Pulso 2 mostra, para cada dia útil, <b>dois números</b>: a probabilidade de alta (só se afasta de 50% quando há um sinal estatístico estável no histórico) e o <b>movimento esperado</b> do dia, que é a parte mais confiável. Feriados e fins de semana não aparecem. As porcentagens vêm de histórico desde 2012 e são <b>candidatas a sinal</b>: a prova real é o registro ao vivo, mais abaixo. Não é recomendação de investimento.</div>`;

  const stale = Object.entries(data.stale).filter(([, v]) => v);
  if (stale.length) {
    const lines = stale.map(([a, v]) => `${a}: último fechamento no banco ${v.have ? short(v.have) : '—'}`).join(' · ');
    html += `<div class="p2-note p2-warn"><b>Preços desatualizados.</b> ${lines}. Para prever ${short(first.date)} preciso do fechamento de ${short(stale[0][1].need)}. Cole as cotações em <b>Atualizar dados</b>. Enquanto isso, a direção fica em 50% (sem vantagem) e a amplitude usa os últimos dados disponíveis.</div>`;
  }

  html += data.days.map((day, idx) => {
    const badges = [];
    if (day.assets.WDO.amp.why.length) day.assets.WDO.amp.why.forEach((w) => badges.push(w));
    const isToday = day.is_first && day.date === today;
    const head = `<summary><span class="p2-title">${dayLabel(day.date)}</span><span>${badges.slice(0, 2).map((b) => `<span class="p2-badge">${esc(b.length > 38 ? b.slice(0, 36) + '…' : b)}</span>`).join(' ')}</span></summary>`;
    return `<details class="p2-day" ${idx === 0 ? 'open' : ''}>${head}<div class="p2-body"><div class="p2-grid">${assetBlock('WDO', day.assets.WDO, day, data, isToday)}${assetBlock('WIN', day.assets.WIN, day, data, isToday)}</div>${!day.is_first ? '<div class="p2-sig" style="margin-top:10px">Direção: sem vantagem estatística. Os sinais usam o fechamento do dia anterior e só ficam disponíveis para o próximo pregão.</div>' : ''}${eventsBlock(day.events)}</div></details>`;
  }).join('');

  if (data.skipped.length) {
    html += `<details class="p2-skip"><summary>Dias sem pregão no período (não mostrados)</summary>${data.skipped.map((s) => `${DOW[new Date(s.date + 'T12:00:00Z').getUTCDay()]} ${short(s.date)} — ${esc(s.why)}`).join('<br>')}</details>`;
  }

  // registro ao vivo
  const live = data.live;
  const hitLine = live.n_scored ? `${live.hits} acertos em ${live.n_scored} previsões com direção (${pct(live.hits / live.n_scored)})` : 'Ainda sem previsões encerradas — o registro começa com a primeira previsão congelada.';
  html += `<h2 style="margin:22px 0 8px;font-family:var(--font-display);font-size:18px">Registro ao vivo do Pulso 2</h2>
    <div class="p2-note">Cada previsão é <b>congelada antes do pregão</b> e nunca é alterada. Aqui entra só o que o Pulso 2 previu de verdade, sem olhar o resultado. ${hitLine}</div>`;
  if (live.rows.length) {
    html += `<table class="p2-tbl"><thead><tr><th>Dia</th><th>Ativo</th><th>Prob. alta</th><th>Resultado</th><th></th></tr></thead><tbody>${live.rows.map((r) => `<tr><td>${short(r.date)}</td><td>${r.asset}</td><td>${pct(r.p_up)}</td><td>${r.result ? r.result : 'aguardando preços'}</td><td class="${r.hit === true ? 'p2-hit' : r.hit === false ? 'p2-miss' : ''}">${r.hit === null ? (r.directional ? '' : 'sem vantagem') : r.hit ? '✓' : '✗'}</td></tr>`).join('')}</tbody></table>`;
  }
  html += `<p class="panel-disclaimer">Estimativas estatísticas baseadas em dados históricos. Não constituem recomendação de investimento. Versão do motor: ${esc(data.engine)}.</p>`;
  root.innerHTML = html;

  // campo "abertura de hoje" (regra do gap)
  if (first && first.date === today) {
    for (const asset of ['WDO', 'WIN']) {
      const inp = document.getElementById(`p2-${asset}-${first.date}-open`);
      if (!inp) continue;
      inp.addEventListener('input', () => applyGap(asset, first, data, inp));
    }
  }
}

function applyGap(asset, day, data, inp) {
  const g = data.gap_rules[asset], id = `p2-${asset}-${day.date}`;
  const out = document.getElementById(`${id}-gap`), v = parseFloat(inp.value);
  if (!(v > 0)) { out.textContent = ''; return; }
  const gap = v / g.last_close - 1;
  const rule = gap < -0.003 ? g.queda : gap > 0.003 ? g.alta : null;
  let edges = g.base_edges.slice(), msg = `gap ${gap >= 0 ? '+' : ''}${(100 * gap).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  if (rule) {
    msg += ` · ${rule.txt}: histórico ${pct(rule.p, 1)} de alta em ${rule.n} dias${rule.stable ? '' : ' (informativo)'}`;
    if (rule.stable) edges.push(rule.edge);
  } else msg += ' · sem sinal de gap';
  const p = edges.length ? Math.max(0.35, Math.min(0.65, 0.5 + edges.reduce((a, b) => a + b, 0) / edges.length)) : 0.5;
  const el = document.getElementById(`${id}-p`);
  el.textContent = pct(p);
  el.className = 'p2-prob ' + (p >= 0.52 ? 'p2-up' : p <= 0.48 ? 'p2-down' : 'p2-flat');
  document.getElementById(`${id}-l`).textContent = 'probabilidade de alta · ' + (p >= 0.52 ? 'Leve viés de alta' : p <= 0.48 ? 'Leve viés de baixa' : 'Sem vantagem estatística');
  out.textContent = msg;
}

async function load() {
  if (!root) return;
  injectStyles();
  root.innerHTML = '<div class="p2-note">Carregando o Pulso 2…</div>';
  try {
    const r = await fetch('/api/pulso2');
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || 'erro ' + r.status);
    render(j);
  } catch (e) {
    root.innerHTML = `<div class="p2-note p2-warn"><b>Não consegui carregar o Pulso 2.</b> ${esc(e.message)}<br><small>As outras abas continuam funcionando normalmente.</small></div>`;
  }
}
load();
