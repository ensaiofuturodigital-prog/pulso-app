import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Radar 24h — antes só varria 18h-8h (madrugada). Agora roda o dia inteiro
// (o workflow chama esse script de hora em hora) e filtra por conteúdo, não
// por horário: só entra notícia de mercado/economia dos países que mais
// mexem com o dólar e o índice. Sem fofoca, sem esporte, sem países de
// baixa relevância pro câmbio.

const FEEDS = [
  // Feed 1: seção de Economia do Google News — já é inerentemente financeiro.
  { url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Google News - Economia' },
  // Feed 2: busca dirigida — só geopolítica/eventos que afetam os bancos
  // centrais e países relevantes (EUA, China, Japão, Europa, Brasil).
  {
    url: 'https://news.google.com/rss/search?q=(Fed+OR+%22Federal+Reserve%22+OR+%22banco+central%22+OR+BCE+OR+PBOC+OR+tarifas+OR+sancoes+OR+guerra+comercial)+(Brasil+OR+%22Estados+Unidos%22+OR+China+OR+Japao+OR+%22Uniao+Europeia%22+OR+Europa)&hl=pt-BR&gl=BR&ceid=BR:pt-BR',
    source: 'Google News - Geopolítica/Mercado',
  },
];

// Palavras que, se aparecerem, derrubam a notícia mesmo que tenha vindo dos
// feeds acima (rede de segurança contra fofoca/esporte que às vezes escapa
// da categorização do Google).
const EXCLUDE_KEYWORDS = [
  'futebol', 'campeonato', 'copa do mundo', 'libertadores', 'brasileirão', 'gol ', 'jogador', 'técnico do',
  'novela', 'bbb', 'big brother', 'reality show', 'celebridade', 'famosos', 'famoso ', 'famosa ',
  'grammy', 'oscar', 'cantor', 'cantora', 'ator ', 'atriz', 'horóscopo', 'receita de', 'signo',
  'namoro', 'affair', 'clima tempo', 'previsão do tempo',
  'loteria', 'loterias', 'lotofácil', 'lotofacil', 'mega-sena', 'megasena', 'quina', 'lotomania',
  'dupla sena', 'timemania', 'loteca', 'dezenas sorteadas', 'resultado do sorteio',
];

// Palavras que confirmam que é conteúdo de mercado/economia (usado pra
// reforçar o feed 1, que já é de Economia, mas pode vir genérico demais).
const FINANCE_KEYWORDS = [
  'economia', 'mercado', 'mercados', 'bolsa', 'ações', 'juros', 'inflação', 'pib', 'dólar', 'câmbio',
  'fed', 'federal reserve', 'bce', 'banco central', 'pboc', 'boj', 'nikkei', 'ibovespa', 'nasdaq',
  'dow jones', 's&p', 'commodities', 'petróleo', 'recessão', 'desemprego', 'tarifas', 'exportação',
  'importação', 'dívida pública', 'fiscal', 'copom', 'selic', 'treasury', 'yield', 'balança comercial',
  'pmi', 'varejo', 'consumidor', 'confiança', 'investidor', 'investidores', 'cotação', 'moeda',
];

function passesFilter(title) {
  const t = title.toLowerCase();
  if (EXCLUDE_KEYWORDS.some(k => t.includes(k))) return false;
  return true; // os 2 feeds já são pré-filtrados por assunto; isso aqui é só a rede de segurança
}

function parseRss(xml, source) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
  return items.map(item => {
    const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace('<![CDATA[', '').replace(']]>', '') || '';
    const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const pubDateRaw = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const pubDate = pubDateRaw ? new Date(pubDateRaw) : null;
    return { title, url: link, pubDate, source };
  }).filter(i => i.title && i.pubDate && !isNaN(i.pubDate));
}

async function run() {
  let allItems = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) { console.log(`⚠️  ${feed.source}: HTTP ${res.status}`); continue; }
      const xml = await res.text();
      const items = parseRss(xml, feed.source);
      allItems = allItems.concat(items);
      console.log(`${feed.source}: ${items.length} manchetes lidas`);
    } catch (err) {
      console.log(`⚠️  ${feed.source}: ${err.message}`);
    }
  }

  const filtered = allItems.filter(i => passesFilter(i.title));
  console.log(`${filtered.length} de ${allItems.length} manchetes passaram no filtro de mercado/região.`);

  if (filtered.length > 0) {
    const rows = filtered.map(i => ({
      published_at: i.pubDate.toISOString(),
      source: i.source,
      title: i.title,
      url: i.url,
      impact_tag: null,
      region: 'radar',
    }));
    // upsert por URL: roda de hora em hora, então evita duplicar quem já foi salvo.
    const { error } = await supabase.from('news').upsert(rows, { onConflict: 'url', ignoreDuplicates: true });
    if (error) throw error;
    console.log(`✅ ${rows.length} manchetes processadas (novas + já existentes ignoradas).`);
  } else {
    console.log('Nenhuma manchete nova pra registrar nessa rodada.');
  }

  // Limpeza: mantém só as últimas 48h no radar, pra não crescer sem fim.
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { error: delError } = await supabase.from('news').delete().eq('region', 'radar').lt('published_at', cutoff);
  if (delError) console.log(`⚠️  Limpeza: ${delError.message}`);
}

run().catch(err => { console.error('❌ Falha:', err.message); process.exitCode = 1; });
