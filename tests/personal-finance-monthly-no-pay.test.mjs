import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import vm from 'node:vm';
import * as Domain from '../src/personal-finance/personal-finance-domain.mjs';

const source=await readFile(new URL('../src/personal-finance/personal-finance-view.mjs',import.meta.url),'utf8');
const monthly=source.slice(source.indexOf('  function categoryTable()'),source.indexOf('  function periodCategoryTable('));
const names=['Aluguel','Academia','Internet','Energia','Água','DAS'];
const currencyMoney=(value,code)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:code}).format(value);
function renderMonthly(actuals){
  const date=new Date(),monthKey=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  const entries=names.map((category_name,index)=>({entry_id:`synthetic-entry-${index}`,category_id:`synthetic-category-${index}`,category_name,group_name:'Despesas',month_key:monthKey,currency:'BRL',planned_amount:100,actual_amount:actuals[index]}));
  const state={monthKey,month:{month_key:monthKey},entries,categories:entries.map(row=>({category_id:row.category_id,name:row.category_name,active:true}))};
  const before=JSON.stringify(state);
  const context={Domain,state,sortedEntries:()=>state.entries,
    plannedAmountForEntry:entry=>entry.planned_amount,actualAmountForEntry:entry=>entry.actual_amount,
    categoryById:id=>state.categories.find(category=>category.category_id===id),
    esc:value=>String(value??''),usdClass:()=>'',amount:value=>Number(value).toFixed(2),money:currencyMoney,
    dailyBudgetTarget:()=>'',monthlyDueDays:new Map(),normalizeExpenseCategoryName:value=>value.toLowerCase(),
    weeklyCategoryPeriod:()=>'',quickPayButtonMarkup(){throw new Error('A aba Mensal não pode construir atalhos Pagar/Pago');}
  };
  vm.runInNewContext(monthly,context);
  const html=context.categoryTable();
  assert.equal(JSON.stringify(state),before,'renderização não altera lançamentos');
  return html;
}

test('Mensal não renderiza Pagar nem Pago e preserva inputs, edição, ordenação e totais',()=>{
  const html=renderMonthly([null,100,100,25,0,150]);
  assert.doesNotMatch(html,/pf-mark-paid|mark-expense-paid|>Pagar<|>Pago</);
  assert.equal((html.match(/data-entry-field="actual_amount"/g)||[]).length,6);
  assert.equal((html.match(/data-action="edit-category"/g)||[]).length,6);
  assert.equal((html.match(/data-action="move-category"/g)||[]).length,12);
  assert.ok(html.includes('placeholder="Não lançado"'));
  for(const actual of ['100.00','25.00','0.00','150.00'])assert.ok(html.includes(`value="${actual}"`));
  assert.ok(html.includes('pf-month-totals'));
  assert.ok(html.includes(currencyMoney(375,'BRL')));
});

test('remoção fica no renderizador mensal e preserva atalhos/handlers existentes das outras visões',()=>{
  assert.doesNotMatch(monthly,/quickPayButton|mark-expense-paid|canMarkQuickPayInFutureMonthlyView/);
  assert.ok(source.includes('const quickPayButtonMarkup = (entry, planned, editable) => {'));
  assert.ok(source.includes('const periodQuickPayButton = !consolidated && monthEntry'));
  assert.ok(source.includes('quickPayButtonMarkup(monthEntry, values.planned, true)'));
  assert.ok(source.includes("else if (action === 'mark-expense-paid')"));
  assert.ok(source.includes('Storage.saveEntry(Domain.updateEntryAmount(entry, \'actual_amount\', entry.planned_amount))'));
  assert.ok(source.includes('isMonth ?') && source.includes('categoryTable()'));
});
