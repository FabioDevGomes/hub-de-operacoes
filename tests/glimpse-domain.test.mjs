import test from 'node:test';
import assert from 'node:assert/strict';
import * as Glimpse from '../src/curadoria/glimpse-domain.mjs';

const tirze=`6 / 10 searches left
Upgrade
Tirze Plus
Termo de pesquisa
Compare
Mundo
Últimos 30 dias
Todas as categorias
Pesquisa na Web
Daily Search Volume Over Time
<500 searches past month
77%
past week
Seasonality
Not enough data. Try a broader, less-specific search term
People Also Search
tirze plus avis
Set Alert
Previous
Page 1 of 1
Next
Related Trends
Tirzepatide
Tirzepatide microdose
Tirzepatide weight loss
Zepbound generic
Mounjaro pen
See all 115+ Related Trends
Channel
Channel breakdown is unavailable for low volume searches.
Interesse por região
1
Ilhas Marianas do Norte
100
Showing 1 - 1 of 1 regions
Related Topics
1
Plus GSM - Assunto
Aumento repentino
Showing 1 - 1 of 1 topics
Related Queries
Data not available`;

const ezstream=`EZStream
Termo de pesquisa
Compare
Mundo
Últimos 30 dias
Todas as categorias
Pesquisa na Web
4K searches past month
2%
past week
Seasonality
Not enough data. Try a broader, less-specific search term
People Also Search
ezstream tv
Set Alert
ezstream reviews
Set Alert
is ezstream a con
Set Alert
Page 1 of 3
Related Trends
Mux
bat station
Pixel Chat
Spinitron
Owncast
See all 130+ Related Trends
Channel
Interesse por região
1
Reino Unido
100
2
Canadá
14
3
Nova Zelândia
14
4
Austrália
14
Showing 1 - 4 of 4 regions
Related Topics
1
Esportes - Assunto
Aumento repentino
2
Canal de televisão - Assunto
Mais 80%
Showing 1 - 2 of 7 topics
Related Queries
1
exstream
Aumento repentino
Showing 1 - 1 of 2 topics`;

test('interpreta baixo volume sem transformar <500 em valor exato',()=>{
  const parsed=Glimpse.parseGlimpse(tirze);
  assert.equal(parsed.basic.searchTerm,'Tirze Plus');
  assert.deepEqual(parsed.volume,{value:500,operator:'<',display:'<500',period:'past_month',state:'available'});
  assert.equal(parsed.movement.percent,77);
  assert.equal(parsed.seasonality.state,'insufficient_data');
  assert.equal(parsed.channel.state,'unavailable_low_volume');
  assert.deepEqual(parsed.peopleAlsoSearch.pagination,{currentPage:1,totalPages:1});
  assert.equal(parsed.peopleAlsoSearch.capturedCount,1);
  assert.equal(parsed.relatedTrends.capturedCount,5);
  assert.equal(parsed.relatedTrends.reportedTotalMin,115);
  assert.equal(parsed.relatedTrends.reportedTotalIsApproximate,true);
  assert.equal(parsed.regions.items[0].interestIndex,100);
  assert.equal(parsed.relatedQueries.state,'not_available');
});

test('preserva movimento negativo Unicode e não o apresenta como crescimento',()=>{
  const parsed=Glimpse.parseGlimpse(`GloraMD\nTermo de pesquisa\nCompare\nMundo\nÚltimos 30 dias\nTodas as categorias\nPesquisa na Web\n2K searches past month\n−37%\npast week`);
  const analysis=Glimpse.analyzeGlimpse(parsed);
  assert.equal(parsed.movement.percent,-37);
  assert.equal(parsed.movement.period,'past_week');
  assert.equal(parsed.movement.periodLabel,'última semana');
  assert.equal(Glimpse.movementValueLabel(parsed.movement.percent),'-37%');
  assert.match(analysis.operationalReading,/-37% \(janela: última semana\)/);
  assert.doesNotMatch(analysis.operationalReading,/\+37%/);
  assert.equal(parsed.parserVersion,'1.2.0');
});

test('preserva os sinais explícitos positivo e negativo e trata zero como neutro',()=>{
  assert.equal(Glimpse.parseGlimpse('+12%\npast week').movement.percent,12);
  assert.equal(Glimpse.parseGlimpse('-12%\npast week').movement.percent,-12);
  assert.equal(Glimpse.parseGlimpse('0%\npast week').movement.percent,0);
  assert.equal(Glimpse.parseGlimpse('+12%').movement.state,'not_detected','percentual sem janela não é associado automaticamente ao movimento');
});

test('distingue itens capturados de totais e páginas informados',()=>{
  const parsed=Glimpse.parseGlimpse(ezstream);
  assert.equal(parsed.volume.value,4000);
  assert.equal(parsed.volume.display,'4K');
  assert.equal(parsed.peopleAlsoSearch.capturedCount,3);
  assert.deepEqual(parsed.peopleAlsoSearch.pagination,{currentPage:1,totalPages:3});
  assert.equal(parsed.relatedTrends.capturedCount,5);
  assert.equal(parsed.relatedTrends.reportedTotalMin,130);
  assert.equal(parsed.regions.capturedCount,4);
  assert.equal(parsed.regions.reportedTotal,4);
  assert.equal(parsed.relatedTopics.reportedTotal,7);
  assert.equal(parsed.relatedQueries.reportedTotal,2);
});

test('classifica intenção e mantém contaminação separada do dado bruto',()=>{
  const parsed=Glimpse.parseGlimpse(ezstream),analysis=Glimpse.analyzeGlimpse(parsed);
  assert.equal(analysis.classified.peopleAlsoSearch.find(item=>item.text==='ezstream reviews').category,'BOFU / Reviews');
  assert.equal(analysis.classified.peopleAlsoSearch.find(item=>item.text==='is ezstream a con').category,'Confiança / Objeção');
  assert.ok(['low','medium','high','unclear'].includes(analysis.indicators.contamination.level));
  assert.equal(Glimpse.isContaminated({relevance:'unclear'}),true);
  assert.equal(Glimpse.isContaminated({relevance:'medium'}),false);
  assert.equal(Glimpse.isContaminated({relevance:'low'}),false,'o classificador vigente não produz a categoria low; apenas unclear conta como ruído');
  assert.ok(analysis.signal.rulesVersion);
});

test('sanitiza URLs e parâmetros sensíveis antes de persistir',()=>{
  const raw='Produto\nhttps://example.com/path?token=secret&x=1\nsession=abc';
  const sanitized=Glimpse.sanitizeRaw(raw);
  assert.equal(sanitized.includes('secret'),false);
  assert.equal(sanitized.includes('session=abc'),false);
  assert.match(sanitized,/https:\/\/example\.com\/path/);
});

test('resumo compacto respeita a representação do volume',()=>{
  const parsed=Glimpse.parseGlimpse(tirze),derived=Glimpse.analyzeGlimpse(parsed),analysis={parsed,signal:derived.signal};
  assert.equal(Glimpse.compactSummary({...analysis,analyzerVersion:'2.0.0'}),`<500 · ${Glimpse.signalLabel(derived.signal.level)}`);
  assert.equal(Glimpse.compactSummary({...analysis,analyzerVersion:'1.0.0',signal:{level:'limited'}}),'<500 · Limitado','resumos V1 preservam a representação histórica');
});

test('aceita cabeçalhos e totais em português',()=>{
  const parsed=Glimpse.parseGlimpse(`derila\nTermo de pesquisa\nCompare\nMundo\nÚltimos 30 dias\nTodas as categorias\nPesquisa na Web\nInteresse por região\n1\nSuíça\n100\nMostrando 1 a 1 de 35 regiões\nAssuntos relacionados\n1\nNordVPN - AssuntoAumento repentino\nMostrando 1 a 1 de 23 assuntos\nPesquisas relacionadas\n1\nderila preço\nMais 80%\nMostrando 1 a 1 de 25 consultas`);
  assert.equal(parsed.regions.reportedTotal,35);
  assert.equal(parsed.relatedTopics.reportedTotal,23);
  assert.equal(parsed.relatedTopics.items[0].breakout,true);
  assert.equal(parsed.relatedQueries.reportedTotal,25);
  assert.equal(parsed.relatedQueries.items[0].growthPercent,80);
});

function structuredSample({term,volume,movement,period,people=[],trends=[],topics=[],queries=[],regions=[],reportedRegionTotal=null,seasonality='Seasonality\nNot enough data',channel='Channel\nChannel breakdown is unavailable for low volume'}){
  const ranked=items=>items.flatMap((item,index)=>[String(index+1),item]).join('\n');
  return `${term}\nTermo de pesquisa\nCompare\nMundo\nÚltimos 30 dias\nTodas as categorias\nPesquisa na Web\n${volume} searches past month\n${movement}%\n${period}\n${seasonality}\nPeople Also Search\n${people.join('\n')}\nRelated Trends\n${trends.join('\n')}\n${channel}\nInteresse por região\n${regions.flatMap((region,index)=>[String(index+1),region.name,String(region.value)]).join('\n')}\nShowing 1 - ${regions.length} of ${reportedRegionTotal??regions.length} regions\nRelated Topics\n${ranked(topics)}\nRelated Queries\n${ranked(queries)}`;
}

const sonabudsRaw=structuredSample({
  term:'SonaBuds',volume:'1K',movement:'-100',period:'past year',
  people:['SonaBuds review 1','SonaBuds review 2','SonaBuds review 3','SonaBuds review 4','SonaBuds review 5','SonaBuds review 6'],
  trends:['SonaBuds review 1','SonaBuds coupon','SonaBuds product features 1','SonaBuds product features 2','SonaBuds product features 3','SonaBuds product features 4','SonaBuds product features 5','SonaBuds product features 6','qzxv token 1','qzxv token 2','qzxv token 3','qzxv token 4','qzxv token 5','qzxv token 6'],
  topics:['SonaBuds product features topic'],
  queries:['SonaBuds coupon 1','SonaBuds coupon 2','SonaBuds coupon 3','SonaBuds coupon 4','SonaBuds coupon 5'],
  regions:[{name:'United States',value:100}],seasonality:'Seasonality\nNot enough data',channel:'Channel\nChannel breakdown is unavailable for low volume'
});

const mendorexRaw=structuredSample({
  term:'Mendorex',volume:'9K',movement:'+9',period:'past week',
  people:['qzxv search alpha'],trends:['qzxv trend alpha','qzxv trend beta','qzxv trend gamma','qzxv trend delta','qzxv trend epsilon','qzxv trend zeta'],
  topics:['qzxv topic alpha'],queries:['Mendorex review'],
  regions:[{name:'Region A',value:100},{name:'Region B',value:60},{name:'Region C',value:40},{name:'Region D',value:35},{name:'Region E',value:20}],reportedRegionTotal:8,
  seasonality:'Seasonality\nNot enough data',channel:'Channel\nChannel breakdown is unavailable for low volume'
});

test('V2 interpreta queda anual extrema, deduplica intenção e unifica os totais',()=>{
  const parsed=Glimpse.parseGlimpse(sonabudsRaw),analysis=Glimpse.analyzeGlimpse(parsed);
  assert.equal(parsed.movement.percent,-100);
  assert.equal(parsed.movement.period,'past_year');
  assert.equal(analysis.signal.level,'mixed');
  assert.ok(analysis.signal.reasons.some(reason=>reason.includes('movimento')));
  assert.ok(analysis.alerts.some(alert=>alert.id==='extreme_decline'));
  assert.ok(analysis.alerts.some(alert=>alert.id==='limited_geography'));
  assert.equal(analysis.confidence.level,'high');
  assert.equal(analysis.dimensions.relevance.ratio,0.24);
  assert.equal(analysis.dimensions.geography.level,'limited');
  assert.notEqual(analysis.signal.level,'strong');
  assert.equal(analysis.indicators.intent.commercialCount,12);
  assert.equal((analysis.indicators.categoryCounts['BOFU / Reviews']||0)+(analysis.indicators.categoryCounts['Compra / Preço']||0)+(analysis.indicators.categoryCounts['Confiança / Objeção']||0),12);
  assert.equal(analysis.indicators.intent.duplicateOccurrences,1);
  const duplicated=analysis.classified.peopleAlsoSearch.find(item=>item.text==='SonaBuds review 1');
  assert.deepEqual(duplicated.sources,['peopleAlsoSearch','relatedTrends']);
  assert.match(analysis.operationalReading,/12 termos comerciais únicos/);
  const created=Glimpse.createAnalysis(sonabudsRaw,{productName:'SonaBuds',offerIds:['28356']},'2026-09-24T10:00:00.000Z');
  assert.equal(created.analyzerVersion,'2.0.0');
  assert.equal(created.signal.rulesVersion,'glimpse-signal-v2');
  assert.equal(created.parserVersion,'1.2.0');
});

test('V2 classifica Mendorex como misto, não como dados insuficientes',()=>{
  const analysis=Glimpse.analyzeGlimpse(Glimpse.parseGlimpse(mendorexRaw));
  assert.equal(analysis.indicators.coverage.score,7);
  assert.equal(analysis.dimensions.demand.level,'moderate');
  assert.equal(analysis.dimensions.movement.direction,'rising');
  assert.equal(analysis.dimensions.movement.period,'past_week');
  assert.equal(analysis.dimensions.intention.commercialCount,1);
  assert.equal(analysis.dimensions.relevance.contaminationLevel,'high');
  assert.equal(analysis.dimensions.geography.coverage,'partial');
  assert.equal(analysis.confidence.level,'medium');
  assert.equal(analysis.signal.level,'mixed');
  assert.ok(analysis.alerts.some(alert=>alert.id==='high_semantic_contamination'));
  assert.ok(analysis.alerts.some(alert=>alert.id==='low_commercial_intent'));
  assert.notEqual(analysis.signal.level,'insufficient_data');
});

test('dados realmente escassos produzem insufficient_data sem converter ausência em sinal fraco',()=>{
  const parsed=Glimpse.parseGlimpse('Termo\nTermo de pesquisa\nCompare\nMundo\nÚltimos 30 dias\nTodas as categorias\nPesquisa na Web'),analysis=Glimpse.analyzeGlimpse(parsed);
  assert.equal(analysis.signal.level,'insufficient_data');
  assert.equal(analysis.confidence.level,'low');
  assert.equal(analysis.indicators.intent.level,'not_evaluable');
  assert.equal(analysis.indicators.contamination.ratio,null);
  assert.equal(analysis.alerts.length,0,'ausência de seções, sem resultado avaliável, não vira uma lista de alertas negativos');
});

test('sinal positivo com confiança baixa continua válido e recebe ressalva',()=>{
  const raw=structuredSample({term:'Produto com evidência parcial',volume:'3K',people:['Produto com evidência parcial review','Produto com evidência parcial buy']}),analysis=Glimpse.analyzeGlimpse(Glimpse.parseGlimpse(raw));
  assert.equal(analysis.signal.level,'positive');
  assert.equal(analysis.confidence.level,'low');
  assert.ok(analysis.alerts.some(alert=>alert.id==='low_confidence'));
  assert.notEqual(analysis.signal.level,'weak','pouca cobertura reduz confiança, não converte ausência em evidência negativa');
});

test('os cinco níveis V2 têm condições determinísticas',()=>{
  const strong=Glimpse.analyzeGlimpse(Glimpse.parseGlimpse(structuredSample({
    term:'Oferta exemplo',volume:'12K',movement:'0',period:'past month',
    people:['Oferta exemplo review 1','Oferta exemplo review 2','Oferta exemplo review 3'],
    trends:['Oferta exemplo review 4','Oferta exemplo review 5'],topics:['Oferta exemplo review topic'],queries:['Oferta exemplo review query'],
    regions:[{name:'Region A',value:100},{name:'Region B',value:60}],
    seasonality:'Seasonality\nAvailable',channel:'Channel\nAvailable'
  })));
  assert.equal(strong.signal.level,'strong');
  assert.equal(strong.confidence.level,'high');
  assert.equal(strong.alerts.length,0);

  const positive=Glimpse.analyzeGlimpse(Glimpse.parseGlimpse(structuredSample({
    term:'Oferta positiva',volume:'3K',movement:'+10',period:'past week',
    people:['Oferta positiva review 1','Oferta positiva review 2','Oferta positiva review 3'],
    trends:['Oferta positiva product features'],topics:['Oferta positiva product features topic'],queries:['Oferta positiva review query'],
    regions:[{name:'Region A',value:100}],seasonality:'Seasonality\nAvailable',channel:'Channel\nAvailable'
  })));
  assert.equal(positive.signal.level,'positive','alta em janela semanal impede Forte pela ausência de convergência estável');
  assert.equal(positive.confidence.level,'high');

  const weak=Glimpse.analyzeGlimpse(Glimpse.parseGlimpse(structuredSample({
    term:'Produto sem demanda',volume:'300',movement:'-10',period:'past week',
    people:['qzxv alpha','qzxv beta','qzxv gamma'],regions:[{name:'Region A',value:100}],
    seasonality:'Seasonality\nNot enough data',channel:'Channel\nChannel breakdown is unavailable for low volume'
  })));
  assert.equal(weak.signal.level,'weak');
  assert.equal(weak.confidence.level,'medium');
});

test('movimento negativo, janelas semanal, mensal, trimestral e anual são preservados',()=>{
  for(const [text,period] of [['-5%\npast week','past_week'],['+8% past month','past_month'],['-100%\npast year','past_year'],['+20%\núltimos 3 meses','past_quarter']]){
    const analysis=Glimpse.analyzeGlimpse(Glimpse.parseGlimpse(text));
    assert.equal(analysis.dimensions.movement.period,period,text);
    assert.notEqual(analysis.dimensions.movement.direction,'unknown');
  }
  assert.equal(Glimpse.parseGlimpse('-100%\npast year').movement.percent,-100);
});

test('cobertura altera confiança, não soma atratividade nem troca o sinal',()=>{
  const parsed=Glimpse.parseGlimpse(sonabudsRaw),withHighCoverage=Glimpse.analyzeGlimpse(parsed);
  const reduced={...parsed,relatedTopics:{...parsed.relatedTopics,items:[],capturedCount:0,state:'not_detected'},regions:{...parsed.regions,items:[],capturedCount:0,state:'not_detected'}};
  const withReducedCoverage=Glimpse.analyzeGlimpse(reduced);
  assert.equal(withHighCoverage.signal.level,'mixed');
  assert.equal(withReducedCoverage.signal.level,'mixed');
  assert.equal(withHighCoverage.confidence.level,'high');
  assert.ok(['medium','low'].includes(withReducedCoverage.confidence.level));
  assert.ok(withHighCoverage.indicators.coverage.score>withReducedCoverage.indicators.coverage.score);
});

test('V1 permanece legível e a ordenação reconhece os cinco níveis V2',()=>{
  assert.equal(Glimpse.ANALYZER_VERSION,'2.0.0');
  assert.equal(Glimpse.signalLabel('medium'),'Médio');
  assert.equal(Glimpse.signalLabel('limited'),'Dados limitados');
  const ranked=['strong','positive','mixed','weak','insufficient_data'].map(level=>Glimpse.analysisRank({analyzerVersion:'2.0.0',signal:{level},parsed:{volume:{value:0}}}));
  assert.deepEqual(ranked,[...ranked].sort((a,b)=>b-a));
});
