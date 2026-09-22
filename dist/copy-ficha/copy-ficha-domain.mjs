const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const number=value=>{
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  const text=clean(value).replace(/[^\d,.-]/g,'');
  if(!text)return null;
  const comma=text.lastIndexOf(','),dot=text.lastIndexOf('.');
  const normalized=comma>dot?text.replace(/\./g,'').replace(',','.'):text.replace(/,/g,'');
  const parsed=Number(normalized);
  return Number.isFinite(parsed)?parsed:null;
};
const unique=values=>[...new Set(values.map(clean).filter(Boolean))];
const language=value=>clean(value).split('-')[0].toLowerCase()||'en';
const percent=(value,htmlLanguage='en-US')=>Number.isInteger(value)?String(value):Number(value).toFixed(1).replace('.',language(htmlLanguage)==='en'?'.':',');

const DICTIONARY={
  en:{locale:'en-US',buy:'Buy',order:'Order',choose:'Choose',shop:'Shop',save:'Save',off:'Off',offer:'Offer',deal:'Deal',discount:'Discount',today:'Today',now:'Now',online:'Online',packages:'Packages',bundle:'Bundle',price:'Price',checkout:'Checkout',details:'Offer Details',freeShipping:'Free US Shipping',fastShipping:'Fast Shipping',guarantee:'Guarantee',moneyBack:'Money-Back',cookieTitle:'Cookies & Privacy',cookieText:'We use cookies to improve your browsing experience and understand site use. You can accept or decline non-essential cookies.',accept:'Accept',decline:'Decline',close:'Close cookie banner',faq:'Frequently asked questions',view:'View offer details',overview:'Available packages',prices:'Displayed prices and savings',shipping:'Shipping and guarantee',intro:p=>`Review the available ${p} packages, displayed prices, shipping, and guarantee terms before placing your order.`,overviewText:p=>`The offer displays the available ${p} package options.`,priceLead:'Displayed package prices',shipFree:'The offer displays free shipping.',shipFast:'Fast shipping was confirmed for this offer.',shipNoFree:'Free shipping is not displayed for this offer.',guaranteeDays:d=>`The offer displays a ${d}-Day Satisfaction Guarantee.`,guaranteeNone:'No guarantee term was confirmed.',lowest:'What is the lowest displayed package price?',shippingQ:'What shipping information is confirmed?',guaranteeQ:'What guarantee is displayed?',optionsQ:'What package options are displayed?',review:'Review the offer terms before placing an order.'},
  pt:{locale:'pt-BR',buy:'Compre',order:'Peça',choose:'Escolha',shop:'Comprar',save:'Economize',off:'Desconto',offer:'Oferta',deal:'Condição',discount:'Desconto',today:'Hoje',now:'Agora',online:'Online',packages:'Pacotes',bundle:'Pacote',price:'Preço',checkout:'Finalizar Compra',details:'Ver detalhes da oferta',freeShipping:'Frete Grátis',fastShipping:'Envio Rápido',guarantee:'Garantia',moneyBack:'Reembolso',cookieTitle:'Cookies e privacidade',cookieText:'Usamos cookies para melhorar sua experiência de navegação e entender o uso do site. Você pode aceitar ou recusar cookies não essenciais.',accept:'Aceitar',decline:'Recusar',close:'Fechar aviso de cookies',faq:'Perguntas frequentes',view:'Ver detalhes da oferta',overview:'Pacotes disponíveis',prices:'Preços e economia exibidos',shipping:'Envio e garantia',intro:p=>`Confira os pacotes de ${p}, os preços exibidos e os termos de envio e garantia antes de fazer o pedido.`,overviewText:p=>`A oferta exibe as opções de pacotes disponíveis de ${p}.`,priceLead:'Preços dos pacotes exibidos',shipFree:'A oferta exibe frete grátis.',shipFast:'O envio rápido foi confirmado para esta oferta.',shipNoFree:'A oferta não exibe frete grátis.',guaranteeDays:d=>`A oferta exibe garantia de satisfação de ${d} dias.`,guaranteeNone:'Nenhum prazo de garantia foi confirmado.',lowest:'Qual é o menor preço de pacote exibido?',shippingQ:'Quais informações de envio estão confirmadas?',guaranteeQ:'Qual garantia é exibida?',optionsQ:'Quais opções de pacote são exibidas?',review:'Confira os termos da oferta antes de fazer o pedido.'},
  it:{locale:'it-IT',buy:'Acquista',order:'Ordina',choose:'Scegli',shop:'Compra',save:'Risparmia',off:'Sconto',offer:'Offerta',deal:'Promozione',discount:'Sconto',today:'Oggi',now:'Ora',online:'Online',packages:'Pacchetti',bundle:'Pacchetto',price:'Prezzo',checkout:'Vai al Checkout',details:"Vedi i dettagli dell'offerta",freeShipping:'Spedizione Gratuita',fastShipping:'Spedizione Rapida',guarantee:'Garanzia',moneyBack:'Rimborso',cookieTitle:'Cookie e privacy',cookieText:'Utilizziamo i cookie per migliorare la navigazione e comprendere l’uso del sito. Puoi accettare o rifiutare i cookie non essenziali.',accept:'Accetta',decline:'Rifiuta',close:'Chiudi banner cookie',faq:'Domande frequenti',view:"Vedi i dettagli dell'offerta",overview:'Pacchetti disponibili',prices:'Prezzi e risparmi visualizzati',shipping:'Spedizione e garanzia',intro:p=>`Consulta i pacchetti ${p}, i prezzi visualizzati e le condizioni di spedizione e garanzia prima di ordinare.`,overviewText:p=>`L'offerta mostra le opzioni di pacchetto disponibili per ${p}.`,priceLead:'Prezzi dei pacchetti visualizzati',shipFree:"L'offerta mostra la spedizione gratuita.",shipFast:'La spedizione rapida è confermata per questa offerta.',shipNoFree:"L'offerta non mostra la spedizione gratuita.",guaranteeDays:d=>`L'offerta mostra una garanzia di soddisfazione di ${d} giorni.`,guaranteeNone:'Nessun periodo di garanzia è stato confermato.',lowest:'Qual è il prezzo più basso visualizzato?',shippingQ:'Quali informazioni sulla spedizione sono confermate?',guaranteeQ:'Quale garanzia viene mostrata?',optionsQ:'Quali pacchetti sono disponibili?',review:"Controlla le condizioni dell'offerta prima di ordinare."},
  es:{locale:'es-ES',buy:'Compra',order:'Pide',choose:'Elige',shop:'Comprar',save:'Ahorra',off:'Descuento',offer:'Oferta',deal:'Promoción',discount:'Descuento',today:'Hoy',now:'Ahora',online:'Online',packages:'Paquetes',bundle:'Paquete',price:'Precio',checkout:'Finalizar Compra',details:'Ver detalles de la oferta',freeShipping:'Envío Gratis',fastShipping:'Envío Rápido',guarantee:'Garantía',moneyBack:'Reembolso',cookieTitle:'Cookies y privacidad',cookieText:'Usamos cookies para mejorar tu experiencia de navegación y comprender el uso del sitio. Puedes aceptar o rechazar las cookies no esenciales.',accept:'Aceptar',decline:'Rechazar',close:'Cerrar aviso de cookies',faq:'Preguntas frecuentes',view:'Ver detalles de la oferta',overview:'Paquetes disponibles',prices:'Precios y ahorros mostrados',shipping:'Envío y garantía',intro:p=>`Revisa los paquetes de ${p}, los precios mostrados y las condiciones de envío y garantía antes de realizar el pedido.`,overviewText:p=>`La oferta muestra las opciones de paquetes disponibles de ${p}.`,priceLead:'Precios de paquetes mostrados',shipFree:'La oferta muestra envío gratis.',shipFast:'El envío rápido está confirmado para esta oferta.',shipNoFree:'La oferta no muestra envío gratis.',guaranteeDays:d=>`La oferta muestra una garantía de satisfacción de ${d} días.`,guaranteeNone:'No se confirmó un plazo de garantía.',lowest:'¿Cuál es el precio de paquete más bajo?',shippingQ:'¿Qué información de envío está confirmada?',guaranteeQ:'¿Qué garantía se muestra?',optionsQ:'¿Qué opciones de paquete se muestran?',review:'Revisa las condiciones de la oferta antes de realizar el pedido.'},
  fr:{locale:'fr-FR',buy:'Achetez',order:'Commandez',choose:'Choisissez',shop:'Acheter',save:'Économisez',off:'Réduction',offer:'Offre',deal:'Promotion',discount:'Réduction',today:"Aujourd'hui",now:'Maintenant',online:'En Ligne',packages:'Packs',bundle:'Pack',price:'Prix',checkout:'Commander',details:"Voir les détails de l'offre",freeShipping:'Livraison Gratuite',fastShipping:'Expédition Rapide',guarantee:'Garantie',moneyBack:'Remboursement',cookieTitle:'Cookies et confidentialité',cookieText:"Nous utilisons des cookies pour améliorer votre navigation et comprendre l'utilisation du site. Vous pouvez accepter ou refuser les cookies non essentiels.",accept:'Accepter',decline:'Refuser',close:'Fermer la bannière des cookies',faq:'Questions fréquentes',view:"Voir les détails de l'offre",overview:'Packs disponibles',prices:'Prix et économies affichés',shipping:'Livraison et garantie',intro:p=>`Consultez les packs ${p}, les prix affichés et les conditions de livraison et de garantie avant de commander.`,overviewText:p=>`L'offre affiche les options de packs disponibles pour ${p}.`,priceLead:'Prix des packs affichés',shipFree:"L'offre affiche la livraison gratuite.",shipFast:"L'expédition rapide est confirmée pour cette offre.",shipNoFree:"L'offre n'affiche pas la livraison gratuite.",guaranteeDays:d=>`L'offre affiche une garantie de satisfaction de ${d} jours.`,guaranteeNone:"Aucune durée de garantie n'a été confirmée.",lowest:'Quel est le prix le plus bas affiché ?',shippingQ:'Quelles informations de livraison sont confirmées ?',guaranteeQ:'Quelle garantie est affichée ?',optionsQ:'Quels packs sont affichés ?',review:"Consultez les conditions de l'offre avant de commander."},
  de:{locale:'de-DE',buy:'Kaufen',order:'Bestellen',choose:'Wählen',shop:'Kaufen',save:'Sparen',off:'Rabatt',offer:'Angebot',deal:'Aktion',discount:'Rabatt',today:'Heute',now:'Jetzt',online:'Online',packages:'Pakete',bundle:'Paket',price:'Preis',checkout:'Zur Kasse',details:'Angebotsdetails ansehen',freeShipping:'Kostenloser Versand',fastShipping:'Schneller Versand',guarantee:'Garantie',moneyBack:'Geld-zurück',cookieTitle:'Cookies und Datenschutz',cookieText:'Wir verwenden Cookies, um Ihr Surferlebnis zu verbessern und die Nutzung der Website zu verstehen. Sie können nicht notwendige Cookies akzeptieren oder ablehnen.',accept:'Akzeptieren',decline:'Ablehnen',close:'Cookie-Banner schließen',faq:'Häufig gestellte Fragen',view:'Angebotsdetails ansehen',overview:'Verfügbare Pakete',prices:'Angezeigte Preise und Ersparnisse',shipping:'Versand und Garantie',intro:p=>`Prüfen Sie die verfügbaren ${p}-Pakete, Preise sowie Versand- und Garantiebedingungen vor der Bestellung.`,overviewText:p=>`Das Angebot zeigt die verfügbaren Paketoptionen für ${p}.`,priceLead:'Angezeigte Paketpreise',shipFree:'Das Angebot zeigt kostenlosen Versand.',shipFast:'Schneller Versand wurde für dieses Angebot bestätigt.',shipNoFree:'Das Angebot zeigt keinen kostenlosen Versand.',guaranteeDays:d=>`Das Angebot zeigt eine ${d}-Tage-Zufriedenheitsgarantie.`,guaranteeNone:'Es wurde keine Garantiedauer bestätigt.',lowest:'Was ist der niedrigste angezeigte Paketpreis?',shippingQ:'Welche Versandinformationen sind bestätigt?',guaranteeQ:'Welche Garantie wird angezeigt?',optionsQ:'Welche Paketoptionen werden angezeigt?',review:'Prüfen Sie die Angebotsbedingungen vor der Bestellung.'},
  sv:{locale:'sv-SE',buy:'Köp',order:'Beställ',choose:'Välj',shop:'Handla',save:'Spara',off:'Rabatt',offer:'Erbjudande',deal:'Kampanj',discount:'Rabatt',today:'Idag',now:'Nu',online:'Online',packages:'Paket',bundle:'Paket',price:'Pris',checkout:'Till Kassa',details:'Visa erbjudandet',freeShipping:'Fri Frakt',fastShipping:'Snabb Leverans',guarantee:'Garanti',moneyBack:'Pengarna Tillbaka',cookieTitle:'Cookies och integritet',cookieText:'Vi använder cookies för att förbättra din upplevelse och förstå hur webbplatsen används. Du kan acceptera eller neka icke-nödvändiga cookies.',accept:'Acceptera',decline:'Neka',close:'Stäng cookie-bannern',faq:'Vanliga frågor',view:'Visa erbjudandet',overview:'Tillgängliga paket',prices:'Visade priser och besparingar',shipping:'Frakt och garanti',intro:p=>`Granska tillgängliga ${p}-paket, visade priser samt frakt- och garantivillkor innan du beställer.`,overviewText:p=>`Erbjudandet visar tillgängliga paketalternativ för ${p}.`,priceLead:'Visade paketpriser',shipFree:'Erbjudandet visar fri frakt.',shipFast:'Snabb leverans är bekräftad för detta erbjudande.',shipNoFree:'Erbjudandet visar inte fri frakt.',guaranteeDays:d=>`Erbjudandet visar en ${d}-dagars nöjdhetsgaranti.`,guaranteeNone:'Ingen garantiperiod har bekräftats.',lowest:'Vilket är det lägsta visade paketpriset?',shippingQ:'Vilken fraktinformation är bekräftad?',guaranteeQ:'Vilken garanti visas?',optionsQ:'Vilka paketalternativ visas?',review:'Granska erbjudandets villkor innan du beställer.'}
};

export function dictionaryFor(htmlLanguage='en-US'){return DICTIONARY[language(htmlLanguage)]||DICTIONARY.en}

export function calculateDiscount(regularPrice,promoPrice){
  const regular=number(regularPrice),promo=number(promoPrice);
  if(!(regular>0)||!(promo>=0)||promo>=regular)return null;
  return Math.round(((regular-promo)/regular)*1000)/10;
}

export function normalizePackages(packages=[]){
  return packages.map((item,index)=>{
    const regularPrice=number(item.regularPrice),promoPrice=number(item.promoPrice);
    return {label:clean(item.label)||`Package ${index+1}`,regularPrice,promoPrice,contents:clean(item.contents),discountPercent:calculateDiscount(regularPrice,promoPrice)};
  }).filter(item=>item.regularPrice!==null||item.promoPrice!==null||item.contents);
}

const COUNTRY_NAMES={US:/\b(united states|usa|u\.s\.a?\.?|estados unidos)\b/i,AU:/\b(australia|austrália)\b/i,CA:/\b(canada|canadá)\b/i,GB:/\b(united kingdom|great britain|uk)\b/i,BR:/\b(brazil|brasil)\b/i,IT:/\b(italy|italia)\b/i,ES:/\b(spain|españa)\b/i,FR:/\b(france)\b/i,DE:/\b(germany|deutschland)\b/i,SE:/\b(sweden|sverige)\b/i};
const LANGUAGE_SIGNALS={pt:/\b(frete|garantia|compre|economize|pacote)\b/gi,it:/\b(spedizione|garanzia|acquista|risparmia|pacchetto)\b/gi,es:/\b(envío|garantía|compra|ahorra|paquete)\b/gi,fr:/\b(livraison|garantie|achetez|économisez|offre)\b/gi,de:/\b(versand|garantie|kaufen|sparen|angebot)\b/gi,sv:/\b(frakt|garanti|köp|spara|erbjudande)\b/gi,en:/\b(shipping|guarantee|buy|save|bundle|package)\b/gi};
const DEFAULT_COUNTRY={pt:'BR',it:'IT',es:'ES',fr:'FR',de:'DE',sv:'SE',en:'US'};
const DEFAULT_LOCALE={BR:'pt-BR',IT:'it-IT',ES:'es-ES',FR:'fr-FR',DE:'de-DE',SE:'sv-SE',US:'en-US',AU:'en-AU',CA:'en-CA',GB:'en-GB'};
const PRODUCT_STOP=/^(save|free|shipping|guarantee|order|buy|checkout|package|packages|bundle|bundles|best|value|basic|starter|premium|offer|official|today|total|regular|price|discount|cookies?|privacy|accept|decline|frete|garantia|compre|oferta|spedizione|garanzia|acquista|offerta|envío|garantía|compra|livraison|achetez|versand|kaufen|frakt|köp)$/i;
const PACKAGE_LABEL=/^(?:(?:basic|starter|premium|popular|best\s+value|most\s+popular|single|standard|essentials?|base|completo|completa)\s*(?:bundle|package|pack|kit|pacchetto|pacote|paquete)?|(?:\d+|one|two|three|four|five|six|uno|due|tre)\s*[- ]?(?:month|months|month supply|bottle|bottles|unit|units|pack|packs|mese|mesi|mes|meses|mois|monat|monate|månad|månader)(?:\s*(?:bundle|package|pack|supply|kit|pacchetto|pacote|paquete))?)/i;
const PRICE_TOKEN=/(?:US\$|AU\$|CA\$|R\$|\$|€|£|kr)\s?\d{1,6}(?:[.,]\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?\s?(?:USD|AUD|CAD|BRL|EUR|GBP|SEK)\b/gi;

function inferLocale(text,url,currency){
  let explicitLanguage='',country='';
  const source=`${url||''} ${text||''}`;
  const locale=source.match(/\b(en|pt|it|es|fr|de|sv)[-_\/]([A-Z]{2})\b/i);
  if(locale){explicitLanguage=locale[1].toLowerCase();country=locale[2].toUpperCase()}
  if(!country)for(const [code,pattern] of Object.entries(COUNTRY_NAMES))if(pattern.test(source)){country=code;break}
  if(!country)country=currency==='AUD'?'AU':currency==='CAD'?'CA':currency==='GBP'?'GB':currency==='BRL'?'BR':currency==='SEK'?'SE':'';
  if(!explicitLanguage){
    const scores=Object.entries(LANGUAGE_SIGNALS).map(([code,pattern])=>[code,(text.match(pattern)||[]).length]).sort((a,b)=>b[1]-a[1]);
    if(scores[0]?.[1]>0)explicitLanguage=scores[0][0];
  }
  if(!country&&explicitLanguage)country=DEFAULT_COUNTRY[explicitLanguage]||'';
  const htmlLanguage=country?(DEFAULT_LOCALE[country]||`${explicitLanguage||'en'}-${country}`):(explicitLanguage?`${explicitLanguage}-${DEFAULT_COUNTRY[explicitLanguage]||explicitLanguage.toUpperCase()}`:'');
  return {countryCode:country,htmlLanguage};
}

function urlProductCandidate(url,raw){
  try{
    const parsed=new URL(url),ignored=/^(?:en|pt|it|es|fr|de|sv|us|au|ca|br|gb|de|se|offer\d*|order|orders|checkout|checkouts|default|fbch|thank-you|cart|index|php)$/i;
    const pathCandidates=parsed.pathname.split('/').map(value=>decodeURIComponent(value)).filter(value=>/[a-z]{3}/i.test(value)&&!ignored.test(value)).map(value=>value.replace(/\.[a-z0-9]+$/i,'').replace(/^(?:cc|sp|v)\d+[-_]?/i,'').replace(/[-_]?(?:cc|sp|v)\d+$/i,''));
    const hostParts=parsed.hostname.replace(/^www\./i,'').split('.'),root=hostParts.length>1?hostParts.at(-2):hostParts[0];
    const hostCandidate=root.replace(/^(?:get|buy|try|order|orders|sale)/i,'');
    const slug=pathCandidates.find(value=>value.length>=4)||hostCandidate;
    if(!slug||ignored.test(slug))return'';
    const normalized=slug.replace(/[^a-z0-9]/gi,'').toLowerCase();
    const branded=[...String(raw||'').matchAll(/\b[A-Z][A-Za-z0-9®™]*(?:[-'][A-Za-z0-9®™]+)*\b/g)].map(match=>match[0]).find(token=>token.replace(/[^a-z0-9]/gi,'').toLowerCase()===normalized);
    if(branded)return branded;
    return slug.split(/[-_]+/).filter(Boolean).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');
  }catch{return''}
}

function textProductCandidate(text,url){
  const lines=String(text||'').split(/\r?\n/).map(clean).filter(Boolean);
  const shortLine=lines.find(line=>line.length>=3&&line.length<=45&&!PRODUCT_STOP.test(line)&&!/[$€£%]|\b(?:shipping|guarantee|bundle|package|checkout|price|save|discount|plus|month|months|supply|bottle|bottles)\b/i.test(line)&&/^[A-Za-zÀ-ÿ0-9®™+.'’ -]+$/.test(line));
  if(shortLine)return shortLine.replace(/[®™]/g,'').trim();
  const urlCandidate=urlProductCandidate(url,text);
  if(urlCandidate)return urlCandidate;
  const tokens=[...String(text||'').matchAll(/\b[A-Z][A-Za-z0-9®™]*(?:[-'][A-Za-z0-9®™]+)*\b/g)].map((match,index)=>({value:match[0],index})).filter(item=>item.value.length>3&&!PRODUCT_STOP.test(item.value));
  const scores=new Map();
  for(const item of tokens){const key=item.value.toLowerCase(),current=scores.get(key)||{value:item.value,count:0,first:item.index};current.count+=1;scores.set(key,current)}
  return [...scores.values()].sort((a,b)=>b.count-a.count||a.first-b.first)[0]?.value||'';
}

function priceEntries(lines){
  const entries=[];
  lines.forEach((line,lineIndex)=>{
    for(const match of line.matchAll(new RegExp(PRICE_TOKEN.source,'gi'))){
      const value=number(match[0]);
      if(value!==null)entries.push({raw:match[0],value,line,lineIndex});
    }
  });
  return entries.filter((entry,index)=>entries.findIndex(other=>other.value===entry.value&&other.lineIndex===entry.lineIndex)===index);
}

function parsePackages(text){
  const lines=String(text||'').split(/\r?\n/).map(clean).filter(Boolean),starts=[];
  lines.forEach((line,index)=>{const match=line.match(PACKAGE_LABEL);if(match)starts.push({index,label:clean(match[0])})});
  if(!starts.length&&lines.length===1){
    const match=lines[0].match(/\b(?:basic|starter|premium|best value|most popular)\s+(?:bundle|package|pack|kit)\b/i);
    if(match)starts.push({index:0,label:clean(match[0])});
  }
  const packages=[];
  starts.forEach((start,position)=>{
    const end=starts[position+1]?.index??Math.min(lines.length,start.index+14),block=lines.slice(start.index,end),prices=priceEntries(block);
    const regularTagged=prices.find(item=>/\b(regular|retail|list price|was|original|normally|prezzo normale|prix normal|precio habitual|de|antes)\b/i.test(item.line));
    const promoTagged=prices.find(item=>/\b(now|today|sale|offer price|your price|package price|total|agora|oggi|ora|maintenant|jetzt|nu)\b/i.test(item.line)&&item!==regularTagged);
    let regularPrice=regularTagged?.value??null,promoPrice=promoTagged?.value??null,confidence='high';
    const values=unique(prices.map(item=>String(item.value))).map(Number).sort((a,b)=>a-b);
    if(regularPrice===null||promoPrice===null){
      if(values.length===2){promoPrice=values[0];regularPrice=values[1]}
      else{confidence='review';regularPrice=regularPrice??null;promoPrice=promoPrice??null}
    }
    if(regularPrice!==null&&promoPrice!==null&&regularPrice<=promoPrice){confidence='review';regularPrice=null;promoPrice=null}
    const contents=block.slice(1).find(line=>!new RegExp(PRICE_TOKEN.source,'i').test(line)&&!/\b(add to cart|order now|buy now|free shipping|guarantee|save|discount|economize|risparmia)\b/i.test(line)&&line.length<=110)||'';
    const entry={label:start.label,regularPrice,promoPrice,contents,confidence};
    if(!packages.some(item=>item.label.toLowerCase()===entry.label.toLowerCase()))packages.push(entry);
  });
  return packages.slice(0,8);
}

export function parseOfferText(raw='',url=''){
  const text=String(raw||''),flat=clean(text);
  const percentages=[...flat.matchAll(/\b(\d{1,2}(?:[.,]\d+)?)\s*%/g)].map(match=>number(match[1])).filter(value=>value>0&&value<100);
  const amounts=[...flat.matchAll(/(?:US\$|AU\$|CA\$|R\$|\$|€|£|kr)\s?\d{1,5}(?:[.,]\d{1,2})?/gi)].map(match=>clean(match[0]));
  const guarantee=[...flat.matchAll(/\b(\d{1,3})\s*[- ]?\s*(?:day|days|dias|giorni|jours|tage|dagar)\b[^.]{0,45}(?:guarantee|garantia|garanzia|garantie|garanti)/gi)].map(match=>Number(match[1]));
  const currency=/AU\$/i.test(flat)?'AUD':/CA\$/i.test(flat)?'CAD':/R\$/i.test(flat)?'BRL':/€/i.test(flat)?'EUR':/£/i.test(flat)?'GBP':/\bkr\b/i.test(flat)?'SEK':/\$/.test(flat)?'USD':'';
  const locale=inferLocale(text,url,currency),productCandidate=textProductCandidate(text,url),packages=parsePackages(text),calculatedDiscounts=packages.map(item=>calculateDiscount(item.regularPrice,item.promoPrice)).filter(value=>value!==null);
  const highestPercent=[...percentages,...calculatedDiscounts].length?Math.max(...percentages,...calculatedDiscounts):null;
  return {
    percentages:unique(percentages.map(percent)),
    amounts:unique(amounts).slice(0,30),
    highestPercent,
    currency,
    countryCode:locale.countryCode,
    htmlLanguage:locale.htmlLanguage,
    productCandidate,
    pageTitleCandidate:productCandidate?`${productCandidate} | ${dictionaryFor(locale.htmlLanguage||'en-US').packages}`:'',
    packages,
    guaranteeDays:guarantee.length?guarantee[0]:null,
    freeShippingCandidate:/\b(free shipping|frete gr[aá]tis|spedizione gratuita|env[ií]o gratis|livraison gratuite|kostenloser versand|fri frakt)\b/i.test(flat),
    fastShippingCandidate:/\b(fast shipping|quick delivery|express shipping|envio r[aá]pido|spedizione rapida|env[ií]o r[aá]pido|exp[eé]dition rapide|schneller versand|snabb leverans)\b/i.test(flat),
    urgencyCandidate:/\b(today only|limited time|ends today|oggi|aujourd'hui|nur heute|idag|por tempo limitado|tempo limitato)\b/i.test(flat),
    scarcityCandidate:/\b(limited stock|while supplies last|few left|estoque limitado|scorte limitate|stock limit[eé]|begrenzter vorrat|begränsat lager)\b/i.test(flat)
  };
}

function money(value,currency='USD',htmlLanguage='en-US'){
  const numeric=number(value);
  if(numeric===null)return'';
  try{return new Intl.NumberFormat(dictionaryFor(htmlLanguage).locale,{style:'currency',currency:currency||'USD',maximumFractionDigits:2}).format(numeric)}catch{return`${currency||''} ${numeric.toFixed(2)}`.trim()}
}
function within(values,limit){return unique(values).filter(value=>[...value].length<=limit)}

function headlineCandidates(data,t,best,lowest){
  const p=clean(data.product),pct=best?percent(best,data.htmlLanguage):'',price=lowest?money(lowest.promoPrice,data.currency,data.htmlLanguage):'';
  const pfx=[t.buy,t.order,t.choose,t.shop],suffix=[t.offer,t.discount,t.packages,t.price,t.checkout,t.today,t.now,t.online];
  const values=[];
  if(p){
    values.push(p,...pfx.map(word=>`${word} ${p}`),...suffix.map(word=>`${p} ${word}`));
    if(pct)values.push(`${p} ${pct}% ${t.off}`,`${t.save} ${pct}% ${p}`,`${p}: ${pct}% ${t.off}`);
    if(price)values.push(`${p} ${price}`,`${p} ${t.price} ${price}`);
    if(data.guaranteeDays)values.push(`${p} ${data.guaranteeDays} ${t.guarantee}`);
    if(data.freeShipping==='confirmed')values.push(`${p} ${t.freeShipping}`);
    if(data.fastShipping==='confirmed')values.push(`${p} ${t.fastShipping}`);
  }
  if(pct)values.push(`${pct}% ${t.off}`,`${t.save} ${pct}%`,`${t.discount} ${pct}%`,`${t.offer}: ${pct}% ${t.off}`,`${t.deal}: ${pct}% ${t.off}`,`${t.save} ${pct}% ${t.today}`,`${pct}% ${t.off} ${t.today}`,`${pct}% ${t.off} ${t.now}`,`${t.discount} ${pct}% ${t.online}`,`${t.choose} ${pct}% ${t.off}`);
  if(price)values.push(`${t.price} ${price}`,`${t.offer} ${price}`,`${t.buy} ${t.today} ${price}`);
  if(data.guaranteeDays)values.push(`${data.guaranteeDays} ${t.guarantee}`,`${t.guarantee}: ${data.guaranteeDays}`,`${t.buy} · ${t.guarantee}`);
  if(data.freeShipping==='confirmed')values.push(t.freeShipping,`${t.offer} + ${t.freeShipping}`,`${t.buy} + ${t.freeShipping}`);
  if(data.fastShipping==='confirmed')values.push(t.fastShipping,`${t.order} + ${t.fastShipping}`,`${t.buy} + ${t.fastShipping}`);
  for(const first of [t.buy,t.order,t.choose,t.shop,t.offer,t.deal,t.discount])for(const last of [t.today,t.now,t.online,t.packages,t.checkout,t.details])values.push(`${first} ${last}`);
  return values;
}

function descriptionCandidates(data,t,best,lowest){
  const p=clean(data.product),pct=best?percent(best,data.htmlLanguage):'',price=lowest?money(lowest.promoPrice,data.currency,data.htmlLanguage):'';
  const values=[];
  if(pct)values.push(`${t.save} ${pct}%${p?` · ${p}`:''}. ${t.choose} ${t.packages}. ${t.order} ${t.now}.`,`${pct}% ${t.off}${p?` · ${p}`:''}. ${t.view}.`,`${t.offer}: ${pct}% ${t.off}. ${t.choose} ${t.bundle}. ${t.checkout}.`);
  if(price)values.push(`${t.price}: ${price}. ${t.view}. ${t.order} ${t.now}.`);
  if(data.guaranteeDays)values.push(`${data.guaranteeDays} ${t.guarantee}. ${t.view}. ${t.order} ${t.today}.`,`${t.buy} ${p||t.offer}. ${data.guaranteeDays} ${t.guarantee}.`);
  if(data.freeShipping==='confirmed')values.push(`${t.freeShipping}. ${t.choose} ${t.bundle}. ${t.order} ${t.today}.`);
  if(data.fastShipping==='confirmed')values.push(`${t.fastShipping}. ${t.order} ${p||t.offer} ${t.today}.`);
  values.push(
    `${t.view}. ${t.choose} ${t.bundle}. ${t.checkout}.`,
    `${t.choose} ${t.bundle}. ${t.view}. ${t.order} ${t.today}.`,
    `${t.buy} ${p||t.offer} ${t.online}. ${t.view}.`,
    `${t.offer}. ${pct?`${t.save} ${pct}%. `:''}${t.order} ${t.today}.`,
    `${t.discount}${pct?`: ${pct}%`:''}. ${t.choose} ${t.packages}. ${t.buy} ${t.now}.`,
    `${t.buy} ${p||t.offer}. ${pct?`${t.save} ${pct}%. `:''}${t.checkout}.`,
    `${t.packages}${p?` · ${p}`:''}. ${t.view}. ${t.order} ${t.now}.`,
    `${t.choose} ${t.packages}. ${t.buy} ${t.online}. ${t.checkout}.`,
    `${t.details}. ${t.price}. ${t.packages}. ${t.order} ${t.today}.`
  );
  return values;
}

function sitelink(text,line1,line2){return{ text:clean(text),line1:clean(line1),line2:clean(line2)}}
function firstWithin(values,limit){return unique(values).find(value=>[...value].length<=limit)||''}
function packageSavings(item){return item.regularPrice!==null&&item.promoPrice!==null&&item.regularPrice>item.promoPrice?Math.round((item.regularPrice-item.promoPrice)*100)/100:null}
function richSitelinks(data,t,packages,best,lowest){
  const htmlLanguage=data.htmlLanguage,currency=data.currency,product=clean(data.product),priced=packages.filter(item=>item.promoPrice!==null);
  const bestPackage=packages.filter(item=>item.discountPercent!==null).sort((a,b)=>b.discountPercent-a.discountPercent)[0]||lowest;
  const maxSavingPackage=packages.filter(item=>packageSavings(item)!==null).sort((a,b)=>packageSavings(b)-packageSavings(a))[0]||null;
  const links=[];
  const add=(titles,line1s,line2s)=>{
    const item=sitelink(firstWithin(titles,25),firstWithin(line1s,35),firstWithin(line2s,35));
    if(item.text&&item.line1&&item.line2&&!links.some(existing=>existing.text.toLocaleLowerCase()===item.text.toLocaleLowerCase()))links.push(item);
  };
  if(best&&bestPackage){
    const pct=percent(best,htmlLanguage),promo=money(bestPackage.promoPrice,currency,htmlLanguage),saving=packageSavings(bestPackage),saved=saving!==null?money(saving,currency,htmlLanguage):'';
    add([`${t.save} ${pct}% ${t.today}`,`${pct}% ${t.off}`],[`${bestPackage.label}: ${promo}`,`${t.price}: ${promo} · ${pct}%`],[saved?`${t.save} ${saved} · ${t.order} ${t.now}`:`${t.choose} ${t.bundle} · ${t.order} ${t.now}`]);
  }
  packages.forEach((item,index)=>{
    const promo=money(item.promoPrice,currency,htmlLanguage),pct=item.discountPercent!==null?percent(item.discountPercent,htmlLanguage):'',saving=packageSavings(item),saved=saving!==null?money(saving,currency,htmlLanguage):'';
    add([item.label,`${t.bundle} ${index+1}`],[promo&&pct?`${promo} · ${pct}% ${t.off}`:`${t.price}: ${promo||t.details}`],[saved?`${t.save} ${saved} · ${t.order} ${t.now}`:`${t.choose} ${t.bundle} · ${t.order} ${t.now}`]);
  });
  if(maxSavingPackage){
    const saved=money(packageSavings(maxSavingPackage),currency,htmlLanguage),promo=money(maxSavingPackage.promoPrice,currency,htmlLanguage),pct=percent(maxSavingPackage.discountPercent,htmlLanguage);
    add([`${t.save} ${saved}`,`${t.discount} ${pct}%`],[`${maxSavingPackage.label}: ${promo}`,`${t.price}: ${promo} · ${pct}%`],[`${t.save} ${pct}% · ${t.order} ${t.today}`,`${t.view} · ${t.order} ${t.now}`]);
  }
  if(lowest){
    const promo=money(lowest.promoPrice,currency,htmlLanguage),pct=lowest.discountPercent!==null?percent(lowest.discountPercent,htmlLanguage):'';
    add([`${t.price}: ${promo}`,`${t.offer} ${promo}`],[pct?`${t.save} ${pct}% · ${t.offer}`:`${t.price} · ${t.packages}`],[`${t.choose} ${lowest.label}`,`${t.choose} ${t.bundle} · ${t.order} ${t.now}`]);
  }
  if(data.guaranteeDays)add([t.guarantee,`${data.guaranteeDays} ${t.guarantee}`],[`${data.guaranteeDays} ${t.guarantee} · ${t.offer}`],[`${t.view} · ${t.order} ${t.today}`,`${t.details} · ${t.order} ${t.now}`]);
  if(data.freeShipping==='confirmed')add([t.freeShipping],[`${t.offer} · ${product||t.packages}`,`${t.offer} · ${t.packages}`],[`${t.choose} ${t.bundle} · ${t.order} ${t.today}`]);
  if(data.fastShipping==='confirmed')add([t.fastShipping],[`${t.order} ${product||t.today}`,`${t.order} ${t.today} · ${t.offer}`],[`${t.choose} ${t.bundle} · ${t.view}`,`${t.packages} · ${t.order} ${t.now}`]);
  if(best){
    const pct=percent(best,htmlLanguage);
    add([`${t.order} ${t.now}`,`${t.buy} ${t.today}`],[`${t.choose} ${t.bundle} · ${t.price}`],[`${t.save} ${pct}% · ${t.checkout}`]);
  }
  add([t.details,t.offer],[`${t.price} · ${t.packages} · ${t.discount}`],[`${t.choose} ${t.bundle} · ${t.order} ${t.now}`]);
  add([`${t.buy} ${t.today}`,`${t.shop} ${t.online}`],[`${t.view} · ${t.price}`],[`${t.packages} · ${t.order} ${t.now}`]);
  return links.filter(item=>item.line1.split(/\s+/).length>=2&&item.line2.split(/\s+/).length>=2).slice(0,10);
}

export function generateAssets(data={}){
  const t=dictionaryFor(data.htmlLanguage),packages=normalizePackages(data.packages),discounts=packages.map(item=>item.discountPercent).filter(value=>value!==null);
  const best=discounts.length?Math.max(...discounts):number(data.confirmedDiscountPercent);
  const priced=packages.filter(item=>item.promoPrice!==null).sort((a,b)=>a.promoPrice-b.promoPrice),lowest=priced[0]||null;
  const warnings=[];
  const headlines=within(headlineCandidates(data,t,best,lowest),30).slice(0,40);
  if(headlines.length<30)warnings.push(`Apenas ${headlines.length} títulos únicos couberam no limite de 30 caracteres.`);
  const productCount=headlines.filter(item=>clean(data.product)&&item.toLocaleLowerCase().includes(clean(data.product).toLocaleLowerCase())).length;
  if(clean(data.product)&&productCount<10)warnings.push(`O nome do produto coube em ${productCount} títulos; o restante excederia 30 caracteres.`);
  const descriptions=within(descriptionCandidates(data,t,best,lowest),90).slice(0,15);
  const callouts=within([
    best?`${percent(best,data.htmlLanguage)}% ${t.off}`:'',data.freeShipping==='confirmed'?t.freeShipping:'',data.fastShipping==='confirmed'?t.fastShipping:'',data.guaranteeDays?`${data.guaranteeDays} ${t.guarantee}`:'',t.offer,t.packages,t.details,t.checkout
  ],25).slice(0,10);
  const links=richSitelinks(data,t,packages,best,lowest);
  if(!best)warnings.push('Nenhum percentual de desconto foi confirmado ou calculado.');
  if(links.length<8)warnings.push(`Apenas ${links.length} sitelinks informativos puderam ser gerados com os dados confirmados.`);
  return {headlines,descriptions,callouts,sitelinks:links,warnings,bestDiscountPercent:best,packages};
}

function packageSentence(item,data){
  const t=dictionaryFor(data.htmlLanguage),regularLabels={en:'regular',pt:'original',it:'prezzo normale',es:'precio habitual',fr:'prix normal',de:'regulär',sv:'ordinarie'};
  const parts=[item.label];
  if(item.contents)parts.push(item.contents);
  if(item.promoPrice!==null)parts.push(money(item.promoPrice,data.currency,data.htmlLanguage));
  if(item.regularPrice!==null)parts.push(`${regularLabels[language(data.htmlLanguage)]||regularLabels.en} ${money(item.regularPrice,data.currency,data.htmlLanguage)}`);
  if(item.discountPercent!==null)parts.push(`${percent(item.discountPercent,data.htmlLanguage)}% ${t.discount.toLowerCase()}`);
  return parts.join(': ');
}

export function buildFicha(data={}){
  const t=dictionaryFor(data.htmlLanguage),product=clean(data.product)||'CONFIRMAR',packages=normalizePackages(data.packages);
  const priced=packages.filter(item=>item.promoPrice!==null).sort((a,b)=>a.promoPrice-b.promoPrice),lowest=priced[0]||null;
  const shipping=[];
  if(data.freeShipping==='confirmed')shipping.push(t.shipFree);
  else if(data.freeShipping==='no')shipping.push(t.shipNoFree);
  if(data.fastShipping==='confirmed')shipping.push(t.shipFast);
  shipping.push(data.guaranteeDays?t.guaranteeDays(data.guaranteeDays):t.guaranteeNone);
  const pending=[];
  if(data.freeShipping==='pending')pending.push('Confirm whether free shipping applies.');
  if(data.fastShipping==='pending')pending.push('Confirm whether fast shipping applies.');
  if(!data.guaranteeDays)pending.push('Confirm whether a guarantee applies and its current terms.');
  if(data.urgencyConfirmed!=='confirmed')pending.push('No current promotional urgency has been validated for use.');
  if(data.scarcityConfirmed!=='confirmed')pending.push('No current scarcity claim has been validated for use.');
  const mustContain=unique([product,...packages.map(item=>packageSentence(item,data)),data.freeShipping==='confirmed'?t.freeShipping:'',data.fastShipping==='confirmed'?t.fastShipping:'',data.guaranteeDays?`${data.guaranteeDays}-Day ${t.guarantee}`:'']);
  const mustNotContain=unique([
    'Unverified health or result claims','Results within a specific timeframe','Studies prove the results','Testimonials prove the results',data.freeShipping!=='confirmed'?'Free shipping is included':'',data.fastShipping!=='confirmed'?'Fast shipping is available':'',data.urgencyConfirmed!=='confirmed'?'Unverified urgency claims':'',data.scarcityConfirmed!=='confirmed'?'Unverified scarcity claims':''
  ]);
  const priceText=packages.length?`${t.priceLead}: ${packages.map(item=>packageSentence(item,data)).join('. ')}.`:'CONFIRMAR';
  const lowestAnswer=lowest?`${lowest.label}: ${money(lowest.promoPrice,data.currency,data.htmlLanguage)}${lowest.contents?`. ${lowest.contents}`:''}.`:'CONFIRMAR';
  const optionsAnswer=packages.length?packages.map(item=>item.contents?`${item.label}: ${item.contents}`:item.label).join('. ')+'.':'CONFIRMAR';
  return {
    destination:clean(data.destination)||'CONFIRMAR',
    assetFolder:clean(data.assetFolder)||'assets',
    htmlLanguage:clean(data.htmlLanguage)||'CONFIRMAR',
    countryCode:clean(data.countryCode).toUpperCase()||'CONFIRMAR',
    pageTitle:clean(data.pageTitle)||`${product} | ${t.packages}`,
    affiliateUrl:clean(data.affiliateUrl)||'CONFIRMAR',
    cookieTitle:t.cookieTitle,
    cookieText:t.cookieText,
    acceptLabel:t.accept,
    declineLabel:t.decline,
    closeAriaLabel:t.close,
    detailsLabel:t.view,
    faqTitle:t.faq,
    offerMainTitle:clean(data.offerMainTitle)||`${product} | ${t.packages}`,
    offerIntro:clean(data.offerIntro)||t.intro(product),
    offerOverviewTitle:t.overview,
    offerOverviewText:clean(data.offerOverviewText)||t.overviewText(product),
    priceTitle:t.prices,
    priceText,
    shippingGuaranteeTitle:t.shipping,
    shippingGuaranteeText:shipping.join(' '),
    faqs:[
      {question:t.lowest,answer:lowestAnswer},
      {question:t.shippingQ,answer:shipping.slice(0,-1).join(' ')||'CONFIRMAR'},
      {question:t.guaranteeQ,answer:data.guaranteeDays?`${t.guaranteeDays(data.guaranteeDays)} ${t.review}`:'CONFIRMAR'},
      {question:t.optionsQ,answer:optionsAnswer}
    ],
    mustContain,
    mustNotContain,
    pending,
    assumptions:unique(['Cookie interface labels were generated from the selected visible language.','The neutral offer-details and FAQ labels were generated because no custom interface labels were supplied.'])
  };
}

export function formatSitelinks(items=[]){return items.map(item=>[item.text,item.line1,item.line2].join('\n')).join('\n\n')}
export function fichaJson(data={}){return JSON.stringify(buildFicha(data),null,2)}
