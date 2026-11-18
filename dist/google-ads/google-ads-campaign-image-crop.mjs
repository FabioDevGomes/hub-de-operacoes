export function isGoogleAdsCampaignImageDimensionsSupported(width, height) {
  return (width === height && width >= 300)
    || (width >= 600 && height >= 314 && Math.abs((width / height) - 1.91) <= 0.03);
}

export function calculateGoogleAdsCampaignImageCrop({
  sourceWidth,
  sourceHeight,
  aspectRatio = 1,
  focalX = 0.5,
  focalY = 0.5,
  zoom = 1,
  allowUpscale = false,
}) {
  const width = Number(sourceWidth);
  const height = Number(sourceHeight);
  const ratio = Number(aspectRatio);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1
      || ![1, 1.91].includes(ratio)) {
    throw new Error('Informe dimensões de imagem válidas e escolha o formato quadrado ou paisagem.');
  }
  const horizontalFocus = Number.isFinite(Number(focalX)) ? Math.min(1, Math.max(0, Number(focalX))) : 0.5;
  const verticalFocus = Number.isFinite(Number(focalY)) ? Math.min(1, Math.max(0, Number(focalY))) : 0.5;
  const zoomFactor = Number.isFinite(Number(zoom)) ? Math.min(3, Math.max(0.5, Number(zoom))) : 1;
  let cropWidth = Math.min(width, height * ratio);
  let cropHeight = cropWidth / ratio;
  if (cropHeight > height) {
    cropHeight = height;
    cropWidth = cropHeight * ratio;
  }
  cropWidth /= zoomFactor;
  cropHeight /= zoomFactor;
  const naturalWidth = Math.round(cropWidth);
  const naturalHeight = Math.round(cropHeight);
  const requiredScale = ratio === 1
    ? Math.max(1, 300 / cropWidth, 300 / cropHeight)
    : Math.max(1, 600 / cropWidth, 314 / cropHeight);
  const scale = allowUpscale ? requiredScale : 1;
  const outputWidth = Math.round(cropWidth * scale);
  const outputHeight = Math.round(cropHeight * scale);
  return {
    aspectRatio: ratio,
    zoom: zoomFactor,
    x: (width - cropWidth) * horizontalFocus,
    y: (height - cropHeight) * verticalFocus,
    width: cropWidth,
    height: cropHeight,
    outputWidth,
    outputHeight,
    naturalWidth,
    naturalHeight,
    requiresUpscale: requiredScale > 1.00001,
    upscalePercent: Math.max(0, Math.round((requiredScale - 1) * 100)),
    dimensionsSupported: isGoogleAdsCampaignImageDimensionsSupported(outputWidth, outputHeight),
  };
}
