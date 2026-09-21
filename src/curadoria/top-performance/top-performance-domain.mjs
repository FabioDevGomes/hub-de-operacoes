const BADGE_LINES=/^(?:new|top|brand\s*ok)(?:\s*(?:new|top|brand\s*ok))*$/i;
const COUNTRY_LINE=/^([A-Z]{2}(?:\s*,\s*[A-Z]{2})*)(?:\s*\+\s*(\d+))?$/;
const PAYOUT_LINE=/^\$\s*([\d.,]+)$/;
const LANGUAGES=['French','German','Italian','Spanish','Portuguese','Swedish','Finnish','Dutch','Norwegian','Danish','English'];

export function normalize(value=''){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
export function decodeText(value=''){return String(value).replace(/&#x([0-9a-f]+);/gi,(_,hex)=>String.fromCodePoint(parseInt(hex,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\\_/g,'_').trim()}
export function badgeFlags(value=''){const folded=normalize(value);return {new:folded.includes('new'),top:folded.includes('top'),brandOk:/brand\s*ok/.test(folded)}}
export function declaredOfferCount(raw=''){const match=String(raw).match(/Top\s+Performers\s*(\d+)\s*offers/i);return match?Number(match[1]):null}
export function parseMoney(value){const clean=String(value||'').replace(/[^\d.,-]/g,'');if(!clean)return null;const normalized=clean.includes(',')&&!clean.includes('.')?clean.replace(',','.'):clean.replace(/,/g,'');const number=Number(normalized);return Number.isFinite(number)?number:null}
function thumbnailFor(block,id){const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),url=block.match(new RegExp(`https?:\\/\\/[^\\s)\\]]*${escaped}[^\\s)\\]]*`,'i'))?.[0];return url||null}
function structuredDetails(rawDetails=''){
  const text=decodeText(rawDetails),lower=text.toLowerCase(),language=LANGUAGES.find(item=>new RegExp(`\\b${item}\\s+page\\b`,'i').test(text))||null;
  const ctc=text.match(/\bCTC\s*((?:AU|CA|US)?\$)\s*([\d.,]+)/i),variant=text.match(/\bV\s*(\d+)\b/i);
  return {rawDetails:text,pageLanguage:language,variant:variant?`V${variant[1]}`:null,ctcValue:ctc?parseMoney(ctc[2]):null,ctcCurrency:ctc?(ctc[1].toUpperCase()==='AU$'?'AUD':'USD'):null,flags:{acceptsPaypal:/accepts paypal/i.test(text),presellPage:/presell page/i.test(text),directCheckout:/direct checkout link/i.test(text),higherCpa:/higher cpa/i.test(text),lowCtc:/\blow(?:er)? ctc\b/i.test(text)}};
}
function linesFrom(raw=''){return String(raw).replace(/\r/g,'').split('\n').map(line=>decodeText(line)).map(line=>line.replace(/^[-*]\s+/,'').trim())}
export function parseTopPerformers(raw=''){
  const lines=linesFrom(raw),declaredCount=declaredOfferCount(raw),anchors=[];
  for(let index=0;index<lines.length;index++){const match=lines[index].match(/^(.+?)#(\d+)$/);if(match)anchors.push({index,anchorName:match[1].trim(),offerId:match[2]})}
  const offers=[],issues=[],seen=new Set();
  for(let position=0;position<anchors.length;position++){
    const anchor=anchors[position],end=anchors[position+1]?.index??lines.length,block=lines.slice(anchor.index,end),previous=lines.slice(Math.max(0,anchor.index-4),anchor.index).filter(Boolean),badgeText=previous.filter(line=>BADGE_LINES.test(line)).join(' '),badges=badgeFlags(badgeText);
    if(seen.has(anchor.offerId)){issues.push({offerId:anchor.offerId,reason:'ID repetido na colagem'});continue}seen.add(anchor.offerId);
    const content=block.slice(1).filter(Boolean),productName=content[0]&&!/^https?:/i.test(content[0])?content[0]:anchor.anchorName;
    const countryIndex=content.findIndex(line=>COUNTRY_LINE.test(line)),payoutIndex=content.findIndex(line=>PAYOUT_LINE.test(line));
    const countryMatch=countryIndex>=0?content[countryIndex].match(COUNTRY_LINE):null,payoutMatch=payoutIndex>=0?content[payoutIndex].match(PAYOUT_LINE):null;
    const detailStart=Math.max(0,content.indexOf(productName)+1),detailEnd=Math.min(countryIndex<0?content.length:countryIndex,payoutIndex<0?content.length:payoutIndex),rawDetails=content.slice(detailStart,detailEnd).filter(line=>!/^https?:/i.test(line)).join(' - ').trim(),details=structuredDetails(rawDetails);
    const countriesVisible=countryMatch?countryMatch[1].split(',').map(code=>code.trim()).filter(Boolean):[],additionalCountryCount=countryMatch?.[2]?Number(countryMatch[2]):0,payoutValue=payoutMatch?parseMoney(payoutMatch[1]):null;
    if(!productName)issues.push({offerId:anchor.offerId,reason:'Produto ausente'});if(payoutValue===null)issues.push({offerId:anchor.offerId,reason:'Payout ausente'});
    offers.push({offerId:anchor.offerId,productName,productKey:normalize(productName),thumbnailUrl:thumbnailFor(block.join('\n'),anchor.offerId),badges,countriesVisible,additionalCountryCount,fullCountries:null,payout:{value:payoutValue,currency:'USD',raw:payoutMatch?.[0]||''},...details,sourceOrder:position+1});
  }
  if(declaredCount!==null&&declaredCount!==offers.length)issues.unshift({reason:`A fonte declara ${declaredCount} ofertas, mas ${offers.length} foram interpretadas.`});
  return {offers,declaredCount,parsedCount:offers.length,issues,valid:offers.length>0&&declaredCount===offers.length};
}
export function snapshotFromOffer(offer,{collectionId,capturedAt}){return {snapshotId:`${collectionId}::${offer.offerId}`,collectionId,capturedAt,offerId:offer.offerId,sourceOrder:offer.sourceOrder,productName:offer.productName,productKey:offer.productKey,payout:structuredClone(offer.payout),countriesVisible:[...offer.countriesVisible],additionalCountryCount:offer.additionalCountryCount,badges:{...offer.badges},rawDetails:offer.rawDetails,thumbnailUrl:offer.thumbnailUrl,pageLanguage:offer.pageLanguage,variant:offer.variant,ctcValue:offer.ctcValue,ctcCurrency:offer.ctcCurrency,flags:{...offer.flags}}}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
export function fieldChanges(current,previous,collectionId,capturedAt){if(!previous)return[];const fields=[['payout',previous.payout?.value,current.payout?.value],['countriesVisible',previous.countriesVisible,current.countriesVisible],['additionalCountryCount',previous.additionalCountryCount,current.additionalCountryCount],['badges',previous.badges,current.badges],['rawDetails',previous.rawDetails,current.rawDetails],['thumbnailUrl',previous.thumbnailUrl,current.thumbnailUrl]];return fields.filter(([,oldValue,newValue])=>!same(oldValue,newValue)).map(([field,oldValue,newValue])=>({offerId:current.offerId,field,oldValue,newValue,collectionId,capturedAt}))}
export function compareCollections(current=[],previous=[],knownOfferIds=[]){
  const prev=new Map(previous.map(item=>[item.offerId,item])),now=new Map(current.map(item=>[item.offerId,item])),known=new Set(knownOfferIds),entries=[],changes=[];
  for(const item of current){const before=prev.get(item.offerId),wasKnown=known.has(item.offerId);let movement='new',positionDelta=null;if(before){positionDelta=before.sourceOrder-item.sourceOrder;movement=positionDelta>0?'up':positionDelta<0?'down':'same'}else if(wasKnown)movement='returned';const itemChanges=fieldChanges(item,before,item.collectionId,item.capturedAt);changes.push(...itemChanges);entries.push({offerId:item.offerId,movement,previousOrder:before?.sourceOrder??null,currentOrder:item.sourceOrder,positionDelta,changes:itemChanges})}
  for(const item of previous)if(!now.has(item.offerId))entries.push({offerId:item.offerId,movement:'exited',previousOrder:item.sourceOrder,currentOrder:null,positionDelta:null,changes:[]});
  const count=movement=>entries.filter(item=>item.movement===movement).length,changed=field=>changes.filter(item=>item.field===field).length;
  return {entries,changes,summary:{new:count('new'),remained:count('up')+count('down')+count('same'),up:count('up'),down:count('down'),same:count('same'),exited:count('exited'),returned:count('returned'),payoutChanges:changed('payout'),countryChanges:changed('countriesVisible')+changed('additionalCountryCount'),badgeChanges:changed('badges')}};
}
export function mergeOffer(existing,offer,{collectionId,capturedAt,movement,positionDelta=null}){return {...existing,...offer,firstSeenAt:existing?.firstSeenAt||capturedAt,lastSeenAt:capturedAt,presentInLatestCollection:true,latestCollectionId:collectionId,latestSourceOrder:offer.sourceOrder,latestMovement:movement,positionDelta}}
export function markExited(existing,{collectionId,capturedAt}){return {...existing,presentInLatestCollection:false,latestCollectionId:collectionId,latestMovement:'exited',lastMovementAt:capturedAt}}
export function appendDecision(current,status,notes,capturedAt=new Date().toISOString()){const history=[...(current?.history||[]),{status,notes,capturedAt}];return {offerId:current?.offerId,currentStatus:status,notes,updatedAt:capturedAt,history}}
export function groupOffers(offers=[]){const groups=new Map();for(const offer of offers){const group=groups.get(offer.productKey)||{productKey:offer.productKey,productName:offer.productName,offers:[]};group.offers.push(offer);groups.set(offer.productKey,group)}return [...groups.values()]}
export function movementLabel(value,delta){return value==='new'?'Nova':value==='returned'?'Retornou':value==='exited'?'Saiu':value==='up'?`↑ ${Math.abs(delta||0)}`:value==='down'?`↓ ${Math.abs(delta||0)}`:'= 0'}
