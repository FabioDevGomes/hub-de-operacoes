import test from 'node:test';
import assert from 'node:assert/strict';
import {mountGlimpseReferenceBar} from '../src/curadoria/glimpse-reference-bar.mjs';

class Element {
  constructor(className=''){this.className=className;this.children=[];this.attributes={};this.listeners=new Map();this.classes=new Set();this.classList={add:x=>this.classes.add(x),contains:x=>this.classes.has(x)};this.disabled=false}
  append(...children){for(const child of children){child.parentElement?.children.splice(child.parentElement.children.indexOf(child),1);child.parentElement=this;this.children.push(child)}}
  insertBefore(child,reference){child.parentElement?.children.splice(child.parentElement.children.indexOf(child),1);child.parentElement=this;this.children.splice(this.children.indexOf(reference),0,child)}
  before(child){this.parentElement.insertBefore(child,this)}
  querySelector(selector){const name=selector.slice(1);for(const child of this.children){if(child.className.split(' ').includes(name))return child;const found=child.querySelector(selector);if(found)return found}return null}
  setAttribute(name,value){this.attributes[name]=value}
  addEventListener(name,listener){this.listeners.set(name,listener)}
}

test('barra comum preserva abas/retorno, salva só Glimpse e valida confirmação',()=>{
  const original=Object.fromEntries(['document','window','location','MutationObserver'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const sheet=new Element(),header=new Element('sheet-top'),tabs=new Element('tabs'),back=new Element(),panel=new Element();
  header.append(back);sheet.append(header,tabs);panel.classes.add('hidden');
  const messages=[],listeners=[],observers=[];const frame={contentWindow:{postMessage:(...args)=>messages.push(args)}};
  globalThis.document={createElement:()=>new Element()};globalThis.window={addEventListener:(name,handler)=>listeners.push(handler)};
  globalThis.location={origin:'http://localhost'};globalThis.MutationObserver=class{constructor(handler){observers.push(handler)}observe(){}};
  try {
    const bar=mountGlimpseReferenceBar({sheet,frame,panel,backButton:back});
    const actions=bar.querySelector('.sheet-bar-actions'),save=actions.children.find(item=>item.textContent==='Salvar'),status=actions.querySelector('.glimpse-host-saved');
    assert.equal(sheet.children[0],bar);assert.equal(bar.children[0],tabs);assert.equal(actions.children.at(-1),back);
    assert.equal(back.textContent,'← Voltar à lista');assert.equal(save.disabled,true);assert.match(save.attributes['aria-label'],/somente leitura/);
    save.listeners.get('click')();assert.equal(messages.length,0);
    panel.classes.delete('hidden');observers.forEach(fn=>fn());assert.equal(save.disabled,false);
    save.listeners.get('click')();assert.equal(save.disabled,true);assert.equal(status.hidden,true);
    assert.deepEqual(messages[0],[{type:'hub-glimpse-finish'},'http://localhost']);
    listeners.forEach(fn=>fn({origin:'https://invalid.test',source:frame.contentWindow,data:{type:'hub-glimpse-save-result',saved:true}}));
    assert.equal(status.hidden,true);assert.equal(save.disabled,true);
    listeners.forEach(fn=>fn({origin:location.origin,source:frame.contentWindow,data:{type:'hub-glimpse-save-result',saved:true}}));
    assert.equal(status.textContent,'Salvo');assert.equal(status.hidden,false);assert.equal(save.disabled,false);
    assert.equal(mountGlimpseReferenceBar({sheet,frame,panel,backButton:back}),bar,'montagem idempotente sem duplicar abas/ações');
    panel.classes.add('hidden');observers.forEach(fn=>fn());assert.equal(save.disabled,true);assert.equal(status.hidden,true);
  } finally {for(const [key,descriptor] of Object.entries(original)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
});
