(function(){
  const DEFAULT_VIEW_ID='totals';
  const VIEWS=Object.freeze({
    totals:Object.freeze({id:'totals',query:null,enabled:true,activeView:'totals',sectionId:'totalsView',navId:'totalsNav',title:'Visão geral',subtitle:'Acompanhamento das campanhas ativas'}),
    tested:Object.freeze({id:'tested',query:'tested',enabled:true,activeView:'tested-products',sectionId:'testedProductsView',navId:'testedProductsNav',title:'Produtos testados',subtitle:'Lista consolidada de todo o histórico'}),
    cpa:Object.freeze({id:'cpa',query:'cpa',enabled:true,activeView:'cpa-report',sectionId:'cpaReportView',navId:'cpaReportNav',title:'Análise por Faixa de CPA',subtitle:'Distribuição, desempenho e validação das faixas configuradas'}),
    accounts:Object.freeze({id:'accounts',query:'accounts',enabled:true,activeView:'account-report',sectionId:'accountReportView',navId:'accountReportNav',title:'Mapa de Produtos por Conta',subtitle:'Visão consolidada de onde cada campanha está e de suas principais métricas'}),
    time:Object.freeze({id:'time',query:'time',enabled:true,activeView:'time',sectionId:'timeView',navId:'timeNav',title:'Meu Tempo',subtitle:'Registre rápido, revise com detalhe e acompanhe sua evolução'}),
    presell:Object.freeze({id:'presell',query:'presell',enabled:true,activeView:'presell',sectionId:'presellView',navId:'presellNav',title:'Gerador de Pre-Sell',subtitle:'Valide a ficha e crie arquivos locais com as proteções obrigatórias'})
  });
  function definition(id){return VIEWS[String(id||'')]||null}
  function enabledViews(){return Object.values(VIEWS).filter(view=>view.enabled)}
  function resolveRoute(route='/'){const text=String(route||''),queryIndex=text.indexOf('?'),search=queryIndex>=0?text.slice(queryIndex+1):'',requested=new URLSearchParams(search).get('view'),match=enabledViews().find(view=>view.query===requested);return match||VIEWS[DEFAULT_VIEW_ID]}
  function urlFor(id,pathname='/'){const view=definition(id),base=String(pathname||'/').split('?')[0]||'/';return view?.enabled&&view.query?`${base}?view=${encodeURIComponent(view.query)}`:base}
  function isReserved(id){const view=definition(id);return Boolean(view&&!view.enabled)}
  window.PanelViews=Object.freeze({DEFAULT_VIEW_ID,VIEWS,definition,enabledViews,resolveRoute,urlFor,isReserved});
})();
