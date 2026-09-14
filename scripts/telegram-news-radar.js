import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function countryFlag(tag) {
  return tag === 'BR' ? '🇧🇷' : tag === 'US' ? '🇺🇸' : tag === 'EA' ? '🇪🇺' : tag === 'CN' ? '🇨🇳' : tag === 'JP' ? '🇯🇵' : '🌐';
}

async function buildDigest() {
  // Janela de 5h: cobre com folga o maior intervalo entre os horários fixos de disparo.
  const cutoff = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .eq('region', 'radar')
    .gte('published_at', cutoff)
    .order('published_at', { ascending: false });
  if (error) throw error;

  if (!data || data.length === 0) return null;

  let msg = `📰 *Radar de Notícias*\n\n`;
  msg += data.slice(0, 15).map(n => {
    const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(n.published_at));
    return `${countryFlag(n.country_tag)} ${time} — ${n.title}\n[Ler mais](${n.url})`;
  }).join('\n\n');

  if (data.length > 15) msg += `\n\n_+ ${data.length - 15} outras manchetes no site._`;

  return msg;
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram: ${JSON.stringify(data)}`);
  console.log('✅ Radar enviado pro grupo do Telegram.');
}

async function run() {
  const msg = await buildDigest();
  if (!msg) { console.log('Nenhuma notícia nova nas últimas 6h — nada pra enviar.'); return; }
  await sendTelegram(msg);
}

run().catch(err => { console.error('❌ Falha:', err.message); process.exitCode = 1; });
