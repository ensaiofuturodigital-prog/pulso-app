// Motores do "O Pulso mais Profundo": teste para frente (walk-forward), ano a ano.
// Regras:
//  - "alta" = fechamento acima da abertura do próprio dia (mesma definição do Pulso).
//  - Cada motor usa SÓ informação disponível antes do pregão do dia previsto.
//  - Para cada ano Y, o motor é escolhido apenas com dados de anos anteriores a Y.
//  - O ano Y é avaliado uma vez. O resultado não é reajustado depois.
// Função pura: recebe as barras diárias e os eventos e devolve os resultados por ano.

// Cada motor recebe o histórico até o dia anterior e devolve true (há sinal) ou false.
// Todos os motores são definidos ANTES de qualquer teste, com hipótese econômica escrita.
export const MOTORES = {
  // Hipótese: abertura com gap de queda forte tende a ser revertida no dia.
  gap_queda: (h) => h.prev && h.today.open / h.prev.close - 1 < -0.003,
  // Hipótese: três quedas seguidas no fechamento tendem a ser seguidas de alta.
  queda_3_dias: (h) => h.hist.length >= 4 && [1, 2, 3].every(k => h.hist[h.hist.length - k].close < h.hist[h.hist.length - k - 1].close),
  // Hipótese: cinco altas seguidas no fechamento tendem a ser seguidas de baixa.
  alta_5_dias: (h) => h.hist.length >= 6 && [1, 2, 3, 4, 5].every(k => h.hist[h.hist.length - k].close > h.hist[h.hist.length - k - 1].close),
  // Hipótese: movimento forte do dólar no pregão anterior afeta o índice no dia seguinte (WIN).
  dolar_ontem: (h) => h.dolarOntem != null && Math.abs(h.dolarOntem) > 0.005,
  // Hipótese: dado dos EUA mais fraco que o esperado (surpresa negativa) pressiona o dólar para baixo.
  surpresa_eua_negativa: (h) => h.surpresaEua != null && h.surpresaEua < 0,
  // Hipótese: dado dos EUA mais forte que o esperado (surpresa positiva) pressiona o dólar para cima.
  surpresa_eua_positiva: (h) => h.surpresaEua != null && h.surpresaEua > 0,
};

// Candidatos = motor x direção (+1 aposta em alta, -1 aposta em baixa)
const CANDIDATOS = Object.keys(MOTORES).flatMap(m => [{ motor: m, dir: 1 }, { motor: m, dir: -1 }]);
const MIN_TREINO = 150;      // mínimo de dias com sinal no treino para escolher um motor
const TAXA_MINIMA = 0.52;    // acerto mínimo no treino para o motor valer no ano seguinte

function acerta(dir, subiu) { return dir === 1 ? subiu : !subiu; }

// barras: [{date, open, close}] ordenadas, extras: {dolarOntem(date)->num, surpresaEua(date)->num}
// Retorna, por ano, o motor escolhido e os resultados fora da amostra.
export function walkForward(barras, extras = {}) {
  const porDia = barras.map((b, i) => ({ ...b, i }));
  const anos = [...new Set(barras.map(b => +b.date.slice(0, 4)))].sort((a, b) => a - b);
  const resultados = [];

  // Pré-computa o histórico de cada dia, sem olhar o futuro
  const linhas = porDia.map((b, i) => {
    const prev = i > 0 ? barras[i - 1] : null;
    const hist = barras.slice(0, i);
    const h = { today: b, prev, hist, dolarOntem: extras.dolarOntem ? extras.dolarOntem(b.date) : null, surpresaEua: extras.surpresaEua ? extras.surpresaEua(b.date) : null };
    const sinais = {};
    for (const m of Object.keys(MOTORES)) sinais[m] = !!MOTORES[m](h);
    return { date: b.date, subiu: b.close > b.open, sinais };
  });

  for (const Y of anos) {
    if (Y === anos[0]) continue; // primeiro ano só serve de treino
    // Treino: dias com data < ano Y
    const treino = linhas.filter(l => +l.date.slice(0, 4) < Y);
    let melhor = null;
    for (const c of CANDIDATOS) {
      const dias = treino.filter(l => l.sinais[c.motor]);
      if (dias.length < MIN_TREINO) continue;
      const acertos = dias.filter(l => acerta(c.dir, l.subiu)).length;
      const taxa = acertos / dias.length;
      if (!melhor || taxa > melhor.taxa) melhor = { ...c, taxa, n: dias.length };
    }
    const usar = melhor && melhor.taxa >= TAXA_MINIMA ? melhor : null;

    // Teste: ano Y, sem nenhuma informação de Y usada na escolha
    const teste = linhas.filter(l => +l.date.slice(0, 4) === Y);
    let n = 0, acertos = 0;
    if (usar) {
      for (const l of teste) {
        if (!l.sinais[usar.motor]) continue;
        n++;
        if (acerta(usar.dir, l.subiu)) acertos++;
      }
    }
    resultados.push({
      ano: Y,
      motor: usar ? usar.motor : null,
      direcao: usar ? (usar.dir === 1 ? 'alta' : 'baixa') : null,
      acerto_treino: melhor ? +melhor.taxa.toFixed(4) : null,
      sem_sinal: !usar,
      dias_com_sinal: n,
      acertos,
      taxa: n ? +(acertos / n).toFixed(4) : null,
    });
  }

  // Total fora da amostra
  const n = resultados.reduce((s, r) => s + r.dias_com_sinal, 0);
  const a = resultados.reduce((s, r) => s + r.acertos, 0);
  const z = n ? (a - n * 0.5) / Math.sqrt(n * 0.25) : null;
  return { anos: resultados, total: { dias_com_sinal: n, acertos: a, taxa: n ? +(a / n).toFixed(4) : null, z: z == null ? null : +z.toFixed(2) } };
}
