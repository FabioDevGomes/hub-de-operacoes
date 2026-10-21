import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {ACCOUNT_DIRECTORY_COLUMN_WIDTHS_KEY, accountsListTemplate, mount} from '../src/accounts/accounts-list-view.mjs';
import {ACCOUNT_DIRECTORY_EMAIL_KEY, ACCOUNT_DIRECTORY_MANUAL_ACCOUNTS_KEY, ACCOUNT_DIRECTORY_PAYMENT_PROFILE_KEY, ACCOUNT_DIRECTORY_STATUS_KEY} from '../src/accounts/accounts-list-storage.mjs';

function mockRoot() {
  const fields = {
    accountDirectoryCount:{textContent:''},
    accountDirectoryActiveCount:{textContent:''},
    accountDirectorySuspendedCount:{textContent:''},
    accountDirectoryWidthsMessage:{textContent:''},
    accountDirectoryBody:{innerHTML:''},
    accountDirectoryTable:{attributes:new Map(),setAttribute(key,value){this.attributes.set(key,String(value));},getAttribute(key){return this.attributes.get(key)||null;},removeAttribute(key){this.attributes.delete(key);}},
    accountDirectoryHeaders:[],
    accountDirectoryCells:[],
    accountDirectoryResizers:[],
    accountDirectorySortButtons:[],
    accountDirectorySortHeaders:{},
    accountDirectoryStatusDialog:{open:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();}},
    accountDirectoryStatusAccount:{textContent:''},
    accountDirectoryStatusError:{textContent:''},
    accountDirectoryEditDialog:{open:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();}},
    accountDirectoryEditAccount:{textContent:''},
    accountDirectoryEditError:{textContent:''},
    accountDirectoryEditForm:{handlers:{},addEventListener(type,handler){this.handlers[type]=handler;}},
    accountDirectoryEmailInput:{value:'',handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},focus(){}},
    accountDirectoryEmailError:{textContent:''},
    accountDirectoryPaymentProfileInput:{value:'',handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},focus(){}},
    accountDirectoryPaymentProfileError:{textContent:''},
    accountDirectoryManualAccountDialog:{open:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();}},
    accountDirectoryManualAccountInput:{value:'',focus(){}},
    accountDirectoryManualAccountError:{textContent:''},
    accountDirectoryManualAccountForm:{handlers:{},addEventListener(type,handler){this.handlers[type]=handler;}}
  };
  const listeners = {};
  const root = {
    innerHTML:'',
    classList:{values:new Set(),add(value){this.values.add(value);},remove(value){this.values.delete(value);}},
    querySelector(selector){return selector==='.account-directory-table'?fields.accountDirectoryTable:fields[selector.slice(1)];},
    addEventListener(type,listener){listeners[type]=listener;},
    querySelectorAll(selector){if(selector==='[data-account-column-resizer]')return fields.accountDirectoryResizers;if(selector==='[data-account-directory-sort]')return fields.accountDirectorySortButtons;if(selector==='.account-directory-table th[data-column]')return fields.accountDirectoryHeaders;if(selector==='.account-directory-table td[data-column]')return fields.accountDirectoryCells;if(selector==='.account-directory-table th[data-column],.account-directory-table td[data-column]')return [...fields.accountDirectoryHeaders,...fields.accountDirectoryCells];return [];},
    click(selector,dataset={}){
      const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},target:{closest(candidate){return candidate===selector?{dataset}:null;}}};
      listeners.click(event);
      return event;
    }
  };
  for(const key of ['account','email','paymentProfile','mcc','startDate','impressions','clicks','campaignCount','conversions','status']){
    const attributes=new Map(),headerAttributes=new Map(),arrow={textContent:'↕'};
    const header={dataset:{column:key},setAttribute(name,value){headerAttributes.set(name,String(value));},getAttribute(name){return headerAttributes.get(name)||null;}};
    const button={dataset:{accountDirectorySort:key},setAttribute(name,value){attributes.set(name,String(value));},getAttribute(name){return attributes.get(name)||null;},querySelector(selector){return selector==='.account-directory-sort-arrow'?arrow:null;},closest(selector){return selector==='th[data-column]'?header:null;}};
    fields.accountDirectorySortButtons.push(button);fields.accountDirectorySortHeaders[key]={header,button,arrow};
  }
  return {root,fields,listeners};
}

function memoryStorage({failWrite=false}={}) {
  const values = new Map();
  return {
    values,
    getItem(key){return values.get(key) ?? null;},
    setItem(key,value){if(failWrite)throw new Error('write failed');values.set(key,String(value));}
  };
}

const snapshot = () => ({
  campaigns:[
    {nome_mcc:'Produto A',conta_id:'111-222-3333',mcc_id:'999-888-7777'},
    {nome_mcc:'Produto B',conta_id:'444-555-6666',mcc_id:'999-888-7777'}
  ],
  managers:[{id:'999-888-7777',nome:'MCC principal'}]
});

function openAccountEdit(root, fields, account) {
  root.click('[data-account-edit-open]',{accountEditOpen:account});
  assert.equal(fields.accountDirectoryEditDialog.open,true);
  assert.equal(fields.accountDirectoryEditAccount.textContent,`Conta ${account}`);
}

test('account directory centers the table and all numeric totals', () => {
  const css = readFileSync(new URL('../src/accounts/accounts.css', import.meta.url), 'utf8');
  assert.match(css,/\.account-directory-panel\{width:100%;max-width:none;box-sizing:border-box\}/,'o painel da tabela ocupa toda a largura disponível do conteúdo');
  assert.match(css,/\.account-directory-table th,\.account-directory-table td\{[^}]*text-align:center(?:;|\})/);
  assert.match(css,/\.account-directory-table \.account-directory-impressions-cell,\.account-directory-table \.account-directory-clicks-cell,\.account-directory-table \.account-directory-campaign-count-cell,\.account-directory-table \.account-directory-conversions-cell\{text-align:center!important;font-variant-numeric:tabular-nums\}/);
  assert.match(css,/\.account-directory-table \.account-directory-sort:focus-visible\{outline:2px solid #4fa7ff;outline-offset:-1px\}/,'ordenação mantém foco de teclado visível');
});

test('account directory sorts by numeric columns, toggles direction, exposes aria-sort and does not persist sorting',()=>{
  const database={
    campaigns:[
      {id:'campaign-a',nome_mcc:'Campanha A',conta_id:'111-222-3333'},
      {id:'campaign-b',nome_mcc:'Campanha B',conta_id:'222-333-4444'},
      {id:'campaign-c',nome_mcc:'Campanha C',conta_id:'333-444-5555'}
    ],
    diario:[
      {campanha_id:'campaign-a',data:'2026-10-18',celulas:{B:{value:1000},F:{value:0.98}}},
      {campanha_id:'campaign-b',data:'2026-10-18',celulas:{B:{value:20},F:{value:2}}},
      {campanha_id:'campaign-c',data:'2026-10-18',celulas:{B:{value:null},F:{value:null}}}
    ]
  };
  const storage=memoryStorage();storage.setItem(ACCOUNT_DIRECTORY_STATUS_KEY,JSON.stringify({'111-222-3333':'suspended','222-333-4444':'active'}));
  const savedPreferences=JSON.stringify([...storage.values]),{root,fields}=mockRoot();
  const controller=mount({root,getSnapshot:()=>database,format:{date:value=>value},storage});controller.render();
  const accounts=()=>[...fields.accountDirectoryBody.innerHTML.matchAll(/<td data-column="account">([^<]+)<\/td>/g)].map(match=>match[1]);
  assert.match(accountsListTemplate,/<th scope="col" data-column="impressions"[^>]*><button type="button" class="account-directory-sort" data-account-directory-sort="impressions"/);
  assert.match(accountsListTemplate,/<th scope="col" data-column="edit">Editar<span/,'a coluna Editar não recebe ordenação');
  root.click('[data-account-directory-sort]',{accountDirectorySort:'impressions'});
  assert.deepEqual(accounts(),['222-333-4444','111-222-3333','333-444-5555'],'a ordenação numérica crescente mantém ausentes por último');
  assert.equal(fields.accountDirectorySortHeaders.impressions.header.getAttribute('aria-sort'),'ascending');
  assert.equal(fields.accountDirectorySortHeaders.impressions.button.getAttribute('aria-pressed'),'true');
  assert.equal(fields.accountDirectorySortHeaders.impressions.arrow.textContent,'↑');
  root.click('[data-account-directory-sort]',{accountDirectorySort:'impressions'});
  assert.deepEqual(accounts(),['111-222-3333','222-333-4444','333-444-5555'],'o segundo clique inverte para decrescente');
  assert.equal(fields.accountDirectorySortHeaders.impressions.header.getAttribute('aria-sort'),'descending');
  root.click('[data-account-directory-sort]',{accountDirectorySort:'conversions'});
  assert.deepEqual(accounts(),['111-222-3333','222-333-4444','333-444-5555'],'conversões são ordenadas numericamente e ausências ficam por último');
  assert.equal(fields.accountDirectorySortHeaders.conversions.header.getAttribute('aria-sort'),'ascending');
  root.click('[data-account-directory-sort]',{accountDirectorySort:'conversions'});
  assert.deepEqual(accounts(),['222-333-4444','111-222-3333','333-444-5555'],'conversões podem ser ordenadas em sentido decrescente');
  root.click('[data-account-directory-sort]',{accountDirectorySort:'status'});
  assert.deepEqual(accounts(),['222-333-4444','111-222-3333','333-444-5555'],'status não definido permanece no fim');
  root.click('[data-account-directory-sort]',{accountDirectorySort:'status'});
  assert.deepEqual(accounts(),['111-222-3333','222-333-4444','333-444-5555'],'status ausente continua no fim ao inverter a direção');
  controller.render();
  assert.deepEqual(accounts(),['111-222-3333','222-333-4444','333-444-5555'],'a ordenação permanece ao atualizar a apresentação');
  assert.equal(JSON.stringify([...storage.values]),savedPreferences,'ordenar não grava preferências nem dados da conta');
});

test('account directory add action reuses the dark standard button without changing its dialog action', () => {
  assert.match(accountsListTemplate,/id="accountDirectoryAddButton" type="button" class="btn hub-standard-action account-directory-add-button" data-account-create-open/);
  const css = readFileSync(new URL('../src/accounts/accounts.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css,/\.account-directory-add-button\s*\{/);
});

function resizeFixture(fields, widths=[140,205,230,210,120,150,130,158,154,136,110]) {
  const makeClassList=()=>({values:new Set(),add(value){this.values.add(value);},remove(value){this.values.delete(value);}});
  const element=(dataset,width=0)=>{
    const attributes=new Map();
    return {dataset,style:{},classList:makeClassList(),setAttribute(key,value){attributes.set(key,String(value));},getAttribute(key){return attributes.get(key)||null;},removeAttribute(key){attributes.delete(key);},getBoundingClientRect(){return {width};}};
  };
  const columns=['account','email','paymentProfile','mcc','startDate','impressions','clicks','campaignCount','conversions','status','edit'];
  fields.accountDirectoryHeaders=columns.map((column,index)=>element({column},widths[index]));
  fields.accountDirectoryCells=columns.map(column=>element({column}));
  fields.accountDirectoryResizers=columns.map(accountColumnResizer=>element({accountColumnResizer}));
  return fields.accountDirectoryResizers[0];
}

test('account directory resizes columns by pointer and persists a screen-local preference without changing account data',()=>{
  const storage=memoryStorage(),data=JSON.stringify(snapshot()),{root,fields,listeners}=mockRoot(),handle=resizeFixture(fields);
  const controller=mount({root,getSnapshot:snapshot,format:{date:value=>value},storage});controller.render();
  assert.equal(storage.values.size,0,'montar e renderizar não grava larguras');
  assert.match(root.innerHTML,/data-account-column-resizer="paymentProfile" role="separator" tabindex="0"/);
  handle.setPointerCapture=id=>{handle.pointerId=id};handle.hasPointerCapture=id=>handle.pointerId===id;handle.releasePointerCapture=()=>{handle.pointerId=null};
  const event=(x,target=handle)=>({button:0,pointerId:7,clientX:x,target:{closest(selector){return selector==='[data-account-column-resizer]'?target:null;}},preventDefault(){},stopPropagation(){}});
  assert.equal(typeof listeners.pointerdown,'function');
  listeners.pointerdown(event(100));assert.equal(handle.pointerId,7,'o handle inicia a captura do ponteiro');listeners.pointermove(event(180));
  assert.equal(fields.accountDirectoryHeaders[0].getAttribute('style'),'width:220px');
  assert.equal(fields.accountDirectoryCells[0].getAttribute('style'),'width:220px');
  assert.equal(storage.values.size,0,'arrastar não grava até soltar');
  listeners.pointerup(event(180));
  const saved=JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_COLUMN_WIDTHS_KEY));
  assert.equal(saved.account,220);assert.equal(saved.paymentProfile,230);assert.equal(storage.values.size,1);
  assert.equal(JSON.stringify(snapshot()),data,'redimensionamento não altera dados da conta');

  const remount=mockRoot(),remountHandle=resizeFixture(remount.fields,[100,100,100,100,100,100,100,100,100,100,100]);
  mount({root:remount.root,getSnapshot:snapshot,format:{date:value=>value},storage}).render();
  assert.equal(remount.fields.accountDirectoryHeaders[0].getAttribute('style'),'width:220px','a largura é restaurada ao abrir novamente');
  assert.equal(remount.fields.accountDirectoryHeaders[2].getAttribute('style'),'width:230px','as outras colunas mantêm a largura congelada');
  assert.equal(remountHandle.getAttribute('aria-valuenow'),'220');
});

test('adding account metrics and edit columns preserves existing six-column width preferences',()=>{
  const storage=memoryStorage();
  storage.setItem(ACCOUNT_DIRECTORY_COLUMN_WIDTHS_KEY,JSON.stringify({account:170,email:215,paymentProfile:240,mcc:205,startDate:135,status:142}));
  const {root,fields}=mockRoot();resizeFixture(fields);
  mount({root,getSnapshot:snapshot,format:{date:value=>value},storage}).render();
  assert.equal(fields.accountDirectoryHeaders[0].getAttribute('style'),'width:170px');
  assert.equal(fields.accountDirectoryHeaders[5].getAttribute('style'),'width:150px','a coluna nova recebe uma largura mínima legível');
  assert.equal(fields.accountDirectoryHeaders[6].getAttribute('style'),'width:130px','Cliques recebe largura inicial própria');
  assert.equal(fields.accountDirectoryHeaders[7].getAttribute('style'),'width:158px','Total de campanhas recebe largura inicial própria');
  assert.equal(fields.accountDirectoryHeaders[8].getAttribute('style'),'width:154px','Conversões recebe largura inicial própria');
  assert.equal(fields.accountDirectoryHeaders[9].getAttribute('style'),'width:142px','a largura de Status salva anteriormente é preservada');
  assert.equal(fields.accountDirectoryHeaders[10].getAttribute('style'),'width:104px','Editar mantém a largura mínima inicial');
  assert.equal(storage.values.size,1,'a preferência antiga não é regravada só por abrir a tela');
});

test('account directory column resizing supports keyboard, cancellation, width limits and blocked storage feedback',()=>{
  const storage=memoryStorage({failWrite:true}),{root,fields,listeners}=mockRoot(),handle=resizeFixture(fields);
  mount({root,getSnapshot:snapshot,format:{date:value=>value},storage}).render();
  handle.setPointerCapture=id=>{handle.pointerId=id};handle.hasPointerCapture=id=>handle.pointerId===id;handle.releasePointerCapture=()=>{handle.pointerId=null};
  const event=(x,target=handle)=>({button:0,pointerId:3,clientX:x,target:{closest(selector){return selector==='[data-account-column-resizer]'?target:null;}},preventDefault(){},stopPropagation(){}});
  listeners.pointerdown(event(100));listeners.pointermove(event(-500));
  assert.equal(handle.getAttribute('aria-valuenow'),'132','a largura mínima é aplicada');
  listeners.pointercancel(event(-500));assert.equal(fields.accountDirectoryTable.getAttribute('style'),null,'cancelar restaura o layout anterior');
  listeners.keydown({...event(),key:'ArrowRight',shiftKey:true});
  assert.equal(handle.getAttribute('aria-valuenow'),'170','Shift + seta ajusta 30 px');
  assert.match(fields.accountDirectoryWidthsMessage.textContent,/nesta sessão/,'falha de gravação é informada sem descartar o ajuste');
  assert.equal(storage.values.size,0);
});

test('account directory saves changed details together and closes after success', () => {
  const storage = memoryStorage();
  const {root,fields} = mockRoot();
  const controller = mount({root,getSnapshot:snapshot,format:{date:value=>value},storage});
  controller.render();

  assert.equal((accountsListTemplate.match(/<th\b/g)||[]).length,11);
  assert.match(accountsListTemplate,/<th scope="col" data-column="impressions" aria-sort="none" title="Soma das impressões diárias registradas no Diário de campanha para esta conta"><button[^>]*data-account-directory-sort="impressions"[^>]*>.*?Impressões totais/s);
  assert.match(accountsListTemplate,/<th scope="col" data-column="clicks" aria-sort="none" title="Soma dos cliques diários registrados no Diário de campanha para esta conta"><button[^>]*data-account-directory-sort="clicks"[^>]*>.*?Cliques totais/s);
  assert.match(accountsListTemplate,/<th scope="col" data-column="campaignCount" aria-sort="none" title="Quantidade de campanhas distintas registradas nesta conta"><button[^>]*data-account-directory-sort="campaignCount"[^>]*>.*?Total de campanhas/s);
  assert.match(accountsListTemplate,/<th scope="col" data-column="conversions" aria-sort="none" title="Soma dos valores registrados nas células F do Diário de campanha; não inclui vendas provisórias"><button[^>]*data-account-directory-sort="conversions"[^>]*>.*?Conversões totais/s);
  assert.match(root.innerHTML,/id="accountDirectoryEditDialog"/);
  assert.match(root.innerHTML,/id="accountDirectoryEditForm"[\s\S]*id="accountDirectoryEmailInput"[\s\S]*id="accountDirectoryPaymentProfileInput"[\s\S]*>Salvar<\/button>/);
  assert.equal((root.innerHTML.match(/>Salvar<\/button>/g)||[]).length,1,'o diálogo tem somente um botão Salvar');
  assert.doesNotMatch(root.innerHTML,/Salvar e-mail|Salvar ID/);
  assert.doesNotMatch(root.innerHTML,/accountDirectoryEmailDialog|accountDirectoryPaymentProfileDialog|data-account-edit-field/,'não existe seletor nem segundo diálogo');
  assert.match(root.innerHTML,/accountDirectoryManualAccountDialog/);
  assert.match(root.innerHTML,/data-account-create-open aria-haspopup="dialog" aria-controls="accountDirectoryManualAccountDialog">Adicionar conta/);
  assert.equal(storage.values.size,0,'abrir e renderizar não infere nem grava e-mails');
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="email" class="account-directory-email-cell"><span class="account-directory-email-value" title="E-mail não definido">Não definido<\/span><\/td>/);
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="paymentProfile" class="account-directory-payment-profile-cell"><span class="account-directory-payment-profile-value" title="ID de perfil de pagamento não definido">Não definido<\/span><\/td>/);
  assert.match(fields.accountDirectoryBody.innerHTML,/data-column="edit" class="account-directory-edit-cell"><button[^>]*data-account-edit-open="111-222-3333"[^>]*>Editar<\/button>/);
  assert.doesNotMatch(fields.accountDirectoryBody.innerHTML,/data-account-email-open|data-account-payment-profile-open|hub-corner-edit/,'os links de edição não ficam mais dentro das colunas de dados');
  const empty = mockRoot();
  mount({root:empty.root,getSnapshot:()=>({}),format:{date:value=>value},storage}).render();
  assert.match(empty.fields.accountDirectoryBody.innerHTML,/colspan="11"/,'estado vazio acompanha as onze colunas');

  root.click('[data-account-create-open]');
  assert.equal(fields.accountDirectoryManualAccountDialog.open,true);
  fields.accountDirectoryManualAccountInput.value='1234';
  fields.accountDirectoryManualAccountForm.handlers.submit({preventDefault(){}});
  assert.match(fields.accountDirectoryManualAccountError.textContent,/ID completo/);
  fields.accountDirectoryManualAccountInput.value='1112223333';
  fields.accountDirectoryManualAccountForm.handlers.submit({preventDefault(){}});
  assert.match(fields.accountDirectoryManualAccountError.textContent,/já aparece na lista/);
  fields.accountDirectoryManualAccountInput.value='7778889999';
  fields.accountDirectoryManualAccountForm.handlers.submit({preventDefault(){}});
  assert.equal(fields.accountDirectoryManualAccountDialog.open,false);
  assert.deepEqual(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_MANUAL_ACCOUNTS_KEY)),['777-888-9999']);
  assert.match(fields.accountDirectoryBody.innerHTML,/class="account-directory-email-value" title="E-mail não definido">Não definido<\/span>/);
  assert.match(fields.accountDirectoryBody.innerHTML,/data-status="unset" data-account-status-open="777-888-9999"[^>]*>Não definido<\/button>/);
  assert.match(fields.accountDirectoryBody.innerHTML,/data-account-edit-open="777-888-9999"[^>]*aria-label="Editar e-mail ou ID de perfil de pagamento da conta 777-888-9999"/);
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="mcc" title="Não identificada">Não identificada<\/td><td data-column="startDate" class="account-directory-date">—/);

  openAccountEdit(root,fields,'111-222-3333');
  assert.equal(fields.accountDirectoryEmailInput.value,'');
  assert.equal(fields.accountDirectoryPaymentProfileInput.value,'');
  const storedKeysBeforeNoChange=storage.values.size;
  fields.accountDirectoryEditForm.handlers.submit({preventDefault(){}});
  assert.equal(fields.accountDirectoryEditDialog.open,false,'sem alterações, Salvar apenas fecha o diálogo');
  assert.equal(storage.values.size,storedKeysBeforeNoChange,'salvar sem mudanças não grava chaves locais');

  openAccountEdit(root,fields,'111-222-3333');
  fields.accountDirectoryEmailInput.value='owner+ads@example.com';
  fields.accountDirectoryPaymentProfileInput.value='profile-123456789012';
  fields.accountDirectoryEditForm.handlers.submit({preventDefault(){}});

  assert.equal(fields.accountDirectoryEditDialog.open,false,'salvar conclui e fecha o diálogo');
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="email" class="account-directory-email-cell"><span class="account-directory-email-value" title="owner\+ads@example\.com">owner\+ads@example\.com<\/span><\/td>/);
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_EMAIL_KEY))['111-222-3333'],'owner+ads@example.com');
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_PAYMENT_PROFILE_KEY))['111-222-3333'],'profile-123456789012','o mesmo salvamento atualiza o ID de perfil');
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_MANUAL_ACCOUNTS_KEY))[0],'777-888-9999');
  assert.equal(storage.getItem(ACCOUNT_DIRECTORY_STATUS_KEY),null,'adicionar conta ou e-mail não define o status');

  openAccountEdit(root,fields,'111-222-3333');
  assert.equal(fields.accountDirectoryEmailInput.value,'owner+ads@example.com');
  assert.equal(fields.accountDirectoryPaymentProfileInput.value,'profile-123456789012');
  fields.accountDirectoryEmailInput.value='updated@example.com';
  fields.accountDirectoryEditForm.handlers.submit({preventDefault(){}});
  assert.equal(fields.accountDirectoryEditDialog.open,false,'também fecha quando somente um campo mudou');
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_EMAIL_KEY))['111-222-3333'],'updated@example.com');
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_PAYMENT_PROFILE_KEY))['111-222-3333'],'profile-123456789012','campo sem alteração é preservado');
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="paymentProfile" class="account-directory-payment-profile-cell"><span class="account-directory-payment-profile-value" title="profile-123456789012">profile-123456789012<\/span><\/td>/);

  openAccountEdit(root,fields,'111-222-3333');
  fields.accountDirectoryEmailInput.value='draft@example.com';
  root.click('[data-account-edit-close]');
  assert.equal(fields.accountDirectoryEditDialog.open,false,'fechar descarta o rascunho');
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_EMAIL_KEY))['111-222-3333'],'updated@example.com');

  const remounted = mockRoot();
  mount({root:remounted.root,getSnapshot:snapshot,format:{date:value=>value},storage}).render();
  assert.match(remounted.fields.accountDirectoryBody.innerHTML,/<td data-column="email" class="account-directory-email-cell"><span class="account-directory-email-value" title="updated@example\.com">updated@example\.com<\/span><\/td>/);
  assert.match(remounted.fields.accountDirectoryBody.innerHTML,/777-888-9999/,'a conta cadastrada permanece na lista após reabrir');
  assert.match(remounted.fields.accountDirectoryBody.innerHTML,/data-status="unset"[^>]*>Não definido<\/button>/);
  const profileRemount = mockRoot();
  mount({root:profileRemount.root,getSnapshot:snapshot,format:{date:value=>value},storage}).render();
  openAccountEdit(profileRemount.root,profileRemount.fields,'111-222-3333');
  assert.equal(profileRemount.fields.accountDirectoryPaymentProfileInput.value,'profile-123456789012');
  assert.equal(profileRemount.fields.accountDirectoryEmailInput.value,'updated@example.com');
});

test('account directory recalculates metrics and distinct campaign totals when the base gains rows',()=>{
  const database={
    campaigns:[{id:'campaign-a',nome_mcc:'Produto A',conta_id:'111-222-3333'}],
    diario:[{campanha_id:'campaign-a',data:'2026-10-18',celulas:{B:{value:1200},C:{value:42},F:{value:0.98}}}]
  };
  const {root,fields}=mockRoot();
  const controller=mount({root,getSnapshot:()=>database,format:{date:value=>value,num:value=>new Intl.NumberFormat('pt-BR').format(value)},storage:memoryStorage()});
  controller.render();
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="impressions" class="account-directory-impressions-cell">1\.200<\/td>/);
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="clicks" class="account-directory-clicks-cell">42<\/td>/);
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="campaignCount" class="account-directory-campaign-count-cell">1<\/td>/);
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="conversions" class="account-directory-conversions-cell">0,98<\/td>/,'a fração oficial é exibida sem arredondar para inteiro');
  database.diario[0].celulas.B.value=1225;database.diario[0].celulas.C.value=45;database.diario[0].celulas.F.value=1.23;
  controller.render();
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="impressions" class="account-directory-impressions-cell">1\.225<\/td>/,'novos parciais do mesmo dia substituem o valor atualizado, sem somá-lo novamente');
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="clicks" class="account-directory-clicks-cell">45<\/td>/,'cliques acompanham a atualização da mesma linha diária');
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="conversions" class="account-directory-conversions-cell">1,23<\/td>/,'conversões acompanham o valor atualizado da linha diária');
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="campaignCount" class="account-directory-campaign-count-cell">1<\/td>/,'novos dias da mesma campanha não aumentam o total');
  database.diario.push({campanha_id:'campaign-a',data:'2026-10-19',celulas:{B:{value:35},C:{value:7},F:{value:0.5}}});
  database.campaigns.push({id:'campaign-b',nome_mcc:'Produto B',conta_id:'111-222-3333'});
  database.diario.push({campanha_id:'campaign-b',data:'2026-10-19',celulas:{B:{value:15},C:{value:3},F:{value:2.25}}});
  controller.render();
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="impressions" class="account-directory-impressions-cell">1\.275<\/td>/,'a soma se atualiza na renderização após uma nova carga');
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="clicks" class="account-directory-clicks-cell">55<\/td>/,'a soma de cliques se atualiza após uma nova carga');
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="campaignCount" class="account-directory-campaign-count-cell">2<\/td>/,'uma campanha nova eleva a contagem automaticamente');
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="conversions" class="account-directory-conversions-cell">3,98<\/td>/,'o total reúne campanhas e datas sem arredondar conversões fracionárias');
});

test('selecting a status closes the popup, updates its row, and survives remounting', () => {
  const storage = memoryStorage();
  const {root,fields} = mockRoot();
  const controller = mount({root,getSnapshot:snapshot,format:{date:value=>value},storage});
  controller.render();

  assert.match(root.innerHTML,/Contas ativas/);
  assert.match(root.innerHTML,/Contas suspensas/);
  assert.equal(fields.accountDirectoryActiveCount.textContent,'0','contas sem status não são contadas como ativas');
  assert.equal(fields.accountDirectorySuspendedCount.textContent,'0','contas sem status não são contadas como suspensas');
  assert.equal(storage.values.size, 0, 'mount/render must not write a status automatically');
  assert.match(fields.accountDirectoryBody.innerHTML,/Não definido<\/button>/);
  root.click('[data-account-status-open]',{accountStatusOpen:'111-222-3333'});
  assert.equal(fields.accountDirectoryStatusDialog.open,true);
  assert.equal(fields.accountDirectoryStatusAccount.textContent,'Conta 111-222-3333');
  root.click('[data-account-status-choice]',{accountStatusChoice:'active'});

  assert.equal(fields.accountDirectoryStatusDialog.open,false);
  assert.match(fields.accountDirectoryBody.innerHTML,/data-status="active"[^>]*>Ativa<\/button>/);
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_STATUS_KEY))['111-222-3333'],'active');
  assert.equal(fields.accountDirectoryActiveCount.textContent,'1');
  assert.equal(fields.accountDirectorySuspendedCount.textContent,'0');

  root.click('[data-account-status-open]',{accountStatusOpen:'444-555-6666'});
  root.click('[data-account-status-choice]',{accountStatusChoice:'suspended'});
  assert.equal(fields.accountDirectoryActiveCount.textContent,'1');
  assert.equal(fields.accountDirectorySuspendedCount.textContent,'1');

  const remounted = mockRoot();
  mount({root:remounted.root,getSnapshot:snapshot,format:{date:value=>value},storage}).render();
  assert.match(remounted.fields.accountDirectoryBody.innerHTML,/data-status="active"[^>]*>Ativa<\/button>/);
  assert.match(remounted.fields.accountDirectoryBody.innerHTML,/data-status="suspended"[^>]*>Suspensa<\/button>/);
  assert.equal(remounted.fields.accountDirectoryActiveCount.textContent,'1');
  assert.equal(remounted.fields.accountDirectorySuspendedCount.textContent,'1');
});

test('a failed status write keeps the popup open and leaves the displayed status unchanged', () => {
  const storage = memoryStorage({failWrite:true});
  const {root,fields} = mockRoot();
  const controller = mount({root,getSnapshot:snapshot,format:{date:value=>value},storage});
  controller.render();
  root.click('[data-account-status-open]',{accountStatusOpen:'444-555-6666'});
  root.click('[data-account-status-choice]',{accountStatusChoice:'suspended'});

  assert.equal(fields.accountDirectoryStatusDialog.open,true);
  assert.match(fields.accountDirectoryStatusError.textContent,/Não foi possível salvar o status/);
  assert.match(fields.accountDirectoryBody.innerHTML,/data-status="unset"[^>]*>Não definido<\/button>/);
  assert.equal(storage.values.size,0);
});

test('invalid changed data and storage errors keep the unified edit dialog open', () => {
  const storage = memoryStorage({failWrite:true});
  storage.values.set(ACCOUNT_DIRECTORY_PAYMENT_PROFILE_KEY,JSON.stringify({'444-555-6666':'profile-existing'}));
  const {root,fields} = mockRoot();
  mount({root,getSnapshot:snapshot,format:{date:value=>value},storage}).render();
  openAccountEdit(root,fields,'444-555-6666');
  fields.accountDirectoryEmailInput.value='not-an-email';
  fields.accountDirectoryEditForm.handlers.submit({preventDefault(){}});
  assert.equal(fields.accountDirectoryEditDialog.open,true);
  assert.match(fields.accountDirectoryEmailError.textContent,/e-mail válido/);
  assert.match(fields.accountDirectoryBody.innerHTML,/class="account-directory-email-value" title="E-mail não definido">Não definido<\/span>/);

  fields.accountDirectoryEmailInput.value='owner@example.com';
  fields.accountDirectoryPaymentProfileInput.value='profile-123456789012';
  fields.accountDirectoryEditForm.handlers.submit({preventDefault(){}});
  assert.equal(fields.accountDirectoryEditDialog.open,true);
  assert.match(fields.accountDirectoryEditError.textContent,/Não foi possível salvar todas as alterações/);
  assert.doesNotMatch(fields.accountDirectoryBody.innerHTML,/<span>owner@example\.com<\/span>/);
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_PAYMENT_PROFILE_KEY))['444-555-6666'],'profile-existing','a falha não altera o dado que já estava salvo');

  fields.accountDirectoryEmailInput.value='owner@example.com';
  fields.accountDirectoryPaymentProfileInput.value='';
  fields.accountDirectoryEditForm.handlers.submit({preventDefault(){}});
  assert.equal(fields.accountDirectoryEditDialog.open,true);
  assert.match(fields.accountDirectoryPaymentProfileError.textContent,/ID de perfil de pagamento/,'a validação aponta o campo inválido sem gravar parcialmente');
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_PAYMENT_PROFILE_KEY))['444-555-6666'],'profile-existing');
  assert.equal(storage.getItem(ACCOUNT_DIRECTORY_EMAIL_KEY),null,'campo válido do mesmo lote não é gravado parcialmente');
});
