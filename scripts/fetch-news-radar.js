import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── 10 FEEDS RSS GRATUITOS ────────────────────────────────────────────────
// Estratégia: Google News (sem API, sem custo) com queries cirúrgicas por tema.
// Cada feed é uma busca diferente — gestor de fundos, trader, CEO, executivo de banco.
const FEEDS = [
  // 1. Economia brasileira geral
  {
    url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=pt-BR&gl=BR&ceid=BR:pt-BR',
    source: 'Economia BR',
    category: 'MACRO',
    lang: 'pt',
  },
  // 2. Política monetária: Fed, BCE, BCB, Selic, Copom
  {
    url: 'https://news.google.com/rss/search?q=Fed+OR+BCE+OR+%22banco+central%22+OR+Copom+OR+Selic+OR+%22taxa+de+juros%22+OR+%22Powell%22+OR+%22Lagarde%22&hl=pt-BR&gl=BR&ceid=BR:pt-BR',
    source: 'Bancos Centrais',
    category: 'JUROS',
    lang: 'pt',
  },
  // 3. Câmbio, Ibovespa e mercado financeiro brasileiro
  {
    url: 'https://news.google.com/rss/search?q=d%C3%B3lar+OR+c%C3%A2mbio+OR+ibovespa+OR+%22bolsa+de+valores%22+OR+%22mercado+financeiro%22+OR+%22renda+fixa%22&hl=pt-BR&gl=BR&ceid=BR:pt-BR',
    source: 'Mercado BR',
    category: 'MERCADO',
    lang: 'pt',
  },
  // 4. Commodities: petróleo, minério, soja, milho, ouro
  {
    url: 'https://news.google.com/rss/search?q=petr%C3%B3leo+OR+%22minério+de+ferro%22+OR+soja+OR+milho+OR+ouro+OR+commodities+OR+brent+OR+wti&hl=pt-BR&gl=BR&ceid=BR:pt-BR',
    source: 'Commodities',
    category: 'COMMODITIES',
    lang: 'pt',
  },
  // 5. Política fiscal e governo Brasil
  {
    url: 'https://news.google.com/rss/search?q=%22arcabou%C3%A7o+fiscal%22+OR+%22reforma+tribut%C3%A1ria%22+OR+%22d%C3%ADvida+p%C3%BAblica%22+OR+%22deficit+fiscal%22+OR+%22tesouro+nacional%22+OR+%22pol%C3%ADtica+econ%C3%B4mica%22&hl=pt-BR&gl=BR&ceid=BR:pt-BR',
    source: 'Fiscal BR',
    category: 'FISCAL',
    lang: 'pt',
  },
  // 6. EUA: Wall Street, S&P, Nasdaq, inflação americana
  {
    url: 'https://news.google.com/rss/search?q=nasdaq+OR+%22S%26P+500%22+OR+%22dow+jones%22+OR+%22wall+street%22+OR+%22treasury+yield%22+OR+%22US+economy%22&hl=en-US&gl=US&ceid=US:en',
    source: 'Wall Street',
    category: 'MERCADO',
    lang: 'en',
  },
  // 7. Macro global: inflação, recessão, PIB, bancos centrais mundiais
  {
    url: 'https://news.google.com/rss/search?q=inflation+OR+recession+OR+%22interest+rates%22+OR+%22central+bank%22+OR+GDP+OR+%22economic+growth%22+OR+%22IMF%22+OR+%22World+Bank%22&hl=en-US&gl=US&ceid=US:en',
    source: 'Macro Global',
    category: 'MACRO',
    lang: 'en',
  },
  // 8. Geopolítica que move mercados: tarifas, sanções, China, guerra comercial
  {
    url: 'https://news.google.com/rss/search?q=tariffs+OR+sanctions+OR+%22trade+war%22+OR+%22china+economy%22+OR+%22us+china%22+OR+geopolitics+OR+%22opec%22&hl=en-US&gl=US&ceid=US:en',
    source: 'Geopolítica',
    category: 'GEO',
    lang: 'en',
  },
  // 9. Empresas e resultados corporativos (earnings, M&A, IPO)
  {
    url: 'https://news.google.com/rss/search?q=earnings+OR+%22quarterly+results%22+OR+merger+OR+acquisition+OR+IPO+OR+%22market+cap%22+OR+%22stock+market%22&hl=en-US&gl=US&ceid=US:en',
    source: 'Corporativo',
    category: 'CORPORATIVO',
    lang: 'en',
  },
  // 10. Brasil: política e governo (só o que impacta economia)
  {
    url: 'https://news.google.com/rss/search?q=%22governo+federal%22+OR+%22congresso+nacional%22+OR+%22reforma%22+OR+%22privatiza%C3%A7%C3%A3o%22+OR+%22lula+economia%22+OR+%22ministério+da+fazenda%22+OR+%22haddad%22&hl=pt-BR&gl=BR&ceid=BR:pt-BR',
    source: 'Política/Economia BR',
    category: 'POLITICA',
    lang: 'pt',
  },
];

// ─── FILTROS DE EXCLUSÃO ─────────────────────────────────────────────────────
const EXCLUDE = [
  'futebol','campeonato','copa do mundo','libertadores','brasileirão','brasileirao',
  'jogador','técnico do','esporte','esportes','olimpíada','olimpiada','paralimpíada',
  'vôlei','volei','basquete','nba ','nfl ','tênis','tenis','fórmula 1','formula 1',
  'f1 ','mma','ufc','boxe','atleta','natação','natacao','ginástica','maratona',
  'novela','bbb','big brother','reality show','celebridade','famosos',
  'grammy','oscar','cantor','cantora','ator ','atriz','horóscopo','receita de',
  'signo','namoro','beleza','maquiagem','skincare','cabelo','moda ','dieta',
  'emagrecer','loteria','mega-sena','megasena','k-pop','kpop','anime',
  'netflix','streaming','videogame','show de','turnê','turne','festival de música',
  'previsão do tempo','clima tempo','lançamento do novo','promoção de',
  'desconto de','cupom de','liquidação','unboxing',
];

// ─── PALAVRAS QUE CONFIRMAM RELEVÂNCIA PRO PROFISSIONAL DE MERCADO ───────────
const FINANCE_CONFIRM = [
  'economia','mercado','mercados','bolsa','ações','juros','inflação','pib','dólar',
  'câmbio','fed','federal reserve','bce','banco central','ibovespa','nasdaq',
  'dow jones','s&p','commodities','petróleo','recessão','desemprego','tarifas',
  'exportação','dívida','fiscal','copom','selic','treasury','yield','balança',
  'pmi','consumidor','confiança','investidor','cotação','moeda','tesouro',
  'inflation','gdp','recession','interest rate','earnings','merger','acquisition',
  'ipo','stock','bonds','currency','crude oil','gold','silver','copper',
  'sanctions','tariffs','trade','central bank','monetary','fiscal','budget',
  'deficit','surplus','reform','privatização','privatizacao','resultado','lucro',
  'receita','faturamento','crescimento','contração','crise','liquidez',
];

// ─── CLASSIFICAÇÃO DE REGIÃO ─────────────────────────────────────────────────
const REGIONS = [
  { tag: 'BR', words: ['brasil','brasileiro','brasileira','copom','selic','ibovespa','bcb','banco central do brasil','lula','haddad','fazenda','real ','brl'] },
  { tag: 'US', words: ['eua','estados unidos','fed','federal reserve','washington','wall street','nasdaq','dow jones','powell','casa branca','treasury','s&p','silicon valley','new york'] },
  { tag: 'EA', words: ['bce','zona do euro','europa','europeu','europeia','alemanha','frança','lagarde','euro ','ecb','frankfurt'] },
  { tag: 'CN', words: ['china','chinês','chinesa','pequim','yuan','pboc','xangai','beijing','shanghai'] },
  { tag: 'JP', words: ['japão','japonês','japonesa','tóquio','boj','iene','tokyo'] },
  { tag: 'GB', words: ['reino unido','england','uk ','gbp','libra esterlina','london','banco da inglaterra','boe'] },
];

function classifyRegion(title) {
  const t = title.toLowerCase();
  for (const r of REGIONS) {
    if (r.words.some(w => t.includes(w))) return r.tag;
  }
  return 'GLOBAL';
}

function passesFilter(title, feed) {
  const t = title.toLowerCase();
  // Rejeita fofoca/esporte
  if (EXCLUDE.some(k => t.includes(k))) return false;
  // Para feeds em inglês (Wall Street, Macro, Geo, Corporativo): aceita direto
  if (feed.lang === 'en') return true;
  // Para feeds em português: confirma que é conteúdo de mercado
  return FINANCE_CONFIRM.some(k => t.includes(k));
}

function parseRss(xml, feed) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
  return items.map(item => {
    const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]
      ?.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim() || '';
    const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1]
      ?.trim() || '';
    const pubDateRaw = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const pubDate = pubDateRaw ? new Date(pubDateRaw) : null;
    return { title, url: link, pubDate, source: feed.source, category: feed.category };
  }).filter(i => i.title && i.url && i.pubDate && !isNaN(i.pubDate));
}

async function run() {
  console.log(`🕐 Iniciando coleta — ${new Date().toISOString()}`);
  let allItems = [];

  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PulsoDashboard/2.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
        timeout: 12000,
      });
      if (!res.ok) { console.log(`⚠️  ${feed.source}: HTTP ${res.status}`); continue; }
      const xml = await res.text();
      const items = parseRss(xml, feed);
      const filtered = items.filter(i => passesFilter(i.title, feed));
      allItems = allItems.concat(filtered);
      console.log(`✅ ${feed.source}: ${filtered.length}/${items.length} manchetes aprovadas`);
    } catch (err) {
      console.log(`⚠️  ${feed.source}: ${err.message}`);
    }
  }

  // Remove duplicatas por título similar
  const seen = new Set();
  const unique = allItems.filter(i => {
    const key = i.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Ordena do mais recente pro mais antigo
  unique.sort((a, b) => b.pubDate - a.pubDate);

  console.log(`\n📰 Total aprovado: ${unique.length} manchetes únicas`);

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

    const { error } = await supabase
      .from('news')
      .upsert(rows, { onConflict: 'url', ignoreDuplicates: true });
    if (error) throw error;
    console.log(`✅ ${rows.length} manchetes salvas no Supabase.`);
  } else {
    console.log('Nenhuma manchete nova nessa rodada.');
  }

  // Limpeza: mantém só 48h no radar
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { error: delError } = await supabase
    .from('news').delete().eq('region', 'radar').lt('published_at', cutoff);
  if (delError) console.log(`⚠️  Limpeza: ${delError.message}`);
  else console.log('🧹 Notícias com mais de 48h removidas.');
}

run().catch(err => { console.error('❌ Falha:', err.message); process.exitCode = 1; });
