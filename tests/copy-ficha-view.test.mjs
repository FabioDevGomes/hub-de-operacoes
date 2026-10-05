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

const view=(await Promise.all(['copy-ficha-view.mjs','copy-ficha-template.mjs','copy-ficha-draft.mjs','copy-ficha-workflow.mjs'].map(path=>readFile(new URL('../src/copy-ficha/'+path,import.meta.url),'utf8')))).join('\n');
const copyCss=await readFile(new URL('../src/copy-ficha/copy-ficha.css',import.meta.url),'utf8');
const outputCss=await readFile(new URL('../src/copy-ficha/copy-ficha-output.css',import.meta.url),'utf8');
assert.ok(!view.includes('Resultados')&&!view.includes('copyFichaJson')&&!view.includes('copyDownloadFicha'),'a restauração das perguntas não reintroduz resultados de anúncios ou download JSON');
assert.ok(view.includes('copyGenerateQuestions')&&view.includes('copyOfferQuestions')&&view.includes('Perguntas e respostas da oferta')&&view.includes("by(root,'copyGenerateQuestions').onclick=()=>generateQuestions(root,toast)"),'a tela restaura o botão independente e o quadro editável de perguntas e respostas');
assert.match(view,/<h2>3\. Conteúdo obrigatório da ficha<\/h2>/,'o conteúdo obrigatório passa a ser o item 3');
assert.ok(view.includes('id="copyPresellStatus"')&&view.includes('id="copyPresellReport"')&&view.includes('id="copyWarnings"'),'o item 3 mantém o status e os relatórios de validação da Presell');
assert.ok(view.includes('async function generateFichaAndCreatePresell(')&&view.includes('createFromStructuredContent(inputValue(root,\'copyFichaSource\'),payload(root))')&&view.includes('buildStructuredFicha(source,data)')&&view.includes('await create(ficha)'),'a ação única valida o conteúdo estruturado antes de criar a Presell');
assert.ok(!view.includes('function generate(root,')&&!view.includes('Gerar copy')&&!view.includes('generateAssets'),'a tela não gera mais copy de anúncios');
assert.ok(view.includes('confirmedDiscountAmount:inputValue(root,\'copyDiscountAmount\')')&&view.includes('copyDiscountAmount:draft.confirmedDiscountAmount'),'o valor associado ao percentual é salvo e restaurado no rascunho');
assert.ok(view.includes('id="copyDiscountAmount"')&&view.includes('id="copyDiscountAmountLabel"')&&view.includes('Valor do desconto (${currency})')&&view.includes('clearAutoDiscountAmount(root)'),'a interface exibe o campo de economia com moeda dinâmica e invalida valor automático ao trocar a moeda');
assert.ok(copyCss.includes('.copy-ficha-discount-pair{grid-column:span 2')&&copyCss.includes('padding:6px 7px;font-size:.78rem')&&copyCss.includes('@media(max-width:620px){.copy-ficha-discount-pair{grid-column:auto}}'),'percentual e valor ficam compactos, alinhados e responsivos');
assert.ok(!view.includes('copyAssetsTabs')&&!view.includes('copyAssetsPanel')&&!outputCss.includes('.copy-ficha-tabs'),'as abas de ativos de anúncios foram removidas da tela');
assert.match(view,/autoFilledFields:collectAutoFilledFieldIds\(/,'o salvamento inclui a origem dos campos preenchidos automaticamente');
assert.match(view,/restoreAutoFilledFieldIds\(root\.querySelectorAll\('input,select,textarea'\),draft\.autoFilledFields\)/,'a abertura do rascunho restaura a origem dos campos');
assert.match(view,/if\(Array\.isArray\(previous\.packages\)\)draft\.packages=previous\.packages/,'a remoção do quadro não apaga dados legados do rascunho salvo');
assert.ok(view.includes("applyDetected(root,'copyDiscount',result.highestPercent,{force:true})")&&view.includes('result.highestSavingsAmount'),'a análise substitui o percentual antigo pelo maior identificado e preenche o valor associado a ele');
assert.ok(view.includes('result.highestSavingsPercentMismatch')&&view.includes('o cartão anuncia'),'a análise alerta quando o valor derivado pelos preços diverge do percentual anunciado');
assert.ok(!view.includes('Pacotes para a ficha')&&!view.includes('copyPackages')&&!view.includes('copyAddPackage')&&!view.includes('copy-ficha-package'),'a interface remove os quadros e campos de pacote da ficha');
assert.ok(!view.includes('packages:[]')&&!view.includes('copyPackages'),'os pacotes não são usados na geração das perguntas nem da ficha');
assert.match(view,/Usar sugestão de produto:/,'uma detecção divergente oferece ação explícita sem substituir o valor manual');
assert.match(view,/useSuggestion\.onclick=\(\)=>useProductSuggestion\(/,'o botão aplica a sugestão escolhida');
assert.ok(view.includes('updatePendingHighlights(root,{fields:error?.fields})')&&view.includes('error.blockers||[error.message]'),'a ficha destaca os campos obrigatórios quando não pode ser gerada');
assert.ok(!view.includes('a ficha ainda contém confirmações ou campos sem preencher.'),'não deve voltar a exibir o bloqueio genérico sem apontar a pendência');

console.log('copy-ficha-view.test.mjs: ok');
