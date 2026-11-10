// TEMPORÁRIO — diagnóstico do GITHUB_ACTIONS_TOKEN. Só devolve status HTTP e data de expiração. Será removido.
export default async function handler(req, res) {
  const t = process.env.GITHUB_ACTIONS_TOKEN;
  if (!t) return res.status(200).json({ token: 'ausente' });
  const r = await fetch('https://api.github.com/repos/ensaiofuturodigital-prog/pulso-app/actions/workflows/pulso-radar.yml', {
    headers: { Authorization: `token ${t}`, Accept: 'application/vnd.github+json' },
  });
  res.status(200).json({ status: r.status, expira: r.headers.get('github-authentication-token-expiration') });
}
