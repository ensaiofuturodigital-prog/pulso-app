import fetch from 'node-fetch';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const GH_TOKEN = process.env.GH_TOKEN;
const TRIGGER_SECRET = 'pulso2026seguro';

async function addEnvVar(key, value) {
  // Primeiro tentar deletar se já existe
  const listRes = await fetch(
    `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env`,
    { headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` } }
  );
  const listData = await listRes.json();
  const existing = listData.envs?.find(e => e.key === key);
  if (existing) {
    await fetch(
      `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env/${existing.id}`,
      { method: 'DELETE', headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` } }
    );
    console.log(`🗑️  ${key} removida (existente)`);
  }

  // Adicionar nova
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key,
        value,
        type: 'encrypted',
        target: ['production', 'preview'],
      }),
    }
  );
  const data = await res.json();
  if (res.ok) {
    console.log(`✅ ${key} adicionada no Vercel`);
  } else {
    console.log(`❌ ${key}: ${JSON.stringify(data)}`);
  }
}

await addEnvVar('GH_TOKEN', GH_TOKEN);
await addEnvVar('TRIGGER_SECRET', TRIGGER_SECRET);
console.log('\nPronto! Agora faça um novo deploy para as vars entrarem em efeito.');
