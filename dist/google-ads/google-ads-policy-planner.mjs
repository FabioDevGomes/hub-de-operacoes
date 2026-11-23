export const POLICY_RECHECK_MS=24*60*60*1000;
export function planPolicyChecks(campaigns,previous,now=Date.now()){
 if(!Array.isArray(campaigns)||!Number.isFinite(now))throw Error('Inventário de campanhas inválido.');
 const old=previous&&typeof previous==='object'?previous:{},next=Object.fromEntries(Object.entries(old).map(([id,value])=>[id,{...value,rejected:false}])),due=[];
 for(const campaign of campaigns){
  const id=String(campaign?.campaignId||'');if(!/^[1-9]\d{0,19}$/.test(id))throw Error('Campanha sem identidade válida.');
  const rejected=Array.isArray(campaign.primaryStatusReasons)&&campaign.primaryStatusReasons.includes('HAS_ADS_DISAPPROVED'),prior=old[id]||{},last=Date.parse(prior.attemptAtUtc||'');
  next[id]={...prior,rejected};
  if(rejected&&(!prior.rejected||!Number.isFinite(last)||now-last>=POLICY_RECHECK_MS))due.push(id);
 }
 return {due,next};
}
export function policyTopicsForCampaign(ads,campaignId){
 if(!Array.isArray(ads))throw Error('Anúncios indisponíveis.');
 return ads.filter(ad=>ad.campaign_id===String(campaignId)&&ad.approval_status==='DISAPPROVED').map(ad=>({adGroupId:ad.ad_group_id,adId:ad.ad_id,topics:ad.topics.map(topic=>({topic:topic.topic,type:topic.type}))}));
}
