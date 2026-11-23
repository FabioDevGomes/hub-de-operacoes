import test from 'node:test';
import assert from 'node:assert/strict';
import {createFichaDraftLabBridge} from '../src/copy-ficha/ficha-central-lab.mjs';

const accountsKey='hub.google-ads-account-directory:v1';
const domainsKey='hub:account-domain-associations:v1';
const localAccounts=JSON.stringify({schemaVersion:1,savedAtUtc:'2026-01-01T00:00:00Z',managers:[],accounts:[]});
const localDomains=JSON.stringify({schemaVersion:1,accounts:[]});
function fakeRequest(initial={}){return async(path,{operations})=>{
 assert.equal(path,'/transaction/read');
 return {revision:1,results:operations.map(({input:{key}})=>({revision:1,state:Object.hasOwn(initial,key)?'present':'absent',...(Object.hasOwn(initial,key)?{value:initial[key]}:{})}))};
}}
test('referências de contas locais são lidas sem gravar ou importar quando a base central está vazia',async()=>{
 const local=new Map([[accountsKey,localAccounts],[domainsKey,localDomains]]);
 const bridge=createFichaDraftLabBridge({request:fakeRequest(),referenceStorage:{getItem:key=>local.get(key)??null}});
 await bridge.open();
 assert.equal(bridge.storage.getItem(accountsKey),localAccounts);
 assert.equal(bridge.storage.getItem(domainsKey),localDomains);
 assert.throws(()=>bridge.storage.setItem(accountsKey,'{}'),/indisponível/);
});
test('referência central existente prevalece e indisponibilidade local não altera a base',async()=>{
 const central=JSON.stringify({schemaVersion:1,savedAtUtc:'2026-01-02T00:00:00Z',managers:[],accounts:[]});
 const bridge=createFichaDraftLabBridge({request:fakeRequest({[accountsKey]:central}),referenceStorage:{getItem(){throw Error('bloqueado')}}});
 await bridge.open();
 assert.equal(bridge.storage.getItem(accountsKey),central);
 assert.equal(bridge.storage.getItem(domainsKey),null);
});
test('ao registrar domínio novo preserva as associações locais existentes',async()=>{
 const existing=JSON.stringify({schemaVersion:1,accounts:[{customerId:'1234567890',domain:'antigo.example'}]});
 let written;
 const request=async(path,body)=>{
  if(path==='/transaction/read')return fakeRequest()(path,body);
  written=body.operations[0].input;
  return {revision:2,results:[{revision:2}]};
 };
 const bridge=createFichaDraftLabBridge({request,referenceStorage:{getItem:key=>key===domainsKey?existing:null}});
 await bridge.open();
 await bridge.saveAccountDomain({customerId:'1234567891',domain:'novo.example'});
 assert.equal(written.expectedState,'absent');
 assert.deepEqual(JSON.parse(written.value).accounts.map(x=>x.domain),['antigo.example','novo.example']);
});
