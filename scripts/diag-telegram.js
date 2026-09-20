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
  await log('diag_start', {
    chat_id_env: TELEGRAM_CHAT_ID,
    token_present: !!TELEGRAM_BOT_TOKEN,
    token_length: TELEGRAM_BOT_TOKEN ? TELEGRAM_BOT_TOKEN.length : 0,
  });

  // 1) Confirma identidade do bot
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
    const me = await meRes.json();
    await log('getMe', me);
  } catch (e) {
    await log('getMe_error', { message: e.message });
  }

  // 2) Confirma o chat configurado
  try {
    const chatRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat?chat_id=${encodeURIComponent(TELEGRAM_CHAT_ID)}`);
    const chat = await chatRes.json();
    await log('getChat', chat);
  } catch (e) {
    await log('getChat_error', { message: e.message });
  }

  // 3) Tenta mandar uma mensagem de teste real
  try {
    const sendRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: '🔧 Teste de diagnóstico Pulso — se você está vendo isso, o envio está funcionando.',
      }),
    });
    const send = await sendRes.json();
    await log('sendMessage_test', send);
  } catch (e) {
    await log('sendMessage_test_error', { message: e.message });
  }

  await log('diag_end', {});
}

run().catch(async (err) => {
  await log('diag_fatal_error', { message: err.message });
  process.exitCode = 1;
});
