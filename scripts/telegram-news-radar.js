import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

// Agrupa notícias por categoria para o digest
function groupByCategory(items) {
  const groups = {};
  for (const n of items) {
    const cat = n.impact_tag || 'ECONOMIA';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(n);
  }
  return groups;
}

async function buildDigest() {
  // Janela de 7h: cobre com folga o maior intervalo entre os horários fixos
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

  // Limita a 25 notícias mais recentes para não exceder o limite do Telegram
  const top = data.slice(0, 25);
  const groups = groupByCategory(top);

  // Ordem de prioridade das categorias (o que o gestor lê primeiro)
  const PRIORITY = ['JUROS/BC', 'MACRO', 'FISCAL', 'BOLSA', 'CÂMBIO', 'COMMODITIES', 'M&A/CORP', 'POLÍTICA', 'GLOBAL', 'FINANÇAS', 'ECONOMIA'];

  let msg = `📰 *RADAR DE MERCADO* — ${now} (Brasília)\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  let totalSent = 0;
  for (const cat of PRIORITY) {
    const items = groups[cat];
    if (!items || items.length === 0) continue;

    msg += `${categoryBadge(cat)} *${cat}*\n`;
    for (const n of items.slice(0, 4)) { // máx 4 por categoria
      const flag = countryFlag(n.country_tag);
      const time = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
      }).format(new Date(n.published_at));
      msg += `${flag} ${time} — [${n.title}](${n.url})\n`;
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
  // Telegram tem limite de 4096 caracteres por mensagem
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
