import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const template=await readFile(new URL('../src/product-diary/template.html',import.meta.url),'utf8');
const styles=await readFile(new URL('../src/product-diary/product-diary.css',import.meta.url),'utf8');
const index=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');

for(const[direction,step,label]of[['increase',4,'CPA +4%'],['decrease',4,'CPA −4%'],['increase',2,'CPA +2%'],['decrease',2,'CPA −2%']]){
  assert.match(template,new RegExp(`data-product-cpa-adjust="${direction}" data-product-cpa-step="${step}">${label.replace(/[+]/g,'\\+')}`),`${label} permanece ligado ao passo ${step}`);
}
assert.match(template,/data-product-cpa-step="4"[\s\S]*data-product-cpa-step="2"/,'o grupo de quatro pontos precede o grupo legado de dois');
assert.match(styles,/\.product-campaign-cpa-adjustment-groups\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'os passos ficam lado a lado quando há espaço');
assert.match(styles,/@media\(max-width:760px\)\{#productView \.product-campaign-cpa-adjustment-groups\{grid-template-columns:minmax\(0,1fr\)\}\}/,'em telas estreitas cada grupo mantém uma coluna');
assert.match(index,/product-diary\/cpa-adjustment-domain\.js\?v=2/,'o domínio do novo passo invalida o cache');
assert.match(index,/product-diary\/observation-domain\.js\?v=13/,'a regra de registro do passo invalida o cache');
assert.match(index,/product-diary\/view\.js\?v=60/,'a interface do Diário invalida o cache');
assert.match(index,/google-ads-campaign-actions-service\.mjs\?v=9/,'o serviço CPA atualizado invalida o cache');
console.log('product diary CPA step UI ok');
