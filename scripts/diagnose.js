import fetch from 'node-fetch';

async function testGoogle(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await res.json();
  return data[0].map(i => i[0]).join('');
}

async function testMyMemory(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|pt-BR`;
  const res = await fetch(url);
  const data = await res.json();
  return data.responseData?.translatedText || text;
}

const TEST = 'Fed holds interest rates steady amid inflation concerns';

console.log('Testando APIs de tradução...');
console.log('Texto original:', TEST);

try {
  const g = await testGoogle(TEST);
  console.log('✅ Google Translate:', g);
} catch(e) {
  console.log('❌ Google Translate:', e.message);
}

try {
  const m = await testMyMemory(TEST);
  console.log('✅ MyMemory:', m);
} catch(e) {
  console.log('❌ MyMemory:', e.message);
}
