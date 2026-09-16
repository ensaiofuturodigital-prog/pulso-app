import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// =============================================================
// BREAKING NEWS — palavras que indicam notícia muito importante
// =============================================================
const BREAKING_KEYWORDS = [
  // Decisões de banco central
  'fed eleva', 'fed corta', 'fed mantém', 'fed sobe', 'fed reduz',
  'copom eleva', 'copom corta', 'copom mantém', 'copom sobe', 'copom reduz',
  'banco central eleva', 'banco central corta', 'banco central sobe',
  'bce eleva', 'bce corta', 'pboc eleva', 'boj eleva', 'juros sobem', 'juros caem',
  'selic sobe', 'selic cai', 'selic eleva', 'selic reduz',
  // Crises e emergências
  'colapso', 'colapsa', 'crash', 'crise', 'emergência', 'emergencia',
  'recessão confirmada', 'recessao confirmada', 'default', 'calote',
  'falência', 'falencia', 'quebra',
  // Guerras e geopolítica grave
  'guerra', 'ataque', 'invasão', 'invasao', 'sanções imediatas', 'sancoes imediatas',
  'conflito armado', 'golpe de estado', 'estado de emergência',
  // Mercados em colapso
  'circuit breaker', 'circuit-breaker', 'bolsa despenca', 'bolsa cai', 'bolsa afunda',
  'ibovespa despenca', 'ibovespa afunda', 'nasdaq despenca', 'dow jones despenca',
  'dólar dispara', 'dolar dispara', 'dólar rompe', 'dolar rompe',
  'petróleo despenca', 'petroleo despenca', 'petróleo dispara', 'petroleo dispara',
  'ouro dispara', 'ouro bate recorde',
  // Dados macro bombásticos
  'pib recua', 'pib contrai', 'pib desacelera', 'desemprego recorde',
  'inflação recorde', 'inflacao recorde', 'superávit recorde', 'deficit recorde',
  'resultado primário negativo', 'arcabouço fiscal rompido',
  // Corporativo crítico
  'fusão bilionária', 'fusao bilionaria', 'aquisição bilionária', 'aquisicao bilionaria',
  'ipo bilionário', 'ipo bilionario', 'mega fusão', 'mega fusao',
  // Breaking explícito
  'breaking', 'urgente', 'última hora', 'ultima hora', 'agora',
];

function isBreaking(title) {
  const t = title.toLowerCase();
  return BREAKING_KEYWORDS.some(k => t.includes(k));
}

function countryFlag(tag) {
  const flags = { BR: '🇧🇷', US: '🇺🇸', EA: '🇪🇺', CN: '🇨🇳', JP: '🇯🇵', GLOBAL: '🌐' };
  return flags[tag] || '🌐';
}

function categoryBadge(cat) {
  const badges = {
    'JUROS/BC':   '🏦',
    'COMMODITIES':'🛢️',
    'BOLSA':      '📈',
    'CÂMBIO':     '💱',
    'MACRO':      '📊',
    'FISCAL':     '📋',
    'M&A/CORP':   '🤝',
    'POLÍTICA':   '🏛️',
    'GLOBAL':     '🌐',
    'FINANÇAS':   '💰',
    'ECONOMIA':   '📉',
  };
  return badges[cat] || '📰';
}

function groupByCategory(items) {
  const groups = {};
  for (const n of items) {
    const cat = n.impact_tag || 'ECONOMIA';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(n);
  }
  return groups;
}

// =============================================================
// FORMATA UMA NOTÍCIA — com ou sem destaque de breaking
// =============================================================
function formatNewsLine(n) {
  const flag = countryFlag(n.country_tag);
  const breaking = isBreaking(n.title);

  if (breaking) {
    // Caixa de destaque total — chama atenção no feed do Telegram
    return (
      `┌─────────────────────────┐\n` +
      `│ ⚡ *BREAKING NEWS* ⚡\n` +
      `│ ${flag} *[${n.title}](${n.url})*\n` +
      `└─────────────────────────┘\n`
    );
  }

  return `${flag} [${n.title}](${n.url})\n`;
}

async function buildDigest() {
  const cutoff = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .eq('region', 'radar')
    .gte('published_at', cutoff)
    .order('published_at', { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) return null;

  const now = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date());

  const top = data.slice(0, 25);

  // Separar breaking das normais para exibir breaking primeiro
  const breakingItems = top.filter(n => isBreaking(n.title));
  const normalItems   = top.filter(n => !isBreaking(n.title));

  const PRIORITY = ['JUROS/BC', 'MACRO', 'FISCAL', 'BOLSA', 'CÂMBIO', 'COMMODITIES', 'M&A/CORP', 'POLÍTICA', 'GLOBAL', 'FINANÇAS', 'ECONOMIA'];

  let msg = `📰 *RADAR DE MERCADO* — ${now} (Brasília)\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // 1) BREAKING NEWS no topo — se houver
  if (breakingItems.length > 0) {
    msg += `🚨 *ATENÇÃO — NOTÍCIAS CRÍTICAS*\n\n`;
    for (const n of breakingItems) {
      msg += formatNewsLine(n);
    }
    msg += `\n`;
  }

  // 2) Demais notícias agrupadas por categoria
  const groups = groupByCategory(normalItems);
  let totalSent = breakingItems.length;

  for (const cat of PRIORITY) {
    const items = groups[cat];
    if (!items || items.length === 0) continue;

    msg += `${categoryBadge(cat)} *${cat}*\n`;
    for (const n of items.slice(0, 4)) {
      msg += formatNewsLine(n);
      totalSent++;
    }
    msg += '\n';
  }

  if (data.length > totalSent) {
    msg += `_📌 + ${data.length - totalSent} outras manchetes disponíveis no site._\n`;
  }

  msg += `\n_Fonte: Reuters, InfoMoney, CNBC, MarketWatch, FT e mais_`;
  return msg;
}

async function sendTelegram(text) {
  const MAX = 4000;
  const chunks = [];
  let remaining = text;
  while (remaining.length > MAX) {
    let cut = remaining.lastIndexOf('\n', MAX);
    if (cut === -1) cut = MAX;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut + 1);
  }
  chunks.push(remaining);

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  for (const chunk of chunks) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: chunk,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram: ${JSON.stringify(data)}`);
  }
  console.log(`✅ Radar enviado (${chunks.length} parte(s)).`);
}

async function run() {
  const msg = await buildDigest();
  if (!msg) { console.log('Nenhuma notícia nova — nada pra enviar.'); return; }
  await sendTelegram(msg);
}

run().catch(err => { console.error('❌ Falha:', err.message); process.exitCode = 1; });
