import {computeAutomaticSignal, signalSortValue} from '../automatic-signal-domain.mjs';
import {normalizeDecision, DEFAULT_DECISION} from '../decision-ui.mjs';
import {latestAssessment} from '../trends-domain.mjs';
import {progress} from '../image-search-domain.mjs';

export const BACKUP_FORMAT = 'curadoria-manual-backup-v1';
export const COLUMNS = Object.freeze([['product','Produto'],['network','Rede'],['trends','Google Trends'],['glimpse','Glimpse'],['images','Imagens'],['payout','Payout'],['signal','Sinal automático'],['decision','Decisão'],['updatedAt','Última atualização']]);
const text = value => String(value ?? '').trim();
export const fold = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function countryCodes(value) {
  const values = (Array.isArray(value) ? value : text(value).split(/[\s,;]+/)).map(code=>text(code).toUpperCase()).filter(Boolean);
  if(values.some(code=>!/^[A-Z]{2}$/.test(code))) throw new Error('Informe países por códigos de duas letras, separados por vírgula (ex.: US, DE).');
  return [...new Set(values)];
}
export function safeOfferUrl(value) {
  if(!text(value)) return '';
  let url; try {url = new URL(text(value));} catch {throw new Error('Informe um endereço completo http:// ou https://.');}
  if(!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('A URL da oferta deve usar http:// ou https://, sem credenciais.');
  return url.href;
}
function payoutValue(value) {
  if(value === '' || value == null) return null;
  const raw=text(value), normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
  if(!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Informe um payout válido, não negativo, com até duas casas decimais.');
  const amount=Number(normalized);
  if(!Number.isFinite(amount)) throw new Error('Payout inválido.');
  return amount;
}
export function productFromForm(input, previous=null, {id, now}={}) {
  const name=text(input.name); if(!name) throw new Error('Informe o nome do produto.');
  const value=payoutValue(input.payoutValue), currency=text(input.currency).toUpperCase();
  if(currency && !/^[A-Z]{3}$/.test(currency)) throw new Error('Informe a moeda com três letras (ex.: USD, BRL, EUR).');
  if(value!==null && !currency) throw new Error('Informe a moeda do payout; não vamos presumir a moeda.');
  const productId=previous?.productId||id;
  if(!productId || !now) throw new Error('Identidade e data do cadastro são necessárias.');
  return {...previous,productId,name,network:text(input.network),productType:text(input.productType),externalId:text(input.externalId),url:safeOfferUrl(input.url),countries:countryCodes(input.countries),payout:{value,currency:currency||null},notes:text(input.notes),hidden:previous?.hidden||false,createdAt:previous?.createdAt||now,updatedAt:now,revision:(previous?.revision||0)+1,history:previous?[...(previous.history||[]),{revision:previous.revision,changedAt:now,values:productValues(previous)}]:[]};
}
export function productValues(product) {
  return Object.fromEntries(['name','network','productType','externalId','url','countries','payout','notes','hidden','updatedAt'].map(key=>[key,product[key]]));
}
export function productSnapshot(product, {trends=[],images=[],analyses=[],decisions=[]}={}) {
  const own = values => values.find(record=>record.productId===product.productId);
  const trend=own(trends)||{productId:product.productId,assessments:[],keywordCandidates:[]};
  const image=own(images)||{productId:product.productId,assessments:[]};
  const glimpse=analyses.filter(record=>record.productId===product.productId).sort((a,b)=>String(b.capturedAt).localeCompare(String(a.capturedAt)))[0]||null;
  const decision=own(decisions)||{productId:product.productId,currentStatus:DEFAULT_DECISION,history:[]};
  const signal=computeAutomaticSignal({trends:trend,images:image,glimpse});
  return {product,trends:trend,images:image,glimpse,decision,trendLatest:latestAssessment(trend.assessments),progress:progress(image.assessments,product.countries),signal};
}
export function filteredProducts(state, {search='',network='',decision='',visibility='visible',sort='updatedAt',direction=-1}={}) {
  const query=fold(search);
  const rows=(state.products||[]).map(product=>productSnapshot(product,state)).filter(row=>{
    const p=row.product;
    return (visibility==='all'||(visibility==='hidden'?p.hidden:!p.hidden)) && (!network||p.network===network) && (!decision||normalizeDecision(row.decision.currentStatus)===decision) && (!query||fold([p.name,p.network,p.productType,p.externalId,p.notes,...p.countries].join(' ')).includes(query));
  });
  const sortValue=row=>({product:row.product.name,network:row.product.network,payout:row.product.payout.value,updatedAt:row.product.updatedAt,trends:row.trendLatest?.status,glimpse:row.glimpse?.parsed?.volume?.value,images:row.progress.done,signal:signalSortValue(row.signal),decision:row.decision.currentStatus})[sort];
  return rows.sort((a,b)=>{
    const av=sortValue(a),bv=sortValue(b);
    if(av==null||av==='')return bv==null||bv===''?a.product.productId.localeCompare(b.product.productId):1;
    if(bv==null||bv==='')return -1;
    // Different payout currencies are not converted or compared as one currency.
    if(sort==='payout'&&a.product.payout.currency!==b.product.payout.currency)return String(a.product.payout.currency).localeCompare(String(b.product.payout.currency));
    return (typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'pt-BR',{numeric:true}))*direction||a.product.productId.localeCompare(b.product.productId);
  });
}
export function validateBackup(payload) {
  if(payload?.format!==BACKUP_FORMAT)throw new Error('Este arquivo não é um backup da Curadoria manual.');
  const kinds=['products','trends','images','decisions','analyses'];
  if(kinds.some(kind=>!Array.isArray(payload[kind])))throw new Error('Backup incompleto. Nenhum dado foi restaurado.');
  const ids=new Set();
  for(const p of payload.products){
    if(!p || typeof p.productId!=='string'||!p.productId||ids.has(p.productId)||typeof p.name!=='string'||!text(p.name)||!Number.isInteger(p.revision)||p.revision<1||!Array.isArray(p.history)||!Number.isFinite(Date.parse(p.createdAt))||!Number.isFinite(Date.parse(p.updatedAt))||typeof p.hidden!=='boolean')throw new Error('Cadastro inválido ou repetido no backup.');
    if(['network','productType','externalId','url','notes'].some(key=>typeof p[key]!=='string')||p.history.some(entry=>!entry||!entry.values||typeof entry.values.name!=='string'||!Number.isFinite(Date.parse(entry.changedAt))))throw new Error('Histórico de cadastro inválido no backup.');
    countryCodes(p.countries); if(!Array.isArray(p.countries)||JSON.stringify(countryCodes(p.countries))!==JSON.stringify(p.countries))throw new Error('Países inválidos no backup.');
    safeOfferUrl(p.url); payoutValue(p.payout?.value);
    if(!p.payout||p.payout.value!==null&&(!Number.isFinite(p.payout.value)||!/^[A-Z]{3}$/.test(p.payout.currency)))throw new Error('Payout inválido no backup.');
    ids.add(p.productId);
  }
  for(const kind of kinds.slice(1)){
    const keys=new Set();
    for(const r of payload[kind]){
      const key=kind==='analyses'?r?.analysisId:r?.productId;
      if(!r||!ids.has(r.productId)||typeof key!=='string'||!key||keys.has(key))throw new Error('Análise sem cadastro ou identidade repetida no backup.');
      keys.add(key);
      if(kind==='analyses'){
        const parsed=r.parsed,sources=['peopleAlsoSearch','relatedTrends','regions','relatedTopics','relatedQueries'];
        if(r.productKey!==r.productId||!parsed||!parsed.basic||!parsed.volume||!parsed.movement||!parsed.seasonality||!parsed.channel||sources.some(key=>!Array.isArray(parsed[key]?.items))||!r.indicators?.categoryCounts||!r.indicators.coverage||!r.indicators.contamination||!r.indicators.geography||!r.indicators.intent||!r.classified||['peopleAlsoSearch','relatedTrends','relatedTopics','relatedQueries'].some(key=>!Array.isArray(r.classified[key]))||!r.signal||!Array.isArray(r.signal.reasons)||!Array.isArray(r.offerIds)||!Number.isFinite(Date.parse(r.capturedAt)))throw new Error('Glimpse inválido no backup.');
      }else if(kind==='decisions'){
        if(!Array.isArray(r.history)||normalizeDecision(r.currentStatus)!==r.currentStatus||typeof (r.notes??'')!=='string'||(r.notes??'').length>5000||r.history.some(entry=>!entry||!entry.entryId||normalizeDecision(entry.status)!==entry.status||!Number.isFinite(Date.parse(entry.capturedAt))||typeof (entry.notes??'')!=='string'||(entry.notes??'').length>5000))throw new Error('Decisão inválida no backup.');
      }else {
        if(!Array.isArray(r.assessments)||kind==='trends'&&(!Array.isArray(r.keywordCandidates)||r.keywordCandidates.some(value=>typeof value!=='string')))throw new Error('Histórico inválido no backup.');
        for(const entry of r.assessments){
          const allowed=kind==='trends'?['up','stable','down','point_peak','low_volume','no_data','inconclusive']:['dominant','mixed','scarce','absent','ambiguous','inconclusive'];
          if(!entry||!entry.assessmentId||!allowed.includes(entry.status)||!Number.isFinite(Date.parse(entry.capturedAt))||!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||kind==='images'&&(!/^[A-Z]{2}$/.test(entry.country)||!Array.isArray(entry.negativeKeywordCandidates)||entry.negativeKeywordCandidates.some(value=>typeof value!=='string'))||kind==='trends'&&(!Array.isArray(entry.countries)||JSON.stringify(countryCodes(entry.countries))!==JSON.stringify(entry.countries)||entry.countries.length>5))throw new Error('Avaliação inválida no backup.');
        }
      }
    }
  }
  return payload;
}
