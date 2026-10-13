import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as Domain from '../src/meu-tempo/meu-tempo-domain.mjs';

const source=await readFile(new URL('../src/meu-tempo/meu-tempo-view.mjs',import.meta.url),'utf8');
const date='2026-10-10';
class Clock extends Date {constructor(...args){super(...(args.length?args:['2026-10-10T12:00:00']));}}
const items=[
  {id:'activity',name:'Atividade sintética',categoryId:'example',type:'duration',active:true,productive:true,showInCharts:true},
  {id:'other',name:'Outra atividade',categoryId:'example',type:'duration',active:true,productive:false},
  {id:'flag',name:'Indicador sintético',categoryId:'example',type:'boolean',active:true},
];
const entry=minutes=>({id:'initial',date,itemId:'activity',type:'duration',minutes,productiveSnapshot:true,source:'manual',createdAt:'2026-10-10T08:00:00Z'});
const decode=text=>String(text).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');

// Minimal DOM contract double. Runs the complete view and its real Daily bindings,
// with synthetic storage; no profile or IndexedDB access.
class Root {
  nodes=[];attributes={};html='';
  set innerHTML(html){
    for(const node of this.nodes)node.isConnected=false;
    this.html=html;this.nodes=[];
    const tags=/<(input|button|select|textarea)\b([^>]*)(?:>([\s\S]*?)<\/\1>|>)/g;
    for(const match of html.matchAll(tags)){
      const [,,attrs,content='']=match,attributes={};
      for(const attr of attrs.matchAll(/([\w-]+)="([^"]*)"/g))attributes[attr[1]]=decode(attr[2]);
      const dataset={};
      for(const [key,value]of Object.entries(attributes))if(key.startsWith('data-'))dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
      const selected=content.match(/<option\b[^>]*value="([^"]*)"[^>]*selected[^>]*>/)||content.match(/<option\b[^>]*value="([^"]*)"[^>]*>/);
      this.nodes.push({id:attributes.id||'',dataset,tagName:match[1].toUpperCase(),attributes,
        value:match[1]==='textarea'?decode(content):match[1]==='select'?decode(selected?.[1]||''):attributes.value||'',
        disabled:/\bdisabled(?:\s|$)/.test(attrs),isConnected:true,checked:/\bchecked(?:\s|$)/.test(attrs),
        classList:{toggle(){}},setAttribute(key,value){this.attributes[key]=value},focus(){},blur(){}});
    }
    this.message={textContent:'',className:''};
  }
  get innerHTML(){return this.html}
  querySelectorAll(selector){
    if(selector.startsWith('tbody'))return[];
    return this.nodes.filter(node=>selector.split(',').some(part=>{
      part=part.trim();if(part.startsWith('#'))return node.id===part.slice(1);
      const attr=part.match(/^(?:input)?\[([^=\]]+)(?:="([^"]*)")?\]$/);
      return attr&&Object.hasOwn(node.attributes,attr[1])&&(attr[2]===undefined||node.attributes[attr[1]]===attr[2]);
    }));
  }
  querySelector(selector){if(selector==='#timeMessage')return this.message;return this.querySelectorAll(selector)[0]||null}
  setAttribute(key,value){this.attributes[key]=value}
}
const enter=()=>({key:'Enter',preventDefault(){}});
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};

function harness(){
  const root=new Root(),store={items:structuredClone(items),categories:[{id:'example',name:'Exemplo',active:true}],entries:[entry(600)],days:[{date,output:'Texto salvo',observations:'Nota salva'}],settings:{waterUnitMl:350}},messages=[];
  let writes=0,reads=0,wait=null,fail=false;
  const Storage={
    async snapshot(){reads++;return structuredClone(store)},
    async saveEntry(row){if(wait)await wait.promise;if(fail)throw new Error('Falha sintética de gravação');writes++;store.entries.push({...row,id:`new-${writes}`,createdAt:new Clock().toISOString()})},
    async saveDay(row){if(wait)await wait.promise;if(fail)throw new Error('Falha sintética de gravação');writes++;const index=store.days.findIndex(x=>x.date===row.date);if(index<0)store.days.push(structuredClone(row));else store.days[index]=structuredClone(row)},
    async removeDuration(day,id,minutes){if(wait)await wait.promise;if(fail)throw new Error('Falha sintética de gravação');writes++;const plan=Domain.planDurationRemoval(store.entries.filter(x=>x.date===day&&x.itemId===id),minutes);store.entries=store.entries.filter(x=>!plan.deleteIds.includes(x.id)).map(x=>({...x,...plan.updates.find(u=>u.id===x.id)}));return plan},
  };
  const code=source.replace(/^import[^\n]+\n/gm,'').replace(/export /g,'');
  const testDomain={...Domain,localDate:()=>date};
  const api=new Function('Domain','Storage','recordWaterTrackerLog','WATER_TRACKER_ITEM_ID','Date','CSS',code+`;selectedDate='${date}';return{mount,refresh,draw:()=>render(),pending:()=>dailyActionPending,total:()=>Domain.aggregateDay(data.entries,selectedDate).totalMinutes,drafts:dailyDrafts};`)(testDomain,Storage,()=>{},'item-agua',Clock,{escape:String});
  return {root,store,api,messages,get writes(){return writes},get reads(){return reads},set wait(value){wait=value},set fail(value){fail=value},mount:()=>api.mount({root,toast:message=>messages.push(message)}),
    field:selector=>root.querySelector(selector),
    type(selector,value){const field=root.querySelector(selector);field.value=value;field.oninput?.();return field},
    select(selector,value){const field=root.querySelector(selector);field.value=value;field.onchange?.();return field},
  };
}

test('lançar duração preserva notas, outro campo manual e seleção não enviada; limpa só o campo confirmado',async()=>{
  const h=harness();await h.mount();
  h.type('#dayOutput','Output pendente');h.type('#dayObservations','Nota pendente');
  h.type('[data-manual="other"]','110');h.select('[data-value="flag"]','0');
  const input=h.type('[data-manual="activity"]','5');await input.onkeydown(enter());
  assert.equal(h.writes,1);assert.equal(h.reads,2);assert.equal(h.api.total(),605);
  assert.equal(h.field('#dayOutput').value,'Output pendente');assert.equal(h.field('#dayObservations').value,'Nota pendente');
  assert.equal(h.field('[data-manual="other"]').value,'110');assert.equal(h.field('[data-value="flag"]').value,'0');
  assert.equal(h.field('[data-manual="activity"]').value,'');assert.equal(h.store.days[0].output,'Texto salvo');
  h.api.draw();assert.equal(h.field('[data-manual="activity"]').value,'','campo enviado não reaparece depois');
});

test('rascunhos são separados por data e sobrevivem à troca de subaba sem consultas adicionais',async()=>{
  const h=harness();await h.mount();h.type('#dayOutput','Dia A');h.type('[data-manual="other"]','30');
  h.field('#timeNextDay').onclick();assert.equal(h.field('#dayOutput').value,'');h.type('#dayOutput','Dia B');
  h.field('#timePreviousDay').onclick();assert.equal(h.field('#dayOutput').value,'Dia A');assert.equal(h.field('[data-manual="other"]').value,'30');
  h.field('[data-tab="history"]').onclick();h.field('[data-tab="daily"]').onclick();
  assert.equal(h.field('#dayOutput').value,'Dia A');assert.equal(h.reads,1);assert.equal(h.writes,0);
});

test('Até agora bloqueia segundo clique e Enter de outra atividade até concluir e atualiza antes de liberar',async()=>{
  const h=harness();await h.mount();const wait=gate();h.wait=wait;
  const until=h.field('[data-until="activity"]'),launch=until.onclick();
  assert.equal(until.disabled,true);assert.equal(h.field('#timeDate').disabled,true);assert.equal(h.root.attributes['aria-busy'],'true');
  await until.onclick();const other=h.type('[data-manual="other"]','30');await other.onkeydown(enter());
  assert.equal(h.writes,0);wait.resolve();await launch;
  assert.equal(h.writes,1);assert.equal(h.api.total(),720);assert.equal(h.field('[data-manual="other"]').value,'30');
  assert.equal(h.api.pending(),false);assert.equal(h.root.attributes['aria-busy'],'false');assert.equal(h.field('[data-until="activity"]').disabled,false);
  await h.field('[data-until="activity"]').onclick();assert.equal(h.writes,1,'sem intervalo novo após a atualização');
});

test('clique e Enter de valor não temporal compartilham bloqueio e preservam os demais campos',async()=>{
  const h=harness();await h.mount();h.type('#dayObservations','Preservar');h.select('[data-value="flag"]','0');
  const wait=gate();h.wait=wait;const button=h.field('[data-add-value="flag"]'),launch=button.onclick();
  await button.onclick();await h.field('[data-value="flag"]').onkeydown(enter());
  wait.resolve();await launch;assert.equal(h.writes,1);assert.equal(h.store.entries.at(-1).value,false);
  assert.equal(h.field('[data-value="flag"]').value,'');assert.equal(h.field('#dayObservations').value,'Preservar');
});

test('o Histórico mostra a última correção Sim/Não sem apagar os eventos anteriores',async()=>{
  const h=harness();
  h.store.items.push({id:'item-alcool',name:'Bebida alcoólica',categoryId:'example',type:'boolean',active:true});
  h.store.entries.push(
    {id:'alcohol-yes',date,itemId:'item-alcool',type:'boolean',value:true,source:'manual',createdAt:`${date}T08:00:00.000Z`,updatedAt:`${date}T08:00:00.000Z`},
    {id:'alcohol-no',date,itemId:'item-alcool',type:'boolean',value:false,source:'manual',createdAt:`${date}T09:00:00.000Z`,updatedAt:`${date}T09:00:00.000Z`}
  );
  await h.mount();h.field('[data-tab="history"]').onclick();
  assert.match(h.root.innerHTML,new RegExp(`<td class="has-value " data-cell-item="item-alcool" data-cell-date="${date}">Não</td>`),'a célula do dia exibe Não após a correção');
  assert.doesNotMatch(h.root.innerHTML,new RegExp(`<td class="[^"]*time-alcohol-yes[^"]*" data-cell-item="item-alcool" data-cell-date="${date}">`),'célula corrigida não conserva o destaque de Sim');
  assert.doesNotMatch(h.root.innerHTML,new RegExp(`<th class="time-alcohol-day">${date}</th>`),'cabeçalho corrigido não conserva o destaque de Sim');
  assert.equal(h.store.entries.filter(row=>row.itemId==='item-alcool'&&row.date===date).length,2,'a correção de exibição não remove lançamentos históricos');
});

test('falha de gravação libera controles e conserva o valor para corrigir ou tentar novamente',async()=>{
  const h=harness();await h.mount();h.fail=true;h.type('#dayOutput','Preservar');
  const input=h.type('[data-manual="activity"]','5');await input.onkeydown(enter());
  assert.equal(h.writes,0);assert.equal(input.value,'5');assert.equal(input.disabled,false);assert.equal(h.api.pending(),false);
  assert.equal(h.field('[data-until="activity"]').disabled,false);assert.match(h.root.message.textContent,/Falha sintética/);
  h.fail=false;await input.onkeydown(enter());assert.equal(h.writes,1);assert.equal(h.field('#dayOutput').value,'Preservar');
});

test('desconto confirmado limpa só o ajuste enviado e preserva notas e outro rascunho',async()=>{
  const h=harness();await h.mount();h.type('#dayObservations','Minha nota');h.type('[data-manual="other"]','15');
  const input=h.type('[data-manual="activity"]','-30');await input.onkeydown(enter());
  assert.equal(h.api.total(),570);assert.equal(h.field('[data-manual="activity"]').value,'');
  assert.equal(h.field('[data-manual="other"]').value,'15');assert.equal(h.field('#dayObservations').value,'Minha nota');
});

test('salvar dia confirma somente o texto enviado e não perde edições feitas durante a espera',async()=>{
  const h=harness();await h.mount();h.type('#dayOutput','Primeiro texto');
  const wait=gate();h.wait=wait;const save=h.field('#saveDay').onclick();await h.field('#saveDay').onclick();
  h.type('#dayOutput','Texto mais novo');wait.resolve();await save;
  assert.equal(h.writes,1);assert.equal(h.store.days[0].output,'Primeiro texto');assert.equal(h.field('#dayOutput').value,'Texto mais novo');
  assert.equal(h.api.drafts.get(date).notes.dayOutput,'Texto mais novo');
  h.wait=null;await h.field('#saveDay').onclick();assert.equal(h.store.days[0].output,'Texto mais novo');
  assert.equal(h.api.drafts.get(date).notes.dayOutput,undefined);assert.equal(h.field('#dayOutput').value,'Texto mais novo');
});

test('recriação da view restaura estados disabled originais em dias passados, sem writes adicionais',async()=>{
  const h=harness();await h.mount();h.field('#timePreviousDay').onclick();h.type('[data-manual="activity"]','5');
  await h.field('[data-manual="activity"]').onkeydown(enter());
  assert.equal(h.field('[data-until="activity"]').disabled,true);assert.equal(h.field('#timeDate').disabled,false);assert.equal(h.writes,1);
});
