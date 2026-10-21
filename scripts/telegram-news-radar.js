import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Camadas, tarjas e formatação ficam em scripts/lib/noticias-regras.js
import { montarResumo } from './lib/noticias-regras.js';

async function buildDigest() {
  const cutoff = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .eq('region', 'radar')
    .gte('published_at', cutoff)
    .order('published_at', { ascending: false });
  if (error) throw error;
  // Descarta qualquer título que seja aviso de serviço de tradução (dados antigos gravados por engano)
  const dados = data.filter(n => !/MYMEMORY|TRANSLATIONS FOR TODAY/i.test(n.title || ''));
  if (!dados || dados.length === 0) return null;

  const agora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date());
  return montarResumo(dados, agora);
}

async function sendTelegram(text) {
  const MAX = 4000;
  const chunks = [];
  let remaining = text;
  while (remaining.length > MAX) {
    let cut = remaining.lastIndexOf('\n', MAX);
    if (cut === -1) cut = MAX;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut + 1);
  }
  chunks.push(remaining);

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  for (const chunk of chunks) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: chunk,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram: ${JSON.stringify(data)}`);
  }
  console.log(`✅ Radar enviado (${chunks.length} parte(s)).`);
}

// ─── DECISÃO DE ENVIO — não depende do GitHub Actions rodar no minuto exato ───
// O cron do GitHub é "melhor esforço" e pode atrasar bastante quando roda a
// cada poucos minutos. Por isso: janela larga (55 min) ao redor de cada
// horário-alvo + trava de duplicidade no Supabase (garante 1 envio por slot,
// mesmo que o workflow rode várias vezes dentro da mesma janela).
const SEND_TARGETS_BRT = ['04:38', '06:38', '08:38', '11:38', '18:38'];
const TOLERANCE_MIN = 58; // fica abaixo da metade do menor intervalo entre horários-alvo (120min), evitando sobreposição de janelas, e ainda cobre quase toda a folga de 1h do cron da Vercel

function nowInBrasilia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t).value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10),
  };
}

function findMatchingSlot() {
  const { date, hour, minute } = nowInBrasilia();
  const nowMin = hour * 60 + minute;
  for (const t of SEND_TARGETS_BRT) {
    const [th, tm] = t.split(':').map(Number);
    const targetMin = th * 60 + tm;
    let diff = nowMin - targetMin;
    if (diff < -720) diff += 1440;   // trata virada de dia nos dois sentidos
    if (diff > 720) diff -= 1440;
    if (Math.abs(diff) <= TOLERANCE_MIN) {
      return `${date}_${t}`;
    }
  }
  return null;
}

async function claimSlot(slot) {
  const { error } = await supabase.from('telegram_sends').insert({ slot });
  if (error) {
    if (error.code === '23505') return false; // já enviado nesse slot — duplicata evitada
    throw error;
  }
  return true;
}

async function run() {
  const force = process.env.FORCE_SEND === 'true';
  let slot = null;

  if (!force) {
    slot = findMatchingSlot();
    if (!slot) {
      console.log(`⏭️  ${nowInBrasilia().hour}:${String(nowInBrasilia().minute).padStart(2, '0')} (Brasília) — fora da janela de envio, só coletando.`);
      return;
    }
    const claimed = await claimSlot(slot);
    if (!claimed) {
      console.log(`⏭️  Slot ${slot} já enviado anteriormente — evitando duplicata.`);
      return;
    }
  }

  const msg = await buildDigest();
  if (!msg) { console.log('Nenhuma notícia nova — nada pra enviar.'); return; }
  await sendTelegram(msg);
  console.log(force ? '✅ Envio forçado concluído.' : `✅ Slot ${slot} enviado com sucesso.`);
}

run().catch(err => { console.error('❌ Falha:', err.message); process.exitCode = 1; });

