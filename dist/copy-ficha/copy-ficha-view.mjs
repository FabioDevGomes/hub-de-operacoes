import {parseOfferText,generateAssets,fichaJson,formatSitelinks,dictionaryFor,generationBlockers,generationBlockerFields,generationBlockerPackageIndexes} from './copy-ficha-domain.mjs?v=10';

let mounted=false;
const STORAGE_KEY='copy-ficha-draft-v1';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const by=(root,id)=>root.querySelector(`#${id}`);
const state={packages:[{label:'',regularPrice:'',promoPrice:'',contents:''},{label:'',regularPrice:'',promoPrice:'',contents:''},{label:'',regularPrice:'',promoPrice:'',contents:''}]};

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

export function shouldReplaceDetectedPackages(currentPackages=[],{listEdited=false}={}){
  if(listEdited||currentPackages.some(item=>item?.userEdited))return false;
  const hasPackageData=currentPackages.some(item=>['label','regularPrice','promoPrice','contents'].some(key=>String(item?.[key]??'').trim()!==''));
  return !hasPackageData||currentPackages.every(item=>item?.autoDetected===true);
}

function packageValues(root){
  return [...root.querySelectorAll('.copy-ficha-package')].map(row=>{
    const regularPrice=row.querySelector('[data-field="regularPrice"]').value,promoPrice=row.querySelector('[data-field="promoPrice"]').value;
    const edited=row.dataset.userEdited==='true'||(row.dataset.priceMode==='quantity_bundle'&&(regularPrice!==row.dataset.initialRegular||promoPrice!==row.dataset.initialPromo)),priceNote=row.dataset.priceNote||'';
    const autoDetected=row.dataset.autoDetected==='true'||(row.dataset.autoDetected!=='false'&&Boolean(row.dataset.confidence));
    return {
      label:row.querySelector('[data-field="label"]').value,
      regularPrice,
      promoPrice,
      contents:row.querySelector('[data-field="contents"]').value,
      confidence:edited?'review':row.dataset.confidence||'',
      autoDetected,
      userEdited:edited,
      priceMode:row.dataset.priceMode||'',
      packageQuantity:row.dataset.packageQuantity||'',
      quantityUnit:row.dataset.quantityUnit||'',
      packageDescriptor:row.dataset.packageDescriptor||'',
      displayedUnitPrice:row.dataset.displayedUnitPrice||'',
      regularDisplayedTotal:row.dataset.regularDisplayedTotal||'',
      promoTotalCalculated:!edited&&row.dataset.promoTotalCalculated==='true',
      discountBadgePercent:row.dataset.discountBadgePercent||'',
      priceNote:edited?`${priceNote} · Preços editados manualmente; revise unidade e total.`:priceNote
    };
  });
}

function updatePendingHighlights(root,{fields:extraFields=[],packageIndexes:extraPackageIndexes=[]}={}){
  const data=payload(root),pending=new Set([...generationBlockerFields(data),...extraFields]),fieldIds={
    product:'copyProduct',countryCode:'copyCountry',htmlLanguage:'copyLanguage',currency:'copyCurrency',
    freeShipping:'copyFreeShipping',fastShipping:'copyFastShipping',guaranteeStatus:'copyGuaranteeStatus',
    guaranteeDays:'copyGuarantee',urgencyConfirmed:'copyUrgency',scarcityConfirmed:'copyScarcity',
    affiliateUrl:'copyAffiliateUrl',destination:'copyDestination',pageTitle:'copyPageTitle',assetFolder:'copyAssetFolder'
  };
  root.querySelectorAll('.is-pending').forEach(field=>{field.classList.remove('is-pending');field.removeAttribute('aria-invalid')});
  for(const [key,id] of Object.entries(fieldIds)){
    const field=by(root,id);
    if(pending.has(key)&&field){field.classList.add('is-pending');field.setAttribute('aria-invalid','true')}
  }
  const packages=by(root,'copyPackages'),packagesPending=pending.has('packages');
  const hasPromoPrice=data.packages.some(item=>String(item.promoPrice??'').trim()!==''&&Number.isFinite(Number(item.promoPrice)));
  const missingPackagePrice=packagesPending&&!hasPromoPrice;
  packages?.classList.toggle('is-pending',missingPackagePrice);
  packages?.querySelectorAll('[data-field="promoPrice"]').forEach(field=>{
    const empty=String(field.value??'').trim()==='';
    field.classList.toggle('is-pending',missingPackagePrice&&empty);
    if(missingPackagePrice&&empty)field.setAttribute('aria-invalid','true');else field.removeAttribute('aria-invalid');
  });
  const mismatchIndexes=new Set([...generationBlockerPackageIndexes(data),...extraPackageIndexes]);
  for(const index of mismatchIndexes){
    const row=packages?.querySelector(`.copy-ficha-package[data-index="${index}"]`);
    row?.classList.add('is-pending');
    row?.setAttribute('aria-invalid','true');
    row?.querySelectorAll('[data-field="regularPrice"],[data-field="promoPrice"]').forEach(field=>{
      field.classList.add('is-pending');field.setAttribute('aria-invalid','true');
    });
  }
}

function renderPackages(root){
  const host=by(root,'copyPackages');
  host.innerHTML=state.packages.map((item,index)=>`<div class="copy-ficha-package ${item.confidence?'is-autofilled':''}" data-index="${index}" data-confidence="${esc(item.confidence||'')}" data-auto-detected="${item.autoDetected===true||(!Object.hasOwn(item,'autoDetected')&&Boolean(item.confidence))?'true':'false'}" data-user-edited="${item.userEdited?'true':'false'}" data-price-mode="${esc(item.priceMode||'')}" data-package-quantity="${esc(item.packageQuantity??'')}" data-quantity-unit="${esc(item.quantityUnit)}" data-package-descriptor="${esc(item.packageDescriptor)}" data-displayed-unit-price="${esc(item.displayedUnitPrice??'')}" data-regular-displayed-total="${esc(item.regularDisplayedTotal??'')}" data-promo-total-calculated="${item.promoTotalCalculated?'true':'false'}" data-discount-badge-percent="${esc(item.discountBadgePercent??'')}" data-price-note="${esc(item.priceNote||'')}" data-initial-regular="${esc(item.regularPrice??'')}" data-initial-promo="${esc(item.promoPrice??'')}">
    <div class="copy-ficha-field"><label>Nome do pacote${item.confidence?` <span class="copy-ficha-auto-tag">${item.confidence==='high'?'Detectado':'Revisar'}</span>`:''}</label><input class="copy-ficha-input" data-field="label" value="${esc(item.label)}" placeholder="Ex.: 6-month bundle"></div>
    <div class="copy-ficha-field"><label>Preço original${item.priceMode==='quantity_bundle'?' (total exibido)':''}</label><input class="copy-ficha-input" data-field="regularPrice" inputmode="decimal" value="${esc(item.regularPrice)}" placeholder="199.00"></div>
    <div class="copy-ficha-field"><label>Preço promocional${item.promoTotalCalculated?' (total calculado)':''}</label><input class="copy-ficha-input" data-field="promoPrice" inputmode="decimal" value="${esc(item.promoPrice)}" placeholder="79.00"></div>
    <div class="copy-ficha-field"><label>Conteúdo confirmado</label><input class="copy-ficha-input" data-field="contents" value="${esc(item.contents)}" placeholder="Ex.: MyoGlow + 1 month of No-Tox"></div>
    <button class="copy-ficha-btn danger" type="button" data-remove-package="${index}" aria-label="Remover pacote">Remover</button>
    ${item.priceNote?`<div class="copy-ficha-field span-4 copy-ficha-note">${esc(item.priceNote)}</div>`:''}
  </div>`).join('');
  host.querySelectorAll('[data-remove-package]').forEach(button=>button.onclick=()=>{
    host.dataset.userEdited='true';
    state.packages=packageValues(root).filter((_,index)=>index!==Number(button.dataset.removePackage));
    if(!state.packages.length)state.packages=[{label:'',regularPrice:'',promoPrice:'',contents:''}];
    renderPackages(root);
    saveDraft(root);
  });
  updatePendingHighlights(root);
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
    pageTitle:inputValue(root,'copyPageTitle'),
    destination:inputValue(root,'copyDestination'),
    assetFolder:inputValue(root,'copyAssetFolder')||'assets',
    affiliateUrl:normalizedUrl(inputValue(root,'copyAffiliateUrl')),
    guaranteeDays:inputValue(root,'copyGuarantee'),
    guaranteeStatus:inputValue(root,'copyGuaranteeStatus'),
    freeShipping:inputValue(root,'copyFreeShipping'),
    fastShipping:inputValue(root,'copyFastShipping'),
    urgencyConfirmed:inputValue(root,'copyUrgency'),
    scarcityConfirmed:inputValue(root,'copyScarcity'),
    packages:packageValues(root)
  };
}
function saveDraft(root){
  try{
    const draft={...payload(root),packagesManuallyEdited:by(root,'copyPackages')?.dataset.userEdited==='true',autoFilledFields:collectAutoFilledFieldIds(root.querySelectorAll('[data-auto-filled="true"]'))};
    localStorage.setItem(STORAGE_KEY,JSON.stringify(draft));
  }catch{}
}
function restoreDraft(root){
  try{
    const draft=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(!draft)return;
    const fields={copyDtcUrl:draft.dtcUrl,copyRawText:draft.rawText,copyProduct:draft.product,copyCountry:draft.countryCode,copyLanguage:draft.htmlLanguage,copyCurrency:draft.currency,copyDiscount:draft.confirmedDiscountPercent,copyPageTitle:draft.pageTitle,copyDestination:draft.destination,copyAssetFolder:draft.assetFolder,copyAffiliateUrl:draft.affiliateUrl,copyGuarantee:draft.guaranteeDays,copyGuaranteeStatus:draft.guaranteeStatus,copyFreeShipping:draft.freeShipping,copyFastShipping:draft.fastShipping,copyUrgency:draft.urgencyConfirmed,copyScarcity:draft.scarcityConfirmed};
    for(const [id,value] of Object.entries(fields))if(by(root,id)&&value!==undefined)by(root,id).value=value;
    if(draft.guaranteeStatus===undefined&&draft.guaranteeDays)by(root,'copyGuaranteeStatus').value='confirmed';
    by(root,'copyPackages').dataset.userEdited=draft.packagesManuallyEdited?'true':'';
    if(Array.isArray(draft.packages)&&draft.packages.length){state.packages=draft.packages;renderPackages(root)}
    restoreAutoFilledFieldIds(root.querySelectorAll('input,select,textarea'),draft.autoFilledFields);
  }catch{}
}

function resetCollection(root,toast){
  if(!confirm('Limpar todos os campos, pacotes e resultados desta coleta?'))return;
  try{localStorage.removeItem(STORAGE_KEY)}catch{}
  const blankFields=['copyDtcUrl','copyAffiliateUrl','copyRawText','copyProduct','copyCountry','copyLanguage','copyCurrency','copyDiscount','copyGuarantee','copyPageTitle','copyDestination'];
  blankFields.forEach(id=>{const field=by(root,id);if(field)field.value=''});
  const pendingFields=['copyFreeShipping','copyFastShipping','copyGuaranteeStatus','copyUrgency','copyScarcity'];
  pendingFields.forEach(id=>{const field=by(root,id);if(field)field.value='pending'});
  by(root,'copyAssetFolder').value='assets';
  by(root,'copyPackages').dataset.userEdited='';
  root.querySelectorAll('[data-auto-filled],.is-autofilled').forEach(field=>{delete field.dataset.autoFilled;field.classList.remove('is-autofilled')});
  state.packages=[{label:'',regularPrice:'',promoPrice:'',contents:''},{label:'',regularPrice:'',promoPrice:'',contents:''},{label:'',regularPrice:'',promoPrice:'',contents:''}];
  renderPackages(root);
  by(root,'copyDetected').innerHTML='';
  by(root,'copyAnalysisNote').textContent='';
  ['copyHeadlines','copyDescriptions','copyCallouts','copySitelinks','copyFichaJson'].forEach(id=>setOutput(root,id,''));
  ['copyHeadlineCount','copyDescriptionCount','copySitelinkCount'].forEach(id=>{by(root,id).textContent=''});
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

function useProductSuggestion(root,value){
  const field=by(root,'copyProduct'),candidate=String(value||'').trim();
  if(!field||!candidate)return;
  field.value=candidate;
  field.dataset.autoFilled='true';
  field.classList.add('is-autofilled');
  const titleField=by(root,'copyPageTitle'),titleCandidate=`${candidate} | ${dictionaryFor(inputValue(root,'copyLanguage')||'en-US').packages}`;
  if(titleField&&(!titleField.value||titleField.dataset.autoFilled==='true'))applyDetected(root,'copyPageTitle',titleCandidate,{force:true});
  root.querySelector('.copy-ficha-suggestion')?.remove();
  invalidateGeneratedOutputs(root,'Produto atualizado pela sugestão. Revise os dados e gere novamente.');
  by(root,'copyAnalysisNote').textContent=`Sugestão aplicada: ${candidate}. Revise se esse nome identifica o produto anunciado ou apenas a marca.`;
  updatePendingHighlights(root);
  saveDraft(root);
}

function analyze(root){
  invalidateGeneratedOutputs(root,'Análise atualizada. Revise as confirmações antes de gerar.');
  const result=parseOfferText(inputValue(root,'copyRawText'),normalizedUrl(inputValue(root,'copyDtcUrl'))),applied=[];
  const productSuggestionLabel=result.productCandidateSource==='body_corroborated_footer'?'Produto sugerido pelo título/rodapé (revisar)':'Produto sugerido pelo rodapé (revisar)';
  const productField=by(root,'copyProduct'),currentProduct=inputValue(root,'copyProduct'),hasManualProduct=Boolean(result.productCandidate&&currentProduct&&productField?.dataset.autoFilled!=='true'&&currentProduct!==result.productCandidate);
  if(applyDetected(root,'copyProduct',result.productCandidate))applied.push(result.productCandidateNeedsReview?productSuggestionLabel.toLowerCase():'produto');
  if(applyDetected(root,'copyCountry',result.countryCode))applied.push('país');
  if(applyDetected(root,'copyLanguage',result.htmlLanguage,{force:Boolean(result.htmlLanguage)}))applied.push('idioma');
  if(applyDetected(root,'copyCurrency',result.currency,{force:Boolean(result.currency)}))applied.push('moeda');
  if(applyDetected(root,'copyDiscount',result.highestPercent))applied.push('desconto');
  const guaranteeApplied=applyDetected(root,'copyGuarantee',result.guaranteeDays);
  if(guaranteeApplied)applied.push('garantia');
  if(guaranteeApplied&&inputValue(root,'copyGuaranteeStatus')==='pending')applyDetected(root,'copyGuaranteeStatus','confirmed',{force:true});
  const titleProduct=inputValue(root,'copyProduct')||result.productCandidate,titleLanguage=result.htmlLanguage||inputValue(root,'copyLanguage'),titleCandidate=titleProduct?`${titleProduct} | ${dictionaryFor(titleLanguage).packages}`:result.pageTitleCandidate;
  if(applyDetected(root,'copyPageTitle',titleCandidate))applied.push('título da página');
  if(result.freeShippingCandidate&&applyDetected(root,'copyFreeShipping','confirmed',{force:inputValue(root,'copyFreeShipping')==='pending'}))applied.push('frete grátis');
  if(result.fastShippingCandidate&&applyDetected(root,'copyFastShipping','confirmed',{force:inputValue(root,'copyFastShipping')==='pending'}))applied.push('envio rápido');
  const currentPackages=packageValues(root),packageHost=by(root,'copyPackages'),packageListEdited=packageHost.dataset.userEdited==='true';
  if(result.packages.length&&shouldReplaceDetectedPackages(currentPackages,{listEdited:packageListEdited})){
    state.packages=result.packages.map(item=>({...item,autoDetected:true,userEdited:false}));
    packageHost.dataset.userEdited='';
    renderPackages(root);applied.push(`${result.packages.length} pacote(s)`);
  }
  const chips=[];
  if(result.productCandidate)chips.push(`${result.productCandidateNeedsReview?productSuggestionLabel:'Produto'}: ${result.productCandidate}`);
  if(result.countryCode)chips.push(`País: ${result.countryCode}`);
  if(result.htmlLanguage)chips.push(`Idioma: ${result.htmlLanguage}`);
  if(result.highestPercent)chips.push(`Maior percentual detectado: ${result.highestPercent}%`);
  if(result.amounts.length)chips.push(`Valores: ${result.amounts.slice(0,8).join(' · ')}`);
  if(result.guaranteeDays)chips.push(`Garantia candidata: ${result.guaranteeDays} dias`);
  if(result.freeShippingCandidate)chips.push('Candidato: frete grátis');
  if(result.fastShippingCandidate)chips.push('Candidato: envio rápido');
  if(result.urgencyCandidate)chips.push('Candidato: urgência');
  if(result.scarcityCandidate)chips.push('Candidato: escassez');
  if(result.packages.length)chips.push(`Pacotes detectados: ${result.packages.length}`);
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
  by(root,'copyAnalysisNote').textContent=hasManualProduct?`O campo Produto já tem um valor manual e foi preservado. A análise detectou “${result.productCandidate}”; use o botão ao lado se quiser aplicar a sugestão.${result.productCandidateNeedsReview?` ${result.productCandidateEvidence} Confira se é o produto anunciado ou apenas a marca.`:''}`:result.productCandidateNeedsReview?`${result.productCandidateEvidence} Revise se este nome identifica o produto anunciado ou apenas a marca antes de gerar.`:applied.length?`Preenchido automaticamente: ${applied.join(', ')}. Revise os campos destacados antes de gerar.`:'Os itens detectados foram mantidos como candidatos porque os campos já continham dados. Revise o passo 2.';
  updatePendingHighlights(root);
  saveDraft(root);
}

function setOutput(root,id,value){by(root,id).value=value}
function clearGeneratedOutputs(root){
  ['copyHeadlines','copyDescriptions','copyCallouts','copySitelinks','copyFichaJson'].forEach(id=>setOutput(root,id,''));
  ['copyHeadlineCount','copyDescriptionCount','copySitelinkCount'].forEach(id=>{by(root,id).textContent=''});
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
  if(!warnings.length){host.className='copy-ficha-success';host.textContent='Copy e ficha geradas com dados confirmados. Revise antes de publicar.';return}
  host.className=`copy-ficha-warning copy-ficha-warning-listing${blocked?' is-blocked':''}`;
  const heading=document.createElement('div');heading.className='copy-ficha-warning-heading';
  const title=document.createElement('strong');title.textContent=blocked?'Geração bloqueada':'Itens para revisar';
  const count=document.createElement('span');count.className='copy-ficha-warning-count';count.textContent=`${warnings.length} ${warnings.length===1?'item':'itens'}`;
  heading.append(title,count);host.append(heading);
  const list=document.createElement('ol');list.className='copy-ficha-warning-list';
  for(const warning of warnings){const item=document.createElement('li');item.textContent=warning;list.append(item)}
  host.append(list);
}
function confirmationPaths(value,path=[],result=[]){
  if(value==='CONFIRMAR'){result.push(path);return result}
  if(Array.isArray(value))value.forEach((item,index)=>confirmationPaths(item,[...path,index],result));
  else if(value&&typeof value==='object')Object.entries(value).forEach(([key,item])=>confirmationPaths(item,[...path,key],result));
  return result;
}
function finalFichaDiagnostics(data,ficha){
  const blockers=[...generationBlockers(data)],mismatchIndexes=generationBlockerPackageIndexes(data);
  for(const pending of ficha.pending||[]){
    if(/discount badge does not match/i.test(pending)&&mismatchIndexes.length)continue;
    if(/free shipping/i.test(pending))blockers.push('Frete grátis: confirme se aparece na oferta ou marque como não exibido');
    else if(/fast shipping/i.test(pending))blockers.push('Envio rápido: confirme se pode ser anunciado ou marque como não usar');
    else if(/guarantee/i.test(pending))blockers.push('Garantia: confirme o prazo ou marque que não há garantia exibida');
    else if(/urgency/i.test(pending))blockers.push('Urgência atual: confirme se a oferta exibe uma condição válida ou marque para não usar');
    else if(/scarcity/i.test(pending))blockers.push('Escassez atual: confirme se a oferta exibe uma condição válida ou marque para não usar');
    else blockers.push(`Ficha: ${pending}`);
  }
  const fieldLabels={destination:'Diretório da Pre-Sell',assetFolder:'Pasta de assets',htmlLanguage:'Idioma HTML',countryCode:'País',pageTitle:'Título da página',affiliateUrl:'URL de afiliação',priceText:'Preços dos pacotes',shippingGuaranteeText:'Envio e garantia',mustContain:'Conteúdo obrigatório',faqs:'Perguntas frequentes'};
  const placeholderFields=[],placeholderPackageIndexes=[];
  for(const path of confirmationPaths(ficha)){
    const [key,index,field]=path;
    if(key==='packages'&&Number.isInteger(index)){
      placeholderPackageIndexes.push(index);
      const names={label:'nome',regularPrice:'preço original',promoPrice:'preço promocional',contents:'conteúdo'};
      blockers.push(`Pacote ${index+1}: preencha ou confirme ${names[field]||'os dados'}.`);
    }else if(key==='faqs')blockers.push(`Perguntas frequentes: falta confirmar a resposta do item ${Number(index)+1}.`);
    else{
      const label=fieldLabels[key]||key;
      blockers.push(`${label}: há um campo sem confirmação na ficha.`);
      const formField={destination:'destination',assetFolder:'assetFolder',htmlLanguage:'htmlLanguage',countryCode:'countryCode',pageTitle:'pageTitle',affiliateUrl:'affiliateUrl',priceText:'packages'}[key];
      if(formField)placeholderFields.push(formField);
    }
  }
  if(!blockers.length)blockers.push('Ficha: há um campo de confirmação pendente; revise os campos da validação estruturada.');
  return {blockers:[...new Set(blockers)],fields:[...new Set([...generationBlockerFields(data),...placeholderFields])],packageIndexes:[...new Set([...mismatchIndexes,...placeholderPackageIndexes])]};
}
function generate(root,toast){
  updatePendingHighlights(root);
  const data=payload(root);
  const blockers=generationBlockers(data);
  if(blockers.length){const error=new Error(`Geração bloqueada por ${blockers.length} ${blockers.length===1?'item pendente':'itens pendentes'}.`);error.blockers=blockers;throw error}
  const json=fichaJson(data),ficha=JSON.parse(json);
  if(ficha.pending.length||json.includes('"CONFIRMAR"')){
    const diagnostics=finalFichaDiagnostics(data,ficha),error=new Error('Geração bloqueada. Revise os campos e pacotes indicados abaixo.');
    error.blockers=diagnostics.blockers;error.fields=diagnostics.fields;error.packageIndexes=diagnostics.packageIndexes;error.blocked=true;throw error;
  }
  const assets=generateAssets(data);
  setOutput(root,'copyHeadlines',assets.headlines.join('\n'));
  setOutput(root,'copyDescriptions',assets.descriptions.join('\n'));
  setOutput(root,'copyCallouts',assets.callouts.join('\n'));
  setOutput(root,'copySitelinks',formatSitelinks(assets.sitelinks));
  setOutput(root,'copyFichaJson',json);
  by(root,'copyHeadlineCount').textContent=`${assets.headlines.length} opções · até 30 caracteres`;
  by(root,'copyDescriptionCount').textContent=`${assets.descriptions.length} opções · 70–90 caracteres`;
  by(root,'copySitelinkCount').textContent=`${assets.sitelinks.length} opções · 3 linhas sem rótulos`;
  renderWarnings(root,assets.warnings);
  saveDraft(root);
  toast?.('Copy e Ficha JSON geradas');
}

async function copyOutput(root,id,toast){
  const field=by(root,id);
  if(!field.value)return;
  try{await navigator.clipboard.writeText(field.value)}catch{field.select();document.execCommand('copy')}
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
      <section class="copy-ficha-card"><header><div><h2>1. Fonte da oferta</h2><p>A URL identifica a DTC; a colagem fornece os dados analisáveis sem depender de IA.</p></div></header><div class="copy-ficha-body">
        <div class="copy-ficha-grid"><div class="copy-ficha-field span-2"><label>URL da DTC / página do produtor</label><input id="copyDtcUrl" class="copy-ficha-input" type="url" placeholder="https://..."></div><div class="copy-ficha-field span-2"><label>URL de afiliação (sempre separada)</label><input id="copyAffiliateUrl" class="copy-ficha-input" type="url" placeholder="https://..."></div><div class="copy-ficha-field span-4"><label>Texto copiado da página (Ctrl+A, Ctrl+C, Ctrl+V)</label><textarea id="copyRawText" class="copy-ficha-textarea" placeholder="Cole aqui o conteúdo visível da oferta. O sistema preencherá o que reconhecer e destacará o que precisa de revisão."></textarea></div></div>
        <div class="copy-ficha-actions"><button id="copyAnalyze" class="copy-ficha-btn primary" type="button">Analisar e preencher</button><button id="copyReset" class="copy-ficha-btn danger" type="button">Nova coleta</button></div><div id="copyDetected" class="copy-ficha-detected"></div><div id="copyAnalysisNote" class="copy-ficha-note"></div>
      </div></section>
      <section class="copy-ficha-card"><header><div><h2>2. Validação estruturada</h2><p>Os dados reconhecidos são preenchidos automaticamente; revise os campos destacados.</p></div></header><div class="copy-ficha-body">
        <div class="copy-ficha-grid">
          <div class="copy-ficha-field"><label>Produto</label><input id="copyProduct" class="copy-ficha-input" placeholder="MyoGlow"></div>
          <div class="copy-ficha-field"><label>País</label><input id="copyCountry" class="copy-ficha-input" maxlength="2" placeholder="US"></div>
          <div class="copy-ficha-field"><label>Idioma HTML</label><select id="copyLanguage" class="copy-ficha-select"><option value="">Selecionar</option><option value="en-US">en-US</option><option value="en-AU">en-AU</option><option value="en-CA">en-CA</option><option value="en-GB">en-GB</option><option value="pt-BR">pt-BR</option><option value="it-IT">it-IT</option><option value="es-ES">es-ES</option><option value="fr-FR">fr-FR</option><option value="de-DE">de-DE</option><option value="sv-SE">sv-SE</option></select></div>
          <div class="copy-ficha-field"><label>Moeda</label><select id="copyCurrency" class="copy-ficha-select"><option value="">Selecionar</option><option value="USD">USD</option><option value="AUD">AUD</option><option value="CAD">CAD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="BRL">BRL</option><option value="SEK">SEK</option></select></div>
          <div class="copy-ficha-field"><label>Desconto confirmado (%)</label><input id="copyDiscount" class="copy-ficha-input" inputmode="decimal" placeholder="Calculado pelos pacotes"></div>
          <div class="copy-ficha-field"><label>Confirmação da garantia</label><select id="copyGuaranteeStatus" class="copy-ficha-select"><option value="pending">Pendente</option><option value="confirmed">Confirmada</option><option value="no">Não há garantia exibida</option></select></div>
          <div class="copy-ficha-field"><label>Prazo confirmado (dias)</label><input id="copyGuarantee" class="copy-ficha-input" type="number" min="1" placeholder="90"></div>
          <div class="copy-ficha-field"><label>Frete grátis</label><select id="copyFreeShipping" class="copy-ficha-select"><option value="pending">Pendente</option><option value="confirmed">Confirmado</option><option value="no">Não exibido</option></select></div>
          <div class="copy-ficha-field"><label>Envio rápido</label><select id="copyFastShipping" class="copy-ficha-select"><option value="pending">Pendente</option><option value="confirmed">Confirmado</option><option value="no">Não confirmado / não usar</option></select></div>
          <div class="copy-ficha-field"><label>Urgência atual</label><select id="copyUrgency" class="copy-ficha-select"><option value="pending">Pendente</option><option value="confirmed">Confirmada</option><option value="no">Não usar / não confirmada</option></select></div>
          <div class="copy-ficha-field"><label>Escassez atual</label><select id="copyScarcity" class="copy-ficha-select"><option value="pending">Pendente</option><option value="confirmed">Confirmada</option><option value="no">Não usar / não confirmada</option></select></div>
          <div class="copy-ficha-field span-2"><label>Título da página</label><input id="copyPageTitle" class="copy-ficha-input" placeholder="Produto | Package Options"></div>
          <div class="copy-ficha-field span-2"><label>Diretório da Pre-Sell</label><input id="copyDestination" class="copy-ficha-input" placeholder="C:\\Users\\...\\pag01"></div>
          <div class="copy-ficha-field"><label>Pasta de assets</label><input id="copyAssetFolder" class="copy-ficha-input" value="assets"></div>
        </div>
        <h3>Pacotes confirmados</h3><div id="copyPackages" class="copy-ficha-packages"></div><div class="copy-ficha-actions"><button id="copyAddPackage" class="copy-ficha-btn" type="button">Adicionar pacote</button><button id="copyGenerate" class="copy-ficha-btn primary" type="button">Gerar copy e ficha</button></div>
      </div></section>
      <section class="copy-ficha-card"><header><div><h2>3. Saídas</h2><p>Ativos respeitam os limites do Google Ads; a ficha segue o contrato do Gerador de Pre-Sell.</p></div><button id="copyDownloadFicha" class="copy-ficha-btn" type="button">Baixar JSON</button></header><div class="copy-ficha-body"><div class="copy-ficha-output-grid">
        <div class="copy-ficha-output"><h3>Headlines</h3><span id="copyHeadlineCount" class="copy-ficha-note"></span><button class="copy-ficha-btn copy-ficha-copy" data-copy-output="copyHeadlines" type="button">Copiar</button><textarea id="copyHeadlines" class="copy-ficha-textarea" readonly></textarea></div>
        <div class="copy-ficha-output"><h3>Descriptions</h3><span id="copyDescriptionCount" class="copy-ficha-note"></span><button class="copy-ficha-btn copy-ficha-copy" data-copy-output="copyDescriptions" type="button">Copiar</button><textarea id="copyDescriptions" class="copy-ficha-textarea" readonly></textarea></div>
        <div class="copy-ficha-output"><h3>Callouts</h3><button class="copy-ficha-btn copy-ficha-copy" data-copy-output="copyCallouts" type="button">Copiar</button><textarea id="copyCallouts" class="copy-ficha-textarea" readonly></textarea></div>
        <div class="copy-ficha-output"><h3>Sitelinks</h3><span id="copySitelinkCount" class="copy-ficha-note"></span><button class="copy-ficha-btn copy-ficha-copy" data-copy-output="copySitelinks" type="button">Copiar</button><textarea id="copySitelinks" class="copy-ficha-textarea" readonly></textarea></div>
        <div class="copy-ficha-output ficha"><h3>Ficha da Pre-Sell · JSON válido</h3><button class="copy-ficha-btn copy-ficha-copy" data-copy-output="copyFichaJson" type="button">Copiar</button><textarea id="copyFichaJson" class="copy-ficha-textarea" readonly></textarea></div>
      </div><div id="copyWarnings" class="copy-ficha-note">Preencha e valide os dados para gerar.</div></div></section>
    </div>`;
    renderPackages(root);restoreDraft(root);
    by(root,'copyAnalyze').onclick=()=>analyze(root);
    by(root,'copyReset').onclick=()=>resetCollection(root,toast);
    by(root,'copyAddPackage').onclick=()=>{state.packages=packageValues(root);state.packages.push({label:'',regularPrice:'',promoPrice:'',contents:''});by(root,'copyPackages').dataset.userEdited='true';renderPackages(root);saveDraft(root)};
    by(root,'copyGenerate').onclick=()=>{try{generate(root,toast)}catch(error){clearGeneratedOutputs(root);const blockers=Array.isArray(error?.blockers)?error.blockers:null;updatePendingHighlights(root,{fields:error?.fields,packageIndexes:error?.packageIndexes});renderWarnings(root,blockers||[error.message],{blocked:Boolean(error?.blocked||blockers)});toast?.(error.message)}};
    by(root,'copyDownloadFicha').onclick=()=>downloadFicha(root);
    root.querySelectorAll('[data-copy-output]').forEach(button=>button.onclick=()=>copyOutput(root,button.dataset.copyOutput,toast));
    const markManual=event=>{
      if(event.target.matches('.copy-ficha-input,.copy-ficha-select')){delete event.target.dataset.autoFilled;event.target.classList.remove('is-autofilled')}
      const packageRow=event.target.closest?.('.copy-ficha-package');
      if(packageRow){packageRow.dataset.userEdited='true';saveDraft(root)}
      if(event.target.matches('input,select,textarea')&&!event.target.readOnly)invalidateGeneratedOutputs(root,'Dados alterados. Revise as confirmações e gere novamente.');
    };
    root.addEventListener('input',event=>{markManual(event);updatePendingHighlights(root)});root.addEventListener('change',event=>{markManual(event);updatePendingHighlights(root)});
    updatePendingHighlights(root);
    mounted=true;
  }
}
