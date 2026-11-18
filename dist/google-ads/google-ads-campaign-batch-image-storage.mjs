const DATABASE_NAME = 'hub-google-ads-campaign-batch-images';
const DATABASE_VERSION = 1;
const IMAGE_STORE = 'images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function openImageDatabase(indexedDB = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!indexedDB?.open) {
      reject(new Error('Este navegador não disponibiliza armazenamento local para as imagens do lote.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(IMAGE_STORE)) {
        const store = database.createObjectStore(IMAGE_STORE, { keyPath: 'key' });
        store.createIndex('batchId', 'batchId', { unique: false });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o armazenamento local das imagens.'));
    request.onblocked = () => reject(new Error('O armazenamento local das imagens está ocupado por outra aba.'));
  });
}

function validBatchId(value) {
  const id = String(value || '').trim();
  if (!id || id.length > 180) throw new Error('O lote não tem um identificador válido para salvar a imagem.');
  return id;
}

function validImageHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('A imagem não tem um hash válido para ser associada ao lote.');
  return hash;
}

function validImageBlob(image) {
  const blob = image?.file || image?.blob;
  const mimeType = String(image?.mimeType || blob?.type || '').toLowerCase();
  if (!(typeof Blob !== 'undefined' && blob instanceof Blob)) {
    throw new Error('O arquivo da imagem não está disponível neste navegador.');
  }
  if (!['image/png', 'image/jpeg'].includes(mimeType) || blob.size < 1 || blob.size > MAX_IMAGE_BYTES) {
    throw new Error('A imagem precisa ser PNG/JPG e ter até 5 MB para ser salva no lote.');
  }
  return { blob, mimeType };
}

function validCropSettings(value) {
  if (!value || typeof value !== 'object') return null;
  const aspectRatio = Number(value.aspectRatio);
  const focalX = Number(value.focalX);
  const focalY = Number(value.focalY);
  const zoom = Number(value.zoom);
  const sourceWidth = Number(value.sourceWidth);
  const sourceHeight = Number(value.sourceHeight);
  if (![1, 1.91].includes(aspectRatio)
      || !Number.isFinite(focalX) || focalX < 0 || focalX > 1
      || !Number.isFinite(focalY) || focalY < 0 || focalY > 1
      || !Number.isFinite(zoom) || zoom < 0.5 || zoom > 3
      || !Number.isInteger(sourceWidth) || sourceWidth < 1 || sourceWidth > 100000
      || !Number.isInteger(sourceHeight) || sourceHeight < 1 || sourceHeight > 100000) {
    throw new Error('O enquadramento da imagem não tem parâmetros válidos para ser salvo.');
  }
  return {
    aspectRatio,
    focalX,
    focalY,
    zoom,
    allowUpscale: value.allowUpscale === true,
    sourceWidth,
    sourceHeight,
  };
}

export async function saveGoogleAdsCampaignBatchImage(batchIdValue, image, { indexedDB } = {}) {
  const batchId = validBatchId(batchIdValue);
  const imageSha256 = validImageHash(image?.imageSha256);
  const { blob, mimeType } = validImageBlob(image);
  const fileName = String(image?.fileName || '').trim().slice(0, 255);
  if (!fileName) throw new Error('O arquivo da imagem não tem um nome válido.');
  const sourceImageSha256 = image?.sourceImageSha256 ? validImageHash(image.sourceImageSha256) : '';
  const sourceFileName = String(image?.sourceFileName || '').trim().slice(0, 255);
  const cropSettings = validCropSettings(image?.cropSettings);
  const record = {
    key: batchId + ':' + imageSha256,
    batchId,
    imageSha256,
    fileName,
    mimeType,
    size: blob.size,
    width: Number.isInteger(image?.width) ? image.width : 0,
    height: Number.isInteger(image?.height) ? image.height : 0,
    ...(sourceImageSha256 ? { sourceImageSha256 } : {}),
    ...(sourceFileName ? { sourceFileName } : {}),
    ...(cropSettings ? { cropSettings } : {}),
    blob,
    savedAt: new Date().toISOString(),
  };
  const database = await openImageDatabase(indexedDB);
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction([IMAGE_STORE], 'readwrite');
      transaction.objectStore(IMAGE_STORE).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Não foi possível salvar a imagem no lote.'));
      transaction.onabort = () => reject(transaction.error || new Error('O salvamento da imagem no lote foi cancelado.'));
    });
    return { ...record, blob };
  } finally {
    database.close();
  }
}

export async function loadGoogleAdsCampaignBatchImages(batchIdValue, imageHashes, { indexedDB } = {}) {
  const batchId = validBatchId(batchIdValue);
  const hashes = [...new Set((Array.isArray(imageHashes) ? imageHashes : []).map(validImageHash))];
  if (!hashes.length) return [];
  const databaseFactory = indexedDB || globalThis.indexedDB;
  if (typeof databaseFactory?.databases === 'function') {
    try {
      const databases = await databaseFactory.databases();
      if (!databases.some(database => database.name === DATABASE_NAME)) return [];
    } catch { /* Browsers may not implement database inventory; open the store below. */ }
  }
  const database = await openImageDatabase(databaseFactory);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction([IMAGE_STORE], 'readonly');
      const store = transaction.objectStore(IMAGE_STORE);
      const records = new Map();
      for (const hash of hashes) {
        const request = store.get(batchId + ':' + hash);
        request.onsuccess = () => {
          const record = request.result;
          if (record?.batchId === batchId && record.imageSha256 === hash && record.blob instanceof Blob) {
            records.set(hash, record);
          }
        };
        request.onerror = () => reject(request.error || new Error('Não foi possível ler uma imagem salva neste lote.'));
      }
      transaction.oncomplete = () => resolve(hashes.map(hash => records.get(hash)).filter(Boolean));
      transaction.onerror = () => reject(transaction.error || new Error('Não foi possível ler as imagens salvas neste lote.'));
      transaction.onabort = () => reject(transaction.error || new Error('A leitura das imagens salvas foi cancelada.'));
    });
  } finally {
    database.close();
  }
}

export async function loadGoogleAdsCampaignBatchImageAdjustments(batchIdValue, { indexedDB } = {}) {
  const batchId = validBatchId(batchIdValue);
  const databaseFactory = indexedDB || globalThis.indexedDB;
  if (typeof databaseFactory?.databases === 'function') {
    try {
      const databases = await databaseFactory.databases();
      if (!databases.some(database => database.name === DATABASE_NAME)) return [];
    } catch { /* Browsers may not implement database inventory; open the store below. */ }
  }
  const database = await openImageDatabase(databaseFactory);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction([IMAGE_STORE], 'readonly');
      const request = transaction.objectStore(IMAGE_STORE).index('batchId').getAll(batchId);
      let records = [];
      request.onsuccess = () => {
        records = Array.isArray(request.result) ? request.result.filter(record =>
          record?.batchId === batchId
          && /^[a-f0-9]{64}$/i.test(String(record.sourceImageSha256 || ''))
          && /^[a-f0-9]{64}$/i.test(String(record.imageSha256 || ''))
          && record.blob instanceof Blob) : [];
      };
      request.onerror = () => reject(request.error || new Error('Não foi possível ler os recortes salvos neste lote.'));
      transaction.oncomplete = () => resolve(records);
      transaction.onerror = () => reject(transaction.error || new Error('Não foi possível ler os recortes salvos neste lote.'));
      transaction.onabort = () => reject(transaction.error || new Error('A leitura dos recortes salvos foi cancelada.'));
    });
  } finally {
    database.close();
  }
}
