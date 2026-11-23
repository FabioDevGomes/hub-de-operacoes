import { readMigrationDatabase } from './migration-idb-reader.mjs';
import { encodeMigrationValue } from './migration-serialization.mjs';
import { buildMigrationZip } from './migration-zip.mjs';

export const DATABASES = Object.freeze({
  'radar-top-performance': ['offers', 'collections', 'collection_offer_snapshots', 'decisions', 'trends', 'images'],
  'radar-clickbank-top-offers': ['captures', 'offerMetadata', 'trends', 'images', 'decisions'],
  'radar-glimpse': ['analyses'],
  'hub-asset-studio-capture-cache': ['captures'],
  'hub-google-ads-campaign-batch-images': ['images'],
  'hub-google-ads-geographic-reports': ['reports'],
  'hub-google-ads-search-terms-snapshots': ['queries'],
  'hub-tracking-clicks': ['report_snapshots'],
  'hub-tracking-gurumedia-sales': ['campaign_attributions', 'report_snapshots'],
  'hub-tracking-sales': ['sale_records', 'sync_metadata'],
  'painel-meu-tempo': ['categories', 'days', 'entries', 'imports', 'items', 'settings'],
  'radar-curadoria': ['landingPages', 'signals'],
  'radar-curadoria-manual': ['analyses', 'decisions', 'images', 'products', 'trends'],
  'radar-curadoria-observability': ['correlations', 'event_details', 'events', 'pretest_snapshots'],
  'radar-hot-offers-ms': ['collection_offer_snapshots', 'collections', 'decisions', 'images', 'offers', 'trends'],
  'radar-lista-gerente': ['collectionCaptures', 'collections', 'decisions', 'images', 'offers', 'trends'],
  'radar-smartadv-offers': ['captures', 'decisions', 'images', 'trends'],
  'painel-campanhas': ['bases', 'catalogos', 'events', 'billing_sales', 'billing_movements', 'billing_audit', 'billing_meta', 'personal_finance_groups', 'personal_finance_categories', 'personal_finance_months', 'personal_finance_entries', 'personal_finance_debts', 'personal_finance_funds']
});
const KEYS = new Set(['hub:campaign-delivery:records:v1', 'copy-ficha-draft-v1', 'hub:presell-deploy-jobs:v1', 'hub.google-ads.campaign-creation.drafts:v1', 'hub.google-ads.campaign-creation.batches:v1', 'hub.google-ads.campaign-creation.previews:v1', 'hub.google-ads.campaign-creation.csv-workflows:v1', 'hub.google-ads.campaign-creation.active-context:v1', 'hub:asset-studio:active-campaign-delivery:v1', 'hub:asset-studio:pending-page-directory:v1', 'hub:presell-campaign-handoff-selected-job:v1', 'hub:google-ads:campaign-sequence-reservations:v1', 'hub.google-ads-account-directory:v1', 'hub:google-ads:presell-campaign-handoff-ack:v1']);
for (const key of ['hub:google-ads:campaign-bookmarks:v1', 'hub:google-ads:manager-account-bookmarks:v1', 'hub:google-ads:resource-bookmarks:v1', 'hub:google-ads:account-image-eligibility:v1', 'hub:google-ads:account-image-api-status:v1', 'hub:tracking:product-labels:v1', 'hub:tracking:conversion-profiles:v1', 'hub:tracking:gurumedia-conversion-actions:v1', 'painel-water-reminder-v1', 'hub:usd-brl-rate:ptax:v1', 'hub.google-ads-search-terms:last-query:v1', 'hub:sidebar:frequent-views:v1', 'painel-sidebar-grupo-aberto-v1', 'painel-sidebar-recolhido-v1']) KEYS.add(key);
for (const key of [
  'hub:account-directory:manual-accounts:v1', 'hub:account-directory:manual-email:v1', 'hub:account-directory:manual-payment-profile-id:v1', 'hub:account-directory:manual-status:v1', 'hub:account-domain-associations:v1',
  'hub:account-map:duplication-selection:v1', 'hub:account-map:duplication-target:v1', 'hub:account-map:hidden-product-keys:v1',
  'hub:google-ads-campaign-duplication:ficha-draft:v1', 'hub:google-ads-campaign-duplication:presell-config:v1',
  'hub:google-ads:auto-pause-campaign-exceptions:v1', 'hub:google-ads:auto-pause-campaign-exception-identities:v1',
  'hub:google-ads:auto-pause-applied:v1', 'hub:google-ads:auto-pause-negative:v1', 'hub:google-ads:auto-pause-campaign-age:v1', 'hub:google-ads:auto-pause-campaign-age-settings:v1',
  'hub:google-ads:auto-pause-clicks-without-sale:v1', 'hub:google-ads:auto-pause-clicks-without-sale-settings:v1',
  'hub:google-ads:auto-pause-zero-impressions:v1', 'hub:google-ads:auto-pause-zero-impressions-settings:v1',
  'hub:google-ads:auto-pause-product-performance:v1', 'hub:google-ads:auto-pause-product-performance-snapshot:v1', 'hub:google-ads:auto-pause-product-settings:v1',
  'hub:google-ads:auto-pause-reference-competitor:v1', 'hub:google-ads:auto-pause-reference-competitor-settings:v1', 'hub:google-ads:auto-pause-minimum-product-performance-settings:v1',
  'hub:google-ads:auto-pause-active-retention-hours:v1', 'hub:google-ads:auto-pause-product-confirmation-seconds:v1', 'hub:google-ads:auto-pause-server-additional-delay-minutes:v1', 'hub:google-ads:auto-pause-proximity:v1',
  'hub:google-ads-impression-notification:state:v1', 'hub:google-ads-impression-notification:threshold:v1',
  'hub:overview:first-click-impressions:v1', 'hub:overview:google-ads-capture-history:v1', 'hub:google-ads:campaign-creation-mode:v1',
  'hub:clickbank-top-offers:hidden-offer-keys:v1', 'hub:smartadv-offers:hidden-offer-ids:v1', 'hub:curation:guru-media-top-performance:view:v1',
  'hub:review:planning:v1', 'painel-water-reminder-settings-v1', 'hub.google-ads-source-mode:v1'
]) KEYS.add(key);
// Preferências e histórico operacional observados no navegador; credenciais continuam excluídas.
for (const key of [
  'hub.google-ads-auto-update:enabled:v1', 'hub.google-ads-auto-update:interval-minutes:v1', 'hub.google-ads-auto-update:http-502-retry-interval-minutes:v1', 'hub.google-ads-auto-update:notifications:v1', 'hub.google-ads-auto-update:notification-delivery:v1', 'hub.google-ads-auto-update:status:v1', 'hub.google-ads-geographic-auto-update:status:v1',
  'hub:google-ads:auto-pause-minimum-product-performance:v1', 'hub:google-ads:auto-pause-server-policy-revision:v1', 'hub:google-ads:auto-pause-server-last-snapshot:v1', 'hub:google-ads:auto-pause-server-snapshot-ids:v1', 'hub:google-ads:auto-pause-server-received-snapshots:v1', 'hub:google-ads:auto-pause-server-simulation:v1',
  'hub:google-ads:quota-telemetry:v1', 'hub:google-ads:quota-telemetry:v2', 'hub:google-ads:quota-reference:v1', 'hub:google-ads:capture-snapshot-retention:v1', 'hub:google-ads:capture-history-display-limit:v1', 'hub:google-ads:change-history-display-limit:v1',
  'hub:product-diary:search-terms-access-history:v1', 'hub:product-diary:search-share-choice:v1', 'hub:product-diary:visible-columns:v1', 'hub:tracking:domain-list-cache:v1', 'hub:hostinger:hidden-domains:v1', 'hub:hostinger:sites-column-widths:v1',
  'hub:google-ads-search-terms:purchase-columns-migrated:v1', 'hub:google-ads-search-terms:purchase-cpa-column-migrated:v1', 'hub:google-ads-search-terms:recommendation-columns:v1', 'hub:google-ads-search-terms:recommendation-column-widths:v1', 'hub:google-ads-search-terms:daily-columns:v1',
  'hub:overview:column-widths:v1', 'hub:overview:campaign-parentheses:v1', 'hub:overview:sort:v1', 'hub:overview:selected-campaign:v1', 'hub:overview:campaign-analysis-indicator-retention-hours:v1',
  'hub:account-directory:column-widths:v1', 'hub:clickbank-top-offers:sort:v1', 'hub:clickbank-top-offers:visible-columns:v1', 'hub:smartadv-offers:visible-columns:v1', 'hub:smartadv-offers:visible-columns:v2', 'hub:radar-spyhero:visible-columns:v1', 'hub:auto-pause-diagnostics:enabled:v1',
  'google-ads-copy-import-source-v1', 'painel-preparador-mcc-capturas-d0-v1', 'painel-preparador-mcc-pausas-d0-v1', 'painel-produtos-testados-ordenacao-v1', 'painel-produtos-testados-colunas-v1', 'radar-gerentes-itens-ocultos-v1', 'radar-gerentes-colunas-v1', 'hot-offers-ms-hidden-v1', 'hot-offers-ms-columns-v1', 'top-performance-columns-v1', 'top-performance-itens-ocultos-v1'
]) KEYS.add(key);
for (let version = 1; version <= 10; version++) KEYS.add(`hub:overview:visible-columns:v${version}`);
for (const key of ['hub:google-ads:auto-pause-server-evaluation-inputs:v1', 'hub:campaign-base-cache-marker:v1', 'hub:system-version:accepted-notice:v1', 'hub:system-version:confirmed-update:v1']) KEYS.add(key);
const DIAGNOSTICS_PREFIX = 'hub:auto-pause-diagnostics:events:v1:';
const PREFIXES = ['copy-ficha-draft-v1:delivery:', 'google-ads-copy-selection-v1:', 'hub:google-ads:cpa-expansion:v1:', 'hub:google-ads:presell-campaign-handoff:v1:', 'hub:google-ads-search-terms:ai:v1:', 'hub:google-ads-search-terms:review:v1:', 'hub.google-ads-search-terms-campaigns:v1:', 'curadoria-list-focus:v1:', 'hub:curation:column-widths:v1:', 'hub:google-ads:auto-pause-observed-paused:v1:', 'hub:google-ads:campaign-action-status-override:v1:', 'hub:review:analysis:v1:', 'hub:review:copy:v1:', 'hub:review:images:v1:', 'hub:review:materials:v1:', 'hub:review:offer:v1:', 'hub:review:page:v1:', 'hub:review:reviewer:v1:'];
PREFIXES.push(DIAGNOSTICS_PREFIX);
const utf8 = new TextEncoder();

export function readAllowedStorage(storage) {
  const result = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (KEYS.has(key) || PREFIXES.some(prefix => key.startsWith(prefix))) result[key] = storage.getItem(key);
  }
  return result;
}

function abortIfNeeded(signal) { if (signal?.aborted) throw new DOMException('Exportação cancelada.', 'AbortError'); }
function safeName(name) { return typeof name === 'string' && name !== '.' && name !== '..' && !/[\\/\x00-\x1f]/.test(name) && !name.startsWith('.'); }

export async function exportMigration({ indexedDB, storage, root, version = '', signal, onProgress = () => {} }) {
  const files = [], issues = [], sources = {}, binaryManifest = [], fileLinks = [], fileChecks = [];
  const fingerprints = {};
  let binaryId = 0;
  async function digest(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join(''); }
  async function fingerprint(value) {
    const encoded = await encodeMigrationValue(value, async (bytes, metadata) => ({ sha256: await digest(bytes), size: bytes.byteLength, ...metadata }));
    return digest(utf8.encode(JSON.stringify(encoded)));
  }
  async function add(name, bytes) {
    abortIfNeeded(signal);
    const hash = await digest(bytes);
    files.push({ name, bytes });
    return { caminho: name, tamanho: bytes.byteLength, sha256: hash };
  }
  async function addBinary(bytes, metadata) {
    const entry = await add(`arquivos/${String(++binaryId).padStart(8, '0')}`, bytes);
    const ref = { path: entry.caminho, size: entry.tamanho, sha256: entry.sha256, ...metadata };
    binaryManifest.push(ref);
    return ref;
  }
  async function addJson(name, value) { return add(name, utf8.encode(JSON.stringify(value))); }
  const startStorage = readAllowedStorage(storage);
  for (const [name, stores] of Object.entries(DATABASES)) {
    abortIfNeeded(signal); onProgress(`Lendo ${name}…`);
    const result = await readMigrationDatabase(indexedDB, name, stores);
    try { fingerprints[name] = await fingerprint(result); } catch { issues.push(`Não foi possível verificar a estabilidade de ${name}.`); }
    if (result.status === 'presente' || result.status === 'parcial') {
      try {
        const encoded = await encodeMigrationValue(result, addBinary);
        const file = await addJson(`dados/${name}.json`, encoded);
        sources[name] = { status: result.status, version: result.version, stores: Object.fromEntries(Object.entries(result.stores).map(([key, item]) => [key, item.records.length])), missing: result.missing, file };
      } catch (error) { sources[name] = { status: 'erro', reason: error.message }; issues.push(`Falha ao serializar ${name}.`); }
    } else { sources[name] = { status: result.status, reason: result.reason }; if (result.status !== 'ausente') issues.push(`Não foi possível verificar ${name}.`); }
    if (result.status === 'parcial') issues.push(`Coleções ausentes em ${name}: ${result.missing.join(', ')}.`);
  }
  sources.localStorage = { status: 'presente', count: Object.keys(startStorage).length, excluded_count: Math.max(0, storage.length - Object.keys(startStorage).length), file: await addJson('dados/local-storage.json', startStorage) };
  let deliveries = [];
  try { deliveries = JSON.parse(startStorage['hub:campaign-delivery:records:v1'] || '[]'); if (!Array.isArray(deliveries)) throw new Error(); }
  catch { issues.push('Não foi possível identificar as entregas para localizar os arquivos de produtos.'); }
  const names = [...new Set(deliveries.map(item => item?.productName).filter(safeName))];
  if (deliveries.some(item => item?.productName && !safeName(item.productName))) issues.push('Uma entrega tem nome de produto inválido para localizar os arquivos.');
  if (root) {
    async function visit(dir, relative, depth) {
      if (depth > 12) throw new Error('Profundidade máxima excedida.');
      for await (const [name, entry] of dir.entries()) {
        abortIfNeeded(signal);
        if (!safeName(name)) { issues.push(`Arquivo ou pasta não incluído: ${relative}/${name}.`); continue; }
        const path = `${relative}/${name}`;
        if (entry.kind === 'directory') await visit(entry, path, depth + 1);
        else if (/\.(?:html?|css|js|mjs|png|jpe?g|webp|svg|ico|gif|woff2?)$/i.test(name)) {
          const file = await entry.getFile(), bytes = new Uint8Array(await file.arrayBuffer());
          const ref = await addBinary(bytes, { mime: file.type, name: file.name });
          fileLinks.push({ caminho_relativo: path, ...ref });
          fileChecks.push({ entry, path, hash: ref.sha256 });
          const after = await entry.getFile();
          if (file.size !== after.size || file.lastModified !== after.lastModified) issues.push(`Arquivo alterado durante a leitura: ${path}.`);
        } else issues.push(`Tipo de arquivo não incluído: ${path}.`);
      }
    }
    for (const name of names) {
      abortIfNeeded(signal); onProgress(`Lendo arquivos de ${name}…`);
      try { const product = await root.getDirectoryHandle(name); let pages = 0; for await (const [page, entry] of product.entries()) if (entry.kind === 'directory' && /^pag\d+$/i.test(page)) { pages++; await visit(entry, `${name}/${page}`, 0); } if (!pages) issues.push(`Nenhuma pasta de página foi encontrada para ${name}.`); }
      catch (error) { if (error.name === 'AbortError') throw error; issues.push(`Pasta do produto ${name} não pôde ser lida.`); }
    }
  }
  sources.arquivos_produtos = { status: root ? (issues.length ? 'parcial' : 'presente') : 'nao_incluido_por_escopo', products: names.length, files: fileLinks.length, file: await addJson('dados/arquivos-produtos.json', fileLinks) };
  if (JSON.stringify(startStorage) !== JSON.stringify(readAllowedStorage(storage))) issues.push('Dados do fluxo mudaram durante a exportação; refaça a captura com o Hub sem alterações.');
  for (const [name, stores] of Object.entries(DATABASES)) {
    abortIfNeeded(signal); onProgress(`Verificando alterações em ${name}…`);
    if (!fingerprints[name]) continue;
    try {
      const after = await readMigrationDatabase(indexedDB, name, stores);
      if (await fingerprint(after) !== fingerprints[name]) issues.push(`O banco ${name} mudou durante a exportação; refaça a captura com o Hub sem alterações.`);
    } catch { issues.push(`Não foi possível verificar a estabilidade de ${name}.`); }
  }
  for (const item of fileChecks) {
    abortIfNeeded(signal);
    try {
      const current = await item.entry.getFile();
      if (await digest(new Uint8Array(await current.arrayBuffer())) !== item.hash) issues.push(`Arquivo mudou durante a exportação: ${item.path}.`);
    } catch { issues.push(`Não foi possível verificar novamente o arquivo: ${item.path}.`); }
  }
  if (JSON.stringify(startStorage) !== JSON.stringify(readAllowedStorage(storage))) issues.push('Dados do fluxo mudaram durante a verificação final; refaça a captura com o Hub sem alterações.');
  issues.push('A consistência entre as fontes não pode ser garantida durante alterações simultâneas.');
  issues.push('LocalStorage é incluído por lista selecionada; outras chaves, credenciais e permissões de pasta não fazem parte deste pacote.');
  const manifest = { format: 'hub-migracao-fase1', version: 2, created_at_utc: new Date().toISOString(), hub_version: version, estado: 'parcial', fontes: sources, arquivos: binaryManifest, pendencias: issues };
  files.push({ name: 'manifesto.json', bytes: utf8.encode(JSON.stringify(manifest, null, 2)) });
  onProgress('Preparando ZIP…');
  return { blob: buildMigrationZip(files), manifest };
}
