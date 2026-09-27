import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../src/overview-domain.js',import.meta.url),'utf8');
const window={};
vm.runInNewContext(source,{window});
const derive=window.OverviewDomain.deriveTestBudget;
const sumObserved=window.OverviewDomain.sumObservedMetric;

assert.deepEqual(JSON.parse(JSON.stringify(derive({commission:75,commissionCurrency:'USD',exchangeRate:5.1,conversions:0,sales:0,investment:210}))),{limit:382.5,remaining:172.5,minimumRoi:0,salesCount:0});
assert.deepEqual(JSON.parse(JSON.stringify(derive({commission:60,commissionCurrency:'BRL',exchangeRate:5.1,conversions:0,sales:0,investment:0}))),{limit:60,remaining:60,minimumRoi:0,salesCount:0});
assert.deepEqual(JSON.parse(JSON.stringify(derive({commission:45.25,commissionCurrency:'USD',exchangeRate:5.1,conversions:0,sales:0,investment:250}))),{limit:230.78,remaining:-19.22,minimumRoi:0,salesCount:0});
assert.deepEqual(JSON.parse(JSON.stringify(derive({commission:75,commissionCurrency:'USD',exchangeRate:5.1,conversions:0,sales:0,investment:null}))),{limit:382.5,remaining:null,minimumRoi:0,salesCount:0});
assert.deepEqual(JSON.parse(JSON.stringify(derive({commission:75,commissionCurrency:'USD',exchangeRate:5.1,conversions:1,sales:0,investment:210}))),{limit:347.73,remaining:137.73,minimumRoi:10,salesCount:1},'uma venda aplica ROI mínimo de 10% e usa o valor por venda');
assert.deepEqual(JSON.parse(JSON.stringify(derive({commission:75,commissionCurrency:'USD',exchangeRate:5.1,conversions:0,sales:1,investment:400}))),{limit:347.73,remaining:-52.27,minimumRoi:10,salesCount:1},'venda provisória também ajusta o limite e mostra o excedente negativo');
assert.deepEqual(JSON.parse(JSON.stringify(derive({commission:75,commissionCurrency:'USD',exchangeRate:5.1,conversions:2,sales:0,investment:500}))),{limit:637.5,remaining:137.5,minimumRoi:20,salesCount:2},'duas vendas aplicam ROI mínimo de 20%');
assert.deepEqual(JSON.parse(JSON.stringify(derive({commission:75,commissionCurrency:'USD',exchangeRate:5.1,conversions:3,sales:0,investment:500}))),{limit:882.69,remaining:382.69,minimumRoi:30,salesCount:3},'três vendas aplicam ROI mínimo de 30%');
assert.deepEqual(JSON.parse(JSON.stringify(derive({commission:75,commissionCurrency:'USD',exchangeRate:5.1,conversions:5,sales:0,investment:500}))),{limit:1471.15,remaining:971.15,minimumRoi:30,salesCount:5},'três vendas ou mais mantêm o ROI mínimo de 30%');
assert.deepEqual(JSON.parse(JSON.stringify(derive({commission:75,commissionCurrency:'USD',exchangeRate:5.1,conversions:1,sales:1,revenue:436.75,investment:300}))),{limit:397.05,remaining:97.05,minimumRoi:10,salesCount:1},'usa a comissão real registrada em vez de estimar o faturamento pelo payout do título');
assert.deepEqual(JSON.parse(JSON.stringify(derive({commission:null,commissionCurrency:'EUR',exchangeRate:5.1,conversions:1,sales:0,revenue:120,investment:100}))),{limit:109.09,remaining:9.09,minimumRoi:10,salesCount:1},'receita efetiva em BRL permite calcular o limite mesmo sem payout conversível no título');
assert.deepEqual(JSON.parse(JSON.stringify(derive({commission:75,commissionCurrency:'USD',exchangeRate:5.1,conversions:null,sales:1,revenue:100,investment:50}))),{limit:90.91,remaining:40.91,minimumRoi:10,salesCount:1},'venda manual identificada permite calcular mesmo quando conversões MCC estão ausentes');
assert.equal(derive({commission:75,commissionCurrency:'USD',exchangeRate:5.1,conversions:null,sales:0,investment:210}),null,'ausência de informação não deve ser tratada como zero');
assert.equal(derive({commission:null,commissionCurrency:'USD',exchangeRate:5.1,conversions:0,sales:0,investment:210}),null,'sem comissão identificável deve permanecer o fallback atual');
assert.equal(derive({commission:75,commissionCurrency:'EUR',exchangeRate:5.1,conversions:0,sales:0,investment:210}),null,'moeda não suportada não deve ser convertida por suposição');
assert.equal(derive({commission:null,commissionCurrency:'USD',exchangeRate:5.1,conversions:1,sales:0,investment:210}),null,'sem receita observada ou payout conversível não se inventa limite');
assert.deepEqual(JSON.parse(JSON.stringify(sumObserved([{investment:125.5},{investment:0},{investment:null},{}],'investment'))),{value:125.5,observedCount:2,totalCount:4},'soma D0 mantém zero confirmado e não trata ausência como zero');
assert.deepEqual(JSON.parse(JSON.stringify(sumObserved([],'clicks'))),{value:null,observedCount:0,totalCount:0},'sem campanhas não deve exibir total D0 igual a zero');

console.log('overview-domain.test.mjs: limite de teste e soma D0 validados');
