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
  assert.equal(parsed.movement.period,'past week');
  assert.equal(Glimpse.movementValueLabel(parsed.movement.percent),'-37%');
  assert.match(analysis.operationalReading,/-37% no período recente/);
  assert.doesNotMatch(analysis.operationalReading,/\+37%/);
  assert.equal(parsed.parserVersion,'1.1.0');
});

test('preserva os sinais explícitos positivo e negativo e trata zero como neutro',()=>{
  assert.equal(Glimpse.parseGlimpse('+12%\npast week').movement.percent,12);
  assert.equal(Glimpse.parseGlimpse('-12%\npast week').movement.percent,-12);
  assert.equal(Glimpse.parseGlimpse('0%\npast week').movement.percent,0);
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
  assert.equal(Glimpse.compactSummary(analysis),'<500 · Limitado');
});

test('aceita cabeçalhos e totais em português',()=>{
  const parsed=Glimpse.parseGlimpse(`derila\nTermo de pesquisa\nCompare\nMundo\nÚltimos 30 dias\nTodas as categorias\nPesquisa na Web\nInteresse por região\n1\nSuíça\n100\nMostrando 1 a 1 de 35 regiões\nAssuntos relacionados\n1\nNordVPN - AssuntoAumento repentino\nMostrando 1 a 1 de 23 assuntos\nPesquisas relacionadas\n1\nderila preço\nMais 80%\nMostrando 1 a 1 de 25 consultas`);
  assert.equal(parsed.regions.reportedTotal,35);
  assert.equal(parsed.relatedTopics.reportedTotal,23);
  assert.equal(parsed.relatedTopics.items[0].breakout,true);
  assert.equal(parsed.relatedQueries.reportedTotal,25);
  assert.equal(parsed.relatedQueries.items[0].growthPercent,80);
});
