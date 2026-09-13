import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Mesma lógica de agregação usada no Painel do dia (app.js / loadDailySummary),
// resumida pra formato de mensagem de texto do Telegram.

function todayStrBRT() {
  // Roda às 09:00 UTC (06:00 Brasília) — subtrai 3h pra pegar a data certa em Brasília.
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

function fmtDateLabel(dateStr) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(dateStr + 'T12:00:00'));
}

function trendClass(actual, previous) {
  if (previous === null || previous === undefined || actual === previous) return 'flat';
  return actual > previous ? 'up' : 'down';
}

// --- Feriados nacionais do Brasil (mesma lógica do calendário no app.js) ---
// Datas móveis (Carnaval, Corpus Christi) calculadas a partir da Páscoa.
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
function dstr(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

function isBrHoliday(dateStr) {
  const year = parseInt(dateStr.slice(0, 4), 10);
  const easter = easterDate(year);
  const goodFriday = addDays(easter, -2);
  const carnavalMon = addDays(easter, -48);
  const carnavalTue = addDays(easter, -47);
  const corpusChristi = addDays(easter, 60);
  const brHolidays = [
    new Date(year, 0, 1),   // Confraternização Universal
    carnavalMon,
    carnavalTue,
    goodFriday,
    new Date(year, 3, 21),  // Tiradentes
    new Date(year, 4, 1),   // Dia do Trabalho
    corpusChristi,
    new Date(year, 8, 7),   // Independência do Brasil
    new Date(year, 9, 12),  // Nossa Sr.ª Aparecida
    new Date(year, 10, 2),  // Finados
    new Date(year, 10, 15), // Proclamação da República
    new Date(year, 10, 20), // Consciência Negra
    new Date(year, 11, 25), // Natal
  ];
  return brHolidays.some(h => dstr(h) === dateStr);
}

// Fim de semana ou feriado nacional = B3 fechada, sem dado econômico novo pra divulgar.
function isNonTradingDay(dateStr) {
  const weekday = new Date(dateStr + 'T12:00:00Z').getUTCDay(); // 0=domingo, 6=sábado
  if (weekday === 0 || weekday === 6) return true;
  return isBrHoliday(dateStr);
}

async function applyBaseline(dateStr) {
  const weekday = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  const { data: baseRows } = await supabase.from('baseline_stats').select('*').in('asset', ['WDO', 'WIN']);
  const pick = (asset) => {
    const rows = (baseRows || []).filter(r => r.asset === asset);
    return rows.find(r => r.weekday === weekday) || rows.find(r => r.weekday === null) || null;
  };
  const wdoBase = pick('WDO');
  const winBase = pick('WIN');
  return {
    aggProb: wdoBase ? Math.round(wdoBase.pct_up) : null,
    weightTotal: wdoBase ? wdoBase.sample_size : 0,
    aggProbIbov: winBase ? Math.round(winBase.pct_up) : null,
    weightTotalIbov: winBase ? winBase.sample_size : 0,
    isBaseline: true,
  };
}

async function buildReport() {
  const dateStr = todayStrBRT();

  const { data: scheduled, error } = await supabase
    .from('release_schedule')
    .select('indicator_id')
    .eq('release_date', dateStr);
  if (error) throw error;

  let aggProb = null, aggProbIbov = null, weightTotal = 0, weightTotalIbov = 0;

  if (!scheduled || scheduled.length === 0) {
    const base = await applyBaseline(dateStr);
    aggProb = base.aggProb; aggProbIbov = base.aggProbIbov;
    weightTotal = base.weightTotal; weightTotalIbov = base.weightTotalIbov;
  } else {
    const ids = scheduled.map(s => s.indicator_id);
    const { data: indicatorsRaw } = await supabase.from('indicators').select('*').in('id', ids);
    const indicators = (indicatorsRaw || []);

    if (indicators.length === 0) {
      const base = await applyBaseline(dateStr);
      aggProb = base.aggProb; aggProbIbov = base.aggProbIbov;
      weightTotal = base.weightTotal; weightTotalIbov = base.weightTotalIbov;
    } else {
      const { data: statsRows } = await supabase.from('indicator_stats').select('*').in('indicator_id', ids);
      const statsMap = {};
      (statsRows || []).forEach(s => statsMap[s.indicator_id] = s);

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

      const sorted = indicators.sort((a, b) => (b.importance || 1) - (a.importance || 1));
      let weightedSum = 0, weightedSumIbov = 0;

      for (const ind of sorted) {
        const s = statsMap[ind.id];
        const rel = releaseByIndicator[ind.id];
        const trend = rel ? trendClass(rel.actual_value, rel.previous_value) : 'flat';

        if (s && (s.sample_size || 0) >= 5) {
          let prob, probIbov;
          if (trend === 'up') {
            prob = s.pct_usd_up_after_indicator_up;
            probIbov = s.pct_ibov_up_after_indicator_up;
          } else if (trend === 'down') {
            prob = s.pct_usd_up_after_indicator_down;
            probIbov = s.pct_ibov_up_after_indicator_down;
          } else {
            const pUp = s.pct_usd_up_after_indicator_up, pDown = s.pct_usd_up_after_indicator_down;
            prob = (pUp != null && pDown != null) ? (pUp + pDown) / 2 : (pUp ?? pDown);
            const pUpI = s.pct_ibov_up_after_indicator_up, pDownI = s.pct_ibov_up_after_indicator_down;
            probIbov = (pUpI != null && pDownI != null) ? (pUpI + pDownI) / 2 : (pUpI ?? pDownI);
          }
          if (prob != null) { weightedSum += prob * s.sample_size; weightTotal += s.sample_size; }
          if (probIbov != null) { weightedSumIbov += probIbov * s.sample_size; weightTotalIbov += s.sample_size; }
        }
      }

      aggProb = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : null;
      aggProbIbov = weightTotalIbov > 0 ? Math.round(weightedSumIbov / weightTotalIbov) : null;
    }
  }

  const dateLabel = fmtDateLabel(dateStr);
  let msg = `📊 *Probabilidades de hoje*\n${dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}\n\n`;

  msg += `*WDO:* ${aggProb != null ? aggProb + '% de chance de alta' : 'sem dado suficiente ainda'} ${weightTotal ? `(${weightTotal} casos)` : ''}\n`;
  msg += `*WIN:* ${aggProbIbov != null ? aggProbIbov + '% de chance de alta' : 'sem dado suficiente ainda'} ${weightTotalIbov ? `(${weightTotalIbov} casos)` : ''}\n`;

  return msg;
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram: ${JSON.stringify(data)}`);
  console.log('✅ Mensagem enviada pro grupo do Telegram.');
}

async function run() {
  const dateStr = todayStrBRT();
  const forced = process.env.FORCE_SEND === 'true';
  if (!forced && isNonTradingDay(dateStr)) {
    console.log(`${dateStr} é fim de semana ou feriado — sem dado econômico novo, não envia probabilidades hoje.`);
    return;
  }
  if (forced) console.log('⚠️ Envio forçado (teste manual) — ignorando checagem de fim de semana/feriado.');
  const msg = await buildReport();
  await sendTelegram(msg);
}

run().catch(err => { console.error('❌ Falha:', err.message); process.exitCode = 1; });
