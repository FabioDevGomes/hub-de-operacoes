import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { confirmManualDeployVerification, countPendingDeployTargets, selectActiveDeployJob } from '../src/copy-ficha/copy-ficha-deploy.mjs';

const published = () => ({ status: 'published', deploymentState: 'success', deploymentHistory: [{ status: 'success' }] });
const pending = () => ({ status: 'pending', deploymentState: 'pending' });

test('a etapa conta destinos pendentes em todos os grupos salvos', () => {
  const jobs = [
    { id: 'old', targets: [pending(), published()] },
    { id: 'new', targets: [pending(), pending()] },
  ];
  assert.equal(countPendingDeployTargets(jobs), 3);
});

test('a abertura automática escolhe a Pre-Sell pendente mais antiga', () => {
  const old = { id: 'old', targets: [pending()] };
  const complete = { id: 'complete', targets: [published()] };
  const newer = { id: 'newer', targets: [pending()] };
  assert.equal(selectActiveDeployJob([old, complete, newer]), old);
});

test('a geração recém-criada continua abrindo seu próprio grupo', () => {
  const old = { id: 'old', targets: [pending()] };
  const newer = { id: 'newer', targets: [pending()] };
  assert.equal(selectActiveDeployJob([old, newer], 'newer'), newer);
});

test('sem pendências, o resultado mais recente continua acessível', () => {
  const old = { id: 'old', targets: [published()] };
  const latest = { id: 'latest', targets: [published()] };
  assert.equal(selectActiveDeployJob([old, latest]), latest);
});

test('validação manual persiste domínio e pasta, libera a fila sem registrar publicação do Hub', () => {
  let saved=JSON.stringify([{id:'job',status:'pending',targets:[{
    id:'target',status:'error',deploymentState:'failed',domain:'trylymphtonic.vornella.shop',parentDomain:'vornella.shop',prefix:'trylymphtonic',username:'u572283517',directory:'trylymphtonic',publicUrl:'https://trylymphtonic.vornella.shop',hasPublished:false,error:'A lista da API não encontrou os arquivos.',planSummary:{fileCount:6},deploymentHistory:[{status:'partial',uploadedCount:0,totalCount:6}],
  }]}]);
  const storage={getItem:()=>saved,setItem:(key,value)=>{saved=value}};
  assert.equal(confirmManualDeployVerification('job','target',{storage,confirmedAtUtc:'2026-10-29T14:00:00.000Z'}),true);
  const job=JSON.parse(saved)[0],target=job.targets[0];
  assert.equal(target.status,'manual-verified');
  assert.deepEqual(target.manualVerification,{status:'confirmed',domain:'trylymphtonic.vornella.shop',parentDomain:'vornella.shop',username:'u572283517',directory:'trylymphtonic',confirmedAtUtc:'2026-10-29T14:00:00.000Z'});
  assert.equal(target.hasPublished,false);
  assert.equal(target.error,'');
  assert.equal(target.planSummary,null);
  assert.equal(target.deploymentHistory.length,1,'o histórico automático permanece intacto');
  assert.equal(countPendingDeployTargets([job]),0,'o destino validado manualmente sai da fila');
  assert.equal(confirmManualDeployVerification('job','target',{storage}),false,'uma validação já registrada não é reaplicada');
});

test('validação manual exige destino definido e não pode marcar lote substituído', () => {
  const makeStorage=job=>{let saved=JSON.stringify([job]);return {getItem:()=>saved,setItem:(key,value)=>{saved=value},read:()=>JSON.parse(saved)[0]}};
  const incomplete=makeStorage({id:'incomplete',targets:[{id:'t',status:'pending',parentDomain:'vornella.shop',prefix:'trylymphtonic',username:'u572283517',directory:''}]});
  assert.equal(confirmManualDeployVerification('incomplete','t',{storage:incomplete}),false);
  assert.equal(incomplete.read().targets[0].manualVerification,undefined);
  const superseded=makeStorage({id:'old',targets:[{id:'t',status:'superseded',parentDomain:'vornella.shop',prefix:'trylymphtonic',username:'u572283517',directory:'trylymphtonic'}]});
  assert.equal(confirmManualDeployVerification('old','t',{storage:superseded}),false);
  assert.equal(superseded.read().targets[0].manualVerification,undefined);
});

test('a etapa não renderiza o seletor visual nem ações de remoção de grupos', async () => {
  const source = await readFile(new URL('../src/copy-ficha/copy-ficha-deploy.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Lotes salvos|data-deploy-job-list|data-deploy-action="(?:select-job|remove-job)"/);
});
