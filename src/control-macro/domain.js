(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ControlMacroDomain=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  const SOURCE_COLUMNS={investment:'O',revenue:'P',clicks:'C',sales:'F'};
  const MCC_CLICKS_SALES_FALLBACK_FROM='2026-09-13';
  const SUSPENSION_START='2026-06-10';
  const SUSPENSION_END='2026-06-24';
  const SUSPENSION_OBSERVATION='Operação fora do ar devido a suspensões.';
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
  const normalizeText=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  function normalizeMonth(value){const match=String(value??'').match(/^(\d{4})-(0[1-9]|1[0-2])$/);return match?`${match[1]}-${match[2]}`:null;}
  function monthBounds(value){const month=normalizeMonth(value);if(!month)return null;const[year,monthNumber]=month.split('-').map(Number);return{start:`${month}-01`,end:new Date(Date.UTC(year,monthNumber,0)).toISOString().slice(0,10)};}
  function shiftMonth(value,offset){const month=normalizeMonth(value),step=Number(offset);if(!month||!Number.isInteger(step))return null;const[year,monthNumber]=month.split('-').map(Number),date=new Date(Date.UTC(year,monthNumber-1+step,1));return`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;}
  function currentMonth(date=new Date()){if(!(date instanceof Date)||Number.isNaN(date.getTime()))return null;return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;}
  const excelDateToIso=serial=>{
    if(!Number.isFinite(Number(serial))||Number(serial)<1)return null;
    const date=new Date(Date.UTC(1899,11,30)+Math.round(Number(serial))*86400000);
    return Number.isNaN(date.getTime())?null:date.toISOString().slice(0,10);
  };
  function parseDate(value){
    const validDate=(year,month,day)=>{const date=new Date(Date.UTC(Number(year),Number(month)-1,Number(day)));return date.getUTCFullYear()===Number(year)&&date.getUTCMonth()+1===Number(month)&&date.getUTCDate()===Number(day)?`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null};
    if(value instanceof Date&&!Number.isNaN(value.getTime()))return validDate(value.getUTCFullYear(),value.getUTCMonth()+1,value.getUTCDate());
    if(typeof value==='number')return excelDateToIso(value);
    const text=String(value??'').trim();
    let match=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(match)return validDate(match[1],match[2],match[3]);
    match=text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
    if(match)return validDate(match[3],match[2],match[1]);
    return null;
  }
  function isSuspensionDate(value){const date=parseDate(value);return Boolean(date&&date>=SUSPENSION_START&&date<=SUSPENSION_END)}
  function parseNumber(value){
    if(value==null||value==='')return null;
    if(typeof value==='object'&&own(value,'valor')){
      if(['ausente','invalido'].includes(value.estado))return null;
      value=value.valor;
    }
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    let text=String(value).trim().replace(/[^\d,.-]/g,'');
    if(!text)return null;
    if(text.includes(',')&&text.includes('.'))text=text.lastIndexOf(',')>text.lastIndexOf('.')?text.replace(/\./g,'').replace(',','.'):text.replace(/,/g,'');
    else if(text.includes(','))text=/^-?\d{1,3}(,\d{3})+$/.test(text)?text.replace(/,/g,''):text.replace(',','.');
    else if(text.includes('.'))text=/^-?\d{1,3}(\.\d{3})+$/.test(text)?text.replace(/\./g,''):text;
    const number=Number(text);
    return Number.isFinite(number)?number:null;
  }
  const cellValue=cell=>parseNumber(cell&&typeof cell==='object'&&own(cell,'value')?cell.value:cell);
  function deriveMetrics({investment,revenue,clicks,sales,pendingSales=0,pendingRevenue=0}={}){
    const totalSales=sales==null?(pendingSales>0?pendingSales:null):sales+pendingSales;
    const totalRevenue=revenue==null?(pendingRevenue>0?pendingRevenue:null):revenue+pendingRevenue;
    const profit=investment!=null&&totalRevenue!=null?totalRevenue-investment:null;
    const roi=profit!=null&&investment>0?profit/investment*100:null;
    const clicksPerSale=clicks!=null&&totalSales>0?clicks/totalSales:null;
    return{investment,revenue:totalRevenue,profit,roi,clicks,sales:totalSales,officialSales:sales,pendingSales,pendingRevenue,clicksPerSale};
  }
  function aggregateMccDaily(dailyRecords=[],adjustments=new Map(),{campaignProducts=new Map(),authoritativeDates=[]}={}){
    const days=new Map();
    const get=(date)=>{
      if(!days.has(date))days.set(date,{date,hasMccData:true,source:'mcc',sums:{investment:0,revenue:0,clicks:0,sales:0},observed:{investment:false,revenue:false,clicks:false,sales:false},pendingSales:0,pendingRevenue:0,productSales:new Map()});
      return days.get(date);
    };
    const productForCampaign=id=>typeof campaignProducts?.get==='function'?campaignProducts.get(String(id??''))||null:campaignProducts?.[String(id??'')]||null;
    const addProductSales=(day,{product=null,sales=0,amount=null,provisional=false,campaignId=null}={})=>{
      const count=parseNumber(sales)||0;if(count<=0)return;
      const label=String(product||'').trim()||null,key=JSON.stringify([label,Boolean(provisional)]),current=day.productSales.get(key)||{product:label,sales:0,amount:0,amountComplete:true,provisional:Boolean(provisional),campaignSales:new Map()};
      current.sales+=count;const value=parseNumber(amount);if(value==null)current.amountComplete=false;else current.amount+=value;
      const id=String(campaignId||'').trim();if(id){const campaign=current.campaignSales.get(id)||{campaignId:id,sales:0,amount:0,amountComplete:true};campaign.sales+=count;if(value==null)campaign.amountComplete=false;else campaign.amount+=value;current.campaignSales.set(id,campaign)}
      day.productSales.set(key,current);
    };
    for(const date of authoritativeDates||[]){const normalized=parseDate(date);if(normalized)get(normalized)}
    for(const record of dailyRecords||[]){
      const date=parseDate(record?.data||record?.date);
      if(!date)continue;
      const cells=record.celulas||record.cells||{};
      const values=Object.fromEntries(Object.entries(SOURCE_COLUMNS).map(([metric,column])=>[metric,cellValue(cells[column])]));
      if(Object.values(values).every(value=>value==null))continue;
      const day=get(date);
      for(const [metric,value] of Object.entries(values))if(value!=null){day.sums[metric]+=value;day.observed[metric]=true;}
      if(values.sales>0)addProductSales(day,{product:productForCampaign(record.campanha_id??record.campaign_id),sales:values.sales,amount:values.revenue,provisional:false,campaignId:record.campanha_id??record.campaign_id});
    }
    for(const [campaignId,summary] of adjustments?.entries?.()||[]){
      for(const [rawDate,adjustment] of Object.entries(summary?.byDate||{})){
        const date=parseDate(rawDate),pendingSales=parseNumber(adjustment?.pendingConversions)||0,pendingRevenue=parseNumber(adjustment?.commissionAdjustment)||0;
        if(!date||(!pendingSales&&!pendingRevenue))continue;
        const day=get(date);day.pendingSales+=pendingSales;day.pendingRevenue+=pendingRevenue;
        let remaining=pendingSales;
        for(const sale of Array.isArray(adjustment?.productSales)?adjustment.productSales:[]){
          const count=Math.min(remaining,Math.max(0,parseNumber(sale?.sales)??1));if(count<=0)continue;
          addProductSales(day,{product:productForCampaign(campaignId)||sale?.product,sales:count,amount:sale?.amount,provisional:true,campaignId});remaining-=count;
        }
        if(remaining>0)addProductSales(day,{product:productForCampaign(campaignId),sales:remaining,provisional:true});
      }
    }
    return[...days.values()].map(day=>({date:day.date,hasMccData:true,source:'mcc',...deriveMetrics({investment:day.observed.investment?day.sums.investment:null,revenue:day.observed.revenue?day.sums.revenue:null,clicks:day.observed.clicks?day.sums.clicks:null,sales:day.observed.sales?day.sums.sales:null,pendingSales:day.pendingSales,pendingRevenue:day.pendingRevenue}),productSales:[...day.productSales.values()].map(item=>({product:item.product,sales:item.sales,amount:item.amountComplete?item.amount:null,provisional:item.provisional,campaignSales:[...item.campaignSales.values()].map(campaign=>({campaignId:campaign.campaignId,sales:campaign.sales,amount:campaign.amountComplete?campaign.amount:null}))}))})).sort((a,b)=>a.date.localeCompare(b.date));
  }
  function parseHistoricalWorkbook(workbook){
    const entries=[],seen=new Map(),ignoredSheets=[];
    for(const sheet of workbook?.sheets||[]){
      let header=null,columns={};
      for(const row of sheet.rows||[]){
        const byLabel=new Map(Object.entries(row.cells||{}).map(([column,cell])=>[normalizeText(cell?.value),column]));
        const findColumn=labels=>[...byLabel].find(([label])=>labels.some(alias=>label===alias||label.startsWith(`${alias} `)))?.[1];
        const date=findColumn(['data']),investment=findColumn(['investimento','investido','custo','spend']),revenue=findColumn(['receita','faturamento','revenue']);
        if(date&&investment&&revenue){header=row;columns={date,investment,revenue,clicks:findColumn(['cliques','clicks']),sales:findColumn(['vendas','sales']),observation:findColumn(['observacoes','observacao','obs'])};break;}
      }
      if(!header){ignoredSheets.push(sheet.name);continue;}
      for(const row of sheet.rows||[]){
        if(row.index<=header.index)continue;
        const cells=row.cells||{},date=parseDate(cells[columns.date]?.value);
        if(!date)continue;
        let observation=String(cells[columns.observation]?.value??'').trim();
        if(isSuspensionDate(date)&&!normalizeText(observation).includes('suspens'))observation=[observation,SUSPENSION_OBSERVATION].filter(Boolean).join(' · ');
        const entry={date,investment:cellValue(cells[columns.investment]),revenue:cellValue(cells[columns.revenue]),clicks:cellValue(cells[columns.clicks]),sales:cellValue(cells[columns.sales]),observation};
        // A dated row with blank metrics is still meaningful coverage: blanks must
        // remain distinct from zero and can prevent MCC values filling the day.
        const prior=seen.get(date);
        if(prior){if(!sameHistory(prior,entry))throw new Error(`A planilha tem mais de uma linha diferente para ${date}.`);continue;}
        seen.set(date,entry);entries.push(entry);
      }
    }
    if(!entries.length)throw new Error('Não encontrei linhas diárias com Data, Investimento e Receita/Faturamento.');
    return{entries:entries.sort((a,b)=>a.date.localeCompare(b.date)),ignoredSheets};
  }
  function sameHistory(a,b){return['investment','revenue','clicks','sales','observation'].every(key=>(a?.[key]??null)===(b?.[key]??null));}
  function previewHistoryImport(existing=[],incoming=[]){
    const current=new Map((existing||[]).map(row=>[row.date,row])),added=[],identical=[],conflicts=[];
    for(const row of incoming||[]){const prior=current.get(row.date);if(!prior)added.push(row);else if(sameHistory(prior,row))identical.push(row);else conflicts.push({date:row.date,previous:prior,incoming:row});}
    return{added,identical,conflicts};
  }
  function mergeHistoryImport(existing=[],incoming=[],{replaceConflicts=false}={}){
    const preview=previewHistoryImport(existing,incoming);
    const next=new Map((existing||[]).map(row=>[row.date,row]));
    for(const row of incoming||[]){const prior=next.get(row.date);if(!prior||replaceConflicts&&!sameHistory(prior,row))next.set(row.date,{...row});}
    return{rows:[...next.values()].sort((a,b)=>a.date.localeCompare(b.date)),...preview,applied:true};
  }
  function reconcileProductSales(items=[],officialSales=null,pendingSales=0){
    const output=(items||[]).filter(item=>parseNumber(item?.sales)>0).map(item=>({...item,product:String(item.product||'').trim()||null,sales:parseNumber(item.sales),amount:parseNumber(item.amount),provisional:Boolean(item.provisional)}));
    for(const [provisional,targetValue] of [[false,officialSales],[true,pendingSales]]){
      const target=parseNumber(targetValue);if(target==null)continue;
      const assigned=output.filter(item=>item.provisional===provisional).reduce((sum,item)=>sum+item.sales,0),remaining=target-assigned;
      if(remaining>0)output.push({product:null,sales:remaining,amount:null,provisional});
    }
    return output;
  }
  function annotatedProductSalesCount(observation){return[...String(observation||'').matchAll(/(?:^|[·;]\s*)(\d+)\s+[^·;()]+?\s+\(R\$\s*[\d.,]+\)/gi)].reduce((sum,match)=>sum+Number(match[1]),0)}
  function combineDailyRows(mccRows=[],historicalRows=[],{authoritativeDates=[]}={}){
    const authoritative=new Set((authoritativeDates||[]).map(parseDate).filter(Boolean)),mccByDate=new Map((mccRows||[]).map(row=>[row.date,row])),historyByDate=new Map((historicalRows||[]).map(row=>[row.date,row])),dates=new Set([...mccByDate.keys(),...historyByDate.keys(),...authoritative]);
    for(let time=Date.parse(`${SUSPENSION_START}T00:00:00Z`);time<=Date.parse(`${SUSPENSION_END}T00:00:00Z`);time+=86400000)dates.add(new Date(time).toISOString().slice(0,10));
    const combined=[];
    for(const date of dates){
      const mcc=mccByDate.get(date),history=historyByDate.get(date),suspended=isSuspensionDate(date);
      if(authoritative.has(date)){if(mcc){const note=history?.observation||mcc.observation||'',observation=[note,suspended&&!normalizeText(note).includes('suspens')?SUSPENSION_OBSERVATION:''].filter(Boolean).join(' · ');combined.push({...mcc,source:'mcc',hasMccData:true,observation,productSales:reconcileProductSales(mcc.productSales,mcc.officialSales,mcc.pendingSales)})}continue}
      if(history){
        const canFillClicksSales=date>=MCC_CLICKS_SALES_FALLBACK_FROM;
        const clicksFromMcc=history.clicks==null&&canFillClicksSales&&mcc?.clicks!=null;
        const salesFromMcc=history.sales==null&&canFillClicksSales&&mcc?.sales!=null;
        const pendingSales=mcc?.pendingSales||0,pendingRevenue=mcc?.pendingRevenue||0;
        const mccOfficialSales=mcc?.officialSales??(mcc?.pendingSales?null:mcc?.sales),values=deriveMetrics({investment:history.investment,revenue:history.revenue,clicks:history.clicks??(clicksFromMcc?mcc.clicks:null),sales:history.sales??(salesFromMcc?mccOfficialSales:null),pendingSales,pendingRevenue});
        const observation=[history.observation||'',suspended&&!normalizeText(history.observation).includes('suspens')?SUSPENSION_OBSERVATION:''].filter(Boolean).join(' · ');
        const mccOfficial=mcc?.productSales?.filter(item=>!item.provisional)||[],mccPending=mcc?.productSales?.filter(item=>item.provisional)||[],historyCountMatchesMcc=history.sales!=null&&date>=MCC_CLICKS_SALES_FALLBACK_FROM&&mcc?.officialSales===history.sales;
        const notesCoverHistorySales=history.sales!=null&&history.sales>0&&annotatedProductSalesCount(history.observation)>=history.sales,officialDetails=notesCoverHistorySales?[]:history.sales==null&&salesFromMcc?mccOfficial:historyCountMatchesMcc?mccOfficial:history.sales>0?[{product:null,sales:history.sales,amount:null,provisional:false}]:[];
        const productSales=reconcileProductSales([...officialDetails,...mccPending],notesCoverHistorySales?0:values.officialSales,values.pendingSales);
        combined.push({date,source:clicksFromMcc||salesFromMcc?'mixed':'planilha',hasMccData:Boolean(mcc),...values,observation,productSales});
        continue;
      }
      if(suspended){
        const values=deriveMetrics({investment:null,revenue:null,clicks:null,sales:null,pendingSales:mcc?.pendingSales||0,pendingRevenue:mcc?.pendingRevenue||0});
        combined.push({date,source:'suspension',hasMccData:false,...values,observation:SUSPENSION_OBSERVATION,productSales:reconcileProductSales(mcc?.productSales?.filter(item=>item.provisional)||[],values.officialSales,values.pendingSales)});
        continue;
      }
      if(mcc)combined.push({...mcc,observation:mcc.observation||'',productSales:reconcileProductSales(mcc.productSales,mcc.officialSales,mcc.pendingSales)});
    }
    return combined.sort((a,b)=>b.date.localeCompare(a.date));
  }
  function reconcileBillingSales(macroRows=[],billingSales=[],billingRevenueByDate=null){
    const byDate=new Map();let activeRecords=0,billingConversions=0,invalidDateRecords=0;
    for(const sale of billingSales||[]){
      if(!sale||sale.active===false)continue;
      const date=parseDate(sale.sale_date);
      if(!date){invalidDateRecords++;continue}
      const conversionCount=Math.max(0,parseNumber(sale.conversion_count)??1),revenueDay=billingRevenueByDate?.get?.(date),saleAmounts=revenueDay?.saleAmounts,amountBrl=saleAmounts?.has(String(sale.sale_id))?parseNumber(saleAmounts.get(String(sale.sale_id))):parseNumber(sale.value_brl);
      let day=byDate.get(date);
      if(!day){day={date,records:0,conversions:0,sales:[]};byDate.set(date,day)}
      activeRecords++;day.records++;day.conversions+=conversionCount;billingConversions+=conversionCount;
      day.sales.push({...sale,conversionCount,amountBrl});
    }
    const currentByDate=new Map((macroRows||[]).map(row=>[parseDate(row?.date),row]).filter(([date])=>date));
    const hasBillingSource=billingRevenueByDate instanceof Map,dates=new Set([...currentByDate.keys(),...byDate.keys(),...(billingRevenueByDate?.keys?.()||[])]),output=[];
    let appliedSales=0,appliedRevenue=0,appliedDates=0,macroAheadSalesDates=0,macroAheadRevenueDates=0,incompleteRevenueDates=0;
    for(const date of dates){
      const current=currentByDate.get(date)||null,billed=byDate.get(date),billingDay=billingRevenueByDate?.get?.(date),billedSales=billed?.sales||[];
      const currentSales=parseNumber(current?.sales)??0,currentRevenue=parseNumber(current?.revenue),salesDelta=billed?Math.max(0,billed.conversions-currentSales):0;
      if(billed&&currentSales>billed.conversions)macroAheadSalesDates++;
      const row=current?{...current,productSales:(current.productSales||[]).map(item=>({...item,campaignSales:Array.isArray(item.campaignSales)?item.campaignSales.map(campaign=>({...campaign})):item.campaignSales}))}:{date,source:'billing',hasMccData:false,investment:null,revenue:null,profit:null,roi:null,clicks:null,sales:null,officialSales:null,pendingSales:0,pendingRevenue:0,clicksPerSale:null,productSales:[],observation:''};
      const refs=[];
      for(const item of row.productSales){
        if(item.provisional||item.billing)continue;
        if(Array.isArray(item.campaignSales)&&item.campaignSales.length){
          for(const campaign of item.campaignSales){const amount=parseNumber(campaign.amount),sales=Math.max(0,parseNumber(campaign.sales)||0);refs.push({item,campaignId:String(campaign.campaignId||''),product:item.product,sales,amount,unitAmount:amount!=null&&sales>0?amount/sales:null,campaign})}
        }else{const amount=parseNumber(item.amount),sales=Math.max(0,parseNumber(item.sales)||0);refs.push({item,campaignId:String(item.campaignId||''),product:item.product,sales,amount,unitAmount:amount!=null&&sales>0?amount/sales:null,campaign:null})}
      }
      const remainingBySale=new Map(billedSales.map(sale=>[sale,sale.conversionCount]));
      const matchRefs=sale=>refs.filter(ref=>ref.sales>0&&(
        sale.campaign_id&&ref.campaignId?String(sale.campaign_id)===ref.campaignId:
        (!ref.campaignId||!sale.campaign_id)&&normalizeText(ref.product)===normalizeText(sale.product)
      ));
      const coveredSales=[...billedSales].sort((a,b)=>{
        const priority=sale=>sale.source==='mcc_conversion_aggregate'||sale.source==='hub_manual_capture'&&sale.confirmation_status==='confirmed'?0:1;
        return priority(a)-priority(b);
      });
      for(const sale of coveredSales){
        let remaining=remainingBySale.get(sale)||0;
        for(const ref of matchRefs(sale)){
          if(remaining<=0)break;
          const take=Math.min(remaining,ref.sales);if(take<=0)continue;
          if(sale.amountBrl!=null&&ref.amount!=null&&sale.conversionCount>0){
            const targetUnitAmount=sale.amountBrl/sale.conversionCount,correction=ref.unitAmount==null?0:(targetUnitAmount-ref.unitAmount)*take;
            ref.amount+=correction;
            ref.unitAmount=targetUnitAmount;
            if(ref.campaign)ref.campaign.amount=Number((ref.amount).toFixed(8));
            if(ref.item.amount!=null)ref.item.amount=Number((ref.item.amount+correction).toFixed(8));
          }
          ref.sales-=take;remaining-=take;
        }
        remainingBySale.set(sale,remaining);
      }
      if(salesDelta>0){
        let remaining=salesDelta;
        const candidates=[...billedSales].sort((a,b)=>{
          const priority=sale=>sale.source==='manual'?0:sale.source==='hub_manual_capture'?1:sale.source==='mcc_conversion_aggregate'?2:3;
          return priority(a)-priority(b);
        });
        for(const sale of candidates){
          if(remaining<=0)break;
          const available=Math.max(0,remainingBySale.get(sale)||0),take=Math.min(remaining,available);if(take<=0)continue;
          const amount=sale.amountBrl==null||sale.conversionCount<=0?null:sale.amountBrl*take/sale.conversionCount;
          row.productSales.push({product:String(sale.product||'').trim()||null,sales:take,amount,provisional:false,billing:true});
          remaining-=take;remainingBySale.set(sale,available-take);
        }
        if(remaining>0)row.productSales.push({product:null,sales:remaining,amount:null,provisional:false,billing:true});
        row.sales=currentSales+salesDelta;
        const pendingSales=parseNumber(row.pendingSales)||0,officialSales=parseNumber(row.officialSales);
        row.officialSales=(officialSales==null?Math.max(0,currentSales-pendingSales):officialSales)+salesDelta;
        row.billingSales=(parseNumber(row.billingSales)||0)+salesDelta;
        appliedSales+=salesDelta;
      }
      const targetRevenue=hasBillingSource?(billingDay?parseNumber(billingDay.amount):0):currentRevenue,targetComplete=!hasBillingSource||billingDay?.complete!==false;
      if(hasBillingSource&&!targetComplete)incompleteRevenueDates++;
      if(currentRevenue!=null&&targetRevenue!=null&&currentRevenue>targetRevenue)macroAheadRevenueDates++;
      const rowChanged=(hasBillingSource&&currentRevenue!==targetRevenue)||salesDelta>0;
      if(currentRevenue!==targetRevenue&&currentRevenue!=null&&targetRevenue!=null)appliedRevenue+=targetRevenue-currentRevenue;
      row.revenue=targetRevenue;
      row.billingRevenueComplete=targetComplete;
      row.billingRevenueRecords=Number(billingDay?.records)||0;
      row.billingRevenueMissing=Number(billingDay?.missingAmounts)||0;
      row.billingRevenueAuthoritative=hasBillingSource;
      row.billingRevenueDelta=hasBillingSource&&currentRevenue!=null&&targetRevenue!=null?Number((targetRevenue-currentRevenue).toFixed(2)):null;
      const investment=parseNumber(row.investment),revenue=parseNumber(row.revenue),clicks=parseNumber(row.clicks),sales=parseNumber(row.sales);
      row.profit=investment!=null&&revenue!=null?revenue-investment:null;
      row.roi=row.profit!=null&&investment>0?row.profit/investment*100:null;
      row.clicksPerSale=clicks!=null&&sales>0?clicks/sales:null;
      if(!row.source)row.source='billing';
      output.push(row);if(rowChanged)appliedDates++;
    }
    output.sort((a,b)=>b.date.localeCompare(a.date));
    return{rows:output,check:{activeRecords,billingConversions,appliedSales,appliedRevenue,appliedDates,macroAheadSalesDates,macroAheadRevenueDates,incompleteRevenueDates,invalidDateRecords}};
  }
  function summarize(rows=[]){
    const sum=key=>{const values=(rows||[]).map(row=>parseNumber(row?.[key])).filter(value=>value!=null);return values.length?values.reduce((total,value)=>total+value,0):null;};
    const investment=sum('investment'),revenue=sum('revenue'),clicks=sum('clicks'),sales=sum('sales'),profit=investment!=null&&revenue!=null?revenue-investment:null;
    return{investment,revenue,profit,roi:profit!=null&&investment>0?profit/investment*100:null,clicks,sales,clicksPerSale:clicks!=null&&sales>0?clicks/sales:null};
  }
  function lifetimeSummary(rows=[]){
    const revenueRows=(rows||[]).filter(row=>parseNumber(row?.revenue)!=null),pairedRows=(rows||[]).filter(row=>parseNumber(row?.investment)!=null&&parseNumber(row?.revenue)!=null);
    const revenue=revenueRows.length?revenueRows.reduce((total,row)=>total+parseNumber(row.revenue),0):null;
    const profit=pairedRows.length?pairedRows.reduce((total,row)=>total+parseNumber(row.revenue)-parseNumber(row.investment),0):null;
    return{revenue,profit,revenueDays:revenueRows.length,profitDays:pairedRows.length};
  }
  function localIsoDate(date=new Date()){return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
  function observedSum(rows,key){const values=(rows||[]).map(row=>parseNumber(row?.[key])).filter(value=>value!=null);return values.length?values.reduce((total,value)=>total+value,0):null}
  function monthDayCount(month){const bounds=monthBounds(month);return bounds?Number(bounds.end.slice(-2)):0}
  function trendBucket(key,rows,expectedDays){
    const validInvestment=(rows||[]).filter(row=>parseNumber(row?.investment)!=null),validRevenue=(rows||[]).filter(row=>parseNumber(row?.revenue)!=null),matched=(rows||[]).filter(row=>parseNumber(row?.investment)!=null&&parseNumber(row?.revenue)!=null),salesRows=(rows||[]).filter(row=>parseNumber(row?.sales)!=null);
    const investment=observedSum(rows,'investment'),revenue=observedSum(rows,'revenue'),clicks=observedSum(rows,'clicks'),sales=observedSum(rows,'sales');
    const matchedInvestment=observedSum(matched,'investment'),matchedRevenue=observedSum(matched,'revenue'),profit=matched.length?matched.reduce((total,row)=>total+parseNumber(row.revenue)-parseNumber(row.investment),0):null;
    const pendingSales=salesRows.length?salesRows.reduce((total,row)=>total+(parseNumber(row.pendingSales)||0),0):null,billingSales=salesRows.length?salesRows.reduce((total,row)=>total+(parseNumber(row.billingSales)||0),0):null,officialSales=sales==null?null:Math.max(0,sales-(pendingSales||0)-(billingSales||0));
    const roi=matchedInvestment>0&&matchedRevenue!=null?(matchedRevenue-matchedInvestment)/matchedInvestment*100:null;
    return{key,investment,revenue,profit,roi,clicks,sales,clicksPerSale:clicks!=null&&sales>0?clicks/sales:null,officialSales,pendingSales,billingSales,expectedDays,coverage:{investment:validInvestment.length,revenue:validRevenue.length,profit:matched.length,roi:matched.filter(row=>parseNumber(row?.investment)>0).length,clicks:(rows||[]).filter(row=>parseNumber(row?.clicks)!=null).length,sales:salesRows.length}};
  }
  function dailyTrendBuckets(rows=[],monthValue,throughDate=localIsoDate(),billingRevenueByDate=null){
    const month=normalizeMonth(monthValue),bounds=monthBounds(month),through=parseDate(throughDate)||localIsoDate();if(!month||!bounds||month>through.slice(0,7))return[];
    const end=month===through.slice(0,7)?(through<bounds.end?through:bounds.end):bounds.end,byDate=new Map((rows||[]).filter(row=>parseDate(row?.date)?.startsWith(`${month}-`)).map(row=>[row.date,row])),output=[];
    for(let time=Date.parse(`${bounds.start}T00:00:00Z`);time<=Date.parse(`${end}T00:00:00Z`);time+=86400000){const date=new Date(time).toISOString().slice(0,10),row=byDate.get(date),billingDay=billingRevenueByDate instanceof Map?billingRevenueByDate.get(date):null,sourceRow=billingRevenueByDate instanceof Map?{...(row||{date}),revenue:billingDay?parseNumber(billingDay.amount):0}:row;output.push(trendBucket(date,sourceRow?[sourceRow]:[],1))}
    return output;
  }
  function billingRevenueForRange(billingRevenueByDate,start,end){
    if(!(billingRevenueByDate instanceof Map))return undefined;
    const days=[...billingRevenueByDate.entries()].filter(([date])=>date>=start&&date<=end).map(([,value])=>value),known=days.map(day=>parseNumber(day?.amount)).filter(value=>value!=null);
    return days.length?(known.length?known.reduce((total,value)=>total+value,0):null):0;
  }
  function excludeCancelledBillingManualSales(database,billingSales=[]){
    if(!database||!Array.isArray(database.vendas_provisorias))return{database,excludedCount:0};
    const cancelledSourceRefs=new Set((billingSales||[])
      .filter(sale=>sale?.source==='hub_manual_capture'&&sale.active===false&&sale.cancelled_at)
      .map(sale=>String(sale.source_ref||'').trim()).filter(Boolean));
    if(!cancelledSourceRefs.size)return{database,excludedCount:0};
    const excluded=new Set(database.vendas_provisorias
      .filter(sale=>sale?.status!=='cancelada'&&cancelledSourceRefs.has(String(sale?.id||'')))
      .map(sale=>String(sale.id)));
    if(!excluded.size)return{database,excludedCount:0};
    return{
      database:{...database,vendas_provisorias:database.vendas_provisorias.filter(sale=>!excluded.has(String(sale?.id||'')))},
      excludedCount:excluded.size,
    };
  }
  function excludeIgnoredCampaignSales(billingSales=[],ignoredCampaignIds=[]){
    const ignored=new Set([...(ignoredCampaignIds||[])].filter(id=>id!=null&&id!=='').map(String));
    return(billingSales||[]).filter(sale=>!ignored.has(String(sale?.campaign_id??'')));
  }
  function monthlyTrendBuckets(rows=[],{startMonth='2026-04',throughDate=localIsoDate()}={},billingRevenueByDate=null){
    let month=normalizeMonth(startMonth);const through=parseDate(throughDate)||localIsoDate(),last=through.slice(0,7),output=[];if(!month||month>last)return output;
    const byMonth=new Map();for(const row of rows||[]){const date=parseDate(row?.date);if(!date)continue;const key=date.slice(0,7);if(key<month||key>last)continue;if(!byMonth.has(key))byMonth.set(key,[]);byMonth.get(key).push(row)}
    while(month&&month<=last){const days=month===last?Number(through.slice(-2)):monthDayCount(month),bucket=trendBucket(month,byMonth.get(month)||[],days);if(billingRevenueByDate instanceof Map){const start=`${month}-01`,end=month===last?through:monthBounds(month).end,monthDays=[...billingRevenueByDate.entries()].filter(([date])=>date>=start&&date<=end).map(([,value])=>value),known=monthDays.map(day=>parseNumber(day?.amount)).filter(value=>value!=null);bucket.revenue=monthDays.length?(known.length?known.reduce((total,value)=>total+value,0):null):0;bucket.coverage.revenue=known.length}output.push(bucket);month=shiftMonth(month,1)}
    return output;
  }
  return Object.freeze({normalizeMonth,monthBounds,shiftMonth,currentMonth,parseDate,parseNumber,isSuspensionDate,deriveMetrics,aggregateMccDaily,parseHistoricalWorkbook,previewHistoryImport,mergeHistoryImport,combineDailyRows,reconcileBillingSales,excludeCancelledBillingManualSales,excludeIgnoredCampaignSales,summarize,lifetimeSummary,billingRevenueForRange,dailyTrendBuckets,monthlyTrendBuckets});
});
