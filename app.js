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
  const CYCLE = 360; // 3 ciclos de 120: 2 planos, 1 com o batimento (espícula de EKG)
  let t = 0;
  function heartbeatY(beat) {
    // beat vai de 0 a 120 dentro do sub-ciclo em que o batimento acontece
    if (beat < 6) return MID - beat * 0.4;                          // pequena subida (onda P)
    if (beat < 10) return MID + (beat - 6) * 2.2;                    // descida rápida
    if (beat < 15) return MID + 8.8 - (beat - 10) * 6.2;             // espícula alta (QRS)
    if (beat < 19) return MID - 22 + (beat - 15) * 8.5;              // descida abaixo da base
    if (beat < 24) return MID - 5 + (beat - 19) * 1;                 // reacomoda
    return MID;                                                       // linha reta (onda T some)
  }
  function frame() {
    let pts = [];
    for (let x = 0; x <= W; x += 4) {
      const pos = (x + t) % CYCLE;
      let y = MID;
      if (pos >= 240 && pos < 264) {
        y = heartbeatY(pos - 240);
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
// BCB_USDBRL/IBOV são referências de mercado (não indicadores). DXY/Treasury/Petróleo
// e CPI/HSP saíram do site a pedido. Usado pra filtrar qualquer lista de indicadores.
const NON_DISPLAY_CODES = ['BCB_USDBRL', 'IBOV', 'DTWEXBGS', 'DGS10', 'DCOILWTICO', 'CPIAUCSL', 'HOUST', 'PERMIT'];

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
function confidenceLabel(sampleSize, level) {
  const lvl = level || (sampleSize >= 30 ? 'alta' : sampleSize >= 12 ? 'media' : 'baixa');
  if (lvl === 'alta') return { text: 'Confiança alta', cls: 'conf-high' };
  if (lvl === 'media') return { text: 'Confiança média', cls: 'conf-mid' };
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
/* ---------------- CALENDAR / TIMELINE PANEL ---------------- */
async function loadTimeline() {
  const list = document.getElementById('calendarList');
  try {
    const { data: indicators } = await supabase.from('indicators').select('id,code,name_pt,country');
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

    // Séries contínuas (ex: Selic, taxas do BCE) ficam disponíveis todo dia mesmo sem
    // uma divulgação nova de verdade — só mostra quando o valor realmente mudou.
    // Também tira o dólar/Ibovespa/tickers e séries sem evento de divulgação real
    // (esses já aparecem no card de abertura/fechamento, não são "indicador econômico").
    const NON_INDICATOR_CODES = ['BCB_USDBRL', 'IBOV', 'DTWEXBGS', 'DGS10', 'DCOILWTICO', 'DFF', 'ECBMRRFR', 'ECBDFR'];
    const indMapPre = {};
    (indicators || []).forEach(i => indMapPre[i.id] = i);
    const changedReleases = releases.filter(rel => {
      const code = indMapPre[rel.indicator_id]?.code;
      if (code && NON_INDICATOR_CODES.includes(code)) return false;
      return rel.previous_value === null || rel.actual_value !== rel.previous_value;
    });

    if (changedReleases.length === 0) {
      list.innerHTML = '<p class="empty-note">Nenhuma divulgação registrada ainda.</p>';
      return;
    }

    const indMap = {};
    (indicators || []).forEach(i => indMap[i.id] = i);

    let html = '';
    let currentDay = '';
    changedReleases.forEach(rel => {
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
            <div class="tl-vals">Atual: ${fmtNum(rel.actual_value)} <span style="opacity:.6">· Anterior: ${fmtNum(rel.previous_value)}</span></div>
          </div>
        </div>`;
    });
    list.innerHTML = html;
  } catch (err) {
    console.error(err);
    list.innerHTML = '<p class="empty-note">Não consegui carregar o histórico agora.</p>';
  }
}

/* ---------------- RADAR: NOTÍCIAS DE MERCADO (24H) ---------------- */
const BREAKING_KEYWORDS = [
  'atentado', 'morte', 'morreu', 'faleceu', 'guerra', 'ataque', 'acidente', 'renúncia', 'renuncia',
  'golpe', 'declaração de guerra', 'terremoto', 'tsunami', 'crise', 'assassinato', 'explosão', 'explosao',
  'incêndio', 'incendio', 'sequestro', 'rendição', 'rendicao', 'anúncio emergencial', 'anuncio emergencial',
  'colapso', 'pânico', 'panico',
];
function isBreaking(title) {
  const t = title.toLowerCase();
  return BREAKING_KEYWORDS.some(k => t.includes(k));
}

function renderNews() {
  const list = document.getElementById('newsList');
  if (newsCache.length === 0) {
    list.innerHTML = '<p class="empty-note">Nenhuma notícia registrada ainda. O robô roda de hora em hora — se acabou de configurar, rode-o manualmente no GitHub Actions.</p>';
    return;
  }

  list.innerHTML = newsCache.map(n => {
    const newsDate = new Date(n.published_at);
    const isToday = newsDate.toDateString() === new Date().toDateString();
    const diffMins = Math.round((Date.now() - newsDate.getTime()) / 60000);
    let time;
    if (diffMins >= 0 && diffMins < 60) {
      time = `há ${Math.max(1, diffMins)} min`;
    } else {
      time = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
        ...(isToday ? {} : { day: '2-digit', month: '2-digit' }),
      }).format(newsDate);
    }
    const breaking = isBreaking(n.title);
    return `
      <a class="news-row ${breaking ? 'is-breaking' : ''}" href="${n.url}" target="_blank" rel="noopener">
        <span class="news-time">${time}</span>
        <div class="news-body">
          <div class="news-title">${breaking ? '<span class="breaking-tag">BREAKING</span> ' : ''}${n.title}</div>
          <div class="news-source">${n.source}</div>
        </div>
      </a>`;
  }).join('');
}

let newsCache = [];

async function loadOvernightNews() {
  const list = document.getElementById('newsList');
  try {
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .eq('region', 'radar')
      .order('published_at', { ascending: false })
      .limit(60);
    if (error) throw error;

    if (!data || data.length === 0) {
      list.innerHTML = '<p class="empty-note">Nenhuma notícia registrada ainda. O robô roda de hora em hora — se acabou de configurar, rode-o manualmente no GitHub Actions.</p>';
      return;
    }

    newsCache = data;
    renderNews();
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

function renderTodayProbCard(aggProbUsd, aggProbIbov, nUsd, nIbov) {
  const el = document.getElementById('todayProbCard');
  if (!el) return;

  const arrowUp = `<svg class="prob-icon" viewBox="0 0 24 24" fill="none"><path d="M12 4L20 16H4L12 4Z" fill="currentColor"/></svg>`;
  const arrowDown = `<svg class="prob-icon" viewBox="0 0 24 24" fill="none"><path d="M12 20L4 8H20L12 20Z" fill="currentColor"/></svg>`;

  function confLabel(n) {
    if (!n) return null;
    if (n >= 30) return 'Alta';
    if (n >= 10) return 'Média';
    return 'Baixa';
  }

  function block(assetLabel, pctUp, n) {
    if (pctUp === null || pctUp === undefined) {
      return `<div class="prob-block"><span class="prob-asset">${assetLabel}</span><span class="prob-empty">sem dado suficiente pra hoje</span></div>`;
    }
    const pctDown = Math.round((100 - pctUp) * 10) / 10;
    const conf = confLabel(n);
    return `
      <div class="prob-block">
        <span class="prob-asset">${assetLabel}</span>
        <div class="prob-line prob-up">
          <span class="prob-label">Alta</span><span class="prob-value">${pctUp}%</span>${arrowUp}
        </div>
        <div class="prob-bar-track"><div class="prob-bar-fill prob-bar-up" style="width:${pctUp}%"></div></div>
        <div class="prob-line prob-down">
          <span class="prob-label">Baixa</span><span class="prob-value">${pctDown}%</span>${arrowDown}
        </div>
        <div class="prob-bar-track"><div class="prob-bar-fill prob-bar-down" style="width:${pctDown}%"></div></div>
        ${conf ? `<div class="prob-meta">Confiança: <b>${conf}</b> · ${n} evento(s) histórico(s)</div>` : ''}
      </div>`;
  }

  el.innerHTML = `
    <div class="prob-card-head">Probabilidades para o dia</div>
    <div class="prob-blocks">
      ${block('Mini Dólar (WDO)', aggProbUsd, nUsd)}
      ${block('Mini Índice (WIN)', aggProbIbov, nIbov)}
    </div>
    <p class="prob-warning">⚠️ Isso não é recomendação de operação, é estatística histórica.</p>`;
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
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(dateStr + 'T12:00:00'));

  retroEl.innerHTML = '';
  itemsEl.innerHTML = '<p class="stats-empty">Carregando…</p>';
  head.textContent = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  try {
    // Dólar à vista pra essa data: busca e mostra sempre, não depende de ter
    // indicador econômico agendado no mesmo dia (antes ficava preso a isso).
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

    const { data: scheduled, error } = await supabase
      .from('release_schedule')
      .select('indicator_id')
      .eq('release_date', dateStr);
    if (error) throw error;

    let aggProb = null, aggProbIbov = null, weightTotal = 0, weightTotalIbov = 0;

    if (!scheduled || scheduled.length === 0) {
      itemsEl.innerHTML = '<p class="stats-empty">Sem divulgações agendadas dos indicadores que acompanhamos nessa data, pelo calendário do FRED. Use as setas pra navegar por outras datas.</p>';
    } else {
      const ids = scheduled.map(s => s.indicator_id);
      const { data: indicatorsRaw } = await supabase.from('indicators').select('*').in('id', ids);
      const indicators = (indicatorsRaw || []).filter(i => !NON_DISPLAY_CODES.includes(i.code));

      if (indicators.length === 0) {
        itemsEl.innerHTML = '<p class="stats-empty">Sem divulgações agendadas dos indicadores que acompanhamos nessa data, pelo calendário do FRED. Use as setas pra navegar por outras datas.</p>';
      } else {
        const { data: statsRows } = await supabase.from('indicator_stats').select('*').in('indicator_id', indicators.map(i => i.id));
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

        let weightedSum = 0, weightedSumIbov = 0;
        itemsEl.innerHTML = sorted.map(ind => {
          const s = statsMap[ind.id];
          const flag = countryFlag(ind.country);
          const time = ind.typical_time_brt ? ` · por volta das ${ind.typical_time_brt}` : '';
          const rel = releaseByIndicator[ind.id];
          const fetchedDateBR = rel && rel.fetched_at
            ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(rel.fetched_at))
            : null;
          const releasedToday = !!(fetchedDateBR && fetchedDateBR === dateStr);
          const trend = rel ? trendClass(rel.actual_value, rel.previous_value) : 'flat';

          if (s && (s.sample_size || 0) >= 5) {
            // Se já sabemos a tendência do último valor (subiu/desceu), usa o cenário
            // certo. Se não sabemos ainda (ainda não saiu, ou é uma série que raramente
            // muda dia a dia, tipo taxa de juros fixa) — média dos dois cenários, em vez
            // de descartar o indicador inteiro do card de cima. Corrigido em 27/07/2026:
            // antes, indicadores como "Taxa de Juros do Fed" tinham o cálculo detalhado
            // certinho na lista de baixo, mas sumiam do card agregado por causa disso.
            let prob, probIbov;
            if (trend === 'up') {
              prob = s.pct_usd_up_after_indicator_up;
              probIbov = s.pct_ibov_up_after_indicator_up;
            } else if (trend === 'down') {
              prob = s.pct_usd_up_after_indicator_down;
              probIbov = s.pct_ibov_up_after_indicator_down;
            } else {
              const pUp = s.pct_usd_up_after_indicator_up, pDown = s.pct_usd_up_after_indicator_down;
              prob = (pUp !== null && pUp !== undefined && pDown !== null && pDown !== undefined) ? (pUp + pDown) / 2 : (pUp ?? pDown);
              const pUpI = s.pct_ibov_up_after_indicator_up, pDownI = s.pct_ibov_up_after_indicator_down;
              probIbov = (pUpI !== null && pUpI !== undefined && pDownI !== null && pDownI !== undefined) ? (pUpI + pDownI) / 2 : (pUpI ?? pDownI);
            }
            if (prob !== null && prob !== undefined) {
              weightedSum += prob * s.sample_size;
              weightTotal += s.sample_size;
            }
            if (probIbov !== null && probIbov !== undefined) {
              weightedSumIbov += probIbov * s.sample_size;
              weightTotalIbov += s.sample_size;
            }
          }

          let scenarios;
          if (releasedToday && s && trend !== 'flat') {
            // Já saiu hoje: mostra só o cenário que de fato aconteceu, resolvido.
            const ciUsd = trend === 'up' ? s.confidence?.usd_up : s.confidence?.usd_down;
            const ciIbov = trend === 'up' ? s.confidence?.ibov_up : s.confidence?.ibov_down;
            const pctUsd = trend === 'up' ? s.pct_usd_up_after_indicator_up : s.pct_usd_up_after_indicator_down;
            const pctIbov = trend === 'up' ? s.pct_ibov_up_after_indicator_up : s.pct_ibov_up_after_indicator_down;
            scenarios =
              `<span class="conf-badge released-badge">✅ Saiu: veio ${trend === 'up' ? 'ACIMA' : 'ABAIXO'} do anterior (${fmtNum(rel.actual_value)} vs. ${fmtNum(rel.previous_value)})</span>` +
              scenarioLine(`Nova leitura pra hoje`, pctUsd, pctIbov, ciUsd, ciIbov);
          } else if (releasedToday && (!s || trend === 'flat')) {
            scenarios = `<span class="conf-badge released-badge">✅ Saiu hoje (${fmtNum(rel.actual_value)}), sem variação relevante ou sem amostra histórica.</span>`;
          } else {
            scenarios = s
              ? `<span class="conf-badge ${confidenceLabel(s.sample_size, s.confidence?.usd_up?.level).cls}">⏳ Ainda não saiu · ${confidenceLabel(s.sample_size, s.confidence?.usd_up?.level).text} · ${s.sample_size} divulgações</span>` +
                scenarioLine('Se vier ACIMA do anterior', s.pct_usd_up_after_indicator_up, s.pct_ibov_up_after_indicator_up, s.confidence?.usd_up, s.confidence?.ibov_up) +
                scenarioLine('Se vier ABAIXO do anterior', s.pct_usd_up_after_indicator_down, s.pct_ibov_up_after_indicator_down, s.confidence?.usd_down, s.confidence?.ibov_down)
              : '<p class="stats-empty">⏳ Ainda não saiu · sem amostra histórica suficiente ainda.</p>';
          }
          return `
            <div class="summary-item">
              <div class="summary-item-head">${flag} <b>${ind.name_pt}</b> ${importanceBadge(ind.importance)}${time}</div>
              ${scenarios}
            </div>`;
        }).filter((_, idx) => (sorted[idx].importance || 1) >= 2).join('') || '<p class="stats-empty">Só indicadores de baixa relevância hoje — nada de média/alta pra mostrar.</p>';

        aggProb = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : null;
        aggProbIbov = weightTotalIbov > 0 ? Math.round(weightedSumIbov / weightTotalIbov) : null;
      }
    }

    renderTodayProbCard(aggProb, aggProbIbov, weightTotal, weightTotalIbov);

    // Card do dólar à vista: mostra sempre que houver candle pra essa data,
    // com selo de acerto/erro só quando dá pra comparar com uma probabilidade do dia.
    let retroHtml = '';
    if (usdPrice && usdPrice.open != null) {
      const priceGrid = `<p class="price-grid-label">Dólar à vista (USD/BRL) — referência de mercado, não é a cotação do contrato futuro WDO</p>
        <div class="price-grid">
          <div class="price-item"><span class="price-label">Abertura</span><span class="price-value">R$ ${fmtNum(usdPrice.open)}</span></div>
          <div class="price-item"><span class="price-label">Fechamento</span><span class="price-value">R$ ${fmtNum(usdPrice.close)}</span></div>
          <div class="price-item"><span class="price-label">Máxima</span><span class="price-value">R$ ${fmtNum(usdPrice.high)}</span></div>
          <div class="price-item"><span class="price-label">Mínima</span><span class="price-value">R$ ${fmtNum(usdPrice.low)}</span></div>
        </div>`;

      let bannerClass = 'retro-pending';
      if (usdRelease && aggProb !== null) {
        const actualTrend = trendClass(usdRelease.actual_value, usdRelease.previous_value);
        if (actualTrend !== 'flat') {
          const predictedUp = aggProb >= 50;
          const actualUp = actualTrend === 'up';
          bannerClass = predictedUp === actualUp ? 'retro-match' : 'retro-miss';
        }
      }
      retroHtml = `<div class="retro-banner ${bannerClass}">${priceGrid}</div>`;
    } else {
      const isFuture = dateStr > todayStrBR();
      retroHtml = `<div class="retro-banner retro-pending">${isFuture ? 'Esse dia ainda não aconteceu.' : 'Sem candle do dólar à vista coletado pra essa data (fim de semana, feriado, ou o robô ainda não rodou).'}</div>`;
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
  const todayKey = dstr(new Date());
  for (let i = 0; i < firstDay; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    const key = dstr(dateObj);
    const h = holidays[key];
    let cls = 'cal-cell';
    if (key === todayKey) cls += ' is-today';
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

/* ---------------- ATUALIZAR DADOS (colar manual) ---------------- */
async function sendIngest(body, resultElId, btnEl) {
  const resultEl = document.getElementById(resultElId);
  const originalLabel = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = 'Processando...';
  resultEl.textContent = '';
  try {
    const res = await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      resultEl.textContent = `❌ Erro: ${data.error || res.statusText}`;
    } else {
      resultEl.textContent = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    resultEl.textContent = `❌ Falha de rede: ${err.message}`;
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = originalLabel;
  }
}

function wireIngestPanel() {
  const passwordEl = document.getElementById('ingestPassword');

  const calBtn = document.getElementById('ingestCalendarBtn');
  calBtn.addEventListener('click', () => {
    const text = document.getElementById('ingestCalendarText').value;
    sendIngest({ password: passwordEl.value, type: 'calendar', text }, 'ingestCalendarResult', calBtn);
  });

  const wdoBtn = document.getElementById('ingestWdoBtn');
  wdoBtn.addEventListener('click', () => {
    const text = document.getElementById('ingestWdoText').value;
    sendIngest({ password: passwordEl.value, type: 'price', asset: 'WDO', text }, 'ingestWdoResult', wdoBtn);
  });

  const winBtn = document.getElementById('ingestWinBtn');
  winBtn.addEventListener('click', () => {
    const text = document.getElementById('ingestWinText').value;
    sendIngest({ password: passwordEl.value, type: 'price', asset: 'WIN', text }, 'ingestWinResult', winBtn);
  });
}

/* ---------------- INIT ---------------- */
// loadTicker(); // removido a pedido: DXY/Treasury/Petróleo não aparecem mais no topo
loadLastUpdate();
loadTimeline();
loadOvernightNews();
setInterval(loadOvernightNews, 5 * 60 * 1000); // atualiza sozinho a cada 5 min
wireDailyDateNav();
loadDailySummary(todayStrBR());
renderHolidayCalendar();
document.getElementById('enablePushBtn').addEventListener('click', enablePush);
checkPushStatus();
wireIngestPanel();

/* ---------------- PWA: registra o service worker ---------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('SW falhou:', err));
  });
}
