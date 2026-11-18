export const GOOGLE_ADS_ACCOUNT_IMAGE_ELIGIBILITY_STORAGE_KEY = 'hub:google-ads:account-image-eligibility:v1';
export const GOOGLE_ADS_ACCOUNT_IMAGE_API_STATUS_STORAGE_KEY = 'hub:google-ads:account-image-api-status:v1';

const validEligibility = new Set(['allowed', 'not_allowed']);
const validApiImageStatuses = new Set(['verification_required']);
const emptyEligibility = () => Object.create(null);

function normalizeAccountId(value) {
  const accountId = String(value ?? '').replace(/\D/g, '');
  return /^\d{10}$/.test(accountId) ? accountId : '';
}

function parseEligibility(raw) {
  if (raw == null || raw === '') return emptyEligibility();
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('As verificações de imagens salvas neste navegador têm um formato inválido.');
  }
  const eligibility = emptyEligibility();
  for (const [accountId, value] of Object.entries(parsed)) {
    if (normalizeAccountId(accountId) && validEligibility.has(value)) eligibility[accountId] = value;
  }
  return eligibility;
}

function parseApiImageStatuses(raw) {
  if (raw == null || raw === '') return emptyEligibility();
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Os retornos de imagem do Google Ads salvos neste navegador têm um formato inválido.');
  }
  const statuses = emptyEligibility();
  for (const [accountId, value] of Object.entries(parsed)) {
    if (!normalizeAccountId(accountId) || !value || typeof value !== 'object' || Array.isArray(value)
        || !validApiImageStatuses.has(value.status)
        || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) continue;
    const code = typeof value.googleErrorCode === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,100}$/.test(value.googleErrorCode)
      ? value.googleErrorCode
      : '';
    statuses[accountId] = { status: value.status, googleErrorCode: code, updatedAt: value.updatedAt };
  }
  return statuses;
}

export function createGoogleAdsAccountImageEligibilityStorage(storage, key = GOOGLE_ADS_ACCOUNT_IMAGE_ELIGIBILITY_STORAGE_KEY) {
  function read() {
    if (typeof storage?.getItem !== 'function') return emptyEligibility();
    try { return parseEligibility(storage.getItem(key)); }
    catch { return emptyEligibility(); }
  }

  function save(accountValue, eligibilityValue) {
    const accountId = normalizeAccountId(accountValue);
    if (!accountId) throw new TypeError('A conta precisa ter um ID Google Ads de 10 dígitos para salvar a verificação.');
    if (!validEligibility.has(eligibilityValue)) throw new TypeError('Escolha se a conta permite ou não recursos de imagem.');
    if (typeof storage?.getItem !== 'function' || typeof storage?.setItem !== 'function') {
      throw new Error('O armazenamento local não está disponível; a verificação não foi alterada.');
    }

    let eligibility;
    try { eligibility = parseEligibility(storage.getItem(key)); }
    catch { throw new Error('As verificações salvas não puderam ser lidas e não foram substituídas.'); }
    eligibility[accountId] = eligibilityValue;
    try { storage.setItem(key, JSON.stringify(eligibility)); }
    catch { throw new Error('Não foi possível salvar a verificação neste navegador. Tente novamente.'); }
    return eligibility;
  }

  function readApiStatus() {
    if (typeof storage?.getItem !== 'function') return emptyEligibility();
    try { return parseApiImageStatuses(storage.getItem(GOOGLE_ADS_ACCOUNT_IMAGE_API_STATUS_STORAGE_KEY)); }
    catch { return emptyEligibility(); }
  }

  function saveApiStatus(accountValue, statusValue, googleErrorCode = '') {
    const accountId = normalizeAccountId(accountValue);
    if (!accountId) throw new TypeError('A conta precisa ter um ID Google Ads de 10 dígitos para salvar o retorno da API.');
    if (statusValue !== null && !validApiImageStatuses.has(statusValue)) {
      throw new TypeError('O retorno da API para imagens não é reconhecido.');
    }
    if (typeof storage?.getItem !== 'function' || typeof storage?.setItem !== 'function') {
      throw new Error('O armazenamento local não está disponível; o retorno da API não foi alterado.');
    }
    let statuses;
    try { statuses = parseApiImageStatuses(storage.getItem(GOOGLE_ADS_ACCOUNT_IMAGE_API_STATUS_STORAGE_KEY)); }
    catch { throw new Error('Os retornos da API não puderam ser lidos e não foram substituídos.'); }
    if (statusValue === null) delete statuses[accountId];
    else {
      const code = String(googleErrorCode || '').slice(0, 101);
      statuses[accountId] = {
        status: statusValue,
        googleErrorCode: /^[A-Za-z][A-Za-z0-9_.]{0,100}$/.test(code) ? code : '',
        updatedAt: new Date().toISOString(),
      };
    }
    try { storage.setItem(GOOGLE_ADS_ACCOUNT_IMAGE_API_STATUS_STORAGE_KEY, JSON.stringify(statuses)); }
    catch { throw new Error('Não foi possível salvar o retorno da API neste navegador.'); }
    return statuses;
  }

  return { read, save, readApiStatus, saveApiStatus };
}
