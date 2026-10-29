export const GOOGLE_ADS_ACCOUNT_IMAGE_ELIGIBILITY_STORAGE_KEY = 'hub:google-ads:account-image-eligibility:v1';

const validEligibility = new Set(['allowed', 'not_allowed']);
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

  return { read, save };
}
