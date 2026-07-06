import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Séries do Banco Central (API pública SGS, sem necessidade de chave).
// BCB_USDBRL também funciona como nosso "termômetro de mercado" pra
// cruzar com os outros indicadores (câmbio reage rápido a tudo).
const SERIES = [
  { code: '432', series_id: 'BCB_SELIC', name_pt: 'Meta Selic (Copom)', description_pt: 'Taxa básica de juros definida pelo Banco Central. Afeta diretamente o custo do dinheiro no Brasil e o DI futuro.', frequency: 'event' },
  { code: '433', series_id: 'BCB_IPCA', name_pt: 'IPCA - Inflação oficial (Brasil)', description_pt: 'Inflação oficial do Brasil. Acima do esperado pressiona o Banco Central a manter ou subir juros.', frequency: 'monthly' },
  { code: '7478', series_id: 'BCB_IPCA15', name_pt: 'IPCA-15 - Prévia da inflação (Brasil)', description_pt: 'Prévia do IPCA, sai antes do dado oficial do mês. Serve de antecipação pro mercado.', frequency: 'monthly' },
  { code: '189', series_id: 'BCB_IGPM', name_pt: 'IGP-M (Brasil)', description_pt: 'Índice de preços usado em aluguéis e contratos. Sensível ao câmbio e a preços no atacado.', frequency: 'monthly' },
  { code: '22099', series_id: 'BCB_PIB', name_pt: 'PIB Trimestral (Brasil)', description_pt: 'Crescimento econômico trimestral do Brasil. Acima do esperado tende a fortalecer o real.', frequency: 'quarterly' },
  { code: '24369', series_id: 'BCB_DESEMPREGO', name_pt: 'Taxa de Desemprego - PNAD Contínua (Brasil)', description_pt: 'Desemprego oficial do Brasil. Alta pode sinalizar economia fraca e pressionar o Banco Central a cortar juros.', frequency: 'monthly' },
  { code: '22707', series_id: 'BCB_BALANCA', name_pt: 'Balança Comercial (Brasil)', description_pt: 'Diferença entre exportações e importações brasileiras. Superávit forte tende a ajudar o real.', frequency: 'monthly' },
  { code: '1', series_id: 'BCB_USDBRL', name_pt: 'Câmbio USD/BRL (PTAX)', description_pt: 'Cotação oficial do dólar frente ao real. Referência direta para o WDO — também usamos essa série para medir a reação do mercado a outros indicadores.', frequency: 'daily' },
];

const START_YEAR = { '432': 2000, '433': 2000, '7478': 2000, '189': 2000, '22099': 1996, '24369': 2012, '22707': 1995, '1': 1999 };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// A API do BCB corta consultas muito longas — buscamos ano a ano e juntamos tudo.
async function fetchBcbSeries(code) {
  const startYear = START_YEAR[code] || 2000;
  const currentYear = new Date().getFullYear();
  let all = [];

  for (let year = startYear; year <= currentYear; year++) {
    const dataInicial = `01/01/${year}`;
    const dataFinal = year === currentYear
      ? new Date().toLocaleDateString('pt-BR')
      : `31/12/${year}`;
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${dataInicial}&dataFinal=${dataFinal}`;
    try {
      const res = await fetch(url);
      if (!res.ok) { console.log(`  aviso: ano ${year} respondeu ${res.status}`); continue; }
      const data = await res.json();
      all = all.concat(data.map(d => ({
        date: d.data.split('/').reverse().join('-'),
        value: parseFloat(d.valor.replace(',', '.')),
      })));
    } catch (err) {
      console.log(`  aviso: falha no ano ${year}: ${err.message}`);
    }
    await sleep(300); // educado com a API gratuita
  }
  return all;
}

async function run() {
  console.log('Iniciando busca de histórico completo do Banco Central (ano a ano)...');

  for (const serie of SERIES) {
    try {
      const { data: upserted, error: upsertError } = await supabase
        .from('indicators')
        .upsert(
          { code: serie.series_id, name_pt: serie.name_pt, description_pt: serie.description_pt, source: 'bcb', country: 'BR', frequency: serie.frequency },
          { onConflict: 'code' }
        )
        .select()
        .single();
      if (upsertError) throw upsertError;
      const indicatorId = upserted.id;

      const observations = await fetchBcbSeries(serie.code);
      if (observations.length === 0) { console.log(`⚠️  ${serie.series_id}: nenhum dado retornado`); continue; }

      const rows = observations.map((obs, i) => ({
        indicator_id: indicatorId,
        release_date: obs.date,
        actual_value: obs.value,
        previous_value: i > 0 ? observations[i - 1].value : null,
      }));

      for (const batch of chunk(rows, 500)) {
        const { error } = await supabase.from('indicator_releases').upsert(batch, { onConflict: 'indicator_id,release_date' });
        if (error) console.error(`Erro no lote de ${serie.series_id}:`, error.message);
      }

      console.log(`✅ ${serie.series_id}: ${rows.length} pontos históricos (desde ${observations[0].date} até ${observations[observations.length - 1].date})`);
    } catch (err) {
      console.error(`❌ Falha em ${serie.series_id}:`, err.message);
    }
  }

  console.log('Finalizado.');
}

run();
