// Alerta no Telegram 24h antes do último pregão de cada contrato (WIN e WDO),
// avisando qual é o próximo contrato. Cada aviso é gravado em telegram_sends
// (slot único), então não se repete mesmo se o workflow rodar duas vezes.
//
// Variáveis:
//   DRY_RUN=true  → só imprime a mensagem, não envia e não grava nada (padrão)
//   HOJE=AAAA-MM-DD → simula outra data (para testes)
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { alertaParaAmanha } from '../api/lib/contratos.js';

const DRY_RUN = (process.env.DRY_RUN ?? 'true') !== 'false';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const hoje = process.env.HOJE || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const br = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const DIA_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const diaSemana = (s) => { const [y, m, d] = s.split('-').map(Number); return DIA_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };

function montarMensagem(aviso) {
  const { contrato: c, proximo: p, amanha } = aviso;
  const linhas = [
    `🔔 *Troca de contrato: ${c.ativo}*`,
    ``,
    `Amanhã, ${diaSemana(amanha)} (${br(amanha)}), é o *último pregão* do contrato *${c.codigo}*.`,
    `Vencimento: ${br(c.vencimento)}.`,
    ``,
    `*Próximo contrato:* ${p ? p.codigo : 'a confirmar'}${p ? ` (vence em ${br(p.vencimento)})` : ''}`,
    ``,
    `Confira o contrato correto na sua plataforma antes de operar.`,
  ];
  return linhas.join('\n');
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
  console.log(`Data de referência: ${hoje} (${DRY_RUN ? 'TESTE — nada será enviado' : 'ENVIO REAL'})`);
  const avisos = ['WIN', 'WDO'].map(a => alertaParaAmanha(a, hoje)).filter(Boolean);
  if (!avisos.length) { console.log('Nenhum vencimento amanhã. Nada a enviar.'); return; }

  const supabase = !DRY_RUN ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

  for (const aviso of avisos) {
    const slot = `contrato_${aviso.contrato.codigo}_${aviso.contrato.ultimo_pregao}`;
    const texto = montarMensagem(aviso);
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
