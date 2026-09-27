import assert from 'node:assert/strict';
import {calculateDiscount,parseOfferText,generateAssets,buildFicha,fichaJson,formatSitelinks,generationBlockers,generationBlockerFields,generationBlockerPackageIndexes} from '../src/copy-ficha/copy-ficha-domain.mjs';

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

const germanDurationPackages=`Such dir dein passendes Slimqa-Paket aus
Investiere in eine bessere tägliche Routine.
30-Tage-Vorrat
STARTERPAKET
30-Tage-Vorrat
33,99 €
Preis pro Packung
65,99 €
Enthält 1 Box – Dein Monatsvorrat
90-Tage-Vorrat
Bestseller
90-Tage-Vorrat
22,99 €
Preis pro Packung
Du sparst: 129,00 €
65,99 €
0,77 € pro Tag
Kostenloser Versand inklusive
Enthält 3 Boxen – ein Vorrat für 3 Monate
60-Tage-Vorrat
2-MONATS-VORRAT
60-Tage-Vorrat
28,99 €
Preis pro Packung
65,99 €
0,95 € pro Tag
Versandkosten: Nur 4,95 €
Enthält 2 Boxen – Vorrat für 2 Monate
© 2026 Slimqa. Alle Rechte vorbehalten.`;
const germanDurationDetected=parseOfferText(germanDurationPackages);
assert.equal(germanDurationDetected.productCandidate,'Slimqa','nome antes do sufixo alemão “-Paket” deve ser extraído do título');
assert.equal(germanDurationDetected.productCandidateSource,'package_title','nome reconhecido pelo título do pacote não deve ser confundido com rótulos de depoimento');
assert.equal(germanDurationDetected.htmlLanguage,'de-DE');
assert.equal(germanDurationDetected.currency,'EUR');
assert.deepEqual(germanDurationDetected.packages.map(item=>[item.label,item.regularPrice,item.promoPrice,item.contents]),[
  ['30-Tage-Vorrat',65.99,33.99,'Enthält 1 Box – Dein Monatsvorrat'],
  ['90-Tage-Vorrat',65.99,22.99,'Enthält 3 Boxen – ein Vorrat für 3 Monate'],
  ['60-Tage-Vorrat',65.99,28.99,'Enthält 2 Boxen – Vorrat für 2 Monate']
],'o formato alemão agrupa títulos repetidos, interpreta € após o valor e ignora economia, preço diário e frete');
assert.ok(germanDurationDetected.packages.every(item=>item.confidence==='high'),'papéis de preço ligados a “Preis pro Packung” ficam detectados com confiança alta');

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
const groundedFootwearPaste=`GET UP TO 60% OFF NOW! USE PROMO CODE: MOVE26 — LIMITED TIME OFFER
90-Day 100% Money Back Guarantee
Questions? Call: 1-888-996-7910 Email: support@groundedfootwear.com
100% Encrypted & Secure Checkout
Checkout
Bonus Deals
Receipt
MOVE26
PROMO APPLIED
Promo code expires in: 06:38. Stay on this page.
1. Select Quantity
Bundle and Save!
You can select color and size on next step
1 Pair
Save 50%
$69.99/ea
$139.98
2 Pairs
Save 55%
Most Popular
$62.99/ea
$279.96
3 Pairs
Save 60%
Best Deal
$55.99/ea
$419.94
Select Your Color and Size
TARIFF FREE
SECURE SSL ENCRYPTION
GUARANTEED SAFE CHECKOUT
A Complete Guide to Transitioning from Traditional to Grounded Barefoot Shoes
Yours FREE for a limited time
with every purchase.
Valued at $49.99
©2026 Copyright Grounded Footwear® - All rights reserved.
Contact Us
Terms of Use
Privacy Policy
Sam from Modesto.
Just purchased: x3 Pairs of Grounded Freedom Shoes
JUST NOW`;
const groundedFootwear=parseOfferText(groundedFootwearPaste);
assert.equal(groundedFootwear.productCandidate,'Grounded Footwear','nome de rodapé pode ser sugerido quando um termo distintivo é corroborado no conteúdo principal');
assert.equal(groundedFootwear.productCandidateSource,'footer_corroborated');
assert.equal(groundedFootwear.productCandidateNeedsReview,true,'produto sugerido do rodapé deve permanecer candidato para revisão');
assert.match(groundedFootwear.productCandidateEvidence,/grounded/i);
assert.deepEqual(groundedFootwear.packages.map(item=>[item.label,item.packageQuantity,item.regularPrice,item.promoPrice,item.displayedUnitPrice,item.confidence]),[
  ['1 Pair',1,139.98,69.99,69.99,'high'],
  ['2 Pairs',2,279.96,125.98,62.99,'high'],
  ['3 Pairs',3,419.94,167.97,55.99,'high']
],'pacotes por quantidade separam preço promocional por unidade, total original exibido e total promocional calculado');
const groundedFootwearFormattedPaste=groundedFootwearPaste
  .replace('1. Select Quantity\nBundle and Save!','#### 1. Select QuantityBundle and Save!')
  .replace(/^(\d{1,2} Pairs?)$/gm,'- **$1**')
  .replace(/^(Save \d+%|\$\d+\.\d{2}\/ea|Most Popular|Best Deal)$/gm,'**$1**');
assert.deepEqual(parseOfferText(groundedFootwearFormattedPaste).packages.map(item=>[item.label,item.packageQuantity,item.regularPrice,item.promoPrice,item.displayedUnitPrice,item.confidence]),[
  ['1 Pair',1,139.98,69.99,69.99,'high'],
  ['2 Pairs',2,279.96,125.98,62.99,'high'],
  ['3 Pairs',3,419.94,167.97,55.99,'high']
],'colagem formatada com título “Select QuantityBundle” e cartões em Markdown ainda deve detectar os pacotes');
assert.ok(groundedFootwear.packages.every(item=>item.promoTotalCalculated&&item.priceNote.includes('total promocional calculado')));
assert.ok(groundedFootwear.packages[1].priceNote.includes('$62.99/ea')&&groundedFootwear.packages[1].priceNote.includes('$279.96'));
assert.equal(groundedFootwear.packages[1].contents,'','selos e textos de navegação não entram como conteúdo do pacote');
const mismatchedPairBadge=parseOfferText(groundedFootwearPaste.replace('Save 55%','Save 45%'));
assert.equal(mismatchedPairBadge.packages[1].confidence,'review','percentual promocional incompatível impede alta confiança do pacote');
assert.equal(generateAssets({packages:[mismatchedPairBadge.packages[1]]}).bestDiscountPercent,null,'desconto calculado que diverge do selo não deve virar percentual anunciado automaticamente');
const groundedAssets=generateAssets({product:groundedFootwear.productCandidate,countryCode:'US',htmlLanguage:'en-US',currency:'USD',packages:groundedFootwear.packages});
assert.equal(groundedAssets.bestDiscountPercent,60);
assert.deepEqual(groundedAssets.packages.map(item=>item.discountPercent),[50,55,60],'descontos são calculados usando totais comparáveis para cada quantidade');
assert.ok(groundedAssets.sitelinks.some(item=>item.text==='3 Pairs'&&item.line1.includes('$55.99/ea')),'sitelinks usam o preço por unidade realmente exibido');
assert.ok(!groundedAssets.sitelinks.some(item=>item.line1.includes('$167.97')),'copy de anúncio não apresenta total promocional calculado como se estivesse diretamente exibido');
const groundedFicha=buildFicha({product:groundedFootwear.productCandidate,countryCode:'US',htmlLanguage:'en-US',currency:'USD',packages:groundedFootwear.packages});
assert.ok(groundedFicha.priceText.includes('calculated promotional total $125.98')&&groundedFicha.priceText.includes('displayed unit price $62.99/ea'),'ficha registra explicitamente unidade exibida e total promocional calculado');
assert.ok(groundedFicha.faqs[0].answer.includes('total calculated from $69.99/ea × 1'),'FAQ não confunde preço unitário com total do pacote');
const gloraRecurringPaste=`A SPECIAL LIMITED-TIME OFFER | GET 70% OFF
GloraMD
Hurry! Your discount is reserved for 09:09 minutes!
Only 81 items Left in Stock
Choose Your Package
Subscribe & Save
One-Time Purchase
1x GloraMD
Received Every 30 Days + Free Shipping
$99.98
$
42.49
/each
SAVE 50%
2x GloraMD
Received Every 60 Days + Free Shipping
$199.96
$
36.52
/each
SAVE 55%
BEST SELLER
3x GloraMD
Received Every 90 Days + Free Shipping
$299.94
$
32.97
/each
SAVE 65%
BEST VALUE
4x GloraMD
Received Every 120 Days + Free Shipping
$399.92
$
29.48
/each
SAVE 70%
Zero Commitment | Exclusive Discounts | Cancel Anytime
Customer Information
Order Summary
3
Why Choose GloraMD
90-Day Money-Back Guarantee
Over 75,000+ Happy Customers
GloraMD helps thousands of women reduce wrinkles and restore their natural glow.
©2026 Copyright GloraMD - All rights reserved.`;
const gloraRecurring=parseOfferText(gloraRecurringPaste);
assert.equal(gloraRecurring.productCandidate,'GloraMD','o nome do produto deve continuar sendo detectado com a nova estrutura de cartões');
assert.equal(gloraRecurring.packages.length,4,'todos os cartões Nx devem ser reconhecidos, sem converter selos em pacotes');
assert.deepEqual(gloraRecurring.packages.map(item=>[item.label,item.packageQuantity,item.regularPrice,item.promoPrice,item.displayedUnitPrice,item.discountBadgePercent,item.confidence]),[
  ['1x GloraMD',1,99.98,42.49,42.49,50,'review'],
  ['2x GloraMD',2,199.96,73.04,36.52,55,'review'],
  ['3x GloraMD',3,299.94,98.91,32.97,65,'review'],
  ['4x GloraMD',4,399.92,117.92,29.48,70,'high']
],'o formato recorrente deve separar total original, preço por unidade, total calculado e selo exibido');
assert.ok(gloraRecurring.packages.every(item=>item.quantityUnit==='unit'),'pacotes deste formato representam unidades, não pares');
assert.equal(gloraRecurring.packages[0].packageDescriptor,'Received Every 30 Days + Free Shipping','o descritor de recorrência e frete fica associado ao pacote');
assert.ok(gloraRecurring.packages[0].priceNote.includes('Received Every 30 Days + Free Shipping'),'a frequência e a condição de envio exibidas devem permanecer associadas ao cartão');
assert.ok(gloraRecurring.packages[0].priceNote.includes('diverge do selo'),'divergência entre cálculo e selo deve ficar visível para revisão');
assert.equal(gloraRecurring.highestPercent,70,'o cálculo de um total por unidade não deve produzir um percentual maior que os valores explicitamente exibidos');
const gloraRecurringAssets=generateAssets({product:'GloraMD',countryCode:'US',htmlLanguage:'en-US',currency:'USD',packages:gloraRecurring.packages});
assert.equal(gloraRecurringAssets.bestDiscountPercent,70,'anúncios devem usar o maior selo coerente, sem promover o cálculo divergente');
const gloraFicha=buildFicha({product:'GloraMD',countryCode:'US',htmlLanguage:'en-US',currency:'USD',packages:gloraRecurring.packages});
assert.ok(gloraFicha.priceText.includes('quantity 3 units')&&!gloraFicha.priceText.includes('quantity 3 pairs'),'a ficha usa a unidade correta em vez da unidade herdada de pacotes de calçados');
assert.ok(gloraFicha.priceText.includes('displayed package terms Received Every 90 Days + Free Shipping'),'a ficha preserva a condição recorrente exibida em cada cartão');
assert.ok(gloraFicha.pending.some(item=>item.includes('discount badge does not match')),'a ficha deixa os cartões com divergência de percentual explicitamente pendentes de revisão');
const gloraInlinePaste=gloraRecurringPaste.replace(/\$\n(42\.49|36\.52|32\.97|29\.48)\n\/each/g,(_,amount)=>`$${amount}/each`);
assert.deepEqual(parseOfferText(gloraInlinePaste).packages.map(item=>[item.label,item.packageQuantity,item.promoPrice]),gloraRecurring.packages.map(item=>[item.label,item.packageQuantity,item.promoPrice]),'o parser também deve aceitar o preço e /each na mesma linha');
const uncorroboratedFooter=parseOfferText(groundedFootwearPaste.replace('Grounded Barefoot Shoes','Traditional Barefoot Shoes'));
assert.notEqual(uncorroboratedFooter.productCandidate,'Grounded Footwear','nome de rodapé sem termo distintivo no corpo não deve ser promovido');
const groundedHeading=parseOfferText(groundedFootwearPaste.replace('A Complete Guide to Transitioning from Traditional to Grounded Barefoot Shoes','Grounded Footwear®\nBarefoot Shoes'),'https://offer.example/freedom/en/us/checkout');
assert.equal(groundedHeading.productCandidate,'Grounded Footwear','título exato do conteúdo principal prevalece sobre slug curto da URL');
assert.equal(groundedHeading.productCandidateSource,'body_corroborated_footer');
assert.equal(groundedHeading.productCandidateNeedsReview,true,'nome da linha de produto/rodapé permanece sujeito à revisão humana');
const groundedBodyFooter=parseOfferText(groundedFootwearPaste.replace('A Complete Guide to Transitioning from Traditional to Grounded Barefoot Shoes','A Complete Guide to Transitioning from\nTraditional to Grounded Barefoot Shoes\nGrounded Footwear®\nBarefoot Shoes\nTalk to a Grounded Footwear® expert to receive help for any needs.'));
assert.equal(groundedBodyFooter.productCandidate,'Grounded Footwear','o nome literal repetido no conteúdo deve prevalecer como sugestão da oferta');
assert.equal(groundedBodyFooter.productCandidateSource,'body_corroborated_footer','a coincidência exata entre conteúdo e rodapé deve ser distinguida de repetição genérica');
assert.equal(groundedBodyFooter.productCandidateNeedsReview,true,'nome corroborado no conteúdo permanece para revisão de marca/produto');
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
assert.ok(assets.descriptions.every(item=>[...item].filter(character=>character==='%').length===1&&!/%\s*%/.test(item)),'cada descrição deve conter exatamente um sinal de porcentagem');
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
  assert.ok(localized.descriptions.every(item=>[...item].filter(character=>character==='%').length===1&&!/%\s*%/.test(item)),`${htmlLanguage}: cada descrição deve conter exatamente um sinal de porcentagem`);
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

assert.deepEqual(generationBlockers(input),['Urgência atual: confirme se a oferta exibe uma condição válida ou marque para não usar','Escassez atual: confirme se a oferta exibe uma condição válida ou marque para não usar'],'estados de urgência e escassez pendentes devem bloquear a geração com instrução de resolução');
const resolved={...input,urgencyConfirmed:'no',scarcityConfirmed:'no'};
assert.deepEqual(generationBlockerFields({...resolved,freeShipping:'pending'}),['freeShipping'],'campo de frete grátis deve ser identificado para destaque visual');
assert.deepEqual(generationBlockerFields({...resolved,guaranteeStatus:'confirmed',guaranteeDays:''}),['guaranteeDays'],'prazo ausente deve apontar o campo específico que falta');
assert.deepEqual(generationBlockerFields({...resolved,affiliateUrl:'not-a-url'}),['affiliateUrl'],'URL inválida deve ser identificada para destaque');
assert.deepEqual(generationBlockerFields({...input,freeShipping:'pending',fastShipping:'pending',guaranteeStatus:'pending',urgencyConfirmed:'pending',scarcityConfirmed:'pending',affiliateUrl:'',destination:'',currency:'',packages:[]}),['freeShipping','fastShipping','guaranteeStatus','urgencyConfirmed','scarcityConfirmed','affiliateUrl','destination','currency','packages'],'todos os bloqueadores pendentes devem ser enumerados');
assert.deepEqual(generationBlockerFields(resolved),[],'formulário sem bloqueios não deve manter campos sinalizados');
assert.deepEqual(generationBlockers(resolved),[],'estados confirmados ou explicitamente recusados não devem bloquear');
assert.equal(buildFicha(resolved).pending.length,0,'ficha resolvida não deve conter pendências');
assert.ok(!fichaJson(resolved).includes('"CONFIRMAR"'),'ficha liberada não pode conter campos CONFIRMAR');
assert.equal(buildFicha({...resolved,guaranteeDays:'',guaranteeStatus:'no'}).faqs[2].answer,'No guarantee term was confirmed.','ausência confirmada de garantia deve gerar resposta definida, sem placeholder');
const declined={...resolved,freeShipping:'no',fastShipping:'no',guaranteeDays:'',guaranteeStatus:'no'};
assert.deepEqual(generationBlockers(declined),[],'negações explícitas devem resolver confirmações sem evidência');
assert.ok(!fichaJson(declined).includes('"CONFIRMAR"'),'ficha com condições explicitamente ausentes não pode conter placeholders');
const gloraResolved={...resolved,product:'GloraMD',freeShipping:'confirmed',fastShipping:'no',guaranteeStatus:'confirmed',guaranteeDays:90,packages:gloraRecurring.packages};
const gloraBlockers=generationBlockers(gloraResolved);
assert.equal(gloraBlockers.length,1,'a divergência dos selos dos cartões deve ser consolidada em um bloqueio acionável');
assert.match(gloraBlockers[0],/Pacotes: o desconto calculado diverge do selo informado em 1x GloraMD, 2x GloraMD e 3x GloraMD/,'a mensagem deve identificar os pacotes específicos que impedem gerar');
assert.deepEqual(generationBlockerFields(gloraResolved),['packages'],'a divergência do selo deve destacar a área de pacotes');
assert.deepEqual(generationBlockerPackageIndexes(gloraResolved),[0,1,2],'somente os cartões com divergência devem receber destaque');
assert.deepEqual(generationBlockerFields({...resolved,product:'',countryCode:'',htmlLanguage:'',currency:''}),['product','countryCode','htmlLanguage','currency'],'campos obrigatórios ausentes devem ser enumerados para destaque');
assert.deepEqual(generationBlockerFields({...resolved,product:'CONFIRMAR',countryCode:'CONFIRMAR',htmlLanguage:'CONFIRMAR',currency:'CONFIRMAR'}),['product','countryCode','htmlLanguage','currency'],'placeholders também devem ser tratados como campos sem confirmação');
assert.ok(generationBlockers({...resolved,affiliateUrl:'sem-protocolo'}).some(item=>/URL de afiliação: informe uma URL completa/.test(item)),'URL inválida deve informar como corrigir e não ficar sem explicação');
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
