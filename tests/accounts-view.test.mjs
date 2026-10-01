import assert from 'node:assert/strict';
import test from 'node:test';
import {mount, accountReportTemplate, detailSortKeys} from '../src/accounts/accounts-view.mjs';

// Minimal DOM boundary double: executes renderers and event callbacks without
// browser storage, network calls, or synthetic writes to the user's profile.
function fakeRoot() {
  const ids = [...accountReportTemplate.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
  const elements = Object.fromEntries(ids.map(id=>[id,{innerHTML:'',textContent:'',value:''}]));
  const labels = ['Conta','Domínio','Campanha','Data de subida','Dias sem impressão','Situação','Investimento','Impressões','Cliques','Conversões','ROI'];
  const header = {cells:labels.map(label=>({
    textContent:label,innerHTML:'',attributes:{},
    querySelector(){return {textContent:label}},
    setAttribute(name,value){this.attributes[name]=value}
  }))};
  elements.accountDetailBody.closest = () => ({querySelector:()=>header});
  return {elements,header,listeners:{},innerHTML:'',
    querySelector(selector){return elements[selector.slice(1)]},
    addEventListener(type,callback){this.listeners[type]=callback}
  };
}
const sample = (status='ativa', overrides={}) => ({
  productKey:'example',product:'Example',campaign:'01/01 - Example 70%',account:'A',status,
  identity:{name:'Example 70%',dateLabel:'01/01',dateSort:101},
  cpa:{range:70,payout:20,payoutCurrency:'USD'},zeroDays:status==='pausada'?null:0,
  domain:'.example.shop',totals:{investment:0,impressions:0,clicks:0,conversions:null},roi:null,...overrides
});
const format = {num:value=>value==null?'—':String(value),money:value=>value==null?'—':'$'+value,pct:String};
function setup(rows=[sample(),sample('pausada')]) {
  const root=fakeRoot();
  let snapshot={rows,period:'Synthetic period'};
  const controller=mount({root,getSnapshot:()=>snapshot,format});
  controller.render();
  return {root,controller,update(value){snapshot=value}};
}
const change = (root,id,value) => root.listeners.change({target:{id,value}});
const click = (root,selector,dataset) => root.listeners.click({target:{closest:query=>query===selector?{dataset}:null}});

test('all three status selectors share one state, including detail-origin changes',()=>{
  const {root}=setup();
  assert.match(root.elements.accountDetailBody.innerHTML,/>Ativa</);
  for(const origin of ['accountReportStatus','accountCpaCoverageStatus','accountDetailStatusFilter']) {
    for(const status of ['pausada','all','ativa']) {
      change(root,origin,status);
      for(const id of ['accountReportStatus','accountCpaCoverageStatus','accountDetailStatusFilter']) assert.equal(root.elements[id].value,status);
      assert.equal(root.elements.accountDetailCount.textContent,status==='all'?'2 campanhas':'1 campanha');
      if(status==='pausada') assert.match(root.elements.accountDetailBody.innerHTML,/>Pausada</);
    }
  }
});

test('detail renders eleven aligned columns, safe domain links and missing values',()=>{
  const {root}=setup([sample()]);
  const html=root.elements.accountDetailBody.innerHTML;
  assert.equal(detailSortKeys.length,11); assert.equal((html.match(/<td\b/g)||[]).length,11);
  assert.match(html,/https:\/\/hpanel.hostinger.com\/websites\/example.shop/);
  assert.match(html,/target="_blank" rel="noopener noreferrer"/);
  assert.match(html,/data-campaign-date[^>]*>01\/01<\/td><td/);
  assert.match(html,/A campanha teve impressões no dia mais recente/);
  assert.match(html,/>—<\/td>/);
});

test('header actions toggle sort direction accessibly and retain stable labels',()=>{
  const {root}=setup([sample()]);
  click(root,'[data-account-sort]',{accountSort:'investment'});
  const th=root.header.cells[6];
  assert.equal(th.attributes['aria-sort'],'ascending');
  assert.match(th.innerHTML,/Ordenar por Investimento crescente/);
  click(root,'[data-account-sort]',{accountSort:'investment'});
  assert.equal(th.attributes['aria-sort'],'descending');
  assert.match(th.innerHTML,/Ordenar por Investimento decrescente/);
});

test('selection, filters and subsequent data refresh use the latest read-only snapshot',()=>{
  const {root,controller,update}=setup([sample(),sample('ativa',{productKey:'other',product:'Other',account:'B'})]);
  click(root,'.account-product-row',{product:'other'});
  assert.match(root.elements.accountDetailCaption.textContent,/^Other:/);
  change(root,'accountReportAccount','A');
  assert.match(root.elements.accountDetailCaption.textContent,/^Example:/);
  update({rows:[],period:'No period'}); controller.render();
  assert.equal(root.elements.accountReportAccount.value,'all');
  assert.match(root.elements.accountDetailBody.innerHTML,/colspan="11"/);
  assert.match(root.elements.accountDetailBody.innerHTML,/Selecione um produto/);
});

test('untrusted names and invalid domain text are escaped, never rendered as markup',()=>{
  const {root}=setup([sample('ativa',{product:'<img src=x>',campaign:'<script>',identity:{name:'<b>text</b>',dateLabel:'—',dateSort:null},domain:'javascript:alert(1)'})]);
  assert.ok(!root.elements.accountMatrixBody.innerHTML.includes('<img'));
  assert.match(root.elements.accountMatrixBody.innerHTML,/&lt;img/);
  assert.ok(!root.elements.accountDetailBody.innerHTML.includes('<a '));
  assert.ok(!root.elements.accountDetailBody.innerHTML.includes('<script>'));
});
