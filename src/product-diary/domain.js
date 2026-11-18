(function(global){
  // Virtual sale rows are display-only: never added to the source diary.
    function excelDate(serial){const utc=Math.round((Number(serial)-25569)*86400000);return new Date(utc)}
    function sheetDailyRows(sheet){if(!sheet)return[];return sheet.rows.filter(r=>{const v=r.cells.A?.value;return typeof v==='number'&&v>=30000&&v<=70000})}
    function productDiaryRowDate(row){const rowDate=String(row?.date||row?.data||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(rowDate))return rowDate;const raw=row?.cells?.A?.value;if(typeof raw==='number'&&Number.isFinite(raw))return excelDate(raw).toISOString().slice(0,10);const text=String(row?.cells?.A?.text??raw??'').trim(),iso=text.match(/^(\d{4}-\d{2}-\d{2})/);if(iso)return iso[1];const local=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return local?`${local[3]}-${local[2].padStart(2,'0')}-${local[1].padStart(2,'0')}`:''}
    function productDiaryHasSales(row,provisionalSaleDates){const conversions=Number(row?.cells?.F?.value);return Number.isFinite(conversions)&&conversions>0||provisionalSaleDates.has(productDiaryRowDate(row))}
    function productDiaryManualSaleCount(row,manualSalesByDate){return Math.max(0,Math.floor(Number(manualSalesByDate.get(productDiaryRowDate(row))?.pendingConversions)||0))}
    function productDiaryRowsWithManualSales(rows,manualSalesByDate){const result=[...(rows||[])],seen=new Set(result.map(productDiaryRowDate).filter(Boolean));for(const[date,sale]of manualSalesByDate){const count=Math.max(0,Math.floor(Number(sale?.pendingConversions)||0));if(!count||seen.has(date))continue;const[year,month,day]=date.split('-');result.push({date,cells:{A:{value:date,text:`${day}/${month}/${year}`},Q:{value:`Venda manual provisória (${count}); aguardando confirmação MCC D−1`}}});seen.add(date)}return result.sort((a,b)=>productDiaryRowDate(a).localeCompare(productDiaryRowDate(b)))}
    function productDiaryRowsThroughDate(rows,cutoff,resumeDate=null){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(cutoff||'')))return[...(rows||[])];const resumed=/^\d{4}-\d{2}-\d{2}$/.test(String(resumeDate||''))&&resumeDate>=cutoff;return(rows||[]).filter(row=>{const date=productDiaryRowDate(row);return!date||date<=cutoff||resumed&&date>=resumeDate})}
    function productDiaryTotals(rows,cutoff,manualSalesByDate=new Map(),resumeDate=null){
      const totals={investment:null,clicks:null,conversions:null};
      const bounded=productDiaryRowsThroughDate(productDiaryRowsWithManualSales(rows,manualSalesByDate),cutoff,resumeDate);
      for(const row of bounded){
        for(const [key,column]of [['investment','O'],['clicks','C'],['conversions','F']]){
          const raw=row?.cells?.[column]?.value;
          if((typeof raw!=='number'&&typeof raw!=='string')||String(raw).trim()==='')continue;
          const value=Number(raw);if(!Number.isFinite(value))continue;
          totals[key]=(totals[key]??0)+value;
        }
        const pending=productDiaryManualSaleCount(row,manualSalesByDate);
        if(pending)totals.conversions=(totals.conversions??0)+pending;
      }
      if(totals.investment!==null)totals.investment=Math.round((totals.investment+Number.EPSILON)*100)/100;
      return totals;
    }
    // Sum observed totals and average observed daily costs in the displayed series.
    function productDiaryTableTotals(rows){
      const totals={B:null,C:null,F:null,I:null,J:null,O:null,P:null},averageCounts={I:0,J:0};
      for(const row of rows||[]){
        for(const column of Object.keys(totals)){
          const raw=row?.cells?.[column]?.value;
          if((typeof raw!=='number'&&typeof raw!=='string')||String(raw).trim()==='')continue;
          const value=Number(raw);if(!Number.isFinite(value))continue;
          totals[column]=(totals[column]??0)+value;
          if(Object.hasOwn(averageCounts,column))averageCounts[column]+=1;
        }
      }
      for(const column of Object.keys(totals)){
        if(totals[column]===null)continue;
        if(Object.hasOwn(averageCounts,column)){
          totals[column]=Math.round((totals[column]/averageCounts[column]+Number.EPSILON)*1e12)/1e12;
          continue;
        }
        const scale=['O','P'].includes(column)?100:1e12;
        totals[column]=Math.round((totals[column]+Number.EPSILON)*scale)/scale;
      }
      return totals;
    }
    function isoDateInTimeZone(timestamp,timeZone){
      const date=new Date(timestamp);if(!Number.isFinite(date.getTime())||!timeZone)return'';
      try{const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),values=Object.fromEntries(parts.filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));return values.year&&values.month&&values.day?`${values.year}-${values.month}-${values.day}`:''}catch{return''}
    }
    function validNonNegativeCount(value){if(value==null||String(value).trim()==='')return null;const number=Number(value);return Number.isSafeInteger(number)&&number>=0?number:null}
    function productDiaryD0CaptureSeries(snapshots,{campaignInternalId,managerCustomerId='',customerId='',campaignId='',now=new Date()}={}){
      const internalId=String(campaignInternalId||'').trim();if(!internalId)return{points:[],dates:[],today:isoDateInTimeZone(now,'America/Sao_Paulo'),timeZone:'America/Sao_Paulo',timeZoneKnown:false};
      const normalizeCustomer=value=>String(value||'').replace(/\D/g,''),managerFilter=normalizeCustomer(managerCustomerId),customerFilter=normalizeCustomer(customerId),campaignFilter=String(campaignId||'').trim(),seen=new Set(),points=[],timeZoneObservations=[];
      for(const snapshot of Array.isArray(snapshots)?snapshots:[]){
        const completedAtUtc=String(snapshot?.completedAtUtc||''),completedAt=Date.parse(completedAtUtc),accounts=Array.isArray(snapshot?.accounts)?snapshot.accounts:[];
        if(snapshot?.periodType!=='D0'||!Number.isFinite(completedAt)||!accounts.length||Number(snapshot.accountCount)!==accounts.length||accounts.some(account=>account?.queryComplete!==true))continue;
        const matches=[];
        for(const account of accounts){
          if(managerFilter&&normalizeCustomer(account?.managerCustomerId)!==managerFilter||customerFilter&&normalizeCustomer(account?.customerId)!==customerFilter)continue;
          const timeZone=String(account?.timeZone||''),date=String(account?.date||'');
          if(!timeZone||!/^\d{4}-\d{2}-\d{2}$/.test(date)||isoDateInTimeZone(completedAtUtc,timeZone)!==date)continue;
          const mappedCampaigns=(Array.isArray(account?.campaigns)?account.campaigns:[]).filter(item=>String(item?.campaignInternalId||'')===internalId&&item?.mappingStatus==='mapped'&&(!campaignFilter||String(item?.campaignId||'')===campaignFilter));
          if(mappedCampaigns.length!==1)continue;
          timeZoneObservations.push({timeZone,completedAt});
          const campaigns=mappedCampaigns.filter(item=>item.metricsAvailable===true&&item.inferredZero!==true);
          if(campaigns.length!==1)continue;
          const campaign=campaigns[0],impressions=validNonNegativeCount(campaign.impressions),clicks=validNonNegativeCount(campaign.clicks);
          if(impressions==null||clicks==null)continue;
          matches.push({snapshotId:String(snapshot.id||snapshot.runId||''),completedAtUtc,date,timeZone,impressions,clicks});
        }
        const snapshotKey=String(snapshot.id||snapshot.runId||completedAtUtc);
        if(matches.length!==1||seen.has(snapshotKey))continue;
        seen.add(snapshotKey);points.push(matches[0]);
      }
      points.sort((a,b)=>Date.parse(a.completedAtUtc)-Date.parse(b.completedAtUtc));
      timeZoneObservations.sort((a,b)=>a.completedAt-b.completedAt);
      const selectedTimeZone=timeZoneObservations.at(-1)?.timeZone||'America/Sao_Paulo',today=isoDateInTimeZone(now,selectedTimeZone)||isoDateInTimeZone(now,'America/Sao_Paulo');
      return{points,dates:[...new Set(points.map(point=>point.date))].sort((a,b)=>b.localeCompare(a)),today,timeZone:selectedTimeZone,timeZoneKnown:timeZoneObservations.length>0};
    }
    const productColumns=[['A','Data'],['B','Impr.'],['C','Cliques Google'],['D','Cliques plataforma'],['E','Avanço presell'],['F','Conv.'],['G','CTR'],['H','Checkout'],['I','Custo médio US$'],['J','Custo médio R$'],['K','% 1ª posição'],['L','% parte sup.'],['R','Parc. impr. pesquisa'],['M','Orçam. diário'],['N','Estratégia'],['O','Investimento'],['P','Comissão'],['Q','Observações']];
  global.ProductDiaryDomain=Object.freeze({excelDate,sheetDailyRows,productDiaryRowDate,productDiaryHasSales,productDiaryManualSaleCount,productDiaryRowsWithManualSales,productDiaryRowsThroughDate,productDiaryTotals,productDiaryTableTotals,productDiaryD0CaptureSeries,productColumns});
})(typeof window==='object'?window:globalThis);
