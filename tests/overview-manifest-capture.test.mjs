import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';

const context=vm.createContext({window:{},Intl});
vm.runInContext(await readFile(new URL('../src/overview-domain.js',import.meta.url),'utf8'),context);
vm.runInContext(await readFile(new URL('../src/overview/view.js',import.meta.url),'utf8'),context);
const domain=context.window.OverviewDomain;

test('manifest time uses captured evidence, not general base changes or another MCC coverage',()=>{
  const manifest={captura_D_zero:{capturada_em:'2026-09-30T13:25:00Z'},gerado_em_utc:'2026-09-30T13:40:00Z',cobertura_D_zero_por_mcc:{other:{capturada_em:'2026-09-30T19:00:00Z'}}},before=JSON.stringify(manifest);
  assert.equal(domain.manifestCaptureInfo(manifest).timestamp,'2026-09-30T13:25:00Z');
  assert.equal(domain.manifestCaptureInfo(manifest).source,'capture');
  assert.equal(JSON.stringify(manifest),before);
  manifest.captura_D_menos_1={capturada_em:'2026-09-30T14:00:00Z'};
  assert.equal(domain.manifestCaptureInfo(manifest).timestamp,'2026-09-30T14:00:00Z');
  manifest.captura_D_zero.capturada_em='invalid';manifest.captura_D_menos_1=null;
  assert.equal(domain.manifestCaptureInfo(manifest).timestamp,manifest.gerado_em_utc);
  assert.equal(domain.manifestCaptureInfo(manifest).source,'generated');
  for(const value of [null,{}, {gerado_em_utc:''},{gerado_em_utc:'invalid'},{gerado_em_utc:0}])assert.equal(domain.manifestCaptureInfo(value).timestamp,null);
});

test('manifest card shows Brasília time, full date in tooltip, filters are independent and refresh reads latest evidence',()=>{
  const dom=createRoot(),state={totalsMode:'consolidated',sortKey:'current',sortDir:'desc',campaignStatusFilter:'active'},snapshot={rows:[],activeCount:7,pausedCount:10,manifestCampaignCount:17,dates:{d0:'2026-09-30',d1:'2026-09-29'},d1Totals:[],manifestCaptureInfo:{timestamp:'2026-09-30T01:25:00Z',source:'capture'},baseUpdatedLabel:'01/10/2026, 22:00'};
  const controller=context.window.OverviewView.mount({root:dom.root,state,getSnapshot:()=>snapshot,domain,format,actions:{}});
  const card=()=>dom.get('#kpis').innerHTML.match(/<section class="kpi overview-kpi overview-kpi-manifest"[\s\S]*?<\/section>/)?.[0];
  controller.render();const initial=card();
  assert.match(initial,/29\/09\/2026, 22:25 \(Brasília\)/);
  assert.match(initial,/kpi-value">22:25<\/strong>[\s\S]*Última captura/);
  assert.doesNotMatch(initial,/campanhas ativas|01\/10\/2026|22:00/);
  assert.match(initial,/D−1[\s\S]*29\/09\/2026[\s\S]*D0[\s\S]*30\/09\/2026/);
  for(const mode of ['consolidated','d1','d0'])for(const filter of ['active','paused','all']){state.totalsMode=mode;state.campaignStatusFilter=filter;dom.get('#search').value='irrelevante';controller.render();assert.equal(card(),initial)}
  snapshot.manifestCaptureInfo={timestamp:'2026-09-30T15:40:00Z',source:'generated'};controller.render();
  assert.match(card(),/12:40[\s\S]*Manifesto gerado/);
  snapshot.manifestCaptureInfo={timestamp:null,source:null};controller.render();
  assert.match(card(),/Horário da última captura indisponível/);assert.match(card(),/kpi-value">—<\/strong>/);
  snapshot.manifestCaptureInfo={timestamp:'invalid',source:'capture'};controller.render();assert.match(card(),/Horário indisponível/);
});

test('overview adapter supplies capture evidence from persisted manifest before transient state',async()=>{
  const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
  assert.ok(template.includes('manifestCaptureInfo:OverviewDomain.manifestCaptureInfo(state.database?.manifesto_atual||state.manifest)'));
});
