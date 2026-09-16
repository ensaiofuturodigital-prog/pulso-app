import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

async function sendMsg(text) {
  const r = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'Markdown' })
  });
  const d = await r.json();
  console.log('Telegram:', d.ok ? 'OK' : JSON.stringify(d));
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let msg = '*🔍 DIAGNÓSTICO PULSO*\n\n';

// Secrets
msg += `SUPABASE_URL: ${SUPABASE_URL ? '✅' : '❌ VAZIA'}\n`;
msg += `SUPABASE_KEY: ${SUPABASE_KEY ? '✅' : '❌ VAZIA'}\n`;
msg += `BOT_TOKEN: ${BOT ? '✅' : '❌ VAZIA'}\n`;
msg += `CHAT_ID: ${CHAT || '❌ VAZIO'}\n\n`;

// Total na tabela
const { count: total, error: e1 } = await supabase.from('news').select('*', {count:'exact',head:true});
msg += `Total news na tabela: ${total ?? 'erro: '+e1?.message}\n`;

// Com region=radar
const { count: radar, error: e2 } = await supabase.from('news').select('*', {count:'exact',head:true}).eq('region','radar');
msg += `News region=radar: ${radar ?? 'erro: '+e2?.message}\n`;

// Últimas 7h
const c7 = new Date(Date.now() - 7*3600000).toISOString();
const { data: d7, error: e3 } = await supabase.from('news').select('published_at').eq('region','radar').gte('published_at',c7).order('published_at',{ascending:false}).limit(3);
msg += `Nas últimas 7h: ${d7?.length ?? 'erro: '+e3?.message} notícias\n`;
if (d7?.length) msg += `Mais recente: ${d7[0].published_at}\n`;

// Última notícia de qualquer hora
const { data: last, error: e4 } = await supabase.from('news').select('published_at,title').eq('region','radar').order('published_at',{ascending:false}).limit(1);
if (last?.[0]) msg += `\nÚltima notícia no banco:\n${last[0].published_at}\n${last[0].title}\n`;

await sendMsg(msg);
console.log('Diagnóstico enviado ao Telegram!');
