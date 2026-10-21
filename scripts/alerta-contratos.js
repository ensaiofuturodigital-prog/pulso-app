// Alerta no Telegram 24h antes do último pregão de cada contrato (WIN e WDO),
// avisando qual é o próximo contrato. Cada aviso é gravado em telegram_sends
// (slot único), então não se repete mesmo se o workflow rodar duas vezes.
//
// Variáveis:
//   DRY_RUN=true  → só imprime a mensagem, não envia e não grava nada (padrão)
//   HOJE=AAAA-MM-DD → simula outra data (para testes)
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { eventosDoDia } from '../api/lib/contratos.js';

const DRY_RUN = (process.env.DRY_RUN ?? 'true') !== 'false';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const hoje = process.env.HOJE || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const br = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}`; };
const brCompleta = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const DIA_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const diaSemana = (s) => { const [y, m, d] = s.split('-').map(Number); return DIA_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };

// Hora atual em Brasília (06 ou 10). Pode ser forçada com HORA=06 ou HORA=10 nos testes.
const horaAtual = process.env.HORA || new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()).padStart(2, '0');

// Quais avisos sair em cada horário:
//  - dia anterior: 06h e 10h
//  - dia da troca: 06h
function deveEnviar(tipo, hora) {
  if (tipo === 'antes') return hora === '06' || hora === '10';
  if (tipo === 'dia') return hora === '06';
  return false;
}

function montarMensagem(ev) {
  const c = ev.contrato, p = ev.proximo;
  const proximo = p ? p.codigo : 'a confirmar';
  if (ev.tipo === 'antes') {
    return [
      `⏰ *AMANHÃ É DIA DE TROCA — ${ev.ativo}*`,
      ``,
      `Amanhã, ${diaSemana(ev.data_troca)} (${br(ev.data_troca)}), é o último pregão do contrato *${c.codigo}*.`,
      `*Troque para o contrato ${proximo}*${p ? ` (vence em ${brCompleta(p.vencimento)})` : ''}.`,
      ``,
      `Confira o contrato correto na sua plataforma antes de operar.`,
    ].join('\n');
  }
  return [
    `🔁 *HOJE É DIA DE TROCA — ${ev.ativo}*`,
    ``,
    `Hoje, ${diaSemana(ev.data_troca)} (${br(ev.data_troca)}), é o último pregão do contrato *${c.codigo}*.`,
    `*Troque para o contrato ${proximo}*.`,
    ``,
    `Confira o contrato correto na sua plataforma antes de operar.`,
  ].join('\n');
}

async function enviarTelegram(texto) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: texto, parse_mode: 'Markdown', disable_web_page_preview: true }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram: ${JSON.stringify(data)}`);
}

async function main() {
  console.log(`Data: ${hoje} · horário: ${horaAtual}h · ${DRY_RUN ? 'TESTE — nada será enviado' : 'ENVIO REAL'}`);
  const eventos = eventosDoDia(hoje).filter(ev => deveEnviar(ev.tipo, horaAtual));
  if (!eventos.length) { console.log('Nenhum aviso para este horário.'); return; }

  const supabase = !DRY_RUN ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

  for (const ev of eventos) {
    const slot = `troca_${ev.tipo}_${ev.contrato.codigo}_${horaAtual}`;
    const texto = montarMensagem(ev);
    console.log(`\n--- slot ${slot} ---\n${texto}\n`);
    if (DRY_RUN) continue;

    const { error } = await supabase.from('telegram_sends').insert({ slot });
    if (error) {
      if (error.code === '23505') { console.log('Já enviado antes (slot existe). Pulando.'); continue; }
      throw error;
    }
    await enviarTelegram(texto);
    console.log('Enviado.');
  }
}

main().catch(err => { console.error('Falha:', err.message); process.exitCode = 1; });
