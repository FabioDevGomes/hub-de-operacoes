import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('campaign projection is reused only within its derived context',async()=>{
  const source=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
  const code=source.match(/    function campaignRows\(\)\{[^\n]+/)[0];
  let context={campaigns:[{nome_campanha_exato:'Campanha'}],database:{campanhas:[]}},calls=0;
  const sandbox={state:{googleAdsSourceMode:'api'},derivedContext:()=>context,customerIdDigits:x=>String(x||''),OverviewDomain:{apiSnapshotOnlyCampaignRows:()=>{calls++;return[]}}};
  vm.createContext(sandbox);vm.runInContext(code+'\nthis.read=campaignRows;',sandbox);
  const first=sandbox.read();assert.equal(sandbox.read(),first);assert.equal(calls,1);
  context={campaigns:[{nome_campanha_exato:'Nova campanha'}],database:{campanhas:[]}};
  assert.equal(sandbox.read()[0].nome_campanha_exato,'Nova campanha');assert.equal(calls,2);
  sandbox.state.googleAdsSourceMode='manifest';assert.equal(sandbox.read(),context.campaigns);
});
