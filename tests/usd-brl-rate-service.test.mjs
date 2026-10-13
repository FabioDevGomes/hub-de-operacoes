import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import vm from 'node:vm';

const source=await readFile(new URL('../src/usd-brl-rate.js',import.meta.url),'utf8');
function makeService({rows=[],cached=null,fail=false}={}){
  const data=new Map(cached?[["hub:usd-brl-rate:ptax:v1",JSON.stringify(cached)]]:[]),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)},requests=[];
  let nowMs=Date.parse('2026-10-13T15:00:00.000Z');
  const context=vm.createContext({URLSearchParams,Intl,Date,AbortController,setTimeout,clearTimeout,Map,Object,Number,String,Array,JSON,TypeError,Error,Promise,Math,Date:class extends Date{constructor(value){super(value??nowMs)}static now(){return nowMs}}});
  vm.runInContext(source,context);
  const service=context.UsdBrlRateService.create({storage,now:()=>new Date(nowMs),refreshIntervalMs:30*60*1000,fetchImpl:async(url,options)=>{requests.push({url:String(url),options});if(fail)throw new Error('offline');return{ok:true,status:200,json:async()=>({value:rows})}}});
  return{service,requests,data,advance:ms=>nowMs+=ms,setFail:value=>{fail=value}};
}

test('consulta PTAX usa o boletim de venda mais recente e conserva metadados oficiais',async()=>{
  const fixture=makeService({rows:[
    {dataHoraCotacao:'2026-10-13 10:10:00.000',cotacaoVenda:5.1},
    {dataHoraCotacao:'2026-10-13 13:10:00.000',cotacaoVenda:5.2345},
    {dataHoraCotacao:'2026-10-13 12:10:00.000',cotacaoVenda:5.2}
  ]});
  const quote=await fixture.service.refresh();
  assert.equal(quote.rate,5.2345);
  assert.equal(quote.quoteDate,'2026-10-13');
  assert.equal(quote.status,'ok');
  assert.equal(quote.source,'Banco Central do Brasil · PTAX venda');
  assert.equal(fixture.requests.length,1);
  assert.match(fixture.requests[0].url,/CotacaoMoedaPeriodo/);
  assert.match(fixture.requests[0].url,/%40moeda=%27USD%27/);
  assert.equal(JSON.parse(fixture.data.get('hub:usd-brl-rate:ptax:v1')).rate,5.2345);
});

test('reusa a última consulta dentro do intervalo e falhas mantêm a última taxa com alerta',async()=>{
  const fixture=makeService({rows:[{dataHoraCotacao:'2026-10-13 13:10:00.000',cotacaoVenda:5.3}]});
  await fixture.service.refresh();
  const cached=await fixture.service.refreshIfDue();
  assert.equal(cached.status,'cached');assert.equal(fixture.requests.length,1);
  fixture.advance(31*60*1000);fixture.setFail(true);
  const stale=await fixture.service.refreshIfDue();
  assert.equal(stale.rate,5.3);assert.equal(stale.isStale,true);assert.equal(stale.isFallback,false);assert.equal(stale.error,'offline');
  assert.equal(fixture.requests.length,2);
});

test('sem cotação em cache, falha usa fallback legado sem esconder o aviso',async()=>{
  const fixture=makeService({fail:true}),state=await fixture.service.refresh();
  assert.equal(state.rate,5.1);assert.equal(state.isStale,true);assert.equal(state.isFallback,true);assert.equal(state.status,'unavailable');
});
