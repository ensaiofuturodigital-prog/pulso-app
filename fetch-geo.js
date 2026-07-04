import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Regiões monitoradas — cada uma vira uma "barra de tensão" no Radar.
// Fonte: GDELT (gratuita, pública). Mede o tom médio da cobertura noticiosa:
// tom bem negativo = tensão alta. Isso é um proxy, não uma medição exata.
const REGIONS = [
  { code: 'GEO_CHINA', label: 'China', query: 'China economy OR China trade' },
  { code: 'GEO_ORIENTE_MEDIO', label: 'Oriente Médio', query: 'Middle East conflict' },
  { code: 'GEO_RUSSIA_UCRANIA', label: 'Rússia / Ucrânia', query: 'Russia Ukraine war' },
  { code: 'GEO_BRASIL_FISCAL', label: 'Brasil - Risco Fiscal', query: 'Brazil fiscal deficit' },
  { code: 'GEO_EUA_FED', label: 'EUA - Política Monetária', query: 'Federal Reserve interest rates' },
];

async function fetchTone(query) {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=timelinetone&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GDELT respondeu ${res.status}`);
  const data = await res.json();

  const series = data?.timeline?.[0]?.data;
  if (!series || series.length === 0) throw new Error('Sem dados de tom retornados');

  const last = series[series.length - 1];
  return typeof last.value === 'number' ? last.value : parseFloat(last.value);
}

function toneToTension(tone) {
  // Tom do GDELT normalmente varia entre -10 (muito negativo) e +10 (muito positivo).
  // Convertendo pra uma escala de tensão 0-100, onde negativo = mais tenso.
  const clamped = Math.max(-10, Math.min(10, tone));
  return Math.round(((10 - clamped) / 20) * 100);
}

async function run() {
  console.log('Iniciando coleta do radar geopolítico (GDELT)...');
  let successCount = 0;

  for (const region of REGIONS) {
    try {
      const tone = await fetchTone(region.query);
      const tension = toneToTension(tone);

      const { error } = await supabase.from('correlated_assets').insert({
        asset_code: region.code,
        ts: new Date().toISOString(),
        value: tension,
      });
      if (error) throw error;

      console.log(`✅ ${region.label}: tom ${tone.toFixed(2)} → tensão ${tension}/100`);
      successCount++;
    } catch (err) {
      console.error(`❌ Falha em ${region.label}:`, err.message);
      // Continua pras próximas regiões mesmo se uma falhar
    }
  }

  console.log(`Finalizado. ${successCount}/${REGIONS.length} regiões atualizadas.`);
}

run();
