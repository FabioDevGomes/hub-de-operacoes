import {parseOfferText,dictionaryFor} from './copy-ficha-domain.mjs?v=20';
import {minimumOfferProductPrice,productPriceCondition,buildOfferQuestionAnswers,formatOfferQuestionAnswers} from './copy-ficha-questions.mjs?v=2';
import {buildStructuredFicha,structuredFichaFormat} from './copy-ficha-structured.mjs?v=1';
import {createPresellFromFicha,reportHtml as presellReportHtml} from '../presell/presell-view.mjs?v=4';

let mounted=false,creatingPresell=false;
const STORAGE_KEY='copy-ficha-draft-v1';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const by=(root,id)=>root.querySelector(`#${id}`);
export function readOfferQuestionAnswers(root){
  return [...root.querySelectorAll('[data-offer-answer]')].map(field=>({question:field.dataset.offerQuestion,answer:field.value}));
}

function resizeOfferAnswer(field){
  field.style.height='auto';field.style.height=`${field.scrollHeight}px`;
}

function renderOfferQuestions(root,questions=[]){
  const host=by(root,'copyOfferQuestions');if(!host)return;
  by(root,'copyQuestionsCopy').disabled=!questions.length;
  host.replaceChildren();
  if(!questions.length){
    const empty=document.createElement('p');empty.className='copy-ficha-output-empty';empty.textContent='Clique em Gerar perguntas e respostas para preencher este quadro com os dados da oferta.';host.append(empty);return;
  }
  const list=document.createElement('dl');list.className='copy-ficha-question-list';
  for(const {id,question,answer,pending} of questions){
    const row=document.createElement('div');row.className=`copy-ficha-question${pending?' is-unidentified':''}`;
    const title=document.createElement('dt');title.id=`copyQuestionLabel-${id}`;title.textContent=question;
    const value=document.createElement('dd'),input=document.createElement('textarea');
    input.className='copy-ficha-answer-input';input.rows=1;input.value=answer;input.setAttribute('aria-labelledby',title.id);
    input.dataset.offerAnswer=id;input.dataset.offerQuestion=question;value.append(input);
    row.append(title,value);list.append(row);
  }
  host.append(list);
  host.querySelectorAll('[data-offer-answer]').forEach(resizeOfferAnswer);
}

function updateProductPriceNote(root){
  const field=by(root,'copyProductPrice'),note=by(root,'copyProductPriceNote');if(!field||!note)return;
  const condition=productPriceCondition({basis:field.dataset.priceBasis,quantity:Number(field.dataset.priceQuantity)||null,terms:field.dataset.priceTerms});
  note.textContent=!field.value?'Revise ou informe o preço do produto.':field.dataset.autoFilled==='true'?condition||'Menor preço identificado na oferta.':'Preço ajustado manualmente.';
}

function clearProductPriceContext(root){
  const field=by(root,'copyProductPrice');if(!field)return;
  for(const key of ['priceBasis','priceQuantity','priceTerms'])delete field.dataset[key];
}

export function canApplyDetectedValue(field,value,{force=false}={}){
  const candidate=String(value??'').trim(),current=String(field?.value??'').trim();
  if(!field||!candidate||current===candidate)return false;
  return force||!current||field.dataset?.autoFilled==='true';
}

export function collectAutoFilledFieldIds(fields){
  return [...fields].filter(field=>field?.id&&field.dataset?.autoFilled==='true').map(field=>field.id);
}

export function restoreAutoFilledFieldIds(fields,ids=[]){
  const autoFilled=new Set(Array.isArray(ids)?ids:[]);
  for(const field of fields){
    if(!field?.id||!autoFilled.has(field.id))continue;
    field.dataset.autoFilled='true';
    field.classList?.add('is-autofilled');
  }
}

function updatePendingHighlights(root,{fields=[]}={}){
  const pending=new Set(fields),fieldIds={
    product:'copyProduct',countryCode:'copyCountry',htmlLanguage:'copyLanguage',currency:'copyCurrency',
    confirmedProductPrice:'copyProductPrice',
    freeShipping:'copyFreeShipping',guaranteeStatus:'copyGuaranteeStatus',guaranteeDays:'copyGuarantee',
    affiliateUrl:'copyAffiliateUrl',destination:'copyDestination',pageTitle:'copyPageTitle',assetFolder:'copyAssetFolder',fichaSource:'copyFichaSource'
  };
  root.querySelectorAll('.is-pending').forEach(field=>{field.classList.remove('is-pending');field.removeAttribute('aria-invalid')});
  for(const [key,id] of Object.entries(fieldIds)){
    const field=by(root,id);
    if(pending.has(key)&&field){field.classList.add('is-pending');field.setAttribute('aria-invalid','true')}
  }
}

function inputValue(root,id){return by(root,id)?.value?.trim()||''}
function normalizedUrl(value){
  const text=String(value||'').trim(),markdown=text.match(/^\[(https?:\/\/[^\]]+)\]\([^)]+\)$/);
  return markdown?markdown[1]:text;
}
function payload(root){
  return {
    dtcUrl:normalizedUrl(inputValue(root,'copyDtcUrl')),
    rawText:inputValue(root,'copyRawText'),
    product:inputValue(root,'copyProduct'),
    countryCode:inputValue(root,'copyCountry').toUpperCase(),
    htmlLanguage:inputValue(root,'copyLanguage'),
    currency:inputValue(root,'copyCurrency').toUpperCase(),
    confirmedDiscountPercent:inputValue(root,'copyDiscount'),
    confirmedDiscountAmount:inputValue(root,'copyDiscountAmount'),
    confirmedProductPrice:inputValue(root,'copyProductPrice'),
    productPriceBasis:by(root,'copyProductPrice')?.dataset.priceBasis||'',
    productPriceQuantity:by(root,'copyProductPrice')?.dataset.priceQuantity||'',
    productPriceTerms:by(root,'copyProductPrice')?.dataset.priceTerms||'',
    pageTitle:inputValue(root,'copyPageTitle'),
    destination:inputValue(root,'copyDestination'),
    assetFolder:inputValue(root,'copyAssetFolder')||'assets',
    affiliateUrl:normalizedUrl(inputValue(root,'copyAffiliateUrl')),
    guaranteeDays:inputValue(root,'copyGuarantee'),
    guaranteeStatus:inputValue(root,'copyGuaranteeStatus'),
    freeShipping:inputValue(root,'copyFreeShipping')
  };
}
function saveDraft(root){
  try{
    const previous=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')||{};
    const draft={...previous,...payload(root),autoFilledFields:collectAutoFilledFieldIds(root.querySelectorAll('[data-auto-filled="true"]'))};
    if(Array.isArray(previous.packages))draft.packages=previous.packages;
    delete draft.packagesManuallyEdited;
    localStorage.setItem(STORAGE_KEY,JSON.stringify(draft));
  }catch{}
}
function restoreDraft(root){
  try{
    const draft=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(!draft)return;
    const fields={copyDtcUrl:draft.dtcUrl,copyRawText:draft.rawText,copyProduct:draft.product,copyCountry:draft.countryCode,copyLanguage:draft.htmlLanguage,copyCurrency:draft.currency,copyDiscount:draft.confirmedDiscountPercent,copyDiscountAmount:draft.confirmedDiscountAmount,copyPageTitle:draft.pageTitle,copyDestination:draft.destination,copyAssetFolder:draft.assetFolder,copyAffiliateUrl:draft.affiliateUrl,copyGuarantee:draft.guaranteeDays,copyGuaranteeStatus:draft.guaranteeStatus,copyFreeShipping:draft.freeShipping};
    for(const [id,value] of Object.entries(fields))if(by(root,id)&&value!==undefined)by(root,id).value=value;
    if(draft.guaranteeStatus===undefined&&draft.guaranteeDays)by(root,'copyGuaranteeStatus').value='confirmed';
    restoreAutoFilledFieldIds(root.querySelectorAll('input,select,textarea'),draft.autoFilledFields);
    if(draft.confirmedProductPrice!==undefined){
      const price=by(root,'copyProductPrice');price.value=draft.confirmedProductPrice;
      price.dataset.priceBasis=draft.productPriceBasis||'';price.dataset.priceQuantity=draft.productPriceQuantity||'';price.dataset.priceTerms=draft.productPriceTerms||'';
    }
  }catch{}
}

function resetCollection(root,toast){
  if(!confirm('Limpar todos os campos e resultados desta coleta?'))return;
  try{localStorage.removeItem(STORAGE_KEY)}catch{}
  const blankFields=['copyDtcUrl','copyAffiliateUrl','copyRawText','copyProduct','copyCountry','copyLanguage','copyCurrency','copyDiscount','copyDiscountAmount','copyProductPrice','copyGuarantee','copyPageTitle','copyDestination','copyFichaSource'];
  blankFields.forEach(id=>{const field=by(root,id);if(field)field.value=''});
  const pendingFields=['copyFreeShipping','copyGuaranteeStatus'];
  pendingFields.forEach(id=>{const field=by(root,id);if(field)field.value='pending'});
  by(root,'copyAssetFolder').value='assets';
  root.querySelectorAll('[data-auto-filled],.is-autofilled').forEach(field=>{delete field.dataset.autoFilled;field.classList.remove('is-autofilled')});
  by(root,'copyDetected').innerHTML='';
  by(root,'copyAnalysisNote').textContent='';
  clearGeneratedOutputs(root);clearProductPriceContext(root);updateProductPriceNote(root);updateDiscountAmountLabel(root);
  const warnings=by(root,'copyWarnings');
  warnings.className='copy-ficha-note';
  warnings.textContent='Preencha e valide os dados para gerar.';
  by(root,'copyDtcUrl').focus();
  toast?.('Nova coleta iniciada');
}

function applyDetected(root,id,value,{force=false}={}){
  const field=by(root,id);
  if(!canApplyDetectedValue(field,value,{force}))return false;
  field.value=String(value);
  field.dataset.autoFilled='true';
  field.classList.add('is-autofilled');
  return true;
}

function updateDiscountAmountLabel(root){
  const currency=inputValue(root,'copyCurrency')||'USD',label=by(root,'copyDiscountAmountLabel'),field=by(root,'copyDiscountAmount');
  if(label)label.textContent=`Valor do desconto (${currency})`;
  const priceLabel=by(root,'copyProductPriceLabel');if(priceLabel)priceLabel.textContent=`Menor preço identificado (${currency})`;
  field?.setAttribute('aria-label',`Valor de desconto associado ao percentual confirmado, em ${currency}`);
}

function clearAutoDiscountAmount(root){
  const field=by(root,'copyDiscountAmount');
  if(field?.dataset.autoFilled!=='true')return;
  field.value='';delete field.dataset.autoFilled;delete field.dataset.discountPercent;field.classList.remove('is-autofilled');
}

function refreshAutoDiscountAmount(root){
  const field=by(root,'copyDiscountAmount');
  if(field?.dataset.autoFilled!=='true')return null;
  if(field.dataset.discountPercent!==inputValue(root,'copyDiscount'))clearAutoDiscountAmount(root);
  return null;
}

function useProductSuggestion(root,value){
  const field=by(root,'copyProduct'),candidate=String(value||'').trim();
  if(!field||!candidate)return;
  field.value=candidate;
  field.dataset.autoFilled='true';
  field.classList.add('is-autofilled');
  const titleField=by(root,'copyPageTitle'),titleCandidate=`${candidate} | ${dictionaryFor(inputValue(root,'copyLanguage')||'en-US').offer}`;
  if(titleField&&(!titleField.value||titleField.dataset.autoFilled==='true'))applyDetected(root,'copyPageTitle',titleCandidate,{force:true});
  root.querySelector('.copy-ficha-suggestion')?.remove();
  invalidateGeneratedOutputs(root,'Produto atualizado pela sugestão. Revise os dados e gere novamente as perguntas ou a ficha.');
  by(root,'copyAnalysisNote').textContent=`Sugestão aplicada: ${candidate}. Revise se esse nome identifica o produto anunciado ou apenas a marca.`;
  updatePendingHighlights(root);
  saveDraft(root);
}

function analyze(root){
  invalidateGeneratedOutputs(root,'Análise atualizada. Revise os dados antes de gerar as perguntas ou a ficha.');
  clearAutoDiscountAmount(root);
  const rawText=inputValue(root,'copyRawText'),result=parseOfferText(rawText,normalizedUrl(inputValue(root,'copyDtcUrl'))),applied=[];
  const productSuggestionLabel=result.productCandidateSource==='body_corroborated_footer'?'Produto sugerido pelo título/rodapé (revisar)':'Produto sugerido pelo rodapé (revisar)';
  const productField=by(root,'copyProduct'),currentProduct=inputValue(root,'copyProduct'),hasManualProduct=Boolean(result.productCandidate&&currentProduct&&productField?.dataset.autoFilled!=='true'&&currentProduct!==result.productCandidate);
  if(applyDetected(root,'copyProduct',result.productCandidate))applied.push(result.productCandidateNeedsReview?productSuggestionLabel.toLowerCase():'produto');
  if(applyDetected(root,'copyCountry',result.countryCode))applied.push('país');
  if(applyDetected(root,'copyLanguage',result.htmlLanguage,{force:Boolean(result.htmlLanguage)}))applied.push('idioma');
  if(applyDetected(root,'copyCurrency',result.currency,{force:Boolean(result.currency)}))applied.push('moeda');
  updateDiscountAmountLabel(root);
  const lowest=minimumOfferProductPrice(rawText),priceField=by(root,'copyProductPrice');
  if(lowest&&(applyDetected(root,'copyProductPrice',lowest.value.toFixed(2))||priceField.dataset.autoFilled==='true')){
    priceField.dataset.priceBasis=lowest.basis||'';priceField.dataset.priceQuantity=String(lowest.quantity??'');priceField.dataset.priceTerms=lowest.terms||'';applied.push('menor preço');
  }else if(!lowest&&priceField.dataset.autoFilled==='true'){
    priceField.value='';delete priceField.dataset.autoFilled;priceField.classList.remove('is-autofilled');clearProductPriceContext(root);
  }
  updateProductPriceNote(root);
  if(applyDetected(root,'copyDiscount',result.highestPercent,{force:true}))applied.push('maior desconto');
  const guaranteeApplied=applyDetected(root,'copyGuarantee',result.guaranteeDays);
  if(guaranteeApplied)applied.push('garantia');
  if(guaranteeApplied&&inputValue(root,'copyGuaranteeStatus')==='pending')applyDetected(root,'copyGuaranteeStatus','confirmed',{force:true});
  const titleProduct=inputValue(root,'copyProduct')||result.productCandidate,titleLanguage=result.htmlLanguage||inputValue(root,'copyLanguage'),titleCandidate=titleProduct?`${titleProduct} | ${dictionaryFor(titleLanguage).offer}`:result.pageTitleCandidate;
  if(applyDetected(root,'copyPageTitle',titleCandidate))applied.push('título da página');
  if(result.freeShippingCandidate&&applyDetected(root,'copyFreeShipping','confirmed',{force:inputValue(root,'copyFreeShipping')==='pending'}))applied.push('frete grátis');
  const discountAmountField=by(root,'copyDiscountAmount');
  if(result.highestSavingsAmount!==null&&result.highestSavingsAmount!==undefined&&applyDetected(root,'copyDiscountAmount',Number(result.highestSavingsAmount).toFixed(2),{force:true})){
    discountAmountField.dataset.discountPercent=String(result.highestPercent??'');
    applied.push('valor associado ao maior desconto');
  }
  else if(result.highestPercent&&discountAmountField){
    discountAmountField.value='';delete discountAmountField.dataset.autoFilled;discountAmountField.classList.remove('is-autofilled');
  }
  const chips=[];
  if(result.productCandidate)chips.push(`${result.productCandidateNeedsReview?productSuggestionLabel:'Produto'}: ${result.productCandidate}`);
  if(result.countryCode)chips.push(`País: ${result.countryCode}`);
  if(result.htmlLanguage)chips.push(`Idioma: ${result.htmlLanguage}`);
  if(result.highestPercent)chips.push(`Maior percentual detectado: ${result.highestPercent}%`);
  if(result.highestSavingsAmount!==null&&result.highestSavingsAmount!==undefined)chips.push(`Valor associado ao maior desconto: ${inputValue(root,'copyCurrency')||'USD'} ${Number(result.highestSavingsAmount).toFixed(2)}`);
  if(result.guaranteeDays)chips.push(`Garantia candidata: ${result.guaranteeDays} dias`);
  if(result.freeShippingCandidate)chips.push('Candidato: frete grátis');
  const detected=by(root,'copyDetected');
  detected.innerHTML=chips.length?chips.map(item=>`<span class="copy-ficha-chip">${esc(item)}</span>`).join(''):'<span class="copy-ficha-note">Nenhum preço, desconto ou condição reconhecível foi detectado automaticamente.</span>';
  if(hasManualProduct&&result.productCandidate){
    const useSuggestion=document.createElement('button');
    useSuggestion.type='button';
    useSuggestion.className='copy-ficha-btn copy-ficha-suggestion';
    useSuggestion.textContent=`Usar sugestão de produto: ${result.productCandidate}`;
    useSuggestion.onclick=()=>useProductSuggestion(root,result.productCandidate);
    detected.append(useSuggestion);
  }
  const analysisMessage=hasManualProduct?`O campo Produto já tem um valor manual e foi preservado. A análise detectou “${result.productCandidate}”; use o botão ao lado se quiser aplicar a sugestão.${result.productCandidateNeedsReview?` ${result.productCandidateEvidence} Confira se é o produto anunciado ou apenas a marca.`:''}`:result.productCandidateNeedsReview?`${result.productCandidateEvidence} Revise se este nome identifica o produto anunciado ou apenas a marca.`:applied.length?`Preenchido automaticamente: ${applied.join(', ')}. Revise os dados antes de gerar perguntas ou ficha.`:'Os dados detectados foram mantidos como candidatos. Revise os campos acima.';
  by(root,'copyAnalysisNote').textContent=analysisMessage;
  updatePendingHighlights(root);
  saveDraft(root);
}

function setOutput(root,id,value){by(root,id).value=value;if(id==='copyFichaJson')by(root,'copyDownloadFicha').disabled=!value}
function clearGeneratedOutputs(root,{preserveQuestions=false}={}){
  setOutput(root,'copyFichaJson','');
  clearPresellFeedback(root,'Dados alterados. Valide novamente antes de criar a Precel.');
  if(!preserveQuestions)renderOfferQuestions(root);
}
function clearPresellFeedback(root,message=''){
  const status=by(root,'copyPresellStatus'),report=by(root,'copyPresellReport');
  if(status)status.textContent=message;
  if(report)report.replaceChildren();
}
function invalidateGeneratedOutputs(root,message){
  clearGeneratedOutputs(root);
  const host=by(root,'copyWarnings');
  host.className='copy-ficha-note';
  host.textContent=message;
}
function renderWarnings(root,warnings,{blocked=false}={}){
  const host=by(root,'copyWarnings');
  host.replaceChildren();
  if(!warnings.length){host.className='copy-ficha-success';host.textContent='Ficha JSON gerada. Revise antes de publicar.';return}
  host.className=`copy-ficha-warning copy-ficha-warning-listing${blocked?' is-blocked':''}`;
  const heading=document.createElement('div');heading.className='copy-ficha-warning-heading';
  const title=document.createElement('strong');title.textContent=blocked?'Ficha bloqueada':'Itens para revisar na ficha';
  const count=document.createElement('span');count.className='copy-ficha-warning-count';count.textContent=`${warnings.length} ${warnings.length===1?'item':'itens'}`;
  heading.append(title,count);host.append(heading);
  const list=document.createElement('ol');list.className='copy-ficha-warning-list';
  for(const warning of warnings){const item=document.createElement('li');item.textContent=warning;list.append(item)}
  host.append(list);
}
function clearValidationMessages(root){
  const host=by(root,'copyWarnings');
  host.replaceChildren();host.className='copy-ficha-note';
}
function refreshDetectedProductPrice(root){
  if(!inputValue(root,'copyProductPrice')||by(root,'copyProductPrice').dataset.autoFilled==='true'){
    const lowest=minimumOfferProductPrice(inputValue(root,'copyRawText'));
    if(lowest){
      applyDetected(root,'copyProductPrice',lowest.value.toFixed(2));
      const field=by(root,'copyProductPrice');field.dataset.priceBasis=lowest.basis||'';field.dataset.priceQuantity=String(lowest.quantity??'');field.dataset.priceTerms=lowest.terms||'';updateProductPriceNote(root);
    }else if(by(root,'copyProductPrice').dataset.autoFilled==='true'){
      const field=by(root,'copyProductPrice');field.value='';delete field.dataset.autoFilled;field.classList.remove('is-autofilled');clearProductPriceContext(root);updateProductPriceNote(root);
    }
  }
}

function generateQuestions(root,toast){
  refreshDetectedProductPrice(root);
  renderOfferQuestions(root,buildOfferQuestionAnswers(payload(root)));
  saveDraft(root);
  toast?.('Perguntas e respostas geradas');
}

function renderPresellReports(root,reports=[]){
  const host=by(root,'copyPresellReport');if(!host)return;
  host.replaceChildren();
  for(const {title,report} of reports){
    if(!report)continue;
    const section=document.createElement('section');section.className='copy-ficha-presell-report';
    const heading=document.createElement('h4');heading.textContent=title;
    section.append(heading);
    const body=document.createElement('div');body.innerHTML=presellReportHtml(report);section.append(body);
    host.append(section);
  }
}

async function generateFichaAndCreatePresell(root,toast){
  setOutput(root,'copyFichaJson','');
  clearPresellFeedback(root,'Validando o conteúdo obrigatório da ficha…');
  clearValidationMessages(root);
  const {ficha,warnings}=buildStructuredFicha(inputValue(root,'copyFichaSource'),payload(root));
  setOutput(root,'copyFichaJson',JSON.stringify(ficha,null,2));
  updatePendingHighlights(root);
  by(root,'copyPresellStatus').textContent='A ficha está válida. Confirmando antes de criar os arquivos da Precel…';
  const result=await createPresellFromFicha(ficha);
  if(result.cancelled){
    by(root,'copyPresellStatus').textContent='Criação cancelada. A validação foi somente leitura e nenhum arquivo foi criado.';
    return;
  }
  const productionReport=result.production?.report||result.production;
  const reports=[{title:'Validação após a criação',report:productionReport}];
  const finalStatus=productionReport?.overall;
  const status=finalStatus==='BLOCKED'
    ?'Os arquivos da Precel foram gerados, mas a validação final apontou bloqueios. Confira o relatório antes de publicar.'
    :`Precel criada. A ficha passou pela validação e ${ficha.faqs.length} FAQs foram processadas.`;
  by(root,'copyPresellStatus').textContent=status;
  renderPresellReports(root,reports);
  renderWarnings(root,warnings);
  toast?.(finalStatus==='BLOCKED'?'Precel processada com bloqueios na validação final.':`Precel criada com ${ficha.faqs.length} FAQs.`,finalStatus==='BLOCKED');
}

async function copyOutput(root,id,toast){
  const field=by(root,id);
  if(!field.value)return;
  await copyText(field.value,toast);
}

async function copyText(value,toast){
  if(!value)return;
  try{await navigator.clipboard.writeText(value)}catch{
    const temporary=document.createElement('textarea');temporary.value=value;temporary.setAttribute('readonly','');temporary.style.position='fixed';temporary.style.opacity='0';document.body.append(temporary);temporary.select();
    try{if(!document.execCommand('copy'))throw new Error('Clipboard unavailable')}catch{toast?.('Não foi possível copiar o conteúdo');temporary.remove();return}
    temporary.remove();
  }
  toast?.('Conteúdo copiado');
}

function downloadFicha(root){
  const value=by(root,'copyFichaJson').value;
  if(!value)return;
  const product=inputValue(root,'copyProduct').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'oferta';
  const url=URL.createObjectURL(new Blob([value],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download=`ficha-${product}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
}

export async function mount({root,toast}={}){
  if(!root)return;
  if(!mounted){
    root.innerHTML=`<div class="copy-ficha-shell">
      <section class="copy-ficha-card"><header><div><h2>1. Fonte da oferta</h2><p>A URL e o texto visível ajudam a identificar dados para perguntas e respostas. A ficha usa o texto estruturado informado abaixo.</p></div></header><div class="copy-ficha-body">
        <div class="copy-ficha-grid"><div class="copy-ficha-field span-2"><label>URL da DTC / página do produtor</label><input id="copyDtcUrl" class="copy-ficha-input" type="url" placeholder="https://..."></div><div class="copy-ficha-field span-2"><label>URL de afiliação (sempre separada)</label><input id="copyAffiliateUrl" class="copy-ficha-input" type="url" placeholder="https://..."></div><div class="copy-ficha-field span-4"><label>Texto copiado da página (Ctrl+A, Ctrl+C, Ctrl+V)</label><textarea id="copyRawText" class="copy-ficha-textarea" placeholder="Cole aqui o conteúdo visível da oferta para identificar os dados e gerar perguntas e respostas."></textarea></div></div>
        <div class="copy-ficha-actions"><button id="copyAnalyze" class="copy-ficha-btn primary" type="button">Analisar oferta</button><button id="copyReset" class="copy-ficha-btn danger" type="button">Nova coleta</button></div><div id="copyDetected" class="copy-ficha-detected"></div><div id="copyAnalysisNote" class="copy-ficha-note"></div>
      </div></section>
      <section class="copy-ficha-card copy-ficha-validation"><header><div><h2>2. Dados da oferta</h2><p>Revise os dados usados nas perguntas e respostas e na configuração da ficha.</p></div></header><div class="copy-ficha-body">
        <div class="copy-ficha-grid">
          <div class="copy-ficha-field"><label>Produto</label><input id="copyProduct" class="copy-ficha-input" placeholder="MyoGlow"></div>
          <div class="copy-ficha-field"><label>País</label><input id="copyCountry" class="copy-ficha-input" maxlength="2" placeholder="US"></div>
          <div class="copy-ficha-field"><label>Idioma HTML</label><select id="copyLanguage" class="copy-ficha-select"><option value="">Selecionar</option><option value="en-US">en-US</option><option value="en-AU">en-AU</option><option value="en-CA">en-CA</option><option value="en-GB">en-GB</option><option value="pt-BR">pt-BR</option><option value="it-IT">it-IT</option><option value="es-ES">es-ES</option><option value="fr-FR">fr-FR</option><option value="de-DE">de-DE</option><option value="sv-SE">sv-SE</option></select></div>
          <div class="copy-ficha-field"><label>Moeda</label><select id="copyCurrency" class="copy-ficha-select"><option value="">Selecionar</option><option value="USD">USD</option><option value="AUD">AUD</option><option value="CAD">CAD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="BRL">BRL</option><option value="SEK">SEK</option></select></div>
          <div class="copy-ficha-field copy-ficha-price-field"><label for="copyProductPrice" id="copyProductPriceLabel">Menor preço identificado (USD)</label><input id="copyProductPrice" class="copy-ficha-input" inputmode="decimal" placeholder="Ex.: 26.99" title="Menor preço promocional identificado. Você pode revisar este valor antes de gerar novamente."><span id="copyProductPriceNote" class="copy-ficha-note"></span></div>
          <div class="copy-ficha-discount-pair" role="group" aria-label="Desconto confirmado"><div class="copy-ficha-field"><label>Desconto confirmado (%)</label><input id="copyDiscount" class="copy-ficha-input" inputmode="decimal" aria-label="Desconto confirmado em percentual" placeholder="Ex.: 70"></div><div class="copy-ficha-field"><label id="copyDiscountAmountLabel">Valor do desconto (USD)</label><input id="copyDiscountAmount" class="copy-ficha-input" inputmode="decimal" placeholder="Ex.: 365.00" title="Informe ou revise o valor associado ao percentual de desconto confirmado."></div></div>
          <div class="copy-ficha-field"><label>Confirmação da garantia</label><select id="copyGuaranteeStatus" class="copy-ficha-select"><option value="pending">Pendente</option><option value="confirmed">Confirmada</option><option value="no">Não há garantia exibida</option></select></div>
          <div class="copy-ficha-field"><label>Prazo confirmado (dias)</label><input id="copyGuarantee" class="copy-ficha-input" type="number" min="1" placeholder="90"></div>
          <div class="copy-ficha-field"><label>Frete grátis</label><select id="copyFreeShipping" class="copy-ficha-select"><option value="pending">Pendente</option><option value="confirmed">Confirmado</option><option value="no">Não exibido</option></select></div>
          <div class="copy-ficha-field span-2"><label>Título da página</label><input id="copyPageTitle" class="copy-ficha-input" placeholder="Produto | Oferta"></div>
          <div class="copy-ficha-field span-2"><label>Diretório da Pre-Sell</label><input id="copyDestination" class="copy-ficha-input" placeholder="C:\\Users\\...\\pag01"></div>
          <div class="copy-ficha-field"><label>Pasta de assets</label><input id="copyAssetFolder" class="copy-ficha-input" value="assets"></div>
        </div>
        <div class="copy-ficha-actions"><button id="copyGenerateQuestions" class="copy-ficha-btn primary" type="button">Gerar perguntas e respostas</button></div>
      </div></section>
      <section class="copy-ficha-card"><header><div><h2>3. Conteúdo obrigatório da ficha</h2><p>Os textos colados são preservados sem reescrita. País, idioma, URL de afiliação e destino vêm dos campos acima.</p></div></header><div class="copy-ficha-body"><div class="copy-ficha-field"><label for="copyFichaSource">Conteúdo estruturado · obrigatório para criar a Precel</label><textarea id="copyFichaSource" class="copy-ficha-textarea" spellcheck="false" placeholder="${esc(structuredFichaFormat)}"></textarea><span class="copy-ficha-note">Cole [PRODUTO], os títulos e textos e três ou quatro pares [PERGUNTA_N]/[RESPOSTA_N]. Confira valores por unidade e por pacote; nada será recalculado. Este campo permanece nesta sessão.</span></div><div class="copy-ficha-actions"><button id="copyGenerateFicha" class="copy-ficha-btn primary" type="button">Validar ficha e criar Precel</button></div></div></section>
      <section class="copy-ficha-card"><header><div><h2>4. Resultados</h2><p>As perguntas e respostas são independentes. A ficha é enviada para criar a Precel e o motor valida os arquivos gerados.</p></div><button id="copyDownloadFicha" class="copy-ficha-btn" type="button" disabled>Baixar JSON</button></header><div class="copy-ficha-body"><div class="copy-ficha-output-grid">
        <section class="copy-ficha-output copy-ficha-questions"><div class="copy-ficha-output-heading"><h3>Perguntas e respostas da oferta</h3><button id="copyQuestionsCopy" class="copy-ficha-btn" type="button" disabled>Copiar perguntas e respostas</button></div><p class="copy-ficha-note">Use Gerar perguntas e respostas para preencher este quadro. Edite antes de copiar; gerar novamente as perguntas substitui as respostas deste quadro.</p><div id="copyOfferQuestions"></div></section>
        <div class="copy-ficha-output ficha"><h3>Ficha JSON usada na criação</h3><button class="copy-ficha-btn copy-ficha-copy" data-copy-output="copyFichaJson" type="button">Copiar</button><textarea id="copyFichaJson" class="copy-ficha-textarea" readonly></textarea><div id="copyPresellStatus" class="presell-message" role="status" aria-live="polite">Nenhuma Precel solicitada.</div><div id="copyPresellReport"></div></div>
      </div><div id="copyWarnings" class="copy-ficha-note">Gere perguntas e respostas ou crie a Precel a partir do conteúdo estruturado.</div></div></section>
    </div>`;
    restoreDraft(root);updateDiscountAmountLabel(root);updateProductPriceNote(root);renderOfferQuestions(root);
    by(root,'copyAnalyze').onclick=()=>analyze(root);
    by(root,'copyReset').onclick=()=>resetCollection(root,toast);
    by(root,'copyGenerateQuestions').onclick=()=>generateQuestions(root,toast);
    by(root,'copyGenerateFicha').onclick=async()=>{
      if(creatingPresell)return;
      creatingPresell=true;const button=by(root,'copyGenerateFicha');button.disabled=true;button.textContent='Validando e preparando…';
      try{await generateFichaAndCreatePresell(root,toast)}catch(error){updatePendingHighlights(root,{fields:error?.fields});renderWarnings(root,error.blockers||[error.message],{blocked:true});by(root,'copyPresellStatus').textContent=error.message;root.querySelector('.is-pending')?.focus();toast?.(error.message,true)}
      finally{creatingPresell=false;button.disabled=false;button.textContent='Validar ficha e criar Precel'}
    };
    by(root,'copyQuestionsCopy').onclick=()=>copyText(formatOfferQuestionAnswers(readOfferQuestionAnswers(root)),toast);
    window.addEventListener('resize',()=>by(root,'copyOfferQuestions').querySelectorAll('[data-offer-answer]').forEach(resizeOfferAnswer));
    by(root,'copyDownloadFicha').onclick=()=>downloadFicha(root);
    root.querySelectorAll('[data-copy-output]').forEach(button=>button.onclick=()=>copyOutput(root,button.dataset.copyOutput,toast));
    const markManual=event=>{
      if(event.target.id==='copyFichaSource'){
        setOutput(root,'copyFichaJson','');clearPresellFeedback(root,'Conteúdo alterado. Valide novamente antes de criar a Precel.');event.target.classList.remove('is-pending');event.target.removeAttribute('aria-invalid');return;
      }
      if(event.target.matches('[data-offer-answer]')){
        resizeOfferAnswer(event.target);event.target.closest('.copy-ficha-question')?.classList.remove('is-unidentified');return;
      }
      if(event.target.id==='copyCurrency'){
        const previousCurrency=by(root,'copyDiscountAmountLabel')?.textContent.match(/\(([^)]+)\)$/)?.[1];
        if(previousCurrency&&previousCurrency!==inputValue(root,'copyCurrency')&&by(root,'copyDiscountAmount')?.dataset.autoFilled==='true')clearAutoDiscountAmount(root);
        updateDiscountAmountLabel(root);
      }
      if(event.target.matches('.copy-ficha-input,.copy-ficha-select')){delete event.target.dataset.autoFilled;event.target.classList.remove('is-autofilled')}
      if(event.target.id==='copyDiscount')refreshAutoDiscountAmount(root);
      if(event.target.id==='copyProductPrice'){clearProductPriceContext(root);updateProductPriceNote(root)}
      if(['copyAffiliateUrl','copyDestination','copyAssetFolder','copyPageTitle'].includes(event.target.id)){setOutput(root,'copyFichaJson','');return}
      if(event.target.matches('input,select,textarea')&&!event.target.readOnly)invalidateGeneratedOutputs(root,'Dados alterados. Revise e gere novamente as perguntas e respostas ou a ficha.');
    };
    root.addEventListener('input',event=>{markManual(event);if(event.target.id!=='copyFichaSource')updatePendingHighlights(root)});root.addEventListener('change',event=>{markManual(event);if(event.target.id!=='copyFichaSource')updatePendingHighlights(root)});
    updatePendingHighlights(root);
    mounted=true;
  }
}
