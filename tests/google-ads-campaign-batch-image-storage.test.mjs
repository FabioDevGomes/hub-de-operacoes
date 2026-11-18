import assert from 'node:assert/strict';
import { memoryIndexedDB } from './helpers/manual-memory-idb.mjs';
import {
  loadGoogleAdsCampaignBatchImageAdjustments,
  loadGoogleAdsCampaignBatchImages,
  saveGoogleAdsCampaignBatchImage,
} from '../src/google-ads/google-ads-campaign-batch-image-storage.mjs';

const hash = character => character.repeat(64);
const indexedDB = memoryIndexedDB();
const batchId = 'batch-image-crop-test';
const imageBlob = new Blob(['synthetic image bytes'], { type: 'image/png' });

await saveGoogleAdsCampaignBatchImage(batchId, {
  imageSha256: hash('a'),
  fileName: 'square.png',
  mimeType: 'image/png',
  width: 500,
  height: 500,
  file: imageBlob,
}, { indexedDB });

const cropSettings = {
  aspectRatio: 1,
  focalX: 0.42,
  focalY: 0.63,
  zoom: 0.75,
  allowUpscale: false,
  sourceWidth: 971,
  sourceHeight: 1201,
};
await saveGoogleAdsCampaignBatchImage(batchId, {
  imageSha256: hash('b'),
  sourceImageSha256: hash('c'),
  sourceFileName: 'imagem-produto-01.png',
  cropSettings,
  fileName: 'imagem-produto-01-ajustada-quadrada.png',
  mimeType: 'image/png',
  width: 971,
  height: 971,
  file: imageBlob,
}, { indexedDB });

const adjustments = await loadGoogleAdsCampaignBatchImageAdjustments(batchId, { indexedDB });
assert.equal(adjustments.length, 1, 'só imagens derivadas de um original aparecem como recortes salvos');
assert.equal(adjustments[0].imageSha256, hash('b'));
assert.equal(adjustments[0].sourceImageSha256, hash('c'));
assert.equal(adjustments[0].sourceFileName, 'imagem-produto-01.png');
assert.deepEqual(adjustments[0].cropSettings, cropSettings);
assert.ok(adjustments[0].blob instanceof Blob);

const restored = await loadGoogleAdsCampaignBatchImages(batchId, [hash('b')], { indexedDB });
assert.equal(restored.length, 1);
assert.deepEqual(restored[0].cropSettings, cropSettings, 'a leitura por hash conserva o enquadramento salvo');

await assert.rejects(saveGoogleAdsCampaignBatchImage(batchId, {
  imageSha256: hash('d'),
  sourceImageSha256: hash('c'),
  sourceFileName: 'imagem-produto-01.png',
  cropSettings: { ...cropSettings, zoom: 0.25 },
  fileName: 'invalid.png',
  mimeType: 'image/png',
  width: 500,
  height: 500,
  file: imageBlob,
}, { indexedDB }), /enquadramento.*válidos/i);

console.log('Campaign batch image storage preserves crop source metadata and framing settings.');
