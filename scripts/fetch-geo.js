import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Regiões monitoradas — focadas nos blocos que estruturalmente movem o dólar.
// Fonte: manchetes do Google News (gratuito, sem chave). Conta palavras de
// risco/tensão nos títulos recentes. É um proxy simples, não uma medição oficial.
const REGIONS = [
  { code: 'GEO_BRASIL', label: 'Brasil', query: 'economia Brasil risco fiscal juros' },
  { code: 'GEO_EUA', label: 'EUA', query: 'Federal Reserve economia dólar juros' },
  { code: 'GEO_ZONA_EURO', label: 'Zona do Euro', query: 'BCE zona do euro economia' },
];

const RISK_WORDS = [
  'crise', 'queda', 'tensão', 'tensao', 'conflito', 'déficit', 'deficit',
  'recessão', 'recessao', 'colapso', 'corte', 'calote', 'incerteza',
  'instabilidade', 'ruptura', 'disparada', 'desvalorização', 'desvalorizacao',
  'alerta', 'risco', 'pânico', 'panico', 'guerra', 'ataque', 'sanção', 'sancao',
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHeadlines(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-BR`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google News respondeu ${res.status}`);
  const xml = await res.text();

  const matches = [...xml.matchAll(/<title>([\s\S]*?)<\/title>/g)].map(m =>
    m[1].replace('<![CDATA[', '').replace(']]>', '')
  );
  // O primeiro <title> é o nome do feed em si, não uma notícia — descarta.
  return matches.slice(1);
}

function scoreTension(headlines) {
  if (headlines.length === 0) return null;
  let hits = 0;
  for (const h of headlines) {
    const lower = h.toLowerCase();
    if (RISK_WORDS.some(w => lower.includes(w))) hits++;
  }
  const ratio = hits / headlines.length;
  return Math.min(100, Math.round(ratio * 140)); // escala pra usar melhor a faixa 0-100
}

async function run() {
  console.log('Iniciando coleta do radar geopolítico (Google News + palavras-chave)...');
  let successCount = 0;

  for (const region of REGIONS) {
    try {
      const headlines = await fetchHeadlines(region.query);
      const tension = scoreTension(headlines);
      if (tension === null) throw new Error('Nenhuma manchete retornada');

      const { error } = await supabase.from('correlated_assets').insert({
        asset_code: region.code,
        ts: new Date().toISOString(),
        value: tension,
      });
      if (error) throw error;

      console.log(`✅ ${region.label}: ${headlines.length} manchetes analisadas → tensão ${tension}/100`);
      successCount++;
    } catch (err) {
      console.error(`❌ Falha em ${region.label}:`, err.message);
    }
    await sleep(2000);
  }

  console.log(`Finalizado. ${successCount}/${REGIONS.length} regiões atualizadas.`);
}

run();
