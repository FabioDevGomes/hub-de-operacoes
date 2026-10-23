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
  let writes=0,reads=0,wait=null,fail=false,confirmResult=true,confirmCalls=0,promptValues=['08:00','08:25'];
  const Storage={
    async snapshot(){reads++;return structuredClone(store)},
    async saveEntry(row){if(wait)await wait.promise;if(fail)throw new Error('Falha sintética de gravação');writes++;store.entries.push({...row,id:`new-${writes}`,createdAt:new Clock().toISOString()})},
    async saveEntryAndSetting(row,key,value){if(wait)await wait.promise;if(fail)throw new Error('Falha sintética de gravação');writes++;store.entries.push({...row,id:`new-${writes}`,createdAt:new Clock().toISOString()});store.settings[key]=structuredClone(value)},
    async saveDay(row){if(wait)await wait.promise;if(fail)throw new Error('Falha sintética de gravação');writes++;const index=store.days.findIndex(x=>x.date===row.date);if(index<0)store.days.push(structuredClone(row));else store.days[index]=structuredClone(row)},
    async saveSetting(key,value){if(wait)await wait.promise;if(fail)throw new Error('Falha sintética de gravação');writes++;store.settings[key]=structuredClone(value)},
    async removeDuration(day,id,minutes){if(wait)await wait.promise;if(fail)throw new Error('Falha sintética de gravação');writes++;const plan=Domain.planDurationRemoval(store.entries.filter(x=>x.date===day&&x.itemId===id),minutes);store.entries=store.entries.filter(x=>!plan.deleteIds.includes(x.id)).map(x=>({...x,...plan.updates.find(u=>u.id===x.id)}));return plan},
  };
  const code=source.replace(/^import[^\n]+\n/gm,'').replace(/export /g,'');
  const testDomain={...Domain,localDate:()=>date};
  const api=new Function('Domain','Storage','recordWaterTrackerLog','WATER_TRACKER_ITEM_ID','Date','CSS','confirm','prompt',code+`;selectedDate='${date}';return{mount,refresh,draw:()=>render(),pending:()=>dailyActionPending,total:()=>Domain.aggregateDay(data.entries,selectedDate).totalMinutes,drafts:dailyDrafts};`)(testDomain,Storage,()=>{},'item-agua',Clock,{escape:String},()=>{confirmCalls++;return confirmResult},()=>promptValues.shift()??null);
  return {root,store,api,messages,get writes(){return writes},get reads(){return reads},get confirmCalls(){return confirmCalls},set confirmResult(value){confirmResult=value},set promptValues(value){promptValues=[...value]},set wait(value){wait=value},set fail(value){fail=value},mount:()=>api.mount({root,toast:message=>messages.push(message)}),
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

test('pausar o indicador congela seu valor por dia sem interromper os lançamentos nem os totais',async()=>{
  const h=harness(),itemId=Domain.PRE_WORK_ITEM_IDS[0],key=Domain.preWorkCounterPauseKey(date);
  h.store.items.push({id:itemId,name:'Na cama após acordar',categoryId:'example',type:'duration',active:true,productive:false});
  h.store.entries.push({id:'pre-work-before-pause',date,itemId,type:'duration',minutes:35,productiveSnapshot:false,source:'manual',createdAt:'2026-10-10T08:00:00.000Z'});
  await h.mount();assert.match(h.root.html,/35min/);assert.ok(h.field('#pausePreWorkCounter'));
  const wait=gate();h.wait=wait;const pause=h.field('#pausePreWorkCounter').onclick();
  assert.equal(h.field('#pausePreWorkCounter').disabled,true,'a ação de pausa segue o bloqueio compartilhado do Diário');
  await h.field('#pausePreWorkCounter').onclick();assert.equal(h.writes,0,'cliques repetidos durante a gravação não duplicam a operação');
  wait.resolve();await pause;h.wait=null;
  assert.equal(h.writes,1);assert.deepEqual(h.store.settings[key].minutes,35);assert.equal(h.store.entries.length,2,'pausar não altera nenhum lançamento');
  assert.match(h.root.html,/35min/);assert.match(h.root.html,/Parado/);assert.equal(h.field('#pausePreWorkCounter'),null);
  const later=h.type(`[data-manual="${itemId}"]`,'25');await later.onkeydown(enter());
  assert.equal(h.store.entries.filter(row=>row.itemId===itemId&&row.date===date).length,2,'o registro da atividade continua disponível após a pausa');
  assert.equal(Domain.totalPreWorkDuration(h.store.entries,date),60,'o total real das atividades continua sendo calculado normalmente');
  assert.equal(h.api.total(),660,'o total geral registrado continua considerando todos os lançamentos');
  assert.equal(h.writes,2);assert.match(h.root.html,/35min/,'o KPI permanece congelado apesar do novo lançamento');assert.match(h.root.html,/Parado/);
  h.api.draw();assert.match(h.root.html,/35min/,'a pausa persiste no redesenho da tela');assert.match(h.root.html,/Parado/);
});

test('primeiro lançamento produtivo elegível pede confirmação e pausa atomicamente antes de registrar o trabalho',async()=>{
  const h=harness(),preWorkId=Domain.PRE_WORK_ITEM_IDS[0],key=Domain.preWorkCounterPauseKey(date);
  h.store.entries=[{id:'pre-work',date,itemId:preWorkId,type:'duration',minutes:35,productiveSnapshot:false,source:'manual',createdAt:'2026-10-10T08:00:00.000Z'}];
  h.store.items.push({id:preWorkId,name:'Na cama após acordar',categoryId:'example',type:'duration',active:true,productive:false});
  await h.mount();const input=h.type('[data-manual="activity"]','25');await input.onkeydown(enter());
  assert.equal(h.confirmCalls,1);assert.equal(h.writes,1,'lançamento e pausa usam uma única operação de armazenamento');
  assert.deepEqual(h.store.settings[key].minutes,35,'o contador congela no valor anterior ao primeiro lançamento produtivo');
  assert.equal(h.store.entries.at(-1).minutes,25);assert.equal(h.api.total(),60);assert.match(h.root.html,/Parado/);
});

test('Kakashi, treino e mentalização não acionam a confirmação; a primeira outra atividade produtiva aciona uma única vez',async()=>{
  const h=harness();h.store.entries=[];h.store.items.push(
    {id:'workout',name:'Treino academia',categoryId:'example',type:'duration',active:true,productive:true},
    {id:'mentalization',name:'Mentalização / autossugestão',categoryId:'example',type:'duration',active:true,productive:true},
    {id:Domain.PARTIALLY_PRODUCTIVE_ITEM_ID,name:'Kakashi',categoryId:'example',type:'duration',active:true,productive:false}
  );await h.mount();
  for(const[id,value]of [[Domain.PARTIALLY_PRODUCTIVE_ITEM_ID,'8'],['workout','30'],['mentalization','5']]){const input=h.type(`[data-manual="${id}"]`,value);await input.onkeydown(enter())}
  assert.equal(h.confirmCalls,0);assert.equal(h.store.entries.length,3);
  assert.equal(Domain.productiveContributionMinutes(h.store.entries[0]),.8,'Kakashi continua contribuindo com 10% para a produtividade normal do dia');
  assert.equal(h.store.settings[Domain.preWorkCounterPauseKey(date)],undefined,'Kakashi não pausa o contador');
  const input=h.type('[data-manual="activity"]','10');await input.onkeydown(enter());
  assert.equal(h.confirmCalls,1);assert.ok(h.store.settings[Domain.preWorkCounterPauseKey(date)]);
});

test('recusar a parada automática mantém o contador ativo, registra o item e não pergunta de novo no mesmo dia',async()=>{
  const h=harness();h.store.entries=[];h.confirmResult=false;await h.mount();
  const first=h.type('[data-manual="activity"]','10');await first.onkeydown(enter());
  assert.equal(h.confirmCalls,1);assert.equal(h.store.entries.length,1);assert.equal(h.store.settings[Domain.preWorkCounterPauseKey(date)],undefined);
  const second=h.type('[data-manual="activity"]','15');await second.onkeydown(enter());
  assert.equal(h.confirmCalls,1);assert.equal(h.store.entries.length,2);assert.equal(h.field('#pausePreWorkCounter')!==null,true);
});

test('Intervalo e Até agora também passam pela parada automática confirmada',async()=>{
  const intervalHarness=harness();intervalHarness.store.entries=[];await intervalHarness.mount();
  await intervalHarness.field('[data-interval="activity"]').onclick();
  assert.equal(intervalHarness.confirmCalls,1);assert.ok(intervalHarness.store.settings[Domain.preWorkCounterPauseKey(date)]);

  const untilHarness=harness();untilHarness.store.entries=[];await untilHarness.mount();
  await untilHarness.field('[data-until="activity"]').onclick();
  assert.equal(untilHarness.confirmCalls,1);assert.ok(untilHarness.store.settings[Domain.preWorkCounterPauseKey(date)]);
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
  assert.match(h.root.innerHTML,new RegExp(`<th class="time-clear-day">${date.split('-').reverse().join('/')}</th>`),'o cabeçalho fica verde automaticamente após a última resposta corrigida para Não');
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
