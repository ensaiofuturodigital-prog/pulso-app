// TESTE DE LAYOUT — envia exemplos (probabilidades + política) pro grupo do Telegram.
// Não grava NADA no Supabase (não chama claimSlot, não toca na tabela `news`,
// não toca na tabela `telegram_sends`) — então não interfere em nenhum envio
// real, nem hoje nem nos próximos dias. Dados são só pra visualizar o layout:
// as notícias de política são fictícias e claramente marcadas como [TESTE].
import { mensagensDoDia } from './lib/probabilidades-msg.js';
import { montarResumo } from './lib/noticias-regras.js';
import { estadoAtual } from '../api/lib/contratos.js';
import fetch from 'node-fetch';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function todayStrBRT() {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram: ${JSON.stringify(data)}`);
  console.log('✅ Enviada (teste de layout).');
}

async function run() {
  const dateStr = todayStrBRT();
  const wdoCodigo = estadoAtual('WDO', dateStr).atual.codigo;
  const winCodigo = estadoAtual('WIN', dateStr).atual.codigo;

  console.log('— Enviando aviso de início de teste —');
  await sendTelegram('🧪 *TESTE DE LAYOUT* — as próximas mensagens são só pra conferir o visual. Não são dados reais de hoje.');

  console.log('— Probabilidades (números de exemplo) —');
  const probMsgs = mensagensDoDia({
    dateStr,
    wdo: { codigo: wdoCodigo, up: 58 },
    win: { codigo: winCodigo, up: 44 },
  });
  for (const msg of probMsgs) await sendTelegram(msg);

  console.log('— Radar de política (notícias fictícias) —');
  const itensFake = [
    {
      title: '[TESTE] Congresso Nacional aprova projeto fictício de exemplo',
      url: 'https://exemplo-teste.invalid/preview-br-1',
      impact_tag: 'POLÍTICA', country_tag: 'BR', published_at: new Date().toISOString(),
    },
    {
      title: '[TESTE] White House announces example preview policy',
      url: 'https://exemplo-teste.invalid/preview-us-1',
      impact_tag: 'POLÍTICA', country_tag: 'US', published_at: new Date().toISOString(),
    },
    {
      title: '[TESTE] European Commission discusses example preview rule',
      url: 'https://exemplo-teste.invalid/preview-ea-1',
      impact_tag: 'POLÍTICA', country_tag: 'EA', published_at: new Date().toISOString(),
    },
  ];
  const resumo = montarResumo(itensFake, new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  if (resumo) await sendTelegram(resumo);

  console.log('— Fim do teste —');
  await sendTelegram('✅ *FIM DO TESTE DE LAYOUT.* Nada foi gravado no banco — os envios automáticos de hoje e dos próximos dias não são afetados.');
}

run().catch(err => { console.error('❌ Falha no teste:', err.message); process.exitCode = 1; });
