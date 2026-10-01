const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

export function reportHtml(report){
  const phases=report?.phases||[];
  const overall=report?.overall||'SEM RESULTADO';
  const lines=phases.flatMap(phase=>(phase.report?.checks||[]).map(check=>`<li><b>${escapeHtml(check.status)}</b> · ${escapeHtml(phase.name)} / ${escapeHtml(check.name)} — ${escapeHtml(check.message)}${check.items?.length?` <span>${escapeHtml(check.items.join(', '))}</span>`:''}</li>`));
  return `<div class="presell-result ${overall==='BLOCKED'?'is-error':overall==='PASS'?'is-pass':'is-warn'}"><strong>${escapeHtml(overall)}</strong><ul>${lines.join('')||'<li>Nenhum detalhe retornado.</li>'}</ul></div>`;
}
