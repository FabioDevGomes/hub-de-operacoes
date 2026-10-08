import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import vm from 'node:vm';

const html=await readFile(new URL('../src/preparador-MCC/index.html',import.meta.url),'utf8');
const render=html.match(/function renderD0CaptureHistory\(\) \{[\s\S]*?\n    \}/)[0];

class Element {
  constructor(){this.children=[];this.attributes={};this.events={};this.hidden=true;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(type,callback){this.events[type]=callback;}
  focus(){this.focused=true;}
}
function harness(entries=[],warnings=false){
  const elements=Object.fromEntries(['d0-changes-panel','d0-capture-history-panel','d0-capture-tabs','d0-history-save-status','d0-capture-view'].map(id=>['#'+id,new Element()]));
  const context={
    q:selector=>elements[selector] || find(elements['#d0-capture-tabs'],selector.slice(1)),
    document:{createElement:()=>new Element()},
    normalizeD0CaptureHistory:()=>{throw new Error('Navegação não deve revalidar/copiar todas as linhas do histórico');},
    d0CaptureHistory:entries,selectedD0CaptureId:null,
    browsingCaptureReports:false, slots:{}, excludedD0:null,
    d0CaptureDeleteSaveFailed:false,d0CaptureHistorySaveFailed:warnings,d0PausedCampaignHistorySaveFailed:false,
    formatD0CaptureTabLabel:value=>value,formatD0CaptureFullTime:value=>value,
    renderD0CaptureEntry:entry=>{context.rendered=entry;},
    renderSelectedCaptureReports:entry=>{context.reportEntry=entry;},
    updateD0ApplyAvailability:()=>{context.availabilityUpdated=true;},
    deleteD0CaptureEntry:id=>{context.deleteRequested=id;},
  };
  vm.runInNewContext(render,context);
  return {context,elements,render:()=>context.renderD0CaptureHistory()};
}
function find(node,id){if(node.id===id)return node;for(const child of node.children){const result=find(child,id);if(result)return result;}}
const capture=(id,managerAccountId)=>({id,managerAccountId,managerAccountName:'MCC sintética',capturedAt:id,state:'calculated',rows:[]});

test('capturas ficam em painel independente antes das alterações D0 e D−1, sem duplicar IDs',()=>{
  const sections=[...html.matchAll(/<section\b[^>]*id="([^"]+)"[^>]*>[\s\S]*?<\/section>/g)];
  const history=sections.find(match=>match[1]==='d0-capture-history-panel');
  const delta=sections.find(match=>match[1]==='d0-changes-panel');
  assert.ok(history.index<delta.index && delta.index<html.indexOf('id="d1-changes-panel"'));
  assert.ok(history[0].includes('id="d0-capture-tabs"') && history[0].includes('id="d0-history-save-status"'));
  assert.ok(!delta[0].includes('id="d0-capture-tabs"') && delta[0].includes('id="d0-capture-view"'));
  for(const id of ['d0-capture-history-panel','d0-capture-tabs','d0-capture-view','d0-changes-table','apply-manifest']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  assert.match(html,/\.steps > #d0-capture-history-panel\s*\{\s*order: -2;/);
  assert.match(html,/\.shell\s*\{[^}]*margin: 14px auto 56px/);
  assert.match(html,/\.topbar\s*\{[^}]*margin-bottom: 12px/);
  assert.match(html,/@media \(max-width: 780px\)\s*\{\s*\.shell\s*\{[^}]*margin-top: 12px/);
});
test('sem histórico não reserva blocos vazios; falha de armazenamento permanece visível',()=>{
  const ui=harness();ui.render();
  assert.equal(ui.elements['#d0-capture-history-panel'].hidden,true);
  assert.equal(ui.elements['#d0-changes-panel'].hidden,true);
  assert.equal(ui.context.availabilityUpdated,true);
  const warning=harness([],true);warning.render();
  assert.equal(warning.elements['#d0-capture-history-panel'].hidden,false);
  assert.equal(warning.elements['#d0-history-save-status'].hidden,false);
  assert.equal(warning.elements['#d0-changes-panel'].hidden,true);
});

test('D−1 isolado mantém a barra dos indicadores visível sem inventar aba D0 ou delta',()=>{
  const ui=harness();ui.context.slots.d1={records:[]};ui.render();
  assert.equal(ui.elements['#d0-capture-history-panel'].hidden,false);
  assert.equal(ui.elements['#d0-changes-panel'].hidden,true);
  assert.equal(ui.elements['#d0-capture-tabs'].children.length,0);
  assert.equal(ui.context.reportEntry,null);
});
test('seleção, agrupamento, teclado e ação de exclusão preservam o vínculo à tabela separada',()=>{
  const entries=[capture('old','111-222-3333'),capture('new','444-555-6666')];
  const before=JSON.stringify(entries),ui=harness(entries);ui.render();
  assert.equal(ui.elements['#d0-capture-history-panel'].hidden,false);
  assert.equal(ui.elements['#d0-changes-panel'].hidden,false);
  assert.equal(ui.elements['#d0-capture-tabs'].children.length,2);
  assert.equal(ui.context.rendered.id,'new');
  let selected=find(ui.elements['#d0-capture-tabs'],'d0-capture-tab-0');
  assert.equal(selected.attributes['aria-controls'],'d0-capture-view');
  assert.equal(ui.elements['#d0-capture-view'].attributes['aria-labelledby'],selected.id);
  selected.events.keydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(ui.context.rendered.id,'old');
  assert.equal(ui.context.reportEntry.id,'old');
  assert.equal(ui.context.browsingCaptureReports,true);
  assert.equal(find(ui.elements['#d0-capture-tabs'],'d0-capture-tab-1').focused,true);
  selected=find(ui.elements['#d0-capture-tabs'],'d0-capture-tab-0');selected.events.click();
  assert.equal(ui.context.rendered.id,'new');
  const remove=ui.elements['#d0-capture-tabs'].children[0].children[1].children[0].children[1];
  remove.events.click();assert.equal(ui.context.deleteRequested,'new');
  assert.equal(JSON.stringify(entries),before,'renderizar e selecionar não alteram capturas');
});

test('navegação reutiliza entradas validadas e recebe imediatamente um histórico substituído',()=>{
  const rows=Object.freeze(Array.from({length:5000},(_,index)=>Object.freeze({campaign:`Campanha sintética ${index}`})));
  const older=Object.freeze({...capture('old','111-222-3333'),rows});
  const newer=Object.freeze({...capture('new','111-222-3333'),rows});
  const entries=Object.freeze([older,newer]),ui=harness(entries);
  ui.render();
  assert.equal(ui.context.rendered,newer,'reutiliza a entrada e suas linhas sem cópia');
  find(ui.elements['#d0-capture-tabs'],'d0-capture-tab-1').events.click();
  assert.equal(ui.context.rendered,older);
  assert.equal(ui.context.rendered.rows,rows);
  const replacement={...newer,rows:[]};
  ui.context.d0CaptureHistory=[replacement];ui.render();
  assert.equal(ui.context.rendered,replacement,'não há cache desatualizado após salvar/remover');
  assert.equal(ui.elements['#d0-capture-tabs'].children[0].children[1].children.length,1);
});
