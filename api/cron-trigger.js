// Endpoint chamado pelos Vercel Cron Jobs (vercel.json) nos horários exatos
// de envio. Dispara o workflow_dispatch do GitHub Actions correspondente —
// isso é muito mais confiável que depender do "schedule:" do GitHub Actions
// sozinho, que pode atrasar horas ou simplesmente não disparar.
//
// IMPORTANTE (corrigido em 29/10/2026 — bug de duplicidade):
// Os inputs 'force_telegram' / 'force_send' dos workflows foram feitos para
// TESTE MANUAL (ignoram a trava de duplicata do Supabase de propósito).
// Esse disparo automático da Vercel NÃO pode usar 'true' aqui: se o robô do
// GitHub já tivesse mandado a mensagem no mesmo horário, o disparo forçado
// mandava de novo, duplicando no Telegram. Por isso os inputs ficam 'false':
// o workflow roda como uma execução normal (calcula o horário-alvo e tenta
// travar o slot no Supabase) — se já foi enviado, ele mesmo pula sozinho;
// se não foi, ele manda, funcionando como reforço de verdade, sem duplicar.
//
// Variáveis de ambiente usadas (já configuradas na Vercel):
//   GITHUB_ACTIONS_TOKEN  (mesmo token já usado em api/ingest.js)

const GH_OWNER = 'ensaiofuturodigital-prog';
const GH_REPO = 'pulso-app';

async function dispatch(workflowFile, inputs) {
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) throw new Error('GITHUB_ACTIONS_TOKEN não configurado na Vercel');

  const res = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
    }
  );
  return { status: res.status, ok: res.status === 204 };
}

export default async function handler(req, res) {
  // Só aceita chamadas autenticadas com o CRON_SECRET (Vercel envia
  // automaticamente 'authorization: Bearer <CRON_SECRET>' nos Cron Jobs).
  // Antes, o cabeçalho 'x-vercel-cron' e o '?secret=' na URL também
  // liberavam o disparo, e ambos podiam ser falsificados por qualquer um.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  // Também aceita o segredo do agendador do Supabase (pg_cron), que dispara no minuto exato.
  const pgSecret = process.env.PG_CRON_SECRET;
  const autorizado = (!!cronSecret && authHeader === `Bearer ${cronSecret}`)
    || (!!pgSecret && authHeader === `Bearer ${pgSecret}`);

  if (!autorizado) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const job = (req.query.job || '').toString();

  try {
    if (job === 'radar') {
      const r = await dispatch('pulso-radar.yml', { force_telegram: 'false' });
      console.log(`cron-trigger ${job}: GitHub respondeu ${r.status}`);
      return res.status(r.ok ? 200 : 502).json({ job, dispatched: r });
    }
    if (job === 'prob') {
      const r = await dispatch('probabilidades.yml', { force_send: 'false' });
      console.log(`cron-trigger ${job}: GitHub respondeu ${r.status}`);
      return res.status(r.ok ? 200 : 502).json({ job, dispatched: r });
    }
    return res.status(400).json({ error: 'job invalido, use ?job=radar ou ?job=prob' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
