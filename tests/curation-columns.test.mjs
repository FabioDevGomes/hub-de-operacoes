import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {CURATION_COLUMNS, mountCurationColumns} from '../src/curadoria/curation-columns.mjs';

const read = path => readFile(new URL('../'+path,import.meta.url),'utf8');
function fixture(screen, preferences) {
  const element = () => {
    const listeners = new Map();
    return {dataset:{},style:{},textContent:'',innerHTML:'',
      addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type),
      emit:(type,event)=>listeners.get(type)?.(event),focus(){this.focused=true;}};
  };
  const doc=element(),viewport=element();viewport.innerHeight=700;doc.defaultView=viewport;
  const nodes=Object.fromEntries(['[data-column-options]','.hub-column-menu','[data-column-message]','[data-column-reset]','summary'].map(key=>[key,element()]));
  const picker=element();Object.assign(picker,{ownerDocument:doc,open:false,querySelector:key=>nodes[key],
    contains:target=>Object.values(nodes).includes(target),getBoundingClientRect:()=>({top:140,bottom:172})});
  const makeRow=()=>({cells:CURATION_COLUMNS[screen].columns.map(()=>element())});
  const table={dataset:{},rows:[makeRow(),makeRow()]};
  const root={ownerDocument:doc,querySelector:key=>key==='[data-curation-columns]'?picker:table};
  const controller=mountCurationColumns({root,screen,preferences});
  return {table,picker,doc,nodes,makeRow,controller,toggle(key,checked){
    nodes['[data-column-options]'].emit('change',{target:{closest:()=>({dataset:{columnChoice:key},checked,disabled:false})}});
  }};
}

test('Radar and CB hide/reveal matching cells, retain identity and preferences after reload/rerender',()=>{
  const values=new Map(),preferences={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  for(const screen of ['radar','clickbank']){
    const f=fixture(screen,preferences),config=CURATION_COLUMNS[screen],keys=config.columns.map(([key])=>key);
    assert.equal(values.has(config.preferenceKey),false,'mount must never persist');
    f.toggle('trends',false);f.toggle(config.required[0],false);
    const index=keys.indexOf('trends'),identity=keys.indexOf(config.required[0]);
    assert.ok(f.table.rows.every(row=>row.cells[index].hidden));
    assert.ok(f.table.rows.every(row=>!row.cells[identity].hidden));
    f.table.rows.push(f.makeRow());f.controller.apply();
    assert.equal(f.table.rows.at(-1).cells[index].hidden,true);
    const reloaded=fixture(screen,preferences);
    assert.equal(reloaded.table.rows[1].cells[index].hidden,true);
    f.toggle('trends',true);assert.equal(f.table.rows[1].cells[index].hidden,false);
    f.toggle('lastSeen',false);f.nodes['[data-column-reset]'].emit('click');
    assert.equal(f.table.dataset.columnSelection,'all');
    assert.equal(values.has(config.preferenceKey),false);
    f.picker.open=true;f.picker.emit('keydown',{key:'Escape',preventDefault(){}});
    assert.equal(f.picker.open,false);assert.equal(f.nodes.summary.focused,true);
  }
  const cb=fixture('clickbank',preferences);cb.toggle('trends',false);
  assert.equal(fixture('radar',preferences).table.rows[0].cells[4].hidden,false,'screen preferences are isolated');
});

test('blocked browser storage preserves session choices and gives visible feedback',()=>{
  const f=fixture('radar',{getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}});
  f.toggle('network',false);assert.equal(f.table.rows[1].cells[2].hidden,true);
  assert.match(f.nodes['[data-column-message]'].textContent,/sessão/);
});

test('all six curation list screens expose columns; new lists reuse global presentation and reapply after rendering',async()=>{
  for(const file of ['index.html','gerentes/index.html','top-performance/index.html','hot-offers-ms/index.html','smartadv-offers/index.html','clickbank-top-offers/index.html']){
    const html=await read('src/curadoria/'+file);
    assert.match(html,/>Colunas<\/summary>/,file);
  }
  const radar=await read('src/curadoria/index.html'),cb=await read('src/curadoria/clickbank-top-offers/index.html');
  for(const html of [radar,cb]){
    assert.match(html,/table-columns.css\?v=2/);
    assert.match(html,/class="hub-column-picker" data-curation-columns/);
    assert.match(html,/class="hub-curation-column-table hub-table-button-behavior"/);
    assert.match(html,/data-column-options/);assert.match(html,/data-column-reset/);
  }
  assert.match(radar,/columns\.apply\(\);/);
  const view=await read('src/curadoria/clickbank-top-offers/clickbank-top-offers-view.mjs');
  assert.match(view,/mountCurationColumns\(\{root, screen:'clickbank', preferences\}\)/);
  assert.match(view,/columns\.apply\(\);/);
  for(const [screen,html] of [['radar',radar],['clickbank',cb]]){
    const tableHead=html.match(/<table class="hub-curation-column-table hub-table-button-behavior"><thead><tr>([\s\S]*?)<\/tr><\/thead>/)[1];
    const sortKeys=[...tableHead.matchAll(/data-sort="([^"]+)"/g)].map(match=>match[1]);
    // CB's Decision heading has no sort action, but occupies the same physical column.
    if(screen==='clickbank')sortKeys.splice(13,0,'decision');
    assert.deepEqual(sortKeys,CURATION_COLUMNS[screen].columns.map(([key])=>key));
  }
  assert.equal(await read('dist/curadoria/curation-columns.mjs'),await read('src/curadoria/curation-columns.mjs'));
});
