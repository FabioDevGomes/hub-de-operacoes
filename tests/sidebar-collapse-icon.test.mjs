import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../src/sidebar-component.js',import.meta.url),'utf8');
const css=await readFile(new URL('../src/sidebar-component.css',import.meta.url),'utf8');

function mount(initial=false) {
  const values=new Map(initial?[['painel-sidebar-recolhido-v1','true']]:[]);
  const writes=[];
  const classes=new Set();
  const layout={classList:{add:()=>{},toggle:(name,on)=>on?classes.add(name):classes.delete(name)}};
  const icon={innerHTML:''};
  const attributes=new Map();
  let button;
  const aside={id:'',parentElement:layout,classList:{add:()=>{}},querySelector:()=>button,insertBefore:b=>{button=b;}};
  const root={dataset:{},parentElement:{querySelector:()=>null},closest:()=>aside};
  const document={
    querySelectorAll:selector=>selector==='[data-hub-sidebar]'?[root]:[],
    querySelector:()=>null,
    addEventListener:()=>{},
    createElement:()=>({dataset:{},innerHTML:'',querySelector:()=>icon,setAttribute:(k,v)=>attributes.set(k,v),addEventListener:(_event,fn)=>{button.click=fn;}}),
  };
  const localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{writes.push([k,v]);values.set(k,v);},removeItem:k=>{writes.push([k,null]);values.delete(k);}};
  vm.runInNewContext(source,{window:{__hubWaterReminderStarted:true},document,localStorage,CSS:{escape:v=>v}});
  return {get button(){return button;},icon,attributes,writes,classes};
}

test('menu uses only the reference SVG and updates direction, accessibility and existing preference',()=>{
  const ui=mount();
  assert.equal(ui.writes.length,0,'mount must not save preferences');
  assert.doesNotMatch(ui.button.innerHTML,/collapse-label|Recolher|Expandir/);
  assert.match(ui.icon.innerHTML,/stroke="currentColor"/);
  assert.match(ui.icon.innerHTML,/rx="5.5"/);
  assert.match(ui.icon.innerHTML,/M9 3v18/);
  assert.match(ui.icon.innerHTML,/M16 9l-3 3 3 3/);
  assert.equal(ui.attributes.get('aria-label'),'Recolher menu lateral');
  assert.equal(ui.attributes.get('aria-expanded'),'true');
  assert.equal(ui.attributes.get('aria-controls'),'hubSidebar1');
  ui.button.click();
  assert.match(ui.icon.innerHTML,/M13 9l3 3-3 3/);
  assert.equal(ui.attributes.get('title'),'Expandir menu lateral');
  assert.equal(ui.attributes.get('aria-expanded'),'false');
  assert.ok(ui.classes.has('hub-sidebar-collapsed'));
  assert.deepEqual(ui.writes,[['painel-sidebar-recolhido-v1','true']]);
  ui.button.click();
  assert.match(ui.icon.innerHTML,/M16 9l-3 3 3 3/);
  assert.ok(!ui.classes.has('hub-sidebar-collapsed'));
  assert.deepEqual(ui.writes[1],['painel-sidebar-recolhido-v1',null]);
  const saved=mount(true);
  assert.match(saved.icon.innerHTML,/M13 9l3 3-3 3/);
  assert.equal(saved.writes.length,0);
});

test('icon shares primary typography color, has no decorative button border and preserves keyboard focus',()=>{
  assert.match(css,/\.hub-sidebar-collapse-toggle\s*\{[^}]*width: 32px;[^}]*border: 0;[^}]*background: transparent;[^}]*color: var\(--hub-primary-text, #c3cede\)/s);
  assert.match(css,/\.hub-sidebar-collapse-toggle:focus-visible\s*\{\s*outline: 2px solid/);
  assert.match(css,/\.hub-sidebar-collapse-icon svg\s*\{[^}]*width: 26px; height: 26px/);
});

test('collapse and expand share one position and size without changing the existing menu flow',()=>{
  assert.match(css,/\.hub-sidebar-collapse-toggle\s*\{[^}]*position: absolute;[^}]*top: 8px;[^}]*left: 4\.5px;[^}]*width: 32px;[^}]*height: 34px;[^}]*margin: 0;[^}]*padding: 5px 2px;/s);
  assert.doesNotMatch(css,/\.hub-sidebar-collapsed[^{}]*>\s*\.hub-sidebar-collapse-toggle\s*\{/,'no state-specific geometry override');
  assert.match(css,/\.hub-sidebar-layout:not\(\.hub-sidebar-collapsed\) > \.hub-sidebar-aside::before\s*\{[^}]*height: 42px;[^}]*flex: 0 0 42px;/s);
});
