import {
  normalizeTrackingDomainInput,
  normalizeTrackingPlatform,
  normalizeTrackingProductKey,
  normalizeTrackingProductLabel,
} from '../tracking/tracking-domain-admin.mjs?v=11';
import {fetchTrackingDomains,addTrackingDomain} from '../tracking/tracking-service.mjs?v=19';
import {readTrackingDomainAdminToken} from '../tracking/tracking-token-storage.mjs?v=1';
import {buildTrackingProductLabel,normalizeTrackingAccountId} from './copy-ficha-tracking-domain.mjs?v=1';

function normalizeTarget(tracking){
  const hostname=normalizeTrackingDomainInput(tracking.hostname);
  const platform=normalizeTrackingPlatform(tracking.platform);
  if(!['clickbank','gurumedia'].includes(platform))throw new Error('Selecione ClickBank ou GuruMedia para esta Track.');
  const accountId=normalizeTrackingAccountId(tracking.accountId);
  const productName=normalizeTrackingProductLabel(tracking.productName).trim();
  const productLabel=buildTrackingProductLabel(productName,accountId);
  const productKey=normalizeTrackingProductKey(productLabel);
  return {hostname,platform,productKey,productLabel,productName,accountId};
}

function configuredToken(readToken){
  const tokenState=readToken();
  if(!tokenState.token){
    throw new Error(tokenState.invalid
      ?'O token administrativo de domínios salvo está inválido. Corrija-o em Integrações → Tracker Global.'
      :'Configure o token administrativo de domínios em Integrações → Tracker Global antes de criar a Pre-Sell com tracking.');
  }
  return tokenState.token;
}

export async function preparePresellTrackingBatch(trackings,{
  readToken=readTrackingDomainAdminToken,
  fetchDomains=fetchTrackingDomains,
  addDomain=addTrackingDomain,
}={}){
  const targets=(Array.isArray(trackings)?trackings:[]).filter(tracking=>tracking?.enabled).map(normalizeTarget);
  if(!targets.length)return {targets:[],commit:async()=>[]};
  const hostnames=new Set();
  for(const target of targets){
    if(hostnames.has(target.hostname))throw new Error(`O domínio ${target.hostname} foi informado para mais de uma conta. Cada página/Track do lote precisa de um domínio público exclusivo.`);
    hostnames.add(target.hostname);
  }
  const token=configuredToken(readToken);
  const domains=await fetchDomains(token);
  const plans=targets.map(target=>{
    const existing=domains.find(domain=>domain.hostname===target.hostname);
    if(existing&&(existing.productKey!==target.productKey||existing.platform!==target.platform)){
      throw new Error(`O domínio ${target.hostname} já está vinculado à Track “${existing.productLabel||existing.productKey}” (${existing.platform}). Para evitar substituir essa configuração, escolha outro domínio ou ajuste a Track em Tracker Global.`);
    }
    return {...target,action:existing?'reuse':'register'};
  });
  return {
    targets:plans,
    commit:async()=>{
      const committed=[];
      try{
        for(const plan of plans){
          if(plan.action==='reuse'){
            committed.push({...plan,outcome:'reused'});
            continue;
          }
          const saved=await addDomain(token,plan.hostname,{productKey:plan.productKey,productLabel:plan.productLabel,platform:plan.platform});
          const confirmedHosts=[...saved.added,...saved.updated,...saved.alreadyAllowed];
          if(saved.productKey!==plan.productKey||saved.platform!==plan.platform||!confirmedHosts.includes(plan.hostname)){
            throw new Error(`O servidor não confirmou a Track esperada para ${plan.hostname}.`);
          }
          committed.push({...plan,outcome:'registered'});
        }
      }catch(error){
        error.committedRegistrations=committed;
        throw error;
      }
      return committed;
    },
  };
}

export async function preparePresellTracking(tracking,options={}){
  if(!tracking?.enabled)return null;
  const batch=await preparePresellTrackingBatch([tracking],options);
  const plan=batch.targets[0];
  return {
    ...plan,
    commit:async()=> (await batch.commit())[0],
  };
}
