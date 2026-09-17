export default async function handler(req, res) {
  const secret = req.headers['x-trigger-secret'];
  if (secret !== process.env.TRIGGER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const response = await fetch(
      'https://api.github.com/repos/ensaiofuturodigital-prog/pulso-app/actions/workflows/fetch-news-radar.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${process.env.GH_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      }
    );

    if (response.status === 204) {
      return res.status(200).json({ ok: true, message: 'Workflow disparado com sucesso' });
    } else {
      const text = await response.text();
      return res.status(500).json({ ok: false, error: text });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
