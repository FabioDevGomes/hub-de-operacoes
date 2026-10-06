(function(){
  const SCHEMA='catalogo_produtos_v1';
  const clone=value=>structuredClone(value);
  function create(){return{schema:SCHEMA,atualizado_em:new Date().toISOString(),aliases:{},ocultos:[],datas_inicio:{},ajustes_testados:{}}}
  function normalize(input){const value=input?.schema===SCHEMA?clone(input):create();value.aliases??={};value.datas_inicio??={};value.ajustes_testados??={};validateTestedAdjustments(value.ajustes_testados);value.ocultos=[...new Set((value.ocultos||[]).map(key=>String(key).toLocaleLowerCase('pt-BR')))];return value}
  const TESTED_FIELDS=['label','startDate','campaignCount','salesCount','totalBilled','totalProfit','first','last','active','relatedCampaigns'];
  function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(`${value}T00:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value}
  function validateTestedValues(values){
    if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('Os ajustes de Produtos Testados são inválidos.');
    for(const [field,value]of Object.entries(values)){
      if(!TESTED_FIELDS.includes(field))throw new Error(`Campo de ajuste desconhecido: ${field}.`);
      if(field==='label'&&(typeof value!=='string'||!value.trim()))throw new Error('O nome do produto não pode ficar vazio.');
      if(['startDate','first','last'].includes(field)&&value!==null&&!validDate(value))throw new Error('Informe uma data válida.');
      if(['campaignCount','salesCount','totalBilled','totalProfit'].includes(field)&&value!==null&&(typeof value!=='number'||!Number.isFinite(value)))throw new Error('Informe um número válido.');
      if(['campaignCount','salesCount'].includes(field)&&value!==null&&value<0)throw new Error('Quantidades não podem ser negativas.');
      if(field==='campaignCount'&&value!==null&&!Number.isInteger(value))throw new Error('A quantidade de campanhas deve ser inteira.');
      if(field==='active'&&typeof value!=='boolean')throw new Error('A situação do produto é inválida.');
      if(field==='relatedCampaigns'&&(!Array.isArray(value)||!value.every(name=>typeof name==='string'&&name.trim())))throw new Error('Informe uma campanha por linha, sem linhas vazias.');
    }
    if(values.first&&values.last&&values.first>values.last)throw new Error('O fim do período não pode ser anterior ao início.');
    return clone(values)
  }
  function validateTestedAdjustments(input){
    if(input==null)return;
    if(typeof input!=='object'||Array.isArray(input))throw new Error('Os ajustes do catálogo são inválidos.');
    for(const entry of Object.values(input))validateTestedValues(entry?.values);
  }
  function setTestedAdjustments(input,key,values){const value=normalize(input),id=String(key);if(!id)throw new Error('Produto inválido.');const patch=validateTestedValues(values),now=new Date().toISOString();value.ajustes_testados={...value.ajustes_testados,[id]:{...value.ajustes_testados[id],values:patch,atualizado_em:now}};value.atualizado_em=now;return value}
  function rename(input,key,label){const value=normalize(input),clean=String(label||'').trim();if(!clean)throw new Error('O nome do produto não pode ficar vazio.');value.aliases[String(key)]=clean;value.atualizado_em=new Date().toISOString();return value}
  function hide(input,key){const value=normalize(input),id=String(key);if(!value.ocultos.includes(id))value.ocultos.push(id);value.atualizado_em=new Date().toISOString();return value}
  function setStartDate(input,key,date){const value=normalize(input),clean=String(date||'').trim();if(clean&&!/^\d{4}-\d{2}-\d{2}$/.test(clean))throw new Error('A data deve estar no formato ISO.');if(clean)value.datas_inicio[String(key)]=clean;else delete value.datas_inicio[String(key)];value.atualizado_em=new Date().toISOString();return value}
  function restoreAll(input){const value=normalize(input);value.ocultos=[];value.atualizado_em=new Date().toISOString();return value}
  window.ProductCatalog={SCHEMA,create,normalize,rename,hide,setStartDate,restoreAll,setTestedAdjustments,validateTestedValues,validateTestedAdjustments};
})();
