(function(){
    function normalizeDate(value,reference){const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!match)return null;const date=`${match[1]}-${match[2]}-${match[3]}`;return date>reference?`2025-${match[2]}-${match[3]}`:date}
  function buildProducts(input){
    const {source,getProductName:testedProductName,getCampaignIdentity:campaignIdentity,getCampaignSheet:campaignSheet,referenceDate}=input;
    const normalizeTestedDate=value=>normalizeDate(value,referenceDate);
      const campaignFamily=name=>{const match=String(name||'').trim().match(/^(.*?)\s+0*(\d{1,3})(?:\s*[ºª°])?(?:\s*\[[^\]]+\])?$/);return match?{base:match[1].trim(),variant:String(Number(match[2]))}:null};
      const numericFamilies=new Map();
      for(const campaign of source){const name=testedProductName(campaign),family=campaignFamily(name);if(!family)continue;const key=family.base.toLocaleLowerCase('pt-BR'),variants=numericFamilies.get(key)||new Set();variants.add(family.variant);numericFamilies.set(key,variants)}
      const groups=new Map(),activeExact=new Set(input.activeCampaigns.map(c=>c.nome_campanha_exato.toLocaleLowerCase('pt-BR'))),activeSheets=new Set(input.activeCampaigns.map(c=>campaignSheet(c.nome_campanha_exato).toLocaleLowerCase('pt-BR'))),catalog=input.catalog;
      const addBilled=(group,value)=>{const amount=Number(value);if(value==null||value===''||!Number.isFinite(amount))return;group.totalBilled+=amount;group.billedObserved=true};
      for(const campaign of source){
        const originalName=testedProductName(campaign),family=campaignFamily(originalName),baseName=family?.base||originalName,name=(numericFamilies.get(baseName.toLocaleLowerCase('pt-BR'))?.size||0)>1?baseName:originalName,key=name.toLocaleLowerCase('pt-BR');
        if(!groups.has(key))groups.set(key,{key,name,campaigns:[],campaignDates:[],dates:[],active:false,totalBilled:0,billedObserved:false});
        const group=groups.get(key),campaignName=campaign.nome_mcc||campaign.nome_exibicao,campaignDate=normalizeTestedDate(campaignIdentity(campaignName).dateSort),summary=campaign.legacy_totais,legacyMetric=summary?.metrics?.commission_brl,legacyCommission=legacyMetric?.state==='observed'&&legacyMetric.value!=null&&legacyMetric.value!==''&&Number.isFinite(Number(legacyMetric.value))?Number(legacyMetric.value):null,legacyEndDate=summary?.end_date||null;
        group.campaigns.push(campaignName);if(campaignDate)group.campaignDates.push(campaignDate);
        group.active||=activeExact.has(String(campaign.nome_mcc||'').toLocaleLowerCase('pt-BR'))||activeSheets.has(String(campaign.nome_exibicao||'').toLocaleLowerCase('pt-BR'));
        if(legacyCommission!=null)addBilled(group,legacyCommission);
        const adjustment=input.salesAdjustments.get(campaign.id);
        if(legacyCommission!=null){if(legacyEndDate)for(const[date,item]of Object.entries(adjustment?.byDate||{}))if(date>legacyEndDate)addBilled(group,item?.commissionAdjustment)}
        else addBilled(group,adjustment?.commissionAdjustment);
        for(const row of input.dailyByCampaign.get(campaign.id)||[]){const date=normalizeTestedDate(row.data);if(date)group.dates.push(date);const rawBilled=row.celulas?.P?.value,afterLegacy=legacyCommission==null||(legacyEndDate&&String(row.data||'')>legacyEndDate);if(afterLegacy)addBilled(group,rawBilled)}
      }
      const hidden=new Set(catalog.ocultos);const products=[...groups.values()].filter(x=>!hidden.has(x.key)).map(x=>{const dates=x.dates.sort(),campaignDates=x.campaignDates.sort(),first=dates[0]||null,startDate=campaignDates[0]||normalizeTestedDate(catalog.datas_inicio[x.key])||first;return{...x,totalBilled:x.billedObserved?x.totalBilled:null,label:catalog.aliases[x.key]||x.name,startDate,first,last:dates.at(-1)||null}}).sort((a,b)=>a.label.localeCompare(b.label,'pt-BR',{numeric:true,sensitivity:'base'}));return products
    }
    function sortProducts(products,testedSortKey='status',testedSortDir='desc'){const value=(product,key)=>key==='product'?product.label:key==='date'?(product.startDate||''):key==='campaigns'?product.campaigns.length:key==='revenue'?product.totalBilled:key==='period'?(product.first||''):key==='status'?(product.active?1:0):key==='related'?product.campaigns.join(' '):'';return[...products].sort((a,b)=>{const left=value(a,testedSortKey),right=value(b,testedSortKey);if((left==null)!==(right==null))return left==null?1:-1;const comparison=typeof left==='number'&&typeof right==='number'?left-right:String(left??'').localeCompare(String(right??''),'pt-BR',{numeric:true,sensitivity:'base'});if(comparison)return testedSortDir==='asc'?comparison:-comparison;return a.label.localeCompare(b.label,'pt-BR',{numeric:true,sensitivity:'base'})})}
  window.TestedProductsDomain=Object.freeze({buildProducts,sortProducts,normalizeDate});
})();
