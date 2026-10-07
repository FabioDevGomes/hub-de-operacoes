import {openDatabase} from '../storage/hub-database.mjs';

export const defaultTestLimitSettings=Object.freeze({cpaMinimumPercent:90,commissionPercent:50,roiBySales:Object.freeze({1:10,2:20,3:30,4:30})});

function settings(value={}){
  const stored=value?.regras_limite_teste&&typeof value.regras_limite_teste==='object'?value.regras_limite_teste:{},roi=stored.roiBySales&&typeof stored.roiBySales==='object'?stored.roiBySales:{};
  const cpa=stored.cpaMinimumPercent,commission=stored.commissionPercent,roiBySales={};
  for(let sales=1;sales<=4;sales++){const minimum=roi[sales];roiBySales[sales]=typeof minimum==='number'&&Number.isFinite(minimum)&&minimum>-100?minimum:defaultTestLimitSettings.roiBySales[sales]}
  return{cpaMinimumPercent:typeof cpa==='number'&&Number.isFinite(cpa)&&cpa>0?cpa:defaultTestLimitSettings.cpaMinimumPercent,commissionPercent:typeof commission==='number'&&Number.isFinite(commission)&&commission>0?commission:defaultTestLimitSettings.commissionPercent,roiBySales};
}
function validate(value){
  if(!value||typeof value!=='object')throw new Error('Informe as regras de limite de teste.');
  if(typeof value.cpaMinimumPercent!=='number'||!Number.isFinite(value.cpaMinimumPercent)||value.cpaMinimumPercent<=0)throw new Error('O CPA mínimo deve ser um número maior que zero.');
  if(typeof value.commissionPercent!=='number'||!Number.isFinite(value.commissionPercent)||value.commissionPercent<=0)throw new Error('O percentual da comissão deve ser um número maior que zero.');
  for(let sales=1;sales<=4;sales++){const minimum=value.roiBySales?.[sales];if(typeof minimum!=='number'||!Number.isFinite(minimum)||minimum<=-100)throw new Error(`O ROI mínimo para ${sales===4?'4 ou mais vendas':`${sales} venda(s)`} deve ser maior que −100%.`)}
}
export async function saveTestLimitSettings(value,{openDb=openDatabase}={}){
  validate(value);
  const cpaMinimumPercent=Number(value.cpaMinimumPercent.toFixed(2)),commissionPercent=Number(value.commissionPercent.toFixed(2)),roiBySales=Object.fromEntries([1,2,3,4].map(sales=>[sales,Number(value.roiBySales[sales].toFixed(2))])),result={cpaMinimumPercent,commissionPercent,roiBySales};
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('bases','readwrite'),store=tx.objectStore('bases'),request=store.get('atual');let saved;
    request.onsuccess=()=>{
      const base=request.result;
      if(base?.schema!=='base_campanhas_v1'){reject(new Error('A base não está carregada; nenhuma regra foi alterada.'));tx.abort();return}
      saved={...base,regras_limite_teste:result};store.put(saved,'atual');
    };
    tx.oncomplete=()=>resolve(settings(saved));tx.onerror=()=>reject(tx.error||new Error('Não foi possível salvar as regras de limite de teste.'));tx.onabort=()=>reject(tx.error||new Error('O salvamento das regras de limite de teste foi cancelado.'));
  })}finally{db.close()}
}
export async function loadTestLimitSettings({openDb=openDatabase}={}){
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('bases','readonly'),request=tx.objectStore('bases').get('atual');let result=null;
    request.onsuccess=()=>{if(request.result?.schema==='base_campanhas_v1')result=settings(request.result)};
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Não foi possível ler as regras de limite de teste.'));
  })}finally{db.close()}
}
