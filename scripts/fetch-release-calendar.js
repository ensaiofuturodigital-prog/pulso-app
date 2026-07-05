import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const FRED_API_KEY = process.env.FRED_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getReleaseId(seriesCode) {
  const url = `https://api.stlouisfed.org/fred/series/release?series_id=${seriesCode}&api_key=${FRED_API_KEY}&file_type=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao buscar release_id de ${seriesCode}: ${res.status}`);
  const data = await res.json();
  return data.releases?.[0]?.id || null;
}

async function getReleaseDates(releaseId) {
  // Pega desde 2015 pra trás não precisamos, e inclui datas futuras já agendadas pelo FRED
  const url = `https://api.stlouisfed.org/fred/release/dates?release_id=${releaseId}&api_key=${FRED_API_KEY}&file_type=json&realtime_start=1950-01-01&realtime_end=2027-12-31&include_release_dates_with_no_data=true&sort_order=asc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao buscar datas do release ${releaseId}: ${res.status}`);
  const data = await res.json();
  return (data.release_dates || []).map(d => d.date);
}

async function run() {
  console.log('Buscando calendário real de divulgações do FRED...');

  const { data: indicators } = await supabase
    .from('indicators')
    .select('id, code')
    .eq('source', 'fred');

  for (const ind of indicators) {
    try {
      const releaseId = await getReleaseId(ind.code);
      if (!releaseId) { console.log(`⚠️  ${ind.code}: sem release_id encontrado`); continue; }

      const dates = await getReleaseDates(releaseId);
      if (dates.length === 0) { console.log(`⚠️  ${ind.code}: nenhuma data retornada`); continue; }

      const rows = dates.map(d => ({ indicator_id: ind.id, release_date: d }));
      for (const batch of chunk(rows, 500)) {
        const { error } = await supabase.from('release_schedule').upsert(batch, { onConflict: 'indicator_id,release_date' });
        if (error) console.error(`Erro no lote de ${ind.code}:`, error.message);
      }

      const future = dates.filter(d => d >= new Date().toISOString().slice(0, 10));
      console.log(`✅ ${ind.code}: ${dates.length} datas (${future.length} futuras agendadas)`);
    } catch (err) {
      console.error(`❌ Falha em ${ind.code}:`, err.message);
    }
  }

  console.log('Finalizado.');
}

run().catch(err => { console.error('❌ Falha geral:', err.message); process.exitCode = 1; });
