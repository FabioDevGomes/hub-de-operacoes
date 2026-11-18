import { requestGoogleAdsEndpoint } from './google-ads-http-client.mjs?v=6';
import { isGoogleAdsCampaignImageDimensionsSupported } from './google-ads-campaign-image-crop.mjs?v=2';

const imageErrorMessages = Object.freeze({
  campaign_creation_disabled: 'As gravações de campanhas estão desativadas no servidor.',
  campaign_account_not_allowed: 'A conta não está vinculada a uma MCC autorizada para ações de campanha.',
  campaign_image_file_too_large: 'Cada imagem deve ter no máximo 5 MB.',
  campaign_image_format_invalid: 'Use uma imagem PNG ou JPG válida.',
  campaign_image_dimensions_invalid: 'Use uma imagem quadrada de pelo menos 300 × 300 px ou paisagem 1,91:1 de pelo menos 600 × 314 px.',
  campaign_image_hash_mismatch: 'O arquivo mudou durante a leitura. Selecione a imagem novamente.',
  campaign_image_upload_campaign_unavailable: 'Uma campanha do lote não está disponível como Search pausada ou ativa nesta conta.',
  campaign_image_asset_conflict: 'O Google Ads encontrou recursos duplicados para esta imagem. Confira a conta antes de tentar novamente.',
  campaign_image_upload_unverified: 'O Google Ads recebeu a solicitação, mas o Hub não confirmou todos os vínculos. Confira a conta antes de repetir.',
});

function base64FromBytes(bytes) {
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
  }
  return globalThis.btoa(binary);
}

export async function inspectGoogleAdsCampaignImageFile(file, { allowUnsupportedDimensions = false } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Selecione um arquivo de imagem válido.');
  if (!['image/jpeg', 'image/png'].includes(String(file.type || '').toLowerCase())) {
    throw new Error('O arquivo “' + String(file.name || 'imagem') + '” não é PNG nem JPG.');
  }
  if (!Number.isFinite(file.size) || file.size < 1 || file.size > 5 * 1024 * 1024) {
    throw new Error('A imagem “' + String(file.name || 'imagem') + '” precisa ter até 5 MB.');
  }
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('Não foi possível abrir a imagem “' + String(file.name || 'imagem') + '”.'); }
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close?.();
  const dimensionsSupported = isGoogleAdsCampaignImageDimensionsSupported(width, height);
  if (!dimensionsSupported && !allowUnsupportedDimensions) {
    throw new Error('A imagem “' + String(file.name || 'imagem') + '” precisa ser quadrada (mínimo 300 × 300 px) ou paisagem 1,91:1 (mínimo 600 × 314 px).');
  }
  if (!globalThis.crypto?.subtle) throw new Error('O navegador não disponibiliza a verificação segura do arquivo.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const imageSha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  return {
    file,
    fileName: String(file.name || 'imagem').slice(0, 180),
    mimeType: String(file.type).toLowerCase(),
    size: bytes.byteLength,
    width,
    height,
    dimensionsSupported,
    imageSha256,
  };
}

export async function uploadGoogleAdsCampaignImageAsset({
  managerCustomerId,
  customerId,
  batchCampaignIds,
  image,
}, options) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  const ids = Array.isArray(batchCampaignIds) ? [...new Set(batchCampaignIds.map(String))] : [];
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customer)
      || ids.length < 1 || ids.length > 100 || ids.some(id => !/^[1-9]\d{0,19}$/.test(id))
      || !image || !/^[a-f0-9]{64}$/.test(String(image.imageSha256 || ''))
      || !['image/jpeg', 'image/png'].includes(String(image.mimeType || ''))
      || !Number.isInteger(image.size) || image.size < 1 || image.size > 5 * 1024 * 1024
      || !Number.isInteger(image.width) || !Number.isInteger(image.height)
      || !isGoogleAdsCampaignImageDimensionsSupported(image.width, image.height)
      || !image.file || typeof image.file.arrayBuffer !== 'function') {
    throw new Error('Confira a conta, as campanhas e o arquivo antes de enviar a imagem.');
  }
  const bytes = new Uint8Array(await image.file.arrayBuffer());
  if (bytes.length !== image.size) throw new Error('O arquivo mudou durante a leitura. Selecione a imagem novamente.');
  const imageBase64 = base64FromBytes(bytes);
  if (imageBase64.length > 6990508) throw new Error('A imagem excede o limite de envio do serviço.');
  const payload = await requestGoogleAdsEndpoint(
    'https://track.travenzo.shop/google-ads-campaign-action.php',
    'upload_campaign_image_asset',
    {
      manager_customer_id: manager,
      customer_id: customer,
      batch_campaign_ids: ids,
      file_name: 'Hub image ' + image.imageSha256,
      mime_type: image.mimeType,
      image_sha256: image.imageSha256,
      image_base64: imageBase64,
      confirm: true,
    },
    { ...options, errorMessages: imageErrorMessages, timeoutMs: 120000 },
  );
  if (payload?.schema_version !== 1 || payload.operation !== 'upload_campaign_image_asset'
      || String(payload.customer_id) !== customer || payload.image_sha256 !== image.imageSha256
      || payload.verified !== true || payload.campaign_count !== ids.length
      || !Number.isInteger(payload.linked_count) || !Number.isInteger(payload.already_present_count)
      || !Number.isInteger(payload.reactivated_count) || typeof payload.asset_reused !== 'boolean') {
    throw new Error('O servidor não confirmou o vínculo das imagens em todas as campanhas. Confira o Google Ads antes de repetir.');
  }
  return {
    customerId: customer,
    campaignCount: payload.campaign_count,
    linkedCount: payload.linked_count,
    alreadyPresentCount: payload.already_present_count,
    reactivatedCount: payload.reactivated_count,
    assetReused: payload.asset_reused,
    verifiedAtUtc: typeof payload.verified_at_utc === 'string' ? payload.verified_at_utc : '',
  };
}
