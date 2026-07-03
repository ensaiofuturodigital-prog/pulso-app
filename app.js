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
