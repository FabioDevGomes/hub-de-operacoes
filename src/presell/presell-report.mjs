const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

const phaseLabels={
  'initial-structure':'Checagem inicial da estrutura',
  production:'Geração dos arquivos',
  'final-structure':'Checagem final da estrutura',
  ficha:'Conferência da ficha'
};
const checkLabels={
  'validator-output':'Falha técnica ao executar o validador',
  'validator-stderr':'Mensagem técnica do validador',
  'validator-exit-code':'Código de saída do validador',
  'destination':'Pasta de destino',
  'index':'Arquivo principal',
  'ficha':'Ficha de dados',
  'index-readable':'Leitura do HTML',
  'required-files':'Arquivos obrigatórios',
  'required-assets':'Imagens obrigatórias',
  'affiliate-url':'Link da oferta',
  'pending':'Pendências da ficha'
};
const statusLabels={PASS:'Aprovado',WARN:'Atenção',BLOCK:'Bloqueio'};

function renderCheck(check,phaseName){
  const status=String(check.status||'').toLowerCase();
  const label=checkLabels[check.name]||check.name||'Verificação';
  const phase=phaseLabels[phaseName]||phaseName||'Validação';
  const details=(check.items||[]).map(item=>`<li><code>${escapeHtml(item)}</code></li>`).join('');
  return `<li class="presell-check is-${escapeHtml(status)}"><div><strong>${escapeHtml(statusLabels[check.status]||check.status||'Status desconhecido')} · ${escapeHtml(phase)} / ${escapeHtml(label)}</strong><span> — ${escapeHtml(check.message)}</span></div>${details?`<ul class="presell-check-details">${details}</ul>`:''}</li>`;
}

export function reportHtml(report){
  const phases=report?.phases||[];
  const overall=report?.overall||'SEM RESULTADO';
  const checkCount=(phases||[]).reduce((count,phase)=>count+(phase.report?.checks||[]).length,0);
  const hasUnreadableReport=phases.some(phase=>(phase.report?.checks||[]).some(check=>check.name==='validator-output'));
  const summary=overall==='BLOCKED'
    ?hasUnreadableReport
      ?'A validação falhou por um erro interno ao chamar o PowerShell e não gerou um relatório confiável. Isso não aponta erro na ficha, e alterar os campos não evita a falha. Não publique; é necessário corrigir a chamada do validador e repetir a conferência.'
      :'Há verificações que precisam ser corrigidas antes de liberar a página para publicação.'
    :overall==='PASS_WITH_WARNINGS'
      ?'A validação terminou com avisos. Revise-os antes de publicar.'
      :overall==='PASS'
        ?'Todas as verificações foram concluídas sem bloqueios.'
        :'Não foi possível identificar um resultado de validação.';
  const phaseHtml=overall==='PASS'?'':phases.map(phase=>{
    const checks=phase.report?.checks||[];
    const attention=checks.filter(check=>check.status!=='PASS');
    const passed=checks.filter(check=>check.status==='PASS');
    const attentionHtml=attention.length?`<ul>${attention.map(check=>renderCheck(check,phase.name)).join('')}</ul>`:'';
    const passedHtml=passed.length?`<details class="presell-passed"><summary>Ver ${passed.length} verificação(ões) aprovada(s)</summary><ul>${passed.map(check=>renderCheck(check,phase.name)).join('')}</ul></details>`:'';
    return `<section class="presell-phase"><h4>${escapeHtml(phaseLabels[phase.name]||phase.name)} <span>${checks.length} verificação(ões)</span></h4>${attentionHtml}${passedHtml||(!checks.length?'<p>Nenhum detalhe retornado.</p>':'')}</section>`;
  }).join('');
  const summaryHtml=overall==='PASS'
    ?`<div class="presell-result-summary is-compact"><strong>APROVADO</strong><span>${checkCount} verificação(ões) concluídas sem bloqueios.</span></div>`
    :`<div class="presell-result-summary"><strong>${overall==='BLOCKED'?'BLOQUEADO':overall==='PASS_WITH_WARNINGS'?'APROVADO COM AVISOS':escapeHtml(overall)}</strong><p>${escapeHtml(summary)} <span>${checkCount} verificação(ões) no total.</span></p></div>`;
  return `<div class="presell-result ${overall==='BLOCKED'?'is-error':overall==='PASS'?'is-pass':'is-warn'}">${summaryHtml}${phaseHtml|| (overall==='PASS'?'':'<p>Nenhum detalhe retornado.</p>')}</div>`;
}
