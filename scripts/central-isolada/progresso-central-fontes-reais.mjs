// Consulta de laboratório sobre as mesmas chaves usadas pela tela real.
// Não inicia servidor nem altera armazenamento.
import {deliveryProgress} from '../../src/campaign-delivery/progress-domain.mjs';
import {loadGoogleAdsCampaignBatches} from '../../src/google-ads/google-ads-campaign-batches-storage.mjs';
import {loadGoogleAdsCampaignDrafts} from '../../src/google-ads/google-ads-campaign-drafts-storage.mjs';
import {readCpaExpansion,cpaExpansionBlocksSharedSteps} from '../../src/google-ads/google-ads-cpa-expansion-store.mjs';

export function createRealProgressQuery(db){
 return async function query(id){
  if(typeof id!=='string'||!id.trim())throw Error('Entrega inválida');
  db.exec('BEGIN');
  try{
   const state=db.prepare('SELECT version,value FROM state WHERE id=1').get();
   if(!state||!Number.isSafeInteger(state.version))throw Error('Revisão indisponível');
   if(db.prepare('SELECT status FROM source_info WHERE source=?').get('localStorage')?.status!=='presente')throw Error('Fonte local indisponível');
   const records=JSON.parse(state.value);if(!Array.isArray(records))throw Error('Entregas inválidas');
   const matches=records.filter(item=>item?.id===id);if(matches.length!==1)throw Error('Entrega indisponível ou duplicada');
   const statement=db.prepare('SELECT value FROM local_storage WHERE key=?');
   const storage={getItem(key){return statement.get(key)?.value??null}};
   const jobs=JSON.parse(storage.getItem('hub:presell-deploy-jobs:v1')||'[]');if(!Array.isArray(jobs))throw Error('Trabalhos inválidos');
   const batches=loadGoogleAdsCampaignBatches({storage}).batches,drafts=loadGoogleAdsCampaignDrafts({storage}).drafts;
   const args={delivery:matches[0],jobs,batches,drafts};let progress=deliveryProgress(args),expansionBlocked=false;
   if(progress.batch){try{expansionBlocked=cpaExpansionBlocksSharedSteps(readCpaExpansion(progress.batch.id,storage))}catch{expansionBlocked=true}}
   progress=deliveryProgress({...args,expansionBlocked});
   db.exec('COMMIT');return {revision:state.version,progress:{...progress,expansionBlocked}};
  }catch(error){db.exec('ROLLBACK');throw error}
 };
}
