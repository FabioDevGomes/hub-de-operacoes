(function(global){
  // Virtual sale rows are display-only: never added to the source diary.
    function excelDate(serial){const utc=Math.round((Number(serial)-25569)*86400000);return new Date(utc)}
    function sheetDailyRows(sheet){if(!sheet)return[];return sheet.rows.filter(r=>{const v=r.cells.A?.value;return typeof v==='number'&&v>=30000&&v<=70000})}
    function productDiaryRowDate(row){const rowDate=String(row?.date||row?.data||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(rowDate))return rowDate;const raw=row?.cells?.A?.value;if(typeof raw==='number'&&Number.isFinite(raw))return excelDate(raw).toISOString().slice(0,10);const text=String(row?.cells?.A?.text??raw??'').trim(),iso=text.match(/^(\d{4}-\d{2}-\d{2})/);if(iso)return iso[1];const local=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return local?`${local[3]}-${local[2].padStart(2,'0')}-${local[1].padStart(2,'0')}`:''}
    function productDiaryHasSales(row,provisionalSaleDates){const conversions=Number(row?.cells?.F?.value);return Number.isFinite(conversions)&&conversions>0||provisionalSaleDates.has(productDiaryRowDate(row))}
    function productDiaryManualSaleCount(row,manualSalesByDate){return Math.max(0,Math.floor(Number(manualSalesByDate.get(productDiaryRowDate(row))?.pendingConversions)||0))}
    function productDiaryRowsWithManualSales(rows,manualSalesByDate){const result=[...(rows||[])],seen=new Set(result.map(productDiaryRowDate).filter(Boolean));for(const[date,sale]of manualSalesByDate){const count=Math.max(0,Math.floor(Number(sale?.pendingConversions)||0));if(!count||seen.has(date))continue;const[year,month,day]=date.split('-');result.push({date,cells:{A:{value:date,text:`${day}/${month}/${year}`},Q:{value:`Venda manual provisória (${count}); aguardando confirmação MCC D−1`}}});seen.add(date)}return result.sort((a,b)=>productDiaryRowDate(a).localeCompare(productDiaryRowDate(b)))}
    function productDiaryRowsThroughDate(rows,cutoff){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(cutoff||'')))return[...(rows||[])];return(rows||[]).filter(row=>{const date=productDiaryRowDate(row);return!date||date<=cutoff})}
    function productDiaryTotals(rows,cutoff,manualSalesByDate=new Map()){
      const totals={investment:null,clicks:null,conversions:null};
      const bounded=productDiaryRowsThroughDate(productDiaryRowsWithManualSales(rows,manualSalesByDate),cutoff);
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
    // Sum only observed cells in the displayed daily series, never provisional notes.
    function productDiaryTableTotals(rows){
      const totals={B:null,C:null,F:null,O:null,P:null};
      for(const row of rows||[]){
        for(const column of Object.keys(totals)){
          const raw=row?.cells?.[column]?.value;
          if((typeof raw!=='number'&&typeof raw!=='string')||String(raw).trim()==='')continue;
          const value=Number(raw);if(!Number.isFinite(value))continue;
          totals[column]=(totals[column]??0)+value;
        }
      }
      for(const column of Object.keys(totals)){
        if(totals[column]===null)continue;
        const scale=['O','P'].includes(column)?100:1e12;
        totals[column]=Math.round((totals[column]+Number.EPSILON)*scale)/scale;
      }
      return totals;
    }
    const productColumns=[['A','Data'],['B','Impr.'],['C','Cliques Google'],['D','Cliques plataforma'],['E','Avanço presell'],['F','Conv.'],['G','CTR'],['H','Checkout'],['I','Custo médio US$'],['J','Custo médio R$'],['K','% 1ª posição'],['L','% parte sup.'],['R','Parc. impr. pesquisa'],['M','Orçam. diário'],['N','Estratégia'],['O','Investimento'],['P','Comissão'],['Q','Observações']];
  global.ProductDiaryDomain=Object.freeze({excelDate,sheetDailyRows,productDiaryRowDate,productDiaryHasSales,productDiaryManualSaleCount,productDiaryRowsWithManualSales,productDiaryRowsThroughDate,productDiaryTotals,productDiaryTableTotals,productColumns});
})(typeof window==='object'?window:globalThis);
