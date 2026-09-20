import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function log(note, detail) {
  await supabase.from('debug_log').insert({ note, detail });
  console.log(note, JSON.stringify(detail));
}

async function run() {
  const chatRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat?chat_id=${encodeURIComponent(TELEGRAM_CHAT_ID)}`);
  const chat = await chatRes.json();
  await log('getChat_after_fix', { is_forum: chat.result ? chat.result.is_forum : null, ok: chat.ok });

  const sendRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: '✅ Teste final Pulso — grupo simples, sem tópicos. Se você está vendo isso no grupo, está tudo funcionando.',
    }),
  });
  const send = await sendRes.json();
  await log('sendMessage_final_test', send);
}

run().catch(async (err) => {
  await log('final_test_error', { message: err.message });
  process.exitCode = 1;
});
