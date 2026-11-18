const COMPLETED_STATUSES = new Set(['completed', 'completed_with_warnings']);
const REQUIRED_PAGE_ASSETS = ['01.png', '02.png'];

function pageAssetSaved(rows, fileName) {
  return (Array.isArray(rows) ? rows : []).some(row => {
    const text = String(row?.text || '');
    const namesFile = text.includes(`pag01/assets/${fileName}`);
    const saved = row?.status === 'ok' || /preservado\s*[—-]\s*substituição cancelada/i.test(text);
    return namesFile && saved;
  });
}

export function assessAssetStudioCampaignHandoff(work, productName) {
  const name = String(productName || '').trim();
  if (!work || !name) return { pageAssetsSaved: false, productImagesSaved: false, ready: false };

  const pageAssetsName = String(work.pageAssetsProductName || work.productName || '').trim();
  const pageAssetsSaved = COMPLETED_STATUSES.has(work.status)
    && pageAssetsName === name
    && REQUIRED_PAGE_ASSETS.every(fileName => pageAssetSaved(work.results, fileName));

  const productImagesName = String(work.productImagesProductName || work.productName || '').trim();
  const productImageFiles = Array.isArray(work.productImageFiles)
    ? work.productImageFiles
    : (Array.isArray(work.selectedProductImages) ? work.selectedProductImages.map(image => image?.fileName) : []);
  const productImagesSaved = productImagesName === name
    && productImageFiles.some(fileName => /^imagem-produto-0[12]\.(?:png|jpg)$/i.test(String(fileName || '').trim()));

  return { pageAssetsSaved, productImagesSaved, ready: pageAssetsSaved };
}
