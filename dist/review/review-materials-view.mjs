import {VSL_MODES,materialSummary,exportDraft} from './review-materials-domain.mjs?v=1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountMaterials({root,controller,onChange=()=>{}}){
  let errors={},message='',errorMessage=false;
  const summary=()=>{
    root.querySelector('[data-material-summary]').innerHTML=materialSummary(controller.current().draft).map(item=>`<li data-state="${item.state}"><strong>${esc(item.label)}</strong><span>${esc(item.text)}</span></li>`).join('');
    const current=controller.current(),status=root.querySelector('[data-material-status]');
    const pending=controller.list().some(item=>item.draft.id===current.draft.id&&item.dirty);
    status.textContent=message||(pending?'Alterações não salvas.':current.savedAt?`Rascunho salvo em ${new Date(current.savedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}.`:'Novo rascunho. Informe o nome do produto para salvar.');
    status.classList.toggle('review-error',errorMessage);
    root.querySelector('[data-material-list]').innerHTML=controller.list().map(item=>`<button type="button" class="review-draft-item ${item.draft.id===current.draft.id?'is-active':''}" data-open-draft="${esc(item.draft.id)}" ${item.draft.id===current.draft.id?'aria-current="true"':''}><strong>${esc(item.draft.product||'Nova review')}</strong><small>${esc([item.draft.market,item.draft.language].filter(Boolean).join(' · ')||'Mercado e idioma a definir')}</small><small>Review ${esc(item.draft.id.slice(0,8))} · ${item.dirty?'Alterações pendentes':item.revision?'Salvo':'Ainda não salvo'}</small></button>`).join('');
  };
  function render(){
    const draft=controller.current().draft;
    const field=(key,label,{area=false,rows=3,placeholder=''}={})=>`<label for="reviewField-${key}">${label}${area?`<textarea id="reviewField-${key}" data-material-field="${key}" rows="${rows}" placeholder="${esc(placeholder)}" ${errors[key]?'aria-invalid="true" aria-describedby="reviewError-'+key+'"':''}>${esc(draft[key])}</textarea>`:`<input id="reviewField-${key}" data-material-field="${key}" value="${esc(draft[key])}" placeholder="${esc(placeholder)}" ${key==='product'?'aria-required="true"':''} ${errors[key]?'aria-invalid="true" aria-describedby="reviewError-'+key+'"':''}>`}${errors[key]?`<span class="review-field-error" id="reviewError-${key}">${esc(errors[key])}</span>`:''}</label>`;
    root.innerHTML=`<div class="review-materials-head"><div><h4>Rascunhos de reviews</h4><p>Cada review é independente, inclusive quando o produto tem o mesmo nome.</p></div><button class="btn primary hub-standard-action" type="button" data-material-action="new">Nova review</button></div>
      ${controller.warnings.length?'<p class="review-error" role="alert">Há rascunhos que não puderam ser lidos. Os registros foram preservados; você pode continuar os demais.</p>':''}
      <div class="review-materials-layout"><nav class="review-draft-list" data-material-list aria-label="Rascunhos de reviews"></nav><div class="review-material-form">
      <p class="review-material-status" data-material-status role="status" aria-live="polite"></p>
      <section><h4>Identificação</h4><p>Somente o nome do produto é obrigatório para salvar.</p><div class="review-form-grid">${field('product','Nome do produto *',{placeholder:'Nome como aparece na oferta'})}${field('market','País / mercado',{placeholder:'Ex.: Estados Unidos'})}${field('language','Idioma da review',{placeholder:'Ex.: Inglês'})}</div></section>
      <section><h4>VSL</h4><label for="reviewVslMode">Você tem a transcrição da VSL?<select id="reviewVslMode" data-material-field="vslMode"><option value="">Selecione uma opção</option>${Object.entries(VSL_MODES).map(([key,label])=>`<option value="${key}" ${draft.vslMode===key?'selected':''}>${label}</option>`).join('')}</select></label><div data-transcript-section ${draft.vslMode==='have'?'':'hidden'}>${field('transcript','Transcrição da VSL',{area:true,rows:7,placeholder:'Cole a transcrição completa ou o trecho disponível.'})}</div><p data-vsl-hint>${vslHint(draft)}</p></section>
      <section><h4>Página de vendas</h4>${field('salesUrl','URL da página de vendas',{placeholder:'https://...'})}${field('salesContent','Conteúdo ou HTML da página de vendas',{area:true,rows:6,placeholder:'Cole o texto ou HTML. O conteúdo será guardado como texto.'})}<p>A URL é apenas registrada. A coleta e a análise automáticas ficam para uma próxima etapa.</p></section>
      <section><h4>Materiais complementares</h4>${field('referenceLinks','Links de rótulo, ficha ou documentos',{area:true,placeholder:'Uma URL completa por linha.'})}${field('notes','Anotações dos materiais',{area:true,placeholder:'O que já temos, o que falta e observações sobre as fontes.'})}</section>
      <section><h4>Destino</h4>${field('affiliateUrl','Link afiliado',{placeholder:'https://...'})}${field('publicationUrl','URL prevista de publicação',{placeholder:'Pode definir depois.'})}${field('portal','Nome do portal',{placeholder:'Pode definir depois.'})}</section>
      <section><h4>Resumo dos materiais</h4><ul class="review-material-summary" data-material-summary></ul></section>
      <div class="review-material-actions"><button class="btn primary hub-standard-action" type="button" data-material-action="save">Salvar rascunho</button><button class="btn hub-standard-action" type="button" data-material-action="md">Baixar rascunho .md</button><button class="btn hub-standard-action" type="button" data-material-action="json">Baixar rascunho .json</button></div><p>Salvo somente neste navegador. Baixe uma cópia para guardar os materiais fora dele.</p>
      </div></div>`;
    summary();
  }
  function vslHint(draft){return draft.vslMode==='none'?'Você pode seguir com a página de vendas, o rótulo e o relato do reviewer.':draft.vslMode==='later'?'Você pode começar agora e adicionar a transcrição depois. O texto já colado permanece preservado.':draft.vslMode==='have'?'Cole o material disponível; você pode complementar depois.':'A VSL é opcional. Escolha a situação que corresponde aos materiais disponíveis.'}
  function update(event){
    const key=event.target.dataset.materialField;if(!key)return;
    controller.update(key,event.target.value);message='';errorMessage=false;
    if(errors[key]){delete errors[key];event.target.removeAttribute('aria-invalid');root.querySelector(`#reviewError-${key}`)?.remove()}
    if(key==='vslMode'){root.querySelector('[data-transcript-section]').hidden=event.target.value!=='have';root.querySelector('[data-vsl-hint]').textContent=vslHint(controller.current().draft)}
    summary();onChange();
  }
  root.addEventListener('input',event=>{if(event.target.tagName!=='SELECT')update(event)});
  root.addEventListener('change',event=>{if(event.target.tagName==='SELECT')update(event)});
  root.addEventListener('click',async event=>{
    const open=event.target.closest('[data-open-draft]');
    if(open){controller.select(open.dataset.openDraft);errors={};message='';errorMessage=false;render();return}
    const button=event.target.closest('[data-material-action]'),action=button?.dataset.materialAction;
    if(action==='new'){controller.create();errors={};message='';errorMessage=false;render();root.querySelector('[data-material-field="product"]').focus()}
    if(action==='save'){
      button.disabled=true;
      try{
        const targetId=controller.current().draft.id,save=()=>controller.save(targetId);
        if(navigator.locks?.request)await navigator.locks.request('hub-review-materials-'+targetId,save);else save();
        errors={};errorMessage=false;message='Rascunho salvo. Os materiais e as revisões anteriores foram preservados.';render();onChange();
      }catch(error){errors=error.fields||{};errorMessage=true;message=`Não foi possível salvar: ${error.message} Você pode baixar as edições atuais.`;render();root.querySelector('[aria-invalid="true"]')?.focus()}
      finally{button.disabled=false}
    }
    if(action==='md'||action==='json'){
      const draft=controller.current().draft,data=action==='json'?JSON.stringify(draft,null,2):exportDraft(draft);
      const url=URL.createObjectURL(new Blob([data],{type:action==='json'?'application/json;charset=utf-8':'text/markdown;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download=`review-${draft.id.slice(0,8)}.${action}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message='Rascunho exportado com as edições atuais.';errorMessage=false;summary();
    }
  });
  render();
}
