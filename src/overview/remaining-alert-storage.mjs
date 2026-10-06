import {openDatabase} from '../storage/hub-database.mjs';

// Appearance settings do not touch MCC timestamps, Event Log, catalog or billing.
// Read inside the write transaction to preserve concurrent operational updates.
function validate(minimum,yellowMinimum){
  if(typeof minimum!=='number'||!Number.isFinite(minimum)||minimum<0)throw new Error('Informe um mínimo vermelho válido.');
  if(yellowMinimum!==null&&(typeof yellowMinimum!=='number'||!Number.isFinite(yellowMinimum)||yellowMinimum<0))throw new Error('Informe um mínimo amarelo válido ou deixe em branco.');
}
function settings(base){return{minimum:base.valor_restante_alerta_minimo,yellowMinimum:base.valor_restante_alerta_amarelo_minimo??null}}
export async function saveRemainingAlerts({minimum,yellowMinimum},{openDb=openDatabase}={}){
  validate(minimum,yellowMinimum);
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('bases','readwrite'),store=tx.objectStore('bases'),request=store.get('atual');let result;
    request.onsuccess=()=>{
      const base=request.result;
      if(base?.schema!=='base_campanhas_v1'){reject(new Error('A base não está carregada; nenhuma configuração foi alterada.'));tx.abort();return}
      const updated={...base,valor_restante_alerta_minimo:Math.round(minimum*100)/100,valor_restante_alerta_amarelo_minimo:yellowMinimum===null?null:Math.round(yellowMinimum*100)/100};
      result=settings(updated);store.put(updated,'atual');
    };
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(tx.error||new Error('Não foi possível salvar os alertas.'));
    tx.onabort=()=>reject(tx.error||new Error('O salvamento dos alertas foi cancelado.'));
  })}finally{db.close()}
}
export async function loadRemainingAlerts({openDb=openDatabase}={}){
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('bases','readonly'),request=tx.objectStore('bases').get('atual');let result=null;
    request.onsuccess=()=>{if(request.result?.schema==='base_campanhas_v1')result=settings(request.result)};
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Não foi possível ler os alertas.'));
  })}finally{db.close()}
}
