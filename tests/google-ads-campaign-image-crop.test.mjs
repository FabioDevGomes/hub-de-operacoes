import assert from 'node:assert/strict';
import {
  calculateGoogleAdsCampaignImageCrop,
  isGoogleAdsCampaignImageDimensionsSupported,
} from '../src/google-ads/google-ads-campaign-image-crop.mjs';

assert.equal(isGoogleAdsCampaignImageDimensionsSupported(300, 300), true);
assert.equal(isGoogleAdsCampaignImageDimensionsSupported(600, 314), true);
assert.equal(isGoogleAdsCampaignImageDimensionsSupported(299, 299), false);
assert.equal(isGoogleAdsCampaignImageDimensionsSupported(599, 314), false);

const squareFromLandscape = calculateGoogleAdsCampaignImageCrop({
  sourceWidth: 1200,
  sourceHeight: 800,
  aspectRatio: 1,
  focalX: 1,
  focalY: -1,
});
assert.equal(squareFromLandscape.width, 800);
assert.equal(squareFromLandscape.height, 800);
assert.equal(squareFromLandscape.x, 400, 'o foco no limite direito mantém o recorte dentro da imagem');
assert.equal(squareFromLandscape.y, 0, 'o foco é limitado ao intervalo válido');
assert.equal(squareFromLandscape.dimensionsSupported, true);

const landscape = calculateGoogleAdsCampaignImageCrop({
  sourceWidth: 1800,
  sourceHeight: 1200,
  aspectRatio: 1.91,
  focalX: 0.5,
  focalY: 0.5,
});
assert.equal(landscape.dimensionsSupported, true);
assert.ok(Math.abs(landscape.outputWidth / landscape.outputHeight - 1.91) <= 0.03);

const tooSmall = calculateGoogleAdsCampaignImageCrop({
  sourceWidth: 240,
  sourceHeight: 240,
  aspectRatio: 1,
});
assert.equal(tooSmall.dimensionsSupported, false, 'o recorte não amplia imagem pequena para forçar elegibilidade');
assert.equal(tooSmall.requiresUpscale, true);
assert.equal(tooSmall.upscalePercent, 25);
assert.equal(tooSmall.outputWidth, 240, 'a ampliação permanece desligada por padrão');

const smallSquareUpscaled = calculateGoogleAdsCampaignImageCrop({
  sourceWidth: 272,
  sourceHeight: 272,
  aspectRatio: 1,
  allowUpscale: true,
});
assert.equal(smallSquareUpscaled.outputWidth, 300);
assert.equal(smallSquareUpscaled.outputHeight, 300);
assert.equal(smallSquareUpscaled.upscalePercent, 10);
assert.equal(smallSquareUpscaled.dimensionsSupported, true);

const squareToLandscapeUpscaled = calculateGoogleAdsCampaignImageCrop({
  sourceWidth: 500,
  sourceHeight: 500,
  aspectRatio: 1.91,
  allowUpscale: true,
});
assert.equal(squareToLandscapeUpscaled.dimensionsSupported, true);
assert.ok(squareToLandscapeUpscaled.outputWidth >= 600);
assert.ok(squareToLandscapeUpscaled.outputHeight >= 314);
assert.throws(() => calculateGoogleAdsCampaignImageCrop({ sourceWidth: 0, sourceHeight: 100, aspectRatio: 1 }));
assert.throws(() => calculateGoogleAdsCampaignImageCrop({ sourceWidth: 100, sourceHeight: 100, aspectRatio: 4 }));

console.log('Google Ads campaign image crops preserve source bounds and validate destination dimensions.');
