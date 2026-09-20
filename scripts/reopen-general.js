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

async function call(method, params) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function run() {
  const reopen = await call('reopenGeneralForumTopic', { chat_id: TELEGRAM_CHAT_ID });
  await log('reopenGeneralForumTopic', reopen);

  const unhide = await call('unhideGeneralForumTopic', { chat_id: TELEGRAM_CHAT_ID });
  await log('unhideGeneralForumTopic', unhide);

  const test = await call('sendMessage', {
    chat_id: TELEGRAM_CHAT_ID,
    text: '✅ Tópico Geral reaberto — envios automáticos do Pulso normalizados.',
  });
  await log('sendMessage_after_reopen', test);
}

run().catch(async (err) => {
  await log('reopen_fatal_error', { message: err.message });
  process.exitCode = 1;
});
