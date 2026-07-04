import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Feeds gratuitos do Google News (sem chave). Cobrimos economia/mercado e
// mundo, já que uma notícia relevante em qualquer país pode mexer com o dólar.
const FEEDS = [
  { url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Google News - Economia' },
  { url: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=pt-BR&gl=BR&ceid=BR:pt-BR', source: 'Google News - Mundo' },
];

// Janela de varredura: das 18h do dia anterior às 8h de hoje, horário de Brasília.
function getWindow() {
  const now = new Date();
  const brNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const end = new Date(brNow); end.setHours(8, 0, 0, 0);
  const start = new Date(brNow); start.setDate(start.getDate() - 1); start.setHours(18, 0, 0, 0);
  return { start, end };
}

function parseRss(xml, source) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
  return items.map(item => {
    const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace('<![CDATA[', '').replace(']]>', '') || '';
    const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const pubDateRaw = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const pubDate = pubDateRaw ? new Date(pubDateRaw) : null;
    return { title, url: link, pubDate, source };
  }).filter(i => i.title && i.pubDate && !isNaN(i.pubDate));
}

async function run() {
  const { start, end } = getWindow();
  console.log(`Varredura de notícias: ${start.toISOString()} até ${end.toISOString()}`);

  let allItems = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) { console.log(`⚠️  ${feed.source}: HTTP ${res.status}`); continue; }
      const xml = await res.text();
      const items = parseRss(xml, feed.source);
      allItems = allItems.concat(items);
      console.log(`${feed.source}: ${items.length} manchetes lidas`);
    } catch (err) {
      console.log(`⚠️  ${feed.source}: ${err.message}`);
    }
  }

  const inWindow = allItems.filter(i => i.pubDate >= start && i.pubDate <= end);
  console.log(`${inWindow.length} manchetes dentro da janela de madrugada.`);

  // Limpa a varredura anterior antes de inserir a nova
  await supabase.from('news').delete().eq('region', 'overnight');

  if (inWindow.length === 0) {
    console.log('Nenhuma manchete nova pra registrar.');
    return;
  }

  const rows = inWindow.map(i => ({
    published_at: i.pubDate.toISOString(),
    source: i.source,
    title: i.title,
    url: i.url,
    impact_tag: null,
    region: 'overnight',
  }));

  const { error } = await supabase.from('news').insert(rows);
  if (error) throw error;
  console.log(`✅ ${rows.length} manchetes salvas.`);
}

run().catch(err => { console.error('❌ Falha:', err.message); process.exitCode = 1; });
