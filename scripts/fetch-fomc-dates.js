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

// Datas reais de decisão do BCE (Governing Council). Fonte: ecb.europa.eu/press/calendars.
// 2026: faltando a 1ª reunião do ano (ainda não localizada com certeza) — adicionar quando confirmada.
const ECB_DECISION_DATES = [
  '2025-01-30', '2025-03-06', '2025-04-17', '2025-06-05',
  '2025-07-24', '2025-09-11', '2025-10-30', '2025-12-18',
  '2026-03-19', '2026-04-30', '2026-06-11', '2026-07-23',
  '2026-09-10', '2026-10-29', '2026-12-17',
];

const GROUPS = [
  { codes: ['DFF', 'DGS10'], dates: FOMC_DECISION_DATES, label: 'FOMC' },
  { codes: ['ECBMRRFR', 'ECBDFR'], dates: ECB_DECISION_DATES, label: 'BCE' },
];

async function run() {
  console.log('Registrando datas reais de decisão do FOMC e do BCE...');

  for (const group of GROUPS) {
    const { data: indicators } = await supabase
      .from('indicators')
      .select('id, code')
      .in('code', group.codes);

    if (!indicators || indicators.length === 0) {
      console.log(`⚠️  Nenhum indicador encontrado pro grupo ${group.label} (${group.codes.join(', ')})`);
      continue;
    }

    for (const ind of indicators) {
      const rows = group.dates.map(d => ({ indicator_id: ind.id, release_date: d }));
      const { error } = await supabase.from('release_schedule').upsert(rows, { onConflict: 'indicator_id,release_date' });
      if (error) { console.error(`❌ Falha em ${ind.code}:`, error.message); continue; }
      console.log(`✅ ${ind.code}: ${rows.length} datas de decisão do ${group.label} registradas`);
    }
  }

  console.log('Finalizado.');
}

run().catch(err => { console.error('❌ Falha geral:', err.message); process.exitCode = 1; });
