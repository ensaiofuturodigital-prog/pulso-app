import { createClient } from '@supabase/supabase-js';
import { parseCalendarText, parseNumericValue } from './lib/parseCalendar.js';
import { parseCalendarTextInvesting, parseNumberPT, looksLikeInvestingCalendar } from './lib/parseCalendarInvesting.js';
import { parseCalendarFull } from './lib/parseCalendarInvestingFull.js';
import { parsePriceText } from './lib/parsePrice.js';
import { resolveCode } from './lib/indicatorMap.js';

// Variáveis de ambiente — configuradas no painel da Vercel (Project Settings
// → Environment Variables), NUNCA no código/GitHub:
//   SUPABASE_URL            (mesma URL de sempre)
//   SUPABASE_SERVICE_KEY     (a chave service_role — tem permissão de escrita)
//   INGEST_PASSWORD          (senha simples que só o Paulão sabe)
//   GITHUB_ACTIONS_TOKEN     (token do GitHub só com permissão de Actions:
//                             write, pra disparar o recálculo sozinho)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const GH_OWNER = 'ensaiofuturodigital-prog';
const GH_REPO = 'pulso-app';

// Dispara o recálculo de probabilidade sozinho, sempre que um "Atualizar
// Dados" terminar com sucesso — pra nunca mais precisar ir no GitHub Actions
// apertar nada na mão depois de colar dado novo.
async function triggerRecompute() {
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) return { disparado: false, motivo: 'GITHUB_ACTIONS_TOKEN não configurado na Vercel' };

  const workflows = ['compute-stats.yml', 'compute-baseline-stats.yml'];
  const results = {};
  for (const wf of workflows) {
    try {
      const r = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${wf}/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github+json',
        },
        body: JSON.stringify({ ref: 'main' }),
      });
      results[wf] = r.status === 204 ? 'disparado' : `erro HTTP ${r.status}`;
    } catch (err) {
      results[wf] = `falha: ${err.message}`;
    }
  }
  return { disparado: true, workflows: results };
}

function dedupeBy(arr, keyFn) {
  const seen = new Set();
  return arr.filter(x => { const k = keyFn(x); if (seen.has(k)) return false; seen.add(k); return true; });
}

// Guarda TODOS os eventos lidos (feriados, discursos, outros países, eventos
// sem indicador) com o texto original, sem perder nada.
async function saveAllEvents(events, summary) {
  const rows = dedupeBy(events.map(e => ({
    event_date: e.date,
    event_time: e.time || '',
    all_day: !!e.allDay,
    country: e.country || '',
    event_raw: e.eventRaw,
    event_name: e.event,
    period_ref: e.period,
    is_holiday: e.isHoliday,
    is_month_start_placeholder: e.isPlaceholder,
    actual_raw: e.actual, forecast_raw: e.forecast, previous_raw: e.previous,
    raw_values: e.rawValues || null,
    actual_value: e.actualValue, forecast_value: e.forecastValue, previous_value: e.previousValue,
    indicator_code: e.isHoliday ? null : resolveCode(e.event, e.country),
    source: 'Investing.com',
    ingested_at: new Date().toISOString(),
  })), r => `${r.event_date}|${r.event_time}|${r.country}|${r.event_raw}`);
  let saved = 0;
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from('calendar_events').upsert(batch, { onConflict: 'event_date,event_time,country,event_raw' });
    if (error) summary.erros.push(`calendar_events: ${error.message}`);
    else saved += batch.length;
  }
  return saved;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  const { password, type, text, asset } = req.body || {};

  if (!process.env.INGEST_PASSWORD || password !== process.env.INGEST_PASSWORD) {
    res.status(401).json({ error: 'Senha incorreta' });
    return;
  }

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'Nenhum texto recebido' });
    return;
  }

  try {
    if (type === 'calendar') {
      const result = await ingestCalendar(text);
      result.recalculo = await triggerRecompute();
      res.status(200).json(result);
      return;
    }
    if (type === 'price') {
      if (asset !== 'WDO' && asset !== 'WIN') {
        res.status(400).json({ error: "asset precisa ser 'WDO' ou 'WIN'" });
        return;
      }
      const result = await ingestPriceForAsset(text, asset);
      result.recalculo = await triggerRecompute();
      res.status(200).json(result);
      return;
    }
    res.status(400).json({ error: "type precisa ser 'calendar' ou 'price'" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

async function ingestCalendar(text) {
  // Detecta sozinho se você colou do Trading Economics (inglês) ou do
  // Investing.com (português) — adicionado em 21/08/2026. Não precisa mais
  // escolher: cola de qualquer um dos dois que funciona.
  const fromInvesting = looksLikeInvestingCalendar(text);
  // Investing.com usa o leitor "guarda tudo" (nada é descartado). Trading
  // Economics continua com o leitor antigo, sem mudança.
  let events, full = null;
  if (fromInvesting) {
    full = parseCalendarFull(text);
    // Pro fluxo de indicadores só entram eventos reais: feriados e linhas
    // "placeholder" (dia 1º com sufixo de mês, que não são a data real de
    // divulgação) ficam só no histórico completo, sem alimentar o modelo.
    events = full.events
      .filter(e => !e.isHoliday && !e.isPlaceholder)
      .map(e => ({ ...e, time: e.time ? `${e.time}:00` : null }));
  } else {
    events = parseCalendarText(text);
  }
  const parseNumber = fromInvesting ? parseNumberPT : parseNumericValue;
  const summary = { total_eventos: events.length, mapeados: 0, sem_mapa: [], erros: [], fonte: fromInvesting ? 'Investing.com' : 'Trading Economics' };
  if (full) {
    summary.total_lidos_do_texto = full.events.length;
    summary.feriados = full.events.filter(e => e.isHoliday).length;
    summary.provaveis_placeholders_dia_1 = full.events.filter(e => e.isPlaceholder).length;
    summary.linhas_nao_entendidas = full.ignoradas.slice(0, 50);
    summary.guardados_no_historico_completo = await saveAllEvents(full.events, summary);
  }

  // Descobre o código do indicador pra cada evento e agrupa
  const byCode = {};
  for (const ev of events) {
    const code = resolveCode(ev.event, ev.country);
    if (!code) {
      // Não é perdido: já está guardado inteiro em calendar_events.
      const k = `[${ev.country}] ${ev.event}`;
      summary.sem_mapa_resumo = summary.sem_mapa_resumo || {};
      summary.sem_mapa_resumo[k] = (summary.sem_mapa_resumo[k] || 0) + 1;
      if (summary.sem_mapa.length < 100) summary.sem_mapa.push(`${ev.date} ${k}`);
      continue;
    }
    byCode[code] = byCode[code] || [];
    byCode[code].push(ev);
  }

  const codes = Object.keys(byCode);
  if (codes.length === 0) return summary;

  const { data: indicators, error: indError } = await supabase
    .from('indicators').select('id, code').in('code', codes);
  if (indError) throw indError;
  const idByCode = {};
  (indicators || []).forEach(i => { idByCode[i.code] = i.id; });

  for (const code of codes) {
    const indicatorId = idByCode[code];
    if (!indicatorId) {
      summary.erros.push(`${code}: indicador não encontrado na tabela 'indicators'`);
      continue;
    }
    const evs = byCode[code];

    // 1) release_schedule: data de divulgação (sempre grava, saiu ou não)
    const scheduleRows = dedupeBy(evs.map(e => ({ indicator_id: indicatorId, release_date: e.date })), r => r.release_date);
    for (const batch of chunk(scheduleRows, 500)) {
      const { error } = await supabase.from('release_schedule').upsert(batch, { onConflict: 'indicator_id,release_date' });
      if (error) summary.erros.push(`${code} (release_schedule): ${error.message}`);
    }

    // 2) indicator_releases: só grava linha com valor real quando "Actual" veio
    // preenchido E a data não é futura. Essa segunda trava existe porque o
    // parser do Investing.com (Layout B) pode confundir "Previsão" com "Atual"
    // quando o evento ainda não saiu (bug encontrado em 24/09/2026, corrigia
    // sozinho registros fantasmas de indicadores que ainda não tinham sido
    // divulgados). Não confia em NENHUM parser pra isso — trava aqui, uma vez
    // só, pra sempre.
    const todayStr = new Date().toISOString().slice(0, 10);
    const futurosIgnorados = evs.filter(e => e.actual !== null && e.date > todayStr);
    if (futurosIgnorados.length > 0) {
      summary.erros.push(
        `${code}: ${futurosIgnorados.length} evento(s) com data futura vieram com "Atual" preenchido — ignorado(s) de propósito (provável Previsão lida por engano). Datas: ${futurosIgnorados.map(e => e.date).join(', ')}`
      );
    }
    const releaseCandidates = evs
      .filter(e => e.actual !== null && e.date <= todayStr)
      .map(e => ({
        indicator_id: indicatorId,
        release_date: e.date,
        actual_value: parseNumber(e.actual),
        previous_value: parseNumber(e.previous),
        expected_value: parseNumber(e.forecast), // Previsão (consenso) — antes era descartada
        release_time: e.time || null,             // horário da divulgação
      }))
      .filter(r => r.actual_value !== null);
    // Dois eventos do mesmo indicador no mesmo dia (ex.: CPI mensal e anual)
    // derrubariam o lote inteiro no banco. Fica o primeiro; o outro continua
    // guardado em calendar_events e é avisado em "conflitos".
    const releaseRows = dedupeBy(releaseCandidates, r => r.release_date);
    if (releaseRows.length < releaseCandidates.length) {
      summary.conflitos = summary.conflitos || [];
      summary.conflitos.push(`${code}: ${releaseCandidates.length - releaseRows.length} evento(s) no mesmo dia — ficou o primeiro no indicador, os demais estão em calendar_events`);
    }

    if (releaseRows.length > 0) {
      for (const batch of chunk(releaseRows, 500)) {
        const { error } = await supabase.from('indicator_releases').upsert(batch, { onConflict: 'indicator_id,release_date' });
        if (error) { summary.erros.push(`${code} (indicator_releases): ${error.message}`); continue; }
      }
      // marca fetched_at só nas linhas que acabaram de ganhar valor real agora
      // (em lotes de 200 datas — antes era 1 chamada por linha e estourava o
      // tempo da Vercel em colagens grandes)
      const nowIso = new Date().toISOString();
      for (const dates of chunk(releaseRows.map(r => r.release_date), 200)) {
        await supabase.from('indicator_releases')
          .update({ fetched_at: nowIso })
          .eq('indicator_id', indicatorId).in('release_date', dates)
          .is('fetched_at', null);
      }
    }

    summary.mapeados += evs.length;
  }

  return summary;
}

async function ingestPriceForAsset(text, asset) {
  const rows = parsePriceText(text);
  const priceRows = rows.map(r => ({ asset, price_date: r.date, open: r.open, high: r.high, low: r.low, close: r.close }));
  const errors = [];
  for (const batch of chunk(priceRows, 500)) {
    const { error } = await supabase.from('price_daily').upsert(batch, { onConflict: 'asset,price_date' });
    if (error) errors.push(error.message);
  }
  return { total_linhas: rows.length, gravado: priceRows.length - errors.length, erros: errors };
}
