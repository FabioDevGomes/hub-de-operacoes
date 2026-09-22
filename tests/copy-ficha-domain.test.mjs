import assert from 'node:assert/strict';
import {calculateDiscount,parseOfferText,generateAssets,buildFicha,fichaJson,formatSitelinks,generationBlockers} from '../src/copy-ficha/copy-ficha-domain.mjs';

const input={
  product:'MyoGlow',countryCode:'US',htmlLanguage:'en-US',currency:'USD',
  destination:'C:\\Users\\Fabio-Vaio\\OneDrive\\tráfego pago\\produtos\\MyoGlow\\pag01',assetFolder:'assets',
  affiliateUrl:'https://www.fasttrack20.com/example/',freeShipping:'confirmed',fastShipping:'confirmed',guaranteeDays:90,
  urgencyConfirmed:'pending',scarcityConfirmed:'pending',
  packages:[
    {label:'Basic bundle',regularPrice:199,promoPrice:79,contents:'MyoGlow plus 1 month of No-Tox'},
    {label:'3-month bundle',regularPrice:294,promoPrice:127,contents:'MyoGlow plus 3 months of No-Tox'},
    {label:'6-month bundle',regularPrice:468,promoPrice:214,contents:'MyoGlow plus 6 months of No-Tox'}
  ]
};

assert.equal(calculateDiscount(199,79),60.3);
assert.equal(calculateDiscount(79,199),null);
const detected=parseOfferText('Save 60% today. Free shipping. Fast shipping. 90-day satisfaction guarantee. $199 $79');
assert.equal(detected.highestPercent,60);
assert.equal(detected.currency,'USD');
assert.deepEqual(detected.amounts,['$199','$79']);
assert.equal(detected.freeShippingCandidate,true);
assert.equal(detected.fastShippingCandidate,true);
assert.equal(parseOfferText('Fast delivery guaranteed').fastShippingCandidate,true);
assert.equal(detected.guaranteeDays,90);

const collected=`MyoGlow
Basic Bundle
MyoGlow plus 1 month of No-Tox
Regular Price $199
Today $79
3-month bundle
MyoGlow plus 3 months of No-Tox
Regular $294
Now $127
6-month bundle
MyoGlow plus 6 months of No-Tox
Regular $468
Now $214
Free shipping to the United States
90-day satisfaction guarantee`;
const analyzed=parseOfferText(collected,'https://sale.mydermadream.com/cc224-myoglow-sp9');
assert.equal(analyzed.productCandidate,'MyoGlow');
assert.equal(analyzed.countryCode,'US');
assert.equal(analyzed.htmlLanguage,'en-US');
assert.equal(analyzed.currency,'USD');
assert.equal(analyzed.guaranteeDays,90);
assert.equal(analyzed.freeShippingCandidate,true);
assert.equal(analyzed.packages.length,3);
assert.deepEqual(analyzed.packages.map(item=>[item.label,item.regularPrice,item.promoPrice]),[['Basic Bundle',199,79],['3-month bundle',294,127],['6-month bundle',468,214]]);
assert.equal(analyzed.highestPercent,60.3);

const checkoutPaste=`Your OFF Discount Has Been Applied!
banner
image1
Select Quantity
image2
Shipping Information
image3
Payment
image4
Place Order
Secure Checkout
GoGo Heater - 3
+10% OFF
image
$333.27
$124.17
60% Savings!
GoGo Heater
$109.99
$49.49
50% Savings!
BUY NOW 67% OFF
GoGo Heater - 2
+10% OFF
$222.18
$86.38
55% Savings!
GoGo Heater - 4
+10% OFF
$444.36
$158.36
65% Savings!
Brazil
Country
Peruibe Sao Paulo
Proudly American:
We're 100% American-owned and operated.
Our 30-Day Love It Or Return It Pledge
EcoWatt comes with a 30-day return pledge.
Terms & Conditions
©2026 EcoWatt`;
const checkoutDetected=parseOfferText(checkoutPaste);
assert.equal(checkoutDetected.productCandidate,'GoGo Heater','produto repetido no checkout deve prevalecer sobre rótulos de interface e produto citado no rodapé');
assert.equal(checkoutDetected.countryCode,'US','país não deve ser inferido da seleção de país do navegador/checkout quando a página está em inglês');
assert.equal(checkoutDetected.htmlLanguage,'en-US','idioma HTML deve acompanhar o idioma principal em inglês');
assert.equal(checkoutDetected.pageTitleCandidate,'GoGo Heater | Packages','título sugerido deve usar o nome repetido do produto e o idioma da página');
const checkoutPackages=parseOfferText(`Secure Checkout
GoGo Heater - 3
+10% OFF
image
$333.27
$124.17
check
60% Savings!
check
Medium House 1500 - 2000 sq.ft
ORDER NOW
GoGo Heater
+10% OFF
image
$109.99
$49.49
check
50% Savings!
check
Small Apartment Under 1000 sq.ft
BUY NOW 67% OFF
GoGo Heater - 2
+10% OFF
$222.18
$86.38
check
55% Savings!
check
Small House 1000-1500 sq.ft
ORDER NOW
image
SELLING OUT
Try One today! Buy more later, lowest price guaranteed!
GoGo Heater - 4
+10% OFF
image
$444.36
$158.36
check
65% Savings!
check
Large House 2000 - 2500 sq.ft
ORDER NOW`);
assert.deepEqual(checkoutPackages.packages.map(item=>[item.label,item.regularPrice,item.promoPrice]),[
  ['GoGo Heater - 3',333.27,124.17],['GoGo Heater',109.99,49.49],['GoGo Heater - 2',222.18,86.38],['GoGo Heater - 4',444.36,158.36]
],'deve reconhecer cards rotulados pelo produto e preservar a ordem e os dois preços em cada bloco');
assert.deepEqual(checkoutPackages.packages.map(item=>item.confidence),['high','high','high','high'],'pacotes com dois preços explícitos devem ser classificados com confiança alta');
assert.deepEqual(checkoutPackages.packages.map(item=>item.contents),['Medium House 1500 - 2000 sq.ft','Small Apartment Under 1000 sq.ft','Small House 1000-1500 sq.ft','Large House 2000 - 2500 sq.ft'],'badges, placeholders e CTAs não devem ser interpretados como conteúdo do pacote');
const australianLocale=parseOfferText('Shipping information. Place order.','https://shop.example.com/order/en/au/checkout');
assert.equal(australianLocale.countryCode,'AU','locale regional explícito da URL deve prevalecer sobre o país padrão do idioma');
assert.equal(australianLocale.htmlLanguage,'en-AU');

const assets=generateAssets(input);
assert.ok(assets.headlines.length>=30,'deve gerar ao menos 30 títulos quando o nome cabe');
assert.ok(assets.headlines.filter(item=>item.toLowerCase().includes('myoglow')).length>=10,'deve manter várias opções com o produto');
assert.ok(assets.headlines.some(item=>item.includes('60.3%')),'deve priorizar o maior percentual de desconto');
assert.ok(assets.headlines.every(item=>[...item].length<=30),'títulos devem respeitar 30 caracteres');
assert.ok(assets.descriptions.every(item=>[...item].length>=70&&[...item].length<=90),'descrições devem ficar entre 70 e 90 caracteres');
assert.ok(assets.descriptions.every(item=>/60\.3%/.test(item)),'todas as descrições devem destacar o percentual de desconto');
assert.ok(assets.descriptions.every(item=>/choose|order|compare|select|shop|complete your order/i.test(item)),'todas as descrições devem incluir uma CTA direta');
assert.ok(assets.descriptions.some(item=>/\$120\.00/.test(item)&&/60\.3%/.test(item)),'deve incluir o valor economizado junto ao percentual quando calculável');
assert.ok(assets.sitelinks.length>=8,'deve gerar ao menos 8 sitelinks');
assert.ok(assets.sitelinks.every(item=>item.text.length<=25&&item.line1.length<=35&&item.line2.length<=35),'sitelinks devem respeitar os limites');
assert.ok(assets.sitelinks.every(item=>item.line1.split(/\s+/).length>=2&&item.line2.split(/\s+/).length>=2),'descrições de sitelink não podem ser rótulos pobres de uma palavra');
assert.ok(assets.sitelinks.filter(item=>/\d+(?:\.\d+)?%/.test(`${item.text} ${item.line1} ${item.line2}`)).length>=5,'sitelinks devem explorar o percentual de desconto em várias opções');
assert.ok(assets.sitelinks.some(item=>/Save \$120\.00/.test(`${item.text} ${item.line1} ${item.line2}`)),'sitelinks devem mostrar a economia em dinheiro quando calculável');
assert.ok(!assets.sitelinks.some(item=>item.text==='Offer Details'&&item.line1==='Offer'&&item.line2==='Packages'),'formato pobre mostrado na captura não pode voltar');
assert.ok(formatSitelinks(assets.sitelinks).includes('\n\n'),'sitelinks devem sair em blocos sem rótulos internos');

const localeCtas={
  'en-US':/choose|order|compare|select|shop|complete your order/i,
  'pt-BR':/escolha|peça|compre|compare|selecione|finalize/i,
  'it-IT':/scegli|ordina|acquista|confronta|seleziona|completa/i,
  'es-ES':/elige|compra|compara|completa|aprovecha/i,
  'fr-FR':/choisissez|commandez|achetez|comparez|consultez|passez commande/i,
  'de-DE':/wählen|bestellen|vergleichen|schließen/i,
  'sv-SE':/välj|beställ|jämför|gör din beställning/i
};
for(const [htmlLanguage,cta] of Object.entries(localeCtas)){
  const localized=generateAssets({...input,htmlLanguage});
  assert.ok(localized.descriptions.length>=3,`${htmlLanguage}: deve gerar várias descrições válidas`);
  assert.ok(localized.descriptions.every(item=>[...item].length>=70&&[...item].length<=90),`${htmlLanguage}: todas devem ficar entre 70 e 90 caracteres`);
  assert.ok(localized.descriptions.every(item=>/60[.,]3\s?%/.test(item)),`${htmlLanguage}: todas devem manter o percentual de desconto`);
  assert.ok(localized.descriptions.every(item=>cta.test(item)),`${htmlLanguage}: todas devem conter CTA localizada`);
}
const longProductAssets=generateAssets({...input,product:'A Product Name That Is Deliberately Much Longer Than The Description Limit'});
assert.ok(longProductAssets.descriptions.length>=3,'nomes longos do produto devem recorrer a descrições sem o nome para preservar o limite');
assert.ok(longProductAssets.descriptions.every(item=>[...item].length>=70&&[...item].length<=90),'nomes longos não devem gerar descrições fora do limite');
const noDiscountAssets=generateAssets({...input,confirmedDiscountPercent:'',packages:input.packages.map(({label,contents,promoPrice})=>({label,contents,promoPrice}))});
assert.deepEqual(noDiscountAssets.descriptions,[],'sem percentual de desconto confirmado ou calculável, não gerar descrições genéricas');

const ficha=buildFicha(input),json=fichaJson(input),parsed=JSON.parse(json);
const expectedKeys=['destination','assetFolder','htmlLanguage','countryCode','pageTitle','affiliateUrl','cookieTitle','cookieText','acceptLabel','declineLabel','closeAriaLabel','detailsLabel','faqTitle','offerMainTitle','offerIntro','offerOverviewTitle','offerOverviewText','priceTitle','priceText','shippingGuaranteeTitle','shippingGuaranteeText','faqs','mustContain','mustNotContain','pending','assumptions'];
assert.deepEqual(Object.keys(ficha),expectedKeys);
assert.deepEqual(parsed,ficha);
assert.equal(ficha.faqs.length,4);
assert.equal(ficha.destination,input.destination);
assert.equal(ficha.affiliateUrl,input.affiliateUrl);
assert.ok(ficha.priceText.includes('60.3% discount'));
assert.ok(ficha.shippingGuaranteeText.includes('free shipping'));
assert.ok(ficha.shippingGuaranteeText.includes('Fast shipping'));
assert.ok(!json.includes('[https://'),'URL de afiliação não deve sair em Markdown');

const unconfirmed=generateAssets({...input,freeShipping:'pending',fastShipping:'pending',guaranteeDays:''});
assert.ok(!unconfirmed.headlines.some(item=>/shipping|guarantee/i.test(item)),'condições não confirmadas não devem entrar nos títulos');
assert.ok(!unconfirmed.sitelinks.some(item=>/shipping|guarantee/i.test(`${item.text} ${item.line1} ${item.line2}`)),'condições não confirmadas não devem entrar nos sitelinks');

assert.deepEqual(generationBlockers(input),['Urgência atual','Escassez atual'],'estados de urgência e escassez pendentes devem bloquear a geração');
const resolved={...input,urgencyConfirmed:'no',scarcityConfirmed:'no'};
assert.deepEqual(generationBlockers(resolved),[],'estados confirmados ou explicitamente recusados não devem bloquear');
assert.equal(buildFicha(resolved).pending.length,0,'ficha resolvida não deve conter pendências');
assert.ok(!fichaJson(resolved).includes('"CONFIRMAR"'),'ficha liberada não pode conter campos CONFIRMAR');
assert.equal(buildFicha({...resolved,guaranteeDays:'',guaranteeStatus:'no'}).faqs[2].answer,'No guarantee term was confirmed.','ausência confirmada de garantia deve gerar resposta definida, sem placeholder');
const declined={...resolved,freeShipping:'no',fastShipping:'no',guaranteeDays:'',guaranteeStatus:'no'};
assert.deepEqual(generationBlockers(declined),[],'negações explícitas devem resolver confirmações sem evidência');
assert.ok(!fichaJson(declined).includes('"CONFIRMAR"'),'ficha com condições explicitamente ausentes não pode conter placeholders');
for(const unresolved of [
  {...resolved,freeShipping:'pending'},
  {...resolved,fastShipping:'pending'},
  {...resolved,guaranteeDays:'',guaranteeStatus:'pending'},
  {...resolved,urgencyConfirmed:'pending'},
  {...resolved,scarcityConfirmed:'pending'},
  {...resolved,affiliateUrl:''},
  {...resolved,destination:''},
  {...resolved,currency:''},
  {...resolved,packages:[]}
])assert.ok(generationBlockers(unresolved).length>0,'qualquer confirmação ou dado que causaria CONFIRMAR deve bloquear a geração');

console.log('copy ficha domain ok');
