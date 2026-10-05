import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {summarizeCompetence,monthlyFinancialSeries} from '../src/billing/billing-domain.mjs';
import { adjacentRecordedMonth, correctProvisionalSaleValuesToTransaction, ensureBillingStores, migrateAccountAliasesToTransaction, planSeedImport, syncEditedProvisionalSalesToTransaction, upsertMccConversionSalesToTransaction, upsertProvisionalSalesToTransaction, validateBillingBundle, writeBillingBundleToTransaction } from '../src/billing/billing-storage.mjs';

class Names {
  constructor() { this.values = new Set(); }
  contains(name) { return this.values.has(name); }
  add(name) { this.values.add(name); }
}
class FakeStore {
  constructor(keyPath) { this.keyPath = keyPath; this.indexNames = new Names(); this.indexes = new Map(); this.rows = new Map(); }
  createIndex(name, keyPath) { this.indexNames.add(name); this.indexes.set(name, keyPath); }
  clear() { this.rows.clear(); }
  put(row) { this.rows.set(row[this.keyPath], row); }
}
class FakeDb {
  constructor() { this.objectStoreNames = new Names(); this.stores = new Map(); }
  createObjectStore(name, { keyPath }) { const store = new FakeStore(keyPath); this.objectStoreNames.add(name); this.stores.set(name, store); return store; }
}
const db = new FakeDb();
const transaction = { objectStore: name => db.stores.get(name) };
ensureBillingStores(db, transaction);
assert.deepEqual([...db.objectStoreNames.values].sort(), ['billing_audit','billing_meta','billing_movements','billing_sales','personal_finance_categories','personal_finance_debts','personal_finance_entries','personal_finance_funds','personal_finance_groups','personal_finance_months']);
assert.equal(db.stores.get('billing_sales').keyPath, 'sale_id');
assert.equal(db.stores.get('billing_sales').indexes.get('sale_date'), 'sale_date');
assert.equal(db.stores.get('billing_movements').indexes.get('effective_date'), 'effective_date');
assert.equal(db.stores.get('billing_audit').indexes.get('created_at'), 'created_at');
const storageSource = await readFile(new URL('../src/billing/billing-storage.mjs', import.meta.url), 'utf8');
assert.match(storageSource, /adjacentRecordedMonth[\s\S]*?\.index\(indexName\)\.openCursor\(range, cursorDirection\)/,
  'navegação de meses deve buscar o registro adjacente pelo índice, sem carregar a store inteira');
assert.match(storageSource, /IDBKeyRange\.upperBound\(`\$\{month\}-01`, true\)[\s\S]*?IDBKeyRange\.lowerBound\(`\$\{month\}-31`, true\)/,
  'navegação deve consultar meses anteriores e posteriores pelo intervalo de datas');
assert.match(storageSource, /export async function updateSale[\s\S]*?makeAudit\(action, 'sale', saleId, changes/,
  'atualizar o status da venda registra alterações com antes/depois na auditoria');
const originalIndexedDB = globalThis.indexedDB;
const originalIDBKeyRange = globalThis.IDBKeyRange;
const cursorRows = {
  billing_sales: [{ sale_date:'2026-06-05' }, { sale_date:'2026-12-01' }, { sale_date:'2026-09-09' }],
  billing_movements: [{ effective_date:'2026-04-02' }, { effective_date:'2026-11-30' }],
};
globalThis.IDBKeyRange = {
  upperBound: (value, open) => ({ type:'upper', value, open }),
  lowerBound: (value, open) => ({ type:'lower', value, open }),
};
globalThis.indexedDB = {
  open() {
    const request = {};
    queueMicrotask(() => {
      request.result = {
        close() {},
        transaction(storeName) {
          const tx = {
            objectStore(name) {
              return { index(indexName) { return { openCursor(range, direction) {
                const cursorRequest = {};
                queueMicrotask(() => {
                  const keys = cursorRows[name].map(row => row[indexName]).filter(key => range.type === 'upper' ? (range.open ? key < range.value : key <= range.value) : (range.open ? key > range.value : key >= range.value)).sort();
                  if (direction === 'prev') keys.reverse();
                  cursorRequest.result = keys.length ? { key:keys[0] } : null;
                  cursorRequest.onsuccess?.();
                  queueMicrotask(() => tx.oncomplete?.());
                });
                return cursorRequest;
              } }; } };
            },
          };
          return tx;
        },
      };
      request.onsuccess?.();
    });
    return request;
  },
};
assert.equal(await adjacentRecordedMonth('competence', '2026-09', 'previous'), '2026-06', 'competência pula meses vazios pelo índice');
assert.equal(await adjacentRecordedMonth('competence', '2026-09', 'next'), '2026-12', 'competência avança até o próximo mês com venda');
assert.equal(await adjacentRecordedMonth('cash', '2026-09', 'previous'), '2026-04', 'caixa navega pelos meses com movimentos efetivos');
assert.equal(await adjacentRecordedMonth('cash', '2026-11', 'next'), null, 'não habilita navegação para mês sem registros posteriores');
if (originalIndexedDB === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = originalIndexedDB;
if (originalIDBKeyRange === undefined) delete globalThis.IDBKeyRange; else globalThis.IDBKeyRange = originalIDBKeyRange;
const originalIndexCount = [...db.stores.values()].reduce((sum, store) => sum + store.indexNames.values.size, 0);
ensureBillingStores(db, transaction);
assert.equal([...db.stores.values()].reduce((sum, store) => sum + store.indexNames.values.size, 0), originalIndexCount, 'migração é aditiva e repetível');

const seed = { version:1, sales:[{ sale_id:'s1' },{ sale_id:'s2' }], movements:[{ movement_id:'m1' }] };
assert.deepEqual(planSeedImport(seed), { alreadyApplied:false, sales:seed.sales, movements:seed.movements });
assert.deepEqual(planSeedImport(seed, { existingSales:['s1'], existingMovements:[] }), { alreadyApplied:false, sales:[{ sale_id:'s2' }], movements:seed.movements });
assert.deepEqual(planSeedImport(seed, { installedVersion:1, existingSales:['s1','s2'], existingMovements:['m1'] }), { alreadyApplied:true, sales:[], movements:[] }, 'reabrir/reiniciar não reaplica uma versão instalada');

const bundle = {
  schema:'billing_backup_v1', version:1,
  sales:[{ sale_id:'s1', sale_date:'2026-09-01', platform:'P', product:'A', value_brl:10, value_usd:null, payment_status:'paid' }],
  movements:[{ movement_id:'m1', sale_id:'s1', type:'receipt', effective_date:null, value_brl:10, value_usd:null }],
  audit:[{ audit_id:'a1', entity:'sale', entity_id:'s1', created_at:'2026-09-01T00:00:00Z', action:'sale_created', changes:[] }],
  meta:[{ key:'seed:v1', version:1 }],
};
assert.equal(validateBillingBundle(bundle).sales[0].value_brl, 10);
assert.throws(() => validateBillingBundle({ ...bundle, movements:[{ ...bundle.movements[0], sale_id:'missing' }] }), /sem venda correspondente/);
const targetStores = new Map(['billing_sales','billing_movements','billing_audit','billing_meta'].map(name => [name, { rows:[], clear(){this.rows=[]}, put(row){this.rows.push(row)} }]));
const fakeTx = { objectStore: name => targetStores.get(name) };
writeBillingBundleToTransaction(fakeTx, bundle);
assert.equal(targetStores.get('billing_sales').rows.length, 1);
assert.equal(targetStores.get('billing_movements').rows[0].effective_date, null);
assert.equal(targetStores.get('billing_audit').rows.length, 1);

const accountRows=[
  {sale_id:'linked',campaign_id:'cmp-1',account:'1234',value_brl:90,payment_status:'paid'},
  {sale_id:'unlinked',campaign_id:'cmp-2',account:'1234',value_brl:40,payment_status:'pending'}
];
const accountAudit=[];
const accountSales={openCursor(){const request={};let index=0;const next=()=>queueMicrotask(()=>{request.result=index<accountRows.length?{
  value:accountRows[index],update(row){accountRows[index]=row},continue(){index++;next()}
}:null;request.onsuccess?.()});next();return request}};
const accountTransaction={objectStore:name=>name==='billing_sales'?accountSales:{add:row=>accountAudit.push(row)},abort(){throw new Error('transação abortada')}};
migrateAccountAliasesToTransaction(accountTransaction,{'1234':'111-222-3333'},{'cmp-1':'111-222-3333'});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(accountRows[0].account,'111-222-3333');
assert.equal(accountRows[0].value_brl,90,'a migração da conta preserva o valor financeiro');
assert.equal(accountRows[0].payment_status,'paid','a migração preserva o recebimento');
assert.equal(accountRows[1].account,'1234','sem campanha vinculada à conta completa, o registro não é associado por coincidência');
assert.equal(accountAudit.length,1,'a associação histórica gera auditoria');

const syncStores = new Map([
  ['billing_sales', { rows:[], get(id){const request={};queueMicrotask(()=>{request.result=this.rows.find(row=>row.sale_id===id);request.onsuccess?.()});return request}, add(row){this.rows.push(row)}, put(row){const index=this.rows.findIndex(item=>item.sale_id===row.sale_id);if(index<0)this.rows.push(row);else this.rows[index]=row} }],
  ['billing_audit', { rows:[], add(row){this.rows.push(row)} }],
]);
const syncTx={ objectStore:name=>syncStores.get(name), abort(){ throw new Error('transação abortada') } };
const provisional={id:'manual-1',billing_sale_id:'manual-sale:cmp-1',campanha_id:'cmp-1',data:'2026-09-23',produto:'Produto A',plataforma:'GuruMedia',conta:'3248',valor_brl:229.5,status:'provisoria'};
assert.equal(upsertProvisionalSalesToTransaction(syncTx,[provisional]),1);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(syncStores.get('billing_sales').rows[0].confirmation_status,'manual');
assert.equal(syncStores.get('billing_sales').rows[0].payment_status,'pending');
assert.equal(syncStores.get('billing_audit').rows.length,1,'criação do espelho gera auditoria');
upsertProvisionalSalesToTransaction(syncTx,[{...provisional,status:'conciliada',conciliada_em:'2026-09-24T12:00:00Z'}]);
await new Promise(resolve=>setImmediate(resolve));
const syncedSale=syncStores.get('billing_sales').rows[0];
assert.equal(syncedSale.confirmation_status,'confirmed');
assert.equal(syncedSale.confirmation_source,'MCC D−1');
assert.equal(syncedSale.payment_status,'pending','sync não altera status de pagamento');
assert.equal(syncStores.get('billing_audit').rows.length,2,'confirmação gera trilha auditável');
correctProvisionalSaleValuesToTransaction(syncTx,[{...provisional,valor_brl:235.12}]);
await new Promise(resolve=>setImmediate(resolve));
const correctedSyncedSale=syncStores.get('billing_sales').rows[0];
assert.equal(correctedSyncedSale.value_brl,235.12,'correção de uma venda vinculada atualiza o espelho financeiro');
assert.equal(correctedSyncedSale.product,'Produto A','a correção preserva o produto');
assert.equal(correctedSyncedSale.confirmation_status,'confirmed','a correção preserva a confirmação existente');
assert.equal(correctedSyncedSale.payment_status,'pending','a correção preserva o status de pagamento');
assert.equal(syncStores.get('billing_audit').rows.at(-1).action,'financial_value_corrected','a correção financeira gera auditoria');
assert.deepEqual(syncStores.get('billing_audit').rows.at(-1).changes,[{field:'value_brl',old_value:229.5,new_value:235.12}],'a auditoria registra somente a alteração do valor em reais');
upsertProvisionalSalesToTransaction(syncTx,[{...provisional,status:'conciliada',conciliada_em:'2026-09-24T12:00:00Z'}]);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(syncStores.get('billing_audit').rows.length,3,'repetir importação é idempotente após correção financeira');
syncStores.get('billing_sales').put({...correctedSyncedSale,payment_status:'paid',observed_payment_status:'paid'});
const editedProvisional={...provisional,campanha_id:'cmp-2',conta:'9827',data:'2026-09-25',hora:'18:20',produto:'Produto atualizado',plataforma:'Plataforma atualizada',valor_brl:250,pais_codigo:'AU',status:'conciliada',conciliada_em:'2026-09-24T12:00:00Z'};
assert.equal(syncEditedProvisionalSalesToTransaction(syncTx,[editedProvisional]),1,'edição vinculada atualiza o espelho financeiro dentro da transação principal');
await new Promise(resolve=>setImmediate(resolve));
const editedBillingSale=syncStores.get('billing_sales').rows[0];
assert.equal(editedBillingSale.sale_id,provisional.billing_sale_id,'a edição mantém a chave estável para preservar movimentos vinculados');
assert.equal(editedBillingSale.source_ref,provisional.id,'a edição mantém o vínculo com a venda original');
assert.equal(editedBillingSale.sale_date,'2026-09-25');
assert.equal(editedBillingSale.campaign_id,'cmp-2');
assert.equal(editedBillingSale.account,'9827');
assert.equal(editedBillingSale.product,'Produto atualizado');
assert.equal(editedBillingSale.platform,'Plataforma atualizada');
assert.equal(editedBillingSale.value_brl,250);
assert.equal(editedBillingSale.country_code,'AU');
assert.equal(editedBillingSale.sale_time,'18:20');
assert.equal(editedBillingSale.confirmation_status,'confirmed');
assert.equal(editedBillingSale.payment_status,'paid','editar dados da venda não altera o status de recebimento');
assert.equal(syncStores.get('billing_audit').rows.at(-1).action,'provisional_sale_updated');
assert.ok(syncStores.get('billing_audit').rows.at(-1).changes.some(change=>change.field==='value_brl'&&change.old_value===235.12&&change.new_value===250),'a auditoria registra a alteração financeira');
const legacyManual={id:'sale_legacy42',campanha_id:'cmp-1',data:'2026-09-24',produto:'Produto A',plataforma:'FlowTracking',conta:'',valor_brl:233.18,status:'conciliada',conciliacao_origem:'mcc_d1',conciliada_em:'2026-09-25T12:00:00Z'};
assert.equal(upsertProvisionalSalesToTransaction(syncTx,[legacyManual]),1,'registro legado recebe vínculo de Faturamento determinístico a partir do ID local');
await new Promise(resolve=>setImmediate(resolve));
const linkedLegacy=syncStores.get('billing_sales').rows.find(row=>row.sale_id==='manual-sale:cmp_legacy42');
assert.equal(linkedLegacy.confirmation_status,'confirmed','venda manual legada recebe a confirmação D−1 ao ser vinculada');
assert.equal(linkedLegacy.confirmation_source,'MCC D−1');
assert.equal(linkedLegacy.value_brl,233.18,'vínculo preserva o valor original do lançamento manual');
assert.equal(linkedLegacy.payment_status,'pending','confirmação D−1 não marca o recebimento como pago');
assert.equal(linkedLegacy.source_ref,'sale_legacy42');
upsertProvisionalSalesToTransaction(syncTx,[{...legacyManual,conta:'6244'}]);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(syncStores.get('billing_sales').rows.find(row=>row.sale_id==='manual-sale:cmp_legacy42').account,'6244','a sincronização preenche uma conta ausente a partir da campanha, sem substituir uma conta já definida');

const aggregateId='mcc-conversion:cmp-1:2026-09-23';
const provisionalAggregate={sale_id:aggregateId,sale_date:'2026-09-23',product:'Produto A',platform:'Google Ads MCC',commission_type:'Valor de conversão MCC',account:'3248',value_brl:200,value_usd:null,payment_status:'pending',confirmation_status:'provisional',confirmation_source:'MCC D0',campaign_id:'cmp-1',conversion_count:2,source:'mcc_conversion_aggregate',source_ref:'cmp-1|2026-09-23',source_period:'d0',active:true,notes:'D0 agregado'};
assert.equal(upsertMccConversionSalesToTransaction(syncTx,[provisionalAggregate]),1);
await new Promise(resolve=>setImmediate(resolve));
let aggregate=syncStores.get('billing_sales').rows.find(row=>row.sale_id===aggregateId);
assert.equal(aggregate.conversion_count,2);
assert.equal(aggregate.confirmation_status,'provisional');
const lowerAggregate={...provisionalAggregate,value_brl:80,conversion_count:1};
upsertMccConversionSalesToTransaction(syncTx,[lowerAggregate]);
await new Promise(resolve=>setImmediate(resolve));
aggregate=syncStores.get('billing_sales').rows.find(row=>row.sale_id===aggregateId);
assert.equal(aggregate.value_brl,80);assert.equal(aggregate.conversion_count,1);
assert.equal(summarizeCompetence([aggregate],[]).grossBrl.amount,80,'indicador de faturamento lê o agregado corrigido');
assert.equal(monthlyFinancialSeries({sales:[aggregate],start:'2026-09-01',end:'2026-09-30'})[0].value,80,'gráfico mensal lê o mesmo agregado corrigido');
const unchangedAudit=syncStores.get('billing_audit').rows.length;
upsertMccConversionSalesToTransaction(syncTx,[lowerAggregate]);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(syncStores.get('billing_audit').rows.length,unchangedAudit,'repetir captura menor não duplica vendas nem auditoria');
const officialAggregate={...provisionalAggregate,value_brl:240,conversion_count:2,confirmation_status:'confirmed',confirmation_source:'MCC D−1',confirmed_at:'2026-09-24T12:00:00Z',source_period:'d1',notes:'D−1 agregado'};
upsertMccConversionSalesToTransaction(syncTx,[officialAggregate]);
await new Promise(resolve=>setImmediate(resolve));
aggregate=syncStores.get('billing_sales').rows.find(row=>row.sale_id===aggregateId);
assert.equal(aggregate.confirmation_status,'confirmed','D−1 promove o registro estável de D0');
assert.equal(aggregate.value_brl,240);
assert.equal(aggregate.payment_status,'pending','confirmação MCC não transforma valor em recebimento');
upsertMccConversionSalesToTransaction(syncTx,[{...officialAggregate,value_brl:999,source_period:'d0'}],{onlyIfMissing:true});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(syncStores.get('billing_sales').rows.find(row=>row.sale_id===aggregateId).value_brl,240,'backfill do Diário não sobrescreve o registro MCC já sincronizado');
const recoveredAggregate={...provisionalAggregate,sale_id:'mcc-conversion:cmp-1:2026-09-22',sale_date:'2026-09-22',value_brl:75,conversion_count:1,source_ref:'cmp-1|2026-09-22'};
upsertMccConversionSalesToTransaction(syncTx,[recoveredAggregate],{onlyIfMissing:true});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(syncStores.get('billing_sales').rows.find(row=>row.sale_id===recoveredAggregate.sale_id).value_brl,75,'backfill idempotente cria somente agregados ainda ausentes');
const staleDiaryAggregate={...provisionalAggregate,sale_id:'mcc-conversion:cmp-1:2026-09-24',sale_date:'2026-09-24',source_ref:'cmp-1|2026-09-24'};
upsertMccConversionSalesToTransaction(syncTx,[staleDiaryAggregate],{onlyIfMissing:true});
await new Promise(resolve=>setImmediate(resolve));
const confirmedDiaryAggregate={...staleDiaryAggregate,confirmation_status:'confirmed',confirmation_source:'MCC D−1',confirmed_at:'2026-09-25T12:00:00Z',source_period:'d1',value_brl:229.5,notes:'Agregado recuperado do Diário MCC'};
upsertMccConversionSalesToTransaction(syncTx,[confirmedDiaryAggregate],{onlyIfMissing:true});
await new Promise(resolve=>setImmediate(resolve));
aggregate=syncStores.get('billing_sales').rows.find(row=>row.sale_id===staleDiaryAggregate.sale_id);
assert.equal(aggregate.confirmation_status,'confirmed','o backfill promove um agregado D0 existente quando o Diário passa a registrar D−1');
assert.equal(aggregate.confirmation_source,'MCC D−1');
assert.equal(aggregate.payment_status,'pending','confirmação D−1 não marca recebimento');
const secondManual={...provisional,billing_sale_id:'manual-sale:cmp-1-second',id:'manual-2',data:'2026-09-23'};
upsertProvisionalSalesToTransaction(syncTx,[secondManual]);
await new Promise(resolve=>setImmediate(resolve));
aggregate=syncStores.get('billing_sales').rows.find(row=>row.sale_id===aggregateId);
assert.equal(aggregate.conversion_count,1,'uma conversão manual vinculada é subtraída do agregado MCC');
assert.equal(aggregate.value_brl,null,'o total MCC não é repartido artificialmente entre vendas manuais e residuais');
upsertProvisionalSalesToTransaction(syncTx,[secondManual]);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(syncStores.get('billing_sales').rows.find(row=>row.sale_id===aggregateId).conversion_count,1,'repetição do mesmo lançamento manual não decrementa o agregado novamente');
upsertMccConversionSalesToTransaction(syncTx,[{...officialAggregate,conversion_count:0,value_brl:null,confirmation_status:'not_confirmed',confirmed_at:null,source_period:'d1',active:false,notes:'D−1 confirmou zero'}]);
await new Promise(resolve=>setImmediate(resolve));
aggregate=syncStores.get('billing_sales').rows.find(row=>row.sale_id===aggregateId);
assert.equal(aggregate.active,false,'D−1 com zero desativa o agregado anterior sem apagá-lo');
assert.equal(aggregate.confirmation_status,'not_confirmed');
assert.equal(aggregate.value_brl,null);

const absentD0={...provisionalAggregate,sale_id:'mcc-conversion:absent:2026-09-23',campaign_id:'absent',payment_status:'issued',observed_payment_status:'issued'};
upsertMccConversionSalesToTransaction(syncTx,[absentD0]);
await new Promise(resolve=>setImmediate(resolve));
const manualBefore=structuredClone(syncStores.get('billing_sales').rows.filter(row=>row.source!=='mcc_conversion_aggregate'));
upsertMccConversionSalesToTransaction(syncTx,[{...absentD0,active:false,conversion_count:0,value_brl:null,confirmation_status:'not_confirmed',payment_status:'pending'}]);
await new Promise(resolve=>setImmediate(resolve));
const absentStored=syncStores.get('billing_sales').rows.find(row=>row.sale_id===absentD0.sale_id);
assert.equal(absentStored.active,false);assert.equal(absentStored.payment_status,'issued','correção MCC preserva status informado pelo usuário');
assert.equal(summarizeCompetence([absentStored],[]).salesCount,0);
assert.equal(monthlyFinancialSeries({sales:[absentStored],start:'2026-09-01',end:'2026-09-30'})[0].value,0);
assert.deepEqual(syncStores.get('billing_sales').rows.filter(row=>row.source!=='mcc_conversion_aggregate'),manualBefore,'linhas manuais ficam intactas');
upsertMccConversionSalesToTransaction(syncTx,[{...confirmedDiaryAggregate,source_period:'d0',active:false,conversion_count:0,value_brl:null,confirmation_status:'not_confirmed'}]);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(syncStores.get('billing_sales').rows.find(row=>row.sale_id===confirmedDiaryAggregate.sale_id).active,true,'ausência D0 não invalida fechamento D−1 confirmado');

const template = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');
assert.match(template, /function loadBase\(file\)[\s\S]*?Object\.hasOwn\(parsed,'billing'\)/, 'backup antigo sem faturamento preserva as stores financeiras');
assert.match(template, /function persistLocalBase\(\{billingBundle=null,personalFinanceBundle=null,productCatalogBundle=null,provisionalBillingSales=\[\],correctedProvisionalBillingSales=\[\],updatedProvisionalBillingSales=\[\],mccBillingSales=\[\]\}=\{\}\)/, 'edição do lançamento na base e no espelho financeiro compartilha uma transação local');
assert.match(template, /await persistLocalBase\(\{provisionalBillingSales:\[result\.sale\]\}\)/, 'venda manual D0 é espelhada em Faturamento no mesmo salvamento');
console.log('billing storage and backup ok');
