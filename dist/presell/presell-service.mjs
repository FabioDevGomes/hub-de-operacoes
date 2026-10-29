import {
  normalizeTrackingDomainInput,
  normalizeTrackingPlatform,
  normalizeTrackingProductKey,
  normalizeTrackingProductLabel,
} from '../tracking/tracking-domain-admin.mjs?v=11';
import {buildTrackingProductLabel,normalizeTrackingAccountId} from '../copy-ficha/copy-ficha-tracking-domain.mjs?v=1';

export function parseFicha(text){
  let ficha;
  try{ficha=JSON.parse(text)}catch{throw new Error('A ficha precisa estar em JSON válido.')}
  if(!ficha||typeof ficha!=='object'||Array.isArray(ficha))throw new Error('A ficha precisa ser um objeto JSON.');
  for(const field of['destination','htmlLanguage','countryCode','pageTitle','affiliateUrl'])if(!String(ficha[field]||'').trim())throw new Error(`Campo obrigatório ausente: ${field}.`);
  if(!Array.isArray(ficha.faqs)||![3,4].includes(ficha.faqs.length))throw new Error('A ficha deve conter três ou quatro FAQs.');
  if(ficha.faqs.some(faq=>!String(faq?.question||'').trim()||!String(faq?.answer||'').trim()))throw new Error('Cada FAQ deve conter pergunta e resposta preenchidas.');
  if(ficha.tracking?.enabled){
    let accountId=null,productName='',productLabel='';
    if(ficha.tracking.accountId||ficha.tracking.productName){
      accountId=normalizeTrackingAccountId(ficha.tracking.accountId);
      productName=normalizeTrackingProductLabel(ficha.tracking.productName).trim();
      productLabel=buildTrackingProductLabel(productName,accountId);
      const suppliedLabel=String(ficha.tracking.productLabel||'').trim();
      if(suppliedLabel&&suppliedLabel!==productLabel)throw new Error('O nome da Track precisa corresponder ao produto e à conta informados.');
    }else{
      productLabel=normalizeTrackingProductLabel(ficha.tracking.productLabel).trim();
    }
    const productKey=normalizeTrackingProductKey(productLabel);
    const suppliedKey=String(ficha.tracking.productKey||'').trim();
    if(suppliedKey&&suppliedKey!==productKey)throw new Error('A chave da Track não corresponde ao nome de produto da ficha.');
    const platform=normalizeTrackingPlatform(ficha.tracking.platform);
    if(!['clickbank','gurumedia'].includes(platform))throw new Error('Selecione ClickBank ou GuruMedia para esta Track.');
    ficha.tracking={enabled:true,hostname:normalizeTrackingDomainInput(ficha.tracking.hostname),platform,accountId,productName,productLabel,productKey};
  }else{
    ficha.tracking={enabled:false};
  }
  ficha.assetFolder=String(ficha.assetFolder||'assets');
  return ficha;
}

export async function callApi(path,ficha,extra={}){
  const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({destination:ficha.destination,ficha,...extra})});
  const result=await response.json().catch(()=>({error:'Resposta inválida do serviço local.'}));
  if(!response.ok)throw new Error(result.error||'O serviço local recusou a operação.');
  return result;
}

export async function callPresellBatchApi(path,payload){
  const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({error:'Resposta inválida do serviço local.'}));
  if(!response.ok)throw new Error(result.error||'O serviço local recusou a operação.');
  return result;
}

export async function createPresellBatch(targets,{
  sourceDirectory,
  assetFolder='assets',
  confirmCreate=message=>window.confirm(message),
  beforeConfirm=null,
  afterConfirm=null,
  confirmationMessage='A validação local do lote passou. Criar todas as páginas selecionadas?',
  overwriteExisting=false,
}={}){
  if(!Array.isArray(targets)||targets.length<1)throw new Error('Selecione ao menos uma conta para criar a Pre-Sell.');
  if(targets.length>50)throw new Error('O lote pode conter no máximo 50 contas por operação.');
  const normalizedTargets=targets.map((target,index)=>{
    const ficha=parseFicha(JSON.stringify(target?.ficha||{}));
    const pageNumber=Number(target.pageNumber);
    const hpanelDomain=String(target.hpanelDomain||'').trim().toLowerCase();
    if(!Number.isInteger(pageNumber)||pageNumber!==index+1)throw new Error('A numeração das pastas do lote precisa começar em 01 e seguir sem lacunas.');
    if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hpanelDomain))throw new Error('O domínio HPanel de uma das contas não foi identificado corretamente.');
    return {pageNumber,hpanelDomain,publicUrl:String(target.publicUrl||''),destination:String(target.destination||''),accountId:String(target.accountId||ficha.tracking?.accountId||''),accountName:String(target.accountName||''),ficha};
  });
  const source=String(sourceDirectory||'').trim();
  if(!source)throw new Error('Informe a pasta de origem dos assets.');
  const payload={sourceDirectory:source,assetFolder:String(assetFolder||'assets'),targets:normalizedTargets};
  const preflightPath=overwriteExisting?'/api/presell/batch-overwrite-preflight':'/api/presell/batch-preflight';
  const preflight=await callPresellBatchApi(preflightPath,payload);
  if(preflight.ready!==true){
    const error=new Error(preflight.error||'O lote não passou pela validação local. Nenhuma Track foi alterada e nenhuma pasta final foi criada.');
    error.destinationStates=Array.isArray(preflight.targetStates)?preflight.targetStates:[];
    error.existingTargets=Array.isArray(preflight.existingTargets)?preflight.existingTargets:[];
    throw error;
  }
  const preparation=beforeConfirm?await beforeConfirm(normalizedTargets,preflight):null;
  const confirmedDestinations=overwriteExisting?(preflight.targets||[]).map(target=>({
    pageNumber:Number(target.pageNumber),
    exists:Boolean(target.exists),
    requestedDestination:String(target.requestedDestination||''),
    resolvedDestination:String(target.destination||''),
  })):[];
  const message=typeof confirmationMessage==='function'?confirmationMessage(normalizedTargets,preparation,preflight):confirmationMessage;
  if(!confirmCreate(message))return {cancelled:true,preflight};
  let committed=null;
  try{
    committed=afterConfirm?await afterConfirm(normalizedTargets,preparation):null;
  }catch(error){
    if(error?.committedRegistrations?.length)error.afterConfirmation={registrations:error.committedRegistrations,trackingPlans:preparation?.targets||[]};
    throw error;
  }
  try{
    const productionPath=overwriteExisting?'/api/presell/batch-overwrite':'/api/presell/batch-produce';
    const production=await callPresellBatchApi(productionPath,{...payload,...(overwriteExisting?{confirmed:true,confirmedDestinations}:{})});
    if(production.ready===false&&Array.isArray(production.targetStates)){
      const error=new Error(production.error||'Um ou mais destinos mudaram depois da prévia. Confira a lista de páginas antes de continuar.');
      error.destinationStates=production.targetStates;
      error.existingTargets=Array.isArray(production.existingTargets)?production.existingTargets:[];
      throw error;
    }
    return {production,preflight,preparation,afterConfirmation:committed,targets:normalizedTargets};
  }catch(error){
    if(committed)error.afterConfirmation={registrations:committed,trackingPlans:preparation?.targets||[]};
    throw error;
  }
}

export async function createPresellFromFicha(ficha,{
  confirmCreate=message=>window.confirm(message),
  beforeConfirm=null,
  afterConfirm=null,
  confirmationMessage='O conteúdo obrigatório da ficha está válido. Criar a Presell no destino informado? A criação será interrompida se algum arquivo de saída já existir ou se os assets/template não passarem na validação.',
  overwriteExisting=false,
}={}){
  const normalized=parseFicha(JSON.stringify(ficha));
  const preparation=beforeConfirm?await beforeConfirm(normalized):null;
  const message=typeof confirmationMessage==='function'?confirmationMessage(normalized,preparation):confirmationMessage;
  if(!confirmCreate(message))return {cancelled:true};
  const committed=afterConfirm?await afterConfirm(normalized,preparation):null;
  try{
    const confirmedDestination=overwriteExisting?{
      exists:Boolean(preparation?.preflight?.exists),
      requestedDestination:String(preparation?.preflight?.requestedDestination||''),
      resolvedDestination:String(preparation?.preflight?.destination||''),
    }:null;
    const production=overwriteExisting
      ?await callApi('/api/presell/overwrite',normalized,{confirmed:true,confirmedDestination})
      :await callApi('/api/presell/produce',normalized);
    return {production,preparation,afterConfirmation:committed};
  }catch(error){
    if(committed)error.afterConfirmation={registration:committed,tracking:normalized.tracking};
    throw error;
  }
}
