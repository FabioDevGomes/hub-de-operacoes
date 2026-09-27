import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../src/view-registry.js',import.meta.url),'utf8');
const context=vm.createContext({window:{},URLSearchParams,encodeURIComponent});
vm.runInContext(source,context);
const views=context.window.PanelViews;

assert.equal(views.resolveRoute('/').id,'totals');
assert.equal(views.resolveRoute('/').title,'Visão geral');
assert.equal(views.resolveRoute('/?view=tested').id,'tested');
assert.equal(views.resolveRoute('?view=cpa').id,'cpa');
assert.equal(views.resolveRoute('/?view=accounts').id,'accounts');
assert.equal(views.resolveRoute('/?view=macro').id,'macro');
assert.equal(views.resolveRoute('/?view=macro').title,'Controle Macro');
assert.equal(views.resolveRoute('/?view=billing').id,'billing');
assert.equal(views.resolveRoute('/?view=billing').title,'Faturamento');
assert.equal(views.resolveRoute('/?view=observability').id,'observability');
assert.equal(views.resolveRoute('/?view=curation-observability').id,'curation-observability');
assert.equal(views.resolveRoute('/?view=time').id,'time');
assert.equal(views.resolveRoute('/?view=personal-finance').id,'personal-finance');
assert.equal(views.resolveRoute('/?view=personal-finance').title,'Controle de gastos');
assert.equal(views.resolveRoute('/?view=copy').id,'copy');
assert.equal(views.resolveRoute('/?view=presell').id,'presell');
assert.equal(views.resolveRoute('/?view=desconhecida').id,'totals');

assert.equal(views.urlFor('totals','/'),'/');
assert.equal(views.urlFor('tested','/'),'/?view=tested');
assert.equal(views.urlFor('cpa','/'),'/?view=cpa');
assert.equal(views.urlFor('accounts','/'),'/?view=accounts');
assert.equal(views.urlFor('macro','/'),'/?view=macro');
assert.equal(views.urlFor('billing','/'),'/?view=billing');
assert.equal(views.urlFor('observability','/'),'/?view=observability');
assert.equal(views.urlFor('curation-observability','/'),'/?view=curation-observability');
assert.equal(views.urlFor('time','/'),'/?view=time');
assert.equal(views.urlFor('personal-finance','/'),'/?view=personal-finance');
assert.equal(views.urlFor('copy','/'),'/?view=copy');
assert.equal(views.urlFor('presell','/'),'/?view=presell');

assert.equal(views.isReserved('time'),false);
assert.equal(views.definition('time').enabled,true);
assert.equal(views.definition('time').sectionId,'timeView');
assert.equal(views.definition('copy').sectionId,'copyFichaView');
assert.equal(views.definition('presell').sectionId,'presellView');
assert.equal(views.definition('personal-finance').sectionId,'personalFinanceView');
assert.equal(views.definition('personal-finance').navId,'personalFinanceNav');
assert.equal(views.definition('observability').sectionId,'observabilityView');
assert.equal(views.definition('observability').navId,'observabilityNav');
assert.equal(views.definition('curation-observability').sectionId,'curationObservabilityView');
assert.equal(views.definition('curation-observability').navId,'curationObservabilityNav');
assert.equal(views.definition('curation-observability').activeView,'curation-observability');
assert.equal(views.definition('macro').sectionId,'controlMacroView');
assert.equal(views.definition('macro').navId,'controlMacroNav');
assert.equal(views.definition('macro').activeView,'control-macro');
assert.equal(Array.from(views.enabledViews()).some(view=>view.id==='time'),true);

console.log('view registry ok');
