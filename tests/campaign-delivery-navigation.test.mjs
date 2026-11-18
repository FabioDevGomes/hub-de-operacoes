import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const ctx=vm.createContext({window:{},URLSearchParams,encodeURIComponent});
vm.runInContext(await readFile(new URL('../src/view-registry.js',import.meta.url),'utf8'),ctx);
vm.runInContext(await readFile(new URL('../src/navigation-controller.js',import.meta.url),'utf8'),ctx);
function setup(search){
  const location={pathname:'/',search};let seen='';
  const history={replaceState:(_s,_t,url)=>{const parsed=new URL(url,'http://localhost');location.search=parsed.search}};
  const document={body:{classList:{toggle(){}}},getElementById(){return null},defaultView:{}};
  const state={activeView:'google-ads-create'};
  const entries={'google-ads-create':{render(){seen=location.search}}};
  const controller=ctx.window.PanelNavigation.create({registry:ctx.window.PanelViews,document,history,location,state,entries});
  return {controller,location,seen:()=>seen};
}
test('a criação recebe os identificadores da entrega antes de renderizar',()=>{
  for(const query of ['presell_handoff=abc123','presell_handoff_job=job123']){
    const h=setup('?view=google-ads-create&campaign_delivery_id=delivery123&'+query);
    h.controller.refresh();
    const params=new URLSearchParams(h.seen());
    assert.equal(params.get('campaign_delivery_id'),'delivery123');
    const [key,value]=query.split('=');assert.equal(params.get(key),value);
  }
});
test('navegar pelo menu descarta o contexto anterior',()=>{
  const h=setup('?view=google-ads-create&campaign_delivery_id=delivery123&presell_handoff=abc123');
  h.controller.open('google-ads-create',{source:'menu'});
  assert.equal(h.location.search,'?view=google-ads-create');
});
