import assert from'node:assert/strict';
import{classifyImportedEntries,historicalDurationMinutes,TYPE_BY_ROW}from'../src/meu-tempo/meu-tempo-import.mjs';

assert.equal(TYPE_BY_ROW[32],'boolean','Sódio deve ser importado como Sim/Não');
assert.equal(TYPE_BY_ROW[34],'boolean','Verde 16:20 deve ser importado como Sim/Não');

assert.equal(historicalDurationMinutes(70/1440),70,'horário Excel vira minutos');
assert.equal(historicalDurationMinutes(2.5),150,'hora decimal antiga vira minutos');
assert.equal(historicalDurationMinutes(0),0,'zero explícito permanece zero');
assert.equal(historicalDurationMinutes(null),null,'vazio não vira zero');

const base={id:'excel:2026-09-19:11',importKey:'controle-do-tempo:2026-09-19:row-11',date:'2026-09-19',itemId:'item-ads-aplicando',type:'duration',minutes:70,start:null,end:null,source:'excel_import',productiveSnapshot:false};
assert.equal(classifyImportedEntries([base],[])[0].status,'new');
assert.equal(classifyImportedEntries([base],[{...base,id:'old'}])[0].status,'identical');
assert.equal(classifyImportedEntries([{...base,minutes:80}],[base])[0].status,'conflict');
assert.equal(classifyImportedEntries([{...base,id:'a'},{...base,id:'b',importKey:'controle-do-tempo:2026-09-19:row-12'}],[]).length,2,'identidade de importação não impede lançamentos normais');
console.log('meu tempo import ok');
