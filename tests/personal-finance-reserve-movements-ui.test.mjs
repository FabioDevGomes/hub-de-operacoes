import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../src/personal-finance/personal-finance-view.mjs', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/personal-finance/personal-finance.css', import.meta.url), 'utf8');
assert.match(view, /name="withdrawal_amount"[\s\S]*?data-action="reserve-withdraw"[\s\S]*?>Resgatar/);
assert.match(view, /name="tax_amount"[\s\S]*?data-action="reserve-deduct-tax"[\s\S]*?>Deduzir impostos/);
assert.match(view, /<label>Prejuízo: imposto menos lucro<input name="tax_amount"/,
  'o campo de imposto é apresentado como prejuízo');
assert.match(view, /movement\.type === 'withdrawal' \? 'Resgate' : 'Prejuízo: imposto menos lucro'/,
  'o histórico usa o mesmo texto para o lançamento de imposto');
assert.match(view, /<h4>Histórico<\/h4>/, 'o histórico de operações permanece dentro do popup da reserva');
assert.match(view, /new Intl\.DateTimeFormat\('pt-BR', \{ dateStyle:'short', timeStyle:'short' \}\)/, 'cada evento informa data e hora local');
assert.match(view, /await Storage\.recordReserveMovement\(itemId, type, value\)[\s\S]*?await loadMonth\(\)[\s\S]*?openModal\('reserve', itemId\)/, 'após registrar, a reserva e o histórico são atualizados sem fechar o popup');
assert.match(view, /const deductions = \(existing\?\.reserve_movements \|\| \[\]\)[\s\S]*?displayedAmount \?\? 0\) \+ deductions/, 'salvar edição preserva o saldo líquido sem apagar o histórico acumulado');
assert.match(view, /Reserva acumulada \$\{money\(summary\?\.balances/, 'a visão geral usa o saldo líquido da reserva');
assert.match(styles, /\.pf-reserve-operation-row\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/);
assert.match(styles, /\.pf-reserve-action\{[^}]*width:126px;[^}]*min-width:126px;/,
  'os botões Resgatar e Deduzir impostos têm a mesma largura');
assert.match(styles, /\.pf-reserve-action\{[^}]*justify-content:center/,
  'o texto dos botões fica centralizado');
assert.match(styles, /\.pf-reserve-history-list/);
console.log('personal finance reserve movement UI ok');
