// Detecta se um título está em inglês pelo próprio texto (não pela etiqueta do feed).
// Usa palavras funcionais que são comuns em inglês e raras em português.
const INGLES = new Set(['the','and','of','to','in','for','with','on','at','from','by','is','are','was','were',
  'its','after','over','says','said','new','will','than','amid','vs','that','this','it','be','has','have',
  'their','his','her','who','what','how','why','not','but','or','more','most','before','up','down','as','futures','earnings','shares','stocks','stock','market','markets','gain','gains','rise','rises','falls','fall','report','reports','buy','sell','rekindles','optimism']);
const PORTUGUES = new Set(['de','da','do','das','dos','que','em','para','com','uma','um','não','nao','os','por',
  'no','na','nos','nas','é','são','foi','pelo','pela','ao','aos','seu','sua','mais','como','ou','mas','sobre']);

export function pareceIngles(titulo) {
  if (!titulo) return false;
  // remove o sufixo de fonte do Google Notícias (ex.: " - The New York Times")
  const limpo = titulo.replace(/\s[-–|]\s[^-–|]{2,60}$/, '');
  const palavras = limpo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-záàâãéêíóôõúç']+/gi) || [];
  let en = 0, pt = 0;
  for (const p of palavras) {
    const semAcento = p.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (INGLES.has(p) || INGLES.has(semAcento)) en++;
    if (PORTUGUES.has(p) || PORTUGUES.has(semAcento)) pt++;
  }
  return en >= 2 && en > pt;
}

// Respostas de aviso de serviços de tradução (ex.: limite gratuito esgotado) não são tradução.
export function ehRespostaInvalida(texto) {
  if (!texto) return true;
  return /MYMEMORY|QUOTA|USAGE LIMIT|TRANSLATIONS FOR TODAY|YOU USED ALL/i.test(texto);
}
