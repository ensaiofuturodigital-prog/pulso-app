// Calendário de vencimento dos contratos futuros WIN (mini índice) e WDO (mini dólar).
// Regras em uso (pedido do Paulão, 16/10/2026):
//  - WIN: troca na SEGUNDA quarta-feira dos meses pares (fev, abr, jun, ago, out, dez).
//    Se não houver pregão nesse dia, passa para o pregão seguinte. Último pregão = dia da troca.
//  - WDO: troca no ÚLTIMO dia útil de cada mês. Esse é o último pregão do contrato que vence no mês seguinte.
// Regra oficial alternativa (B3, para comparação): WIN na quarta-feira mais próxima do dia 15.
// Feriados e dias úteis vêm de pulso2-engine.js (mesma tabela já usada no Pulso 2).
import { isBusinessDay, nextBusinessDays, prevBusinessDay } from './pulso2-engine.js';

const CODIGO_MES = { 1: 'F', 2: 'G', 3: 'H', 4: 'J', 5: 'K', 6: 'M', 7: 'N', 8: 'Q', 9: 'U', 10: 'V', 11: 'X', 12: 'Z' };
const MESES_WIN = [2, 4, 6, 8, 10, 12];

const pad2 = (n) => String(n).padStart(2, '0');
const addDays = (s, n) => {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
};
const diaSemana = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

// Dia da troca do WIN no mês (y, m), pela regra escolhida:
//  'segunda_quarta' (regra em uso): segunda quarta-feira do mês
//  'mais_proxima_15' (regra oficial B3): quarta-feira mais próxima do dia 15
export const REGRA_WIN = 'segunda_quarta';
function vencimentoWIN(y, m, regra = REGRA_WIN) {
  let alvo = null;
  if (regra === 'segunda_quarta') {
    const diasNoMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let quartas = 0;
    for (let d = 1; d <= diasNoMes; d++) {
      const s = `${y}-${pad2(m)}-${pad2(d)}`;
      if (diaSemana(s) === 3) { quartas++; if (quartas === 2) { alvo = s; break; } }
    }
  } else {
    const dia15 = `${y}-${pad2(m)}-15`;
    for (let off = -3; off <= 3; off++) {
      const s = addDays(dia15, off);
      if (diaSemana(s) === 3) { alvo = s; break; }
    }
  }
  // se não há pregão nesse dia, passa para o próximo pregão
  let s = alvo;
  while (!isBusinessDay(s)) s = addDays(s, 1);
  return s;
}

// Vencimento do WDO no mês (y, m): primeiro dia útil do mês
function vencimentoWDO(y, m) {
  let s = `${y}-${pad2(m)}-01`;
  while (!isBusinessDay(s)) s = addDays(s, 1);
  return s;
}

// Último dia útil do mês (y, m)
function ultimoDiaUtilMes(y, m) {
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let s = `${y}-${pad2(m)}-${pad2(ultimo)}`;
  while (!isBusinessDay(s)) s = addDays(s, -1);
  return s;
}

// Lista os próximos contratos de um ativo a partir de uma data (inclusive o contrato que ainda negocia)
export function proximosContratos(ativo, dataRef, quantidade = 6) {
  const [y0, m0] = dataRef.split('-').map(Number);
  const out = [];
  let y = y0, m = m0;
  // começa um mês antes para não perder o contrato que ainda negocia no início do mês
  m -= 1; if (m < 1) { m = 12; y -= 1; }
  while (out.length < quantidade) {
    if (ativo === 'WIN' && !MESES_WIN.includes(m)) { m += 1; if (m > 12) { m = 1; y += 1; } continue; }
    const venc = ativo === 'WIN' ? vencimentoWIN(y, m) : vencimentoWDO(y, m);
    const ultimo = ativo === 'WIN' ? venc : (m === 1 ? ultimoDiaUtilMes(y - 1, 12) : ultimoDiaUtilMes(y, m - 1));
    if (ultimo >= dataRef) {
      out.push({
        ativo,
        codigo: `${ativo}${CODIGO_MES[m]}${String(y).slice(2)}`,
        vencimento: venc,
        ultimo_pregao: ultimo,
      });
    }
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

// Estado atual de um ativo: contrato em negociação agora e o próximo
export function estadoAtual(ativo, dataRef) {
  const [atual, proximo] = proximosContratos(ativo, dataRef, 2);
  return { atual, proximo };
}

// Para o alerta: o último pregão do contrato é o próximo pregão útil de hoje?
// (ou seja, amanhã é o último dia de negociação daquele contrato)
export function alertaParaAmanha(ativo, hojeS) {
  const amanha = nextBusinessDays(hojeS, 1, {}, false)[0];
  const contratos = proximosContratos(ativo, hojeS, 3);
  const c = contratos.find(x => x.ultimo_pregao === amanha);
  if (!c) return null;
  const idx = contratos.indexOf(c);
  return { contrato: c, proximo: contratos[idx + 1] || null, amanha };
}

// Calendário completo dos próximos N meses (para exibir no site)
export function calendario(ativo, dataRef, meses = 15) {
  const [y0, m0] = dataRef.split('-').map(Number);
  const fim = (() => { let y = y0, m = m0 + meses; while (m > 12) { m -= 12; y++; } return `${y}-${pad2(m)}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; })();
  return proximosContratos(ativo, dataRef, meses + 2).filter(c => c.ultimo_pregao <= fim);
}

export const _interno = { vencimentoWIN, vencimentoWDO, ultimoDiaUtilMes, addDays };
