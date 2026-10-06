import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createColumnPreference, mountColumnPicker} from '../src/table-columns.mjs';

const columns = [['id','ID'],['offer','Oferta'],['trends','Google Trends'],['decision','Decisão']];
const storage = () => { const values = new Map(); return {values,getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}; };
test('column choices persist per screen, keep identity, restore defaults and never write on mount', () => {
  const preferences = storage(), args = {columns,required:['offer'],preferences,preferenceKey:'smartadv'};
  const state = createColumnPreference(args);
  assert.deepEqual(state.visibleKeys(), columns.map(([key])=>key)); assert.equal(preferences.values.size,0);
  state.toggle('trends', false); state.toggle('offer', false);
  assert.deepEqual(createColumnPreference(args).visibleKeys(), ['id','offer','decision']);
  assert.deepEqual(createColumnPreference({...args,preferenceKey:'overview'}).visibleKeys(), columns.map(([key])=>key));
  state.toggle('trends',true); assert.equal(state.visibleKeys().length,4);
  state.reset(); assert.equal(preferences.values.has('smartadv'),false);
});
test('invalid or obsolete preferences cannot remove required identity; blocked storage remains usable', () => {
  const preferences=storage(),args={columns,required:['offer'],preferences,preferenceKey:'smartadv'};
  for (const value of ['{invalid','{}','null']) {
    preferences.setItem('smartadv',value); assert.equal(createColumnPreference(args).visibleKeys().length,4);
  }
  preferences.setItem('smartadv','["decision","unknown"]');
  assert.deepEqual(createColumnPreference(args).visibleKeys(),['offer','decision']);
  const blocked=createColumnPreference({...args,preferences:{getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}}});
  assert.match(blocked.toggle('id',false),/sessão/); assert.deepEqual(blocked.visibleKeys(),['offer','trends','decision']);
  assert.match(blocked.reset(),/sessão/); assert.equal(blocked.visibleKeys().length,4);
});
function element() {
  const listeners=new Map();
  return {listeners,dataset:{},style:{},textContent:'',innerHTML:'',
    addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type),
    focus(){this.focused=true},emit(type,event={}){listeners.get(type)?.(event)}};
}
test('picker hides matching headers/cells, reapplies after rerender, resets and closes accessibly', () => {
  const doc=element(),viewport=element();viewport.innerHeight=600;doc.defaultView=viewport;
  const picker=element(),options=element(),menu=element(),message=element(),reset=element(),summary=element();
  Object.assign(picker,{ownerDocument:doc,open:true,contains:target=>target===options,getBoundingClientRect:()=>({top:450,bottom:482}),
    querySelector:selector=>({'[data-column-options]':options,'.hub-column-menu':menu,'[data-column-message]':message,'[data-column-reset]':reset,summary})[selector]});
  const row=()=>({cells:columns.map(()=>element())});
  const table={rows:[row(),row()],dataset:{}};
  const controller=mountColumnPicker({picker,table,columns,required:['offer'],preferences:storage(),preferenceKey:'smartadv'});
  const input={dataset:{columnChoice:'trends'},checked:false,disabled:false};
  options.emit('change',{target:{closest:()=>input}});
  assert.equal(table.rows[0].cells[2].hidden,true);assert.equal(table.rows[1].cells[2].hidden,true);
  assert.equal(table.rows[1].cells[1].hidden,false);assert.equal(table.dataset.columnSelection,'custom');
  table.rows.push(row());controller.apply();assert.equal(table.rows[2].cells[2].hidden,true);
  picker.emit('toggle');assert.equal(menu.style.bottom,'calc(100% + 8px)');
  picker.emit('keydown',{key:'Escape',preventDefault(){}});assert.equal(picker.open,false);assert.equal(summary.focused,true);
  picker.open=true;doc.emit('pointerdown',{target:{}});assert.equal(picker.open,false);
  reset.emit('click');assert.equal(table.dataset.columnSelection,'all');assert.equal(table.rows[2].cells[2].hidden,false);
  controller.destroy();assert.equal(doc.listeners.size,0);assert.equal(viewport.listeners.size,0);
});
