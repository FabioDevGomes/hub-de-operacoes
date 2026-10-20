import assert from 'node:assert/strict';
import test from 'node:test';
import {accountsListTemplate, mount} from '../src/accounts/accounts-list-view.mjs';
import {ACCOUNT_DIRECTORY_EMAIL_KEY, ACCOUNT_DIRECTORY_MANUAL_ACCOUNTS_KEY, ACCOUNT_DIRECTORY_PAYMENT_PROFILE_KEY, ACCOUNT_DIRECTORY_STATUS_KEY} from '../src/accounts/accounts-list-storage.mjs';

function mockRoot() {
  const fields = {
    accountDirectoryCount:{textContent:''},
    accountDirectoryActiveCount:{textContent:''},
    accountDirectorySuspendedCount:{textContent:''},
    accountDirectoryBody:{innerHTML:''},
    accountDirectoryStatusDialog:{open:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();}},
    accountDirectoryStatusAccount:{textContent:''},
    accountDirectoryStatusError:{textContent:''},
    accountDirectoryEmailDialog:{open:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();}},
    accountDirectoryEmailAccount:{textContent:''},
    accountDirectoryEmailTitle:{textContent:''},
    accountDirectoryEmailInput:{value:'',focus(){}},
    accountDirectoryEmailError:{textContent:''},
    accountDirectoryEmailForm:{handlers:{},addEventListener(type,handler){this.handlers[type]=handler;}},
    accountDirectoryPaymentProfileDialog:{open:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();}},
    accountDirectoryPaymentProfileAccount:{textContent:''},
    accountDirectoryPaymentProfileTitle:{textContent:''},
    accountDirectoryPaymentProfileInput:{value:'',focus(){}},
    accountDirectoryPaymentProfileError:{textContent:''},
    accountDirectoryPaymentProfileForm:{handlers:{},addEventListener(type,handler){this.handlers[type]=handler;}},
    accountDirectoryManualAccountDialog:{open:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();}},
    accountDirectoryManualAccountInput:{value:'',focus(){}},
    accountDirectoryManualAccountError:{textContent:''},
    accountDirectoryManualAccountForm:{handlers:{},addEventListener(type,handler){this.handlers[type]=handler;}}
  };
  const listeners = {};
  const root = {
    innerHTML:'',
    querySelector(selector){return fields[selector.slice(1)];},
    addEventListener(type,listener){listeners[type]=listener;},
    click(selector,dataset={}){
      const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},target:{closest(candidate){return candidate===selector?{dataset}:null;}}};
      listeners.click(event);
      return event;
    }
  };
  root.querySelectorAll = () => [];
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

test('account directory shows the manual e-mail column and persists an explicitly entered e-mail', () => {
  const storage = memoryStorage();
  const {root,fields} = mockRoot();
  const controller = mount({root,getSnapshot:snapshot,format:{date:value=>value},storage});
  controller.render();

  assert.equal((accountsListTemplate.match(/<th\b/g)||[]).length,6);
  assert.match(root.innerHTML,/accountDirectoryEmailDialog/);
  assert.match(root.innerHTML,/accountDirectoryPaymentProfileDialog/);
  assert.match(root.innerHTML,/accountDirectoryManualAccountDialog/);
  assert.match(root.innerHTML,/data-account-create-open aria-haspopup="dialog" aria-controls="accountDirectoryManualAccountDialog">Adicionar conta/);
  assert.equal(storage.values.size,0,'abrir e renderizar não infere nem grava e-mails');
  assert.match(fields.accountDirectoryBody.innerHTML,/<td class="account-directory-email-cell hub-edit-host"><span class="account-directory-email-value" title="E-mail não definido">Não definido<\/span><a href="#" class="hub-corner-edit" data-account-email-open="111-222-3333"[^>]*>Cadastrar<\/a><\/td>/);
  assert.match(fields.accountDirectoryBody.innerHTML,/<td class="account-directory-payment-profile-cell hub-edit-host"><span class="account-directory-payment-profile-value" title="ID de perfil de pagamento não definido">Não definido<\/span><a href="#" class="hub-corner-edit" data-account-payment-profile-open="111-222-3333"[^>]*>Cadastrar<\/a><\/td>/);
  assert.doesNotMatch(fields.accountDirectoryBody.innerHTML,/account-directory-email-button|<button[^>]*data-account-email-open/,'e-mail e ação de cadastro não usam aparência de botão');
  const empty = mockRoot();
  mount({root:empty.root,getSnapshot:()=>({}),format:{date:value=>value},storage}).render();
  assert.match(empty.fields.accountDirectoryBody.innerHTML,/colspan="6"/,'estado vazio acompanha as seis colunas');

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
  assert.match(fields.accountDirectoryBody.innerHTML,/class="account-directory-email-value" title="E-mail não definido">Não definido<\/span><a href="#" class="hub-corner-edit" data-account-email-open="777-888-9999"[^>]*>Cadastrar<\/a>/);
  assert.match(fields.accountDirectoryBody.innerHTML,/data-status="unset" data-account-status-open="777-888-9999"[^>]*>Não definido<\/button>/);
  assert.match(fields.accountDirectoryBody.innerHTML,/data-account-email-open="777-888-9999"[^>]*aria-label="Cadastrar e-mail da conta 777-888-9999"/);
  assert.match(fields.accountDirectoryBody.innerHTML,/data-account-email-open="777-888-9999"[^>]*>[\s\S]*?<td title="Não identificada">Não identificada<\/td><td class="account-directory-date">—/);

  const emailOpenEvent = root.click('[data-account-email-open]',{accountEmailOpen:'111-222-3333'});
  assert.equal(emailOpenEvent.defaultPrevented,true,'o link abre o diálogo sem navegar para o topo da página');
  assert.equal(fields.accountDirectoryEmailDialog.open,true);
  assert.equal(fields.accountDirectoryEmailAccount.textContent,'Conta 111-222-3333');
  assert.equal(fields.accountDirectoryEmailTitle.textContent,'Cadastrar e-mail');
  fields.accountDirectoryEmailInput.value='owner+ads@example.com';
  fields.accountDirectoryEmailForm.handlers.submit({preventDefault(){}});

  assert.equal(fields.accountDirectoryEmailDialog.open,false);
  assert.match(fields.accountDirectoryBody.innerHTML,/<span class="account-directory-email-value" title="owner\+ads@example\.com">owner\+ads@example\.com<\/span><a href="#" class="hub-corner-edit" data-account-email-open="111-222-3333"[^>]*>Editar<\/a>/);
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_EMAIL_KEY))['111-222-3333'],'owner+ads@example.com');
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_MANUAL_ACCOUNTS_KEY))[0],'777-888-9999');
  assert.equal(storage.getItem(ACCOUNT_DIRECTORY_STATUS_KEY),null,'adicionar conta ou e-mail não define o status');

  const remounted = mockRoot();
  mount({root:remounted.root,getSnapshot:snapshot,format:{date:value=>value},storage}).render();
  assert.match(remounted.fields.accountDirectoryBody.innerHTML,/<span class="account-directory-email-value" title="owner\+ads@example\.com">owner\+ads@example\.com<\/span><a href="#" class="hub-corner-edit" data-account-email-open="111-222-3333"[^>]*>Editar<\/a>/);
  assert.match(remounted.fields.accountDirectoryBody.innerHTML,/777-888-9999/,'a conta cadastrada permanece na lista após reabrir');
  assert.match(remounted.fields.accountDirectoryBody.innerHTML,/data-status="unset"[^>]*>Não definido<\/button>/);
  root.click('[data-account-email-open]',{accountEmailOpen:'111-222-3333'});
  assert.equal(fields.accountDirectoryEmailTitle.textContent,'Alterar e-mail');
  assert.equal(fields.accountDirectoryEmailInput.value,'owner+ads@example.com');

  const profileOpenEvent = root.click('[data-account-payment-profile-open]',{accountPaymentProfileOpen:'111-222-3333'});
  assert.equal(profileOpenEvent.defaultPrevented,true,'o link do perfil abre o diálogo sem navegação');
  assert.equal(fields.accountDirectoryPaymentProfileDialog.open,true);
  assert.equal(fields.accountDirectoryPaymentProfileAccount.textContent,'Conta 111-222-3333');
  assert.equal(fields.accountDirectoryPaymentProfileTitle.textContent,'Cadastrar ID de perfil de pagamento');
  fields.accountDirectoryPaymentProfileInput.value='profile-123456789012';
  fields.accountDirectoryPaymentProfileForm.handlers.submit({preventDefault(){}});
  assert.equal(fields.accountDirectoryPaymentProfileDialog.open,false);
  assert.match(fields.accountDirectoryBody.innerHTML,/<span class="account-directory-payment-profile-value" title="profile-123456789012">profile-123456789012<\/span><a href="#" class="hub-corner-edit" data-account-payment-profile-open="111-222-3333"[^>]*>Editar<\/a>/);
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_PAYMENT_PROFILE_KEY))['111-222-3333'],'profile-123456789012');
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_EMAIL_KEY))['111-222-3333'],'owner+ads@example.com','e-mail permanece independente do ID de pagamento');

  const profileRemount = mockRoot();
  mount({root:profileRemount.root,getSnapshot:snapshot,format:{date:value=>value},storage}).render();
  profileRemount.root.click('[data-account-payment-profile-open]',{accountPaymentProfileOpen:'111-222-3333'});
  assert.equal(profileRemount.fields.accountDirectoryPaymentProfileTitle.textContent,'Alterar ID de perfil de pagamento');
  assert.equal(profileRemount.fields.accountDirectoryPaymentProfileInput.value,'profile-123456789012');
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

test('an invalid or failed e-mail save keeps the dialog open and leaves the value unchanged', () => {
  const storage = memoryStorage({failWrite:true});
  const {root,fields} = mockRoot();
  mount({root,getSnapshot:snapshot,format:{date:value=>value},storage}).render();
  root.click('[data-account-email-open]',{accountEmailOpen:'444-555-6666'});
  fields.accountDirectoryEmailInput.value='not-an-email';
  fields.accountDirectoryEmailForm.handlers.submit({preventDefault(){}});
  assert.equal(fields.accountDirectoryEmailDialog.open,true);
  assert.match(fields.accountDirectoryEmailError.textContent,/e-mail válido/);
  assert.match(fields.accountDirectoryBody.innerHTML,/class="account-directory-email-value" title="E-mail não definido">Não definido<\/span><a href="#" class="hub-corner-edit" data-account-email-open="444-555-6666"[^>]*>Cadastrar<\/a>/);

  fields.accountDirectoryEmailInput.value='owner@example.com';
  fields.accountDirectoryEmailForm.handlers.submit({preventDefault(){}});
  assert.equal(fields.accountDirectoryEmailDialog.open,true);
  assert.match(fields.accountDirectoryEmailError.textContent,/Não foi possível salvar o e-mail/);
  assert.doesNotMatch(fields.accountDirectoryBody.innerHTML,/<span>owner@example\.com<\/span>/);
  assert.equal(storage.values.size,0);
});

test('an invalid or failed payment profile ID save keeps the dialog open and leaves the value unchanged', () => {
  const storage = memoryStorage({failWrite:true});
  const {root,fields} = mockRoot();
  mount({root,getSnapshot:snapshot,format:{date:value=>value},storage}).render();
  root.click('[data-account-payment-profile-open]',{accountPaymentProfileOpen:'444-555-6666'});
  fields.accountDirectoryPaymentProfileInput.value='';
  fields.accountDirectoryPaymentProfileForm.handlers.submit({preventDefault(){}});
  assert.equal(fields.accountDirectoryPaymentProfileDialog.open,true);
  assert.match(fields.accountDirectoryPaymentProfileError.textContent,/ID de perfil de pagamento/);
  assert.match(fields.accountDirectoryBody.innerHTML,/class="account-directory-payment-profile-value" title="ID de perfil de pagamento não definido">Não definido<\/span><a href="#" class="hub-corner-edit" data-account-payment-profile-open="444-555-6666"[^>]*>Cadastrar<\/a>/);

  fields.accountDirectoryPaymentProfileInput.value='profile-987654321098';
  fields.accountDirectoryPaymentProfileForm.handlers.submit({preventDefault(){}});
  assert.equal(fields.accountDirectoryPaymentProfileDialog.open,true);
  assert.match(fields.accountDirectoryPaymentProfileError.textContent,/Não foi possível salvar o ID do perfil de pagamento/);
  assert.doesNotMatch(fields.accountDirectoryBody.innerHTML,/profile-987654321098/);
  assert.equal(storage.values.size,0);
});
