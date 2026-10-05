import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../src/database.js',import.meta.url),'utf8');
const context=vm.createContext({window:{},structuredClone});
vm.runInContext(source,context);
const db=context.window.CampaignDatabase;

const accountId='617-657-7527';
const campaignName=percent=>`01/10 - Carbonone 03 (GM-BB-US) ${percent}% - U$ 95`;
const manifest=(date,name,{account=accountId,alsoOld=false}={})=>({
  separacao_temporal:{D_zero:{datas_detectadas:[date]},D_menos_1:{datas_detectadas:[]}},
  campanhas:[name,...(alsoOld?[campaignName(85)]:[])].map(nome_campanha_exato=>({
    nome_campanha_exato,
    metricas_D_zero:{data:{valor:date},estrategia_lance:{valor:'CPA desejado'},...(account?{conta_id:{valor:account}}:{})},
    metricas_D_menos_1:{presente:false},
  })),
});
const rowFactory=source=>({date:source.metricas_D_zero.data.valor,period:'d0',cells:{B:{value:12},N:{value:`CPA ${source.nome_campanha_exato.match(/(\d+)%/)[1]}%`}}});

const first=db.importManifest(db.create(),manifest('2026-10-01',campaignName(85)),rowFactory).base;
const originalId=first.campanhas[0].id;
const incoming=manifest('2026-10-02',campaignName(80));
const candidates=db.campaignCpaChangeCandidates(first,incoming);
assert.equal(candidates.length,1,'uma troca isolada de percentual deve reconhecer a campanha ativa');
assert.equal(candidates[0].oldPercent,85);
assert.equal(candidates[0].newPercent,80);
assert.equal(db.campaignNumberReuseIssues(first,incoming).length,0,'troca confirmada de CPA não gera conflito de numeração');
assert.equal(db.campaignNumberHistoryWarnings(first,incoming).length,0,'troca reconhecida de CPA não gera aviso de campanha histórica');

const updated=db.importManifest(first,incoming,rowFactory).base;
assert.equal(updated.campanhas.length,1,'não cria uma nova identidade de campanha');
assert.equal(updated.campanhas[0].id,originalId,'preserva o ID da campanha');
assert.equal(updated.campanhas[0].nome_mcc,campaignName(80));
assert.deepEqual(Array.from(updated.campanhas[0].cpa_titulos_anteriores),[campaignName(85)]);
assert.equal(updated.diario.length,2,'preserva o dia anterior e adiciona o novo dia');
assert.equal(updated.diario.find(row=>row.data==='2026-10-01').celulas.N.value,'CPA 85%');
assert.equal(updated.diario.find(row=>row.data==='2026-10-02').celulas.N.value,'CPA 80%');
assert.equal(updated.campanhas[0].movimento_status,'manteve','mudança de percentual não parece campanha nova');
assert.equal(updated.event_log.filter(event=>event.event_type==='test_iteration_created').length,1,'não registra uma segunda iteração');

assert.equal(db.campaignCpaChangeCandidates(first,manifest('2026-10-02',campaignName(80),{account:null})).length,0,'não associa sem número completo da conta');
assert.equal(db.campaignCpaChangeCandidates(first,manifest('2026-10-02',campaignName(80),{alsoOld:true})).length,0,'não associa quando os dois títulos aparecem na mesma captura');
const paused=structuredClone(first);paused.campanhas[0].status='pausada';
assert.equal(db.campaignCpaChangeCandidates(paused,incoming).length,0,'não associa automaticamente uma campanha que já não está ativa');
const changedOtherFields=manifest('2026-10-02','01/10 - Carbonone 03 (GM-BB-US) 80% - U$ 90');
assert.equal(db.campaignCpaChangeCandidates(first,changedOtherFields).length,0,'não associa se qualquer parte além do percentual de CPA também mudou');
const nonCpa=structuredClone(incoming);nonCpa.campanhas[0].metricas_D_zero.estrategia_lance={valor:'Maximizar conversões'};
assert.equal(db.campaignCpaChangeCandidates(first,nonCpa).length,0,'percentual em campanha sem estratégia CPA não é tratado como troca de CPA');

console.log('Trocas de percentual de CPA no diário: OK');
