import test from 'node:test';
import assert from 'node:assert/strict';
import {createCentralTransaction} from '../scripts/central-isolada/transacao-central-experimental.mjs';

function setup(){
 let revision=1,checkpoint=1,committed=0;
 const db={exec(sql){if(sql==='BEGIN IMMEDIATE')checkpoint=revision;if(sql==='ROLLBACK')revision=checkpoint;if(sql==='COMMIT')committed++},prepare(){return {get:()=>({version:revision})}}};
 const indexed={getInTransaction(){},scanInTransaction(){},putInTransaction(input){if(input.fail)throw Error('falha');return {revision:++revision}}};
 const local={readInTransaction(){},writeInTransaction(){}};
 return {tx:createCentralTransaction(db,{indexed,local}),get revision(){return revision},get committed(){return committed}};
}
const operations=()=>Array.from({length:1351},(_,i)=>({type:'indexed_put',input:{source:'radar-top-performance',store:i===675?'collections':i<675?'offers':'collection_offer_snapshots',key:String(i)}}));
test('coleta Guru de 675 ofertas cabe em uma transação',()=>{const state=setup();assert.equal(state.tx.commit({expectedRevision:1,operations:operations()}).results.length,1351);assert.equal(state.committed,1)});
test('falha reverte a transação e operações grandes de outras fontes continuam bloqueadas',()=>{const state=setup(),ops=operations();ops[1350].input.fail=true;assert.throws(()=>state.tx.commit({expectedRevision:1,operations:ops}));assert.equal(state.revision,1);assert.equal(state.committed,0);ops[0].input.source='outra';assert.throws(()=>state.tx.commit({expectedRevision:1,operations:ops}),/inválida/)});
