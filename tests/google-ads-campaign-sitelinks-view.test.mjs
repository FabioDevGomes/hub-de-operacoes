import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const source=await readFile(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs',import.meta.url),'utf8');
const styles=await readFile(new URL('../src/google-ads/google-ads.css',import.meta.url),'utf8');
const start=source.indexOf('  function renderCampaignSitelinksBatch() {');
const end=source.indexOf('\n  function pendingCampaignDestinationUrlUpdates(',start);
assert.ok(start>=0&&end>start,'campaign sitelinks batch renderer should exist');

function element(tag){
  const item={tag,children:[],listeners:{},textContent:'',className:'',disabled:false,append(...items){this.children.push(...items)},setAttribute(){},addEventListener(name,handler){this.listeners[name]=handler}};
  item.classList={toggle(name,force){
    const names=new Set(item.className.split(/\s+/).filter(Boolean));
    if(force)names.add(name);else names.delete(name);
    item.className=Array.from(names).join(' ');
  }};
  return item;
}

test('campaign sitelinks batch omits the explanatory paragraph and keeps its controls',()=>{
  const panels=[];
  const createdCampaigns=[{campaignName:'Campaign 01',customerId:'123'}];
  const context=vm.createContext({
    document:{createElement:element},
    completed:true,campaignBatchRestored:false,activeCampaignBatchId:'batch-1',createdCampaigns,
    pendingCampaignSitelinks:()=>createdCampaigns,campaignSitelinksSignature:()=> 'signature',
    activeCampaignBatchSitelinks:[],busy:false,campaignSitelinksBatchApplying:false,
    campaignSitelinksBatchProgress:null,campaignSitelinksBatchAttempted:false,
    resultArea:{append:panel=>panels.push(panel)},openCopyImportDialog:()=>{},applyCampaignSitelinksBatch:()=>{}
  });
  vm.runInContext(source.slice(start,end)+';this.render=renderCampaignSitelinksBatch',context);
  context.render();

  const panel=panels[0];
  assert.ok(panel);
  assert.deepEqual(Array.from(panel.children,child=>child.tag),['h3','div','p']);
  assert.equal(panel.children[0].textContent,'Sitelinks deste lote');
  assert.deepEqual(Array.from(panel.children[1].children,child=>child.textContent),[
    'Selecionar sitelinks da copy','Aplicar a 1 campanhas do lote'
  ]);
  assert.match(panel.children[1].children[1].className,/google-ads-campaign-sitelinks-apply/);
  assert.doesNotMatch(panel.children[1].children[1].className,/is-confirmed/);
  assert.doesNotMatch(panel.children.map(child=>child.textContent).join(' '),/Aplique até 6 sitelinks da copy/);
});

test('apply button turns green only after every campaign confirms the current sitelinks',()=>{
  const panels=[];
  const createdCampaigns=[{
    campaignName:'Campaign 01',customerId:'123',
    sitelinksResult:{verified:true,signature:'signature'}
  }];
  const context=vm.createContext({
    document:{createElement:element},
    completed:true,campaignBatchRestored:false,activeCampaignBatchId:'batch-1',createdCampaigns,
    pendingCampaignSitelinks:()=>[],campaignSitelinksSignature:()=> 'signature',
    activeCampaignBatchSitelinks:[{anchor:1,title:'Shipping',description1:'',description2:''}],
    busy:false,campaignSitelinksBatchApplying:false,
    campaignSitelinksBatchProgress:null,campaignSitelinksBatchAttempted:false,
    resultArea:{append:panel=>panels.push(panel)},openCopyImportDialog:()=>{},applyCampaignSitelinksBatch:()=>{}
  });
  vm.runInContext(source.slice(start,end)+';this.render=renderCampaignSitelinksBatch',context);
  context.render();

  const apply=panels[0].children[1].children[1];
  assert.equal(apply.textContent,'Sitelinks confirmados em todas as campanhas');
  assert.equal(apply.disabled,true);
  assert.match(apply.className,/is-confirmed/);
  assert.match(styles,/\.google-ads-campaign-sitelinks-apply\.is-confirmed:disabled\{[^}]*background:linear-gradient\([^}]*\)/);
});
