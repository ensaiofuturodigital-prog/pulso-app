import fetch from 'node-fetch';

const BOT = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

async function sendMsg(text) {
  await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id: CHAT, text })
  });
}

async function testGoogle(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await res.json();
  return data[0].map(i => i[0]).join('');
}

async function testMyMemory(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|pt-BR`;
  const res = await fetch(url);
  const data = await res.json();
  return data.responseData?.translatedText || text;
}

const TEST = 'Fed holds interest rates steady amid inflation concerns';
let msg = '🔤 TESTE DE TRADUÇÃO\n\n';
msg += `Original: ${TEST}\n\n`;

try {
  const g = await testGoogle(TEST);
  msg += `✅ Google Translate:\n${g}\n\n`;
} catch(e) {
  msg += `❌ Google Translate: ${e.message}\n\n`;
}

try {
  const m = await testMyMemory(TEST);
  msg += `✅ MyMemory:\n${m}\n`;
} catch(e) {
  msg += `❌ MyMemory: ${e.message}\n`;
}

await sendMsg(msg);
console.log('Resultado enviado ao Telegram!');
