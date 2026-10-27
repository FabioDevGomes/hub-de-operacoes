import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const context=vm.createContext({window:{}});
vm.runInContext(await readFile(new URL('../src/overview-domain.js',import.meta.url),'utf8'),context);
const latestMccImportUpdates=context.window.OverviewDomain.latestMccImportUpdates;
const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');

test('overview adapter projects per-MCC timestamps from the current base without writing to storage',()=>{
  assert.match(template,/function overviewDisplaySnapshot\(\)\{const snapshot=overviewSnapshot\(\),database=operationalDatabase\(\),today=new Intl\.DateTimeFormat\('sv-SE',\{timeZone:'America\/Sao_Paulo'\}\)\.format\(new Date\(\)\);snapshot\.pausedTodayDate=today;snapshot\.pausedTodayCampaigns=OverviewDomain\.pausedCampaignNamesOnDate/);
  assert.ok(template.includes('getSnapshot:overviewTableSnapshot'));
  assert.ok(template.includes('getCardSnapshot:()=>OverviewCardsDomain.read(state.database)'));
});

test('each registered MCC keeps its current catalogue name and ID while resolving its own latest import',()=>{
  const managers=[
    {id:'111-222-3333',nome:'MCC E-com',ultima_importacao_em:'2026-10-05T17:57:00Z'},
    {id:'444-555-6666',nome:'MCC Nutra',nomes_anteriores:['MCC Nutra Ads']}
  ],coverage={'444-555-6666':{capturada_em:'2026-10-05T18:40:00Z'}};
  const before=JSON.stringify({managers,coverage}),result=latestMccImportUpdates(managers,coverage);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),[
    {id:'111-222-3333',name:'MCC E-com',timestamp:'2026-10-05T17:57:00Z',source:'import'},
    {id:'444-555-6666',name:'MCC Nutra',timestamp:'2026-10-05T18:40:00Z',source:'capture'}
  ]);
  assert.equal(JSON.stringify({managers,coverage}),before,'a projeção não modifica os metadados de origem');
});

test('all manager names remain independent; aliases do not control which MCC is shown',()=>{
  const result=latestMccImportUpdates([
    {id:'111-222-3333',nome:'MCC Agência Sol',ultima_importacao_em:'2026-10-04T12:00:00Z',nomes_anteriores:['MCC E-commerce antiga']},
    {id:'222-333-4444',nome:'MCC Produtos',ultima_importacao_em:'invalid',nomes_anteriores:['MCC Ecom']},
    {id:'555-666-7777',nome:'MCC Crescimento',nomes_anteriores:['MCC Nutra']}
  ],{});
  assert.deepEqual(JSON.parse(JSON.stringify(result)),[
    {id:'111-222-3333',name:'MCC Agência Sol',timestamp:'2026-10-04T12:00:00Z',source:'import'},
    {id:'222-333-4444',name:'MCC Produtos',timestamp:null,source:null},
    {id:'555-666-7777',name:'MCC Crescimento',timestamp:null,source:null}
  ]);
});
