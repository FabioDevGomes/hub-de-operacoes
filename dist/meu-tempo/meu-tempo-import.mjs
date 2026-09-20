import{makeId,normalizedName,snapshotFor}from'./meu-tempo-domain.mjs';

const MAX_ROW=43,OUTPUT_ROW=42,IGNORED_ROWS=new Set([39,40,41,43]);
const DURATION_ROWS=new Set(Array.from({length:27},(_,index)=>index+2));
export const TYPE_BY_ROW={29:'boolean',30:'boolean',31:'boolean',32:'boolean',33:'water',34:'boolean',35:'scale',36:'scale',37:'scale',38:'scale'};
const DEFAULT_CATEGORY='cat-outros';
const ITEM_ID_BY_ROW={2:'item-dormindo',3:'item-cama-acordar',4:'item-preparo-levantar',5:'item-cafe',6:'item-kakashi',7:'item-almoco',8:'item-janta',9:'item-mentalizacao',10:'item-treino',11:'item-ads-aplicando',12:'item-ads-estudos',13:'item-reflexao',14:'item-ia',15:'item-insights',16:'item-networking',17:'item-familia',18:'item-despesas',19:'item-conteudo',20:'item-livros',21:'item-praia',22:'item-entretenimento',23:'item-youtube',24:'item-instagram',25:'item-verde',26:'item-edonismo',27:'item-moto',28:'item-outros',29:'item-alcool',30:'item-refrigerante',31:'item-acucar',32:'item-sodio',33:'item-agua',34:'item-verde-horario',35:'item-garganta',36:'item-rim',37:'item-metalico',38:'item-clareza'};

function columnNumber(ref){let value=0;for(const char of ref)value=value*26+char.charCodeAt(0)-64;return value}
function excelDate(serial){const date=new Date(Date.UTC(1899,11,30)+Number(serial)*86400000);return Number.isFinite(date.getTime())?date.toISOString().slice(0,10):null}
function cellValue(cell,shared){const type=cell.getAttribute('t'),raw=cell.getElementsByTagNameNS('*','v')[0]?.textContent??null;if(type==='s')return shared[Number(raw)]??'';if(type==='inlineStr')return[...cell.getElementsByTagNameNS('*','t')].map(x=>x.textContent).join('');if(type==='str')return raw??'';if(type==='b')return raw==='1';if(raw==null||raw==='')return null;return Number.isNaN(Number(raw))?raw:Number(raw)}
function parseXml(text){const xml=new DOMParser().parseFromString(text,'application/xml');if(xml.querySelector('parsererror'))throw new Error('O XLSX contém XML inválido.');return xml}
function resolvePart(base,target){if(target.startsWith('/'))return target.slice(1);const stack=base.split('/');stack.pop();for(const part of target.replaceAll('\\','/').split('/')){if(part==='..')stack.pop();else if(part!=='.')stack.push(part)}return stack.join('/')}
async function sha256(buffer){const digest=await crypto.subtle.digest('SHA-256',buffer);return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}

class ZipReader{
  constructor(buffer,entries){this.buffer=buffer;this.entries=entries}
  static async open(buffer){const view=new DataView(buffer);let eocd=-1;for(let i=buffer.byteLength-22;i>=Math.max(0,buffer.byteLength-65557);i--)if(view.getUint32(i,true)===0x06054b50){eocd=i;break}if(eocd<0)throw new Error('O arquivo não é um XLSX válido.');const count=view.getUint16(eocd+10,true),offset=view.getUint32(eocd+16,true),entries=new Map();let pos=offset;for(let i=0;i<count;i++){if(view.getUint32(pos,true)!==0x02014b50)throw new Error('Estrutura ZIP inválida.');const method=view.getUint16(pos+10,true),size=view.getUint32(pos+20,true),nameLen=view.getUint16(pos+28,true),extraLen=view.getUint16(pos+30,true),commentLen=view.getUint16(pos+32,true),local=view.getUint32(pos+42,true),name=new TextDecoder().decode(new Uint8Array(buffer,pos+46,nameLen));entries.set(name,{method,size,local});pos+=46+nameLen+extraLen+commentLen}return new ZipReader(buffer,entries)}
  has(name){return this.entries.has(name)}
  async text(name){const entry=this.entries.get(name);if(!entry)throw new Error(`Parte ausente no XLSX: ${name}`);const view=new DataView(this.buffer),nameLen=view.getUint16(entry.local+26,true),extraLen=view.getUint16(entry.local+28,true),start=entry.local+30+nameLen+extraLen,bytes=new Uint8Array(this.buffer,start,entry.size);let output;if(entry.method===0)output=bytes;else if(entry.method===8){if(!('DecompressionStream'in globalThis))throw new Error('Este navegador não oferece descompressão local do XLSX.');output=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())}else throw new Error(`Compressão XLSX não suportada: ${entry.method}`);return new TextDecoder().decode(output)}
}

async function readTargetSheet(buffer){
  const zip=await ZipReader.open(buffer),workbook=parseXml(await zip.text('xl/workbook.xml')),rels=parseXml(await zip.text('xl/_rels/workbook.xml.rels')),relMap=new Map([...rels.getElementsByTagNameNS('*','Relationship')].map(node=>[node.getAttribute('Id'),resolvePart('xl/workbook.xml',node.getAttribute('Target'))]));
  let shared=[];if(zip.has('xl/sharedStrings.xml')){const xml=parseXml(await zip.text('xl/sharedStrings.xml'));shared=[...xml.getElementsByTagNameNS('*','si')].map(si=>[...si.getElementsByTagNameNS('*','t')].map(t=>t.textContent).join(''))}
  const target=[...workbook.getElementsByTagNameNS('*','sheet')].find(node=>normalizedName(node.getAttribute('name'))==='controle do tempo');if(!target)throw new Error('A aba “controle do tempo” não foi encontrada.');
  const id=target.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||target.getAttribute('r:id'),part=relMap.get(id);if(!part)throw new Error('A aba “controle do tempo” não possui uma relação válida.');
  const xml=parseXml(await zip.text(part)),matrix=new Map();
  for(const row of xml.getElementsByTagNameNS('*','row')){const rowIndex=Number(row.getAttribute('r'));if(rowIndex>MAX_ROW)continue;for(const cell of row.getElementsByTagNameNS('*','c')){const ref=cell.getAttribute('r')||'',col=columnNumber((ref.match(/^[A-Z]+/)||[])[0]||'');if(col)matrix.set(`${rowIndex}:${col}`,cellValue(cell,shared))}}
  return{name:target.getAttribute('name'),matrix};
}

function inferTextDate(text,previous,next){
  const match=String(text||'').trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);if(!match)return null;
  const day=Number(match[1]),month=Number(match[2]),make=year=>{const date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null};if(match[3]){const year=Number(match[3])+(match[3].length===2?2000:0),date=make(year);return date?{date,inferred:false}:null}
  if(!previous&&next){const year=Number(next.slice(0,4)),same=make(year),date=same&&same<next?same:make(year-1);return date?{date,inferred:true}:null}
  if(previous&&!next){const year=Number(previous.slice(0,4)),same=make(year),date=same&&same>previous?same:make(year+1);return date?{date,inferred:true}:null}
  const years=new Set();for(const anchor of[previous,next])if(anchor){const year=Number(anchor.slice(0,4));for(const candidate of[year-1,year,year+1])years.add(candidate)}
  const valid=[...years].map(make).filter(Boolean).filter(date=>(!previous||date>previous)&&(!next||date<next));
  return valid.length===1?{date:valid[0],inferred:true}:null;
}

function detectDates(matrix){
  const headers=[];for(let col=2;col<=600;col++){const raw=matrix.get(`1:${col}`);if(raw==null||raw==='')continue;const real=typeof raw==='number'&&raw>20000?excelDate(raw):null;headers.push({col,raw,date:real,inferred:false})}
  for(let index=0;index<headers.length;index++){const header=headers[index];if(header.date)continue;const previous=[...headers.slice(0,index)].reverse().find(x=>x.date)?.date||null,next=headers.slice(index+1).find(x=>x.date)?.date||null,inferred=inferTextDate(header.raw,previous,next);if(inferred)Object.assign(header,inferred)}
  return headers;
}

export function historicalDurationMinutes(raw){if(typeof raw!=='number'||!Number.isFinite(raw))return null;if(raw===0)return 0;return raw>0&&raw<1?Math.round(raw*1440):Math.round(raw*60)}
function comparable(entry){return JSON.stringify({date:entry.date,itemId:entry.itemId,type:entry.type,minutes:entry.minutes??null,value:entry.value??null,text:entry.text??null,start:entry.start??null,end:entry.end??null,source:entry.source,productiveSnapshot:Boolean(entry.productiveSnapshot)})}
export function classifyImportedEntries(entries,existingEntries){const existingByKey=new Map(existingEntries.filter(x=>x.importKey).map(entry=>[entry.importKey,entry]));return entries.map(entry=>{const previous=existingByKey.get(entry.importKey);return{entry,previous,status:!previous?'new':comparable(previous)===comparable(entry)?'identical':'conflict'}})}

export async function createImportPreview(file,current){
  const buffer=await file.arrayBuffer(),fileHash=await sha256(buffer),sheet=await readTargetSheet(buffer),headers=detectDates(sheet.matrix),resolved=headers.filter(x=>x.date),unresolved=headers.filter(x=>!x.date),itemByName=new Map(current.items.map(item=>[normalizedName(item.name),item])),proposedItems=[],entries=[],days=[],ambiguous=[],waterConversions=[],warnings=[];
  const settings={waterUnitMl:Number(current.settings?.waterUnitMl)||350};
  const labels=new Map();for(let row=2;row<=38;row++){const label=String(sheet.matrix.get(`${row}:1`)||'').trim();if(label)labels.set(row,label)}
  function itemFor(row,label,type){let item=current.items.find(candidate=>candidate.id===ITEM_ID_BY_ROW[row])||itemByName.get(normalizedName(label));if(item)return item;item={id:ITEM_ID_BY_ROW[row]||`excel-row-${row}`,name:label,categoryId:DEFAULT_CATEGORY,type:type==='water'?'number':type,order:1000+row,active:true,productive:false,showInCharts:type!=='text',chartType:type==='duration'?'bar':'line',aggregation:type==='duration'||type==='water'?'sum':'average',durationMode:type==='duration'?'both':null,...(type==='water'?{unit:'ml',inputUnit:'water_unit'}:{})};proposedItems.push(item);itemByName.set(normalizedName(label),item);return item}
  let blanks=0,explicitZeros=0,ignored=0;
  for(const header of resolved){
    const output=sheet.matrix.get(`${OUTPUT_ROW}:${header.col}`);if(output!=null&&String(output).trim())days.push({date:header.date,lastRecordedTime:null,output:String(output),observations:'',updatedAt:new Date().toISOString()});
    for(let row=2;row<=38;row++){
      if(IGNORED_ROWS.has(row))continue;const label=labels.get(row);if(!label){ignored++;continue}const raw=sheet.matrix.get(`${row}:${header.col}`);if(raw==null||raw===''){blanks++;continue}if(raw===0)explicitZeros++;
      const kind=DURATION_ROWS.has(row)?'duration':(TYPE_BY_ROW[row]||'text'),item=itemFor(row,label,kind);let entry={id:`excel:${header.date}:${row}`,importKey:`controle-do-tempo:${header.date}:row-${row}`,date:header.date,itemId:item.id,type:item.type,start:null,end:null,source:'excel_import',sourceRow:row,sourceValue:raw,...snapshotFor(item),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      if(kind==='duration'){const minutes=historicalDurationMinutes(raw);if(minutes==null){ambiguous.push({row,item:label,value:raw,proposedType:'duração',reason:'Valor não numérico'});continue}entry.minutes=minutes}
      else if(kind==='water'){const units=Number(raw);if(!Number.isFinite(units)){ambiguous.push({row,item:label,value:raw,proposedType:'número/água',reason:'Valor não numérico'});continue}entry.value=units*settings.waterUnitMl;entry.originalUnits=units;waterConversions.push({date:header.date,original:raw,units,unitMl:settings.waterUnitMl,ml:entry.value})}
      else if(kind==='boolean'){if(typeof raw==='boolean')entry.value=raw;else if(raw===0||raw===1)entry.value=Boolean(raw);else{ambiguous.push({row,item:label,value:raw,proposedType:'sim/não',reason:'Valor histórico heterogêneo'});continue}}
      else if(kind==='scale'){const value=Number(raw);if(!Number.isFinite(value)){ambiguous.push({row,item:label,value:raw,proposedType:'escala',reason:'Valor não numérico'});continue}entry.value=value}
      else{ambiguous.push({row,item:label,value:raw,proposedType:'texto',reason:'Campo misto requer validação'});continue}
      entries.push(entry);
    }
  }
  if(unresolved.length)warnings.push(`${unresolved.length} cabeçalho(s) de data ficaram sem ano seguro e foram ignorados.`);if(ambiguous.length)warnings.push(`${ambiguous.length} valor(es) ambíguo(s) não foram convertidos automaticamente.`);
  const classified=classifyImportedEntries(entries,current.entries),existingDays=new Map(current.days.map(day=>[day.date,day])),dayClassified=days.map(day=>{const previous=existingDays.get(day.date),status=!previous||!previous.output?'new':previous.output===day.output?'identical':'conflict';return{day:{...previous,...day,lastRecordedTime:previous?.lastRecordedTime||null,observations:previous?.observations||''},previous,status}}),dates=resolved.map(x=>x.date).sort(),entryConflicts=classified.filter(x=>x.status==='conflict').length,dayConflicts=dayClassified.filter(x=>x.status==='conflict').length,report={days:new Set(dates).size,items:new Set(entries.map(x=>x.itemId)).size,records:entries.length,newRecords:classified.filter(x=>x.status==='new').length,identical:classified.filter(x=>x.status==='identical').length,conflicts:entryConflicts+dayConflicts,entryConflicts,dayConflicts,newDayOutputs:dayClassified.filter(x=>x.status==='new').length,blanks,explicitZeros,ignored,ambiguous:ambiguous.length,unresolvedDates:unresolved.length};
  return{fileHash,fileName:file.name,sheet:sheet.name,period:{start:dates[0]||null,end:dates.at(-1)||null},headers,resolvedDates:resolved,inferredDates:resolved.filter(x=>x.inferred),unresolvedDates:unresolved,proposedItems,entries,days,dayClassified,classified,ambiguous,waterConversions,warnings,settings,report};
}
