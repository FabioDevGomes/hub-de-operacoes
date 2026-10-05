import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { expectedMccD1Date } from '../extensions/mcc-d0-bridge/mcc-grid-domain.mjs';

const html = await readFile(new URL('../dist/preparador-MCC/index.html', import.meta.url), 'utf8');

const timezoneStart = html.indexOf("    const MCC_OPERATIONAL_TIME_ZONE = 'America/Sao_Paulo';");
const timezoneEnd = html.indexOf('    function parseNumber(raw)', timezoneStart);
assert.ok(timezoneStart >= 0 && timezoneEnd > timezoneStart, 'helpers de data operacional não encontrados');
const dateContext = vm.createContext({});
vm.runInContext(`${html.slice(timezoneStart, timezoneEnd)}\nglobalThis.__dateTools = { expectedMccD1ReportDate, reportDatePairIssue };`, dateContext);
const dateTools = dateContext.__dateTools;
assert.equal(dateTools.expectedMccD1ReportDate(new Date('2026-09-24T02:30:00.000Z')), '2026-09-22');
assert.equal(dateTools.reportDatePairIssue({ dates:['2026-09-23'] }, { dates:['2026-09-24'] }), null);
assert.match(dateTools.reportDatePairIssue({ dates:['2026-09-23'] }, { dates:['2026-09-25'] }), /não são consecutivas/);
assert.match(dateTools.reportDatePairIssue({ dates:['2026-09-23','2026-09-24'] }, { dates:['2026-09-25'] }), /única data explícita/);
assert.match(dateTools.reportDatePairIssue({ dates:['2026-09-23'],managerAccountId:'111-222-3333',managerAccountName:'MCC teste A' }, { dates:['2026-09-24'],managerAccountId:'222-333-4444',managerAccountName:'MCC teste B' }), /MCCs diferentes/);

const decoderStart = html.indexOf('    const MCC_GRID_COLUMNS = [');
const decoderEnd = html.indexOf('    function uniqueRecord(', decoderStart);
const accountIdStart = html.indexOf('    function canonicalAccountId(');
const accountIdEnd = html.indexOf('    function currencyFromText(', accountIdStart);
assert.ok(decoderStart >= 0 && decoderEnd > decoderStart, 'adaptadores estruturais do Preparador não encontrados');
const decoderContext = vm.createContext({
  ABSENT:new Set(['', '--', '—', '-', 'n/a']),
  MCC_OPERATIONAL_TIME_ZONE:'America/Sao_Paulo',
  expectedMccD1ReportDate:dateTools.expectedMccD1ReportDate,
  normalize:value=>String(value ?? '').trim().toLowerCase(),
  extractDates:value=>[...new Set(String(value ?? '').match(/20\d{2}-\d{2}-\d{2}/g) || [])],
  currencyFromText:(...values)=>/\bUSD\b|US\$|U\$/.test(values.join(' ').toUpperCase()) ? 'USD' : null,
  crypto:webcrypto,
  TextEncoder,
  Uint8Array
});
vm.runInContext(`${html.slice(accountIdStart, accountIdEnd)}${html.slice(decoderStart, decoderEnd)}\nglobalThis.__decodeD1 = decodeMccD1GridCapture;`, decoderContext);
const requiredFields = ['campaign','account','status','impressions','clicks','conversions','avg_cost','abs_top_share','top_share','budget','bid_strategy','cost'];
const captureDate = expectedMccD1Date();
const capture = {
  schema:'mcc-d1-grid-v3', periodRole:'d1', source:'mcc_chrome_extension', managerAccountId:'111-222-3333', managerAccountName:'MCC de teste', reportDate:captureDate, locale:'en-US',
  pagination:{ first:1, last:1, total:1 }, campaignCount:1,
  fields:Object.fromEntries(requiredFields.map(key=>[key,{found:true,hidden:false,ambiguous:false}])),
  records:[{campaign:'Campanha D1',account:'Conta Alpha',account_id:'111-222-3333',status:'Qualificada',currency:'USD',impressions:'0',clicks:'—',conversions:'0',avg_cost:'US$ 0.00',abs_top_share:'0%',top_share:'—',budget:'US$ 45.00/day',bid_strategy:'Maximizar conversões',cost:'US$ 0.00'}]
};
const decoded = await decoderContext.__decodeD1(capture);
assert.equal(decoded.source, 'mcc_chrome_extension');
assert.equal(decoded.name, `captura_mcc_d1_${captureDate}.csv`);
assert.match(decoded.text, /^Relatório D−1:/);
assert.match(decoded.text, /"0"/);
assert.match(decoded.text, /"—"/);
assert.equal(decoded.hash.length, 64);
await assert.rejects(decoderContext.__decodeD1({ ...capture, reportDate:'2026-01-01' }), /D−1 esperado para hoje/);

const constantsStart = html.indexOf("    const ABSENT = new Set(");
const constantsEnd = html.indexOf('    const slots =', constantsStart);
const parserStart = html.indexOf('    function normalize(value)', constantsEnd);
const parserEnd = html.indexOf('    const MCC_GRID_COLUMNS = [', parserStart);
const manifestStart = html.indexOf('    function uniqueRecord(', parserEnd);
const manifestEnd = html.indexOf('    function renderSlot(', manifestStart);
assert.ok(constantsStart >= 0 && constantsEnd > constantsStart && parserStart > constantsEnd && parserEnd > parserStart && manifestStart > parserEnd && manifestEnd > manifestStart);
const businessContext = vm.createContext({ Intl, crypto:webcrypto, TextEncoder, TextDecoder, Uint8Array });
vm.runInContext(`${html.slice(constantsStart, constantsEnd)}${html.slice(parserStart, parserEnd)}${html.slice(manifestStart, manifestEnd)}\nglobalThis.__parseSource=parseSource; globalThis.__buildManifest=buildManifest;`, businessContext);
const parityRecords = [
  { ...capture.records[0], campaign:'Oferta um', impressions:'0', clicks:'—', abs_top_share:'0%', top_share:'—', cost:'US$ 0.00' },
  { ...capture.records[0], campaign:'Oferta dois', impressions:'120', clicks:'12', abs_top_share:'25%', top_share:'10%', cost:'US$ 12.50' },
  { ...capture.records[0], campaign:'Oferta três', impressions:'250', clicks:'20', abs_top_share:'40%', top_share:'20%', cost:'US$ 18.00' }
];
const parityCapture = { ...capture, campaignCount:parityRecords.length, pagination:{ first:1, last:3, total:3 }, records:parityRecords };
const directD1Decoded = await decoderContext.__decodeD1(parityCapture);
const directD1Source = businessContext.__parseSource(directD1Decoded, 'd1');
const manualD1Source = businessContext.__parseSource({ ...directD1Decoded, name:'captura_mcc_d1_manual-equivalente.csv', source:'csv_manual' }, 'd1');
const d0Text = directD1Decoded.text.replace(/^Relatório D−1:/, 'Relatório D0:').replace(captureDate, new Date(Date.parse(`${captureDate}T00:00:00Z`) + 86400000).toISOString().slice(0,10));
const d0Source = businessContext.__parseSource({ ...directD1Decoded, text:d0Text, name:'captura_mcc_d0.csv', source:'csv_manual' }, 'd0');
const directManifest = businessContext.__buildManifest(directD1Source, d0Source).manifest;
const manualManifest = businessContext.__buildManifest(manualD1Source, d0Source).manifest;
const d1OnlyResult = businessContext.__buildManifest(directD1Source, null);
const d1OnlyManifest = d1OnlyResult.manifest;
assert.equal(d1OnlyManifest.validacao_manifesto.modo_entrada, 'D_menos_1_somente');
assert.equal(d1OnlyManifest.separacao_temporal.D_menos_1.estado, 'fornecido');
assert.equal(d1OnlyManifest.separacao_temporal.D_zero.estado, 'nao_fornecido');
assert.equal(d1OnlyManifest.fontes.length, 1);
assert.equal(d1OnlyManifest.divergencias.comparacao_realizada, false);
assert.equal(d1OnlyManifest.divergencias.somente_D_menos_1.length, 0, 'um relatório isolado não é apresentado como uma divergência entre fontes');
assert.equal(d1OnlyManifest.validacao_manifesto.totais_controle_D_zero.impressoes, null);
assert.equal(d1OnlyResult.critical.length, 0, 'D−1 isolado válido não exige D0');
assert.equal(d1OnlyManifest.campanhas[0].metricas_D_menos_1.presente, true);
assert.equal(d1OnlyManifest.campanhas[0].metricas_D_zero.presente, false);
assert.equal(d1OnlyManifest.campanhas[0].metricas_D_zero.impressoes.estado, 'ausente', 'D0 ausente não é convertido em zero');
assert.equal(d1OnlyManifest.campanhas[0].situacao_manifesto, 'pronto', 'a ausência do outro período não cria pendência por si só');
const d0OnlyResult = businessContext.__buildManifest(null, d0Source);
assert.equal(d0OnlyResult.manifest.validacao_manifesto.modo_entrada, 'D_zero_somente', 'D0 sozinho continua compatível');
assert.equal(d0OnlyResult.critical.length, 0);
const d1Projection = manifest => ({
  dates:manifest.separacao_temporal.D_menos_1.datas_detectadas,
  campaigns:manifest.campanhas.map(campaign=>{
    const metrics={...campaign.metricas_D_menos_1};
    delete metrics.origem;
    return {name:campaign.nome_campanha_exato,metrics};
  }),
  totals:manifest.validacao_manifesto.totais_controle_D_menos_1,
  percentages:manifest.validacao_manifesto.validacao_percentuais
});
assert.deepEqual(JSON.parse(JSON.stringify(d1Projection(directManifest))),JSON.parse(JSON.stringify(d1Projection(manualManifest))), 'a origem direta e CSV equivalente geram as mesmas métricas D−1 no manifesto');
const offerOne = directManifest.campanhas.find(campaign=>campaign.nome_campanha_exato==='Oferta um');
assert.equal(offerOne.metricas_D_menos_1.conta_id.valor,'111-222-3333');
assert.equal(offerOne.metricas_D_zero.conta_id.valor,'111-222-3333');
assert.equal(offerOne.mcc_id,'111-222-3333','o manifesto relaciona campanhas ao ID administrador, sem confundir com conta_cliente');
assert.equal(offerOne.mcc_nome,'MCC de teste','o rótulo visível da MCC é incluído no manifesto');
assert.deepEqual(JSON.parse(JSON.stringify(directManifest.identificacao_mcc)),{id:'111-222-3333',nome:'MCC de teste'});
assert.equal(offerOne.metricas_D_menos_1.impressoes.estado, 'zero_confirmado');
assert.equal(offerOne.metricas_D_menos_1.cliques_google.estado, 'ausente');
const accountConflictSource={...d0Source,records:d0Source.records.map((record,index)=>index===0?{...record,conta_id:'999-888-7777'}:record)};
assert.ok(businessContext.__buildManifest(directD1Source,accountConflictSource).critical.includes('Há associação financeira ambígua.'),'IDs de conta diferentes em D−1 e D0 bloqueiam a associação');
const managerConflictSource={...d0Source,managerAccountId:'222-333-4444',managerAccountName:'MCC diferente'};
assert.ok(businessContext.__buildManifest(directD1Source,managerConflictSource).critical.includes('D−1 e D0 pertencem a MCCs diferentes.'),'IDs administradores diferentes bloqueiam a combinação D−1/D0');

const allCampaignsCapture = { ...parityCapture,
  fields:{ ...parityCapture.fields, campaign_state:{ found:true, hidden:false, ambiguous:false } },
  records:parityRecords.map((record,index) => ({ ...record, campaign_state:index === 0 ? 'Pausada' : 'Ativada' })),
};
const allCampaignsDecoded = await decoderContext.__decodeD1(allCampaignsCapture);
const allCampaignsD1 = businessContext.__parseSource(allCampaignsDecoded, 'd1');
const allCampaignsD0 = businessContext.__parseSource({ ...allCampaignsDecoded,
  text:allCampaignsDecoded.text.replace(/^Relatório D−1:/, 'Relatório D0:').replace(captureDate, new Date(Date.parse(`${captureDate}T00:00:00Z`) + 86400000).toISOString().slice(0,10)),
}, 'd0');
const allCampaignsResult = businessContext.__buildManifest(allCampaignsD1, allCampaignsD0);
assert.equal(allCampaignsResult.manifest.campanhas.length, 3, 'captura de todas as campanhas não descarta as pausadas');
assert.equal(allCampaignsResult.manifest.campanhas.find(item => item.nome_campanha_exato === 'Oferta um').metricas_D_zero.estado_campanha.valor, 'Pausada');
assert.equal(allCampaignsResult.manifest.campanhas.find(item => item.nome_campanha_exato === 'Oferta dois').metricas_D_zero.estado_campanha.valor, 'Ativada');
assert.equal(allCampaignsResult.critical.length, 0);

const attemptStart = html.indexOf('    function attemptBuild() {');
const attemptEnd = html.indexOf('    function installParsedSource(', attemptStart);
assert.ok(attemptStart >= 0 && attemptEnd > attemptStart, 'orquestração da prévia não encontrada');
const stateContext = vm.createContext({
  slots:{d1:null,d0:null}, currentManifest:null, currentResult:null, previewRole:'d1', currentFilename:'manifesto_mcc.json',
  waitingMessage:null, blockingMessage:null, buildCalls:0, appliedCalls:0,
  showInputBlock:message=>{globalThis.blockingMessage=message;}, resetResults(){},
  reportDatePairIssue:dateTools.reportDatePairIssue,
  buildManifest:(d1,d0)=>{
    globalThis.buildCalls++;
    return { payload:'{}', critical:[], confidence:'alta', manifest:{
      validacao_manifesto:{modo_entrada:d0?'D_menos_1_e_D_zero':'D_menos_1_somente'},
      separacao_temporal:{D_menos_1:{datas_detectadas:d1?.dates||[]},D_zero:{datas_detectadas:d0?.dates||[]}}
    }};
  },
  renderResults(){}, validatePreparedNumbering(){},
  applyManifestToPanel:()=>{globalThis.appliedCalls++;}
});
stateContext.showInputBlock=message=>{stateContext.blockingMessage=message;};
stateContext.buildManifest=(d1,d0)=>{
  stateContext.buildCalls++;
  return { payload:'{}', critical:[], confidence:'alta', manifest:{
    validacao_manifesto:{modo_entrada:d0?'D_menos_1_e_D_zero':'D_menos_1_somente'},
    separacao_temporal:{D_menos_1:{datas_detectadas:d1?.dates||[]},D_zero:{datas_detectadas:d0?.dates||[]}}
  }};
};
stateContext.applyManifestToPanel=()=>{stateContext.appliedCalls++;};
vm.runInContext(`${html.slice(attemptStart, attemptEnd)}\nglobalThis.__attemptBuild = attemptBuild;`, stateContext);
stateContext.slots.d1={dates:['2026-09-23'],records:[{}]};
stateContext.__attemptBuild();
assert.equal(stateContext.buildCalls, 1, 'D−1 sozinho gera uma prévia aplicável após validação');
assert.equal(stateContext.currentResult.manifest.validacao_manifesto.modo_entrada, 'D_menos_1_somente');
stateContext.slots.d0={dates:['2026-09-24'],records:[{}]};
stateContext.__attemptBuild();
assert.equal(stateContext.buildCalls, 2, 'D0 e D−1 consecutivos geram a prévia combinada normal');
assert.equal(stateContext.appliedCalls, 0, 'a prévia não persiste automaticamente');
stateContext.slots.d0={dates:['2026-09-25'],records:[{}]};
stateContext.__attemptBuild();
assert.match(stateContext.blockingMessage, /não são consecutivas/);
assert.equal(stateContext.buildCalls, 2, 'D0 não consecutivo não gera prévia');

const receiverStart = html.indexOf('window.__hubReceiveMccD1Grid = async capture =>');
const receiverEnd = html.indexOf("q('#apply-manifest').addEventListener", receiverStart);
assert.ok(receiverStart >= 0 && receiverEnd > receiverStart);
const receiver = html.slice(receiverStart, receiverEnd);
assert.ok(receiver.includes('decodeMccD1GridCapture(capture)'));
assert.ok(receiver.includes("parseSource(decoded, 'd1')"));
assert.ok(receiver.includes("installParsedSource('d1', parsed)"));
assert.ok(receiver.includes('previewReady:true, waitingForD0:false'));
assert.ok(!receiver.includes('waitingForD0:true'));
assert.ok(!receiver.includes('applyManifestToPanel'), 'receptor D−1 não grava a base');
assert.ok(html.includes('campaignDateChangeCandidates(original, manifest)') && html.includes('A MCC mudou apenas a data de'), 'mudanças de data continuam exigindo confirmação antes de gravar D−1 isolado');

console.log('Preparador D−1: contrato, fuso, captura isolada, compatibilidade D0/D−1 e zero×ausência ok');
