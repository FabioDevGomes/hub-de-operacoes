import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

const source=await readFile(new URL('../src/curadoria/index.html',import.meta.url),'utf8');
const key='hub:radar-spyhero:hidden-product-ids:v1';
const preference=source.slice(source.indexOf('    const HIDDEN_PRODUCTS_KEY'),source.indexOf('    const normal ='));
const normal=source.match(/    const normal =[^\n]+/)[0];
const safe=source.match(/    const safe =[^\n]+/)[0];
const render=source.slice(source.indexOf('    function render(){'),source.indexOf('    function openDetail('));
const record=(id,name)=>({id,name,niche:'Exemplo',network:'Clickbank',seen:2,running:1,pages:1,landers:1,status:'Novo sinal',notes:'Preservar',snapshots:[{date:'2026-01-02'}]});
function fixture(saved,blocked=false){
  const writes=[],messages=[],opened=[],elements=new Map(),buttons=[];
  const get=selector=>{if(!elements.has(selector))elements.set(selector,{value:selector==='#visibilityFilter'?'visible':'',style:{},innerHTML:''});return elements.get(selector)};
  Object.defineProperty(get('#rows'),'innerHTML',{get(){return this.html||''},set(value){this.html=value;buttons.length=0;for(const match of value.matchAll(/data-product-visibility="([^"]+)"/g))buttons.push({dataset:{productVisibility:match[1]}})}});
  const records=[record('a','Produto <A>'),record('b','Nome de produto muito longo para testar o canto da célula')];
  const context={records,landingPages:[],localStorage:{getItem:()=>{if(blocked)throw Error('blocked');return saved},setItem:(k,v)=>{if(blocked)throw Error('blocked');writes.push([k,v])}},document:{querySelectorAll:selector=>selector==='[data-product-visibility]'?buttons:[]},$:get,sortKey:'auto',sortDirection:'desc',columns:{apply(){}},scoreSignal:()=>({score:1,decision:'Prioritário'}),compareRecord:()=>({label:'Primeira coleta',kind:'Primeira coleta',runningDelta:0}),sortAssessed:items=>items,ClickBankDomain:{latestVerification:()=>null,STATUS:{}},landingSummary:()=>({count:0}),clickbankBadge:()=>'',trendsBadge:()=>'',landingBadge:()=>'',signalClass:()=>'',deltaLabel:()=>'',lastCollectionCell:()=>'<td>—</td>',toast:message=>messages.push(message),openProductSheet:id=>opened.push(id)};
  runInNewContext(`${preference}\n${normal}\n${safe}\n${render}\nthis.render=render;this.toggleProductVisibility=toggleProductVisibility;`,context);
  context.render();
  return {context,records,writes,messages,opened,buttons,get,html:()=>get('#rows').innerHTML};
}

test('Radar oculta/reexibe por ID sem mudar registros, métricas ou decisão e sem abrir ficha',()=>{
  const f=fixture(null),before=JSON.stringify(f.records);
  assert.equal(f.writes.length,0);
  assert.match(f.html(),/Produto &lt;A&gt;/);
  assert.match(f.html(),/class="hub-corner-edit"[^>]+aria-label="Ocultar Produto &lt;A&gt;"/);
  let stopped=false;f.buttons[0].onclick({stopPropagation(){stopped=true}});
  assert.equal(stopped,true);assert.deepEqual(f.opened,[]);
  assert.doesNotMatch(f.html(),/data-product-visibility="a"/);
  assert.deepEqual(f.writes,[[key,'["a"]']]);
  assert.equal(f.get('#totalMetric').textContent,2);
  f.get('#visibilityFilter').value='hidden';f.context.render();
  assert.match(f.html(),/Reexibir/);assert.doesNotMatch(f.html(),/data-product-visibility="b"/);
  f.get('#visibilityFilter').value='all';f.context.render();assert.equal(f.buttons.length,2);
  f.buttons[0].onclick({stopPropagation(){}});
  f.get('#visibilityFilter').value='visible';f.context.render();assert.equal(f.buttons.length,2);
  assert.equal(JSON.stringify(f.records),before);
});

test('Radar restaura preferências e combina visibilidade com os filtros existentes',()=>{
  const f=fixture('["a"]');assert.equal(f.buttons.length,1);assert.equal(f.writes.length,0);
  f.get('#visibilityFilter').value='hidden';f.get('#search').value='Produto';f.context.render();assert.equal(f.buttons.length,1);
  f.get('#statusFilter').value='Não avançar';f.context.render();assert.equal(f.buttons.length,0);
  f.get('#statusFilter').value='';f.context.records=[record('a','Produto atualizado'),record('b','Outro')];f.context.render();assert.match(f.html(),/Reexibir Produto atualizado/);
  f.context.toggleProductVisibility('desconhecido');assert.equal(f.writes.length,0);
});

test('Radar tolera preferência inválida ou storage bloqueado, mantendo ocultação na sessão',()=>{
  for(const saved of ['invalid','{}','[null,3,""]'])assert.equal(fixture(saved).buttons.length,2);
  const f=fixture(null,true);f.context.toggleProductVisibility('a');assert.equal(f.buttons.length,1);
  assert.match(f.messages[0],/nesta sessão/);
  f.get('#visibilityFilter').value='hidden';f.context.render();assert.match(f.html(),/Reexibir/);
});

test('Radar reutiliza aparência compartilhada e publica filtro/listener sem estilos duplicados',()=>{
  assert.match(source,/\/table-edit-actions\.css\?v=3/);
  assert.match(source,/#rows td\.radar-product-cell\{padding-right:54px\}/);
  assert.match(source,/id="visibilityFilter" aria-label="Visibilidade dos produtos"/);
  assert.match(source,/\$\('#visibilityFilter'\)\.addEventListener\('change',render\)/);
  assert.doesNotMatch(source,/\.hub-corner-edit\s*\{/);
  assert.doesNotMatch(preference,/putMany|indexedDB|\.status\s*=/);
});
