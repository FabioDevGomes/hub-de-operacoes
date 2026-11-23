// Identidade inclui o episódio para que o retorno de uma reprovação gere nova pendência.
export function policyReviewIdentity(item,ad,topic){
 const manager=String(item?.managerCustomerId||'direct'),customer=String(item?.customerId||''),campaign=String(item?.campaignId||''),group=String(ad?.adGroupId||''),adId=String(ad?.adId||''),code=String(topic?.topic||''),episode=String(topic?.episode||item?.episode||'legacy');
 if(!/^(direct|\d{10})$/.test(manager)||!/^\d{10}$/.test(customer)||![campaign,group,adId].every(x=>/^[1-9]\d{0,19}$/.test(x))||!code||code.length>200||episode.length>120)throw Error('Identidade de reprovação inválida.');
 return JSON.stringify([manager,customer,campaign,group,adId,code,episode]);
}
export function policyReviewRows(results,reviews={}){
 const rows=[];
 for(const item of Array.isArray(results)?results:[])for(const ad of Array.isArray(item.ads)?item.ads:[])for(const topic of Array.isArray(ad.topics)?ad.topics:[]){
  const key=policyReviewIdentity(item,ad,topic);rows.push({key,item,ad,topic,reviewedAtUtc:reviews[key]?.reviewedAtUtc||null});
 }
 return rows;
}
