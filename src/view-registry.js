(function(){
  const DEFAULT_VIEW_ID='totals';
  const VIEWS=Object.freeze({
    totals:Object.freeze({id:'totals',query:null,enabled:true,activeView:'totals',sectionId:'totalsView',navId:'totalsNav',title:'Visão geral',subtitle:'Acompanhamento das campanhas ativas'}),
    macro:Object.freeze({id:'macro',query:'macro',enabled:true,activeView:'control-macro',sectionId:'controlMacroView',navId:'controlMacroNav',title:'Controle Macro',subtitle:'Resumo diário do desempenho da operação'}),
    billing:Object.freeze({id:'billing',query:'billing',enabled:true,activeView:'billing',sectionId:'billingView',navId:'billingNav',title:'Faturamento',subtitle:'Comissões detalhadas, pagamentos e reembolsos'}),
    tested:Object.freeze({id:'tested',query:'tested',enabled:true,activeView:'tested-products',sectionId:'testedProductsView',navId:'testedProductsNav',title:'Produtos testados',subtitle:'Lista consolidada de todo o histórico'}),
    cpa:Object.freeze({id:'cpa',query:'cpa',enabled:true,activeView:'cpa-report',sectionId:'cpaReportView',navId:'cpaReportNav',title:'Análise por Faixa de CPA',subtitle:'Distribuição, desempenho e validação das faixas configuradas'}),
    accounts:Object.freeze({id:'accounts',query:'accounts',enabled:true,activeView:'account-report',sectionId:'accountReportView',navId:'accountReportNav',title:'Mapa de Produtos por Conta',subtitle:'Visão consolidada de onde cada campanha está e de suas principais métricas'}),
    observability:Object.freeze({id:'observability',query:'observability',enabled:true,activeView:'observability',sectionId:'observabilityView',navId:'observabilityNav',title:'Observabilidade Decisória Operacional',subtitle:'Auditoria dos fatos e snapshots registrados nas sincronizações'}),
    'curation-observability':Object.freeze({id:'curation-observability',query:'curation-observability',enabled:true,activeView:'curation-observability',sectionId:'curationObservabilityView',navId:'curationObservabilityNav',title:'Observabilidade da Curadoria',subtitle:'Histórico independente dos sinais registrados antes do teste'}),
    time:Object.freeze({id:'time',query:'time',enabled:true,activeView:'time',sectionId:'timeView',navId:'timeNav',title:'Meu Tempo',subtitle:'Registre rápido, revise com detalhe e acompanhe sua evolução'}),
    'personal-finance':Object.freeze({id:'personal-finance',query:'personal-finance',enabled:true,activeView:'personal-finance',sectionId:'personalFinanceView',navId:'personalFinanceNav',title:'Controle de gastos',subtitle:'Planejado e realizado por mês, trimestre ou consolidado'}),
    copy:Object.freeze({id:'copy',query:'copy',enabled:true,activeView:'copy-ficha',sectionId:'copyFichaView',navId:'copyFichaNav',title:'Ficha e Presell',subtitle:'Cole o conteúdo estruturado, valide a ficha e crie a Presell no fluxo local'}),
    presell:Object.freeze({id:'presell',query:'presell',enabled:true,activeView:'copy-ficha',sectionId:'copyFichaView',navId:'copyFichaNav',title:'Ficha e Presell',subtitle:'Atalho compatível para a tela unificada'})
  });
  function definition(id){return VIEWS[String(id||'')]||null}
  function enabledViews(){return Object.values(VIEWS).filter(view=>view.enabled)}
  function resolveRoute(route='/'){const text=String(route||''),queryIndex=text.indexOf('?'),search=queryIndex>=0?text.slice(queryIndex+1):'',requested=new URLSearchParams(search).get('view');if(requested==='presell')return VIEWS.copy;const match=enabledViews().find(view=>view.query===requested);return match||VIEWS[DEFAULT_VIEW_ID]}
  function urlFor(id,pathname='/'){if(id==='presell')return urlFor('copy',pathname);const view=definition(id),base=String(pathname||'/').split('?')[0]||'/';return view?.enabled&&view.query?`${base}?view=${encodeURIComponent(view.query)}`:base}
  function isReserved(id){const view=definition(id);return Boolean(view&&!view.enabled)}
  window.PanelViews=Object.freeze({DEFAULT_VIEW_ID,VIEWS,definition,enabledViews,resolveRoute,urlFor,isReserved});
})();
