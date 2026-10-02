export const ITEM_TYPES=Object.freeze(['duration','number','scale','boolean','text','time']);
export const BOOLEAN_ITEM_IDS=Object.freeze(['item-alcool','item-refrigerante','item-acucar','item-sodio','item-verde-horario']);
export const PARTIALLY_PRODUCTIVE_ITEM_ID='item-kakashi';
export const PARTIAL_PRODUCTIVE_RATE=0.1;
export const PRE_WORK_ITEM_IDS=Object.freeze(['item-cama-acordar','item-preparo-levantar','item-cafe',PARTIALLY_PRODUCTIVE_ITEM_ID]);
export const SYMPTOM_SCALE_ITEM_IDS=Object.freeze(['item-garganta','item-rim','item-metalico']);
export const SYMPTOM_SCALE_OPTIONS=Object.freeze([
  Object.freeze({value:3,label:'Alto'}),
  Object.freeze({value:2,label:'Médio'}),
  Object.freeze({value:1,label:'Baixo'}),
  Object.freeze({value:0,label:'Inexistente'})
]);

export const DEFAULT_CATEGORIES=Object.freeze([
  {id:'cat-exemplos',name:'Exemplos',order:10,active:true}
]);

const seed=(id,name,categoryId,type='duration',order=10,extra={})=>({id,name,categoryId,type,order,active:true,productive:false,showInCharts:type!=='text',chartType:type==='duration'?'bar':'line',aggregation:type==='duration'?'sum':'average',durationMode:type==='duration'?'both':null,...extra});
// Only neutral starter examples belong in source control. Personal categories,
// activities, and history live in the user's local IndexedDB and are not reseeded.
export const DEFAULT_ITEMS=Object.freeze([
  seed('item-dormindo','Dormindo','cat-exemplos','duration',10),
  seed('item-cama-acordar','Na cama após acordar','cat-exemplos','duration',20),
  seed('item-preparo-levantar','Preparo após levantar','cat-exemplos','duration',30),
  seed('item-cafe','Café','cat-exemplos','duration',40)
]);

export function parseQuickDuration(raw){
  const text=String(raw??'').trim();
  if(!/^\d+$/.test(text))throw new Error('Digite somente números.');
  let hours=0,minutes=0;
  if(text.length<=2)minutes=Number(text);
  else{hours=Number(text.slice(0,-2));minutes=Number(text.slice(-2))}
  if(minutes<0||minutes>59)throw new Error('Os minutos devem estar entre 00 e 59.');
  const total=hours*60+minutes;
  if(total<=0)throw new Error('Informe uma duração maior que zero.');
  return total;
}

export function parseLocalizedNumber(raw,{allowNegative=false}={}){
  const text=String(raw??'').trim().replace(/\s/g,'').replace(',','.');
  if(!text)throw new Error('Informe um valor.');
  if(!/^-?\d+(?:\.\d+)?$/.test(text))throw new Error('Informe um número válido.');
  const value=Number(text);
  if(!Number.isFinite(value)||!allowNegative&&value<0)throw new Error('Informe um número válido.');
  return value;
}

export function waterUnitsToMl(raw,unitMl=350){
  const units=parseLocalizedNumber(raw,{allowNegative:true}),volume=Number(unitMl);
  if(!Number.isFinite(volume)||volume<=0)throw new Error('Configure um volume de água válido.');
  return{units,ml:units*volume};
}

export function minutesBetween(start,end){
  if(!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end))throw new Error('Informe horários válidos.');
  const toMinutes=value=>{const[h,m]=value.split(':').map(Number);if(h>23||m>59)throw new Error('Informe horários válidos.');return h*60+m};
  const from=toMinutes(start),to=toMinutes(end);
  if(to<from)throw new Error('Intervalos atravessando meia-noite ainda precisam de uma regra definida.');
  if(to===from)throw new Error('O intervalo precisa ter duração maior que zero.');
  return to-from;
}

export function registeredIntervalUntil(totalMinutes,currentMinutes){
  const total=Math.round(Number(totalMinutes)),current=Math.round(Number(currentMinutes));
  if(!Number.isFinite(total)||total<0)throw new Error('O tempo total registrado é inválido.');
  if(!Number.isFinite(current)||current<0||current>=1440)throw new Error('O horário atual é inválido.');
  if(total>current)throw new Error('O tempo total registrado ultrapassa o horário atual. Revise os lançamentos do dia.');
  if(total===current)throw new Error('Não há tempo novo para registrar agora.');
  const clock=minutes=>`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
  return{start:clock(total),end:clock(current),minutes:current-total};
}

export function planDurationRemoval(entries,requestedMinutes){
  const requested=Math.round(Number(requestedMinutes));
  if(!Number.isFinite(requested)||requested<=0)throw new Error('Informe uma duração válida para remover.');
  const candidates=entries.filter(entry=>entry.type==='duration'&&Number(entry.minutes)>0).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||String(b.id).localeCompare(String(a.id)));
  const available=candidates.reduce((sum,entry)=>sum+Number(entry.minutes),0);
  if(requested>available)throw new Error(`Só existem ${formatDuration(available)} registrados nesta atividade para remover.`);
  const deleteIds=[],updates=[];let remaining=requested;
  for(const entry of candidates){if(!remaining)break;const current=Number(entry.minutes),removed=Math.min(current,remaining),next=current-removed;remaining-=removed;if(next===0)deleteIds.push(entry.id);else updates.push({id:entry.id,minutes:next})}
  return{requestedMinutes:requested,deleteIds,updates};
}

export function formatDuration(value){
  const minutes=Math.max(0,Math.round(Number(value)||0)),hours=Math.floor(minutes/60),rest=minutes%60;
  return hours?`${hours}h${String(rest).padStart(2,'0')}`:`${rest}min`;
}

export function booleanHistoryValue(item,value){
  if(item?.type!=='boolean'&&!BOOLEAN_ITEM_IDS.includes(item?.id))return null;
  if(value==null||String(value).trim()==='')return'—';
  const numeric=Number(value);
  if(numeric===0)return'Não';
  if(numeric===1)return'Sim';
  return null;
}

export function symptomScaleHistoryValue(item,value){
  if(!SYMPTOM_SCALE_ITEM_IDS.includes(item?.id))return null;
  if(value==null||String(value).trim()==='')return'—';
  const numeric=Number(value);
  return SYMPTOM_SCALE_OPTIONS.find(option=>option.value===numeric)?.label??null;
}

export function localDate(value=new Date()){
  const date=value instanceof Date?value:new Date(value);
  return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function formatBrazilianDate(iso){
  const match=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?`${match[3]}/${match[2]}/${match[1]}`:'—';
}

export function parseBrazilianDate(raw){
  const match=String(raw||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(!match)throw new Error('Informe a data no formato dd/mm/aaaa.');
  const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]),date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw new Error('Informe uma data válida no formato dd/mm/aaaa.');
  return`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

export function shiftDate(iso,days){const date=new Date(`${iso}T12:00:00`);date.setDate(date.getDate()+days);return localDate(date)}
export function dateRange(start,end){const dates=[];for(let date=start;date&&date<=end;date=shiftDate(date,1)){dates.push(date);if(dates.length>3700)break}return dates}

export function valueForEntry(entry){
  if(entry.type==='duration')return Number(entry.minutes)||0;
  if(entry.type==='boolean')return entry.value===true||entry.value===1?1:0;
  if(entry.type==='number'||entry.type==='scale')return Number(entry.value)||0;
  return null;
}

export function aggregateDay(entries,date){
  const rows=entries.filter(entry=>entry.date===date),byItem=new Map();let totalMinutes=0,productiveMinutes=0;
  for(const entry of rows){
    const current=byItem.get(entry.itemId)||{entries:[],minutes:0,values:[]};current.entries.push(entry);
    if(entry.type==='duration'){const minutes=Number(entry.minutes)||0;current.minutes+=minutes;totalMinutes+=minutes;productiveMinutes+=productiveContributionMinutes(entry)}
    else current.values.push(entry.value);
    byItem.set(entry.itemId,current);
  }
  return{date,entries:rows,byItem,totalMinutes,productiveMinutes,productivePercent:totalMinutes?productiveMinutes/totalMinutes*100:0};
}

export function totalPreWorkDuration(entries,date){
  const itemIds=new Set(PRE_WORK_ITEM_IDS);
  return entries.reduce((total,entry)=>{
    if(entry.date!==date||entry.type!=='duration'||!itemIds.has(entry.itemId))return total;
    const minutes=Number(entry.minutes);
    return Number.isFinite(minutes)?total+Math.max(0,minutes):total;
  },0);
}

export function productiveContributionMinutes(entry){
  if(entry?.type!=='duration')return 0;
  const minutes=Math.max(0,Number(entry.minutes)||0);
  if(entry.itemId===PARTIALLY_PRODUCTIVE_ITEM_ID)return minutes*PARTIAL_PRODUCTIVE_RATE;
  return entry.productiveSnapshot?minutes:0;
}

export function productivityLabel(entry){
  if(entry?.type==='duration'&&entry.itemId===PARTIALLY_PRODUCTIVE_ITEM_ID)return'10% produtivo';
  return entry?.productiveSnapshot?'Sim':'Não';
}

export function comparisonMatrix(items,entries,dates){
  const rows=items.map(item=>{const cells=dates.map(date=>{const cell=aggregateDay(entries.filter(entry=>entry.itemId===item.id),date).byItem.get(item.id)||{entries:[],minutes:0,values:[]};return SYMPTOM_SCALE_ITEM_IDS.includes(item.id)?{...cell,values:cell.values.length?[cell.values.at(-1)]:[]}:cell});const numeric=cells.map(cell=>{if(item.type==='duration')return cell.minutes;const values=cell.values.map(Number).filter(Number.isFinite);if(SYMPTOM_SCALE_ITEM_IDS.includes(item.id))return values.length?values.at(-1):null;return values.reduce((a,b)=>a+b,0)}).filter(Number.isFinite);return{item,cells,average:numeric.length?numeric.reduce((a,b)=>a+b,0)/numeric.length:0}});
  const foot=dates.map(date=>aggregateDay(entries,date));
  const averages=foot.length?{productiveMinutes:foot.reduce((sum,day)=>sum+day.productiveMinutes,0)/foot.length,totalMinutes:foot.reduce((sum,day)=>sum+day.totalMinutes,0)/foot.length}:{productiveMinutes:null,totalMinutes:null};
  return{dates,rows,foot,averages};
}

export function totalDurationForCategory(entries,items,categoryId,dates){
  const itemById=new Map(items.map(item=>[item.id,item])),dateSet=new Set(dates);
  return entries.reduce((total,entry)=>{
    if(entry.type!=='duration'||!dateSet.has(entry.date))return total;
    const category=entry.categoryIdSnapshot||itemById.get(entry.itemId)?.categoryId;
    const minutes=Number(entry.minutes);
    return category===categoryId&&Number.isFinite(minutes)?total+Math.max(0,minutes):total;
  },0);
}

export function totalProductiveDuration(entries,dates){
  const dateSet=new Set(dates);
  return entries.reduce((total,entry)=>{
    if(entry.type!=='duration'||!dateSet.has(entry.date))return total;
    return total+productiveContributionMinutes(entry);
  },0);
}

export function snapshotFor(item){return{itemNameSnapshot:item.name,categoryIdSnapshot:item.categoryId,productiveSnapshot:Boolean(item.productive)}}
export function normalizedName(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
export function makeId(prefix='id'){return`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`}
