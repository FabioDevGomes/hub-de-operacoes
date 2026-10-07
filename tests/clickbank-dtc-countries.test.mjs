import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {collectClickBankDtcCommonCountries,isClickBankDtcCheckout} from '../extensions/mcc-d0-bridge/clickbank-dtc-reader.mjs';
import {mountClickBankDtcCountries} from '../extensions/mcc-d0-bridge/clickbank-dtc-popup.mjs';
import {deliverDtcCommonCountries,isDtcCountryReceiverReady} from '../extensions/mcc-d0-bridge/clickbank-forward.mjs';
import {matchDtcCheckoutOffer,mergeDtcCountries,validateDtcCountryCapture} from '../src/curadoria/clickbank-top-offers/dtc-country-capture.mjs';
import {mountExtensionCapture} from '../src/curadoria/clickbank-top-offers/extension-capture.mjs';

const checkout='https://orders.clickbank.net/?cbfid=synthetic';
const payload={schema:'clickbank-dtc-country-capture-v1',source:'clickbank_dtc_checkout',
  productName:'Energy Revolution System',countries:['US','GB','CA'],capturedAt:'2026-10-06T12:30:00.000Z'};

test('checkout reader accepts only orders.clickbank.net and extracts only Países Comuns plus the cart title',()=>{
  for(const url of [checkout,'https://orders.clickbank.net/'])assert.equal(isClickBankDtcCheckout(url),true);
  for(const url of ['http://orders.clickbank.net/','https://orders.clickbank.net.evil.test/','https://accounts.clickbank.com/'])assert.equal(isClickBankDtcCheckout(url),false);
  const group=(label,values)=>({getAttribute:key=>key==='label'?label:null,querySelectorAll:()=>values.map(value=>({value}))});
  const headings=[{textContent:'Cart Summary'},{textContent:'Energy Revolution System'}];
  const countrySelectors=['select[name="billing.countryCode"]','select[id="billing.countryCode"]',
    'select[name="shipping.countryCode"]','select[id="shipping.countryCode"]'];
  for(const countrySelector of countrySelectors){
    const queriedSelectors=[];
    const result=vm.runInNewContext(`(${collectClickBankDtcCommonCountries.toString()})()`,{
      location:{protocol:'https:',hostname:'orders.clickbank.net'},
      document:{querySelector:selector=>{
        queriedSelectors.push(selector);
        return selector===countrySelector?{querySelectorAll:()=>[
          group('Países Comuns',['US','GB','CA','US','bad']),group('Outros países',['BR','AR'])]}:null;
      },querySelectorAll:()=>headings},
      Date
    });
    assert.equal(result.ok,true,result.message);
    assert.equal(result.productName,'Energy Revolution System');
    assert.deepEqual([...result.countries],['US','GB','CA']);
    assert.ok(Number.isFinite(Date.parse(result.capturedAt)));
    assert.deepEqual(queriedSelectors,countrySelectors,'consulta exclusivamente os seletores de país billing/shipping');
  }
});

test('DTC payload validation, unique title match and ambiguity fail closed',()=>{
  assert.equal(validateDtcCountryCapture(payload).ok,true);
  for(const invalid of [{...payload,countries:['USA']},{...payload,productName:'x'}, {...payload,capturedAt:'invalid'}, {...payload,source:'other'}])
    assert.equal(validateDtcCountryCapture(invalid).ok,false);
  const offer={offerKey:'seller|new energy revolution system conversions monster',offerName:'NEW : Energy Revolution System - Conversions Monster !'};
  assert.deepEqual(matchDtcCheckoutOffer(payload.productName,[offer]),{status:'unique',matches:[offer]});
  assert.equal(matchDtcCheckoutOffer(payload.productName,[]).status,'none');
  assert.equal(matchDtcCheckoutOffer(payload.productName,[offer,{...offer,offerKey:'second'}]).status,'ambiguous');
  assert.equal(matchDtcCheckoutOffer('Energy',[offer]).status,'none','nomes curtos não vinculam oferta por engano');

  const checkoutName='YU SLEEP - 6 Month Supply (50% OFF)';
  const marketplaceOffer={offerKey:'yusleep|yu sleep offer',offerName:'YU SLEEP - The #1 Sleep Offer! Make upto $5 EPC & Get Rich This Summer'};
  assert.deepEqual(matchDtcCheckoutOffer(checkoutName,[marketplaceOffer]),{status:'unique',matches:[marketplaceOffer]},
    'a variação do checkout associa pelo nome principal do produto no início da oferta');
  const taggedOffer={...marketplaceOffer,offerName:'NEW : YU SLEEP - The #1 Sleep Offer!'};
  assert.equal(matchDtcCheckoutOffer(checkoutName,[taggedOffer]).status,'unique','rótulo NEW do Marketplace não impede a associação pelo produto');
  assert.equal(matchDtcCheckoutOffer(checkoutName,[marketplaceOffer,{...marketplaceOffer,offerKey:'other|yu sleep',offerName:'YU SLEEP - Another Offer'}]).status,'ambiguous',
    'variantes com o mesmo nome principal continuam bloqueadas sem salvar');
  assert.equal(matchDtcCheckoutOffer(checkoutName,[{...marketplaceOffer,offerName:'Sleep offer for YU SLEEP users'}]).status,'none',
    'o nome principal não deve associar por ocorrência no meio do título');
});

test('DTC merge preserves manual countries and prior provenance while deduplicating',()=>{
  const old={offerKey:'k',productKey:'old',offerName:'Old title',seller:'SELLER',manualCountries:['BR','US'],otherField:'preserved',
    dtcCountryCapture:{source:'clickbank-dtc-checkout',productName:'Earlier',capturedAt:'2026-10-05T10:00:00Z',countries:['US']}};
  const merged=mergeDtcCountries(old,{offerKey:'k',productKey:'key',offerName:'Matched title',seller:'SELLER'},payload);
  assert.equal(merged.ok,true);
  assert.deepEqual(merged.record.manualCountries,['BR','US','GB','CA']);
  assert.equal(merged.record.otherField,'preserved');
  assert.equal(merged.record.productKey,'key');
  assert.equal(merged.record.dtcCountryCapture.productName,payload.productName);
  assert.deepEqual(merged.record.dtcCountryCapture.countries,['US','GB','CA']);
  assert.equal(merged.addedCount,2);
});

test('Hub receiver waits for load, applies only a unique match, and refuses zero or multiple offers',async()=>{
  let ready;const deferred=new Promise(resolve=>ready=resolve),writes=[];
  const target={};
  const offers=[{offerKey:'offer-1',offerName:'NEW Energy Revolution System Conversions Monster'}];
  mountExtensionCapture({target,ready:deferred,getBusy:()=>false,getDraft:()=>'',preparePreview:()=>{},getOffers:()=>offers,
    saveDtcCountries:async(offer,capture)=>{writes.push({offer,capture});return {ok:true,saved:true,addedCount:3,countryCount:3,offerName:offer.offerName};}});
  assert.equal(target.__hubDtcCountryReceiverVersion,2,'o Hub anuncia a versão compatível da associação DTC');
  const pending=target.__hubReceiveDtcCommonCountries(payload);
  assert.equal(writes.length,0);ready();
  const success=await pending;
  assert.equal(success.ok,true);assert.equal(writes.length,1);assert.equal(writes[0].offer.offerKey,'offer-1');
  offers.push({offerKey:'offer-2',offerName:'Energy Revolution System Premium'});
  const ambiguous=await target.__hubReceiveDtcCommonCountries(payload);
  assert.equal(ambiguous.ok,false);assert.match(ambiguous.message,/corresponde a 2 ofertas/);assert.equal(writes.length,1);
  offers.splice(0);
  const unmatched=await target.__hubReceiveDtcCommonCountries(payload);
  assert.equal(unmatched.ok,false);assert.match(unmatched.message,/Não encontrei/);assert.equal(writes.length,1);
});

test('Hub receiver matches a checkout variant by the unique leading product name',async()=>{
  const variantPayload={...payload,productName:'YU SLEEP - 6 Month Supply (50% OFF)'};
  const offer={offerKey:'yusleep|yu sleep offer',offerName:'YU SLEEP - The #1 Sleep Offer! Make upto $5 EPC & Get Rich This Summer'};
  const writes=[];
  const target={};
  mountExtensionCapture({target,ready:Promise.resolve(),getBusy:()=>false,getDraft:()=>'',getOffers:()=>[offer],preparePreview:()=>{},
    saveDtcCountries:async(matched,capture)=>{writes.push({matched,capture});return {ok:true,saved:true,offerName:matched.offerName};}});
  const result=await target.__hubReceiveDtcCommonCountries(variantPayload);
  assert.equal(result.ok,true,result.message);
  assert.equal(writes.length,1);
  assert.equal(writes[0].matched.offerKey,offer.offerKey);
});

test('receiver stays on an already open Top Offers tab; no Hub tab creation or focus is needed',async()=>{
  const code=await readFile(new URL('../extensions/mcc-d0-bridge/background.js',import.meta.url),'utf8');
  const calls=[];let listener;
  const sourceCapture={ok:true,productName:payload.productName,countries:payload.countries,capturedAt:payload.capturedAt};
  const staleHub={id:18,url:'http://127.0.0.1:8765/curadoria/clickbank-top-offers/',windowId:2};
  const hub={id:19,url:'http://127.0.0.1:8765/curadoria/clickbank-top-offers/',windowId:2};
  vm.runInNewContext(code.replace(/^import .*?;\s*/gm,''),{
    collectClickBankDtcCommonCountries,isClickBankDtcCheckout,deliverDtcCommonCountries,isDtcCountryReceiverReady,
    isClickBankMarketplace(){return false;},CLICKBANK_COLUMNS:[],collectClickBankProducts(){},URL,
    chrome:{runtime:{onMessage:{addListener:fn=>listener=fn}},tabs:{
      query:async options=>options.active?[{id:8,url:checkout}]:[staleHub,hub],
      create:async options=>{calls.push(['create',options]);throw Error('não deve criar aba');},
      update:async(...args)=>calls.push(['focus',...args]),
    },scripting:{executeScript:async options=>{
      calls.push(['inject',options]);
      return [{result:options.func===collectClickBankDtcCommonCountries?sourceCapture:
        options.func===isDtcCountryReceiverReady?options.target.tabId===hub.id:{ok:true,saved:true,offerName:'Matched Offer',addedCount:3,countryCount:3}}];
    }}}
  });
  const response=await new Promise(resolve=>listener({type:'CAPTURE_DTC_COMMON_COUNTRIES'},null,resolve));
  assert.equal(response.ok,true,response.message);
  assert.equal(response.result.saved,true);
  const callsToTarget=calls.filter(([,options])=>options?.target?.tabId===hub.id);
  assert.equal(callsToTarget.length,2,'sonda e entrega somente na aba Top Offers já carregada');
  assert.equal(calls.filter(([,options])=>options?.target?.tabId===staleHub.id).length,1,'a aba antiga é sondada e ignorada');
  assert.equal(callsToTarget[0][1].func,isDtcCountryReceiverReady);
  assert.equal(callsToTarget[1][1].world,'MAIN');
  assert.deepEqual(calls.filter(([kind])=>kind==='create'||kind==='focus'),[]);
  const routed=callsToTarget[1][1].args[0];
  assert.equal(routed.productName,payload.productName);assert.deepEqual([...routed.countries],payload.countries);
});

test('DTC receiver accepts only local Top Offers CB and asks for its list when missing',async()=>{
  const run=(location,window)=>vm.runInNewContext(`(${deliverDtcCommonCountries.toString()})(payload)`,{location,window,payload});
  const correct={origin:'http://127.0.0.1:8765',pathname:'/curadoria/clickbank-top-offers/'};
  assert.equal((await run({...correct,origin:'https://example.test'},{__hubReceiveDtcCommonCountries(){}})).ok,false);
  const missing=await run(correct,{});
  assert.equal(missing.ok,false);assert.match(missing.message,/desatualizada/);
  const staleWindow={__hubReceiveDtcCommonCountries(){},__hubDtcCountryReceiverVersion:1};
  assert.equal(await run(correct,staleWindow).then(result=>result.ok),false,'a entrega recusa a versão antiga do Hub');
  const currentWindow={__hubReceiveDtcCommonCountries(){return {ok:true,saved:true};},__hubDtcCountryReceiverVersion:2};
  const ready=vm.runInNewContext(`(${isDtcCountryReceiverReady.toString()})()`,{location:correct,window:currentWindow});
  assert.equal(ready,true);
  const staleReady=vm.runInNewContext(`(${isDtcCountryReceiverReady.toString()})()`,{location:correct,window:staleWindow});
  assert.equal(staleReady,false,'a extensão não considera uma aba sem o contrato atualizado como pronta');
  assert.deepEqual(await run(correct,currentWindow),{ok:true,saved:true});
});

test('popup action requests DTC capture, reports the saved offer, and restores its controls',async()=>{
  const button={disabled:false,addEventListener(_name,fn){this.click=fn;}};
  const status={textContent:'',classes:new Set(),classList:{toggle(name,enabled){enabled?status.classes.add(name):status.classes.delete(name);}}};
  const document={querySelector:selector=>selector==='#capture-dtc-countries'?button:status};
  const messages=[];let globallyDisabled=false;
  mountClickBankDtcCountries({document,sendMessage:async message=>{messages.push(message);return {ok:true,result:{ok:true,saved:true,offerName:'Matched offer',countryCount:9,addedCount:7}};},setDisabled:value=>globallyDisabled=value});
  await button.click();
  assert.deepEqual(messages,[{type:'CAPTURE_DTC_COMMON_COUNTRIES'}]);
  assert.match(status.textContent,/Lista capturada da DTC: 9 países em Matched offer/);
  assert.equal(button.disabled,false);assert.equal(globallyDisabled,false);assert.equal(status.classes.has('error'),false);
});
