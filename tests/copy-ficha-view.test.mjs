import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canApplyDetectedValue,collectAutoFilledFieldIds,restoreAutoFilledFieldIds,shouldReplaceDetectedPackages} from '../src/copy-ficha/copy-ficha-view.mjs';

const empty={id:'copyProduct',value:'',dataset:{},classList:{add(){}}};
assert.equal(canApplyDetectedValue(empty,'Grounded Footwear'),true,'um campo vazio aceita a detecção');

const restoredAutomatic={id:'copyProduct',value:'Grounded Footwear',dataset:{autoFilled:'true'},classList:{add(){}}};
assert.equal(canApplyDetectedValue(restoredAutomatic,'Freedom'),true,'um valor previamente detectado e restaurado pode ser atualizado');

const manual={id:'copyProduct',value:'Nome digitado pelo usuário',dataset:{},classList:{add(){}}};
assert.equal(canApplyDetectedValue(manual,'Grounded Footwear'),false,'um valor manual divergente não é sobrescrito sem ação explícita');
assert.equal(canApplyDetectedValue(manual,'Nome digitado pelo usuário'),false,'um valor manual idêntico não perde sua origem');
assert.equal(canApplyDetectedValue(manual,'Grounded Footwear',{force:true}),true,'uma ação explícita pode substituir o valor manual');

assert.equal(shouldReplaceDetectedPackages([{label:'STARTER',contents:'30-day supply',confidence:'review',autoDetected:true}]),true,'uma nova análise atualiza pacotes automáticos antigos');
assert.equal(shouldReplaceDetectedPackages([{label:'Meu pacote',contents:'edição manual',autoDetected:true,userEdited:true}]),false,'uma nova análise preserva campos de pacote editados manualmente');
assert.equal(shouldReplaceDetectedPackages([{label:'',contents:'',autoDetected:true,userEdited:true}]),false,'campos apagados manualmente não reabrem espaço para substituição automática');
assert.equal(shouldReplaceDetectedPackages([{label:'Meu pacote',contents:'edição manual'}]),false,'uma nova análise preserva pacotes inseridos manualmente');
assert.equal(shouldReplaceDetectedPackages([{label:'30-day supply',autoDetected:true}],{listEdited:true}),false,'uma remoção ou adição manual da lista não é desfeita pela análise');
assert.equal(shouldReplaceDetectedPackages([{label:'',regularPrice:'',promoPrice:'',contents:''}]),true,'campos de pacote vazios aceitam a detecção');

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
assert.match(view,/packagesManuallyEdited/,'o rascunho preserva adições e remoções manuais de pacotes');
assert.match(view,/data-user-edited=/,'a edição manual de um pacote fica registrada no próprio cartão');
assert.match(view,/Usar sugestão de produto:/,'uma detecção divergente oferece ação explícita sem substituir o valor manual');
assert.match(view,/useSuggestion\.onclick=\(\)=>useProductSuggestion\(/,'o botão aplica a sugestão escolhida');
assert.ok(view.includes('quantityUnit:row.dataset.quantityUnit')&&view.includes('data-quantity-unit=')&&view.includes('packageDescriptor:row.dataset.packageDescriptor')&&view.includes('data-package-descriptor='),'a visualização preserva a unidade e a condição exibida de cada pacote');
assert.ok(view.includes('generationBlockerPackageIndexes(data)')&&view.includes('row?.classList.add(\'is-pending\')'),'somente os pacotes inconsistentes recebem o destaque de pendência');
assert.ok(view.includes('error.blockers=diagnostics.blockers')&&view.includes('error.fields=diagnostics.fields')&&view.includes('error.packageIndexes=diagnostics.packageIndexes'),'a validação final preserva mensagens e alvos visuais detalhados');
assert.ok(view.includes('updatePendingHighlights(root,{fields:error?.fields,packageIndexes:error?.packageIndexes})')&&view.includes('{blocked:Boolean(error?.blocked||blockers)}'),'o bloqueio final reaplica os destaques e é mostrado como bloqueio');
assert.ok(!view.includes('a ficha ainda contém confirmações ou campos sem preencher.'),'não deve voltar a exibir o bloqueio genérico sem apontar a pendência');

console.log('copy-ficha-view.test.mjs: ok');
