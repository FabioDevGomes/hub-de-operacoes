import assert from'node:assert/strict';
import{productiveTotalHighlightClass,alcoholHistoryHighlightClass}from'../src/meu-tempo/meu-tempo-view.mjs';
import{readFile}from'node:fs/promises';

assert.equal(productiveTotalHighlightClass(480),'','exatamente oito horas não recebem destaque');
assert.equal(productiveTotalHighlightClass(481),'time-over-eight-hours','qualquer quantidade acima de oito horas recebe destaque');
assert.equal(productiveTotalHighlightClass('540'),'time-over-eight-hours','valores numéricos recebidos como texto também são tratados corretamente');
assert.equal(productiveTotalHighlightClass(null),'','valor ausente não recebe destaque');
assert.equal(alcoholHistoryHighlightClass({id:'item-alcool',type:'boolean'},1),'time-alcohol-yes','Sim numérico de bebida alcoólica recebe destaque');
assert.equal(alcoholHistoryHighlightClass({id:'item-alcool',type:'boolean'},true),'time-alcohol-yes','Sim booleano de bebida alcoólica recebe destaque');
assert.equal(alcoholHistoryHighlightClass({id:'item-alcool',type:'boolean'},0),'','Não não recebe destaque');
assert.equal(alcoholHistoryHighlightClass({id:'item-alcool',type:'boolean'},null),'','valor ausente não recebe destaque');
assert.equal(alcoholHistoryHighlightClass({id:'item-agua',type:'boolean'},1),'','outros indicadores booleanos não recebem destaque de álcool');
const view=await readFile(new URL('../src/meu-tempo/meu-tempo-view.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../src/meu-tempo/meu-tempo.css',import.meta.url),'utf8');
assert.ok(view.includes("alcoholDates.has(date)?'time-alcohol-day':''"),'cabeçalho do dia com bebida alcoólica não recebe indicação');
assert.ok(view.includes("cell.values.some(value=>alcoholHistoryHighlightClass(row.item,value))?'time-alcohol-yes':''"),'célula Sim na comparação não recebe destaque');
assert.ok(view.includes('alcoholHistoryHighlightClass(item,entry.value)'),'registro Sim no detalhamento não recebe destaque');
assert.ok(css.includes('.time-matrix tbody td.time-alcohol-yes')&&css.includes('.time-table tr.time-alcohol-yes>td'),'destaque suave não foi aplicado à comparação e ao detalhamento');

console.log('meu tempo history UI ok');
