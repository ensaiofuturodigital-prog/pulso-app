import fetch from 'node-fetch';

const BOT = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

async function send(text) {
  await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id: CHAT, text })
  });
}

// Testar o endpoint do Vercel
const res = await fetch('https://pulso-app.vercel.app/api/trigger-radar', {
  headers: { 'x-trigger-secret': 'pulso2026seguro' }
});
const body = await res.text();
await send(`🔧 TESTE ENDPOINT\nHTTP: ${res.status}\nResposta: ${body}`);
console.log(`HTTP ${res.status}: ${body}`);
