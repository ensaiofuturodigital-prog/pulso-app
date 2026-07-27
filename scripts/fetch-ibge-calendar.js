import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Calendário oficial e gratuito de divulgações do IBGE (governo brasileiro,
// sem chave de API necessária). Documentação: servicodados.ibge.gov.br/api/docs/calendario
// Cobre só os indicadores do Pulso que são pesquisas do próprio IBGE — SELIC é
// decisão do BCB (já coberta pelo fetch-fomc-dates.js), IGP-M é da FGV, e
// Balança Comercial é do MDIC/Secex, então esses 3 ficam de fora daqui.
const IBGE_URL = 'https://servicodados.ibge.gov.br/api/v3/calendario';

// Texto que deve aparecer no nome do produto/pesquisa retornado pela API do
// IBGE pra bater com cada indicador do Pulso. Version 1 — vou ajustar essas
// strings depois de ver o formato real da resposta (primeira rodada loga uma
// amostra bruta do JSON pra isso).
const MATCHERS = [
  { series_id: 'BCB_IPCA15', match: (nome) => /ipca-15|ipca 15/i.test(nome) },
  { series_id: 'BCB_IPCA', match: (nome) => /ipca\b/i.test(nome) && !/ipca-15|ipca 15/i.test(nome) },
  { series_id: 'BCB_PIB', match: (nome) => /produto interno bruto|\bpib\b/i.test(nome) },
  { series_id: 'BCB_DESEMPREGO', match: (nome) => /pnad cont[ií]nua|desemprego|for[çc]a de trabalho/i.test(nome) },
];

function extractDate(item) {
  // A API pode devolver o campo de data com nomes diferentes conforme a versão.
  // Tenta os candidatos mais prováveis, na ordem.
  const candidates = ['data_divulgacao', 'data', 'dataDivulgacao', 'data_liberacao', 'data_publicacao'];
  for (const key of candidates) {
    if (item[key]) return item[key];
  }
  return null;
}

function extractName(item) {
  const candidates = ['produto', 'pesquisa', 'nome', 'titulo', 'assunto'];
  for (const key of candidates) {
    if (item[key] && typeof item[key] === 'string') return item[key];
    if (item[key] && item[key].nome) return item[key].nome;
  }
  return JSON.stringify(item).slice(0, 120);
}

function toISODate(raw) {
  if (!raw) return null;
  // Aceita "2026-07-28", "28/07/2026", ou timestamp
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(raw);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

async function run() {
  console.log('Buscando calendário oficial de divulgações do IBGE...');

  const res = await fetch(IBGE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) {
    console.error(`❌ Falha ao buscar calendário do IBGE: HTTP ${res.status}`);
    process.exitCode = 1;
    return;
  }
  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.items || data.calendario || []);
  console.log(`${items.length} entradas recebidas da API do IBGE.`);

  if (items.length > 0) {
    console.log('--- Amostra bruta do primeiro item (pra eu ajustar os nomes dos campos se precisar) ---');
    console.log(JSON.stringify(items[0], null, 2).slice(0, 1500));
    console.log('--- fim da amostra ---');
  }

  // Junta as datas encontradas por indicador
  const datesBySeries = {};
  for (const item of items) {
    const nome = extractName(item);
    const rawDate = extractDate(item);
    const isoDate = toISODate(rawDate);
    if (!isoDate) continue;
    for (const m of MATCHERS) {
      if (m.match(nome)) {
        datesBySeries[m.series_id] = datesBySeries[m.series_id] || [];
        datesBySeries[m.series_id].push(isoDate);
      }
    }
  }

  const seriesIds = Object.keys(datesBySeries);
  if (seriesIds.length === 0) {
    console.log('⚠️  Nenhuma data casou com os indicadores esperados. Ver amostra bruta acima pra ajustar os matchers.');
    return;
  }

  const { data: indicators } = await supabase.from('indicators').select('id, code').in('code', seriesIds);
  const idByCode = {};
  (indicators || []).forEach(i => { idByCode[i.code] = i.id; });

  for (const seriesId of seriesIds) {
    const indId = idByCode[seriesId];
    if (!indId) { console.log(`⚠️  ${seriesId}: indicador não encontrado na tabela 'indicators'`); continue; }
    const dates = [...new Set(datesBySeries[seriesId])];
    const rows = dates.map(d => ({ indicator_id: indId, release_date: d }));
    const { error } = await supabase.from('release_schedule').upsert(rows, { onConflict: 'indicator_id,release_date' });
    if (error) { console.error(`❌ Falha em ${seriesId}:`, error.message); continue; }
    console.log(`✅ ${seriesId}: ${rows.length} data(s) registrada(s)`);
  }

  console.log('Finalizado.');
}

run().catch(err => { console.error('❌ Falha geral:', err.message); process.exitCode = 1; });
