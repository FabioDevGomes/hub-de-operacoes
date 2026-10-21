import assert from 'node:assert/strict';
import test from 'node:test';
import {buildAccountDirectory, normalizeAccountDirectoryId, sortAccountDirectoryRows} from '../src/accounts/accounts-list-domain.mjs';

const field = valor => ({valor});

test('account directory sorts numeric and date values and keeps missing data last in either direction',()=>{
  const rows=[
    {account:'A',impressions:12,startDate:'2026-10-03'},
    {account:'B',impressions:0,startDate:null},
    {account:'C',impressions:null,startDate:'2026-09-30'},
    {account:'D',impressions:3,startDate:'2026-10-03'}
  ];
  assert.deepEqual(sortAccountDirectoryRows(rows,'impressions','asc').map(row=>row.account),['B','D','A','C']);
  assert.deepEqual(sortAccountDirectoryRows(rows,'impressions','desc').map(row=>row.account),['A','D','B','C'],'ausentes ficam no fim e zero continua sendo valor válido');
  assert.deepEqual(sortAccountDirectoryRows(rows,'startDate','asc').map(row=>row.account),['C','A','D','B']);
  assert.deepEqual(sortAccountDirectoryRows(rows,'startDate','desc').map(row=>row.account),['A','D','C','B']);
  assert.deepEqual(rows.map(row=>row.account),['A','B','C','D'],'a função não altera a ordem de entrada');
});

test('account directory uses natural Portuguese text ordering and rejects the action column',()=>{
  const rows=[{account:'Conta 10'},{account:'Conta 2'},{account:'Conta 1'}];
  assert.deepEqual(sortAccountDirectoryRows(rows,'account').map(row=>row.account),['Conta 1','Conta 2','Conta 10']);
  assert.deepEqual(sortAccountDirectoryRows(rows,'edit').map(row=>row.account),['Conta 10','Conta 2','Conta 1']);
});

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
    {account:'111-222-3333',mcc:'MCC principal · 999-888-7777',startDate:'2026-10-03',impressions:null,clicks:null,campaignCount:1,conversions:null},
    {account:'444-555-6666',mcc:'MCC principal · 999-888-7777',startDate:'2026-10-08',impressions:null,clicks:null,campaignCount:1,conversions:null}
  ]);
});

test('directory retains identified accounts without making up an MCC or a start date', () => {
  const rows = buildAccountDirectory({
    campaigns:[{nome_mcc:'Legacy',conta_sufixo:'1234'}],
    accountIdentities:{5678:'5678'},
    snapshots:[]
  });
  assert.deepEqual(rows,[
    {account:'1234',mcc:'Não identificada',startDate:null,impressions:null,clicks:null,campaignCount:1,conversions:null},
    {account:'5678',mcc:'Não identificada',startDate:null,impressions:null,clicks:null,campaignCount:0,conversions:null}
  ]);
});

test('manually registered accounts appear without product data and merge with a later capture', () => {
  const manual = buildAccountDirectory({manualAccounts:['1234567890','123-456-7890']});
  assert.deepEqual(manual,[{account:'123-456-7890',mcc:'Não identificada',startDate:null,impressions:null,clicks:null,campaignCount:0,conversions:null}],
    'ID digitado sem hífens é normalizado e duplicata manual não aparece duas vezes');
  assert.equal(normalizeAccountDirectoryId('1234'),null,'só o sufixo não é identidade completa suficiente');
  assert.equal(normalizeAccountDirectoryId('123-456-789'),null,'ID incompleto não é aceito');

  const merged = buildAccountDirectory({
    campaigns:[{id:'future-campaign',nome_mcc:'Produto futuro',conta_id:'123-456-7890',mcc_id:'999-888-7777'}],
    managers:[{id:'999-888-7777',nome:'MCC e-com'}],
    snapshots:[{data:'2026-10-19',campanhas:['Produto futuro']}],
    manualAccounts:['1234567890']
  });
  assert.deepEqual(merged,[{account:'123-456-7890',mcc:'MCC e-com · 999-888-7777',startDate:'2026-10-19',impressions:null,clicks:null,campaignCount:1,conversions:null}],
    'quando a captura MCC passar a trazer a conta, seus dados enriquecem a mesma linha manual');
});

test('account impressions, clicks and official conversions sum daily campaign metrics once per stored diary row', () => {
  const rows = buildAccountDirectory({
    campaigns:[
      {id:'campaign-a',nome_mcc:'Produto A',conta_id:'111-222-3333'},
      {id:'campaign-b',nome_mcc:'Produto B',conta_id:'111-222-3333'},
      {id:'campaign-zero',nome_mcc:'Produto Zero',conta_id:'444-555-6666'},
      {id:'campaign-missing',nome_mcc:'Produto sem dados',conta_id:'777-888-9999'}
    ],
    diario:[
      {campanha_id:'campaign-a',data:'2026-10-18',celulas:{B:{value:1200},C:{value:40},F:{value:0.98}}},
      {campanha_id:'campaign-a',data:'2026-10-19',celulas:{B:{value:30},C:{value:'6'},F:{value:1}}},
      {campanha_id:'campaign-b',data:'2026-10-19',celulas:{B:{value:'5'},C:{value:2},F:{value:'0.5'}}},
      {campanha_id:'campaign-b',data:'2026-10-20',celulas:{B:{value:null},C:{value:null},F:{value:null}}},
      {campanha_id:'campaign-zero',data:'2026-10-20',celulas:{B:{value:0},C:{value:0},F:{value:0}}},
      {campanha_id:'campaign-missing',data:'2026-10-20',celulas:{B:{value:'inválido'},C:{value:'inválido'},F:{value:'inválido'}}}
    ]
  });
  assert.deepEqual(rows.map(({account,impressions,clicks,campaignCount,conversions})=>[account,impressions,clicks,campaignCount,conversions]),[
    ['111-222-3333',1235,48,2,2.48],
    ['444-555-6666',0,0,1,0],
    ['777-888-9999',null,null,1,null]
  ],'soma métricas por dia, conta campanhas distintas e preserva zero observado/ausência de métrica');
});

test('conversion totals sort numerically with fractional values and keep absent values last',()=>{
  const rows=[{account:'B',conversions:1.25},{account:'A',conversions:0.98},{account:'C',conversions:null}];
  assert.deepEqual(sortAccountDirectoryRows(rows,'conversions','asc').map(row=>row.account),['A','B','C']);
  assert.deepEqual(sortAccountDirectoryRows(rows,'conversions','desc').map(row=>row.account),['B','A','C']);
});

test('campaign count follows resolved account mapping and counts each campaign identity once', () => {
  const rows = buildAccountDirectory({
    campaigns:[
      {id:'campaign-a',nome_mcc:'A',conta_id:'111-222-3333'},
      {id:'campaign-a',nome_mcc:'A duplicada',conta_id:'111-222-3333'},
      {id:'campaign-b',nome_mcc:'B',conta_id:'111-222-3333'}
    ],
    manifest:{campanhas:[{nome_campanha_exato:'A',metricas_D_zero:{conta_id:field('444-555-6666'),data:field('2026-10-20')}}]}
  });
  assert.deepEqual(rows.map(({account,campaignCount})=>[account,campaignCount]),[
    ['111-222-3333',1],
    ['444-555-6666',1]
  ],'campanha associada pelo manifesto conta na conta resolvida sem duplicar registros com o mesmo ID');
});

test('directory view escapes imported labels and renders editable manual fields and status', async () => {
  const {mount,accountsListEditDialogTemplate,accountsListManualAccountDialogTemplate,accountsListTemplate} = await import('../src/accounts/accounts-list-view.mjs');
  const fields = Object.fromEntries([...(accountsListTemplate+accountsListEditDialogTemplate+accountsListManualAccountDialogTemplate).matchAll(/id="([^"]+)"/g)].map(match=>[match[1],{innerHTML:'',textContent:''}]));
  const dialog = fields.accountDirectoryStatusDialog;
  dialog.open = false;
  dialog.addEventListener = () => {};
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  const editDialog = fields.accountDirectoryEditDialog;
  editDialog.open = false;
  editDialog.addEventListener = () => {};
  editDialog.showModal = () => { editDialog.open = true; };
  editDialog.close = () => { editDialog.open = false; };
  fields.accountDirectoryEditForm.addEventListener = () => {};
  fields.accountDirectoryEmailInput.value = '';
  fields.accountDirectoryEmailInput.addEventListener = () => {};
  fields.accountDirectoryEmailInput.focus = () => {};
  fields.accountDirectoryPaymentProfileInput.value = '';
  fields.accountDirectoryPaymentProfileInput.addEventListener = () => {};
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
  const root = {innerHTML:'',listeners:{},querySelector:selector=>fields[selector.slice(1)],querySelectorAll:()=>[],addEventListener:(type,listener)=>{root.listeners[type]=listener}};
  const controller = mount({root,getSnapshot:()=>({campaigns:[{nome_mcc:'<img>',conta_id:'111-222-3333',mcc_id:'999-888-7777'}],managers:[{id:'999-888-7777',nome:'<script>'}]}),format:{date:value=>value}});
  controller.render();
  assert.equal((accountsListTemplate.match(/<th\b/g)||[]).length,11);
  assert.match(fields.accountDirectoryBody.innerHTML,/&lt;script&gt;/);
  assert.doesNotMatch(fields.accountDirectoryBody.innerHTML,/<script>|<img/);
  assert.match(fields.accountDirectoryBody.innerHTML,/class="account-directory-email-value" title="E-mail não definido">Não definido<\/span>/);
  assert.match(fields.accountDirectoryBody.innerHTML,/class="account-directory-payment-profile-value" title="ID de perfil de pagamento não definido">Não definido<\/span>/);
  assert.match(fields.accountDirectoryBody.innerHTML,/<td data-column="conversions" class="account-directory-conversions-cell">—<\/td>/,'sem conversões oficiais, a coluna mostra ausência');
  assert.match(fields.accountDirectoryBody.innerHTML,/data-account-edit-open="111-222-3333"[^>]*aria-controls="accountDirectoryEditDialog"/);
  assert.doesNotMatch(fields.accountDirectoryBody.innerHTML,/data-account-email-open|data-account-payment-profile-open|hub-corner-edit/);
  assert.match(fields.accountDirectoryBody.innerHTML,/data-account-status-open="111-222-3333"[^>]*>Não definido<\/button>/);
  assert.equal(fields.accountDirectoryCount.textContent,'1 conta');
});
