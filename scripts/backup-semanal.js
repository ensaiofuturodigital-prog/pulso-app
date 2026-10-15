// Backup semanal das tabelas principais do Supabase.
// Lê tudo via API REST (com paginação) e grava um JSON por tabela em ./backup-out/,
// mais um manifesto com as contagens. O workflow "backup-semanal.yml" sobe essa
// pasta como artefato do GitHub Actions (guardado por 30 dias). Não apaga nada.
import fs from 'fs';
import path from 'path';

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!URL_BASE || !KEY) { console.error('SUPABASE_URL/SUPABASE_KEY não configurados'); process.exit(1); }

// Tabelas do Pulso que não podem se perder (dados colados, histórico e previsões).
const TABELAS = [
  'price_daily',
  'indicators',
  'indicator_releases',
  'calendar_events',
  'release_schedule',
  'pulso2_live',
  'news_archive',
  'accuracy_log',
  'indicator_stats',
];

const PAGINA = 1000;
const OUT = path.resolve('backup-out');

// Pergunta ao Supabase quantas linhas a tabela tem de fato (Content-Range).
async function contarTabela(tabela) {
  const res = await fetch(`${URL_BASE}/rest/v1/${tabela}?select=*`, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Prefer: 'count=exact',
      Range: '0-0',
      'Range-Unit': 'items',
    },
  });
  const cr = res.headers.get('content-range') || '';
  const total = parseInt(cr.split('/')[1], 10);
  if (Number.isNaN(total)) throw new Error(`${tabela}: não consegui contar (${cr})`);
  return total;
}

async function baixarTabela(tabela) {
  const linhas = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const res = await fetch(`${URL_BASE}/rest/v1/${tabela}?select=*`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${inicio}-${inicio + PAGINA - 1}`,
        'Range-Unit': 'items',
      },
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`${tabela}: HTTP ${res.status} ${await res.text()}`);
    }
    const pagina = await res.json();
    linhas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return linhas;
}

async function run() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const data = new Date().toISOString().slice(0, 10);
  const manifesto = { data_backup: data, tabelas: {}, erros: [] };

  for (const t of TABELAS) {
    try {
      const total = await contarTabela(t);
      const linhas = await baixarTabela(t);
      if (linhas.length !== total) {
        throw new Error(`${t}: baixei ${linhas.length} linhas, mas o banco tem ${total}`);
      }
      fs.writeFileSync(path.join(OUT, `${t}.json`), JSON.stringify(linhas));
      manifesto.tabelas[t] = { linhas: linhas.length, total_no_banco: total };
      console.log(`✅ ${t}: ${linhas.length} de ${total} linhas conferidas`);
    } catch (err) {
      manifesto.erros.push(err.message);
      console.error(`❌ ${err.message}`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'manifesto.json'), JSON.stringify(manifesto, null, 2));

  if (manifesto.erros.length) { process.exitCode = 1; }
}

run().catch(err => { console.error('Falha:', err.message); process.exitCode = 1; });
