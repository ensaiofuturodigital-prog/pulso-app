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

function countryFlag(c) {
  return c === 'BR' ? '🇧🇷' : c === 'US' ? '🇺🇸' : c === 'EA' ? '🇪🇺' : c === 'CN' ? '🇨🇳' : c === 'JP' ? '🇯🇵' : '';
}

function importanceLabel(n) {
  const lvl = n || 1;
  if (lvl >= 3) return 'Alto impacto';
  if (lvl === 2) return 'Impacto moderado';
  return 'Baixo impacto';
}

function trendClass(actual, previous) {
  if (previous === null || previous === undefined || actual === previous) return 'flat';
  return actual > previous ? 'up' : 'down';
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
  let indicatorLines = [];
  let usedBaseline = false;

  if (!scheduled || scheduled.length === 0) {
    const base = await applyBaseline(dateStr);
    aggProb = base.aggProb; aggProbIbov = base.aggProbIbov;
    weightTotal = base.weightTotal; weightTotalIbov = base.weightTotalIbov;
    usedBaseline = true;
  } else {
    const ids = scheduled.map(s => s.indicator_id);
    const { data: indicatorsRaw } = await supabase.from('indicators').select('*').in('id', ids);
    const indicators = (indicatorsRaw || []);

    if (indicators.length === 0) {
      const base = await applyBaseline(dateStr);
      aggProb = base.aggProb; aggProbIbov = base.aggProbIbov;
      weightTotal = base.weightTotal; weightTotalIbov = base.weightTotalIbov;
      usedBaseline = true;
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

        if ((ind.importance || 1) >= 2) {
          const flag = countryFlag(ind.country);
          const time = ind.typical_time_brt ? ` (~${ind.typical_time_brt})` : '';
          let line = `${flag} *${ind.name_pt}* — ${importanceLabel(ind.importance)}${time}`;
          if (s && (s.sample_size || 0) >= 5) {
            const pUp = s.pct_usd_up_after_indicator_up, pDown = s.pct_usd_up_after_indicator_down;
            line += `\n   Se vier acima do anterior → WDO alta ${pUp != null ? Math.round(pUp) + '%' : '—'}`;
            line += `\n   Se vier abaixo do anterior → WDO alta ${pDown != null ? Math.round(pDown) + '%' : '—'}`;
          } else {
            line += `\n   Sem amostra histórica suficiente ainda.`;
          }
          indicatorLines.push(line);
        }
      }

      aggProb = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : null;
      aggProbIbov = weightTotalIbov > 0 ? Math.round(weightedSumIbov / weightTotalIbov) : null;
    }
  }

  const dateLabel = fmtDateLabel(dateStr);
  let msg = `📊 *Pulso — Probabilidades de hoje*\n${dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}\n\n`;

  msg += `*WDO:* ${aggProb != null ? aggProb + '% de chance de alta' : 'sem dado suficiente ainda'} ${weightTotal ? `(${weightTotal} casos)` : ''}\n`;
  msg += `*WIN:* ${aggProbIbov != null ? aggProbIbov + '% de chance de alta' : 'sem dado suficiente ainda'} ${weightTotalIbov ? `(${weightTotalIbov} casos)` : ''}\n`;

  if (usedBaseline) {
    msg += `\n_Sem indicador de média/alta importância hoje — número baseado no histórico de dias parecidos._\n`;
  } else if (indicatorLines.length > 0) {
    msg += `\n*Indicadores de hoje:*\n\n${indicatorLines.join('\n\n')}\n`;
  }

  msg += `\n🔗 Veja mais em opulsotrading.vercel.app`;

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
  const msg = await buildReport();
  await sendTelegram(msg);
}

run().catch(err => { console.error('❌ Falha:', err.message); process.exitCode = 1; });
