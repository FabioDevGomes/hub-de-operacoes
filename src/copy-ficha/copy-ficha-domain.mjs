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
    return {label:clean(item.label)||`Package ${index+1}`,regularPrice,promoPrice,contents:clean(item.contents),discountPercent:calculateDiscount(regularPrice,promoPrice),confidence:clean(item.confidence),priceMode:clean(item.priceMode),packageQuantity:number(item.packageQuantity),displayedUnitPrice:number(item.displayedUnitPrice),regularDisplayedTotal:number(item.regularDisplayedTotal),promoTotalCalculated:Boolean(item.promoTotalCalculated),discountBadgePercent:number(item.discountBadgePercent),priceNote:clean(item.priceNote)};
  }).filter(item=>item.regularPrice!==null||item.promoPrice!==null||item.contents);
}

const LANGUAGE_SIGNALS={pt:/\b(frete|garantia|compre|economize|pacote|pagamento|finalizar pedido|endereço|estado|cidade)\b/gi,it:/\b(spedizione|garanzia|acquista|risparmia|pacchetto|pagamento|indirizzo|ordine)\b/gi,es:/\b(envío|garantía|compra|ahorra|paquete|pago|dirección|pedido)\b/gi,fr:/\b(livraison|garantie|achetez|économisez|offre|paiement|adresse|commande)\b/gi,de:/\b(versand|garantie|kaufen|sparen|angebot|zahlung|adresse|bestellung)\b/gi,sv:/\b(frakt|garanti|köp|spara|erbjudande|betalning|adress|beställning)\b/gi,en:/\b(shipping|guarantee|buy|save|bundle|package|select quantity|payment|place order|secure checkout|order summary|shipping information|first name|last name|street address|zip code|credit card|complete secure purchase)\b/gi};
const DEFAULT_COUNTRY={pt:'BR',it:'IT',es:'ES',fr:'FR',de:'DE',sv:'SE',en:'US'};
const DEFAULT_LOCALE={BR:'pt-BR',IT:'it-IT',ES:'es-ES',FR:'fr-FR',DE:'de-DE',SE:'sv-SE',US:'en-US',AU:'en-AU',CA:'en-CA',GB:'en-GB'};
const PRODUCT_STOP=/^(save|free|shipping|guarantee|order|buy|checkout|package|packages|bundle|bundles|best|value|basic|starter|premium|offer|official|today|total|regular|price|discount|cookies?|privacy|accept|decline|frete|garantia|compre|oferta|spedizione|garanzia|acquista|offerta|envío|garantía|compra|livraison|achetez|versand|kaufen|frakt|köp)$/i;
const PRODUCT_NOISE_WORDS=new Set('a an and applied american apt apartment asked assured address all been bonus buy card city complete contact country credit customer days deals delaware delivery discount edit enter expiration fast first free from full grab guaranteed house image information large last limited medium order payment phone promo proudly quantity receipt reliable reships return safe salem secure selling small state street summary support today total try united vip worry zipcode zip code quality square feet'.split(/\s+/));
const FOOTER_MARKER=/^(?:proudly american\b|quality assured products\b|our \d{1,3}[- ]day[^\n]*pledge\b|fast and reliable shipping\b|superior customer service\b|©\s*20\d{2}\b|terms\s*(?:&|and)\s*conditions\b|privacy policy\b|contact us\b)/i;
const PACKAGE_LABEL=/^(?:(?:basic|starter|premium|popular|best\s+value|most\s+popular|single|standard|essentials?|base|completo|completa)\s*(?:bundle|package|pack|kit|pacchetto|pacote|paquete)?|(?:\d+|one|two|three|four|five|six|uno|due|tre)\s*[- ]?(?:month|months|month supply|bottle|bottles|unit|units|pack|packs|mese|mesi|mes|meses|mois|monat|monate|månad|månader)(?:\s*(?:bundle|package|pack|supply|kit|pacchetto|pacote|paquete))?)/i;
const PACKAGE_DECORATION=/^(?:image\d*|check|arrow|banner|selling out)$/i;
const PRICE_TOKEN=/(?:US\$|AU\$|CA\$|R\$|\$|€|£|kr)\s?\d{1,6}(?:[.,]\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?\s?(?:USD|AUD|CAD|BRL|EUR|GBP|SEK)\b/gi;

function primaryOfferText(text){
  const lines=String(text||'').split(/\r?\n/),footerIndex=lines.findIndex(line=>FOOTER_MARKER.test(clean(line)));
  return (footerIndex<0?lines:lines.slice(0,footerIndex)).join('\n');
}

function footerProductCandidate(text,body){
  const lines=String(text||'').split(/\r?\n/),footerIndex=lines.findIndex(line=>FOOTER_MARKER.test(clean(line)));
  if(footerIndex<0)return null;
  const copyright=lines.slice(footerIndex).map(clean).find(line=>/©\s*20\d{2}\s*(?:copyright\s*)?/i.test(line));
  const match=copyright?.match(/©\s*20\d{2}\s*(?:copyright\s*)?(.+?)(?:\s*[-–—|]\s*all rights reserved\b|\s+all rights reserved\b|$)/i);
  const candidate=clean(match?.[1]).replace(/[®™]/g,'').trim();
  if(!candidate||candidate.length>48)return null;
  const exactInBody=String(body||'').split(/\r?\n/).map(line=>clean(line).replace(/[®™]/g,'')).some(line=>sameProductWords(line,candidate));
  const generic=new Set(['and','the','shoes','shoe','footwear','official','brand','company','store','shop','products','product']);
  const tokens=(candidate.toLowerCase().match(/[a-z0-9]+/g)||[]).filter(token=>token.length>=4&&!generic.has(token));
  const bodyText=String(body||'');
  const corroboratingToken=tokens.find(token=>{
    const escaped=token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return [...bodyText.matchAll(new RegExp(`\\b${escaped}\\b`,'gi'))].length>=1;
  });
  return exactInBody||corroboratingToken?{value:candidate,corroboratingToken,exactInBody}:null;
}

function sameProductWords(left,right){return clean(left).toLowerCase().replace(/[^a-z0-9]/g,'')===clean(right).toLowerCase().replace(/[^a-z0-9]/g,'')}

function inferLocale(text,url,currency){
  let explicitLanguage='',country='';
  const localePattern=/\b(en|pt|it|es|fr|de|sv)[-_\/]([A-Z]{2})\b/i;
  const locale=String(url||'').match(localePattern)||String(text||'').match(localePattern);
  if(locale){explicitLanguage=locale[1].toLowerCase();country=locale[2].toUpperCase()}
  if(!explicitLanguage){
    const scores=Object.entries(LANGUAGE_SIGNALS).map(([code,pattern])=>[code,(text.match(pattern)||[]).length]).sort((a,b)=>b[1]-a[1]);
    if(scores[0]?.[1]>0)explicitLanguage=scores[0][0];
  }
  const currencyCountry={AUD:'AU',CAD:'CA',GBP:'GB',BRL:'BR',SEK:'SE'}[currency]||'';
  if(!country)country=currencyCountry||(explicitLanguage?DEFAULT_COUNTRY[explicitLanguage]:'');
  const htmlLanguage=country?`${explicitLanguage||DEFAULT_LOCALE[country]?.split('-')[0]||'en'}-${country}`:'';
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
  const offerText=primaryOfferText(text),lines=offerText.split(/\r?\n/).map(clean).filter(Boolean),scores=new Map();
  const ignoredLine=/^(?:banner|image\d*|select quantity|shipping information|payment|place order|secure checkout|shipping|order summary|question:?|arrow|country|state|zip code|checkout|bonus deals|receipt|promo applied|most popular|best deal)$/i;
  const titleCaseLine=/^[A-Z][A-Za-z0-9®™]*(?:[ '-][A-Z][A-Za-z0-9®™]*){0,4}$/;
  for(let index=0;index<lines.length;index++){
    const original=lines[index];
    if(ignoredLine.test(original))continue;
    const normalized=original.replace(/\s*[+|]\s*\d{1,3}(?:[.,]\d+)?\s*%\s*off\b.*$/i,'')
      .replace(/\s*[-–—]\s*\d{1,2}\s*$/,'').replace(/\s*\+\s*\d{1,3}(?:[.,]\d+)?\s*%\s*off\b.*$/i,'')
      .replace(/\s*(?:\$|€|£|US\$|AU\$|CA\$)\s?\d[\d.,]*/gi,'').replace(/[®™]/g,'').replace(/\s+/g,' ').trim();
    if(normalized.length<3||normalized.length>42||PRODUCT_STOP.test(normalized)||!titleCaseLine.test(normalized))continue;
    const words=normalized.split(/\s+/);
    if(words.some(word=>PRODUCT_NOISE_WORDS.has(word.toLowerCase())))continue;
    const internalBrand=words.length===1&&/[a-z][A-Z]/.test(words[0]);
    if(words.length<2&&!internalBrand)continue;
    const key=normalized.toLowerCase(),current=scores.get(key)||{value:normalized,count:0,score:0,first:index};
    current.count++;
    const context=lines.slice(Math.max(0,index-2),Math.min(lines.length,index+4)).join(' ');
    current.score+=/\b(?:qty|quantity|order summary|order now|buy now|shipping|\$\s?\d|\+\s*\d+%\s*off)\b/i.test(context)?2:1;
    scores.set(key,current);
  }
  const ranked=[...scores.values()].sort((a,b)=>b.count-a.count||b.score-a.score||a.first-b.first);
  const repeated=ranked.find(item=>item.count>=2);
  const urlCandidate=urlProductCandidate(url,offerText);
  const footerCandidate=footerProductCandidate(text,offerText);
  if(footerCandidate?.exactInBody)return{...footerCandidate,source:'body_corroborated_footer'};
  if(repeated)return{value:repeated.value,source:'repeated_body'};
  if(urlCandidate&&footerCandidate&&sameProductWords(urlCandidate,footerCandidate.value))return{...footerCandidate,source:'footer_corroborated'};
  if(urlCandidate)return{value:urlCandidate,source:'url'};
  if(footerCandidate)return{...footerCandidate,source:'footer_corroborated'};
  return{value:ranked[0]?.value||'',source:ranked[0]?'single_body_candidate':''};
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

function normalizePastedLine(value){
  return String(value||'').trim()
    .replace(/^\s{0,3}#{1,6}\s*/,'')
    .replace(/^\s*(?:[-*+•]\s+|\d+[.)]\s+)/,'')
    .replace(/^\*\*(.*)\*\*$/,'$1')
    .replace(/^\*(.*)\*$/,'$1')
    .trim();
}

function parsePairQuantityPackages(text){
  const lines=String(text||'').split(/\r?\n/).map(normalizePastedLine).filter(Boolean);
  if(!lines.some(line=>/\bselect\s+quantity(?:\s*bundle)?\b/i.test(line))||!lines.some(line=>/\/\s*ea\b/i.test(line)))return null;
  const starts=[];
  lines.forEach((line,index)=>{const match=line.match(/^(\d{1,2})\s+(pairs?)$/i);if(match)starts.push({index,label:line,quantity:Number(match[1])})});
  if(starts.length<2)return null;
  return starts.map((start,index)=>{
    const nextCard=starts[index+1]?.index??lines.length,sectionBreak=lines.findIndex((line,lineIndex)=>lineIndex>start.index&&/^(?:select your color and size|select color and size|secure ssl encryption|guaranteed safe checkout|a complete guide to |yours free|valued at )/i.test(line));
    const end=Math.min(nextCard,sectionBreak<0?lines.length:sectionBreak),block=lines.slice(start.index,end),prices=priceEntries(block);
    const unitPrices=prices.filter(item=>/\/\s*ea\b/i.test(item.line)),regularPrices=prices.filter(item=>!unitPrices.includes(item));
    const displayedUnitPrice=unitPrices.length===1?unitPrices[0].value:null,regularDisplayedTotal=regularPrices.length===1?regularPrices[0].value:null;
    const promoPrice=displayedUnitPrice!==null?Math.round((displayedUnitPrice*start.quantity+Number.EPSILON)*100)/100:null;
    const discountBadgeMatch=block.map(line=>line.match(/\bsave\s+(\d{1,2}(?:[.,]\d+)?)\s*%/i)).find(Boolean);
    const discountBadgePercent=discountBadgeMatch?number(discountBadgeMatch[1]):null,discount=calculateDiscount(regularDisplayedTotal,promoPrice);
    const matchesBadge=discount!==null&&discountBadgePercent!==null&&Math.abs(discount-discountBadgePercent)<=0.6;
    const complete=displayedUnitPrice!==null&&regularDisplayedTotal!==null&&promoPrice!==null&&regularDisplayedTotal>promoPrice;
    const currencyPrefix=unitPrices[0]?.raw.match(/^(?:US\$|AU\$|CA\$|R\$|\$|€|£|kr)/i)?.[0]||'';
    const calculatedTotalText=promoPrice!==null?`${currencyPrefix}${promoPrice.toFixed(2)}`:'não identificado';
    const priceNote=`Quantidade: ${start.quantity} ${start.quantity===1?'par':'pares'} · preço por unidade exibido: ${unitPrices[0]?.line||unitPrices[0]?.raw||'não identificado'} · total original exibido: ${regularPrices[0]?.raw||'não identificado'} · total promocional calculado: ${calculatedTotalText}${discountBadgePercent!==null?` · desconto anunciado: ${percent(discountBadgePercent)}%`:''}`;
    return {label:start.label,regularPrice:regularDisplayedTotal,promoPrice,contents:'',confidence:complete&&matchesBadge?'high':'review',priceMode:'quantity_bundle',packageQuantity:start.quantity,displayedUnitPrice,regularDisplayedTotal,promoTotalCalculated:promoPrice!==null,discountBadgePercent,priceNote};
  }).slice(0,8);
}

function parsePackages(text,productCandidate=''){
  const lines=String(text||'').split(/\r?\n/).map(clean).filter(Boolean),starts=[];
  const pairPackages=parsePairQuantityPackages(text);
  if(pairPackages)return pairPackages;
  lines.forEach((line,index)=>{const match=line.match(PACKAGE_LABEL);if(match)starts.push({index,label:clean(match[0])})});
  if(!starts.length&&lines.length===1){
    const match=lines[0].match(/\b(?:basic|starter|premium|best value|most popular)\s+(?:bundle|package|pack|kit)\b/i);
    if(match)starts.push({index:0,label:clean(match[0])});
  }
  if(!starts.length&&clean(productCandidate)){
    const escaped=clean(productCandidate).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const productLabel=new RegExp(`^${escaped}(?:\\s*[-–—]\\s*\\d{1,2})?$`,'i'),candidates=[];
    lines.forEach((line,index)=>{if(productLabel.test(line))candidates.push({index,label:line})});
    candidates.forEach((start,position)=>{
      const end=candidates[position+1]?.index??Math.min(lines.length,start.index+14);
      const priceCount=unique(priceEntries(lines.slice(start.index,end)).map(item=>String(item.value))).length;
      if(priceCount>=2)starts.push(start);
    });
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
    const contents=block.slice(1).find(line=>!new RegExp(PRICE_TOKEN.source,'i').test(line)&&!PACKAGE_DECORATION.test(line)&&!/\b(add to cart|order now|buy now|free shipping|guarantee|guaranteed|save|savings?|discount|economize|risparmia|\d{1,3}(?:[.,]\d+)?\s*%\s*off|try one today|lowest price guaranteed)\b/i.test(line)&&line.length<=110)||'';
    const entry={label:start.label,regularPrice,promoPrice,contents,confidence};
    if(!packages.some(item=>item.label.toLowerCase()===entry.label.toLowerCase()))packages.push(entry);
  });
  return packages.slice(0,8);
}

export function parseOfferText(raw='',url=''){
  const text=String(raw||''),flat=clean(text),offerText=primaryOfferText(text),offerFlat=clean(offerText);
  const percentages=[...flat.matchAll(/\b(\d{1,2}(?:[.,]\d+)?)\s*%/g)].map(match=>number(match[1])).filter(value=>value>0&&value<100);
  const amounts=[...flat.matchAll(/(?:US\$|AU\$|CA\$|R\$|\$|€|£|kr)\s?\d{1,5}(?:[.,]\d{1,2})?/gi)].map(match=>clean(match[0]));
  const guarantee=[...flat.matchAll(/\b(\d{1,3})\s*[- ]?\s*(?:day|days|dias|giorni|jours|tage|dagar)\b[^.]{0,45}(?:guarantee|garantia|garanzia|garantie|garanti)/gi)].map(match=>Number(match[1]));
  const currency=/AU\$/i.test(offerFlat)?'AUD':/CA\$/i.test(offerFlat)?'CAD':/R\$/i.test(offerFlat)?'BRL':/€/i.test(offerFlat)?'EUR':/£/i.test(offerFlat)?'GBP':/\bkr\b/i.test(offerFlat)?'SEK':/\$/.test(offerFlat)?'USD':'';
  const locale=inferLocale(offerText,url,currency),productDetection=textProductCandidate(text,url),productCandidate=productDetection.value,packages=parsePackages(offerText,productCandidate),calculatedDiscounts=packages.map(item=>calculateDiscount(item.regularPrice,item.promoPrice)).filter(value=>value!==null);
  const highestPercent=[...percentages,...calculatedDiscounts].length?Math.max(...percentages,...calculatedDiscounts):null;
  return {
    percentages:unique(percentages.map(percent)),
    amounts:unique(amounts).slice(0,30),
    highestPercent,
    currency,
    countryCode:locale.countryCode,
    htmlLanguage:locale.htmlLanguage,
    productCandidate,
    productCandidateSource:productDetection.source,
    productCandidateNeedsReview:productDetection.source==='footer_corroborated'||productDetection.source==='body_corroborated_footer',
    productCandidateEvidence:productDetection.exactInBody?`A frase “${productCandidate}” aparece como título no conteúdo principal e corresponde ao nome do rodapé.`:productDetection.corroboratingToken?`O termo distintivo “${productDetection.corroboratingToken}” também aparece no conteúdo principal.`:'',
    pageTitleCandidate:productCandidate?`${productCandidate} | ${dictionaryFor(locale.htmlLanguage||'en-US').packages}`:'',
    packages,
    guaranteeDays:guarantee.length?guarantee[0]:null,
    freeShippingCandidate:/\b(free shipping|frete gr[aá]tis|spedizione gratuita|env[ií]o gratis|livraison gratuite|kostenloser versand|fri frakt)\b/i.test(flat),
    fastShippingCandidate:/\b(fast shipping|fast delivery(?:\s+guaranteed)?|quick delivery|express shipping|envio r[aá]pido|spedizione rapida|env[ií]o r[aá]pido|exp[eé]dition rapide|schneller versand|snabb leverans)\b/i.test(flat),
    urgencyCandidate:/\b(today only|limited time|ends today|oggi|aujourd'hui|nur heute|idag|por tempo limitado|tempo limitato)\b/i.test(flat),
    scarcityCandidate:/\b(limited stock|while supplies last|few left|estoque limitado|scorte limitate|stock limit[eé]|begrenzter vorrat|begränsat lager)\b/i.test(flat)
  };
}

function money(value,currency='USD',htmlLanguage='en-US'){
  const numeric=number(value);
  if(numeric===null)return'';
  try{return new Intl.NumberFormat(dictionaryFor(htmlLanguage).locale,{style:'currency',currency:currency||'USD',maximumFractionDigits:2}).format(numeric)}catch{return`${currency||''} ${numeric.toFixed(2)}`.trim()}
}
function packageAdPrice(item,currency,htmlLanguage){
  if(item?.priceMode==='quantity_bundle'&&item.displayedUnitPrice!==null)return`${money(item.displayedUnitPrice,currency,htmlLanguage)}/ea`;
  return item?.promoPrice!==null?money(item.promoPrice,currency,htmlLanguage):'';
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

const DESCRIPTION_VARIANTS={
  en:(pct,p)=>[
    `Save up to ${pct} on ${p}. Choose your package and place your order online.`,
    `Get up to ${pct} off ${p}. Compare the available packages and order online now.`,
    `Enjoy up to ${pct} savings on ${p}. Select your preferred bundle and shop online.`,
    `Up to ${pct} off ${p}. Review the package options and complete your order online.`
  ],
  pt:(pct,p)=>[
    `Economize até ${pct} em ${p}. Escolha seu pacote e faça seu pedido online.`,
    `Até ${pct} de desconto em ${p}. Compare os pacotes disponíveis e compre online agora.`,
    `Aproveite até ${pct} de desconto em ${p}. Selecione seu pacote e finalize o pedido online.`,
    `Até ${pct} de economia em ${p}. Confira as opções de pacotes e compre online agora.`
  ],
  it:(pct,p)=>[
    `Risparmia fino al ${pct} su ${p}. Scegli il pacchetto e ordina online.`,
    `Fino al ${pct} di sconto su ${p}. Confronta i pacchetti e acquista online ora.`,
    `Ottieni fino al ${pct} di sconto su ${p}. Seleziona il pacchetto e completa l'ordine.`,
    `Fino al ${pct} di risparmio su ${p}. Scegli l'opzione e fai il tuo ordine online.`
  ],
  es:(pct,p)=>[
    `Ahorra hasta un ${pct} en ${p}. Elige tu paquete y haz tu pedido online.`,
    `Hasta un ${pct} de descuento en ${p}. Compara los paquetes y compra online ahora.`,
    `Consigue hasta un ${pct} de ahorro en ${p}. Elige una opción y completa tu pedido.`,
    `Aprovecha hasta un ${pct} de descuento en ${p}. Elige tu paquete y compra online.`
  ],
  fr:(pct,p)=>[
    `Économisez jusqu'à ${pct} sur ${p}. Choisissez un pack et commandez en ligne.`,
    `Jusqu'à ${pct} de réduction sur ${p}. Comparez les packs et achetez en ligne.`,
    `Profitez d'économies jusqu'à ${pct} sur ${p}. Choisissez votre pack et commandez.`,
    `Obtenez jusqu'à ${pct} de remise sur ${p}. Consultez les packs et passez commande.`
  ],
  de:(pct,p)=>[
    `Sparen Sie bis zu ${pct} bei ${p}. Wählen Sie Ihr Paket und bestellen Sie online.`,
    `Bis zu ${pct} Rabatt bei ${p}. Vergleichen Sie die Pakete und bestellen Sie online.`,
    `Sichern Sie sich bis zu ${pct} Ersparnis bei ${p}. Paket wählen und online bestellen.`,
    `Bis zu ${pct} sparen bei ${p}. Wählen Sie Ihr Paket und schließen Sie die Bestellung ab.`
  ],
  sv:(pct,p)=>[
    `Spara upp till ${pct} på ${p}. Välj ditt paket och beställ online.`,
    `Upp till ${pct} rabatt på ${p}. Jämför paketen och beställ online nu.`,
    `Få upp till ${pct} rabatt på ${p}. Välj ett paket och lägg din beställning online.`,
    `Spara upp till ${pct} på ${p}. Se paketen, välj ditt och gör din beställning online.`
  ]
};
const OFFER_REFERENCE={en:'this offer',pt:'uma oferta',it:'questa offerta',es:'esta oferta',fr:'cette offre',de:'diesem Angebot',sv:'detta erbjudande'};
const SAVING_VARIANT={
  en:(saved,pct,label)=>`Save ${saved} on ${label} with ${pct} off. Select this package and order online.`,
  pt:(saved,pct,label)=>`Economize ${saved} no ${label} com ${pct} de desconto. Escolha este pacote e peça online.`,
  it:(saved,pct,label)=>`Risparmia ${saved} su ${label} con ${pct} di sconto. Scegli il pacchetto e ordina online.`,
  es:(saved,pct,label)=>`Ahorra ${saved} en ${label} con ${pct} de descuento. Elige este paquete y compra online.`,
  fr:(saved,pct,label)=>`Économisez ${saved} sur ${label} avec ${pct} de remise. Choisissez ce pack et commandez en ligne.`,
  de:(saved,pct,label)=>`Sparen Sie ${saved} bei ${label} mit ${pct} Rabatt. Wählen Sie das Paket und bestellen Sie online.`,
  sv:(saved,pct,label)=>`Spara ${saved} på ${label} med ${pct} rabatt. Välj paketet och beställ online.`
};

function descriptionPercent(value,htmlLanguage){
  const lang=language(htmlLanguage),numeric=String(percent(value,htmlLanguage)).replace(/\s*%+\s*$/,'').trim();
  return ['fr','de','sv'].includes(lang)?`${numeric} %`:`${numeric}%`;
}

function descriptionCandidates(data,best,packages){
  if(!(best>0))return[];
  const lang=language(data.htmlLanguage),pct=descriptionPercent(best,data.htmlLanguage);
  const templates=DESCRIPTION_VARIANTS[lang]||DESCRIPTION_VARIANTS.en;
  const values=[...templates(pct,clean(data.product)||OFFER_REFERENCE[lang]||OFFER_REFERENCE.en)];
  const bestPackage=packages.filter(item=>item.discountPercent!==null).sort((a,b)=>b.discountPercent-a.discountPercent)[0];
  const saved=bestPackage?packageSavings(bestPackage):null;
  const savingCopy=SAVING_VARIANT[lang]||SAVING_VARIANT.en;
  if(saved!==null&&bestPackage?.label){
    values.push(savingCopy(money(saved,data.currency,data.htmlLanguage),pct,bestPackage.label));
  }
  if(clean(data.product))values.push(...templates(pct,OFFER_REFERENCE[lang]||OFFER_REFERENCE.en));
  return values;
}

function sitelink(text,line1,line2){return{ text:clean(text),line1:clean(line1),line2:clean(line2)}}
function firstWithin(values,limit){return unique(values).find(value=>[...value].length<=limit)||''}
function packageSavings(item){if(item.priceMode==='quantity_bundle')return null;return item.regularPrice!==null&&item.promoPrice!==null&&item.regularPrice>item.promoPrice?Math.round((item.regularPrice-item.promoPrice)*100)/100:null}
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
    const pct=percent(best,htmlLanguage),promo=packageAdPrice(bestPackage,currency,htmlLanguage),saving=packageSavings(bestPackage),saved=saving!==null?money(saving,currency,htmlLanguage):'';
    add([`${t.save} ${pct}% ${t.today}`,`${pct}% ${t.off}`],[`${bestPackage.label}: ${promo}`,`${t.price}: ${promo} · ${pct}%`],[saved?`${t.save} ${saved} · ${t.order} ${t.now}`:`${t.choose} ${t.bundle} · ${t.order} ${t.now}`]);
  }
  packages.forEach((item,index)=>{
    const promo=packageAdPrice(item,currency,htmlLanguage),pct=item.discountPercent!==null?percent(item.discountPercent,htmlLanguage):'',saving=packageSavings(item),saved=saving!==null?money(saving,currency,htmlLanguage):'';
    add([item.label,`${t.bundle} ${index+1}`],[promo&&pct?`${promo} · ${pct}% ${t.off}`:`${t.price}: ${promo||t.details}`],[saved?`${t.save} ${saved} · ${t.order} ${t.now}`:`${t.choose} ${t.bundle} · ${t.order} ${t.now}`]);
  });
  if(maxSavingPackage){
    const saved=money(packageSavings(maxSavingPackage),currency,htmlLanguage),promo=packageAdPrice(maxSavingPackage,currency,htmlLanguage),pct=percent(maxSavingPackage.discountPercent,htmlLanguage);
    add([`${t.save} ${saved}`,`${t.discount} ${pct}%`],[`${maxSavingPackage.label}: ${promo}`,`${t.price}: ${promo} · ${pct}%`],[`${t.save} ${pct}% · ${t.order} ${t.today}`,`${t.view} · ${t.order} ${t.now}`]);
  }
  if(lowest){
    const promo=packageAdPrice(lowest,currency,htmlLanguage),pct=lowest.discountPercent!==null?percent(lowest.discountPercent,htmlLanguage):'';
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
  const descriptions=within(descriptionCandidates(data,best,packages),90).filter(item=>[...item].length>=70).slice(0,15);
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
  if(item.priceMode==='quantity_bundle'){
    if(item.promoPrice!==null)parts.push(`calculated promotional total ${money(item.promoPrice,data.currency,data.htmlLanguage)}`);
    if(item.regularPrice!==null)parts.push(`displayed original total ${money(item.regularPrice,data.currency,data.htmlLanguage)}`);
    if(item.displayedUnitPrice!==null)parts.push(`displayed unit price ${money(item.displayedUnitPrice,data.currency,data.htmlLanguage)}/ea`);
    if(item.packageQuantity!==null)parts.push(`quantity ${item.packageQuantity} ${item.packageQuantity===1?'pair':'pairs'}`);
  }else{
    if(item.promoPrice!==null)parts.push(money(item.promoPrice,data.currency,data.htmlLanguage));
    if(item.regularPrice!==null)parts.push(`${regularLabels[language(data.htmlLanguage)]||regularLabels.en} ${money(item.regularPrice,data.currency,data.htmlLanguage)}`);
  }
  if(item.discountPercent!==null)parts.push(`${percent(item.discountPercent,data.htmlLanguage)}% ${t.discount.toLowerCase()}`);
  if(item.discountBadgePercent!==null)parts.push(`displayed discount badge ${percent(item.discountBadgePercent,data.htmlLanguage)}%`);
  return parts.join(': ');
}

export function buildFicha(data={}){
  const t=dictionaryFor(data.htmlLanguage),product=clean(data.product)||'CONFIRMAR',packages=normalizePackages(data.packages);
  const guaranteeStatus=data.guaranteeStatus||(data.guaranteeDays?'confirmed':'pending');
  const priced=packages.filter(item=>item.promoPrice!==null).sort((a,b)=>a.promoPrice-b.promoPrice),lowest=priced[0]||null;
  const shipping=[];
  if(data.freeShipping==='confirmed')shipping.push(t.shipFree);
  else if(data.freeShipping==='no')shipping.push(t.shipNoFree);
  if(data.fastShipping==='confirmed')shipping.push(t.shipFast);
  shipping.push(data.guaranteeDays?t.guaranteeDays(data.guaranteeDays):t.guaranteeNone);
  const pending=[];
  if(!['confirmed','no'].includes(data.freeShipping))pending.push('Confirm whether free shipping applies.');
  if(!['confirmed','no'].includes(data.fastShipping))pending.push('Confirm whether fast shipping applies.');
  if(guaranteeStatus==='pending'||(guaranteeStatus==='confirmed'&&!data.guaranteeDays))pending.push('Confirm whether a guarantee applies and its current terms.');
  if(!['confirmed','no'].includes(data.urgencyConfirmed||'pending'))pending.push('No current promotional urgency has been validated for use.');
  if(!['confirmed','no'].includes(data.scarcityConfirmed||'pending'))pending.push('No current scarcity claim has been validated for use.');
  const mustContain=unique([product,...packages.map(item=>packageSentence(item,data)),data.freeShipping==='confirmed'?t.freeShipping:'',data.fastShipping==='confirmed'?t.fastShipping:'',data.guaranteeDays?`${data.guaranteeDays}-Day ${t.guarantee}`:'']);
  const mustNotContain=unique([
    'Unverified health or result claims','Results within a specific timeframe','Studies prove the results','Testimonials prove the results',data.freeShipping!=='confirmed'?'Free shipping is included':'',data.fastShipping!=='confirmed'?'Fast shipping is available':'',data.urgencyConfirmed!=='confirmed'?'Unverified urgency claims':'',data.scarcityConfirmed!=='confirmed'?'Unverified scarcity claims':''
  ]);
  const priceText=packages.length?`${t.priceLead}: ${packages.map(item=>packageSentence(item,data)).join('. ')}.`:'CONFIRMAR';
  const lowestAnswer=lowest?`${lowest.label}: ${money(lowest.promoPrice,data.currency,data.htmlLanguage)}${lowest.priceMode==='quantity_bundle'?` total calculated from ${money(lowest.displayedUnitPrice,data.currency,data.htmlLanguage)}/ea × ${lowest.packageQuantity}.`:''}${lowest.contents?`. ${lowest.contents}`:''}.`:'CONFIRMAR';
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
      {question:t.guaranteeQ,answer:data.guaranteeDays?`${t.guaranteeDays(data.guaranteeDays)} ${t.review}`:guaranteeStatus==='no'?t.guaranteeNone:'CONFIRMAR'},
      {question:t.optionsQ,answer:optionsAnswer}
    ],
    mustContain,
    mustNotContain,
    pending,
    assumptions:unique(['Cookie interface labels were generated from the selected visible language.','The neutral offer-details and FAQ labels were generated because no custom interface labels were supplied.'])
  };
}

export function generationBlockers(data={}){
  const blockers=[];
  if(!['confirmed','no'].includes(data.freeShipping))blockers.push('Frete grátis');
  if(!['confirmed','no'].includes(data.fastShipping))blockers.push('Envio rápido');
  const guaranteeStatus=data.guaranteeStatus||(data.guaranteeDays?'confirmed':'pending');
  if(guaranteeStatus==='pending')blockers.push('Garantia: confirme o prazo ou marque que não há garantia exibida');
  else if(guaranteeStatus==='confirmed'&&!data.guaranteeDays)blockers.push('Garantia: informe o prazo confirmado');
  else if(guaranteeStatus==='no'&&data.guaranteeDays)blockers.push('Garantia: há um prazo preenchido, mas está marcada como não exibida');
  else if(!['confirmed','no'].includes(guaranteeStatus))blockers.push('Garantia: selecione um estado de confirmação válido');
  if(!['confirmed','no'].includes(data.urgencyConfirmed||'pending'))blockers.push('Urgência atual');
  if(!['confirmed','no'].includes(data.scarcityConfirmed||'pending'))blockers.push('Escassez atual');
  if(!clean(data.affiliateUrl)||clean(data.affiliateUrl).toUpperCase()==='CONFIRMAR')blockers.push('URL de afiliação');
  if(!clean(data.destination)||clean(data.destination).toUpperCase()==='CONFIRMAR')blockers.push('Diretório da Pre-Sell');
  if(!clean(data.currency))blockers.push('Moeda');
  if(!normalizePackages(data.packages).some(item=>item.promoPrice!==null))blockers.push('Ao menos um pacote com preço promocional');
  return unique(blockers);
}

export function generationBlockerFields(data={}){
  const fields=new Set(),blockers=generationBlockers(data);
  if(!clean(data.product))fields.add('product');
  if(!clean(data.countryCode))fields.add('countryCode');
  if(!clean(data.htmlLanguage))fields.add('htmlLanguage');
  if(blockers.includes('Frete grátis'))fields.add('freeShipping');
  if(blockers.includes('Envio rápido'))fields.add('fastShipping');
  const guaranteeBlockers=blockers.filter(item=>item.startsWith('Garantia:'));
  if(guaranteeBlockers.some(item=>/confirme o prazo|selecione um estado/i.test(item)))fields.add('guaranteeStatus');
  if(guaranteeBlockers.some(item=>/informe o prazo|há um prazo preenchido/i.test(item)))fields.add('guaranteeDays');
  if(blockers.includes('Urgência atual'))fields.add('urgencyConfirmed');
  if(blockers.includes('Escassez atual'))fields.add('scarcityConfirmed');
  const affiliateUrl=clean(data.affiliateUrl);
  if(!affiliateUrl||affiliateUrl.toUpperCase()==='CONFIRMAR'||!/^https?:\/\//i.test(affiliateUrl))fields.add('affiliateUrl');
  if(blockers.includes('Diretório da Pre-Sell'))fields.add('destination');
  if(blockers.includes('Moeda'))fields.add('currency');
  if(blockers.includes('Ao menos um pacote com preço promocional'))fields.add('packages');
  return [...fields];
}

export function formatSitelinks(items=[]){return items.map(item=>[item.text,item.line1,item.line2].join('\n')).join('\n\n')}
export function fichaJson(data={}){return JSON.stringify(buildFicha(data),null,2)}
