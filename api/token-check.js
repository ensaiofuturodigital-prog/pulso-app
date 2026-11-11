// TEMPORÁRIO — mostra só status e validade dos tokens (nunca o valor). Será removido.
async function gh(t) {
  if (!t) return { token: 'ausente' };
  const r = await fetch('https://api.github.com/repos/ensaiofuturodigital-prog/pulso-app/actions/workflows/pulso-radar.yml', {
    headers: { Authorization: `token ${t}`, Accept: 'application/vnd.github+json' },
  });
  return { status: r.status, expira: r.headers.get('github-authentication-token-expiration') };
}
function jwt(t) {
  if (!t) return { token: 'ausente' };
  try {
    const p = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
    return { role: p.role, expira: p.exp ? new Date(p.exp * 1000).toISOString() : 'sem exp' };
  } catch { return { formato: 'não é JWT' }; }
}
export default async function handler(req, res) {
  res.status(200).json({
    GITHUB_ACTIONS_TOKEN: await gh(process.env.GITHUB_ACTIONS_TOKEN),
    GH_TOKEN: await gh(process.env.GH_TOKEN),
    SUPABASE_SERVICE_KEY: jwt(process.env.SUPABASE_SERVICE_KEY),
    SUPABASE_KEY: jwt(process.env.SUPABASE_KEY),
  });
}
