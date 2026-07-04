import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Regiões monitoradas — focadas nos blocos que estruturalmente movem o dólar
// (Brasil, EUA, Zona do Euro). Fonte: GDELT (gratuita, pública). Mede o tom médio
// da cobertura noticiosa: tom bem negativo = tensão alta. É um proxy, não uma
// medição exata — e cobre risco econômico/político, não risco de guerra.
const REGIONS = [
  { code: 'GEO_BRASIL', label: 'Brasil', query: 'Brazil economy fiscal risk' },
  { code: 'GEO_EUA', label: 'EUA', query: 'United States Federal Reserve economy' },
  { code: 'GEO_ZONA_EURO', label: 'Zona do Euro', query: 'Eurozone ECB economy' },
];

async function fetchTone(query, attempt = 1) {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=timelinetone&format=json`;
  const res = await fetch(url);

  if (res.status === 429 && attempt < 3) {
    console.log(`  ...limite de pedidos atingido, esperando 10s antes de tentar de novo (tentativa ${attempt})`);
    await sleep(10000);
    return fetchTone(query, attempt + 1);
  }
  if (!res.ok) throw new Error(`GDELT respondeu ${res.status}`);

  const data = await res.json();
  const series = data?.timeline?.[0]?.data;
  if (!series || series.length === 0) throw new Error('Sem dados de tom retornados');

  const last = series[series.length - 1];
  return typeof last.value === 'number' ? last.value : parseFloat(last.value);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    }
    await sleep(4000); // pausa entre regiões pra não sobrecarregar a API gratuita
  }

  console.log(`Finalizado. ${successCount}/${REGIONS.length} regiões atualizadas.`);
}

run();
