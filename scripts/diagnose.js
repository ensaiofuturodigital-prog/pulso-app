import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

console.log('SUPABASE_URL definida?', !!SUPABASE_URL);
console.log('SUPABASE_KEY definida?', !!SUPABASE_KEY);
console.log('TELEGRAM_BOT_TOKEN definida?', !!TELEGRAM_BOT_TOKEN);
console.log('TELEGRAM_CHAT_ID:', TELEGRAM_CHAT_ID);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Verificar TOTAL de notícias na tabela
const { data: total, error: e1 } = await supabase.from('news').select('id', { count: 'exact', head: true });
console.log('Total notícias na tabela news:', total, 'Erro:', e1?.message);

// Verificar notícias com region=radar
const { data: radar, error: e2, count } = await supabase
  .from('news').select('*', { count: 'exact' }).eq('region', 'radar').limit(5);
console.log('Notícias region=radar (total):', count, 'Erro:', e2?.message);
if (radar?.length) {
  console.log('Exemplo:', radar[0]);
  console.log('published_at mais recente:', radar.map(r => r.published_at).sort().reverse()[0]);
}

// Verificar janela de 7h
const cutoff7h = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
const { data: janela, error: e3 } = await supabase
  .from('news').select('id').eq('region', 'radar').gte('published_at', cutoff7h);
console.log(`Notícias nas últimas 7h (desde ${cutoff7h}):`, janela?.length, 'Erro:', e3?.message);

// Verificar janela de 48h
const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
const { data: janela48, error: e4 } = await supabase
  .from('news').select('id').eq('region', 'radar').gte('published_at', cutoff48h);
console.log(`Notícias nas últimas 48h:`, janela48?.length, 'Erro:', e4?.message);

// Testar envio simples ao Telegram
import fetch from 'node-fetch';
const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;
const res = await fetch(url);
const bot = await res.json();
console.log('Bot Telegram ativo?', bot.ok, '| Nome:', bot.result?.first_name, '| Username:', bot.result?.username);
