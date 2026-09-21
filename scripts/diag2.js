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

async function call(method, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}${qs ? '?' + qs : ''}`);
  return res.json();
}

async function run() {
  await log('diag2_env', {
    chat_id_env: TELEGRAM_CHAT_ID,
    token_present: !!TELEGRAM_BOT_TOKEN,
    token_len: TELEGRAM_BOT_TOKEN ? TELEGRAM_BOT_TOKEN.length : 0,
  });

  const me = await call('getMe');
  await log('diag2_getMe', me);

  const chat = await call('getChat', { chat_id: TELEGRAM_CHAT_ID });
  await log('diag2_getChat', chat);

  const member = await call('getChatMember', { chat_id: TELEGRAM_CHAT_ID, user_id: me.result ? me.result.id : '' });
  await log('diag2_getChatMember_bot', member);

  const send = await call('sendMessage', {
    chat_id: TELEGRAM_CHAT_ID,
    text: `🔧 Diagnóstico Pulso #2 — ${new Date().toISOString()}`,
  });
  // sendMessage via GET with params object won't URL-encode JSON body properly for POST-style call() helper (uses GET/query string), so redo as POST for reliability
  const sendPost = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: `🔧 Diagnóstico Pulso #2 (POST) — ${new Date().toISOString()}` }),
  });
  const sendPostData = await sendPost.json();
  await log('diag2_sendMessage_POST', sendPostData);
}

run().catch(async (err) => {
  await log('diag2_fatal', { message: err.message, stack: err.stack });
  process.exitCode = 1;
});
