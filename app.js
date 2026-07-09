import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public anon key — safe to expose client-side by design.
// NOTE: RLS is currently disabled on these tables (personal single-user project).
// Before sharing this app or adding real accounts, add row-level policies.
const SUPABASE_URL = 'https://iinbwtontwsxrkahenlo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpbmJ3dG9udHdzeHJrYWhlbmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMDcwMDEsImV4cCI6MjA5ODU4MzAwMX0.Ja04-sJ0WxCnl-SVuYgTgUv_wsat7bcSrpnT_dZu1fs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------- PUSH: notificações de eventos de alto impacto ---------------- */
const VAPID_PUBLIC_KEY = 'BP7ICcRQYrLVOKg0sh5bCAzG88J7ww7izEie7WT1KN2l9ycjEvoQ0N4wuX8hLHHjJ8uT7C3A736J3ms2_6maG7M';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function enablePush() {
  const btn = document.getElementById('enablePushBtn');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Seu navegador não suporta notificações push.');
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Permissão de notificação negada. Pra ativar depois, mude isso nas configurações do navegador/celular.');
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const subJson = sub.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert({
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth,
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    btn.textContent = '🔔 Avisos ativados';
    btn.disabled = true;
  } catch (err) {
    console.error(err);
    alert('Não consegui ativar as notificações agora. Tenta de novo em instantes.');
  }
}

async function checkPushStatus() {
  const btn = document.getElementById('enablePushBtn');
  if (!btn || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { btn.textContent = '🔔 Avisos ativados'; btn.disabled = true; }
  } catch { /* segue com o botão padrão */ }
}

/* ---------------- TABS ---------------- */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('is-active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('is-active'));
    btn.classList.add('is-active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('is-active');
  });
});

/* ---------------- CLOCK / SESSION ---------------- */
function updateClock() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
  });
  const hourFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false
  });
  const text = fmt.format(now);
  const hour = parseInt(hourFmt.format(now), 10);
  document.getElementById('clockText').textContent = text + ' BRT';

  const dot = document.getElementById('sessionDot');
  const label = document.getElementById('sessionLabel');
  if (hour >= 8 && hour < 19) {
    dot.classList.add('is-open');
    label.textContent = 'sessão aberta';
  } else {
    dot.classList.remove('is-open');
    label.textContent = 'fora da sessão';
  }
}
updateClock();
setInterval(updateClock, 30000);

/* ---------------- PULSE LINE (header signature) ---------------- */
(function animatePulse() {
  const line = document.getElementById('pulseLine');
  if (!line) return;
  const W = 300, H = 40, MID = 20;
  let t = 0;
  function frame() {
    let pts = [];
    for (let x = 0; x <= W; x += 6) {
      const phase = (x + t) * 0.05;
      let y = MID;
      const beat = ((x + t) % 120);
      if (beat > 40 && beat < 70) {
        y = MID - Math.sin(((beat - 40) / 30) * Math.PI) * 16;
      } else {
        y = MID + Math.sin(phase) * 1.5;
      }
      pts.push(`${x},${y.toFixed(1)}`);
    }
    line.setAttribute('points', pts.join(' '));
    t += 2.2;
    requestAnimationFrame(frame);
  }
  frame();
})();

/* ---------------- HELPERS ---------------- */
function trendClass(actual, previous) {
  if (previous === null || previous === undefined || actual === previous) return 'flat';
  return actual > previous ? 'up' : 'down';
}
function pctMagnitude(actual, previous) {
  if (!previous) return 20;
  const change = Math.abs((actual - previous) / previous);
  return Math.min(100, Math.max(8, change * 800));
}
function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(d + 'T12:00:00'));
}
function monthLabel(d) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(d + 'T12:00:00'));
}
function todayStrBR() {
  // en-CA formata como YYYY-MM-DD, o mesmo formato usado no banco
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
function countryFlag(c) {
  return c === 'BR' ? '🇧🇷' : c === 'US' ? '🇺🇸' : '';
}
function importanceBadge(n) {
  const lvl = n || 1;
  if (lvl >= 3) return `<span class="impact-badge imp-3">Alto impacto</span>`;
  if (lvl === 2) return `<span class="impact-badge imp-2">Impacto moderado</span>`;
  return `<span class="impact-badge imp-1">Baixo impacto</span>`;
}
function confidenceLabel(sampleSize) {
  if (sampleSize >= 30) return { text: 'Confiança alta', cls: 'conf-high' };
  if (sampleSize >= 12) return { text: 'Confiança média', cls: 'conf-mid' };
  return { text: 'Confiança baixa — usar com cautela', cls: 'conf-low' };
}
function sparklineSvg(points, trend) {
  if (!points || points.length < 2) return '';
  const vals = points.map(p => p.actual_value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max - min) || 1;
  const w = 80, h = 24, step = w / (points.length - 1);
  const coords = vals.map((v, i) => {
    const x = (i * step).toFixed(1);
    const y = (h - ((v - min) / range) * h).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  const color = trend === 'up' ? 'var(--teal)' : trend === 'down' ? 'var(--coral)' : 'var(--text-faint)';
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ---------------- INDICATORS PANEL ---------------- */
async function loadIndicators() {
  const grid = document.getElementById('indicatorsGrid');
  try {
    const { data: indicatorsRaw, error: indErr } = await supabase
      .from('indicators')
      .select('*')
      .order('name_pt');
    if (indErr) throw indErr;
    // BCB_USDBRL e IBOV são referências de mercado usadas nos cálculos, não indicadores em si.
    // DXY/T-Note/Petróleo viram o ticker de correlacionados no topo, em vez de card normal.
    const TICKER_CODES = ['DTWEXBGS', 'DGS10', 'DCOILWTICO'];
    // Removidos a pedido: CPI (já coberto pelo Núcleo do CPI) e HSP - Housing Starts/Permits (HOUST, PERMIT)
    const HIDDEN_CODES = ['CPIAUCSL', 'HOUST', 'PERMIT'];
    const indicators = (indicatorsRaw || []).filter(i =>
      i.code !== 'BCB_USDBRL' && i.code !== 'IBOV' && !TICKER_CODES.includes(i.code) && !HIDDEN_CODES.includes(i.code)
    );

    if (!indicators || indicators.length === 0) {
      grid.innerHTML = '<p class="empty-note">Nenhum indicador ainda. O robô de coleta roda todo dia às 9h — se acabou de configurar, rode-o manualmente no GitHub Actions.</p>';
      return;
    }

    const releasesByIndicator = {};
    await Promise.all(indicators.map(async (ind) => {
      const { data } = await supabase
        .from('indicator_releases')
        .select('*')
        .eq('indicator_id', ind.id)
        .order('release_date', { ascending: false })
        .limit(12);
      releasesByIndicator[ind.id] = (data || []).reverse(); // volta pra ordem crescente
    }));

    const { data: statsRows } = await supabase.from('indicator_stats').select('*');
    const statsMap = {};
    (statsRows || []).forEach(s => statsMap[s.indicator_id] = s);

    function readout(pctUp, ci) {
      if (pctUp === null || pctUp === undefined) return { arrow: '—', label: 'sem dado', cls: 'flat', pct: '—', range: '' };
      const hasCi = ci && ci.ci_low !== null && ci.ci_low !== undefined && ci.ci_high !== null && ci.ci_high !== undefined;
      if (pctUp >= 50) {
        const range = hasCi ? ` (${fmtNum(ci.ci_low)}–${fmtNum(ci.ci_high)}%)` : '';
        return { arrow: '▲', label: 'tende a SUBIR', cls: 'up', pct: pctUp, range };
      }
      const range = hasCi ? ` (${fmtNum(Math.round((100 - ci.ci_high) * 10) / 10)}–${fmtNum(Math.round((100 - ci.ci_low) * 10) / 10)}%)` : '';
      return { arrow: '▼', label: 'tende a CAIR', cls: 'down', pct: Math.round((100 - pctUp) * 10) / 10, range };
    }

    function scenarioRow(scenarioLabel, pctUsd, pctIbov, ciUsd, ciIbov) {
      const wdo = readout(pctUsd, ciUsd);
      const win = readout(pctIbov, ciIbov);
      return `
        <div class="scenario-row">
          <span class="scenario-label">${scenarioLabel}</span>
          <span class="scenario-asset"><b>WDO</b> <span class="arrow ${wdo.cls}">${wdo.arrow}</span> ${wdo.label} <b>${wdo.pct}%</b><span class="ci-range">${wdo.range}</span></span>
          <span class="scenario-asset"><b>WIN</b> <span class="arrow ${win.cls}">${win.arrow}</span> ${win.label} <b>${win.pct}%</b><span class="ci-range">${win.range}</span></span>
        </div>`;
    }

    function statsPanel(ind) {
      const s = statsMap[ind.id];
      if (!s) {
        return `<details class="ind-stats"><summary>Ver probabilidade histórica</summary>
          <p class="stats-empty">Ainda sem amostra suficiente pra esse indicador.</p></details>`;
      }
      const conf = confidenceLabel(s.sample_size);
      const alertHtml = s.alert_text ? `<p class="alert-banner">⚠️ ${s.alert_text}</p>` : '';
      return `<details class="ind-stats"><summary>Ver probabilidade histórica (${s.sample_size} divulgações)</summary>
        <span class="conf-badge ${conf.cls}">${conf.text}</span>
        ${alertHtml}
        ${scenarioRow('Se vier ACIMA do anterior', s.pct_usd_up_after_indicator_up, s.pct_ibov_up_after_indicator_up, s.confidence?.usd_up, s.confidence?.ibov_up)}
        ${scenarioRow('Se vier ABAIXO do anterior', s.pct_usd_up_after_indicator_down, s.pct_ibov_up_after_indicator_down, s.confidence?.usd_down, s.confidence?.ibov_down)}
        <p class="stats-period">Baseado no histórico de ${fmtDate(s.first_date)} até ${fmtDate(s.last_date)}. O número entre parênteses é a faixa provável real (intervalo de confiança de 95%) — quanto menor a amostra, mais larga a faixa. WIN estimado via Ibovespa (proxy gratuito). Não é garantia de repetição — é o que aconteceu no passado.</p>
      </details>`;
    }

    grid.innerHTML = '';
    indicators.forEach(ind => {
      const indReleases = releasesByIndicator[ind.id] || [];
      const rel = indReleases[indReleases.length - 1];
      const flag = countryFlag(ind.country);
      const card = document.createElement('div');
      card.className = 'ind-card';
      card.dataset.importance = ind.importance || 1;

      if (!rel) {
        card.innerHTML = `
          <div class="ind-card-top">
            <div><div class="ind-name">${flag} ${ind.name_pt}</div><div class="ind-code">${ind.code}</div></div>
          </div>
          <p class="ind-desc">${ind.description_pt || ''}</p>
          <p class="ind-date">Sem divulgação registrada ainda</p>`;
        grid.appendChild(card);
        return;
      }

      const trend = trendClass(rel.actual_value, rel.previous_value);
      const mag = pctMagnitude(rel.actual_value, rel.previous_value);
      const badgeText = trend === 'up' ? '▲ subiu' : trend === 'down' ? '▼ caiu' : '— estável';
      const spark = sparklineSvg(indReleases, trend);
      card.dataset.importance = ind.importance || 1;

      card.innerHTML = `
        <div class="ind-card-top">
          <div><div class="ind-name">${flag} ${ind.name_pt}</div><div class="ind-code">${ind.code} · ${ind.frequency || ''}</div></div>
          <div class="ind-badges"><span class="ind-badge ${trend}">${badgeText}</span>${importanceBadge(ind.importance)}</div>
        </div>
        <div class="ind-values">
          <span class="ind-value">${fmtNum(rel.actual_value)}</span>
          <span class="ind-prev">ant. ${fmtNum(rel.previous_value)}</span>
          ${spark}
        </div>
        <div class="pulse-bar"><div class="pulse-bar-fill ${trend}" style="width:${mag}%"></div></div>
        <p class="ind-desc">${ind.description_pt || ''}</p>
        <p class="ind-date">Divulgado em ${fmtDate(rel.release_date)}</p>
        ${statsPanel(ind)}`;
      grid.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<p class="empty-note">Não consegui carregar os indicadores agora. Verifique a conexão com o Supabase.</p>';
  }
}

/* ---------------- CALENDAR / TIMELINE PANEL ---------------- */
async function loadTimeline() {
  const list = document.getElementById('calendarList');
  try {
    const { data: indicators } = await supabase.from('indicators').select('id,name_pt,country');
    const { data: releases, error } = await supabase
      .from('indicator_releases')
      .select('*')
      .order('release_date', { ascending: false })
      .limit(80);
    if (error) throw error;

    if (!releases || releases.length === 0) {
      list.innerHTML = '<p class="empty-note">Nenhuma divulgação registrada ainda.</p>';
      return;
    }

    const indMap = {};
    (indicators || []).forEach(i => indMap[i.id] = i);

    let html = '';
    let currentDay = '';
    releases.forEach(rel => {
      const ind = indMap[rel.indicator_id] || {};
      const dayKey = rel.release_date;
      if (dayKey !== currentDay) {
        const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(dayKey + 'T12:00:00'));
        html += `<div class="tl-month">${weekday}</div>`;
        currentDay = dayKey;
      }
      const trend = trendClass(rel.actual_value, rel.previous_value);
      const flag = countryFlag(ind.country);
      html += `
        <div class="tl-row">
          <span class="tl-date">${flag}</span>
          <span class="tl-dot ${trend}"></span>
          <div class="tl-body">
            <div class="tl-name">${ind.name_pt || 'Indicador'}</div>
            <div class="tl-vals">Real: ${fmtNum(rel.actual_value)} <span style="opacity:.6">· Anterior: ${fmtNum(rel.previous_value)}</span></div>
          </div>
        </div>`;
    });
    list.innerHTML = html;
  } catch (err) {
    console.error(err);
    list.innerHTML = '<p class="empty-note">Não consegui carregar o histórico agora.</p>';
  }
}

/* ---------------- RADAR: NOTÍCIAS DA MADRUGADA ---------------- */
async function loadOvernightNews() {
  const list = document.getElementById('newsList');
  try {
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .eq('region', 'overnight')
      .order('published_at', { ascending: false });
    if (error) throw error;

    if (!data || data.length === 0) {
      list.innerHTML = '<p class="empty-note">Nenhuma notícia registrada na última varredura (18h–8h). O robô roda todo dia às 8h — se acabou de configurar, rode-o manualmente no GitHub Actions.</p>';
      return;
    }

    list.innerHTML = data.map(n => {
      const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(n.published_at));
      return `
        <a class="news-row" href="${n.url}" target="_blank" rel="noopener">
          <span class="news-time">${time}</span>
          <div class="news-body">
            <div class="news-title">${n.title}</div>
            <div class="news-source">${n.source}</div>
          </div>
        </a>`;
    }).join('');
  } catch (err) {
    console.error(err);
    list.innerHTML = '<p class="empty-note">Não consegui carregar as notícias agora.</p>';
  }
}

/* ---------------- TICKER: ATIVOS CORRELACIONADOS ---------------- */
async function loadTicker() {
  const el = document.getElementById('correlatedTicker');
  if (!el) return;
  const CODES = ['DTWEXBGS', 'DGS10', 'DCOILWTICO'];
  try {
    const { data: indicators, error } = await supabase.from('indicators').select('*').in('code', CODES);
    if (error) throw error;
    if (!indicators || indicators.length === 0) { el.innerHTML = ''; return; }

    const byCode = {};
    indicators.forEach(i => byCode[i.code] = i);

    const items = await Promise.all(CODES.map(async (code) => {
      const ind = byCode[code];
      if (!ind) return null;
      const { data } = await supabase
        .from('indicator_releases')
        .select('*')
        .eq('indicator_id', ind.id)
        .order('release_date', { ascending: false })
        .limit(1);
      const rel = data && data[0];
      if (!rel) return null;
      const trend = trendClass(rel.actual_value, rel.previous_value);
      return { name: ind.name_pt, value: rel.actual_value, trend };
    }));

    el.innerHTML = items.filter(Boolean).map(it => `
      <div class="ticker-item">
        <span class="ticker-name">${it.name}</span>
        <span class="ticker-value ${it.trend}">${fmtNum(it.value)} ${it.trend === 'up' ? '▲' : it.trend === 'down' ? '▼' : '—'}</span>
      </div>`).join('');
  } catch (err) {
    console.error(err);
    el.innerHTML = '';
  }
}

/* ---------------- SELO DE ÚLTIMA ATUALIZAÇÃO ---------------- */
async function loadLastUpdate() {
  const el = document.getElementById('lastUpdateBadge');
  if (!el) return;
  try {
    const { data, error } = await supabase
      .from('indicator_releases')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (!data || !data[0] || !data[0].created_at) { el.textContent = ''; return; }
    const when = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
    }).format(new Date(data[0].created_at));
    el.textContent = `Dados atualizados em ${when}`;
  } catch (err) {
    console.error(err);
    el.textContent = '';
  }
}

/* ---------------- TRADE JOURNAL ---------------- */
const form = document.getElementById('tradeForm');
const statusEl = document.getElementById('formStatus');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = 'Salvando…';

  const exitTimeVal = document.getElementById('tf-exit-time').value;
  const payload = {
    asset: document.getElementById('tf-asset').value,
    trade_time: new Date(document.getElementById('tf-entry-time').value).toISOString(),
    price: document.getElementById('tf-entry-price').value ? parseFloat(document.getElementById('tf-entry-price').value) : null,
    exit_price: document.getElementById('tf-exit-price').value ? parseFloat(document.getElementById('tf-exit-price').value) : null,
    exit_time: exitTimeVal ? new Date(exitTimeVal).toISOString() : null,
    result: document.getElementById('tf-result').value ? parseFloat(document.getElementById('tf-result').value) : null,
  };

  const { error } = await supabase.from('trade_journal').insert(payload);
  if (error) {
    console.error(error);
    statusEl.textContent = 'Erro ao salvar. Tenta de novo?';
    return;
  }
  statusEl.textContent = 'Operação registrada ✓';
  form.reset();
  loadJournal();
  setTimeout(() => statusEl.textContent = '', 2500);
});

// Default the datetime field to "now" in local time
(function setDefaultTime() {
  const el = document.getElementById('tf-entry-time');
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  el.value = now.toISOString().slice(0, 16);
})();

let lastJournalData = [];

async function loadJournal() {
  const listEl = document.getElementById('journalList');
  const summaryEl = document.getElementById('journalSummary');
  try {
    const { data, error } = await supabase
      .from('trade_journal')
      .select('*')
      .order('trade_time', { ascending: false })
      .limit(50);
    if (error) throw error;
    lastJournalData = data || [];

    if (!data || data.length === 0) {
      summaryEl.innerHTML = '';
      listEl.innerHTML = '<p class="empty-note">Nenhuma operação registrada ainda — comece pelo formulário acima.</p>';
      return;
    }

    const total = data.reduce((s, t) => s + (t.result || 0), 0);
    const wins = data.filter(t => (t.result || 0) > 0).length;
    const winRate = Math.round((wins / data.length) * 100);

    summaryEl.innerHTML = `
      <div class="js-stat"><div class="js-stat-label">Operações</div><div class="js-stat-value">${data.length}</div></div>
      <div class="js-stat"><div class="js-stat-label">Resultado total</div><div class="js-stat-value ${total >= 0 ? 'pos' : 'neg'}">${total >= 0 ? '+' : ''}${fmtNum(total)}</div></div>
      <div class="js-stat"><div class="js-stat-label">Taxa de acerto</div><div class="js-stat-value">${winRate}%</div></div>`;

    listEl.innerHTML = data.map(t => {
      const r = t.result;
      const rClass = r > 0 ? 'pos' : r < 0 ? 'neg' : '';
      const entryTime = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t.trade_time));
      const exitTime = t.exit_time ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t.exit_time)) : null;
      const entryTxt = `Entrada: ${entryTime}${t.price !== null && t.price !== undefined ? ` @ ${fmtNum(t.price)}` : ''}`;
      const exitTxt = exitTime ? ` · Saída: ${exitTime}${t.exit_price !== null && t.exit_price !== undefined ? ` @ ${fmtNum(t.exit_price)}` : ''}` : '';
      return `
        <div class="j-row">
          <span class="j-asset">${t.asset}</span>
          <div class="j-info">
            <div class="j-reason">${entryTxt}${exitTxt}</div>
          </div>
          <span class="j-result ${rClass}">${r === null ? '—' : (r >= 0 ? '+' : '') + fmtNum(r)}</span>
        </div>`;
    }).join('');

    renderWeeklySummary(data);
    renderPatterns(data);
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<p class="empty-note">Não consegui carregar o diário agora.</p>';
  }
}

/* ---------------- EXPORTAR CSV ---------------- */
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (!lastJournalData || lastJournalData.length === 0) {
    alert('Nenhuma operação registrada ainda pra exportar.');
    return;
  }
  const headers = ['ativo', 'data_hora_entrada', 'preco_entrada', 'data_hora_saida', 'preco_saida', 'resultado'];
  const rows = lastJournalData.map(t => [
    t.asset,
    t.trade_time ? new Date(t.trade_time).toISOString() : '',
    t.price ?? '',
    t.exit_time ? new Date(t.exit_time).toISOString() : '',
    t.exit_price ?? '',
    t.result ?? '',
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pulso-diario-${todayStrBR()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

/* ---------------- RESUMO SEMANAL ---------------- */
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-S${String(weekNo).padStart(2, '0')}`;
}

function renderWeeklySummary(allTrades) {
  const el = document.getElementById('weeklySummary');
  if (!allTrades || allTrades.length === 0) {
    el.innerHTML = '<p class="empty-note">Sem operações suficientes ainda pra montar o resumo semanal.</p>';
    return;
  }
  const weeks = {};
  allTrades.forEach(t => {
    const key = isoWeekKey(new Date(t.trade_time));
    if (!weeks[key]) weeks[key] = { total: 0, count: 0, wins: 0 };
    weeks[key].total += (t.result || 0);
    weeks[key].count += 1;
    if ((t.result || 0) > 0) weeks[key].wins += 1;
  });
  const sortedKeys = Object.keys(weeks).sort().reverse().slice(0, 6);

  el.innerHTML = sortedKeys.map(key => {
    const w = weeks[key];
    const winRate = Math.round((w.wins / w.count) * 100);
    const cls = w.total >= 0 ? 'pos' : 'neg';
    return `
      <div class="week-row">
        <span class="week-label">${key}</span>
        <span class="week-count">${w.count} op.</span>
        <span class="week-winrate">${winRate}% acerto</span>
        <span class="week-total ${cls}">${w.total >= 0 ? '+' : ''}${fmtNum(w.total)}</span>
      </div>`;
  }).join('');
}

/* ---------------- PADRÕES: HORÁRIO E DIA DA SEMANA ---------------- */
function renderPatterns(allTrades) {
  const hourEl = document.getElementById('patternsByHour');
  const wdEl = document.getElementById('patternsByWeekday');
  if (!allTrades || allTrades.length < 5) {
    const msg = '<p class="empty-note">Registre pelo menos 5 operações pra ver seus padrões por horário e dia da semana.</p>';
    hourEl.innerHTML = msg;
    wdEl.innerHTML = '';
    return;
  }

  // Janelas de horário alinhadas com a sessão de operação (8h-19h)
  const HOUR_BUCKETS = [
    { label: '08h-10h', min: 8, max: 10 },
    { label: '10h-12h', min: 10, max: 12 },
    { label: '12h-14h', min: 12, max: 14 },
    { label: '14h-16h', min: 14, max: 16 },
    { label: '16h-19h', min: 16, max: 19 },
  ];
  const hourStats = HOUR_BUCKETS.map(b => ({ ...b, total: 0, count: 0, wins: 0 }));

  const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const wdStats = WEEKDAY_NAMES.map(name => ({ name, total: 0, count: 0, wins: 0 }));

  allTrades.forEach(t => {
    const d = new Date(t.trade_time);
    const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false });
    const hour = parseInt(hourFmt.format(d), 10);
    const bucket = hourStats.find(b => hour >= b.min && hour < b.max);
    if (bucket) {
      bucket.total += (t.result || 0);
      bucket.count += 1;
      if ((t.result || 0) > 0) bucket.wins += 1;
    }

    const wdFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
    const wdName = wdFmt.format(d);
    const idxMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const wd = wdStats[idxMap[wdName]];
    if (wd) {
      wd.total += (t.result || 0);
      wd.count += 1;
      if ((t.result || 0) > 0) wd.wins += 1;
    }
  });

  function renderRows(rows) {
    const active = rows.filter(r => r.count > 0);
    if (active.length === 0) return '<p class="empty-note">Sem dado suficiente ainda.</p>';
    return active.map(r => {
      const winRate = Math.round((r.wins / r.count) * 100);
      const cls = r.total >= 0 ? 'pos' : 'neg';
      return `
        <div class="week-row">
          <span class="week-label">${r.label || r.name}</span>
          <span class="week-count">${r.count} op.</span>
          <span class="week-winrate">${winRate}% acerto</span>
          <span class="week-total ${cls}">${r.total >= 0 ? '+' : ''}${fmtNum(r.total)}</span>
        </div>`;
    }).join('');
  }

  hourEl.innerHTML = renderRows(hourStats);
  wdEl.innerHTML = renderRows(wdStats.filter(w => w.name !== 'Domingo' && w.name !== 'Sábado'));
}


function scenarioLine(scenarioLabel, pctUsd, pctIbov, ciUsd, ciIbov) {
  function readoutInline(pctUp, ci) {
    if (pctUp === null || pctUp === undefined) return '—';
    const hasCi = ci && ci.ci_low !== null && ci.ci_low !== undefined && ci.ci_high !== null && ci.ci_high !== undefined;
    if (pctUp >= 50) {
      const range = hasCi ? ` (${fmtNum(ci.ci_low)}–${fmtNum(ci.ci_high)}%)` : '';
      return `<span class="arrow up">▲</span> SOBE ${pctUp}%<span class="ci-range">${range}</span>`;
    }
    const pctDown = Math.round((100 - pctUp) * 10) / 10;
    const range = hasCi ? ` (${fmtNum(Math.round((100 - ci.ci_high) * 10) / 10)}–${fmtNum(Math.round((100 - ci.ci_low) * 10) / 10)}%)` : '';
    return `<span class="arrow down">▼</span> CAI ${pctDown}%<span class="ci-range">${range}</span>`;
  }
  return `<div class="summary-scenario"><b>${scenarioLabel}</b>: WDO ${readoutInline(pctUsd, ciUsd)} · WIN ${readoutInline(pctIbov, ciIbov)}</div>`;
}

async function loadDailySummary(dateStr) {
  dateStr = dateStr || todayStrBR();
  const head = document.getElementById('dailySummaryHead');
  const retroEl = document.getElementById('dailySummaryRetro');
  const itemsEl = document.getElementById('dailySummaryItems');
  const isToday = dateStr === todayStrBR();
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(dateStr + 'T12:00:00'));

  retroEl.innerHTML = '';
  itemsEl.innerHTML = '<p class="stats-empty">Carregando…</p>';

  try {
    const { data: scheduled, error } = await supabase
      .from('release_schedule')
      .select('indicator_id')
      .eq('release_date', dateStr);
    if (error) throw error;

    if (!scheduled || scheduled.length === 0) {
      head.textContent = `Resumo de ${isToday ? 'hoje' : 'dia'} (${dateLabel}): nenhum indicador de alto impacto programado`;
      itemsEl.innerHTML = '<p class="stats-empty">Sem divulgações agendadas dos indicadores que acompanhamos nessa data, pelo calendário do FRED. Use as setas pra navegar por outras datas.</p>';
      return;
    }

    const ids = scheduled.map(s => s.indicator_id);
    const { data: indicators } = await supabase.from('indicators').select('*').in('id', ids);
    const { data: statsRows } = await supabase.from('indicator_stats').select('*').in('indicator_id', ids);
    const statsMap = {};
    (statsRows || []).forEach(s => statsMap[s.indicator_id] = s);

    // Pra cada indicador, pega a divulgação mais próxima na data ou antes dela (o dado mensal não
    // costuma bater com o dia exato do anúncio — ver aviso na aba Calendário)
    const releaseByIndicator = {};
    await Promise.all(ids.map(async (id) => {
      const { data } = await supabase
        .from('indicator_releases')
        .select('*')
        .eq('indicator_id', id)
        .lte('release_date', dateStr)
        .order('release_date', { ascending: false })
        .limit(1);
      if (data && data.length) releaseByIndicator[id] = data[0];
    }));

    const sorted = (indicators || []).sort((a, b) => (b.importance || 1) - (a.importance || 1));

    head.textContent = `Resumo de ${isToday ? 'hoje' : 'dia'} (${dateLabel}): ${sorted.length} indicador(es) programado(s)`;

    let weightedSum = 0, weightTotal = 0;
    itemsEl.innerHTML = sorted.map(ind => {
      const s = statsMap[ind.id];
      const flag = countryFlag(ind.country);
      const time = ind.typical_time_brt ? ` · por volta das ${ind.typical_time_brt}` : '';
      const rel = releaseByIndicator[ind.id];
      const trend = rel ? trendClass(rel.actual_value, rel.previous_value) : 'flat';

      if (s && trend !== 'flat') {
        const prob = trend === 'up' ? s.pct_usd_up_after_indicator_up : s.pct_usd_up_after_indicator_down;
        if (prob !== null && prob !== undefined && (s.sample_size || 0) >= 5) {
          weightedSum += prob * s.sample_size;
          weightTotal += s.sample_size;
        }
      }

      const scenarios = s
        ? `<span class="conf-badge ${confidenceLabel(s.sample_size).cls}">${confidenceLabel(s.sample_size).text} · ${s.sample_size} divulgações</span>` +
          scenarioLine('Se vier ACIMA do anterior', s.pct_usd_up_after_indicator_up, s.pct_ibov_up_after_indicator_up, s.confidence?.usd_up, s.confidence?.ibov_up) +
          scenarioLine('Se vier ABAIXO do anterior', s.pct_usd_up_after_indicator_down, s.pct_ibov_up_after_indicator_down, s.confidence?.usd_down, s.confidence?.ibov_down)
        : '<p class="stats-empty">Sem amostra histórica suficiente ainda.</p>';
      return `
        <div class="summary-item">
          <div class="summary-item-head">${flag} <b>${ind.name_pt}</b> ${importanceBadge(ind.importance)}${time}</div>
          ${scenarios}
        </div>`;
    }).join('');

    /* Probabilidade agregada + conferência retroativa */
    const aggProb = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : null;

    let usdIndId = null;
    try {
      const { data: usdInd } = await supabase.from('indicators').select('id').eq('code', 'BCB_USDBRL').maybeSingle();
      usdIndId = usdInd ? usdInd.id : null;
    } catch { /* segue sem conferência retroativa se não achar */ }

    let usdRelease = null;
    let usdPrice = null;
    if (usdIndId) {
      const { data: usdRows } = await supabase
        .from('indicator_releases')
        .select('*')
        .eq('indicator_id', usdIndId)
        .eq('release_date', dateStr)
        .limit(1);
      usdRelease = usdRows && usdRows[0] ? usdRows[0] : null;

      const { data: priceRows } = await supabase
        .from('price_daily')
        .select('open,high,low,close')
        .eq('asset', 'USDBRL')
        .eq('price_date', dateStr)
        .limit(1);
      usdPrice = priceRows && priceRows[0] ? priceRows[0] : null;
    }

    let retroHtml = '';
    if (aggProb !== null) {
      retroHtml += `<div class="scenario-row" style="margin-bottom:10px">
        <span class="scenario-label">Probabilidade histórica agregada do dia</span>
        <span class="scenario-asset"><b>${aggProb}%</b> de chance histórica de alta do dólar nesse dia, combinando os indicadores acima — estatística do passado, não previsão.</span>
      </div>`;
    }
    if (usdRelease) {
      const actualTrend = trendClass(usdRelease.actual_value, usdRelease.previous_value);
      if (actualTrend !== 'flat' && aggProb !== null) {
        const predictedUp = aggProb >= 50;
        const actualUp = actualTrend === 'up';
        const hit = predictedUp === actualUp;
        const openCloseHtml = usdPrice && usdPrice.open != null
          ? `<span class="retro-note">Abertura R$ ${fmtNum(usdPrice.open)} · Fechamento R$ ${fmtNum(usdPrice.close)}${usdPrice.high != null ? ` · Máx R$ ${fmtNum(usdPrice.high)} · Mín R$ ${fmtNum(usdPrice.low)}` : ''}</span>`
          : '';
        retroHtml += `<div class="retro-banner ${hit ? 'retro-match' : 'retro-miss'}">
          ${hit ? '✅' : '❌'} Nesse dia, o dólar à vista de fato <b>${actualUp ? 'subiu' : 'caiu'}</b>
          (fechamento R$ ${fmtNum(usdRelease.actual_value)} vs. R$ ${fmtNum(usdRelease.previous_value)} do dia anterior) —
          ${hit ? 'bateu' : 'não bateu'} com a probabilidade histórica agregada.
          ${openCloseHtml}
        </div>`;
      } else if (actualTrend === 'flat') {
        retroHtml += `<div class="retro-banner retro-pending">O dólar à vista fechou estável nesse dia.</div>`;
      }
    } else {
      const isFuture = dateStr > todayStrBR();
      retroHtml += `<div class="retro-banner retro-pending">${isFuture ? 'Esse dia ainda não aconteceu.' : 'Sem dado de fechamento do dólar coletado pra essa data ainda (fim de semana, feriado, ou o robô ainda não rodou).'}</div>`;
    }
    retroEl.innerHTML = retroHtml;
  } catch (err) {
    console.error(err);
    head.textContent = 'Resumo do dia: não consegui carregar agora';
  }
}

function wireDailyDateNav() {
  const dayInput = document.getElementById('daySummaryDate');
  dayInput.value = todayStrBR();

  function shiftDay(delta) {
    const d = new Date(dayInput.value + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    dayInput.value = d.toISOString().slice(0, 10);
    loadDailySummary(dayInput.value);
  }

  dayInput.addEventListener('change', () => loadDailySummary(dayInput.value));
  document.getElementById('dayPrev').addEventListener('click', () => shiftDay(-1));
  document.getElementById('dayNext').addEventListener('click', () => shiftDay(1));
  document.getElementById('dayToday').addEventListener('click', () => {
    dayInput.value = todayStrBR();
    loadDailySummary(dayInput.value);
  });
}

/* ---------------- BLOCO DE NOTAS ---------------- */
let notepadTimer = null;
async function loadNotepad() {
  const area = document.getElementById('notepadArea');
  const status = document.getElementById('notepadStatus');
  const counter = document.getElementById('notepadCounter');
  try {
    const { data, error } = await supabase.from('notepad').select('content').eq('id', 1).single();
    if (error) throw error;
    area.value = data?.content || '';
    counter.textContent = `${area.value.length}/1000`;
  } catch (err) {
    console.error(err);
  }
  area.addEventListener('input', () => {
    counter.textContent = `${area.value.length}/1000`;
    status.textContent = 'digitando…';
    clearTimeout(notepadTimer);
    notepadTimer = setTimeout(async () => {
      status.textContent = 'salvando…';
      const { error } = await supabase.from('notepad').update({ content: area.value, updated_at: new Date().toISOString() }).eq('id', 1);
      status.textContent = error ? 'erro ao salvar' : 'salvo ✓';
      setTimeout(() => { if (status.textContent === 'salvo ✓') status.textContent = ''; }, 2000);
    }, 900);
  });
}

/* ---------------- CALENDÁRIO DE FERIADOS ---------------- */
function easterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(year, month, 1);
  let offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}
function lastWeekdayOfMonth(year, month, weekday) {
  const last = new Date(year, month + 1, 0);
  let offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}
function usObservedDate(date) {
  if (date.getDay() === 6) return addDays(date, -1);
  if (date.getDay() === 0) return addDays(date, 1);
  return date;
}
function dstr(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

function getHolidays(year) {
  const easter = easterDate(year);
  const goodFriday = addDays(easter, -2);
  const carnavalMon = addDays(easter, -48);
  const carnavalTue = addDays(easter, -47);
  const corpusChristi = addDays(easter, 60);

  const us = [
    { d: usObservedDate(new Date(year, 0, 1)), name: "Ano Novo" },
    { d: nthWeekdayOfMonth(year, 0, 1, 3), name: "Martin Luther King Jr." },
    { d: nthWeekdayOfMonth(year, 1, 1, 3), name: "Presidents' Day" },
    { d: goodFriday, name: "Good Friday (mercado de ações)" },
    { d: lastWeekdayOfMonth(year, 4, 1), name: "Memorial Day" },
    { d: usObservedDate(new Date(year, 5, 19)), name: "Juneteenth" },
    { d: usObservedDate(new Date(year, 6, 4)), name: "Independence Day" },
    { d: nthWeekdayOfMonth(year, 8, 1, 1), name: "Labor Day" },
    { d: nthWeekdayOfMonth(year, 10, 4, 4), name: "Thanksgiving" },
    { d: usObservedDate(new Date(year, 11, 25)), name: "Christmas" },
  ];

  const br = [
    { d: new Date(year, 0, 1), name: "Confraternização Universal" },
    { d: carnavalMon, name: "Carnaval (segunda)" },
    { d: carnavalTue, name: "Carnaval (terça)" },
    { d: goodFriday, name: "Sexta-feira Santa" },
    { d: new Date(year, 3, 21), name: "Tiradentes" },
    { d: new Date(year, 4, 1), name: "Dia do Trabalho" },
    { d: corpusChristi, name: "Corpus Christi" },
    { d: new Date(year, 8, 7), name: "Independência do Brasil" },
    { d: new Date(year, 9, 12), name: "Nossa Sr.ª Aparecida" },
    { d: new Date(year, 10, 2), name: "Finados" },
    { d: new Date(year, 10, 15), name: "Proclamação da República" },
    { d: new Date(year, 10, 20), name: "Consciência Negra" },
    { d: new Date(year, 11, 25), name: "Natal" },
  ];

  const map = {};
  us.forEach(h => { const k = dstr(h.d); (map[k] = map[k] || {}).us = h.name; });
  br.forEach(h => { const k = dstr(h.d); (map[k] = map[k] || {}).br = h.name; });
  return map;
}

let calState = new Date();
function renderHolidayCalendar() {
  const el = document.getElementById('holidayCalendar');
  const year = calState.getFullYear(), month = calState.getMonth();
  const holidays = getHolidays(year);
  const monthLabel2 = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calState);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekDayNames = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    const key = dstr(dateObj);
    const h = holidays[key];
    let cls = 'cal-cell';
    let tag = '';
    if (h?.br) { cls += ' is-br'; tag += `<span class="cal-tag br" title="${h.br}">BR</span>`; }
    if (h?.us) { cls += ' is-us'; tag += `<span class="cal-tag us" title="${h.us}">US</span>`; }
    cells += `<div class="${cls}"><span class="cal-day">${day}</span>${tag}</div>`;
  }

  el.innerHTML = `
    <div class="cal-header">
      <button class="cal-nav" id="calPrev">‹</button>
      <span class="cal-title">${monthLabel2}</span>
      <button class="cal-nav" id="calNext">›</button>
    </div>
    <div class="cal-grid cal-weekdays">${weekDayNames.map(w => `<div class="cal-wd">${w}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-legend">
      <span><span class="cal-tag br">BR</span> B3 fechada</span>
      <span><span class="cal-tag us">US</span> bolsas dos EUA fechadas</span>
    </div>`;

  document.getElementById('calPrev').addEventListener('click', () => { calState.setMonth(calState.getMonth() - 1); renderHolidayCalendar(); });
  document.getElementById('calNext').addEventListener('click', () => { calState.setMonth(calState.getMonth() + 1); renderHolidayCalendar(); });
}

document.querySelectorAll('#importanceFilter .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#importanceFilter .filter-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const min = parseInt(btn.dataset.min, 10);
    document.querySelectorAll('#indicatorsGrid .ind-card').forEach(card => {
      const imp = parseInt(card.dataset.importance || '1', 10);
      card.style.display = imp >= min ? '' : 'none';
    });
  });
});

/* ---------------- INIT ---------------- */
loadIndicators();
// loadTicker(); // removido a pedido: DXY/Treasury/Petróleo não aparecem mais no topo
loadLastUpdate();
loadTimeline();
loadOvernightNews();
loadJournal();
wireDailyDateNav();
loadDailySummary(todayStrBR());
loadNotepad();
renderHolidayCalendar();
document.getElementById('enablePushBtn').addEventListener('click', enablePush);
checkPushStatus();

/* ---------------- PWA: registra o service worker ---------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('SW falhou:', err));
  });
}
