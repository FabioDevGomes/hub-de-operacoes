import {parseOfferText,dictionaryFor,discountEvidenceAtPrice,calculateDiscountFromFinalPrice} from './copy-ficha-domain.mjs?v=22';
import {minimumOfferProductPrice,productPriceCondition,buildOfferQuestionAnswers} from './copy-ficha-questions.mjs?v=4';
import {renderOfferQuestions,resizeOfferAnswer,copyOfferQuestions} from './copy-ficha-questions-view.mjs?v=2';
import {renderTemplate} from './copy-ficha-template.mjs?v=18';
import {readDraft,writeDraft,clearDraft} from './copy-ficha-draft.mjs?v=2';
import {createFromStructuredContent} from './copy-ficha-workflow.mjs?v=3';
import {createPresellFromFicha,createPresellBatch,callApi} from '../presell/presell-service.mjs?v=7';
import {reportHtml as presellReportHtml} from '../presell/presell-report.mjs?v=4';
import {readClipboardText} from './copy-ficha-clipboard.mjs?v=1';
import {preparePresellTracking,preparePresellTrackingBatch} from './copy-ficha-tracking-service.mjs?v=3';
import {buildTrackingProductLabel,formatTrackingAccountId,normalizeTrackingAccountId} from './copy-ficha-tracking-domain.mjs?v=1';
import {parseStructuredFicha} from './copy-ficha-structured.mjs?v=3';
import {buildTrackingPresellScriptTag,normalizeTrackingDomainInput,normalizeTrackingProductKey} from '../tracking/tracking-domain-admin.mjs?v=11';
import {accountDomainUrl} from '../accounts/accounts-domain.mjs?v=13';
import {findAccountDomainAssociation,ACCOUNT_DOMAIN_ASSOCIATIONS_KEY,ACCOUNT_DOMAIN_ASSOCIATIONS_UPDATED_EVENT} from '../accounts/account-domains-storage.mjs?v=1';
import {ACCOUNT_MAP_DUPLICATION_TARGET_KEY,ACCOUNT_MAP_DUPLICATION_TARGET_UPDATED_EVENT,createAccountDuplicationTargetStorage} from '../accounts/accounts-target-storage.mjs?v=3';
import {GOOGLE_ADS_ACCOUNTS_CACHE_STORAGE_KEY,loadGoogleAdsAccountsCache} from '../google-ads/google-ads-accounts-cache.mjs?v=2';
import {queuePresellDeployJob,mountPresellDeployWorkflow,openPresellDeployWorkflow} from './copy-ficha-deploy.mjs?v=40';

let mounted=false,creatingPresell=false,assetStudioAppliedGenerationId='',nextPresellOverwriteOnce=false;
const ASSET_STUDIO_PAGE_HANDOFF_KEY='hub:asset-studio:pending-page-directory:v1';
const ASSET_STUDIO_PAGE_HANDOFF_EVENT='hub:asset-studio-page-directory-generated';
let currentTrackingTarget=null;
let currentAccountDirectory={managers:[],accounts:[]};
let currentSelectedTrackingAccountIds=null;
let currentTrackingPreSellUrls=new Map();
let currentTrackingPreSellAutoUrls=new Map();
// Persistence is isolated in copy-ficha-draft.mjs.
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const by=(root,id)=>root.querySelector(`#${id}`);

function updateProductPriceNote(root){
  const field=by(root,'copyProductPrice'),note=by(root,'copyProductPriceNote');if(!field||!note)return;
  const condition=productPriceCondition({basis:field.dataset.priceBasis,quantity:Number(field.dataset.priceQuantity)||null,terms:field.dataset.priceTerms});
  note.textContent=!field.value?'Revise ou informe o preço do produto.':field.dataset.autoFilled==='true'?condition||'Menor preço identificado na oferta.':['Preço ajustado manualmente.',condition].filter(Boolean).join(' ');
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

const STRUCTURED_REQUIRED_ITEMS=[
  ['PRODUTO','Produto'],['TEXTO_EXPANDIR','Expansão'],['TITULO_PRINCIPAL','Título principal'],
  ['INTRODUCAO','Introdução'],['TITULO_OFERTA','Título da oferta'],['TEXTO_OFERTA','Texto da oferta'],
  ['TITULO_PRECO','Título do preço'],['TEXTO_PRECO','Texto do preço'],
  ['TITULO_FRETE_GARANTIA','Título frete/garantia'],['TEXTO_FRETE_GARANTIA','Texto frete/garantia'],['TITULO_FAQ','Título do FAQ'],
  ...Array.from({length:3},(_,index)=>{const number=index+1;return [[`PERGUNTA_${number}`,`Pergunta ${number}`],[`RESPOSTA_${number}`,`Resposta ${number}`]]}).flat()
];

function renderStructuredFichaAnalysis(root,text,{origin='clipboard'}={}){
  const parsed=parseStructuredFicha(text),host=by(root,'copyFichaAnalysis'),items=by(root,'copyFichaAnalysisItems'),status=by(root,'copyFichaAnalysisStatus');
  if(!host||!items||!status)return parsed;
  const duplicateTags=new Set(parsed.errors.flatMap(error=>{const match=error.match(/campo duplicado \[([A-Z0-9_]+)\]/);return match?[match[1]]:[]}));
  const formatIssues=new Set();
  for(const error of parsed.errors){
    if(error.startsWith('Texto da ficha: preencha ['))continue;
    if(error.includes('campo duplicado'))formatIssues.add('campo repetido');
    else if(error.includes('campo não reconhecido'))formatIssues.add('campo não reconhecido');
    else if(error.includes('texto sem identificação'))formatIssues.add('texto fora do padrão');
    else formatIssues.add('formato não identificado');
  }
  items.replaceChildren();
  const appendItem=(tag,label,{optional=false}={})=>{
    const value=parsed.values[tag],hasValue=Boolean(String(value??'').trim())&&String(value).trim().toUpperCase()!=='CONFIRMAR';
    const valid=hasValue&&!duplicateTags.has(tag),item=document.createElement('span');
    item.className=`copy-ficha-structured-chip ${valid?'is-valid':optional&&!hasValue&&!duplicateTags.has(tag)?'is-optional':'is-invalid'}`;
    item.setAttribute('role','listitem');item.title=`[${tag}]`;
    item.textContent=valid?`✓ ${label}`:item.classList.contains('is-optional')?`· ${label} opcional`:`! ${label}`;
    items.append(item);
    return valid;
  };
  let completeCount=0;
  for(const [tag,label] of STRUCTURED_REQUIRED_ITEMS)if(appendItem(tag,label))completeCount++;
  const hasFaq4=parsed.values.PERGUNTA_4!==undefined||parsed.values.RESPOSTA_4!==undefined;
  let faq4Valid=true;
  if(hasFaq4){
    const questionValid=appendItem('PERGUNTA_4','Pergunta 4');
    const answerValid=appendItem('RESPOSTA_4','Resposta 4');
    faq4Valid=questionValid&&answerValid;
  }else{
    const optional=document.createElement('span');optional.className='copy-ficha-structured-chip is-optional';optional.setAttribute('role','listitem');optional.textContent='· FAQ 4 opcional';items.append(optional);
  }
  const format=document.createElement('span');format.className=`copy-ficha-structured-chip ${formatIssues.size?'is-invalid':'is-valid'}`;format.setAttribute('role','listitem');
  format.textContent=formatIssues.size?'! Estrutura':'✓ Estrutura';format.title=formatIssues.size?`Formato: ${[...formatIssues].join(', ')}`:'Formato reconhecido';items.append(format);
  const summary=[`${completeCount}/${STRUCTURED_REQUIRED_ITEMS.length} campos obrigatórios completos`,hasFaq4?(faq4Valid?'FAQ 4 completa':'FAQ 4 incompleta'):'FAQ 4 opcional não informada'];
  if(formatIssues.size)summary.push(`Formato: ${[...formatIssues].join(', ')}`);
  status.className=`copy-ficha-clipboard-status ${parsed.errors.length?'error':'success'}`;
  status.textContent=`${origin==='draft'?'Rascunho carregado':'Área de transferência lida'} · ${summary.join(' · ')}`;
  host.hidden=false;host.setAttribute('aria-invalid',parsed.errors.length?'true':'false');
  if(!parsed.errors.length)host.removeAttribute('aria-invalid');
  return parsed;
}

function clearStructuredFichaAnalysis(root){
  const host=by(root,'copyFichaAnalysis'),items=by(root,'copyFichaAnalysisItems'),status=by(root,'copyFichaAnalysisStatus');
  if(host){host.hidden=true;host.classList.remove('is-pending');host.removeAttribute('aria-invalid')}
  items?.replaceChildren();
  if(status){status.className='copy-ficha-clipboard-status';status.textContent='Copie a resposta estruturada padrão da IA Gemini e clique para conferir os campos.'}
}

async function analyzeStructuredFichaClipboard(root){
  const button=by(root,'copyReadFichaClipboard'),status=by(root,'copyFichaAnalysisStatus');
  if(!button||button.disabled)return;
  button.disabled=true;button.textContent='Lendo…';
  try{
    const source=await readClipboardText(),field=by(root,'copyFichaSource');
    field.value=source;writeDraft({structuredFicha:source});field.dispatchEvent(new Event('input',{bubbles:true}));
    renderStructuredFichaAnalysis(root,source);
  }catch(error){
    status.className='copy-ficha-clipboard-status error';
    status.textContent=error?.code==='clipboard-empty'
      ?'A área de transferência está vazia. O conteúdo anterior foi preservado.'
      :'Não foi possível ler uma nova ficha. O conteúdo anterior foi preservado; autorize o acesso no navegador e tente novamente.';
  }finally{button.disabled=false;button.textContent='Ler área de transferência'}
}

function updatePendingHighlights(root,{fields=[]}={}){
  const pending=new Set(fields),fieldIds={
    product:'copyProduct',countryCode:'copyCountry',htmlLanguage:'copyLanguage',currency:'copyCurrency',
    confirmedProductPrice:'copyProductPrice',
    freeShipping:'copyFreeShipping',guaranteeStatus:'copyGuaranteeStatus',guaranteeDays:'copyGuarantee',
    affiliateUrl:'copyAffiliateUrl',destination:'copyDestination',pageTitle:'copyPageTitle',assetFolder:'copyAssetFolder',fichaSource:'copyFichaSource',
    trackingHostname:'copyTrackingHostname',trackingSubdomain:'copyTrackingSubdomain',trackingPlatform:'copyTrackingPlatform',trackingAccountId:'copyTrackingAccountId'
  };
  root.querySelectorAll('.is-pending').forEach(field=>{field.classList.remove('is-pending');field.removeAttribute('aria-invalid')});
  for(const [key,id] of Object.entries(fieldIds)){
    const field=key==='fichaSource'?by(root,'copyFichaAnalysis'):key==='trackingAccountId'&&by(root,'copyTrackingAccount')?.value!=='manual'?by(root,'copyTrackingAccount'):by(root,id);
    if(pending.has(key)&&field){if(key==='fichaSource')field.hidden=false;field.classList.add('is-pending');field.setAttribute('aria-invalid','true')}
  }
}

function inputValue(root,id){return by(root,id)?.value?.trim()||''}
function applyAssetStudioPageDirectory(root,handoff){
  if(!handoff?.id||!handoff.directory)return false;
  const field=by(root,'copyDestination');
  if(!field)return false;
  if(handoff.id===assetStudioAppliedGenerationId){
    try{if(JSON.parse(localStorage.getItem(ASSET_STUDIO_PAGE_HANDOFF_KEY)||'null')?.id===handoff.id)localStorage.removeItem(ASSET_STUDIO_PAGE_HANDOFF_KEY)}catch{}
    return false;
  }
  field.value=String(handoff.directory);
  field.dataset.autoFilled='true';field.classList.add('is-autofilled');
  const note=by(root,'copyDestinationAutoNotice');if(note)note.hidden=false;
  assetStudioAppliedGenerationId=String(handoff.id);
  writeDraft({
    destination:field.value,
    assetStudioGenerationId:assetStudioAppliedGenerationId,
    assetStudioDirectoryAutoUpdated:true,
    autoFilledFields:collectAutoFilledFieldIds(root.querySelectorAll('[data-auto-filled="true"]'))
  });
  try{if(JSON.parse(localStorage.getItem(ASSET_STUDIO_PAGE_HANDOFF_KEY)||'null')?.id===handoff.id)localStorage.removeItem(ASSET_STUDIO_PAGE_HANDOFF_KEY)}catch{}
  root.dispatchEvent(new Event('hub:presell-deploy-draft-updated'));
  return true;
}
function applyPendingAssetStudioPageDirectory(root){
  try{applyAssetStudioPageDirectory(root,JSON.parse(localStorage.getItem(ASSET_STUDIO_PAGE_HANDOFF_KEY)||'null'))}catch{}
}
function syncTrackingPlatformFromAffiliate(root){
  const select=by(root,'copyTrackingPlatform');if(!select)return;
  const urlText=normalizedUrl(inputValue(root,'copyAffiliateUrl'));
  let hostname='';try{hostname=new URL(urlText).hostname.toLowerCase()}catch{}
  const detected=hostname==='fasttrack20.com'||hostname.endsWith('.fasttrack20.com')?'gurumedia'
    :hostname==='hop.clickbank.net'||hostname.endsWith('.hop.clickbank.net')?'clickbank':'';
  if(select.dataset.autoFilled==='true'){select.value=detected;return}
  if(!select.value&&detected){select.value=detected;select.dataset.autoFilled='true';select.classList.add('is-autofilled')}
}
function updateTrackingFields(root){
  const enabled=Boolean(by(root,'copyTrackingEnabled')?.checked);
  const fields=by(root,'copyTrackingFields');
  if(fields)fields.querySelectorAll('input,select').forEach(field=>{field.disabled=!enabled});
  updateTrackingAccountSelection(root);
}
function readAccountMapTarget(){
  try{
    const target=createAccountDuplicationTargetStorage(window.localStorage).read();
    if(!target)return null;
    const accountId=normalizeTrackingAccountId(target.accountId);
    return {...target,accountDigits:accountId,accountFormatted:formatTrackingAccountId(accountId)};
  }catch{return null}
}
function trackingAccountSource(root){
  return by(root,'copyTrackingAccount')?.value==='manual'?'manual':'account';
}
function selectedTrackingAccountId(root){
  const source=trackingAccountSource(root);
  return source==='manual'?inputValue(root,'copyTrackingAccountId'):String(by(root,'copyTrackingAccount')?.value||'');
}
function accountsForSelectedManager(root){
  const managerId=String(by(root,'copyTrackingManager')?.value||'');
  return managerId?currentAccountDirectory.accounts.filter(account=>String(account.managerCustomerId||'')===managerId):[];
}
function selectedDirectoryAccount(root){
  const accountId=selectedTrackingAccountId(root);
  return accountId?currentAccountDirectory.accounts.find(account=>String(account.customerId)===accountId)||null:null;
}
function selectedTrackingAccounts(root,{includeNew=false}={}){
  const accounts=accountsForSelectedManager(root),validIds=new Set(accounts.map(account=>String(account.customerId)));
  if(!(currentSelectedTrackingAccountIds instanceof Set))currentSelectedTrackingAccountIds=new Set(validIds);
  else if(includeNew)for(const id of validIds)currentSelectedTrackingAccountIds.add(id);
  currentSelectedTrackingAccountIds=new Set([...currentSelectedTrackingAccountIds].filter(id=>validIds.has(id)));
  return currentSelectedTrackingAccountIds;
}
function selectAllTrackingAccounts(root){
  currentSelectedTrackingAccountIds=new Set(accountsForSelectedManager(root).map(account=>String(account.customerId)));
}
function accountHostForHpanel(account){
  const accountId=String(account?.customerId||'').replace(/\D/g,'');
  if(/^\d{10}$/.test(accountId)){
    const association=findAccountDomainAssociation(accountId);
    if(association)return association.domain||'';
  }
  const candidates=[account?.domain,account?.website,account?.name].filter(value=>typeof value==='string');
  for(const candidate of candidates){
    const hosts=[...candidate.matchAll(/((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})/gi)].map(match=>match[1]);
    for(const host of hosts.reverse())if(accountDomainUrl(host))return host.toLowerCase();
  }
  return '';
}
function suggestedTrackingSubdomain(root){
  const producerSuggestion=producerUrlSubdomainSuggestion(inputValue(root,'copyDtcUrl'));
  const source=producerSuggestion||trackingProductName(root);
  return source.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,63).replace(/-+$/g,'');
}
function producerUrlSubdomainSuggestion(value){
  let hostname='';
  try{
    const url=new URL(normalizedUrl(value));
    if(!['https:','http:'].includes(url.protocol))return '';
    hostname=url.hostname.toLowerCase().replace(/\.$/,'');
  }catch{return ''}
  if(!hostname||/^\d+(?:\.\d+){3}$/.test(hostname))return '';
  const labels=hostname.split('.');
  if(labels[0]==='www')labels.shift();
  if(labels.length<2)return '';
  const twoLevelPublicSuffixes=new Set(['co.uk','org.uk','gov.uk','ac.uk','com.au','net.au','org.au','edu.au','co.nz','org.nz','com.br','net.br','org.br','com.mx','com.sg','com.hk','co.in','firm.in','net.in','org.in','co.za','com.tr']);
  const suffix=labels.slice(-2).join('.');
  const productLabelIndex=labels.length-(twoLevelPublicSuffixes.has(suffix)?3:2);
  return productLabelIndex>=0?labels[productLabelIndex]:'';
}
function validTrackingSubdomain(value){return /^(?=.{1,63}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(String(value||'').trim().toLowerCase())}
function accountPreSellSuggestion(subdomain,domain){
  if(!validTrackingSubdomain(subdomain)||!domain)return '';
  try{return `https://${normalizeTrackingDomainInput(`${String(subdomain).trim().toLowerCase()}.${domain}`)}`}catch{return ''}
}
function syncTrackingSubdomainSuggestion(root){
  const field=by(root,'copyTrackingSubdomain');if(!field)return;
  const candidate=suggestedTrackingSubdomain(root);
  if(candidate&&(!field.value.trim()||field.dataset.autoFilled==='true')){
    field.value=candidate;field.dataset.autoFilled='true';field.classList.add('is-autofilled');
  }
}
function syncSuggestedAccountPreSellUrls(root,accounts,selectedIds){
  const subdomain=inputValue(root,'copyTrackingSubdomain').toLowerCase();
  for(const account of accounts){
    const accountId=String(account.customerId);if(!selectedIds.has(accountId))continue;
    const domain=accountHostForHpanel(account);
    const suggested=accountPreSellSuggestion(subdomain,domain);
    const current=String(currentTrackingPreSellUrls.get(accountId)||'').trim();
    const previousAuto=String(currentTrackingPreSellAutoUrls.get(accountId)||'');
    const isAutomatic=!current||(previousAuto&&current===previousAuto)||Boolean(suggested&&current===suggested);
    if(isAutomatic){
      currentTrackingPreSellUrls.set(accountId,suggested);
      if(suggested)currentTrackingPreSellAutoUrls.set(accountId,suggested);else currentTrackingPreSellAutoUrls.delete(accountId);
    }else currentTrackingPreSellAutoUrls.delete(accountId);
  }
}
function updateTrackingSubdomainHint(root){
  const hint=by(root,'copyTrackingSubdomainHint');if(!hint)return;
  const subdomain=inputValue(root,'copyTrackingSubdomain'),domain=accountHostForHpanel(selectedDirectoryAccount(root));
  if(!domain){hint.textContent='O prefixo será combinado com o domínio principal de cada conta marcada para formar os endereços públicos.';return}
  if(!validTrackingSubdomain(subdomain)){hint.textContent='Use uma única parte antes do domínio da conta, sem pontos, espaços ou protocolo. Esse prefixo compõe os endereços públicos das contas marcadas.';return}
  const source=producerUrlSubdomainSuggestion(inputValue(root,'copyDtcUrl'))?'URL da página do produtor':'nome do produto';
  hint.textContent=`Sugestão baseada no ${source}: https://${subdomain.toLowerCase()}.${domain}. Este prefixo é aplicado aos domínios de todas as contas marcadas. As análises valem para cada endereço e pasta; se alterar o prefixo, gere as páginas novamente e analise os novos destinos.`;
}
function accountPublicPreSellUrl(root,accountId){
  const input=[...root.querySelectorAll('[data-tracking-presell-url]')].find(field=>field.dataset.trackingPresellUrl===String(accountId));
  return String(input?.value??currentTrackingPreSellUrls.get(String(accountId))??'').trim();
}
function selectedTrackingTargetAccounts(root){
  const selectedId=selectedTrackingAccountId(root),accounts=accountsForSelectedManager(root);
  if(!by(root,'copyTrackingAllAccounts')?.checked){
    const account=accounts.find(row=>String(row.customerId)===selectedId)||selectedDirectoryAccount(root);
    return account?[account]:[];
  }
  const ids=selectedTrackingAccounts(root);ids.add(selectedId);
  const selected=accounts.filter(account=>ids.has(String(account.customerId)));
  const primary=selected.find(account=>String(account.customerId)===selectedId);
  return primary?[primary,...selected.filter(account=>String(account.customerId)!==selectedId)]:selected;
}
function renderHpanelLinks(root){
  const host=by(root,'copyTrackingHpanelLinks');if(!host)return;
  host.replaceChildren();
  const all=Boolean(by(root,'copyTrackingAllAccounts')?.checked);
  const trackingEnabled=Boolean(by(root,'copyTrackingEnabled')?.checked);
  const singleField=by(root,'copyTrackingSingleHostnameField');if(singleField)singleField.hidden=all;
  const subdomainField=by(root,'copyTrackingSubdomainField');if(subdomainField)subdomainField.hidden=!all;
  if(all)syncTrackingSubdomainSuggestion(root);
  const accounts=all?accountsForSelectedManager(root):[selectedDirectoryAccount(root)].filter(Boolean);
  const selectedIds=all?selectedTrackingAccounts(root):new Set();
  if(all){const primaryId=selectedTrackingAccountId(root);if(accounts.some(account=>String(account.customerId)===primaryId))selectedIds.add(primaryId)}
  const primaryId=selectedTrackingAccountId(root);
  if(all&&primaryId&&!currentTrackingPreSellUrls.get(primaryId)&&inputValue(root,'copyTrackingHostname')){
    currentTrackingPreSellUrls.set(primaryId,inputValue(root,'copyTrackingHostname'));currentTrackingPreSellAutoUrls.delete(primaryId);
  }
  if(all)syncSuggestedAccountPreSellUrls(root,accounts,selectedIds);
  updateTrackingSubdomainHint(root);
  if(!accounts.length){
    const note=document.createElement('p');note.className='copy-ficha-note';
    const manual=trackingAccountSource(root)==='manual';
    note.textContent=all?'Nenhuma conta disponível nesta MCC.':manual?'O ID manual não consta no diretório local; selecione uma conta salva para localizar o HPanel.':'Selecione uma conta para exibir o link do HPanel.';
    host.append(note);return;
  }
  if(all){
    const count=document.createElement('p');count.className='copy-ficha-note copy-ficha-hpanel-count';
    count.textContent=`${selectedIds.size} de ${accounts.length} contas selecionadas para publicação.`;host.append(count);
  }
  for(const account of accounts){
    const accountId=String(account.customerId),selected=!all||selectedIds.has(accountId);
    const row=document.createElement('div');row.className=`copy-ficha-hpanel-row${all?' is-multi':''}${selected?'':' is-unselected'}`;
    if(all){
      const choice=document.createElement('label');choice.className='copy-ficha-hpanel-choice';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected;checkbox.dataset.trackingMultiAccount=accountId;checkbox.disabled=selected&&accountId===selectedTrackingAccountId(root);checkbox.title=checkbox.disabled?'Conta da Track selecionada acima; permanece incluída.':'';checkbox.setAttribute('aria-label',`Usar ${String(account.name||'esta conta')} para publicação`);
      choice.append(checkbox);row.append(choice);
    }
    const details=document.createElement('span');details.className='copy-ficha-hpanel-account';
    const name=document.createElement('strong');name.textContent=String(account.name||'Conta Google Ads');
    const id=document.createElement('small');id.textContent=formatTrackingAccountId(account.customerId);
    details.append(name,id);row.append(details);
    const domain=accountHostForHpanel(account),url=domain?accountDomainUrl(domain):null;
    if(all&&selected&&trackingEnabled){
      const publicUrl=document.createElement('div');publicUrl.className='copy-ficha-hpanel-public-url';
      const publicLabel=document.createElement('label');publicLabel.htmlFor=`copyTrackingPreSellUrl-${accountId}`;publicLabel.textContent='Domínio público da Pre-Sell · editável';
      const publicInput=document.createElement('input');publicInput.id=`copyTrackingPreSellUrl-${accountId}`;publicInput.type='url';publicInput.className='copy-ficha-input';publicInput.placeholder='https://lymph-tonic.voltreva.shop';publicInput.value=String(currentTrackingPreSellUrls.get(accountId)||'');publicInput.dataset.trackingPresellUrl=accountId;publicInput.required=true;publicInput.disabled=!trackingEnabled;publicInput.setAttribute('aria-required','true');publicInput.setAttribute('aria-label',`Domínio público da Pre-Sell para ${String(account.name||'esta conta')}`);
      publicUrl.append(publicLabel,publicInput);row.append(publicUrl);
    }
    if(selected){
      const actions=document.createElement('span');actions.className='copy-ficha-hpanel-actions';
      if(url){
        const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=`Abrir HPanel · ${domain}`;link.title=`Abrir ${domain} no HPanel da Hostinger`;
        actions.append(link);
      }
      if(actions.childElementCount)row.append(actions);
      else{const note=document.createElement('span');note.className='copy-ficha-note';note.textContent='Domínio não identificado nos dados locais desta conta.';row.append(note)}
    }else if(url&&all){
      const note=document.createElement('span');note.className='copy-ficha-note';note.textContent='Conta desmarcada';row.append(note);
    }else{
      const note=document.createElement('span');note.className='copy-ficha-note';note.textContent='Domínio não identificado nos dados locais desta conta.';row.append(note);
    }
    host.append(row);
  }
}
function updateTrackingAccountSelection(root,{clearManual=false}={}){
  const accountSelect=by(root,'copyTrackingAccount'),manualField=by(root,'copyTrackingAccountId'),status=by(root,'copyTrackingAccountStatus');
  if(!accountSelect||!manualField)return;
  const enabled=Boolean(by(root,'copyTrackingEnabled')?.checked),manual=accountSelect.value==='manual',account=selectedDirectoryAccount(root),target=currentTrackingTarget;
  manualField.hidden=!manual;manualField.disabled=!enabled||!manual;manualField.readOnly=false;
  if(clearManual)manualField.value='';
  if(status){
    status.textContent=manual?'Informe o ID completo de 10 dígitos.':account?(target?.accountDigits===String(account.customerId)?'Conta marcada como ALVO no Mapa por conta.':'Conta carregada do diretório local.'):currentAccountDirectory.accounts.length?'Selecione uma conta da MCC.':'Lista local de MCCs indisponível; atualize-a em Google Ads API ou informe o ID manualmente.';
  }
  const allCheckbox=by(root,'copyTrackingAllAccounts');
  if(allCheckbox)allCheckbox.disabled=!enabled||!by(root,'copyTrackingManager')?.value||!accountsForSelectedManager(root).length;
  updateTrackingTitlePreview(root);renderHpanelLinks(root);
}
function populateTrackingAccountOptions(root,{preferredAccountId='',preferTarget=false}={}){
  const select=by(root,'copyTrackingAccount'),managerId=String(by(root,'copyTrackingManager')?.value||'');
  if(!select)return;
  select.replaceChildren();
  const accounts=accountsForSelectedManager(root);
  select.add(new Option(!managerId?'Selecione uma MCC':accounts.length?'Selecione uma conta':'Nenhuma conta cliente nesta MCC',''));
  for(const account of accounts){
    const customerId=String(account.customerId),isTarget=currentTrackingTarget?.accountDigits===customerId;
    const label=`${isTarget?'ALVO · ':''}${String(account.name||'Conta Google Ads')} · ${formatTrackingAccountId(customerId)}`;
    const option=new Option(label,customerId);option.dataset.mapTarget=String(isTarget);select.add(option);
  }
  select.add(new Option('Informar outro ID manualmente','manual'));
  if(preferredAccountId==='manual')select.value='manual';
  else if(accounts.some(account=>String(account.customerId)===preferredAccountId))select.value=preferredAccountId;
  else if(preferTarget&&currentTrackingTarget&&accounts.some(account=>String(account.customerId)===currentTrackingTarget.accountDigits))select.value=currentTrackingTarget.accountDigits;
  else select.value='';
  updateTrackingAccountSelection(root,{clearManual:select.value!=='manual'});
}
function refreshTrackingAccountDirectory(root,{directory=null,initial=false}={}){
  const managerSelect=by(root,'copyTrackingManager');if(!managerSelect)return;
  const previousManager=initial?'':String(managerSelect.value||''),previousAccount=initial?'':String(by(root,'copyTrackingAccount')?.value||'');
  const previousManual=by(root,'copyTrackingAccountId')?.value||'';
  const cached=directory?{accounts:directory}:loadGoogleAdsAccountsCache();
  currentAccountDirectory=cached?.accounts||{managers:[],accounts:[]};currentTrackingTarget=readAccountMapTarget();
  const managers=(currentAccountDirectory.managers||[]).filter(manager=>/^\d{10}$/.test(String(manager.customerId||'')));
  managerSelect.replaceChildren();
  managerSelect.add(new Option(managers.length?'Selecione uma MCC':'Nenhuma MCC salva localmente',''));
  for(const manager of managers)managerSelect.add(new Option(`${String(manager.name||'MCC')} · ${formatTrackingAccountId(manager.customerId)}`,String(manager.customerId)));
  const targetAccount=currentTrackingTarget&&currentAccountDirectory.accounts.find(account=>String(account.customerId)===currentTrackingTarget.accountDigits);
  const managerExists=managers.some(manager=>String(manager.customerId)===previousManager);
  managerSelect.value=managerExists?previousManager:targetAccount?String(targetAccount.managerCustomerId):'';
  const preserveAccount=managerSelect.value===previousManager?previousAccount:'';
  populateTrackingAccountOptions(root,{preferredAccountId:preserveAccount,preferTarget:initial||!preserveAccount});
  if(previousAccount==='manual')by(root,'copyTrackingAccount').value='manual';
  if(previousAccount==='manual')by(root,'copyTrackingAccountId').value=previousManual;
  if(by(root,'copyTrackingAllAccounts')?.checked){
    if(managerSelect.value!==previousManager||!(currentSelectedTrackingAccountIds instanceof Set))selectAllTrackingAccounts(root);
    else selectedTrackingAccounts(root,{includeNew:true});
  }else if(managerSelect.value!==previousManager)currentSelectedTrackingAccountIds=null;
  updateTrackingAccountSelection(root);
  root.dispatchEvent(new Event('hub:presell-deploy-draft-updated'));
}
function trackingProductName(root){
  const parsed=parseStructuredFicha(inputValue(root,'copyFichaSource'));
  return String(parsed.values.PRODUTO||inputValue(root,'copyProduct')).trim();
}
function updateTrackingTitlePreview(root){
  const preview=by(root,'copyTrackingTitlePreview');if(!preview)return;
  try{
    const product=trackingProductName(root),accountId=selectedTrackingAccountId(root);
    preview.value=product&&accountId?buildTrackingProductLabel(product,accountId):'';
  }catch{preview.value=''}
}
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
    discountAmountBasis:by(root,'copyDiscountAmount')?.dataset.amountBasis||'',
    discountAmountQuantity:by(root,'copyDiscountAmount')?.dataset.amountQuantity||'',
    discountInputSource:by(root,'copyDiscountAmount')?.dataset.discountSource||'',
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
    freeShipping:inputValue(root,'copyFreeShipping'),
    trackingEnabled:Boolean(by(root,'copyTrackingEnabled')?.checked),
    trackingHostname:by(root,'copyTrackingAllAccounts')?.checked?accountPublicPreSellUrl(root,selectedTrackingAccountId(root)):inputValue(root,'copyTrackingHostname'),
    trackingSubdomain:inputValue(root,'copyTrackingSubdomain'),
    trackingSubdomainAuto:by(root,'copyTrackingSubdomain')?.dataset.autoFilled==='true',
    trackingPlatform:inputValue(root,'copyTrackingPlatform'),
    trackingAccountId:selectedTrackingAccountId(root),
    trackingAccountPreSellUrls:Object.fromEntries(currentTrackingPreSellUrls),
    trackingAccountPreSellAutoUrls:Object.fromEntries(currentTrackingPreSellAutoUrls)
  };
}
function saveDraft(root){
  writeDraft({...payload(root),autoFilledFields:collectAutoFilledFieldIds(root.querySelectorAll('[data-auto-filled="true"]'))});
}
function saveTrackingDraft(root){
  const platform=by(root,'copyTrackingPlatform');
  writeDraft({
    dtcUrl:normalizedUrl(inputValue(root,'copyDtcUrl')),
    trackingEnabled:Boolean(by(root,'copyTrackingEnabled')?.checked),
    trackingHostname:inputValue(root,'copyTrackingHostname'),
    trackingPlatform:inputValue(root,'copyTrackingPlatform'),
    trackingPlatformAuto:platform?.dataset.autoFilled==='true',
    trackingAccountSource:trackingAccountSource(root),
    trackingManagerId:String(by(root,'copyTrackingManager')?.value||''),
    trackingAccountId:selectedTrackingAccountId(root),
    trackingManualAccountId:trackingAccountSource(root)==='manual'?inputValue(root,'copyTrackingAccountId'):'',
    trackingAllAccounts:Boolean(by(root,'copyTrackingAllAccounts')?.checked),
    trackingSubdomain:inputValue(root,'copyTrackingSubdomain'),
    trackingSubdomainAuto:by(root,'copyTrackingSubdomain')?.dataset.autoFilled==='true',
    trackingSelectedAccountIds:currentSelectedTrackingAccountIds instanceof Set?[...currentSelectedTrackingAccountIds]:null,
    trackingAccountPreSellUrls:Object.fromEntries(currentTrackingPreSellUrls),
    trackingAccountPreSellAutoUrls:Object.fromEntries(currentTrackingPreSellAutoUrls)
  });
}
function restoreDraft(root){
  try{
    const draft=readDraft();
    if(!draft)return;
    assetStudioAppliedGenerationId=String(draft.assetStudioGenerationId||'');
    currentTrackingPreSellUrls=new Map(Object.entries(draft.trackingAccountPreSellUrls||{}).map(([id,value])=>[String(id),String(value||'')]));
    currentTrackingPreSellAutoUrls=new Map(Object.entries(draft.trackingAccountPreSellAutoUrls||{}).map(([id,value])=>[String(id),String(value||'')]));
    const savedSubdomain=String(draft.trackingSubdomain||'').trim().toLowerCase();
    if(validTrackingSubdomain(savedSubdomain))for(const account of currentAccountDirectory.accounts){
      const accountId=String(account.customerId),expected=accountPreSellSuggestion(savedSubdomain,accountHostForHpanel(account));
      if(expected&&currentTrackingPreSellUrls.get(accountId)===expected&&!currentTrackingPreSellAutoUrls.has(accountId))currentTrackingPreSellAutoUrls.set(accountId,expected);
    }
    const fields={copyDtcUrl:draft.dtcUrl,copyRawText:draft.rawText,copyFichaSource:draft.structuredFicha,copyProduct:draft.product,copyCountry:draft.countryCode,copyLanguage:draft.htmlLanguage,copyCurrency:draft.currency,copyDiscount:draft.confirmedDiscountPercent,copyDiscountAmount:draft.confirmedDiscountAmount,copyPageTitle:draft.pageTitle,copyDestination:draft.destination,copyAssetFolder:draft.assetFolder,copyAffiliateUrl:draft.affiliateUrl,copyGuarantee:draft.guaranteeDays,copyGuaranteeStatus:draft.guaranteeStatus,copyFreeShipping:draft.freeShipping,copyTrackingHostname:draft.trackingHostname,copyTrackingSubdomain:draft.trackingSubdomain,copyTrackingPlatform:draft.trackingPlatform};
    for(const [id,value] of Object.entries(fields))if(by(root,id)&&value!==undefined)by(root,id).value=value;
    if(draft.assetStudioDirectoryAutoUpdated===true){const note=by(root,'copyDestinationAutoNotice');if(note)note.hidden=false}
    if(draft.trackingSubdomainAuto===true){by(root,'copyTrackingSubdomain').dataset.autoFilled='true';by(root,'copyTrackingSubdomain').classList.add('is-autofilled')}
    by(root,'copyTrackingEnabled').checked=draft.trackingEnabled!==false;
    if(draft.guaranteeStatus===undefined&&draft.guaranteeDays)by(root,'copyGuaranteeStatus').value='confirmed';
    restoreAutoFilledFieldIds(root.querySelectorAll('input,select,textarea'),draft.autoFilledFields);
    const trackingPlatform=by(root,'copyTrackingPlatform');
    if(draft.trackingPlatformAuto){trackingPlatform.dataset.autoFilled='true';trackingPlatform.classList.add('is-autofilled')}
    else{delete trackingPlatform.dataset.autoFilled;trackingPlatform.classList.remove('is-autofilled')}
    const managerSelect=by(root,'copyTrackingManager'),accountSelect=by(root,'copyTrackingAccount'),accountField=by(root,'copyTrackingAccountId');
    const oldAccountId=String(draft.trackingAccountId||draft.trackingTargetAccountId||'');
    const accountEntry=currentAccountDirectory.accounts.find(account=>String(account.customerId)===oldAccountId);
    const accountSource=draft.trackingAccountSource==='manual'||(oldAccountId&&!accountEntry)?'manual':oldAccountId;
    const requestedManager=String(draft.trackingManagerId||accountEntry?.managerCustomerId||'');
    if([...managerSelect.options].some(option=>option.value===requestedManager))managerSelect.value=requestedManager;
    populateTrackingAccountOptions(root,{preferredAccountId:accountSource,preferTarget:!accountSource});
    if(accountSource==='manual')accountField.value=draft.trackingManualAccountId||(draft.trackingAccountSource==='manual'?'':oldAccountId)||'';
    by(root,'copyTrackingAllAccounts').checked=draft.trackingAllAccounts===true;
    currentSelectedTrackingAccountIds=Array.isArray(draft.trackingSelectedAccountIds)
      ?new Set(draft.trackingSelectedAccountIds.map(String).filter(id=>accountsForSelectedManager(root).some(account=>String(account.customerId)===id)))
      :null;
    if(by(root,'copyTrackingAllAccounts').checked&&!(currentSelectedTrackingAccountIds instanceof Set))selectAllTrackingAccounts(root);
    const amount=by(root,'copyDiscountAmount');
    amount.dataset.amountBasis=draft.discountAmountBasis||'';amount.dataset.amountQuantity=draft.discountAmountQuantity||'';amount.dataset.discountSource=draft.discountInputSource||'';
    if(draft.confirmedProductPrice!==undefined){
      const price=by(root,'copyProductPrice');price.value=draft.confirmedProductPrice;
      price.dataset.priceBasis=draft.productPriceBasis||'';price.dataset.priceQuantity=draft.productPriceQuantity||'';price.dataset.priceTerms=draft.productPriceTerms||'';
    }
    syncTrackingPlatformFromAffiliate(root);updateTrackingFields(root);updateTrackingTitlePreview(root);
  }catch{}
}

function resetCollection(root,toast){
  if(!confirm('Limpar todos os campos e resultados desta coleta?'))return;
  clearDraft();
  assetStudioAppliedGenerationId='';
  try{localStorage.removeItem(ASSET_STUDIO_PAGE_HANDOFF_KEY)}catch{}
  currentTrackingPreSellUrls=new Map();currentTrackingPreSellAutoUrls=new Map();
  const blankFields=['copyDtcUrl','copyAffiliateUrl','copyRawText','copyProduct','copyCountry','copyLanguage','copyCurrency','copyDiscount','copyDiscountAmount','copyProductPrice','copyGuarantee','copyPageTitle','copyDestination','copyFichaSource','copyTrackingHostname','copyTrackingSubdomain','copyTrackingAccountId'];
  blankFields.forEach(id=>{const field=by(root,id);if(field)field.value=''});
  clearStructuredFichaAnalysis(root);
  by(root,'copyTrackingPlatform').value='';by(root,'copyTrackingEnabled').checked=true;by(root,'copyTrackingAccountId').value='';by(root,'copyTrackingAllAccounts').checked=false;currentSelectedTrackingAccountIds=null;populateTrackingAccountOptions(root,{preferTarget:true});updateTrackingFields(root);updateTrackingTitlePreview(root);
  const destinationAutoNotice=by(root,'copyDestinationAutoNotice');if(destinationAutoNotice)destinationAutoNotice.hidden=true;
  const pendingFields=['copyFreeShipping','copyGuaranteeStatus'];
  pendingFields.forEach(id=>{const field=by(root,id);if(field)field.value='pending'});
  by(root,'copyAssetFolder').value='assets';
  root.querySelectorAll('[data-auto-filled],.is-autofilled').forEach(field=>{delete field.dataset.autoFilled;field.classList.remove('is-autofilled')});
  by(root,'copyDetected').innerHTML='';
  by(root,'copyAnalysisNote').textContent='';
  by(root,'copyManualPastePanel').hidden=true;
  setClipboardStatus(root,'Copie o texto visível da oferta (Ctrl+A, Ctrl+C) e clique para capturar e analisar.');
  clearGeneratedOutputs(root);clearProductPriceContext(root);updateProductPriceNote(root);updateDiscountAmountLabel(root);
  const amount=by(root,'copyDiscountAmount');
  for(const key of ['amountBasis','amountQuantity','discountSource'])delete amount.dataset[key];
  updateDiscountNote(root);
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
  field.value='';delete field.dataset.autoFilled;delete field.dataset.discountPercent;delete field.dataset.amountBasis;delete field.dataset.amountQuantity;field.classList.remove('is-autofilled');
  updateDiscountNote(root);
}

function updateDiscountNote(root){
  const amount=by(root,'copyDiscountAmount'),note=by(root,'copyDiscountNote');if(!note)return;
  const basis=amount?.dataset.amountBasis;
  note.textContent=!amount?.value?'Informe o preço atual e o percentual ou o valor do desconto; o outro campo será calculado.'
    :basis==='unit'?`Economia por unidade · opção de ${amount.dataset.amountQuantity||'?'} unidades. Preço e desconto usam a mesma base.`
    :basis==='package'?'Economia pelo pacote. Não compare este valor com um preço por unidade.'
    :'Economia calculada sobre o preço atual informado, já com desconto.';
}

// Last explicitly edited discount field drives the other; price edits retain that choice.
export function syncDiscountFields(root,source){
  const amount=by(root,'copyDiscountAmount'),percent=by(root,'copyDiscount'),price=by(root,'copyProductPrice');
  if(source==='price')source=amount.dataset.discountSource||(percent.dataset.autoFilled==='true'&&amount.dataset.autoFilled!=='true'&&amount.value?'amount':'percent');
  amount.dataset.discountSource=source;
  const result=calculateDiscountFromFinalPrice(price.value,{percent:percent.value,amount:amount.value,source});
  const dependent=source==='amount'?percent:amount;
  if(result){
    dependent.value=Number(result[source==='amount'?'percent':'amount']).toFixed(2);
    dependent.dataset.autoFilled='true';dependent.classList.add('is-autofilled');
    amount.dataset.amountBasis=price.dataset.priceBasis||'product';amount.dataset.amountQuantity=price.dataset.priceQuantity||'';
  }else if(dependent.dataset.autoFilled==='true'){
    dependent.value='';delete dependent.dataset.autoFilled;dependent.classList.remove('is-autofilled');
    if(dependent===amount){delete amount.dataset.amountBasis;delete amount.dataset.amountQuantity}
  }
  updateDiscountNote(root);
  return result;
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
  const evidence=discountEvidenceAtPrice(rawText,result.highestPercent,inputValue(root,'copyProductPrice'));
  const detectedAmount=evidence?.amount??result.highestSavingsAmount;
  if(detectedAmount!==null&&detectedAmount!==undefined&&(applyDetected(root,'copyDiscountAmount',Number(detectedAmount).toFixed(2),{force:true})||inputValue(root,'copyDiscountAmount')===Number(detectedAmount).toFixed(2))){
    discountAmountField.dataset.discountPercent=String(result.highestPercent??'');
    discountAmountField.dataset.amountBasis=evidence?.basis||'package';
    discountAmountField.dataset.amountQuantity=String(evidence?.quantity??'');
    discountAmountField.dataset.discountSource='percent';
    applied.push('valor associado ao maior desconto');
  }
  else if(result.highestPercent&&discountAmountField){
    discountAmountField.value='';delete discountAmountField.dataset.autoFilled;discountAmountField.classList.remove('is-autofilled');
  }
  updateDiscountNote(root);
  const chips=[];
  if(result.productCandidate)chips.push(`${result.productCandidateNeedsReview?productSuggestionLabel:'Produto'}: ${result.productCandidate}`);
  if(result.countryCode)chips.push(`País: ${result.countryCode}`);
  if(result.htmlLanguage)chips.push(`Idioma: ${result.htmlLanguage}`);
  if(result.highestPercent)chips.push(`Maior percentual detectado: ${result.highestPercent}%`);
  if(result.highestSavingsAmount!==null&&result.highestSavingsAmount!==undefined)chips.push(`Valor associado ao maior desconto${evidence?.quantity>1?' (pelo pacote)':''}: ${inputValue(root,'copyCurrency')||'USD'} ${Number(result.highestSavingsAmount).toFixed(2)}`);
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
  const analysisMessage=hasManualProduct?`O campo Produto já tem um valor manual e foi preservado. A análise detectou “${result.productCandidate}”; use o botão ao lado se quiser aplicar a sugestão.${result.productCandidateNeedsReview?` ${result.productCandidateEvidence} Confira se é o produto anunciado ou apenas a marca.`:''}`:result.productCandidateNeedsReview?`${result.productCandidateEvidence} Revise se este nome identifica o produto anunciado ou apenas a marca.`:applied.length?`Preenchido automaticamente: ${applied.join(', ')}. Revise os dados antes de criar a ficha.`:'Os dados detectados foram mantidos como candidatos. Revise os campos acima.';
  const discountMismatch=result.highestSavingsPercentMismatch
    ?`O preço por pacote implica ${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(result.highestSavingsCalculatedPercent)}% de desconto, mas o cartão anuncia ${result.highestPercent}%. Confira essa divergência antes de usar o valor.`:'';
  by(root,'copyAnalysisNote').textContent=[analysisMessage,discountMismatch].filter(Boolean).join(' ');
  updatePendingHighlights(root);
  saveDraft(root);
}

function setClipboardStatus(root,message,{error=false,success=false}={}){
  const status=by(root,'copyClipboardStatus');
  status.textContent=message;
  status.classList.toggle('error',error);
  status.classList.toggle('success',success);
}

async function analyzeClipboard(root){
  const button=by(root,'copyAnalyze'),originalLabel=button.textContent;
  button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Capturando e analisando…';
  setClipboardStatus(root,'Lendo a área de transferência…');
  try{
    let text;
    try{text=await readClipboardText();}
    catch(error){
      const message=error?.code==='clipboard-empty'
        ?'A área de transferência está vazia. Copie o texto da oferta (Ctrl+A, Ctrl+C) e tente novamente.'
        :error?.code==='clipboard-unavailable'
          ?'Este navegador não disponibilizou a leitura do clipboard. Você pode colar o texto manualmente abaixo.'
          :'O navegador bloqueou a leitura do clipboard. Autorize o acesso ou cole o texto manualmente abaixo.';
      by(root,'copyManualPastePanel').hidden=false;
      setClipboardStatus(root,message,{error:true});
      by(root,'copyRawText').focus();
      return;
    }
    by(root,'copyRawText').value=text;
    try{analyze(root);}
    catch{
      by(root,'copyManualPastePanel').hidden=false;
      setClipboardStatus(root,'O texto foi capturado, mas a análise não foi concluída. Confira a colagem manual abaixo.',{error:true});
      by(root,'copyRawText').focus();
      return;
    }
    by(root,'copyManualPastePanel').hidden=true;
    setClipboardStatus(root,'Texto capturado e analisado. Revise os campos preenchidos abaixo.',{success:true});
  }finally{button.disabled=false;button.removeAttribute('aria-busy');button.textContent=originalLabel;}
}

function analyzeManualText(root){
  if(!inputValue(root,'copyRawText')){
    setClipboardStatus(root,'Cole o texto da oferta antes de analisar.',{error:true});
    by(root,'copyRawText').focus();
    return;
  }
  try{
    analyze(root);
    setClipboardStatus(root,'Texto colado e analisado. Revise os campos preenchidos abaixo.',{success:true});
  }catch{
    setClipboardStatus(root,'Não foi possível analisar esse texto. Confira a colagem e tente novamente.',{error:true});
  }
}

function clearGeneratedOutputs(root){
  renderOfferQuestions(root);
  clearPresellFeedback(root,'Dados alterados. Valide novamente antes de criar a Presell.');
}
function clearPresellFeedback(root,message=''){
  const status=by(root,'copyPresellStatus'),report=by(root,'copyPresellReport'),links=by(root,'copyPresellLocalLinks');
  if(status)status.textContent=message;
  if(report)report.replaceChildren();
  if(links){links.replaceChildren();links.hidden=true}
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
  if(!warnings.length){host.className='copy-ficha-success';host.textContent='Ficha validada. Revise antes de publicar.';return}
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
  toast?.('Perguntas e respostas geradas');
}

function renderPresellReports(root,reports=[]){
  const host=by(root,'copyPresellReport');if(!host)return;
  host.replaceChildren();
  for(const {title,report,error} of reports){
    if(!report&&!error)continue;
    const section=document.createElement('section');section.className='copy-ficha-presell-report';
    const heading=document.createElement('h4');heading.textContent=title;
    section.append(heading);
    if(error){const message=document.createElement('p');message.className='copy-ficha-warning';message.textContent=error;section.append(message)}
    else{const body=document.createElement('div');body.innerHTML=presellReportHtml(report);section.append(body)}
    host.append(section);
  }
}

function renderCreatedPresellLinks(root,result,ficha){
  const host=by(root,'copyPresellLocalLinks');if(!host)return;
  host.replaceChildren();
  const entries=[];
  if(Array.isArray(result.targets)){
    for(const page of result.production?.targets||[]){
      if(page?.created!==true||!page.localFileUrl)continue;
      entries.push({
        label:`Página ${String(page.pageNumber||'').padStart(2,'0')} · ${page.hpanelDomain||page.publicUrl||'Pre-Sell local'}`,
        href:page.localFileUrl,destination:page.destination||'',browserOpened:page.browserOpened===true,browserOpenError:page.browserOpenError||'',
      });
    }
  }else{
    const page=result.production||{};
    if(page.localFileUrl){
      const domain=String(ficha.tracking?.hostname||ficha.destination||'').replace(/^https?:\/\//i,'');
      entries.push({label:domain?`Abrir Pre-Sell local · ${domain}`:'Abrir Pre-Sell local',href:page.localFileUrl,destination:page.destination||ficha.destination||'',browserOpened:page.browserOpened===true,browserOpenError:page.browserOpenError||''});
    }
  }
  const validEntries=entries.filter(entry=>{
    try{return new URL(entry.href).protocol==='file:'}catch{return false}
  });
  if(!validEntries.length){host.hidden=true;return}
  const title=document.createElement('h3');title.className='copy-ficha-local-links-title';title.textContent=validEntries.length===1?'Pre-Sell local criada':'Pre-Sells locais criadas';
  const list=document.createElement('div');list.className='copy-ficha-local-links-list';
  for(const entry of validEntries){
    const item=document.createElement('div');item.className='copy-ficha-local-link';
    const link=document.createElement('a');link.href=entry.href;link.target='_blank';link.rel='noopener';link.textContent=entry.label;
    const state=document.createElement('span');state.className=`copy-ficha-local-link-state${entry.browserOpened?' is-opened':' is-fallback'}`;
    state.textContent=entry.browserOpened?'Aberta em nova janela do Chrome':entry.browserOpenError||'Clique no link para abrir no navegador.';
    item.append(link,state);
    if(entry.destination){const path=document.createElement('code');path.textContent=entry.destination;item.append(path)}
    list.append(item);
  }
  host.append(title,list);host.hidden=false;
}

function showTrackingPopup(root,{tracking,registration,partial=false,errorText=''}={}){
  if(!tracking?.enabled||!registration)return;
  root.querySelector('.copy-ficha-tracking-modal')?.remove();
  const overlay=document.createElement('div');overlay.className='copy-ficha-tracking-modal';overlay.setAttribute('role','presentation');
  const dialog=document.createElement('section');dialog.className='copy-ficha-tracking-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','copyTrackingModalTitle');
  const header=document.createElement('header');
  const title=document.createElement('h2');title.id='copyTrackingModalTitle';title.textContent='Tracking da Pre-Sell';
  const close=document.createElement('button');close.type='button';close.className='copy-ficha-btn';close.setAttribute('aria-label','Fechar');close.textContent='Fechar';
  header.append(title,close);
  const intro=document.createElement('p');intro.className=partial?'copy-ficha-warning':'copy-ficha-success';
  intro.textContent=partial
    ?'A Track foi '+(registration.outcome==='reused'?'reutilizada':'registrada')+', mas a produção local da página não terminou corretamente. Confira a pasta e os arquivos antes de tentar novamente. '+errorText
    :'A Track foi '+(registration.outcome==='reused'?'reutilizada':'registrada')+' e o script foi inserido no index.html. Depois de publicar a pasta, o domínio poderá enviar visitas e cliques ao Tracking.';
  const label=document.createElement('label');label.htmlFor='copyTrackingScript';label.textContent='Script inserido na Pre-Sell';
  const trackTitleLabel=document.createElement('label');trackTitleLabel.htmlFor='copyTrackingTitle';trackTitleLabel.textContent='Nome da Track';
  const trackTitle=document.createElement('input');trackTitle.id='copyTrackingTitle';trackTitle.readOnly=true;trackTitle.className='copy-ficha-input';trackTitle.value=registration.productLabel||tracking.productLabel||'';
  const script=document.createElement('textarea');script.id='copyTrackingScript';script.readOnly=true;script.className='copy-ficha-textarea copy-ficha-tracking-script';
  script.value=buildTrackingPresellScriptTag(registration.productKey||tracking.productKey,registration.hostname||tracking.hostname);
  const actions=document.createElement('div');actions.className='copy-ficha-actions';
  const copy=document.createElement('button');copy.type='button';copy.className='copy-ficha-btn primary';copy.textContent='Copiar script';
  const hpanelUrl=accountDomainUrl(registration.hostname||tracking.hostname);
  const link=document.createElement('a');link.className='copy-ficha-btn';link.textContent='Abrir HPanel do domínio';link.target='_blank';link.rel='noopener noreferrer';
  if(hpanelUrl)link.href=hpanelUrl;else link.setAttribute('aria-disabled','true');
  const copyStatus=document.createElement('span');copyStatus.className='copy-ficha-note';copyStatus.setAttribute('role','status');copyStatus.setAttribute('aria-live','polite');
  actions.append(copy,link,copyStatus);
  dialog.append(header,intro,trackTitleLabel,trackTitle,label,script,actions);overlay.append(dialog);root.append(overlay);
  const previousFocus=document.activeElement;
  const dismiss=()=>{overlay.remove();if(previousFocus&&root.contains(previousFocus))previousFocus.focus()};
  const onKeyDown=event=>{if(event.key==='Escape')dismiss()};
  close.addEventListener('click',dismiss);overlay.addEventListener('click',event=>{if(event.target===overlay)dismiss()});
  dialog.addEventListener('keydown',onKeyDown);
  copy.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(script.value);copyStatus.textContent='Script copiado.'}
    catch{script.focus();script.select();copyStatus.textContent='A cópia automática foi bloqueada. O script está selecionado para copiar manualmente.'}
  });
  close.focus();
}

function validateMultiAccountInputs(root){
  if(!by(root,'copyTrackingAllAccounts')?.checked)return;
  if(!by(root,'copyTrackingEnabled')?.checked)throw new Error('Para criar páginas em várias contas, mantenha ativa a opção de registrar/reutilizar uma Track e inserir o script em cada página.');
  if(trackingAccountSource(root)==='manual')throw new Error('No modo de várias contas, selecione a conta principal no combo box da MCC; um ID digitado manualmente não tem domínio HPanel para gerar a pasta correspondente.');
  const subdomainInput=by(root,'copyTrackingSubdomain');
  if(!validTrackingSubdomain(inputValue(root,'copyTrackingSubdomain'))){subdomainInput?.classList.add('is-pending');subdomainInput?.setAttribute('aria-invalid','true');subdomainInput?.focus();const error=new Error('Informe um subdomínio válido, usando uma única parte com letras, números ou hífen.');error.fields=['trackingSubdomain'];throw error;}
  const accounts=selectedTrackingTargetAccounts(root);
  if(!accounts.length)throw new Error('Selecione ao menos uma conta da MCC para criar as páginas.');
  for(const account of accounts){
    const accountId=String(account.customerId),domain=accountHostForHpanel(account);
    if(!domain)throw new Error(`Não foi possível identificar o domínio HPanel de ${account.name||accountId}. Confira o nome da conta no diretório local.`);
    if(!by(root,'copyTrackingEnabled')?.checked)continue;
    const input=[...root.querySelectorAll('[data-tracking-presell-url]')].find(field=>field.dataset.trackingPresellUrl===accountId);
    const value=accountPublicPreSellUrl(root,accountId);
    if(!value){input?.classList.add('is-pending');input?.setAttribute('aria-invalid','true');input?.focus();throw new Error(`Informe o domínio público HTTPS da Pre-Sell para ${account.name||accountId}.`)}
    try{normalizeTrackingDomainInput(value)}catch(error){input?.classList.add('is-pending');input?.setAttribute('aria-invalid','true');input?.focus();throw new Error(`${account.name||accountId}: ${error.message}`)}
  }
}

function batchPageDestination(source,pageNumber,domain){
  const clean=String(source||'').trim().replace(/[\\/]+$/,'');
  const separator=Math.max(clean.lastIndexOf('\\'),clean.lastIndexOf('/'));
  if(separator<0)throw new Error('A pasta de origem precisa estar dentro da pasta de um produto.');
  const delimiter=clean[separator],parent=clean.slice(0,separator),folder=`pag${String(pageNumber).padStart(2,'0')} ${domain}`;
  return `${parent}${delimiter}${folder}`;
}

function buildPresellBatchTargets(root,baseFicha){
  const accounts=selectedTrackingTargetAccounts(root),trackingEnabled=Boolean(by(root,'copyTrackingEnabled')?.checked),source=inputValue(root,'copyDestination');
  return accounts.map((account,index)=>{
    const accountId=normalizeTrackingAccountId(account.customerId),hpanelDomain=accountHostForHpanel(account);
    const pageNumber=index+1,destination=batchPageDestination(source,pageNumber,hpanelDomain);
    let publicUrl='',hostname='';
    if(trackingEnabled){
      hostname=normalizeTrackingDomainInput(accountPublicPreSellUrl(root,accountId));
      publicUrl=`https://${hostname}`;
    }
    const tracking=trackingEnabled?(()=>{
      const productName=baseFicha.product,productLabel=buildTrackingProductLabel(productName,accountId),productKey=normalizeTrackingProductKey(productLabel);
      return {enabled:true,hostname,platform:baseFicha.tracking.platform,accountId,productName,productLabel,productKey};
    })():{enabled:false};
    const ficha={...baseFicha,destination,tracking,faqs:baseFicha.faqs.map(faq=>({...faq}))};
    return {pageNumber,hpanelDomain,publicUrl,destination,accountId,accountName:String(account.name||''),ficha};
  });
}

function presellDeployDraftTargets(root){
  if(!by(root,'copyTrackingEnabled')?.checked||!by(root,'copyTrackingAllAccounts')?.checked)return null;
  const product=String(inputValue(root,'copyProduct')||'Pre-Sell');
  let targets;
  try{
    targets=buildPresellBatchTargets(root,{product,tracking:{platform:inputValue(root,'copyTrackingPlatform')},faqs:[]});
  }catch{return null}
  if(!targets.length)return null;
  return {
    product,
    targets:targets.map(target=>{
      const parentDomain=String(target.hpanelDomain||'').trim().toLowerCase(),hostname=(()=>{try{return new URL(target.publicUrl).hostname.toLowerCase()}catch{return ''}})();
      const suffix=parentDomain?`.${parentDomain}`:'',prefix=suffix&&hostname.endsWith(suffix)?hostname.slice(0,-suffix.length):'';
      return {
        id:String(target.accountId||target.pageNumber),pageNumber:Number(target.pageNumber)||1,accountId:String(target.accountId||''),
        accountName:String(target.accountName||''),hpanelDomain:parentDomain,publicUrl:String(target.publicUrl||''),
        sourceDirectory:String(target.destination||''),parentDomain,prefix,directory:prefix,status:'draft',deploymentState:'pending',draftOnly:true,
      };
    }),
  };
}

function showTrackingBatchPopup(root,{registrations=[],targets=[],production=null,uncertain=false,errorText=''}={}){
  if(!targets.length)return;
  const pageOutcome=target=>{
    const registration=registrations.find(item=>String(item.accountId)===String(target.accountId));
    const pageResult=production?.targets?.find(item=>Number(item.pageNumber)===Number(target.pageNumber));
    const reportPassed=pageResult?.report?.overall==='PASS'||pageResult?.report?.overall==='PASS_WITH_WARNINGS';
    const trackingCheckPassed=pageResult?.report?.phases?.some(phase=>(phase.report?.checks||[]).some(check=>check.name==='tracking-script'&&check.status==='PASS'));
    const trackingConfirmed=pageResult?.trackingConfigured===true||(pageResult?.trackingConfigured===undefined&&trackingCheckPassed);
    return {registration,pageResult,complete:Boolean(registration&&pageResult?.created===true&&trackingConfirmed&&reportPassed)};
  };
  const allComplete=targets.every(target=>pageOutcome(target).complete);
  const someOverwritten=(production?.targets||[]).some(target=>target.overwritten===true);
  root.querySelector('.copy-ficha-tracking-modal')?.remove();
  const overlay=document.createElement('div');overlay.className='copy-ficha-tracking-modal';overlay.setAttribute('role','presentation');
  const dialog=document.createElement('section');dialog.className='copy-ficha-tracking-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','copyTrackingModalTitle');
  const header=document.createElement('header'),title=document.createElement('h2');title.id='copyTrackingModalTitle';title.textContent='Resultado das páginas';
  const close=document.createElement('button');close.type='button';close.className='copy-ficha-btn';close.setAttribute('aria-label','Fechar');close.textContent='Fechar';header.append(title,close);
  const intro=document.createElement('p');intro.className=allComplete?'copy-ficha-success':'copy-ficha-warning';
  intro.textContent=allComplete?(someOverwritten?'Todas as páginas foram geradas ou atualizadas e configuradas com sucesso.':'Todas as páginas foram geradas e configuradas com sucesso.'):uncertain?'Não foi possível confirmar o resultado de todas as páginas. Verifique cada uma antes de repetir.':'O lote não foi concluído por completo. Confira o resultado de cada página antes de repetir.';
  dialog.append(header,intro);
  if(uncertain&&errorText){const detail=document.createElement('p');detail.className='copy-ficha-warning';detail.textContent=`Detalhe da falha: ${errorText}`;dialog.append(detail)}
  for(const target of targets){
    const {complete}=pageOutcome(target);
    const card=document.createElement('article');card.className='copy-ficha-tracking-batch-item';
    const pageNumber=String(target.pageNumber).padStart(2,'0');
    const heading=document.createElement('h3');heading.textContent=`Página ${pageNumber} · ${target.accountName||target.hpanelDomain||'Conta'}`;
    const page=document.createElement('p');page.className=complete?'copy-ficha-success':'copy-ficha-note';
    const pageResult=production?.targets?.find(item=>Number(item.pageNumber)===Number(target.pageNumber));
    page.textContent=complete?(pageResult?.overwritten?'Pre-Sell atualizada e tracking configurado com sucesso.':'Pre-Sell gerada e tracking configurado com sucesso.'):uncertain?'Resultado não confirmado. Confira a página antes de repetir.':'Não concluída. Confira o relatório desta página antes de repetir.';
    card.append(heading,page);dialog.append(card);
  }
  overlay.append(dialog);root.append(overlay);
  const previousFocus=document.activeElement,dismiss=()=>{overlay.remove();if(previousFocus&&root.contains(previousFocus))previousFocus.focus()};
  close.addEventListener('click',dismiss);overlay.addEventListener('click',event=>{if(event.target===overlay)dismiss()});
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape')dismiss()});close.focus();
}

function reportPassed(report){return ['PASS','PASS_WITH_WARNINGS'].includes(String(report?.overall||''))}
function trackingPassed(pageResult,report){
  if(pageResult?.trackingConfigured===true)return true;
  return Boolean(report?.phases?.some(phase=>(phase.report?.checks||[]).some(check=>check.name==='tracking-script'&&check.status==='PASS')));
}
function presellGenerationSummary(batchTargets,production){
  const produced=Array.isArray(production?.targets)?production.targets:[];
  return batchTargets.map(target=>{
    const page=produced.find(item=>Number(item.pageNumber)===Number(target.pageNumber));
    const ready=page?.created===true&&reportPassed(page.report)&&trackingPassed(page,page.report);
    let status='generation-blocked',detail='A página não foi liberada pela validação local. Confira o relatório desta página na Ficha e Presell.';
    if(ready){status='ready';detail='Pre-Sell criada e validada localmente; aguardando análise de hospedagem.'}
    else if(page?.error){status='generation-error';detail=String(page.error)}
    else if(!page){status='generation-error';detail='A geração não retornou resultado para esta conta; confira o relatório da ficha.'}
    else if(page.created===true&&!trackingPassed(page,page.report)){status='generation-blocked';detail='A Pre-Sell foi criada, mas o tracking não foi confirmado na validação local.'}
    else if(page.created!==true&&page.report?.overall!=='BLOCKED'){status='generation-error';detail='A Pre-Sell não foi confirmada como criada; confira o relatório desta página.'}
    return {
      pageNumber:Number(target.pageNumber)||0,accountId:String(target.accountId||''),accountName:String(target.accountName||''),
      hpanelDomain:String(target.hpanelDomain||''),publicUrl:String(target.publicUrl||''),sourceDirectory:String(target.destination||''),status,detail,
    };
  });
}
function queueDeployFromResult(root,result,ficha){
  const batchTargets=Array.isArray(result.targets)?result.targets:null;
  let targets=[];
  let generationSummary=[];
  if(batchTargets){
    const produced=Array.isArray(result.production?.targets)?result.production.targets:null;
    generationSummary=presellGenerationSummary(batchTargets,result.production);
    if(produced){
      targets=produced.filter(page=>page?.created===true&&reportPassed(page.report)&&trackingPassed(page,page.report)).map(page=>{
        const target=batchTargets.find(item=>Number(item.pageNumber)===Number(page.pageNumber));
        return {
          pageNumber:Number(page.pageNumber)||Number(target?.pageNumber)||1,accountId:String(target?.accountId||''),
          accountName:String(target?.accountName||page.accountName||page.hpanelDomain||''),hpanelDomain:String(page.hpanelDomain||target?.hpanelDomain||''),
          sourceDirectory:String(page.destination||target?.destination||''),publicUrl:String(page.publicUrl||target?.publicUrl||''),parentDomain:'',username:'',prefix:'',directory:'',
        };
      });
    }else{
      targets=batchTargets.filter(target=>{
        const page=result.production?.targets?.find(item=>Number(item.pageNumber)===Number(target.pageNumber));
        return page?.created===true&&reportPassed(page.report)&&(!target.ficha?.tracking?.enabled||trackingPassed(page,page.report));
      }).map(target=>({
        pageNumber:target.pageNumber,accountId:String(target.accountId||''),accountName:String(target.accountName||''),hpanelDomain:String(target.hpanelDomain||''),
        sourceDirectory:String(target.destination||''),publicUrl:String(target.publicUrl||''),parentDomain:'',username:'',prefix:'',directory:'',
      }));
    }
  }else{
    const report=result.production?.report||result.production;
    if(reportPassed(report)&&(!ficha.tracking?.enabled||trackingPassed(null,report))){
      const accountId=String(ficha.tracking?.accountId||selectedTrackingAccountId(root)||''),account=currentAccountDirectory.accounts.find(row=>String(row.customerId)===accountId)||selectedDirectoryAccount(root);
      const rawUrl=ficha.tracking?.hostname||inputValue(root,'copyTrackingHostname');
      targets=[{pageNumber:1,accountId,accountName:String(account?.name||''),hpanelDomain:accountHostForHpanel(account),sourceDirectory:String(ficha.destination||''),publicUrl:rawUrl?(/^https?:\/\//i.test(rawUrl)?rawUrl:`https://${rawUrl}`):'',parentDomain:'',username:'',prefix:'',directory:''}];
    }
  }
  if(!targets.length)return null;
  return queuePresellDeployJob({product:String(ficha.product||'Pre-Sell'),targets,generationSummary});
}

function isExistingPresellDestinationError(error){
  return /destino[^\n]*(?:já existe|foi criado)|(?:já existe|sobrescrita recusada)[^\n]*destino|sobrescrita recusada/i.test(String(error?.message||''));
}

function existingPresellDeployTargets(root,error){
  if(Array.isArray(error?.batchTargets)){
    const returnedStates=Array.isArray(error.destinationStates)?error.destinationStates:[];
    const statesByPage=new Map(returnedStates.map(state=>[Number(state.pageNumber),state]).filter(([pageNumber])=>Number.isInteger(pageNumber)&&pageNumber>0));
    const statesByPath=new Map(returnedStates.map(state=>[String(state.destination||'').toLowerCase(),state]).filter(([destination])=>destination));
    const existing=new Set((Array.isArray(error.existingTargets)?error.existingTargets:[]).map(target=>String(target.destination||'').toLowerCase()));
    const existingPages=new Set((Array.isArray(error.existingTargets)?error.existingTargets:[]).map(target=>Number(target.pageNumber)).filter(pageNumber=>Number.isInteger(pageNumber)&&pageNumber>0));
    return error.batchTargets.map(target=>{
      const destination=String(target.destination||''),pageNumber=Number(target.pageNumber),state=statesByPage.get(pageNumber)||statesByPath.get(destination.toLowerCase());
      return {
        pageNumber:target.pageNumber,accountId:String(target.accountId||''),accountName:String(target.accountName||''),hpanelDomain:String(target.hpanelDomain||''),
        sourceDirectory:destination,publicUrl:String(target.publicUrl||target.ficha?.tracking?.hostname||''),
        exists:state?Boolean(state.exists):(existingPages.has(pageNumber)||existing.has(destination.toLowerCase())?true:null),
        parentDomain:'',username:'',prefix:'',directory:'',
      };
    });
  }
  const ficha=error?.singleFicha||error?.baseFicha;
  if(!ficha?.destination)return [];
  const accountId=String(ficha.tracking?.accountId||selectedTrackingAccountId(root)||''),account=currentAccountDirectory.accounts.find(row=>String(row.customerId)===accountId)||selectedDirectoryAccount(root);
  const rawUrl=ficha.tracking?.hostname||inputValue(root,'copyTrackingHostname');
  return [{
    pageNumber:1,accountId,accountName:String(account?.name||''),hpanelDomain:accountHostForHpanel(account),sourceDirectory:String(ficha.destination),exists:true,
    publicUrl:rawUrl?(/^https?:\/\//i.test(rawUrl)?rawUrl:`https://${rawUrl}`):'',parentDomain:'',username:'',prefix:'',directory:'',
  }];
}

function showExistingPresellDecision(root,{targets=[],product='Pre-Sell',onQueueDeploy,onOverwrite,onCancel}={}){
  root.querySelector('.copy-ficha-existing-modal')?.remove();
  const previousFocus=document.activeElement,overlay=document.createElement('div');overlay.className='copy-ficha-existing-modal';overlay.setAttribute('role','presentation');
  const dialog=document.createElement('section');dialog.className='copy-ficha-existing-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','copyFichaExistingTitle');
  const existingCount=targets.filter(target=>target.exists).length;
  const missingCount=targets.filter(target=>target.exists===false).length;
  const unknownCount=targets.filter(target=>target.exists==null).length;
  const existingSummary=existingCount===1?'1 pasta já existe':`${existingCount} pastas já existem`;
  const missingSummary=missingCount===1?'1 destino ainda não existe':`${missingCount} destinos ainda não existem`;
  const unknownSummary=unknownCount===1?'1 destino sem confirmação':`${unknownCount} destinos sem confirmação`;
  const header=document.createElement('header'),heading=document.createElement('h2');heading.id='copyFichaExistingTitle';heading.textContent='Destinos locais da Pre-Sell';
  const close=document.createElement('button');close.type='button';close.className='copy-ficha-btn';close.textContent='Fechar';close.setAttribute('aria-label','Fechar');header.append(heading,close);
  const summaries=[existingSummary,missingSummary,unknownSummary].filter((_,index)=>[existingCount,missingCount,unknownCount][index]>0);
  const intro=document.createElement('p');intro.textContent=`O Hub verificou ${targets.length} destino(s) local(is) para “${product}”: ${summaries.join('; ')}. Isso confirma apenas a existência local, não que a ficha atual tenha sido validada ou hospedada. Escolha configurar o lote para a Hostinger, cancelar ou substituir os arquivos das páginas existentes.`;
  const list=document.createElement('ul');list.className='copy-ficha-existing-paths';
  for(const target of targets){
    const item=document.createElement('li'),label=document.createElement('span'),state=document.createElement('strong'),code=document.createElement('code');
    item.classList.toggle('is-existing',target.exists===true);item.classList.toggle('is-new',target.exists===false);item.classList.toggle('is-unknown',target.exists==null);
    label.textContent=`Página ${String(target.pageNumber||'').padStart(2,'0')} · ${target.accountName||target.hpanelDomain||'Conta'}`;
    state.textContent=target.exists===true?'Já existe':target.exists===false?'Ainda não existe':'Estado não confirmado';state.className='copy-ficha-existing-state';
    code.textContent=target.sourceDirectory;item.append(label,state,code);list.append(item);
  }
  const note=document.createElement('p');note.className='copy-ficha-existing-note';note.textContent='Ao sobrescrever, o Hub substitui somente index.html, styles.css e scripts.js nas pastas existentes e cria as pastas ausentes; assets e outros arquivos permanecem. A hospedagem só pode receber pastas que já tenham sido geradas.';
  if(unknownCount){note.textContent+=' O Hub fará nova checagem dos destinos antes de gravar; o estado não confirmado não será tratado como pasta ausente.';}
  const feedback=document.createElement('p');feedback.className='copy-ficha-existing-feedback';feedback.hidden=true;feedback.setAttribute('role','status');
  const actions=document.createElement('footer');actions.className='copy-ficha-existing-actions';
  const deploy=document.createElement('button');deploy.type='button';deploy.className='copy-ficha-btn primary';deploy.textContent=`Configurar domínio e publicar (${existingCount})`;deploy.disabled=existingCount===0;
  const cancel=document.createElement('button');cancel.type='button';cancel.className='copy-ficha-btn';cancel.textContent='Cancelar';
  const overwrite=document.createElement('button');overwrite.type='button';overwrite.className='copy-ficha-btn copy-ficha-existing-overwrite';overwrite.textContent='Sobrescrever páginas';
  actions.append(deploy,cancel,overwrite);dialog.append(header,intro,list,note,feedback,actions);overlay.append(dialog);root.append(overlay);
  const dismiss=()=>{overlay.remove();if(previousFocus&&root.contains(previousFocus))previousFocus.focus()};
  const closeAndCancel=()=>{dismiss();onCancel?.()};
  deploy.addEventListener('click',()=>{
    const job=onQueueDeploy?.();
    if(!job){feedback.hidden=false;feedback.textContent='Não foi possível guardar esse destino na etapa de hospedagem. Confira se a lista de contas selecionadas está correta e tente novamente.';return}
    dismiss();openPresellDeployWorkflow(job.id);
  });
  cancel.addEventListener('click',closeAndCancel);close.addEventListener('click',closeAndCancel);
  overwrite.addEventListener('click',()=>{dismiss();onOverwrite?.()});
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeAndCancel()});
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape')closeAndCancel()});cancel.focus();
}

async function generateFichaAndCreatePresell(root,toast,{overwriteExisting=false}={}){
  let linkTargetConfirmationNeeded=false;
  clearPresellFeedback(root,'Validando o conteúdo obrigatório da ficha…');
  clearValidationMessages(root);
  validateMultiAccountInputs(root);
  const result=await createFromStructuredContent(inputValue(root,'copyFichaSource'),payload(root),{
    create:ficha=>{
      if(by(root,'copyTrackingAllAccounts')?.checked){
        const targets=buildPresellBatchTargets(root,ficha);
        return createPresellBatch(targets,{
          sourceDirectory:ficha.destination,assetFolder:ficha.assetFolder,
          overwriteExisting,confirmCreate:overwriteExisting?(message=>linkTargetConfirmationNeeded?window.confirm(message):true):undefined,
          beforeConfirm:async batchTargets=>{
            const trackings=batchTargets.map(target=>target.ficha.tracking).filter(tracking=>tracking.enabled);
            return trackings.length?preparePresellTrackingBatch(trackings):null;
          },
          afterConfirm:(_targets,plan)=>plan?.commit()||null,
          confirmationMessage:(batchTargets,plan,preflight)=>{
            const linkedTargets=(preflight?.targets||[]).filter(target=>target.destinationLinkTarget);
            linkTargetConfirmationNeeded=overwriteExisting&&linkedTargets.length>0;
            const linkTargetDetails=linkedTargets.length
              ?`\n\nO Hub encontrou destino(s) vinculado(s) e vai gravar no caminho físico abaixo, após sua confirmação:\n${linkedTargets.map(target=>`pag${String(target.pageNumber).padStart(2,'0')} ${target.hpanelDomain} → ${target.destinationLinkTarget}`).join('\n')}`
              :'';
            if(overwriteExisting)return `A nova ficha foi validada. Substituir apenas index.html, styles.css e scripts.js nas pastas existentes e criar as páginas que ainda faltam? Os assets e demais arquivos serão preservados. O envio para a Hostinger continua sendo uma etapa separada.${linkTargetDetails}`;
            const trackAction=plan?.targets?.length?`${plan.targets.filter(target=>target.action==='register').length} nova(s) Track(s), ${plan.targets.filter(target=>target.action==='reuse').length} reutilizada(s), e uma tag em cada página`: 'sem registrar Tracks, conforme a opção desativada';
            const list=batchTargets.map(target=>`pag${String(target.pageNumber).padStart(2,'0')} ${target.hpanelDomain}`).join('\n');
            return `A validação local de ${batchTargets.length} página(s) passou. A pasta ${inputValue(root,'copyDestination')} será usada apenas como origem de assets; as novas páginas serão criadas ao lado dela, com as pastas:\n${list}\n\nO Hub vai copiar a pasta ${ficha.assetFolder} para cada destino, gerar a página a partir da ficha e preparar ${trackAction}. Depois da geração, conclua a hospedagem e o deploy na etapa obrigatória desta tela. Nenhum destino existente será sobrescrito. Continuar?`;
          }
        }).catch(error=>{error.batchTargets=targets;error.baseFicha=ficha;throw error});
      }
      return createPresellFromFicha(ficha,{
      overwriteExisting,confirmCreate:overwriteExisting?(message=>linkTargetConfirmationNeeded?window.confirm(message):true):undefined,
      beforeConfirm:async normalized=>{
        if(!normalized.tracking?.enabled&&!overwriteExisting)return null;
        const preflight=await callApi(overwriteExisting?'/api/presell/overwrite-preflight':'/api/presell/preflight',normalized);
        if(preflight.ready!==true)throw new Error('A pasta da Pre-Sell não passou pela verificação local. Nenhuma Track foi alterada.');
        const trackingPreparation=normalized.tracking?.enabled?await preparePresellTracking(normalized.tracking):null;
        return {preflight,trackingPreparation};
      },
      afterConfirm:(_normalized,plan)=>plan?.trackingPreparation?.commit()||null,
      confirmationMessage:(_normalized,plan)=>{
        if(overwriteExisting){
          const linkTarget=String(plan?.preflight?.destinationLinkTarget||'');
          linkTargetConfirmationNeeded=Boolean(linkTarget);
          const detail=linkTarget?`\n\nO Hub encontrou um destino vinculado e vai gravar no caminho físico abaixo, após sua confirmação:\n${linkTarget}`:'';
          return 'A ficha passou pela validação. Somente index.html, styles.css e scripts.js serão substituídos; assets e outros arquivos serão preservados.'+detail;
        }
        if(!plan)return 'O conteúdo obrigatório da ficha está válido. Criar a Presell no destino informado? A criação será interrompida se algum arquivo de saída já existir ou se os assets/template não passarem na validação.';
        const trackingPlan=plan.trackingPreparation;
        const action=trackingPlan?.action==='reuse'?'reutilizar a Track já cadastrada':'cadastrar uma nova Track';
        return 'A verificação local passou. Ao confirmar, o Hub vai '+action+' para '+trackingPlan?.productLabel+' em '+trackingPlan?.hostname+' ('+trackingPlan?.platform+'), inserir o script na página e criar os arquivos da Pre-Sell. Nenhum arquivo de saída existente será sobrescrito. Continuar?';
      }
      }).catch(error=>{error.singleFicha=ficha;throw error});
    }
  });
  const {ficha,warnings}=result;
  updatePendingHighlights(root);
  if(result.cancelled){
    by(root,'copyPresellStatus').textContent=result.preflight?'Criação cancelada. A validação do lote usou somente staging temporário; nenhuma Track foi alterada nem pasta final foi criada.':'Criação cancelada. A validação foi somente leitura e nenhum arquivo foi criado.';
    return;
  }
  const isBatch=Boolean(result.targets);
  const productionReport=result.production?.report||result.production;
  const reports=isBatch?(result.production?.targets||[]).map(target=>({title:`pag${String(target.pageNumber).padStart(2,'0')} ${target.hpanelDomain} · ${target.overwritten?'sobrescrita':target.created?'criada':'não criada'}`,report:target.report,error:target.error})):[{title:overwriteExisting?'Validação após atualizar as páginas':'Validação após a criação',report:productionReport}];
  const finalStatus=isBatch
    ?(result.production?.overall==='PARTIAL'?'PARTIAL':(result.production?.targets||[]).some(target=>target.report?.overall==='BLOCKED'||target.error)?'BLOCKED':result.production?.overall||'PASS')
    :productionReport?.overall;
  const validatorOutputFailed=isBatch
    ?(result.production?.targets||[]).some(target=>target.report?.phases?.some(phase=>(phase.report?.checks||[]).some(check=>check.name==='validator-output')))
    :productionReport?.phases?.some(phase=>(phase.report?.checks||[]).some(check=>check.name==='validator-output'));
  const status=finalStatus==='PARTIAL'
    ?`O lote foi criado parcialmente. ${result.production?.created?.length||0} de ${result.targets.length} pasta(s) final(is) foi/foram concluída(s). Confira os destinos listados antes de tentar novamente; nenhum arquivo existente foi sobrescrito.`
    :finalStatus==='BLOCKED'
    ?isBatch
      ?`A validação local bloqueou o lote antes da etapa final. Nenhuma das pastas finais foi criada; revise os relatórios e não repita até corrigir os bloqueios. ${result.production?.error||''}`
      :validatorOutputFailed
      ?'Os arquivos da Presell foram criados, mas a validação falhou por um erro interno do Hub ao chamar os validadores do PowerShell. Isso não é uma reprovação da ficha e você não precisa alterar os campos para tentar corrigir. Não crie novamente nem publique: o Hub precisa corrigir a chamada e validar os arquivos existentes.'
      :'A Presell foi criada, mas a validação final encontrou bloqueios. Corrija os itens indicados antes de publicar.'
    :isBatch?`Lote concluído: ${(result.production?.targets||[]).filter(target=>target.overwritten).length} página(s) sobrescrita(s) e ${(result.production?.targets||[]).filter(target=>target.created&&!target.overwritten).length} criada(s). A ficha e ${ficha.faqs.length} FAQs foram processadas em cada página.`:overwriteExisting?'Páginas da Pre-Sell atualizadas. Somente os três arquivos gerados foram substituídos.':`Presell criada. A ficha passou pela validação e ${ficha.faqs.length} FAQs foram processadas.`;
  if(isBatch&&Array.isArray(result.afterConfirmation))by(root,'copyPresellStatus').textContent=status+` ${result.afterConfirmation.length} Track(s) foram confirmadas.`;
  else by(root,'copyPresellStatus').textContent=result.afterConfirmation?status+' A Track foi '+(result.afterConfirmation.outcome==='reused'?'reutilizada':'registrada')+' e o script foi inserido na página.':status;
  const deployJob=queueDeployFromResult(root,result,ficha);
  if(deployJob)by(root,'copyPresellStatus').textContent+=` A hospedagem e publicação ficaram pendentes na etapa obrigatória abaixo. O Hub recebeu da geração ${deployJob.targets.length} página(s) pronta(s) para o lote.`;
  if(isBatch&&Array.isArray(result.afterConfirmation))showTrackingBatchPopup(root,{registrations:result.afterConfirmation,targets:result.targets,production:result.production});
  else if(result.afterConfirmation)showTrackingPopup(root,{tracking:ficha.tracking,registration:result.afterConfirmation,partial:finalStatus==='BLOCKED',errorText:finalStatus==='BLOCKED'?'Os arquivos foram criados, mas a validação final encontrou bloqueios. Revise o relatório antes de publicar ou tentar novamente.':''});
  renderCreatedPresellLinks(root,result,ficha);
  renderPresellReports(root,reports);
  renderWarnings(root,warnings);
  toast?.(finalStatus==='BLOCKED'?(isBatch?'Validação do lote bloqueada.':'Presell criada; validação final bloqueada.'):finalStatus==='PARTIAL'?'Lote de Pre-Sells parcialmente criado.':isBatch?`${result.targets.length} Pre-Sell(s) criadas.`:`Presell criada com ${ficha.faqs.length} FAQs.`,finalStatus==='BLOCKED'||finalStatus==='PARTIAL');
}

export async function mount({root,toast}={}){
  if(!root)return;
  if(!mounted){
    root.innerHTML=renderTemplate();
    refreshTrackingAccountDirectory(root,{initial:true});restoreDraft(root);syncTrackingPlatformFromAffiliate(root);updateTrackingFields(root);updateTrackingTitlePreview(root);updateDiscountAmountLabel(root);updateProductPriceNote(root);updateDiscountNote(root);renderOfferQuestions(root);
    mountPresellDeployWorkflow({root,toast,getDraftTargets:()=>presellDeployDraftTargets(root),hpanelUrlForDomain:(domain,parentDomain)=>accountDomainUrl(parentDomain)||accountDomainUrl(domain)});
    by(root,'copyAnalyze').onclick=()=>analyzeClipboard(root);
    by(root,'copyAnalyzeManual').onclick=()=>analyzeManualText(root);
    by(root,'copyReset').onclick=()=>resetCollection(root,toast);
    by(root,'copyReadFichaClipboard').onclick=()=>analyzeStructuredFichaClipboard(root);
    by(root,'copyGenerateQuestions').onclick=()=>generateQuestions(root,toast);
    by(root,'copyQuestionsCopy').onclick=()=>copyOfferQuestions(root,toast);
    window.addEventListener('resize',()=>by(root,'copyOfferQuestions').querySelectorAll('[data-offer-answer]').forEach(resizeOfferAnswer));
    window.addEventListener(ACCOUNT_MAP_DUPLICATION_TARGET_UPDATED_EVENT,()=>refreshTrackingAccountDirectory(root));
    window.addEventListener('hub:google-ads-account-directory-updated',event=>refreshTrackingAccountDirectory(root,{directory:event.detail?.accounts||null}));
    window.addEventListener(ACCOUNT_DOMAIN_ASSOCIATIONS_UPDATED_EVENT,()=>refreshTrackingAccountDirectory(root));
    window.addEventListener(ASSET_STUDIO_PAGE_HANDOFF_EVENT,event=>applyAssetStudioPageDirectory(root,event.detail));
    window.addEventListener('storage',event=>{
      if(event.key===ACCOUNT_MAP_DUPLICATION_TARGET_KEY||event.key===GOOGLE_ADS_ACCOUNTS_CACHE_STORAGE_KEY||event.key===ACCOUNT_DOMAIN_ASSOCIATIONS_KEY)refreshTrackingAccountDirectory(root);
      if(event.key===ASSET_STUDIO_PAGE_HANDOFF_KEY&&event.newValue){try{applyAssetStudioPageDirectory(root,JSON.parse(event.newValue))}catch{}}
    });
    by(root,'copyGenerateFicha').onclick=async()=>{
      if(creatingPresell)return;
      const overwriteExisting=nextPresellOverwriteOnce;nextPresellOverwriteOnce=false;
      creatingPresell=true;const button=by(root,'copyGenerateFicha');button.disabled=true;button.textContent='Validando e preparando…';
      try{await generateFichaAndCreatePresell(root,toast,{overwriteExisting})}catch(error){
        updatePendingHighlights(root,{fields:error?.fields});renderWarnings(root,error.blockers||[error.message],{blocked:true});
        if(isExistingPresellDestinationError(error)&&!overwriteExisting){
          const ficha=error.singleFicha||error.baseFicha||{},targets=existingPresellDeployTargets(root,error),product=String(ficha.product||'Pre-Sell');
          by(root,'copyPresellStatus').textContent='A pasta de saída já existe. Escolha configurar o domínio e publicar a pasta, cancelar ou sobrescrever somente os arquivos da página.';
          showExistingPresellDecision(root,{
            targets,product,
            onQueueDeploy:()=>{
              const publishableTargets=targets.filter(target=>target.exists);
              const job=queuePresellDeployJob({product,targets:publishableTargets});
              if(job)by(root,'copyPresellStatus').textContent='A pasta existente foi adicionada à etapa de hospedagem e publicação.';
              return job;
            },
            onOverwrite:()=>{
              nextPresellOverwriteOnce=true;
              queueMicrotask(()=>by(root,'copyGenerateFicha')?.click());
            },
            onCancel:()=>{by(root,'copyPresellStatus').textContent='Ação cancelada. A página e os arquivos existentes não foram alterados.';}
          });
          return;
        }
        if(Array.isArray(error.afterConfirmation?.registrations)){
          const registrations=error.afterConfirmation.registrations,targets=error.batchTargets||[];
          by(root,'copyPresellStatus').textContent=`O Tracking confirmou ${registrations.length} Track(s), mas o lote local foi interrompido. Nenhuma página final foi confirmada como concluída; confira os destinos antes de repetir.`;
          showTrackingBatchPopup(root,{registrations,targets,uncertain:true,errorText:error.message});
        }else if(error.afterConfirmation){
          const {registration,tracking}=error.afterConfirmation;
          by(root,'copyPresellStatus').textContent='A Track foi '+(registration.outcome==='reused'?'reutilizada':'registrada')+', mas a produção local da Pre-Sell falhou. Confira a pasta e os arquivos antes de tentar novamente.';
          showTrackingPopup(root,{tracking,registration,partial:true,errorText:error.message});
        }else by(root,'copyPresellStatus').textContent=error.message;
        root.querySelector('.is-pending')?.focus();toast?.(error.message,true)
      }
      finally{creatingPresell=false;button.disabled=false;button.textContent='Validar ficha e criar Presell'}
    };
    const markManual=event=>{
      if(event.target.matches('[data-offer-answer]')){
        resizeOfferAnswer(event.target);event.target.closest('.copy-ficha-question')?.classList.remove('is-unidentified');return;
      }
      if(event.target.id==='copyFichaSource'){
        clearPresellFeedback(root,'Conteúdo alterado. Valide novamente antes de criar a Presell.');const analysis=by(root,'copyFichaAnalysis');analysis?.classList.remove('is-pending');analysis?.removeAttribute('aria-invalid');event.target.classList.remove('is-pending');event.target.removeAttribute('aria-invalid');return;
      }
      if(['copyTrackingManager','copyTrackingAllAccounts'].includes(event.target.id))return;
      if(event.target.id==='copyCurrency'){
        const previousCurrency=by(root,'copyDiscountAmountLabel')?.textContent.match(/\(([^)]+)\)$/)?.[1];
        if(previousCurrency&&previousCurrency!==inputValue(root,'copyCurrency')&&by(root,'copyDiscountAmount')?.dataset.autoFilled==='true')clearAutoDiscountAmount(root);
        updateDiscountAmountLabel(root);
      }
      if(event.target.matches('.copy-ficha-input,.copy-ficha-select')){delete event.target.dataset.autoFilled;event.target.classList.remove('is-autofilled')}
      if(event.target.id==='copyDiscount')syncDiscountFields(root,'percent');
      if(event.target.id==='copyDiscountAmount')syncDiscountFields(root,'amount');
      if(event.target.id==='copyProductPrice'){updateProductPriceNote(root);syncDiscountFields(root,'price')}
      if(event.target.id==='copyDestination'){
        const note=by(root,'copyDestinationAutoNotice');if(note)note.hidden=true;
        writeDraft({destination:event.target.value,assetStudioDirectoryAutoUpdated:false,autoFilledFields:collectAutoFilledFieldIds(root.querySelectorAll('[data-auto-filled="true"]'))});
        return;
      }
      if(['copyAffiliateUrl','copyAssetFolder','copyPageTitle'].includes(event.target.id))return;
      if(event.target.matches('input,select,textarea')&&!event.target.readOnly)invalidateGeneratedOutputs(root,'Dados alterados. Revise e valide novamente a ficha.');
    };
    const handleFieldEdit=event=>{
      if(event.target.matches('[data-tracking-multi-account]')){
        const selected=selectedTrackingAccounts(root),accountId=event.target.dataset.trackingMultiAccount;
        if(event.target.checked)selected.add(accountId);else selected.delete(accountId);
        renderHpanelLinks(root);root.querySelector(`[data-tracking-multi-account="${accountId}"]`)?.focus();saveTrackingDraft(root);return;
      }
      markManual(event);
      if(event.target.id==='copyAffiliateUrl')syncTrackingPlatformFromAffiliate(root);
      if(event.target.id==='copyTrackingEnabled')updateTrackingFields(root);
      if(event.target.id==='copyTrackingManager'){
        populateTrackingAccountOptions(root,{preferTarget:true});
        if(by(root,'copyTrackingAllAccounts').checked)selectAllTrackingAccounts(root);else currentSelectedTrackingAccountIds=null;
        renderHpanelLinks(root);
      }
      if(event.target.id==='copyTrackingAccount'){
        updateTrackingAccountSelection(root,{clearManual:event.target.value!=='manual'});
        if(by(root,'copyTrackingAllAccounts').checked&&accountsForSelectedManager(root).some(account=>String(account.customerId)===selectedTrackingAccountId(root))){
          selectedTrackingAccounts(root).add(selectedTrackingAccountId(root));renderHpanelLinks(root);
        }
      }
      if(event.target.id==='copyTrackingAllAccounts'){
        if(event.target.checked&&!(currentSelectedTrackingAccountIds instanceof Set))selectAllTrackingAccounts(root);
        if(!event.target.checked){const primaryUrl=accountPublicPreSellUrl(root,selectedTrackingAccountId(root));if(primaryUrl)by(root,'copyTrackingHostname').value=primaryUrl}
        renderHpanelLinks(root);saveTrackingDraft(root);
      }
      if(event.target.id==='copyTrackingAccountId')updateTrackingAccountSelection(root);
      if(event.target.id==='copyTrackingHostname'&&!by(root,'copyTrackingAllAccounts')?.checked){
        const accountId=selectedTrackingAccountId(root);
        if(accountId){currentTrackingPreSellUrls.set(accountId,String(event.target.value||''));currentTrackingPreSellAutoUrls.delete(accountId)}
        if(event.type==='change')renderHpanelLinks(root);
      }
      if(event.target.id==='copyTrackingSubdomain')renderHpanelLinks(root);
      if(event.target.matches('[data-tracking-presell-url]')){
        currentTrackingPreSellUrls.set(event.target.dataset.trackingPresellUrl,String(event.target.value||''));currentTrackingPreSellAutoUrls.delete(event.target.dataset.trackingPresellUrl);
        if(event.type==='change')renderHpanelLinks(root);
      }
      if(['copyFichaSource','copyProduct','copyTrackingAccount','copyTrackingAccountId'].includes(event.target.id))updateTrackingTitlePreview(root);
      if(['copyDtcUrl','copyFichaSource','copyProduct'].includes(event.target.id)){
        syncTrackingSubdomainSuggestion(root);
        if(by(root,'copyTrackingAllAccounts')?.checked)renderHpanelLinks(root);
        else updateTrackingSubdomainHint(root);
        saveTrackingDraft(root);
      }
      if(['copyTrackingEnabled','copyTrackingHostname','copyTrackingSubdomain','copyTrackingPlatform','copyTrackingManager','copyTrackingAccount','copyTrackingAccountId','copyTrackingAllAccounts','copyAffiliateUrl'].includes(event.target.id)||event.target.matches('[data-tracking-presell-url]'))saveTrackingDraft(root);
      if(event.target.id==='copyTrackingAccount'&&event.target.value==='manual')by(root,'copyTrackingAccountId').focus();
      if(event.target.id!=='copyFichaSource')updatePendingHighlights(root);
      if(['copyProductPrice','copyDiscount','copyDiscountAmount','copyCurrency'].includes(event.target.id))saveDraft(root);
    };
    root.addEventListener('input',handleFieldEdit);root.addEventListener('change',handleFieldEdit);
    if(inputValue(root,'copyFichaSource'))renderStructuredFichaAnalysis(root,inputValue(root,'copyFichaSource'),{origin:'draft'});
    updatePendingHighlights(root);
    mounted=true;
  }
  applyPendingAssetStudioPageDirectory(root);
}
