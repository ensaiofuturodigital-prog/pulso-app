import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── BREAKING — reservado só pra eventos raros e de impacto direto e imediato
// no mercado (decisão de juros, crash, calote). Termos genéricos como "crise"
// ou "guerra" foram removidos de propósito — eles aparecem quase todo dia em
// notícia de macro/geopolítica normal e não são "breaking" de verdade.
const BREAKING_KEYWORDS = [
  'fed eleva','fed corta','fed mantém','fed sobe','fed reduz',
  'copom eleva','copom corta','copom mantém','copom sobe','copom reduz',
  'selic sobe','selic cai','selic eleva','selic reduz',
  'bce eleva','bce corta',
  'circuit breaker','bolsa despenca','bolsa afunda','ibovespa despenca',
  'nasdaq despenca','dow jones despenca',
  'dólar dispara','dolar dispara','dólar rompe','dolar rompe',
  'calote','default soberano','moratória','moratoria',
  'recessão confirmada','recessao confirmada',
];

function isBreaking(title) {
  const t = title.toLowerCase();
  return BREAKING_KEYWORDS.some(k => t.includes(k));
}

// ─── ÍCONES POR CATEGORIA (alinhados com o novo fetch-news-radar.js) ──────────
const CAT_ICON = {
  MACRO:       '📊',
  JUROS:       '🏦',
  MERCADO:     '📈',
  COMMODITIES: '🛢️',
  FISCAL:      '📋',
  GEO:         '🌍',
  CORPORATIVO: '🤝',
  POLITICA:    '🏛️',
};

const CAT_LABEL = {
  MACRO:       'MACRO GLOBAL',
  JUROS:       'JUROS / BANCOS CENTRAIS',
  MERCADO:     'MERCADO',
  COMMODITIES: 'COMMODITIES',
  FISCAL:      'FISCAL',
  GEO:         'GEOPOLÍTICA',
  CORPORATIVO: 'CORPORATIVO',
  POLITICA:    'POLÍTICA / ECONOMIA BR',
};

const CAT_ORDER = ['JUROS','MACRO','FISCAL','MERCADO','COMMODITIES','GEO','CORPORATIVO','POLITICA'];

const FLAG = { BR:'🇧🇷', US:'🇺🇸', EA:'🇪🇺', CN:'🇨🇳', JP:'🇯🇵', GB:'🇬🇧', GLOBAL:'🌐' };

function flag(tag) { return FLAG[tag] || '🌐'; }

function formatLine(n) {
  const f = flag(n.country_tag);
  if (isBreaking(n.title)) {
    return `⚡ *BREAKING* — ${f} [${n.title}](${n.url})\n`;
  }
  return `${f} [${n.title}](${n.url})\n`;
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

  // Separa breaking das demais
  const breaking = data.filter(n => isBreaking(n.title)).slice(0, 5);
  const normal   = data.filter(n => !isBreaking(n.title));

  // Agrupa por categoria
  const groups = {};
  for (const n of normal) {
    const cat = n.impact_tag || 'MACRO';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(n);
  }

  let msg = `📰 *RADAR DE MERCADO* — ${now} (Brasília)\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Breaking no topo
  if (breaking.length > 0) {
    msg += `🚨 *ATENÇÃO — NOTÍCIAS CRÍTICAS*\n\n`;
    for (const n of breaking) msg += formatLine(n);
    msg += '\n';
  }

  // Por categoria na ordem de prioridade
  let totalSent = breaking.length;
  for (const cat of CAT_ORDER) {
    const items = groups[cat];
    if (!items || items.length === 0) continue;
    const icon = CAT_ICON[cat] || '📰';
    const label = CAT_LABEL[cat] || cat;
    msg += `${icon} *${label}*\n`;
    for (const n of items.slice(0, 4)) {
      msg += formatLine(n);
      totalSent++;
    }
    msg += '\n';
  }

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

// ─── DECISÃO DE ENVIO — não depende do GitHub Actions rodar no minuto exato ───
// O cron do GitHub é "melhor esforço" e pode atrasar bastante quando roda a
// cada poucos minutos. Por isso: janela larga (55 min) ao redor de cada
// horário-alvo + trava de duplicidade no Supabase (garante 1 envio por slot,
// mesmo que o workflow rode várias vezes dentro da mesma janela).
const SEND_TARGETS_BRT = ['04:38', '06:38', '08:38', '11:38', '18:38'];
const TOLERANCE_MIN = 55;

function nowInBrasilia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t).value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10),
  };
}

function findMatchingSlot() {
  const { date, hour, minute } = nowInBrasilia();
  const nowMin = hour * 60 + minute;
  for (const t of SEND_TARGETS_BRT) {
    const [th, tm] = t.split(':').map(Number);
    const targetMin = th * 60 + tm;
    let diff = nowMin - targetMin;
    if (diff < -720) diff += 1440;   // trata virada de dia nos dois sentidos
    if (diff > 720) diff -= 1440;
    if (Math.abs(diff) <= TOLERANCE_MIN) {
      return `${date}_${t}`;
    }
  }
  return null;
}

async function claimSlot(slot) {
  const { error } = await supabase.from('telegram_sends').insert({ slot });
  if (error) {
    if (error.code === '23505') return false; // já enviado nesse slot — duplicata evitada
    throw error;
  }
  return true;
}

async function run() {
  const force = process.env.FORCE_SEND === 'true';
  let slot = null;

  if (!force) {
    slot = findMatchingSlot();
    if (!slot) {
      console.log(`⏭️  ${nowInBrasilia().hour}:${String(nowInBrasilia().minute).padStart(2, '0')} (Brasília) — fora da janela de envio, só coletando.`);
      return;
    }
    const claimed = await claimSlot(slot);
    if (!claimed) {
      console.log(`⏭️  Slot ${slot} já enviado anteriormente — evitando duplicata.`);
      return;
    }
  }

  const msg = await buildDigest();
  if (!msg) { console.log('Nenhuma notícia nova — nada pra enviar.'); return; }
  await sendTelegram(msg);
  console.log(force ? '✅ Envio forçado concluído.' : `✅ Slot ${slot} enviado com sucesso.`);
}

run().catch(err => { console.error('❌ Falha:', err.message); process.exitCode = 1; });

