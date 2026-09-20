(function(){
  const SCHEMA='catalogo_produtos_v1';
  const clone=value=>structuredClone(value);
  function create(){return{schema:SCHEMA,atualizado_em:new Date().toISOString(),aliases:{},ocultos:[],datas_inicio:{}}}
  function normalize(input){const value=input?.schema===SCHEMA?clone(input):create();value.aliases??={};value.datas_inicio??={};value.ocultos=[...new Set((value.ocultos||[]).map(key=>String(key).toLocaleLowerCase('pt-BR')))];return value}
  function rename(input,key,label){const value=normalize(input),clean=String(label||'').trim();if(!clean)throw new Error('O nome do produto não pode ficar vazio.');value.aliases[String(key)]=clean;value.atualizado_em=new Date().toISOString();return value}
  function hide(input,key){const value=normalize(input),id=String(key);if(!value.ocultos.includes(id))value.ocultos.push(id);value.atualizado_em=new Date().toISOString();return value}
  function setStartDate(input,key,date){const value=normalize(input),clean=String(date||'').trim();if(clean&&!/^\d{4}-\d{2}-\d{2}$/.test(clean))throw new Error('A data deve estar no formato ISO.');if(clean)value.datas_inicio[String(key)]=clean;else delete value.datas_inicio[String(key)];value.atualizado_em=new Date().toISOString();return value}
  function restoreAll(input){const value=normalize(input);value.ocultos=[];value.atualizado_em=new Date().toISOString();return value}
  window.ProductCatalog={SCHEMA,create,normalize,rename,hide,setStartDate,restoreAll};
})();
