function isLegacyAdjustmentForSource(sourceFileName, adjustedFileName) {
  const sourceStem = String(sourceFileName || '').replace(/\.[^.]+$/, '').toLowerCase();
  const adjustedStem = String(adjustedFileName || '').replace(/\.[^.]+$/, '').toLowerCase();
  return sourceStem && ['-ajustada-quadrada', '-ajustada-paisagem']
    .some(suffix => adjustedStem === sourceStem + suffix);
}

export function findGoogleAdsCampaignImageAdjustment(sourceImage, savedImages, uploadedHashes = []) {
  const sourceHash = String(sourceImage?.imageSha256 || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) return null;
  const saved = Array.isArray(savedImages) ? savedImages.filter(image => image?.localSaved === true) : [];
  const exactMatches = saved.filter(image => String(image.sourceImageSha256 || '').toLowerCase() === sourceHash);
  const matches = exactMatches.length ? exactMatches : saved.filter(image =>
    !image.sourceImageSha256 && isLegacyAdjustmentForSource(sourceImage.fileName, image.fileName));
  if (!matches.length) return null;
  const uploaded = uploadedHashes instanceof Set
    ? uploadedHashes
    : new Set((Array.isArray(uploadedHashes) ? uploadedHashes : []).map(value => String(value || '').toLowerCase()));
  return [...matches].sort((left, right) => {
    const savedDifference = String(right.savedAt || '').localeCompare(String(left.savedAt || ''));
    return savedDifference || Number(uploaded.has(String(right.imageSha256 || '').toLowerCase()))
      - Number(uploaded.has(String(left.imageSha256 || '').toLowerCase()));
  })[0];
}
