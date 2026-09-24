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

const decoderStart = html.indexOf('    const MCC_GRID_COLUMNS = [');
const decoderEnd = html.indexOf('    function uniqueRecord(', decoderStart);
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
vm.runInContext(`${html.slice(decoderStart, decoderEnd)}\nglobalThis.__decodeD1 = decodeMccD1GridCapture;`, decoderContext);
const requiredFields = ['campaign','account','status','impressions','clicks','conversions','avg_cost','abs_top_share','top_share','budget','bid_strategy','cost'];
const captureDate = expectedMccD1Date();
const capture = {
  schema:'mcc-d1-grid-v1', periodRole:'d1', source:'mcc_chrome_extension', reportDate:captureDate, locale:'en-US',
  pagination:{ first:1, last:1, total:1 }, campaignCount:1,
  fields:Object.fromEntries(requiredFields.map(key=>[key,{found:true,hidden:false,ambiguous:false}])),
  records:[{campaign:'Campanha D1',account:'Conta Alpha',status:'Qualificada',currency:'USD',impressions:'0',clicks:'—',conversions:'0',avg_cost:'US$ 0.00',abs_top_share:'0%',top_share:'—',budget:'US$ 45.00/day',bid_strategy:'Maximizar conversões',cost:'US$ 0.00'}]
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
assert.equal(offerOne.metricas_D_menos_1.impressoes.estado, 'zero_confirmado');
assert.equal(offerOne.metricas_D_menos_1.cliques_google.estado, 'ausente');

const attemptStart = html.indexOf('    function attemptBuild() {');
const attemptEnd = html.indexOf('    async function loadDecoded(', attemptStart);
assert.ok(attemptStart >= 0 && attemptEnd > attemptStart, 'orquestração da prévia não encontrada');
const stateContext = vm.createContext({
  slots:{d1:null,d0:null}, currentManifest:null, currentResult:null, previewRole:'d1', currentFilename:'manifesto_mcc.json',
  waitingMessage:null, blockingMessage:null, buildCalls:0, appliedCalls:0,
  showWaitingForD0:()=>{globalThis.waitingMessage='D−1 recebido e validado. Aguardando D0 para gerar a prévia.';},
  showInputBlock:message=>{globalThis.blockingMessage=message;}, resetResults(){},
  reportDatePairIssue:dateTools.reportDatePairIssue,
  buildManifest:(d1,d0)=>{
    globalThis.buildCalls++;
    return { payload:'{}', critical:[], confidence:'alta', manifest:{
      validacao_manifesto:{modo_entrada:'D_menos_1_e_D_zero'},
      separacao_temporal:{D_menos_1:{datas_detectadas:d1?.dates||[]},D_zero:{datas_detectadas:d0.dates}}
    }};
  },
  renderResults(){}, validatePreparedNumbering(){},
  applyManifestToPanel:()=>{globalThis.appliedCalls++;}
});
stateContext.showWaitingForD0=()=>{stateContext.waitingMessage='D−1 recebido e validado. Aguardando D0 para gerar a prévia.';};
stateContext.showInputBlock=message=>{stateContext.blockingMessage=message;};
stateContext.buildManifest=(d1,d0)=>{
  stateContext.buildCalls++;
  return { payload:'{}', critical:[], confidence:'alta', manifest:{
    validacao_manifesto:{modo_entrada:'D_menos_1_e_D_zero'},
    separacao_temporal:{D_menos_1:{datas_detectadas:d1?.dates||[]},D_zero:{datas_detectadas:d0.dates}}
  }};
};
stateContext.applyManifestToPanel=()=>{stateContext.appliedCalls++;};
vm.runInContext(`${html.slice(attemptStart, attemptEnd)}\nglobalThis.__attemptBuild = attemptBuild;`, stateContext);
stateContext.slots.d1={dates:['2026-09-23'],records:[{}]};
stateContext.__attemptBuild();
assert.match(stateContext.waitingMessage, /Aguardando D0/);
assert.equal(stateContext.buildCalls, 0);
stateContext.slots.d0={dates:['2026-09-24'],records:[{}]};
stateContext.__attemptBuild();
assert.equal(stateContext.buildCalls, 1, 'D0 e D−1 consecutivos geram a prévia normal');
assert.equal(stateContext.appliedCalls, 0, 'a prévia não persiste automaticamente');
stateContext.slots.d0={dates:['2026-09-25'],records:[{}]};
stateContext.__attemptBuild();
assert.match(stateContext.blockingMessage, /não são consecutivas/);
assert.equal(stateContext.buildCalls, 1, 'D0 não consecutivo não gera prévia');

const receiverStart = html.indexOf('window.__hubReceiveMccD1Grid = async capture =>');
const receiverEnd = html.indexOf("q('#apply-manifest').addEventListener", receiverStart);
assert.ok(receiverStart >= 0 && receiverEnd > receiverStart);
const receiver = html.slice(receiverStart, receiverEnd);
assert.ok(receiver.includes('decodeMccD1GridCapture(capture)'));
assert.ok(receiver.includes("parseSource(decoded, 'd1')"));
assert.ok(receiver.includes("installParsedSource('d1', parsed)"));
assert.ok(receiver.includes('waitingForD0:true'));
assert.ok(!receiver.includes('applyManifestToPanel'), 'receptor D−1 não grava a base');
assert.ok(html.includes('D−1 recebido e validado. Aguardando D0 para gerar a prévia.'));

console.log('Preparador D−1: contrato, fuso, datas consecutivas, espera por D0, prévia sem autoaplicação e zero×ausência ok');
