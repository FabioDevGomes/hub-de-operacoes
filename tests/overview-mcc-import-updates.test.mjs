import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const context=vm.createContext({window:{}});
vm.runInContext(await readFile(new URL('../src/overview-domain.js',import.meta.url),'utf8'),context);
const latestMccImportUpdates=context.window.OverviewDomain.latestMccImportUpdates;
const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');

test('overview adapter projects per-MCC timestamps from the current base without writing to storage',()=>{
  assert.match(template,/function overviewDisplaySnapshot\(\)\{const snapshot=overviewSnapshot\(\),today=new Intl\.DateTimeFormat\('sv-SE',\{timeZone:'America\/Sao_Paulo'\}\)\.format\(new Date\(\)\);snapshot\.pausedTodayDate=today;snapshot\.pausedTodayCampaigns=OverviewDomain\.pausedCampaignNamesOnDate/);
  assert.match(template,/getSnapshot:overviewDisplaySnapshot/);
});

test('MCC Ecom and Nutra show the exact latest import, preserving capture-only history as marked fallback',()=>{
  const managers=[
    {id:'111-222-3333',nome:'MCC E-com',ultima_importacao_em:'2026-10-05T17:57:00Z'},
    {id:'444-555-6666',nome:'MCC Nutra',nomes_anteriores:['MCC Nutra Ads']}
  ],coverage={'444-555-6666':{capturada_em:'2026-10-05T18:40:00Z'}};
  const before=JSON.stringify({managers,coverage}),result=latestMccImportUpdates(managers,coverage);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{
    ecom:{label:'MCC Ecom',timestamp:'2026-10-05T17:57:00Z',source:'import'},
    nutra:{label:'MCC Nutra',timestamp:'2026-10-05T18:40:00Z',source:'capture'}
  });
  assert.equal(JSON.stringify({managers,coverage}),before,'a projeção não modifica os metadados de origem');
});

test('MCC matching tolerates alternate e-commerce naming and does not invent timestamps',()=>{
  const result=latestMccImportUpdates([
    {id:'111-222-3333',nome:'MCC E-commerce antiga',ultima_importacao_em:'2026-10-04T12:00:00Z'},
    {id:'222-333-4444',nome:'MCC Ecom',ultima_importacao_em:'invalid'},
    {id:'555-666-7777',nome:'MCC Nutra'}
  ],{});
  assert.equal(result.ecom.timestamp,'2026-10-04T12:00:00Z','seleciona o horário válido mais recente entre aliases MCC');
  assert.equal(result.ecom.source,'import');
  assert.deepEqual(JSON.parse(JSON.stringify(result.nutra)),{label:'MCC Nutra',timestamp:null,source:null});
});
