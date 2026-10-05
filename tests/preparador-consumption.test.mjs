import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../dist/preparador-MCC/index.html', import.meta.url), 'utf8');
const extract = name => html.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n    \\}`))[0];
const context = { Intl };
vm.runInNewContext(`const ABSENT=new Set(['','—','-']);function normalize(v){return String(v).trim();}${['parseNumber','stateValue','formatCaptureConsumption'].map(extract).join('\n')};globalThis.total=formatCaptureConsumption;`, context);
const records = [{ cost:'10,20', moeda:'USD' }, { cost:'0,10', moeda:'USD' }, { cost:'5,00', moeda:'BRL' }];
const before = JSON.stringify(records);
assert.equal(context.total(records), 'US$ 10,30 · R$ 5,00');
assert.equal(JSON.stringify(records), before);
assert.equal(context.total([{cost:'0',moeda:'BRL'}]), 'R$ 0,00');
assert.equal(context.total([{cost:null,moeda:'BRL'}]), 'Não disponível');
assert.equal(context.total([{cost:'inválido',moeda:'BRL'}]), 'Não disponível');
assert.match(context.total([{cost:'2',moeda:'BRL'},{cost:'—',moeda:'BRL'}]), /R\$.*2,00.*parcial: 1/);
assert.match(context.total([{cost:'2',moeda:'BRL'},{cost:'3',moeda:''}]), /parcial: 1/);
