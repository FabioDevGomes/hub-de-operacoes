const ASSET_STUDIO_DB = 'hub-asset-studio-settings';
const ASSET_STUDIO_STORE = 'settings';
const PRODUCT_ROOT_KEY = 'productsRoot';
const PRODUCT_IMAGE_METADATA_DIRECTORY = '.hub';
const PRODUCT_IMAGE_MANIFEST_NAME = 'imagens-produto.json';
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

function openAssetStudioDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Este navegador não disponibiliza o armazenamento local do Asset Studio.'));
      return;
    }
    const request = globalThis.indexedDB.open(ASSET_STUDIO_DB);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ASSET_STUDIO_STORE)) {
        try { request.transaction?.abort(); } catch { /* Não cria um banco vazio só para uma leitura. */ }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir a pasta salva pelo Asset Studio.'));
    request.onblocked = () => reject(new Error('O armazenamento do Asset Studio está ocupado por outra aba.'));
  });
}

export async function loadGoogleAdsPresellProductRootHandle() {
  if (typeof globalThis.indexedDB?.databases === 'function') {
    const databases = await globalThis.indexedDB.databases();
    if (!databases.some(database => database.name === ASSET_STUDIO_DB)) return null;
  }
  const database = await openAssetStudioDatabase();
  try {
    if (!database.objectStoreNames.contains(ASSET_STUDIO_STORE)) return null;
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(ASSET_STUDIO_STORE, 'readonly');
      const request = transaction.objectStore(ASSET_STUDIO_STORE).get(PRODUCT_ROOT_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Não foi possível recuperar a pasta de produtos do Asset Studio.'));
      transaction.onabort = () => reject(transaction.error || new Error('A leitura da pasta salva foi cancelada.'));
    });
  } finally {
    database.close();
  }
}

async function readJsonFile(directory, name) {
  const handle = await directory.getFileHandle(name);
  const file = await handle.getFile();
  return JSON.parse(await file.text());
}

async function readManifestFrom(directory, product, relativePath) {
  try {
    return { found: true, manifest: await readJsonFile(directory, PRODUCT_IMAGE_MANIFEST_NAME), path: relativePath };
  } catch (error) {
    if (error?.name === 'NotFoundError') return { found: false };
    if (error?.name === 'NotAllowedError') {
      const permissionError = new Error('O navegador bloqueou a leitura de “' + product + '/' + relativePath + '/' + PRODUCT_IMAGE_MANIFEST_NAME + '”. Autorize novamente a pasta salva pelo Asset Studio.');
      permissionError.code = 'permission-required';
      throw permissionError;
    }
    if (error instanceof SyntaxError) {
      throw new Error('O índice “' + product + '/' + relativePath + '/' + PRODUCT_IMAGE_MANIFEST_NAME + '” existe, mas o JSON está inválido. Salve as imagens de produto novamente no Asset Studio para recriá-lo.');
    }
    throw new Error('Não foi possível ler “' + product + '/' + relativePath + '/' + PRODUCT_IMAGE_MANIFEST_NAME + '”: ' + (error?.message || 'erro de leitura do navegador.'));
  }
}

function validateManifest(manifest) {
  if (!manifest || manifest.schema !== 'hub_product_images_v1' || !Array.isArray(manifest.images)) {
    throw new Error('O índice de imagens da Pre-Sell não está no formato esperado. Gere novamente as imagens de produto no Asset Studio.');
  }
  if (manifest.images.length < 1 || manifest.images.length > 2) {
    throw new Error('O índice da Pre-Sell precisa listar uma ou duas imagens de produto.');
  }
  const positions = new Set();
  return manifest.images.map((entry) => {
    const position = Number(entry?.position);
    const fileName = String(entry?.fileName || '');
    const match = fileName.match(/^imagem-produto-0([12])\.(png|jpe?g)$/i);
    if (!match || Number(match[1]) !== position || positions.has(position)) {
      throw new Error('O índice contém um nome de imagem inválido. Gere novamente as imagens de produto no Asset Studio.');
    }
    const expectedMimeType = match[2].toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
    const mimeType = String(entry?.mimeType || expectedMimeType).toLowerCase();
    if (mimeType !== expectedMimeType) {
      throw new Error('O tipo de arquivo não corresponde ao índice da imagem ' + fileName + '.');
    }
    positions.add(position);
    return { fileName, mimeType, position };
  }).sort((left, right) => left.position - right.position);
}

export async function readGoogleAdsPresellProductImages(rootHandle, productName) {
  const product = String(productName || '').trim();
  if (!rootHandle || typeof rootHandle.getDirectoryHandle !== 'function') {
    throw new Error('A pasta raiz de produtos do Asset Studio não está salva neste navegador.');
  }
  if (!product || product.length > 100 || /[<>:"/\\|?*\u0000-\u001f]/.test(product) || /[. ]$/.test(product) || product === '.' || product === '..') {
    throw new Error('O nome do produto não é válido para localizar a pasta de imagens.');
  }
  if (typeof rootHandle.queryPermission === 'function'
      && await rootHandle.queryPermission({ mode: 'read' }) !== 'granted') {
    const error = new Error('Autorize a leitura da pasta de produtos para carregar as imagens da Pre-Sell.');
    error.code = 'permission-required';
    throw error;
  }

  let productDirectory;
  let assetsDirectory;
  try {
    productDirectory = await rootHandle.getDirectoryHandle(product);
    const pageDirectory = await productDirectory.getDirectoryHandle('pag01');
    assetsDirectory = await pageDirectory.getDirectoryHandle('assets');
  } catch (error) {
    if (error?.name === 'NotAllowedError') {
      const permissionError = new Error('O navegador bloqueou a leitura da pasta “' + product + '/pag01/assets”. Autorize novamente a pasta salva pelo Asset Studio.');
      permissionError.code = 'permission-required';
      throw permissionError;
    }
    if (error?.name === 'NotFoundError') {
      throw new Error('Não encontrei a pasta “' + product + '/pag01/assets” na raiz salva pelo Asset Studio. Confira o nome da pasta do produto.');
    }
    throw new Error('Não foi possível abrir a pasta “' + product + '/pag01/assets”: ' + (error?.message || 'erro de leitura do navegador.'));
  }

  let manifestResult = { found: false };
  try {
    const metadataDirectory = await productDirectory.getDirectoryHandle(PRODUCT_IMAGE_METADATA_DIRECTORY);
    manifestResult = await readManifestFrom(metadataDirectory, product, PRODUCT_IMAGE_METADATA_DIRECTORY);
  } catch (error) {
    if (error?.name === 'NotFoundError') manifestResult = { found: false };
    else if (error?.name === 'NotAllowedError') {
      const permissionError = new Error('O navegador bloqueou a leitura de “' + product + '/' + PRODUCT_IMAGE_METADATA_DIRECTORY + '/' + PRODUCT_IMAGE_MANIFEST_NAME + '”. Autorize novamente a pasta salva pelo Asset Studio.');
      permissionError.code = 'permission-required';
      throw permissionError;
    } else throw error;
  }

  if (!manifestResult.found) {
    manifestResult = await readManifestFrom(assetsDirectory, product, 'pag01/assets');
  }
  if (!manifestResult.found) {
    try {
      const imageHandle = await assetsDirectory.getFileHandle('imagem-produto-01.png');
      const image = await imageHandle.getFile();
      if (!image.size || image.size > MAX_PRODUCT_IMAGE_BYTES || image.type.toLowerCase() !== 'image/png') {
        throw new Error('“' + product + '/pag01/assets/imagem-produto-01.png” existe, mas não é um PNG válido de até 5 MB.');
      }
      return [image];
    } catch (fallbackError) {
      if (fallbackError?.name === 'NotAllowedError') {
        const permissionError = new Error('O navegador bloqueou a leitura de “' + product + '/pag01/assets/imagem-produto-01.png”. Autorize novamente a pasta salva pelo Asset Studio.');
        permissionError.code = 'permission-required';
        throw permissionError;
      }
      if (fallbackError?.name !== 'NotFoundError') throw fallbackError;
      throw new Error('Não encontrei o índice local nem “' + product + '/pag01/assets/imagem-produto-01.png”. Confira o nome e salve essa imagem na pasta do produto pelo Asset Studio.');
    }
  }

  const entries = validateManifest(manifestResult.manifest);
  const files = [];
  for (const entry of entries) {
    const fileHandle = await assetsDirectory.getFileHandle(entry.fileName);
    const file = await fileHandle.getFile();
    if (!file.size || file.size > MAX_PRODUCT_IMAGE_BYTES || file.type.toLowerCase() !== entry.mimeType) {
      throw new Error('A imagem “' + entry.fileName + '” não corresponde ao formato ou limite de tamanho do índice.');
    }
    files.push(file);
  }
  return files;
}
