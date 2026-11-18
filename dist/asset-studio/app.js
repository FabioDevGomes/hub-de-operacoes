const specs = {
  desktop: { name: '01.png', width: 1892, height: 908, brightness: 0.72, colorMask: 0xFC },
  mobile: { name: '02.png', width: 393, height: 852, brightness: 0.72 },
  favicon: { name: '03.png' }
};

const PRODUCT_ROOT_DB = 'hub-asset-studio-settings';
const PRODUCT_ROOT_STORE = 'settings';
const PRODUCT_ROOT_KEY = 'productsRoot';
const ASSET_CAPTURE_CACHE_DB = 'hub-asset-studio-capture-cache';
const ASSET_CAPTURE_CACHE_STORE = 'captures';
const ASSET_CAPTURE_CACHE_KEY = 'current';
const ASSET_DELIVERY_SELECTION_KEY = 'hub:asset-studio:active-campaign-delivery:v1';
const ASSET_CAPTURE_SLOTS = ['desktop', 'mobile', 'favicon'];
const PAGE_ONE_FOLDER = 'pag01';
const PRODUCT_IMAGE_METADATA_DIRECTORY = '.hub';
const PRODUCT_IMAGE_MANIFEST_NAME = 'imagens-produto.json';
const PRODUCT_IMAGE_README_NAME = 'LEIA-ME-imagens-produto.txt';
const PAGE_DIRECTORY_HANDOFF_KEY = 'hub:asset-studio:pending-page-directory:v1';
const PAGE_DIRECTORY_HANDOFF_EVENT = 'hub:asset-studio-page-directory-generated';

const state = { desktop: null, mobile: null, favicon: null, directory: null, productsRoot: null, rootPermission: false, outputDirectory: null, activeSlot: 'desktop', skipFavicon: false, processingAll: false, assetCaptureRunning: false, deliveryContextLoading: false, campaignDeliveryStore: null, assetStudioHandoffDomain: null, campaignDeliveries: [], activeCampaignDeliveryId: '', activeCampaignDelivery: null, captureSessionActive: false, assetCaptureCacheRevision: 0, mobileDimensionRevision: 0, productImageCandidates: [], productImages: [], productImageFailures: [], productImageGalleryMeta: {}, productImagesSavedSelectionKey: '', productImagesSavedRoot: null, productImagesSavedNames: [] };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let assetCaptureCacheWriteQueue = Promise.resolve();
const mobileDimensionRulesPromise = import('./mobile-dimensions.mjs');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function updateReadyState() {
  const productName = $('#productName').value.trim();
  const productNameIsValid = Boolean(productName) && !productFolderNameError(productName);
  const captureButton = $('#capturePageImages');
  if (captureButton) {
    const affiliateUrl = String(state.activeCampaignDelivery?.affiliateUrl || '').trim();
    let hasCaptureUrl = false;
    try {
      const url = new URL(affiliateUrl);
      hasCaptureUrl = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch { }
    captureButton.disabled = state.assetCaptureRunning || state.processingAll || state.deliveryContextLoading || !hasCaptureUrl;
    captureButton.querySelector('span').textContent = state.assetCaptureRunning ? 'Capturando…' : 'Capturar imagens';
  }
  $('#processAll').disabled = state.processingAll || state.assetCaptureRunning || state.deliveryContextLoading || !(state.desktop && state.mobile && (state.favicon || state.skipFavicon) && state.productsRoot && state.rootPermission && productNameIsValid);
  const handoff = getAssetDeliveryHandoff();
  const pageAssetsSaved = handoff.pageAssetsSaved === true;
  $('#processAll').textContent = pageAssetsSaved ? 'Imagens da página salvas ✓' : 'Enviar Imagens';
  $('#processAll').classList.toggle('is-success', pageAssetsSaved);
  const selectedImages = state.productImageCandidates.filter(candidate => candidate.selected).length;
  $('#saveProductImages').disabled = state.processingAll || state.assetCaptureRunning || state.deliveryContextLoading || selectedImages < 1 || !state.productsRoot || !state.rootPermission || !productNameIsValid;
  const selectedImagesSaved = Boolean(selectedImages > 0 && state.productsRoot
    && state.productImagesSavedRoot === state.productsRoot
    && state.productImagesSavedSelectionKey === productImageSelectionKey(state.productImageCandidates.filter(candidate => candidate.selected).slice(0, 2)));
  $('#saveProductImages').textContent = selectedImagesSaved ? 'Imagem(ns) do produto salvas ✓' : selectedImages ? `Salvar ${selectedImages} imagem(ns) agora` : 'Salvar imagens selecionadas';
  $('#saveProductImages').classList.toggle('is-success', selectedImagesSaved);
  const deliveryPicker = $('#assetDeliveryPicker');
  if (deliveryPicker) deliveryPicker.disabled = state.processingAll || state.deliveryContextLoading || state.campaignDeliveries.length === 0;
  renderAssetDeliveryNextStep(handoff);
}

function getAssetDeliveryHandoff(work = state.activeCampaignDelivery?.assetStudioWork) {
  return state.assetStudioHandoffDomain?.assessAssetStudioCampaignHandoff(work, $('#productName').value.trim())
    || { pageAssetsSaved: false, productImagesSaved: false, ready: false };
}

function renderAssetDeliveryNextStep(handoff = getAssetDeliveryHandoff()) {
  const panel = $('#assetDeliveryNextStep');
  if (!panel) return;
  const button = $('#continueToPresell');
  const status = $('#assetDeliveryHandoffStatus');
  const hasDelivery = Boolean(state.activeCampaignDeliveryId && state.activeCampaignDelivery);
  panel.hidden = !hasDelivery;
  button.hidden = !hasDelivery || !handoff.pageAssetsSaved;
  if (!hasDelivery) return;

  const pageLabel = handoff.pageAssetsSaved ? '✓ Desktop e Mobile salvos' : '○ Falta salvar Desktop e Mobile';
  const productLabel = handoff.productImagesSaved ? '✓ Imagem do produto salva' : '○ Imagem do produto não salva (opcional)';
  $('#assetDeliveryChecklist').textContent = `${pageLabel} · ${productLabel}`;
  if (!handoff.pageAssetsSaved) {
    status.textContent = 'Salve Desktop e Mobile para liberar a próxima etapa. Imagens do produto são opcionais e podem ser adicionadas depois.';
    status.dataset.state = 'warning';
  } else if (!handoff.productImagesSaved) {
    status.textContent = 'Desktop e Mobile estão salvos. Imagens do produto são opcionais; você já pode continuar para Ficha e Pre-Sell.';
    status.dataset.state = 'warning';
  } else {
    status.textContent = `Tudo salvo para ${$('#productName').value.trim()}/pag01/assets. Continue para preencher a Ficha e Pre-Sell desta entrega.`;
    status.dataset.state = 'ok';
  }
  panel.dataset.state = status.dataset.state;
}

function productImageSelectionKey(selected) {
  return JSON.stringify({
    productName: $('#productName').value.trim(),
    images: selected.map(({ id, url }) => ({ id, url }))
  });
}

function productImageSelectionInstruction(count) {
  if (count === 1) return 'A imagem selecionada será salva como imagem-produto-01 na pasta Assets ao gerar os arquivos.';
  if (count > 1) return 'As imagens serão salvas como imagem-produto-01 e imagem-produto-02; a ordem na galeria define a numeração.';
  return 'Selecione até duas imagens. A primeira será salva como imagem-produto-01 e a segunda como imagem-produto-02 ao gerar.';
}

function openProductRootDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('Este navegador não permite salvar a pasta padrão.'));
      return;
    }
    const request = window.indexedDB.open(PRODUCT_ROOT_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PRODUCT_ROOT_STORE)) {
        request.result.createObjectStore(PRODUCT_ROOT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir as preferências locais.'));
  });
}

async function loadProductRoot() {
  const database = await openProductRootDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(PRODUCT_ROOT_STORE, 'readonly');
      const request = transaction.objectStore(PRODUCT_ROOT_STORE).get(PRODUCT_ROOT_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Não foi possível recuperar a pasta salva.'));
      transaction.onabort = () => reject(transaction.error || new Error('A leitura da pasta salva foi cancelada.'));
    });
  } finally {
    database.close();
  }
}

async function saveProductRoot(directory) {
  const database = await openProductRootDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(PRODUCT_ROOT_STORE, 'readwrite');
      transaction.objectStore(PRODUCT_ROOT_STORE).put(directory, PRODUCT_ROOT_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Não foi possível salvar a pasta padrão.'));
      transaction.onabort = () => reject(transaction.error || new Error('O salvamento da pasta padrão foi cancelado.'));
    });
  } finally {
    database.close();
  }
}

function openAssetCaptureCacheDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('Este navegador não permite manter o cache local das imagens.'));
      return;
    }
    const request = window.indexedDB.open(ASSET_CAPTURE_CACHE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ASSET_CAPTURE_CACHE_STORE)) {
        request.result.createObjectStore(ASSET_CAPTURE_CACHE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o cache local das imagens.'));
  });
}

function assetCaptureCacheKey() {
  return state.activeCampaignDeliveryId ? `delivery:${state.activeCampaignDeliveryId}` : ASSET_CAPTURE_CACHE_KEY;
}

async function readAssetCaptureCacheRecord(key = assetCaptureCacheKey()) {
  const database = await openAssetCaptureCacheDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(ASSET_CAPTURE_CACHE_STORE, 'readonly');
      const request = transaction.objectStore(ASSET_CAPTURE_CACHE_STORE).get(key);
      let record = null;
      request.onsuccess = () => { record = request.result || null; };
      request.onerror = () => reject(request.error || new Error('Não foi possível ler o cache local das imagens.'));
      transaction.oncomplete = () => resolve(record);
      transaction.onerror = () => reject(transaction.error || new Error('A leitura do cache local falhou.'));
      transaction.onabort = () => reject(transaction.error || new Error('A leitura do cache local foi cancelada.'));
    });
  } finally {
    database.close();
  }
}

async function writeAssetCaptureCacheRecord(record, key = assetCaptureCacheKey()) {
  const database = await openAssetCaptureCacheDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(ASSET_CAPTURE_CACHE_STORE, 'readwrite');
      transaction.objectStore(ASSET_CAPTURE_CACHE_STORE).put(record, key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Não foi possível atualizar o cache local das imagens.'));
      transaction.onabort = () => reject(transaction.error || new Error('A atualização do cache local foi cancelada.'));
    });
  } finally {
    database.close();
  }
}

async function deleteAssetCaptureCacheRecord(key = assetCaptureCacheKey()) {
  const database = await openAssetCaptureCacheDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(ASSET_CAPTURE_CACHE_STORE, 'readwrite');
      transaction.objectStore(ASSET_CAPTURE_CACHE_STORE).delete(key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Não foi possível limpar o cache anterior das imagens.'));
      transaction.onabort = () => reject(transaction.error || new Error('A limpeza do cache anterior foi cancelada.'));
    });
  } finally {
    database.close();
  }
}

function assetCaptureCacheSnapshot() {
  const slots = {};
  for (const slot of ASSET_CAPTURE_SLOTS) {
    const file = state[slot];
    if (!file) continue;
    slots[slot] = {
      blob: new Blob([file], { type: file.type || 'application/octet-stream' }),
      name: String(file.name || `asset-${slot}`),
      type: String(file.type || ''),
      lastModified: Number(file.lastModified) || Date.now()
    };
  }
  const productImageCandidates = state.productImageCandidates.map(({ id, url, alt, width, height, selected }) => ({ id, url, alt, width, height, selected: Boolean(selected) }));
  const selectedCandidateIds = new Set(productImageCandidates.filter(candidate => candidate.selected).map(candidate => candidate.id));
  const productImages = state.productImages.filter(item => selectedCandidateIds.has(item.candidateId)).map(item => ({
    candidateId: item.candidateId,
    blob: new Blob([item.file], { type: item.file.type || 'application/octet-stream' }),
    name: String(item.file.name || 'imagem-produto'),
    type: String(item.file.type || ''),
    lastModified: Number(item.file.lastModified) || Date.now()
  }));
  return {
    schema: 'hub_asset_studio_capture_cache_v2',
    campaignDeliveryId: state.activeCampaignDeliveryId,
    captureSessionActive: Boolean(state.captureSessionActive),
    skipFavicon: Boolean(state.skipFavicon),
    slots,
    productImageGallery: {
      candidates: productImageCandidates,
      totalCandidates: Number(state.productImageGalleryMeta.totalCandidates) || productImageCandidates.length,
      sourceTitle: String(state.productImageGalleryMeta.sourceTitle || ''),
      sourceUrl: String(state.productImageGalleryMeta.sourceUrl || ''),
      unavailableOrigins: Array.isArray(state.productImageGalleryMeta.unavailableOrigins) ? [...state.productImageGalleryMeta.unavailableOrigins] : []
    },
    productImages,
    productImagesSavedSelectionKey: state.productImagesSavedSelectionKey,
    productImagesSavedNames: [...state.productImagesSavedNames]
  };
}

function persistAssetCaptureCache({ clearFirst = false } = {}) {
  const record = assetCaptureCacheSnapshot();
  const key = assetCaptureCacheKey();
  const write = async () => {
    if (clearFirst) await deleteAssetCaptureCacheRecord(key);
    await writeAssetCaptureCacheRecord(record, key);
  };
  const operation = assetCaptureCacheWriteQueue.then(write, write);
  assetCaptureCacheWriteQueue = operation.catch(() => {});
  return operation;
}

async function persistAssetCaptureCacheSafely() {
  try {
    await persistAssetCaptureCache();
    return true;
  } catch (error) {
    setAssetCaptureCacheStatus(`Não foi possível salvar as imagens no cache local: ${error.message}`);
    return false;
  }
}

function productFolderNameError(value) {
  const name = String(value || '').trim();
  if (!name) return 'Informe o nome do produto.';
  const invalidCharacter = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'].some(character => name.includes(character));
  const reservedName = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(name);
  if (invalidCharacter || /[\u0000-\u001F]/.test(name) || /[. ]$/.test(name) || name === '.' || name === '..' || reservedName) {
    return 'Use um nome válido para uma pasta do Windows.';
  }
  return '';
}

function renderProductDestination(message = '') {
  const root = state.productsRoot;
  const productName = $('#productName').value.trim();
  const nameError = productName ? productFolderNameError(productName) : '';
  const hint = $('#productNameHint');
  if (nameError) {
    $('#productName').setAttribute('aria-invalid', 'true');
    hint.textContent = nameError;
    hint.classList.add('error');
  } else {
    $('#productName').removeAttribute('aria-invalid');
    hint.classList.remove('error');
    hint.textContent = productName
      ? 'Destino: ' + productName + '/' + PAGE_ONE_FOLDER + '/assets. As demais páginas ficam na tela de criação da Pre-Sell.'
      : 'Informe o produto. O Hub criará ' + PAGE_ONE_FOLDER + '/assets dentro dele ao gerar os arquivos.';
  }

  $('#folderName').textContent = root ? 'Pasta de produtos: ' + root.name : 'Nenhuma pasta de produtos selecionada';
  $('#chooseFolder').textContent = root ? 'Alterar pasta padrão' : 'Selecionar pasta de produtos';
  $('#authorizeFolder').hidden = !root || state.rootPermission;
  if (message) {
    $('#folderHelp').textContent = message;
  } else if (!root) {
    $('#folderHelp').textContent = 'Selecione a pasta raiz uma vez; a escolha será lembrada neste navegador.';
  } else if (!state.rootPermission) {
    $('#folderHelp').textContent = 'A pasta está salva. Autorize o acesso para continuar.';
  } else {
    $('#folderHelp').textContent = 'Pasta raiz disponível neste navegador · destino em ' + (productName || '<produto>') + '/' + PAGE_ONE_FOLDER + '/assets.';
  }
  updateReadyState();
}

async function hasWritePermission(directory) {
  if (typeof directory.queryPermission !== 'function') return true;
  return await directory.queryPermission({ mode: 'readwrite' }) === 'granted';
}

async function restoreProductRoot() {
  try {
    const directory = await loadProductRoot();
    if (!directory) return;
    state.productsRoot = directory;
    state.directory = directory;
    state.rootPermission = await hasWritePermission(directory);
    state.productImagesSavedRoot = state.productImagesSavedSelectionKey ? directory : null;
    renderProductDestination();
  } catch (error) {
    $('#folderHelp').textContent = 'Não foi possível recuperar a pasta padrão: ' + error.message;
  }
}

function setAssetCaptureCacheStatus(message) {
  const status = $('#assetCaptureCacheStatus');
  if (status) status.textContent = message;
}

function assetDeliveryStatusLabel(status) {
  return ({ draft: 'Rascunho local', processing: 'Envio em andamento', completed: 'Assets gerados', completed_with_warnings: 'Concluído com avisos', failed: 'Envio com falha', interrupted: 'Envio interrompido' })[status] || 'Ainda sem envio';
}

function readResultRows(selector) {
  return [...$(selector).children].map(row => ({
    text: row.textContent || '',
    status: row.classList.contains('error') ? 'error' : row.classList.contains('ok') ? 'ok' : row.classList.contains('warning') ? 'warning' : ''
  })).filter(row => row.text.trim());
}

function persistCampaignDeliveryAssetStudioWork(status, { startedAtUtc = '', completedAtUtc = '' } = {}) {
  if (!state.campaignDeliveryStore || !state.activeCampaignDeliveryId) return null;
  const previous = state.activeCampaignDelivery?.assetStudioWork || {};
  const selected = state.productImageCandidates.filter(candidate => candidate.selected).slice(0, 2);
  const productImagesById = new Map(state.productImages.map(item => [item.candidateId, item]));
  const selectedImagesWereSaved = selected.length > 0 && state.productImagesSavedSelectionKey === productImageSelectionKey(selected);
  const selectedProductImages = selected.map((candidate, index) => ({
    id: candidate.id,
    alt: candidate.alt,
    width: candidate.width,
    height: candidate.height,
    fileName: selectedImagesWereSaved ? state.productImagesSavedNames[index] || '' : '',
    sizeBytes: productImagesById.get(candidate.id)?.file?.size || 0
  }));
  try {
    const nextStatus = status || previous.status || 'draft';
    const results = readResultRows('#results');
    const completedThisRun = Boolean(completedAtUtc) && ['completed', 'completed_with_warnings'].includes(nextStatus);
    const pageAssetsSavedThisRun = ['01.png', '02.png'].every(fileName => results.some(row => row.text.includes(`pag01/assets/${fileName}`) && (row.status === 'ok' || /preservado\s*[—-]\s*substituição cancelada/i.test(row.text))));
    const previousPageAssetsProductName = previous.pageAssetsProductName || (
      ['completed', 'completed_with_warnings'].includes(previous.status)
      && ['01.png', '02.png'].every(fileName => (previous.results || []).some(row =>
        row.text?.includes(`pag01/assets/${fileName}`)
        && (row.status === 'ok' || /preservado\s*[—-]\s*substituição cancelada/i.test(row.text))
      )) ? previous.productName : ''
    );
    const legacySavedFiles = (previous.selectedProductImages || []).map(image => image?.fileName).filter(fileName => /^imagem-produto-0[12]\.(?:png|jpg)$/i.test(String(fileName || '')));
    const previousProductImageFiles = Array.isArray(previous.productImageFiles) ? previous.productImageFiles : legacySavedFiles;
    const previousProductImagesProductName = previous.productImagesProductName || (previousProductImageFiles.length ? previous.productName : '');
    const updated = state.campaignDeliveryStore.updateCampaignDeliveryAssetStudioWork(state.activeCampaignDeliveryId, {
      status: nextStatus,
      productName: $('#productName').value.trim(),
      startedAtUtc: startedAtUtc || previous.startedAtUtc || '',
      completedAtUtc,
      results,
      skipFavicon: state.skipFavicon,
      productImageResults: readResultRows('#productImageResults'),
      productImageStatus: $('#productImageStatus').textContent,
      selectedProductImages,
      pageAssetsProductName: completedThisRun && pageAssetsSavedThisRun ? $('#productName').value.trim() : previousPageAssetsProductName,
      productImagesProductName: selectedImagesWereSaved ? $('#productName').value.trim() : previousProductImagesProductName,
      productImageFiles: selectedImagesWereSaved ? state.productImagesSavedNames : previousProductImageFiles
    });
    state.activeCampaignDelivery = updated;
    state.campaignDeliveries = state.campaignDeliveries.map(delivery => delivery.id === updated.id ? updated : delivery);
    renderAssetDeliveryPicker();
    renderAssetDeliveryStatus(updated?.assetStudioWork);
    renderAssetDeliveryNextStep(getAssetDeliveryHandoff(updated?.assetStudioWork));
    return updated;
  } catch (error) {
    const statusNode = $('#assetDeliveryStatus');
    statusNode.textContent = 'Não foi possível salvar o andamento nesta entrega: ' + error.message;
    statusNode.dataset.state = 'warning';
    return null;
  }
}

function renderAssetDeliveryStatus(work = state.activeCampaignDelivery?.assetStudioWork) {
  const statusNode = $('#assetDeliveryStatus');
  if (!state.activeCampaignDeliveryId) {
    statusNode.textContent = state.campaignDeliveries.length
      ? 'Selecione uma entrega para manter o produto, a imagem escolhida e as confirmações associados a ela.'
      : 'Nenhuma entrega salva. Você pode continuar no modo local, mas as confirmações não serão vinculadas a uma entrega.';
    statusNode.dataset.state = state.campaignDeliveries.length ? 'warning' : '';
    return;
  }
  const label = assetDeliveryStatusLabel(work?.status);
  const updated = work?.updatedAtUtc && Number.isFinite(Date.parse(work.updatedAtUtc))
    ? ' · atualizado em ' + new Date(work.updatedAtUtc).toLocaleString('pt-BR')
    : '';
  const selectedCount = Array.isArray(work?.selectedProductImages) ? work.selectedProductImages.length : 0;
  statusNode.textContent = `${label}${updated}${selectedCount ? ` · ${selectedCount} imagem(ns) de produto vinculada(s)` : ''}. O andamento e as confirmações ficam salvos nesta entrega.`;
  statusNode.dataset.state = ['completed', 'completed_with_warnings'].includes(work?.status) ? 'ok' : work?.status === 'failed' || work?.status === 'interrupted' ? 'warning' : '';
}

function renderAssetDeliveryPicker() {
  const picker = $('#assetDeliveryPicker');
  if (!picker) return;
  picker.replaceChildren();
  picker.add(new Option('Sem entrega selecionada', ''));
  for (const delivery of state.campaignDeliveries) {
    const workStatus = delivery.assetStudioWork?.status;
    const status = workStatus ? ` · ${assetDeliveryStatusLabel(workStatus)}` : '';
    const createdAt = Number.isFinite(Date.parse(delivery.createdAt)) ? new Date(delivery.createdAt).toLocaleString('pt-BR') : 'data indisponível';
    picker.add(new Option(`${delivery.productName || 'Produto'} · ${delivery.offerName || 'Oferta'} · ${createdAt}${status}`, delivery.id));
  }
  picker.value = state.activeCampaignDeliveryId;
  picker.disabled = state.processingAll || state.assetCaptureRunning || state.deliveryContextLoading || state.campaignDeliveries.length === 0;
}

function appendStoredRows(selector, rows) {
  const container = $(selector);
  container.replaceChildren();
  for (const item of Array.isArray(rows) ? rows : []) {
    const row = document.createElement('div');
    const status = ['ok', 'error', 'warning'].includes(item?.status) ? item.status : '';
    row.className = `result ${status}`;
    row.textContent = String(item?.text || '');
    if (row.textContent) container.appendChild(row);
  }
}

function renderAssetDeliveryWork(delivery) {
  const work = delivery?.assetStudioWork || null;
  appendStoredRows('#results', work?.results);
  appendStoredRows('#productImageResults', work?.productImageResults);
  $('#productImageStatus').textContent = String(work?.productImageStatus || '');
  renderAssetDeliveryStatus(work);
}

function renderAffiliateLink(delivery = state.activeCampaignDelivery) {
  const link = $('#assetAffiliateLink');
  if (!link) return;
  const value = String(delivery?.affiliateUrl || '').trim();
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('URL inválida');
    link.href = url.href;
    link.hidden = false;
  } catch {
    link.removeAttribute('href');
    link.hidden = true;
  }
}

function updateAssetStudioDeliveryUrl(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('campaign_delivery_id', id);
  else url.searchParams.delete('campaign_delivery_id');
  history.replaceState(null, '', url);
}

async function activateAssetStudioDelivery(id, { updateUrl = true } = {}) {
  const deliveryId = String(id || '');
  const delivery = state.campaignDeliveries.find(item => item.id === deliveryId) || null;
  if (deliveryId && !delivery) {
    $('#assetDeliveryStatus').textContent = 'A entrega indicada não está mais salva neste navegador. Escolha uma entrega válida para associar os próximos resultados.';
    $('#assetDeliveryStatus').dataset.state = 'warning';
    return;
  }
  state.deliveryContextLoading = true;
  state.assetCaptureCacheRevision++;
  state.activeCampaignDeliveryId = delivery?.id || '';
  state.activeCampaignDelivery = delivery;
  renderAffiliateLink(delivery);
  try {
    if (delivery?.id) localStorage.setItem(ASSET_DELIVERY_SELECTION_KEY, delivery.id);
    else localStorage.removeItem(ASSET_DELIVERY_SELECTION_KEY);
  } catch { }
  if (updateUrl) updateAssetStudioDeliveryUrl(state.activeCampaignDeliveryId);
  renderAssetDeliveryPicker();
  $('#results').replaceChildren();
  $('#productImageResults').replaceChildren();
  $('#productImageStatus').textContent = '';
  $('#productImageCards').replaceChildren();
  $('#productImageGallery').hidden = true;
  $('#productImageEmpty').hidden = false;
  $('#productImageScanSummary').textContent = 'Nenhuma imagem carregada';
  $('#productImageSource').textContent = '';
  state.productImageCandidates = [];
  state.productImages = [];
  state.productImageFailures = [];
  state.productImageGalleryMeta = {};
  state.productImagesSavedSelectionKey = '';
  state.productImagesSavedRoot = null;
  state.productImagesSavedNames = [];
  state.captureSessionActive = false;
  state.outputDirectory = null;
  state.skipFavicon = delivery?.assetStudioWork?.skipFavicon === true;
  renderFaviconChoiceState();
  $('#openFolder').hidden = true;
  for (const slot of ASSET_CAPTURE_SLOTS) {
    state[slot] = null;
    renderEmptyAssetSlot(slot);
  }
  state.activeSlot = 'desktop';
  markActive(state.activeSlot);
  renderAssetDeliveryWork(delivery);
  const productName = delivery?.assetStudioWork?.productName || delivery?.productName || '';
  if ($('#productName').value !== productName) {
    $('#productName').value = productName;
    $('#productName').dispatchEvent(new Event('input', { bubbles: true }));
  }
  updateReadyState();
  await restoreAssetCaptureCache();
  renderAssetDeliveryWork(state.activeCampaignDelivery || delivery);
  persistCampaignDeliveryAssetStudioWork();
  if (delivery?.assetStudioWork?.status === 'processing') {
    const interrupted = persistCampaignDeliveryAssetStudioWork('interrupted', { completedAtUtc: new Date().toISOString() });
    renderAssetDeliveryWork(interrupted || delivery);
    renderAssetDeliveryStatus(interrupted?.assetStudioWork || delivery.assetStudioWork);
  } else if (delivery) {
    renderAssetDeliveryStatus(state.activeCampaignDelivery?.assetStudioWork);
  }
  state.deliveryContextLoading = false;
  renderAssetDeliveryPicker();
  updateReadyState();
}

async function initializeAssetStudioDeliveries() {
  state.deliveryContextLoading = true;
  updateReadyState();
  try {
    const [deliveryStore, handoffDomain] = await Promise.all([
      import('../campaign-delivery/delivery-store.mjs?v=17'),
      import('./handoff-domain.mjs?v=1')
    ]);
    state.campaignDeliveryStore = deliveryStore;
    state.assetStudioHandoffDomain = handoffDomain;
    state.campaignDeliveries = state.campaignDeliveryStore.listCampaignDeliveries();
    const queryId = new URLSearchParams(location.search).get('campaign_delivery_id') || '';
    let savedId = '';
    try { savedId = localStorage.getItem(ASSET_DELIVERY_SELECTION_KEY) || ''; } catch { }
    const queryMatches = state.campaignDeliveries.some(item => item.id === queryId);
    const savedMatches = state.campaignDeliveries.some(item => item.id === savedId);
    renderAssetDeliveryPicker();
    if (queryId && !queryMatches) {
      await activateAssetStudioDelivery('', { updateUrl: false });
      $('#assetDeliveryStatus').textContent = 'A entrega deste link não foi encontrada no armazenamento local. Escolha uma entrega salva para manter o andamento separado.';
      $('#assetDeliveryStatus').dataset.state = 'warning';
      return;
    }
    const selectedId = queryMatches ? queryId : savedMatches ? savedId : state.campaignDeliveries[0]?.id || '';
    await activateAssetStudioDelivery(selectedId, { updateUrl: !queryId && Boolean(selectedId) });
  } catch (error) {
    state.deliveryContextLoading = false;
    renderAssetDeliveryPicker();
    $('#assetDeliveryStatus').textContent = 'Não foi possível carregar as entregas salvas: ' + error.message;
    $('#assetDeliveryStatus').dataset.state = 'warning';
    await restoreAssetCaptureCache();
    updateReadyState();
  }
}

function renderEmptyAssetSlot(slot) {
  const preview = $(`[data-preview="${slot}"]`);
  const zone = $(`[data-pick="${slot}"]`);
  preview.removeAttribute('src');
  zone.classList.remove('has-image');
  const messages = {
    desktop: 'Nenhuma imagem selecionada',
    mobile: 'Nenhuma imagem selecionada',
    favicon: 'Nenhum favicon selecionado. As dimensões e o fundo originais serão preservados.'
  };
  const metadata = $(`[data-meta="${slot}"]`);
  metadata.textContent = messages[slot];
  metadata.classList.remove('error');
  if (slot === 'mobile') {
    state.mobileDimensionRevision++;
    renderMobileDimensionWarning('');
  }
}

function renderMobileDimensionWarning(message) {
  const warning = $('[data-mobile-dimension-warning]');
  if (!warning) return;
  warning.textContent = message;
  warning.hidden = !message;
}

async function inspectMobileDimensions(file) {
  const revision = ++state.mobileDimensionRevision;
  try {
    const decoded = await blobToImage(file);
    let compatible;
    const { width, height } = decoded;
    try {
      const { isMobileDimensionsCompatible } = await mobileDimensionRulesPromise;
      compatible = isMobileDimensionsCompatible(width, height, specs.mobile);
    } finally {
      decoded.close();
    }
    if (state.mobile !== file || revision !== state.mobileDimensionRevision) return;
    renderMobileDimensionWarning(compatible
      ? ''
      : `Dimensões fora do formato Mobile: ${width} × ${height}. Referência ${specs.mobile.width} × ${specs.mobile.height}; tolerância de 10% após compensar a escala uniforme da captura.`);
  } catch {
    if (state.mobile === file && revision === state.mobileDimensionRevision) {
      renderMobileDimensionWarning('Não foi possível validar as dimensões desta imagem Mobile. Confira o arquivo antes de enviar.');
    }
  }
}

function renderFaviconChoiceState(message = '') {
  const checkbox = $('#skipFavicon');
  if (checkbox) checkbox.checked = Boolean(state.skipFavicon);
  $('[data-slot="favicon"]').classList.toggle('disabled', Boolean(state.skipFavicon));
  if (state.favicon) return;
  const metadata = $('#faviconMessage');
  if (!metadata) return;
  metadata.textContent = message || (state.skipFavicon
    ? state.activeCampaignDeliveryId
      ? 'Sem favicon salvo nesta entrega. A Ficha aceitará a ausência de assets/03.png.'
      : 'Sem favicon selecionado. A Pre-Sell será gerada sem assets/03.png.'
    : 'Sem favicon desmarcado. A Pre-Sell exigirá assets/03.png.');
  metadata.classList.remove('error');
}

function renderAssetSlotImage(slot, file, { cacheStatus = '', label = '' } = {}) {
  const preview = $(`[data-preview="${slot}"]`);
  const zone = $(`[data-pick="${slot}"]`);
  const url = URL.createObjectURL(file);
  preview.onload = () => URL.revokeObjectURL(url);
  preview.onerror = () => URL.revokeObjectURL(url);
  preview.src = url;
  zone.classList.add('has-image');
  const metadata = $(`[data-meta="${slot}"]`);
  metadata.textContent = `${label || file.name || (slot === 'favicon' ? 'Favicon selecionado' : 'Imagem colada')} · ${formatBytes(file.size || 0)}${cacheStatus ? ` · ${cacheStatus}` : ''}`;
  metadata.classList.toggle('error', cacheStatus === 'cache não salvo');
}

async function restoreAssetCaptureCache() {
  const revision = state.assetCaptureCacheRevision;
  try {
    const key = assetCaptureCacheKey();
    let record = await readAssetCaptureCacheRecord(key);
    if (!record && state.activeCampaignDeliveryId) {
      const migrationKey = 'legacy-current-assigned-to-delivery';
      const migration = await readAssetCaptureCacheRecord(migrationKey);
      if (!migration) {
        const legacy = await readAssetCaptureCacheRecord(ASSET_CAPTURE_CACHE_KEY);
        if (legacy?.schema === 'hub_asset_studio_capture_cache_v1' || legacy?.schema === 'hub_asset_studio_capture_cache_v2') {
          record = { ...legacy, schema: 'hub_asset_studio_capture_cache_v2', campaignDeliveryId: state.activeCampaignDeliveryId };
          await writeAssetCaptureCacheRecord(record, key);
          await writeAssetCaptureCacheRecord({ schema: 'hub_asset_studio_capture_cache_migration_v1', campaignDeliveryId: state.activeCampaignDeliveryId }, migrationKey);
        }
      }
    }
    if (revision !== state.assetCaptureCacheRevision || !['hub_asset_studio_capture_cache_v1', 'hub_asset_studio_capture_cache_v2'].includes(record?.schema)) return;
    state.captureSessionActive = Boolean(record.captureSessionActive);
    const deliveryFaviconChoice = state.activeCampaignDelivery?.assetStudioWork?.skipFavicon;
    if (typeof deliveryFaviconChoice !== 'boolean' && typeof record.skipFavicon === 'boolean') state.skipFavicon = record.skipFavicon;
    renderFaviconChoiceState();
    let restoredCount = 0;
    for (const slot of ASSET_CAPTURE_SLOTS) {
      if (state[slot]) continue;
      const cached = record.slots?.[slot];
      if (!(cached?.blob instanceof Blob) || !String(cached.type || cached.blob.type || '').startsWith('image/')) continue;
      const file = new File([cached.blob], String(cached.name || `asset-${slot}`), {
        type: String(cached.type || cached.blob.type),
        lastModified: Number(cached.lastModified) || Date.now()
      });
      state[slot] = file;
      renderAssetSlotImage(slot, file, { cacheStatus: 'recuperada do cache' });
      if (slot === 'mobile') void inspectMobileDimensions(file);
      restoredCount++;
    }
    let restoredProductImages = 0;
    const gallery = record.productImageGallery;
    if (Array.isArray(gallery?.candidates) && gallery.candidates.length) {
      const selectedIds = gallery.candidates.filter(candidate => candidate?.selected).map(candidate => String(candidate.id || ''));
      renderProductImageCandidates({ ...gallery, selectedIds });
      const candidateIds = new Set(state.productImageCandidates.filter(candidate => candidate.selected).map(candidate => candidate.id));
      state.productImages = (Array.isArray(record.productImages) ? record.productImages : []).filter(item => candidateIds.has(item?.candidateId) && item?.blob instanceof Blob).map(item => {
        const candidate = state.productImageCandidates.find(entry => entry.id === item.candidateId);
        const type = String(item.type || item.blob.type || 'application/octet-stream');
        return {
          candidateId: item.candidateId,
          file: new File([item.blob], String(item.name || 'imagem-produto'), { type, lastModified: Number(item.lastModified) || Date.now() }),
          width: candidate?.width || 0,
          height: candidate?.height || 0
        };
      });
      restoredProductImages = state.productImageCandidates.filter(candidate => candidate.selected).length;
      state.productImagesSavedSelectionKey = String(record.productImagesSavedSelectionKey || '');
      state.productImagesSavedNames = Array.isArray(record.productImagesSavedNames) ? record.productImagesSavedNames.map(name => String(name || '').slice(0, 120)).filter(Boolean).slice(0, 2) : [];
      state.productImagesSavedRoot = state.productImagesSavedSelectionKey ? state.productsRoot : null;
    }
    if (!restoredCount && !restoredProductImages) return;
    if (restoredCount) {
      state.activeSlot = ASSET_CAPTURE_SLOTS.find(slot => !state[slot]) || 'desktop';
      markActive(state.activeSlot);
    }
    updateReadyState();
    const parts = [];
    if (restoredCount) parts.push(`${restoredCount} imagem(ns) de página`);
    if (restoredProductImages) parts.push(`${restoredProductImages} imagem(ns) de produto escolhida(s)`);
    setAssetCaptureCacheStatus(`${parts.join(' e ')} recuperada(s) do rascunho local desta entrega.`);
  } catch (error) {
    setAssetCaptureCacheStatus(`Não foi possível recuperar as imagens do cache local: ${error.message}`);
  }
}

function hasAssetCaptureImages() {
  return ASSET_CAPTURE_SLOTS.some(slot => Boolean(state[slot]));
}

function prepareAssetCaptureSession(slot) {
  const startsNewCapture = (!state.captureSessionActive && hasAssetCaptureImages())
    || (state.captureSessionActive && Boolean(state[slot]));
  if (startsNewCapture) {
    for (const currentSlot of ASSET_CAPTURE_SLOTS) {
      state[currentSlot] = null;
      renderEmptyAssetSlot(currentSlot);
    }
    setAssetCaptureCacheStatus('Cache anterior da página limpo; nova captura iniciada.');
  }
  state.captureSessionActive = true;
  return startsNewCapture;
}

function setSlot(slot, file) {
  if (!['desktop', 'mobile'].includes(slot) || !file?.type?.startsWith('image/')) return;
  const startsNewCapture = prepareAssetCaptureSession(slot);
  state.assetCaptureCacheRevision++;
  state[slot] = file;
  renderAssetSlotImage(slot, file, { cacheStatus: 'salvando no cache' });
  if (slot === 'mobile') void inspectMobileDimensions(file);
  state.activeSlot = slot === 'desktop' ? 'mobile' : slot;
  markActive(state.activeSlot);
  updateReadyState();
  const revision = state.assetCaptureCacheRevision;
  void persistAssetCaptureCache({ clearFirst: startsNewCapture }).then(() => {
    if (state[slot] === file && revision === state.assetCaptureCacheRevision) {
      renderAssetSlotImage(slot, file, { cacheStatus: 'cache local' });
      setAssetCaptureCacheStatus('Imagem salva no cache local até a próxima captura.');
    }
  }).catch(error => {
    if (state[slot] === file && revision === state.assetCaptureCacheRevision) {
      renderAssetSlotImage(slot, file, { cacheStatus: 'cache não salvo' });
      setAssetCaptureCacheStatus(`Não foi possível salvar esta imagem no cache: ${error.message}`);
    }
  });
}

function markActive(slot) {
  $$('.asset-card').forEach(card => card.classList.toggle('active', card.dataset.slot === slot));
  const labels = { desktop: '01.png · Desktop', mobile: '02.png · Mobile', favicon: '03.png · Favicon' };
  $('#activeTargetText').textContent = labels[slot];
  $$('[data-target]').forEach(button => {
    const active = button.dataset.target === slot;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function clearSlot(slot, { persist = true } = {}) {
  state[slot] = null;
  renderEmptyAssetSlot(slot);
  state.activeSlot = slot;
  markActive(slot);
  updateReadyState();
  state.assetCaptureCacheRevision++;
  if (persist) {
    void persistAssetCaptureCache().then(() => setAssetCaptureCacheStatus('A imagem foi removida do cache local.'))
      .catch(error => setAssetCaptureCacheStatus(`Não foi possível atualizar o cache local: ${error.message}`));
  }
}

function safeProductImageCandidate(candidate) {
  if (!candidate || typeof candidate.id !== 'string' || typeof candidate.url !== 'string') return null;
  let url;
  try { url = new URL(candidate.url); }
  catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  const width = Number(candidate.width);
  const height = Number(candidate.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  return {
    id: candidate.id.slice(0, 80),
    url: url.href,
    alt: String(candidate.alt || '').trim().slice(0, 180),
    width: Math.round(width),
    height: Math.round(height),
    selected: false
  };
}

function renderProductImageCandidates(payload) {
  const previousSelection = state.productImageCandidates.filter(candidate => candidate.selected).map(candidate => candidate.id);
  const selectedIds = new Set(Array.isArray(payload?.selectedIds) ? payload.selectedIds.map(String) : previousSelection);
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates.map(safeProductImageCandidate).filter(Boolean).map(candidate => ({ ...candidate, selected: selectedIds.has(candidate.id) })) : [];
  state.productImageCandidates = candidates;
  state.productImages = [];
  state.productImageFailures = [];
  const selectedNow = candidates.filter(candidate => candidate.selected);
  if (state.productImagesSavedSelectionKey && productImageSelectionKey(selectedNow) !== state.productImagesSavedSelectionKey) {
    state.productImagesSavedSelectionKey = '';
    state.productImagesSavedRoot = null;
    state.productImagesSavedNames = [];
  }
  state.productImageGalleryMeta = {
    totalCandidates: Math.max(candidates.length, Number(payload?.totalCandidates) || 0),
    sourceTitle: String(payload?.sourceTitle || '').trim(),
    sourceUrl: String(payload?.sourceUrl || '').trim(),
    unavailableOrigins: Array.isArray(payload?.unavailableOrigins) ? payload.unavailableOrigins.map(String).slice(0, 30) : []
  };
  $('#productImageResults').replaceChildren();
  $('#productImageCards').replaceChildren();
  $('#productImageGallery').hidden = candidates.length === 0;
  $('#productImageEmpty').hidden = candidates.length > 0;
  if (!candidates.length) {
    $('#productImageStatus').textContent = 'A página não trouxe imagens com tamanho suficiente para exibir.';
    updateReadyState();
    return { ok: false, message: 'A lista recebida não tem imagens compatíveis.' };
  }

  const total = state.productImageGalleryMeta.totalCandidates;
  const sourceTitle = state.productImageGalleryMeta.sourceTitle;
  let sourceHost = '';
  try { sourceHost = new URL(payload.sourceUrl).host; } catch { }
  $('#productImageScanSummary').textContent = total > candidates.length
    ? `${candidates.length} de ${total} imagens encontradas · escolha até duas`
    : `${candidates.length} imagens encontradas · escolha até duas`;
  const permissionNote = state.productImageGalleryMeta.unavailableOrigins.length
    ? ` A extensão ainda não tem acesso a ${state.productImageGalleryMeta.unavailableOrigins.map(origin => { try { return new URL(origin.replace(/\/\*$/, '')).host; } catch { return origin; } }).join(', ')}; as prévias aparecem, mas salvar pode pedir autorização novamente.`
    : '';
  $('#productImageSource').textContent = `${sourceTitle ? sourceTitle + ' · ' : ''}${sourceHost}${permissionNote}`;
  $('#productImageStatus').textContent = productImageSelectionInstruction(candidates.filter(candidate => candidate.selected).length);

  for (const [index, candidate] of candidates.entries()) {
    const card = document.createElement('label');
    card.className = 'product-image-card';
    const head = document.createElement('span');
    head.className = 'product-image-card-head';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = candidate.selected;
    checkbox.setAttribute('aria-label', `Selecionar imagem ${index + 1}`);
    const title = document.createElement('span');
    title.textContent = candidate.alt || `Imagem ${String(index + 1).padStart(2, '0')}`;
    head.append(checkbox, title);

    const preview = document.createElement('img');
    preview.src = candidate.url;
    preview.alt = candidate.alt || `Imagem de produto ${index + 1}`;
    preview.loading = 'lazy';
    preview.referrerPolicy = 'no-referrer';
    preview.onerror = () => {
      preview.removeAttribute('src');
      preview.alt = 'Prévia indisponível';
      card.classList.add('preview-error');
    };

    const metadata = document.createElement('span');
    metadata.className = 'product-image-card-meta';
    metadata.textContent = `${candidate.width} × ${candidate.height}`;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked && state.productImageCandidates.filter(item => item.selected).length >= 2) {
        checkbox.checked = false;
        $('#productImageStatus').textContent = 'Você pode selecionar no máximo duas imagens.';
        return;
      }
      candidate.selected = checkbox.checked;
      card.classList.toggle('selected', candidate.selected);
      $('#productImageStatus').textContent = productImageSelectionInstruction(state.productImageCandidates.filter(item => item.selected).length);
      updateReadyState();
      void persistAssetCaptureCache().catch(error => setAssetCaptureCacheStatus(`Não foi possível salvar a seleção de imagens: ${error.message}`));
      persistCampaignDeliveryAssetStudioWork('draft');
    });
    card.classList.toggle('selected', candidate.selected);
    card.append(head, preview, metadata);
    $('#productImageCards').appendChild(card);
  }
  updateReadyState();
  return { ok: true, count: candidates.length };
}

window.setProductImageCandidates = payload => {
  const result = renderProductImageCandidates(payload);
  void persistAssetCaptureCache().catch(error => setAssetCaptureCacheStatus(`Não foi possível salvar a galeria localmente: ${error.message}`));
  persistCampaignDeliveryAssetStudioWork();
  return result;
};

function fileFromProductImageData(file) {
  const match = /^data:(image\/(?:jpeg|png|webp|avif|gif));base64,([a-z0-9+/=]+)$/i.exec(String(file?.dataUrl || ''));
  if (!match) throw new Error('Formato de imagem recebido pela extensão inválido.');
  const binary = atob(match[2]);
  if (!binary.length || binary.length > 10 * 1024 * 1024) throw new Error('A imagem recebida está vazia ou excede 10 MB.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  const mimeType = match[1].toLowerCase();
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' })[mimeType];
  const candidate = state.productImageCandidates.find(item => item.id === file.candidateId);
  if (!candidate) throw new Error('Uma imagem recebida não corresponde mais à galeria atual.');
  return {
    candidateId: candidate.id,
    file: new File([bytes], `origem.${extension}`, { type: mimeType }),
    width: candidate.width,
    height: candidate.height
  };
}

window.setProductImageFiles = payload => {
  if (!payload || !Array.isArray(payload.files) || payload.files.length < 1 || payload.files.length > 2) {
    return { ok: false, message: 'A extensão não enviou uma ou duas imagens selecionadas.' };
  }
  const loaded = [];
  const failures = Array.isArray(payload.failures) ? payload.failures : [];
  for (const item of payload.files) {
    try { loaded.push(fileFromProductImageData(item)); }
    catch (error) { failures.push({ candidateId: String(item?.candidateId || ''), message: error.message }); }
  }
  state.productImages = loaded;
  state.productImageFailures = failures;
  $('#productImageResults').replaceChildren();
  $('#productImageStatus').textContent = loaded.length
    ? `${loaded.length} imagem(ns) carregada(s); preparando a gravação local…`
    : 'Nenhuma imagem pôde ser carregada.';
  if (loaded.length) {
    void persistAssetCaptureCache().catch(error => setAssetCaptureCacheStatus(`Não foi possível salvar as imagens do produto no rascunho local: ${error.message}`));
    persistCampaignDeliveryAssetStudioWork();
  }
  return loaded.length
    ? { ok: true, message: `${loaded.length} imagem(ns) lida(s) para salvar localmente.` }
    : { ok: false, message: 'A extensão não conseguiu carregar nenhuma imagem válida.' };
};

$$('[data-clear]').forEach(button => button.addEventListener('click', () => clearSlot(button.dataset.clear)));

$('#skipFavicon').addEventListener('change', event => {
  state.skipFavicon = event.target.checked;
  renderFaviconChoiceState();
  if (state.skipFavicon && state.activeSlot === 'favicon') {
    state.activeSlot = state.mobile ? 'mobile' : 'desktop';
    markActive(state.activeSlot);
  }
  updateReadyState();
  const updated = persistCampaignDeliveryAssetStudioWork();
  if (state.activeCampaignDeliveryId && !updated) {
    renderFaviconChoiceState('Não foi possível salvar a escolha do favicon nesta entrega. Confira o status da entrega antes de continuar.');
  } else if (state.activeCampaignDeliveryId) {
    renderFaviconChoiceState(state.skipFavicon
      ? 'Escolha salva nesta entrega: a Pre-Sell poderá ser gerada sem assets/03.png.'
      : 'Escolha salva nesta entrega: a Pre-Sell exigirá o arquivo assets/03.png.');
  } else {
    renderFaviconChoiceState('Salvando a escolha do favicon no cache local…');
  }
  void persistAssetCaptureCache().then(() => {
    if (!state.activeCampaignDeliveryId) renderFaviconChoiceState('Escolha salva no cache local deste navegador.');
  }).catch(error => setAssetCaptureCacheStatus(`Não foi possível salvar a escolha do favicon: ${error.message}`));
});

$$('[data-target]').forEach(button => button.addEventListener('click', () => {
  state.activeSlot = button.dataset.target;
  markActive(state.activeSlot);
}));

$$('[data-pick]').forEach(zone => {
  const slot = zone.dataset.pick;
  zone.addEventListener('click', () => {
    state.activeSlot = slot;
    markActive(slot);
    $(`[data-file="${slot}"]`).click();
  });
  zone.addEventListener('dragover', event => { event.preventDefault(); zone.closest('.asset-card').classList.add('active'); });
  zone.addEventListener('dragleave', () => zone.closest('.asset-card').classList.remove('active'));
  zone.addEventListener('drop', event => {
    event.preventDefault();
    zone.closest('.asset-card').classList.remove('active');
    if (slot === 'favicon') setFaviconBlob(event.dataTransfer.files[0], 'Favicon carregado');
    else setSlot(slot, event.dataTransfer.files[0]);
  });
});

$$('[data-file]').forEach(input => input.addEventListener('change', () => {
  if (input.dataset.file === 'favicon') setFaviconBlob(input.files[0], 'Favicon carregado');
  else setSlot(input.dataset.file, input.files[0]);
}));

function svgTextBlob(clipboardData) {
  const text = clipboardData?.getData('image/svg+xml') || clipboardData?.getData('text/plain') || '';
  return /^\s*<svg(?:\s|>)/i.test(text) ? new Blob([text], { type: 'image/svg+xml' }) : null;
}

window.addEventListener('paste', event => {
  const image = [...event.clipboardData.items].find(item => item.type.startsWith('image/'));
  const blob = image?.getAsFile() || (state.activeSlot === 'favicon' ? svgTextBlob(event.clipboardData) : null);
  if (!blob) return;
  event.preventDefault();
  if (state.activeSlot === 'favicon') setFaviconBlob(blob, 'Favicon colado');
  else setSlot(state.activeSlot, blob);
});

async function blobToImage(blob) {
  if (blob.type === 'image/svg+xml' || /\.svg$/i.test(blob.name || '')) {
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.decoding = 'async';
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('Não foi possível interpretar o SVG do favicon.'));
        image.src = url;
      });
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!width || !height) throw new Error('O SVG não possui dimensões válidas.');
      return { image, width, height, close: () => URL.revokeObjectURL(url) };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
  const image = await createImageBitmap(blob);
  return { image, width: image.width, height: image.height, close: () => image.close() };
}

function drawCover(ctx, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

function optimizeColorsBalanced(imageData, colorMask = 0xF8) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] &= colorMask;
    data[i + 1] &= colorMask;
    data[i + 2] &= colorMask;
  }
  return imageData;
}

async function processBackground(file, spec) {
  const decoded = await blobToImage(file);
  const image = decoded.image;
  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.filter = `brightness(${spec.brightness})`;
  drawCover(ctx, image, spec.width, spec.height);
  ctx.filter = 'none';
  const pixels = ctx.getImageData(0, 0, spec.width, spec.height);
  ctx.putImageData(optimizeColorsBalanced(pixels, spec.colorMask), 0, 0);
  decoded.close();
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function processFavicon(blob) {
  const decoded = await blobToImage(blob);
  const { image, width, height } = decoded;
  if (blob.type === 'image/png') {
    decoded.close();
    return { blob, width, height };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  decoded.close();
  const converted = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Não foi possível converter o favicon para PNG.')), 'image/png'));
  return { blob: converted, width, height };
}

async function setFaviconBlob(blob, label = 'Imagem selecionada') {
  if (!blob || (!blob.type?.startsWith('image/') && !/\.svg$/i.test(blob.name || ''))) return;
  $('#faviconMessage').textContent = 'Validando favicon…';
  try {
    const decoded = await blobToImage(blob);
    decoded.close();
  } catch (error) {
    state.favicon = null;
    renderEmptyAssetSlot('favicon');
    $('#faviconMessage').textContent = error.message;
    $('#faviconMessage').className = 'hint error';
    state.assetCaptureCacheRevision++;
    void persistAssetCaptureCache().catch(cacheError => setAssetCaptureCacheStatus(`Não foi possível atualizar o cache local: ${cacheError.message}`));
    updateReadyState();
    return;
  }
  const startsNewCapture = prepareAssetCaptureSession('favicon');
  state.assetCaptureCacheRevision++;
  state.favicon = blob;
  state.skipFavicon = false;
  renderFaviconChoiceState();
  renderAssetSlotImage('favicon', blob, { cacheStatus: 'salvando no cache', label });
  state.activeSlot = 'favicon';
  markActive('favicon');
  updateReadyState();
  persistCampaignDeliveryAssetStudioWork();
  const revision = state.assetCaptureCacheRevision;
  void persistAssetCaptureCache({ clearFirst: startsNewCapture }).then(() => {
    if (state.favicon === blob && revision === state.assetCaptureCacheRevision) {
      renderAssetSlotImage('favicon', blob, { cacheStatus: 'cache local', label });
      setAssetCaptureCacheStatus('Favicon salvo no cache local até a próxima captura.');
    }
  }).catch(cacheError => {
    if (state.favicon === blob && revision === state.assetCaptureCacheRevision) {
      renderAssetSlotImage('favicon', blob, { cacheStatus: 'cache não salvo', label });
      setAssetCaptureCacheStatus(`Não foi possível salvar esta imagem no cache: ${cacheError.message}`);
    }
  });
}

$('#chooseFolder').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    $('#folderHelp').textContent = 'Este navegador não oferece seleção direta de pasta. Use Chrome ou Edge atualizado.';
    return;
  }
  try {
    state.productsRoot = await window.showDirectoryPicker({ mode: 'readwrite' });
    state.productImagesSavedSelectionKey = '';
    state.productImagesSavedRoot = null;
    state.productImagesSavedNames = [];
    state.directory = state.productsRoot;
    state.rootPermission = await hasWritePermission(state.productsRoot);
    state.outputDirectory = null;
    $('#openFolder').hidden = true;
    let message = '';
    try {
      await saveProductRoot(state.productsRoot);
    } catch (error) {
      message = 'A pasta foi selecionada para esta sessão, mas não pôde ser salva como padrão: ' + error.message;
    }
    renderProductDestination(message);
  } catch (error) {
    if (error.name !== 'AbortError') $('#folderHelp').textContent = `Falha ao abrir a pasta: ${error.message}`;
  }
});

$('#authorizeFolder').addEventListener('click', async () => {
  if (!state.productsRoot || typeof state.productsRoot.requestPermission !== 'function') return;
  try {
    state.rootPermission = await state.productsRoot.requestPermission({ mode: 'readwrite' }) === 'granted';
    renderProductDestination(state.rootPermission ? 'Acesso à pasta padrão autorizado.' : 'O navegador não concedeu acesso. Autorize a pasta para gerar os assets.');
  } catch (error) {
    renderProductDestination('Não foi possível autorizar a pasta: ' + error.message);
  }
});

$('#productName').addEventListener('input', () => {
  state.outputDirectory = null;
  $('#openFolder').hidden = true;
  renderProductDestination();
  if (!state.deliveryContextLoading) persistCampaignDeliveryAssetStudioWork();
});

$('#continueToPresell').addEventListener('click', () => {
  const deliveryId = state.activeCampaignDeliveryId;
  if (!deliveryId || !getAssetDeliveryHandoff().ready) return;
  const updated = state.campaignDeliveryStore?.markCampaignDeliveryOpened(deliveryId, 'presell');
  if (!updated) {
    $('#assetDeliveryHandoffStatus').textContent = 'Não foi possível localizar esta entrega salva. Atualize a tela e confira a seleção.';
    $('#assetDeliveryHandoffStatus').dataset.state = 'warning';
    $('#assetDeliveryNextStep').dataset.state = 'warning';
    return;
  }
  const id = encodeURIComponent(deliveryId);
  window.location.assign(`/?view=copy&campaign_delivery_id=${id}`);
});

function requestSelectedProductImages(images) {
  if (document.documentElement.getAttribute('data-hub-tabs-extension') !== 'ready') {
    return Promise.reject(new Error('A extensão Hub 2.0 não está conectada a esta tela. Recarregue a extensão e o Asset Studio.'));
  }
  const requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('A extensão demorou para ler as imagens. Tente novamente pela galeria.'));
    }, 45000);
    const onMessage = event => {
      if (event.source !== window || event.origin !== location.origin) return;
      const message = event.data;
      if (message?.source !== 'hub-2.0-extension' || message.type !== 'PRODUCT_IMAGE_IMPORT_RESULT' || message.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      resolve(message);
    };
    window.addEventListener('message', onMessage);
    window.postMessage({
      source: 'hub-page',
      type: 'IMPORT_SELECTED_PRODUCT_IMAGES',
      requestId,
      images
    }, location.origin);
  });
}

$('#clearProductImageGallery').addEventListener('click', () => {
  state.productImageCandidates = [];
  state.productImages = [];
  state.productImageFailures = [];
  state.productImageGalleryMeta = {};
  state.productImagesSavedSelectionKey = '';
  state.productImagesSavedRoot = null;
  state.productImagesSavedNames = [];
  $('#productImageCards').replaceChildren();
  $('#productImageResults').replaceChildren();
  $('#productImageGallery').hidden = true;
  $('#productImageEmpty').hidden = false;
  $('#productImageStatus').textContent = '';
  updateReadyState();
  void persistAssetCaptureCache().catch(error => setAssetCaptureCacheStatus(`Não foi possível limpar a galeria salva: ${error.message}`));
  persistCampaignDeliveryAssetStudioWork('draft');
});

async function saveSelectedProductImages() {
  const button = $('#saveProductImages');
  const selected = state.productImageCandidates.filter(candidate => candidate.selected).slice(0, 2);
  if (!selected.length) return { ok: true, files: [] };
  if (!state.productsRoot || !state.rootPermission) return { ok: false, error: new Error('Selecione e autorize a pasta raiz de produtos antes de salvar.') };
  const productName = $('#productName').value.trim();
  const nameError = productFolderNameError(productName);
  if (nameError) return { ok: false, error: new Error(nameError) };
  const selectionKey = productImageSelectionKey(selected);

  if (state.productImagesSavedSelectionKey === selectionKey && state.productImagesSavedRoot === state.productsRoot) {
    try {
      const productDirectory = await state.productsRoot.getDirectoryHandle(productName);
      const pageDirectory = await productDirectory.getDirectoryHandle(PAGE_ONE_FOLDER);
      const assetsDirectory = await pageDirectory.getDirectoryHandle('assets');
      const allFilesExist = await Promise.all(state.productImagesSavedNames.map(name => fileExists(assetsDirectory, name)));
      if (state.productImagesSavedNames.length === selected.length && allFilesExist.every(Boolean)) {
        const leftoverMetadata = await migrateLegacyProductImageMetadata(productDirectory, assetsDirectory);
        $('#productImageStatus').textContent = leftoverMetadata.length
          ? `A seleção já está salva. Não foi possível mover estes arquivos auxiliares: ${leftoverMetadata.join(', ')}.`
          : 'A seleção já está salva na pasta Assets; o índice ficou nos dados locais do Hub.';
        persistCampaignDeliveryAssetStudioWork();
        return { ok: true, files: [...state.productImagesSavedNames], alreadySaved: true };
      }
    } catch (error) {
      if (error.name !== 'NotFoundError') {
        if (error.name === 'NotAllowedError') {
          state.rootPermission = false;
          renderProductDestination('A permissão da pasta expirou ou foi revogada. Autorize a pasta salva para continuar.');
        }
        $('#productImageStatus').textContent = error.message;
        return { ok: false, error };
      }
    }
  }

  button.disabled = true;
  button.textContent = 'Lendo imagens da página…';
  $('#productImageStatus').textContent = 'A extensão está lendo as imagens selecionadas sem enviar credenciais da página.';
  $('#productImageResults').replaceChildren();
  try {
    const cachedSelectionAvailable = selected.every(candidate => state.productImages.some(item => item.candidateId === candidate.id && item.file instanceof File));
    if (!cachedSelectionAvailable) {
      const extensionResult = await requestSelectedProductImages(selected.map(({ id, url }) => ({ id, url })));
      if (!extensionResult.ok) throw new Error(extensionResult.message || 'A extensão não conseguiu ler as imagens.');
    } else {
      $('#productImageStatus').textContent = 'Imagem(ns) de produto recuperada(s) do rascunho local; continuando o salvamento.';
    }
    if (!state.productImages.length) throw new Error('A extensão não entregou arquivos válidos para salvar.');
    await persistAssetCaptureCacheSafely();
    for (const failure of state.productImageFailures) {
      const candidate = state.productImageCandidates.find(item => item.id === failure.candidateId);
      appendProductImageResult(`${candidate?.alt || 'Imagem selecionada'}: ${failure.message}`, 'error');
    }

    const readyImages = [];
    for (const item of state.productImages) {
      const selectedIndex = selected.findIndex(candidate => candidate.id === item.candidateId);
      if (selectedIndex < 0) continue;
      const position = selectedIndex + 1;
      try {
        const output = await normalizeProductImage(item.file);
        readyImages.push({ ...output, position, fileName: `imagem-produto-${String(position).padStart(2, '0')}.${output.extension}` });
      } catch (error) {
        const candidate = state.productImageCandidates[selectedIndex];
        appendProductImageResult(`${candidate.alt || `Imagem ${String(position).padStart(2, '0')}`}: ${error.message}`, 'error');
      }
    }
    if (!readyImages.length) throw new Error('Nenhuma imagem passou pela preparação para PNG/JPG de até 5 MB.');

    const productDirectory = await state.productsRoot.getDirectoryHandle(productName, { create: true });
    const pageDirectory = await productDirectory.getDirectoryHandle(PAGE_ONE_FOLDER, { create: true });
    const assetsDirectory = await pageDirectory.getDirectoryHandle('assets', { create: true });
    if (await productImageMetadataExists(productDirectory, assetsDirectory) && !confirm('O índice local das imagens já existe. Deseja substituir a seleção atual?')) {
      throw new Error('Salvamento cancelado; os arquivos existentes foram preservados.');
    }

    const saved = [];
    for (const image of readyImages) {
      try {
        const result = await saveBlob(assetsDirectory, image.fileName, image.blob);
        if (result.skipped) {
          appendProductImageResult(`${image.fileName} preservado; a substituição foi cancelada.`);
          continue;
        }
        saved.push(image);
        appendProductImageResult(`${image.fileName} · ${image.width} × ${image.height} · ${formatBytes(image.blob.size)} · salvo`, 'ok');
      } catch (error) {
        appendProductImageResult(`${image.fileName}: ${error.message}`, 'error');
      }
    }
    if (!saved.length) {
      $('#productImageStatus').textContent = 'Nenhum arquivo novo foi salvo; os arquivos anteriores continuam preservados.';
      persistCampaignDeliveryAssetStudioWork();
      return { ok: false, error: new Error('Nenhuma imagem nova foi salva. Os arquivos anteriores foram preservados.') };
    }

    const manifest = {
      schema: 'hub_product_images_v1',
      generatedAtUtc: new Date().toISOString(),
      uploadStatus: 'local_only',
      uploadedToGoogleAds: false,
      images: saved.map(image => ({
        position: image.position,
        fileName: image.fileName,
        mimeType: image.blob.type,
        width: image.width,
        height: image.height,
        sizeBytes: image.blob.size
      }))
    };
    const metadataDirectory = await productDirectory.getDirectoryHandle(PRODUCT_IMAGE_METADATA_DIRECTORY, { create: true });
    await writeBlob(metadataDirectory, PRODUCT_IMAGE_MANIFEST_NAME, new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json;charset=utf-8' }));
    const leftoverMetadata = await removeLegacyProductImageMetadata(assetsDirectory);
    state.outputDirectory = assetsDirectory;
    $('#openFolder').hidden = false;
    $('#folderHelp').textContent = `${productName}/${PAGE_ONE_FOLDER}/assets · imagens do produto salvas. Clique em “Abrir pasta” para conferir.`;
    $('#productImageStatus').textContent = leftoverMetadata.length
      ? `${saved.length} imagem(ns) salva(s). O índice do Hub ficou fora da página; confira os auxiliares que não puderam ser removidos: ${leftoverMetadata.join(', ')}.`
      : `${saved.length} imagem(ns) salva(s) na pasta Assets. O índice usado pelo Hub ficou fora da página.`;
    if (saved.length !== selected.length) {
      persistCampaignDeliveryAssetStudioWork();
      await persistAssetCaptureCacheSafely();
      return { ok: false, error: new Error('Nem todas as imagens selecionadas foram salvas. Confira os resultados da etapa Imagens do produto.') };
    }
    state.productImagesSavedSelectionKey = selectionKey;
    state.productImagesSavedRoot = state.productsRoot;
    state.productImagesSavedNames = saved.map(image => image.fileName);
    await persistAssetCaptureCacheSafely();
    persistCampaignDeliveryAssetStudioWork();
    return { ok: true, files: [...state.productImagesSavedNames] };
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      state.rootPermission = false;
      renderProductDestination('A permissão da pasta expirou ou foi revogada. Autorize a pasta salva para continuar.');
    }
    $('#productImageStatus').textContent = error.message;
    appendProductImageResult(error.message, 'error');
    return { ok: false, error };
  } finally {
    button.textContent = 'Salvar imagens selecionadas';
    updateReadyState();
  }
}

$('#saveProductImages').addEventListener('click', saveSelectedProductImages);

$('#openFolder').addEventListener('click', async () => {
  if (!state.outputDirectory || !window.showDirectoryPicker) return;
  try {
    // O File System Access API não expõe o caminho local nem permite abrir o Explorer.
    // Reabrimos o seletor nativo já posicionado na pasta de saída para o usuário ver os arquivos.
    await window.showDirectoryPicker({ id: 'asset-studio-output', mode: 'readwrite', startIn: state.outputDirectory });
  } catch (error) {
    if (error.name !== 'AbortError') $('#folderHelp').textContent = `Não foi possível abrir a pasta de saída: ${error.message}`;
  }
});

async function fileExists(directory, name) {
  try { await directory.getFileHandle(name); return true; }
  catch (error) { if (error.name === 'NotFoundError') return false; throw error; }
}

async function productImageMetadataExists(productDirectory, assetsDirectory) {
  if (await fileExists(assetsDirectory, PRODUCT_IMAGE_MANIFEST_NAME)) return true;
  try {
    const metadataDirectory = await productDirectory.getDirectoryHandle(PRODUCT_IMAGE_METADATA_DIRECTORY);
    return await fileExists(metadataDirectory, PRODUCT_IMAGE_MANIFEST_NAME);
  } catch (error) {
    if (error.name === 'NotFoundError') return false;
    throw error;
  }
}

async function removeLegacyProductImageMetadata(assetsDirectory) {
  const leftovers = [];
  const manifestGeneratedByHub = async () => {
    try {
      const handle = await assetsDirectory.getFileHandle(PRODUCT_IMAGE_MANIFEST_NAME);
      const manifest = JSON.parse(await (await handle.getFile()).text());
      return manifest?.schema === 'hub_product_images_v1' && Array.isArray(manifest.images);
    } catch (error) {
      if (error.name === 'NotFoundError' || error instanceof SyntaxError) return false;
      throw error;
    }
  };
  const readmeGeneratedByHub = async () => {
    try {
      const handle = await assetsDirectory.getFileHandle(PRODUCT_IMAGE_README_NAME);
      const text = await (await handle.getFile()).text();
      return text.startsWith('PADRÃO DE IMAGENS DO PRODUTO · HUB ASSET STUDIO\n');
    } catch (error) {
      if (error.name === 'NotFoundError') return false;
      throw error;
    }
  };
  for (const [name, isGenerated] of [
    [PRODUCT_IMAGE_MANIFEST_NAME, manifestGeneratedByHub],
    [PRODUCT_IMAGE_README_NAME, readmeGeneratedByHub]
  ]) {
    try {
      const generated = await isGenerated();
      if (generated) await assetsDirectory.removeEntry(name);
      else if (await fileExists(assetsDirectory, name)) leftovers.push(name);
    } catch {
      if (!leftovers.includes(name)) leftovers.push(name);
    }
  }
  return leftovers;
}

async function migrateLegacyProductImageMetadata(productDirectory, assetsDirectory) {
  const hasLegacyManifest = await fileExists(assetsDirectory, PRODUCT_IMAGE_MANIFEST_NAME);
  let metadataDirectory;
  try { metadataDirectory = await productDirectory.getDirectoryHandle(PRODUCT_IMAGE_METADATA_DIRECTORY); }
  catch (error) { if (error.name !== 'NotFoundError') throw error; }
  const hasCurrentManifest = metadataDirectory
    ? await fileExists(metadataDirectory, PRODUCT_IMAGE_MANIFEST_NAME)
    : false;
  if (hasLegacyManifest && !hasCurrentManifest) {
    const legacyHandle = await assetsDirectory.getFileHandle(PRODUCT_IMAGE_MANIFEST_NAME);
    const legacyFile = await legacyHandle.getFile();
    let legacyManifest;
    try { legacyManifest = JSON.parse(await legacyFile.text()); }
    catch { legacyManifest = null; }
    if (legacyManifest?.schema === 'hub_product_images_v1' && Array.isArray(legacyManifest.images)) {
      metadataDirectory ||= await productDirectory.getDirectoryHandle(PRODUCT_IMAGE_METADATA_DIRECTORY, { create: true });
      await writeBlob(metadataDirectory, PRODUCT_IMAGE_MANIFEST_NAME, legacyFile);
    }
  }
  return removeLegacyProductImageMetadata(assetsDirectory);
}

async function saveBlob(directory, name, blob) {
  if (await fileExists(directory, name) && !confirm(`${name} já existe. Deseja substituir somente esse arquivo?`)) {
    return { skipped: true };
  }
  await writeBlob(directory, name, blob);
  return { skipped: false };
}

async function writeBlob(directory, name, blob) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function appendProductImageResult(text, status = '') {
  const row = document.createElement('div');
  row.className = `result ${status}`;
  row.textContent = text;
  $('#productImageResults').appendChild(row);
  persistCampaignDeliveryAssetStudioWork(state.processingAll ? 'processing' : undefined);
}

async function normalizeProductImage(file) {
  if (!file?.type || !['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(file.type)) {
    throw new Error('Formato recebido não pode ser convertido para PNG/JPG.');
  }
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('O navegador não conseguiu decodificar a imagem.'); }
  try {
    const width = bitmap.width;
    const height = bitmap.height;
    if (!width || !height || width * height > 50000000) throw new Error('A imagem excede o limite local de 50 megapixels.');
    const outputMime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const maxBytes = 5 * 1024 * 1024;
    const scale = Math.min(1, 3000 / Math.max(width, height));
    const sizes = scale < 1 ? [{ width, height }, { width: Math.round(width * scale), height: Math.round(height * scale) }] : [{ width, height }];
    for (const size of sizes) {
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d', { alpha: outputMime === 'image/png' });
      if (!context) throw new Error('Não foi possível preparar a imagem no navegador.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      const qualities = outputMime === 'image/jpeg' ? [0.92, 0.86, 0.78, 0.7, 0.62, 0.54] : [undefined];
      for (const quality of qualities) {
        const blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Falha ao converter a imagem.')), outputMime, quality));
        if (blob.size <= maxBytes) {
          const extension = outputMime === 'image/jpeg' ? 'jpg' : 'png';
          return { blob, width: size.width, height: size.height, extension };
        }
      }
    }
    throw new Error('A imagem continua acima de 5 MB após a conversão. Escolha uma versão menor.');
  } finally {
    bitmap.close();
  }
}

function addResult(text, status = '') {
  const row = document.createElement('div');
  row.className = `result ${status}`;
  row.textContent = text;
  $('#results').appendChild(row);
  persistCampaignDeliveryAssetStudioWork(state.processingAll ? 'processing' : undefined);
}

async function notifyHubOfGeneratedPage(productName) {
  const response = await fetch('/api/asset-studio/page-directory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productName, rootName: state.productsRoot?.name || '' })
  });
  let result = {};
  try { result = await response.json(); } catch { }
  if (!response.ok || !result.directory) throw new Error(result.error || 'O Hub não confirmou o diretório da página.');
  const handoff = {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    directory: result.directory,
    productName: result.productName || productName,
    pageFolder: result.pageFolder || PAGE_ONE_FOLDER,
    generatedAtUtc: new Date().toISOString()
  };
  localStorage.setItem(PAGE_DIRECTORY_HANDOFF_KEY, JSON.stringify(handoff));
  window.dispatchEvent(new CustomEvent(PAGE_DIRECTORY_HANDOFF_EVENT, { detail: handoff }));
  return handoff;
}

function fileFromCapturePayload(payload, fallbackName, fallbackType = 'image/png') {
  const base64 = String(payload?.data || '');
  if (!base64 || base64.length > 24 * 1024 * 1024) throw new Error(`A imagem ${fallbackName} veio vazia ou excede o limite de captura.`);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], String(payload?.fileName || fallbackName), {
    type: String(payload?.contentType || fallbackType),
    lastModified: Date.now()
  });
}

async function validateCaptureDimensions(file, expected, label) {
  const decoded = await blobToImage(file);
  try {
    let compatible = decoded.width === expected.width && decoded.height === expected.height;
    if (label === 'Mobile') {
      const { isMobileDimensionsCompatible } = await mobileDimensionRulesPromise;
      compatible = isMobileDimensionsCompatible(decoded.width, decoded.height, expected);
    }
    if (!compatible) {
      const detail = label === 'Mobile'
        ? `formato incompatível com ${expected.width} × ${expected.height}, mesmo compensando escala uniforme (tolerância de 10%)`
        : `esperado ${expected.width} × ${expected.height}`;
      throw new Error(`A captura ${label} veio com ${decoded.width} × ${decoded.height}; ${detail}.`);
    }
  } finally {
    decoded.close();
  }
}

async function applyAutomatedPageCapture(payload) {
  const desktop = fileFromCapturePayload(payload?.desktop, '01.png');
  const mobile = fileFromCapturePayload(payload?.mobile, '02.png');
  await validateCaptureDimensions(desktop, specs.desktop, 'Desktop');
  await validateCaptureDimensions(mobile, specs.mobile, 'Mobile');

  let favicon = null;
  let faviconMessage = '';
  if (payload?.favicon?.data) {
    try {
      favicon = fileFromCapturePayload(payload.favicon, '03.png', 'image/x-icon');
      const decoded = await blobToImage(favicon);
      decoded.close();
    } catch (error) {
      favicon = null;
      faviconMessage = `O favicon não pôde ser usado (${error.message}); as capturas Desktop e Mobile estão prontas.`;
    }
  } else {
    faviconMessage = payload?.faviconStatus === 'unavailable'
      ? 'Não foi possível obter o favicon; as capturas Desktop e Mobile estão prontas.'
      : 'Sem favicon encontrado; as capturas Desktop e Mobile estão prontas.';
  }

  state.assetCaptureCacheRevision++;
  state.desktop = desktop;
  state.mobile = mobile;
  state.favicon = favicon;
  state.skipFavicon = !favicon;
  state.captureSessionActive = true;
  state.activeSlot = 'desktop';
  renderAssetSlotImage('desktop', desktop, { label: `Captura automática · ${specs.desktop.width} × ${specs.desktop.height}` });
  renderAssetSlotImage('mobile', mobile, { label: `Captura automática · ${specs.mobile.width} × ${specs.mobile.height}` });
  void inspectMobileDimensions(mobile);
  if (favicon) {
    renderAssetSlotImage('favicon', favicon, { label: 'Favicon capturado automaticamente' });
    renderFaviconChoiceState();
  } else {
    renderEmptyAssetSlot('favicon');
    renderFaviconChoiceState(faviconMessage);
  }
  markActive('desktop');
  updateReadyState();
  persistCampaignDeliveryAssetStudioWork('draft');

  try {
    await persistAssetCaptureCache({ clearFirst: true });
    setAssetCaptureCacheStatus(favicon
      ? 'Capturas carregadas nas prévias e guardadas no cache local. Revise e clique em Enviar Imagens para salvar os arquivos.'
      : `${faviconMessage} Capturas guardadas no cache local; revise e clique em Enviar Imagens para salvar os arquivos.`);
  } catch (error) {
    setAssetCaptureCacheStatus(`As capturas aparecem nas prévias, mas não puderam ser guardadas no cache local: ${error.message}`);
  }
}

$('#capturePageImages').addEventListener('click', async () => {
  const button = $('#capturePageImages');
  const affiliateUrl = String(state.activeCampaignDelivery?.affiliateUrl || '').trim();
  if (button.disabled || !affiliateUrl) return;

  state.assetCaptureRunning = true;
  setAssetCaptureCacheStatus('Abrindo a página em um navegador local isolado e capturando Desktop e Mobile…');
  updateReadyState();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch('/api/asset-studio/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: affiliateUrl }),
      signal: controller.signal
    });
    let result = {};
    try { result = await response.json(); } catch { }
    if (!response.ok) throw new Error(result.error || 'O servidor local não conseguiu capturar a página.');
    await applyAutomatedPageCapture(result);
  } catch (error) {
    const message = error.name === 'AbortError'
      ? 'A captura excedeu o tempo limite. Tente novamente ou use a seleção manual.'
      : error.message || 'Não foi possível capturar a página. Tente novamente ou use a seleção manual.';
    setAssetCaptureCacheStatus(`Falha na captura automática: ${message}`);
  } finally {
    clearTimeout(timeout);
    state.assetCaptureRunning = false;
    updateReadyState();
    renderAssetDeliveryPicker();
  }
});

$('#processAll').addEventListener('click', async () => {
  const button = $('#processAll');
  const deliveryStartedAtUtc = new Date().toISOString();
  state.processingAll = true;
  button.disabled = true;
  button.textContent = 'Enviando imagens…';
  $('#openFolder').hidden = true;
  $('#results').replaceChildren();
  persistCampaignDeliveryAssetStudioWork('processing', { startedAtUtc: deliveryStartedAtUtc, completedAtUtc: '' });
  updateReadyState();
  try {
    const productName = $('#productName').value.trim();
    const nameError = productFolderNameError(productName);
    if (nameError) {
      $('#productName').setAttribute('aria-invalid', 'true');
      $('#productName').focus();
      throw new Error(nameError);
    }
    if (!state.productsRoot || !state.rootPermission) throw new Error('Selecione e autorize a pasta raiz de produtos.');
    const productDirectory = await state.productsRoot.getDirectoryHandle(productName, { create: true });
    const pageDirectory = await productDirectory.getDirectoryHandle(PAGE_ONE_FOLDER, { create: true });
    state.directory = pageDirectory;
    const assetsDirectory = await state.directory.getDirectoryHandle('assets', { create: true });
    const selectedProductImages = state.productImageCandidates.filter(candidate => candidate.selected).slice(0, 2);
    if (selectedProductImages.length) {
      const productImageResult = await saveSelectedProductImages();
      if (!productImageResult?.ok) {
        if (productImageResult?.error?.name === 'NotAllowedError') throw productImageResult.error;
        throw new Error(`A imagem do anúncio não foi salva; a geração foi interrompida. ${productImageResult?.error?.message || ''}`.trim());
      }
      for (const fileName of productImageResult.files || []) {
        const detail = productImageResult.alreadySaved ? 'já estava salva' : 'salva';
        addResult(`${PAGE_ONE_FOLDER}/assets/${fileName} · imagem de produto ${detail}`, productImageResult.alreadySaved ? '' : 'ok');
      }
    }
    const outputs = [
      { spec: specs.desktop, blob: await processBackground(state.desktop, specs.desktop), width: specs.desktop.width, height: specs.desktop.height },
      { spec: specs.mobile, blob: await processBackground(state.mobile, specs.mobile), width: specs.mobile.width, height: specs.mobile.height }
    ];
    if (!state.skipFavicon) outputs.push({ spec: specs.favicon, ...(await processFavicon(state.favicon)) });
    for (const { spec, blob, width, height } of outputs) {
      const result = await saveBlob(assetsDirectory, spec.name, blob);
      if (result.skipped) addResult(`${PAGE_ONE_FOLDER}/assets/${spec.name} preservado — substituição cancelada.`);
      else addResult(`${PAGE_ONE_FOLDER}/assets/${spec.name} · ${width} × ${height} · ${formatBytes(blob.size)} · salvo`, 'ok');
    }
    state.captureSessionActive = false;
    try {
      await persistAssetCaptureCache();
    } catch (error) {
      addResult(`Assets gerados, mas não foi possível atualizar o cache local: ${error.message}`, 'error');
    }
    state.outputDirectory = assetsDirectory;
    $('#openFolder').hidden = false;
    $('#folderHelp').textContent = productName + '/' + PAGE_ONE_FOLDER + '/assets · clique em “Abrir pasta” para abrir o seletor nessa pasta.';
    try {
      const handoff = await notifyHubOfGeneratedPage(productName);
      addResult(`Diretório da Presell atualizado no Hub: ${handoff.directory}`, 'ok');
    } catch (error) {
      addResult(`Assets gerados, mas o Hub não conseguiu preencher o Diretório da Presell: ${error.message}`, 'error');
    }
    const status = [...$('#results').children].some(row => row.classList.contains('error')) ? 'completed_with_warnings' : 'completed';
    persistCampaignDeliveryAssetStudioWork(status, { completedAtUtc: new Date().toISOString() });
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      state.rootPermission = false;
      renderProductDestination('A permissão da pasta expirou ou foi revogada. Autorize a pasta salva para continuar.');
    }
    addResult(`Falha: ${error.message}`, 'error');
    persistCampaignDeliveryAssetStudioWork('failed', { completedAtUtc: new Date().toISOString() });
  } finally {
    state.processingAll = false;
    updateReadyState();
  }
});

markActive('desktop');
$('#assetDeliveryPicker').addEventListener('change', event => {
  void activateAssetStudioDelivery(event.target.value);
});
void restoreProductRoot();
void initializeAssetStudioDeliveries();
