import assert from 'node:assert/strict';
import { findGoogleAdsCampaignImageAdjustment } from '../src/google-ads/google-ads-campaign-image-adjustments.mjs';

const hash = character => character.repeat(64);
const source = { imageSha256: hash('a'), fileName: 'imagem-produto-01.png' };
const legacy = {
  imageSha256: hash('b'),
  fileName: 'imagem-produto-01-ajustada-quadrada.png',
  localSaved: true,
};
const crop = {
  imageSha256: hash('c'),
  sourceImageSha256: hash('a'),
  sourceFileName: source.fileName,
  fileName: 'imagem-produto-01-ajustada-quadrada.png',
  localSaved: true,
  savedAt: '2026-11-02T12:00:00.000Z',
};

assert.equal(findGoogleAdsCampaignImageAdjustment(source, [legacy])?.imageSha256, hash('b'),
  'recortes antigos podem ser associados pelo nome gerado');
assert.equal(findGoogleAdsCampaignImageAdjustment(source, [{ ...legacy, fileName: 'imagem-produto-01-edicao.png' }]), null,
  'nomes sem o sufixo do recortador não são associados');
assert.equal(findGoogleAdsCampaignImageAdjustment(source, [legacy, crop])?.imageSha256, hash('c'),
  'metadados por hash têm prioridade sobre a associação antiga por nome');
const newerCrop = { ...crop, imageSha256: hash('d'), savedAt: '2026-11-02T12:30:00.000Z' };
assert.equal(findGoogleAdsCampaignImageAdjustment(source, [newerCrop, crop], new Set([hash('c')]))?.imageSha256, hash('d'),
  'a versão local mais recente prevalece sobre um recorte enviado anteriormente');
assert.equal(findGoogleAdsCampaignImageAdjustment(source, [
  { ...crop, savedAt: '2026-11-02T12:00:00.000Z' },
  { ...crop, imageSha256: hash('d'), savedAt: '2026-11-02T12:00:00.000Z' },
], new Set([hash('c')]))?.imageSha256, hash('c'),
  'entre versões salvas no mesmo instante, a imagem já enviada permanece pré-selecionada');
assert.equal(findGoogleAdsCampaignImageAdjustment({ fileName: source.fileName }, [crop]), null,
  'sem hash do original não há associação automática');

console.log('Campaign image restoration matches saved crops by source hash and safe legacy filename.');
