import assert from'node:assert/strict';
import{productiveTotalHighlightClass,alcoholHistoryHighlightClass,refrigeranteHistoryHighlightClass,verdeHorarioHistoryHighlightClass,comparisonDateHeaderClass}from'../src/meu-tempo/meu-tempo-view.mjs';
import{readFile}from'node:fs/promises';

assert.equal(productiveTotalHighlightClass(480),'','exatamente oito horas não recebem destaque');
assert.equal(productiveTotalHighlightClass(481),'time-over-eight-hours','qualquer quantidade acima de oito horas recebe destaque');
assert.equal(productiveTotalHighlightClass('540'),'time-over-eight-hours','valores numéricos recebidos como texto também são tratados corretamente');
assert.equal(productiveTotalHighlightClass(179),'time-under-three-and-a-half-hours','menos de 3h30 recebe destaque vermelho');
assert.equal(productiveTotalHighlightClass(180),'time-under-three-and-a-half-hours','três horas ainda recebe destaque vermelho');
assert.equal(productiveTotalHighlightClass(209),'time-under-three-and-a-half-hours','3h29 recebe destaque vermelho');
assert.equal(productiveTotalHighlightClass(210),'','exatamente 3h30 não recebe destaque vermelho');
assert.equal(productiveTotalHighlightClass(0),'time-under-three-and-a-half-hours','zero registrado conta como menos de 3h30');
assert.equal(productiveTotalHighlightClass(null),'','valor ausente não recebe destaque');
assert.equal(alcoholHistoryHighlightClass({id:'item-alcool',type:'boolean'},1),'time-alcohol-yes','Sim numérico de bebida alcoólica recebe destaque');
assert.equal(alcoholHistoryHighlightClass({id:'item-alcool',type:'boolean'},true),'time-alcohol-yes','Sim booleano de bebida alcoólica recebe destaque');
assert.equal(alcoholHistoryHighlightClass({id:'item-alcool',type:'boolean'},0),'','Não não recebe destaque');
assert.equal(alcoholHistoryHighlightClass({id:'item-alcool',type:'boolean'},null),'','valor ausente não recebe destaque');
assert.equal(alcoholHistoryHighlightClass({id:'item-agua',type:'boolean'},1),'','outros indicadores booleanos não recebem destaque de álcool');
assert.equal(refrigeranteHistoryHighlightClass({id:'item-refrigerante',type:'boolean'},1),'time-refrigerante-yes','consumo de refrigerante recebe destaque vermelho na célula');
assert.equal(refrigeranteHistoryHighlightClass({id:'item-refrigerante',type:'boolean'},true),'time-refrigerante-yes','Sim booleano também indica consumo de refrigerante');
assert.equal(refrigeranteHistoryHighlightClass({id:'item-refrigerante',type:'boolean'},0),'','Não não recebe destaque de refrigerante');
assert.equal(refrigeranteHistoryHighlightClass({id:'item-refrigerante',type:'boolean'},null),'','valor ausente não recebe destaque de refrigerante');
assert.equal(refrigeranteHistoryHighlightClass({id:'item-alcool',type:'boolean'},1),'','destaque específico do refrigerante não colore outra atividade');
assert.equal(verdeHorarioHistoryHighlightClass({id:'item-verde-horario',type:'boolean'},1),'time-verde-horario-yes','Sim numérico de Verde 16:20 recebe destaque vermelho');
assert.equal(verdeHorarioHistoryHighlightClass({id:'item-verde-horario',type:'boolean'},true),'time-verde-horario-yes','Sim booleano de Verde 16:20 recebe destaque vermelho');
assert.equal(verdeHorarioHistoryHighlightClass({id:'item-verde-horario',type:'boolean'},0),'','Não de Verde 16:20 não recebe destaque');
assert.equal(verdeHorarioHistoryHighlightClass({id:'item-acucar',type:'boolean'},1),'','outros itens booleanos não recebem esse destaque');
const day='2026-10-15',items=['item-alcool','item-refrigerante','item-verde-horario'].map(id=>({id,type:'boolean'})),noEntries=[
  ...items.map(item=>({id:`${item.id}-no`,date:day,itemId:item.id,type:'boolean',value:false,createdAt:`${day}T08:00:00.000Z`})),
  {id:'productive',date:day,itemId:'work',type:'duration',minutes:240,productiveSnapshot:true,createdAt:`${day}T09:00:00.000Z`},
];
assert.equal(comparisonDateHeaderClass(items,noEntries,day),'time-clear-day','data com lançamentos e sem células vermelhas recebe verde automaticamente');
for(const id of items.map(item=>item.id)){
  const entries=[...noEntries,{id:`${id}-yes`,date:day,itemId:id,type:'boolean',value:true,createdAt:`${day}T10:00:00.000Z`}];
  assert.equal(comparisonDateHeaderClass(items,entries,day),id==='item-alcool'?'time-alert-day':'',`${id}: consumo de álcool deixa a data vermelha; outro indicador vermelho mantém a data neutra`);
}
assert.equal(comparisonDateHeaderClass(items,[{id:'short',date:day,itemId:'work',type:'duration',minutes:180,productiveSnapshot:true}],day),'time-clear-day','tempo produtivo baixo não deixa a data vermelha');
assert.equal(comparisonDateHeaderClass(items,[],day),'time-clear-day','sem qualquer indicador vermelho, o cabeçalho fica verde automaticamente mesmo sem registros');
assert.equal(comparisonDateHeaderClass(items,[...noEntries,{id:'alcohol-old-yes',date:day,itemId:'item-alcool',type:'boolean',value:true,createdAt:`${day}T07:00:00.000Z`},{id:'alcohol-latest-no',date:day,itemId:'item-alcool',type:'boolean',value:false,createdAt:`${day}T11:00:00.000Z`}],day),'time-clear-day','a cor considera a resposta Sim/Não efetiva mais recente');
assert.equal(comparisonDateHeaderClass(items,[...noEntries,{id:'alcohol-no',date:day,itemId:'item-alcool',type:'boolean',value:false,createdAt:`${day}T08:30:00.000Z`},{id:'verde-yes',date:day,itemId:'item-verde-horario',type:'boolean',value:true,createdAt:`${day}T10:00:00.000Z`}],day),'','Verde 16:20 vermelho sem consumo de álcool deixa a data azul/neutra');
assert.equal(comparisonDateHeaderClass(items,[...noEntries,{id:'alcohol-yes',date:day,itemId:'item-alcool',type:'boolean',value:true,createdAt:`${day}T09:00:00.000Z`},{id:'verde-yes-with-alcohol',date:day,itemId:'item-verde-horario',type:'boolean',value:true,createdAt:`${day}T10:00:00.000Z`}],day),'time-alert-day','consumo de álcool mantém a data vermelha mesmo quando outro indicador também está vermelho');
const view=await readFile(new URL('../src/meu-tempo/meu-tempo-view.mjs',import.meta.url),'utf8');
const publishedView=await readFile(new URL('../dist/meu-tempo/meu-tempo-view.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../src/meu-tempo/meu-tempo.css',import.meta.url),'utf8');
assert.ok(view.includes("['time-input','hub-inset-input',extraClass].filter(Boolean).join(' ')"),'os campos de data do Meu Tempo devem aderir ao CSS global de inputs com sombra interna');
assert.ok(publishedView.includes("['time-input','hub-inset-input',extraClass].filter(Boolean).join(' ')"),'o build deve publicar o padrão global nos campos de data do Meu Tempo');
assert.ok(view.includes('id="dayOutput" class="time-textarea time-output-textarea"'),'Output do dia precisa ter estilo de altura dedicado');
assert.ok(css.includes('.time-output-textarea{min-height:105px}')&&css.includes('.time-textarea{width:100%;min-height:84px;resize:vertical}'),'Output do dia deve ficar 25% mais alto, sem alterar largura, outros campos nem redimensionamento manual');
assert.ok(view.includes('comparisonDateHeaderClass(data.items,data.entries,date)'),'cor do cabeçalho deve ser detectada automaticamente pelos indicadores do dia, sem ação manual');
assert.ok(view.includes('dateHeaderClasses[index]'),'cada data da comparação recebe a classificação automática correspondente');
assert.ok(view.includes("<th title=\"Média para os demais tipos; respostas Sim/Não mostram quantos dias tiveram Sim.\">Resumo</th>"),'a comparação identifica a coluna com média ou contagem de dias Sim conforme o tipo de item');
assert.ok(view.includes("const summaryCell=row=>row.yesDays==null?row.item.type==='duration'?Domain.formatDuration(row.average):historyValue(row.item,row.average,1):`${row.yesDays} ${row.yesDays===1?'dia':'dias'}`"),'itens Sim/Não exibem o total de dias com Sim e os demais preservam a média');
assert.ok(view.includes('Resposta Sim em ${row.yesDays} dia(s) no período'),'o resumo booleano informa seu significado em tooltip');
assert.ok(view.includes("alcoholItem=items.find(item=>item.id==='item-alcool')||{id:'item-alcool',type:'boolean'}")&&view.includes("if(alcoholHistoryHighlightClass(alcoholItem,alcoholValue))return'time-alert-day'")&&view.includes("return hasOtherRed?'':'time-clear-day'"),'álcool Sim deixa o cabeçalho vermelho; outro indicador vermelho o deixa neutro; sem vermelho, fica verde');
assert.ok(view.includes("cell.values.some(value=>alcoholHistoryHighlightClass(row.item,value))?'time-alcohol-yes':cell.values.some(value=>verdeHorarioHistoryHighlightClass(row.item,value))?'time-verde-horario-yes':''"),'células Sim de bebida alcoólica e Verde 16:20 recebem destaque específico');
assert.ok(view.includes("Domain.aggregateDay(data.entries,date).byItem.get(item.id)?.values.at(-1)")&&view.includes("root.querySelectorAll('.time-matrix td[data-cell-item=\"item-refrigerante\"]')")&&view.includes("if(consumedDates.has(cell.dataset.cellDate))cell.classList.add('time-refrigerante-yes')"),'célula de refrigerante usa a resposta atual; o cabeçalho agrega automaticamente os alertas do dia');
assert.ok(view.includes('alcoholHistoryHighlightClass(item,entry.value)'),'registro Sim no detalhamento não recebe destaque');
assert.ok(css.includes('.time-matrix tbody td.time-alcohol-yes')&&css.includes('.time-table tr.time-alcohol-yes>td'),'destaque suave não foi aplicado à comparação e ao detalhamento');
assert.ok(css.includes('.time-matrix tbody td.time-refrigerante-yes{background:rgba(248,113,113,.12);color:#ffb6bc;box-shadow:inset 0 0 0 1px rgba(248,113,113,.24)}'),'célula de refrigerante deve usar o mesmo vermelho suave da bebida alcoólica');
assert.ok(css.includes('.time-matrix tbody td.time-verde-horario-yes{background:rgba(248,113,113,.12);color:#ffb6bc;box-shadow:inset 0 0 0 1px rgba(248,113,113,.24)}'),'Sim de Verde 16:20 usa o mesmo destaque vermelho suave');
assert.ok(css.includes('.time-matrix tbody td.time-under-three-and-a-half-hours{background:rgba(248,113,113,.12);color:#ffb6bc;box-shadow:inset 0 0 0 1px rgba(248,113,113,.24)}')&&view.includes('productiveTotalHighlightClass(x.entries.length?x.productiveMinutes:null)')&&view.includes('productiveTotalHighlightClass(hasRecordedDay?productiveAverage:null)'),'tempo produtivo abaixo de 3h30 deve usar o destaque vermelho do histórico, sem sinalizar dias sem registros');
assert.ok(css.includes('.time-daily-summary .time-date-controls{align-items:center;gap:7px}')&&!css.includes('.time-daily-summary .time-date-controls .time-field'),'navegação diária deve alinhar verticalmente o grupo compartilhado e remover estilos locais de tamanho');
assert.ok(css.includes('.time-daily-summary .time-kpis{flex:1 1 auto;flex-wrap:nowrap}')&&css.includes('.time-daily-summary .time-kpi{padding:8px 10px;min-width:132px}'),'os três quadros de métricas do Diário devem preservar seu layout');
assert.ok(css.includes('.time-matrix thead th:not(:first-child){text-align:center}'),'cabeçalhos das datas no Histórico devem ficar centralizados');
assert.ok(css.includes('.time-matrix thead th.time-clear-day{background:rgba(52,211,153,.12);color:#8ff0c4}'),'datas sem células vermelhas no grupo de saúde recebem destaque verde discreto');
assert.ok(css.includes('.time-matrix th:first-child,.time-matrix td:first-child{text-align:left}'),'coluna Atividade no Histórico deve ficar alinhada à esquerda');
assert.ok(view.includes('item.id===Domain.PARTIALLY_PRODUCTIVE_ITEM_ID'),'Kakashi deve continuar visível nos dois filtros quando tem contribuição parcialmente produtiva');
assert.ok(view.includes('Domain.productivityLabel(entry)'),'detalhamento do Histórico deve identificar Kakashi como 10% produtivo');
assert.ok(view.includes('10% de cada lançamento entra no tempo produtivo'),'Diário deve explicar a regra fixa de Kakashi');

console.log('meu tempo history UI ok');
