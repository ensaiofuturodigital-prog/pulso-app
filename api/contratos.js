// GET /api/contratos → contrato em negociação, último pregão e próximos vencimentos (WIN e WDO).
import { estadoAtual, proximosContratos } from './lib/contratos.js';

function hojeBrasilia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  const hoje = req.query?.hoje && /^\d{4}-\d{2}-\d{2}$/.test(req.query.hoje) ? req.query.hoje : hojeBrasilia();
  const out = { data_referencia: hoje, ativos: {} };
  for (const ativo of ['WIN', 'WDO']) {
    const { atual, proximo } = estadoAtual(ativo, hoje);
    out.ativos[ativo] = {
      contrato_atual: atual,
      proximo_contrato: proximo,
      proximos: proximosContratos(ativo, hoje, 4),
    };
  }
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json(out);
}
