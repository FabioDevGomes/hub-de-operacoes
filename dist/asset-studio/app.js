const specs = {
  desktop: { name: '01.png', width: 1892, height: 908, brightness: 0.72, colorMask: 0xFC },
  mobile: { name: '02.png', width: 373, height: 819, brightness: 0.72 },
  favicon: { name: '03.png' }
};

const PRODUCT_ROOT_DB = 'hub-asset-studio-settings';
const PRODUCT_ROOT_STORE = 'settings';
const PRODUCT_ROOT_KEY = 'productsRoot';
const PAGE_ONE_FOLDER = 'pag01';
const PAGE_DIRECTORY_HANDOFF_KEY = 'hub:asset-studio:pending-page-directory:v1';
const PAGE_DIRECTORY_HANDOFF_EVENT = 'hub:asset-studio-page-directory-generated';

const state = { desktop: null, mobile: null, favicon: null, directory: null, productsRoot: null, rootPermission: false, outputDirectory: null, activeSlot: 'desktop', skipFavicon: false };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function updateReadyState() {
  const productName = $('#productName').value.trim();
  const productNameIsValid = Boolean(productName) && !productFolderNameError(productName);
  $('#processAll').disabled = !(state.desktop && state.mobile && (state.favicon || state.skipFavicon) && state.productsRoot && state.rootPermission && productNameIsValid);
  $('#processAll').textContent = state.skipFavicon ? 'Gerar 01 e 02' : 'Gerar 01, 02 e 03';
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
    renderProductDestination();
  } catch (error) {
    $('#folderHelp').textContent = 'Não foi possível recuperar a pasta padrão: ' + error.message;
  }
}

function setSlot(slot, file) {
  if (!file?.type?.startsWith('image/')) return;
  state[slot] = file;
  const preview = $(`[data-preview="${slot}"]`);
  const zone = $(`[data-pick="${slot}"]`);
  const url = URL.createObjectURL(file);
  preview.onload = () => URL.revokeObjectURL(url);
  preview.src = url;
  zone.classList.add('has-image');
  $(`[data-meta="${slot}"]`).textContent = `${file.name || 'Imagem colada'} · ${formatBytes(file.size)}`;
  state.activeSlot = slot === 'desktop' ? 'mobile' : slot;
  markActive(state.activeSlot);
  updateReadyState();
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

function clearSlot(slot) {
  state[slot] = null;
  const preview = $(`[data-preview="${slot}"]`);
  const zone = $(`[data-pick="${slot}"]`);
  preview.removeAttribute('src');
  zone.classList.remove('has-image');
  const messages = {
    desktop: 'Nenhuma imagem selecionada',
    mobile: 'Nenhuma imagem selecionada',
    favicon: 'Nenhum favicon selecionado. As dimensões e o fundo originais serão preservados.'
  };
  $(`[data-meta="${slot}"]`).textContent = messages[slot];
  state.activeSlot = slot;
  markActive(slot);
  updateReadyState();
}

$$('[data-clear]').forEach(button => button.addEventListener('click', () => clearSlot(button.dataset.clear)));

$('#skipFavicon').addEventListener('change', event => {
  state.skipFavicon = event.target.checked;
  $('[data-slot="favicon"]').classList.toggle('disabled', state.skipFavicon);
  if (state.skipFavicon && state.activeSlot === 'favicon') {
    state.activeSlot = state.mobile ? 'mobile' : 'desktop';
    markActive(state.activeSlot);
  }
  updateReadyState();
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
    $('#faviconMessage').textContent = error.message;
    $('#faviconMessage').className = 'hint error';
    updateReadyState();
    return;
  }
  state.favicon = blob;
  const previewUrl = URL.createObjectURL(blob);
  const preview = $('#faviconPreview');
  preview.onload = () => URL.revokeObjectURL(previewUrl);
  preview.src = previewUrl;
  $('[data-pick="favicon"]').classList.add('has-image');
  $('#faviconMessage').textContent = `${label} · ${formatBytes(blob.size)}`;
  $('#faviconMessage').className = 'hint';
  state.activeSlot = 'favicon';
  markActive('favicon');
  updateReadyState();
}

$('#chooseFolder').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    $('#folderHelp').textContent = 'Este navegador não oferece seleção direta de pasta. Use Chrome ou Edge atualizado.';
    return;
  }
  try {
    state.productsRoot = await window.showDirectoryPicker({ mode: 'readwrite' });
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
});

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

async function saveBlob(directory, name, blob) {
  if (await fileExists(directory, name) && !confirm(`${name} já existe. Deseja substituir somente esse arquivo?`)) {
    return { skipped: true };
  }
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return { skipped: false };
}

function addResult(text, status = '') {
  const row = document.createElement('div');
  row.className = `result ${status}`;
  row.textContent = text;
  $('#results').appendChild(row);
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

$('#processAll').addEventListener('click', async () => {
  const button = $('#processAll');
  button.disabled = true;
  button.textContent = 'Processando…';
  $('#openFolder').hidden = true;
  $('#results').replaceChildren();
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
    state.outputDirectory = assetsDirectory;
    $('#openFolder').hidden = false;
    $('#folderHelp').textContent = productName + '/' + PAGE_ONE_FOLDER + '/assets · clique em “Abrir pasta” para abrir o seletor nessa pasta.';
    try {
      const handoff = await notifyHubOfGeneratedPage(productName);
      addResult(`Diretório da Presell atualizado no Hub: ${handoff.directory}`, 'ok');
    } catch (error) {
      addResult(`Assets gerados, mas o Hub não conseguiu preencher o Diretório da Presell: ${error.message}`, 'error');
    }
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      state.rootPermission = false;
      renderProductDestination('A permissão da pasta expirou ou foi revogada. Autorize a pasta salva para continuar.');
    }
    addResult(`Falha: ${error.message}`, 'error');
  } finally {
    updateReadyState();
  }
});

markActive('desktop');
restoreProductRoot();
