import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import vm from 'node:vm';

const html=await readFile(new URL('../src/preparador-MCC/index.html',import.meta.url),'utf8');
const names=['captureFormatter','formatD0DeltaValue','formatD0CaptureTabLabel','formatD0CaptureFullTime'];
const functions=names.map(name=>html.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n    \\}`))[0]).join('\n');
function harness(){
  const counts={number:0,date:0};
  const context={Intl:{
    NumberFormat:function(...args){counts.number++;return new Intl.NumberFormat(...args);},
    DateTimeFormat:function(...args){counts.date++;return new Intl.DateTimeFormat(...args);}
  }};
  vm.runInNewContext(functions,context);
  return {context,counts};
}

test('tabela com 1000 linhas cria apenas dois formatadores numéricos sem alterar valores',()=>{
  const {context:c,counts}=harness();
  const count=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
  const cost=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',signDisplay:'never'});
  for(let index=0;index<1000;index++){
    assert.equal(c.formatD0DeltaValue(index,'count'),`${index>0?'+':''}${count.format(index)}`);
    assert.equal(c.formatD0DeltaValue(-index,'count'),`${index>0?'−':''}${count.format(index)}`);
    assert.equal(c.formatD0DeltaValue(index/100,'cost','BRL'),`${index>0?'+':''}${cost.format(index/100)}`);
  }
  assert.equal(counts.number,2,'3000 células reutilizam os formatadores');
  assert.equal(c.formatD0DeltaValue(null,'count'),'—');
  assert.equal(c.formatD0DeltaValue(0,'count'),'0');
  assert.equal(c.formatD0DeltaValue(1.25,'cost','?'),'+? 1,25','fallback continua disponível');
});

test('horários reutilizam dois formatadores e preservam Brasília e data inválida',()=>{
  const {context:c,counts}=harness();
  const full=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});
  for(let index=0;index<100;index++){
    const timestamp=new Date(Date.UTC(2026,9,8,2,30,index%60)).toISOString();
    assert.equal(c.formatD0CaptureFullTime(timestamp),full.format(new Date(timestamp)));
    assert.equal(c.formatD0CaptureTabLabel(timestamp),'07/10 · 23:30');
  }
  assert.equal(counts.date,2);
  assert.equal(c.formatD0CaptureFullTime('invalid'),'horário indisponível');
  assert.equal(c.formatD0CaptureTabLabel('invalid'),'Horário indisponível');
  assert.equal(counts.date,2,'datas inválidas não criam formatadores');
});

test('cache limitado e local não guarda dados nem mistura moedas',()=>{
  const {context:c,counts}=harness();
  const first=c.captureFormatter('currency','USD');
  assert.equal(c.captureFormatter('currency','USD'),first);
  assert.notEqual(c.captureFormatter('currency','BRL'),first);
  for(let index=0;index<25;index++)c.captureFormatter('currency',`AA${String.fromCharCode(65+index)}`);
  assert.equal(c.captureFormatter.cache.size,16);
  const countBefore=counts.number;
  assert.notEqual(c.captureFormatter('currency','USD'),first,'formatador removido é recriado corretamente');
  assert.equal(counts.number,countBefore+1);
  assert.equal(c.captureFormatter.cache.size,16);
  const source=names.map(name=>html.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n    \\}`))[0]).join('\n');
  assert.doesNotMatch(source,/localStorage|indexedDB|BroadcastChannel|readPanelBase|writePanelBase/);
});
