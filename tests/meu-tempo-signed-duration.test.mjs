import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as Domain from '../src/meu-tempo/meu-tempo-domain.mjs';

const view = await readFile(new URL('../src/meu-tempo/meu-tempo-view.mjs', import.meta.url), 'utf8');
const functionLine = name => view.split('\n').find(line => line.startsWith(`async function ${name}(`));
const item = {id:'activity', name:'Atividade de teste', type:'duration', productive:true, categoryId:'example'};
const selectedDate = '2026-10-08';

function harness(initial = [], gate = null) {
  let entries = structuredClone(initial);
  const saved = [], removed = [], messages = [], refreshed = [];
  const Storage = {
    async saveEntry(entry) {
      if(gate) await gate;
      saved.push(entry);
      entries.push({...entry, id:'added', createdAt:'2026-10-08T12:00:00Z'});
    },
    async removeDuration(date, itemId, minutes) {
      const candidates = entries.filter(entry => entry.date === date && entry.itemId === itemId);
      const plan = Domain.planDurationRemoval(candidates, minutes);
      removed.push({date, itemId, minutes});
      entries = entries.filter(entry => !plan.deleteIds.includes(entry.id)).map(entry => {
        const update = plan.updates.find(update => update.id === entry.id);
        return update ? {...entry, minutes:update.minutes, start:null, end:null, source:'manual_adjustment'} : entry;
      });
    }
  };
  const handlers = new Function('Domain', 'Storage', 'itemMap', 'selectedDate', 'refresh', 'setMessage', 'TIME_ENTRY_TOAST_DURATION_MS', 'addValue', `${functionLine('submitManualOnEnter')}\n${functionLine('addManualDuration')}\nreturn {submitManualOnEnter, addManualDuration};`)(
    Domain, Storage, () => new Map([[item.id,item]]), selectedDate,
    async (message, options) => refreshed.push({message, options}),
    (message, error) => messages.push({message,error}), 7200,
    async () => {throw new Error('Ajuste temporal não deve usar o handler de valores.');}
  );
  return {...handlers, saved, removed, messages, refreshed, get entries(){return entries;}};
}

const entry = (id, minutes, extra = {}) => ({id, minutes, date:selectedDate, itemId:item.id, type:'duration', productiveSnapshot:true, createdAt:`2026-10-08T${id==='old'?'08':'09'}:00:00Z`, ...extra});
const inputFor = value => ({value, dataset:{manual:item.id}, disabled:false, isConnected:true});
const enter = extra => ({key:'Enter', preventDefault(){}, ...extra});

test('duração manual aceita sinal sem mudar o formato de horas/minutos nem o parser positivo', () => {
  for(const [raw, expected] of [['30',30],['110',70],['-30',-30],['-110',-70],['-1230',-750],[' +5 ',5],[' -05 ',-5]]) assert.equal(Domain.parseSignedQuickDuration(raw),expected);
  for(const raw of ['0','-0','+0','-75','-160','1.5','-1,5','--30','- 30','abc','','1e2','9'.repeat(400)]) assert.throws(() => Domain.parseSignedQuickDuration(raw),undefined,raw);
  assert.throws(() => Domain.parseQuickDuration('-30'), /somente números/);
  assert.equal(Domain.parseQuickDuration('110'),70);
});

test('Enter positivo persiste duração e preserva snapshots e aviso', async () => {
  const h = harness(), input = inputFor('110');
  await h.submitManualOnEnter(enter(),input);
  assert.equal(h.saved.length,1);
  assert.equal(h.saved[0].minutes,70);
  assert.equal(h.saved[0].source,'manual');
  assert.equal(h.saved[0].productiveSnapshot,true);
  assert.equal(h.saved[0].date,selectedDate);
  assert.equal(h.removed.length,0);
  assert.equal(h.refreshed[0].options.highlight,'1h10');
  assert.equal(input.disabled,false);
  assert.equal(input.dataset.submitting,undefined);
});

test('Enter negativo desconta dos registros mais recentes apenas na atividade/data selecionada', async () => {
  const other = entry('other',90,{itemId:'another'}), yesterday = entry('yesterday',100,{date:'2026-10-07'});
  const h = harness([entry('old',30),entry('new',50,{start:'09:00',end:'09:50'}),other,yesterday]);
  await h.submitManualOnEnter(enter(),inputFor('-110'));
  assert.deepEqual(h.removed,[{date:selectedDate,itemId:item.id,minutes:70}]);
  assert.equal(h.saved.length,0,'não persistir uma duração negativa');
  assert.deepEqual(h.entries,[entry('old',10,{start:null,end:null,source:'manual_adjustment'}),other,yesterday]);
  assert.equal(Domain.aggregateDay(h.entries.filter(entry => entry.itemId === item.id),selectedDate).productiveMinutes,10);
  assert.match(h.refreshed[0].message,/1h10 removido/);
});

test('desconto exato zera a atividade; excesso ou entrada inválida não alteram dados', async () => {
  const h = harness([entry('old',30)]);
  await h.addManualDuration(item.id,'-30');
  assert.deepEqual(h.entries,[]);
  assert.equal(Domain.aggregateDay(h.entries,selectedDate).totalMinutes,0);
  for(const raw of ['-31','-75','-0']) {
    const original = [entry('old',30)], attempt = harness(original);
    await attempt.addManualDuration(item.id,raw);
    assert.deepEqual(attempt.entries,original);
    assert.equal(attempt.saved.length,0);
    assert.equal(attempt.removed.length,0);
    assert.equal(attempt.refreshed.length,0);
    assert.equal(attempt.messages[0].error,true);
  }
  const empty = harness();
  await empty.addManualDuration(item.id,'-1');
  assert.match(empty.messages[0].message,/Só existem 0min/);
});

test('Enter mantém proteção de repetição, composição e envio simultâneo', async () => {
  let release;
  const h = harness([],new Promise(resolve => {release=resolve;})), input = inputFor('30');
  for(const event of [enter({repeat:true}),enter({isComposing:true}),enter({key:'Escape'})]) await h.submitManualOnEnter(event,input);
  assert.equal(h.saved.length,0);
  const first = h.submitManualOnEnter(enter(),input);
  assert.equal(input.disabled,true);
  await h.submitManualOnEnter(enter(),input);
  release();
  await first;
  assert.equal(h.saved.length,1);
  assert.equal(input.disabled,false);
});

test('erro ao descontar reabilita o campo e informa o limite disponível', async () => {
  const h = harness([entry('old',5)]), input = inputFor('-30');
  await h.submitManualOnEnter(enter(),input);
  assert.equal(input.disabled,false);
  assert.equal(input.dataset.submitting,undefined);
  assert.match(h.messages[0].message,/Só existem 5min/);
  assert.equal(h.refreshed.length,0);
});

test('tabela tem somente um campo de ajuste com dica de negativos e conserva os outros controles', () => {
  assert.ok(!view.includes('Remover manualmente'));
  assert.ok(!view.includes('data-remove') && !view.includes('removeManualDuration'));
  assert.ok(view.includes('input[data-manual],input[data-value]'));
  assert.ok(view.includes('110 = 1h10; -30 desconta 30min'));
  const rowSource = view.match(/function dailyItemRow\(item,categories,daily,today\)\{[\s\S]*?\n\}/)[0];
  const row = new Function('Domain','selectedDate','esc','formatValues',`${rowSource};return dailyItemRow;`)(Domain,selectedDate,String,()=> '—');
  const markup = row(item,new Map(),Domain.aggregateDay([],selectedDate),selectedDate);
  assert.equal((markup.match(/<td(?:\s|>)/g)||[]).length,7);
  assert.ok(markup.includes('inputmode="text"') && markup.includes('valor negativo desconta tempo'));
  assert.ok(markup.includes('data-manual=') && markup.includes('data-interval=') && markup.includes('data-until=') && markup.includes('data-move-item='));
  const boolean = row({...item,type:'boolean'},new Map(),Domain.aggregateDay([],selectedDate),selectedDate);
  assert.equal((boolean.match(/<td(?:\s|>)/g)||[]).length,7);
  assert.ok(boolean.includes('data-value=') && boolean.includes('data-add-value='));
});
