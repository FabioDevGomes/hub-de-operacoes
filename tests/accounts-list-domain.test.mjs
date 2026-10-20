import assert from 'node:assert/strict';
import test from 'node:test';
import {buildAccountDirectory, normalizeAccountDirectoryId} from '../src/accounts/accounts-list-domain.mjs';

const field = valor => ({valor});

test('directory deduplicates accounts and reports the earliest observed capture date', () => {
  const rows = buildAccountDirectory({
    campaigns:[
      {nome_mcc:'Current A',nome_mcc_anterior:'Old A',conta_id:'111-222-3333',mcc_id:'999-888-7777'},
      {nome_mcc:'Historical B',conta_id:'444-555-6666',mcc_id:'999-888-7777'}
    ],
    managers:[{id:'999-888-7777',nome:'MCC principal'}],
    snapshots:[
      {data:'2026-10-08',campanhas:['Current A','Historical B']},
      {data:'2026-10-03',campanhas:['Old A']},
      {data:'2026-02-30',campanhas:['Current A']}
    ],
    manifest:{
      identificacao_mcc:{id:'999-888-7777',nome:'MCC atual'},
      campanhas:[{nome_campanha_exato:'Current A',mcc_id:'999-888-7777',metricas_D_zero:{conta_id:field('111-222-3333'),data:field('2026-10-20')}}]
    }
  });
  assert.deepEqual(rows,[
    {account:'111-222-3333',mcc:'MCC principal · 999-888-7777',startDate:'2026-10-03'},
    {account:'444-555-6666',mcc:'MCC principal · 999-888-7777',startDate:'2026-10-08'}
  ]);
});

test('directory retains identified accounts without making up an MCC or a start date', () => {
  const rows = buildAccountDirectory({
    campaigns:[{nome_mcc:'Legacy',conta_sufixo:'1234'}],
    accountIdentities:{5678:'5678'},
    snapshots:[]
  });
  assert.deepEqual(rows,[
    {account:'1234',mcc:'Não identificada',startDate:null},
    {account:'5678',mcc:'Não identificada',startDate:null}
  ]);
});

test('manually registered accounts appear without product data and merge with a later capture', () => {
  const manual = buildAccountDirectory({manualAccounts:['1234567890','123-456-7890']});
  assert.deepEqual(manual,[{account:'123-456-7890',mcc:'Não identificada',startDate:null}],
    'ID digitado sem hífens é normalizado e duplicata manual não aparece duas vezes');
  assert.equal(normalizeAccountDirectoryId('1234'),null,'só o sufixo não é identidade completa suficiente');
  assert.equal(normalizeAccountDirectoryId('123-456-789'),null,'ID incompleto não é aceito');

  const merged = buildAccountDirectory({
    campaigns:[{nome_mcc:'Produto futuro',conta_id:'123-456-7890',mcc_id:'999-888-7777'}],
    managers:[{id:'999-888-7777',nome:'MCC e-com'}],
    snapshots:[{data:'2026-10-19',campanhas:['Produto futuro']}],
    manualAccounts:['1234567890']
  });
  assert.deepEqual(merged,[{account:'123-456-7890',mcc:'MCC e-com · 999-888-7777',startDate:'2026-10-19'}],
    'quando a captura MCC passar a trazer a conta, seus dados enriquecem a mesma linha manual');
});

test('directory view escapes imported labels and renders editable manual fields and status', async () => {
  const {mount,accountsListEmailDialogTemplate,accountsListPaymentProfileDialogTemplate,accountsListManualAccountDialogTemplate,accountsListTemplate} = await import('../src/accounts/accounts-list-view.mjs');
  const fields = Object.fromEntries([...(accountsListTemplate+accountsListEmailDialogTemplate+accountsListPaymentProfileDialogTemplate+accountsListManualAccountDialogTemplate).matchAll(/id="([^"]+)"/g)].map(match=>[match[1],{innerHTML:'',textContent:''}]));
  const dialog = fields.accountDirectoryStatusDialog;
  dialog.open = false;
  dialog.addEventListener = () => {};
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  const emailDialog = fields.accountDirectoryEmailDialog;
  emailDialog.open = false;
  emailDialog.addEventListener = () => {};
  emailDialog.showModal = () => { emailDialog.open = true; };
  emailDialog.close = () => { emailDialog.open = false; };
  fields.accountDirectoryEmailForm.addEventListener = () => {};
  fields.accountDirectoryEmailInput.value = '';
  fields.accountDirectoryEmailInput.focus = () => {};
  const paymentProfileDialog = fields.accountDirectoryPaymentProfileDialog;
  paymentProfileDialog.open = false;
  paymentProfileDialog.addEventListener = () => {};
  paymentProfileDialog.showModal = () => { paymentProfileDialog.open = true; };
  paymentProfileDialog.close = () => { paymentProfileDialog.open = false; };
  fields.accountDirectoryPaymentProfileForm.addEventListener = () => {};
  fields.accountDirectoryPaymentProfileInput.value = '';
  fields.accountDirectoryPaymentProfileInput.focus = () => {};
  const manualAccountDialog = fields.accountDirectoryManualAccountDialog;
  manualAccountDialog.open = false;
  manualAccountDialog.addEventListener = () => {};
  manualAccountDialog.showModal = () => { manualAccountDialog.open = true; };
  manualAccountDialog.close = () => { manualAccountDialog.open = false; };
  fields.accountDirectoryManualAccountForm.addEventListener = () => {};
  fields.accountDirectoryManualAccountInput.value = '';
  fields.accountDirectoryManualAccountInput.focus = () => {};
  dialog.addEventListener = () => {};
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  const root = {innerHTML:'',listeners:{},querySelector:selector=>fields[selector.slice(1)],addEventListener:(type,listener)=>{root.listeners[type]=listener}};
  const controller = mount({root,getSnapshot:()=>({campaigns:[{nome_mcc:'<img>',conta_id:'111-222-3333',mcc_id:'999-888-7777'}],managers:[{id:'999-888-7777',nome:'<script>'}]}),format:{date:value=>value}});
  controller.render();
  assert.equal((accountsListTemplate.match(/<th\b/g)||[]).length,6);
  assert.match(fields.accountDirectoryBody.innerHTML,/&lt;script&gt;/);
  assert.doesNotMatch(fields.accountDirectoryBody.innerHTML,/<script>|<img/);
  assert.match(fields.accountDirectoryBody.innerHTML,/class="account-directory-email-value" title="E-mail não definido">Não definido<\/span><a href="#" class="hub-corner-edit" data-account-email-open="111-222-3333"[^>]*>Cadastrar<\/a>/);
  assert.match(fields.accountDirectoryBody.innerHTML,/class="account-directory-payment-profile-value" title="ID de perfil de pagamento não definido">Não definido<\/span><a href="#" class="hub-corner-edit" data-account-payment-profile-open="111-222-3333"[^>]*>Cadastrar<\/a>/);
  assert.match(fields.accountDirectoryBody.innerHTML,/data-account-status-open="111-222-3333"[^>]*>Não definido<\/button>/);
  assert.equal(fields.accountDirectoryCount.textContent,'1 conta');
});
