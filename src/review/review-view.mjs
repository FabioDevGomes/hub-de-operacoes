import {STEPS,DECISIONS,normalizePlan,summarizePlan,exportPlan} from './review-domain.mjs?v=5';
import {loadPlan,savePlan} from './review-storage.mjs?v=1';
import {createMaterialsController} from './review-materials-controller.mjs?v=1';
import {mountMaterials} from './review-materials-view.mjs?v=2';
import {createAnalysisController} from './review-analysis-controller.mjs?v=2';
import {mountAnalysis} from './review-analysis-view.mjs?v=2';
import {createReviewerController} from './review-reviewer-controller.mjs?v=2';
import {mountReviewer} from './review-reviewer-view.mjs?v=2';
import {createOfferController} from './review-offer-controller.mjs?v=2';
import {mountOffer} from './review-offer-view.mjs?v=2';
import {createImagesController} from './review-images-controller.mjs?v=2';
import {mountImages} from './review-images-view.mjs?v=3';
import {createCopyController} from './review-copy-controller.mjs?v=1';
import {mountCopy} from './review-copy-view.mjs?v=1';
import {createPageController} from './review-page-controller.mjs?v=1';
import {mountPage} from './review-page-view.mjs?v=2';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const instances=new WeakMap();
export function mount({root}){
  if(instances.has(root))return instances.get(root);
  let plan=normalizePlan(),active=STEPS[0].id,savedAt=null,dirty=false,loadError='';
  try{({plan,savedAt}=loadPlan(window.localStorage))}catch(error){loadError=error.message}
  let savedContent=JSON.stringify(plan);
  let materials=null,materialsError='';
  try{materials=createMaterialsController({storage:window.localStorage,createId:()=>crypto.randomUUID()})}catch(error){materialsError=error.message}
  const analysis=materials?createAnalysisController({storage:window.localStorage,materials,createId:()=>crypto.randomUUID()}):null;
  const reviewer=materials?createReviewerController({storage:window.localStorage,materials}):null;
  const offer=materials?createOfferController({storage:window.localStorage,materials}):null;
  const images=materials&&offer?createImagesController({storage:window.localStorage,materials,offer}):null;
  const copy=materials&&analysis&&reviewer&&offer&&images?createCopyController({storage:window.localStorage,materials,analysis,reviewer,offer,images}):null;
  const page=materials&&analysis&&reviewer&&offer&&images&&copy?createPageController({storage:window.localStorage,materials,analysis,reviewer,offer,images,copy}):null;
  root.innerHTML=`<div class="review-shell">
    <div class="review-intro"><div><span class="review-eyebrow">CRIAÇÃO DE OFERTAS · MVP</span><h2>Da VSL à página de Review</h2><p>Organize materiais, experiência real, oferta, assets, copy e entrega por review.</p></div><span class="review-badge">Passos 1 a 7 disponíveis</span></div>
    <details class="review-plan-tools"><summary>Plano de implementação · prioridades e exportação</summary><div class="review-toolbar"><label for="reviewProduct">Nome do plano de implementação<input id="reviewProduct" placeholder="Opcional; os produtos são cadastrados no passo 1." value="${escape(plan.product)}"></label><div class="review-actions"><button class="btn hub-standard-action" type="button" data-action="save">Salvar plano</button><button class="btn hub-standard-action" type="button" data-action="markdown">Baixar plano .md</button><button class="btn hub-standard-action" type="button" data-action="json">Baixar dados .json</button></div></div></details>
    <p class="review-save-status" role="status" aria-live="polite"></p>
    <div class="review-summary" aria-live="polite"></div>
    <div class="review-workspace"><nav class="review-steps" aria-label="Etapas da Review">${STEPS.map((step,i)=>`<button type="button" class="review-step" data-step="${step.id}"><span class="review-step-number">${i+1}</span><span><strong>${escape(step.title)}</strong><small>${escape(step.phase)}</small><span class="review-step-status"></span></span></button>`).join('')}</nav><article class="review-detail"></article></div>
    <div class="review-scope"><strong>Disponível neste MVP</strong><p>Passos 1–7: materiais, análise, reviewer, oferta, imagens/URLs numeradas, copy rastreável e montagem, validação e exportação de HTML.</p><p>A análise usa copiar e colar com o assistente. Coleta automática por URL, geração de imagens, hospedagem e envio a buscadores não estão disponíveis. A exportação não garante indexação.</p></div>
  </div>`;
  const detail=root.querySelector('.review-detail'),status=root.querySelector('.review-save-status');
  function message(text,error=false){status.textContent=text;status.classList.toggle('review-error',error)}
  function updateSummary(){
    const counts=summarizePlan(plan);
    root.querySelector('.review-summary').innerHTML=`<span><b>${STEPS.length}</b> etapas propostas</span><span><b>${counts.now}</b> para implementar agora</span><span><b>${counts.later}</b> para depois</span><span><b>${counts.undecided}</b> a decidir</span>`;
    for(const button of root.querySelectorAll('[data-step]')){
      const id=button.dataset.step,selected=id===active;
      button.classList.toggle('is-active',selected);
      if(selected)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
      button.querySelector('.review-step-status').textContent=DECISIONS[plan.steps[id].decision];
      button.querySelector('.review-step-status').dataset.state=plan.steps[id].decision;
    }
  }
  function changed(){dirty=JSON.stringify(plan)!==savedContent;message(dirty?'Alterações ainda não salvas. Use Salvar plano para guardar neste navegador.':savedAt?'Plano recuperado deste navegador.':'Nenhuma alteração pendente de salvamento.');updateSummary()}
  function renderDetail(){
    const index=STEPS.findIndex(step=>step.id===active),step=STEPS[index];
    const implemented=['materials','analysis','reviewer','offer','images','copy','page'].includes(active);
    const list=items=>`<ul>${items.map(v=>`<li>${escape(v)}</li>`).join('')}</ul>`;
    detail.innerHTML=`<header><span class="review-eyebrow">PASSO ${index+1} DE ${STEPS.length} · ${escape(step.phase)}</span><h3>${escape(step.title)}</h3><p>${escape(step.summary)}</p></header>
      ${implemented?`<div class="review-${active}-root"></div><details class="review-step-plan"><summary>Ver planejamento deste passo e registrar observações</summary>`:''}
      <div class="review-decision"><label for="reviewDecision">${implemented?'Prioridade registrada no plano (passo já disponível)':'Quando implementar este passo?'}<select id="reviewDecision">${Object.entries(DECISIONS).map(([value,label])=>`<option value="${value}" ${plan.steps[active].decision===value?'selected':''}>${label}</option>`).join('')}</select></label>${step.recommended?'<span class="review-hint">Sugestão para começar: organizar estes dados antes de automatizar.</span>':''}</div>
      <div class="review-columns"><section><h4>O que você vai informar</h4>${list(step.inputs)}</section><section><h4>O que vamos obter</h4>${list(step.outputs)}</section></div>
      <section class="review-adjustments"><h4>Pontos a ajustar no modelo</h4>${list(step.adjustments)}</section>
      <section class="review-next"><h4>${implemented?'Implementação deste passo':'Próxima implementação deste passo'}</h4><p>${escape(step.next)}</p><span class="review-badge">${implemented?'Disponível':'A definir com você'}</span></section>
      <label class="review-notes" for="reviewNotes">Decisões e observações<textarea id="reviewNotes" rows="3" placeholder="Anote o que quer implementar, mudar ou discutir neste passo.">${escape(plan.steps[active].notes)}</textarea></label>
      ${implemented?'</details>':''}<div class="review-detail-navigation"><button class="btn hub-standard-action" type="button" data-action="previous" ${index===0?'disabled':''}>Passo anterior</button><button class="btn primary hub-standard-action" type="button" data-action="next" ${index===STEPS.length-1?'disabled':''}>Próximo passo</button></div>`;
    if(active==='materials'){
      const materialsRoot=detail.querySelector('.review-materials-root');
      if(materials)mountMaterials({root:materialsRoot,controller:materials});else materialsRoot.innerHTML=`<p class="review-error" role="alert">Não foi possível abrir os rascunhos: ${escape(materialsError)}. Os registros foram preservados.</p>`;
    }
    if(active==='analysis'){
      const analysisRoot=detail.querySelector('.review-analysis-root');
      if(analysis)mountAnalysis({root:analysisRoot,controller:analysis,materials});else analysisRoot.innerHTML=`<p class="review-error" role="alert">Os materiais não puderam ser lidos: ${escape(materialsError)}.</p>`;
    }
    if(active==='reviewer'){
      const reviewerRoot=detail.querySelector('.review-reviewer-root');
      if(reviewer)mountReviewer({root:reviewerRoot,controller:reviewer,materials});else reviewerRoot.innerHTML=`<p class="review-error" role="alert">Os materiais não puderam ser lidos: ${escape(materialsError)}.</p>`;
    }
    if(active==='offer'){
      const offerRoot=detail.querySelector('.review-offer-root');
      if(offer)mountOffer({root:offerRoot,controller:offer,materials});else offerRoot.innerHTML=`<p class="review-error" role="alert">Os materiais não puderam ser lidos: ${escape(materialsError)}.</p>`;
    }
    if(active==='images'){
      const imagesRoot=detail.querySelector('.review-images-root');
      if(images)mountImages({root:imagesRoot,controller:images,materials,offer,storage:window.localStorage});else imagesRoot.innerHTML=`<p class="review-error" role="alert">Os materiais não puderam ser lidos: ${escape(materialsError)}.</p>`;
    }
    if(active==='copy'){
      const copyRoot=detail.querySelector('.review-copy-root');
      if(copy)mountCopy({root:copyRoot,controller:copy,materials});else copyRoot.innerHTML=`<p class="review-error" role="alert">As etapas anteriores não puderam ser lidas: ${escape(materialsError||'componente indisponível')}.</p>`;
    }
    if(active==='page'){
      const pageRoot=detail.querySelector('.review-page-root');
      if(page)mountPage({root:pageRoot,controller:page,materials});else pageRoot.innerHTML=`<p class="review-error" role="alert">As etapas anteriores não puderam ser lidas: ${escape(materialsError||'componente indisponível')}.</p>`;
    }
    updateSummary();
  }
  function download(format){
    const data=format==='json'?JSON.stringify(plan,null,2):exportPlan(plan);
    const url=URL.createObjectURL(new Blob([data],{type:format==='json'?'application/json;charset=utf-8':'text/markdown;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`review-plano.${format==='json'?'json':'md'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    message('Plano exportado com as escolhas atuais. A exportação não gera a página de review.');
  }
  root.addEventListener('input',event=>{
    if(event.target.id==='reviewProduct'){plan.product=event.target.value;changed()}
    if(event.target.id==='reviewNotes'){plan.steps[active].notes=event.target.value;changed()}
  });
  root.addEventListener('change',event=>{if(event.target.id==='reviewDecision'){plan.steps[active].decision=event.target.value;changed()}});
  root.addEventListener('click',event=>{
    const step=event.target.closest('[data-step]');
    if(step){active=step.dataset.step;renderDetail();return}
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action==='previous'||action==='next'){
      const index=STEPS.findIndex(step=>step.id===active)+(action==='next'?1:-1);
      if(STEPS[index]){active=STEPS[index].id;renderDetail();detail.querySelector('h3').setAttribute('tabindex','-1');detail.querySelector('h3').focus()}
    }
    if(action==='markdown'||action==='json')download(action==='json'?'json':'md');
    if(action==='save'){
      try{if(loadError)throw new Error(loadError);savedAt=savePlan(window.localStorage,plan,{expectedSavedAt:savedAt});savedContent=JSON.stringify(plan);dirty=false;message('Plano salvo neste navegador. Versões anteriores foram preservadas.')}catch(error){message(`Não foi possível salvar: ${error.message} Você pode baixar o plano.`,true)}
    }
  });
  window.addEventListener('beforeunload',event=>{if(dirty||materials?.hasUnsaved()||analysis?.hasUnsaved()||reviewer?.hasUnsaved()||offer?.hasUnsaved()||images?.hasUnsaved()||copy?.hasUnsaved()||page?.hasUnsaved()){event.preventDefault();event.returnValue=''}});
  renderDetail();
  message(loadError?`Não foi possível recuperar o plano: ${loadError}`:savedAt?'Plano recuperado deste navegador.':'Nenhuma prioridade definida. Explore os passos e escolha por onde começar.',Boolean(loadError));
  const instance={};instances.set(root,instance);return instance;
}
