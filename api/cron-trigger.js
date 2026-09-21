// Endpoint chamado pelos Vercel Cron Jobs (vercel.json) nos horários exatos
// de envio. Dispara o workflow_dispatch do GitHub Actions correspondente —
// isso é muito mais confiável que depender do "schedule:" do GitHub Actions
// sozinho, que pode atrasar horas ou simplesmente não disparar.
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
  // Vercel Cron chama com header 'authorization: Bearer <CRON_SECRET>' automaticamente
  // quando CRON_SECRET está configurado nas env vars do projeto.
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers['x-vercel-cron']
    || (cronSecret && authHeader === `Bearer ${cronSecret}`)
    || (cronSecret && req.query.secret === cronSecret);

  if (!isVercelCron) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const job = (req.query.job || '').toString();

  try {
    if (job === 'radar') {
      const r = await dispatch('pulso-radar.yml', { force_telegram: 'true' });
      return res.status(200).json({ job, dispatched: r });
    }
    if (job === 'prob') {
      const r = await dispatch('probabilidades.yml', { force_send: 'true' });
      return res.status(200).json({ job, dispatched: r });
    }
    return res.status(400).json({ error: 'job invalido, use ?job=radar ou ?job=prob' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
