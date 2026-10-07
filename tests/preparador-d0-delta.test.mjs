import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('../dist/preparador-MCC/index.html',import.meta.url),'utf8');
const functionSource=name=>html.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n    \\}`))?.[0]||'';
const helpers=['canonicalAccountId','buildD0DeltaRows','buildD0DeltaTotals','formatD0DeltaValue','formatD0DeltaSum','normalizeD0CaptureHistory','readD0CaptureHistory','writeD0CaptureHistory','normalizeD0PausedCampaignHistory','readD0PausedCampaignHistory','writeD0PausedCampaignHistory','d0PausedCampaignsFromCaptureHistory','removeD0CaptureHistoryEntry','formatD0CaptureTabLabel','formatD0CaptureFullTime','updateD0ApplyAvailability'].map(functionSource).join('\n');
assert.ok(helpers.includes('buildD0DeltaRows'),'comparador de D0 ausente');
const applyButton={disabled:false};
const context={Intl,Number,Map,Boolean,String,Math,Date,JSON,Array,Object,q:()=>applyButton,currentResult:{manifest:{validacao_manifesto:{modo_entrada:'D_zero_somente'}},critical:[]},slots:{d0:{captureHistory:{id:'current'}}},d0CaptureHistory:[{id:'current',state:'calculated'}],selectedD0CaptureId:'current',numberingIssues:[],numberingValidationReady:true};
vm.runInNewContext(`const D0_CAPTURE_HISTORY_KEY='painel-preparador-mcc-capturas-d0-v1';const D0_PAUSED_CAMPAIGN_HISTORY_KEY='painel-preparador-mcc-pausas-d0-v1';const D0_CAPTURE_HISTORY_LIMIT=7;${helpers};globalThis.buildD0DeltaRows=buildD0DeltaRows;globalThis.buildD0DeltaTotals=buildD0DeltaTotals;globalThis.formatD0DeltaValue=formatD0DeltaValue;globalThis.formatD0DeltaSum=formatD0DeltaSum;globalThis.normalizeD0CaptureHistory=normalizeD0CaptureHistory;globalThis.readD0CaptureHistory=readD0CaptureHistory;globalThis.writeD0CaptureHistory=writeD0CaptureHistory;globalThis.normalizeD0PausedCampaignHistory=normalizeD0PausedCampaignHistory;globalThis.readD0PausedCampaignHistory=readD0PausedCampaignHistory;globalThis.writeD0PausedCampaignHistory=writeD0PausedCampaignHistory;globalThis.d0PausedCampaignsFromCaptureHistory=d0PausedCampaignsFromCaptureHistory;globalThis.removeD0CaptureHistoryEntry=removeD0CaptureHistoryEntry;globalThis.formatD0CaptureTabLabel=formatD0CaptureTabLabel;globalThis.formatD0CaptureFullTime=formatD0CaptureFullTime;globalThis.updateD0ApplyAvailability=updateD0ApplyAvailability;`,context);

const metric=(value,estado='confirmado')=>({valor:value,estado});
const campaign=(name,{impressions,clicks,cost,currency='BRL',state=null,qualification=null,account=null,manager=null})=>({nome_campanha_exato:name,...(manager?{mcc_id:manager}:{}),metricas_D_zero:{impressoes:metric(impressions),cliques_google:metric(clicks),custo_total:metric(cost),moeda:metric(currency),conta_id:account?metric(account):metric(null,'ausente'),estado_campanha:state==null?metric(null,'ausente'):metric(state),status_qualificacao:qualification==null?metric(null,'ausente'):metric(qualification)}});
const date='2026-10-02';
const previous={manifesto_atual:{separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:[
  campaign('01/10 - Produto A',{impressions:100,clicks:5,cost:40}),
  campaign('01/10 - Produto B',{impressions:200,clicks:10,cost:20,currency:'USD'}),
  campaign('01/10 - Produto C',{impressions:30,clicks:3,cost:10}),
  campaign('01/10 - Produto D',{impressions:5,clicks:1,cost:2,currency:'USD'}),
  campaign('01/10 - Produto pausado',{impressions:50,clicks:2,cost:5,state:'Ativada'}),
  campaign('01/10 - Produto paused',{impressions:40,clicks:4,cost:8,state:'Ativada'}),
  campaign('01/10 - Qualificação',{impressions:20,clicks:2,cost:4,state:'Ativada',qualification:'Pausada'}),
]}};
const manifest={separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:[
  campaign('01/10 - Produto A',{impressions:110,clicks:6,cost:50}),
  campaign('01/10 - Produto B',{impressions:200,clicks:10,cost:20,currency:'USD'}),
  campaign('01/10 - Produto C',{impressions:25,clicks:2,cost:9}),
  campaign('01/10 - Produto D',{impressions:7,clicks:2,cost:4,currency:'BRL'}),
  campaign('01/10 - Produto novo',{impressions:10,clicks:1,cost:10}),
  campaign('01/10 - Produto pausado',{impressions:50,clicks:2,cost:5,state:'Pausada'}),
  campaign('01/10 - Produto paused',{impressions:40,clicks:4,cost:8,state:'Paused'}),
  campaign('01/10 - Qualificação',{impressions:20,clicks:2,cost:4,state:'Ativada',qualification:'Pausada'}),
]};
const result=context.buildD0DeltaRows(manifest,previous);
assert.equal(result.comparableDate,true);
assert.deepEqual(JSON.parse(JSON.stringify(result.rows)),[
  {campaign:'01/10 - Produto A',currency:'BRL',impressions:10,clicks:1,cost:10,status:null},
  {campaign:'01/10 - Produto C',currency:'BRL',impressions:-5,clicks:-1,cost:-1,status:null},
  {campaign:'01/10 - Produto D',currency:'BRL',impressions:2,clicks:1,cost:null,status:null},
  {campaign:'01/10 - Produto novo',currency:'BRL',impressions:10,clicks:1,cost:10,status:null,newCampaign:true},
  {campaign:'01/10 - Produto pausado',currency:'BRL',impressions:0,clicks:0,cost:0,status:'Pausada'},
  {campaign:'01/10 - Produto paused',currency:'BRL',impressions:0,clicks:0,cost:0,status:'Pausada'},
]);

const renamed=context.buildD0DeltaRows(manifest,{...previous,manifesto_atual:{...previous.manifesto_atual,campanhas:[campaign('30/09 - Produto A',{impressions:100,clicks:5,cost:40})]}},[{oldName:'30/09 - Produto A',newName:'01/10 - Produto A'}]);
assert.deepEqual(JSON.parse(JSON.stringify(renamed.rows[0])),{campaign:'01/10 - Produto A',currency:'BRL',impressions:10,clicks:1,cost:10,status:null},'campanha com prefixo de data alterado deve continuar comparável pelo pareamento validado');

const newDay=context.buildD0DeltaRows(manifest,{manifesto_atual:{separacao_temporal:{D_zero:{datas_detectadas:['2026-10-01']}},campanhas:[]}});
assert.equal(newDay.comparableDate,false);
assert.equal(newDay.rows[0].impressions,110,'sem captura D0 anterior na mesma data, a primeira captura começa em zero');
assert.ok(newDay.rows.some(row=>row.campaign==='01/10 - Produto pausado'&&row.status==='Pausada'),'status pausada explícito é listado mesmo sem base comparável');

const pauseManager='777-111-2222',pauseAccount='222-333-4444',pauseName='04/10 - Campanha em pausa';
const pauseBase={manifesto_atual:{identificacao_mcc:{id:pauseManager,nome:'MCC de teste'},separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:[campaign(pauseName,{impressions:0,clicks:0,cost:0,state:'Ativada',account:pauseAccount,manager:pauseManager})]},campanhas:[{id:'campaign-stable-id',nome_mcc:pauseName,conta_id:pauseAccount,mcc_id:pauseManager}]};
const firstPauseManifest={identificacao_mcc:{id:pauseManager,nome:'MCC de teste'},separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:[campaign(pauseName,{impressions:0,clicks:0,cost:0,state:'Pausada',account:pauseAccount,manager:pauseManager})]};
const firstPause=context.buildD0DeltaRows(firstPauseManifest,pauseBase,[],[],[],'pause-first');
assert.equal(firstPause.rows.length,1,'a primeira pausa explícita entra na lista mesmo sem delta numérico');
assert.equal(firstPause.rows[0].status,'Pausada');
assert.deepEqual(JSON.parse(JSON.stringify(firstPause.pausedCampaigns)),[{managerAccountId:pauseManager,accountId:pauseAccount,campaign:pauseName,captureId:'pause-first'}],'a primeira identificação é guardada por MCC, conta, nome e captura');
const activeOnlyManifest={...firstPauseManifest,campanhas:[campaign('04/10 - Outra campanha ativa',{impressions:0,clicks:0,cost:0,state:'Ativada',account:'333-444-5555',manager:pauseManager})]};
const activeOnly=context.buildD0DeltaRows(activeOnlyManifest,pauseBase,[],[],firstPause.pausedCampaigns,'pause-active-only');
assert.equal(activeOnly.pausedCampaigns.length,0,'uma captura filtrada para ativas não apaga a identificação anterior da pausa');
const repeatedPause=context.buildD0DeltaRows(firstPauseManifest,pauseBase,[],[],firstPause.pausedCampaigns,'pause-after-active-only');
assert.equal(repeatedPause.rows.length,0,'a campanha já identificada como pausada não reaparece ao importar depois todas as campanhas');
assert.equal(repeatedPause.pausedCampaigns.length,1,'o registro permanente de pausa é mantido para capturas futuras');
const repeatedPauseWithoutBase=context.buildD0DeltaRows(firstPauseManifest,{manifesto_atual:{identificacao_mcc:{id:pauseManager,nome:'MCC de teste'},separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:[]},campanhas:[]},[],[],firstPause.pausedCampaigns,'pause-no-base');
assert.equal(repeatedPauseWithoutBase.rows.length,0,'uma pausa já conhecida não volta como campanha nova mesmo se a base local ainda não tiver o registro');
const repeatedPauseWithDelta=context.buildD0DeltaRows({...firstPauseManifest,campanhas:[campaign(pauseName,{impressions:3,clicks:1,cost:2,state:'Pausada',account:pauseAccount,manager:pauseManager})]},pauseBase,[],[],firstPause.pausedCampaigns,'pause-with-delta');
assert.equal(repeatedPauseWithDelta.rows[0].status,null,'diferenças posteriores continuam aparecendo sem repetir o status da pausa');
assert.equal(repeatedPauseWithDelta.rows.length,1);
const sameCapture=context.buildD0DeltaRows(firstPauseManifest,pauseBase,[],[],firstPause.pausedCampaigns,'pause-first');
assert.equal(sameCapture.rows[0].status,'Pausada','recalcular a própria captura mantém visível a primeira identificação');
const anotherAccount=context.buildD0DeltaRows({...firstPauseManifest,campanhas:[campaign(pauseName,{impressions:0,clicks:0,cost:0,state:'Pausada',account:'999-888-7777',manager:pauseManager})]},pauseBase,[],[],firstPause.pausedCampaigns,'pause-other-account');
assert.equal(anotherAccount.rows[0].status,'Pausada','nome igual em outra conta-cliente da mesma MCC é uma identidade distinta');
const anotherManager=context.buildD0DeltaRows({...firstPauseManifest,identificacao_mcc:{id:'888-777-6666',nome:'Outra MCC'},campanhas:[campaign(pauseName,{impressions:0,clicks:0,cost:0,state:'Pausada',account:pauseAccount,manager:'888-777-6666'})]},pauseBase,[],[],firstPause.pausedCampaigns,'pause-other-manager');
assert.equal(anotherManager.rows[0].status,'Pausada','a identificação da pausa não atravessa MCCs');
const legacyPauseHistory=context.d0PausedCampaignsFromCaptureHistory([{id:'legacy-pause',managerAccountId:pauseManager,managerAccountName:'MCC de teste',rows:[{campaign:pauseName,status:'Pausada'}]}]);
assert.deepEqual(JSON.parse(JSON.stringify(legacyPauseHistory)),[{managerAccountId:pauseManager,campaign:pauseName,captureId:'legacy-pause'}],'migra pausas já exibidas nas abas antigas, mesmo que elas não contenham o ID da conta');
const afterUpgrade=context.buildD0DeltaRows(firstPauseManifest,pauseBase,[],[],legacyPauseHistory,'pause-after-upgrade');
assert.equal(afterUpgrade.rows.length,0,'uma pausa registrada antes da atualização não volta a aparecer como novidade');
const pauseStorage={value:null,getItem(){return this.value;},setItem(key,value){this.key=key;this.value=value;}};
assert.equal(context.writeD0PausedCampaignHistory(pauseStorage,firstPause.pausedCampaigns),true,'persiste o histórico permanente de pausas identificado');
assert.equal(pauseStorage.key,'painel-preparador-mcc-pausas-d0-v1');
assert.deepEqual(JSON.parse(JSON.stringify(context.readD0PausedCampaignHistory(pauseStorage))),JSON.parse(JSON.stringify(firstPause.pausedCampaigns)),'recupera o histórico independente das sete abas D0 exibidas');
assert.equal(context.writeD0PausedCampaignHistory({setItem(){throw new Error('quota');}},firstPause.pausedCampaigns),false,'falha ao salvar o histórico de pausas não interrompe o Preparador');

const currentManagerId='777-111-2222',foreignManagerId='999-888-7777',knownAccount='111-222-3333',firstSeenAccount='222-333-4444';
const newForKnownManager=campaign('04/10 - Nova conta', {impressions:0,clicks:0,cost:0,account:firstSeenAccount,manager:currentManagerId});
const knownManagerBase={manifesto_atual:{identificacao_mcc:{id:currentManagerId,nome:'MCC teste'},separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:[campaign('04/10 - Conta antiga',{impressions:0,clicks:0,cost:0,account:knownAccount,manager:currentManagerId})]},campanhas:[{nome_mcc:'04/10 - Conta antiga',conta_id:knownAccount,mcc_id:currentManagerId}]};
const firstCampaignForAccount=context.buildD0DeltaRows({identificacao_mcc:{id:currentManagerId,nome:'MCC teste'},separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:[newForKnownManager]},knownManagerBase);
assert.equal(firstCampaignForAccount.comparableDate,true,'compara com a captura anterior da mesma MCC');
assert.deepEqual(JSON.parse(JSON.stringify(firstCampaignForAccount.rows)),[{campaign:'04/10 - Nova conta',accountId:firstSeenAccount,currency:'BRL',impressions:0,clicks:0,cost:0,status:null,newCampaign:true}],'campanha de uma conta-cliente recebida pela primeira vez aparece como nova mesmo com métricas iguais a zero');

const sameNameOtherMcc=campaign('04/10 - Campanha MCC Nutra',{impressions:0,clicks:0,cost:0,account:firstSeenAccount,manager:foreignManagerId});
const firstCaptureOfManager=context.buildD0DeltaRows({identificacao_mcc:{id:currentManagerId,nome:'MCC nova'},separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:[campaign('04/10 - Campanha MCC Nutra',{impressions:0,clicks:0,cost:0,account:firstSeenAccount,manager:currentManagerId})]},{manifesto_atual:{identificacao_mcc:{id:foreignManagerId,nome:'MCC anterior'},separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:[sameNameOtherMcc]},campanhas:[{nome_mcc:'04/10 - Campanha MCC Nutra',conta_id:firstSeenAccount,mcc_id:foreignManagerId}]});
assert.equal(firstCaptureOfManager.comparableDate,false,'captura de outra MCC não serve como base de comparação');
assert.deepEqual(JSON.parse(JSON.stringify(firstCaptureOfManager.rows)),[{campaign:'04/10 - Campanha MCC Nutra',accountId:firstSeenAccount,currency:'BRL',impressions:0,clicks:0,cost:0,status:null,newCampaign:true}],'campanha ausente do histórico da MCC atual aparece como nova mesmo que exista em outra MCC');

const alreadyKnownZero=context.buildD0DeltaRows({identificacao_mcc:{id:currentManagerId,nome:'MCC teste'},separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:[campaign('04/10 - Conta antiga',{impressions:0,clicks:0,cost:0,account:knownAccount,manager:currentManagerId})]},knownManagerBase);
assert.equal(alreadyKnownZero.rows.length,0,'campanha conhecida na mesma MCC sem diferença não reaparece como nova');
assert.equal(context.formatD0DeltaValue(10,'count'),'+10');
assert.equal(context.formatD0DeltaValue(-1,'count'),'−1');
assert.match(context.formatD0DeltaValue(10,'cost','BRL'),/^\+R\$/);
assert.match(context.formatD0DeltaValue(-10,'cost','USD'),/^−US\$/);
assert.equal(context.formatD0DeltaValue(null,'cost','BRL'),'—');
const totals=context.buildD0DeltaTotals([
  {impressions:10,clicks:1,cost:6.35,currency:'USD'},
  {impressions:-5,clicks:-1,cost:0,currency:'BRL'},
  {impressions:2,clicks:null,cost:null,currency:'BRL'},
]);
assert.deepEqual(JSON.parse(JSON.stringify(totals)),{impressions:{value:7,omitted:0},clicks:{value:0,omitted:1},cost:[{currency:'BRL',value:0},{currency:'USD',value:6.35}],costOmitted:1},'totais mantêm o líquido de impressões/cliques e agrupam custo por moeda sem conversão');
assert.equal(context.formatD0DeltaSum(totals.impressions,'count'),'+7');
assert.equal(context.formatD0DeltaSum(totals.clicks,'count'),'0*','marca métrica parcial quando alguma linha não é comparável');
assert.ok(context.formatD0DeltaSum({value:6.35,omitted:1},'cost','USD').startsWith('+US$'),'formata o subtotal na moeda correspondente');
assert.deepEqual(JSON.parse(JSON.stringify(context.buildD0DeltaTotals([]))),{impressions:{value:null,omitted:0},clicks:{value:null,omitted:0},cost:[],costOmitted:0},'não inventa zeros quando não há linhas para totalizar');

const captureStorage={value:null,getItem(){return this.value;},setItem(key,value){this.key=key;this.value=value;}};
const captureHistory=[
  {id:'d0-first',capturedAt:'2026-10-02T23:00:00.000Z',reportDate:date,state:'calculated',comparableDate:false,rows:[{campaign:'Produto A',currency:'BRL',impressions:10,clicks:1,cost:5,status:null}]},
  {id:'d0-second',capturedAt:'2026-10-02T23:05:00.000Z',reportDate:date,state:'calculated',comparableDate:true,rows:[{campaign:'Produto A',currency:'BRL',impressions:2,clicks:0,cost:1,status:null}]},
  {id:'d0-manager',capturedAt:'2026-10-02T23:10:00.000Z',managerAccountId:'888-777-6666',managerAccountName:'MCC de teste',reportDate:date,state:'calculated',comparableDate:true,rows:[]}
];
assert.equal(context.writeD0CaptureHistory(captureStorage,captureHistory),true,'persiste os resumos locais de cada captura');
assert.equal(captureStorage.key,'painel-preparador-mcc-capturas-d0-v1');
assert.deepEqual(JSON.parse(JSON.stringify(context.readD0CaptureHistory(captureStorage))),captureHistory,'recupera histórico ordenado com o estado e as diferenças de cada D0');
assert.deepEqual(JSON.parse(JSON.stringify(context.removeD0CaptureHistoryEntry(captureHistory,'d0-second'))),[captureHistory[0],captureHistory[2]],'remover uma aba preserva todos os demais registros e a origem MCC');
assert.deepEqual(JSON.parse(JSON.stringify(context.removeD0CaptureHistoryEntry(captureHistory,'missing'))),captureHistory,'ID inexistente não remove outras capturas');
assert.equal(captureHistory.length,3,'filtrar uma captura não altera o histórico de entrada');
const mccHistory=(managerAccountId,managerAccountName,prefix,count,startMinute=0)=>Array.from({length:count},(_,index)=>({id:`${prefix}-${index}`,capturedAt:new Date(Date.UTC(2026,9,4,0,startMinute+index)).toISOString(),managerAccountId,managerAccountName,state:'calculated',comparableDate:true,rows:[]}));
const captureHistoryOverflow=[...mccHistory('223-139-0435','MCC e-com','ecom',10),...mccHistory('353-379-6641','MCC nutra','nutra',2,20)];
const limitedHistory=context.normalizeD0CaptureHistory(captureHistoryOverflow);
assert.equal(limitedHistory.length,9,'mantém até sete capturas para cada MCC');
assert.deepEqual(JSON.parse(JSON.stringify(limitedHistory.filter(entry=>entry.managerAccountId==='223-139-0435').map(entry=>entry.id))),['ecom-3','ecom-4','ecom-5','ecom-6','ecom-7','ecom-8','ecom-9'],'preserva as sete capturas mais recentes da primeira MCC');
assert.deepEqual(JSON.parse(JSON.stringify(limitedHistory.filter(entry=>entry.managerAccountId==='353-379-6641').map(entry=>entry.id))),['nutra-0','nutra-1'],'a fila de cada MCC é limitada independentemente');
const overflowStorage={value:null,getItem(){return this.value;},setItem(key,value){this.key=key;this.value=value;}};
assert.equal(context.writeD0CaptureHistory(overflowStorage,captureHistoryOverflow),true,'salva o histórico limitado por MCC');
assert.equal(JSON.parse(overflowStorage.value).length,9,'cada MCC pode manter até sete capturas');
const legacyOverflowStorage={value:JSON.stringify(captureHistoryOverflow),getItem(){return this.value;},setItem(key,value){this.key=key;this.value=value;}};
assert.equal(context.readD0CaptureHistory(legacyOverflowStorage).length,9,'leitura limita históricos antigos já existentes por MCC');
assert.equal(JSON.parse(legacyOverflowStorage.value).length,9,'leitura persiste a remoção dos registros excedentes sem afetar outras MCCs');
assert.equal(context.formatD0CaptureTabLabel(captureHistory[0].capturedAt),'02/10 · 20:00','exibe somente hora e minuto da captura no fuso de Brasília');
assert.match(context.formatD0CaptureFullTime(captureHistory[0].capturedAt),/20:00$/,'detalhes da captura também omitem os segundos');
assert.equal(context.writeD0CaptureHistory({setItem(){throw new Error('quota');}},captureHistory),false,'falha de armazenamento não interrompe o Preparador');
assert.equal(context.readD0CaptureHistory({getItem(){throw new Error('blocked');}}).length,0,'histórico local bloqueado falha com segurança');
const pauseCaptureWithAccount=[{id:'pause-capture',capturedAt:'2026-10-02T23:00:00.000Z',managerAccountId:pauseManager,managerAccountName:'MCC de teste',state:'calculated',rows:[{campaign:pauseName,accountId:pauseAccount,currency:'BRL',impressions:0,clicks:0,cost:0,status:'Pausada'}]}];
const normalizedPauseCapture=context.normalizeD0CaptureHistory(pauseCaptureWithAccount);
assert.equal(normalizedPauseCapture[0].rows[0].accountId,pauseAccount,'capturas futuras guardam a conta completa para a migração exata');
assert.equal(context.d0PausedCampaignsFromCaptureHistory(normalizedPauseCapture)[0].accountId,pauseAccount,'a migração das abas antigas preserva a conta quando disponível');
context.updateD0ApplyAvailability();assert.equal(applyButton.disabled,false,'a captura atual validada pode atualizar a base');
context.selectedD0CaptureId='d0-first';context.updateD0ApplyAvailability();assert.equal(applyButton.disabled,true,'abas antigas ficam somente para consulta');
context.selectedD0CaptureId='current';context.currentResult.critical.push('falha');context.updateD0ApplyAvailability();assert.equal(applyButton.disabled,true,'falhas de validação continuam bloqueando a atualização');
context.currentResult.critical=[];context.d0CaptureHistory[0].state='unavailable';context.updateD0ApplyAvailability();assert.equal(applyButton.disabled,true,'comparação indisponível não libera a atualização antes da validação');
context.d0CaptureHistory[0].state='calculated';context.slots={d1:{},d0:null};context.currentResult.manifest.validacao_manifesto.modo_entrada='D_menos_1_somente';context.numberingValidationReady=false;context.updateD0ApplyAvailability();assert.equal(applyButton.disabled,true,'D−1 continua bloqueado enquanto a validação local está em andamento');
context.numberingValidationReady=true;context.updateD0ApplyAvailability();assert.equal(applyButton.disabled,false,'D−1 sozinho validado pode atualizar a base sem captura D0');
context.currentResult.critical.push('falha');context.updateD0ApplyAvailability();assert.equal(applyButton.disabled,true,'D−1 sozinho continua bloqueado por falha crítica');

assert.ok(html.indexOf('id="d0-changes-panel"')<html.indexOf('id="validation-panel"'),'tabela de alterações deve ocupar a posição anterior da validação automática');
assert.ok(html.indexOf('id="d0-changes-panel"')<html.indexOf('id="preview-panel"'),'tabela de alterações precisa vir antes da prévia do manifesto');
assert.ok(html.includes('if (slots.d0 && !slots.d0.error) renderD0DeltaPanel(result.manifest, comparisonBase, dateChanges, slots.d0.captureHistory)'),'D0 só deve registrar diferenças quando uma captura atual foi fornecida');
assert.ok(html.includes('id="d0-changes-table"')&&html.includes('<th>Situação</th>')&&html.includes('Custo</th>'),'tabela D0 deve exibir campanha, situação, impressões, cliques e custo');
assert.ok(!html.includes('id="d0-changes-caption"')&&html.includes('id="d1-changes-caption"'),'remove a legenda textual da comparação D0 sem afetar o aviso do fechamento D−1');
assert.ok(html.includes('buildD0DeltaTotals(entry.rows)')&&html.includes('delta-total-row')&&html.includes("'Totais'"),'a tabela D0 deve incluir uma linha final com os totais');
assert.ok(html.includes('Custos apresentados separadamente por moeda.')&&html.includes('* indica que há linhas sem comparação válida'),'os detalhes de moeda e comparação parcial continuam acessíveis nos títulos dos totais');
assert.ok(html.includes('.delta-total-row > * { border-top: 2px solid var(--border); border-bottom: 0; }'),'a linha de totais deve ficar visualmente separada');
assert.ok(html.includes('id="d0-capture-tabs" role="tablist" aria-label="Capturas D0"'),'diferenças devem ser navegáveis em abas de capturas D0');
assert.ok(html.includes("removeButton.textContent = '×'")&&html.includes('deleteD0CaptureEntry(entry.id)'),'cada captura deve exibir uma ação individual de remoção');
assert.ok(html.includes('.d0-capture-group-tabs { display: flex; flex-wrap: nowrap;')&&html.includes('overflow-x: auto; overflow-y: hidden;'),'capturas permanecem em uma faixa com rolagem horizontal');
assert.ok(html.includes('.d0-capture-tab-item { position: relative;')&&html.includes('.d0-capture-delete { position: absolute;')&&html.includes('border: 0; border-radius: 6px; background: transparent;'),'X fica sobreposto dentro do cartão, sem quadro separado');
assert.ok(html.includes('Apagar somente este registro do histórico local de capturas D0?')&&html.includes('A base de campanhas não será alterada.'),'a remoção deve confirmar o alvo e manter a base de campanhas intacta');
assert.ok(html.includes('d0-capture-group-title')&&html.includes('MCC não identificada · histórico anterior'),'histórico agrupa por MCC e identifica capturas antigas sem contexto MCC');
assert.ok(html.includes('managerAccountName} · ${entry.managerAccountId}'),'cada aba mostra o rótulo e o ID técnico da MCC');
assert.ok(html.includes('window.localStorage')&&html.includes('painel-preparador-mcc-capturas-d0-v1'),'histórico deve persistir localmente no navegador, sem usar a base de campanhas');
assert.ok(html.includes('capturedAt:capture.capturedAt'),'o horário original da extensão deve chegar ao registro da captura');
assert.ok(html.includes('selectedD0CaptureId === slots.d0.captureHistory.id'),'somente a captura D0 atual pode habilitar Atualizar base');
assert.ok(html.includes('d0CaptureHistorySaveFailed'),'falha ao salvar o histórico deve ser comunicada');
assert.ok(html.includes("const explicitlyPaused = ['pausada','pausado','paused'].includes(normalizedState)"),'somente o estado operacional pausado explícito deve ser sinalizado');
assert.ok(html.includes('painel-preparador-mcc-pausas-d0-v1')&&html.includes('d0PausedCampaignsFromCaptureHistory'),'identificações antigas e novas devem alimentar um histórico persistente independente das abas');
assert.ok(html.includes('Nenhuma diferença quantificável, campanha nova ou primeira pausa explícita nesta captura.'),'estado vazio deve indicar que campanhas novas e a primeira pausa explícita também foram verificadas');
assert.ok(html.includes('knownMccCampaigns')&&html.includes('previousMccCampaigns'),'o comparador identifica campanhas novas e deltas dentro do escopo da mesma MCC');
const d1PanelStart=html.indexOf('id="d1-changes-panel"'),d0PanelStart=html.indexOf('id="d0-changes-panel"'),validationPanelStart=html.indexOf('id="validation-panel"');
assert.ok(html.slice(d1PanelStart,d0PanelStart).includes('id="apply-manifest"'),'o único botão Atualizar base deve poder ser movido para o painel D−1');
assert.ok(html.includes('function placeApplyActions(hasD0)')&&html.includes("hasD0 ? '#d0-changes-panel' : '#d1-changes-panel'"),'o botão deve acompanhar o período recebido');
assert.equal([...html.matchAll(/id="apply-manifest"/g)].length,1,'deve haver somente um botão Atualizar base');
assert.equal([...html.matchAll(/class="slot-note">Opcional/g)].length,2,'D−1 e D0 devem ser opcionais individualmente');
assert.match(html,/section\[aria-labelledby="step1-title"\] > \.panel-head, #d0-changes-panel > \.panel-head, #d1-changes-panel > \.panel-head\s*\{\s*padding:\s*8px 16px/,'cabeçalhos destacados do Preparador devem manter espaçamento vertical compacto');
assert.match(html,/#d0-changes-panel #apply-manifest:not\(\.hub-panel-action\), #d1-changes-panel #apply-manifest:not\(\.hub-panel-action\)\s*\{\s*padding:\s*6px 10px;\s*font-size:\s*\.88rem/,'o tamanho local legado só se aplica quando a ação não opta pelo padrão do topo');
assert.ok(html.includes('id="apply-feedback" role="status" aria-live="polite"'),'status da atualização deve aparecer no cabeçalho com anúncio acessível');
assert.ok(html.indexOf('id="apply-feedback"')<html.indexOf('id="apply-manifest"'),'status deve ficar no espaço entre o título e o botão');
assert.ok(!html.includes('id="apply-panel"')&&!html.includes('Status da atualização'),'seção 3 de status da atualização deve ser removida');
assert.ok(html.includes('<h2 id="step3-title">Prévia do manifesto</h2>'),'prévia deve assumir o número 3 após a remoção da antiga seção');
assert.ok(html.includes("feedback.textContent = `Base atualizada com sucesso · ${count} campanha(s) · ${formatPanelUpdateTime(applied.base.atualizado_em)} (Brasília).`"),'o cabeçalho deve informar quando a atualização terminar com sucesso e o horário salvo na base');
assert.ok(html.includes('feedback.textContent = `Falha ao atualizar a base · ${reason}`'),'o cabeçalho deve informar falhas ao atualizar a base');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
console.log('comparação de deltas D0 ok');
