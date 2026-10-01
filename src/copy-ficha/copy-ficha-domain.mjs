const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const missingConfirmation=value=>!clean(value)||clean(value).toUpperCase()==='CONFIRMAR';
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

const PACKAGE_FREE_COPY={
  en:{title:p=>`${p} Offer`,intro:p=>`Review the current ${p} offer, pricing, and terms on the seller's page before ordering.`,overviewTitle:'Offer details',overviewText:p=>`Visit the seller's page for current ${p} offer details and available options.`,priceTitle:'Pricing information',priceText:'For current prices, savings, and offer terms, review the seller’s page before ordering.',lowestQuestion:'What price is currently offered?',lowestAnswer:'Check the seller’s page for up-to-date pricing before ordering.',optionsQuestion:'What options are available?',optionsAnswer:'Review the seller’s page for the options and terms currently available.',shippingReview:'Review the seller’s page for current shipping terms.'},
  pt:{title:p=>`Oferta de ${p}`,intro:p=>`Confira a oferta atual de ${p}, os preços e as condições na página do vendedor antes de fazer o pedido.`,overviewTitle:'Detalhes da oferta',overviewText:p=>`Consulte a página do vendedor para ver os detalhes atuais da oferta de ${p} e as opções disponíveis.`,priceTitle:'Informações de preço',priceText:'Para consultar preços, economias e condições atuais, confira a página do vendedor antes de fazer o pedido.',lowestQuestion:'Qual preço está sendo oferecido?',lowestAnswer:'Confira a página do vendedor para consultar os preços atualizados antes de fazer o pedido.',optionsQuestion:'Quais opções estão disponíveis?',optionsAnswer:'Consulte a página do vendedor para ver as opções e condições atuais.',shippingReview:'Consulte a página do vendedor para verificar as condições atuais de envio.'},
  it:{title:p=>`Offerta ${p}`,intro:p=>`Prima di ordinare, consulta la pagina del venditore per l’offerta attuale di ${p}, i prezzi e le condizioni.`,overviewTitle:'Dettagli dell’offerta',overviewText:p=>`Consulta la pagina del venditore per i dettagli aggiornati dell’offerta ${p} e le opzioni disponibili.`,priceTitle:'Informazioni sui prezzi',priceText:'Per prezzi, risparmi e condizioni aggiornati, consulta la pagina del venditore prima di ordinare.',lowestQuestion:'Quale prezzo è attualmente offerto?',lowestAnswer:'Consulta la pagina del venditore per i prezzi aggiornati prima di ordinare.',optionsQuestion:'Quali opzioni sono disponibili?',optionsAnswer:'Consulta la pagina del venditore per le opzioni e le condizioni attualmente disponibili.',shippingReview:'Consulta la pagina del venditore per le condizioni di spedizione aggiornate.'},
  es:{title:p=>`Oferta de ${p}`,intro:p=>`Antes de realizar el pedido, consulta la página del vendedor para ver la oferta actual de ${p}, los precios y las condiciones.`,overviewTitle:'Detalles de la oferta',overviewText:p=>`Consulta la página del vendedor para ver los detalles actuales de la oferta de ${p} y las opciones disponibles.`,priceTitle:'Información de precios',priceText:'Para conocer los precios, ahorros y condiciones actuales, consulta la página del vendedor antes de realizar el pedido.',lowestQuestion:'¿Qué precio se ofrece actualmente?',lowestAnswer:'Consulta la página del vendedor para ver los precios actualizados antes de realizar el pedido.',optionsQuestion:'¿Qué opciones están disponibles?',optionsAnswer:'Consulta la página del vendedor para conocer las opciones y condiciones actuales.',shippingReview:'Consulta la página del vendedor para conocer las condiciones de envío actuales.'},
  fr:{title:p=>`Offre ${p}`,intro:p=>`Avant de commander, consultez la page du vendeur pour connaître l’offre actuelle de ${p}, les prix et les conditions.`,overviewTitle:'Détails de l’offre',overviewText:p=>`Consultez la page du vendeur pour connaître les détails actuels de l’offre ${p} et les options disponibles.`,priceTitle:'Informations sur les prix',priceText:'Pour connaître les prix, les économies et les conditions actuels, consultez la page du vendeur avant de commander.',lowestQuestion:'Quel prix est actuellement proposé ?',lowestAnswer:'Consultez la page du vendeur pour obtenir les prix à jour avant de commander.',optionsQuestion:'Quelles options sont disponibles ?',optionsAnswer:'Consultez la page du vendeur pour connaître les options et conditions actuelles.',shippingReview:'Consultez la page du vendeur pour connaître les conditions de livraison actuelles.'},
  de:{title:p=>`${p}-Angebot`,intro:p=>`Prüfen Sie vor der Bestellung das aktuelle ${p}-Angebot, die Preise und die Bedingungen auf der Verkäuferseite.`,overviewTitle:'Angebotsdetails',overviewText:p=>`Auf der Verkäuferseite finden Sie aktuelle Details zum ${p}-Angebot und zu verfügbaren Optionen.`,priceTitle:'Preisinformationen',priceText:'Aktuelle Preise, Ersparnisse und Angebotsbedingungen finden Sie vor der Bestellung auf der Verkäuferseite.',lowestQuestion:'Welcher Preis wird aktuell angeboten?',lowestAnswer:'Prüfen Sie vor der Bestellung die aktuellen Preise auf der Verkäuferseite.',optionsQuestion:'Welche Optionen sind verfügbar?',optionsAnswer:'Prüfen Sie die Verkäuferseite auf aktuell verfügbare Optionen und Bedingungen.',shippingReview:'Prüfen Sie die Verkäuferseite auf aktuelle Versandbedingungen.'},
  sv:{title:p=>`${p}-erbjudande`,intro:p=>`Granska det aktuella erbjudandet för ${p}, priser och villkor på säljarens sida innan du beställer.`,overviewTitle:'Erbjudandedetaljer',overviewText:p=>`Besök säljarens sida för aktuella detaljer om ${p}-erbjudandet och tillgängliga alternativ.`,priceTitle:'Prisuppgifter',priceText:'Granska säljarens sida före beställning för aktuella priser, besparingar och erbjudandevillkor.',lowestQuestion:'Vilket pris erbjuds just nu?',lowestAnswer:'Kontrollera säljarens sida för aktuella priser innan du beställer.',optionsQuestion:'Vilka alternativ finns?',optionsAnswer:'Granska säljarens sida för aktuella alternativ och villkor.',shippingReview:'Granska säljarens sida för aktuella leveransvillkor.'}
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
    const priceMode=clean(item.priceMode),quantityUnit=clean(item.quantityUnit)||(priceMode==='quantity_bundle'?'pair':''),discountBadgePercent=number(item.discountBadgePercent),discountBadgeBasePercent=number(item.discountBadgeBasePercent),discountBadgeStacked=Boolean(item.discountBadgeStacked),calculatedDiscount=calculateDiscount(regularPrice,promoPrice);
    const badgeMatchesCalculation=calculatedDiscount!==null&&discountBadgePercent!==null&&Math.abs(calculatedDiscount-discountBadgePercent)<=0.6;
    const discountPercent=priceMode==='quantity_bundle'
      ?(badgeMatchesCalculation?discountBadgePercent:null)
      :calculatedDiscount;
    return {label:clean(item.label)||`Package ${index+1}`,regularPrice,promoPrice,contents:clean(item.contents),discountPercent,confidence:clean(item.confidence),priceMode,packageQuantity:number(item.packageQuantity),quantityUnit,packageDescriptor:clean(item.packageDescriptor),displayedUnitPrice:number(item.displayedUnitPrice),regularDisplayedTotal:number(item.regularDisplayedTotal),promoTotalCalculated:Boolean(item.promoTotalCalculated),discountBadgePercent,discountBadgeBasePercent,discountBadgeStacked,priceNote:clean(item.priceNote)};
  }).filter(item=>item.regularPrice!==null||item.promoPrice!==null||item.contents);
}

export function generationBlockerPackageIndexes(data={}){
  return (Array.isArray(data.packages)?data.packages:[]).flatMap((item,index)=>{
    const normalized=normalizePackages([item])[0];
    return normalized?.priceMode==='quantity_bundle'&&normalized.discountBadgePercent!==null&&normalized.discountPercent===null?[index]:[];
  });
}

const LANGUAGE_SIGNALS={pt:/\b(frete|garantia|compre|economize|pacote|pagamento|finalizar pedido|endereço|estado|cidade)\b/gi,it:/\b(spedizione|garanzia|acquista|risparmia|pacchetto|pagamento|indirizzo|ordine)\b/gi,es:/\b(envío|garantía|compra|ahorra|paquete|pago|dirección|pedido)\b/gi,fr:/\b(livraison|garantie|achetez|économisez|offre|paiement|adresse|commande)\b/gi,de:/\b(versand|garantie|kaufen|sparen|angebot|zahlung|adresse|bestellung)\b/gi,sv:/\b(frakt|garanti|köp|spara|erbjudande|betalning|adress|beställning)\b/gi,en:/\b(shipping|guarantee|buy|save|bundle|package|select quantity|payment|place order|secure checkout|order summary|shipping information|first name|last name|street address|zip code|credit card|complete secure purchase)\b/gi};
const DEFAULT_COUNTRY={pt:'BR',it:'IT',es:'ES',fr:'FR',de:'DE',sv:'SE',en:'US'};
const DEFAULT_LOCALE={BR:'pt-BR',IT:'it-IT',ES:'es-ES',FR:'fr-FR',DE:'de-DE',SE:'sv-SE',US:'en-US',AU:'en-AU',CA:'en-CA',GB:'en-GB'};
const PRODUCT_STOP=/^(save|free|shipping|guarantee|order|buy|checkout|package|packages|bundle|bundles|best|value|basic|starter|premium|offer|official|today|total|regular|price|discount|cookies?|privacy|accept|decline|frete|garantia|compre|oferta|spedizione|garanzia|acquista|offerta|envío|garantía|compra|livraison|achetez|versand|kaufen|frakt|köp)$/i;
const PRODUCT_NOISE_WORDS=new Set('a an and applied american apt apartment asked assured address all been bonus buy card city complete contact country credit customer days deals delaware delivery discount edit enter expiration fast first free from full grab guaranteed house image information large last limited medium order payment phone promo proudly quantity receipt reliable reships return safe salem secure selling small state street summary support today total try united vip worry zipcode zip code quality square feet verifizierte bewertung kunden'.split(/\s+/));
const FOOTER_MARKER=/^(?:proudly american\b|quality assured products\b|our \d{1,3}[- ]day[^\n]*pledge\b|fast and reliable shipping\b|superior customer service\b|©\s*20\d{2}\b|terms\s*(?:&|and)\s*conditions\b|privacy policy\b|contact us\b|alle rechte vorbehalten\b)/i;
const PACKAGE_LABEL=/^(?:(?:basic|starter|premium|popular|best\s+value|most\s+popular|single|standard|essentials?|base|completo|completa)\s*(?:bundle|package|pack|kit|pacchetto|pacote|paquete)?|(?:\d+|one|two|three|four|five|six|uno|due|tre)\s*[- ]?(?:month|months|month supply|bottle|bottles|unit|units|pack|packs|mese|mesi|mes|meses|mois|monat|monate|månad|månader)(?:\s*(?:bundle|package|pack|supply|kit|pacchetto|pacote|paquete))?)/i;
const PACKAGE_DECORATION=/^(?:image\d*|check|arrow|banner|selling out)$/i;
const PRICE_TOKEN=/(?:US\$|AU\$|CA\$|R\$|\$|€|£|kr)\s?\d{1,6}(?:[.,]\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?\s?(?:USD|AUD|CAD|BRL|EUR|GBP|SEK|€|£|kr|\$)(?![A-Za-z])/gi;

function primaryOfferText(text){
  const lines=String(text||'').split(/\r?\n/),footerIndex=lines.findIndex(line=>FOOTER_MARKER.test(clean(line)));
  return (footerIndex<0?lines:lines.slice(0,footerIndex)).join('\n');
}

function footerProductCandidate(text,body){
  const lines=String(text||'').split(/\r?\n/),footerIndex=lines.findIndex(line=>FOOTER_MARKER.test(clean(line)));
  if(footerIndex<0)return null;
  const copyright=lines.slice(footerIndex).map(clean).find(line=>/©\s*20\d{2}\s*(?:copyright\s*)?/i.test(line));
  const match=copyright?.match(/©\s*20\d{2}\s*(?:copyright\s*)?(.+?)(?:\s*[-–—|]\s*all rights reserved\b|\s+all rights reserved\b|\s+alle rechte vorbehalten\b|[.!?]\s*(?:alle rechte vorbehalten\b)?\s*$|$)/i);
  const candidate=clean(match?.[1]).replace(/[®™]/g,'').replace(/[.!?]+$/,'').trim();
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
  const packageTitle=offerText.match(/\b([A-Z][A-Za-z0-9®™]*(?:[-'][A-Z0-9][A-Za-z0-9®™]*)*)\s*[-–—]\s*(?:paket|bundle|package)\b/i)?.[1];
  if(footerCandidate?.exactInBody)return{...footerCandidate,source:'body_corroborated_footer'};
  if(packageTitle)return{value:packageTitle.replace(/[®™]/g,''),source:'package_title'};
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

function durationPackageMarker(line,index){
  const match=normalizePastedLine(line).match(/^(\d{1,3})\s*[- ]\s*(tage?|tages|day|days|monat|monate|monats|month|months)(?:\s*[- ]\s*(?:vorrat|supply|package|paket))?$/i);
  if(!match)return null;
  const amount=Number(match[1]),unit=match[2].toLowerCase(),months=/^(?:monat|month)/.test(unit);
  return {index,label:normalizePastedLine(line),durationDays:months?amount*30:amount};
}

function parseDurationBundlePackages(text){
  const lines=String(text||'').split(/\r?\n/).map(normalizePastedLine).filter(Boolean),markers=[];
  lines.forEach((line,index)=>{
    const marker=durationPackageMarker(line,index);
    if(marker&&markers.at(-1)?.durationDays!==marker.durationDays)markers.push(marker);
  });
  if(markers.length<2||!markers.some(marker=>/\bvorrat\b/i.test(marker.label)))return null;
  const parsed=markers.map((start,index)=>{
    const end=markers[index+1]?.index??lines.length,block=lines.slice(start.index,end),allPrices=priceEntries(block);
    const prices=allPrices.filter(item=>!(/\b(?:du\s+sparst|you\s+save|saving|savings|discount|rabatt|ersparnis|versandkosten|shipping\s+costs?|delivery\s+costs?)\b/i.test(item.line)||/\b(?:pro|per)\s+(?:tag|day)\b/i.test(item.line)));
    const uniquePrices=[];
    for(const entry of prices)if(!uniquePrices.some(item=>item.value===entry.value))uniquePrices.push(entry);
    const packagePriceLabelIndex=block.findIndex(line=>/\b(?:preis\s+pro\s+packung|package\s+price|price\s+per\s+package)\b/i.test(line));
    const labeledPromo=packagePriceLabelIndex<0?null:uniquePrices.filter(item=>item.lineIndex<packagePriceLabelIndex&&packagePriceLabelIndex-item.lineIndex<=2).at(-1)||null;
    const values=uniquePrices.map(item=>item.value).sort((a,b)=>a-b);
    const promoEntry=labeledPromo||((values.length===2)?uniquePrices.find(item=>item.value===values[0]):null);
    const regularEntry=promoEntry&&uniquePrices.length===2?uniquePrices.find(item=>item!==promoEntry):null;
    const promoPrice=promoEntry?.value??null,regularPrice=regularEntry?.value??null;
    const contents=block.find(line=>/^(?:enthält|beinhaltet|includes|contains)\b/i.test(line))||'';
    const confidence=regularPrice!==null&&promoPrice!==null&&regularPrice>promoPrice&&labeledPromo?'high':'review';
    return {label:start.label,regularPrice,promoPrice,contents,confidence};
  });
  return parsed.length===markers.length&&parsed.every(item=>item.regularPrice!==null&&item.promoPrice!==null)?parsed.slice(0,8):null;
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
    return {label:start.label,regularPrice:regularDisplayedTotal,promoPrice,contents:'',confidence:complete&&matchesBadge?'high':'review',priceMode:'quantity_bundle',packageQuantity:start.quantity,quantityUnit:'pair',displayedUnitPrice,regularDisplayedTotal,promoTotalCalculated:promoPrice!==null,discountBadgePercent,discountBadgeBasePercent:discountBadgePercent,discountBadgeStacked:false,priceNote};
  }).slice(0,8);
}

function packageCardPriceEntries(lines){
  const entries=priceEntries(lines),currencyOnly=/^(?:US\$|AU\$|CA\$|R\$|\$|€|£|kr)$/i;
  lines.forEach((line,lineIndex)=>{
    const symbol=clean(line),amountLine=lines[lineIndex+1]||'';
    if(!currencyOnly.test(symbol)||!/^\s*\d{1,6}(?:[.,]\d{1,2})?\s*$/.test(amountLine))return;
    const value=number(amountLine);
    if(value===null||entries.some(entry=>entry.value===value&&entry.lineIndex===lineIndex+1))return;
    const unitLine=/^\s*\/\s*(?:each|ea)\b/i.test(lines[lineIndex+2]||'')?lines[lineIndex+2]:'';
    entries.push({raw:`${symbol}${amountLine.trim()}${unitLine?` ${unitLine.trim()}`:''}`,value,line:`${symbol}${amountLine.trim()}${unitLine?` ${unitLine.trim()}`:''}`,lineIndex:lineIndex+1});
  });
  return entries;
}

function packageDiscountBadge(block){
  const stacked=block.map(line=>line.match(/\bsave\s+(\d{1,2}(?:[.,]\d+)?)\s*%\s*off\s*\+\s*(\d{1,2}(?:[.,]\d+)?)\s*%\s*off\b/i)).find(Boolean);
  if(stacked){
    const first=number(stacked[1]),additional=number(stacked[2]);
    if(first>0&&first<100&&additional>0&&additional<100){
      const combined=Math.round((100*(1-(1-first/100)*(1-additional/100))+Number.EPSILON)*10)/10;
      return{percent:combined,basePercent:first,additionalPercent:additional,text:clean(stacked[0]),stacked:true};
    }
  }
  const single=block.map(line=>line.match(/\b(?:save|savings?)\s+(\d{1,2}(?:[.,]\d+)?)\s*%/i)).find(Boolean);
  const singlePercent=single?number(single[1]):null;
  return single?{percent:singlePercent,basePercent:singlePercent,additionalPercent:null,text:clean(single[0]),stacked:false}:{percent:null,basePercent:null,additionalPercent:null,text:'',stacked:false};
}

function parseQuantityEachPackages(text){
  const lines=String(text||'').split(/\r?\n/).map(normalizePastedLine).filter(Boolean);
  if(!lines.some(line=>/^choose\s+your\s+packages?\b/i.test(line))||
    !lines.some(line=>/\/\s*(?:each|ea)\b/i.test(line)))return null;
  const starts=[];
  lines.forEach((line,index)=>{
    const match=line.match(/^(\d{1,2})\s*[x×]\s*(.{2,60}?)\s*$/i);
    if(match)starts.push({index,label:line,quantity:Number(match[1])});
  });
  if(starts.length<2)return null;
  const parsed=starts.map((start,index)=>{
    const nextCard=starts[index+1]?.index??lines.length;
    const sectionBreak=lines.findIndex((line,lineIndex)=>lineIndex>start.index&&/^(?:zero\s+commitment\b|customer\s+information\b|shipping\s+address\b|enter\s+your\s+shipping\s+details\b|payment(?:\s+methods?)?\b|order\s+summary\b|complete\s+(?:your\s+secure\s+)?order\b|terms\s*(?:&|and)\s*conditions\b|why\s+choose\b)/i.test(line));
    const end=Math.min(nextCard,sectionBreak<0?lines.length:sectionBreak),block=lines.slice(start.index,end),prices=packageCardPriceEntries(block);
    const unitPrices=prices.filter(item=>/\/\s*(?:each|ea)\b/i.test(item.line)||/^\s*\/\s*(?:each|ea)\b/i.test(block[item.lineIndex+1]||''));
    const regularPrices=prices.filter(item=>!unitPrices.includes(item));
    const displayedUnitPrice=unique(unitPrices.map(item=>String(item.value))).length===1?unitPrices[0].value:null;
    const regularDisplayedTotal=unique(regularPrices.map(item=>String(item.value))).length===1?regularPrices[0].value:null;
    const promoPrice=displayedUnitPrice!==null?Math.round((displayedUnitPrice*start.quantity+Number.EPSILON)*100)/100:null;
    const badge=packageDiscountBadge(block),discountBadgePercent=badge.percent,discountBadgeBasePercent=badge.basePercent;
    const calculatedDiscount=calculateDiscount(regularDisplayedTotal,promoPrice);
    const matchesBadge=calculatedDiscount!==null&&discountBadgePercent!==null&&Math.abs(calculatedDiscount-discountBadgePercent)<=0.6;
    const complete=displayedUnitPrice!==null&&regularDisplayedTotal!==null&&promoPrice!==null&&regularDisplayedTotal>promoPrice;
    const descriptor=block.find(line=>/received\s+every\s+\d{1,3}\s+days?\b/i.test(line))||'';
    const unitRaw=unitPrices[0]?.raw||'';
    const regularRaw=regularPrices[0]?.raw||'';
    const currencyPrefix=unitRaw.match(/^(?:US\$|AU\$|CA\$|R\$|\$|€|£|kr)/i)?.[0]||regularRaw.match(/^(?:US\$|AU\$|CA\$|R\$|\$|€|£|kr)/i)?.[0]||'';
    const calculatedTotalText=promoPrice!==null?`${currencyPrefix}${promoPrice.toFixed(2)}`:'não identificado';
    const calculatedSaving=complete?Math.round((regularDisplayedTotal-promoPrice+Number.EPSILON)*100)/100:null;
    const calculatedDiscountNote=calculatedDiscount!==null?` · desconto calculado: ${percent(calculatedDiscount)}%`:'';
    const mismatchNote=discountBadgePercent!==null&&calculatedDiscount!==null&&!matchesBadge?' · percentual calculado diverge do selo; revisar antes de usar em anúncios':'';
    const savingNote=calculatedSaving!==null?` · economia calculada: ${currencyPrefix}${calculatedSaving.toFixed(2)}`:'';
    const badgeNote=badge.text?` · selo exibido: ${badge.text}${badge.stacked?` · percentual combinado calculado: ${percent(discountBadgePercent)}%`:''}`:'';
    const priceNote=`Quantidade: ${start.quantity} unidade(s) · preço por unidade exibido: ${unitRaw||'não identificado'} · total original exibido: ${regularRaw||'não identificado'} · total promocional calculado: ${calculatedTotalText}${savingNote}${calculatedDiscountNote}${badgeNote}${descriptor?` · condição exibida: ${descriptor}`:''}${mismatchNote}`;
    return {label:start.label,regularPrice:regularDisplayedTotal,promoPrice,contents:'',confidence:complete&&matchesBadge?'high':'review',priceMode:'quantity_bundle',packageQuantity:start.quantity,quantityUnit:'unit',packageDescriptor:descriptor,displayedUnitPrice,regularDisplayedTotal,promoTotalCalculated:promoPrice!==null,discountBadgePercent,discountBadgeBasePercent,discountBadgeStacked:badge.stacked,priceNote};
  });
  return parsed.length===starts.length&&parsed.every(item=>item.regularPrice!==null&&item.displayedUnitPrice!==null&&item.promoPrice!==null)?parsed.slice(0,8):null;
}

function discountOfferCandidates(text){
  const lines=String(text||'').split(/\r?\n/).map(normalizePastedLine).filter(Boolean),quantityCards=[],badgeCards=[];
  lines.forEach((line,index)=>{
    const quantityMatch=line.match(/(?:^|\b)(\d{1,2})\s*[x×]\s*([^\n]{2,60})/i);
    if(quantityMatch)quantityCards.push({index,quantity:Number(quantityMatch[1]),label:clean(quantityMatch[0])});
    if(packageDiscountBadge([line]).basePercent!==null)badgeCards.push(index);
  });
  const sectionBreak=/^(?:zero\s+commitment\b|customer\s+information\b|shipping\s+address\b|enter\s+your\s+shipping\s+details\b|payment(?:\s+methods?)?\b|order\s+summary\b|complete\s+(?:your\s+secure\s+)?order\b|terms\s*(?:&|and)\s*conditions\b|why\s+choose\b)/i;
  const boundaries=quantityCards.length>=2?quantityCards:badgeCards.length>=2?badgeCards.map(index=>({index,quantity:null,label:''})):quantityCards;
  return boundaries.map((start,index)=>{
    const previousBoundary=index?boundaries[index-1].index:-1,nextBoundary=boundaries[index+1]?.index??lines.length;
    const explicitBreak=lines.findIndex((line,lineIndex)=>lineIndex>start.index&&lineIndex<nextBoundary&&sectionBreak.test(line));
    const end=explicitBreak<0?nextBoundary:explicitBreak,block=lines.slice(start.index,end),badge=packageDiscountBadge(block);
    const quantity= start.quantity??quantityCards.filter(card=>card.index>previousBoundary&&card.index<=start.index).at(-1)?.quantity??null;
    const prices=packageCardPriceEntries(block),unitPrices=prices.filter(item=>/\/\s*(?:each|ea)\b/i.test(item.line)||/^\s*\/\s*(?:each|ea)\b/i.test(block[item.lineIndex+1]||''));
    const regularPrices=prices.filter(item=>!unitPrices.includes(item)),regularValues=unique(regularPrices.map(item=>String(item.value))).map(Number),unitValues=unique(unitPrices.map(item=>String(item.value))).map(Number);
    const explicitSavingLine=block.find(line=>/\b(?:save|savings?|saved|discount)\b/i.test(line)&&/(?:US\$|AU\$|CA\$|R\$|\$|€|£|kr)\s?\d/i.test(line));
    const explicitSaving=explicitSavingLine?priceEntries([explicitSavingLine])[0]?.value:null;
    let regularTotal=null,promoTotal=null;
    if(regularValues.length===1&&unitValues.length===1&&quantity){regularTotal=regularValues[0];promoTotal=unitValues[0]*quantity}
    else if(regularValues.length===2){regularTotal=Math.max(...regularValues);promoTotal=Math.min(...regularValues)}
    else if(regularValues.length===1&&unitValues.length===1){regularTotal=regularValues[0];promoTotal=unitValues[0]}
    const amount=explicitSaving!==null?explicitSaving:regularTotal!==null&&promoTotal!==null&&regularTotal>promoTotal?Math.round((regularTotal-promoTotal+Number.EPSILON)*100)/100:null;
    const calculatedPercent=regularTotal!==null&&promoTotal!==null?calculateDiscount(regularTotal,promoTotal):null;
    const percent=badge.basePercent??badge.percent??calculatedPercent;
    const displayedPrice=unitValues.length===1?unitValues[0]:regularValues.length===2?Math.min(...regularValues):null;
    return percent!==null?{percent,amount,label:start.label||block[0]||'',displayedPrice,priceBasis:unitValues.length===1?'unit':'package',quantity}:null;
  }).filter(Boolean);
}

function offerEvidenceCandidates(raw){
  const text=primaryOfferText(String(raw||'')),packages=normalizePackages(parsePackages(text,textProductCandidate(String(raw||'')).value));
  return [...discountOfferCandidates(text),...packages.map(item=>({
    percent:item.discountBadgeBasePercent??item.discountBadgePercent??item.discountPercent,
    amount:packageSavings(item),label:item.label,displayedPrice:item.displayedUnitPrice??(item.promoTotalCalculated?null:item.promoPrice),
    priceBasis:item.displayedUnitPrice!==null?'unit':'package',quantity:item.packageQuantity,terms:item.packageDescriptor
  }))];
}
export function offerProductPrices(raw=''){
  // Savings, freight and bonus valuations are not product purchase prices.
  const lines=String(raw||'').split(/\r?\n/),excluded=/\b(?:save|savings?|saved|discount|economize|economia|risparmia|ahorra)\s*[:=-]?\s*(?:US\$|AU\$|CA\$|R\$|\$|€|£|kr)\s*\d|(?:US\$|AU\$|CA\$|R\$|\$|€|£|kr)\s*\d[\d.,]*\s*(?:in\s+)?(?:savings|de economia)|^(?:shipping|frete|delivery|bonus|free gift|brinde|tax)\b/i;
  const productText=lines.filter(line=>!excluded.test(normalizePastedLine(line))).join('\n');
  return offerEvidenceCandidates(productText).filter(item=>item.displayedPrice!==null&&item.displayedPrice!==undefined).map(item=>({value:item.displayedPrice,basis:item.priceBasis,quantity:item.quantity,terms:item.terms||''}));
}
export function offerEvidenceForDiscount(raw='',discountPercent=null,discountAmount=null){
  const target=number(discountPercent),amount=number(discountAmount);
  const candidates=offerEvidenceCandidates(raw).filter(item=>item.percent!==null&&(target===null||Math.abs(item.percent-target)<=0.6)&&(amount===null||item.amount!==null&&Math.abs(item.amount-amount)<0.01));
  const ranked=candidates.sort((a,b)=>(b.amount??-1)-(a.amount??-1));
  if(!ranked.length)return null;
  const top=ranked[0],priceCandidates=ranked.filter(item=>item.amount===top.amount&&item.displayedPrice!==null);
  const prices=new Set(priceCandidates.map(item=>`${item.displayedPrice}:${item.priceBasis}:${item.quantity??''}`));
  const price=prices.size===1?priceCandidates.find(item=>item.terms)||priceCandidates[0]:null;
  return {...top,...(price||{}),displayedPrice:price?.displayedPrice??null,ambiguousPrice:prices.size>1};
}

function explicitDiscountPercentages(text){
  return String(text||'').split(/\r?\n/).map(normalizePastedLine).filter(line=>/\b(?:save|savings?|discount|off|promo(?:tion)?)\b/i.test(line))
    .flatMap(line=>[...line.matchAll(/\b(\d{1,2}(?:[.,]\d+)?)\s*%/g)].map(match=>number(match[1]))).filter(value=>value>0&&value<100);
}

function parsePackages(text,productCandidate=''){
  const lines=String(text||'').split(/\r?\n/).map(clean).filter(Boolean),starts=[];
  const recurringPackages=parseQuantityEachPackages(text);
  if(recurringPackages)return recurringPackages;
  const pairPackages=parsePairQuantityPackages(text);
  if(pairPackages)return pairPackages;
  const durationPackages=parseDurationBundlePackages(text);
  if(durationPackages)return durationPackages;
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
  const locale=inferLocale(offerText,url,currency),productDetection=textProductCandidate(text,url),productCandidate=productDetection.value,packages=parsePackages(offerText,productCandidate),detectedOffers=discountOfferCandidates(offerText),packageOffers=normalizePackages(packages).map(item=>({percent:item.discountBadgeBasePercent??item.discountBadgePercent??item.discountPercent,amount:packageSavings(item),package:item})).filter(item=>item.percent!==null),discountOffers=[...detectedOffers,...packageOffers];
  const discountPercentCandidates=[...discountOffers.map(item=>item.percent),...explicitDiscountPercentages(offerText)],highestPercent=discountPercentCandidates.length?Math.max(...discountPercentCandidates):percentages.length?Math.max(...percentages):null;
  const highestOffer=discountOffers.filter(item=>Math.abs(item.percent-highestPercent)<=0.6&&item.amount!==null&&item.amount!==undefined).sort((a,b)=>b.amount-a.amount)[0]||null;
  const highestSavings=highestOffer?{amount:highestOffer.amount,package:highestOffer.package||null}:discountAmountForPercent(packages,highestPercent);
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
    pageTitleCandidate:productCandidate?`${productCandidate} | ${dictionaryFor(locale.htmlLanguage||'en-US').offer}`:'',
    packages,
    highestSavingsAmount:highestSavings?.amount??null,
    highestSavingsPackageLabel:highestSavings?.package?.label||highestOffer?.label||'',
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
function within(values,limit){return unique(values).filter(value=>[...value].length<=limit)}

const SAVING_LABEL={en:'Save',pt:'Economize',it:'Risparmia',es:'Ahorra',fr:'Économisez',de:'Sparen Sie',sv:'Spara'};
function savingLabel(htmlLanguage){return SAVING_LABEL[language(htmlLanguage)]||SAVING_LABEL.en}

const GUARANTEE_PHRASE={
  en:(days,moneyBack)=>`${days}-day ${moneyBack?'money-back ':''}guarantee`,
  pt:(days,moneyBack)=>moneyBack?`garantia de reembolso de ${days} dias`:`garantia de ${days} dias`,
  it:(days,moneyBack)=>moneyBack?`garanzia di rimborso di ${days} giorni`:`garanzia di ${days} giorni`,
  es:(days,moneyBack)=>moneyBack?`garantía de reembolso de ${days} días`:`garantía de ${days} días`,
  fr:(days,moneyBack)=>moneyBack?`garantie de remboursement de ${days} jours`:`garantie de ${days} jours`,
  de:(days,moneyBack)=>moneyBack?`Geld-zurück-Garantie für ${days} Tage`:`Garantie für ${days} Tage`,
  sv:(days,moneyBack)=>moneyBack?`återbetalningsgaranti på ${days} dagar`:`garanti på ${days} dagar`
};
const GUARANTEE_HEADLINE={
  en:(days,moneyBack)=>moneyBack?`${days}-Day Money-Back Guarantee`:`${days}-Day Guarantee`,
  pt:days=>`Garantia de ${days} dias`,it:days=>`Garanzia di ${days} giorni`,es:days=>`Garantía de ${days} días`,
  fr:days=>`Garantie ${days} jours`,de:days=>`Garantie ${days} Tage`,sv:days=>`Garanti ${days} dagar`
};
function compactGuaranteeTitle(data,guarantee){
  if(!guarantee)return'';
  const lang=language(data.htmlLanguage),makeTitle=GUARANTEE_HEADLINE[lang]||GUARANTEE_HEADLINE.en;
  return makeTitle(guarantee.days,false);
}
function guaranteeCopy(data){
  const days=number(data.guaranteeDays),status=data.guaranteeStatus||(days?'confirmed':'pending');
  if(!(days>0)||status!=='confirmed')return null;
  const lang=language(data.htmlLanguage),raw=String(data.rawText||'');
  const moneyBack=raw.split(/\r?\n/).some(line=>/\b(?:money[\s-]*back|refund(?:s|ed)?|reembolso|rimborso|remboursement|rückerstattung|återbetalning)\b/i.test(line)&&/\b(?:guarantee|garanti[ea]|garanzia|garantie|garanti|trial|days?|dias|giorni|jours|tage|dagar)\b/i.test(line));
  const phrase=(GUARANTEE_PHRASE[lang]||GUARANTEE_PHRASE.en)(days,moneyBack);
  const title=(GUARANTEE_HEADLINE[lang]||GUARANTEE_HEADLINE.en)(days,moneyBack);
  return{days,moneyBack,phrase,title};
}

const LIMITED_TIME_HEADLINE={en:pct=>`Limited-Time ${pct}% Off`,pt:pct=>`${pct}% off por tempo limitado`,it:pct=>`${pct}% di sconto limitato`,es:pct=>`${pct}% de descuento limitado`,fr:pct=>`${pct}% de réduction limitée`,de:pct=>`${pct}% Rabatt für kurze Zeit`,sv:pct=>`${pct}% rabatt en begränsad tid`};
const LIMITED_TIME_OFFER_HEADLINE={en:'Limited-Time Offer',pt:'Oferta por Tempo Limitado',it:'Offerta a Tempo Limitato',es:'Oferta por Tiempo Limitado',fr:'Offre à Durée Limitée',de:'Zeitlimit-Angebot',sv:'Tidsbegränsat erbjudande'};
const LIMITED_STOCK_HEADLINE={en:pct=>`Limited Stock · ${pct}% Off`,pt:pct=>`Estoque limitado · ${pct}%`,it:pct=>`Scorte limitate · ${pct}%`,es:pct=>`Stock limitado · ${pct}%`,fr:pct=>`Stock limité · ${pct}%`,de:pct=>`Begrenzter Vorrat · ${pct}%`,sv:pct=>`Begränsat lager · ${pct}%`};
const LIMITED_STOCK_LABEL={en:'Limited Stock',pt:'Estoque limitado',it:'Scorte limitate',es:'Stock limitado',fr:'Stock limité',de:'Begrenzter Vorrat',sv:'Begränsat lager'};
const FAST_SHIPPING_HEADLINE={en:['Fast Shipping','Quick Shipping','Fast Dispatch','Order with Fast Shipping'],pt:['Envio Rápido','Entrega Rápida','Despacho Rápido','Peça com Envio Rápido'],it:['Spedizione Rapida','Consegna Rapida','Ordina con Spedizione Rapida'],es:['Envío Rápido','Entrega Rápida','Compra con Envío Rápido'],fr:['Expédition Rapide','Livraison Rapide','Commandez avec Expédition Rapide'],de:['Schneller Versand','Schnelle Lieferung','Jetzt schnell bestellen'],sv:['Snabb Leverans','Snabb Frakt','Beställ med Snabb Leverans']};
const TODAY_ONLY_PATTERN=/\b(?:today\s+only|only\s+today|ends?\s+(?:today|at\s+midnight)|expires?\s+today|until\s+midnight|hoje\s+somente|somente\s+hoje|termina\s+hoje|fino\s+a\s+mezzanotte|solo\s+oggi|solo\s+hoy|termina\s+hoy|aujourd'hui\s+seulement|nur\s+heute|slutar\s+idag)\b/i;
const NO_HIDDEN_FEES={
  en:{pattern:/\bno hidden fees(?: at checkout)?\b/i,title:'No Hidden Fees',line:'No hidden fees at checkout'},
  pt:{pattern:/\bsem (?:taxas|custos) ocult(?:as|os)\b/i,title:'Sem taxas ocultas',line:'Sem taxas ocultas no checkout'},
  it:{pattern:/\bnessun costo nascosto\b/i,title:'Nessun costo nascosto',line:'Nessun costo nascosto al checkout'},
  es:{pattern:/\bsin cargos ocultos\b/i,title:'Sin cargos ocultos',line:'Sin cargos ocultos al pagar'},
  fr:{pattern:/\baucuns? frais cachés?\b/i,title:'Aucun frais caché',line:'Aucun frais caché au paiement'},
  de:{pattern:/\bkeine versteckten gebühren\b/i,title:'Keine versteckten Gebühren',line:'Keine versteckten Gebühren im Checkout'},
  sv:{pattern:/\binga dolda avgifter\b/i,title:'Inga dolda avgifter',line:'Inga dolda avgifter i kassan'}
};
function confirmedNoHiddenFees(data){const entry=NO_HIDDEN_FEES[language(data.htmlLanguage)]||NO_HIDDEN_FEES.en;return entry.pattern.test(String(data.rawText||''))?entry:null}

function headlineCandidates(data,t,best,packages=[]){
  const p=clean(data.product),pct=best?percent(best,data.htmlLanguage):'',lang=language(data.htmlLanguage),savingsContext=discountSavingsContext(data,packages,best),bestPackage=savingsContext.package,saved=savingsContext.amount!==null?money(savingsContext.amount,data.currency,data.htmlLanguage):'',save=savingLabel(data.htmlLanguage),guarantee=guaranteeCopy(data);
  const savingsLabel=bestPackage?.label||p||OFFER_REFERENCE[language(data.htmlLanguage)]||OFFER_REFERENCE.en;
  const pfx=[t.buy,t.order,t.choose,t.shop],suffix=[t.offer,t.discount,t.packages,t.checkout,t.now,t.online];
  const values=[];
  if(pct&&saved){
    values.push(`${t.save} ${saved} · ${pct}% ${t.off}`,`${pct}% ${t.off} · ${t.save} ${saved}`,`${save} ${saved} · ${pct}%`,`${savingsLabel} · ${saved} · ${pct}%`,`${p}: ${pct}% ${t.off} · ${saved}`,`${t.discount} ${pct}% · ${saved}`,`${t.deal} ${pct}% · ${t.save} ${saved}`,`${pct}% ${t.off} · ${saved} ${t.discount}`,`${savingsLabel} · ${t.save} ${saved} · ${pct}%`,`${t.order} ${p} · ${pct}% · ${saved}`);
  }
  if(guarantee){
    values.unshift(guarantee.title);
    if(pct)values.unshift(`${pct}% ${t.off} · ${guarantee.title}`);
    if(pct&&saved)values.unshift(`${save} ${saved} · ${guarantee.title}`);
  }
  const noHiddenFees=confirmedNoHiddenFees(data);
  if(noHiddenFees)values.unshift(noHiddenFees.title);
  if(p){
    values.push(p,...pfx.map(word=>`${word} ${p}`),...suffix.map(word=>`${p} ${word}`));
    if(pct)values.push(`${p} ${pct}% ${t.off}`,`${t.save} ${pct}% ${p}`,`${p}: ${pct}% ${t.off}`);
  }
  if(pct)values.push(`${pct}% ${t.off}`,`${t.save} ${pct}%`,`${t.discount} ${pct}%`,`${t.offer}: ${pct}% ${t.off}`,`${t.deal}: ${pct}% ${t.off}`,`${pct}% ${t.off} ${t.now}`,`${t.discount} ${pct}% ${t.online}`,`${t.choose} ${pct}% ${t.off}`);
  if(data.fastShipping==='confirmed')values.push(...(FAST_SHIPPING_HEADLINE[lang]||FAST_SHIPPING_HEADLINE.en));
  if(data.freeShipping==='confirmed')values.push(t.freeShipping);
  if(pct&&data.urgencyConfirmed==='confirmed')values.push(LIMITED_TIME_OFFER_HEADLINE[lang]||LIMITED_TIME_OFFER_HEADLINE.en,(LIMITED_TIME_HEADLINE[lang]||LIMITED_TIME_HEADLINE.en)(pct));
  if(pct&&data.urgencyConfirmed==='confirmed'&&TODAY_ONLY_PATTERN.test(String(data.rawText||'')))values.push(`${pct}% ${t.off} ${t.today}`,`${t.save} ${pct}% ${t.today}`);
  if(pct&&data.scarcityConfirmed==='confirmed')values.push((LIMITED_STOCK_HEADLINE[lang]||LIMITED_STOCK_HEADLINE.en)(pct));
  for(const first of [t.buy,t.order,t.choose,t.shop,t.offer,t.deal,t.discount])for(const last of [t.now,t.online,t.packages,t.checkout,t.details])values.push(`${first} ${last}`);
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
  en:(saved,pct,label)=>[
    `Save ${saved} (${pct} off) on ${label}. Choose your package and order online.`,
    `Save ${saved} at ${pct} off on ${label}. Select your package and order online now.`,
    `The ${label} saves ${saved} with ${pct} off. Compare packages and order online.`,
    `Choose ${label}: save ${saved} at ${pct} off. Order online now.`
  ],
  pt:(saved,pct,label)=>[
    `Economize ${saved} (${pct} de desconto) em ${label}. Escolha e peça online.`,
    `Economize ${saved} em ${label} com ${pct} de desconto. Escolha e peça online agora.`,
    `No pacote ${label}, ${pct} de desconto e economia de ${saved}. Peça online agora.`,
    `${label}: economize ${saved} com ${pct} de desconto. Peça online.`
  ],
  it:(saved,pct,label)=>[
    `Risparmia ${saved} (${pct} di sconto) su ${label}. Scegli e ordina online.`,
    `Risparmia ${saved} su ${label} con ${pct} di sconto. Scegli e ordina online ora.`,
    `${label}: ${pct} di sconto e risparmi ${saved}. Ordina online ora.`,
    `Scegli ${label}: risparmi ${saved} con ${pct} di sconto. Ordina online.`
  ],
  es:(saved,pct,label)=>[
    `Ahorra ${saved} (${pct} de descuento) en ${label}. Elige y compra online.`,
    `Ahorra ${saved} en ${label} con ${pct} de descuento. Elige y compra online ahora.`,
    `${label}: ${pct} de descuento y ahorra ${saved}. Compra online ahora.`,
    `Elige ${label}: ahorra ${saved} con ${pct} de descuento. Compra online.`
  ],
  fr:(saved,pct,label)=>[
    `Économisez ${saved} (${pct} de remise) sur ${label}. Choisissez et commandez en ligne.`,
    `Économisez ${saved} sur ${label} avec ${pct} de remise. Choisissez et commandez en ligne.`,
    `${label} : ${pct} de remise et ${saved} d'économies. Commandez en ligne.`,
    `Choisissez ${label} : économisez ${saved} avec ${pct} de remise. Commandez.`
  ],
  de:(saved,pct,label)=>[
    `Sparen Sie ${saved} (${pct} Rabatt) bei ${label}. Paket wählen und online bestellen.`,
    `Sparen Sie ${saved} bei ${label} mit ${pct} Rabatt. Wählen Sie das Paket und bestellen Sie.`,
    `${label}: ${pct} Rabatt und ${saved} Ersparnis. Bestellen Sie online.`,
    `Wählen Sie ${label}: ${saved} Ersparnis bei ${pct} Rabatt. Jetzt online bestellen.`
  ],
  sv:(saved,pct,label)=>[
    `Spara ${saved} (${pct} rabatt) på ${label}. Välj paket och beställ online.`,
    `Spara ${saved} på ${label} med ${pct} rabatt. Välj paket och beställ online nu.`,
    `${label}: ${pct} rabatt och ${saved} i besparing. Beställ online nu.`,
    `Välj ${label}: ${saved} i besparing med ${pct} rabatt. Beställ online.`
  ]
};

const GUARANTEE_SAVING_VARIANT={
  en:(saved,pct,label,guarantee)=>[
    `Save ${saved} at ${pct} off on ${label}. ${guarantee}. Choose your package online.`,
    `Get ${pct} off and save ${saved}. Review the ${guarantee} terms before ordering.`,
    `${label}: save ${saved} at ${pct} off. Review the ${guarantee} terms and order online.`,
    `Save ${saved} with ${pct} off. ${guarantee}. View the offer and order online.`
  ],
  pt:(saved,pct,label,guarantee)=>[
    `Economize ${saved} com ${pct} de desconto em ${label}. ${guarantee}. Peça online.`,
    `${pct} de desconto e ${saved} de economia. Confira os termos da ${guarantee} e peça online.`,
    `${label}: economize ${saved} com ${pct} de desconto. Confira a ${guarantee} e peça online.`,
    `Economize ${saved} com ${pct} de desconto. Veja a ${guarantee} antes do pedido.`
  ],
  it:(saved,pct,label,guarantee)=>[
    `Risparmia ${saved} con il ${pct} di sconto su ${label}. ${guarantee}. Ordina online.`,
    `${pct} di sconto e ${saved} di risparmio. Consulta i termini della ${guarantee} e ordina online.`,
    `${label}: risparmia ${saved} con il ${pct} di sconto. Scopri la ${guarantee} e ordina online.`,
    `Risparmia ${saved} con il ${pct} di sconto. Consulta la ${guarantee} prima di ordinare.`
  ],
  es:(saved,pct,label,guarantee)=>[
    `Ahorra ${saved} con ${pct} de descuento en ${label}. ${guarantee}. Compra online.`,
    `${pct} de descuento y ${saved} de ahorro. Consulta los términos de la ${guarantee} y compra online.`,
    `${label}: ahorra ${saved} con ${pct} de descuento. Revisa la ${guarantee} y compra online.`,
    `Ahorra ${saved} con ${pct} de descuento. Consulta la ${guarantee} antes de comprar.`
  ],
  fr:(saved,pct,label,guarantee)=>[
    `Économisez ${saved} avec ${pct} de remise sur ${label}. ${guarantee}. Commandez en ligne.`,
    `${pct} de remise et ${saved} d'économies. Consultez les conditions de la ${guarantee}.`,
    `${label} : économisez ${saved} avec ${pct} de remise. Consultez la ${guarantee} et commandez en ligne.`,
    `Économisez ${saved} avec ${pct} de remise. Consultez la ${guarantee} avant de commander.`
  ],
  de:(saved,pct,label,guarantee)=>[
    `Sparen Sie ${saved} bei ${label} mit ${pct} Rabatt. ${guarantee}. Jetzt online bestellen.`,
    `${pct} Rabatt und ${saved} Ersparnis. Prüfen Sie die Bedingungen der ${guarantee} und bestellen Sie online.`,
    `${label}: ${saved} sparen und ${pct} Rabatt nutzen. Lesen Sie die ${guarantee} und bestellen Sie online.`,
    `Sparen Sie ${saved} mit ${pct} Rabatt. Prüfen Sie die ${guarantee} vor der Bestellung.`
  ],
  sv:(saved,pct,label,guarantee)=>[
    `Spara ${saved} med ${pct} rabatt på ${label}. ${guarantee}. Beställ online.`,
    `${pct} rabatt och ${saved} i besparing. Läs villkoren för ${guarantee} och beställ online.`,
    `${label}: spara ${saved} med ${pct} rabatt. Läs mer om ${guarantee} och beställ online.`,
    `Spara ${saved} med ${pct} rabatt. Granska ${guarantee} innan du beställer.`
  ]
};

const GUARANTEE_DISCOUNT_VARIANT={
  en:(pct,label,guarantee)=>[
    `Get ${pct} off on ${label}. Review the ${guarantee} terms before ordering online.`,
    `Choose ${label} with ${pct} off. The ${guarantee} terms are available online.`,
    `Save ${pct} on ${label}. See the ${guarantee} terms and choose your package online.`
  ],
  pt:(pct,label,guarantee)=>[
    `Tenha ${pct} de desconto em ${label}. Confira a ${guarantee} antes de pedir online.`,
    `Escolha ${label} com ${pct} de desconto. Consulte os termos da ${guarantee}.`,
    `Aproveite ${pct} de desconto em ${label}. Veja a ${guarantee} e escolha seu pacote.`
  ],
  it:(pct,label,guarantee)=>[
    `Ottieni il ${pct} di sconto su ${label}. Consulta la ${guarantee} prima di ordinare.`,
    `Scegli ${label} con il ${pct} di sconto. Consulta i termini della ${guarantee}.`,
    `Approfitta del ${pct} di sconto su ${label}. Scopri la ${guarantee} online.`
  ],
  es:(pct,label,guarantee)=>[
    `Aprovecha ${pct} de descuento en ${label}. Consulta la ${guarantee} antes de comprar.`,
    `Elige ${label} con ${pct} de descuento. Revisa los términos de la ${guarantee}.`,
    `Consigue ${pct} de descuento en ${label}. Consulta la ${guarantee} online.`
  ],
  fr:(pct,label,guarantee)=>[
    `Profitez de ${pct} de remise sur ${label}. Consultez la ${guarantee} avant de commander.`,
    `Choisissez ${label} avec ${pct} de remise. Consultez les conditions de la ${guarantee}.`,
    `Obtenez ${pct} de remise sur ${label}. Consultez la ${guarantee} en ligne.`
  ],
  de:(pct,label,guarantee)=>[
    `Erhalten Sie ${pct} Rabatt bei ${label}. Prüfen Sie die ${guarantee} vor der Bestellung.`,
    `Wählen Sie ${label} mit ${pct} Rabatt. Lesen Sie die Bedingungen der ${guarantee}.`,
    `Nutzen Sie ${pct} Rabatt bei ${label}. Informieren Sie sich online über die ${guarantee}.`
  ],
  sv:(pct,label,guarantee)=>[
    `Få ${pct} rabatt på ${label}. Läs villkoren för ${guarantee} före beställning.`,
    `Välj ${label} med ${pct} rabatt. Läs villkoren för ${guarantee}.`,
    `Utnyttja ${pct} rabatt på ${label}. Läs mer om ${guarantee} online.`
  ]
};

const FAST_SHIPPING_VARIANT={
  en:(saved,pct,label)=>[
    `Fast shipping is confirmed for this offer. Choose your package and order online.`,
    `Get ${pct} off on ${label}. Fast shipping is available. Choose your package online.`,
    `Save ${saved} at ${pct} off. Fast dispatch is confirmed for this offer. Order online.`,
    `Choose ${label} with ${pct} off. Review the fast-shipping offer and order online.`
  ],
  pt:(saved,pct,label)=>[
    `O envio rápido está confirmado nesta oferta. Escolha seu pacote e peça online.`,
    `Tenha ${pct} de desconto em ${label}. O envio rápido está confirmado. Peça online.`,
    `Economize ${saved} com ${pct} de desconto e envio rápido. Peça online.`,
    `Escolha ${label} com ${pct} de desconto. Consulte o envio rápido e peça online.`
  ],
  it:(saved,pct,label)=>[
    `La spedizione rapida è confermata. Scegli il pacchetto e ordina online.`,
    `Ottieni il ${pct} di sconto su ${label}. Spedizione rapida confermata. Ordina online.`,
    `Risparmia ${saved} con il ${pct} di sconto e spedizione rapida. Ordina online.`,
    `Scegli ${label} con il ${pct} di sconto. Consulta la spedizione rapida.`
  ],
  es:(saved,pct,label)=>[
    `El envío rápido está confirmado. Elige tu paquete y compra online.`,
    `Ahorra ${pct} en ${label}. El envío rápido está confirmado. Compra online.`,
    `Ahorra ${saved} con ${pct} de descuento y envío rápido. Compra online.`,
    `Elige ${label} con ${pct} de descuento. Consulta las opciones de envío rápido.`
  ],
  fr:(saved,pct,label)=>[
    `L'expédition rapide est confirmée. Choisissez votre pack et commandez en ligne.`,
    `Profitez de ${pct} de remise sur ${label}. Expédition rapide confirmée. Commandez en ligne.`,
    `Économisez ${saved} avec ${pct} de remise et expédition rapide. Commandez en ligne.`,
    `Choisissez ${label} avec ${pct} de remise. Consultez l'expédition rapide.`
  ],
  de:(saved,pct,label)=>[
    `Schneller Versand ist bestätigt. Wählen Sie Ihr Paket und bestellen Sie online.`,
    `Sichern Sie sich ${pct} Rabatt bei ${label}. Schneller Versand bestätigt. Bestellen Sie online.`,
    `Sparen Sie ${saved} mit ${pct} Rabatt und schnellem Versand. Bestellen Sie online.`,
    `Wählen Sie ${label} mit ${pct} Rabatt. Prüfen Sie die Angaben zum schnellen Versand.`
  ],
  sv:(saved,pct,label)=>[
    `Snabb leverans är bekräftad. Välj ditt paket och beställ online.`,
    `Få ${pct} rabatt på ${label}. Snabb leverans är bekräftad. Beställ online.`,
    `Spara ${saved} med ${pct} rabatt och snabb leverans. Beställ online.`,
    `Välj ${label} med ${pct} rabatt. Läs om alternativen för snabb leverans.`
  ]
};
const FREE_SHIPPING_VARIANT={
  en:(saved,pct,label)=>[
    `Save ${saved} at ${pct} off on ${label}. Free shipping is available. Order online.`,
    `Get ${pct} off and save ${saved}. Free delivery confirmed. Choose your package online.`,
    `Choose ${label} with ${pct} off. Free shipping is confirmed for this offer online.`
  ],
  pt:(saved,pct,label)=>[
    `Economize ${saved} com ${pct} de desconto em ${label}. O frete grátis está confirmado.`,
    `Tenha ${pct} de desconto e economize ${saved}. Frete grátis confirmado. Peça online.`,
    `Escolha ${label} com ${pct} de desconto. O frete grátis está confirmado na oferta.`
  ],
  it:(saved,pct,label)=>[
    `Risparmia ${saved} con il ${pct} di sconto su ${label}. La spedizione è gratuita.`,
    `Ottieni il ${pct} di sconto e risparmia ${saved}. Spedizione gratuita confermata. Ordina online.`,
    `Scegli ${label} con il ${pct} di sconto. La spedizione gratuita è confermata.`
  ],
  es:(saved,pct,label)=>[
    `Ahorra ${saved} con ${pct} de descuento en ${label}. El envío gratis está confirmado.`,
    `Consigue ${pct} de descuento y ahorra ${saved}. Envío gratis confirmado. Compra online.`,
    `Elige ${label} con ${pct} de descuento. El envío gratis está confirmado en la oferta.`
  ],
  fr:(saved,pct,label)=>[
    `Économisez ${saved} avec ${pct} de remise sur ${label}. La livraison gratuite est confirmée.`,
    `Profitez de ${pct} de remise et économisez ${saved}. Livraison gratuite confirmée. Commandez en ligne.`,
    `Choisissez ${label} avec ${pct} de remise. La livraison gratuite est confirmée pour l'offre.`
  ],
  de:(saved,pct,label)=>[
    `Sparen Sie ${saved} bei ${label} mit ${pct} Rabatt. Kostenloser Versand ist bestätigt.`,
    `Erhalten Sie ${pct} Rabatt und sparen Sie ${saved}. Kostenloser Versand bestätigt. Bestellen Sie online.`,
    `Wählen Sie ${label} mit ${pct} Rabatt. Kostenloser Versand ist für das Angebot bestätigt.`
  ],
  sv:(saved,pct,label)=>[
    `Spara ${saved} med ${pct} rabatt på ${label}. Fri frakt är bekräftad för erbjudandet.`,
    `Få ${pct} rabatt och spara ${saved}. Fri frakt är bekräftad. Beställ online.`,
    `Välj ${label} med ${pct} rabatt. Fri frakt är bekräftad för erbjudandet.`
  ]
};
const SHIPPING_DISCOUNT_ONLY_VARIANT={
  en:(pct,label,fast)=>fast?[
    `Get ${pct} off on ${label}. Fast shipping is available for this offer online.`,
    `Choose ${label} with ${pct} off. Review fast-shipping details and order online.`,
    `Enjoy ${pct} off on ${label}. Fast dispatch is confirmed for this offer. Order online.`
  ]:[
    `Get ${pct} off on ${label}. Free shipping is confirmed for this offer. Order online.`,
    `Choose ${label} with ${pct} off. Free delivery is confirmed for this offer online.`,
    `Enjoy ${pct} off on ${label}. The offer includes confirmed free shipping.`
  ],
  pt:(pct,label,fast)=>fast?[
    `Tenha ${pct} de desconto em ${label}. O envio rápido está confirmado na oferta.`,
    `Escolha ${label} com ${pct} de desconto. Consulte o envio rápido e peça online.`,
    `Aproveite ${pct} de desconto em ${label}. O despacho rápido está confirmado.`
  ]:[
    `Tenha ${pct} de desconto em ${label}. O frete grátis está confirmado na oferta.`,
    `Escolha ${label} com ${pct} de desconto. Esta oferta confirma frete grátis.`,
    `Aproveite ${pct} de desconto em ${label}. O frete grátis está confirmado.`
  ],
  it:(pct,label,fast)=>fast?[
    `Ottieni il ${pct} di sconto su ${label}. La spedizione rapida è confermata.`,
    `Scegli ${label} con il ${pct} di sconto. Consulta la spedizione rapida e ordina.`,
    `Approfitta del ${pct} di sconto. La consegna rapida è confermata per l'offerta.`
  ]:[
    `Ottieni il ${pct} di sconto su ${label}. La spedizione gratuita è confermata.`,
    `Scegli ${label} con il ${pct} di sconto. La spedizione gratuita è inclusa.`,
    `Approfitta del ${pct} di sconto. L'offerta conferma la spedizione gratuita.`
  ],
  es:(pct,label,fast)=>fast?[
    `Consigue ${pct} de descuento en ${label}. El envío rápido está confirmado.`,
    `Elige ${label} con ${pct} de descuento. Consulta el envío rápido y compra online.`,
    `Aprovecha ${pct} de descuento. La entrega rápida está confirmada para la oferta.`
  ]:[
    `Consigue ${pct} de descuento en ${label}. El envío gratis está confirmado.`,
    `Elige ${label} con ${pct} de descuento. La oferta confirma envío gratis.`,
    `Aprovecha ${pct} de descuento. El envío gratis está confirmado para la oferta.`
  ],
  fr:(pct,label,fast)=>fast?[
    `Profitez de ${pct} de remise sur ${label}. L'expédition rapide est confirmée.`,
    `Choisissez ${label} avec ${pct} de remise. Consultez l'expédition rapide et commandez.`,
    `Obtenez ${pct} de remise. La livraison rapide est confirmée pour l'offre.`
  ]:[
    `Profitez de ${pct} de remise sur ${label}. La livraison gratuite est confirmée.`,
    `Choisissez ${label} avec ${pct} de remise. L'offre confirme la livraison gratuite.`,
    `Obtenez ${pct} de remise. La livraison gratuite est confirmée pour l'offre.`
  ],
  de:(pct,label,fast)=>fast?[
    `Erhalten Sie ${pct} Rabatt bei ${label}. Schneller Versand ist bestätigt.`,
    `Wählen Sie ${label} mit ${pct} Rabatt. Prüfen Sie die Versanddetails und bestellen Sie.`,
    `Nutzen Sie ${pct} Rabatt. Schnelle Lieferung ist für das Angebot bestätigt.`
  ]:[
    `Erhalten Sie ${pct} Rabatt bei ${label}. Kostenloser Versand ist bestätigt.`,
    `Wählen Sie ${label} mit ${pct} Rabatt. Das Angebot bestätigt kostenlosen Versand.`,
    `Nutzen Sie ${pct} Rabatt. Kostenloser Versand ist für das Angebot bestätigt.`
  ],
  sv:(pct,label,fast)=>fast?[
    `Få ${pct} rabatt på ${label}. Snabb leverans är bekräftad för erbjudandet.`,
    `Välj ${label} med ${pct} rabatt. Läs om snabb leverans och beställ online.`,
    `Utnyttja ${pct} rabatt. Snabb frakt är bekräftad för erbjudandet.`
  ]:[
    `Få ${pct} rabatt på ${label}. Fri frakt är bekräftad för erbjudandet.`,
    `Välj ${label} med ${pct} rabatt. Erbjudandet bekräftar fri frakt.`,
    `Utnyttja ${pct} rabatt. Fri frakt är bekräftad för erbjudandet.`
  ]
};
const LIMITED_TIME_DESCRIPTION={
  en:(saved,pct,label,todayOnly)=>[
    `${saved?`Save ${saved} at ${pct} off.`:`Get ${pct} off on ${label}.`} ${todayOnly?'The offer ends today.':'Limited-time offer.'} Choose a package and order online.`,
    `${todayOnly?'Today-only offer':'Limited-time offer'}: ${pct} off${saved?` and ${saved} in savings`:''} on ${label}. Choose a package online.`,
    `${label}: ${pct} off${saved?`, save ${saved}`:''}. ${todayOnly?'Offer ends today.':'Limited-time offer.'} Order online now.`
  ],
  pt:(saved,pct,label,todayOnly)=>[
    `${saved?`Economize ${saved} com ${pct} de desconto.`:`Tenha ${pct} de desconto em ${label}.`} ${todayOnly?'A oferta termina hoje.':'Oferta por tempo limitado.'} Escolha e peça online.`,
    `${todayOnly?'Oferta só hoje':'Oferta por tempo limitado'}: ${pct} de desconto${saved?` e economia de ${saved}`:''} em ${label}. Escolha o pacote online.`,
    `${label}: ${pct} de desconto${saved?`, economize ${saved}`:''}. ${todayOnly?'Termina hoje.':'Oferta por tempo limitado.'} Peça online.`
  ],
  it:(saved,pct,label,todayOnly)=>[
    `${saved?`Risparmia ${saved} con il ${pct} di sconto.`:`Ottieni il ${pct} di sconto su ${label}.`} ${todayOnly?'L’offerta termina oggi.':'Offerta a tempo limitato.'} Ordina online.`,
    `${todayOnly?'Offerta solo oggi':'Offerta a tempo limitato'}: ${pct} di sconto${saved?` e risparmi ${saved}`:''} su ${label}. Ordina online.`,
    `${label}: ${pct} di sconto${saved?`, risparmia ${saved}`:''}. ${todayOnly?'Termina oggi.':'Offerta a tempo limitato.'} Ordina online.`
  ],
  es:(saved,pct,label,todayOnly)=>[
    `${saved?`Ahorra ${saved} con ${pct} de descuento.`:`Consigue ${pct} de descuento en ${label}.`} ${todayOnly?'La oferta termina hoy.':'Oferta por tiempo limitado.'} Compra online.`,
    `${todayOnly?'Oferta solo hoy':'Oferta por tiempo limitado'}: ${pct} de descuento${saved?` y ahorra ${saved}`:''} en ${label}. Compra online.`,
    `${label}: ${pct} de descuento${saved?`, ahorra ${saved}`:''}. ${todayOnly?'Termina hoy.':'Oferta por tiempo limitado.'} Compra online.`
  ],
  fr:(saved,pct,label,todayOnly)=>[
    `${saved?`Économisez ${saved} avec ${pct} de remise.`:`Profitez de ${pct} de remise sur ${label}.`} ${todayOnly?"L'offre se termine aujourd'hui.":'Offre à durée limitée.'} Commandez en ligne.`,
    `${todayOnly?"Offre valable aujourd'hui":'Offre à durée limitée'} : ${pct} de remise${saved?` et ${saved} d'économies`:''} sur ${label}. Commandez en ligne.`,
    `${label} : ${pct} de remise${saved?`, économisez ${saved}`:''}. ${todayOnly?"Fin aujourd'hui.":'Offre limitée.'} Commandez en ligne.`
  ],
  de:(saved,pct,label,todayOnly)=>[
    `${saved?`Sparen Sie ${saved} mit ${pct} Rabatt.`:`Erhalten Sie ${pct} Rabatt bei ${label}.`} ${todayOnly?'Das Angebot endet heute.':'Zeitlich begrenztes Angebot.'} Jetzt online bestellen.`,
    `${todayOnly?'Nur heute':'Zeitlich begrenztes Angebot'}: ${pct} Rabatt${saved?` und ${saved} Ersparnis`:''} bei ${label}. Bestellen Sie online.`,
    `${label}: ${pct} Rabatt${saved?`, ${saved} sparen`:''}. ${todayOnly?'Endet heute.':'Zeitlich begrenztes Angebot.'} Online bestellen.`
  ],
  sv:(saved,pct,label,todayOnly)=>[
    `${saved?`Spara ${saved} med ${pct} rabatt.`:`Få ${pct} rabatt på ${label}.`} ${todayOnly?'Erbjudandet slutar idag.':'Tidsbegränsat erbjudande.'} Beställ online.`,
    `${todayOnly?'Erbjudande endast idag':'Tidsbegränsat erbjudande'}: ${pct} rabatt${saved?` och ${saved} i besparing`:''} på ${label}. Beställ online.`,
    `${label}: ${pct} rabatt${saved?`, spara ${saved}`:''}. ${todayOnly?'Slutar idag.':'Tidsbegränsat erbjudande.'} Beställ online.`
  ]
};
const NO_HIDDEN_FEES_DESCRIPTION={
  en:(saved,pct,label)=>[
    `${saved?`Save ${saved} at ${pct} off.`:`Get ${pct} off on ${label}.`} No hidden fees at checkout. Choose a package online.`,
    `Get ${pct} off on ${label}. No hidden fees at checkout. Order online.`,
    `Choose ${label} and save ${saved||`${pct}%`} off. No hidden fees at checkout. Order online.`
  ],
  pt:(saved,pct,label)=>[
    `${saved?`Economize ${saved} com ${pct} de desconto.`:`Tenha ${pct} de desconto em ${label}.`} Sem taxas ocultas no checkout. Peça online.`,
    `Escolha ${label} com ${pct} de desconto. Sem taxas ocultas no checkout. Peça online.`,
    `Economize ${saved||pct} na oferta. Sem taxas ocultas no checkout. Escolha seu pacote online.`
  ],
  it:(saved,pct,label)=>[
    `${saved?`Risparmia ${saved} con il ${pct} di sconto.`:`Ottieni il ${pct} di sconto su ${label}.`} Nessun costo nascosto al checkout. Ordina online.`,
    `Scegli ${label} con il ${pct} di sconto. Nessun costo nascosto al checkout. Ordina online.`,
    `Risparmia ${saved||pct} sull'offerta. Nessun costo nascosto. Scegli il pacchetto online.`
  ],
  es:(saved,pct,label)=>[
    `${saved?`Ahorra ${saved} con ${pct} de descuento.`:`Consigue ${pct} de descuento en ${label}.`} Sin cargos ocultos al pagar. Compra online.`,
    `Elige ${label} con ${pct} de descuento. Sin cargos ocultos al pagar. Compra online.`,
    `Ahorra ${saved||pct} en la oferta. Sin cargos ocultos. Elige tu paquete online.`
  ],
  fr:(saved,pct,label)=>[
    `${saved?`Économisez ${saved} avec ${pct} de remise.`:`Profitez de ${pct} de remise sur ${label}.`} Aucun frais caché au paiement. Commandez en ligne.`,
    `Choisissez ${label} avec ${pct} de remise. Aucun frais caché au paiement. Commandez en ligne.`,
    `Économisez ${saved||pct} sur l'offre. Aucun frais caché. Choisissez votre pack en ligne.`
  ],
  de:(saved,pct,label)=>[
    `${saved?`Sparen Sie ${saved} mit ${pct} Rabatt.`:`Erhalten Sie ${pct} Rabatt bei ${label}.`} Keine versteckten Gebühren. Bestellen Sie online.`,
    `Wählen Sie ${label} mit ${pct} Rabatt. Keine versteckten Gebühren im Checkout. Bestellen Sie online.`,
    `Sparen Sie ${saved||pct} beim Angebot. Keine versteckten Gebühren. Paket online wählen.`
  ],
  sv:(saved,pct,label)=>[
    `${saved?`Spara ${saved} med ${pct} rabatt.`:`Få ${pct} rabatt på ${label}.`} Inga dolda avgifter i kassan. Beställ online.`,
    `Välj ${label} med ${pct} rabatt. Inga dolda avgifter i kassan. Beställ online.`,
    `Spara ${saved||pct} på erbjudandet. Inga dolda avgifter. Välj ditt paket online.`
  ]
};

const DESCRIPTION_CTA_PATTERN={
  en:/choose|order|compare|select|shop|complete your order/i,
  pt:/escolha|peça|compre|compare|selecione|finalize/i,
  it:/scegli|ordina|acquista|confronta|seleziona|completa/i,
  es:/elige|compra|compara|completa|aprovecha/i,
  fr:/choisissez|commandez|achetez|comparez|consultez|passez commande/i,
  de:/wählen|bestellen|vergleichen|schließen/i,
  sv:/välj|beställ|jämför|gör din beställning/i
};

function descriptionPercent(value,htmlLanguage){
  const lang=language(htmlLanguage),numeric=String(percent(value,htmlLanguage)).replace(/\s*%+\s*$/,'').trim();
  return ['fr','de','sv'].includes(lang)?`${numeric} %`:`${numeric}%`;
}

function descriptionCandidates(data,best,packages){
  if(!(best>0))return[];
  const lang=language(data.htmlLanguage),pct=descriptionPercent(best,data.htmlLanguage);
  const templates=DESCRIPTION_VARIANTS[lang]||DESCRIPTION_VARIANTS.en;
  const savingsContext=discountSavingsContext(data,packages,best),bestPackage=savingsContext.package;
  const saved=savingsContext.amount;
  const savedText=saved!==null?money(saved,data.currency,data.htmlLanguage):'';
  const label=bestPackage?.label||clean(data.product)||OFFER_REFERENCE[lang]||OFFER_REFERENCE.en;
  const savingCopy=SAVING_VARIANT[lang]||SAVING_VARIANT.en;
  const savingValues=saved!==null?within(savingCopy(savedText,pct,label),90).filter(item=>[...item].length>=70):[];
  const guarantee=guaranteeCopy(data),guaranteeName=guarantee?`${guarantee.phrase.charAt(0).toLocaleUpperCase()}${guarantee.phrase.slice(1)}`:'';
  const guaranteeVariants=GUARANTEE_SAVING_VARIANT[lang]||GUARANTEE_SAVING_VARIANT.en;
  const guaranteeOnlyVariants=GUARANTEE_DISCOUNT_VARIANT[lang]||GUARANTEE_DISCOUNT_VARIANT.en;
  const guaranteeValues=guarantee?within(saved!==null?guaranteeVariants(savedText,pct,label,guaranteeName):guaranteeOnlyVariants(pct,label,guaranteeName),90).filter(item=>[...item].length>=70):[];
  const shippingVariants=FAST_SHIPPING_VARIANT[lang]||FAST_SHIPPING_VARIANT.en;
  const freeShippingVariants=FREE_SHIPPING_VARIANT[lang]||FREE_SHIPPING_VARIANT.en;
  const shippingOnlyVariants=SHIPPING_DISCOUNT_ONLY_VARIANT[lang]||SHIPPING_DISCOUNT_ONLY_VARIANT.en;
  const shippingValues=data.fastShipping==='confirmed'?within(saved!==null?shippingVariants(savedText,pct,label):shippingOnlyVariants(pct,label,true),90).filter(item=>[...item].length>=70):[];
  const freeShippingValues=data.freeShipping==='confirmed'?within(saved!==null?freeShippingVariants(savedText,pct,label):shippingOnlyVariants(pct,label,false),90).filter(item=>[...item].length>=70):[];
  const limitedTimeVariants=LIMITED_TIME_DESCRIPTION[lang]||LIMITED_TIME_DESCRIPTION.en;
  const limitedTimeValues=data.urgencyConfirmed==='confirmed'?within(limitedTimeVariants(savedText,pct,label,TODAY_ONLY_PATTERN.test(String(data.rawText||''))),90).filter(item=>[...item].length>=70):[];
  const noHiddenFees=confirmedNoHiddenFees(data),noHiddenVariants=NO_HIDDEN_FEES_DESCRIPTION[lang]||NO_HIDDEN_FEES_DESCRIPTION.en;
  const noHiddenFeesValues=noHiddenFees?within(noHiddenVariants(savedText,pct,label),90).filter(item=>[...item].length>=70):[];
  const values=[...savingValues,...guaranteeValues,...shippingValues,...freeShippingValues,...limitedTimeValues,...noHiddenFeesValues,...templates(pct,label)];
  if(clean(data.product))values.push(...templates(pct,OFFER_REFERENCE[lang]||OFFER_REFERENCE.en));
  const callToAction=DESCRIPTION_CTA_PATTERN[lang]||DESCRIPTION_CTA_PATTERN.en;
  return values.filter(item=>item.includes(pct)&&callToAction.test(item));
}

function sitelink(text,line1,line2){return{ text:clean(text),line1:clean(line1),line2:clean(line2)}}
function firstWithin(values,limit){return unique(values).find(value=>[...value].length<=limit)||''}
function packageSavings(item){if(item.priceMode==='quantity_bundle'&&!item.promoTotalCalculated)return null;return item.regularPrice!==null&&item.promoPrice!==null&&item.regularPrice>item.promoPrice?Math.round((item.regularPrice-item.promoPrice+Number.EPSILON)*100)/100:null}
function packageForDiscount(packages,discount){
  if(discount===null||discount===undefined)return null;
  return packages.filter(item=>item.discountPercent!==null)
    .map(item=>({item,difference:Math.abs(item.discountPercent-discount)}))
    .filter(entry=>entry.difference<=0.6)
    .sort((a,b)=>a.difference-b.difference||b.item.discountPercent-a.item.discountPercent)[0]?.item||null;
}
export function discountAmountForPercent(packages=[],discountPercent){
  const target=number(discountPercent);
  if(target===null)return null;
  const matches=normalizePackages(packages).map(item=>{
    const amount=packageSavings(item),calculatedMatch=item.discountPercent!==null&&Math.abs(item.discountPercent-target)<=0.6;
    const stackedBaseMatch=item.discountBadgeStacked&&item.discountBadgeBasePercent!==null&&Math.abs(item.discountBadgeBasePercent-target)<=0.6;
    return amount!==null&&(calculatedMatch||stackedBaseMatch)?{amount,package:item,matchType:calculatedMatch?'calculated':'stacked-base'}:null;
  }).filter(Boolean).sort((a,b)=>b.amount-a.amount);
  return matches[0]||null;
}
function discountSavingsContext(data,packages,discount){
  const match=discountAmountForPercent(packages,discount),explicit=number(data.confirmedDiscountAmount);
  const amount=explicit!==null&&explicit>0?explicit:match?.amount??null;
  return {amount,package:match?.package||packageForDiscount(packages,discount)};
}
const OFFER_DETAILS_COPY={
  en:{details:'View Offer Details',overviewTitle:'Offer Overview',overviewText:'Review the product information and current purchase terms shown on the offer page before ordering.',priceTitle:'Pricing and Discount Details',shippingTitle:'Shipping & Guarantee',
    discountQuestion:'What discount and savings are confirmed?',shippingQuestion:'How is shipping handled?',guaranteeQuestion:'What guarantee is displayed?',moneyBackQuestion:'Is there a money-back guarantee?',termsQuestion:'Where can I review current offer terms?',
    noDiscount:'No discount details were confirmed. Check the offer page for current pricing and terms.',priceText:summary=>summary?`The offer confirms ${summary}. Review the offer page for current product pricing and checkout terms.`:'Check the offer page for current product pricing and checkout terms; no discount details were confirmed.',
    intro:(product,summary,guarantee)=>`${summary?`The offer confirms ${summary} on ${product}. `:`Review the current ${product} offer. `}${guarantee?`A ${guarantee} is displayed. `:''}Check shipping and purchase terms before ordering.`,
    shippingText:(shipping,guarantee)=>[...(shipping.length?shipping:['Review the offer page for current shipping terms.']),guarantee?`A ${guarantee} is displayed.`:'No guarantee term was confirmed.'].join(' '),
    discountAnswer:(summary)=>summary?`The offer confirms ${summary}. Check the offer page for current product pricing and checkout terms.`:'No discount details were confirmed. Check the offer page for current pricing and terms.',
    shippingAnswer:shipping=>shipping.length?shipping.join(' '):'Review the offer page for current shipping terms.',guaranteeAnswer:(guarantee,noGuarantee)=>guarantee?`A ${guarantee} is displayed for this offer.`:noGuarantee?'No guarantee term was confirmed.':'Review the offer page for the current guarantee terms.',termsAnswer:'Review the offer page for current pricing, shipping, and purchase terms.',
    percentage:pct=>`${pct}% Off`,savings:amount=>`Save ${amount}`,discountSummary:(pct,amount)=>pct&&amount?`${pct}% off and ${amount} in savings`:pct?`${pct}% off`:''},
  pt:{details:'Ver detalhes da oferta',overviewTitle:'Visão geral da oferta',overviewText:'Confira as informações do produto e as condições atuais exibidas na página da oferta antes de fazer o pedido.',priceTitle:'Detalhes de preço e desconto',shippingTitle:'Envio e garantia',
    discountQuestion:'Qual desconto e economia foram confirmados?',shippingQuestion:'Como funciona o envio?',guaranteeQuestion:'Qual garantia é exibida?',moneyBackQuestion:'Há garantia de reembolso?',termsQuestion:'Onde posso conferir as condições atuais da oferta?',
    noDiscount:'Nenhum detalhe de desconto foi confirmado. Consulte a página da oferta para ver os preços e condições atuais.',priceText:summary=>summary?`A oferta confirma ${summary}. Consulte a página da oferta para verificar o preço atual do produto e as condições do checkout.`:'Consulte a página da oferta para verificar o preço atual do produto e as condições do checkout; nenhum desconto foi confirmado.',
    intro:(product,summary,guarantee)=>`${summary?`A oferta confirma ${summary} em ${product}. `:`Confira a oferta atual de ${product}. `}${guarantee?`A oferta exibe ${guarantee}. `:''}Verifique as condições de envio e compra antes de fazer o pedido.`,
    shippingText:(shipping,guarantee)=>[...(shipping.length?shipping:['Consulte a página da oferta para verificar as condições atuais de envio.']),guarantee?`A oferta exibe ${guarantee}.`:'Nenhum prazo de garantia foi confirmado.'].join(' '),
    discountAnswer:(summary)=>summary?`A oferta confirma ${summary}. Consulte a página para verificar o preço atual do produto e as condições do checkout.`:'Nenhum detalhe de desconto foi confirmado. Consulte a página da oferta para ver os preços e condições atuais.',
    shippingAnswer:shipping=>shipping.length?shipping.join(' '):'Consulte a página da oferta para verificar as condições atuais de envio.',guaranteeAnswer:(guarantee,noGuarantee)=>guarantee?`A oferta exibe ${guarantee}.`:noGuarantee?'Nenhum prazo de garantia foi confirmado.':'Consulte a página da oferta para verificar os termos atuais da garantia.',termsAnswer:'Consulte a página da oferta para verificar preços, envio e condições atuais.',
    percentage:pct=>`${pct}% de desconto`,savings:amount=>`Economize ${amount}`,discountSummary:(pct,amount)=>pct&&amount?`${pct}% de desconto e economia de ${amount}`:pct?`${pct}% de desconto`:''},
  it:{details:"Vedi i dettagli dell'offerta",overviewTitle:"Panoramica dell'offerta",overviewText:"Prima di ordinare, consulta le informazioni sul prodotto e le condizioni di acquisto attuali mostrate nella pagina dell'offerta.",priceTitle:'Dettagli su prezzi e sconti',shippingTitle:'Spedizione e garanzia',discountQuestion:'Quali sconto e risparmio sono confermati?',shippingQuestion:'Come viene gestita la spedizione?',guaranteeQuestion:'Quale garanzia viene mostrata?',moneyBackQuestion:'È prevista una garanzia di rimborso?',termsQuestion:'Dove posso consultare le condizioni aggiornate?',noDiscount:'Non sono stati confermati dettagli sullo sconto. Consulta la pagina dell’offerta per prezzi e condizioni aggiornati.',priceText:s=>s?`L’offerta conferma ${s}. Consulta la pagina dell’offerta per il prezzo attuale e le condizioni di pagamento.`:'Consulta la pagina dell’offerta per il prezzo attuale e le condizioni di pagamento; non sono stati confermati dettagli sullo sconto.',intro:(p,s,g)=>`${s?`L’offerta conferma ${s} su ${p}. `:`Consulta l’offerta attuale di ${p}. `}${g?`È indicata ${g}. `:''}Verifica le condizioni di spedizione e acquisto prima di ordinare.`,shippingText:(s,g)=>[...(s.length?s:['Consulta la pagina dell’offerta per le condizioni di spedizione attuali.']),g?`È indicata ${g}.`:'Non è stato confermato alcun termine di garanzia.'].join(' '),discountAnswer:s=>s?`L’offerta conferma ${s}. Consulta la pagina per il prezzo attuale e le condizioni di pagamento.`:'Non sono stati confermati dettagli sullo sconto. Consulta la pagina dell’offerta per prezzi e condizioni aggiornati.',shippingAnswer:s=>s.length?s.join(' '):'Consulta la pagina dell’offerta per le condizioni di spedizione attuali.',guaranteeAnswer:(g,n)=>g?`Per questa offerta è indicata ${g}.`:n?'Non è stato confermato alcun termine di garanzia.':'Consulta la pagina dell’offerta per i termini di garanzia attuali.',termsAnswer:'Consulta la pagina dell’offerta per prezzi, spedizione e condizioni aggiornati.',percentage:p=>`${p}% di sconto`,savings:a=>`Risparmia ${a}`,discountSummary:(p,a)=>p&&a?`${p}% di sconto e ${a} di risparmio`:p?`${p}% di sconto`:''},
  es:{details:'Ver detalles de la oferta',overviewTitle:'Resumen de la oferta',overviewText:'Antes de realizar el pedido, consulta la información del producto y las condiciones de compra actuales que aparecen en la página de la oferta.',priceTitle:'Detalles de precios y descuentos',shippingTitle:'Envío y garantía',discountQuestion:'¿Qué descuento y ahorro están confirmados?',shippingQuestion:'¿Cómo se gestiona el envío?',guaranteeQuestion:'¿Qué garantía se muestra?',moneyBackQuestion:'¿Hay garantía de reembolso?',termsQuestion:'¿Dónde puedo consultar las condiciones actuales?',noDiscount:'No se confirmaron detalles del descuento. Consulta la página de la oferta para ver los precios y las condiciones actuales.',priceText:s=>s?`La oferta confirma ${s}. Consulta la página de la oferta para ver el precio actual y las condiciones de pago.`:'Consulta la página de la oferta para ver el precio actual y las condiciones de pago; no se confirmaron detalles del descuento.',intro:(p,s,g)=>`${s?`La oferta confirma ${s} en ${p}. `:`Consulta la oferta actual de ${p}. `}${g?`La oferta muestra ${g}. `:''}Revisa las condiciones de envío y compra antes de realizar el pedido.`,shippingText:(s,g)=>[...(s.length?s:['Consulta la página de la oferta para conocer las condiciones actuales de envío.']),g?`La oferta muestra ${g}.`:'No se confirmó ningún plazo de garantía.'].join(' '),discountAnswer:s=>s?`La oferta confirma ${s}. Consulta la página para ver el precio actual y las condiciones de pago.`:'No se confirmaron detalles del descuento. Consulta la página de la oferta para ver los precios y las condiciones actuales.',shippingAnswer:s=>s.length?s.join(' '):'Consulta la página de la oferta para conocer las condiciones actuales de envío.',guaranteeAnswer:(g,n)=>g?`Esta oferta muestra ${g}.`:n?'No se confirmó ningún plazo de garantía.':'Consulta la página de la oferta para ver las condiciones actuales de la garantía.',termsAnswer:'Consulta la página de la oferta para ver los precios, el envío y las condiciones actuales.',percentage:p=>`${p}% de descuento`,savings:a=>`Ahorra ${a}`,discountSummary:(p,a)=>p&&a?`${p}% de descuento y ${a} de ahorro`:p?`${p}% de descuento`:''},
  fr:{details:"Voir les détails de l'offre",overviewTitle:"Aperçu de l'offre",overviewText:"Avant de commander, consultez les informations sur le produit et les conditions d’achat actuellement affichées sur la page de l’offre.",priceTitle:'Détails des prix et réductions',shippingTitle:'Livraison et garantie',discountQuestion:'Quelle réduction et quelle économie sont confirmées ?',shippingQuestion:'Comment la livraison est-elle gérée ?',guaranteeQuestion:'Quelle garantie est affichée ?',moneyBackQuestion:'Une garantie de remboursement est-elle proposée ?',termsQuestion:'Où consulter les conditions actuelles ?',noDiscount:'Aucun détail de réduction n’a été confirmé. Consultez la page de l’offre pour les prix et conditions actuels.',priceText:s=>s?`L’offre confirme ${s}. Consultez la page de l’offre pour connaître le prix actuel et les conditions de paiement.`:'Consultez la page de l’offre pour connaître le prix actuel et les conditions de paiement ; aucun détail de réduction n’a été confirmé.',intro:(p,s,g)=>`${s?`L’offre confirme ${s} sur ${p}. `:`Consultez l’offre actuelle de ${p}. `}${g?`L’offre affiche ${g}. `:''}Vérifiez les conditions de livraison et d’achat avant de commander.`,shippingText:(s,g)=>[...(s.length?s:['Consultez la page de l’offre pour les conditions de livraison actuelles.']),g?`L’offre affiche ${g}.`:'Aucune durée de garantie n’a été confirmée.'].join(' '),discountAnswer:s=>s?`L’offre confirme ${s}. Consultez la page pour connaître le prix actuel et les conditions de paiement.`:'Aucun détail de réduction n’a été confirmé. Consultez la page de l’offre pour les prix et conditions actuels.',shippingAnswer:s=>s.length?s.join(' '):'Consultez la page de l’offre pour les conditions de livraison actuelles.',guaranteeAnswer:(g,n)=>g?`Cette offre affiche ${g}.`:n?'Aucune durée de garantie n’a été confirmée.':'Consultez la page de l’offre pour connaître les conditions de garantie actuelles.',termsAnswer:'Consultez la page de l’offre pour les prix, la livraison et les conditions actuels.',percentage:p=>`${p}% de réduction`,savings:a=>`Économisez ${a}`,discountSummary:(p,a)=>p&&a?`${p}% de réduction et ${a} d’économie`:p?`${p}% de réduction`:''},
  de:{details:'Angebotsdetails ansehen',overviewTitle:'Angebotsübersicht',overviewText:'Prüfen Sie vor der Bestellung die Produktinformationen und aktuellen Kaufbedingungen auf der Angebotsseite.',priceTitle:'Preis- und Rabattdetails',shippingTitle:'Versand und Garantie',discountQuestion:'Welcher Rabatt und welche Ersparnis sind bestätigt?',shippingQuestion:'Wie wird der Versand abgewickelt?',guaranteeQuestion:'Welche Garantie wird angezeigt?',moneyBackQuestion:'Gibt es eine Geld-zurück-Garantie?',termsQuestion:'Wo kann ich die aktuellen Angebotsbedingungen prüfen?',noDiscount:'Es wurden keine Rabattdetails bestätigt. Aktuelle Preise und Bedingungen finden Sie auf der Angebotsseite.',priceText:s=>s?`Das Angebot bestätigt ${s}. Prüfen Sie den aktuellen Produktpreis und die Zahlungsbedingungen auf der Angebotsseite.`:'Prüfen Sie den aktuellen Produktpreis und die Zahlungsbedingungen auf der Angebotsseite; es wurden keine Rabattdetails bestätigt.',intro:(p,s,g)=>`${s?`Das Angebot bestätigt ${s} für ${p}. `:`Prüfen Sie das aktuelle Angebot für ${p}. `}${g?`Angezeigt wird ${g}. `:''}Prüfen Sie Versand- und Kaufbedingungen vor der Bestellung.`,shippingText:(s,g)=>[...(s.length?s:['Aktuelle Versandbedingungen finden Sie auf der Angebotsseite.']),g?`Angezeigt wird ${g}.`:'Es wurde keine Garantiedauer bestätigt.'].join(' '),discountAnswer:s=>s?`Das Angebot bestätigt ${s}. Den aktuellen Produktpreis und die Zahlungsbedingungen finden Sie auf der Angebotsseite.`:'Es wurden keine Rabattdetails bestätigt. Aktuelle Preise und Bedingungen finden Sie auf der Angebotsseite.',shippingAnswer:s=>s.length?s.join(' '):'Aktuelle Versandbedingungen finden Sie auf der Angebotsseite.',guaranteeAnswer:(g,n)=>g?`Für dieses Angebot wird ${g} angezeigt.`:n?'Es wurde keine Garantiedauer bestätigt.':'Prüfen Sie die aktuellen Garantiebedingungen auf der Angebotsseite.',termsAnswer:'Aktuelle Preise, Versand- und Kaufbedingungen finden Sie auf der Angebotsseite.',percentage:p=>`${p}% Rabatt`,savings:a=>`Sie sparen ${a}`,discountSummary:(p,a)=>p&&a?`${p}% Rabatt und ${a} Ersparnis`:p?`${p}% Rabatt`:''},
  sv:{details:'Visa erbjudandedetaljer',overviewTitle:'Översikt över erbjudandet',overviewText:'Granska produktinformationen och de aktuella köpvillkoren på erbjudandesidan innan du beställer.',priceTitle:'Pris- och rabattdetaljer',shippingTitle:'Frakt och garanti',discountQuestion:'Vilken rabatt och besparing är bekräftad?',shippingQuestion:'Hur hanteras frakten?',guaranteeQuestion:'Vilken garanti visas?',moneyBackQuestion:'Finns det en återbetalningsgaranti?',termsQuestion:'Var kan jag läsa aktuella villkor?',noDiscount:'Inga rabattuppgifter har bekräftats. Läs erbjudandesidan för aktuella priser och villkor.',priceText:s=>s?`Erbjudandet bekräftar ${s}. Läs erbjudandesidan för aktuellt produktpris och betalningsvillkor.`:'Läs erbjudandesidan för aktuellt produktpris och betalningsvillkor; inga rabattuppgifter har bekräftats.',intro:(p,s,g)=>`${s?`Erbjudandet bekräftar ${s} på ${p}. `:`Läs det aktuella erbjudandet för ${p}. `}${g?`Erbjudandet visar ${g}. `:''}Kontrollera frakt- och köpvillkor innan du beställer.`,shippingText:(s,g)=>[...(s.length?s:['Läs erbjudandesidan för aktuella fraktvillkor.']),g?`Erbjudandet visar ${g}.`:'Ingen garantitid har bekräftats.'].join(' '),discountAnswer:s=>s?`Erbjudandet bekräftar ${s}. Läs sidan för aktuellt produktpris och betalningsvillkor.`:'Inga rabattuppgifter har bekräftats. Läs erbjudandesidan för aktuella priser och villkor.',shippingAnswer:s=>s.length?s.join(' '):'Läs erbjudandesidan för aktuella fraktvillkor.',guaranteeAnswer:(g,n)=>g?`Erbjudandet visar ${g}.`:n?'Ingen garantitid har bekräftats.':'Läs erbjudandesidan för aktuella garantivillkor.',termsAnswer:'Läs erbjudandesidan för aktuella priser, frakt och köpvillkor.',percentage:p=>`${p}% rabatt`,savings:a=>`Spara ${a}`,discountSummary:(p,a)=>p&&a?`${p}% rabatt och ${a} i besparing`:p?`${p}% rabatt`:''}
};
const UNCONFIRMED_MONEY_BACK={en:'Money-back guarantee',pt:'garantia de reembolso',it:'garanzia di rimborso',es:'garantía de reembolso',fr:'garantie de remboursement',de:'Geld-zurück-Garantie',sv:'återbetalningsgaranti'};
const PRODUCT_PRICE_COPY={
  en:{label:'Product price',unit:'per unit',bundle:'for the bundle',quantity:q=>`option of ${q} units`},
  pt:{label:'Preço do produto',unit:'por unidade',bundle:'pelo conjunto',quantity:q=>`opção de ${q} unidades`},
  it:{label:'Prezzo del prodotto',unit:'per unità',bundle:'per il pacchetto',quantity:q=>`opzione da ${q} unità`},
  es:{label:'Precio del producto',unit:'por unidad',bundle:'por el conjunto',quantity:q=>`opción de ${q} unidades`},
  fr:{label:'Prix du produit',unit:'par unité',bundle:'pour le lot',quantity:q=>`option de ${q} unités`},
  de:{label:'Produktpreis',unit:'pro Stück',bundle:'für das Paket',quantity:q=>`Option mit ${q} Stück`},
  sv:{label:'Produktpris',unit:'per enhet',bundle:'för paketet',quantity:q=>`alternativ med ${q} enheter`}
};
function offerDetailsCopy(data,t,product,discount,savings,guarantee,shippingTerms,guaranteeStatus){
  const copy=OFFER_DETAILS_COPY[language(data.htmlLanguage)]||OFFER_DETAILS_COPY.en,pct=discount===null?'':percent(discount,data.htmlLanguage),saved=savings===null?'':money(savings,data.currency,data.htmlLanguage),summary=copy.discountSummary(pct,saved),guaranteeText=guarantee?.phrase||'',titleParts=[product,pct?copy.percentage(pct):'',saved?copy.savings(saved):'',guarantee?.title||''].filter(Boolean);
  const guaranteeQuestion=guarantee?.moneyBack?copy.moneyBackQuestion:copy.guaranteeQuestion,noGuarantee=guaranteeStatus==='no';
  const productPrice=number(data.confirmedProductPrice),priceCopy=PRODUCT_PRICE_COPY[language(data.htmlLanguage)]||PRODUCT_PRICE_COPY.en,quantity=number(data.productPriceQuantity);
  const priceParts=productPrice!==null&&productPrice>=0?[`${priceCopy.label}: ${money(productPrice,data.currency,data.htmlLanguage)}`,data.productPriceBasis==='unit'?priceCopy.unit:quantity>1?priceCopy.bundle:'',quantity>1?priceCopy.quantity(quantity):'',clean(data.productPriceTerms)].filter(Boolean):[];
  const priceSentence=priceParts.length?`${priceParts.join(' · ')}. `:'';
  return {details:copy.details,offerMainTitle:titleParts.join(' | ')||PACKAGE_FREE_COPY[language(data.htmlLanguage)]?.title(product)||PACKAGE_FREE_COPY.en.title(product),offerIntro:copy.intro(product,summary,guaranteeText),offerOverviewTitle:copy.overviewTitle,offerOverviewText:copy.overviewText,priceTitle:copy.priceTitle,priceText:priceSentence+copy.priceText(summary),shippingGuaranteeTitle:copy.shippingTitle,shippingGuaranteeText:copy.shippingText(shippingTerms,guaranteeText),faqs:[
    {question:copy.discountQuestion,answer:priceSentence+copy.discountAnswer(summary)},
    {question:copy.shippingQuestion,answer:copy.shippingAnswer(shippingTerms)},
    {question:guaranteeQuestion,answer:copy.guaranteeAnswer(guaranteeText,noGuarantee)},
    {question:copy.termsQuestion,answer:copy.termsAnswer}
  ],mustContain:unique([product,pct?`${pct}%`:'',saved,priceSentence?money(productPrice,data.currency,data.htmlLanguage):'',guaranteeText,data.freeShipping==='confirmed'?t.freeShipping:'',data.fastShipping==='confirmed'?t.fastShipping:'']),mustNotContain:guarantee?.moneyBack?[]:[UNCONFIRMED_MONEY_BACK[language(data.htmlLanguage)]||UNCONFIRMED_MONEY_BACK.en]};
}
const SITELINK_LABELS={
  en:{savings:'Savings',top:'Top Discount',discount:'Discount Details',choose:'Choose Package',compare:'Compare Packages',offer:'Offer Details',details:'Product Details',guarantee:'Guarantee Details',guaranteeTerms:'Guarantee Terms',shipping:'Fast Dispatch',shippingOrder:'Fast Dispatch Order',shippingInfo:'Shipping Info',quickShipping:'Quick Shipping Info',online:'Shop Online'},
  pt:{savings:'Economia',top:'Maior desconto',discount:'Detalhes do desconto',choose:'Escolher pacote',compare:'Comparar pacotes',offer:'Detalhes da oferta',details:'Detalhes do produto',guarantee:'Detalhes da garantia',guaranteeTerms:'Termos da garantia',shipping:'Envio rápido',shippingOrder:'Pedido com envio rápido',shippingInfo:'Informações de envio',quickShipping:'Info de envio rápido',online:'Comprar online'},
  it:{savings:'Risparmio',top:'Sconto maggiore',discount:'Dettagli sconto',choose:'Scegli pacchetto',compare:'Confronta pacchetti',offer:'Dettagli offerta',details:'Dettagli prodotto',guarantee:'Dettagli garanzia',guaranteeTerms:'Termini garanzia',shipping:'Spedizione rapida',shippingOrder:'Ordine con spedizione rapida',shippingInfo:'Info spedizione',quickShipping:'Info spedizione rapida',online:'Acquista online'},
  es:{savings:'Ahorro',top:'Mayor descuento',discount:'Detalles descuento',choose:'Elige paquete',compare:'Compara paquetes',offer:'Detalles oferta',details:'Detalles producto',guarantee:'Detalles garantía',guaranteeTerms:'Términos garantía',shipping:'Envío rápido',shippingOrder:'Pedido con envío rápido',shippingInfo:'Info de envío',quickShipping:'Info envío rápido',online:'Compra online'},
  fr:{savings:'Économies',top:'Remise maximale',discount:'Détails remise',choose:'Choisir un pack',compare:'Comparer les packs',offer:'Détails offre',details:'Détails produit',guarantee:'Détails garantie',guaranteeTerms:'Conditions garantie',shipping:'Expédition rapide',shippingOrder:'Commande expédition rapide',shippingInfo:'Infos livraison',quickShipping:'Infos livraison rapide',online:'Acheter en ligne'},
  de:{savings:'Ersparnis',top:'Höchster Rabatt',discount:'Rabattdetails',choose:'Paket wählen',compare:'Pakete vergleichen',offer:'Angebotsdetails',details:'Produktdetails',guarantee:'Garantiedetails',guaranteeTerms:'Garantiebedingungen',shipping:'Schneller Versand',shippingOrder:'Bestellen mit Expressversand',shippingInfo:'Versandinfo',quickShipping:'Info schneller Versand',online:'Online bestellen'},
  sv:{savings:'Besparing',top:'Högsta rabatt',discount:'Rabattdetaljer',choose:'Välj paket',compare:'Jämför paket',offer:'Erbjudandedetaljer',details:'Produktdetaljer',guarantee:'Garantidetaljer',guaranteeTerms:'Garantivillkor',shipping:'Snabb leverans',shippingOrder:'Beställ med snabb leverans',shippingInfo:'Fraktinfo',quickShipping:'Info om snabb frakt',online:'Handla online'}
};
const SITELINK_DETAIL_LINE={en:'Review the offer details',pt:'Confira os detalhes da oferta',it:"Consulta i dettagli dell'offerta",es:'Consulta los detalles de la oferta',fr:"Consultez les détails de l'offre",de:'Prüfen Sie die Angebotsdetails',sv:'Granska erbjudandets detaljer'};
const SITELINK_GUARANTEE_LINE={en:'Review the guarantee terms',pt:'Confira os termos da garantia',it:'Consulta i termini della garanzia',es:'Consulta los términos de la garantía',fr:'Consultez les conditions de garantie',de:'Prüfen Sie die Garantiebedingungen',sv:'Granska garantivillkoren'};
function richSitelinks(data,t,packages,best){
  const htmlLanguage=data.htmlLanguage,currency=data.currency,lang=language(htmlLanguage),product=clean(data.product),save=savingLabel(htmlLanguage),labels=SITELINK_LABELS[lang]||SITELINK_LABELS.en;
  const savingsContext=discountSavingsContext(data,packages,best),bestPackage=savingsContext.package;
  const links=[];
  const add=(titles,line1s,line2s)=>{
    const text=unique(titles).find(value=>[...value].length<=25&&!links.some(existing=>existing.text.toLocaleLowerCase()===value.toLocaleLowerCase()))||'';
    const item=sitelink(text,firstWithin(line1s,35),firstWithin(line2s,35));
    if(item.text&&item.line1&&item.line2)links.push(item);
  };
  const saving=savingsContext.amount,saved=saving!==null?money(saving,currency,htmlLanguage):'',pct=best?percent(best,htmlLanguage):'';
  const maxDiscountLine=best?unique([bestPackage?`${bestPackage.label} · ${pct}% ${t.off}`:'',`${pct}% ${t.off} · ${t.offer}`,`${t.discount} ${pct}% · ${t.offer}`]):[`${t.view} · ${t.offer}`,`${t.packages} · ${t.offer}`];
  const savingsLine=saved?unique([`${save} ${saved} · ${pct}% ${t.off}`,`${saved} · ${pct}% ${t.off}`,`${save} ${saved} · ${t.order} ${t.now}`]):unique([`${t.save} ${pct}% · ${t.order} ${t.now}`,`${t.choose} ${t.bundle} · ${t.order} ${t.now}`]);
  if(best){
    const packageLine=bestPackage?unique([`${bestPackage.label} · ${pct}% ${t.off}`,`${pct}% ${t.off} · ${bestPackage.label}`]):maxDiscountLine;
    const ctaLine=unique([`${t.choose} ${t.bundle} · ${t.order} ${t.now}`,`${t.order} ${t.online}`,`${t.view} · ${t.offer}`]);
    const core=[
      [saved?[`${t.save} ${saved}`]:[`${t.discount} ${pct}%`],packageLine,savingsLine],
      [[`${pct}% ${t.off}`,`${t.discount} ${pct}%`],maxDiscountLine,savingsLine],
      [[labels.savings],savingsLine,ctaLine],
      [[labels.top],maxDiscountLine,savingsLine],
      [[labels.choose],packageLine,savingsLine],
      [[labels.compare],maxDiscountLine,ctaLine],
      [[labels.offer],maxDiscountLine,savingsLine],
      [[labels.online],packageLine,savingsLine]
    ];
    core.forEach(([titles,line1s,line2s])=>add(titles,line1s,line2s));
  }else{
    const ctaLine=[`${t.choose} ${t.bundle} · ${t.order} ${t.now}`,`${t.order} ${t.online}`,`${t.view} · ${t.offer}`];
    add([labels.offer,t.details],[SITELINK_DETAIL_LINE[lang]||SITELINK_DETAIL_LINE.en,`${t.view} · ${t.offer}`],ctaLine);
    add([labels.details,labels.online],[`${t.offer} · ${product||t.packages}`,`${t.packages} · ${t.offer}`],ctaLine);
    add([labels.choose],[`${t.choose} ${t.bundle} · ${t.offer}`,`${t.packages} · ${t.offer}`],ctaLine);
    add([labels.compare],[`${t.packages} · ${t.offer}`,SITELINK_DETAIL_LINE[lang]||SITELINK_DETAIL_LINE.en],ctaLine);
    add([t.packages,labels.shippingInfo],[`${t.view} · ${t.packages}`,SITELINK_DETAIL_LINE[lang]||SITELINK_DETAIL_LINE.en],ctaLine);
    add([labels.online],[`${t.offer} · ${t.details}`,`${t.packages} · ${t.offer}`],ctaLine);
    add([labels.shippingInfo,labels.discount],[`${t.offer} · ${t.details}`,SITELINK_DETAIL_LINE[lang]||SITELINK_DETAIL_LINE.en],ctaLine);
  }
  const guarantee=guaranteeCopy(data);
  if(guarantee){
    const guaranteeLine=unique([saved?`${compactGuaranteeTitle(data,guarantee)} · ${pct}% ${t.off}`:'',guarantee.phrase,`${compactGuaranteeTitle(data,guarantee)} · ${t.offer}`]);
    const guaranteeSavingsLine=saved?unique([`${save} ${saved} · ${pct}% ${t.off}`,`${saved} · ${pct}% ${t.off}`]):[];
    const guaranteeTerms=SITELINK_GUARANTEE_LINE[lang]||SITELINK_GUARANTEE_LINE.en;
    add([guarantee.title,labels.guarantee],guaranteeLine,[...guaranteeSavingsLine,guaranteeTerms,`${t.view} · ${t.order} ${t.now}`]);
    add([labels.guarantee],guaranteeLine,[...guaranteeSavingsLine,`${t.choose} ${t.bundle} · ${t.order} ${t.now}`,guaranteeTerms]);
    add([labels.guaranteeTerms],guaranteeLine,[guaranteeTerms,...guaranteeSavingsLine,saved?`${save} ${saved} · ${pct}% ${t.off}`:`${t.save} ${pct}% · ${t.order} ${t.now}`]);
  }
  if(data.fastShipping==='confirmed'){
    add([labels.shippingOrder,labels.shipping,t.fastShipping],[`${t.fastShipping} · ${t.offer}`,`${t.order} · ${t.offer}`],[...savingsLine,`${t.choose} ${t.bundle} · ${t.order} ${t.now}`,`${t.view} · ${t.details}`]);
    add([labels.quickShipping,labels.shippingInfo],[`${t.fastShipping} · ${t.offer}`,SITELINK_DETAIL_LINE[lang]||SITELINK_DETAIL_LINE.en],[...savingsLine,`${t.order} ${t.online}`,`${t.choose} ${t.bundle} · ${t.order} ${t.now}`]);
  }
  if(data.freeShipping==='confirmed')add([t.freeShipping],[`${t.freeShipping} · ${t.offer}`,`${t.view} · ${t.offer}`],[...savingsLine,`${t.choose} ${t.bundle} · ${t.order} ${t.now}`,SITELINK_DETAIL_LINE[lang]||SITELINK_DETAIL_LINE.en]);
  if(data.urgencyConfirmed==='confirmed'){
    const limitedTitle=LIMITED_TIME_OFFER_HEADLINE[lang]||LIMITED_TIME_OFFER_HEADLINE.en;
    add([limitedTitle,labels.offer],[maxDiscountLine[0],`${pct}% ${t.off} · ${t.offer}`],savingsLine);
    if(TODAY_ONLY_PATTERN.test(String(data.rawText||''))){
      const todayTitle={en:'Today-Only Offer',pt:'Oferta só Hoje',it:'Solo Oggi',es:'Solo Hoy',fr:"Offre Aujourd'hui",de:'Nur Heute',sv:'Endast Idag'}[lang]||'Today-Only Offer';
      add([todayTitle],[maxDiscountLine[0],`${pct}% ${t.off} · ${t.offer}`],savingsLine);
    }
  }
  if(data.scarcityConfirmed==='confirmed')add([LIMITED_STOCK_LABEL[lang]||LIMITED_STOCK_LABEL.en],[maxDiscountLine[0],`${pct}% ${t.off} · ${t.offer}`],savingsLine);
  const noHiddenFees=confirmedNoHiddenFees(data);
  if(noHiddenFees)add([noHiddenFees.title,labels.discount],[noHiddenFees.line,...maxDiscountLine],savingsLine);
  return links.filter(item=>item.line1.split(/\s+/).length>=2&&item.line2.split(/\s+/).length>=2).slice(0,20);
}

export function generateAssets(data={}){
  const t=dictionaryFor(data.htmlLanguage),packages=normalizePackages(data.packages),discounts=packages.map(item=>item.discountPercent).filter(value=>value!==null);
  const confirmedDiscount=number(data.confirmedDiscountPercent);
  const best=confirmedDiscount!==null?confirmedDiscount:discounts.length?Math.max(...discounts):null;
  const savingsContext=discountSavingsContext(data,packages,best),savingsCallout=savingsContext.amount!==null&&best?`${t.save} ${money(savingsContext.amount,data.currency,data.htmlLanguage)} · ${percent(best,data.htmlLanguage)}%`:'';
  const warnings=[];
  const headlines=within(headlineCandidates(data,t,best,packages),30).slice(0,40);
  if(headlines.length<30)warnings.push(`Apenas ${headlines.length} títulos únicos couberam no limite de 30 caracteres.`);
  const productCount=headlines.filter(item=>clean(data.product)&&item.toLocaleLowerCase().includes(clean(data.product).toLocaleLowerCase())).length;
  if(clean(data.product)&&productCount<10)warnings.push(`O nome do produto coube em ${productCount} títulos; o restante excederia 30 caracteres.`);
  const descriptions=within(descriptionCandidates(data,best,packages),90).filter(item=>[...item].length>=70).slice(0,15);
  const guarantee=guaranteeCopy(data);
  const noHiddenFees=confirmedNoHiddenFees(data);
  const callouts=within([
    savingsCallout,best?`${percent(best,data.htmlLanguage)}% ${t.off}`:'',data.freeShipping==='confirmed'?t.freeShipping:'',data.fastShipping==='confirmed'?t.fastShipping:'',compactGuaranteeTitle(data,guarantee),noHiddenFees?noHiddenFees.title:'',t.offer,t.packages,t.details,t.checkout
  ],25).slice(0,10);
  const links=richSitelinks(data,t,packages,best);
  if(!best)warnings.push('Nenhum percentual de desconto foi confirmado ou informado.');
  if(links.length<7)warnings.push(`Apenas ${links.length} sitelinks informativos puderam ser gerados com os dados confirmados; o mínimo recomendado é 7.`);
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
    if(item.packageQuantity!==null){const quantityUnit=item.quantityUnit||'pair',quantityLabel=quantityUnit==='pair'?(item.packageQuantity===1?'pair':'pairs'):(item.packageQuantity===1?quantityUnit:`${quantityUnit}s`);parts.push(`quantity ${item.packageQuantity} ${quantityLabel}`)}
    if(item.packageDescriptor)parts.push(`displayed package terms ${item.packageDescriptor}`);
  }else{
    if(item.promoPrice!==null)parts.push(money(item.promoPrice,data.currency,data.htmlLanguage));
    if(item.regularPrice!==null)parts.push(`${regularLabels[language(data.htmlLanguage)]||regularLabels.en} ${money(item.regularPrice,data.currency,data.htmlLanguage)}`);
  }
  if(item.discountPercent!==null)parts.push(`${percent(item.discountPercent,data.htmlLanguage)}% ${t.discount.toLowerCase()}`);
  if(item.discountBadgePercent!==null)parts.push(`displayed discount badge ${percent(item.discountBadgePercent,data.htmlLanguage)}%`);
  return parts.join(': ');
}

export function buildFicha(data={}){
  const t=dictionaryFor(data.htmlLanguage),lang=language(data.htmlLanguage),product=clean(data.product)||'CONFIRMAR',packages=normalizePackages(data.packages),packageFree=PACKAGE_FREE_COPY[lang]||PACKAGE_FREE_COPY.en;
  const guaranteeStatus=data.guaranteeStatus||(data.guaranteeDays?'confirmed':'pending');
  const packageDiscounts=packages.map(item=>item.discountPercent).filter(value=>value!==null),confirmedDiscount=number(data.confirmedDiscountPercent),bestDiscount=confirmedDiscount!==null?confirmedDiscount:packageDiscounts.length?Math.max(...packageDiscounts):null;
  const savingsAmount=bestDiscount!==null?discountSavingsContext(data,packages,bestDiscount).amount:null,guarantee=guaranteeCopy(data);
  const shippingTerms=[];
  if(data.freeShipping==='confirmed')shippingTerms.push(t.shipFree);
  else if(data.freeShipping==='no')shippingTerms.push(t.shipNoFree);
  if(data.fastShipping==='confirmed')shippingTerms.push(t.shipFast);
  const pending=[];
  if(!['confirmed','no'].includes(data.freeShipping))pending.push('Confirm whether free shipping applies.');
  if(!['confirmed','no'].includes(data.fastShipping))pending.push('Confirm whether fast shipping applies.');
  if(guaranteeStatus==='pending'||(guaranteeStatus==='confirmed'&&!data.guaranteeDays))pending.push('Confirm whether a guarantee applies and its current terms.');
  if(!['confirmed','no'].includes(data.urgencyConfirmed||'pending'))pending.push('No current promotional urgency has been validated for use.');
  if(!['confirmed','no'].includes(data.scarcityConfirmed||'pending'))pending.push('No current scarcity claim has been validated for use.');
  if(packages.some(item=>item.priceMode==='quantity_bundle'&&item.discountBadgePercent!==null&&item.discountPercent===null))pending.push('Review package(s) whose displayed discount badge does not match the calculated savings from comparable prices.');
  const details=offerDetailsCopy(data,t,product,bestDiscount,savingsAmount,guarantee,shippingTerms,guaranteeStatus);
  const mustNotContain=unique([
    'Unverified health or result claims','Results within a specific timeframe','Studies prove the results','Testimonials prove the results',data.freeShipping!=='confirmed'?'Free shipping is included':'',data.fastShipping!=='confirmed'?'Fast shipping is available':'',data.urgencyConfirmed!=='confirmed'?'Unverified urgency claims':'',data.scarcityConfirmed!=='confirmed'?'Unverified scarcity claims':'',...details.mustNotContain
  ]);
  return {
    destination:clean(data.destination)||'CONFIRMAR',
    assetFolder:clean(data.assetFolder)||'assets',
    htmlLanguage:clean(data.htmlLanguage)||'CONFIRMAR',
    countryCode:clean(data.countryCode).toUpperCase()||'CONFIRMAR',
    pageTitle:clean(data.pageTitle)||packageFree.title(product),
    affiliateUrl:clean(data.affiliateUrl)||'CONFIRMAR',
    cookieTitle:t.cookieTitle,
    cookieText:t.cookieText,
    acceptLabel:t.accept,
    declineLabel:t.decline,
    closeAriaLabel:t.close,
    detailsLabel:details.details,
    faqTitle:t.faq,
    offerMainTitle:clean(data.offerMainTitle)||details.offerMainTitle,
    offerIntro:clean(data.offerIntro)||details.offerIntro,
    offerOverviewTitle:clean(data.offerOverviewTitle)||details.offerOverviewTitle,
    offerOverviewText:clean(data.offerOverviewText)||details.offerOverviewText,
    priceTitle:clean(data.priceTitle)||details.priceTitle,
    priceText:clean(data.priceText)||details.priceText,
    shippingGuaranteeTitle:clean(data.shippingGuaranteeTitle)||details.shippingGuaranteeTitle,
    shippingGuaranteeText:clean(data.shippingGuaranteeText)||details.shippingGuaranteeText,
    faqs:Array.isArray(data.faqs)&&data.faqs.length===4?data.faqs:details.faqs,
    mustContain:details.mustContain,
    mustNotContain,
    pending,
    assumptions:unique(['Cookie interface labels were generated from the selected visible language.','Offer-detail section labels and FAQ prompts were generated in the selected language because no custom headings or questions were supplied.','Offer details use the confirmed discount and savings. Product price is included only when a detected price or manual correction is confirmed; Google Ads assets remain price-free.','A money-back guarantee is included only when its wording appears in the pasted offer text and a guarantee duration is confirmed.','The existing page contract requires four FAQs; the fourth directs visitors to current offer terms.'])
  };
}

export function generationBlockers(data={}, {scope='all'}={}){
  const blockers=[];
  if(missingConfirmation(data.product))blockers.push('Produto: informe o nome do produto');
  if(missingConfirmation(data.countryCode))blockers.push('País: informe o código de duas letras');
  if(missingConfirmation(data.htmlLanguage))blockers.push('Idioma HTML: selecione o idioma da página');
  if(!['confirmed','no'].includes(data.freeShipping))blockers.push('Frete grátis: confirme se aparece na oferta ou marque como não exibido');
  if(!['confirmed','no'].includes(data.fastShipping))blockers.push('Envio rápido: confirme se pode ser anunciado ou marque como não usar');
  const guaranteeStatus=data.guaranteeStatus||(data.guaranteeDays?'confirmed':'pending');
  if(guaranteeStatus==='pending')blockers.push('Garantia: confirme o prazo ou marque que não há garantia exibida');
  else if(guaranteeStatus==='confirmed'&&missingConfirmation(data.guaranteeDays))blockers.push('Garantia: informe o prazo confirmado');
  else if(guaranteeStatus==='no'&&data.guaranteeDays)blockers.push('Garantia: há um prazo preenchido, mas está marcada como não exibida');
  else if(!['confirmed','no'].includes(guaranteeStatus))blockers.push('Garantia: selecione um estado de confirmação válido');
  if(!['confirmed','no'].includes(data.urgencyConfirmed||'pending'))blockers.push('Urgência atual: confirme se a oferta exibe uma condição válida ou marque para não usar');
  if(!['confirmed','no'].includes(data.scarcityConfirmed||'pending'))blockers.push('Escassez atual: confirme se a oferta exibe uma condição válida ou marque para não usar');
  if(!clean(data.affiliateUrl)||clean(data.affiliateUrl).toUpperCase()==='CONFIRMAR')blockers.push('URL de afiliação');
  else if(!/^https?:\/\//i.test(clean(data.affiliateUrl)))blockers.push('URL de afiliação: informe uma URL completa iniciada por http:// ou https://');
  if(!clean(data.destination)||clean(data.destination).toUpperCase()==='CONFIRMAR')blockers.push('Diretório da Presell');
  if(missingConfirmation(data.currency))blockers.push('Moeda: selecione a moeda da oferta');
  if(clean(data.confirmedProductPrice)&&(number(data.confirmedProductPrice)===null||number(data.confirmedProductPrice)<0))blockers.push('Preço do produto: informe um valor válido, maior ou igual a zero');
  const mismatchIndexes=generationBlockerPackageIndexes(data);
  if(mismatchIndexes.length){
    const labels=mismatchIndexes.map(index=>clean(data.packages[index]?.label)||`Pacote ${index+1}`);
    const names=labels.length===1?labels[0]:`${labels.slice(0,-1).join(', ')} e ${labels.at(-1)}`;
    blockers.push(`Pacotes: o desconto calculado diverge do selo informado em ${names}. Revise os preços ou o percentual do selo.`);
  }
  return unique(blockers).filter(item=>scope!=='copy'||! /^(URL de afiliação|Diretório da Presell|Preço do produto:)/.test(item));
}

export function generationBlockerFields(data={}, {scope='all'}={}){
  const fields=new Set(),blockers=generationBlockers(data,{scope});
  if(missingConfirmation(data.product))fields.add('product');
  if(missingConfirmation(data.countryCode))fields.add('countryCode');
  if(missingConfirmation(data.htmlLanguage))fields.add('htmlLanguage');
  if(blockers.some(item=>item.startsWith('Frete grátis:')))fields.add('freeShipping');
  if(blockers.some(item=>item.startsWith('Envio rápido:')))fields.add('fastShipping');
  const guaranteeBlockers=blockers.filter(item=>item.startsWith('Garantia:'));
  if(guaranteeBlockers.some(item=>/confirme o prazo|selecione um estado/i.test(item)))fields.add('guaranteeStatus');
  if(guaranteeBlockers.some(item=>/informe o prazo|há um prazo preenchido/i.test(item)))fields.add('guaranteeDays');
  if(blockers.some(item=>item.startsWith('Urgência atual:')))fields.add('urgencyConfirmed');
  if(blockers.some(item=>item.startsWith('Escassez atual:')))fields.add('scarcityConfirmed');
  const affiliateUrl=clean(data.affiliateUrl);
  if(scope!=='copy'&&(!affiliateUrl||affiliateUrl.toUpperCase()==='CONFIRMAR'||!/^https?:\/\//i.test(affiliateUrl)))fields.add('affiliateUrl');
  if(blockers.includes('Diretório da Presell'))fields.add('destination');
  if(blockers.some(item=>item.startsWith('Moeda:')))fields.add('currency');
  if(blockers.some(item=>item.startsWith('Preço do produto:')))fields.add('confirmedProductPrice');
  if(blockers.some(item=>item.startsWith('Pacotes:')))fields.add('packages');
  return [...fields];
}

export function formatSitelinks(items=[]){return items.map(item=>[item.text,item.line1,item.line2].join('\n')).join('\n\n')}
export function fichaJson(data={}){return JSON.stringify(buildFicha(data),null,2)}
