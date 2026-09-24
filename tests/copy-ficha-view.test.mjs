import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canApplyDetectedValue,collectAutoFilledFieldIds,restoreAutoFilledFieldIds} from '../src/copy-ficha/copy-ficha-view.mjs';

const empty={id:'copyProduct',value:'',dataset:{},classList:{add(){}}};
assert.equal(canApplyDetectedValue(empty,'Grounded Footwear'),true,'um campo vazio aceita a detecção');

const restoredAutomatic={id:'copyProduct',value:'Grounded Footwear',dataset:{autoFilled:'true'},classList:{add(){}}};
assert.equal(canApplyDetectedValue(restoredAutomatic,'Freedom'),true,'um valor previamente detectado e restaurado pode ser atualizado');

const manual={id:'copyProduct',value:'Nome digitado pelo usuário',dataset:{},classList:{add(){}}};
assert.equal(canApplyDetectedValue(manual,'Grounded Footwear'),false,'um valor manual divergente não é sobrescrito sem ação explícita');
assert.equal(canApplyDetectedValue(manual,'Nome digitado pelo usuário'),false,'um valor manual idêntico não perde sua origem');
assert.equal(canApplyDetectedValue(manual,'Grounded Footwear',{force:true}),true,'uma ação explícita pode substituir o valor manual');

const savedFields=[
  {id:'copyProduct',dataset:{autoFilled:'true'}},
  {id:'copyCountry',dataset:{}},
  {id:'copyLanguage',dataset:{autoFilled:'true'}},
  {dataset:{autoFilled:'true'}}
];
assert.deepEqual(collectAutoFilledFieldIds(savedFields),['copyProduct','copyLanguage'],'o rascunho persiste apenas campos automáticos identificáveis');

const restoredFields=[
  {id:'copyProduct',dataset:{},classList:{values:[],add(value){this.values.push(value)}}},
  {id:'copyCountry',dataset:{},classList:{values:[],add(value){this.values.push(value)}}}
];
restoreAutoFilledFieldIds(restoredFields,['copyProduct']);
assert.equal(restoredFields[0].dataset.autoFilled,'true','a restauração recupera a origem automática');
assert.deepEqual(restoredFields[0].classList.values,['is-autofilled'],'a restauração recupera o destaque de detecção');
assert.equal(restoredFields[1].dataset.autoFilled,undefined,'campos manuais continuam sem marcação automática');

const view=await readFile(new URL('../src/copy-ficha/copy-ficha-view.mjs',import.meta.url),'utf8');
assert.match(view,/autoFilledFields:collectAutoFilledFieldIds\(/,'o salvamento inclui a origem dos campos preenchidos automaticamente');
assert.match(view,/restoreAutoFilledFieldIds\(root\.querySelectorAll\('input,select,textarea'\),draft\.autoFilledFields\)/,'a abertura do rascunho restaura a origem dos campos');
assert.match(view,/Usar sugestão de produto:/,'uma detecção divergente oferece ação explícita sem substituir o valor manual');
assert.match(view,/useSuggestion\.onclick=\(\)=>useProductSuggestion\(/,'o botão aplica a sugestão escolhida');

console.log('copy-ficha-view.test.mjs: ok');
