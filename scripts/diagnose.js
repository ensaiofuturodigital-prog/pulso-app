import fetch from 'node-fetch';

const BOT = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

async function send(text) {
  const r = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'Markdown' })
  });
  const d = await r.json();
  if (!d.ok) console.error('Telegram erro:', JSON.stringify(d));
}

let msg = '🔧 *TESTE ENDPOINT VERCEL*\n\n';

// Testar múltiplas URLs possíveis
const urls = [
  'https://pulso-app.vercel.app/api/trigger-radar',
  'https://pulso-app-ensaiofuturodigital-prog.vercel.app/api/trigger-radar',
];

for (const url of urls) {
  try {
    const res = await fetch(url, {
      headers: { 'x-trigger-secret': 'pulso2026seguro' },
      timeout: 10000,
    });
    const body = await res.text();
    msg += `URL: ${url}\nHTTP: ${res.status}\nResposta: ${body}\n\n`;
  } catch(e) {
    msg += `URL: ${url}\nERRO: ${e.message}\n\n`;
  }
}

console.log(msg);
await send(msg);
