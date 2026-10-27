import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {mount, accountReportTemplate, detailSortKeys} from '../src/accounts/accounts-view.mjs';
const accountsCss=await readFile(new URL('../src/accounts/accounts.css',import.meta.url),'utf8');

test('matrix exposes a horizontal scrollbar only when its account columns exceed the available width',()=>{
  assert.match(accountsCss,/\.account-matrix-wrap\{max-width:100%;overflow-x:auto;overflow-y:hidden;max-height:none/);
  assert.match(accountsCss,/\.account-matrix\{width:max-content;min-width:100%\}/);
  assert.match(accountsCss,/\.account-matrix-wrap::-webkit-scrollbar\{height:8px\}/);
});

// Minimal DOM boundary double: executes renderers and event callbacks without
// browser storage, network calls, or synthetic writes to the user's profile.
function fakeRoot() {
  const ids = [...accountReportTemplate.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
  const elements = Object.fromEntries(ids.map(id=>[id,{innerHTML:'',textContent:'',value:''}]));
  const labels = ['Conta','Domínio','URL da pre-sell','Campanha','Data de subida','Dias sem impressão','Situação','Investimento','Impressões','Cliques','Conversões','ROI'];
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
function setup(rows=[sample(),sample('pausada')],accountStatuses={}) {
  const root=fakeRoot();
  let snapshot={rows,accountStatuses,period:'Synthetic period'};
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

test('CPA coverage uses only three labels and prioritizes ranges with active campaigns',()=>{
  const {root}=setup([
    sample(),
    sample('pausada'),
    sample('ativa',{productKey:'other',product:'Other',cpa:{range:90,payout:20,payoutCurrency:'USD'}})
  ]);
  let coverage=root.elements.accountCpaGapBody.innerHTML;
  assert.match(coverage,/>Em teste</);
  assert.match(coverage,/>Não testada</);
  assert.doesNotMatch(coverage,/Ativa · pausada|Testada · ativa|Testada · pausada/);

  change(root,'accountCpaCoverageStatus','all');
  coverage=root.elements.accountCpaGapBody.innerHTML;
  assert.match(coverage,/>Em teste</,'faixa mista continua em teste enquanto houver campanha ativa');

  change(root,'accountCpaCoverageStatus','pausada');
  coverage=root.elements.accountCpaGapBody.innerHTML;
  assert.match(coverage,/>Testada</);
  assert.doesNotMatch(coverage,/Em teste|Não testada/,'no recorte só de pausadas, a faixa utilizada aparece como testada');
});

test('matrix shows MCC above each account inside one header cell and escapes the label',()=>{
  const {root}=setup([
    sample('ativa',{mccName:'MCC e-com'}),
    sample('ativa',{account:'B',productKey:'other',product:'Other',mccName:'<img src=x>'})
  ]);
  const html=root.elements.accountMatrixHead.innerHTML;
  assert.equal((html.match(/<tr>/g)||[]).length,1,'MCC labels stay inside the existing header row');
  assert.match(html,/<th><span class="account-matrix-mcc">MCC e-com<\/span><span class="account-matrix-account">Conta A<\/span><\/th>/);
  assert.match(html,/account-matrix-mcc">&lt;img src=x&gt;/);
  assert.doesNotMatch(html,/<img/);
});

test('matrix places the captured account name under the ID, escapes it and omits unavailable names',()=>{
  const {root}=setup([sample('ativa',{account:'111-222-3333',accountName:'3333 - Loja <Azul> .example.shop'})],{'444-555-6666':'active'});
  const header=root.elements.accountMatrixHead.innerHTML;
  assert.match(header,/Conta 111-222-3333<\/span><span class="account-matrix-name">Loja &lt;Azul&gt;<\/span>/);
  assert.doesNotMatch(header,/example.shop/);
  assert.match(header,/Conta 444-555-6666<\/span><\/th>/);
});

test('paused underline is shown only for cells without active campaigns, including when paused campaigns are included',()=>{
  const {root}=setup([
    sample('ativa',{account:'A'}),
    sample('pausada',{account:'A'}),
    sample('pausada',{account:'B'})
  ]);
  const matrixCells = () => {
    const row = root.elements.accountMatrixBody.innerHTML.match(/<tr class="account-product-row[\s\S]*?<\/tr>/)?.[0] || '';
    return [...row.matchAll(/<td class="account-cell ([^"]*)"/g)].map(match=>match[1]);
  };

  change(root,'accountReportStatus','all');
  let cells = matrixCells();
  assert.equal(cells.length,2);
  assert.match(cells[0],/has-campaigns/);
  assert.doesNotMatch(cells[0],/has-paused/,'a cell with active and paused campaigns has no red underline');
  assert.match(cells[1],/has-paused/,'a cell with paused campaigns and zero active campaigns keeps the red underline');

  change(root,'accountReportStatus','ativa');
  root.listeners.change({target:{id:'accountIncludePausedAccounts',checked:true}});
  cells = matrixCells();
  assert.equal(cells.length,2,'the checkbox adds the paused-only account column to the matrix');
  assert.doesNotMatch(cells[0],/has-paused/,'the rule remains based on active count with paused campaigns included');
  assert.match(cells[1],/has-paused/);
});

test('matrix keeps a directory-active account visible with empty cells and no fabricated product',()=>{
  const {root}=setup([sample()],{'333-444-5555':'active'});
  assert.match(root.elements.accountReportAccount.innerHTML,/value="333-444-5555">333-444-5555/);
  assert.match(root.elements.accountMatrixHead.innerHTML,/<th><span class="account-matrix-mcc">MCC não identificada<\/span><span class="account-matrix-account">Conta 333-444-5555<\/span><\/th>/);
  assert.match(root.elements.accountMatrixBody.innerHTML,/title="">—<\/td>/);
  assert.match(root.elements.accountReportKpis.innerHTML,/Contas identificadas/);

  change(root,'accountReportStatus','pausada');
  assert.match(root.elements.accountMatrixHead.innerHTML,/Conta 333-444-5555/,'campaign situation filters do not remove active directory account columns');
});

test('detail renders twelve aligned columns, safe domain links and missing values',()=>{
  const {root}=setup([sample()]);
  const html=root.elements.accountDetailBody.innerHTML;
  assert.equal(detailSortKeys.length,12); assert.equal((html.match(/<td\b/g)||[]).length,12);
  assert.match(html,/https:\/\/hpanel.hostinger.com\/websites\/example.shop/);
  assert.match(html,/target="_blank" rel="noopener noreferrer"/);
  assert.match(html,/data-campaign-date[^>]*>01\/01<\/td><td/);
  assert.match(html,/A campanha teve impressões no dia mais recente/);
  assert.match(html,/>—<\/td>/);
});

test('header actions toggle sort direction accessibly and retain stable labels',()=>{
  const {root}=setup([sample()]);
  click(root,'[data-account-sort]',{accountSort:'investment'});
  const th=root.header.cells[7];
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
  assert.match(root.elements.accountDetailBody.innerHTML,/colspan="12"/);
  assert.match(root.elements.accountDetailBody.innerHTML,/Selecione um produto/);
});

test('product account chart refreshes on new snapshots, shows every product and names the status scope',()=>{
  const initial=Array.from({length:9},(_,index)=>sample('ativa',{
    productKey:`product-${index+1}`,product:`Product ${index+1}`,account:`A${index+1}`
  }));
  const {root,controller,update}=setup(initial);
  const barRows=()=>root.elements.accountProductBars.innerHTML.match(/class="account-bar-row(?: account-bar-row--with-secondary)?"/g)||[];
  assert.equal(barRows().length,9);
  assert.match(root.elements.accountProductBarsCaption.textContent,/filtro Ativas/);

  update({rows:[...initial,sample('ativa',{productKey:'new-upload',product:'New Upload',account:'B'})],accountStatuses:{},period:'Updated period'});
  controller.render();
  assert.equal(barRows().length,10);
  assert.match(root.elements.accountProductBars.innerHTML,/New Upload/);

  change(root,'accountReportStatus','pausada');
  assert.match(root.elements.accountProductBarsCaption.textContent,/filtro Pausadas/);
  assert.equal(barRows().length,0,'active campaigns are excluded after the shared filter changes to Pausadas');
});

test('historical accounts are the bar, active accounts appear first, and only their counts at two or fewer are red',()=>{
  const {root}=setup([
    sample('ativa',{productKey:'single',product:'Single account',account:'A'}),
    sample('ativa',{productKey:'multiple',product:'Multiple accounts',account:'B'}),
    sample('ativa',{productKey:'multiple',product:'Multiple accounts',account:'C'}),
    sample('ativa',{productKey:'multiple',product:'Multiple accounts',account:'D'}),
    sample('ativa',{productKey:'unidentified',product:'Unidentified',account:'Sem conta'})
  ]);
  const productBars=root.elements.accountProductBars.innerHTML;
  assert.match(productBars,/class="account-bar-row account-bar-row--with-secondary"><span class="account-product-name--low-history" title="Single account">Single account<\/span><div class="account-bar-track"><div class="account-bar-fill account-bar-fill--low-history"[\s\S]*?<strong class="account-bar-active-count account-bar-active-count--low" title="Contas distintas com campanhas ativas">1<\/strong><strong class="account-bar-history-count--low" title="Contas distintas testadas no histórico">1<\/strong>/);
  assert.match(productBars,/class="account-bar-row account-bar-row--with-secondary"><span title="Multiple accounts">Multiple accounts<\/span><div class="account-bar-track"><div class="account-bar-fill"[\s\S]*?<strong class="account-bar-active-count" title="Contas distintas com campanhas ativas">3<\/strong><strong title="Contas distintas testadas no histórico">3<\/strong>/);
  assert.match(productBars,/class="account-bar-row account-bar-row--with-secondary"><span class="account-product-name--low-history" title="Unidentified">Unidentified<\/span><div class="account-bar-track"><div class="account-bar-fill account-bar-fill--low-history"[\s\S]*?<strong class="account-bar-active-count account-bar-active-count--low" title="Contas distintas com campanhas ativas">0<\/strong><strong class="account-bar-history-count--low" title="Contas distintas testadas no histórico">0<\/strong>/);
  assert.doesNotMatch(root.elements.accountCpaRangeBars.innerHTML,/account-bar-active-count--low/,'a regra não altera o gráfico de faixas de CPA');
  assert.match(accountsCss,/\.account-bar-active-count--low\{color:#ff9aa5\}/);
  assert.match(accountsCss,/\.account-bar-fill--low-history\{background:linear-gradient\(90deg,#e2606f,#ff9aa5\)\}/);
  assert.match(accountsCss,/\.account-bar-history-count--low\{color:#ff9aa5\}/);
});

test('pre-sell column reads current Track snapshots, renders safe links and clears stale associations',()=>{
  const root=fakeRoot();
  let tracks=[{productLabel:'Example - conta 9737',hostname:'presell.example.shop',origin:'https://presell.example.shop'}];
  const controller=mount({root,format,getSnapshot:()=>({rows:[sample('ativa',{account:'761-756-9737'})],period:''}),getTrackingDomains:()=>tracks});
  controller.render();
  assert.match(root.elements.accountDetailBody.innerHTML,/href="https:\/\/presell.example.shop\/" target="_blank" rel="noopener noreferrer"/);
  assert.equal((root.elements.accountDetailBody.innerHTML.match(/<td\b/g)||[]).length,12);
  tracks=[];controller.render();
  assert.doesNotMatch(root.elements.accountDetailBody.innerHTML,/presell.example.shop/);
});

test('untrusted names and invalid domain text are escaped, never rendered as markup',()=>{
  const {root}=setup([sample('ativa',{product:'<img src=x>',campaign:'<script>',identity:{name:'<b>text</b>',dateLabel:'—',dateSort:null},domain:'javascript:alert(1)'})]);
  assert.ok(!root.elements.accountMatrixBody.innerHTML.includes('<img'));
  assert.match(root.elements.accountMatrixBody.innerHTML,/&lt;img/);
  assert.ok(!root.elements.accountDetailBody.innerHTML.includes('<a '));
  assert.ok(!root.elements.accountDetailBody.innerHTML.includes('<script>'));
});
