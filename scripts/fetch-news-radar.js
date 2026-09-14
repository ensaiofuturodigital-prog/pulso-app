import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// =============================================================
// FEEDS RSS — 100% gratuitos, sem API key
// Foco: o que gestor de fundos, trader, executivo de banco e CEO
// realmente lêem todo dia. Estilo Bloomberg/Reuters.
// =============================================================
const FEEDS = [
  // --- BRASIL ---
  { url: 'https://feeds.reuters.com/reuters/BRbusiness', source: 'Reuters Brasil', region: 'BR' },
  { url: 'https://www.infomoney.com.br/feed/', source: 'InfoMoney', region: 'BR' },
  { url: 'https://exame.com/invest/feed/', source: 'Exame Invest', region: 'BR' },
  { url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', source: 'Agência Brasil Economia', region: 'BR' },
  { url: 'https://www.moneytimes.com.br/feed/', source: 'Money Times', region: 'BR' },
  { url: 'https://braziljournal.com/feed/', source: 'Brazil Journal', region: 'BR' },
  // Google News - Economia BR (fallback amplo)
  { url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Google News Economia BR', region: 'BR' },

  // --- GLOBAL / EUA ---
  { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters Business', region: 'US' },
  { url: 'https://feeds.reuters.com/reuters/topNews', source: 'Reuters World', region: 'GLOBAL' },
  { url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html', source: 'CNBC Economy', region: 'US' },
  { url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html', source: 'CNBC Markets', region: 'US' },
  { url: 'https://feeds.marketwatch.com/marketwatch/topstories/', source: 'MarketWatch', region: 'US' },
  { url: 'https://feeds.marketwatch.com/marketwatch/marketpulse/', source: 'MarketWatch Pulse', region: 'US' },
  { url: 'https://www.investing.com/rss/news.rss', source: 'Investing.com', region: 'GLOBAL' },
  { url: 'https://www.ft.com/world?format=rss', source: 'Financial Times', region: 'GLOBAL' },

  // --- GEOPOLÍTICA / MACRO (busca dirigida Google News) ---
  {
    url: 'https://news.google.com/rss/search?q=(Fed+OR+%22Federal+Reserve%22+OR+%22banco+central%22+OR+BCE+OR+PBOC+OR+BOJ+OR+tarifas+OR+sancoes+OR+%22guerra+comercial%22+OR+recessao+OR+inflacao+OR+juros+OR+PIB+OR+OCDE+OR+FMI+OR+%22Banco+Mundial%22)&hl=pt-BR&gl=BR&ceid=BR:pt-BR',
    source: 'Google News Macro Global', region: 'GLOBAL',
  },
  {
    url: 'https://news.google.com/rss/search?q=(treasury+OR+yield+OR+%22interest+rate%22+OR+%22trade+war%22+OR+tariff+OR+%22interest+rates%22+OR+recession+OR+inflation+OR+%22central+bank%22+OR+%22IMF%22+OR+%22World+Bank%22)&hl=en-US&gl=US&ceid=US:en',
    source: 'Google News Macro EN', region: 'US',
  },
  {
    url: 'https://news.google.com/rss/search?q=(petróleo+OR+commodities+OR+minério+OR+ouro+OR+cobre+OR+soja+OR+milho+OR+%22mercado+de+carbono%22+OR+%22energia+elétrica%22+OR+gás+natural)&hl=pt-BR&gl=BR&ceid=BR:pt-BR',
    source: 'Google News Commodities', region: 'GLOBAL',
  },
  {
    url: 'https://news.google.com/rss/search?q=(China+economia+OR+%22yuan%22+OR+%22PBOC%22+OR+%22crescimento+da+China%22+OR+%22exportações+China%22+OR+%22Japão+economia%22+OR+%22zona+do+euro%22+OR+%22BCE%22)&hl=pt-BR&gl=BR&ceid=BR:pt-BR',
    source: 'Google News Ásia+Europa', region: 'GLOBAL',
  },
  {
    url: 'https://news.google.com/rss/search?q=(política+fiscal+OR+reforma+tributária+OR+arcabouço+fiscal+OR+dívida+pública+OR+%22resultado+primário%22+OR+%22COPOM%22+OR+selic+OR+%22tesouro+direto%22+OR+%22mercado+de+crédito%22)&hl=pt-BR&gl=BR&ceid=BR:pt-BR',
    source: 'Google News Fiscal BR', region: 'BR',
  },
];

// =============================================================
// FILTRO DE EXCLUSÃO — o que nunca entra, independente da fonte
// =============================================================
const EXCLUDE_KEYWORDS = [
  // Esportes
  'futebol', 'campeonato', 'copa do mundo', 'libertadores', 'brasileirão', 'brasileirao',
  'esporte', 'esportes', 'olimpíada', 'olimpiada', 'paralimpíada', 'paralimpiada',
  'seleção brasileira', 'selecao brasileira', 'vôlei', 'volei', 'basquete', 'nba ', 'nfl ',
  'tênis', 'tenis', 'fórmula 1', 'formula 1', 'f1 ', 'mma', 'ufc', 'boxe', 'atleta',
  'medalha de ouro', 'medalha de prata', 'medalha de bronze', 'natação', 'natacao',
  'ginástica', 'ginastica', 'maratona', 'corrida de rua', 'jogador', 'gol ',
  // Entretenimento / fofoca
  'novela', 'bbb', 'big brother', 'reality show', 'celebridade', 'famosos',
  'grammy', 'oscar', 'cantor', 'cantora', 'ator ', 'atriz', 'horóscopo', 'receita de',
  'namoro', 'affair', 'k-pop', 'kpop', 'anime', 'filme ', 'cinema', 'estreia de',
  'serie da netflix', 'netflix', 'disney+', 'amazon prime video', 'videogame',
  'show de', 'turnê', 'turne', 'festival de música', 'festival de musica',
  // Beleza / lifestyle
  'beleza', 'maquiagem', 'skincare', 'cuidados com a pele', 'cabelo', 'penteado',
  'moda ', 'desfile de moda', 'dieta ', 'emagrecer',
  // Loteria
  'loteria', 'lotofácil', 'mega-sena', 'megasena', 'quina', 'dezenas sorteadas',
  'resultado do sorteio', 'super sete',
  // Produto / marketing de varejo
  'unboxing', 'cupom de desconto', 'liquidação de', 'promoção de',
  'combo de brinquedo', 'linha de brinquedos', 'cardápio especial',
];

// =============================================================
// PALAVRAS QUE CONFIRMAM relevância para mercado / macro
// =============================================================
const FINANCE_KEYWORDS = [
  'economia', 'econômico', 'economica', 'mercado', 'mercados', 'bolsa', 'ações', 'acao',
  'juros', 'inflação', 'inflacao', 'deflação', 'deflacao', 'pib', 'gdp',
  'dólar', 'dolar', 'câmbio', 'cambio', 'moeda', 'cotação', 'cotacao',
  'fed', 'federal reserve', 'bce', 'banco central', 'pboc', 'boj', 'copom', 'selic',
  'nikkei', 'ibovespa', 'nasdaq', 'dow jones', 's&p', 'sp500',
  'commodities', 'petróleo', 'petroleo', 'ouro', 'prata', 'cobre', 'soja', 'milho',
  'recessão', 'recessao', 'desemprego', 'emprego', 'tarifas', 'tariff', 'tariffs',
  'exportação', 'exportacao', 'importação', 'importacao', 'balança comercial',
  'dívida', 'divida', 'fiscal', 'treasury', 'yield', 'pmi', 'confiança do consumidor',
  'resultado primário', 'arcabouço fiscal', 'reforma tributária', 'reforma tributaria',
  'privatização', 'privatizacao', 'concessão', 'concessao', 'leilão', 'leilao',
  'fusão', 'fusao', 'aquisição', 'aquisicao', 'ipo', 'oferta pública',
  'banco', 'financeiro', 'crédito', 'credito', 'inadimplência', 'inadimplencia',
  'investidor', 'investimento', 'fundo', 'gestora', 'asset management',
  'política monetária', 'politica monetaria', 'política fiscal', 'politica fiscal',
  'geopolítica', 'geopolitica', 'sanção', 'sancao', 'embargo',
  'fmi', 'imf', 'banco mundial', 'world bank', 'ocde', 'g7', 'g20', 'brics',
];

// =============================================================
// CATEGORIAS — para exibir badges no Telegram
// =============================================================
function classifyCategory(title) {
  const t = title.toLowerCase();
  if (/fed|federal reserve|copom|selic|bce|pboc|boj|banco central|juros|política monetária|politica monetaria|yield|treasury/.test(t)) return 'JUROS/BC';
  if (/petróleo|petroleo|ouro|prata|cobre|soja|milho|commodit|gás natural|gas natural|minério|minerio/.test(t)) return 'COMMODITIES';
  if (/bolsa|ibovespa|nasdaq|dow jones|s&p|ações|acao|nikkei|mercado de capitais|ipo/.test(t)) return 'BOLSA';
  if (/dólar|dolar|câmbio|cambio|euro|yuan|iene|moeda|taxa de câmbio/.test(t)) return 'CÂMBIO';
  if (/inflação|inflacao|deflação|deflacao|pib|gdp|pmi|desemprego|emprego|varejo|consumidor/.test(t)) return 'MACRO';
  if (/fiscal|dívida|divida|resultado primário|arcabouço|reforma tributária|reforma tributaria|orçamento|orcamento/.test(t)) return 'FISCAL';
  if (/fusão|fusao|aquisição|aquisicao|m&a|oferta pública|oferta publica|ipo|concessão|concessao|leilão|leilao|privatização|privatizacao/.test(t)) return 'M&A/CORP';
  if (/trump|biden|lula|política|politica|governo|congresso|senado|câmara|camara|eleição|eleicao|geopolítica|geopolitica|sanção|sancao|guerra|conflito/.test(t)) return 'POLÍTICA';
  if (/fmi|imf|banco mundial|world bank|ocde|g7|g20|brics|global|mundial/.test(t)) return 'GLOBAL';
  if (/crédito|credito|banco|financeiro|inadimplência|inadimplencia|seguro|seguros|previdência|previdencia/.test(t)) return 'FINANÇAS';
  return 'ECONOMIA';
}

// =============================================================
// REGIÃO
// =============================================================
const REGION_RULES = [
  { tag: 'BR', words: ['brasil', 'brasileiro', 'brasileira', 'copom', 'selic', 'ibovespa', 'bcb', 'banco central do brasil', 'lula', 'haddad', 'campos neto', 'tesouro nacional', 'brasília', 'brasilia'] },
  { tag: 'US', words: ['eua', 'estados unidos', 'fed', 'federal reserve', 'washington', 'wall street', 'nasdaq', 'dow jones', 'powell', 'trump', 'biden', 'casa branca', 'congresso americano', 'treasury', 'bls', 'fomc'] },
  { tag: 'EA', words: ['bce', 'zona do euro', 'europa', 'europeu', 'europeia', 'alemanha', 'frança', 'lagarde', 'euro ', 'ecb', 'frankfurt', 'bundesbank'] },
  { tag: 'CN', words: ['china', 'chinês', 'chinesa', 'pequim', 'yuan', 'pboc', 'xangai', 'xi jinping', 'shenzhen'] },
  { tag: 'JP', words: ['japão', 'japao', 'japonês', 'japones', 'japonesa', 'tóquio', 'tokio', 'boj', 'iene', 'nikkei'] },
];
function classifyRegion(title) {
  const t = title.toLowerCase();
  for (const rule of REGION_RULES) {
    if (rule.words.some(w => t.includes(w))) return rule.tag;
  }
  return 'GLOBAL';
}

// =============================================================
// FILTRO PRINCIPAL
// =============================================================
function passesFilter(title, feedRegion) {
  const t = title.toLowerCase();
  // Bloqueia exclusões
  if (EXCLUDE_KEYWORDS.some(k => t.includes(k))) return false;
  // Se veio de um feed já especializado em finanças, aceita diretamente
  const trustedSources = ['Reuters', 'InfoMoney', 'Exame Invest', 'MarketWatch', 'CNBC', 'Financial Times', 'Investing.com', 'Money Times', 'Brazil Journal', 'Agência Brasil Economia'];
  // Para Google News genérico, exige pelo menos 1 palavra de finanças
  const isGoogle = feedRegion === undefined; // feeds google não têm region no parse
  if (!isGoogle) return true; // fonte especializada = aceita
  return FINANCE_KEYWORDS.some(k => t.includes(k));
}

// =============================================================
// PARSE RSS
// =============================================================
function parseRss(xml, source, feedRegion) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
  return items.map(item => {
    const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace('<![CDATA[', '').replace(']]>', '').trim() || '';
    const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const pubDateRaw = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const pubDate = pubDateRaw ? new Date(pubDateRaw) : null;
    return { title, url: link, pubDate, source, feedRegion };
  }).filter(i => i.title && i.pubDate && !isNaN(i.pubDate));
}

// =============================================================
// MAIN
// =============================================================
async function run() {
  let allItems = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PulsoNewsRadar/2.0)' },
        timeout: 15000,
      });
      if (!res.ok) { console.log(`⚠️  ${feed.source}: HTTP ${res.status}`); continue; }
      const xml = await res.text();
      const items = parseRss(xml, feed.source, feed.region);
      allItems = allItems.concat(items);
      console.log(`✅ ${feed.source}: ${items.length} manchetes lidas`);
    } catch (err) {
      console.log(`⚠️  ${feed.source}: ${err.message}`);
    }
  }

  // Deduplicação por título (normalizado)
  const seen = new Set();
  const unique = allItems.filter(i => {
    const key = i.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const filtered = unique.filter(i => passesFilter(i.title, i.feedRegion));
  console.log(`\n📊 ${filtered.length} de ${allItems.length} manchetes passaram no filtro (${unique.length} únicas).`);

  if (filtered.length > 0) {
    const rows = filtered.map(i => ({
      published_at: i.pubDate.toISOString(),
      source: i.source,
      title: i.title,
      url: i.url,
      impact_tag: classifyCategory(i.title),
      region: 'radar',
      country_tag: classifyRegion(i.title),
    }));

    const { error } = await supabase.from('news').upsert(rows, { onConflict: 'url', ignoreDuplicates: true });
    if (error) throw error;
    console.log(`✅ ${rows.length} manchetes processadas (novas + existentes ignoradas).`);
  } else {
    console.log('Nenhuma manchete nova pra registrar nessa rodada.');
  }

  // Limpeza: mantém só as últimas 48h
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { error: delError } = await supabase.from('news').delete().eq('region', 'radar').lt('published_at', cutoff);
  if (delError) console.log(`⚠️  Limpeza: ${delError.message}`);
}

run().catch(err => { console.error('❌ Falha:', err.message); process.exitCode = 1; });
