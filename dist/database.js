(function(){
  const SCHEMA='base_campanhas_v1';

  const clone=value=>structuredClone(value);
  const isBlank=value=>value==null||value==='';
  const comparable=value=>JSON.stringify(value??null);
  const excelDateToIso=serial=>new Date(Math.round((Number(serial)-25569)*86400000)).toISOString().slice(0,10);
  const displayName=name=>{
    let match;
    if(match=name.match(/\bWego6\s+(\d+)\b/i))return`Wego6 ${+match[1]}`;
    if(match=name.match(/\bMedicGLP\s+(\d+)\b/i))return`MagicGLP ${+match[1]}`;
    if(match=name.match(/\bSlimQA\s+(\d+)\b/i))return`SlimQA ${+match[1]}`;
    if(match=name.match(/\bAkemi\s+(\d+)\b/i))return`Akemi ${String(+match[1]).padStart(2,'0')}`;
    return name;
  };
  const accountSuffix=value=>String(value??'').trim().match(/^(\d{4})(?!\d)/)?.[1]??null;
  function idFor(value){
    let hash=2166136261;
    for(const char of String(value).toLowerCase()){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}
    return`cmp_${(hash>>>0).toString(36)}`;
  }
  function create(){return{schema:SCHEMA,atualizado_em:new Date().toISOString(),manifesto_atual:null,campanhas:[],diario:[],campos_operacionais:[],importacoes:[],snapshots_campanhas:[],vendas_provisorias:[]}}
  function normalize(base){const value=base?.schema===SCHEMA?clone(base):create();value.campanhas??=[];value.diario??=[];value.campos_operacionais??=[];value.importacoes??=[];value.snapshots_campanhas??=[];value.vendas_provisorias??=[];return value}
  function campaignIndexes(base){return{byId:new Map(base.campanhas.map(x=>[x.id,x])),byExact:new Map(base.campanhas.filter(x=>x.nome_mcc).map(x=>[x.nome_mcc.toLowerCase(),x])),byDisplay:new Map(base.campanhas.map(x=>[x.nome_exibicao.toLowerCase(),x]))}}
  function ensureCampaign(base,{exactName=null,sheetName,status='historico'}){const indexes=campaignIndexes(base),display=sheetName||displayName(exactName),existing=(exactName&&indexes.byExact.get(exactName.toLowerCase()))||indexes.byDisplay.get(display.toLowerCase());if(existing){if(exactName)existing.nome_mcc=exactName;existing.nome_exibicao=display;existing.status=status;return existing}const campaign={id:idFor(exactName||display),nome_mcc:exactName,nome_exibicao:display,status};base.campanhas.push(campaign);return campaign}
  function mergeCells(existing,incoming,overwrite,conflicts,context){const result=clone(existing||{});for(const [column,cell] of Object.entries(incoming||{})){if(!cell||isBlank(cell.value))continue;const previous=result[column];if(!previous||isBlank(previous.value)){result[column]=clone(cell);continue}if(comparable(previous.value)===comparable(cell.value))continue;if(overwrite)result[column]=clone(cell);else conflicts.push({...context,coluna:column,anterior:previous.value,novo:cell.value})}return result}
  function importWorkbook(baseInput,workbook,{overwrite=false}={}){const base=normalize(baseInput),conflicts=[];const dailyIndex=new Map(base.diario.map(x=>[`${x.campanha_id}|${x.data}`,x]));const totals=workbook?.sheets?.find(s=>s.name.toLowerCase()==='totais');for(const sheet of workbook?.sheets||[]){if(sheet===totals)continue;const dailyRows=sheet.rows.filter(row=>typeof row.cells.A?.value==='number'&&row.cells.A.value>=30000&&row.cells.A.value<=70000);if(!dailyRows.length)continue;const campaign=ensureCampaign(base,{sheetName:sheet.name,status:sheet.visible?'ativa':'historico'});for(const row of dailyRows){const date=excelDateToIso(row.cells.A.value),key=`${campaign.id}|${date}`,existing=dailyIndex.get(key),cells=clone(row.cells);if(existing)existing.celulas=mergeCells(existing.celulas,cells,overwrite,conflicts,{campanha:campaign.nome_exibicao,data:date});else{const record={campanha_id:campaign.id,data:date,celulas:cells,fontes:['excel']};base.diario.push(record);dailyIndex.set(key,record)}}}
    if(totals){for(const row of totals.rows){const exact=String(row.cells.C?.value??'').trim();if(!exact)continue;const campaign=ensureCampaign(base,{exactName:exact,sheetName:displayName(exact),status:'ativa'}),incoming={roi_atual:row.cells.L??null,investimento_atual:row.cells.M??null,limite_teste:row.cells.O??null,valor_restante:row.cells.P??null},existing=base.campos_operacionais.find(x=>x.campanha_id===campaign.id);if(existing)Object.assign(existing,incoming);else base.campos_operacionais.push({campanha_id:campaign.id,...incoming})}}
    base.importacoes.push({tipo:'excel',arquivo:workbook?.fileName||null,executada_em:new Date().toISOString(),registros:base.diario.length,conflitos:conflicts.length});base.atualizado_em=new Date().toISOString();return{base,conflicts}}
  function manifestDate(manifest){const temporal=manifest?.separacao_temporal||{};return temporal.D_zero?.datas_detectadas?.[0]||temporal.D_menos_1?.datas_detectadas?.[0]||new Date().toISOString().slice(0,10)}
  function manifestNames(manifest){return[...new Set((manifest?.campanhas||[]).map(x=>String(x.nome_campanha_exato||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}))}
  function reconcileCampaignSnapshots(baseInput,snapshotsInput){
    const base=normalize(baseInput),previousStatus=new Map(base.campanhas.filter(x=>x.nome_mcc).map(x=>[x.nome_mcc.toLowerCase(),x.status])),capturedAt=new Date().toISOString();
    for(const source of snapshotsInput||[]){const date=String(source?.data||'').trim(),names=[...new Set((source?.campanhas||[]).map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}));if(!date||!names.length)continue;const snapshot={data:date,capturada_em:source.capturada_em||capturedAt,campanhas:names},sameIndex=base.snapshots_campanhas.findIndex(x=>x.data===date);if(sameIndex>=0)base.snapshots_campanhas[sameIndex]=snapshot;else base.snapshots_campanhas.push(snapshot)}
    base.snapshots_campanhas.sort((a,b)=>a.data.localeCompare(b.data)||a.capturada_em.localeCompare(b.capturada_em));
    const current=base.snapshots_campanhas.at(-1)||null,previous=base.snapshots_campanhas.at(-2)||null;if(!current)return{base,movimentos:{data:null,anterior:null,pausadas:[],novas:[],reativadas:[]}};
    const currentKeys=new Set(current.campanhas.map(x=>x.toLowerCase())),previousKeys=new Set((previous?.campanhas||[]).map(x=>x.toLowerCase()));
    for(const campaign of base.campanhas){const exact=String(campaign.nome_mcc||'').trim(),key=exact.toLowerCase();if(!exact)continue;if(currentKeys.has(key)){const wasPaused=previousStatus.get(key)==='pausada'||campaign.pausada_em;campaign.status='ativa';campaign.ultima_aparicao=current.data;campaign.status_origem='presente_na_coleta';campaign.movimento_status=wasPaused&&!previousKeys.has(key)?'reativada':previous&&previousKeys.has(key)?'manteve':'nova';if(wasPaused&&!previousKeys.has(key))campaign.reativada_em=current.data;delete campaign.pausada_em}else if(previousKeys.has(key)){campaign.status='pausada';campaign.pausada_em=current.data;campaign.ultima_aparicao=previous.data;campaign.status_origem='ausencia_na_coleta';campaign.movimento_status='pausada'}}
    const movimentos={data:current.data,anterior:previous?.data||null,pausadas:base.campanhas.filter(x=>x.status==='pausada'&&x.pausada_em===current.data).map(x=>x.nome_mcc),novas:base.campanhas.filter(x=>x.status==='ativa'&&x.movimento_status==='nova').map(x=>x.nome_mcc),reativadas:base.campanhas.filter(x=>x.status==='ativa'&&x.movimento_status==='reativada'&&x.reativada_em===current.data).map(x=>x.nome_mcc)};base.atualizado_em=capturedAt;return{base,movimentos}
  }
  function updateCampaignSnapshot(base,manifest,previousStatus){
    const capturedAt=new Date().toISOString(),date=manifestDate(manifest),names=manifestNames(manifest),currentKeys=new Set(names.map(x=>x.toLowerCase()));
    if(!base.snapshots_campanhas.length&&base.manifesto_atual){const priorDate=manifestDate(base.manifesto_atual),priorNames=manifestNames(base.manifesto_atual);if(priorNames.length)base.snapshots_campanhas.push({data:priorDate,capturada_em:base.atualizado_em||capturedAt,campanhas:priorNames})}
    const sameIndex=base.snapshots_campanhas.findIndex(x=>x.data===date),snapshot={data:date,capturada_em:capturedAt,campanhas:names};
    if(sameIndex>=0)base.snapshots_campanhas[sameIndex]=snapshot;else base.snapshots_campanhas.push(snapshot);
    base.snapshots_campanhas.sort((a,b)=>a.data.localeCompare(b.data)||a.capturada_em.localeCompare(b.capturada_em));
    const previous=[...base.snapshots_campanhas].filter(x=>x.data<date).at(-1)||null,previousKeys=new Set((previous?.campanhas||[]).map(x=>x.toLowerCase()));
    for(const campaign of base.campanhas){const exact=String(campaign.nome_mcc||'').trim(),key=exact.toLowerCase();if(!exact)continue;if(currentKeys.has(key)){const wasPaused=previousStatus.get(key)==='pausada'||campaign.pausada_em;campaign.status='ativa';campaign.ultima_aparicao=date;campaign.status_origem='presente_na_coleta';campaign.movimento_status=wasPaused&&!previousKeys.has(key)?'reativada':previous&&previousKeys.has(key)?'manteve':'nova';if(wasPaused&&!previousKeys.has(key))campaign.reativada_em=date;delete campaign.pausada_em}else if(previousKeys.has(key)){campaign.status='pausada';campaign.pausada_em=date;campaign.ultima_aparicao=previous.data;campaign.status_origem='ausencia_na_coleta';campaign.movimento_status='pausada'}}
    return{data:date,anterior:previous?.data||null,pausadas:base.campanhas.filter(x=>x.status==='pausada'&&x.pausada_em===date).map(x=>x.nome_mcc),novas:base.campanhas.filter(x=>x.status==='ativa'&&x.movimento_status==='nova').map(x=>x.nome_mcc),reativadas:base.campanhas.filter(x=>x.status==='ativa'&&x.movimento_status==='reativada'&&x.reativada_em===date).map(x=>x.nome_mcc)}
  }
  function importManifest(baseInput,manifest,rowFactory,{overwrite=false}={}){
    const base=normalize(baseInput),conflicts=[],previousStatus=new Map(base.campanhas.filter(x=>x.nome_mcc).map(x=>[x.nome_mcc.toLowerCase(),x.status]));
    const dailyIndex=new Map(base.diario.map(x=>[`${x.campanha_id}|${x.data}`,x]));
    for(const source of manifest?.campanhas||[]){
      const exact=source.nome_campanha_exato,campaign=ensureCampaign(base,{exactName:exact,sheetName:displayName(exact),status:'ativa'});
      const suffix=accountSuffix(source.metricas_D_zero?.conta?.valor??source.metricas_D_menos_1?.conta?.valor);
      if(suffix)campaign.conta_sufixo=suffix;
      const made=rowFactory(source),rows=Array.isArray(made)?made:[made];
      for(const row of rows.filter(Boolean)){
        const date=row.date||source.metricas_D_menos_1?.data?.valor||manifest?.separacao_temporal?.D_menos_1?.datas_detectadas?.[0];
        if(!date)continue;
        const key=`${campaign.id}|${date}`,existing=dailyIndex.get(key);
        if(existing){existing.celulas=mergeCells(existing.celulas,row.cells,overwrite,conflicts,{campanha:campaign.nome_exibicao,data:date});if(!existing.fontes.includes('manifesto'))existing.fontes.push('manifesto')}
        else{const record={campanha_id:campaign.id,data:date,celulas:clone(row.cells),fontes:['manifesto']};base.diario.push(record);dailyIndex.set(key,record)}
      }
    }
    const movimentos=updateCampaignSnapshot(base,manifest,previousStatus);base.manifesto_atual=clone(manifest);base.importacoes.push({tipo:'manifesto',executada_em:new Date().toISOString(),registros:(manifest?.campanhas||[]).length,conflitos:conflicts.length,movimentos});base.atualizado_em=new Date().toISOString();return{base,conflicts,movimentos}
  }
  function dailyRows(baseInput,sheetName){const base=normalize(baseInput),campaign=base.campanhas.find(x=>x.nome_exibicao.toLowerCase()===String(sheetName).toLowerCase());if(!campaign)return[];return base.diario.filter(x=>x.campanha_id===campaign.id).sort((a,b)=>a.data.localeCompare(b.data)).map((x,index)=>({index:index+1,cells:clone(x.celulas)}))}
  function campaignTotalsMap(baseInput){
    const base=normalize(baseInput),campaigns=new Map(base.campanhas.map(x=>[x.id,x])),sums=new Map(),rows=new Map();
    for(const record of base.diario){
      const campaign=campaigns.get(record.campanha_id);
      if(!campaign)continue;
      const total=sums.get(campaign.id)||{investment:0,impressions:0,clicks:0,conversions:0,commission:0,observed:{investment:0,impressions:0,clicks:0,conversions:0,commission:0},byDate:{}};
      const day=total.byDate[record.data]||{investment:0,impressions:0,clicks:0,conversions:0,commission:0};
      for(const [field,column] of Object.entries({investment:'O',impressions:'B',clicks:'C',conversions:'F',commission:'P'})){
        const value=Number(record.celulas?.[column]?.value);
        if(record.celulas?.[column]?.value!=null&&record.celulas[column].value!==''&&Number.isFinite(value)){total[field]+=value;day[field]+=value;total.observed[field]++}
      }
      total.byDate[record.data]=day;
      sums.set(campaign.id,total);
      rows.set(campaign.id,(rows.get(campaign.id)||0)+1);
    }
    const map=new Map();
    for(const campaign of base.campanhas){
      if(!rows.has(campaign.id))continue;
      const total=sums.get(campaign.id);
      if(campaign.nome_mcc)map.set(`mcc:${campaign.nome_mcc.toLowerCase()}`,total);
      map.set(`aba:${campaign.nome_exibicao.toLowerCase()}`,total);
    }
    return map;
  }
  function consecutiveZeroImpressionDays(baseInput,campaignId,referenceDate,overrides=[]){
    const base=normalize(baseInput),byDate=new Map();
    for(const record of base.diario){
      if(record.campanha_id!==campaignId||!record.data)continue;
      const raw=record.celulas?.B?.value;
      if(raw==null||raw==='')continue;
      const value=Number(raw);
      if(Number.isFinite(value))byDate.set(record.data,value);
    }
    for(const item of overrides||[]){
      if(!item?.date||item.impressions==null||item.impressions==='')continue;
      const value=Number(item.impressions);
      if(Number.isFinite(value))byDate.set(item.date,value);
    }
    const date=String(referenceDate||[...byDate.keys()].sort().at(-1)||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!byDate.has(date))return null;
    const cursor=new Date(`${date}T00:00:00Z`);let count=0;
    while(true){
      const current=cursor.toISOString().slice(0,10);
      if(!byDate.has(current)||byDate.get(current)!==0)break;
      count++;cursor.setUTCDate(cursor.getUTCDate()-1);
    }
    return count;
  }
  function investmentTotalsMap(baseInput){const totals=campaignTotalsMap(baseInput),map=new Map();for(const [key,value] of totals)map.set(key,value.investment);return map}
  function operationalMap(baseInput){const base=normalize(baseInput),campaigns=new Map(base.campanhas.map(x=>[x.id,x])),map=new Map();for(const record of base.campos_operacionais){const campaign=campaigns.get(record.campanha_id);if(!campaign?.nome_mcc)continue;map.set(campaign.nome_mcc,{L:record.roi_atual,M:record.investimento_atual,O:record.limite_teste,P:record.valor_restante})}return map}
  function addProvisionalSale(baseInput,input){
    const base=normalize(baseInput),campaign=base.campanhas.find(x=>x.id===input?.campanha_id),date=String(input?.data||'').trim(),amount=Number(input?.valor_brl),country=String(input?.pais_codigo||'').trim().toUpperCase(),dedupe=String(input?.chave_duplicidade||'').trim().toLowerCase();
    if(!campaign)throw new Error('Selecione uma campanha válida para registrar a venda.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('A data da venda não foi reconhecida.');
    if(!Number.isFinite(amount)||amount<=0)throw new Error('O valor da venda não foi reconhecido.');
    if(!/^[A-Z]{2}$/.test(country))throw new Error('Selecione o país ou marque País não identificado.');
    if(!dedupe)throw new Error('Não foi possível criar a chave de prevenção de duplicidade.');
    const existing=base.vendas_provisorias.find(x=>x.chave_duplicidade===dedupe&&x.status!=='cancelada');
    if(existing)return{base,sale:existing,duplicate:true};
    const sale={id:`sale_${idFor(dedupe).slice(4)}`,campanha_id:campaign.id,data:date,hora:String(input.hora||'').trim()||null,produto:String(input.produto||'').trim()||null,plataforma:String(input.plataforma||'').trim()||null,valor_brl:amount,pais_codigo:country,origem:String(input.origem||'FlowTracking').trim(),identificador_mascarado:String(input.identificador_mascarado||'').trim()||null,chave_duplicidade:dedupe,status:'provisoria',registrada_em:new Date().toISOString()};
    base.vendas_provisorias.push(sale);base.importacoes.push({tipo:'venda_provisoria',executada_em:sale.registrada_em,registros:1,conflitos:0});base.atualizado_em=sale.registrada_em;return{base,sale,duplicate:false};
  }
  function salesAdjustmentMap(baseInput){
    const base=normalize(baseInput),official=new Map(),groups=new Map();
    for(const row of base.diario){const key=`${row.campanha_id}|${row.data}`,entry=official.get(key)||{conversions:0,commission:0};entry.conversions+=Number(row.celulas?.F?.value)||0;entry.commission+=Number(row.celulas?.P?.value)||0;official.set(key,entry)}
    for(const sale of base.vendas_provisorias.filter(x=>x.status!=='cancelada')){const key=`${sale.campanha_id}|${sale.data}`,group=groups.get(key)||{campaignId:sale.campanha_id,date:sale.data,sales:[],amount:0,countries:new Set()};group.sales.push(sale);group.amount+=Number(sale.valor_brl)||0;if(sale.pais_codigo)group.countries.add(sale.pais_codigo);groups.set(key,group)}
    const map=new Map();
    for(const [key,group] of groups){const seen=official.get(key)||{conversions:0,commission:0},pendingConversions=Math.max(0,group.sales.length-seen.conversions),commissionAdjustment=Math.max(0,group.amount-seen.commission),summary=map.get(group.campaignId)||{pendingConversions:0,commissionAdjustment:0,sales:0,countries:new Set(),byDate:{}};summary.pendingConversions+=pendingConversions;summary.commissionAdjustment+=commissionAdjustment;summary.sales+=group.sales.length;for(const code of group.countries)summary.countries.add(code);summary.byDate[group.date]={pendingConversions,commissionAdjustment,sales:group.sales.length,countries:[...group.countries]};map.set(group.campaignId,summary)}
    return map;
  }
  window.CampaignDatabase={SCHEMA,create,normalize,importWorkbook,importManifest,reconcileCampaignSnapshots,dailyRows,campaignTotalsMap,consecutiveZeroImpressionDays,investmentTotalsMap,operationalMap,addProvisionalSale,salesAdjustmentMap};
})();
