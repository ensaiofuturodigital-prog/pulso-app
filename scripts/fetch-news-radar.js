import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── TRADUÇÃO (MyMemory — gratuito, sem API key) ──────────────────────────────
async function translateToPortuguese(text) {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|pt-BR`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    const translated = data.responseData?.translatedText;
    // MyMemory retorna o original se não conseguir traduzir
    if (!translated || translated === text) return text;
    return translated;
  } catch {
    return text; // falha silenciosa — mantém original
  }
}

// Detecta se o título está em inglês (feeds com lang='en')
// Traduz em lotes para não sobrecarregar a API
async function translateBatch(items) {
  const toTranslate = items.filter(i => i.lang === 'en');
  console.log(`🔤 Traduzindo ${toTranslate.length} títulos em inglês...`);

  for (const item of toTranslate) {
    item.title = await translateToPortuguese(item.title);
    // Pequena pausa para não sobrecarregar a API (1000 req/dia gratuitas)
    await new Promise(r => setTimeout(r, 200));
  }
  return items;
}

// ─── FEEDS RSS ────────────────────────────────────────────────────────────────
const FEEDS = [
  { url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Economia BR', lang: 'pt', category: 'MACRO' },
  { url: 'https://news.google.com/rss/search?q=Fed+OR+BCE+OR+%22banco+central%22+OR+Copom+OR+Selic&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Bancos Centrais', lang: 'pt', category: 'JUROS/BC' },
  { url: 'https://news.google.com/rss/search?q=d%C3%B3lar+OR+c%C3%A2mbio+OR+ibovespa+OR+%22bolsa+de+valores%22', source: 'Mercado BR', lang: 'pt', category: 'BOLSA' },
  { url: 'https://news.google.com/rss/search?q=petr%C3%B3leo+OR+ouro+OR+soja+OR+commodities+OR+brent', source: 'Commodities', lang: 'pt', category: 'COMMODITIES' },
  { url: 'https://news.google.com/rss/search?q=%22arcabou%C3%A7o+fiscal%22+OR+%22reforma+tribut%C3%A1ria%22+OR+%22d%C3%ADvida+p%C3%BAblica%22+OR+%22tesouro+nacional%22', source: 'Fiscal BR', lang: 'pt', category: 'FISCAL' },
  { url: 'https://news.google.com/rss/search?q=nasdaq+OR+%22S%26P+500%22+OR+%22dow+jones%22+OR+%22wall+street%22&hl=en-US&gl=US&ceid=US:en', source: 'Wall Street', lang: 'en', category: 'BOLSA' },
  { url: 'https://news.google.com/rss/search?q=inflation+OR+recession+OR+%22interest+rates%22+OR+%22central+bank%22+OR+GDP+OR+IMF&hl=en-US&gl=US&ceid=US:en', source: 'Macro Global', lang: 'en', category: 'MACRO' },
  { url: 'https://news.google.com/rss/search?q=tariffs+OR+sanctions+OR+%22trade+war%22+OR+%22china+economy%22+OR+opec&hl=en-US&gl=US&ceid=US:en', source: 'Geopolítica', lang: 'en', category: 'POLÍTICA' },
  { url: 'https://news.google.com/rss/search?q=earnings+OR+merger+OR+acquisition+OR+IPO+OR+%22stock+market%22&hl=en-US&gl=US&ceid=US:en', source: 'Corporativo', lang: 'en', category: 'M&A/CORP' },
  { url: 'https://news.google.com/rss/search?q=%22governo+federal%22+OR+%22reforma%22+OR+%22privatiza%C3%A7%C3%A3o%22+OR+haddad+OR+%22minist%C3%A9rio+da+fazenda%22&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Política BR', lang: 'pt', category: 'POLÍTICA' },
  { url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html', source: 'CNBC Economy', lang: 'en', category: 'MACRO' },
  { url: 'https://feeds.marketwatch.com/marketwatch/topstories/', source: 'MarketWatch', lang: 'en', category: 'BOLSA' },
];

const EXCLUDE = [
  'futebol','campeonato','copa do mundo','libertadores','brasileirão','brasileirao',
  'jogador','esporte','esportes','olimpíada','olimpiada','vôlei','basquete','nba ',
  'nfl ','tênis','tenis','fórmula 1','formula 1','f1 ','mma','ufc','boxe','natação',
  'ginástica','maratona','novela','bbb','big brother','reality','celebridade','famosos',
  'grammy','oscar','cantor','cantora','ator ','atriz','horóscopo','receita de','signo',
  'namoro','beleza','maquiagem','skincare','cabelo','moda ','dieta','emagrecer',
  'loteria','mega-sena','megasena','k-pop','kpop','anime','netflix','videogame',
  'show de','turnê','turne','festival de música','promoção de','cupom de','liquidação',
];

const FINANCE_PT = [
  'economia','mercado','bolsa','ações','juros','inflação','inflacao','pib','dólar','dolar',
  'câmbio','cambio','fed','federal reserve','bce','banco central','ibovespa','nasdaq',
  'commodities','petróleo','petroleo','recessão','recessao','desemprego','tarifas',
  'exportação','dívida','divida','fiscal','copom','selic','treasury','yield',
  'investidor','tesouro','reforma','privatização','resultado','lucro','crise',
];

const REGIONS = [
  { tag: 'BR', words: ['brasil','brasileiro','brasileira','copom','selic','ibovespa','lula','haddad','fazenda'] },
  { tag: 'US', words: ['eua','estados unidos','fed','federal reserve','wall street','nasdaq','dow jones','powell','treasury'] },
  { tag: 'EA', words: ['bce','zona do euro','europa','europeu','alemanha','lagarde','ecb'] },
  { tag: 'CN', words: ['china','chinês','yuan','pboc','xangai','beijing'] },
  { tag: 'JP', words: ['japão','japonês','tóquio','boj','iene'] },
];

function classifyRegion(title) {
  const t = title.toLowerCase();
  for (const r of REGIONS) if (r.words.some(w => t.includes(w))) return r.tag;
  return 'GLOBAL';
}

function passes(title, lang) {
  const t = title.toLowerCase();
  if (EXCLUDE.some(k => t.includes(k))) return false;
  if (lang === 'en') return true;
  return FINANCE_PT.some(k => t.includes(k));
}

async function fetchRSS(url, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PulsoRadar/3.0)', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseRss(xml, feed) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const block = m[1];
    const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]
      ?.replace(/(<!\[CDATA\[|\]\]>)/g, '').trim() || '';
    const link  = (block.match(/<link>([\s\S]*?)<\/link>/)   || [])[1]?.trim() || '';
    const pub   = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const date  = pub ? new Date(pub) : null;
    return { title, url: link, pubDate: date, source: feed.source, category: feed.category, lang: feed.lang };
  }).filter(i => i.title && i.url && i.pubDate && !isNaN(i.pubDate) && passes(i.title, feed.lang));
}

async function run() {
  console.log(`🕐 Coleta — ${new Date().toISOString()}`);
  let all = [];

  for (const feed of FEEDS) {
    try {
      const xml = await fetchRSS(feed.url);
      const items = parseRss(xml, feed);
      all = all.concat(items);
      console.log(`✅ ${feed.source}: ${items.length} aprovadas`);
    } catch (err) {
      console.log(`⚠️  ${feed.source}: ${err.name === 'AbortError' ? 'timeout' : err.message}`);
    }
  }

  // Deduplicação por título (antes de traduzir)
  const seen = new Set();
  const unique = all.filter(i => {
    const key = i.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.pubDate - a.pubDate);

  console.log(`\n📰 ${unique.length} manchetes únicas`);

  // Traduzir títulos em inglês
  const translated = await translateBatch(unique);
  console.log(`✅ Tradução concluída.`);

  if (translated.length > 0) {
    const rows = translated.map(i => ({
      published_at: i.pubDate.toISOString(),
      source: i.source,
      title: i.title, // já em português
      url: i.url,
      impact_tag: i.category,
      region: 'radar',
      country_tag: classifyRegion(i.title),
    }));
    const { error } = await supabase.from('news').upsert(rows, { onConflict: 'url', ignoreDuplicates: true });
    if (error) throw error;
    console.log(`✅ ${rows.length} salvas no banco em português.`);
  }

  // Limpeza 48h
  const cutoff = new Date(Date.now() - 48 * 3600000).toISOString();
  await supabase.from('news').delete().eq('region', 'radar').lt('published_at', cutoff);
  console.log('🧹 Limpeza 48h ok.');
}

run().catch(err => { console.error('❌', err.message); process.exitCode = 1; });
