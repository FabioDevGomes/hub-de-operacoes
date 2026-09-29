import assert from'node:assert/strict';
import{aggregateDay,BOOLEAN_ITEM_IDS,booleanHistoryValue,comparisonMatrix,DEFAULT_CATEGORIES,DEFAULT_ITEMS,formatBrazilianDate,minutesBetween,parseBrazilianDate,parseLocalizedNumber,parseQuickDuration,PARTIALLY_PRODUCTIVE_ITEM_ID,PARTIAL_PRODUCTIVE_RATE,planDurationRemoval,productivityLabel,productiveContributionMinutes,registeredIntervalUntil,SYMPTOM_SCALE_ITEM_IDS,SYMPTOM_SCALE_OPTIONS,symptomScaleHistoryValue,totalDurationForCategory,totalProductiveDuration,waterUnitsToMl}from'../src/meu-tempo/meu-tempo-domain.mjs';

assert.deepEqual(DEFAULT_CATEGORIES.map(({id,name})=>({id,name})),[{id:'cat-exemplos',name:'Exemplos'}],'o código compartilhado só fornece uma categoria neutra de exemplo');
assert.deepEqual(DEFAULT_ITEMS.map(({id,name,categoryId})=>({id,name,categoryId})),[
  {id:'item-dormindo',name:'Dormindo',categoryId:'cat-exemplos'},
  {id:'item-cama-acordar',name:'Na cama após acordar',categoryId:'cat-exemplos'},
  {id:'item-preparo-levantar',name:'Preparo após levantar',categoryId:'cat-exemplos'},
  {id:'item-cafe',name:'Café',categoryId:'cat-exemplos'}
],'somente os quatro exemplos são semeados em um banco de navegador vazio');
for(const id of BOOLEAN_ITEM_IDS)assert.equal(booleanHistoryValue({id,type:'boolean'},1),'Sim',`${id} deve continuar aceitando o histórico Sim/Não`);
for(const id of['item-refrigerante','item-acucar','item-sodio']){
  const item={id,type:'boolean'};
  assert.equal(booleanHistoryValue(item,1),'Sim',`${id}: valor 1 deve aparecer como Sim no Histórico`);
  assert.equal(booleanHistoryValue(item,0),'Não',`${id}: valor 0 deve aparecer como Não no Histórico`);
}
assert.equal(booleanHistoryValue({id:'item-sodio',type:'boolean'},null),'—','valor ausente não deve ser confundido com zero');
assert.equal(booleanHistoryValue({id:'item-agua',type:'number'},1),null,'valores numéricos de outros itens não devem virar Sim/Não');
assert.deepEqual(SYMPTOM_SCALE_OPTIONS.map(option=>[option.value,option.label]),[[3,'Alto'],[2,'Médio'],[1,'Baixo'],[0,'Inexistente']]);
for(const id of SYMPTOM_SCALE_ITEM_IDS){const item={id,type:'scale'};assert.deepEqual([3,2,1,0].map(value=>symptomScaleHistoryValue(item,value)),['Alto','Médio','Baixo','Inexistente'],`${id} mostra níveis rotulados no histórico`);assert.equal(symptomScaleHistoryValue(item,null),'—',`${id}: ausência de registro não equivale a Inexistente`)}
assert.equal(symptomScaleHistoryValue({id:'other-scale',type:'scale'},3),null,'a escala de sintomas não altera outros itens scale');

for(const[input,expected]of[['5',5],['10',10],['45',45],['110',70],['230',150],['1230',750]])assert.equal(parseQuickDuration(input),expected,input);
for(const invalid of['75','160','275','abc','0'])assert.throws(()=>parseQuickDuration(invalid),undefined,invalid);
assert.equal(parseLocalizedNumber('1,5'),1.5);
assert.equal(parseLocalizedNumber('1.5'),1.5);
assert.deepEqual(waterUnitsToMl('1',350),{units:1,ml:350});
assert.deepEqual(waterUnitsToMl('0,5',350),{units:.5,ml:175});
assert.deepEqual(waterUnitsToMl('1,5',350),{units:1.5,ml:525});
assert.deepEqual(waterUnitsToMl('1,5',500),{units:1.5,ml:750});
assert.deepEqual(waterUnitsToMl('-1',350),{units:-1,ml:-350},'ajuste negativo de água reduz o total em uma unidade');
assert.deepEqual(waterUnitsToMl('-0,5',350),{units:-.5,ml:-175},'ajuste negativo fracionário de água é aceito');
assert.throws(()=>parseLocalizedNumber('-1'),/número válido/,'outros campos numéricos continuam rejeitando negativos por padrão');
const waterDay=aggregateDay([{date:'2026-09-23',itemId:'item-agua',type:'number',value:350},{date:'2026-09-23',itemId:'item-agua',type:'number',value:waterUnitsToMl('-1',350).ml}],'2026-09-23');
assert.equal(waterDay.byItem.get('item-agua').values.reduce((sum,value)=>sum+value,0),0,'ajuste negativo compensa o copo registrado por engano');
assert.equal(minutesBetween('08:10','08:44'),34);
assert.throws(()=>minutesBetween('23:50','00:10'),/meia-noite/);
assert.deepEqual(registeredIntervalUntil(480,555),{start:'08:00',end:'09:15',minutes:75});
assert.deepEqual(registeredIntervalUntil(0,45),{start:'00:00',end:'00:45',minutes:45});
assert.throws(()=>registeredIntervalUntil(600,555),/ultrapassa o horário atual/);
assert.throws(()=>registeredIntervalUntil(555,555),/Não há tempo novo/);
assert.equal(formatBrazilianDate('2026-09-19'),'19/09/2026');
assert.equal(parseBrazilianDate('19/09/2026'),'2026-09-19');
assert.equal(parseBrazilianDate('1/2/2026'),'2026-02-01');
assert.throws(()=>parseBrazilianDate('09/19/2026'),/formato dd\/mm\/aaaa/);
assert.throws(()=>parseBrazilianDate('31/02/2026'),/data válida/);
const removal=planDurationRemoval([{id:'old',type:'duration',minutes:30,createdAt:'2026-09-19T08:00:00Z'},{id:'new',type:'duration',minutes:50,createdAt:'2026-09-19T09:00:00Z'}],60);
assert.deepEqual(removal,{requestedMinutes:60,deleteIds:['new'],updates:[{id:'old',minutes:20}]});
assert.throws(()=>planDurationRemoval([{id:'only',type:'duration',minutes:15}],20),/Só existem 15min/);

const entries=[
  {id:'1',date:'2026-09-19',itemId:'ads',type:'duration',minutes:70,productiveSnapshot:true},
  {id:'2',date:'2026-09-19',itemId:'ads',type:'duration',minutes:35,productiveSnapshot:true},
  {id:'3',date:'2026-09-19',itemId:'cafe',type:'duration',minutes:20,productiveSnapshot:false},
  {id:'4',date:'2026-09-20',itemId:'ads',type:'duration',minutes:60,productiveSnapshot:false}
];
const day=aggregateDay(entries,'2026-09-19');
assert.equal(day.byItem.get('ads').minutes,105);
assert.equal(day.totalMinutes,125);
assert.equal(day.productiveMinutes,105);
const matrix=comparisonMatrix([{id:'ads',name:'Ads',type:'duration'}],entries,['2026-09-19','2026-09-20']);
assert.deepEqual(matrix.rows[0].cells.map(x=>x.minutes),[105,60]);
assert.equal(matrix.foot[0].productiveMinutes,105);
assert.equal(matrix.foot[1].productiveMinutes,0,'snapshot antigo não muda com a configuração atual');
assert.equal(matrix.averages.productiveMinutes,52.5,'a média produtiva inclui dias sem tempo produtivo');
assert.equal(matrix.averages.totalMinutes,92.5,'a média total inclui todos os dias do período');
assert.deepEqual(comparisonMatrix([],[],[]).averages,{productiveMinutes:null,totalMinutes:null});
assert.equal(PARTIALLY_PRODUCTIVE_ITEM_ID,'item-kakashi');
assert.equal(PARTIAL_PRODUCTIVE_RATE,.1);
const kakashiEntries=[
  {id:'k1',date:'2026-09-19',itemId:'item-kakashi',type:'duration',minutes:120,productiveSnapshot:false},
  {id:'k2',date:'2026-09-19',itemId:'item-kakashi',type:'duration',minutes:30,productiveSnapshot:true},
  {id:'k3',date:'2026-09-20',itemId:'item-kakashi',type:'duration',minutes:50,productiveSnapshot:false},
  {id:'k4',date:'2026-09-19',itemId:'other',type:'duration',minutes:30,productiveSnapshot:true}
];
assert.equal(productiveContributionMinutes(kakashiEntries[0]),12,'Kakashi contribui com exatamente 10% independentemente do snapshot antigo');
assert.equal(productiveContributionMinutes(kakashiEntries[1]),3,'a regra de 10% permanece mesmo que snapshot do item esteja marcado');
assert.equal(productiveContributionMinutes({type:'duration',itemId:'other',minutes:30,productiveSnapshot:true}),30,'outras atividades produtivas continuam contando integralmente');
assert.equal(productiveContributionMinutes({type:'boolean',itemId:'item-kakashi',value:true}),0,'lançamentos que não são duração não entram na soma produtiva');
assert.equal(productivityLabel(kakashiEntries[0]),'10% produtivo');
assert.equal(productivityLabel(entries[0]),'Sim');
assert.equal(productivityLabel(entries[2]),'Não');
assert.equal(aggregateDay(kakashiEntries,'2026-09-19').productiveMinutes,45,'Diário e comparação somam a fração do Kakashi e o tempo integral das outras atividades');
assert.equal(totalProductiveDuration(kakashiEntries,['2026-09-19','2026-09-20']),50,'Histórico soma 10% de Kakashi em cada dia sem alterar as durações registradas');
const symptomMatrix=comparisonMatrix([{id:SYMPTOM_SCALE_ITEM_IDS[0],name:'Indicador',type:'scale'}],[{id:'s1',date:'2026-09-20',itemId:SYMPTOM_SCALE_ITEM_IDS[0],type:'scale',value:3},{id:'s2',date:'2026-09-20',itemId:SYMPTOM_SCALE_ITEM_IDS[0],type:'scale',value:1},{id:'s3',date:'2026-09-22',itemId:SYMPTOM_SCALE_ITEM_IDS[0],type:'scale',value:0}],['2026-09-20','2026-09-21','2026-09-22']);
assert.deepEqual(symptomMatrix.rows[0].cells.map(cell=>cell.values),[[1],[],[0]],'a comparação usa o último nível do dia e mantém ausências separadas de Inexistente');
assert.equal(symptomMatrix.rows[0].average,.5,'a média do nível exclui dias sem registro e conta Inexistente apenas quando explicitamente lançado');
assert.equal(totalDurationForCategory([...entries,{id:'5',date:'2026-09-20',itemId:'ads',type:'duration',minutes:30,categoryIdSnapshot:'work'},{id:'6',date:'2026-09-19',itemId:'habit',type:'boolean',value:true,categoryIdSnapshot:'work'}],[{id:'ads',categoryId:'other'},{id:'habit',categoryId:'work'}],'work',['2026-09-19','2026-09-20']),30,'considera snapshots da categoria, só durações e só datas selecionadas');
assert.equal(totalDurationForCategory([{date:'2026-09-19',itemId:'ads',type:'duration',minutes:12}],[{id:'ads',categoryId:'work'}],'work',['2026-09-19']),12,'usa a categoria atual quando o snapshot histórico não existe');
assert.equal(totalProductiveDuration([...entries,{id:'5',date:'2026-09-20',itemId:'exercise',type:'duration',minutes:25,productiveSnapshot:true},{id:'6',date:'2026-09-19',itemId:'habit',type:'boolean',value:true,productiveSnapshot:true},{id:'7',date:'2026-09-21',itemId:'ads',type:'duration',minutes:90,productiveSnapshot:true},{id:'8',date:'2026-09-20',itemId:'old',type:'duration',minutes:40}],['2026-09-19','2026-09-20']),130,'soma durações produtivas de qualquer atividade nas datas selecionadas; exclui não produtivas, hábitos booleanos, datas fora do período e sem snapshot produtivo');
console.log('meu tempo domain ok');
