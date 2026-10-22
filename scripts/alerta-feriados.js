// Alerta no Telegram para feriados da B3 (dias úteis apenas).
//  - dia útil anterior ao feriado: avisa às 06h e às 10h
//  - no próprio feriado: avisa às 06h
// Cada aviso é gravado em telegram_sends (slot único), então não se repete.
// Variáveis:
//   DRY_RUN=true  → só imprime a mensagem, não envia e não grava (padrão)
//   HOJE=AAAA-MM-DD, HORA=06|10 → testes
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { alertasDoDia, mensagemFeriado } from './lib/feriados-alerta.js';

const DRY_RUN = (process.env.DRY_RUN ?? 'true') !== 'false';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const hoje = process.env.HOJE || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const horaAtual = process.env.HORA || new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()).padStart(2, '0');

function deveEnviar(tipo, hora) {
  if (tipo === 'antes') return hora === '06' || hora === '10';
  if (tipo === 'dia') return hora === '06';
  return false;
}

async function enviarTelegram(texto) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: texto, parse_mode: 'Markdown', disable_web_page_preview: true }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram: ${JSON.stringify(data)}`);
}

async function main() {
  console.log(`Data: ${hoje} · horário: ${horaAtual}h · ${DRY_RUN ? 'TESTE — nada será enviado' : 'ENVIO REAL'}`);
  const eventos = alertasDoDia(hoje).filter(e => deveEnviar(e.tipo, horaAtual));
  if (!eventos.length) { console.log('Nenhum aviso de feriado para este horário.'); return; }

  const supabase = !DRY_RUN ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
  for (const ev of eventos) {
    const slot = `feriado_${ev.tipo}_${ev.data}_${horaAtual}`;
    const texto = mensagemFeriado(ev);
    console.log(`\n--- slot ${slot} ---\n${texto}\n`);
    if (DRY_RUN) continue;
    const { error } = await supabase.from('telegram_sends').insert({ slot });
    if (error) { if (error.code === '23505') { console.log('Já enviado antes. Pulando.'); continue; } throw error; }
    await enviarTelegram(texto);
    console.log('Enviado.');
  }
}

main().catch(err => { console.error('Falha:', err.message); process.exitCode = 1; });
