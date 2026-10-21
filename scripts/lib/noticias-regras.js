// Regras de classificação das notícias do Pulso (camadas e tarjas).
// Este módulo não envia nada: só decide a qual camada cada notícia pertence e formata o texto.

// Tarjas: os nomes gravados pelo coletor (news.impact_tag), mantidos como estão.
export const TARJAS = {
  'MACRO':       { icone: '📊', nome: 'MACRO GLOBAL' },
  'JUROS/BC':    { icone: '🏦', nome: 'JUROS / BANCOS CENTRAIS' },
  'FISCAL':      { icone: '📋', nome: 'FISCAL' },
  'COMMODITIES': { icone: '🛢️', nome: 'COMMODITIES' },
  'BOLSA':       { icone: '📈', nome: 'BOLSA' },
  'POLÍTICA':    { icone: '🏛️', nome: 'POLÍTICA' },
  'M&A/CORP':    { icone: '🤝', nome: 'CORPORATIVO' },
  'B3':          { icone: '🏷️', nome: 'B3 / REGRAS' },
  'ELEIÇÃO':     { icone: '🗳️', nome: 'ELEIÇÃO' },
};
export function tarja(tag) { return TARJAS[tag] || { icone: '📰', nome: String(tag || 'OUTROS').toUpperCase() }; }

const BANDEIRAS = { BR: '🇧🇷', US: '🇺🇸', EA: '🇪🇺', CN: '🇨🇳', JP: '🇯🇵', GB: '🇬🇧', GLOBAL: '🌐' };
export function bandeira(tag) { return BANDEIRAS[tag] || '🌐'; }

// ─── CAMADA 1 — ALERTA URGENTE (break news) ─────────────────────────────────
// Só eventos de impacto imediato. Palavras com limite de palavra (\b) para evitar
// falsos positivos como "eleva" no meio de outra frase.
const URGENTE = [
  // decisão surpresa ou decisão de juros de bancos centrais
  /\b(copom|fed|bce|boj|banco central)\b.*\b(decide|decidiu|anuncia|anunciou|elevou|cortou|manteve|reduziu|surpreende)\b.*\b(juros|taxa|selic)\b/i,
  // eleição / posse de líder de país relevante
  /\b(presidente eleito|presidente eleita|eleito presidente|eleita presidente|vence (a )?elei[çc][aã]o presidencial)\b/i,

  // choque de mercado
  /\b(circuit breaker|bolsa despenca|ibovespa despenca|nasdaq despenca|dow jones despenca|crash do mercado)\b/i,
  // calote / default soberano
  /\b(calote|default soberano|moratória soberana|moratoria soberana)\b/i,
];
// morte, renúncia ou afastamento de chefe de Estado/governo ou da Fazenda/Fed, em qualquer ordem na manchete
const CHEFE = /\b(presidente|primeiro-ministro|primeira-ministra|rei|chanceler|ministro da fazenda|presidente do fed|powell)\b/i;
const SAIDA = /\b(morre|morreu|falece|faleceu|renuncia|renunciou|deixa o cargo|deixou o cargo)\b/i;
export function ehUrgente(titulo) {
  if (URGENTE.some(r => r.test(titulo))) return true;
  return CHEFE.test(titulo) && SAIDA.test(titulo);
}

// ─── CAMADA 2 — DESTAQUES DO DIA ────────────────────────────────────────────
// Dados e decisões agendadas de impacto no mercado, pela tarja ou pelo conteúdo.
const TARJAS_DESTAQUE = ['MACRO', 'JUROS/BC', 'FISCAL', 'COMMODITIES', 'B3', 'ELEIÇÃO'];
const PALAVRAS_DESTAQUE = /\b(infla[çc][aã]o|pib|payroll|emprego|desemprego|copom|selic|fed|bce|opep|petr[oó]leo|d[oó]lar|c[aâ]mbio|d[ií]vida p[uú]blica|arcabou[cç]o fiscal|reforma tribut[aá]ria|tarifa|sanç[oõ]es)\b/i;
export function ehDestaque(item) {
  return TARJAS_DESTAQUE.includes(item.impact_tag) || PALAVRAS_DESTAQUE.test(item.title || '');
}

// ─── CAMADA 3 — RADAR (resumo) ──────────────────────────────────────────────
export function ehRadar(item) { return !ehUrgente(item.title || '') && !ehDestaque(item); }

// Divide as notícias nas três camadas. Cada notícia cai na camada mais alta que a aceita.
export function separarCamadas(itens, limites = { urgente: 5, destaque: 6, radar: 3 }) {
  const urgente = [], destaque = [], radar = [];
  const porTarja = {};
  for (const n of itens) {
    if (ehUrgente(n.title || '')) { urgente.push(n); continue; }
    if (ehDestaque(n)) { destaque.push(n); continue; }
    const t = n.impact_tag || 'OUTROS';
    (porTarja[t] = porTarja[t] || []).push(n);
  }
  // radar: no máximo N por tarja, mais recentes primeiro
  for (const t of Object.keys(porTarja)) radar.push(...porTarja[t].slice(0, limites.radar));
  const porData = (a, b) => new Date(b.published_at) - new Date(a.published_at);
  urgente.sort(porData); destaque.sort(porData); radar.sort(porData);
  return { urgente: urgente.slice(0, limites.urgente), destaque: destaque.slice(0, limites.destaque), radar };
}

// Escapa caracteres do Markdown do Telegram nos títulos
export function escaparMd(texto) {
  return String(texto).replace(/([_*`\[\]])/g, '\\$1');
}

export function linhaNoticia(n) {
  const t = tarja(n.impact_tag);
  return `${t.icone} *${t.nome}* ${bandeira(n.country_tag)}\n${escaparMd(n.title)}\n[ler notícia](${n.url})\n`;
}

export function montarResumo(itens, agora) {
  const c = separarCamadas(itens);
  const partes = [];
  partes.push(`📰 *RADAR DO PULSO* — ${agora} (Brasília)`);
  partes.push(`━━━━━━━━━━━━━━━━━━━━━━`);
  if (c.urgente.length) {
    partes.push(`\n🚨 *ALERTA URGENTE*\n`);
    partes.push(...c.urgente.map(linhaNoticia));
  }
  if (c.destaque.length) {
    partes.push(`\n📊 *DESTAQUES DO DIA*\n`);
    partes.push(...c.destaque.map(linhaNoticia));
  }
  if (c.radar.length) {
    partes.push(`\n🔎 *RADAR*\n`);
    partes.push(...c.radar.map(linhaNoticia));
  }
  if (partes.length <= 2) return null;
  return partes.join('\n');
}
