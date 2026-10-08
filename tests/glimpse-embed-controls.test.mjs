import test from 'node:test';
import assert from 'node:assert/strict';
import {mountGlimpseHeaderAction} from '../src/curadoria/glimpse-embed-controls.mjs';

class Element {
  constructor() {
    this.children = [];
    this.className = '';
    this.parentElement = null;
    this.attributes = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.classes = new Set();
    this.listeners = new Map();
    this.classList = {add:name=>this.classes.add(name),contains:name=>this.classes.has(name)};
  }
  append(...children) {
    for (const child of children) {
      child.parentElement?.children.splice(child.parentElement.children.indexOf(child),1);
      child.parentElement = this;
      this.children.push(child);
    }
  }
  insertBefore(child, reference) {
    child.parentElement?.children.splice(child.parentElement.children.indexOf(child),1);
    child.parentElement = this;
    this.children.splice(this.children.indexOf(reference),0,child);
  }
  querySelector(selector) {
    const className = selector.split('.').at(-1);
    return this.children.find(child=>child.className.split(/\s+/).includes(className)) || null;
  }
  setAttribute(name,value) { this.attributes[name] = value; }
  addEventListener(name,listener) { this.listeners.set(name,listener); }
}

test('Top Offers CB mostra confirmação somente após sucesso e valida a mensagem do iframe',async()=>{
  const original = Object.fromEntries(['document','window','location','MutationObserver'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const listeners = new Map(), observers = [];
  const parent = new Element(), backButton = new Element();
  parent.append(backButton);
  const panel = new Element();
  const childMessages = [];
  const child = {postMessage:(message,target)=>childMessages.push({message,target})};
  const frame = {contentWindow:child};
  globalThis.document = {createElement:()=>new Element()};
  globalThis.window = {addEventListener:(name,listener)=>listeners.set(name,listener)};
  globalThis.location = {origin:'http://127.0.0.1:8765'};
  globalThis.MutationObserver = class { constructor(callback){this.callback=callback;observers.push(this)} observe(){} };

  try {
    const button = mountGlimpseHeaderAction({frame,panel,backButton,finishLabel:'Salvar',showSavedFeedback:true});
    const status = parent.querySelector(':scope > .glimpse-host-controls').querySelector('.glimpse-host-saved');
    assert.equal(button.textContent,'Salvar');
    assert.equal(status.hidden,true);
    assert.equal(status.attributes.role,'status');
    const controls=parent.querySelector(':scope > .glimpse-host-controls');
    assert.equal(controls.children.indexOf(status),0,'a confirmação ocupa o espaço antes de Salvar');
    assert.equal(controls.children.indexOf(button),1,'Salvar mantém sua posição seguinte ao feedback reservado');

    button.onclick();
    assert.equal(button.disabled,true);
    assert.deepEqual(childMessages.at(-1),{message:{type:'hub-glimpse-finish'},target:location.origin});
    const onMessage = listeners.get('message');
    onMessage({origin:location.origin,source:{},data:{type:'hub-glimpse-save-result',saved:true}});
    assert.equal(status.hidden,true,'uma mensagem de outra janela não confirma o salvamento');
    assert.equal(button.disabled,true);

    onMessage({origin:location.origin,source:child,data:{type:'hub-glimpse-save-result',saved:true}});
    assert.equal(status.textContent,'Salvo');
    assert.equal(status.hidden,false);
    assert.equal(button.disabled,false);
    assert.equal(controls.children.indexOf(button),1,'mostrar Salvo não muda a posição de Salvar');

    button.onclick();
    assert.equal(status.hidden,true,'um novo salvamento remove a confirmação anterior');
    onMessage({origin:location.origin,source:child,data:{type:'hub-glimpse-save-result',saved:false}});
    assert.equal(status.hidden,true,'falha não mostra confirmação verde');
    assert.equal(button.disabled,false,'o botão pode ser usado novamente após falha');

    panel.classes.add('hidden');
    observers.at(-1).callback();
    assert.equal(button.hidden,true);
    assert.equal(status.hidden,true);
  } finally {
    for (const [key,descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor);
      else delete globalThis[key];
    }
  }
});

test('o helper preserva compatibilidade com o rótulo e o fluxo legado Concluir',()=>{
  const original = Object.fromEntries(['document','window','location','MutationObserver'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const parent = new Element(), backButton = new Element();
  parent.append(backButton);
  const panel = new Element();
  const messages = [];
  const frame = {contentWindow:{postMessage:(message,target)=>messages.push({message,target})}};
  globalThis.document = {createElement:()=>new Element()};
  globalThis.window = {addEventListener(){}};
  globalThis.location = {origin:'http://127.0.0.1:8765'};
  globalThis.MutationObserver = class { constructor(callback){this.callback=callback} observe(){} };
  try {
    const button = mountGlimpseHeaderAction({frame,panel,backButton});
    assert.equal(button.textContent,'Concluir');
    assert.equal(parent.querySelector(':scope > .glimpse-host-controls').querySelector('.glimpse-host-saved'),null);
    button.onclick();
    assert.deepEqual(messages.at(-1),{message:{type:'hub-glimpse-finish'},target:location.origin});
  } finally {
    for (const [key,descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor);
      else delete globalThis[key];
    }
  }
});

test('Top Offers CB conecta o Glimpse ao botão compartilhado sem duplicá-lo na barra',()=>{
  const original = Object.fromEntries(['document','window','location','MutationObserver'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const parent = new Element(), actionButton = new Element(), backButton = new Element();
  parent.append(actionButton,backButton);
  const panel = new Element();
  const messages = [];
  const frame = {contentWindow:{postMessage:(message,target)=>messages.push({message,target})}};
  globalThis.document = {createElement:()=>new Element()};
  globalThis.window = {addEventListener(){}};
  globalThis.location = {origin:'http://127.0.0.1:8765'};
  globalThis.MutationObserver = class { constructor(callback){this.callback=callback} observe(){} };
  try {
    const button = mountGlimpseHeaderAction({frame,panel,backButton,actionButton,finishLabel:'Salvar',showSavedFeedback:true});
    assert.equal(button,actionButton,'a função conecta o botão que já pertence à barra');
    assert.equal(parent.children.length,3,'a barra recebe só o feedback textual; nenhum segundo botão é criado');
    const status=parent.querySelector('.glimpse-host-saved');
    assert.equal(parent.children.indexOf(status),0,'a confirmação fica antes de Salvar');
    assert.equal(parent.children.indexOf(actionButton),1,'o botão permanece depois da área reservada para feedback');
    button.listeners.get('click')();
    assert.equal(button.disabled,true);
    assert.deepEqual(messages.at(-1),{message:{type:'hub-glimpse-finish'},target:location.origin});
  } finally {
    for (const [key,descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor);
      else delete globalThis[key];
    }
  }
});
