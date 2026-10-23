import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../src/personal-finance/personal-finance-view.mjs', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/personal-finance/personal-finance.css', import.meta.url), 'utf8');
assert.match(view, /name="withdrawal_amount"[\s\S]*?data-action="reserve-withdraw"[\s\S]*?>Resgatar/);
assert.match(view, /name="tax_amount"[\s\S]*?data-action="reserve-deduct-tax"[\s\S]*?>Deduzir impostos/);
assert.match(view, /<label>Prejuízo: imposto menos lucro<input name="tax_amount"/,
  'o campo de imposto é apresentado como prejuízo');
assert.match(view, /movement\.type === 'withdrawal' \? 'Resgate' : movement\.type === 'expense' \? 'Gasto' : 'Prejuízo: imposto menos lucro'/,
  'o histórico diferencia gasto Nubank, resgate e prejuízo por imposto');
assert.match(view, /const operations = isNubankReserve\s*\?\s*'<label class="pf-nubank-rule-indicator"><input type="checkbox" checked disabled aria-label="Regra de registrar reduções como gasto no histórico ativa">Reduções do saldo são registradas como Gasto no histórico/,
  'a tela informa a regra especial no checkbox sem alterar o comportamento das outras reservas');
assert.match(view, /const operations = isNubankReserve\s*\?\s*'<label class="pf-nubank-rule-indicator"><input type="checkbox" checked disabled/,
  'o Saldo Nubank mostra um checkbox somente informativo, já marcado e sem ação de alternância');
assert.doesNotMatch(view.match(/const operations = isNubankReserve\s*\?\s*'([^']*)'/)?.[1] || '', /withdrawal_amount|tax_amount|reserve-withdraw|reserve-deduct-tax/,
  'o painel Nubank não oferece campos ou ações manuais de resgate e imposto');
assert.match(view, /function applyNubankBalanceFromEnter[\s\S]*?Storage\.saveNubankReserveBalance[\s\S]*?await loadMonth\(\)[\s\S]*?openModal\('reserve', itemId\)[\s\S]*?popup permaneceu aberto/,
  'Enter atualiza o saldo/histórico, reabre o mesmo diálogo e mantém o popup aberto');
assert.match(view, /const draftName = form\.elements\.namedItem\('name'\)[\s\S]*?const draftNotes = form\.elements\.namedItem\('notes'\)[\s\S]*?refreshedForm\.elements\.namedItem\('name'\)\.value = draftName[\s\S]*?refreshedForm\.elements\.namedItem\('notes'\)\.value = draftNotes/,
  'a atualização por Enter não descarta rascunhos de nome e observações');
assert.match(view, /root\.addEventListener\('keydown',[\s\S]*?event\.key !== 'Enter'[\s\S]*?applyNubankBalanceFromEnter\(form, form\.dataset\.id\)/,
  'somente Enter no campo Valor da reserva Nubank usa a atualização sem fechar');
assert.match(view, /if \(form\.dataset\.saving === 'true' \|\| form\.dataset\.balanceApplying === 'true'\) return/,
  'Salvar não concorre com o registro em andamento iniciado por Enter');
assert.match(view, /if \(existing && Domain\.isNubankReserve\(existing\) && currency === existing\.currency\) await Storage\.saveNubankReserveBalance\(fund\)/,
  'a tela usa a gravação transacional especial apenas para saldo Nubank existente e na mesma moeda');
assert.match(view, /<h4>\$\{historyTitle\}<\/h4>/, 'o histórico de operações permanece dentro do popup da reserva');
assert.match(view, /const historyTitle = isNubankReserve \? 'Histórico de gastos' : 'Histórico'/,
  'o histórico permanece identificado como histórico de gastos no Saldo Nubank');
assert.match(view, /Nenhum \$\{isNubankReserve \? 'gasto' : 'resgate ou imposto'\} registrado\./,
  'o estado vazio do histórico Nubank não oferece resgates ou impostos removidos');
assert.match(view, /state\.modal = null;[\s\S]*?await loadMonth\(\);[\s\S]*?toast\(type === 'reserve'/,
  'Salvar no formulário continua fechando o popup após confirmar as alterações');
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
assert.match(styles, /\.pf-nubank-rule-indicator\{display:flex!important/);
assert.match(styles, /\.pf-modal \.pf-nubank-rule-indicator input\[type=checkbox\]\{[^}]*accent-color:#35c99a/);
console.log('personal finance reserve movement UI ok');
