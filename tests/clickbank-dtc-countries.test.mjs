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

function syntheticCountrySelect(values,groups=[]) {
  const options=values.map(value=>typeof value==='string'?{value}:value);
  return {querySelectorAll:selector=>{
    if(selector==='optgroup')return groups.map(({label,codes})=>({
      getAttribute:key=>key==='label'?label:null,
      querySelectorAll:selector=>{assert.equal(selector,'option');return codes.map(value=>({value}));}
    }));
    assert.equal(selector,'option');return options;
  }};
}

function readSyntheticDtcCountries(selects) {
  return vm.runInNewContext(`(${collectClickBankDtcCommonCountries.toString()})()`,{
    location:{protocol:'https:',hostname:'orders.clickbank.net'},
    document:{querySelector:selector=>{
      assert.match(selector,/^select\[(name|id)="(billing|shipping)\.countryCode"\]$/);
      return selects[selector]||null;
    },querySelectorAll:selector=>{
      assert.equal(selector,'h1,h2,h3,h4,h5,[role="heading"]');
      return [{textContent:'Resumo do carrinho'},{textContent:'Synthetic Product - Starter Pack'}];
    }},Date
  });
}

test('DTC reads all six countries from a simple list and preserves the existing capture/merge flow',()=>{
  const countries=['AU','CA','US','IE','NZ','GB'];
  for(const selector of ['select[name="billing.countryCode"]','select[id="billing.countryCode"]',
    'select[name="shipping.countryCode"]','select[id="shipping.countryCode"]']){
    const result=readSyntheticDtcCountries({[selector]:syntheticCountrySelect([
      {value:'',disabled:true,textContent:'Selecione o país'},...countries,'US','invalid'
    ])});
    assert.equal(result.ok,true,result.message);
    assert.deepEqual([...result.countries],countries);
    const capture=validateDtcCountryCapture({...payload,...result});
    assert.equal(capture.ok,true);
    const merged=mergeDtcCountries({manualCountries:['FR','US']},{offerKey:'synthetic-offer'},capture);
    assert.deepEqual(merged.record.manualCountries,['FR','US','AU','CA','IE','NZ','GB']);
    assert.deepEqual([...merged.record.dtcCountryCapture.countries],countries);
    assert.equal(merged.record.dtcCountryCapture.source,'clickbank-dtc-checkout');
  }
});

test('DTC simple-list fallback accepts 1 through 10 countries and rejects empty, larger or grouped lists',()=>{
  const selector='select[id="shipping.countryCode"]';
  const ten=['AU','CA','US','IE','NZ','GB','FR','DE','ES','MX'];
  for(const countries of [['US'],ten]){
    const result=readSyntheticDtcCountries({[selector]:syntheticCountrySelect(['',...countries])});
    assert.equal(result.ok,true,result.message);
    assert.deepEqual([...result.countries],countries);
  }
  const normalized=readSyntheticDtcCountries({[selector]:syntheticCountrySelect([
    {value:'',disabled:true},' us ','US','ca',{value:'GB',disabled:true},'USA'
  ])});
  assert.deepEqual([...normalized.countries],['US','CA'],'placeholder, disabled, duplicate and invalid options are excluded');
  for(const select of [syntheticCountrySelect(['','invalid']),syntheticCountrySelect([...ten,'IT']),
    syntheticCountrySelect([], [{label:'Outros países',codes:['US','CA']}])]){
    const result=readSyntheticDtcCountries({[selector]:select});
    assert.equal(result.ok,false);
    assert.equal(result.countries,undefined);
    assert.match(result.message,/até 10 países válidos/);
  }
});

test('DTC common-country groups retain priority and are not limited by the simple-list threshold',()=>{
  const common=['AU','CA','US','IE','NZ','GB','FR','DE','ES','MX','IT'];
  const result=readSyntheticDtcCountries({
    'select[name="billing.countryCode"]':syntheticCountrySelect(['BR']),
    'select[name="shipping.countryCode"]':syntheticCountrySelect([], [
      {label:'Common Countries',codes:common},{label:'Outros países',codes:['BR','AR']}
    ])
  });
  assert.equal(result.ok,true,result.message);
  assert.deepEqual([...result.countries],common);
  const emptyCommon=readSyntheticDtcCountries({
    'select[name="billing.countryCode"]':syntheticCountrySelect(['US']),
    'select[name="shipping.countryCode"]':syntheticCountrySelect([], [{label:'Países Comuns',codes:['invalid']}])
  });
  assert.equal(emptyCommon.ok,false,'an invalid common group must not fall back to another list');
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

test('DTC associates a single-word product name without matching partial names or ambiguous offers',()=>{
  const offer={offerKey:'synthetic-femicore',offerName:'FemiCore - $4 EPC Doctor-Endorsed Bladder-Reset Formula'};
  for(const name of ['FemiCore','FemiCore - 2 Bottles','FemiCore – 2 Bottles','FemiCore — 2 Bottles']){
    assert.deepEqual(matchDtcCheckoutOffer(name,[offer]),{status:'unique',matches:[offer]});
  }
  assert.equal(matchDtcCheckoutOffer('FemiCore - 2 Bottles',[{...offer,offerName:'NEW : FemiCore - Bladder-Reset Formula'}]).status,'unique');
  assert.equal(matchDtcCheckoutOffer('FemiCore - 2 Bottles',[offer,{...offer,offerKey:'other-femicore',offerName:'FemiCore - Another Offer'}]).status,'ambiguous');
  for(const title of ['FemiCorePlus - Offer','FemiCore Max - Offer','Supplement for FemiCore users','FemiCore reviews and alternatives']){
    assert.equal(matchDtcCheckoutOffer('FemiCore - 2 Bottles',[{...offer,offerName:title}]).status,'none',title);
  }
  assert.equal(matchDtcCheckoutOffer('Energy',[{...offer,offerName:'Energy Revolution System - Offer'}]).status,'none');
  assert.equal(matchDtcCheckoutOffer('Core - 2 Bottles',[{...offer,offerName:'Core - Offer'}]).status,'none','short names stay blocked');
});

test('DTC matching update invalidates the complete browser import chain and publishes the domain',async()=>{
  const root=new URL('../',import.meta.url);
  const read=path=>readFile(new URL(path,root),'utf8');
  assert.match(await read('src/curadoria/clickbank-top-offers/index.html'),/clickbank-top-offers-page\.mjs\?v=32/);
  const page=await read('src/curadoria/clickbank-top-offers/clickbank-top-offers-page.mjs');
  assert.match(page,/extension-capture\.mjs\?v=5/);
  assert.match(page,/dtc-country-capture\.mjs\?v=4/);
  assert.match(await read('src/curadoria/clickbank-top-offers/extension-capture.mjs'),/dtc-country-capture\.mjs\?v=4/);
  assert.equal(await read('dist/curadoria/clickbank-top-offers/dtc-country-capture.mjs'),await read('src/curadoria/clickbank-top-offers/dtc-country-capture.mjs'));
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

test('Hub receiver forwards FemiCore countries only when the single-word identity is unique',async()=>{
  const offer={offerKey:'synthetic-femicore',offerName:'FemiCore - Doctor-Endorsed Bladder-Reset Formula'};
  const offers=[offer],writes=[],target={};
  mountExtensionCapture({target,ready:Promise.resolve(),getBusy:()=>false,getDraft:()=>'',getOffers:()=>offers,preparePreview:()=>{},
    saveDtcCountries:async(matched,capture)=>{writes.push({matched,capture});return {ok:true,saved:true};}});
  const capture={...payload,productName:'FemiCore - 2 Bottles'};
  assert.equal((await target.__hubReceiveDtcCommonCountries(capture)).saved,true);
  assert.equal(writes[0].matched.offerKey,offer.offerKey);
  assert.deepEqual(writes[0].capture.countries,payload.countries);
  offers.push({...offer,offerKey:'synthetic-femicore-other',offerName:'FemiCore - Another Offer'});
  const blocked=await target.__hubReceiveDtcCommonCountries(capture);
  assert.equal(blocked.ok,false);
  assert.match(blocked.message,/corresponde a 2 ofertas/);
  assert.equal(writes.length,1,'ambiguous captures never reach the save callback');
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
