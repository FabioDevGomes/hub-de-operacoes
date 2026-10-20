import assert from 'node:assert/strict';
import { appendTrendSearch, trendSearchHistory } from '../src/curadoria/top-performance/top-performance-storage.mjs';

const legacy={offerId:'offer-1',lastSearchedAt:'2026-10-19T12:00:00.000Z'};
assert.deepEqual(trendSearchHistory(legacy),[{term:'',searchedAt:legacy.lastSearchedAt}], 'buscas antigas sem termo ficam disponíveis, sem inventar o termo');

const latestAt='2026-10-20T12:00:00.000Z';
const withLatest=appendTrendSearch(legacy,latestAt,'  LifeGauge WattSaver  ');
assert.deepEqual(withLatest,[{term:'LifeGauge WattSaver',searchedAt:latestAt},{term:'',searchedAt:legacy.lastSearchedAt}], 'o termo é normalizado e a busca mais recente vem primeiro');
assert.deepEqual(trendSearchHistory({...legacy,lastSearchedAt:latestAt,searchHistory:withLatest}),withLatest, 'a última busca já salva não é duplicada ao ler o histórico');
assert.deepEqual(legacy,{offerId:'offer-1',lastSearchedAt:'2026-10-19T12:00:00.000Z'}, 'a projeção do histórico não modifica o registro original');

const withMiddle=appendTrendSearch({...legacy,lastSearchedAt:latestAt,searchHistory:withLatest},'2026-10-20T11:00:00.000Z','LifeGauge');
assert.deepEqual(trendSearchHistory({lastSearchedAt:latestAt,searchHistory:withMiddle}),[
  {term:'LifeGauge WattSaver',searchedAt:latestAt},
  {term:'LifeGauge',searchedAt:'2026-10-20T11:00:00.000Z'},
  {term:'',searchedAt:legacy.lastSearchedAt},
], 'o histórico continua ordenado do mais recente para o mais antigo');

assert.deepEqual(appendTrendSearch(legacy,latestAt,'   '),trendSearchHistory(legacy), 'termo vazio não cria item de histórico');
assert.deepEqual(appendTrendSearch(legacy,'data-inválida','consulta'),trendSearchHistory(legacy), 'data inválida não cria item de histórico');

console.log('top-performance search history tests passed');
