export const PARSER_VERSION='1.2.0';
export const ANALYZER_VERSION='2.0.0';
export const GLIMPSE_RULE_VERSION='glimpse-signal-v2';

const NOISE=/^(?:set alert|tracking|forecast|export data|file_download|code|share|more_vert|help_outline|previous|next|upgrade|compare|all searches|topic map|refreshes in|\d+\s*\/\s*\d+|searches left)$/i;
const HEADINGS=['People Also Search','Related Trends','Channel','Interesse por região','Related Topics','Related Queries','Assuntos relacionados','Pesquisas relacionadas'];
const CATEGORY_RULES=[
  ['BOFU / Reviews',/\b(review|reviews|avis|opini(?:a|ã)o|opiniões|omdöme|testimonials?|reclame aqui)\b/i],
  ['Compra / Preço',/\b(price|preço|preco|buy|comprar|purchase|coupon|cupom|discount|desconto|onde comprar|order|pedido)\b/i],
  ['Confiança / Objeção',/\b(scam|fraud|fraude|con\b|legit|legítim|confiável|confiavel|real\b|funciona|reliable|trust|seguro)\b/i],
  ['Produto / Características',/\b(app|box|manual|setup|channels?|canais|ingredients?|ingredientes?|dose|dosage|configura(?:ç|c)|features?|benefits?)\b/i],
  ['Técnico',/\b(config|configuration|documentation|github|xml|api|default|code|apk|stream)\b/i],
  ['Navegacional',/\b(facebook|instagram|site|official|oficial|login|youtube)\b/i],
  ['Problema / Benefício',/\b(weight loss|emagrec|sleep|sono|pain|dor|hearing|cabelo|hair|skin|pele)\b/i],
  ['Informacional',/\b(what|how|como|o que|qual|why|por que|para que)\b/i]
];

export function normalize(value=''){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
export function sanitizeRaw(raw=''){
  return String(raw).replace(/https?:\/\/\S+/gi,url=>{try{const parsed=new URL(url);return `${parsed.origin}${parsed.pathname}`}catch{return '[URL removida]'}}).replace(/(token|auth|session|key|code)=\S+/gi,'$1=[removido]').replace(/\r/g,'').trim();
}
function linesFrom(raw=''){return sanitizeRaw(raw).split('\n').map(line=>line.replace(/&#x20;|&nbsp;/gi,' ').replace(/\\_/g,'_').trim()).filter(Boolean)}
function headingIndex(lines,name,start=0){const target=normalize(name);return lines.findIndex((line,index)=>index>=start&&normalize(line)===target)}
function nextHeadingIndex(lines,start,names=HEADINGS){const targets=new Set(names.map(normalize));for(let index=start;index<lines.length;index++)if(targets.has(normalize(lines[index])))return index;return lines.length}
function parseCompactNumber(text){const match=String(text).replace(/\s/g,'').match(/^(<|>|≤|≥)?([\d.,]+)([KMB])?$/i);if(!match)return null;let numeric=match[2].replace(',','.');const value=Number(numeric);if(!Number.isFinite(value))return null;const multiplier={K:1e3,M:1e6,B:1e9}[String(match[3]||'').toUpperCase()]||1;return {value:Math.round(value*multiplier),operator:match[1]||'=',display:`${match[1]||''}${match[2]}${match[3]||''}`}}
function parseReported(text,unit){const expression=new RegExp(`(?:Showing|Mostrando)\\s+(\\d+)\\s*(?:-|a)\\s*(\\d+)\\s+(?:of|de)\\s+(\\d+)\\s+${unit}`,'i'),match=String(text).match(expression);return match?{visibleStart:Number(match[1]),visibleEnd:Number(match[2]),reportedTotal:Number(match[3])}:null}
function cleanItems(lines){return lines.filter(line=>!NOISE.test(line)&&!/^See all /i.test(line)&&!/^Page \d+ of \d+/i.test(line)&&!/^Showing /i.test(line)&&!/^Include low /i.test(line)&&!/^Incluir regiões/i.test(line)&&!/^Data not available/i.test(line)&&!/^Não há dados/i.test(line))}
function sectionLines(lines,heading,endHeadings=HEADINGS){const start=headingIndex(lines,heading);if(start<0)return[];return lines.slice(start+1,nextHeadingIndex(lines,start+1,endHeadings))}
function stateFor(lines,section=''){const text=(sectionLines(lines,section).join(' ')||lines.join(' '));if(/unavailable for low volume|indisponível por baixo volume/i.test(text))return'unavailable_low_volume';if(/not enough data|não há dados de pesquisa suficientes/i.test(text))return'insufficient_data';if(/data not available|dados indisponíveis/i.test(text))return'not_available';return section&&headingIndex(lines,section)<0?'not_detected':'available'}
function parsePeopleAlsoSearch(lines){const raw=sectionLines(lines,'People Also Search',['Related Trends','Channel','Interesse por região','Related Topics','Related Queries']);const pageLine=raw.find(line=>/^Page \d+ of \d+/i.test(line));const page=pageLine?.match(/Page\s+(\d+)\s+of\s+(\d+)/i);const items=cleanItems(raw).filter(line=>!/^(?:Seasonality|Not enough data)/i.test(line));return {state:headingIndex(lines,'People Also Search')<0?'not_detected':items.length?'available':stateFor(lines,'People Also Search'),items:[...new Set(items)],capturedCount:new Set(items).size,pagination:page?{currentPage:Number(page[1]),totalPages:Number(page[2])}:null}}
function parseRelatedTrends(lines){const raw=sectionLines(lines,'Related Trends',['Channel','Interesse por região','Related Topics','Related Queries']);const totalLine=raw.find(line=>/^See all /i.test(line)),total=totalLine?.match(/See all\s+(\d+)\+?\s+Related Trends/i);const items=cleanItems(raw).filter(line=>!/^See all /i.test(line));return {state:headingIndex(lines,'Related Trends')<0?'not_detected':items.length?'available':stateFor(lines,'Related Trends'),items:[...new Set(items)],capturedCount:new Set(items).size,reportedTotalMin:total?Number(total[1]):null,reportedTotalIsApproximate:!!totalLine?.includes('+')}}
function parseRegions(lines){
  const indices=[];for(let i=0;i<lines.length;i++)if(normalize(lines[i])==='interesse por regiao')indices.push(i);const start=indices.at(-1);if(start===undefined)return{state:'not_detected',items:[],capturedCount:0,reportedTotal:null};
  const end=nextHeadingIndex(lines,start+1,['Related Topics','Related Queries','Assuntos relacionados','Pesquisas relacionadas','Topic Map']);const raw=lines.slice(start+1,end),items=[];
  for(let i=0;i<raw.length;i++){
    let rankMatch=raw[i].match(/^(\d+)\s+(.+?)\s*(<?\d+)$/);if(rankMatch){items.push({rank:Number(rankMatch[1]),region:rankMatch[2].trim(),interestIndex:Number(rankMatch[3].replace('<','')),interestOperator:rankMatch[3].startsWith('<')?'<':'='});continue}
    if(/^\d+$/.test(raw[i])&&raw[i+1]&&!NOISE.test(raw[i+1])){const value=raw[i+2]?.match(/^(<)?(\d+)$/);if(value){items.push({rank:Number(raw[i]),region:raw[i+1],interestIndex:Number(value[2]),interestOperator:value[1]||'='});i+=2}}
  }
  const reportLine=raw.find(line=>/^(?:Showing|Mostrando) /i.test(line)),report=parseReported(reportLine||'','(?:regions|regiões)');return {state:items.length?'available':stateFor(lines,'Interesse por região'),items,capturedCount:items.length,reportedTotal:report?.reportedTotal??null};
}
function parseEmerging(lines,heading,endHeadings){
  const headings=Array.isArray(heading)?heading:[heading],selected=headings.find(name=>headingIndex(lines,name)>=0)||headings[0],raw=sectionLines(lines,selected,endHeadings),items=[];
  for(let i=0;i<raw.length;i++){
    const rank=raw[i].match(/^(\d+)$/);if(!rank)continue;let text=raw[i+1];if(!text||NOISE.test(text))continue;let status='',growth=null,breakout=false;const inline=text.match(/^(.*?)(Aumento repentino|Breakout|Mais\s*\d+%|\+\d+%)$/i);if(inline){text=inline[1].trim();status=inline[2];breakout=/Aumento repentino|Breakout/i.test(status);growth=breakout?null:Number(status.match(/\d+/)?.[0]);i+=1}else{const candidate=raw[i+2]||'';if(/Aumento repentino|Breakout/i.test(candidate)){status=candidate;breakout=true;i+=2}else if(/(?:Mais\s*)?\d+%|\+\d+%/.test(candidate)){status=candidate;growth=Number(candidate.match(/\d+/)?.[0]);i+=2}else i+=1}items.push({rank:Number(rank[1]),text,status,growthPercent:growth,breakout});
  }
  const reportLine=raw.find(line=>/^(?:Showing|Mostrando) /i.test(line)),unit=/Topics|Assuntos/i.test(selected)?'(?:topics|assuntos)':'(?:topics|consultas)',report=parseReported(reportLine||'',unit);return {state:items.length?'available':stateFor(lines,selected),items,capturedCount:items.length,reportedTotal:report?.reportedTotal??null};
}
function detectBasic(lines){
  const termLabel=headingIndex(lines,'Termo de pesquisa'),term=termLabel>0?lines[termLabel-1]:'';const compare=headingIndex(lines,'Compare',Math.max(0,termLabel));const config=compare>=0?lines.slice(compare+1,compare+5):[];
  return {searchTerm:term,region:config[0]||null,period:config[1]||null,category:config[2]||null,searchType:config[3]||null};
}
function detectVolume(lines){for(let i=0;i<lines.length;i++){const match=lines[i].match(/^(<\s*)?[\d.,]+\s*[KMB]?\s+searches past month$/i);if(!match)continue;const display=lines[i].replace(/\s+searches past month/i,'').replace(/\s/g,''),parsed=parseCompactNumber(display);return parsed?{...parsed,period:'past_month',state:'available'}:null}return{value:null,operator:null,display:null,period:'past_month',state:'not_detected'}}
function normalizeMovementSign(value){return String(value).replace(/[−‒–﹣－]/g,'-')}
const MOVEMENT_WINDOWS=[
  {period:'past_week',label:'última semana',pattern:/\b(?:past|last)\s+(?:week|7\s+days)\b|última semana|últimos? 7 dias/i},
  {period:'past_month',label:'último mês',pattern:/\b(?:past|last)\s+(?:month|30\s+days)\b|último mês|último mes|últimos? 30 dias/i},
  {period:'past_quarter',label:'último trimestre',pattern:/\b(?:past|last)\s+(?:quarter|3\s+months)\b|último trimestre|últimos? 3 meses/i},
  {period:'past_year',label:'último ano',pattern:/\b(?:past|last)\s+(?:year|12\s+months)\b|último ano|últimos? 12 meses/i}
];
function movementWindow(text=''){return MOVEMENT_WINDOWS.find(window=>window.pattern.test(String(text)))||null}
function isMovementWindowOnly(text=''){return /^(?:past|last)\s+(?:week|month|quarter|year|7\s+days|30\s+days|3\s+months|12\s+months)$|^(?:última semana|último mês|último mes|último trimestre|último ano|últimos? (?:7 dias|30 dias|3 meses|12 meses))$/i.test(String(text).trim())}
function detectMovement(lines){
  const candidates=[];
  for(let index=0;index<lines.length;index++){
    const line=normalizeMovementSign(lines[index]),match=line.match(/([+-]?\s*\d+(?:[.,]\d+)?)\s*%/);
    if(!match)continue;
    const previous=lines[index-1]||'',contexts=[lines[index],lines[index+1]||'',isMovementWindowOnly(previous)?previous:''];
    const window=contexts.map(movementWindow).find(Boolean);
    if(!window)continue;
    const percent=Number(match[1].replace(/\s/g,'').replace(',','.'));
    if(Number.isFinite(percent))candidates.push({percent,period:window.period,periodLabel:window.label,state:'available'});
  }
  return candidates[0]||{percent:null,period:null,periodLabel:null,state:'not_detected'};
}

export function parseGlimpse(raw=''){
  const sanitizedRaw=sanitizeRaw(raw),lines=linesFrom(raw),basic=detectBasic(lines),volume=detectVolume(lines),movement=detectMovement(lines),seasonality={state:/not enough data|não há dados de pesquisa suficientes/i.test(lines.join(' '))?'insufficient_data':headingIndex(lines,'Seasonality')>=0?'available':'not_detected'},channel={state:/Channel breakdown is unavailable for low volume/i.test(lines.join(' '))?'unavailable_low_volume':headingIndex(lines,'Channel')>=0?'available':'not_detected'};
  return {parserVersion:PARSER_VERSION,sanitizedRaw,basic,volume,movement,seasonality,channel,peopleAlsoSearch:parsePeopleAlsoSearch(lines),relatedTrends:parseRelatedTrends(lines),regions:parseRegions(lines),relatedTopics:parseEmerging(lines,['Related Topics','Assuntos relacionados'],['Related Queries','Pesquisas relacionadas']),relatedQueries:parseEmerging(lines,['Related Queries','Pesquisas relacionadas'],[])};
}

function tokenOverlap(text,term){const words=new Set(normalize(term).split(' ').filter(word=>word.length>2)),candidate=normalize(text);return[...words].some(word=>candidate.includes(word))}
export function classifyQuery(text='',searchTerm=''){
  const normalized=normalize(text);let category='Outros',confidence=.58;for(const [label,rule]of CATEGORY_RULES)if(rule.test(normalized)){category=label;confidence=.88;break}
  const related=tokenOverlap(text,searchTerm),relevance=related?'high':category==='Técnico'||category==='Navegacional'?'medium':category==='Outros'?'unclear':'medium';return{text,category,confidence,relevance};
}
function coverage(parsed){const checks=[parsed.volume.state==='available',parsed.movement.state==='available',parsed.regions.items.length>0,parsed.peopleAlsoSearch.items.length>0,parsed.relatedTrends.items.length>0,parsed.relatedTopics.items.length>0,parsed.relatedQueries.items.length>0,parsed.seasonality.state==='available',parsed.channel.state==='available'],score=checks.filter(Boolean).length;return{level:score>=6?'high':score>=3?'medium':'low',score,availableSources:score,totalSources:checks.length}}
export function isContaminated(item){return item?.relevance==='unclear'}
function contamination(classified){const evaluated=classified.filter(item=>['high','medium','unclear'].includes(item.relevance));if(!evaluated.length)return{level:'unclear',ratio:null,contaminatedCount:0,totalCount:0};const contaminatedCount=evaluated.filter(isContaminated).length,ratio=contaminatedCount/evaluated.length;return{level:ratio>.45?'high':ratio>.2?'medium':'low',ratio,contaminatedCount,totalCount:evaluated.length}}
const COMMERCIAL_CATEGORIES=new Set(['BOFU / Reviews','Compra / Preço','Confiança / Objeção']);
const SOURCE_NAMES=['peopleAlsoSearch','relatedQueries','relatedTrends','relatedTopics'];
function itemText(item){return typeof item==='string'?item:String(item?.text||'')}
function mergeClassifiedSources(parsed,term){
  const sourceItems={peopleAlsoSearch:parsed.peopleAlsoSearch.items,relatedQueries:parsed.relatedQueries.items,relatedTrends:parsed.relatedTrends.items,relatedTopics:parsed.relatedTopics.items},uniqueByTerm=new Map();
  for(const source of SOURCE_NAMES)for(const rawItem of sourceItems[source]){
    const text=itemText(rawItem),key=normalize(text);if(!key)continue;
    let classified=uniqueByTerm.get(key);
    if(!classified){classified={...(typeof rawItem==='object'?rawItem:{}),...classifyQuery(text,term),sources:[]};uniqueByTerm.set(key,classified)}
    if(!classified.sources.includes(source))classified.sources.push(source);
  }
  const unique=[...uniqueByTerm.values()];
  const bySource=Object.fromEntries(SOURCE_NAMES.map(source=>[source,unique.filter(item=>item.sources.includes(source))]));
  return{unique,bySource,duplicateOccurrences:Object.values(sourceItems).reduce((total,items)=>total+items.length,0)-unique.length};
}
function intentionSummary(unique){
  const commercial=unique.filter(item=>COMMERCIAL_CATEGORIES.has(item.category)),count=commercial.length,total=unique.length;
  const level=total===0?'not_evaluable':count>=5?'strong':count>=2?'moderate':count===1?'low':'none';
  return{level,commercialCount:count,uniqueTermCount:total,commercialRate:total?count/total:null,duplicateOccurrences:0};
}
function demandDimension(parsed){
  const volume=parsed.volume;
  if(volume.state!=='available'||volume.value===null)return{level:'unknown',value:null,operator:null,period:volume.period||'past_month'};
  const level=volume.operator==='<'?'limited':volume.value>=10000?'high':volume.value>=1000?'moderate':'low';
  return{level,value:volume.value,operator:volume.operator,period:volume.period||'past_month',display:volume.display||null};
}
function movementDimension(parsed){
  const movement=parsed.movement;
  if(movement.state!=='available'||movement.percent===null)return{level:'unknown',value:null,direction:'unknown',period:null,periodLabel:null};
  const direction=movement.percent>0?'rising':movement.percent<0?'falling':'stable';
  return{level:direction,value:movement.percent,direction,period:movement.period||null,periodLabel:movement.periodLabel||movementPeriodLabel(movement.period)};
}
function movementPeriodLabel(period){return MOVEMENT_WINDOWS.find(item=>item.period===period)?.label||period||'janela não identificada'}
function relevanceDimension(cont){return{level:cont.level==='low'?'good':cont.level==='medium'?'mixed':cont.level==='high'?'poor':'unknown',contaminationLevel:cont.level,contaminatedCount:cont.contaminatedCount,totalCount:cont.totalCount,ratio:cont.ratio}}
function geographyDimension(parsed,geo){
  const capturedCount=parsed.regions.items.length,reportedCount=parsed.regions.reportedTotal??null,coverageState=capturedCount===0?'not_detected':reportedCount!==null&&reportedCount>capturedCount?'partial':'complete';
  return{level:geo.level,capturedCount,reportedCount,coverage:coverageState,interpretation:'Índice relativo de interesse; não representa volume de buscas.'};
}
function confidenceFor(parsed,cov,cont,unique,geography){
  const reasons=[];
  if(cov.level==='low'||unique.length<3){reasons.push('Poucas fontes ou itens únicos para sustentar uma leitura robusta.');return{level:'low',reasons}}
  if(cov.level==='high'&&unique.length>=5&&cont.level!=='high'&&geography.coverage!=='partial'&&(parsed.volume.state==='available'||parsed.movement.state==='available')){
    reasons.push('Cobertura alta, múltiplos itens observáveis e ruído semântico não severo.');return{level:'high',reasons}
  }
  if(cont.level==='high')reasons.push('A proporção de itens semanticamente incertos reduz a confiabilidade da leitura.');
  if(geography.coverage==='partial')reasons.push('A lista regional capturada é parcial em relação ao total informado.');
  if(cov.level!=='high')reasons.push(`Cobertura ${coverageLabel(cov.level).toLowerCase()} das fontes.`);
  if(unique.length<5)reasons.push('Poucos termos únicos foram capturados.');
  if(!reasons.length)reasons.push('Há evidência utilizável, mas com limitações para uma conclusão robusta.');
  return{level:'medium',reasons};
}
function alertsFor({movement,intent,relevance,geography}){
  const alerts=[];
  if(movement.value!==null&&movement.value<=-100)alerts.push({id:'extreme_decline',severity:'critical',message:`Queda extrema de ${movement.value}% detectada (janela: ${movementPeriodLabel(movement.period)}).`,evidence:{value:movement.value,period:movement.period}});
  if(relevance.contaminationLevel==='high')alerts.push({id:'high_semantic_contamination',severity:'critical',message:`Contaminação semântica alta: ${Math.round((relevance.ratio||0)*100)}% dos itens avaliados.`,evidence:{ratio:relevance.ratio,contaminatedCount:relevance.contaminatedCount,totalCount:relevance.totalCount}});
  if(intent.uniqueTermCount>=3&&intent.commercialCount<=1)alerts.push({id:'low_commercial_intent',severity:'warning',message:'Intenção comercial escassa entre os termos únicos avaliados.',evidence:{commercialCount:intent.commercialCount,uniqueTermCount:intent.uniqueTermCount}});
  if(geography.level==='limited')alerts.push({id:'limited_geography',severity:'info',message:'Apenas uma região foi capturada; a distribuição geográfica é limitada.',evidence:{capturedCount:geography.capturedCount,reportedCount:geography.reportedCount}});
  return alerts;
}
function insufficientEvidence(parsed,cov,unique){const reliableVolume=parsed.volume.state==='available'&&parsed.volume.operator!=='<',reliableMovement=parsed.movement.state==='available'&&parsed.movement.period;return !reliableVolume&&!reliableMovement&&(cov.level==='low'||unique.length<5)}
function signalForV2({confidence,alerts,demand,movement,intent,relevance,insufficient}){
  if(insufficient)return{level:'insufficient_data',rulesVersion:GLIMPSE_RULE_VERSION,reasons:['A cobertura ou o volume de itens avaliáveis é insuficiente para uma conclusão.']};
  const positive=[],negative=[];
  if(['moderate','high'].includes(demand.level))positive.push('demanda');
  if(movement.direction==='rising')positive.push('movimento');
  if(['moderate','strong'].includes(intent.level))positive.push('intenção');
  if(demand.level==='low'||demand.level==='limited')negative.push('demanda');
  if(movement.direction==='falling')negative.push('movimento');
  if(intent.uniqueTermCount>=3&&intent.commercialCount<=1)negative.push('intenção');
  if(relevance.level==='poor')negative.push('relevância');
  const critical=alerts.some(alert=>alert.severity==='critical'),strongEligible=demand.level==='moderate'||demand.level==='high';
  let level;
  if(positive.length&&negative.length)level='mixed';
  else if(positive.length&&critical)level='mixed';
  else if(strongEligible&&movement.direction==='stable'&&intent.level==='strong'&&relevance.level==='good'&&confidence.level==='high'&&!critical)level='strong';
  else if(positive.length)level='positive';
  else level='weak';
  const reasons=level==='mixed'?[positive.length?`Sinais favoráveis: ${positive.join(', ')}.`:null,negative.length?`Sinais desfavoráveis: ${negative.join(', ')}.`:null,...alerts.filter(alert=>alert.severity==='critical').map(alert=>alert.message)].filter(Boolean):level==='strong'?['Demanda, intenção e relevância são consistentes, com confiança alta e sem alerta crítico.']:level==='positive'?[`Sinais favoráveis: ${positive.join(', ')}. Ainda não há convergência suficiente para Forte.`]:[`Sinais desfavoráveis: ${negative.join(', ')||'não há eixos favoráveis suficientes'}.`];
  if(confidence.level==='low'&&level==='strong')level='positive';
  return{level,rulesVersion:GLIMPSE_RULE_VERSION,reasons};
}
export function movementValueLabel(percent){return `${percent>0?'+':''}${percent}%`}
function operationalReading(parsed,signal,dimensions,alerts,confidence){
  const demand=dimensions.demand.level==='unknown'?'volume não detectado':`${parsed.volume.display||parsed.volume.value} buscas/mês (${dimensions.demand.level})`;
  const movement=dimensions.movement.value===null?'movimento não detectado':`${movementValueLabel(dimensions.movement.value)} (janela: ${movementPeriodLabel(dimensions.movement.period)})`;
  const intention=`${dimensions.intention.commercialCount} termos comerciais únicos de ${dimensions.intention.uniqueTermCount}`;
  const relevance=dimensions.relevance.ratio===null?'relevância sem itens avaliáveis':`${Math.round(dimensions.relevance.ratio*100)}% de contaminação semântica`;
  const geography=dimensions.geography.level==='not_detected'?'geografia não capturada':dimensions.geography.level==='limited'?'geografia limitada':`geografia ${dimensions.geography.level}`;
  return `Sinal ${signalLabel(signal.level)}; demanda ${demand}; movimento ${movement}; intenção ${intention}; relevância ${relevance}; ${geography}; confiança ${confidenceLabel(confidence.level).toLowerCase()}.${alerts.length?` Alertas: ${alerts.map(alert=>alert.message).join(' ')}`:''}`;
}
export function analyzeGlimpse(parsed){
  const term=parsed.basic.searchTerm,{unique,bySource,duplicateOccurrences}=mergeClassifiedSources(parsed,term),cov=coverage(parsed),cont=contamination(unique),intention=intentionSummary(unique),geo=parsed.regions.items.length>1?{level:parsed.regions.items[0].interestIndex>=parsed.regions.items[1].interestIndex*2?'concentrated':'distributed'}:{level:parsed.regions.items.length?'limited':'not_detected'},demand=demandDimension(parsed),movement=movementDimension(parsed),relevance=relevanceDimension(cont),geography=geographyDimension(parsed,geo),confidence=confidenceFor(parsed,cov,cont,unique,geography);
  intention.duplicateOccurrences=duplicateOccurrences;
  const dimensions={demand,movement,intention,relevance,geography},alerts=alertsFor({movement,intent:intention,relevance,geography}),insufficient=insufficientEvidence(parsed,cov,unique);
  if(confidence.level==='low'&&!insufficient)alerts.push({id:'low_confidence',severity:'warning',message:'A confiança geral da análise é baixa.',evidence:{coverage:cov.score,totalSources:cov.totalSources,uniqueItems:unique.length}});
  const signal=signalForV2({confidence,alerts,demand,movement,intent:intention,relevance,insufficient}),categoryCounts=unique.reduce((map,item)=>(map[item.category]=(map[item.category]||0)+1,map),{});
  const indicators={coverage:cov,contamination:cont,categoryCounts,geography:geo,intent:intention};
  return{analyzerVersion:ANALYZER_VERSION,classified:bySource,indicators,dimensions,alerts,confidence,signal,operationalReading:operationalReading(parsed,signal,dimensions,alerts,confidence)};
}
export function createAnalysis(raw,context={},capturedAt=new Date().toISOString()){const parsed=parseGlimpse(raw),derived=analyzeGlimpse(parsed);return{analysisId:crypto.randomUUID(),productKey:normalize(context.productKey||context.productName||parsed.basic.searchTerm),productName:context.productName||parsed.basic.searchTerm||'Produto sem nome',offerIds:[...new Set((context.offerIds||[]).map(String).filter(Boolean))],capturedAt,parserVersion:PARSER_VERSION,analyzerVersion:ANALYZER_VERSION,rawSanitized:parsed.sanitizedRaw,parsed:{...parsed,sanitizedRaw:undefined},classified:derived.classified,indicators:derived.indicators,signal:derived.signal,operationalReading:derived.operationalReading}}
export function signalLabel(value){return({strong:'Forte',positive:'Positivo',mixed:'Misto',weak:'Fraco',insufficient_data:'Dados insuficientes',medium:'Médio',limited:'Dados limitados'})[value]||'Sem análise'}
export function coverageLabel(value){return value==='high'?'Alta':value==='medium'?'Média':value==='low'?'Baixa':'Não detectada'}
export function contaminationLabel(value){return value==='high'?'Alta':value==='medium'?'Média':value==='low'?'Baixa':'Indefinida'}
export function confidenceLabel(value){return({high:'Alta',medium:'Média',low:'Baixa'})[value]||'Não avaliada'}
export function dimensionLabel(value){return({high:'Alta',moderate:'Moderada',low:'Baixa',limited:'Limitada',unknown:'Não detectada',rising:'Em alta',falling:'Em queda',stable:'Estável',strong:'Forte',medium:'Média',good:'Boa',mixed:'Mista',poor:'Ruim',distributed:'Distribuída',concentrated:'Concentrada',not_detected:'Não detectada',partial:'Parcial',complete:'Completa',none:'Nenhuma',not_evaluable:'Não avaliável'})[value]||String(value||'Não avaliada')}
export function stateLabel(value){return{available:'Disponível',insufficient_data:'Sem dados suficientes',unavailable_low_volume:'Indisponível por baixo volume',not_available:'Dados indisponíveis',not_detected:'Não detectado'}[value]||'Não detectado'}
export function compactSummary(analysis){if(!analysis)return'Pesquisar';const volume=analysis.parsed?.volume?.display||'Sem volume',isV2=analysis.analyzerVersion===ANALYZER_VERSION||analysis.signal?.rulesVersion===GLIMPSE_RULE_VERSION,label=!isV2&&analysis.parsed?.volume?.operator==='<'?'Limitado':signalLabel(analysis.signal?.level);return`${volume} · ${label}`}
export function analysisRank(analysis){if(!analysis)return 0;const rank=analysis.analyzerVersion===ANALYZER_VERSION||analysis.signal?.rulesVersion===GLIMPSE_RULE_VERSION?{strong:5,positive:4,mixed:3,weak:2,insufficient_data:1}:{strong:3,medium:2,limited:1};return(rank[analysis.signal?.level]||0)*1e9+(analysis.parsed?.volume?.value||0)}
