import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = vm.createContext({ window:{}, structuredClone });
vm.runInContext(await readFile(new URL('../src/database.js', import.meta.url), 'utf8'), context);
const db = context.window.CampaignDatabase;
const metric = valor => ({ valor, estado:valor === 0 ? 'zero_confirmado' : 'confirmado' });
const period = (date, status, conversions = 0) => ({ presente:true, data:metric(date), estado_campanha:metric(status), conversoes:metric(conversions), valor_conversao:metric(conversions * 50), moeda:metric('BRL') });
const manifest = (date, campaigns) => ({ separacao_temporal:{ D_zero:{ datas_detectadas:[date] } }, campanhas:campaigns });
const rowFactory = source => [['d1','metricas_D_menos_1'],['d0','metricas_D_zero']].flatMap(([period,field]) => {
  const metrics = source[field];
  return !metrics || metrics.presente === false ? [] : [{ date:metrics.data.valor, period, cells:{ F:{ value:metrics.conversoes.valor }, P:{ value:metrics.valor_conversao.valor }, O:{ value:10 } } }];
});
const original = db.importManifest(db.create(), manifest('2026-09-29', [
  { nome_campanha_exato:'Oferta pausa', metricas_D_zero:period('2026-09-29', 'Ativada') },
  { nome_campanha_exato:'Só ontem', metricas_D_zero:period('2026-09-29', 'Ativada') },
]), rowFactory).base;
const pausedId = original.campanhas.find(item => item.nome_mcc === 'Oferta pausa').id;
const withManual = db.addProvisionalSale(original, { campanha_id:pausedId, data:'2026-09-29', valor_brl:50, pais_codigo:'ZZ', chave_duplicidade:'synthetic-paused-sale' }).base;
const all = manifest('2026-09-30', [
  { nome_campanha_exato:'Oferta pausa', metricas_D_menos_1:period('2026-09-29', 'Pausada', 1), metricas_D_zero:period('2026-09-30', 'Pausada') },
  { nome_campanha_exato:'Oferta ativa', metricas_D_menos_1:period('2026-09-29', 'Pausada'), metricas_D_zero:{ ...period('2026-09-30', 'Ativada'), status_qualificacao:metric('Não qualificada') } },
  { nome_campanha_exato:'Oferta removida', metricas_D_zero:period('2026-09-30', 'Removed') },
  { nome_campanha_exato:'Só ontem', metricas_D_menos_1:period('2026-09-29', 'Ativada', 1), metricas_D_zero:{ presente:false } },
  { nome_campanha_exato:'Estado no status', metricas_D_zero:{ ...period('2026-09-30', null), status_campanha:metric('Pausada') } },
]);
all.separacao_temporal.D_menos_1 = { datas_detectadas:['2026-09-29'] };
const result = db.importManifest(withManual, all, rowFactory, { overwrite:true });
const campaign = name => result.base.campanhas.find(item => item.nome_mcc === name);
assert.equal(campaign('Oferta pausa').status, 'pausada', 'campanha presente mas pausada não vira ativa');
assert.equal(campaign('Oferta pausa').status_origem, 'status_na_coleta');
assert.equal(campaign('Oferta ativa').status, 'ativa', 'D0 prevalece sobre D−1 e reprovação não equivale a pausa');
assert.equal(campaign('Oferta removida').status, 'pausada', 'removida não entra na lista de ativas');
assert.equal(campaign('Só ontem').status, 'pausada', 'presença somente em D−1 não reativa campanha ausente de D0');
assert.equal(campaign('Estado no status').status, 'pausada', 'estado literal em Status também pode informar a pausa');
assert.equal(result.base.campanhas.filter(item => item.status === 'ativa').length, 1);
assert.equal(result.base.diario.find(item => item.campanha_id === pausedId && item.data === '2026-09-29').celulas.F.value, 1);
assert.equal(result.base.vendas_provisorias[0].status, 'conciliada', 'D−1 confirma a venda mesmo com a campanha pausada');
assert.equal(result.reconciledSales.length, 1, 'a alteração segue para a persistência do Faturamento');
assert.equal(result.mccBillingSales.find(item => item.campaign_id === pausedId && item.source_period === 'd1').confirmation_status, 'represented_by_manual', 'não duplicar venda manual confirmada');
assert.equal(withManual.vendas_provisorias[0].status, 'provisoria', 'não modificar a base de entrada');
const snapshot = result.base.snapshots_campanhas.at(-1);
assert.equal(snapshot.campanhas.length, 5, 'preservar todos os nomes para auditoria');
assert.equal(snapshot.campanhas_ativas.join(','), 'Oferta ativa');
const replay = db.importManifest(result.base, all, rowFactory, { overwrite:true });
assert.equal(replay.base.diario.length, result.base.diario.length);
assert.equal(replay.base.campanhas.length, result.base.campanhas.length);
assert.equal(replay.reconciledSales.length, 0);
assert.equal(replay.base.campanhas.find(item => item.id === pausedId).pausada_em, '2026-09-30');
const reconciled = db.reconcileCampaignSnapshots(result.base, [snapshot]).base;
assert.equal(reconciled.campanhas.find(item => item.id === pausedId).status, 'pausada', 'reprocessar snapshots não pode reativar pausadas');
const reactivated = db.importManifest(result.base, manifest('2026-10-01', [
  { nome_campanha_exato:'Oferta pausa', metricas_D_zero:period('2026-10-01', 'Enabled') },
]), rowFactory).base.campanhas.find(item => item.id === pausedId);
assert.equal(reactivated.status, 'ativa');
assert.equal(reactivated.movimento_status, 'reativada');
const template = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');
const viewContext = vm.createContext({ CampaignDatabase:db, state:{ database:result.base, manifest:all, productCatalog:null } });
const viewHelpers = ['currentCampaignRows','derivedContext','campaignRows','activeCampaignRows'].map(name => template.match(new RegExp(`function ${name}\\([^\\n]+`))[0]).join('\n');
vm.runInContext(`let derivedCache=null;\n${viewHelpers}`, viewContext);
const visibleRows = viewContext.derivedContext().campaigns;
assert.equal(visibleRows.filter(item => item._status === 'ativa').length, 1, 'a Visão Geral não pode marcar todas as linhas do manifesto como ativas');
assert.equal(visibleRows.find(item => item.nome_campanha_exato === 'Oferta pausa').metricas_D_menos_1.conversoes.valor, 1, 'a linha pausada conserva as métricas oficiais');

// Exercise the actual sidebar and overview renderers, not only derived status.
const historicalBase=db.normalize(result.base);
historicalBase.campanhas.push({id:'old_paused',nome_mcc:'Pausa antiga',nome_exibicao:'Pausa antiga',status:'pausada',pausada_em:'2026-09-10'});
viewContext.state.database=historicalBase;
viewContext.state.listMode='active';
viewContext.state.campaignStatusFilter='active';
viewContext.state.sortKey='current';
viewContext.state.sortDir='desc';
const classes=initial=>{
  const values=new Set(initial);
  return {contains:key=>values.has(key),add:key=>values.add(key),toggle(key,enabled){if(enabled)values.add(key);else values.delete(key);}};
};
const elements=new Map();
viewContext.$=selector=>{
  if(!elements.has(selector))elements.set(selector,{value:'',innerHTML:'',textContent:'',classList:classes([])});
  return elements.get(selector);
};
let filterRows=[];
viewContext.$$=selector=>selector==='#totalsBody tr'?filterRows:[];
viewContext.campaignSheet=name=>name;
viewContext.esc=String;
viewContext.hiddenSheets=()=>[{id:'old_paused',name:'Pausa antiga',status:'pausada',source:'database'}];
vm.runInContext(template.match(/function renderSidebar\([^\n]+/)[0],viewContext);
viewContext.renderSidebar();
assert.match(elements.get('#campaignList').innerHTML,/Oferta ativa/);
assert.doesNotMatch(elements.get('#campaignList').innerHTML,/Oferta pausa|Oferta removida|Só ontem|Estado no status|Pausa antiga/,'Diário Ativas excludes paused, removed and D−1-only campaigns');
elements.get('#search').value='pausa';viewContext.renderSidebar();
assert.match(elements.get('#campaignList').innerHTML,/Nenhum item encontrado/,'search cannot reintroduce a paused campaign into Ativas');
viewContext.state.listMode='history';viewContext.renderSidebar();
assert.match(elements.get('#campaignList').innerHTML,/Pausa antiga/,'historical sidebar remains available');
elements.get('#search').value='';
const {createRoot,format}=await import('./helpers/view-dom.mjs');
const overviewDom=createRoot(),overviewContext=vm.createContext({window:{}});
vm.runInContext(await readFile(new URL('../src/overview-domain.js',import.meta.url),'utf8'),overviewContext);
vm.runInContext(await readFile(new URL('../src/overview/view.js',import.meta.url),'utf8'),overviewContext);
const getSnapshot=()=>{
  const campaigns=viewContext.campaignRows();
  return {activeCount:viewContext.activeCampaignRows().length,pausedCount:campaigns.filter(c=>c._status==='pausada').length,
    dates:{d0:'2026-09-30',d1:'2026-09-29'},referenceDate:'2026-09-30',
    d1Totals:campaigns.map(()=>({})),rows:campaigns.map(c=>{
      const stored=historicalBase.campanhas.find(item=>item.nome_mcc===c.nome_campanha_exato);
      return {c,identity:{name:c.nome_campanha_exato,dateLabel:'',dateSort:''},totals:{},d0Totals:{},
        campaignId:stored.id,pausedAt:stored.pausada_em||'',zeroDays:null,roi:null,profit:null};
    })};
};
const overview=overviewContext.window.OverviewView.mount({root:overviewDom.root,state:viewContext.state,
  getSnapshot,domain:overviewContext.window.OverviewDomain,format,actions:{}});
for(const mode of ['consolidated','d1','d0']){
  viewContext.state.totalsMode=mode;
  for(const [filter,expected] of [['active',1],['paused',5],['paused7',4],['all',6]]){
    viewContext.state.campaignStatusFilter=filter;overview.render();
    const rendered=[...overviewDom.get('#totalsBody').innerHTML.matchAll(/<tr class="([^"]*)" /g)];
    assert.equal(rendered.filter(row=>!row[1].split(' ').includes('hidden')).length,expected,`${mode}/${filter} filters the correct operational status`);
    assert.equal(overviewDom.get('#totalsCount').textContent,'1 ativas · 5 pausadas','counter must count statuses, not the five raw manifest records');
    assert.match(overviewDom.get('#kpis').innerHTML,/<strong class="kpi-value">1<\/strong>/);
  }
}
const reactivatedBase=db.importManifest(historicalBase,manifest('2026-10-01',[
  {nome_campanha_exato:'Oferta pausa',metricas_D_zero:period('2026-10-01','Ativada')},
  {nome_campanha_exato:'Oferta ativa',metricas_D_zero:period('2026-10-01','Enabled')},
]),rowFactory).base;
viewContext.state.database=reactivatedBase;viewContext.state.manifest=reactivatedBase.manifesto_atual;viewContext.state.listMode='active';
assert.equal(viewContext.activeCampaignRows().length,2,'fresh import invalidates the derived cache and includes a reactivation');
viewContext.renderSidebar();assert.match(elements.get('#campaignList').innerHTML,/Oferta pausa/);
assert.equal(historicalBase.campanhas.find(item=>item.nome_mcc==='Oferta pausa').status,'pausada','UI regression does not mutate stored input');
console.log('MCC all campaigns: status D0, paused financial history, manual reconciliation and idempotency ok');
