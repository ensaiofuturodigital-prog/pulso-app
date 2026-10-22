// Alertas de feriado da B3. Usa a MESMA tabela do motor (api/lib/pulso2-engine.js).
// Regras combinadas:
//  - Feriado em dia útil (segunda a sexta): avisa no dia útil anterior e no próprio dia.
//  - Feriado em fim de semana: não gera alerta.
//  - No dia do feriado não são enviadas probabilidades.
import { b3HolidayMap, isBusinessDay, prevBusinessDay, weekday, addDays } from '../../api/lib/pulso2-engine.js';

// Todos os feriados/fechamentos da B3 de um intervalo de anos (data -> nome)
export function feriadosDoPeriodo(anos) {
  const m = {};
  for (const y of anos) Object.assign(m, b3HolidayMap(y));
  return m;
}

// Feriado nacional de verdade (não é só fechamento de mercado)
const SO_MERCADO = /Véspera|Carnaval/;
export function ehFeriadoNacional(nome) { return !SO_MERCADO.test(nome); }

// Eventos de alerta para uma data de referência (dataRef = 'AAAA-MM-DD')
export function alertasDoDia(dataRef) {
  const ano = Number(dataRef.slice(0, 4));
  const mapa = feriadosDoPeriodo([ano - 1, ano, ano + 1]);
  const out = [];
  for (const [data, nome] of Object.entries(mapa)) {
    if (weekday(data) < 1 || weekday(data) > 5) continue; // fim de semana: sem alerta
    if (data === dataRef) out.push({ tipo: 'dia', data, nome, nacional: ehFeriadoNacional(nome) });
    if (dataRef === prevBusinessDay(data)) out.push({ tipo: 'antes', data, nome, nacional: ehFeriadoNacional(nome) });
  }
  // remove duplicatas (mesmo tipo e mesma data)
  const vistos = new Set();
  return out.filter(e => { const k = e.tipo + e.data; if (vistos.has(k)) return false; vistos.add(k); return true; })
    .sort((a, b) => a.data.localeCompare(b.data));
}

export function diaDeSemana(s) {
  return ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][weekday(s)];
}
export function dataCurta(s) { return `${s.slice(8, 10)}/${s.slice(5, 7)}`; }
export function dataExtensa(s) { return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`; }

export function mensagemFeriado(ev) {
  const quando = ev.tipo === 'dia'
    ? `Hoje, ${diaDeSemana(ev.data)} (${dataCurta(ev.data)}), é ${ev.nacional ? 'feriado' : 'dia de fechamento'}: *${ev.nome}*.`
    : `Amanhã, ${diaDeSemana(ev.data)} (${dataCurta(ev.data)}), é ${ev.nacional ? 'feriado' : 'dia de fechamento'}: *${ev.nome}*.`;
  const bolsa = ev.tipo === 'dia'
    ? `*A B3 não abre hoje.* Não há pregão, e por isso não há probabilidades hoje.`
    : `*A B3 não vai abrir nesse dia.* Planeje suas operações.`;
  return [`🏖️ *AVISO DE FERIADO — B3*`, '', quando, '', bolsa].join('\n');
}

export function feriadoHoje(dataRef) {
  return b3HolidayMap(Number(dataRef.slice(0, 4)))[dataRef] || null;
}
