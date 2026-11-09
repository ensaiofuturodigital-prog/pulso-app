import { archiveAndPrune } from './lib/news-archive.js';
import { ehUrgente, mensagemUrgente } from './lib/noticias-regras.js';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── TRADUÇÃO ──────────────────────────────────────────────────────────────
// Google Translate (endpoint público, sem API key) como principal — aguenta
// bem mais volume que o MyMemory. MyMemory fica como reserva, e só se ambos
// falharem é que o título original em inglês é mantido.
// Timeout curto (8s) é essencial aqui: sem ele, uma única chamada travada
// nesses endpoints públicos (sem SLA) prendia o script inteiro — e com
// `cancel-in-progress: false` no workflow, isso enfileirava TODAS as
// próximas execuções (mesmo as agendadas) atrás da travada, por horas,
// até o timeout de 6h do próprio job do GitHub Actions. Foi a causa real
// por trás dos atrasos enormes e aparentemente aleatórios do Radar.
async function fetchComTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function translateGoogle(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetchComTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // Formato: [[["texto traduzido","texto original",null,null,...], ...], ...]
  const translated = data?.[0]?.map(chunk => chunk[0]).join('') || '';
  if (!translated) throw new Error('resposta vazia');
  return translated;
}

async function translateMyMemory(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|pt-BR`;
  const res = await fetchComTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await res.json();
  const translated = data.responseData?.translatedText;
  if (!translated || translated === text) throw new Error('sem tradução');
  return translated;
}

async function translateToPortuguese(text) {
  try {
    return await translateGoogle(text);
  } catch {
    try {
      return await translateMyMemory(text);
    } catch {
      return text; // falha silenciosa — mantém original só se os dois falharem
    }
  }
}

// Detecta se o título está em inglês (feeds com lang='en')
// Traduz em paralelo (lotes de 10 por vez) — com os ~700-800 títulos em
// inglês que o radar coleta por execução (8 feeds globais + política
// EUA/UE sem filtro de palavra-chave), traduzir um de cada vez levava
// quase 10 minutos e arriscava estourar o timeout do job. Em lotes de 10,
// o mesmo volume termina em menos de 1 minuto, continuando educado com a
// API gratuita (pausa entre lotes, não entre itens individuais).
async function translateBatch(items) {
  const toTranslate = items.filter(i => i.lang === 'en');
  console.log(`🔤 Traduzindo ${toTranslate.length} títulos em inglês...`);

  const LOTE = 10;
  for (let i = 0; i < toTranslate.length; i += LOTE) {
    const lote = toTranslate.slice(i, i + LOTE);
    await Promise.all(lote.map(async item => {
      item.title = await translateToPortuguese(item.title);
    }));
    // Pequena pausa entre lotes para não sobrecarregar a API (1000 req/dia gratuitas)
    if (i + LOTE < toTranslate.length) await new Promise(r => setTimeout(r, 200));
  }
  return items;
}

// ─── FEEDS RSS ────────────────────────────────────────────────────────────────
const FEEDS = [
  { url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Economia BR', lang: 'pt', category: 'MACRO' },
  { url: 'https://news.google.com/rss/search?q=Fed+OR+BCE+OR+%22banco+central%22+OR+Copom+OR+Selic&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Bancos Centrais', lang: 'pt', category: 'JUROS/BC' },
  { url: 'https://news.google.com/rss/search?q=d%C3%B3lar+OR+c%C3%A2mbio+OR+ibovespa+OR+%22bolsa+de+valores%22&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Mercado BR', lang: 'pt', category: 'BOLSA' },
  { url: 'https://news.google.com/rss/search?q=petr%C3%B3leo+OR+ouro+OR+soja+OR+commodities+OR+brent&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Commodities', lang: 'pt', category: 'COMMODITIES' },
  { url: 'https://news.google.com/rss/search?q=%22arcabou%C3%A7o+fiscal%22+OR+%22reforma+tribut%C3%A1ria%22+OR+%22d%C3%ADvida+p%C3%BAblica%22+OR+%22tesouro+nacional%22&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Fiscal BR', lang: 'pt', category: 'FISCAL' },
  { url: 'https://news.google.com/rss/search?q=nasdaq+OR+%22S%26P+500%22+OR+%22dow+jones%22+OR+%22wall+street%22&hl=en-US&gl=US&ceid=US:en', source: 'Wall Street', lang: 'en', category: 'BOLSA' },
  { url: 'https://news.google.com/rss/search?q=inflation+OR+recession+OR+%22interest+rates%22+OR+%22central+bank%22+OR+GDP+OR+IMF&hl=en-US&gl=US&ceid=US:en', source: 'Macro Global', lang: 'en', category: 'MACRO' },
  { url: 'https://news.google.com/rss/search?q=tariffs+OR+sanctions+OR+%22trade+war%22+OR+%22china+economy%22+OR+opec&hl=en-US&gl=US&ceid=US:en', source: 'Geopolítica', lang: 'en', category: 'POLÍTICA' },
  { url: 'https://news.google.com/rss/search?q=earnings+OR+merger+OR+acquisition+OR+IPO+OR+%22stock+market%22&hl=en-US&gl=US&ceid=US:en', source: 'Corporativo', lang: 'en', category: 'M&A/CORP' },
  { url: 'https://news.google.com/rss/search?q=%22governo+federal%22+OR+%22reforma%22+OR+%22privatiza%C3%A7%C3%A3o%22+OR+haddad+OR+%22minist%C3%A9rio+da+fazenda%22&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Política BR', lang: 'pt', category: 'POLÍTICA' },
  { url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html', source: 'CNBC Economy', lang: 'en', category: 'MACRO' },
  { url: 'https://feeds.marketwatch.com/marketwatch/topstories/', source: 'MarketWatch', lang: 'en', category: 'BOLSA' },
  // ─── Fontes adicionadas (16/10/2026) ───
  // Busca pública do Google Notícias filtrada por site: só títulos e links, sem copiar o texto.
  { url: 'https://news.google.com/rss/search?q=site:bloomberg.com+(economy+OR+markets+OR+inflation+OR+%22central+bank%22+OR+Fed)&hl=en-US&gl=US&ceid=US:en', source: 'Bloomberg', lang: 'en', category: 'MACRO' },
  { url: 'https://news.google.com/rss/search?q=site:reuters.com+(economy+OR+markets+OR+inflation+OR+%22central+bank%22+OR+tariffs)&hl=en-US&gl=US&ceid=US:en', source: 'Reuters', lang: 'en', category: 'MACRO' },
  { url: 'https://news.google.com/rss/search?q=site:valor.globo.com+(juros+OR+d%C3%B3lar+OR+ibovespa+OR+infla%C3%A7%C3%A3o+OR+fiscal)&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Valor Econômico', lang: 'pt', category: 'MACRO' },
  { url: 'https://news.google.com/rss/search?q=site:infomoney.com.br+(juros+OR+d%C3%B3lar+OR+ibovespa+OR+infla%C3%A7%C3%A3o+OR+Copom)&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'InfoMoney', lang: 'pt', category: 'BOLSA' },
  { url: 'https://news.google.com/rss/search?q=site:g1.globo.com/economia+(juros+OR+d%C3%B3lar+OR+infla%C3%A7%C3%A3o+OR+Copom+OR+fiscal)&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'G1 Economia', lang: 'pt', category: 'MACRO' },
  // Brasil: jornais e órgãos oficiais (busca pública do Google Notícias filtrada por site; só títulos e links)
  { url: 'https://news.google.com/rss/search?q=site:estadao.com.br/economia+(juros+OR+d%C3%B3lar+OR+infla%C3%A7%C3%A3o+OR+fiscal+OR+Copom)&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Estadão Economia', lang: 'pt', category: 'MACRO' },
  { url: 'https://news.google.com/rss/search?q=site:folha.uol.com.br/mercado+(juros+OR+d%C3%B3lar+OR+infla%C3%A7%C3%A3o+OR+fiscal+OR+Copom)&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Folha Mercado', lang: 'pt', category: 'MACRO' },
  { url: 'https://news.google.com/rss/search?q=site:exame.com+(bolsa+OR+ibovespa+OR+d%C3%B3lar+OR+juros)&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Exame', lang: 'pt', category: 'BOLSA' },
  { url: 'https://news.google.com/rss/search?q=site:moneytimes.com.br+(ibovespa+OR+d%C3%B3lar+OR+juros+OR+Selic)&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Money Times', lang: 'pt', category: 'BOLSA' },
  { url: 'https://news.google.com/rss/search?q=site:agenciabrasil.ebc.com.br+(economia+OR+infla%C3%A7%C3%A3o+OR+juros+OR+fiscal)&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Agência Brasil', lang: 'pt', category: 'MACRO' },
  { url: 'https://news.google.com/rss/search?q=site:bcb.gov.br+(Copom+OR+Selic+OR+infla%C3%A7%C3%A3o+OR+comunicado)&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Banco Central', lang: 'pt', category: 'JUROS/BC' },
  { url: 'https://news.google.com/rss/search?q=site:gov.br/cvm+(comunicado+OR+regra+OR+resolu%C3%A7%C3%A3o+OR+mercado)&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'CVM', lang: 'pt', category: 'B3' },
  { url: 'https://news.google.com/rss/search?q=site:gov.br/tesouronacional+(d%C3%ADvida+OR+fiscal+OR+leil%C3%A3o)&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Tesouro Nacional', lang: 'pt', category: 'FISCAL' },
  // ─── Política: Brasil, EUA e União Europeia (05/11/2026) ───
  // semFiltro: política não usa a lista de palavras financeiras, só a lista de exclusão (esportes, celebridades etc.).
  { url: 'https://news.google.com/rss/search?q=%22Congresso+Nacional%22+OR+Planalto+OR+STF+OR+%22C%C3%A2mara+dos+Deputados%22+OR+%22Senado+Federal%22+OR+Lula&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Política Brasil', lang: 'pt', category: 'POLÍTICA', semFiltro: true, regiao: 'BR' },
  { url: 'https://news.google.com/rss/search?q=site:g1.globo.com/politica&hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'G1 Política', lang: 'pt', category: 'POLÍTICA', semFiltro: true, regiao: 'BR' },
  { url: 'https://news.google.com/rss/search?q=Trump+OR+%22White+House%22+OR+Congress+OR+Senate+OR+%22Supreme+Court%22&hl=en-US&gl=US&ceid=US:en', source: 'Política EUA', lang: 'en', category: 'POLÍTICA', regiao: 'US' },
  { url: 'https://news.google.com/rss/search?q=%22European+Union%22+OR+%22European+Commission%22+OR+%22European+Parliament%22+OR+Brussels+OR+%22EU+leaders%22&hl=en-US&gl=US&ceid=US:en', source: 'Política União Europeia', lang: 'en', category: 'POLÍTICA', regiao: 'EA' },
  // B3 oficial: mapa de notícias público do Bora Investir (formato sitemap de notícias)
  { url: 'https://borainvestir.b3.com.br/news-sitemap.xml', source: 'B3', lang: 'pt', category: 'B3', tipo: 'sitemap' },
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
  { tag: 'BR', words: ['brasil','brasileiro','brasileira','copom','selic','ibovespa','lula','haddad','fazenda','planalto','congresso nacional','câmara dos deputados','camara dos deputados','stf','tse','senado federal'] },
  { tag: 'US', words: ['eua','estados unidos','fed','federal reserve','wall street','nasdaq','dow jones','powell','treasury','trump','casa branca','white house','congresso americano','republicanos','democratas','washington'] },
  { tag: 'EA', words: ['bce','zona do euro','europa','europeu','alemanha','lagarde','ecb','união europeia','uniao europeia','comissão europeia','comissao europeia','parlamento europeu','bruxelas','european union','brussels'] },
  { tag: 'CN', words: ['china','chinês','yuan','pboc','xangai','beijing'] },
  { tag: 'JP', words: ['japão','japonês','tóquio','boj','iene'] },
];

function classifyRegion(title) {
  const t = title.toLowerCase();
  for (const r of REGIONS) if (r.words.some(w => t.includes(w))) return r.tag;
  return 'GLOBAL';
}

function passes(title, lang, semFiltro = false) {
  const t = title.toLowerCase();
  if (EXCLUDE.some(k => t.includes(k))) return false;
  if (lang === 'en' || semFiltro) return true;
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

// Sitemap de notícias (formato Google News): <url><loc>…</loc><news:news><news:title>…</news:title><news:publication_date>…</news:publication_date></news:news></url>
function parseSitemap(xml, feed) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => {
    const b = m[1];
    const pick = (re) => (b.match(re) || [])[1]?.replace(/(<!\[CDATA\[|\]\]>)/g, '').trim() || '';
    const title = pick(/<news:title>([\s\S]*?)<\/news:title>/);
    const url   = pick(/<loc>([\s\S]*?)<\/loc>/);
    const pub   = pick(/<news:publication_date>([\s\S]*?)<\/news:publication_date>/) || pick(/<lastmod>([\s\S]*?)<\/lastmod>/);
    const date  = pub ? new Date(pub) : null;
    return { title, url, pubDate: date, source: feed.source, category: feed.category, lang: feed.lang };
  }).filter(i => i.title && i.url && i.pubDate && !isNaN(i.pubDate));
}

function parseRss(xml, feed) {
  if (feed.tipo === 'sitemap') return parseSitemap(xml, feed);
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const block = m[1];
    const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]
      ?.replace(/(<!\[CDATA\[|\]\]>)/g, '').trim() || '';
    const link  = (block.match(/<link>([\s\S]*?)<\/link>/)   || [])[1]?.trim() || '';
    const pub   = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const date  = pub ? new Date(pub) : null;
    return { title, url: link, pubDate: date, source: feed.source, category: feed.category, lang: feed.lang, regiao: feed.regiao };
  }).filter(i => i.title && i.url && i.pubDate && !isNaN(i.pubDate) && passes(i.title, feed.lang, feed.semFiltro));
}

// ─── ALERTA URGENTE IMEDIATO ───────────────────────────────────────────────
// Notícia urgente (camada 1) sai na hora, sem esperar o horário do resumo.
// Só envia notícias publicadas nas últimas 2 horas e cada link uma única vez.
const ENVIAR_URGENTE = process.env.ENVIAR_URGENTE === 'true';
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

async function enviarUrgentes(items) {
  if (!ENVIAR_URGENTE) { console.log('Alerta urgente imediato desligado (ENVIAR_URGENTE != true).'); return; }
  const limite = Date.now() - 2 * 3600000;
  const urgentes = items.filter(i => ehUrgente(i.title) && i.pubDate && i.pubDate.getTime() >= limite);
  for (const n of urgentes) {
    const slot = 'urgente_' + createHash('sha1').update(n.url).digest('hex').slice(0, 24);
    const { error } = await supabase.from('telegram_sends').insert({ slot });
    if (error) { if (error.code === '23505') continue; throw error; }
    const texto = mensagemUrgente({ titulo: n.title, fonte: n.source, url: n.url, regiao: n.regiao || classifyRegion(n.title) });
    const res = await fetchComTimeout(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: texto, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram: ${JSON.stringify(data)}`);
    console.log(`🚨 Urgente enviado: ${n.title.slice(0, 80)}`);
  }
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
      country_tag: i.regiao || classifyRegion(i.title),
    }));
    const { error } = await supabase.from('news').upsert(rows, { onConflict: 'url', ignoreDuplicates: true });
    if (error) throw error;
    console.log(`✅ ${rows.length} salvas no banco em português.`);
    await enviarUrgentes(translated);
  }

  // Painel guarda 48h; antes de sair do painel, a notícia é ARQUIVADA em news_archive (nada se perde).
  const cutoff = new Date(Date.now() - 48 * 3600000).toISOString();
  const r = await archiveAndPrune(supabase, cutoff);
  console.log(`🗄️ Arquivadas ${r.archived} notícias; ${r.removed} saíram do painel (mais de 48h).`);
}

run().catch(err => { console.error('❌', err.message); process.exitCode = 1; });
