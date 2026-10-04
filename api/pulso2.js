// PULSO 2 — endpoint da aba nova. Só LÊ dados (preços, calendário, divulgações)
// e devolve o resultado calculado. A única escrita é congelar, em pulso2_live,
// a previsão do próximo pregão (uma vez; nunca sobrescreve) — é o "registro ao
// vivo" que prova, com o tempo, se o motor acerta de verdade.
import { createClient } from '@supabase/supabase-js';
import { buildForecast, ENGINE_VERSION } from './lib/pulso2-engine.js';
import { loadInputs } from './lib/pulso2-data.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const { barsByAsset, events, releases, liveRows } = await loadInputs(supabase, today);

    const out = buildForecast({ today, barsByAsset, events, releases, liveRows });

    // Congela a previsão do próximo pregão (só se os preços estiverem em dia).
    const first = out.days[0];
    const frozen = [];
    if (first) {
      for (const asset of Object.keys(barsByAsset)) {
        if (out.stale[asset]) continue;
        const a = first.assets[asset];
        frozen.push({
          asset, target_date: first.date, p_up: a.p_up,
          signals: a.signals.filter((s) => s.stable).map((s) => ({ id: s.id, n: s.n, p: s.p, edge: s.edge })),
          exp_range_pct: a.amp.pct, engine_version: ENGINE_VERSION,
        });
      }
      if (frozen.length) {
        const { error } = await supabase.from('pulso2_live').upsert(frozen, { onConflict: 'asset,target_date', ignoreDuplicates: true });
        if (error) out.freeze_error = error.message;
      }
    }

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
