import { createClient } from '@supabase/supabase-js';
import { parseCalendarText, parseNumericValue } from './lib/parseCalendar.js';
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
  const events = parseCalendarText(text);
  const summary = { total_eventos: events.length, mapeados: 0, sem_mapa: [], erros: [] };

  // Descobre o código do indicador pra cada evento e agrupa
  const byCode = {};
  for (const ev of events) {
    const code = resolveCode(ev.event, ev.country);
    if (!code) {
      summary.sem_mapa.push(`${ev.date} [${ev.country}] ${ev.event}`);
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
    const scheduleRows = evs.map(e => ({ indicator_id: indicatorId, release_date: e.date }));
    for (const batch of chunk(scheduleRows, 500)) {
      const { error } = await supabase.from('release_schedule').upsert(batch, { onConflict: 'indicator_id,release_date' });
      if (error) summary.erros.push(`${code} (release_schedule): ${error.message}`);
    }

    // 2) indicator_releases: só grava linha com valor real quando "Actual" veio preenchido
    const releaseRows = evs
      .filter(e => e.actual !== null)
      .map(e => ({
        indicator_id: indicatorId,
        release_date: e.date,
        actual_value: parseNumericValue(e.actual),
        previous_value: parseNumericValue(e.previous),
      }))
      .filter(r => r.actual_value !== null);

    if (releaseRows.length > 0) {
      for (const batch of chunk(releaseRows, 500)) {
        const { error } = await supabase.from('indicator_releases').upsert(batch, { onConflict: 'indicator_id,release_date' });
        if (error) { summary.erros.push(`${code} (indicator_releases): ${error.message}`); continue; }
      }
      // marca fetched_at só nas linhas que acabaram de ganhar valor real agora
      const nowIso = new Date().toISOString();
      for (const r of releaseRows) {
        await supabase.from('indicator_releases')
          .update({ fetched_at: nowIso })
          .eq('indicator_id', indicatorId).eq('release_date', r.release_date)
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
