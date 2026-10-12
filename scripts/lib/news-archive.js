// Arquivo de notícias: antes de tirar uma notícia do painel (mais de 48h), copia para news_archive.
// Regra de segurança: SÓ apaga do painel o que foi arquivado com sucesso. Se o arquivamento falhar, nada é apagado.
export async function archiveAndPrune(supabase, cutoffIso, log = console) {
  let archived = 0, removed = 0;
  for (let round = 0; round < 40; round++) {
    const { data: old, error: eOld } = await supabase.from('news')
      .select('id, published_at, source, title, url, impact_tag, region, country_tag')
      .eq('region', 'radar').lt('published_at', cutoffIso).order('published_at', { ascending: true }).limit(500);
    if (eOld) { log.error('⚠️ Não consegui ler as notícias antigas:', eOld.message); break; }
    if (!old || old.length === 0) break;
    const rows = old.map(({ id, ...r }) => r);
    const { error: eArch } = await supabase.from('news_archive').upsert(rows, { onConflict: 'url', ignoreDuplicates: true });
    if (eArch) { log.error('⚠️ Falha ao arquivar — nada foi apagado:', eArch.message); break; }
    archived += old.length;
    const { error: eDel } = await supabase.from('news').delete().in('id', old.map((o) => o.id));
    if (eDel) { log.error('⚠️ Arquivou, mas não consegui tirar do painel:', eDel.message); break; }
    removed += old.length;
  }
  return { archived, removed };
}
