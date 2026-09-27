import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');
const dateFunction = source.match(/^\s*function productDiaryRowDate\(row\)\{[^\r\n]+\}/m)?.[0];
const salesFunction = source.match(/^\s*function productDiaryHasSales\(row,provisionalSaleDates\)\{[^\r\n]+\}/m)?.[0];
const countFunction = source.match(/^\s*function productDiaryManualSaleCount\(row,manualSalesByDate\)\{[^\r\n]+\}/m)?.[0];
const rowsFunction = source.match(/^\s*function productDiaryRowsWithManualSales\(rows,manualSalesByDate\)\{[^\r\n]+\}/m)?.[0];
const cellFunction = source.match(/^\s*function formatProductDiaryCell\(col,row,manualSalesByDate\)\{[^\r\n]+\}/m)?.[0];
assert.ok(dateFunction && salesFunction && countFunction && rowsFunction && cellFunction, 'helpers de data/venda do Diário de campanha ausentes');

const { productDiaryRowDate, productDiaryHasSales, productDiaryManualSaleCount, productDiaryRowsWithManualSales, formatProductDiaryCell } = new Function('excelDate','formatProductCell', `${dateFunction}\n${salesFunction}\n${countFunction}\n${rowsFunction}\n${cellFunction}\nreturn {productDiaryRowDate,productDiaryHasSales,productDiaryManualSaleCount,productDiaryRowsWithManualSales,formatProductDiaryCell};`)(serial => new Date(Math.round((Number(serial) - 25569) * 86400000)), (_col,cell) => cell?.value == null ? '—' : String(cell.value));
const serialFor = iso => Date.parse(`${iso}T00:00:00Z`) / 86400000 + 25569;

assert.equal(productDiaryHasSales({ cells: { F: { value: 2 } } }, new Set()), true, 'conversões oficiais positivas devem destacar o dia');
assert.equal(productDiaryHasSales({ cells: { F: { value: 0 }, A: { value: serialFor('2026-09-24') } } }, new Set(['2026-09-24'])), true, 'venda manual pendente deve destacar a data correspondente');
assert.equal(productDiaryHasSales({ cells: { F: { value: 0 }, A: { value: serialFor('2026-09-24') } } }, new Set()), false, 'zero de conversões sem venda pendente não deve destacar a linha');
assert.equal(productDiaryHasSales({ date: '2026-09-24', cells: { F: { value: null } } }, new Set(['2026-09-23'])), false, 'venda pendente de outra data não deve destacar a linha');
const manualSalesByDate = new Map([['2026-09-24', { pendingConversions:1 }]]);
const diaryRows = productDiaryRowsWithManualSales([{ cells:{A:{value:serialFor('2026-09-23')},F:{value:0}} }], manualSalesByDate);
assert.equal(diaryRows.length, 2, 'data com venda manual sem linha MCC deve ganhar uma linha virtual no Diário');
assert.equal(diaryRows[1].date, '2026-09-24');
assert.equal(diaryRows[1].cells.A.text, '24/09/2026');
assert.equal(diaryRows[1].cells.F, undefined, 'linha virtual não inventa conversão oficial');
assert.equal(productDiaryManualSaleCount(diaryRows[1], manualSalesByDate), 1, 'venda manual pendente deve ser identificada separadamente da conversão MCC');
assert.equal(formatProductDiaryCell('F',{date:'2026-09-24',cells:{F:{value:0}}},manualSalesByDate), '<span>0</span><small class="product-manual-sale-note">+1 manual · provisória</small>', 'venda manual aparece separada sem somar conversões à métrica MCC');
assert.equal(productDiaryManualSaleCount(diaryRows[0], manualSalesByDate), 0, 'venda manual não deve aparecer em outra data');
assert.equal(productDiaryRowsWithManualSales(diaryRows, manualSalesByDate).length, 2, 'a mesma data manual não deve duplicar linha já existente');
console.log('product diary sales highlight ok');
