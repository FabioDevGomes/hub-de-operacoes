import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as Storage from '../src/curadoria/clickbank-top-offers/clickbank-top-offers-storage.mjs';
import {memoryIndexedDB} from './helpers/manual-memory-idb.mjs';

assert.equal(Storage.DB_NAME, 'radar-clickbank-top-offers');
assert.equal(Storage.DB_VERSION, 3);
assert.deepEqual(Object.values(Storage.STORES), ['captures','offerMetadata','trends','images','decisions']);
assert.equal(Storage.BACKUP_FORMAT, 'radar-clickbank-top-offers-backup-v3');
assert.equal(Storage.LEGACY_BACKUP_V2_FORMAT, 'radar-clickbank-top-offers-backup-v2');
assert.equal(Storage.LEGACY_BACKUP_FORMAT, 'radar-clickbank-top-offers-backup-v1');
assert.equal(Storage.normalizeAffiliateLink('  https://aff.example/path?click=abc  '),'https://aff.example/path?click=abc','o link é salvo sem espaços laterais e preserva parâmetros de rastreamento');
assert.equal(Storage.normalizeAffiliateLink('http://aff.example/path'),'http://aff.example/path','links HTTP legados continuam aceitos');
assert.equal(Storage.normalizeAffiliateLink('javascript:alert(1)'),null,'protocolos executáveis não são aceitos como links');
assert.equal(Storage.normalizeAffiliateLink('https://usuario:senha@aff.example/path'),null,'URLs com credenciais embutidas são rejeitadas');
assert.equal(Storage.normalizeAffiliateLink('aff.example/path'),null,'o link precisa ser uma URL absoluta');
assert.equal(Storage.normalizeAffiliateLink('https://'+'a'.repeat(4100)+'.example'),null,'links acima do limite de tamanho são rejeitados');
assert.deepEqual(Storage.trendSearchHistory({searchHistory:[
  {searchedAt:'2026-01-02T10:00:00.000Z',term:'older'},
  {searchedAt:'2026-01-03T11:00:00.000Z',term:'newer'},
]}).map(item=>item.term),['newer','older'],'o histórico ordena pesquisas da mais recente para a mais antiga');
assert.deepEqual(Storage.trendSearchHistory({lastSearchedAt:'2026-01-03T11:00:00.000Z'}),[{searchedAt:'2026-01-03T11:00:00.000Z',term:''}],'timestamps legados continuam visíveis sem inventar um termo');
assert.throws(()=>Storage.appendTrendSearch({},'2026-01-03T11:00:00.000Z','  '),/inválida/,'termos vazios não viram buscas salvas');
assert.throws(()=>Storage.appendTrendSearch({},'not-a-date','termo válido'),/inválida/,'datas inválidas não entram no histórico');
const source = await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-storage.mjs', import.meta.url), 'utf8');
assert.match(source, /DECISION_VALUES = new Set\(\[[^\]]*'Precisa de aprovação'/, 'a store e a validação de backups aceitam a decisão exclusiva desta tela');
assert.match(source, /createObjectStore\(STORES\.captures,\s*\{keyPath:\s*'captureId'\}\)/);
assert.match(source, /for \(const name of \[STORES\.offerMetadata, STORES\.trends, STORES\.images\]\)/, 'a migração adiciona stores de análise sem recriar capturas');
assert.match(source, /createObjectStore\(STORES\.decisions,\s*\{keyPath:\s*'offerKey'\}\)/, 'a migração cria decisões por oferta sem recriar capturas');
assert.match(source, /createObjectStore\(name,\s*\{keyPath:\s*'offerKey'\}\)/);
assert.match(source, /\['clickbank-top-offers-v1','clickbank-top-offers-v2'\]/, 'o armazenamento aceita capturas antigas sem ID e novas com ID sem migração de schema');
assert.match(source, /offer\.offerId == null \|\|/, 'Offer ID é opcional, preservando capturas históricas');
assert.match(source, /record\.dtcCountryCapture\.source === 'clickbank-dtc-checkout'/, 'a origem DTC/hora e países capturados têm validação opcional, sem migração da store');
assert.ok(source.includes("record.dtcCountryCapture.countries.every(code => typeof code === 'string' && /^[A-Z]{2}$/.test(code))"), 'códigos DTC são validados como ISO de duas letras');
assert.ok(source.includes('isSalesPageType(record.salesPageType)'), 'metadado manual de página aceita DTC, VSL, TSL, Quiz ou ausente');
assert.ok(source.includes('(record.affiliateLink == null || normalizeAffiliateLink(record.affiliateLink) === record.affiliateLink)'), 'metadado de afiliado é opcional e URL inválida também é rejeitada na validação/backup');
assert.match(source,/export async function saveAffiliateLink\(identity,\s*value\)/,'link usa uma operação de persistência própria');
assert.match(source,/stored=\{manualCountries:\[\],\.\.\.request\.result,\.\.\.identity,affiliateLink\}/,'salvar o link atualiza somente o campo e preserva os demais metadados locais');
assert.match(source,/offerMetadata: await getAll\(STORES\.offerMetadata\)/,'o link entra no backup completo existente sem uma nova store');
assert.ok(source.includes("import {isSalesPageType} from './sales-page-type.mjs?v=3'"), 'validação reutiliza o contrato compartilhado sem nova store ou migração');
assert.match(source, /tx\.objectStore\(STORES\.captures\)\.add\(capture\)/, 'capturas são acrescentadas sem substituir a coleção anterior');
assert.match(source, /export async function exportBackup\(\)/);
assert.match(source, /offerMetadata: await getAll\(STORES\.offerMetadata\)/, 'o backup completo inclui países manuais');
assert.match(source, /trends: await getAll\(STORES\.trends\)/, 'o backup completo inclui avaliações e candidatas de Trends');
assert.match(source, /images: await getAll\(STORES\.images\)/, 'o backup completo inclui avaliações e negativas de Imagens');
assert.match(source, /decisions: await getAll\(STORES\.decisions\)/, 'o backup completo inclui as decisões próprias da ClickBank');
assert.match(source, /payload\?\.format === LEGACY_BACKUP_FORMAT/, 'backups v1 continuam importáveis sem análises adicionais');
assert.match(source, /payload\?\.format === LEGACY_BACKUP_V2_FORMAT/, 'backups v2 continuam importáveis sem decisões');
assert.match(source, /export async function putDecision\(record\)/, 'as decisões são salvas na store local própria');
assert.match(source, /export async function mergeBackup\(payload\)/);
assert.match(source, /result\.conflicts\+\+/);
assert.match(source, /for \(const storeName of Object\.values\(STORES\)\)/, 'a restauração mescla cada tipo de registro e mantém conflitos existentes');
assert.doesNotMatch(source, /\.clear\(|\.delete\(/, 'storage não limpa nem apaga registros');
assert.doesNotMatch(source, /indexedDB\.open\(['"]radar-top-performance['"]/, 'Top Offers CB não compartilha a base E-commerce GM');
assert.doesNotMatch(source, /indexedDB\.open\(['"]radar-hot-offers-ms['"]/, 'Top Offers CB não compartilha a base Hot Offers MS');

const originalIndexedDB=globalThis.indexedDB;
try {
  globalThis.indexedDB=memoryIndexedDB();
  const decision={offerKey:'synthetic::approval',currentStatus:'Precisa de aprovação',notes:'',updatedAt:'2026-10-20T12:00:00.000Z',history:[{status:'Precisa de aprovação',capturedAt:'2026-10-20T12:00:00.000Z',notes:''}]};
  await Storage.putDecision(decision);
  assert.deepEqual(await Storage.getAll(Storage.STORES.decisions),[decision],'a nova opção é aceita e persistida na store local');
  const trendsRecord={offerKey:'offer-history',productKey:'product-history',offerName:'History product',seller:'Seller',assessments:[{assessmentId:'assessment-1',status:'stable',countries:['US'],productAge:null,searchTerm:'existing assessment',date:'2026-10-20',capturedAt:'2026-10-20T12:00:00.000Z'}],keywordCandidates:['existing candidate'],customField:'preserved'};
  await Storage.putOfferRecord(Storage.STORES.trends,trendsRecord);
  const identity={offerKey:trendsRecord.offerKey,productKey:trendsRecord.productKey,offerName:trendsRecord.offerName,seller:trendsRecord.seller};
  await Storage.setTrendSearchTimestamp(identity,'2026-10-20T12:05:00.000Z','Main search');
  const savedTrends=await Storage.setTrendSearchTimestamp(identity,'2026-10-20T12:06:00.000Z','Candidate search');
  assert.deepEqual(savedTrends.searchHistory,[
    {searchedAt:'2026-10-20T12:06:00.000Z',term:'Candidate search'},
    {searchedAt:'2026-10-20T12:05:00.000Z',term:'Main search'},
  ],'cada pesquisa é acrescentada em ordem decrescente');
  assert.deepEqual(savedTrends.assessments,trendsRecord.assessments,'registrar buscas não altera avaliações');
  assert.deepEqual(savedTrends.keywordCandidates,trendsRecord.keywordCandidates,'registrar buscas não altera candidatas');
  assert.equal(savedTrends.customField,'preserved','o patch preserva campos existentes');
  await assert.rejects(Storage.setTrendSearchTimestamp(identity,'2026-10-20T12:07:00.000Z','  '),/inválida/);
  const staleCandidateUpdate={...trendsRecord,keywordCandidates:['updated candidate']};
  const savedCandidateUpdate=await Storage.putOfferRecord(Storage.STORES.trends,staleCandidateUpdate);
  assert.deepEqual(savedCandidateUpdate.searchHistory,savedTrends.searchHistory,'salvar candidatas a partir de um rascunho antigo não apaga buscas recentes');
  const stalePageUpdate=await Storage.saveTrendPage({...trendsRecord,pageDraft:{term:'draft',status:''}});
  assert.deepEqual(stalePageUpdate.record.searchHistory,savedTrends.searchHistory,'salvar a ficha a partir de um rascunho antigo também preserva buscas recentes');
  const backup=await Storage.exportBackup();
  globalThis.indexedDB=memoryIndexedDB();
  await Storage.mergeBackup(backup);
  assert.deepEqual(await Storage.getAll(Storage.STORES.decisions),[decision],'a decisão continua válida no round-trip de backup');
  assert.deepEqual(await Storage.getAll(Storage.STORES.trends),[stalePageUpdate.record],'o histórico de buscas é incluído no backup sem store nova');
} finally {
  if(originalIndexedDB===undefined)delete globalThis.indexedDB;
  else globalThis.indexedDB=originalIndexedDB;
}

console.log('clickbank top offers storage ok');
