import assert from'node:assert/strict';
import{aggregateDay,BOOLEAN_ITEM_IDS,comparisonMatrix,DEFAULT_ITEMS,formatBrazilianDate,minutesBetween,parseBrazilianDate,parseLocalizedNumber,parseQuickDuration,planDurationRemoval,registeredIntervalUntil,waterUnitsToMl}from'../src/meu-tempo/meu-tempo-domain.mjs';

const defaultItemsById=new Map(DEFAULT_ITEMS.map(item=>[item.id,item]));
for(const id of BOOLEAN_ITEM_IDS)assert.equal(defaultItemsById.get(id)?.type,'boolean',`${id} deve usar campo Sim/Não`);

for(const[input,expected]of[['5',5],['10',10],['45',45],['110',70],['230',150],['1230',750]])assert.equal(parseQuickDuration(input),expected,input);
for(const invalid of['75','160','275','abc','0'])assert.throws(()=>parseQuickDuration(invalid),undefined,invalid);
assert.equal(parseLocalizedNumber('1,5'),1.5);
assert.equal(parseLocalizedNumber('1.5'),1.5);
assert.deepEqual(waterUnitsToMl('1',350),{units:1,ml:350});
assert.deepEqual(waterUnitsToMl('0,5',350),{units:.5,ml:175});
assert.deepEqual(waterUnitsToMl('1,5',350),{units:1.5,ml:525});
assert.deepEqual(waterUnitsToMl('1,5',500),{units:1.5,ml:750});
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
console.log('meu tempo domain ok');
