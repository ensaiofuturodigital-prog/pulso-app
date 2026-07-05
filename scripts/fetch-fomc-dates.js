import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Datas reais de decisão do FOMC (dia 2 da reunião, quando o comunicado sai às 14h ET).
// Fonte: federalreserve.gov/monetarypolicy/fomccalendars.htm — confirmadas oficialmente.
// 2027 ainda não foi publicado pelo Fed; atualizar quando divulgarem.
const FOMC_DECISION_DATES = [
  // 2025
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18',
  '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
  // 2026
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
];

// Fed Funds Rate e Treasury 10 anos não têm "divulgação" diária de verdade —
// são preços de mercado contínuos. O único evento real que os move de forma
// discreta é a decisão do FOMC, então é isso que registramos como "evento do dia".
const TARGET_CODES = ['DFF', 'DGS10'];

async function run() {
  console.log('Registrando datas reais de decisão do FOMC...');

  const { data: indicators } = await supabase
    .from('indicators')
    .select('id, code')
    .in('code', TARGET_CODES);

  if (!indicators || indicators.length === 0) {
    throw new Error('Indicadores DFF/DGS10 não encontrados — rode o fetch-fred.js primeiro.');
  }

  for (const ind of indicators) {
    const rows = FOMC_DECISION_DATES.map(d => ({ indicator_id: ind.id, release_date: d }));
    const { error } = await supabase.from('release_schedule').upsert(rows, { onConflict: 'indicator_id,release_date' });
    if (error) { console.error(`❌ Falha em ${ind.code}:`, error.message); continue; }
    console.log(`✅ ${ind.code}: ${rows.length} datas de decisão do FOMC registradas`);
  }

  console.log('Finalizado.');
}

run().catch(err => { console.error('❌ Falha geral:', err.message); process.exitCode = 1; });
