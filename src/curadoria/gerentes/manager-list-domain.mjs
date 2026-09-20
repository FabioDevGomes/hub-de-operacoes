const MONTHS={jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
const EUROPE=new Set(['AL','AD','AT','BE','BY','BA','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','XK','LV','LI','LT','LU','MT','MD','MC','ME','NL','MK','NO','PL','PT','RO','RU','SM','RS','SK','SI','ES','SE','CH','TR','UA','UK','GB']);
const DESCRIPTOR=/\s+-\s+(?:(?:German|French|Spanish|Portuguese|Swedish|Finnish|Italian|Dutch|Norwegian|Danish) Page|CTC\b|Accepts Paypal\b|Direct Checkout Link\b|Including Checkout Event Tracking\b|Presell Page\b|High CTC\b|Low CTC\b).*$/i;

export function normalize(value=''){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
export function baseProductName(title=''){return String(title).replace(DESCRIPTOR,'').trim()}
export function parseEmailDate(text='',referenceDate=new Date()){
  const value=String(text),full=value.match(/(\d{1,2})\s+de\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?(?:\s+de)?\s+(\d{4})/i);
  if(full)return `${full[3]}-${String(MONTHS[full[2].toLowerCase()]).padStart(2,'0')}-${full[1].padStart(2,'0')}`;
  const short=value.match(/(\d{1,2})\s+de\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?\s*,/i);
  if(!short)return null;
  const month=MONTHS[short[2].toLowerCase()],day=Number(short[1]);let year=referenceDate.getFullYear();
  const candidate=new Date(year,month-1,day);if(candidate.getTime()>referenceDate.getTime()+86400000)year-=1;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
export function parseManagerEmail(text='',referenceDate=new Date()){
  const lines=String(text).replace(/\r/g,'').split('\n').map(x=>x.trim());
  const collectedAt=parseEmailDate(text,referenceDate),subject=lines.find(x=>/GuruMedia New Offers Approved/i.test(x))||'Lista de gerente';
  const offers=[];
  for(let i=0;i<lines.length;i++){
    const head=lines[i].match(/^(\d+)\s*\|\s*(.+)$/);if(!head)continue;
    const id=head[1],full=head[2];
    const suffix=full.match(/\s+-\s+\(([^)]+)\)\s+-\s+\[([^\]]+)\]\s*$/);
    if(!suffix)continue;
    const offerTitle=full.slice(0,suffix.index).trim(),category=suffix[1].trim(),countriesRaw=suffix[2].trim();
    const payoutLine=lines.slice(i+1,i+6).find(x=>/^Payout:/i.test(x))||'',rulesLine=lines.slice(i+1,i+7).find(x=>/^Traffic rules:/i.test(x))||'',linkLine=lines.slice(i+1,i+8).find(x=>/^Tracking link:/i.test(x))||'';
    const payout=Number(payoutLine.match(/\$\s*([\d.]+)/)?.[1]||0),trafficRules=rulesLine.replace(/^Traffic rules:\s*/i,'').trim(),trackingLink=linkLine.replace(/^Tracking link:\s*/i,'').trim();
    const countries=[...countriesRaw.matchAll(/\b[A-Z]{2}\b/g)].map(x=>x[0]);
    const additionalCountries=Number(countriesRaw.match(/\+\s*(\d+)\s+more/i)?.[1]||0);
    const productName=baseProductName(offerTitle),lower=offerTitle.toLowerCase();
    offers.push({id,productName,productKey:normalize(productName),offerTitle,variant:offerTitle.slice(productName.length).replace(/^\s*-\s*/,'').trim(),category,countries,countriesRaw,additionalCountries,payout,trafficRules,trackingLink,features:{paypal:lower.includes('accepts paypal'),directCheckout:lower.includes('direct checkout link'),checkoutTracking:lower.includes('checkout event tracking'),presell:lower.includes('presell page')},collectedAt,source:subject});
  }
  return {offers,collectedAt,source:subject};
}
export function groupProducts(offers=[]){
  const groups=new Map();
  for(const offer of offers){const group=groups.get(offer.productKey)||{key:offer.productKey,name:offer.productName,offers:[]};group.offers.push(offer);groups.set(offer.productKey,group)}
  return [...groups.values()].map(group=>{
    const payouts=group.offers.map(x=>x.payout).filter(Boolean),countrySet=new Set(group.offers.flatMap(x=>x.countries)),restricted=group.offers.filter(x=>x.trafficRules&&!/^none\.?$/i.test(x.trafficRules));
    const summary={...group,variantCount:group.offers.length,countries:[...countrySet],hasAdditionalCountries:group.offers.some(x=>x.additionalCountries>0),minPayout:payouts.length?Math.min(...payouts):0,maxPayout:payouts.length?Math.max(...payouts):0,restrictedCount:restricted.length,directCheckout:group.offers.some(x=>x.features.directCheckout),checkoutTracking:group.offers.some(x=>x.features.checkoutTracking),presell:group.offers.some(x=>x.features.presell),paypal:group.offers.some(x=>x.features.paypal)};
    return {...summary,signal:scoreProduct(summary)};
  }).sort((a,b)=>b.signal.score-a.signal.score||b.maxPayout-a.maxPayout||a.name.localeCompare(b.name));
}
export function scoreProduct(product){
  let score=product.maxPayout>=80?25:product.maxPayout>=60?18:product.maxPayout>=45?10:5;
  const europe=product.countries.filter(x=>EUROPE.has(x)).length;score+=product.hasAdditionalCountries||europe>=3?20:europe?14:0;
  if(product.checkoutTracking)score+=15;if(product.directCheckout)score+=15;if(product.presell)score+=5;if(product.restrictedCount===0)score+=15;else score+=5;if(product.variantCount>1)score+=10;
  score=Math.min(score,100);const decision=score>=70?'Prioritário':score>=45?'Investigar oferta':'Monitorar';
  return {score,decision,rule:'pagamento, cobertura europeia, recursos técnicos, restrições e quantidade de variantes'};
}
export function compareProductLists(currentOffers=[],previousOffers=[]){
  const current=groupProducts(currentOffers),previous=groupProducts(previousOffers),currentKeys=new Set(current.map(x=>x.key)),previousKeys=new Set(previous.map(x=>x.key));
  const currentWithMovement=current.map(product=>({...product,movement:previousKeys.has(product.key)?'permaneceu':'novo'}));
  const notRepeated=previous.filter(product=>!currentKeys.has(product.key)).map(product=>({...product,movement:'nao_repetido'}));
  return {current:currentWithMovement,notRepeated,counts:{new:currentWithMovement.filter(x=>x.movement==='novo').length,remained:currentWithMovement.filter(x=>x.movement==='permaneceu').length,notRepeated:notRepeated.length}};
}
export function upsertObservation(history=[],entry){const list=[...history],index=list.findIndex(x=>x.date===entry.date);if(index>=0)list[index]=entry;else list.push(entry);return list.sort((a,b)=>a.date.localeCompare(b.date))}
