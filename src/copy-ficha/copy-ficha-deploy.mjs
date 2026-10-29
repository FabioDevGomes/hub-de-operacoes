const JOBS_KEY='hub:presell-deploy-jobs:v1';
const JOBS_EVENT='hub:presell-deploy-jobs-updated';
const VALID_PREFIX=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const plans=new Map();
let mountedRoot=null;
let mountedDraftGetter=()=>null;
let activeDeployModalOpener=null;
const CURRENT_DRAFT_ID='__current_presell_draft__';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const by=(root,selector)=>root.querySelector(selector);

function readJobs(storage=globalThis.localStorage){
  try{const value=JSON.parse(storage.getItem(JOBS_KEY)||'[]');return Array.isArray(value)?value.filter(job=>job&&typeof job.id==='string'&&Array.isArray(job.targets)):[]}catch{return[]}
}
function writeJobs(jobs,storage=globalThis.localStorage){
  try{storage.setItem(JOBS_KEY,JSON.stringify(jobs));globalThis.dispatchEvent?.(new CustomEvent(JOBS_EVENT));return true}catch{return false}
}
function notify(storage){
  if(mountedRoot)renderRequiredAction(mountedRoot,readJobs(storage),mountedDraftGetter());
}

function isTargetSuperseded(target){return target?.status==='superseded'||target?.deploymentState==='superseded'}
function manualTargetDomain(target){const parent=String(target?.parentDomain||'').trim().toLowerCase(),prefix=String(target?.prefix||'').trim().toLowerCase();return String(target?.domain||'').trim().toLowerCase()||(prefix&&parent?`${prefix}.${parent}`:'')}
function normalizedTargetDirectory(value){return String(value||'').replace(/\\/g,'/').replace(/^[/]+|[/]+$/g,'').trim()}
function isTargetManuallyVerified(target){
  const verification=target?.manualVerification;
  if(verification?.status!=='confirmed')return false;
  return String(verification.domain||'').trim().toLowerCase()===manualTargetDomain(target)
    &&normalizedTargetDirectory(verification.directory)===normalizedTargetDirectory(target?.directory)
    &&String(verification.username||'')===String(target?.username||'');
}
function isTargetResolved(target){return isTargetPublished(target)||isTargetManuallyVerified(target)||isTargetSuperseded(target)}
function normalizedProduct(value){return String(value||'').trim().toLowerCase()}
function sourceLineage(source){return String(source||'').trim().replace(/[\\/]+$/,'').replace(/[\\/]pag\d+\s+[^\\/]+$/i,'').toLowerCase()}
function sameTargetLineage(left,right){
  const leftAccount=String(left?.accountId||'').replace(/\D/g,''),rightAccount=String(right?.accountId||'').replace(/\D/g,'');
  const leftRoot=sourceLineage(left?.sourceDirectory),rightRoot=sourceLineage(right?.sourceDirectory);
  return Boolean(leftAccount&&leftAccount===rightAccount&&leftRoot&&leftRoot===rightRoot);
}
function generationDescriptors(job){
  const generated=Array.isArray(job?.generationSummary)?job.generationSummary:[];
  if(generated.length)return generated.map(item=>{
    const target=(job?.targets||[]).find(candidate=>Number(candidate.pageNumber)===Number(item.pageNumber));
    return {accountId:item.accountId||target?.accountId,hpanelDomain:item.hpanelDomain||target?.hpanelDomain,publicUrl:item.publicUrl||target?.publicUrl,sourceDirectory:item.sourceDirectory||item.destination||target?.sourceDirectory||''};
  });
  return Array.isArray(job?.targets)?job.targets:[];
}
function matchingDraftJob(jobs,draft){
  if(!draft?.targets?.length)return null;
  const matching=(Array.isArray(jobs)?jobs:[]).slice().reverse().filter(job=>{
    if(normalizedProduct(job?.product)!==normalizedProduct(draft.product))return false;
    const saved=generationDescriptors(job);
    if(saved.length!==draft.targets.length)return false;
    return draft.targets.every(expected=>{
      const accountId=String(expected?.accountId||'').replace(/\D/g,'');
      const item=saved.find(candidate=>String(candidate?.accountId||'').replace(/\D/g,'')===accountId);
      if(!accountId||!item||String(item.hpanelDomain||'').trim().toLowerCase()!==String(expected.hpanelDomain||'').trim().toLowerCase()||getHostname(item.publicUrl||'')!==getHostname(expected.publicUrl||''))return false;
      const savedSource=String(item.sourceDirectory||'').trim().replace(/[\\/]+$/,'').toLowerCase();
      const draftSource=String(expected.sourceDirectory||'').trim().replace(/[\\/]+$/,'').toLowerCase();
      return !savedSource||savedSource===draftSource;
    });
  });
  return matching.find(job=>!isJobSuperseded(job))||null;
}
function isDraftReplacement(job,target,draft){
  if(normalizedProduct(job?.product)!==normalizedProduct(draft?.product)||isTargetResolved(target))return false;
  return (draft?.targets||[]).some(candidate=>sameTargetLineage(target,candidate));
}
function pendingCountWithDraft(jobs,draft){
  const saved=(Array.isArray(jobs)?jobs:[]).reduce((total,job)=>total+(job.targets||[]).filter(target=>!isTargetResolved(target)&&!isDraftReplacement(job,target,draft)).length,0);
  return saved+(draft?.targets?.length||0);
}

export function queuePresellDeployJob(job,{storage=globalThis.localStorage}={}){
  if(!job||!Array.isArray(job.targets)||!job.targets.length)return null;
  const normalized={...job,generationSummary:Array.isArray(job.generationSummary)?job.generationSummary.map(item=>({...item})):[],id:String(job.id||`${Date.now()}-${Math.random().toString(36).slice(2,8)}`),createdAtUtc:String(job.createdAtUtc||new Date().toISOString()),status:'pending',targets:job.targets.map((target,index)=>({
    ...target,id:String(target.id||target.accountId||`${index+1}`),status:'pending',deploymentState:'pending',deploymentHistory:[],hasPublished:false,error:'',planSummary:null,
  }))};
  const jobs=readJobs(storage);
  const replacementDescriptors=[...normalized.targets,...generationDescriptors(normalized)];
  const supersededAtUtc=new Date().toISOString();
  for(const previous of jobs){
    if(normalizedProduct(previous.product)!==normalizedProduct(normalized.product))continue;
    let changed=false;
    previous.targets=previous.targets.map(target=>{
      if(isTargetResolved(target)||!replacementDescriptors.some(candidate=>sameTargetLineage(target,candidate)))return target;
      changed=true;
      return {...target,status:'superseded',deploymentState:'superseded',supersededBy:normalized.id,supersededAtUtc};
    });
    if(changed)previous.status='superseded';
  }
  jobs.push(normalized);
  const retained=jobs.slice(-30);
  if(!writeJobs(retained,storage))return null;
  notify(storage);return normalized;
}

export function openPresellDeployWorkflow(jobId=''){
  activeDeployModalOpener?.(String(jobId||''));
}

function updateJob(jobId,mutator,storage){
  const jobs=readJobs(storage),index=jobs.findIndex(job=>job.id===jobId);
  if(index<0)return jobs;
  jobs[index]=mutator({...jobs[index],targets:jobs[index].targets.map(target=>({...target}))});
  writeJobs(jobs,storage);notify(storage);return jobs;
}

export function confirmManualDeployVerification(jobId,targetId,{storage=globalThis.localStorage,confirmedAtUtc=new Date().toISOString()}={}){
  const jobs=readJobs(storage),jobIndex=jobs.findIndex(job=>job.id===String(jobId||''));
  if(jobIndex<0)return false;
  const job=jobs[jobIndex],target=job.targets.find(item=>item.id===String(targetId||''));
  if(!target||job.draftOnly||target.draftOnly||isTargetSuperseded(target)||isTargetPublished(target)||isTargetManuallyVerified(target))return false;
  const domain=manualTargetDomain(target),directory=normalizedTargetDirectory(target.directory),username=String(target.username||'').trim();
  if(!domain||!directory||!username||!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)||directory.split('/').some(part=>!part||part==='.'||part==='..'))return false;
  const publicHost=getHostname(target.publicUrl||'');
  if(publicHost&&publicHost!==domain)return false;
  target.domain=domain;
  target.manualVerification={status:'confirmed',domain,parentDomain:String(target.parentDomain||'').trim().toLowerCase(),username,directory,confirmedAtUtc:String(confirmedAtUtc)};
  target.status='manual-verified';target.deploymentState='manual-verified';target.error='';target.planSummary=null;
  job.status=isJobComplete(job)?'complete':'pending';
  if(!writeJobs(jobs,storage))return false;
  notify(storage);return true;
}

function isTargetPublished(target){
  if(isTargetManuallyVerified(target))return false;
  if(isTargetSuperseded(target))return false;
  if(['partial','error'].includes(String(target?.status||'')))return false;
  if(['pending','running','failed'].includes(target?.deploymentState))return false;
  if(target?.deploymentState==='success')return true;
  const history=Array.isArray(target?.deploymentHistory)?target.deploymentHistory:[];
  if(history.length)return history[history.length-1]?.status==='success';
  return target?.status==='published'||target?.hasPublished===true;
}
function hasPreviousSuccessfulDeployment(target,domain=''){
  if(target?.hasPublished===true)return true;
  const normalizedDomain=String(domain||'').trim().toLowerCase();
  return (Array.isArray(target?.deploymentHistory)?target.deploymentHistory:[]).some(entry=>entry?.status==='success'&&(!normalizedDomain||!entry.domain||String(entry.domain).toLowerCase()===normalizedDomain));
}
function hasUnconfirmedRemoteOutcome(target){
  const latest=Array.isArray(target?.deploymentHistory)?target.deploymentHistory.at(-1):null;
  return latest?.remoteState==='unknown'||/falha de comunicação|resposta de rede indisponível|sem resposta HTTP/i.test(String(latest?.error||target?.error||''));
}
function isJobComplete(job){return Array.isArray(job?.targets)&&job.targets.length>0&&job.targets.every(isTargetPublished)}
function isJobSuperseded(job){return Array.isArray(job?.targets)&&job.targets.length>0&&job.targets.every(isTargetSuperseded)}
function pendingJobs(jobs){return (Array.isArray(jobs)?jobs:[]).filter(job=>Array.isArray(job.targets)&&job.targets.some(target=>!isTargetResolved(target)))}
export function countPendingDeployTargets(jobs){return (Array.isArray(jobs)?jobs:[]).reduce((total,job)=>total+(Array.isArray(job?.targets)?job.targets.filter(target=>!isTargetResolved(target)).length:0),0)}
export function selectActiveDeployJob(jobs,requestedJobId=''){
  const list=Array.isArray(jobs)?jobs:[],pending=pendingJobs(list);
  const requested=list.find(job=>job.id===String(requestedJobId||''));
  return requested&&!isJobSuperseded(requested)?requested:pending[0]||list[list.length-1]||null;
}
function recordDeployExecution(target,entry){
  const history=Array.isArray(target.deploymentHistory)?target.deploymentHistory.slice():[];
  const existing=history.findIndex(item=>item?.id===entry.id);
  if(existing>=0)history[existing]={...history[existing],...entry};else history.push(entry);
  target.deploymentHistory=history.slice(-20);
  if(entry.status)target.deploymentState=entry.status==='success'?'success':entry.status==='running'?'running':'failed';
}
function formatDeployTime(value){
  const date=new Date(value||'');
  return Number.isNaN(date.getTime())?'Horário não registrado':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(date);
}
function deploymentErrorForDisplay(error,attempt){
  const raw=String(error||'');
  if(!/HTTP\s*409\b/i.test(raw))return raw;
  const path=String(attempt?.failedPath||'').trim(),uploaded=Math.max(0,Number(attempt?.uploadedCount)||0),total=Math.max(0,Number(attempt?.totalCount)||0);
  const count=total?`${uploaded}/${total} arquivos confirmados. `:'';
  return `${count}${path?`A Hostinger recusou iniciar ${path} com HTTP 409 (conflito). `:'A Hostinger recusou iniciar um arquivo com HTTP 409 (conflito). '}A resposta não identifica se o caminho estava ocupado por arquivo, pasta ou outro item. A tentativa não substituiu arquivos; confira o inventário antes de remover algo ou tentar novamente.`;
}
function remoteInventorySummary(verification){
  if(!verification)return '';
  if(verification.available!==true)return `A consulta do inventário no Hub não foi concluída: ${String(verification.error||'a Hostinger não confirmou a listagem')}. O deploy continua não confirmado.`;
  const expected=Math.max(0,Number(verification.expectedCount)||0),present=Math.max(0,Number(verification.presentCount)||0),sameSize=Math.max(0,Number(verification.sizeMatchCount)||0),mismatched=Math.max(0,Number(verification.sizeMismatchCount)||0),missing=Math.max(0,Number(verification.missingCount)||0),typeConflicts=Math.max(0,Number(verification.pathTypeConflictCount)||0),returnedCount=Math.max(0,Number(verification.returnedEntryCount)||0);
  const query=verification.queryDomain?` Consulta da API: ${String(verification.queryDomain)} · public_html/${String(verification.queryDirectory||'')}; ${returnedCount} item(ns) retornado(s).`:'';
  const inventory=verification.allPathsPresent===true&&verification.allSizesMatch===true
    ?`Todos os ${expected} caminhos esperados aparecem no inventário e os tamanhos correspondem.`
    :`Inventário atual: ${present}/${expected} arquivos localizados pela listagem da Hostinger; ${sameSize} com tamanho correspondente, ${mismatched} com tamanho diferente, ${missing} não localizados pela consulta e ${typeConflicts} caminho(s) ocupado(s) por pasta, link ou outro item.${missing?` Isso não confirma que estejam ausentes no HPanel.`:''}`;
  const checkedAt=verification.checkedAtUtc?` Consulta em ${formatDeployTime(verification.checkedAtUtc)}.`:'';
  return `${inventory}${query} Isso confirma caminhos e tamanhos, não o conteúdo exato; esta tentativa não fica confirmada como deploy.${checkedAt}`;
}
function renderDeployHistory(target){
  const history=Array.isArray(target?.deploymentHistory)?target.deploymentHistory.slice().reverse():[];
  if(!history.length)return '';
  const entries=history.map(item=>{
    const label=item.status==='success'?'Sucesso':item.status==='running'?'Confirmação pendente':item.status==='partial'&&item.remoteState==='unknown'?'Interrompido · estado remoto incerto':item.status==='partial'&&Number(item.uploadedCount)===0?'Envio não confirmado':item.status==='partial'?'Envio parcial':'Falha';
    const http409=/HTTP\s*409\b/i.test(String(item.error||'')),uploadedCount=Math.max(0,Number(item.uploadedCount)||0),totalCount=Math.max(0,Number(item.totalCount)||0),failedPath=String(item.failedPath||'').trim();
    const unattemptedCount=http409&&failedPath&&totalCount>0?Math.max(0,totalCount-uploadedCount-1):0;
    const conflictHint=http409?`${failedPath?`HTTP 409 ao iniciar ${failedPath}. `:'HTTP 409 ao iniciar um arquivo. '}A resposta confirma um conflito na Hostinger, mas não identifica sozinha se há um arquivo, pasta ou outro item nesse caminho. Confira a verificação do inventário antes de remover algo. ${totalCount>0&&failedPath?`A tentativa parou ali: ${uploadedCount}/${totalCount} arquivos confirmados; ${unattemptedCount} arquivo(s) depois dele não foram enviados nem verificados. `:''}Esta tentativa não confirma o deploy.`:'';
    const count=totalCount>0?`${uploadedCount}/${totalCount} arquivos`:'';
    const detail=[count,item.failedPath?`falha em ${item.failedPath}`:'',item.remoteState==='unknown'?'a Hostinger não confirmou se o arquivo chegou ao destino':'',http409?'HTTP 409 (conflito)':item.error||''].filter(Boolean).join(' · ');
    const verification=remoteInventorySummaryForAttempt(item.remoteVerification,item);
    return `<li><time>${esc(formatDeployTime(item.completedAtUtc||item.startedAtUtc))}</time> · <strong>${label}</strong>${verification?`<div class="copy-ficha-deploy-inventory-result"><strong>Verificação no Hub:</strong> ${esc(verification)}</div>`:''}<div>${conflictHint?`<strong>${esc(conflictHint)}</strong> · `:''}${esc(detail)}</div></li>`;
  }).join('');
  return `<details class="copy-ficha-deploy-history"><summary>Histórico de envios (${history.length})</summary><ul>${entries}</ul></details>`;
}
function remoteInventorySummaryForAttempt(verification,attempt){
  if(attempt?.status!=='success')return remoteInventorySummary(verification);
  const uploaded=Math.max(0,Number(attempt.uploadedCount)||0),total=Math.max(0,Number(attempt.totalCount)||0),accepted=String(uploaded)+'/'+String(total);
  if(verification?.available!==true)return 'A Hostinger confirmou o envio de '+accepted+' arquivos, mas o Hub não conseguiu conferir o inventário: '+String(verification?.error||'consulta não concluída')+'.';
  if(verification.allPathsPresent===true&&verification.allSizesMatch===true&&!(Number(verification.pathTypeConflictCount)||0))return 'A Hostinger confirmou o envio de '+accepted+' arquivos. O inventário atual também mostra todos os caminhos e tamanhos esperados. A API não fornece checksum para verificar o conteúdo byte a byte.';
  const expected=Math.max(0,Number(verification.expectedCount)||0),present=Math.max(0,Number(verification.presentCount)||0),matched=Math.max(0,Number(verification.sizeMatchCount)||0),mismatched=Math.max(0,Number(verification.sizeMismatchCount)||0),missing=Math.max(0,Number(verification.missingCount)||0),typeConflicts=Math.max(0,Number(verification.pathTypeConflictCount)||0);
  return 'A Hostinger confirmou o envio de '+accepted+' arquivos. Porém, a listagem da Hostinger mostra '+present+'/'+expected+' arquivos localizados, '+matched+' tamanhos correspondentes, '+mismatched+' divergentes, '+missing+' não localizados pela consulta e '+typeConflicts+' caminhos ocupados por pasta, link ou outro item. Isso não confirma que os arquivos não estejam no HPanel; confira o domínio e a pasta consultados abaixo.'
}
function snapshotExpectedFiles(files){
  return (Array.isArray(files)?files:[]).map(file=>({remotePath:String(file?.remotePath||'').trim(),relativePath:String(file?.relativePath||'').trim(),sizeBytes:Number(file?.sizeBytes)})).filter(file=>(file.remotePath||file.relativePath)&&Number.isFinite(file.sizeBytes)&&file.sizeBytes>=0);
}
async function queryHostingerInventory(attempt,target,fetchImpl){
  const expectedFiles=snapshotExpectedFiles(attempt?.expectedFiles?.length?attempt.expectedFiles:target?.planSummary?.files);
  const checkedAtUtc=new Date().toISOString();
  if(!expectedFiles.length)return {available:false,error:'A lista esperada de arquivos desta tentativa não foi preservada.',checkedAtUtc};
  try{return await request('/api/hostinger/publish/verify',{method:'POST',body:{domain:attempt?.domain||target?.domain,storageDomain:attempt?.storageDomain||attempt?.parentDomain||target?.parentDomain,username:attempt?.username||target?.username,targetDirectory:attempt?.targetDirectory??attempt?.directory??target?.directory??'',expectedFiles},fetchImpl});}
  catch(error){return {available:false,error:String(error?.message||error),checkedAtUtc};}
}
function renderInventoryDetails(verification){
  if(verification?.available!==true||!Array.isArray(verification.files))return '';
  const issues=verification.files.filter(file=>file?.status!=='size-match');
  if(!issues.length)return '';
  const rows=issues.map(file=>{const typeLabels={directory:'pasta',dir:'pasta',symlink:'link simbólico',link:'link simbólico',other:'outro item'};const detail=file.status==='missing'?'Não localizado pela listagem da API Hostinger.':file.status==='path-type-conflict'?'O caminho aparece como '+(typeLabels[String(file.remoteType||'').toLowerCase()]||'outro item')+', não como arquivo.':'Tamanho remoto: '+labelSize(file.remoteSizeBytes)+'; esperado: '+labelSize(file.expectedSizeBytes)+'.';return '<li><code>'+esc(file.path||'arquivo')+'</code> · '+esc(detail)+'</li>'}).join('');
  return '<details class="copy-ficha-deploy-inventory-details"><summary>Ver arquivos com diferença ('+issues.length+')</summary><ul>'+rows+'</ul></details>';
}
function renderRemoteInventoryQueryDetails(verification){
  if(verification?.available!==true||!verification.queryDomain)return '';
  const queryPath=`public_html${verification.queryDirectory?`/${String(verification.queryDirectory).replace(/^[/]+|[/]+$/g,'')}`:''}`,entries=Array.isArray(verification.returnedEntries)?verification.returnedEntries:[],labels={file:'arquivo',directory:'pasta',dir:'pasta',symlink:'link simbólico',link:'link simbólico',other:'outro item'};
  const rows=entries.map(entry=>'<li><code>'+esc(entry.path||'(caminho sem nome)')+'</code> · '+esc(labels[String(entry.type||'').toLowerCase()]||String(entry.type||'tipo desconhecido'))+'</li>').join('');
  const content=rows?'<ul>'+rows+'</ul>':'<p>A API não retornou itens nesta consulta.</p>';
  return '<details class="copy-ficha-deploy-inventory-details"><summary>Detalhes da consulta à Hostinger</summary><p>Domínio consultado: <code>'+esc(verification.queryDomain)+'</code> · pasta: <code>'+esc(queryPath)+'</code> · '+Math.max(0,Number(verification.returnedEntryCount)||0)+' item(ns) retornado(s). Amostra da resposta:</p>'+content+'</details>';
}
function renderRequiredAction(root,jobs,draft=null){
  const section=by(root,'#copyPresellDeployTask'),button=by(root,'#copyPresellDeployOpen'),status=by(root,'#copyPresellDeployStatus');
  if(!section||!button||!status)return;
  const activeDraft=draft?.targets?.length&&!matchingDraftJob(jobs,draft)?draft:null;
  const pending=pendingJobs(jobs),completed=jobs.filter(isJobComplete),manualCount=(Array.isArray(jobs)?jobs:[]).reduce((sum,job)=>sum+(Array.isArray(job?.targets)?job.targets.filter(isTargetManuallyVerified).length:0),0);
  section.hidden=jobs.length===0&&!activeDraft;
  if(pending.length||activeDraft){
    const destinationCount=activeDraft?pendingCountWithDraft(jobs,activeDraft):countPendingDeployTargets(jobs);
    section.classList.add('is-required');section.classList.remove('is-complete');
    button.className='copy-ficha-btn copy-ficha-deploy-button is-required';button.textContent=`Concluir hospedagem e publicação · ${destinationCount} destino${destinationCount===1?'':'s'} pendente${destinationCount===1?'':'s'}`;button.disabled=false;
    status.className='copy-ficha-deploy-status is-required';
    status.textContent=activeDraft
      ?`Ficha atual: ${activeDraft.targets.length} destino(s) planejado(s) com as contas, URLs e prefixo atuais. Valide e gere as Pre-Sells para liberar análise e publicação${destinationCount>activeDraft.targets.length?`. Há também ${destinationCount-activeDraft.targets.length} destino(s) pendente(s) de outros lotes`:''}.`
      :`Etapa obrigatória: ${destinationCount} destino(s) pendente(s) em ${pending.length} Pre-Sell(s). O Hub apresenta uma Pre-Sell por vez e mantém as demais na fila.`;
  }else if(manualCount){
    section.classList.remove('is-required');section.classList.add('is-complete');
    button.className='copy-ficha-btn copy-ficha-deploy-button';button.textContent='Ver validações manuais';button.disabled=false;
    status.className='copy-ficha-deploy-status is-complete';status.textContent=`${manualCount} destino(s) verificado(s) manualmente no HPanel e confirmado(s) como funcionando. A etapa está concluída para esses destinos.`;
  }else if(completed.length){
    section.classList.remove('is-required');section.classList.add('is-complete');
    button.className='copy-ficha-btn copy-ficha-deploy-button';button.textContent='Ver resultado da hospedagem';button.disabled=false;
    status.className='copy-ficha-deploy-status is-complete';status.textContent='Hospedagem e publicação concluídas para as Pre-Sells geradas.';
  }
}

function getHostname(value){
  try{return new URL(String(value||'').trim()).hostname.toLowerCase().replace(/\.$/,'')}catch{return String(value||'').trim().toLowerCase().replace(/^https?:\/\//,'').split(/[/?#]/)[0].replace(/\.$/,'')}
}
function publicPresellHref(value){
  try{
    const url=new URL(String(value||'').trim());
    return url.protocol==='https:'&&url.hostname&&!url.username&&!url.password?url.href:'';
  }catch{return '';}
}
function isRootSite(site){return String(site?.websiteType||'').toLowerCase()!=='subdomain'}
function isEnabled(site){return !/^(disabled|desabilitado|inativo)$/i.test(String(site?.status||''))}
function rootSites(sites){return (Array.isArray(sites)?sites:[]).filter(site=>site?.domain&&site?.username&&isRootSite(site)&&isEnabled(site))}
function matchExisting(sites,domain,username){return (sites||[]).find(site=>String(site.domain||'').toLowerCase()===String(domain||'').toLowerCase()&&String(site.username||'')===String(username||''))||null}
function chooseInitialParent(target,sites){
  const roots=rootSites(sites),hostname=getHostname(target.publicUrl),known=String(target.parentDomain||target.hpanelDomain||'').toLowerCase();
  const same=roots.find(site=>String(site.domain).toLowerCase()===known);
  if(same)return same;
  const suffixMatch=roots.filter(site=>hostname.endsWith(`.${String(site.domain).toLowerCase()}`)).sort((a,b)=>String(b.domain).length-String(a.domain).length)[0];
  return suffixMatch||null;
}
function prefixFor(hostname,parent){
  const normalized=String(hostname||'').toLowerCase(),domain=String(parent||'').toLowerCase();
  if(normalized===domain)return '';
  if(!normalized.endsWith(`.${domain}`))return '';
  return normalized.slice(0,-domain.length-1);
}
function labelSize(bytes){
  const value=Number(bytes)||0;
  if(value<1024)return `${value} B`;
  if(value<1024**2)return `${(value/1024).toFixed(1)} KB`;
  return `${(value/1024**2).toFixed(2)} MB`;
}
function isSubdomainLimitError(value){
  return /(?:subdomains?|subdom[ií]nios?).{0,60}(?:limit|quota|maximum|reached|exceeded|limite|cota|atingid[oa])|(?:limit|quota|maximum|limite|cota).{0,60}(?:subdomains?|subdom[ií]nios?)/i.test(String(value||''));
}
function isPlanPublishable(plan){return Boolean(plan?.ready&&!(Array.isArray(plan.conflicts)&&plan.conflicts.length))}
function targetNeedsAnalysis(job,target){
  if(!job?.id||!target||isTargetResolved(target))return false;
  return !isPlanPublishable(plans.get(`${job.id}:${target.id}`));
}
function targetsNeedingAnalysis(job){
  return (Array.isArray(job?.targets)?job.targets:[]).filter(target=>targetNeedsAnalysis(job,target));
}
export function deploymentNextAction(target,{hasConflicts=false,conflicts=[]}={}){
  if(isTargetSuperseded(target))return null;
  const error=String(target?.error||''),latest=Array.isArray(target?.deploymentHistory)?target.deploymentHistory.at(-1):null;
  const statusCode=Number(error.match(/HTTP\s+(\d{3})/i)?.[1]||0),failedPath=String(latest?.failedPath||'').trim();
  if(isSubdomainLimitError(error))return {title:'Próxima ação: revisar o limite de subdomínios',text:'A Hostinger informou que não aceita mais subdomínios para este site. O Hub não enviou arquivos para este destino; confira a lista atualizada de subdomínios abaixo.',steps:['Revise o domínio e a pasta de cada item da lista. O Hub também mostra vínculos encontrados nos lotes salvos.','Se decidir excluir um item, confira os dados e o aviso de exclusão antes de confirmar. A remoção pode apagar os arquivos hospedados.','Depois da exclusão, atualize a lista de sites e reanalise este destino.'],showHpanel:true};
  if(hasConflicts&&conflicts.length){
    const nonFileConflicts=conflicts.filter(item=>item?.kind&&item.kind!=='file');
    if(nonFileConflicts.length)return {title:'Próxima ação: revisar o caminho em conflito',text:`A análise encontrou ${conflicts.length} caminho(s) ocupado(s) no destino, incluindo item(ns) que não são arquivo(s). O Hub bloqueou o envio e não substituiu nada.`,steps:['Abra o HPanel e confira os caminhos listados, incluindo o tipo de cada item.','Não remova pastas, links ou itens sem identificar sua função. Se um arquivo listado for a versão antiga da página e você quiser substituí-lo, remova somente esse arquivo.','Volte ao Hub e clique em Reanalisar páginas pendentes.'],showHpanel:true};
    return {title:'Próxima ação: remover somente os arquivos listados',text:`A análise confirmou ${conflicts.length} arquivo(s) no destino. O Hub bloqueou a publicação e não substituiu esses arquivos.`,steps:['Abra o HPanel e a pasta mostrada acima.','Remova somente os caminhos identificados na lista de conflitos caso queira publicar as versões locais; preserve os demais arquivos e a pasta.','Volte ao Hub e clique em Reanalisar páginas pendentes.'],showHpanel:true};
  }
  if(target?.status==='ready'||target?.status==='published')return null;
  if(/não foi possível confirmar a criação/i.test(error)){
    const domain=String(target?.domain||`${String(target?.prefix||'').trim().toLowerCase()}.${String(target?.parentDomain||'').trim().toLowerCase()}`).replace(/^\.|\.$/g,'');
    return {title:'Próxima ação: conferir o inventário de subdomínios',text:`A tentativa de criação de ${domain||'o subdomínio solicitado'} retornou erro. O Hub consultou o inventário específico de subdomínios e a lista geral, mas não confirmou se o endereço existe. Os arquivos ainda não foram analisados nem enviados.`,steps:['Em Integrações → Hostinger, clique em “Atualizar subdomínios” no quadro do site principal correspondente.','Se o endereço aparecer, volte a este modal e reanalise; o Hub vai reutilizá-lo sem tentar criá-lo de novo.','Se a pasta existir no HPanel mas o endereço continuar ausente do inventário, envie o erro e a referência Hostinger para investigarmos. Não remova arquivos com base neste aviso.'],showHpanel:false};
  }
  if(/não consta no cache local de sites|não consta na lista local salva da Hostinger/i.test(error)){
    const domain=String(target?.domain||`${String(target?.prefix||'').trim().toLowerCase()}.${String(target?.parentDomain||'').trim().toLowerCase()}`).replace(/^\.|\.$/g,'');
    const parent=String(target?.parentDomain||'').trim().toLowerCase();
    return {title:'Próxima ação: sincronizar o inventário do subdomínio',text:`O Hub não encontrou ${domain||'este endereço'} no cache local que prepara a prévia. Isso descreve a lista salva usada pelo Hub; não prova que o endereço foi apagado. A lista geral de sites e a lista específica de subdomínios são consultas diferentes.`,steps:['Reanalise este destino: quando a Hostinger confirmar que o subdomínio existe, o Hub agora registra essa confirmação no cache usado pela prévia.','Se a pendência continuar, em Integrações → Hostinger clique em “Atualizar subdomínios” no quadro do site principal '+(parent?`“${parent}”`:'selecionado')+' e reanalise. “Atualizar sites” consulta a lista geral e não sincroniza este inventário específico.','Nenhum arquivo foi analisado ou enviado para este destino. Não exclua nem recrie o subdomínio com base apenas neste aviso.'],showHpanel:false};
  }
  if(statusCode===409)return {title:'Próxima ação: reanalisar o destino',text:`A Hostinger recusou iniciar ${failedPath?`o envio do arquivo ${failedPath}`:'um arquivo'} com HTTP 409 (conflito). Esse código não confirma sozinho que havia um arquivo nesse caminho; a consulta do inventário precisa identificar o tipo de item. Nenhum arquivo existente foi substituído.`,steps:['Clique em Reanalisar páginas pendentes para consultar o inventário e a prévia novamente.','Só remova um arquivo se a análise do Hub confirmar esse caminho como arquivo existente e você decidir publicar a versão local. Não apague pastas, links ou arquivos com base apenas no HTTP 409.','Se o caminho continuar ausente no inventário e o HTTP 409 voltar, envie o erro completo e o horário da tentativa ao Codex para investigar a divergência.'],showHpanel:false};
  if(statusCode===500&&/conferir os arquivos existentes|consultar os arquivos/i.test(error)){
    const reference=error.match(/correlation[_ ]id\)?\s*[:=]\s*([A-Za-z0-9][A-Za-z0-9._:-]{0,119})/i)?.[1]||'';
    const queryTime=error.match(/Horário local da consulta:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2})/i)?.[1]||'';
    const steps=reference
      ?[`Envie este correlation_id para investigarmos com a Hostinger: ${reference}.`,'Não apague arquivos nem tente publicar este destino enquanto a consulta retornar HTTP 500. Os outros destinos prontos podem ser publicados normalmente.']
      :[queryTime?`A resposta não trouxe correlation_id. Envie o erro com este horário da consulta para investigarmos com a Hostinger: ${queryTime}.`:'A resposta não trouxe correlation_id. Envie o texto completo do erro e o horário aproximado da reanálise para investigarmos com a Hostinger.','Não apague arquivos nem tente publicar este destino enquanto a consulta retornar HTTP 500. Os outros destinos prontos podem ser publicados normalmente.'];
    return {title:reference?'Próxima ação: compartilhar a referência do erro':'Próxima ação: compartilhar o erro HTTP 500',text:'A Hostinger falhou ao consultar os arquivos remotos (HTTP 500). O Hub não iniciou o envio para este destino; apagar arquivos não corrige essa falha.',steps,showHpanel:false};
  }
  if(target?.status==='partial'||hasUnconfirmedRemoteOutcome(target))return {title:'Próxima ação: reanalisar antes de tentar novamente',text:'A tentativa não confirmou todos os arquivos. Isso não prova que o destino esteja vazio; não apague arquivos com base neste aviso.',steps:['Clique em Reanalisar páginas pendentes.','A análise verificará o que existe agora e mostrará os conflitos encontrados. Só remova arquivos que o Hub identificar; se a consulta falhar novamente, envie o erro para investigarmos.'],showHpanel:false};
  if(statusCode===401||statusCode===403)return {title:'Próxima ação: revisar o acesso da API Hostinger',text:'A Hostinger recusou a leitura ou o envio com este token.',steps:['Abra Integrações → Hostinger e confira o token e as permissões de acesso aos arquivos.','Depois de corrigir o acesso, volte aqui e clique em Reanalisar páginas pendentes.'],showHpanel:false};
  if(statusCode===429)return {title:'Próxima ação: aguardar e reanalisar',text:'A Hostinger limitou as solicitações por enquanto.',steps:['Aguarde alguns minutos.','Clique em Reanalisar páginas pendentes antes de publicar novamente.'],showHpanel:false};
  if(target?.status==='error')return {title:'Próxima ação: corrigir a pendência indicada',text:'Leia o erro acima: ele indica a etapa que falhou. Nenhum envio novo deve ser iniciado até a análise liberar o destino.',steps:['Corrija o dado ou acesso indicado na mensagem.','Clique em Reanalisar páginas pendentes. Se o erro continuar sem indicar como corrigir, envie o texto ao Codex para investigação.'],showHpanel:false};
  return null;
}
function renderTargetSummary(container,job,hpanelUrlForDomain){
  if(!container)return;
  const targets=Array.isArray(job?.targets)?job.targets:[];
  const generation=Array.isArray(job?.generationSummary)?job.generationSummary:[];
  const rows=(generation.length?generation:targets).map((summary,index)=>{
    const target=targets.find(item=>Number(item.pageNumber)===Number(summary.pageNumber))||null;
    const page=String(summary.pageNumber||target?.pageNumber||index+1).padStart(2,'0');
    const parent=String(target?.parentDomain||target?.hpanelDomain||'').trim().toLowerCase();
    const prefix=String(target?.prefix||'').trim().toLowerCase();
    const generatedDomain=prefix&&parent?prefix+'.'+parent:'';
    const domain=String(target?.domain||'').trim().toLowerCase()||generatedDomain||getHostname(target?.publicUrl||summary.publicUrl)||String(summary.domain||summary.hpanelDomain||target?.hpanelDomain||target?.accountName||'Domínio pendente');
    const conflicts=target?.planSummary?.conflicts||[],conflictError=/destino já contém arquivo\(s\)|prévia encontrou \d+ arquivo\(s\) já existente/i.test(String(target?.error||'')),hasConflicts=conflicts.length>0||conflictError;
    const superseded=isTargetSuperseded(target),manualVerified=isTargetManuallyVerified(target),published=isTargetPublished(target),staleReady=target?.status==='ready'&&targetNeedsAnalysis(job,target),savedStatus=target?.status==='manual-verified'&&!manualVerified?'pending':target?.status,status=superseded?'superseded':manualVerified?'manual-verified':published?'published':hasConflicts?'conflict':staleReady?'preview-stale':savedStatus||summary.status||'pending';
    const labels={ready:'Pronto para publicar','preview-stale':'Prévia expirada · reanalisar','manual-verified':'✓ Funcionando · validado manualmente',published:'Publicado',superseded:'Substituído · histórico mantido',draft:'Ficha atual não gerada',conflict:'Arquivos existentes · limpar no HPanel',blocked:'Prévia bloqueada',partial:'Envio parcial',error:'Revisar pendência',pending:'Aguardando análise','generation-blocked':'Geração bloqueada','generation-error':'Falha na geração'};
    const label=status==='partial'&&hasUnconfirmedRemoteOutcome(target)?'Envio interrompido · destino incerto':labels[status]||'Aguardando análise';
    const state=['published','manual-verified'].includes(status)?'is-ok':['conflict','blocked','partial','error','generation-blocked','generation-error'].includes(status)?'is-warning':status==='ready'?'is-ready':'is-pending';
    const lastExecution=Array.isArray(target?.deploymentHistory)?target.deploymentHistory.at(-1):null;
    const detail=superseded?'A configuração atual desta conta substituiu este destino pendente; as tentativas anteriores continuam no histórico.':manualVerified?`Você confirmou manualmente que este destino está funcionando (${formatDeployTime(target.manualVerification.confirmedAtUtc)}). O Hub considera a validação concluída e libera o fluxo.`:published?lastExecution?.status==='success'?`Publicado em ${formatDeployTime(lastExecution.completedAtUtc)}.`:'Hospedagem publicada anteriormente; mantida fora de novos envios.':hasConflicts?conflicts.length?`${conflicts.length} caminho(s) ocupado(s); envio bloqueado até revisão.`:deploymentErrorForDisplay(target?.error||'Caminho ocupado; envio bloqueado até revisão.',lastExecution):staleReady?'A prévia anterior não está ativa nesta sessão; reanalise antes de publicar.':deploymentErrorForDisplay(target?.error||summary.detail||'',lastExecution).trim();
    const href=publicPresellHref(target?.publicUrl||summary.publicUrl);
    const domainLabel=href?'<a class="copy-ficha-deploy-summary-link" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(domain)+'</a>':'<span class="copy-ficha-deploy-summary-domain">'+esc(domain)+'</span>';
    const hpanelHref=target&&typeof hpanelUrlForDomain==='function'?String(hpanelUrlForDomain(domain,parent)||''):'';
    const hpanelLink=hpanelHref?'<a class="copy-ficha-deploy-summary-hpanel" href="'+esc(hpanelHref)+'" target="_blank" rel="noopener noreferrer" title="Abrir '+esc(parent||domain)+' no HPanel" aria-label="Abrir HPanel do domínio '+esc(parent||domain)+'">Abrir HPanel</a>':'';
    const domainInfo='<div class="copy-ficha-deploy-summary-domain-group">'+domainLabel+hpanelLink+'</div>';
    const targetIndex=targets.indexOf(target),canValidateManually=target&&!job?.draftOnly&&!target.draftOnly&&!superseded&&!published&&!manualVerified&&Boolean(domain&&target.username&&target.directory);
    const manualControl=manualVerified?'<span class="copy-ficha-deploy-summary-manual is-confirmed" role="status"><span aria-hidden="true">✓</span> Funcionando · validado manualmente</span>':canValidateManually?'<button type="button" class="copy-ficha-deploy-summary-manual" data-deploy-action="manual-verify" data-deploy-index="'+targetIndex+'">Validar manualmente</button>':'';
    return '<li class="copy-ficha-deploy-summary-row '+state+'"><span class="copy-ficha-deploy-summary-page">Página '+page+'</span>'+domainInfo+'<span class="copy-ficha-deploy-summary-state">'+label+'</span>'+(detail?'<small class="copy-ficha-deploy-summary-detail">'+esc(detail)+'</small>':'')+manualControl+'</li>';
  }).join('');
  const count=generation.length||targets.length,readyCount=targets.filter(target=>!isTargetResolved(target)&&isPlanPublishable(plans.get(`${job?.id}:${target.id}`))).length,publishedCount=targets.filter(isTargetPublished).length,manualCount=targets.filter(isTargetManuallyVerified).length;
  const subtitle=job?.draftOnly?'Usando o prefixo e as URLs atuais da ficha. Análises de outros endereços ficam nos lotes anteriores; gere estas páginas para analisar os novos destinos.':generation.length?'Contas sem página válida também aparecem com o resultado da geração.':'Uma página separada por domínio.';
  const heading=job?.draftOnly?`${count} destino${count===1?'':'s'} planejado${count===1?'':'s'} · aguardando geração local`:`${count} página${count===1?'':'s'} selecionada${count===1?'':'s'} · ${readyCount} pronta${readyCount===1?'':'s'} para hospedagem · ${publishedCount} publicada${publishedCount===1?'':'s'}${manualCount?` · ${manualCount} validada${manualCount===1?'':'s'} manualmente como funcionando`:''}`;
  container.innerHTML='<div class="copy-ficha-deploy-summary-head"><strong>'+heading+'</strong><span>'+subtitle+'</span></div><ul class="copy-ficha-deploy-summary-list">'+rows+'</ul>';
}
async function request(path,{method='GET',body,fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new Error('O servidor local do Hub não está disponível.');
  let response;
  try{response=await fetchImpl(path,{method,cache:'no-store',credentials:'same-origin',headers:body===undefined?{Accept:'application/json'}:{Accept:'application/json','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})}catch{throw new Error('Não foi possível acessar a API local do Hub. Confira se o painel está aberto pelo iniciar-painel.cmd.')}
  let result;try{result=await response.json()}catch{throw new Error('O servidor local retornou uma resposta ilegível.')}
  if(!response.ok)throw new Error(String(result?.error||`A conexão respondeu com erro HTTP ${response.status}.`));
  return result;
}
function showStatus(host,text,type='info'){
  if(!host)return;host.className=`copy-ficha-deploy-feedback is-${type}`;host.textContent=text;
}

function targetFields(target,index,sites){
  const roots=rootSites(sites),parent=chooseInitialParent(target,sites),hostname=getHostname(target.publicUrl),parentDomain=String(parent?.domain||''),username=String(parent?.username||''),derived=prefixFor(hostname,parentDomain);
  if(!target.parentDomain)target.parentDomain=parentDomain;
  if(!target.username)target.username=username;
  if(!target.prefix)target.prefix=VALID_PREFIX.test(derived)?derived:'';
  target.directory=target.prefix||'';
  if(target._previousPrefix===undefined)target._previousPrefix=target.prefix;
  return {roots,index,hostname,parentDomain:target.parentDomain||parentDomain,username:target.username||username};
}

function renderTarget(target,index,sites,jobId=''){
  const fields=targetFields(target,index,sites),options=fields.roots.map((site,optionIndex)=>`<option value="${optionIndex}" ${String(site.domain).toLowerCase()===String(fields.parentDomain).toLowerCase()&&String(site.username)===String(fields.username)?'selected':''}>${esc(site.domain)} · ${esc(site.username)}</option>`).join('');
  const parentListed=fields.roots.some(site=>String(site.domain).toLowerCase()===String(fields.parentDomain).toLowerCase()&&(!fields.username||String(site.username)===String(fields.username)));
  const parentFallback=fields.parentDomain&&!parentListed?`<option value="" selected disabled>${esc(fields.parentDomain)} · ainda não consta no cache Hostinger</option>`:'';
  const domain=target.prefix&&fields.parentDomain?`${target.prefix}.${fields.parentDomain}`:'';
  const remoteDirectory=`public_html${target.directory?`/${String(target.directory).trim().replace(/^[/]+|[/]+$/g,'')}`:''}`;
  const existing=domain&&matchExisting(sites,domain,fields.username),manualVerified=isTargetManuallyVerified(target);
  const draftOnly=target.draftOnly===true,superseded=isTargetSuperseded(target),readOnly=draftOnly||superseded;
  const plan=target.planSummary;
  const conflicts=plan?.conflicts||[],conflictError=/destino já contém arquivo\(s\)|prévia encontrou \d+ arquivo\(s\) já existente/i.test(String(target.error||'')),hasConflicts=conflicts.length>0||conflictError;
  const published=isTargetPublished(target),staleReady=target.status==='ready'&&targetNeedsAnalysis({id:jobId},target),stalePlan=published||manualVerified||target.status==='partial'||superseded||staleReady;
  const effectiveStatus=target.status==='manual-verified'&&!manualVerified?'pending':target.status;
  const status=superseded?'Substituído · histórico mantido':draftOnly?'Ficha atual não gerada':manualVerified?'✓ Funcionando · validado manualmente':published?'Publicado':effectiveStatus==='partial'&&hasUnconfirmedRemoteOutcome(target)?'Envio interrompido · destino incerto':effectiveStatus==='partial'?'Envio parcial':hasConflicts?'Caminho em conflito · revisar no HPanel':effectiveStatus==='error'?'Revisar pendência':staleReady?'Prévia expirada · reanalisar':effectiveStatus==='ready'?'Pronto para publicar':effectiveStatus==='blocked'?'Prévia bloqueada':manualVerified?'Destino validado manualmente como funcionando':existing?'Subdomínio já existe':'Aguardando análise';
  const statusClass=published||manualVerified?'is-ok':!superseded&&(hasConflicts||staleReady||['partial','error'].includes(effectiveStatus))?'is-warning':'';
  const allPlanFiles=(plan?.files||[]).map(file=>`<li>${esc(file.relativePath)} · ${labelSize(file.sizeBytes)}</li>`).join('');
  const planFiles=(plan?.files||[]).slice(0,8).map(file=>`<li>${esc(file.relativePath)} · ${labelSize(file.sizeBytes)}</li>`).join('');
  const moreFiles=(plan?.files||[]).length>8?`<li>e mais ${(plan.files||[]).length-8} arquivo(s)</li>`:'';
  const conflictList=conflicts.slice(0,6).map(item=>{const labels={file:'Arquivo já existente',directory:'Uma pasta ocupa o caminho esperado para arquivo',symlink:'Um link simbólico ocupa o caminho',other:'Outro tipo de item ocupa o caminho','file-blocks-directory':'Um arquivo ocupa o caminho esperado para pasta','symlink-blocks-directory':'Um link simbólico ocupa o caminho esperado para pasta','other-blocks-directory':'Outro item ocupa o caminho esperado para pasta'};const size=Number.isFinite(Number(item.sizeBytes))?' · '+labelSize(item.sizeBytes):'';return `<li>${esc(labels[String(item.kind||'file').toLowerCase()]||'Caminho ocupado')} — confira no HPanel: ${esc(item.path)}${size}</li>`}).join('');
  const moreConflicts=conflicts.length>6?`<li>e mais ${conflicts.length-6} caminho(s) ocupado(s); veja os demais no HPanel</li>`:'';
  const missingList=(plan?.missingDirectories||[]).slice(0,4).map(path=>`<li>Pasta remota ausente: ${esc(path)}</li>`).join('');
  const stalePlanText=superseded?'Esta configuração foi substituída; o histórico abaixo foi mantido apenas para consulta.':manualVerified?'A confirmação manual registrada liberou este destino. A lista automática anterior continua no histórico para consulta.':effectiveStatus==='partial'?'Esta prévia é apenas referência: ela não confirma quais arquivos chegaram ao destino. Confira os caminhos no HPanel e reanalise antes de publicar novamente.':published?'Este destino já foi publicado com sucesso e está excluído de novos envios.':staleReady?'A prévia pronta anterior não está ativa nesta sessão. Reanalise este destino antes de publicar.':'Este resumo não autoriza um novo envio. Reanalise o domínio para conferir os arquivos atuais.';
  const planList=stalePlan?`<details class="copy-ficha-deploy-plan-files" open><summary>Arquivos da prévia anterior · ${Number(plan?.fileCount)||0}</summary><ul>${allPlanFiles||'<li>Nenhum caminho de arquivo foi preservado nesta prévia.</li>'}</ul></details>`:hasConflicts?`<ul>${conflictList}${moreConflicts}${missingList}</ul>`:planFiles||missingList?`<ul>${planFiles}${moreFiles}${missingList}</ul>`:'';
  const conflictPlanText=`A prévia encontrou ${conflicts.length} caminho(s) ocupado(s) no destino. O Hub bloqueou o envio para evitar substituir arquivos ou gravar sobre pastas e links. Confira o tipo de cada item no HPanel; remova somente um arquivo identificado que você queira substituir e analise novamente.`;
  const planHtml=plan&&!manualVerified?`<div class="copy-ficha-deploy-plan ${stalePlan?'is-stale':hasConflicts?'is-conflict':isPlanPublishable(plan)?'is-ready':'is-blocked'}"><strong>${superseded?'Configuração substituída · referência histórica':stalePlan?'Prévia anterior · referência para conferência':hasConflicts?'Caminho ocupado · publicação bloqueada':plan.ready?'Prévia pronta':'Prévia bloqueada'}</strong><span>${stalePlan?stalePlanText:hasConflicts?conflictPlanText:`${Number(plan.fileCount)||0} arquivos locais · ${labelSize(plan.totalBytes)} · ${esc(domain)}. Prontos para envio; esta prévia não confirma que já estejam hospedados. Arquivos existentes no destino serão preservados.`}</span>${planList}</div>`:'';
  const nextAction=deploymentNextAction(target,{hasConflicts,conflicts});
  const previousPublishNote=!published&&hasPreviousSuccessfulDeployment(target,domain)&&(target.status==='partial'||target.deploymentState==='failed')?'<p class="copy-ficha-note">Este destino tem uma publicação anterior confirmada. A página pode continuar exibindo essa versão ou conteúdo em cache; isso não confirma a tentativa mais recente.</p>':'';
  const publicHref=publicPresellHref(target.publicUrl);
  const recoverySteps=nextAction?.steps.map(step=>`<li>${esc(step)}</li>`).join('')||'';
  const recoveryHtml=manualVerified?'':nextAction?`<section class="copy-ficha-deploy-recovery" aria-label="Próxima ação para esta publicação"><strong>${esc(nextAction.title)}</strong><p>${esc(nextAction.text)}</p><ol>${recoverySteps}</ol><div class="copy-ficha-deploy-recovery-actions">${nextAction.showHpanel?`<a class="copy-ficha-btn copy-ficha-deploy-recovery-hpanel" data-deploy-recovery-hpanel href="#" target="_blank" rel="noopener noreferrer" hidden>Abrir HPanel</a>`:''}${publicHref?`<a class="copy-ficha-btn" href="${esc(publicHref)}" target="_blank" rel="noopener noreferrer">Abrir endereço público</a>`:''}</div></section>`:'';
  const manualVerificationNote=manualVerified?`<section class="copy-ficha-deploy-manual-result" role="status"><strong><span aria-hidden="true">✓</span> Validação manual registrada</strong><p>Você confirmou manualmente que o domínio abre e que a Pre-Sell está funcionando no endereço final. O Hub considera este destino verificado e validado para prosseguir.</p><small>${esc(formatDeployTime(target.manualVerification.confirmedAtUtc))} · ${esc(domain)} · <code>${esc(remoteDirectory)}</code></small></section>`:'';
  const latestExecution=Array.isArray(target.deploymentHistory)?target.deploymentHistory.at(-1):null;
  const latestVerification=latestExecution?.remoteVerification;
  const latestExpectedFiles=snapshotExpectedFiles(latestExecution?.expectedFiles?.length?latestExecution.expectedFiles:target.planSummary?.files);
  const incompleteExecution=['running','partial','error'].includes(String(latestExecution?.status||''));
  const verificationNeedsAction=latestExecution&&latestExpectedFiles.length>0&&(incompleteExecution||latestVerification?.available!==true||latestVerification?.allPathsPresent!==true||latestVerification?.allSizesMatch!==true);
  const inventoryTone=latestExecution?.status==='success'&&latestVerification?.available===true&&latestVerification?.allPathsPresent===true&&latestVerification?.allSizesMatch===true?'is-success':'is-warning';
  const inventoryText=latestVerification?remoteInventorySummaryForAttempt(latestVerification,latestExecution):'A conferência automática do inventário ainda não foi registrada. Use o botão para conferir os caminhos e tamanhos no Hub.';
  const inventoryButton=verificationNeedsAction?'<button type="button" class="copy-ficha-btn" data-deploy-action="verify-inventory" data-deploy-index="'+index+'">'+(latestVerification?'Verificar novamente no Hub':'Verificar inventário no Hub')+'</button>':'';
  const inventoryHtml=!manualVerified&&latestExecution&&(latestVerification||verificationNeedsAction)?'<section class="copy-ficha-deploy-inventory '+inventoryTone+'" aria-live="polite"><strong>Confirmação do destino no Hub</strong><p>'+esc(inventoryText)+'</p>'+renderInventoryDetails(latestVerification)+renderRemoteInventoryQueryDetails(latestVerification)+inventoryButton+'</section>':'';
  const historyHtml=renderDeployHistory(target)+inventoryHtml;
  const disabled=readOnly?'disabled':'';
  return `<article class="copy-ficha-deploy-item" data-deploy-item="${index}"><div class="copy-ficha-deploy-item-heading"><h3>Página ${String(target.pageNumber||index+1).padStart(2,'0')} · ${esc(target.accountName||target.hpanelDomain||'Conta')}</h3><span class="copy-ficha-deploy-state ${statusClass}">${status}</span></div><p class="copy-ficha-note">Pasta local: <code>${esc(target.sourceDirectory||'')}</code></p><label>Endereço público da Pre-Sell<input class="copy-ficha-input" type="url" data-deploy-field="publicUrl" data-deploy-index="${index}" value="${esc(target.publicUrl||'')}" placeholder="https://produto.seu-dominio.com" ${disabled}></label><div class="copy-ficha-deploy-fields"><label>Site principal Hostinger<select class="copy-ficha-select" data-deploy-field="parent" data-deploy-index="${index}" ${fields.roots.length&&!readOnly?'':'disabled'}><option value="">${fields.roots.length?'Selecione um domínio principal':'Nenhum domínio principal no cache Hostinger'}</option>${parentFallback}${options}</select></label><label>Prefixo do subdomínio<input class="copy-ficha-input" data-deploy-field="prefix" data-deploy-index="${index}" value="${esc(target.prefix||'')}" placeholder="ex.: lymph-tonic" ${disabled}></label></div><p class="copy-ficha-deploy-address">Destino: <strong>${esc(domain||'informe o prefixo e o site principal')}</strong>${manualVerified?` · <span class="copy-ficha-deploy-existing">Validado manualmente como funcionando.</span>`:existing?` · <span class="copy-ficha-deploy-existing">Já existe na conta ${esc(fields.username)}; será usado sem recriação.</span>`:''}</p><p class="copy-ficha-note">Pasta Hostinger: <code class="copy-ficha-deploy-storage-path">${esc(remoteDirectory)}</code></p>${manualVerified?'':target.error?`<p class="copy-ficha-warning">${esc(deploymentErrorForDisplay(target.error,latestExecution))}</p>`:''}${previousPublishNote}${planHtml}${recoveryHtml}${manualVerificationNote}${historyHtml}</article>`;
}

export function mountPresellDeployWorkflow({root,storage=globalThis.localStorage,fetchImpl=globalThis.fetch,confirmFn=globalThis.confirm?.bind(globalThis),hpanelUrlForDomain=()=>null,getDraftTargets=()=>null,toast=()=>{}}={}){
  if(!root)return()=>{};
  mountedRoot=root;
  const button=by(root,'#copyPresellDeployOpen');
  if(!button)return()=>{};
  const status=by(root,'#copyPresellDeployStatus');
  let overlay=null,sites=[],configured=false,checkedAtUtc='',busy=false,currentJobId='',activeDraftJob=null,refreshOpenDraft=()=>{};
  const readDraftCandidate=()=>{try{const draft=getDraftTargets?.();return draft?.targets?.length?draft:null}catch{return null}};
  const getActiveDraft=()=>{const draft=readDraftCandidate();return draft&&!matchingDraftJob(readJobs(storage),draft)?draft:null};
  mountedDraftGetter=getActiveDraft;
  const renderAction=()=>renderRequiredAction(root,readJobs(storage),getActiveDraft());
  const findJob=id=>readJobs(storage).find(job=>job.id===id)||null;
  const currentJob=()=>currentJobId===CURRENT_DRAFT_ID?activeDraftJob:findJob(currentJobId);
  const dismiss=()=>{overlay?.remove();overlay=null;currentJobId='';activeDraftJob=null;refreshOpenDraft=()=>{};renderAction();if(root.isConnected)button.focus()};
  const saveTargetField=(target,field,value)=>{
    if(field==='parent'){
      if(value===''){target.parentDomain='';target.username='';target.prefix='';target.directory='';target._previousPrefix='';return}
      const site=sites.filter(isRootSite).filter(isEnabled)[Number(value)];
      target.parentDomain=String(site?.domain||'');target.username=String(site?.username||'');
      const hostname=getHostname(target.publicUrl),prefix=prefixFor(hostname,target.parentDomain);
      const nextPrefix=VALID_PREFIX.test(prefix)?prefix:'';
      target.directory=nextPrefix;
      target.prefix=nextPrefix;target._previousPrefix=nextPrefix;
      return;
    }
    target[field]=value;
    if(field==='prefix'){target.directory=value;target._previousPrefix=value;}
  };
  const persistForm=()=>{
    const job=findJob(currentJobId);if(!job||!overlay)return;
    overlay.querySelectorAll('[data-deploy-field]').forEach(field=>{
      const target=job.targets[Number(field.dataset.deployIndex)];if(!target)return;
      saveTargetField(target,field.dataset.deployField,field.value);
    });
    updateJob(currentJobId,()=>job,storage);
  };
  const updateAddress=(item,target)=>{
    const address=item.querySelector('.copy-ficha-deploy-address strong'),prefix=String(target.prefix||'').trim().toLowerCase(),parent=String(target.parentDomain||'').toLowerCase();
    const domain=prefix&&parent?`${prefix}.${parent}`:'';
    if(address)address.textContent=domain||'informe o prefixo e o site principal';
    const addressLine=item.querySelector('.copy-ficha-deploy-address');
    addressLine?.querySelector('.copy-ficha-deploy-hpanel-link')?.remove();
    let hpanelUrl='';
    if(domain&&typeof hpanelUrlForDomain==='function'){
      hpanelUrl=String(hpanelUrlForDomain(domain,parent)||'');
      if(hpanelUrl){const link=document.createElement('a');link.className='copy-ficha-deploy-hpanel-link';link.href=hpanelUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Abrir HPanel';link.title=`Abrir ${parent||domain} no HPanel`;addressLine?.append(document.createTextNode(' · '),link)}
    }
    const storagePath=item.querySelector('.copy-ficha-deploy-storage-path'),directory=String(target.directory||'').trim().replace(/^\/+|\/+$/g,'');
    if(storagePath)storagePath.textContent=`public_html${directory?`/${directory}`:''}`;
    const recoveryLink=item.querySelector('[data-deploy-recovery-hpanel]');
    if(recoveryLink){recoveryLink.hidden=!hpanelUrl;if(hpanelUrl)recoveryLink.href=hpanelUrl}
  };
  const showModal=(requestedJobId='')=>{
    const jobs=readJobs(storage),draft=readDraftCandidate(),matchedJob=matchingDraftJob(jobs,draft),requested=findJob(requestedJobId);
    if(!pendingJobs(jobs).length&&!jobs.length&&!draft)return;
    if(overlay)overlay.remove();
    overlay=document.createElement('div');overlay.className='copy-ficha-deploy-modal';overlay.setAttribute('role','presentation');
    const dialog=document.createElement('section');dialog.className='copy-ficha-deploy-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','copyPresellDeployTitle');
    const active=requested&&!isJobSuperseded(requested)?requested:(!requestedJobId&&draft&&!matchedJob?{...draft,id:CURRENT_DRAFT_ID,draftOnly:true,targets:draft.targets.map((target,index)=>({...target,id:String(target.id||target.accountId||index+1),status:'draft',deploymentState:'pending',draftOnly:true})),generationSummary:draft.targets.map(target=>({...target,status:'draft',detail:''}))}:matchedJob||selectActiveDeployJob(jobs,requestedJobId));
    if(!active)return;activeDraftJob=active.draftOnly?active:null;currentJobId=active.id;
    dialog.innerHTML=`<header><div><h2 id="copyPresellDeployTitle">Hospedagem e deploy da Pre-Sell</h2><p class="copy-ficha-note">A análise vale para cada endereço e pasta mostrados. Se o prefixo mudar na ficha, gere as páginas novamente e analise os novos destinos.</p></div><button type="button" class="copy-ficha-btn" data-deploy-action="close" aria-label="Fechar">Fechar</button></header><p class="copy-ficha-note" data-deploy-queue-note></p><div data-deploy-feedback class="copy-ficha-deploy-feedback is-info" role="status" aria-live="polite">Carregando conexão Hostinger…</div><div data-deploy-summary class="copy-ficha-deploy-summary" aria-label="Resumo dos domínios deste lote"></div><div data-deploy-items class="copy-ficha-deploy-items"></div><div class="copy-ficha-deploy-toolbar"><span data-deploy-cache-note></span></div><footer class="copy-ficha-actions"><span class="copy-ficha-deploy-spinner" data-deploy-spinner aria-hidden="true" hidden></span><span class="copy-ficha-deploy-complete" data-deploy-analyze-complete role="status" hidden>Todos os destinos publicados</span><button type="button" class="copy-ficha-btn primary" data-deploy-action="analyze">Criar subdomínios faltantes e analisar</button><button type="button" class="copy-ficha-btn copy-ficha-deploy-button is-required" data-deploy-action="publish" hidden>Publicar arquivos</button></footer>`;
    overlay.append(dialog);root.append(overlay);
    const renderItems=()=>{
      const job=currentJob(),host=dialog.querySelector('[data-deploy-items]');
      if(!job){host.innerHTML='<p class="copy-ficha-warning">Este trabalho não está mais disponível.</p>';return}
      const currentPending=pendingJobs(readJobs(storage)),queueNote=dialog.querySelector('[data-deploy-queue-note]'),otherPending=currentPending.filter(item=>item.id!==job.id),remaining=otherPending.length;
      if(isJobSuperseded(job)&&otherPending.length){
        queueNote.textContent=`Este lote foi substituído e permanece no histórico. Há ${remaining} Pre-Sell(s) pendente(s) na fila.`;
        const openPending=document.createElement('button');openPending.type='button';openPending.className='copy-ficha-btn';openPending.dataset.deployAction='open-pending-job';openPending.dataset.deployJobId=otherPending[0].id;openPending.textContent=`Abrir Pre-Sell pendente · ${otherPending[0].product||'Pre-Sell'}`;queueNote.append(document.createTextNode(' '),openPending);
      }else queueNote.textContent=job.draftOnly
        ?`Rascunho atual: ${job.targets.length} subdomínio(s) planejado(s). A ficha atual ainda não foi validada e gerada neste lote; por isso, a análise está bloqueada. O aviso de pasta existente confirma apenas os caminhos locais listados nele e libera um lote separado para enviá-los. ${pendingCountWithDraft(readJobs(storage),job)>job.targets.length?`Há também ${pendingCountWithDraft(readJobs(storage),job)-job.targets.length} destino(s) salvo(s) pendente(s).`:''}`
        :remaining?`Pre-Sell atual: ${job.product||'Pre-Sell'}. Há mais ${remaining} Pre-Sell(s) pendente(s); conclua esta etapa e reabra o botão para continuar.`:`Pre-Sell atual: ${job.product||'Pre-Sell'}.`;
      renderTargetSummary(dialog.querySelector('[data-deploy-summary]'),job,hpanelUrlForDomain);host.innerHTML=job.targets.map((target,index)=>renderTarget(target,index,sites,job.id)).join('');
      job.targets.forEach((target,index)=>{const item=host.querySelector(`[data-deploy-item="${index}"]`);if(item)updateAddress(item,target)});
      const readyTargets=job.targets.filter(target=>!isTargetResolved(target)&&isPlanPublishable(plans.get(`${job.id}:${target.id}`)));
      const readyCount=readyTargets.length;
      const publishButton=dialog.querySelector('[data-deploy-action="publish"]');
      publishButton.hidden=readyCount===0||job.draftOnly;publishButton.classList.remove('is-overwrite');publishButton.textContent=`Publicar ${readyCount} destino${readyCount===1?'':'s'} pronto${readyCount===1?'':'s'}`;
      const cache=dialog.querySelector('[data-deploy-cache-note]');cache.textContent=sites.length?`${sites.length} sites no cache local${checkedAtUtc?` · lista atualizada em ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(checkedAtUtc))}`:''}.`:'A lista local da Hostinger está vazia; atualize os sites na Integração Hostinger.';
      const pendingCount=targetsNeedingAnalysis(job).length,hasActivity=job.targets.some(target=>isTargetResolved(target)||['ready','blocked','partial','error'].includes(target.status));
    const analyzeButton=dialog.querySelector('[data-deploy-action="analyze"]'),completeStatus=dialog.querySelector('[data-deploy-analyze-complete]'),allResolved=pendingCount===0,allPublished=job.targets.length>0&&job.targets.every(isTargetPublished),manualCount=job.targets.filter(isTargetManuallyVerified).length;
      analyzeButton.textContent=job.draftOnly?'Valide e gere a Pre-Sell para liberar análise':hasActivity?pendingCount===1?'Reanalisar página pendente (1)':`Reanalisar páginas pendentes (${pendingCount})`:'Criar subdomínios faltantes e analisar';analyzeButton.hidden=allResolved;analyzeButton.disabled=busy||job.draftOnly;
    if(completeStatus){completeStatus.textContent=allPublished?'Todos os destinos publicados':`${manualCount} destino(s) validado(s) manualmente como funcionando.`;completeStatus.hidden=!allPublished&&!(allResolved&&manualCount>0)}
    };
    refreshOpenDraft=()=>{
      if(currentJobId!==CURRENT_DRAFT_ID)return;
      const draft=readDraftCandidate();if(!draft)return;
      activeDraftJob={...draft,id:CURRENT_DRAFT_ID,draftOnly:true,targets:draft.targets.map((target,index)=>({...target,id:String(target.id||target.accountId||index+1),status:'draft',deploymentState:'pending',draftOnly:true})),generationSummary:draft.targets.map(target=>({...target,status:'draft',detail:''}))};
      renderItems();
    };
    const syncPublishButton=()=>{
      const job=currentJob(),publishButton=dialog.querySelector('[data-deploy-action="publish"]');if(!job||!publishButton)return;
      const readyTargets=job.targets.filter(target=>!isTargetResolved(target)&&isPlanPublishable(plans.get(`${job.id}:${target.id}`)));
      const readyCount=readyTargets.length;
      publishButton.hidden=readyCount===0||job.draftOnly;publishButton.classList.remove('is-overwrite');publishButton.textContent=`Publicar ${readyCount} destino${readyCount===1?'':'s'} pronto${readyCount===1?'':'s'}`;
    };
    const setBusy=(value,text,action='')=>{
      busy=value;dialog.querySelectorAll('button').forEach(control=>{control.disabled=value});
      const spinner=dialog.querySelector('[data-deploy-spinner]'),analyzeButton=dialog.querySelector('[data-deploy-action="analyze"]'),publishButton=dialog.querySelector('[data-deploy-action="publish"]');
      const showSpinner=value&&['analyze','publish'].includes(action);
      if(spinner)spinner.hidden=!showSpinner;
      if(analyzeButton)analyzeButton.setAttribute('aria-busy',String(Boolean(value&&action==='analyze')));
      if(publishButton)publishButton.setAttribute('aria-busy',String(Boolean(value&&action==='publish')));
      if(text)showStatus(dialog.querySelector('[data-deploy-feedback]'),text,'info');
    };
    const refreshJob=()=>{renderItems();renderAction()};
    const loadConnection=async()=>{
      try{
        const [connection,cache]=await Promise.all([request('/api/hostinger/status',{fetchImpl}),request('/api/hostinger/sites-cache',{fetchImpl})]);
        configured=connection.configured===true;sites=Array.isArray(cache.sites)?cache.sites:[];checkedAtUtc=String(cache.checkedAtUtc||'');
        showStatus(dialog.querySelector('[data-deploy-feedback]'),configured?'Conexão Hostinger salva neste computador. Sites do cache carregados; os destinos serão conferidos durante a análise.':'Conecte a API Hostinger na tela Integrações → Hostinger para continuar.',configured?'info':'error');
      }catch(error){showStatus(dialog.querySelector('[data-deploy-feedback]'),error.message,'error')}
      renderItems();
    };
    const validateTargets=job=>{
      const domains=new Set();
      for(const target of job.targets){
        const domain=String(target.parentDomain||'').trim().toLowerCase(),prefix=String(target.prefix||'').trim().toLowerCase(),directory=String(target.directory||'').trim();
        if(!domain||!rootSites(sites).some(site=>String(site.domain).toLowerCase()===domain&&String(site.username)===String(target.username)))throw new Error(`Selecione um site principal válido para ${target.accountName||target.hpanelDomain}.`);
        if(!VALID_PREFIX.test(prefix))throw new Error(`Informe um prefixo válido para a página ${String(target.pageNumber).padStart(2,'0')}.`);
        if(!directory||/[\\:?*"<>|#%\x00-\x1f]/.test(directory)||/(^|\/)\.\.?($|\/)/.test(directory))throw new Error(`Informe um diretório raiz relativo válido para ${target.accountName||target.hpanelDomain}.`);
        const address=`${prefix}.${domain}`;
        let publicUrl;try{publicUrl=new URL(String(target.publicUrl||''))}catch{throw new Error(`Informe uma URL pública HTTPS válida para ${target.accountName||target.hpanelDomain}.`)}
        if(publicUrl.protocol!=='https:'||publicUrl.hostname.toLowerCase()!==address)throw new Error(`A URL pública de ${target.accountName||target.hpanelDomain} precisa usar https://${address}.`);
        if(domains.has(`${address}|${target.username}`))throw new Error(`O subdomínio ${address} aparece mais de uma vez neste lote.`);
        domains.add(`${address}|${target.username}`);
      }
    };
    const analyze=async()=>{
      const job=findJob(currentJobId);if(!job||busy)return;
      if(!configured){showStatus(dialog.querySelector('[data-deploy-feedback]'),'Conecte a API Hostinger antes de criar subdomínios ou analisar arquivos.','error');return}
      persistForm();
      try{validateTargets(findJob(currentJobId))}catch(error){showStatus(dialog.querySelector('[data-deploy-feedback]'),error.message,'error');return}
      const latest=findJob(currentJobId),pendingTargets=targetsNeedingAnalysis(latest);
      if(!pendingTargets.length){const readyCount=latest.targets.filter(target=>!isTargetResolved(target)&&isPlanPublishable(plans.get(`${latest.id}:${target.id}`))).length,manualCount=latest.targets.filter(isTargetManuallyVerified).length;showStatus(dialog.querySelector('[data-deploy-feedback]'),readyCount?`Não há páginas pendentes de análise. ${readyCount} destino(s) já estão prontos para publicar.`:manualCount?`${manualCount} destino(s) foram validados manualmente como funcionando no HPanel. Não há outras ações pendentes neste lote.`:'Todos os destinos deste lote já foram publicados com sucesso. Não há novos envios pendentes.','success');renderItems();return}
      const missing=pendingTargets.filter(target=>{
        const domain=`${String(target.prefix).trim().toLowerCase()}.${String(target.parentDomain).trim().toLowerCase()}`;
        return !matchExisting(sites,domain,target.username);
      });
      if(missing.length){
        const detail=missing.map(target=>`• ${String(target.prefix).toLowerCase()}.${String(target.parentDomain).toLowerCase()} → ${target.directory}`).join('\n');
        if(typeof confirmFn!=='function'||!confirmFn(`Criar ${missing.length} subdomínio(s) na Hostinger?\n\n${detail}\n\nA criação altera a conta Hostinger; o DNS pode levar algum tempo para propagar. Depois da criação, o Hub fará apenas a prévia dos arquivos. Continuar?`))return;
      }
      setBusy(true,'Criando os subdomínios necessários e analisando os arquivos…','analyze');
      const outcomes=[];
      const confirmedExistingDomains=[];
      for(const target of pendingTargets){
        if(['partial','error'].includes(String(target.status||'')))target.deploymentState='failed';
        if(isTargetResolved(target))continue;
        const domain=`${String(target.prefix).trim().toLowerCase()}.${String(target.parentDomain).trim().toLowerCase()}`;
        try{
          if(!matchExisting(sites,domain,target.username)){
            const result=await request('/api/hostinger/subdomains',{method:'POST',body:{parentDomain:target.parentDomain,username:target.username,prefix:target.prefix,directory:target.directory,confirmed:true},fetchImpl});
            sites=Array.isArray(result.sites)?result.sites:sites;
            if(result.confirmedExisting===true)confirmedExistingDomains.push(domain);
            else checkedAtUtc=String(result.checkedAtUtc||checkedAtUtc);
          }
          const plan=await request('/api/hostinger/publish/preflight',{method:'POST',body:{domain,storageDomain:target.parentDomain,username:target.username,sourceDirectory:target.sourceDirectory,targetDirectory:target.directory},fetchImpl});
          plans.set(`${latest.id}:${target.id}`,plan);
          const conflicts=Array.isArray(plan.conflicts)?plan.conflicts:[];
          target.domain=domain;target.status=isPlanPublishable(plan)?'ready':'blocked';target.error=conflicts.length?`A prévia encontrou ${conflicts.length} arquivo(s) já existente(s) no destino. O Hub bloqueou o envio; remova manualmente somente esses arquivos no HPanel e reanalise.`:'';
          target.planSummary={ready:plan.ready,canOverwrite:plan.canOverwrite,fileCount:plan.fileCount,totalBytes:plan.totalBytes,files:plan.files||[],conflicts:plan.conflicts||[],missingDirectories:plan.missingDirectories||[],linkedDirectories:plan.linkedDirectories||[]};
          outcomes.push(`${domain}: ${conflicts.length?`${conflicts.length} arquivo(s) existente(s), envio bloqueado`:plan.ready?`${plan.fileCount} arquivos prontos`:'prévia bloqueada'}`);
        }catch(error){target.status='error';target.error=error.message;target.planSummary=null;plans.delete(`${latest.id}:${target.id}`);outcomes.push(`${domain}: ${error.message}`)}
        updateJob(latest.id,job=>({...job,targets:latest.targets,status:isJobComplete({targets:latest.targets})?'complete':'pending'}),storage);
      }
      const ready=latest.targets.filter(target=>!isTargetResolved(target)&&isPlanPublishable(plans.get(`${latest.id}:${target.id}`))).length;
      const conflictCount=latest.targets.reduce((sum,target)=>sum+(target.planSummary?.conflicts?.length||0),0);
      const errorCount=latest.targets.filter(target=>!isTargetResolved(target)&&target.status==='error').length;
      const limitFailures=latest.targets.filter(target=>target.status==='error'&&isSubdomainLimitError(target.error));
      const limitDomains=[...new Set(limitFailures.map(target=>target.domain||target.prefix+'.'+target.parentDomain).filter(Boolean))];
      const analysisMessage=ready?`Análise concluída: ${ready} destino(s) pronto(s) para publicar. Os arquivos ainda não foram enviados; clique em Publicar para concluir a hospedagem.`:conflictCount?`Nenhum destino com conflito foi enviado. A prévia encontrou ${conflictCount} arquivo(s) já existentes; remova-os manualmente no HPanel e reanalise.`:errorCount?`A análise bloqueou ${errorCount} destino(s). Nenhum arquivo foi enviado. Abra os avisos de cada destino para ver o motivo retornado pela Hostinger, corrija o dado indicado e tente novamente.`:'A análise não liberou nenhum destino pendente. Abra os avisos de cada destino para ver o motivo e a ação necessária.';
      const reusedNotice=confirmedExistingDomains.length?`A Hostinger confirmou subdomínio(s) já existente(s) e o Hub reutilizou sem nova criação: ${[...new Set(confirmedExistingDomains)].join(', ')}. Isso confirma o endereço, não a publicação dos arquivos. `:'';
      showStatus(dialog.querySelector('[data-deploy-feedback]'),reusedNotice+analysisMessage,ready?'info':'error');
      if(limitFailures.length)showStatus(dialog.querySelector('[data-deploy-feedback]'),'A Hostinger informou que o limite de subdomínios foi atingido em '+limitDomains.join(', ')+'. A análise não enviou arquivos. Confira os subdomínios, diretórios e vínculos na tela Integrações → Hostinger antes de decidir se deseja excluir algum item.','error');
      setBusy(false);renderItems();
    };
    const publish=async()=>{
      const job=findJob(currentJobId);if(!job||busy)return;
      const eligible=job.targets.filter(target=>!isTargetResolved(target)&&isPlanPublishable(plans.get(`${job.id}:${target.id}`)));
      if(!eligible.length){showStatus(dialog.querySelector('[data-deploy-feedback]'),'Analise novamente para gerar uma prévia pronta antes de publicar.','error');return}
      const total=eligible.reduce((sum,target)=>sum+(Number(plans.get(`${job.id}:${target.id}`).fileCount)||0),0);
      const detail=eligible.map(target=>{const plan=plans.get(`${job.id}:${target.id}`);return `• ${target.domain} · ${plan.fileCount} arquivo(s) · nenhum conflito encontrado`}).join('\n');
      const confirmation=`Enviar ${total} arquivo(s) para ${eligible.length} subdomínio(s)?`;
      const safeguard='O Hub não apaga nem substitui arquivos existentes. Se uma prévia encontrar conflito, o envio daquele destino será bloqueado para limpeza manual no HPanel.';
      if(typeof confirmFn!=='function'||!confirmFn(`${confirmation}\n\n${detail}\n\n${safeguard} Se houver interrupção, parte dos arquivos poderá ter sido enviada. Continuar?`))return;
      setBusy(true,'Enviando os arquivos para os destinos confirmados…','publish');
      const outcomes=[];
      for(const target of eligible){
        const key=`${job.id}:${target.id}`,plan=plans.get(key);
        const attemptId=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,startedAtUtc=new Date().toISOString(),totalCount=Number(plan.fileCount)||0;
        const expectedFiles=snapshotExpectedFiles(plan.files);
        recordDeployExecution(target,{id:attemptId,status:'running',startedAtUtc,domain:target.domain,parentDomain:target.parentDomain,storageDomain:target.parentDomain,username:target.username,directory:target.directory,targetDirectory:target.directory,expectedFiles,uploadedCount:0,totalCount});
        updateJob(job.id,current=>{current.targets=job.targets;current.status='pending';return current},storage);
        try{
          const result=await request('/api/hostinger/publish',{method:'POST',body:{domain:target.domain,storageDomain:target.parentDomain,username:target.username,sourceDirectory:target.sourceDirectory,targetDirectory:target.directory,fingerprint:plan.fingerprint,overwriteExisting:false,confirmed:true},fetchImpl});
          if(result.complete){
            const uploadedCount=Number(result.uploadedCount)||Number(result.totalCount)||totalCount,confirmedTotal=Number(result.totalCount)||totalCount,overwrittenCount=Number(result.overwrittenCount)||0;
            recordDeployExecution(target,{id:attemptId,status:'success',startedAtUtc,completedAtUtc:new Date().toISOString(),domain:target.domain,parentDomain:target.parentDomain,directory:target.directory,uploadedCount,totalCount:confirmedTotal,overwrittenCount});
            target.status='published';target.hasPublished=true;target.error='';outcomes.push(`${target.domain}: publicado${overwrittenCount>0?` · ${overwrittenCount} substituído(s)`:''}`);plans.delete(key)
          }
          else{
            const uploadedCount=Number(result.uploadedCount)||0,totalCount=Number(result.totalCount)||0;
            const failedFile=(Array.isArray(result.results)?result.results:[]).find(item=>item?.uploaded!==true);
            const failedPath=String(failedFile?.path||'').trim(),failure=String(failedFile?.error||result.error||'').trim();
            const remoteState=/falha de comunicação|resposta de rede indisponível|sem resposta HTTP/i.test(failure)?'unknown':'not-confirmed';
            recordDeployExecution(target,{id:attemptId,status:'partial',startedAtUtc,completedAtUtc:new Date().toISOString(),domain:target.domain,parentDomain:target.parentDomain,directory:target.directory,uploadedCount,totalCount:totalCount||Number(plan.fileCount)||0,failedPath,error:failure,remoteState});
            target.status='partial';
            target.error=[`Envio interrompido: ${uploadedCount} de ${totalCount} arquivos confirmados.`,failedPath?`Falha no arquivo ${failedPath}.`:'',failure?`Motivo: ${failure}`:'',remoteState==='unknown'?'A Hostinger não respondeu; não é possível confirmar se o primeiro arquivo chegou ao destino.':'A Hostinger não confirmou todos os arquivos desta tentativa.','Reanalise o destino antes de repetir.'].filter(Boolean).join(' ');
          outcomes.push(`${target.domain}: ${uploadedCount}/${totalCount} confirmados${failedPath?` · ${failedPath}`:''}${remoteState==='unknown'?hasPreviousSuccessfulDeployment(target,target.domain)?' · a página pode exibir a publicação anterior; o arquivo desta tentativa é incerto':' · a resposta não chegou; o estado remoto deste arquivo é incerto':''}`);
            plans.delete(key);
          }
        }catch(error){recordDeployExecution(target,{id:attemptId,status:'error',startedAtUtc,completedAtUtc:new Date().toISOString(),domain:target.domain,parentDomain:target.parentDomain,directory:target.directory,uploadedCount:0,totalCount,error:error.message});target.status='error';target.error=error.message;target.planSummary=null;outcomes.push(`${target.domain}: ${error.message}`);plans.delete(key)}
        const attemptRecord=Array.isArray(target.deploymentHistory)?target.deploymentHistory.find(item=>item?.id===attemptId):null;
        if(attemptRecord&&['success','partial','error'].includes(String(attemptRecord.status||''))){
          const remoteVerification=await queryHostingerInventory(attemptRecord,target,fetchImpl);
          recordDeployExecution(target,{id:attemptId,remoteVerification});
        }
        updateJob(job.id,current=>{current.targets=job.targets;current.status=isJobComplete(current)?'complete':'pending';return current},storage);
      }
      const current=findJob(job.id),complete=current&&isJobComplete(current);
      showStatus(dialog.querySelector('[data-deploy-feedback]'),complete?'Hospedagem e publicação concluídas para todas as páginas.':`Etapa parcialmente concluída. ${outcomes.join(' · ')}. Corrija as pendências e analise novamente antes de repetir.` ,complete?'success':'error');
      setBusy(false);renderItems();renderAction();
    };
    const verifyInventory=async index=>{
      if(busy)return;
      const job=findJob(currentJobId),target=job?.targets[Number(index)],attempt=Array.isArray(target?.deploymentHistory)?target.deploymentHistory.at(-1):null;
      if(!job||!target||!attempt)return;
      const scrollTop=dialog.scrollTop;
      setBusy(true,'Consultando os caminhos e tamanhos atuais no inventário Hostinger…','verify-inventory');
      try{
        const verification=await queryHostingerInventory(attempt,target,fetchImpl);
        recordDeployExecution(target,{id:attempt.id,remoteVerification:verification});
        updateJob(job.id,current=>{current.targets=job.targets;return current},storage);
        showStatus(dialog.querySelector('[data-deploy-feedback]'),remoteInventorySummaryForAttempt(verification,attempt),verification.available===true?'info':'error');
      }finally{setBusy(false);renderItems();dialog.scrollTop=scrollTop;}
    };
    const validateManually=index=>{
      if(busy)return;
      const job=findJob(currentJobId),target=job?.targets[Number(index)];
      if(!job||!target)return;
      if(!confirmManualDeployVerification(job.id,target.id,{storage})){showStatus(dialog.querySelector('[data-deploy-feedback]'),'Não foi possível registrar a validação manual. Confira o domínio, a pasta e a conta deste destino.','error');return}
      plans.delete(`${job.id}:${target.id}`);
      showStatus(dialog.querySelector('[data-deploy-feedback]'),`Validação manual registrada para ${manualTargetDomain(target)}. O Hub considera este destino verificado e funcionando e libera o fluxo.`, 'success');
      renderItems();renderAction();
    };
    dialog.addEventListener('input',event=>{
      const field=event.target.closest?.('[data-deploy-field]');if(!field)return;
      const job=findJob(currentJobId),target=job?.targets[Number(field.dataset.deployIndex)];if(!target)return;
      saveTargetField(target,field.dataset.deployField,field.value);
      if(field.dataset.deployField==='publicUrl'){
        const derived=prefixFor(getHostname(field.value),target.parentDomain);
        if(VALID_PREFIX.test(derived)){target.prefix=derived;target.directory=derived;target._previousPrefix=derived;const prefixInput=dialog.querySelector(`[data-deploy-field="prefix"][data-deploy-index="${field.dataset.deployIndex}"]`);if(prefixInput)prefixInput.value=derived;}
      }
      delete target.manualVerification;target.status='pending';target.deploymentState='pending';target.hasPublished=false;target.error='';target.planSummary=null;target.domain='';job.status='pending';plans.delete(`${currentJobId}:${target.id}`);
      updateJob(currentJobId,()=>job,storage);updateAddress(field.closest('.copy-ficha-deploy-item'),target);
      renderTargetSummary(dialog.querySelector('[data-deploy-summary]'),job,hpanelUrlForDomain);syncPublishButton();
    });
    dialog.addEventListener('change',event=>{
      const field=event.target.closest?.('[data-deploy-field]');
      if(field){const job=findJob(currentJobId),target=job?.targets[Number(field.dataset.deployIndex)];if(!target)return;saveTargetField(target,field.dataset.deployField,field.value);delete target.manualVerification;target.status='pending';target.deploymentState='pending';target.hasPublished=false;target.error='';target.planSummary=null;target.domain='';job.status='pending';plans.delete(`${currentJobId}:${target.id}`);updateJob(currentJobId,()=>job,storage);renderItems();return}
    });
    dialog.addEventListener('click',event=>{
      const control=event.target.closest?.('[data-deploy-action]'),action=control?.dataset.deployAction;
      if(action==='close')return dismiss();
      if(action==='open-pending-job'){const jobId=String(control.dataset.deployJobId||'');if(jobId)showModal(jobId);return}
      if(action==='analyze')return analyze();
      if(action==='publish')return publish();
      if(action==='verify-inventory')return verifyInventory(control.dataset.deployIndex);
      if(action==='manual-verify')return validateManually(control.dataset.deployIndex);
    });
    overlay.addEventListener('click',event=>{if(event.target===overlay)dismiss()});
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'&&!busy)dismiss()});
    renderItems();loadConnection();dialog.querySelector('[data-deploy-action="close"]')?.focus();
  };
  const onOpen=()=>showModal();
  button.addEventListener('click',onOpen);
  activeDeployModalOpener=showModal;
  const onJobsUpdated=()=>renderAction();
  const onDraftChanged=()=>queueMicrotask(()=>{renderAction();refreshOpenDraft()});
  root.addEventListener('input',onDraftChanged);root.addEventListener('change',onDraftChanged);
  root.addEventListener('hub:presell-deploy-draft-updated',onDraftChanged);
  globalThis.addEventListener?.(JOBS_EVENT,onJobsUpdated);
  renderAction();
  return()=>{button.removeEventListener('click',onOpen);root.removeEventListener('input',onDraftChanged);root.removeEventListener('change',onDraftChanged);root.removeEventListener('hub:presell-deploy-draft-updated',onDraftChanged);globalThis.removeEventListener?.(JOBS_EVENT,onJobsUpdated);if(mountedRoot===root){mountedRoot=null;mountedDraftGetter=()=>null}if(activeDeployModalOpener===showModal)activeDeployModalOpener=null;overlay?.remove()};
}
