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
assert.equal(views.resolveRoute('/?view=time').id,'time');
assert.equal(views.resolveRoute('/?view=desconhecida').id,'totals');

assert.equal(views.urlFor('totals','/'),'/');
assert.equal(views.urlFor('tested','/'),'/?view=tested');
assert.equal(views.urlFor('cpa','/'),'/?view=cpa');
assert.equal(views.urlFor('accounts','/'),'/?view=accounts');
assert.equal(views.urlFor('time','/'),'/?view=time');

assert.equal(views.isReserved('time'),false);
assert.equal(views.definition('time').enabled,true);
assert.equal(views.definition('time').sectionId,'timeView');
assert.equal(Array.from(views.enabledViews()).some(view=>view.id==='time'),true);

console.log('view registry ok');
