import {getAll,STORES} from '../curadoria/clickbank-top-offers/clickbank-top-offers-storage.mjs?v=12';
import {latestByCountry} from '../curadoria/image-search-domain.mjs?v=1';

function normalizedCandidates(values) {
  const seen=new Set(),result=[];
  for(const raw of Array.isArray(values)?values:[]) {
    if(typeof raw!=='string')continue;
    const value=raw.trim(),key=value.toLocaleLowerCase('pt-BR');
    if(!value||seen.has(key))continue;
    seen.add(key);result.push(value);
  }
  return result;
}

/** Read saved positive Trends and negative Images candidates for ClickBank offers only. */
export async function listClickBankKeywordSources() {
  const [trendsRecords,imageRecords]=await Promise.all([getAll(STORES.trends),getAll(STORES.images)]);
  const byOfferKey=new Map();
  for(const record of [...(Array.isArray(trendsRecords)?trendsRecords:[]),...(Array.isArray(imageRecords)?imageRecords:[])]) {
    if(!record||typeof record.offerKey!=='string'||!record.offerKey
        ||typeof record.offerName!=='string'||!record.offerName.trim())continue;
    const current=byOfferKey.get(record.offerKey)||{
      offerKey:record.offerKey,
      offerName:record.offerName.trim(),
      seller:typeof record.seller==='string'?record.seller.trim():'',
      keywords:[],
      negativeKeywords:[],
      negativeKeywordCountries:[],
    };
    if(!current.offerName&&record.offerName.trim())current.offerName=record.offerName.trim();
    if(!current.seller&&typeof record.seller==='string')current.seller=record.seller.trim();
    if(record.assessments){
      const latest=latestByCountry(record.assessments);
      const countries=[...latest.keys()].sort((left,right)=>left.localeCompare(right,'en'));
      const candidatesByCountry=countries.map(country=>{
        const assessment=latest.get(country);
        const candidates=Array.isArray(assessment?.negativeKeywordCandidates)
          ?assessment.negativeKeywordCandidates:assessment?.relatedProducts;
        return {country,candidates:normalizedCandidates((Array.isArray(candidates)?candidates:[]).flatMap(value=>typeof value==='string'?value.split(/\s*×\s*/u):[]))};
      });
      current.negativeKeywords=normalizedCandidates(candidatesByCountry.flatMap(item=>item.candidates));
      current.negativeKeywordCountries=candidatesByCountry.filter(item=>item.candidates.length).map(item=>item.country);
    }
    if(Array.isArray(record.keywordCandidates))current.keywords=normalizedCandidates(record.keywordCandidates);
    byOfferKey.set(record.offerKey,current);
  }
  return [...byOfferKey.values()]
    .filter(record=>record.keywords.length||record.negativeKeywords.length)
    .sort((left,right)=>left.offerName.localeCompare(right.offerName,'pt-BR')||left.seller.localeCompare(right.seller,'pt-BR'));
}
