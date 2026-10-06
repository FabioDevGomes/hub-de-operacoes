(function(){
  function normalizeDate(value,reference){const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!match)return null;const date=`${match[1]}-${match[2]}-${match[3]}`;return date>reference?`2025-${match[2]}-${match[3]}`:date}
  function metricValue(value){return value&&typeof value==='object'&&Object.hasOwn(value,'value')?value.value:value}
  function conversionValue(value){const raw=metricValue(value);if(raw==null||raw===''||!Number.isFinite(Number(raw))||Number(raw)<0)return null;return Number(raw)}
  function validIsoDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):null}
  const EDIT_FIELDS=Object.freeze([
    {key:'label',label:'Nome do produto',type:'text'},
    {key:'startDate',label:'Data',type:'date'},
    {key:'active',label:'Situação',type:'status'},
    {key:'campaignCount',label:'Quantidade de campanhas',type:'number'},
    {key:'salesCount',label:'Vendas',type:'number'},
    {key:'totalBilled',label:'Total faturado (R$)',type:'number'},
    {key:'totalProfit',label:'Lucro total (R$)',type:'number'},
    {key:'first',label:'Início do período',type:'date'},
    {key:'last',label:'Fim do período',type:'date'},
    {key:'relatedCampaigns',label:'Campanhas relacionadas (uma por linha)',type:'list'}
  ]);
  function editorValues(product){return{label:product.label,startDate:product.startDate??null,campaignCount:Object.hasOwn(product,'campaignCount')?product.campaignCount:product.campaigns.length,salesCount:product.salesCount??null,totalBilled:product.totalBilled??null,totalProfit:product.totalProfit??null,first:product.first??null,last:product.last??null,active:product.active,relatedCampaigns:[...(product.relatedCampaigns||product.campaigns)]}}
  function applyManualAdjustments(product,values={}){const calculated=editorValues(product);return{...product,...values,calculated,manualFields:Object.keys(values)}}
  function prepareEdit(product,draft){
    const values={},errors={};
    for(const field of EDIT_FIELDS){const entry=draft[field.key];if(!entry?.manual)continue;if(entry.invalid){errors[field.key]='Complete o campo com um valor válido.';continue}let value=String(entry.value??'').trim();
      if(field.type==='number'){if(value==='')value=null;else{const normalized=value.includes(',')?value.replace(/\./g,'').replace(',','.'):value;value=/^-?\d+(?:\.\d+)?$/.test(normalized)?Number(normalized):NaN;if(!Number.isFinite(value))errors[field.key]='Informe um número válido.';else if(['campaignCount','salesCount'].includes(field.key)&&value<0)errors[field.key]='Informe uma quantidade não negativa.';else if(field.key==='campaignCount'&&!Number.isInteger(value))errors[field.key]='Informe uma quantidade inteira.'}}
      else if(field.type==='date'){if(!value)value=null;else{const date=new Date(`${value}T00:00:00Z`);if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)errors[field.key]='Informe uma data válida.'}}
      else if(field.type==='status'){if(!['active','history'].includes(value))errors[field.key]='Selecione uma situação.';value=value==='active'}
      else if(field.type==='list')value=value?value.split(/\r?\n/).map(name=>name.trim()).filter(Boolean):[];
      else if(!value)errors[field.key]='O nome do produto não pode ficar vazio.';
      values[field.key]=value;
    }
    const effective={...(product.calculated||editorValues(product)),...values};
    if(effective.first&&effective.last&&effective.first>effective.last)errors.last='O fim do período não pode ser anterior ao início.';
    return{values,errors,valid:!Object.keys(errors).length}
  }
  function prepareDirectEdit(product,draft){
    const current=editorValues(product),calculated=product.calculated||current,manual=new Set(product.manualFields||[]);
    const entries=Object.fromEntries(EDIT_FIELDS.map(field=>{const entry=draft[field.key]||{};return[field.key,{...entry,manual:Boolean(entry.changed||manual.has(field.key)&&!entry.restored)}]}));
    const result=prepareEdit(product,entries);
    for(const key of Object.keys(result.values)){
      if(!draft[key]?.changed)result.values[key]=current[key];
      else if(!result.errors[key]&&JSON.stringify(result.values[key])===JSON.stringify(calculated[key]))delete result.values[key];
    }
    return result
  }
  function buildProducts(input){
    const {source,getProductName:testedProductName,getCampaignIdentity:campaignIdentity,getCampaignSheet:campaignSheet,referenceDate}=input;
    const normalizeTestedDate=value=>normalizeDate(value,referenceDate);
      const campaignFamily=name=>{const match=String(name||'').trim().match(/^(.*?)\s+0*(\d{1,3})(?:\s*[ºª°])?(?:\s*\[[^\]]+\])?$/);return match?{base:match[1].trim(),variant:String(Number(match[2]))}:null};
      const numericFamilies=new Map();
      for(const campaign of source){const name=testedProductName(campaign),family=campaignFamily(name);if(!family)continue;const key=family.base.toLocaleLowerCase('pt-BR'),variants=numericFamilies.get(key)||new Set();variants.add(family.variant);numericFamilies.set(key,variants)}
      const activeCampaigns=input.activeCampaigns||[],statusCampaigns=input.currentActiveCampaigns??activeCampaigns,groups=new Map(),activeExact=new Set(statusCampaigns.map(c=>String(c.nome_campanha_exato||'').toLocaleLowerCase('pt-BR'))),activeSheets=new Set(statusCampaigns.map(c=>campaignSheet(c.nome_campanha_exato).toLocaleLowerCase('pt-BR'))),campaignByMccName=new Map(source.filter(c=>c.nome_mcc).map(c=>[String(c.nome_mcc).toLocaleLowerCase('pt-BR'),c])),snapshotsByCampaign=new Map(),investmentSnapshotsByCampaign=new Map(),metricSnapshotsByCampaign=new Map(),authoritativeDates=new Set((input.authoritativeDates||[]).map(validIsoDate).filter(Boolean)),metricDates=input.metricDates||{},catalog=input.catalog;
      for(const snapshot of activeCampaigns){const campaign=campaignByMccName.get(String(snapshot.nome_campanha_exato||'').toLocaleLowerCase('pt-BR'));if(!campaign)continue;const snapshots=snapshotsByCampaign.get(campaign.id)||new Map();for(const[period,field,fallback,priority]of[['d0','metricas_D_zero',metricDates.d0,1],['d1','metricas_D_menos_1',metricDates.d1,2]]){const metrics=snapshot[field];if(!metrics||metrics.presente===false)continue;const conversions=conversionValue(metrics.conversoes),date=validIsoDate(metricValue(metrics.data)||fallback);if(conversions==null||!date)continue;const previous=snapshots.get(date);if(!previous||priority>previous.priority)snapshots.set(date,{conversions,priority})}snapshotsByCampaign.set(campaign.id,snapshots)}
      for(const snapshot of input.investmentSnapshots||[]){const campaign=campaignByMccName.get(String(snapshot.campaignName||'').toLocaleLowerCase('pt-BR'));if(!campaign)continue;const snapshots=investmentSnapshotsByCampaign.get(campaign.id)||new Map();for(const[period,priority]of[['d0',1],['d1',2]]){const entry=snapshot[period],amount=conversionValue(entry?.value),date=validIsoDate(entry?.date);if(amount==null||!date)continue;const previous=snapshots.get(date);if(!previous||priority>previous.priority)snapshots.set(date,{investment:amount,priority})}investmentSnapshotsByCampaign.set(campaign.id,snapshots)}
      for(const snapshot of input.metricSnapshots||[]){const campaign=campaignByMccName.get(String(snapshot.campaignName||'').toLocaleLowerCase('pt-BR')),date=validIsoDate(snapshot.date);if(!campaign||!date)continue;const snapshots=metricSnapshotsByCampaign.get(campaign.id)||new Map(),previous=snapshots.get(date);if(!previous||snapshot.period==='d1')snapshots.set(date,snapshot);metricSnapshotsByCampaign.set(campaign.id,snapshots)}
      const addBilled=(group,value,evidence)=>{const amount=Number(value);if(value==null||value===''||!Number.isFinite(amount))return;group.totalBilled+=amount;group.billedObserved=true;if(evidence)evidence.billed=true};
      const addInvestment=(group,value,evidence)=>{const amount=conversionValue(value);if(amount==null)return;group.totalInvestment+=amount;group.investmentObserved=true;if(evidence)evidence.investment=true};
      for(const campaign of source){
        const originalName=testedProductName(campaign),family=campaignFamily(originalName),baseName=family?.base||originalName,name=(numericFamilies.get(baseName.toLocaleLowerCase('pt-BR'))?.size||0)>1?baseName:originalName,key=name.toLocaleLowerCase('pt-BR');
        if(!groups.has(key))groups.set(key,{key,name,campaigns:[],campaignDates:[],dates:[],active:false,totalBilled:0,billedObserved:false,totalInvestment:0,investmentObserved:false,profitComplete:true,totalSales:0,salesObserved:false});
        const group=groups.get(key),campaignName=campaign.nome_mcc||campaign.nome_exibicao,campaignDate=normalizeTestedDate(campaignIdentity(campaignName).dateSort),summary=campaign.legacy_totais,legacyMetric=summary?.metrics?.commission_brl,legacyCommission=legacyMetric?.state==='observed'&&legacyMetric.value!=null&&legacyMetric.value!==''&&Number.isFinite(Number(legacyMetric.value))?Number(legacyMetric.value):null,legacyInvestmentMetric=summary?.metrics?.investment_brl,legacyInvestment=legacyInvestmentMetric?.state==='observed'?conversionValue(legacyInvestmentMetric.value):null,legacyConversionMetric=summary?.metrics?.conversions,legacyConversions=legacyConversionMetric?.state==='observed'?conversionValue(legacyConversionMetric.value):null,legacyEndDate=summary?.end_date||null;
        const campaignProfitEvidence={billed:false,investment:false};
        group.campaigns.push(campaignName);if(campaignDate)group.campaignDates.push(campaignDate);
        group.active||=activeExact.has(String(campaign.nome_mcc||'').toLocaleLowerCase('pt-BR'))||activeSheets.has(String(campaign.nome_exibicao||'').toLocaleLowerCase('pt-BR'));
        if(legacyCommission!=null)addBilled(group,legacyCommission,campaignProfitEvidence);
        if(legacyInvestment!=null)addInvestment(group,legacyInvestment,campaignProfitEvidence);
        const adjustment=input.salesAdjustments.get(campaign.id);
        if(legacyCommission!=null){if(legacyEndDate)for(const[date,item]of Object.entries(adjustment?.byDate||{}))if(date>legacyEndDate)addBilled(group,item?.commissionAdjustment,campaignProfitEvidence)}
        else addBilled(group,adjustment?.commissionAdjustment,campaignProfitEvidence);
        const scopedSnapshot=[...(metricSnapshotsByCampaign.get(campaign.id)||new Map()).values()].find(row=>Array.isArray(row.scopeDates)),campaignDates=scopedSnapshot?new Set(scopedSnapshot.scopeDates):authoritativeDates;const conversionByDate=new Map(),investmentByDate=new Map();for(const row of input.dailyByCampaign.get(campaign.id)||[]){const date=validIsoDate(row.data),isAuthoritative=date&&campaignDates.has(date);if(date){if(!isAuthoritative){conversionByDate.set(date,{conversions:conversionValue(row.celulas?.F?.value),priority:0});investmentByDate.set(date,{investment:conversionValue(row.celulas?.O?.value),priority:0})}const normalized=normalizeTestedDate(date);if(normalized)group.dates.push(normalized)}const rawBilled=row.celulas?.P?.value,afterLegacy=legacyCommission==null||(legacyEndDate&&String(row.data||'')>legacyEndDate);if(afterLegacy&&!isAuthoritative)addBilled(group,rawBilled,campaignProfitEvidence)}
        for(const[date,snapshot]of metricSnapshotsByCampaign.get(campaign.id)||[]){if(!snapshot.present)continue;if(legacyCommission==null||(legacyEndDate&&date>legacyEndDate))addBilled(group,snapshot.commission,campaignProfitEvidence);if(legacyInvestment==null||(legacyEndDate&&date>legacyEndDate))addInvestment(group,snapshot.investment,campaignProfitEvidence);if(snapshot.conversions!=null)conversionByDate.set(date,{conversions:conversionValue(snapshot.conversions),priority:snapshot.period==='d1'?2:1})}
        for(const[date,snapshot]of investmentSnapshotsByCampaign.get(campaign.id)||[]){const previous=investmentByDate.get(date);if(!previous||snapshot.priority>previous.priority)investmentByDate.set(date,snapshot)}
        for(const[date,item]of investmentByDate){const afterLegacy=legacyInvestment==null||(legacyEndDate&&date>legacyEndDate);if(afterLegacy)addInvestment(group,item.investment,campaignProfitEvidence)}
        for(const[date,snapshot]of snapshotsByCampaign.get(campaign.id)||[]){const previous=conversionByDate.get(date);if(!previous||snapshot.priority>previous.priority)conversionByDate.set(date,snapshot)}
        if(legacyConversions!=null){group.totalSales+=legacyConversions;group.salesObserved=true}
        const conversionDates=new Set([...conversionByDate.keys(),...Object.keys(adjustment?.byDate||{})]);for(const date of conversionDates){if(legacyConversions!=null&&(!legacyEndDate||date<=legacyEndDate))continue;const observed=conversionByDate.get(date)?.conversions,manual=adjustment?.byDate?.[date],manualCount=conversionValue(manual?.manualSales??manual?.pendingConversions);if(observed==null&&manualCount==null)continue;group.totalSales+=Math.max(observed??0,manualCount??0);group.salesObserved=true}
        group.profitComplete=group.profitComplete&&campaignProfitEvidence.billed&&campaignProfitEvidence.investment;
      }
      const hidden=new Set(catalog.ocultos);const products=[...groups.values()].filter(x=>!hidden.has(x.key)).map(x=>{const dates=x.dates.sort(),campaignDates=x.campaignDates.sort(),first=dates[0]||null,startDate=campaignDates[0]||normalizeTestedDate(catalog.datas_inicio[x.key])||first,totalBilled=x.billedObserved?x.totalBilled:null,totalInvestment=x.investmentObserved?x.totalInvestment:null;
        // Present legacy names as local overrides until this list explicitly saves or restores them.
        const saved=catalog.ajustes_testados?.[x.key],values=saved?saved.values:(catalog.aliases[x.key]?{label:catalog.aliases[x.key]}:{});
        return applyManualAdjustments({...x,totalBilled,totalInvestment,totalProfit:!x.profitComplete||totalBilled==null||totalInvestment==null?null:totalBilled-totalInvestment,salesCount:x.salesObserved?x.totalSales:null,label:x.name,startDate,first,last:dates.at(-1)||null},values)
      }).sort((a,b)=>a.label.localeCompare(b.label,'pt-BR',{numeric:true,sensitivity:'base'}));return products
    }
    function sortProducts(products,testedSortKey='status',testedSortDir='desc'){const value=(product,key)=>key==='product'?product.label:key==='date'?(product.startDate||''):key==='campaigns'?(Object.hasOwn(product,'campaignCount')?product.campaignCount:product.campaigns.length):key==='revenue'?product.totalBilled:key==='profit'?product.totalProfit:key==='sales'?product.salesCount:key==='period'?(product.first||''):key==='status'?(product.active?1:0):key==='related'?(product.relatedCampaigns||product.campaigns).join(' '):'';return[...products].sort((a,b)=>{const left=value(a,testedSortKey),right=value(b,testedSortKey);if((left==null)!==(right==null))return left==null?1:-1;const comparison=typeof left==='number'&&typeof right==='number'?left-right:String(left??'').localeCompare(String(right??''),'pt-BR',{numeric:true,sensitivity:'base'});if(comparison)return testedSortDir==='asc'?comparison:-comparison;return a.label.localeCompare(b.label,'pt-BR',{numeric:true,sensitivity:'base'})})}
  window.TestedProductsDomain=Object.freeze({buildProducts,sortProducts,normalizeDate,EDIT_FIELDS,editorValues,applyManualAdjustments,prepareEdit,prepareDirectEdit});
})();
