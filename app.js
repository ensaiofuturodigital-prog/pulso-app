import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public anon key — safe to expose client-side by design.
// NOTE: RLS is currently disabled on these tables (personal single-user project).
// Before sharing this app or adding real accounts, add row-level policies.
const SUPABASE_URL = 'https://iinbwtontwsxrkahenlo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpbmJ3dG9udHdzeHJrYWhlbmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMDcwMDEsImV4cCI6MjA5ODU4MzAwMX0.Ja04-sJ0WxCnl-SVuYgTgUv_wsat7bcSrpnT_dZu1fs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  // en-CA formata como YYYY-MM-DD, o mesmo formato que o banco usa
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/* ---------------- INDICATORS PANEL ---------------- */
async function loadIndicators() {
  const grid = document.getElementById('indicatorsGrid');
  try {
    const { data: indicators, error: indErr } = await supabase
      .from('indicators')
      .select('*')
      .order('name_pt');
    if (indErr) throw indErr;

    if (!indicators || indicators.length === 0) {
      grid.innerHTML = '<p class="empty-note">Nenhum indicador ainda. O robô de coleta roda todo dia às 9h — se acabou de configurar, rode-o manualmente no GitHub Actions.</p>';
      return;
    }

    const { data: releases, error: relErr } = await supabase
      .from('indicator_releases')
      .select('*')
      .order('release_date', { ascending: false });
    if (relErr) throw relErr;

    grid.innerHTML = '';
    indicators.forEach(ind => {
      const rel = releases.find(r => r.indicator_id === ind.id);
      const card = document.createElement('div');
      card.className = 'ind-card';

      if (!rel) {
        card.innerHTML = `
          <div class="ind-card-top">
            <div><div class="ind-name">${ind.name_pt}</div><div class="ind-code">${ind.code}</div></div>
          </div>
          <p class="ind-desc">${ind.description_pt || ''}</p>
          <p class="ind-date">Sem divulgação registrada ainda</p>`;
        grid.appendChild(card);
        return;
      }

      const trend = trendClass(rel.actual_value, rel.previous_value);
      const mag = pctMagnitude(rel.actual_value, rel.previous_value);
      const badgeText = trend === 'up' ? '▲ subiu' : trend === 'down' ? '▼ caiu' : '— estável';

      card.innerHTML = `
        <div class="ind-card-top">
          <div><div class="ind-name">${ind.name_pt}</div><div class="ind-code">${ind.code} · ${ind.frequency || ''}</div></div>
          <span class="ind-badge ${trend}">${badgeText}</span>
        </div>
        <div class="ind-values">
          <span class="ind-value">${fmtNum(rel.actual_value)}</span>
          <span class="ind-prev">ant. ${fmtNum(rel.previous_value)}</span>
        </div>
        <div class="pulse-bar"><div class="pulse-bar-fill ${trend}" style="width:${mag}%"></div></div>
        <p class="ind-desc">${ind.description_pt || ''}</p>
        <p class="ind-date">Divulgado em ${fmtDate(rel.release_date)}</p>`;
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
    const { data: indicators } = await supabase.from('indicators').select('id,name_pt');
    const { data: releases, error } = await supabase
      .from('indicator_releases')
      .select('*')
      .order('release_date', { ascending: false })
      .limit(40);
    if (error) throw error;

    if (!releases || releases.length === 0) {
      list.innerHTML = '<p class="empty-note">Nenhuma divulgação registrada ainda.</p>';
      return;
    }

    const nameMap = {};
    (indicators || []).forEach(i => nameMap[i.id] = i.name_pt);

    let html = '';
    let currentMonth = '';
    releases.forEach(rel => {
      const m = monthLabel(rel.release_date);
      if (m !== currentMonth) {
        html += `<div class="tl-month">${m}</div>`;
        currentMonth = m;
      }
      const trend = trendClass(rel.actual_value, rel.previous_value);
      html += `
        <div class="tl-row">
          <span class="tl-date">${fmtDate(rel.release_date)}</span>
          <span class="tl-dot ${trend}"></span>
          <div class="tl-body">
            <div class="tl-name">${nameMap[rel.indicator_id] || 'Indicador'}</div>
            <div class="tl-vals">${fmtNum(rel.actual_value)} <span style="opacity:.6">(ant. ${fmtNum(rel.previous_value)})</span></div>
          </div>
        </div>`;
    });
    list.innerHTML = html;
  } catch (err) {
    console.error(err);
    list.innerHTML = '<p class="empty-note">Não consegui carregar o histórico agora.</p>';
  }
}

/* ---------------- RESUMO DO DIA ---------------- */
// Séries que representam o próprio mercado (não são "sinal" — são o alvo que
// medimos). Ficam de fora da lista de indicadores do dia.
const MARKET_CODES = ['BCB_USDBRL', 'IBOV'];

async function loadDaySummary(dateStr) {
  const box = document.getElementById('daySummaryContent');
  box.innerHTML = '<div class="skeleton-card"></div>';
  try {
    const { data: indicators, error: indErr } = await supabase.from('indicators').select('*');
    if (indErr) throw indErr;
    const indMap = {};
    (indicators || []).forEach(i => indMap[i.id] = i);
    const signalIds = new Set((indicators || []).filter(i => !MARKET_CODES.includes(i.code)).map(i => i.id));

    const { data: releases, error: relErr } = await supabase
      .from('indicator_releases')
      .select('*')
      .eq('release_date', dateStr);
    if (relErr) throw relErr;

    const dayReleases = (releases || []).filter(r => signalIds.has(r.indicator_id));

    let statsMap = {};
    try {
      const { data: stats } = await supabase.from('indicator_stats').select('*');
      (stats || []).forEach(s => statsMap[s.indicator_id] = s);
    } catch { /* tabela pode ainda não existir — segue sem estatística */ }

    const usdInd = (indicators || []).find(i => i.code === 'BCB_USDBRL');
    const usdRelease = usdInd ? (releases || []).find(r => r.indicator_id === usdInd.id) || null : null;

    renderDaySummary(dateStr, dayReleases, indMap, statsMap, usdRelease);
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p class="empty-note">Não consegui carregar o resumo desse dia.</p>';
  }
}

function renderDaySummary(dateStr, dayReleases, indMap, statsMap, usdRelease) {
  const box = document.getElementById('daySummaryContent');

  if (dayReleases.length === 0) {
    box.innerHTML = `<div class="empty-state">
      <h3>Nenhum indicador divulgado nesse dia</h3>
      <p>Tente outra data — divulgações concentram em dias úteis, geralmente no início/meio do mês. Use as setas pra navegar rápido.</p>
    </div>`;
    return;
  }

  let weightedSum = 0, weightTotal = 0;
  const rowsHtml = dayReleases.map(r => {
    const ind = indMap[r.indicator_id];
    const trend = trendClass(r.actual_value, r.previous_value);
    const stat = statsMap[r.indicator_id];
    let prob = null, sample = 0;
    if (stat && trend !== 'flat') {
      prob = trend === 'up' ? stat.pct_usd_up_after_indicator_up : stat.pct_usd_up_after_indicator_down;
      sample = stat.sample_size || 0;
    }
    if (prob !== null && sample >= 5) { weightedSum += prob * sample; weightTotal += sample; }

    const probText = (prob !== null && sample >= 5)
      ? `Historicamente, o USD sobe em <strong>${prob}%</strong> dos casos após esse padrão (amostra: ${sample} divulgações)`
      : 'Amostra histórica ainda insuficiente pra esse indicador';

    return `<div class="day-ind-row">
      <span class="tl-dot ${trend}"></span>
      <div class="day-ind-body">
        <div class="tl-name">${ind ? ind.name_pt : 'Indicador'}</div>
        <div class="ind-values" style="margin:2px 0 4px">
          <span class="ind-value" style="font-size:15px">${fmtNum(r.actual_value)}</span>
          <span class="ind-prev">ant. ${fmtNum(r.previous_value)}</span>
        </div>
        <div class="day-ind-prob">${probText}</div>
      </div>
    </div>`;
  }).join('');

  const aggProb = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : null;

  const aggHtml = aggProb !== null
    ? `<div class="day-agg-card">
        <div class="day-agg-value ${aggProb >= 50 ? 'pos' : 'neg'}">${aggProb}%</div>
        <div class="day-agg-label">probabilidade histórica agregada de <strong>alta do dólar</strong> nesse dia, combinando ${dayReleases.length} indicador(es). Isso é estatística do passado — não uma previsão.</div>
      </div>`
    : `<div class="day-agg-card"><div class="day-agg-label">Amostra histórica ainda insuficiente pra agregar uma probabilidade confiável nesse dia.</div></div>`;

  let retroHtml = '';
  if (usdRelease) {
    const actualTrend = trendClass(usdRelease.actual_value, usdRelease.previous_value);
    if (actualTrend !== 'flat' && aggProb !== null) {
      const predictedUp = aggProb >= 50;
      const actualUp = actualTrend === 'up';
      const hit = predictedUp === actualUp;
      retroHtml = `<div class="retro-banner ${hit ? 'retro-match' : 'retro-miss'}">
        ${hit ? '✅' : '❌'} Nesse dia, o dólar de fato <strong>${actualUp ? 'subiu' : 'caiu'}</strong>
        (${fmtNum(usdRelease.actual_value)} vs. ${fmtNum(usdRelease.previous_value)}) —
        ${hit ? 'bateu com a probabilidade histórica agregada.' : 'não bateu com a probabilidade histórica agregada.'}
      </div>`;
    } else if (actualTrend === 'flat') {
      retroHtml = `<div class="retro-banner retro-pending">O dólar fechou estável nesse dia.</div>`;
    }
  } else {
    const isFuture = dateStr > todayStrBR();
    retroHtml = `<div class="retro-banner retro-pending">${isFuture ? 'Esse dia ainda não aconteceu.' : 'Sem dado de fechamento do dólar coletado pra essa data ainda (pode ser fim de semana, feriado, ou o robô ainda não rodou).'}</div>`;
  }

  box.innerHTML = aggHtml + retroHtml + `<div class="day-ind-list">${rowsHtml}</div>`;
}

function wireDayNav() {
  const dayInput = document.getElementById('daySummaryDate');
  dayInput.value = todayStrBR();

  function shiftDay(delta) {
    const d = new Date(dayInput.value + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    dayInput.value = d.toISOString().slice(0, 10);
    loadDaySummary(dayInput.value);
  }

  dayInput.addEventListener('change', () => loadDaySummary(dayInput.value));
  document.getElementById('dayPrev').addEventListener('click', () => shiftDay(-1));
  document.getElementById('dayNext').addEventListener('click', () => shiftDay(1));
  document.getElementById('dayToday').addEventListener('click', () => {
    dayInput.value = todayStrBR();
    loadDaySummary(dayInput.value);
  });
}

/* ---------------- RADAR (geopolítico + notícias overnight) ---------------- */
async function loadRadar() {
  const box = document.getElementById('radarContent');
  const labelMap = { GEO_BRASIL: 'Brasil', GEO_EUA: 'EUA', GEO_ZONA_EURO: 'Zona do Euro' };
  try {
    const { data, error } = await supabase
      .from('correlated_assets')
      .select('*')
      .like('asset_code', 'GEO_%')
      .order('ts', { ascending: false });
    if (error) throw error;

    const latestByCode = {};
    (data || []).forEach(r => { if (!latestByCode[r.asset_code]) latestByCode[r.asset_code] = r; });
    const codes = Object.keys(latestByCode);

    let html = '';
    if (codes.length === 0) {
      html = `<div class="empty-state">
        <h3>Ainda sem sinal</h3>
        <p>A coleta do radar geopolítico roda automaticamente todo dia. Se acabou de configurar, rode o workflow "fetch-geo" manualmente no GitHub Actions pra popular a primeira leitura.</p>
      </div>`;
    } else {
      html += '<div class="card-grid">' + codes.map(code => {
        const r = latestByCode[code];
        const val = Math.round(r.value);
        const level = val >= 60 ? 'risk-high' : val >= 30 ? 'risk-mid' : 'risk-low';
        return `<div class="ind-card">
          <div class="ind-card-top"><div class="ind-name">${labelMap[code] || code}</div></div>
          <div class="pulse-bar"><div class="pulse-bar-fill ${level}" style="width:${val}%"></div></div>
          <p class="ind-desc">Nível de tensão: <strong>${val}/100</strong>, baseado em manchetes recentes (proxy, não é medição oficial).</p>
        </div>`;
      }).join('') + '</div>';
    }

    const { data: news } = await supabase
      .from('news').select('*').eq('region', 'overnight')
      .order('published_at', { ascending: false }).limit(15);

    if (news && news.length > 0) {
      html += '<h2 class="section-subhead">Enquanto o Brasil dormia</h2><div class="journal-list">' +
        news.map(n => `
          <div class="j-row">
            <div class="j-info">
              <div class="j-reason"><a href="${n.url}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${n.title}</a></div>
              <div class="j-time">${n.source}</div>
            </div>
          </div>`).join('') + '</div>';
    }

    box.innerHTML = html;
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p class="empty-note">Não consegui carregar o radar agora.</p>';
  }
}

/* ---------------- UPCOMING (próximos eventos) ---------------- */
async function loadUpcoming() {
  const box = document.getElementById('upcomingList');
  try {
    const today = todayStrBR();
    const { data: schedule, error } = await supabase
      .from('release_schedule')
      .select('*')
      .gte('release_date', today)
      .order('release_date', { ascending: true })
      .limit(30);
    if (error) throw error;

    if (!schedule || schedule.length === 0) {
      box.innerHTML = '<p class="empty-note">Nenhum evento futuro agendado ainda — rode o workflow "fetch-release-calendar" no GitHub Actions.</p>';
      return;
    }

    const { data: indicators } = await supabase.from('indicators').select('id,name_pt');
    const nameMap = {};
    (indicators || []).forEach(i => nameMap[i.id] = i.name_pt);

    box.innerHTML = schedule.map(s => `
      <div class="tl-row">
        <span class="tl-date">${fmtDate(s.release_date)}</span>
        <span class="upcoming-badge">agendado</span>
        <div class="tl-body"><div class="tl-name">${nameMap[s.indicator_id] || 'Indicador'}</div></div>
      </div>`).join('');
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p class="empty-note">Não consegui carregar a agenda futura agora.</p>';
  }
}

/* ---------------- TRADE JOURNAL ---------------- */
const form = document.getElementById('tradeForm');
const statusEl = document.getElementById('formStatus');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = 'Salvando…';

  const payload = {
    asset: document.getElementById('tf-asset').value,
    trade_time: new Date(document.getElementById('tf-time').value).toISOString(),
    entry_reason: document.getElementById('tf-reason').value || null,
    result: document.getElementById('tf-result').value ? parseFloat(document.getElementById('tf-result').value) : null,
    notes: document.getElementById('tf-notes').value || null,
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
  const el = document.getElementById('tf-time');
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  el.value = now.toISOString().slice(0, 16);
})();

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
      const time = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t.trade_time));
      return `
        <div class="j-row">
          <span class="j-asset">${t.asset}</span>
          <div class="j-info">
            <div class="j-reason">${t.entry_reason || 'Sem descrição'}</div>
            <div class="j-time">${time}</div>
          </div>
          <span class="j-result ${rClass}">${r === null ? '—' : (r >= 0 ? '+' : '') + fmtNum(r)}</span>
        </div>`;
    }).join('');
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<p class="empty-note">Não consegui carregar o diário agora.</p>';
  }
}

/* ---------------- INIT ---------------- */
loadIndicators();
loadTimeline();
loadJournal();
wireDayNav();
loadDaySummary(todayStrBR());
loadRadar();
loadUpcoming();
