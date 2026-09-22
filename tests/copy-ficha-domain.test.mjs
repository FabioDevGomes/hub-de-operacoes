import assert from 'node:assert/strict';
import {calculateDiscount,parseOfferText,generateAssets,buildFicha,fichaJson,formatSitelinks} from '../src/copy-ficha/copy-ficha-domain.mjs';

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

const assets=generateAssets(input);
assert.ok(assets.headlines.length>=30,'deve gerar ao menos 30 títulos quando o nome cabe');
assert.ok(assets.headlines.filter(item=>item.toLowerCase().includes('myoglow')).length>=10,'deve manter várias opções com o produto');
assert.ok(assets.headlines.some(item=>item.includes('60.3%')),'deve priorizar o maior percentual de desconto');
assert.ok(assets.headlines.every(item=>[...item].length<=30),'títulos devem respeitar 30 caracteres');
assert.ok(assets.descriptions.every(item=>[...item].length<=90),'descrições devem respeitar 90 caracteres');
assert.ok(assets.sitelinks.length>=8,'deve gerar ao menos 8 sitelinks');
assert.ok(assets.sitelinks.every(item=>item.text.length<=25&&item.line1.length<=35&&item.line2.length<=35),'sitelinks devem respeitar os limites');
assert.ok(assets.sitelinks.every(item=>item.line1.split(/\s+/).length>=2&&item.line2.split(/\s+/).length>=2),'descrições de sitelink não podem ser rótulos pobres de uma palavra');
assert.ok(assets.sitelinks.filter(item=>/\d+(?:\.\d+)?%/.test(`${item.text} ${item.line1} ${item.line2}`)).length>=5,'sitelinks devem explorar o percentual de desconto em várias opções');
assert.ok(assets.sitelinks.some(item=>/Save \$120\.00/.test(`${item.text} ${item.line1} ${item.line2}`)),'sitelinks devem mostrar a economia em dinheiro quando calculável');
assert.ok(!assets.sitelinks.some(item=>item.text==='Offer Details'&&item.line1==='Offer'&&item.line2==='Packages'),'formato pobre mostrado na captura não pode voltar');
assert.ok(formatSitelinks(assets.sitelinks).includes('\n\n'),'sitelinks devem sair em blocos sem rótulos internos');

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

console.log('copy ficha domain ok');
