// Mensagens de probabilidade do dia: uma mensagem por ativo (WDO e WIN).
// Não envia nada: só monta o texto.
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function cabecalhoData(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

// up: % de chance de alta (0-100) | codigo: contrato em negociação (ex.: WDOX26)
export function mensagemAtivo({ dateStr, nome, codigo, up }) {
  const linhas = [];
  linhas.push(`*Probabilidades para day trade nos ativos hoje, ${cabecalhoData(dateStr)}.*`);
  linhas.push('');
  if (up == null) {
    linhas.push(`*${nome}, ${codigo}*: sem dado suficiente hoje.`);
  } else {
    linhas.push(`*${nome}, ${codigo}*: ${up}% de chance de alta, ${100 - up}% de chance de baixa.`);
  }
  linhas.push('');
  linhas.push(`_Não é recomendação de operação._`);
  return linhas.join('\n');
}

// Monta as duas mensagens (WDO e WIN), na ordem: dólar, depois índice
export function mensagensDoDia({ dateStr, wdo, win }) {
  return [
    mensagemAtivo({ dateStr, nome: 'Mini dólar (WDO)', codigo: wdo.codigo, up: wdo.up }),
    mensagemAtivo({ dateStr, nome: 'Mini índice (WIN)', codigo: win.codigo, up: win.up }),
  ];
}
