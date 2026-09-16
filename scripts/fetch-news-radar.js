import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { AbortController } from 'node:events';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── FEEDS RSS 100% GRATUITOS ────────────────────────────────────────────────
const FEEDS = [
  { url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Economia BR', lang: 'pt', category: 'MACRO' },
  { url: 'https://news.google.com/rss/search?q=Fed+OR+BCE+OR+%22banco+central%22+OR+Copom+OR+Selic+OR+%22taxa+de+juros%22&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Bancos Centrais', lang: 'pt', category: 'JUROS/BC' },
  { url: 'https://news.google.com/rss/search?q=d%C3%B3lar+OR+c%C3%A2mbio+OR+ibovespa+OR+%22bolsa+de+valores%22+OR+%22mercado+financeiro%22', source: 'Mercado BR', lang: 'pt', category: 'BOLSA' },
  { url: 'https://news.google.com/rss/search?q=petr%C3%B3leo+OR+ouro+OR+soja+OR+milho+OR+commodities+OR+brent', source: 'Commodities', lang: 'pt', category: 'COMMODITIES' },
  { url: 'https://news.google.com/rss/search?q=%22arcabou%C3%A7o+fiscal%22+OR+%22reforma+tribut%C3%A1ria%22+OR+%22d%C3%ADvida+p%C3%BAblica%22+OR+%22tesouro+nacional%22', source: 'Fiscal BR', lang: 'pt', category: 'FISCAL' },
  { url: 'https://news.google.com/rss/search?q=nasdaq+OR+%22S%26P+500%22+OR+%22dow+jones%22+OR+%22wall+street%22+OR+%22treasury+yield%22&hl=en-US&gl=US&ceid=US:en', source: 'Wall Street', lang: 'en', category: 'BOLSA' },
  { url: 'https://news.google.com/rss/search?q=inflation+OR+recession+OR+%22interest+rates%22+OR+%22central+bank%22+OR+GDP+OR+IMF&hl=en-US&gl=US&ceid=US:en', source: 'Macro Global', lang: 'en', category: 'MACRO' },
  { url: 'https://news.google.com/rss/search?q=tariffs+OR+sanctions+OR+%22trade+war%22+OR+%22china+economy%22+OR+geopolitics+OR+opec&hl=en-US&gl=US&ceid=US:en', source: 'Geopolítica', lang: 'en', category: 'POLÍTICA' },
  { url: 'https://news.google.com/rss/search?q=earnings+OR+merger+OR+acquisition+OR+IPO+OR+%22stock+market%22&hl=en-US&gl=US&ceid=US:en', source: 'Corporativo', lang: 'en', category: 'M&A/CORP' },
  { url: 'https://news.google.com/rss/search?q=%22governo+federal%22+OR+%22reforma%22+OR+%22privatiza%C3%A7%C3%A3o%22+OR+%22haddad%22+OR+%22minist%C3%A9rio+da+fazenda%22&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Política/Economia BR', lang: 'pt', category: 'POLÍTICA' },
  { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters Business', lang: 'en', category: 'MACRO' },
  { url: 'https://feeds.reuters.com/reuters/topNews', source: 'Reuters World', lang: 'en', category: 'GLOBAL' },
  { url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html', source: 'CNBC Economy', lang: 'en', category: 'MACRO' },
  { url: 'https://feeds.marketwatch.com/marketwatch/topstories/', source: 'MarketWatch', lang: 'en', category: 'BOLSA' },
];

// ─── FILTROS ─────────────────────────────────────────────────────────────────
const EXCLUDE = [
  'futebol','campeonato','copa do mundo','libertadores','brasileirão','brasileirao',
  'jogador','esporte','esportes','olimpíada','olimpiada','vôlei','volei','basquete',
  'nba ','nfl ','tênis','tenis','fórmula 1','formula 1','f1 ','mma','ufc','boxe',
  'natação','natacao','ginástica','maratona','novela','bbb','big brother','reality',
  'celebridade','famosos','grammy','oscar','cantor','cantora','ator ','atriz',
  'horóscopo','receita de','signo','namoro','beleza','maquiagem','skincare',
  'cabelo','moda ','dieta','emagrecer','loteria','mega-sena','megasena',
  'k-pop','kpop','anime','netflix','videogame','show de','turnê','turne',
  'festival de música','promoção de','desconto de','cupom de','liquidação','unboxing',
];

const FINANCE_CONFIRM = [
  'economia','mercado','bolsa','ações','juros','inflação','pib','dólar','câmbio',
  'fed','federal reserve','bce','banco central','ibovespa','nasdaq','dow jones',
  'commodities','petróleo','recessão','desemprego','tarifas','exportação','dívida',
  'fiscal','copom','selic','treasury','yield','investidor','tesouro','reforma',
  'privatização','resultado','lucro','receita','crescimento','crise','inflacao',
];

const REGIONS = [
  { tag: 'BR', words: ['brasil','brasileiro','brasileira','copom','selic','ibovespa','lula','haddad','fazenda','brl'] },
  { tag: 'US', words: ['eua','estados unidos','fed','federal reserve','wall street','nasdaq','dow jones','powell','treasury','s&p'] },
  { tag: 'EA', words: ['bce','zona do euro','europa','europeu','europeia','alemanha','lagarde','ecb'] },
  { tag: 'CN', words: ['china','chinês','yuan','pboc','xangai','beijing'] },
  { tag: 'JP', words: ['japão','japonês','tóquio','boj','iene'] },
];

function classifyRegion(title) {
  const t = title.toLowerCase();
  for (const r of REGIONS) if (r.words.some(w => t.includes(w))) return r.tag;
  return 'GLOBAL';
}

function passesFilter(title, lang) {
  const t = title.toLowerCase();
  if (EXCLUDE.some(k => t.includes(k))) return false;
  if (lang === 'en') return true;
  return FINANCE_CONFIRM.some(k => t.includes(k));
}

function parseRss(xml, feed) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
  return items.map(item => {
    const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]
      ?.replace(/(<!\[CDATA\[|\]\]>)/g, '').trim() || '';
    const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1]?.trim() || '';
    const pubDateRaw = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const pubDate = pubDateRaw ? new Date(pubDateRaw) : null;
    return { title, url: link, pubDate, source: feed.source, category: feed.category };
  }).filter(i => i.title && i.url && i.pubDate && !isNaN(i.pubDate));
}

// ─── FETCH COM TIMEOUT CORRETO (AbortController) ─────────────────────────────
async function fetchWithTimeout(url, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PulsoRadar/3.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`🕐 Coleta iniciada — ${new Date().toISOString()}`);
  let allItems = [];

  for (const feed of FEEDS) {
    try {
      const res = await fetchWithTimeout(feed.url, 15000);
      if (!res.ok) { console.log(`⚠️  ${feed.source}: HTTP ${res.status}`); continue; }
      const xml = await res.text();
      const items = parseRss(xml, feed);
      const filtered = items.filter(i => passesFilter(i.title, feed.lang));
      allItems = allItems.concat(filtered);
      console.log(`✅ ${feed.source}: ${filtered.length}/${items.length} aprovadas`);
    } catch (err) {
      console.log(`⚠️  ${feed.source}: ${err.name === 'AbortError' ? 'timeout 15s' : err.message}`);
    }
  }

  // Deduplicação
  const seen = new Set();
  const unique = allItems.filter(i => {
    const key = i.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => b.pubDate - a.pubDate);
  console.log(`\n📰 ${unique.length} manchetes únicas aprovadas`);

  if (unique.length > 0) {
    const rows = unique.map(i => ({
      published_at: i.pubDate.toISOString(),
      source: i.source,
      title: i.title,
      url: i.url,
      impact_tag: i.category,
      region: 'radar',
      country_tag: classifyRegion(i.title),
    }));
    const { error } = await supabase.from('news').upsert(rows, { onConflict: 'url', ignoreDuplicates: true });
    if (error) throw error;
    console.log(`✅ ${rows.length} manchetes salvas.`);
  }

  // Limpeza 48h
  const cutoff = new Date(Date.now() - 48 * 3600000).toISOString();
  await supabase.from('news').delete().eq('region', 'radar').lt('published_at', cutoff);
  console.log('🧹 Limpeza 48h concluída.');
}

run().catch(err => { console.error('❌', err.message); process.exitCode = 1; });
