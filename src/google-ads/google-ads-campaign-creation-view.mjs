import {
  applyGoogleAdsAudienceExclusions,
  createGoogleAdsSearchCampaign,
  fetchGoogleAdsAudienceExclusionUploadCatalog,
  fetchGoogleAdsAudienceTargetingUploadCsv,
  previewGoogleAdsSearchCampaign,
  prepareGoogleAdsSearchCampaignPreviewContexts,
  inspectGoogleAdsCampaignGoal,
  applyExistingCampaignCustomGoal,
  applyExistingCampaignDeliverySettings,
  applyExistingCampaignEuPoliticalAdvertisingDeclarationBatch,
  temporaryValidateCampaignGoal,
  validateHubCampaignConversionGoal,
  validateHubCampaignPositiveGeoTarget,
} from './google-ads-campaign-creation-service.mjs?v=28';
import {parseKeywordLine,keywordListError,migrateLegacyKeywordText} from './google-ads-keyword-match.mjs?v=1';
import {saveCopySelection,loadCopySelection} from './google-ads-copy-selection-storage.mjs?v=1';
import { buildGoogleAdsAudienceExclusionWorkbook } from './google-ads-audience-exclusion-workbook.mjs?v=2';
import { applyGoogleAdsBatchNegativeKeywords, applyGoogleAdsBatchPositiveKeywords, applyGoogleAdsCampaignDestinationUrl, applyGoogleAdsCampaignSitelinks, changeGoogleAdsCampaignStatus, previewGoogleAdsBatchNegativeKeywords, previewGoogleAdsBatchPositiveKeywords } from './google-ads-campaign-actions-service.mjs?v=8';
import { inspectGoogleAdsCampaignImageFile, uploadGoogleAdsCampaignImageAsset } from './google-ads-campaign-image-assets-service.mjs?v=3';
import { loadGoogleAdsCampaignBatchImageAdjustments, loadGoogleAdsCampaignBatchImages, saveGoogleAdsCampaignBatchImage } from './google-ads-campaign-batch-image-storage.mjs?v=1.198.12';
import { calculateGoogleAdsCampaignImageCrop } from './google-ads-campaign-image-crop.mjs?v=4';
import { findGoogleAdsCampaignImageAdjustment } from './google-ads-campaign-image-adjustments.mjs?v=1';
import { loadGoogleAdsPresellProductRootHandle, readGoogleAdsPresellProductImages } from './google-ads-presell-product-images-bridge.mjs?v=3';
import { fetchGoogleAdsAccounts } from './google-ads-service.mjs?v=16';
import { normalizeGoogleAdsAccounts } from './google-ads-domain.mjs?v=7';
import { readTrackingHubToken } from '../tracking/tracking-token-storage.mjs?v=2';
import { readGuruMediaConversionActionSettings } from '../tracking/tracking-gurumedia-conversion-actions-storage.mjs?v=1';
import { GOOGLE_ADS_ACCOUNTS_CACHE_STORAGE_KEY, loadGoogleAdsAccountsCache, saveGoogleAdsAccountsCache } from './google-ads-accounts-cache.mjs?v=4';
import { ACCOUNT_MAP_DUPLICATION_TARGET_KEY, ACCOUNT_MAP_DUPLICATION_TARGET_UPDATED_EVENT, createAccountDuplicationTargetStorage } from '../accounts/accounts-target-storage.mjs?v=3';
import { ACCOUNT_DIRECTORY_EMAIL_KEY, createAccountDirectoryEmailStorage } from '../accounts/accounts-list-storage.mjs?v=5';
import { normalizeAccountDirectoryId } from '../accounts/accounts-list-domain.mjs?v=8';
import { detectGoogleAdsCopyLanguage } from './google-ads-copy-language.mjs?v=1';
import { detectGoogleAdsCopyDiscount } from './google-ads-discount-detection.mjs?v=1';
import { parseGoogleAdsCopyImport } from './google-ads-copy-import.mjs?v=1';
import { loadGoogleAdsCampaignDrafts, saveGoogleAdsCampaignDrafts } from './google-ads-campaign-drafts-storage.mjs?v=1';
import { loadGoogleAdsCampaignBatches, saveGoogleAdsCampaignBatch, appendGoogleAdsCampaignToBatch, confirmGoogleAdsCampaignBatchStep } from './google-ads-campaign-batches-storage.mjs?v=13';
import { loadGoogleAdsCampaignCsvWorkflows, saveGoogleAdsCampaignCsvWorkflow } from './google-ads-campaign-csv-workflow-storage.mjs?v=2';
import { loadGoogleAdsCampaignActiveContext, saveGoogleAdsCampaignActiveContext } from './google-ads-campaign-active-context-storage.mjs?v=1';
import { resolveInitialGoogleAdsCampaignContext } from './google-ads-campaign-context-domain.mjs?v=1';
import { fetchGoogleAdsCampaignsForDuplication, verifyGoogleAdsCampaignsForAssociation } from './google-ads-campaign-duplication-service.mjs?v=7';
import { renderGoogleAdsCampaignCopySummary } from './google-ads-campaign-copy-summary-view.mjs?v=2';
import {
  invalidateGoogleAdsCampaignPreview,
  linkGoogleAdsCampaignPreviewToBatch,
  listGoogleAdsCampaignPreviews,
  loadGoogleAdsCampaignPreview,
  releaseGoogleAdsCampaignPreviewFromBatch,
  saveGoogleAdsCampaignCreationAttempt,
  saveGoogleAdsCampaignPreview,
} from './google-ads-campaign-preview-storage.mjs?v=10';
import { summarizeGoogleAdsCampaignCreationAudit } from './google-ads-campaign-creation-audit.mjs?v=2';
import { parseGoogleAdsCampaignName } from './google-ads-campaign-name-parser.mjs?v=6';
import { normalizeGoogleAdsCountryCodeInput, normalizeGoogleAdsCountryCodes } from './google-ads-country-codes.mjs?v=1';
import { googleAdsCampaignGeoTargetingFromPayload } from './google-ads-campaign-geo-targeting.mjs?v=1';
import { buildGoogleAdsCampaignBulkUploadCsv } from './google-ads-campaign-bulk-upload-csv.mjs?v=5';
import { ensureGoogleAdsCampaignIdUrlParameter } from './google-ads-campaign-url-suffix.mjs?v=1';
import { planCpaExpansion } from './google-ads-cpa-expansion.mjs?v=2';
import { resolveCpaExpansionTargets } from './google-ads-cpa-expansion-targets.mjs?v=1';
import { buildCpaExpansionEntries } from './google-ads-cpa-expansion-build.mjs?v=1';
import { createCpaExpansion, readCpaExpansion, transitionCpaExpansion, cpaExpansionBlocksSharedSteps } from './google-ads-cpa-expansion-store.mjs?v=2';
import { runCpaExpansion } from './google-ads-cpa-expansion-runner.mjs?v=3';
import { DELIVERY_MANUAL_STEPS, DELIVERY_SHARED_STEPS, campaignSetSignature, campaignSitelinksSignature as sitelinksSignatureForLinks, sharedStepStatus, pendingDeliveryManualSteps, linkedLegacyPresellJobIds, campaignDeliverySettingsVerified } from '../campaign-delivery/progress-domain.mjs?v=8';
import {deliveryCpaLevels,resolveDeliveryCpaSelection,prepareDeliveryCampaign,convertGoogleAdsCurrencyAmount,suggestedGoogleAdsDailyBudget,calculateGoogleAdsCommissionCpa} from './google-ads-auto-delivery-domain.mjs?v=4';
import {formatCommissionUsd,isCommissionUsd} from '../campaign-delivery/commission-domain.mjs?v=2';
import {getAll as getClickBankRecords,STORES as clickBankStores} from '../curadoria/clickbank-top-offers/clickbank-top-offers-storage.mjs?v=17';
import { listClickBankKeywordSources } from './google-ads-clickbank-keyword-bridge.mjs?v=3';
import { getCampaignDelivery } from '../campaign-delivery/delivery-store.mjs?v=17';
import { matchesGoogleAdsProductPhrase, readSelectedGoogleAdsPresellCampaignHandoff, resolveGoogleAdsPresellTargets } from './google-ads-presell-url-bridge.mjs?v=8';
import {
  GOOGLE_ADS_PRESELL_HANDOFF_QUERY_PARAM,
  GOOGLE_ADS_PRESELL_HANDOFF_JOB_QUERY_PARAM,
  acknowledgeGoogleAdsPresellCampaignHandoff,
  consumeGoogleAdsPresellCampaignHandoff,
  googleAdsPresellCampaignHandoffFingerprint,
  readGoogleAdsPresellCampaignHandoff,
  validateGoogleAdsPresellCampaignHandoff,
} from './google-ads-presell-campaign-handoff.mjs?v=4';
import { latestGoogleAdsCampaignIteration, makeSequencedGoogleAdsCampaignName, normalizeCampaignSequenceProduct } from './google-ads-campaign-sequence-domain.mjs?v=1';
import { GOOGLE_ADS_CAMPAIGN_SEQUENCE_STORAGE_KEY, readGoogleAdsCampaignSequenceReservations, reserveGoogleAdsCampaignSequence } from './google-ads-campaign-sequence-storage.mjs?v=1';
import { openGoogleAdsResourcesViaExtension, readGoogleAdsResourceBookmarksViaExtension } from './google-ads-resources-bridge.mjs?v=2';
import {
  GOOGLE_ADS_RESOURCE_BOOKMARKS_STORAGE_KEY,
  loadGoogleAdsResourceBookmarks,
  matchGoogleAdsResourceBookmark,
  saveGoogleAdsResourceBookmarks,
  summarizeGoogleAdsResourceBookmarkMatches,
} from './google-ads-resource-bookmarks.mjs?v=1';
import { GOOGLE_ADS_CAMPAIGN_BOOKMARKS_STORAGE_KEY, loadGoogleAdsCampaignBookmarks, matchGoogleAdsCampaignBookmark, saveGoogleAdsCampaignBookmarks } from './google-ads-campaign-bookmarks.mjs?v=2';
import { GOOGLE_ADS_MANAGER_BOOKMARKS_STORAGE_KEY, loadGoogleAdsManagerBookmarks, saveGoogleAdsManagerBookmarks } from './google-ads-manager-bookmarks.mjs?v=1';
import {
  createGoogleAdsAccountImageEligibilityStorage,
  GOOGLE_ADS_ACCOUNT_IMAGE_ELIGIBILITY_STORAGE_KEY,
  GOOGLE_ADS_ACCOUNT_IMAGE_API_STATUS_STORAGE_KEY,
} from './google-ads-account-image-eligibility-storage.mjs?v=2';

const mountedRoots = new WeakMap();
const GOOGLE_ADS_COPY_IMPORT_SOURCE_KEY = 'google-ads-copy-import-source-v1';
const GOOGLE_ADS_CONFIGURED_AUDIENCE_COUNT = 918;
const CPA_VARIANT_MIN_PERCENT = 30;
const CPA_VARIANT_MAX_PERCENT = 80;
const CPA_VARIANT_STEP_PERCENT = 10;
const LEGACY_CPA_VARIANT_OPTIONS = [40, 50, 60, 70, 80];
const audienceExclusionLabels = Object.freeze([
  'Usuários avançados de serviços em nuvem',
  'Empregos em marketing e vendas',
  'Armazenamento em nuvem e dados hospedados',
  'Serviços de SEO e SEM',
  'Serviços de e-mail marketing',
  'Serviços de publicidade e marketing',
  'Soluções de CRM',
  'Registro de domínio',
  'Hospedagem na web',
  'Desenvolvimento de websites e webdesign',
  'Softwares empresariais',
  'Tecnologia de negócios',
  'Serviços da web',
]);
const definitiveCreationFailureCodes = new Set([
  'campaign_creation_disabled', 'campaign_account_not_allowed', 'campaign_country_not_targetable',
  'campaign_country_limit_exceeded', 'campaign_currency_mismatch', 'campaign_name_already_exists',
  'campaign_name_conflict', 'invalid_payload', 'api_unavailable', 'api_not_configured',
  'credentials_missing', 'not_authorized', 'origin_not_allowed', 'method_not_allowed',
  'google_ads_auth_failed', 'google_ads_access_denied', 'google_ads_quota_exceeded', 'google_ads_request_rejected',
  'private_service_unavailable',
]);

function formatMoneyMicros(micros, currency) {
  if (micros === null || micros === undefined || micros === '') return 'não se aplica';
  const amount = Number(micros) / 1_000_000;
  if (!Number.isFinite(amount)) return 'valor não informado';
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount); }
  catch { return amount.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' ' + currency; }
}

function roundCurrencyAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? (Math.round((amount + Number.EPSILON) * 100) / 100).toFixed(2) : '';
}

function isUsableUsdBrlQuote(quote) {
  const rate = Number(quote?.rate);
  return Number.isFinite(rate) && rate > 0 && rate <= 100 && quote?.isFallback !== true;
}

function makeFields() {
  const headlines = Array.from({ length: 10 }, (_, index) => '<label class="google-ads-creation-field"><span>Título ' + (index + 1) + ' <small>até 30 caracteres</small></span><input class="input" name="headline" type="text" maxlength="30" required autocomplete="off"></label>').join('');
  const descriptions = Array.from({ length: 3 }, (_, index) => '<label class="google-ads-creation-field"><span>Descrição ' + (index + 1) + ' <small>até 90 caracteres</small></span><textarea class="input" name="description" maxlength="90" rows="2" required></textarea></label>').join('');
  const occasionOptions = [
    ['', 'Nenhuma'], ['BACK_TO_SCHOOL', 'Volta às aulas'], ['BLACK_FRIDAY', 'Black Friday'], ['BOXING_DAY', 'Boxing Day'],
    ['CARNIVAL', 'Carnaval'], ['CHINESE_NEW_YEAR', 'Ano Novo Chinês'], ['CHRISTMAS', 'Natal'], ['CYBER_MONDAY', 'Cyber Monday'],
    ['DIWALI', 'Diwali'], ['EASTER', 'Páscoa'], ['EID_AL_ADHA', 'Eid al-Adha'], ['EID_AL_FITR', 'Eid al-Fitr'],
    ['END_OF_SEASON', 'Fim de temporada'], ['EPIPHANY', 'Epifania'], ['FALL_SALE', 'Liquidação de outono'], ['FATHERS_DAY', 'Dia dos Pais'],
    ['HALLOWEEN', 'Halloween'], ['HANUKKAH', 'Hanukkah'], ['HOLI', 'Holi'], ['INDEPENDENCE_DAY', 'Dia da Independência'],
    ['LABOR_DAY', 'Dia do Trabalho'], ['MOTHERS_DAY', 'Dia das Mães'], ['NATIONAL_DAY', 'Dia Nacional'], ['NAVRATRI', 'Navratri'],
    ['NEW_YEARS', 'Ano Novo'], ['PARENTS_DAY', 'Dia dos Pais e das Mães'], ['PASSOVER', 'Pessach'], ['RAMADAN', 'Ramadã'],
    ['ROSH_HASHANAH', 'Rosh Hashaná'], ['SINGLES_DAY', 'Dia dos Solteiros'], ['SONGKRAN', 'Songkran'], ['SPRING_SALE', 'Liquidação de primavera'],
    ['ST_NICHOLAS_DAY', 'Dia de São Nicolau'], ['SUMMER_SALE', 'Liquidação de verão'], ['VALENTINES_DAY', 'Dia dos Namorados'],
    ['WINTER_SALE', 'Liquidação de inverno'], ['WOMENS_DAY', 'Dia da Mulher'], ['YEAR_END_GIFT', 'Presentes de fim de ano'],
  ].map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join('');
  return [
    '<div class="google-ads-creation-page">',
    '<section class="google-ads-creation-page-card" aria-labelledby="googleAdsCreationPageTitle">',
    '<header class="google-ads-creation-page-header"><div class="google-ads-creation-page-heading"><div class="google-ads-eyebrow">CRIAÇÃO CONTROLADA</div><h2 id="googleAdsCreationPageTitle">Nova campanha de Pesquisa</h2></div><div class="google-ads-creation-header-buttons"><button class="btn" type="button" data-google-ads-campaign-association-open>Associar campanhas existentes</button><button class="btn" type="button" data-google-ads-creation-refresh>Atualizar MCCs e contas</button></div><div class="google-ads-creation-header-actions"><div class="google-ads-creation-draft-controls"><div class="google-ads-creation-draft-picker"><label for="googleAdsDraftPickerTrigger">Contexto da campanha · preparação e lotes</label><div class="google-ads-creation-draft-select-wrap"><select id="googleAdsDraftPicker" class="input google-ads-creation-draft-native" data-google-ads-draft-picker aria-label="Selecionar contexto de campanha" aria-hidden="true" tabindex="-1" hidden></select><button id="googleAdsDraftPickerTrigger" class="input google-ads-creation-draft-trigger" type="button" data-google-ads-draft-trigger aria-haspopup="listbox" aria-expanded="false" aria-controls="googleAdsDraftMenu">Nova campanha · ainda não salva</button><div id="googleAdsDraftMenu" class="google-ads-creation-draft-menu" role="listbox" aria-label="Preparação e lotes" hidden></div></div></div><button class="btn" type="button" data-google-ads-new-draft>Nova campanha</button></div><small class="google-ads-creation-draft-status" data-google-ads-draft-status role="status" aria-label="Estado da preparação" aria-live="polite"></small><small class="google-ads-creation-draft-status google-ads-campaign-batch-status" data-google-ads-campaign-batch-status role="status" aria-label="Estado do lote" aria-live="polite"></small></div></header>',
    '<section class="google-ads-hub-campaign-recovery" data-google-ads-hub-campaign-recovery hidden aria-label="Vínculo local de campanhas criadas pelo Hub"><div><strong>Campanhas criadas neste Hub</strong><small>Use os IDs já salvos nos lotes para vinculá-las à base e às capturas guardadas, sem consultar o Google Ads.</small><small data-google-ads-hub-campaign-recovery-status role="status" aria-live="polite"></small></div><button class="btn" type="button" data-google-ads-hub-campaign-recovery-button></button></section>',
    '<section class="google-ads-creation-mode" aria-labelledby="googleAdsCreationModeTitle"><fieldset><legend id="googleAdsCreationModeTitle">Escolha como criar as campanhas</legend><div class="google-ads-creation-mode-options"><label><input type="radio" name="google_ads_creation_mode" value="api" data-google-ads-creation-mode checked><span><strong>API do Hub</strong><small>Validar a prévia e criar campanhas pausadas pelo Hub.</small></span></label><label><input type="radio" name="google_ads_creation_mode" value="csv" data-google-ads-creation-mode><span><strong>CSV para Google Ads online</strong><small>Baixar o arquivo, importar no Google Ads e acompanhar o fluxo CSV.</small></span></label></div><p data-google-ads-creation-mode-status role="status" aria-live="polite"></p></fieldset></section>',
    '<form class="google-ads-creation-form" novalidate>',
    '<div class="google-ads-creation-account-grid">',
    '<label class="google-ads-creation-field"><span>MCC</span><select class="input" name="manager" required></select></label>',
    '<label class="google-ads-creation-field"><span>Conta de referência e fallback</span><select class="input google-ads-creation-account-select" name="account" required></select></label>',
    '</div>',
    '<section class="google-ads-campaign-targets" aria-label="Contas de destino da campanha"><div><h3 data-google-ads-campaign-targets-title>Contas de destino</h3><p data-google-ads-campaign-targets-status role="status" aria-live="polite">Ao calcular o nome, o Hub identifica as contas e URLs selecionadas na Ficha e Presell.</p><small class="google-ads-campaign-targets-help" data-google-ads-campaign-targets-help>Links da MCC e de Campanhas podem ficar em contas ou em contas > pag recursos; links de Recursos ficam em contas > pag recursos. O Hub associa pelo nome ou ID salvo no título.</small><small class="google-ads-campaign-targets-bookmarks-status" data-google-ads-resource-bookmarks-status role="status" aria-live="polite" hidden></small></div><ul data-google-ads-campaign-targets-list></ul></section>',
    '<p class="google-ads-creation-status" role="status" aria-live="polite"></p>',
    '<fieldset class="google-ads-creation-fields" disabled>',
    '<div class="google-ads-creation-budget-grid"><div class="google-ads-creation-name-field"><label class="google-ads-creation-field"><span>Novo nome da campanha</span><input class="input" name="campaign_name" type="text" maxlength="128" required autocomplete="off"><small class="google-ads-creation-help" data-google-ads-batch-campaign-reference hidden></small></label><button class="btn google-ads-creation-calculate" type="button" data-google-ads-campaign-name-calculate>Calcular informações</button></div><label class="google-ads-creation-field"><span>Orçamento diário <small data-creation-currency>moeda da conta</small></span><input class="input" name="daily_budget" type="text" inputmode="decimal" value="100" placeholder="100" required></label><label class="google-ads-creation-field" data-bidding-field="max-cpc" hidden><span data-max-cpc-label>CPC máximo <small data-creation-currency>moeda da conta</small></span><input class="input" name="max_cpc_bid" type="text" inputmode="decimal" placeholder="2,00"></label></div>',
    '<label class="google-ads-creation-field"><span>Comissão da oferta (USD)</span><input class="input" type="text" data-clickbank-commission-field readonly placeholder="Comissão não informada"><small class="google-ads-creation-help">Valor recebido da oferta na Curadoria.</small></label>',
    '<fieldset class="google-ads-creation-field google-ads-brand-bidding-field"><legend>Brand bidding da Curadoria</legend><div class="google-ads-brand-bidding-options" role="radiogroup" aria-label="Brand bidding da Curadoria"><label><input type="radio" name="brand_bidding" value="no_brand_bidding" data-curation-brand-bidding><span>NBB · No brand bidding</span></label><label><input type="radio" name="brand_bidding" value="brand_bidding" data-curation-brand-bidding><span>BB · Brand bidding</span></label></div><small class="google-ads-creation-help">A classificação vem da Curadoria; você pode escolher o padrão desta campanha.</small></fieldset>',
    '<h3>Segmentação e lances</h3>',
    '<div class="google-ads-creation-settings-grid">',
    '<label class="google-ads-creation-field"><span>Estratégia de lances</span><select class="input" name="bidding_strategy" required><option value="TARGET_CPA" selected>CPA desejado</option><option value="MAXIMIZE_CONVERSIONS">Maximizar conversões</option><option value="TARGET_ROAS">ROAS desejado</option><option value="MAXIMIZE_CONVERSION_VALUE">Maximizar valor da conversão</option><option value="MAXIMIZE_CLICKS">Maximizar cliques</option><option value="TARGET_IMPRESSION_SHARE">Parcela de impressões desejada</option><option value="MANUAL_CPC">CPC manual</option></select></label>',
    '<label class="google-ads-creation-field" data-bidding-field="target-cpa"><span data-target-cpa-label>CPA desejado <small data-bid-currency>moeda da conta</small></span><input class="input" name="target_cpa" type="text" inputmode="decimal" placeholder="88,50"></label>',
    '<label class="google-ads-creation-field" data-bidding-field="target-roas" hidden><span>ROAS desejado <small>percentual, por exemplo 200</small></span><input class="input" name="target_roas_percent" type="text" inputmode="decimal" placeholder="200"></label>',
    '<label class="google-ads-creation-field" data-bidding-field="impression-share" hidden><span>Local da parcela de impressões</span><select class="input" name="impression_share_location"><option value="">Selecione</option><option value="ANYWHERE_ON_PAGE">Em qualquer lugar da página</option><option value="TOP_OF_PAGE">Parte superior da página</option><option value="ABSOLUTE_TOP_OF_PAGE">Primeira posição absoluta</option></select></label>',
    '<label class="google-ads-creation-field" data-bidding-field="impression-share" hidden><span>Parcela de impressões desejada <small>1–100%</small></span><input class="input" name="impression_share_percent" type="text" inputmode="decimal" placeholder="80"></label>',
    '<label class="google-ads-creation-field"><span data-google-ads-geo-label>Países alvo <small>códigos de 2 letras, separados por vírgula; UK é normalizado para GB</small></span><input class="input" name="geo_target_country_codes" type="text" placeholder="DE, FR, US, UK" required autocomplete="off"><small class="google-ads-creation-help" data-google-ads-delivery-geo-status role="status" aria-live="polite" hidden></small><small class="google-ads-creation-help" data-google-ads-country-normalization-status role="status" aria-live="polite" hidden></small></label>',
    '<input type="hidden" name="keyword_match_type" value="BROAD">',
    '<input type="hidden" name="negative_keyword_match_type" value="BROAD">',
    '<div class="google-ads-clickbank-keyword-source"><div data-google-ads-clickbank-manual-controls><label class="google-ads-creation-field"><span>Oferta da Curadoria <small>vincula as candidatas de Google Trends e Google Imagens</small></span><select class="input" name="clickbank_offer_key" data-google-ads-clickbank-offer><option value="">Selecione uma oferta</option></select></label></div><small class="google-ads-clickbank-keyword-status" data-google-ads-clickbank-status role="status" aria-live="polite">As ofertas e candidatas são lidas localmente ao abrir a tela; uma entrega da Curadoria seleciona a oferta automaticamente. Esta leitura não consulta a API do Google Ads.</small><small class="google-ads-clickbank-keyword-status" data-google-ads-clickbank-commission-status role="status" aria-live="polite"></small></div>',
    '<label class="google-ads-creation-field"><span>Palavras-chave <small>uma por linha: [exata], &quot;frase&quot; ou ampla</small></span><div class="google-ads-keyword-editor"><div class="google-ads-keyword-types" aria-hidden="true"><div data-keyword-types="keywords"></div></div><textarea class="input" name="keywords" wrap="off" rows="5" maxlength="9000" required placeholder="exemplo de busca\noutro termo de busca"></textarea></div></label>',
    '<label class="google-ads-creation-field"><span>Palavras-chave negativas <small>uma por linha: [exata], &quot;frase&quot; ou ampla</small></span><div class="google-ads-keyword-editor"><div class="google-ads-keyword-types" aria-hidden="true"><div data-keyword-types="negative_keywords"></div></div><textarea class="input" name="negative_keywords" wrap="off" rows="5" maxlength="9000" placeholder="termo a excluir"></textarea></div></label>',
    '<div class="google-ads-clickbank-keyword-source google-ads-clickbank-negative-source"><div class="google-ads-clickbank-keyword-actions"><button class="btn primary" type="button" data-google-ads-clickbank-import-all disabled>Importar palavras-chave da Curadoria</button></div><small class="google-ads-clickbank-keyword-status" data-google-ads-clickbank-negative-status role="status" aria-live="polite">Selecione a oferta e clique para trazer as candidatas positivas do Google Trends e as negativas do Google Imagens para os campos acima.</small></div>',
    '<label class="google-ads-creation-field"><span>Declaração de publicidade política da UE</span><select class="input" name="contains_eu_political_advertising" required><option value="">Selecione a declaração correta</option><option value="DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING" selected>Não contém publicidade política</option><option value="CONTAINS_EU_POLITICAL_ADVERTISING">Contém publicidade política</option></select></label>',
    '</div><p class="google-ads-creation-help" data-bidding-help>CPA desejado exige uma ação de conversão principal configurada na conta. A lista de estratégias é fixa e não consulta a API. O MVP permite segmentar países inteiros ou usar Mundo sem critérios geográficos positivos. Pesquisa Google é sempre incluída; parceiros e Display são opcionais.</p><p class="google-ads-creation-help">A declaração da UE precisa refletir o conteúdo real dos anúncios.</p>',
    '<fieldset class="google-ads-creation-network-options"><legend>Redes adicionais</legend><label><input name="target_search_network" type="checkbox"> Parceiros da Rede de Pesquisa do Google</label><label><input name="target_content_network" type="checkbox"> Rede de Display</label></fieldset>',
    '<div class="google-ads-creation-settings-grid"><label class="google-ads-creation-field"><span>Modelo de acompanhamento <small>opcional; aplicado à campanha</small></span><input class="input" name="tracking_url_template" type="text" maxlength="2048" placeholder="https://rastreador.example/?url={lpurl}"></label><label class="google-ads-creation-field"><span>Sufixo da URL final <small>o Hub inclui utm_campaign={campaignid}; outros parâmetros são opcionais</small></span><input class="input" name="final_url_suffix" type="text" maxlength="1024" value="utm_campaign={campaignid}" placeholder="utm_campaign={campaignid}&amp;utm_source=google"></label></div>',
    '</fieldset>',
    '<details class="google-ads-copy-assets-details" data-google-ads-copy-assets-details><summary>Títulos e descrições</summary><div class="google-ads-copy-assets-content"><div class="google-ads-copy-assets-heading-row"><h3>10 títulos</h3><button class="btn primary" type="button" data-google-ads-copy-import-open>Colar copy do Gemini</button></div><fieldset class="google-ads-creation-fields google-ads-copy-assets-fields" disabled><div class="google-ads-creation-assets-grid">', headlines, '</div>',
    '<h3>3 descrições</h3><div class="google-ads-creation-assets-grid">', descriptions, '</div></fieldset>',
    '</div></details>',
    '<fieldset class="google-ads-creation-fields" disabled>',
    '<details class="google-ads-copy-assets-details" data-google-ads-promotion-details><summary>Recurso de promoção</summary><div class="google-ads-copy-assets-content"><div class="google-ads-creation-promotion-grid">',
    '<label class="google-ads-creation-field"><span>Ocasião</span><select class="input" name="promotion_occasion">', occasionOptions, '</select></label>',
    '<label class="google-ads-creation-field"><span>Idioma da promoção</span><input class="input" name="language_code" type="text" maxlength="20" placeholder="Detectado pela copy" required autocomplete="off" spellcheck="false"><small data-language-detection-status aria-live="polite">O idioma será detectado automaticamente pelos títulos e descrições. Você pode ajustar o código manualmente.</small></label>',
    '<label class="google-ads-creation-field"><span>Tipo de desconto</span><select class="input" name="discount_type"><option value="percent_off">Percentual</option><option value="amount_off">Valor fixo</option></select></label>',
    '<label class="google-ads-creation-field"><span data-discount-value-label>Desconto percentual (1–100)</span><input class="input" name="discount_value" type="text" inputmode="numeric" required placeholder="20"><small data-discount-detection-status aria-live="polite" hidden></small></label>',
    '<label class="google-ads-creation-field"><span>Item</span><input class="input" name="promotion_target" type="text" maxlength="20" required placeholder="Metabo Drops"><small data-google-ads-product-target-status role="status" aria-live="polite">O nome do produto será sugerido pela campanha e conferido na copy.</small></label>',
    '<label class="google-ads-creation-field"><span>URL final</span><input class="input" name="final_url" type="url" maxlength="2048" placeholder="https://exemplo.com/pagina" required autocomplete="url"><small data-google-ads-presell-url-status role="status" aria-live="polite">A URL da Ficha e Presell será usada quando o produto e a conta selecionados corresponderem.</small></label>',
    '<label class="google-ads-creation-field"><span>Detalhes da promoção</span><select class="input" name="trigger_type"><option value="none">Nenhuma</option><option value="promotion_code">Código promocional</option><option value="orders_over_amount">Pedido mínimo</option></select></label>',
    '<label class="google-ads-creation-field" data-promotion-trigger-field hidden><span data-trigger-value-label>Detalhe da promoção</span><input class="input" name="trigger_value" type="text" maxlength="20" disabled placeholder=""></label>',
    '<label class="google-ads-creation-field"><span>Data de início (opcional)</span><input class="input" name="start_date" type="date"></label>',
    '<label class="google-ads-creation-field"><span>Data de término (opcional)</span><input class="input" name="end_date" type="date"></label>',
    '</div><p class="google-ads-creation-help">A URL final será usada no anúncio e no recurso de promoção. O desconto fixo e o pedido mínimo usam a moeda da conta selecionada. Ocasião, detalhes e datas podem ficar como “Nenhuma”.</p></div></details>',
    '<input type="hidden" name="source_campaign_date"><input type="hidden" name="source_product"><input type="hidden" name="source_iteration"><input type="hidden" name="source_platform_code"><input type="hidden" name="source_platform"><input type="hidden" name="source_bidding_model_code"><input type="hidden" name="source_bidding_model"><input type="hidden" name="source_extra_tags"><input type="hidden" name="source_destination"><input type="hidden" name="source_commission_amount"><input type="hidden" name="source_commission_currency"><input type="hidden" name="source_target_cpa_percent"><input type="hidden" name="source_target_cpa_amount"><input type="hidden" name="source_target_cpa_currency"><input type="hidden" name="source_usd_brl_rate"><input type="hidden" name="source_usd_brl_quote_date"><input type="hidden" name="source_usd_brl_retrieved_at"><input type="hidden" name="derived_target_cpa_currency">',
    '</fieldset>',
    '<section class="google-ads-cpa-variants" aria-labelledby="googleAdsCpaVariantsTitle"><div><h3 id="googleAdsCpaVariantsTitle">Variações de CPA</h3><p data-cpa-variants-status role="status" aria-live="polite">Calcule as informações do nome para incluir o CPA base e escolher os próximos níveis para todas as contas.</p></div><div class="google-ads-cpa-variants-options" data-cpa-variants-options></div><div data-cpa-expansion-panel></div></section>',
    '<section class="google-ads-audience-targeting google-ads-audience-targeting--csv" aria-label="Segmentação e exclusões de públicos do lote">',
    '<div><h3 class="google-ads-audience-targeting-title">Segmentação por públicos <span class="google-ads-audience-targeting-spinner" data-google-ads-audience-loading hidden aria-hidden="true"></span></h3><p data-google-ads-audience-description>Os arquivos de segmentação e exclusões deste lote ficam reunidos aqui. A segmentação usa CSV por MCC; as exclusões usam Excel por MCC para importar manualmente no painel do Google Ads.</p></div>',
    '<div class="google-ads-audience-targeting-control" data-google-ads-audience-csv-panel></div>',
    '<section class="google-ads-audience-targeting-exclusions" aria-label="Arquivos de exclusões de público">',
    '<div><h4>Exclusões de público</h4><p>Baixe a planilha Excel com os públicos a excluir nas campanhas pendentes do lote e importe-a manualmente no painel do Google Ads. Baixar o arquivo não aplica alterações às campanhas.</p></div>',
    '<div class="google-ads-audience-exclusion-workbook-list" data-google-ads-audience-exclusion-exports></div><details><summary>Ver os 13 públicos</summary><ul>',
    audienceExclusionLabels.map(label => '<li>' + label + '</li>').join(''),
    '</ul></details></section></section>',
    '<section class="google-ads-campaign-bulk-csv" aria-labelledby="googleAdsCampaignBulkCsvTitle"><div><h3 id="googleAdsCampaignBulkCsvTitle">Criar campanhas pausadas pelo Google Ads online</h3><p>Gere aqui o CSV do modelo oficial de campanhas. O Hub só baixa o arquivo; não consulta nem altera a API. Se os destinos estiverem em mais de uma hierarquia, baixe um arquivo separado por MCC.</p></div><div class="google-ads-campaign-bulk-csv-controls"><label class="google-ads-creation-field" data-google-ads-campaign-csv-manager-field><span>MCC do upload</span><select class="input" data-google-ads-campaign-csv-manager></select></label><button class="btn primary" type="button" data-google-ads-campaign-csv-download disabled>Baixar CSV de campanhas pausadas</button></div><p class="google-ads-campaign-bulk-csv-warning">O CPA, o orçamento e o CPC são calculados na moeda de cada conta do ID indicado na linha, usando PTAX USD/BRL quando necessário; o Hub confere essa moeda antes de exportar. O CSV inclui a declaração “EU political ads” em cada campanha, com “No” para “Não contém” e “Yes” para “Contém”, conforme a seleção salva. Promoções não são carregadas por este CSV. O arquivo cria somente as campanhas: grupos de anúncios, anúncios, palavras-chave e recursos precisam de outras operações. O modelo online não oferece colunas documentadas para meta personalizada nem para o modo de local “Presença”; depois de associar as campanhas a um lote salvo, use a ação do Hub para aplicar esses ajustes via API e confira no Google Ads antes de ativar. Para Mundo, a coluna de local fica vazia e o alcance deve ser conferido na prévia do Google.</p><p class="google-ads-campaign-bulk-csv-status" data-google-ads-campaign-csv-status role="status" aria-live="polite"></p></section>',
    '<div class="google-ads-creation-mode-panel" data-google-ads-creation-mode-panel="api">',
    '<section class="google-ads-creation-preview" hidden aria-live="polite"><h3 data-google-ads-creation-preview-title>Verificação da prévia</h3><p data-google-ads-creation-preview-description>A API procura primeiro o nome exato em cada conta. Se já existir, mostra ID, status e grupos; se estiver livre, valida com validateOnly. As consultas usam cota de leitura; esta etapa não cria campanhas.</p><dl data-google-ads-creation-preview-details></dl></section>',
    '<section class="google-ads-creation-result" hidden role="status" aria-live="polite"></section>',
    '<footer class="google-ads-creation-actions"><button class="btn" type="button" data-google-ads-creation-preview disabled>Validar prévia</button><button class="btn" type="button" data-google-ads-creation-preview-next disabled>Validar próxima campanha</button><button class="btn primary" type="button" data-google-ads-creation-submit hidden disabled>Criar campanha pausada</button><p class="google-ads-creation-status google-ads-creation-status-bottom" data-google-ads-creation-status-bottom aria-live="off" hidden><span data-google-ads-creation-status-text></span><span class="google-ads-creation-status-spinner" data-google-ads-creation-status-spinner hidden aria-hidden="true"></span></p></footer>',
    '</div>',
    '</form></section>',
    '<dialog class="google-ads-copy-import-dialog" data-google-ads-copy-import-dialog aria-labelledby="googleAdsCopyImportTitle">',
    '<section class="google-ads-copy-import-panel">',
    '<header class="google-ads-copy-import-header"><div><div class="google-ads-eyebrow">IMPORTAÇÃO LOCAL</div><h2 id="googleAdsCopyImportTitle">Selecionar copy para a campanha</h2></div><button class="google-ads-copy-import-close" type="button" data-google-ads-copy-import-close aria-label="Fechar">×</button></header>',
    '<div class="google-ads-copy-import-source"><label class="google-ads-creation-field"><span>Resposta completa do Gemini</span><textarea class="input" data-google-ads-copy-import-input rows="3" placeholder="A resposta será lida da área de transferência. Se necessário, cole aqui."></textarea></label></div>',
    '<p class="google-ads-copy-import-status" data-google-ads-copy-import-status role="status" aria-live="polite"></p>',
    '<section class="google-ads-copy-import-results" data-google-ads-copy-import-results hidden>',
    '<div class="google-ads-copy-import-counts"><span data-copy-import-headline-count>0/10 títulos</span><span data-copy-import-description-count>0/3 descrições</span><span data-copy-import-promotion-count>0/1 promoção</span><span data-copy-import-sitelinks-count hidden>0/6 sitelinks</span></div>',
    '<div class="google-ads-copy-import-groups" data-google-ads-copy-import-groups></div>',
    '</section>',
    '<footer class="google-ads-copy-import-footer"><button class="btn" type="button" data-google-ads-copy-import-close>Fechar</button><button class="btn primary" type="button" data-google-ads-copy-import-apply disabled>Aplicar selecionados (10 títulos e 3 descrições)</button></footer>',
    '</section></dialog>',
    '<dialog class="google-ads-campaign-name-dialog" data-google-ads-campaign-name-dialog aria-labelledby="googleAdsCampaignNameDialogTitle"><section class="google-ads-campaign-name-panel"><header><div><div class="google-ads-eyebrow">LEITURA DO PADRÃO</div><h2 id="googleAdsCampaignNameDialogTitle">Informações da campanha</h2></div><button class="google-ads-copy-import-close" type="button" data-campaign-name-close aria-label="Fechar">×</button></header><div class="google-ads-campaign-name-content"><label class="google-ads-creation-field"><span>Nome para analisar</span><input class="input" type="text" data-campaign-name-source maxlength="128" autocomplete="off"></label><button class="btn" type="button" data-campaign-name-recalculate>Recalcular</button><p class="google-ads-campaign-name-status" data-campaign-name-status role="status" aria-live="polite"></p><dl data-campaign-name-details></dl></div><footer><button class="btn" type="button" data-campaign-name-close>Cancelar</button><button class="btn primary" type="button" data-campaign-name-apply>Aplicar nome, GEO e CPA calculado</button></footer></section></dialog>',
    '<dialog class="google-ads-image-eligibility-dialog" data-google-ads-image-eligibility-dialog aria-labelledby="googleAdsImageEligibilityTitle"><section class="google-ads-image-eligibility-panel"><header><div><div class="google-ads-eyebrow">VERIFICAÇÃO DA CONTA</div><h2 id="googleAdsImageEligibilityTitle">A conta permite recursos de imagem?</h2></div><button class="google-ads-copy-import-close" type="button" data-image-eligibility-close aria-label="Fechar">×</button></header><div class="google-ads-image-eligibility-content"><p data-image-eligibility-account></p><p>Confira a disponibilidade em Recursos no Google Ads e escolha o resultado. Essa informação fica salva neste navegador para esta conta.</p><div class="google-ads-image-eligibility-options"><button class="btn primary" type="button" data-image-eligibility-choice="allowed">Permite imagem</button><button class="btn" type="button" data-image-eligibility-choice="not_allowed">Não permite imagem</button></div></div><footer><button class="btn" type="button" data-image-eligibility-close>Cancelar</button></footer></section></dialog>',
    '<dialog class="google-ads-campaign-association-dialog" data-google-ads-campaign-association-dialog aria-labelledby="googleAdsCampaignAssociationTitle"><section class="google-ads-campaign-association-panel"><header><div><div class="google-ads-eyebrow">RECUPERAÇÃO DE CAMPANHAS</div><h2 id="googleAdsCampaignAssociationTitle">Identificar e associar campanhas existentes</h2></div><button class="google-ads-copy-import-close" type="button" data-campaign-association-close aria-label="Fechar">×</button></header><div class="google-ads-campaign-association-content"><p>A busca consulta campanhas Search nas contas marcadas e compara o produto exato no padrão do nome. Cada busca usa uma leitura por conta; associar confirma nomes, IDs e grupos com duas leituras por conta. As consultas usam cota do Google Ads. O lote fica neste navegador; nenhuma campanha é criada ou alterada.</p><label class="google-ads-creation-field"><span>Produto para identificar</span><input class="input" type="text" data-campaign-association-product autocomplete="off"></label><fieldset class="google-ads-campaign-association-accounts"><legend>Contas de destino</legend><div data-campaign-association-accounts></div></fieldset><div class="google-ads-campaign-association-search"><button class="btn primary" type="button" data-campaign-association-search>Buscar campanhas</button><small data-campaign-association-status role="status" aria-live="polite">A busca só começa quando você clicar.</small></div><section class="google-ads-campaign-association-results" data-campaign-association-results hidden><div class="google-ads-campaign-association-results-header"><strong data-campaign-association-summary></strong><button class="btn" type="button" data-campaign-association-select-all hidden>Selecionar todas</button></div><ul data-campaign-association-list></ul></section></div><footer><button class="btn" type="button" data-campaign-association-close>Fechar</button><button class="btn primary" type="button" data-campaign-association-save disabled>Associar selecionadas (0)</button></footer></section></dialog></div>',
  ].join('');
}

export function mountGoogleAdsCampaignCreation({ root, campaignNames = [], getCampaignNames = null, getUsdBrlQuote = null, refreshUsdBrlQuote = null, forceRefreshUsdBrlQuote = null, onCampaignCreated = null, onCampaignsCreated = null, onRegisterSavedHubCampaigns = null, getSavedHubCampaignRecoveryStatus = null } = {}) {
  if (!root) throw new Error('A área de criação de campanhas Google Ads não foi encontrada.');
  const handoffQueryId = new URLSearchParams(window.location.search).get(GOOGLE_ADS_PRESELL_HANDOFF_QUERY_PARAM) || '';
  const handoffJobQueryId = new URLSearchParams(window.location.search).get(GOOGLE_ADS_PRESELL_HANDOFF_JOB_QUERY_PARAM) || '';
  const campaignDeliveryQueryId = new URLSearchParams(window.location.search).get('campaign_delivery_id') || '';
  const existing = mountedRoots.get(root);
  if (existing) {
    existing.syncDirectoryFromCache();
    existing.syncCampaignNames(Array.isArray(campaignNames) && campaignNames.length ? campaignNames : getCampaignNames?.() || []);
    existing.syncFichaTargets();
    existing.receiveInitialContexts?.();
    existing.refreshHubCampaignRecovery?.();
    return existing;
  }
  root.dataset.googleAdsCampaignCreationMounted = 'true';
  root.innerHTML = makeFields();
  const form = root.querySelector('form');
  const page = root.querySelector('.google-ads-creation-page');
  const geoCountryField = form.elements.namedItem('geo_target_country_codes');
  const geoCountryNormalizationStatus = page.querySelector('[data-google-ads-country-normalization-status]');
  let geoCountryNormalizationMessage = '';
  function setGeoCountryNormalizationStatus(aliases = []) {
    const corrections = [...new Map((Array.isArray(aliases) ? aliases : []).map(alias => [alias.from + ':' + alias.to, alias])).values()];
    geoCountryNormalizationMessage = corrections.length
      ? 'Código normalizado para a Google Ads API: ' + corrections.map(alias => alias.from + ' → ' + alias.to).join(', ')
        + (corrections.some(alias => alias.from === 'UK' && alias.to === 'GB') ? ' (Reino Unido).' : '.')
      : '';
    geoCountryNormalizationStatus.textContent = geoCountryNormalizationMessage;
    geoCountryNormalizationStatus.hidden = !geoCountryNormalizationMessage;
  }
  function normalizeGeoCountryField() {
    const normalized = normalizeGoogleAdsCountryCodeInput(geoCountryField.value);
    if (normalized.aliases.length) {
      const value = normalized.countryCodes.join(', ');
      if (geoCountryField.value !== value) {
        geoCountryField.value = value;
        clearPreview();
        scheduleDraftSave({ force: true });
      }
      setGeoCountryNormalizationStatus(normalized.aliases);
    }
    return normalized;
  }
  function updateCampaignDeliveryGeoField(source = campaignDeliverySource) {
    const world = source?.geoTargetingMode === 'WORLD';
    const label = page.querySelector('[data-google-ads-geo-label]');
    const status = page.querySelector('[data-google-ads-delivery-geo-status]');
    geoCountryField.required = !world;
    geoCountryField.readOnly = world;
    geoCountryField.placeholder = world ? 'Mundo — sem país específico' : 'DE, FR, US, UK';
    if (label) label.innerHTML = world
      ? 'Destino geográfico'
      : 'Países alvo <small>códigos de 2 letras, separados por vírgula; UK é normalizado para GB</small>';
    if (status) {
      status.textContent = world
        ? 'Mundo selecionado na Curadoria: a campanha será criada sem critérios positivos de país e poderá alcançar todas as regiões.'
        : '';
      status.hidden = !world;
    }
    if (world) geoCountryField.value = '';
  }
  const managerSelect = form.elements.namedItem('manager');
  const accountSelect = form.elements.namedItem('account');
  const fields = [...page.querySelectorAll('.google-ads-creation-fields')];
  const copyAssetsDetails = page.querySelector('[data-google-ads-copy-assets-details]');
  const promotionDetails = page.querySelector('[data-google-ads-promotion-details]');
  form.addEventListener('invalid', event => {
    if (copyAssetsDetails.contains(event.target)) copyAssetsDetails.open = true;
    if (promotionDetails.contains(event.target)) promotionDetails.open = true;
  }, true);
  const status = page.querySelector('.google-ads-creation-status');
  const bottomStatus = page.querySelector('[data-google-ads-creation-status-bottom]');
  const bottomStatusText = bottomStatus.querySelector('[data-google-ads-creation-status-text]');
  const bottomStatusSpinner = bottomStatus.querySelector('[data-google-ads-creation-status-spinner]');
  const previewButton = page.querySelector('[data-google-ads-creation-preview]');
  const previewNextButton = page.querySelector('[data-google-ads-creation-preview-next]');
  const createButton = page.querySelector('[data-google-ads-creation-submit]');
  const campaignCsvManagerField = page.querySelector('[data-google-ads-campaign-csv-manager-field]');
  const campaignCsvManagerSelect = page.querySelector('[data-google-ads-campaign-csv-manager]');
  const campaignCsvDownloadButton = page.querySelector('[data-google-ads-campaign-csv-download]');
  const campaignCsvStatus = page.querySelector('[data-google-ads-campaign-csv-status]');
  const creationModeStorageKey = 'hub:google-ads:campaign-creation-mode:v1';
  const creationModeInputs = [...page.querySelectorAll('[data-google-ads-creation-mode]')];
  const creationModeStatus = page.querySelector('[data-google-ads-creation-mode-status]');
  const creationModeApiPanel = page.querySelector('[data-google-ads-creation-mode-panel="api"]');
  const creationModeCsvPanel = page.querySelector('.google-ads-campaign-bulk-csv');
  function campaignCreationMode() {
    return creationModeInputs.find(input => input.checked)?.value === 'csv' ? 'csv' : 'api';
  }
  function setCampaignCreationMode(mode, persist = true) {
    const selectedMode = mode === 'csv' ? 'csv' : 'api';
    creationModeInputs.forEach(input => { input.checked = input.value === selectedMode; });
    if (creationModeApiPanel) creationModeApiPanel.hidden = selectedMode !== 'api';
    if (creationModeCsvPanel) creationModeCsvPanel.hidden = selectedMode !== 'csv';
    if (creationModeStatus) {
      creationModeStatus.textContent = selectedMode === 'csv'
        ? 'Modo CSV: o Hub gera o arquivo para importar no Google Ads online. Ele cria somente campanhas; grupos, anúncios e ajustes de presença/meta seguem etapas próprias.'
        : 'Modo API: a prévia e a criação pausada continuam sendo executadas pelo Hub, com o fluxo existente.';
    }
    if (persist) {
      try { window.localStorage.setItem(creationModeStorageKey, selectedMode); } catch {}
    }
  }
  let savedCreationMode = 'api';
  try {
    const storedMode = window.localStorage.getItem(creationModeStorageKey);
    if (storedMode === 'api' || storedMode === 'csv') savedCreationMode = storedMode;
  } catch {}
  creationModeInputs.forEach(input => input.addEventListener('change', () => {
    if (input.checked) {
      setCampaignCreationMode(input.value);
      renderCampaignResult();
    }
  }));
  setCampaignCreationMode(savedCreationMode, false);
  const campaignCsvControls = page.querySelector('.google-ads-campaign-bulk-csv-controls');
  const campaignCsvWorkflowButton = document.createElement('button');
  campaignCsvWorkflowButton.type = 'button';
  campaignCsvWorkflowButton.className = 'btn google-ads-campaign-csv-workflow-launch';
  campaignCsvWorkflowButton.textContent = 'Subir campanha pelo fluxo CSV';
  campaignCsvWorkflowButton.setAttribute('aria-haspopup', 'dialog');
  campaignCsvControls?.append(campaignCsvWorkflowButton);
  const campaignCsvWorkflowDialog = document.createElement('dialog');
  campaignCsvWorkflowDialog.className = 'google-ads-campaign-csv-workflow-dialog';
  campaignCsvWorkflowDialog.setAttribute('aria-labelledby', 'googleAdsCampaignCsvWorkflowTitle');
  const campaignCsvWorkflowPanel = document.createElement('section');
  campaignCsvWorkflowPanel.className = 'google-ads-campaign-csv-workflow-panel';
  const campaignCsvWorkflowHeader = document.createElement('header');
  campaignCsvWorkflowHeader.className = 'google-ads-campaign-csv-workflow-header';
  const campaignCsvWorkflowTitle = document.createElement('h2');
  campaignCsvWorkflowTitle.id = 'googleAdsCampaignCsvWorkflowTitle';
  campaignCsvWorkflowTitle.textContent = 'Subir campanha pelo fluxo CSV';
  const campaignCsvWorkflowClose = document.createElement('button');
  campaignCsvWorkflowClose.type = 'button';
  campaignCsvWorkflowClose.className = 'btn';
  campaignCsvWorkflowClose.textContent = 'Fechar';
  campaignCsvWorkflowClose.addEventListener('click', () => campaignCsvWorkflowDialog.close());
  campaignCsvWorkflowHeader.append(campaignCsvWorkflowTitle, campaignCsvWorkflowClose);
  const campaignCsvWorkflowBody = document.createElement('div');
  campaignCsvWorkflowBody.className = 'google-ads-campaign-csv-workflow-body';
  campaignCsvWorkflowPanel.append(campaignCsvWorkflowHeader, campaignCsvWorkflowBody);
  campaignCsvWorkflowDialog.append(campaignCsvWorkflowPanel);
  page.append(campaignCsvWorkflowDialog);
  const nameCalculateButton = page.querySelector('[data-google-ads-campaign-name-calculate]');
  const nameParseDialog = page.querySelector('[data-google-ads-campaign-name-dialog]');
  const nameParseInput = page.querySelector('[data-campaign-name-source]');
  const nameParseStatus = page.querySelector('[data-campaign-name-status]');
  const nameParseDetails = page.querySelector('[data-campaign-name-details]');
  const nameParseApplyButton = page.querySelector('[data-campaign-name-apply]');
  const biddingStrategyField = form.elements.namedItem('bidding_strategy');
  const targetCpaField = form.elements.namedItem('target_cpa');
  const targetRoasField = form.elements.namedItem('target_roas_percent');
  const maxCpcBidField = form.elements.namedItem('max_cpc_bid');
  const derivedCpaCurrencyField = form.elements.namedItem('derived_target_cpa_currency');
  const previewArea = page.querySelector('.google-ads-creation-preview');
  const previewDetails = page.querySelector('[data-google-ads-creation-preview-details]');
  const previewTitle = page.querySelector('[data-google-ads-creation-preview-title]');
  const previewDescription = page.querySelector('[data-google-ads-creation-preview-description]');
  const resultArea = page.querySelector('.google-ads-creation-result');
  const cpaVariantsStatus = page.querySelector('[data-cpa-variants-status]');
  const cpaVariantsOptions = page.querySelector('[data-cpa-variants-options]');
  const cpaExpansionPanel = page.querySelector('[data-cpa-expansion-panel]');
  const campaignTargetsStatus = page.querySelector('[data-google-ads-campaign-targets-status]');
  const campaignTargetsList = page.querySelector('[data-google-ads-campaign-targets-list]');
  const campaignTargetsTitle = page.querySelector('[data-google-ads-campaign-targets-title]');
  const campaignTargetsHelp = page.querySelector('[data-google-ads-campaign-targets-help]');
  const campaignTargetsBookmarkStatus = page.querySelector('[data-google-ads-resource-bookmarks-status]');
  const batchCampaignReference = page.querySelector('[data-google-ads-batch-campaign-reference]');
  const imageEligibilityDialog = page.querySelector('[data-google-ads-image-eligibility-dialog]');
  const imageEligibilityAccount = page.querySelector('[data-image-eligibility-account]');
  let pendingImageEligibilityAccountId = '';
  let accountDirectoryEmailStorage;
  try { accountDirectoryEmailStorage = createAccountDirectoryEmailStorage(window.localStorage); }
  catch { accountDirectoryEmailStorage = createAccountDirectoryEmailStorage(null); }
  let accountImageEligibilityStorage;
  try { accountImageEligibilityStorage = createGoogleAdsAccountImageEligibilityStorage(window.localStorage); }
  catch { accountImageEligibilityStorage = createGoogleAdsAccountImageEligibilityStorage(null); }
  let resourceBookmarks = [];
  try { resourceBookmarks = loadGoogleAdsResourceBookmarks(window.localStorage); }
  catch { resourceBookmarks = loadGoogleAdsResourceBookmarks(null); }
  let resourceBookmarkSyncNotice = null;
  let campaignBookmarks = [];
  try { campaignBookmarks = loadGoogleAdsCampaignBookmarks(window.localStorage); }
  catch { campaignBookmarks = loadGoogleAdsCampaignBookmarks(null); }
  let managerBookmarks = [];
  try { managerBookmarks = loadGoogleAdsManagerBookmarks(window.localStorage); }
  catch { managerBookmarks = loadGoogleAdsManagerBookmarks(null); }
  const getCpaVariantLabels = () => [...cpaVariantsOptions.querySelectorAll('[data-cpa-variant-label]')];
  const audienceTargetingDescription = page.querySelector('[data-google-ads-audience-description]');
  const audienceTargetingLoadingIndicator = page.querySelector('[data-google-ads-audience-loading]');
  const audienceTargetingCsvPanel = page.querySelector('[data-google-ads-audience-csv-panel]');
  const refreshButton = page.querySelector('[data-google-ads-creation-refresh]');
  const copyImportOpenButton = page.querySelector('[data-google-ads-copy-import-open]');
  const draftPicker = page.querySelector('[data-google-ads-draft-picker]');
  const draftPickerWrap = page.querySelector('.google-ads-creation-draft-select-wrap');
  const draftPickerTrigger = page.querySelector('[data-google-ads-draft-trigger]');
  const draftPickerMenu = page.querySelector('[role="listbox"][aria-label="Preparação e lotes"]');
  const draftPickerCard = page.querySelector('.google-ads-creation-page-card');
  let draftPickerMenuOpen = false;
  const newDraftButton = page.querySelector('[data-google-ads-new-draft]');
  const draftStatus = page.querySelector('[data-google-ads-draft-status]');
  const campaignBatchStatus = page.querySelector('[data-google-ads-campaign-batch-status]');
  const hubCampaignRecovery = page.querySelector('[data-google-ads-hub-campaign-recovery]');
  const hubCampaignRecoveryButton = page.querySelector('[data-google-ads-hub-campaign-recovery-button]');
  const hubCampaignRecoveryStatus = page.querySelector('[data-google-ads-hub-campaign-recovery-status]');
  let hubCampaignRecoveryBusy = false;
  let hubCampaignRecoveryCheckVersion = 0;
  const campaignAssociationOpenButton = page.querySelector('[data-google-ads-campaign-association-open]');
  const campaignAssociationDialog = page.querySelector('[data-google-ads-campaign-association-dialog]');
  const campaignAssociationProduct = page.querySelector('[data-campaign-association-product]');
  const campaignAssociationAccounts = page.querySelector('[data-campaign-association-accounts]');
  const campaignAssociationSearchButton = page.querySelector('[data-campaign-association-search]');
  const campaignAssociationStatus = page.querySelector('[data-campaign-association-status]');
  const campaignAssociationResults = page.querySelector('[data-campaign-association-results]');
  const campaignAssociationSummary = page.querySelector('[data-campaign-association-summary]');
  const campaignAssociationSelectAll = page.querySelector('[data-campaign-association-select-all]');
  const campaignAssociationList = page.querySelector('[data-campaign-association-list]');
  const campaignAssociationSaveButton = page.querySelector('[data-campaign-association-save]');
  const copyImportDialog = page.querySelector('[data-google-ads-copy-import-dialog]');
  const copyImportInput = page.querySelector('[data-google-ads-copy-import-input]');
  const copyImportStatus = page.querySelector('[data-google-ads-copy-import-status]');
  const copyImportResults = page.querySelector('[data-google-ads-copy-import-results]');
  const copyImportGroups = page.querySelector('[data-google-ads-copy-import-groups]');
  const copyImportApplyButton = page.querySelector('[data-google-ads-copy-import-apply]');
  const clickBankOfferSelect = form.elements.namedItem('clickbank_offer_key');
  const finalUrlField = form.elements.namedItem('final_url');
  const presellUrlStatus = page.querySelector('[data-google-ads-presell-url-status]');
  const promotionTargetField = form.elements.namedItem('promotion_target');
  const promotionTargetStatus = page.querySelector('[data-google-ads-product-target-status]');
  const clickBankManualControls = page.querySelector('[data-google-ads-clickbank-manual-controls]');
  const clickBankKeywordsImportButton = page.querySelector('[data-google-ads-clickbank-import-all]');
  const clickBankKeywordStatus = page.querySelector('[data-google-ads-clickbank-status]');
  const clickBankCommissionField = page.querySelector('[data-clickbank-commission-field]');
  const curationBrandBiddingInputs = [...page.querySelectorAll('[data-curation-brand-bidding]')];
  const clickBankCommissionStatus = page.querySelector('[data-google-ads-clickbank-commission-status]');
  const clickBankNegativeKeywordStatus = page.querySelector('[data-google-ads-clickbank-negative-status]');
  const keywordField = form.elements.namedItem('keywords');
  const keywordMatchTypeField = form.elements.namedItem('keyword_match_type');
  const negativeKeywordField = form.elements.namedItem('negative_keywords');
  const negativeKeywordMatchTypeField = form.elements.namedItem('negative_keyword_match_type');
  function renderKeywordMatchLabels() {
    for (const field of [keywordField, negativeKeywordField]) {
      const gutter = page.querySelector('[data-keyword-types="'+field.name+'"]');
      if (!gutter) continue;
      gutter.replaceChildren();
      for (const line of String(field.value || '').split(/\r?\n/)) {
        const parsed = parseKeywordLine(line), row = document.createElement('div');
        row.textContent = parsed.empty ? '' : parsed.ok ? parsed.label : 'Inválida';
        row.classList.toggle('is-invalid', !parsed.ok);
        gutter.append(row);
      }
      gutter.scrollTop = field.scrollTop;
    }
  }
  for (const field of [keywordField, negativeKeywordField]) field.addEventListener('scroll', () => {
    const gutter = page.querySelector('[data-keyword-types="'+field.name+'"]');
    if (gutter) gutter.scrollTop = field.scrollTop;
  });
  const languageField = form.elements.namedItem('language_code');
  const languageDetectionStatus = page.querySelector('[data-language-detection-status]');
  const discountValueField = form.elements.namedItem('discount_value');
  const discountTypeField = form.elements.namedItem('discount_type');
  const discountDetectionStatus = page.querySelector('[data-discount-detection-status]');
  const triggerValueField = form.elements.namedItem('trigger_value');
  const triggerField = page.querySelector('[data-promotion-trigger-field]');
  const isTokenReady = () => Boolean(readTrackingHubToken().token);
  const cachedDirectory = loadGoogleAdsAccountsCache();
  let directory = cachedDirectory?.accounts || null;
  let directoryCacheAt = cachedDirectory?.savedAtUtc || '';
  let directoryRefreshedAt = cachedDirectory?.refreshedAtUtc || cachedDirectory?.savedAtUtc || '';
  let directoryCachePersisted = Boolean(cachedDirectory);
  let knownCampaignNames = Array.isArray(campaignNames) ? campaignNames.map(String).filter(Boolean) : [];
  let previewSnapshot = '';
  let previewFingerprint = '';
  let previewId = '';
  let previewValidatedAt = '';
  let previewCreationAuditLegacyHistory = false;
  let campaignPreviewStorageError = '';
  let lastPreviewQuotaUsage = null;
  let previewButtonBaseLabel = 'Validar prévia';
  let batchEntries = [];
  let batchEntriesDraftId = '';
  let previewHistory = null;
  let selectedCpaVariantPercents = new Set();
  let busy = false;
  let creating = false;
  let completed = false;
  let uncertain = false;
  let createdCampaign = null;
  let createdCampaigns = [];
  let audienceStateByCampaign = new Map();
  let audienceTargetingResult = null;
  let audienceTargetingError = '';
  let audienceExclusionsResult = null;
  let audienceExclusionsError = '';
  let audienceExclusionsBatchApplying = false;
  let audienceExclusionsBatchAttempted = false;
  let audienceExclusionsBatchProgress = null;
  const audienceExclusionExportingManagerIds = new Set();
  const audienceExclusionExportStatusByManager = new Map();
  const audienceExclusionWorkbookPanel = page.querySelector('[data-google-ads-audience-exclusion-exports]');
  const audienceTargetingCsvExportingManagerIds = new Set();
  const audienceTargetingCsvExportStatusByManager = new Map();
  let campaignStatusBatchApplying = false;
  let campaignStatusBatchProgress = null;
  let campaignDeliverySettingsBusyKey = '';
  let campaignDeliverySettingsBatchApplying = false;
  let campaignDeliverySettingsBatchProgress = null;
  let campaignDeliverySettingsBatchQuotaSummary = null;
  let campaignEuPoliticalDeclarationBatchApplying = false;
  let campaignEuPoliticalDeclarationBatchProgress = null;
  let campaignEuPoliticalDeclarationBatchQuotaSummary = null;
  let campaignSitelinksBatchApplying = false;
  let campaignSitelinksBatchAttempted = false;
  let campaignSitelinksBatchProgress = null;
  let campaignDestinationUrlBatchApplying = false;
  let campaignDestinationUrlBatchAttempted = false;
  let campaignDestinationUrlBatchProgress = null;
  const campaignLogDetailsExpanded = new Set();
  let parsedCopy = null;
  let parsedCampaignName = null;
  let applyingCampaignNameParse = false;
  let selectedCopyAssets = new Set();
  let selectedCopySitelinks = new Map();
  let sitelinksSelectionTouched = false;
  let selectedPromotion = false;
  let copyImportInputTimer = null;
  let copyImportStorageError = '';
  let copyImportMode = 'campaign';
  let draftStore = { schemaVersion: 1, activeDraftId: '', drafts: [] };
  let activeDraftId = '';
  let savedActiveCampaignContext = null;
  let draftStorageError = '';
  let activeCampaignContextStorageError = '';
  let campaignBatchStore = { schemaVersion: 1, batches: [] };
  let activeCampaignBatchId = '';
  let campaignCsvWorkflowStore = { schemaVersion: 1, workflows: [] };
  let activeCampaignCsvWorkflowId = '';
  let campaignCsvWorkflowStorageError = '';
  let cpaExpansionAccounts = new Set();
  let cpaExpansionPercents = new Set();
  let cpaExpansionMessage = '';
  let campaignBatchChangedInOtherTab = false;
  let campaignAssociationCandidates = [];
  let campaignAssociationBusy = false;
  let campaignAssociationSearchReady = false;
  let activeCampaignBatchCreatedAt = '';
  let campaignStatusLog = null;
  let activeCampaignBatchSitelinks = [];
  let activeCampaignBatchDestinationUrls = [];
  let activeCampaignBatchNegativeKeywords = { inputText: '', preview: null, result: null, updatedAt: '' };
  let activeCampaignBatchPositiveKeywords = { inputText: '', preview: null, result: null, updatedAt: '' };
  let campaignBatchNegativeKeywordsBusy = false;
  let campaignBatchNegativeKeywordsMessage = '';
  let campaignBatchNegativeKeywordsSaveTimer = 0;
  let campaignBatchPositiveKeywordsBusy = false;
  let campaignBatchPositiveKeywordsMessage = '';
  let campaignBatchPositiveKeywordsSaveTimer = 0;
  let activeCampaignBatchFormSnapshot = null;
  let pendingDraftSitelinks = [];
  let activePresellCampaignHandoff = null;
  let imageUploadConfirmed = false;
  let imageUploadConfirmedAccountIds = [];
  let campaignImageUploadSelectedAccountIds = null;
  let campaignImageAssetUploads = [];
  let campaignImageUploadFiles = [];
  let campaignImageBatchPreviews = [];
  let campaignImageBatchPreviewsLoading = false;

  function bindCampaignDisclosure(details, summary, key) {
    details.open = campaignLogDetailsExpanded.has(key);
    details.addEventListener('toggle', () => {
      if (details.open) campaignLogDetailsExpanded.add(key);
      else campaignLogDetailsExpanded.delete(key);
    });
    details.append(summary);
  }

  function clearCampaignBatchPositiveKeywordsSaveTimer() {
    if (!campaignBatchPositiveKeywordsSaveTimer) return;
    globalThis.clearTimeout(campaignBatchPositiveKeywordsSaveTimer);
    campaignBatchPositiveKeywordsSaveTimer = 0;
  }

  function appendCampaignLogDetails(panel, list, key) {
    const details = document.createElement('details');
    details.className = 'google-ads-campaign-log-details';
    const summary = document.createElement('summary');
    summary.textContent = 'Detalhes por campanha (' + createdCampaigns.length + ')';
    bindCampaignDisclosure(details, summary, key);
    details.append(list);
    panel.append(details);
  }
  let campaignImageBatchPreviewLoadSequence = 0;
  let campaignImageBatchPreviewStorageError = '';
  let campaignImageBatchPreviewRestorePromise = Promise.resolve();
  let campaignImageUploadNeedsAdjustment = [];
  let campaignImageUploadPreviewUrls = [];
  let campaignImageUploadFilesSource = 'none';
  let campaignImageUploadSelectionError = '';
  let campaignImageUploadSelectionBusy = false;
  let campaignImageUploadApplying = false;
  let campaignImageUploadProgress = null;
  let campaignPreSellImageSelection = { key: '', phase: 'idle', product: '', images: [], rootHandle: null, message: '' };
  let campaignPreSellImageLookupSequence = 0;
  let campaignBatchRestored = false;
  let activeCampaignBatchFormRestored = false;
  let campaignBatchStorageError = '';
  let draftSaveTimer = null;
  let draftDirty = false;
  let draftForce = false;
  let restoringDraft = false;
  let clickBankKeywordSources = [];
  let clickBankKeywordSourcesLoaded = false;
  let clickBankKeywordSourcesLoading = false;
  let clickBankKeywordSourcesError = '';
  let campaignDeliverySource = null;
  let deliveryBrandBiddingOverride = false;
  let deliveryCpaStart=40,deliveryCpaSelections=new Set([40]),deliveryAutoName='',deliveryAutoCpa='',deliveryQuoteRequested=false;
  let clickBankCurationCommission = null;
  let pendingClickBankOfferKeyRestore = '';
  let finalUrlSource = '';
  let finalUrlAutoValue = '';
  let promotionTargetSource = '';
  let promotionTargetAutoValue = '';
  try {
    draftStore = loadGoogleAdsCampaignDrafts();
    activeDraftId = draftStore.activeDraftId;
    if (!draftStore.drafts.some(draft => draft.id === activeDraftId)) activeDraftId = '';
  } catch (error) {
    draftStorageError = error.message || 'Não foi possível acessar os rascunhos deste navegador.';
  }
  if (handoffQueryId) activeDraftId = '';
  try {
    campaignBatchStore = loadGoogleAdsCampaignBatches();
  } catch (error) {
    campaignBatchStorageError = error.message || 'Não foi possível acessar os lotes de campanhas deste navegador.';
  }
  try {
    campaignCsvWorkflowStore = loadGoogleAdsCampaignCsvWorkflows();
  } catch (error) {
    campaignCsvWorkflowStorageError = error.message || 'Não foi possível acessar os fluxos CSV deste navegador.';
  }
  try {
    savedActiveCampaignContext = loadGoogleAdsCampaignActiveContext();
  } catch (error) {
    activeCampaignContextStorageError = error.message || 'Não foi possível ler o último contexto de campanha.';
  }

  function setStatus(message, isError = false, isLoading = false, isWarning = false) {
    const messageText = String(message || '');
    const existingBatchMode = campaignBatchRestored && Boolean(activeCampaignBatchId);
    const rawMessage = existingBatchMode && !isError && !isLoading && /prévia/i.test(messageText) ? '' : messageText;
    const needsPreview = Boolean(rawMessage) && !isError && !isLoading && !previewSnapshot && !completed && !uncertain && !existingBatchMode;
    const displayMessage = needsPreview && !/prévia não validada/i.test(rawMessage)
      ? rawMessage + ' Prévia não validada: clique em “Validar prévia”.'
      : rawMessage;
    const warning = !isError && (isWarning || needsPreview);
    status.textContent = displayMessage;
    bottomStatusText.textContent = displayMessage;
    bottomStatus.hidden = !displayMessage;
    [status, bottomStatus].forEach(target => {
      target.classList.toggle('is-error', isError);
      target.classList.toggle('is-warning', warning);
      target.classList.toggle('is-success', !isError && !warning && Boolean(displayMessage));
    });
    bottomStatusSpinner.hidden = !isLoading;
  }

  function clickBankMatchTypeLabel() {
    return ({PHRASE:'Frase',EXACT:'Exata',BROAD:'Ampla'})[keywordMatchTypeField.value] || 'não selecionada';
  }

  function clickBankNegativeMatchTypeLabel() {
    return ({PHRASE:'Frase',EXACT:'Exata',BROAD:'Ampla'})[negativeKeywordMatchTypeField.value] || 'não selecionada';
  }

  function selectedClickBankKeywordSource() {
    const selected=String(clickBankOfferSelect.value||'');
    return clickBankKeywordSources.find(item=>keywordSourceKey(item)===selected)
      ||clickBankKeywordSources.find(item=>item.offerKey===selected&&keywordSourcePlatform(item)==='CB')||null;
  }

  function keywordSourcePlatform(source) {
    return String(source?.platformCode||'CB').trim().toUpperCase()==='GM'?'GM':'CB';
  }

  function keywordSourceKey(source) {
    return keywordSourcePlatform(source)+':'+String(source?.offerKey||'');
  }

  function keywordSourcePlatformName(source) {
    return keywordSourcePlatform(source)==='GM'?'Guru Media':'ClickBank';
  }

  function sameKeywordSource(left,right) {
    return Boolean(left&&right&&String(left.offerKey||'')===String(right.offerKey||'')&&keywordSourcePlatform(left)===keywordSourcePlatform(right));
  }

  function campaignDeliveryKeywordSource(delivery) {
    if (!delivery?.offerKey) return null;
    const platformCode = keywordSourcePlatform(delivery);
    const brandBidding = ['brand_bidding','no_brand_bidding'].includes(delivery.brandBidding)
      ? delivery.brandBidding
      : platformCode === 'GM' ? 'no_brand_bidding' : undefined;
    const geoTargetingMode = delivery.geoTargetingMode === 'WORLD'
      || (Array.isArray(delivery.countries) && delivery.countries.some(value => String(value || '').trim().toUpperCase() === 'WORLD'))
      ? 'WORLD' : 'COUNTRIES';
    return {
      deliveryId: String(delivery.id || delivery.deliveryId || ''),
      platformCode,
      offerKey: String(delivery.offerKey),
      offerName: String(delivery.offerName || delivery.productName || `Oferta ${keywordSourcePlatformName(delivery)}`),
      seller: String(delivery.seller || ''),
      productName: String(delivery.productName || ''),
      keywords: Array.isArray(delivery.positiveKeywords) ? delivery.positiveKeywords : (Array.isArray(delivery.keywords) ? delivery.keywords : []),
      negativeKeywords: Array.isArray(delivery.negativeKeywords) ? delivery.negativeKeywords : [],
      negativeKeywordCountries: Array.isArray(delivery.negativeKeywordCountries) ? delivery.negativeKeywordCountries : [],
      geoTargetingMode,
      countries: geoTargetingMode === 'WORLD' ? [] : (Array.isArray(delivery.countries) ? delivery.countries : []),
      ...(delivery.commissionCurrency === 'USD' && isCommissionUsd(delivery.commissionAmountUsd) ? {commissionAmountUsd:delivery.commissionAmountUsd,commissionCurrency:'USD'} : {}),
      ...(brandBidding?{brandBidding}:{}),
      sourceType: 'campaign-delivery',
    };
  }

  function mergeCampaignDeliveryKeywordSource(sources = []) {
    const merged = Array.isArray(sources)
      ? sources.filter(item => item?.sourceType !== 'campaign-delivery' && !sameKeywordSource(item,campaignDeliverySource))
      : [];
    if (campaignDeliverySource) merged.push(campaignDeliverySource);
    return merged;
  }

  function formatCampaignTargetCreationDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (isoDate) {
      const [, year, month, day] = isoDate;
      const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
      if (new Date(timestamp).toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return '';
      return `${day}/${month}/${year}`;
    }
    const timestamp = Date.parse(raw);
    return Number.isFinite(timestamp)
      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(timestamp))
      : '';
  }

  function campaignProductForFinalUrl() {
    const savedProduct=String(form.elements.namedItem('source_product').value||'').trim();
    if(savedProduct)return savedProduct;
    const parsed=parseGoogleAdsCampaignName(form.elements.namedItem('campaign_name').value);
    return parsed.ok?parsed.product:'';
  }

  function campaignBatchLaunchSignature(campaignName) {
    const parsed = parseGoogleAdsCampaignName(campaignName);
    if (!parsed.ok) return '';
    return JSON.stringify({
      date: parsed.sourceDate,
      product: normalizeCampaignSequenceProduct(parsed.product),
      platform: parsed.platformCode,
      model: parsed.biddingModelCode,
      geoTargetingMode: parsed.geoTargetingMode,
      countries: [...parsed.countries].sort(),
      tags: [...parsed.extraTags].sort(),
      commissionCurrency: parsed.commissionCurrency,
      commissionAmount: Number(parsed.commissionAmount).toFixed(2),
    });
  }

  function campaignBatchFormSnapshotForCampaigns(campaigns, values = collectDraftValues()) {
    if (!Array.isArray(campaigns) || !campaigns.length || !draftHasContent(values)) return null;
    const formSignature = campaignBatchLaunchSignature(values.campaign_name);
    if (!formSignature) return null;
    const campaignSignatures = campaigns.map(campaign => campaignBatchLaunchSignature(campaign.campaignName));
    if (campaignSignatures.some(signature => !signature || signature !== formSignature)) return null;
    return JSON.parse(JSON.stringify(values));
  }

  function matchingCampaignBatchFormSnapshot(batch, currentValues = collectDraftValues()) {
    const campaigns = Array.isArray(batch?.campaigns) ? batch.campaigns : [];
    if (!campaigns.length) return null;
    const signatures = campaigns.map(campaign => campaignBatchLaunchSignature(campaign.campaignName));
    if (signatures.some(signature => !signature) || new Set(signatures).size !== 1) return null;
    const expectedSignature = signatures[0];
    const activeDraft = draftStore.drafts.find(draft => draft.id === activeDraftId);
    if (activeDraft && campaignBatchLaunchSignature(activeDraft.values?.campaign_name) === expectedSignature
        && draftHasContent(activeDraft.values)) {
      return { values: JSON.parse(JSON.stringify(activeDraft.values)), source: 'matching-active-draft' };
    }
    if (campaignBatchLaunchSignature(currentValues?.campaign_name) === expectedSignature && draftHasContent(currentValues)) {
      return { values: JSON.parse(JSON.stringify(currentValues)), source: 'matching-current-form' };
    }
    const matches = draftStore.drafts.filter(draft => campaignBatchLaunchSignature(draft.values?.campaign_name) === expectedSignature
      && draftHasContent(draft.values));
    return matches.length === 1
      ? { values: JSON.parse(JSON.stringify(matches[0].values)), source: 'unique-matching-draft' }
      : null;
  }

  function campaignTargetState() {
    const campaignProduct = campaignProductForFinalUrl();
    const offer = selectedClickBankKeywordSource();
    const handoff = effectivePresellCampaignHandoff();
    const ficha = resolveGoogleAdsPresellTargets({ handoff, campaignProduct, offerName: offer?.offerName || '' });
    if (ficha.matched) {
      const targets = ficha.targets.map(target => {
        const accountId = String(target.accountId || '').replace(/\D/g, '');
        const account = (directory?.accounts || []).find(item => String(item.customerId || '').replace(/\D/g, '') === accountId) || null;
        return {
          accountId,
          account,
          managerCustomerId: account?.managerCustomerId || '',
          currencyCode: String(account?.currencyCode || '').toUpperCase(),
          finalUrl: target.url || '',
          reason: target.ok ? account ? '' : 'Conta não encontrada no diretório local de MCCs. Atualize a lista de MCCs e contas.' : target.reason,
          source: 'ficha',
        };
      });
      return { source: 'ficha', product: ficha.product || campaignProduct, matched: true, targets };
    }
    if (handoff) return { source: 'ficha', product: handoff.product, matched: false, reason: ficha.reason, targets: [] };
    const account = selectedAccount();
    return {
      source: 'selected-account',
      product: campaignProduct,
      matched: false,
      reason: ficha.reason || '',
      targets: account ? [{
        accountId: String(account.customerId || '').replace(/\D/g, ''),
        account,
        managerCustomerId: account.managerCustomerId,
        currencyCode: String(account.currencyCode || '').toUpperCase(),
        finalUrl: String(finalUrlField.value || '').trim(),
        reason: '',
        source: 'selected-account',
      }] : [],
    };
  }

  function campaignBatchTargetState() {
    if (!campaignBatchRestored || !activeCampaignBatchId || !createdCampaigns.length) return null;
    const targetsByAccount = new Map();
    createdCampaigns.forEach(campaign => {
      const accountId = String(campaign.customerId || '').replace(/\D/g, '');
      if (!accountId) return;
      const account = (directory?.accounts || []).find(item => String(item.customerId || '').replace(/\D/g, '') === accountId) || null;
      const key = accountId;
      const target = targetsByAccount.get(key) || {
        accountId,
        account: account || {
          customerId: accountId,
          managerCustomerId: campaign.managerCustomerId || '',
          name: campaign.accountName || ('Conta ' + accountId),
          currencyCode: '',
        },
        managerCustomerId: campaign.managerCustomerId || account?.managerCustomerId || '',
        currencyCode: String(account?.currencyCode || '').toUpperCase(),
        finalUrl: '',
        finalUrls: [],
        reason: '',
        source: 'batch',
        campaignCount: 0,
      };
      target.campaignCount += 1;
      const finalUrl = String(campaign.finalUrl || '').trim();
      if (finalUrl && !target.finalUrls.includes(finalUrl)) target.finalUrls.push(finalUrl);
      targetsByAccount.set(key, target);
    });
    return {
      source: 'batch',
      product: '',
      matched: true,
      campaigns: createdCampaigns,
      targets: [...targetsByAccount.values()],
    };
  }

  function effectivePresellCampaignHandoff() {
    const selected = readSelectedGoogleAdsPresellCampaignHandoff();
    if (selected.ok) return selected.payload;
    if (selected.reason === 'no-selected-job' || selected.reason === 'storage-unavailable') {
      return activePresellCampaignHandoff || null;
    }
    return null;
  }

  function campaignBatchDestinationUrlTargets() {
    const accounts = new Map();
    createdCampaigns.forEach(campaign => {
      const accountId = String(campaign.customerId || '').replace(/\D/g, '');
      if (!accountId) return;
      const account = accounts.get(accountId) || {
        accountId,
        accountName: campaign.accountName || ('Conta ' + accountId),
        campaignCount: 0,
        url: '',
        sourceJobId: '',
        sourceProduct: '',
      };
      account.campaignCount += 1;
      accounts.set(accountId, account);
    });
    const targets = [...accounts.values()];
    const savedByAccount = new Map(activeCampaignBatchDestinationUrls.map(item => [item.accountId, item]));
    targets.forEach(target => {
      const saved = savedByAccount.get(target.accountId);
      if (saved) Object.assign(target, saved);
    });
    const unresolved = targets.some(target => !target.url);
    if (unresolved) {
      const parsedProducts = [...new Set(createdCampaigns.map(campaign => {
        const parsed = parseGoogleAdsCampaignName(campaign.campaignName);
        return parsed.ok ? parsed.product : '';
      }).filter(Boolean))];
      const handoff = effectivePresellCampaignHandoff();
      if (parsedProducts.length === 1 && handoff
          && matchesGoogleAdsProductPhrase(handoff.product, parsedProducts[0])) {
        const resolved = resolveGoogleAdsPresellTargets({ handoff, campaignProduct: parsedProducts[0] });
        if (resolved.matched) {
          targets.forEach(target => {
            if (target.url) return;
            const match = resolved.targets.find(item => item.accountId === target.accountId && item.ok);
            if (match) Object.assign(target, {
              url: match.url,
              sourceJobId: handoff.sourceJobId || '',
              sourceProduct: handoff.product,
            });
          });
        }
      }
    }
    return targets;
  }

  function selectedPreSellForCampaignBatch() {
    const products = [...new Set(createdCampaigns.map(campaign => {
      const parsed = parseGoogleAdsCampaignName(campaign.campaignName);
      return parsed.ok ? parsed.product : '';
    }).filter(Boolean))];
    if (products.length !== 1) return { ok: false, reason: 'batch-product-mismatch' };
    const product = products[0];
    const candidates = [readSelectedGoogleAdsPresellCampaignHandoff().payload, activePresellCampaignHandoff].filter(Boolean);
    const handoff = candidates.find(candidate => matchesGoogleAdsProductPhrase(candidate.product, product));
    if (!handoff) return { ok: false, reason: candidates.length ? 'product-mismatch' : 'no-selected-job', product };
    const resolved = resolveGoogleAdsPresellTargets({ handoff, campaignProduct: product });
    return resolved.matched ? { ok: true, product, handoff, targets: resolved.targets } : { ok: false, reason: resolved.reason, product };
  }

  function isValidCampaignBatchDestinationUrl(value) {
    try {
      const parsed = new URL(String(value || '').trim());
      return parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password
        && !parsed.hash && String(value || '').trim().length <= 2048;
    } catch { return false; }
  }

  function loadCampaignBatchDestinationUrlsFromPreSell() {
    if (!activeCampaignBatchId || !createdCampaigns.length) return;
    const source = selectedPreSellForCampaignBatch();
    if (!source.ok) {
      const messages = {
        'batch-product-mismatch': 'Os nomes do lote não identificam um único produto compatível com a Pre-Sell.',
        'product-mismatch': 'A Pre-Sell selecionada não corresponde ao produto deste lote.',
        'no-selected-job': 'Selecione uma Pre-Sell publicada na tela Ficha e Presell para carregar as URLs.',
      };
      setCampaignBatchStatus(messages[source.reason] || 'Não foi possível localizar uma Pre-Sell publicada compatível com este lote.', true);
      return;
    }
    const targets = campaignBatchDestinationUrlTargets().map(target => {
      const deployed = source.targets.find(item => item.accountId === target.accountId && item.ok);
      return {
        accountId: target.accountId,
        url: deployed?.url || '',
        sourceJobId: source.handoff.sourceJobId || '',
        sourceProduct: source.product,
        updatedAt: new Date().toISOString(),
      };
    });
    const missing = targets.filter(item => !item.url).map(item => item.accountId);
    activeCampaignBatchDestinationUrls = targets;
    if (!saveActiveCampaignBatch()) return;
    renderCampaignResult();
    setCampaignBatchStatus(missing.length
      ? 'URLs da Pre-Sell carregadas para ' + (targets.length - missing.length) + '/' + targets.length + ' contas. Falta URL publicada para: ' + missing.join(', ') + '.'
      : 'URLs HTTPS da Pre-Sell ' + source.product + ' carregadas por conta e salvas neste lote. Nenhuma consulta ao Google Ads foi feita.');
  }

  function campaignDestinationUrlSignature(campaign) {
    const target = campaignBatchDestinationUrlTargets().find(item => item.accountId === String(campaign?.customerId || '').replace(/\D/g, ''));
    return JSON.stringify([target?.accountId || '', target?.url || '']);
  }

  function campaignTargetSummaryState() {
    return campaignBatchTargetState() || campaignTargetState();
  }

  function createGoogleAdsResourcesBookmarkControl({ accountId, accountName, linkText, ariaLabel, linkClassName }) {
    const match = matchGoogleAdsResourceBookmark(resourceBookmarks, { accountId, accountName });
    if (match.status !== 'matched') {
      const warning = document.createElement('small');
      warning.className = 'google-ads-resource-bookmark-unavailable';
      warning.setAttribute('role', 'status');
      warning.title = match.status === 'ambiguous'
        ? 'Há mais de um favorito correspondente. Ajuste os títulos para identificar uma única conta.'
        : 'Salve o link de Recursos desta conta na pasta contas > pag recursos e autorize a leitura de favoritos na extensão.';
      warning.textContent = match.status === 'ambiguous'
        ? 'Mais de um link de Recursos corresponde a esta conta.'
        : 'Link de Recursos não encontrado nos favoritos.';
      return warning;
    }

    const link = document.createElement('a');
    link.className = linkClassName;
    link.href = match.bookmark.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = linkText;
    link.setAttribute('aria-label', ariaLabel);
    link.title = 'Abre o favorito associado a esta conta, preservando o URL salvo.';

    link.addEventListener('click', event => {
      event.preventDefault();
      if (link.getAttribute('aria-busy') === 'true') return;
      link.setAttribute('aria-busy', 'true');
      void openGoogleAdsResourcesViaExtension({
        document,
        window,
        accountId,
        resourceUrl: match.bookmark.url,
      }).catch(() => {}).finally(() => {
        link.removeAttribute('aria-busy');
      });
    });

    const control = document.createDocumentFragment();
    control.append(link);
    return control;
  }

  function createGoogleAdsCampaignBookmarkControl(managerCustomerId) {
    const accountId = String(managerCustomerId || '').replace(/\D/g, '');
    const manager = (directory?.managers || []).find(item => String(item.customerId || '').replace(/\D/g, '') === accountId);
    const match = matchGoogleAdsCampaignBookmark(campaignBookmarks, {
      accountId,
      accountName: String(manager?.name || '').trim(),
    });
    if (match.status !== 'matched') {
      const warning = document.createElement('small');
      warning.className = 'google-ads-resource-bookmark-unavailable';
      warning.setAttribute('role', 'status');
      warning.textContent = match.status === 'ambiguous' ? 'Mais de um favorito de campanhas corresponde a esta MCC.' : 'Link de campanhas não salvo para esta MCC.';
      warning.title = match.status === 'ambiguous'
        ? 'Ajuste os títulos dos favoritos para identificar uma única página de campanhas desta MCC.'
        : 'Salve o favorito da página Campanhas desta MCC em contas ou em contas > pag recursos.';
      return warning;
    }
    const link = document.createElement('a');
    link.className = 'google-ads-campaign-bookmark-link';
    link.href = match.bookmark.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Abrir campanhas ↗';
    link.title = 'Abre a página Campanhas da MCC pelo favorito salvo e pela extensão Hub 2.0.';
    link.addEventListener('click', event => {
      event.preventDefault();
      if (link.getAttribute('aria-busy') === 'true') return;
      link.setAttribute('aria-busy', 'true');
      void openGoogleAdsResourcesViaExtension({ document, window, accountId, resourceUrl: match.bookmark.url })
        .then(result => {
          if (result?.ok !== true) throw new Error(result?.message || 'Não consegui abrir as campanhas pela extensão.');
        })
        .catch(error => {
          const status = document.createElement('small');
          status.className = 'google-ads-resource-bookmark-unavailable';
          status.setAttribute('role', 'status');
          status.textContent = error?.message || 'Não consegui abrir o favorito pela extensão.';
          link.after(status);
        })
        .finally(() => link.removeAttribute('aria-busy'));
    });
    return link;
  }

  function renderResourceBookmarkStatus(targets = []) {
    if (!campaignTargetsBookmarkStatus) return;
    if (resourceBookmarkSyncNotice?.message) {
      campaignTargetsBookmarkStatus.textContent = resourceBookmarkSyncNotice.message;
      campaignTargetsBookmarkStatus.classList.toggle('is-success', resourceBookmarkSyncNotice.kind === 'success');
      campaignTargetsBookmarkStatus.classList.toggle('is-warning', resourceBookmarkSyncNotice.kind === 'warning');
      campaignTargetsBookmarkStatus.hidden = false;
      return;
    }
    if (!resourceBookmarks.length) {
      campaignTargetsBookmarkStatus.hidden = true;
      return;
    }
    const matches = summarizeGoogleAdsResourceBookmarkMatches(resourceBookmarks, targets);
    campaignTargetsBookmarkStatus.textContent = `Favoritos carregados: ${resourceBookmarks.length} link(s); ${matches.matched} conta(s) associada(s) pelo título.`
      + (matches.ambiguous ? ` ${matches.ambiguous} correspondência(s) ambígua(s); esses atalhos ficam desativados.` : '')
      + (matches.unmatched ? ` ${matches.unmatched} conta(s) sem link correspondente; o Hub mostra aviso amarelo.` : '');
    campaignTargetsBookmarkStatus.classList.toggle('is-warning', Boolean(matches.ambiguous || matches.unmatched));
    campaignTargetsBookmarkStatus.classList.toggle('is-success', !matches.ambiguous && !matches.unmatched);
    campaignTargetsBookmarkStatus.hidden = false;
  }

  function applyGoogleAdsResourceBookmarksSnapshot(snapshot) {
    if (snapshot?.folderFound !== true) {
      if (snapshot?.permissionRequired || snapshot?.ok === true) {
        resourceBookmarks = saveGoogleAdsResourceBookmarks([], window.localStorage).bookmarks;
        campaignBookmarks = saveGoogleAdsCampaignBookmarks([], window.localStorage).bookmarks;
        managerBookmarks = saveGoogleAdsManagerBookmarks([], window.localStorage).bookmarks;
      }
      const message = snapshot?.permissionRequired
        ? 'Para usar os favoritos salvos, abra a extensão Hub 2.0 e autorize “Ler favoritos do Chrome”.'
        : snapshot?.ok
          ? 'Não encontrei a pasta favoritos > contas. Sem um favorito correspondente, o Hub mantém o atalho indisponível.'
          : snapshot?.message || 'Não consegui sincronizar os favoritos. Sem um favorito correspondente, o Hub mostra aviso amarelo no lugar do link.';
      resourceBookmarkSyncNotice = { message, kind: 'warning' };
      renderCampaignTargetSummary();
      if (activeCampaignBatchId && createdCampaigns.length) renderCampaignResult();
      return;
    }
    const saved = saveGoogleAdsResourceBookmarks(snapshot.bookmarks, window.localStorage);
    const savedCampaignBookmarks = saveGoogleAdsCampaignBookmarks(snapshot.campaignBookmarks, window.localStorage);
    const savedManagerBookmarks = saveGoogleAdsManagerBookmarks(snapshot.managerBookmarks, window.localStorage);
    resourceBookmarks = saved.bookmarks;
    campaignBookmarks = savedCampaignBookmarks.bookmarks;
    managerBookmarks = savedManagerBookmarks.bookmarks;
    if (!saved.ok || !savedCampaignBookmarks.ok || !savedManagerBookmarks.ok) {
      resourceBookmarkSyncNotice = { message: 'Favoritos lidos nesta sessão, mas o navegador não permitiu salvar todos para a próxima visita.', kind: 'warning' };
    } else {
      const matches = summarizeGoogleAdsResourceBookmarkMatches(resourceBookmarks, campaignTargetSummaryState()?.targets || []);
      resourceBookmarkSyncNotice = {
        message: `Favoritos sincronizados: ${resourceBookmarks.length} link(s) de Recursos, ${campaignBookmarks.length} link(s) de campanhas e ${managerBookmarks.length} link(s) da lista de contas da MCC. Os títulos identificam as contas/MCCs; links ausentes ou ambíguos aparecem ao lado das ações.`
          + (matches.ambiguous ? ` ${matches.ambiguous} correspondência(s) ambígua(s); esses atalhos ficam desativados.` : '')
          + (matches.unmatched ? ` ${matches.unmatched} conta(s) sem link de Recursos correspondente; o Hub mostra aviso amarelo.` : ''),
        kind: matches.ambiguous || matches.unmatched ? 'warning' : 'success',
      };
    }
    renderCampaignTargetSummary();
    if (activeCampaignBatchId && createdCampaigns.length) renderCampaignResult();
  }

  function onGoogleAdsResourceBookmarksUpdate(event) {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (message?.source !== 'hub-2.0-extension' || message.type !== 'GOOGLE_ADS_RESOURCE_BOOKMARKS_UPDATED') return;
    applyGoogleAdsResourceBookmarksSnapshot(message);
  }

  function renderCampaignTargetSummary() {
    const state = campaignTargetSummaryState();
    const accountEmails = accountDirectoryEmailStorage.read();
    const imageEligibilityByAccount = accountImageEligibilityStorage.read();
    const imageApiStatusesByAccount = accountImageEligibilityStorage.readApiStatus();
    const isBatch = state.source === 'batch';
    const batchDestinationByAccount = isBatch
      ? new Map(campaignBatchDestinationUrlTargets().map(target => [target.accountId, target.url]))
      : new Map();
    campaignTargetsTitle.textContent = isBatch ? 'Contas presentes no lote' : 'Contas de destino';
    renderResourceBookmarkStatus(state.targets || []);
    campaignTargetsHelp.textContent = isBatch
      ? 'A lista vem das campanhas salvas neste lote. As ações em lote usam esses IDs; o formulário de criação e a conta de referência não definem os destinos.'
      : 'Salve os links de Recursos em favoritos > contas > pag recursos. O Hub associa pelo nome ou ID no título, preserva o endereço completo e não aplica filtros.';
    campaignTargetsList.replaceChildren();
    state.targets.forEach(target => {
      const item = document.createElement('li');
      const name = target.account?.name || ('Conta ' + (target.accountId || 'não encontrada'));
      const summary = document.createElement('span');
      summary.className = 'google-ads-campaign-target-summary';
      summary.textContent = name + ' · ID ' + (target.accountId || 'não identificado') + ' · '
        + (target.currencyCode || 'moeda não identificada')
        + (isBatch ? ' · ' + target.campaignCount + ' campanha(s) no lote' : '');
      const emailKey = normalizeAccountDirectoryId(target.accountId);
      const accountEmail = emailKey ? accountEmails[emailKey] || '' : '';
      const creationDate = formatCampaignTargetCreationDate(target.account?.creationDate);
      const emailLine = document.createElement('small');
      emailLine.className = 'google-ads-campaign-target-email' + (accountEmail ? '' : ' is-missing');
      emailLine.textContent = (accountEmail ? 'E-mail: ' + accountEmail : 'E-mail não cadastrado em Contas')
        + ' · Criação: ' + (creationDate || 'data indisponível');
      item.append(summary, emailLine);
      const preferredBatchUrl = batchDestinationByAccount.get(target.accountId) || '';
      const preSellUrls = isBatch
        ? preferredBatchUrl ? [preferredBatchUrl] : (target.finalUrls || [])
        : [target.finalUrl || ''];
      const safePreSellUrls = [...new Set(preSellUrls.map(value => {
        try {
          const parsed = new URL(String(value || '').trim());
          return parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password ? parsed.href : '';
        } catch { return ''; }
      }).filter(Boolean))];
      const preSellLine = document.createElement('small');
      preSellLine.className = 'google-ads-campaign-target-presell' + (safePreSellUrls.length ? '' : ' is-missing');
      if (safePreSellUrls.length) {
        preSellLine.append(document.createTextNode('Pré-sell: '));
        safePreSellUrls.forEach((url, index) => {
          if (index) preSellLine.append(document.createTextNode(' · '));
          const preSellLink = document.createElement('a');
          preSellLink.href = url;
          preSellLink.target = '_blank';
          preSellLink.rel = 'noopener noreferrer';
          preSellLink.textContent = url;
          preSellLink.title = 'Abrir a pré-sell publicada da conta ' + target.accountId;
          preSellLink.setAttribute('aria-label', 'Abrir pré-sell da conta ' + target.accountId + ': ' + url);
          preSellLine.append(preSellLink);
        });
      } else preSellLine.textContent = 'Link da pré-sell não encontrado';
      item.append(preSellLine);
      const imageEligibility = imageEligibilityByAccount[target.accountId] || '';
      const imageApiStatus = imageApiStatusesByAccount[target.accountId] || null;
      const imageEligibilityButton = document.createElement('button');
      imageEligibilityButton.type = 'button';
      imageEligibilityButton.className = 'google-ads-image-eligibility-button';
      imageEligibilityButton.dataset.googleAdsImageEligibility = target.accountId;
      imageEligibilityButton.setAttribute('aria-haspopup', 'dialog');
      imageEligibilityButton.textContent = imageEligibility === 'allowed'
        ? 'Permite imagem · alterar'
        : imageEligibility === 'not_allowed'
          ? 'Não permite imagem · alterar'
          : imageApiStatus?.status === 'verification_required'
            ? 'Google Ads pede verificação · alterar'
            : 'Verificar permissão de imagem';
      imageEligibilityButton.classList.toggle('is-pending', !imageEligibility);
      imageEligibilityButton.classList.toggle('is-allowed', imageEligibility === 'allowed');
      imageEligibilityButton.classList.toggle('is-unavailable', imageEligibility === 'not_allowed');
      imageEligibilityButton.setAttribute('aria-label', 'Verificar se a conta ' + name + ' permite recursos de imagem');
      item.append(imageEligibilityButton);
      if (imageApiStatus?.status === 'verification_required') {
        const apiStatus = document.createElement('small');
        apiStatus.className = 'google-ads-campaign-target-image-api-status';
        apiStatus.textContent = 'Resposta da API: a conta precisa concluir a verificação do Google Ads antes deste vínculo. Isso não significa que imagens sejam proibidas.'
          + (imageApiStatus.googleErrorCode ? ' Código: ' + imageApiStatus.googleErrorCode + '.' : '');
        item.append(apiStatus);
      }
      item.append(createGoogleAdsResourcesBookmarkControl({
        accountId: target.accountId,
        accountName: name,
        linkText: 'Abrir recursos no Google Ads ↗',
        ariaLabel: 'Abrir recursos do Google Ads para ' + name + ' · ' + target.accountId,
        linkClassName: 'google-ads-campaign-target-assets-link',
      }));
      item.classList.toggle('is-warning', isBatch
        ? !target.accountId
        : Boolean(target.reason || !target.account || !target.currencyCode || !target.finalUrl));
      campaignTargetsList.append(item);
    });
    const invalid = state.targets.filter(target => isBatch
      ? !target.accountId
      : target.reason || !target.account || !target.currencyCode || !target.finalUrl);
    campaignTargetsStatus.classList.toggle('is-warning', invalid.length > 0);
    campaignTargetsStatus.classList.toggle('is-success', (isBatch || state.source === 'ficha') && state.targets.length > 0 && !invalid.length);
    if (isBatch) {
      const referenceCampaign = createdCampaign || createdCampaigns[0];
      campaignTargetsStatus.textContent = createdCampaigns.length + ' campanha(s) recuperada(s) do lote em ' + state.targets.length + ' conta(s).'
        + (referenceCampaign?.campaignName ? ' Campanha de referência: ' + referenceCampaign.campaignName + '.' : '')
        + (activeCampaignBatchFormRestored
          ? ' As configurações salvas do formulário foram recuperadas.'
          : ' Este lote ainda não tem um retrato completo do formulário salvo.');
      batchCampaignReference.hidden = !referenceCampaign?.campaignName || activeCampaignBatchFormRestored;
      batchCampaignReference.textContent = referenceCampaign?.campaignName
        ? 'Nome salvo no lote: ' + referenceCampaign.campaignName + ' · referência da campanha existente.'
        : '';
    } else if (state.source === 'ficha' && state.matched) {
      batchCampaignReference.hidden = true;
      batchCampaignReference.textContent = '';
      campaignTargetsStatus.textContent = state.targets.length
        ? state.targets.length + ' conta(s) recebida(s) da etapa final da Pre-Sell para ' + state.product + '. Todas recebem os níveis de CPA marcados, cada uma com sua URL publicada.'
          + (invalid.length ? ' Corrija os itens destacados antes de validar.' : '')
        : 'A Pre-Sell corresponde a ' + state.product + ', mas não há conta de destino transferida.';
    } else if (state.source === 'ficha') {
      batchCampaignReference.hidden = true;
      batchCampaignReference.textContent = '';
      campaignTargetsStatus.textContent = 'Os dados enviados da Pre-Sell não correspondem ao produto atual (' + (state.reason || 'produto diferente') + '). Revise o nome e a oferta ou envie novamente a Pre-Sell correta.';
    } else if (state.targets.length) {
      batchCampaignReference.hidden = true;
      batchCampaignReference.textContent = '';
      campaignTargetsStatus.textContent = 'Nenhuma seleção da Ficha corresponde a este produto. O lote usará somente a conta de referência e a URL do formulário.';
    } else {
      batchCampaignReference.hidden = true;
      batchCampaignReference.textContent = '';
      campaignTargetsStatus.textContent = 'Selecione uma conta ou escolha as contas e URLs na Ficha e Presell para este produto.';
    }
    return state;
  }

  function openImageEligibilityDialog(accountId) {
    const normalizedAccountId = String(accountId || '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(normalizedAccountId)) return;
    const target = campaignTargetSummaryState().targets.find(item => item.accountId === normalizedAccountId);
    const accountName = target?.account?.name || ('Conta ' + normalizedAccountId);
    pendingImageEligibilityAccountId = normalizedAccountId;
    imageEligibilityAccount.textContent = accountName + ' · ID ' + normalizedAccountId;
    if (typeof imageEligibilityDialog.showModal === 'function') imageEligibilityDialog.showModal();
    else imageEligibilityDialog.setAttribute('open', '');
  }

  function saveImageEligibility(value) {
    if (!pendingImageEligibilityAccountId) return;
    try {
      accountImageEligibilityStorage.save(pendingImageEligibilityAccountId, value);
    } catch (error) {
      setStatus(error.message || 'Não foi possível salvar a verificação da conta.', true);
      return;
    }
    pendingImageEligibilityAccountId = '';
    imageEligibilityDialog.close?.();
    imageEligibilityDialog.removeAttribute('open');
    renderCampaignTargetSummary();
    if (activeCampaignBatchId && createdCampaigns.length) {
      renderCampaignResult();
      updateControlState();
    }
  }

  function setPresellUrlStatus(message, isMatch = false) {
    presellUrlStatus.textContent=message;
    presellUrlStatus.classList.toggle('is-success',isMatch);
    presellUrlStatus.classList.toggle('is-warning',!isMatch&&Boolean(message));
  }

  function updateFinalUrlFromPreSell() {
    const accountId=String(accountSelect.value||'').trim();
    const product=campaignProductForFinalUrl();
    const offer=selectedClickBankKeywordSource();
    const handoff=effectivePresellCampaignHandoff();
    if (!activePresellCampaignHandoff && handoff) activePresellCampaignHandoff = handoff;
    const ficha=resolveGoogleAdsPresellTargets({handoff,campaignProduct:product,offerName:offer?.offerName||''});
    const firstFichaTarget=ficha.matched?(ficha.targets.find(target=>target.accountId===accountId&&target.ok)||ficha.targets.find(target=>target.ok)):null;
    const result=firstFichaTarget||{...resolveGoogleAdsPresellTargets({handoff,campaignProduct:product,offerName:offer?.offerName||''}),...{ok:false,reason:ficha.reason}};
    const current=String(finalUrlField.value||'').trim();
    const stillAutomatic=finalUrlSource==='presell'&&current===finalUrlAutoValue;
    if(result.ok){
      if(!current||stillAutomatic){
        finalUrlField.value=result.url;
        finalUrlSource='presell';
        finalUrlAutoValue=result.url;
        setPresellUrlStatus(ficha.targets.length>1
          ? 'URL de referência preenchida pela transferência da etapa final da Pre-Sell. Cada conta do lote usará sua URL individual mostrada acima.'
          : 'URL recebida da etapa final da Pre-Sell · '+result.product+' · conta '+result.accountId+'. Você pode editá-la; ela será usada no anúncio e na promoção.',true);
        scheduleDraftSave();
        renderCampaignTargetSummary();
        return;
      }
      setPresellUrlStatus(finalUrlSource==='manual'
        ?(ficha.matched?'URL editada manualmente; o lote continua usando as URLs individuais recebidas da Pre-Sell.':'URL editada manualmente; o Hub preservou seu valor.')
        :'Já existe uma URL neste rascunho; o Hub preservou o valor.',false);
      renderCampaignTargetSummary();
      return;
    }
    if(stillAutomatic){
      finalUrlField.value='';
      finalUrlSource='';
      finalUrlAutoValue='';
      scheduleDraftSave();
    }
    const messages={
      'no-handoff':'Nenhuma Pre-Sell foi enviada para esta análise. Use a etapa final da tela Ficha e Presell para transferir produto, contas e URLs.',
      'no-product':'A Pre-Sell transferida não tem um produto identificado.',
      'no-campaign-product':'Informe o nome da campanha no padrão ou selecione uma oferta ClickBank correspondente.',
      'product-mismatch':'O produto da campanha não corresponde ao produto enviado da Pre-Sell.',
      'offer-mismatch':'A oferta ClickBank selecionada não corresponde ao produto enviado da Pre-Sell.',
      'no-account':'Selecione a conta Google Ads para localizar a URL correspondente.',
      'account-not-selected':'Esta conta não foi incluída na transferência explícita da Pre-Sell.',
      'no-url':'Não há URL HTTPS publicada para esta conta na transferência da Pre-Sell.',
      'invalid-url':'A URL salva precisa ser HTTPS para ser usada na campanha.',
    };
    setPresellUrlStatus(finalUrlSource==='manual'
      ?'URL editada manualmente; o Hub preservou seu valor.'
      :messages[result.reason]||'Não foi encontrada uma URL compatível na transferência da Pre-Sell.',false);
    renderCampaignTargetSummary();
  }

  function syncKnownCampaignNames(nextNames = getCampaignNames?.() || knownCampaignNames) {
    knownCampaignNames = [...new Set((Array.isArray(nextNames) ? nextNames : []).map(value => String(value || '').trim()).filter(Boolean))];
    return knownCampaignNames;
  }

  function setPromotionTargetStatus(message, isMatch = false) {
    promotionTargetStatus.textContent=message;
    promotionTargetStatus.classList.toggle('is-success',isMatch);
    promotionTargetStatus.classList.toggle('is-warning',!isMatch&&Boolean(message));
  }

  function updatePromotionTargetFromCampaign() {
    const product=campaignProductForFinalUrl();
    const current=String(promotionTargetField.value||'').trim();
    const stillManagedValue=['campaign','copy'].includes(promotionTargetSource)&&current===promotionTargetAutoValue;
    const headlines=[...form.querySelectorAll('[name="headline"]')].map(field=>String(field.value||'').trim()).filter(Boolean);
    const keywords=String(keywordField.value||'').split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
    const hasCopy=headlines.length>0||keywords.length>0;
    const copyConfirms=product&&[...headlines,...keywords].some(value=>matchesGoogleAdsProductPhrase(value,product));

    if(!product){
      if(promotionTargetSource==='campaign'&&stillManagedValue){promotionTargetField.value='';promotionTargetSource='';promotionTargetAutoValue='';scheduleDraftSave()}
      else if(promotionTargetSource==='copy')setPromotionTargetStatus('Item importado da promoção da copy; confira ou calcule o nome da campanha.');
      else setPromotionTargetStatus('Informe ou calcule o nome da campanha para identificar o produto.');
      return;
    }
    if(Array.from(product).length>20){
      if(promotionTargetSource==='campaign'&&stillManagedValue){promotionTargetField.value='';promotionTargetSource='';promotionTargetAutoValue='';scheduleDraftSave()}
      else if(promotionTargetSource==='copy')setPromotionTargetStatus('O nome excede 20 caracteres; o Item importado da copy foi preservado.');
      else setPromotionTargetStatus('O produto detectado excede o limite de 20 caracteres do campo Item; ajuste-o manualmente.');
      return;
    }
    if(hasCopy&&!copyConfirms){
      if(promotionTargetSource==='campaign'&&stillManagedValue){promotionTargetField.value='';promotionTargetSource='';promotionTargetAutoValue='';scheduleDraftSave()}
      setPromotionTargetStatus(promotionTargetSource==='copy'
        ?'O produto do nome não foi confirmado na copy; o Item importado foi preservado. Confira-o manualmente.'
        :'O produto do nome da campanha não apareceu nos títulos nem nas palavras-chave. Confira e preencha o Item manualmente.');
      return;
    }
    if((!current&&promotionTargetSource!=='manual')||stillManagedValue||promotionTargetSource==='copy'){
      promotionTargetField.value=product;
      promotionTargetField.setCustomValidity('');
      promotionTargetSource='campaign';
      promotionTargetAutoValue=product;
      setPromotionTargetStatus(hasCopy
        ?'Item preenchido pelo produto da campanha e confirmado nos títulos ou nas palavras-chave. Você pode editá-lo.'
        :'Item preenchido pelo nome da campanha. A conferência com títulos e palavras-chave ocorrerá quando a copy for informada.',true);
      scheduleDraftSave();
      return;
    }
    setPromotionTargetStatus(promotionTargetSource==='manual'
      ?'Item editado manualmente; o Hub preservará seu valor.'
      :'Já existe um Item neste rascunho; o Hub preservou o valor.');
  }

  function renderClickBankKeywordSources(restoreOfferKey = clickBankOfferSelect.value) {
    if(clickBankManualControls)clickBankManualControls.hidden=Boolean(campaignDeliverySource?.offerKey);
    clickBankOfferSelect.replaceChildren();
    const placeholder=document.createElement('option');
    placeholder.value='';
    placeholder.textContent=clickBankKeywordSources.length?'Selecione uma oferta da Curadoria':'Nenhuma oferta com candidatas salvas';
    clickBankOfferSelect.append(placeholder);
    clickBankKeywordSources.forEach(item=>{
      const option=document.createElement('option');
      option.value=keywordSourceKey(item);
      option.textContent=item.offerName+(item.seller?' · '+item.seller:'')+' · '+keywordSourcePlatform(item)+' · +'+item.keywords.length+' positivas / −'+item.negativeKeywords.length+' negativas'+(item.sourceType==='campaign-delivery'?' · entrega local':'');
      clickBankOfferSelect.append(option);
    });
    const restoredSource=clickBankKeywordSources.find(item=>keywordSourceKey(item)===String(restoreOfferKey||''))
      ||clickBankKeywordSources.find(item=>item.offerKey===String(restoreOfferKey||'')&&keywordSourcePlatform(item)==='CB');
    if(restoreOfferKey&&!restoredSource){
      const unavailable=document.createElement('option');
      unavailable.value=restoreOfferKey;
      unavailable.textContent='Oferta deste rascunho sem candidatas disponíveis';
      clickBankOfferSelect.append(unavailable);
    }
    clickBankOfferSelect.value=restoredSource?keywordSourceKey(restoredSource):restoreOfferKey||'';
    updateClickBankKeywordImportState();
  }

  function clickBankTermListError(keywords, label) {
    return keywordListError(keywords.join('\n'), {label});
  }

  function updateClickBankDeliveryCommissionStatus() {
    if(!clickBankCommissionStatus)return;
    const savedAmount=campaignDeliverySource?.commissionCurrency==='USD'?campaignDeliverySource.commissionAmountUsd:null;
    const recovered=clickBankCurationCommission?.offerKey===campaignDeliverySource?.offerKey&&keywordSourcePlatform(campaignDeliverySource)==='CB'?clickBankCurationCommission:null;
    const amount=isCommissionUsd(savedAmount)?savedAmount:recovered?.amount;
    const brand=campaignDeliverySource&&Object.hasOwn(campaignDeliverySource,'brandBidding')?campaignDeliverySource.brandBidding:recovered?.brandBidding;
    const selectedBrand=brand==='brand_bidding'||brand==='no_brand_bidding'?brand:campaignDeliverySource?'no_brand_bidding':'';
    for(const input of curationBrandBiddingInputs){input.disabled=!campaignDeliverySource; if(!deliveryBrandBiddingOverride)input.checked=input.value===selectedBrand;}
    const sourceName=keywordSourcePlatformName(campaignDeliverySource);
    if(clickBankCommissionField)clickBankCommissionField.value=isCommissionUsd(amount)?formatCommissionUsd(amount):'';
    clickBankCommissionStatus.dataset.state=isCommissionUsd(amount)?'received':campaignDeliverySource?'missing':'empty';
    clickBankCommissionStatus.textContent=isCommissionUsd(amount)
      ?`Comissão ${sourceName} recebida da Curadoria: ${formatCommissionUsd(amount)}.`
      :recovered?.error?'Não foi possível consultar a comissão na Curadoria. Recarregue esta tela para tentar novamente.':campaignDeliverySource?`Nenhuma comissão em USD encontrada para esta entrega da ${sourceName}.`:'';
  }

  function updateClickBankKeywordImportState(message = '') {
    renderKeywordMatchLabels();
    updateClickBankDeliveryCommissionStatus();
    updateClickBankNegativeKeywordImportState();
    const selected=selectedClickBankKeywordSource();
    const keywords=selected?.keywords||[];
    const negativeKeywords=selected?.negativeKeywords||[];
    const positiveError=clickBankTermListError(keywords,'palavras-chave positivas');
    const negativeError=clickBankTermListError(negativeKeywords,'palavras-chave negativas');
    const hasCandidates=keywords.length>0||negativeKeywords.length>0;
    clickBankKeywordsImportButton.disabled=!selected||!hasCandidates||Boolean(positiveError||negativeError);
    const hasCurrentTerms=keywordFieldLines(keywordField).length||keywordFieldLines(negativeKeywordField).length;
    const deliveryReplacementRequired=selected?.sourceType==='campaign-delivery'&&hasCandidates&&hasCurrentTerms
      &&!(keywordFieldMatches(keywordField,keywords)&&keywordFieldMatches(negativeKeywordField,negativeKeywords));
    clickBankKeywordsImportButton.textContent=deliveryReplacementRequired?'Substituir termos pela Entrega':'Importar palavras-chave da Curadoria';
    if(message){clickBankKeywordStatus.textContent=message;return;}
    if(selected?.sourceType!=='campaign-delivery'&&clickBankKeywordSourcesLoading){clickBankKeywordStatus.textContent='Lendo as ofertas e candidatas salvas no armazenamento local…';return;}
    if(selected?.sourceType!=='campaign-delivery'&&clickBankKeywordSourcesError){clickBankKeywordStatus.textContent=clickBankKeywordSourcesError;return;}
    if(selected?.sourceType!=='campaign-delivery'&&!clickBankKeywordSourcesLoaded){clickBankKeywordStatus.textContent='As candidatas positivas e negativas são lidas localmente no ClickBank. Esta importação não consulta a API do Google Ads.';return;}
    if(selected?.sourceType!=='campaign-delivery'&&!clickBankKeywordSources.length){clickBankKeywordStatus.textContent='Nenhuma oferta tem candidatas salvas. Adicione termos nas fichas Google Trends ou Google Imagens para importá-los aqui.';return;}
    if(!selected){
      clickBankKeywordStatus.textContent=clickBankOfferSelect.value
        ? 'A oferta salva neste rascunho não tem candidatas disponíveis. Escolha uma oferta atual ou recarregue esta tela para ler os dados locais novamente.'
        : 'Selecione a oferta da garimpagem. Depois clique em Importar palavras-chave da Curadoria para trazer as listas disponíveis aos campos.';
      return;
    }
    if(!hasCandidates){clickBankKeywordStatus.textContent='Esta oferta não tem candidatas salvas no Google Trends nem no Google Imagens.';return;}
    if(positiveError||negativeError){clickBankKeywordStatus.textContent=[positiveError,negativeError].filter(Boolean).join(' ');return;}
    const matchMessage='A correspondência é identificada em cada linha.';
    clickBankKeywordStatus.textContent=(selected.sourceType==='campaign-delivery'?'Entrega local · ':'')+keywords.length+' candidata(s) positiva(s) e '+negativeKeywords.length+' negativa(s) salvas para '+selected.offerName+(selected.seller?' · '+selected.seller:'')+'. '+matchMessage+' O clique atualiza cada campo com os termos disponíveis; se uma lista não tiver candidatas, o campo correspondente permanece como está.';
  }

  function updateClickBankNegativeKeywordImportState(message = '') {
    const selected=selectedClickBankKeywordSource();
    const keywords=selected?.negativeKeywords||[];
    if(message){clickBankNegativeKeywordStatus.textContent=message;return;}
    if(selected?.sourceType!=='campaign-delivery'&&clickBankKeywordSourcesLoading){clickBankNegativeKeywordStatus.textContent='Lendo as avaliações salvas de Google Imagens no armazenamento local…';return;}
    if(selected?.sourceType!=='campaign-delivery'&&clickBankKeywordSourcesError){clickBankNegativeKeywordStatus.textContent=clickBankKeywordSourcesError;return;}
    if(selected?.sourceType!=='campaign-delivery'&&!clickBankKeywordSourcesLoaded){clickBankNegativeKeywordStatus.textContent='As candidatas negativas são lidas localmente da aba Google Imagens; não há consulta à API do Google Ads.';return;}
    if(!selected){
      clickBankNegativeKeywordStatus.textContent=clickBankOfferSelect.value
        ? 'A oferta salva neste rascunho não tem candidatas disponíveis. Escolha uma oferta atual ou recarregue esta tela para ler os dados locais novamente.'
        : 'Selecione a oferta da garimpagem acima e clique em Importar palavras-chave da Curadoria para trazer as listas disponíveis aos campos.';
      return;
    }
    if(!keywords.length){
      if(selected?.sourceType==='campaign-delivery'&&(selected.keywords||[]).length){
        clickBankNegativeKeywordStatus.textContent=keywordFieldLines(negativeKeywordField).length
          ?'A entrega não tem candidatas negativas; o conteúdo atual só será limpo se você confirmar a substituição.'
          :'A entrega não tem candidatas negativas; o campo continuará vazio ao importar.';
        return;
      }
      clickBankNegativeKeywordStatus.textContent='Nenhuma candidata negativa está salva para esta oferta. O campo negativo permanecerá como está ao importar; adicione termos na aba Google Imagens da Curadoria.';return;
    }
    const error=clickBankTermListError(keywords,'palavras-chave negativas');
    if(error){clickBankNegativeKeywordStatus.textContent=error+' Ajuste a lista na Curadoria.';return;}
    const countries=(selected.negativeKeywordCountries||[]).join(', ');
    const matchMessage='A correspondência é identificada em cada linha.';
    clickBankNegativeKeywordStatus.textContent=keywords.length+' candidata(s) negativas'+(countries?' ('+countries+')':'')+' salvas para '+selected.offerName+(selected.seller?' · '+selected.seller:'')+'. '+matchMessage;
  }

  async function refreshClickBankKeywordSources() {
    const priorOfferKey=clickBankOfferSelect.value||pendingClickBankOfferKeyRestore;
    pendingClickBankOfferKeyRestore='';
    clickBankKeywordSourcesLoading=true;
    clickBankKeywordSourcesError='';
    updateClickBankKeywordImportState();
    try{
    clickBankKeywordSources=mergeCampaignDeliveryKeywordSource(await listClickBankKeywordSources());
      clickBankKeywordSourcesLoaded=true;
      const source=campaignDeliverySource;
      if(source?.offerKey&&keywordSourcePlatform(source)==='CB'&&(!isCommissionUsd(source.commissionAmountUsd)||!Object.hasOwn(source,'brandBidding'))){
        try{
          const records=await getClickBankRecords(clickBankStores.offerMetadata);
          const record=records.find(item=>item?.offerKey===source.offerKey);
          if(sameKeywordSource(campaignDeliverySource,source))clickBankCurationCommission={offerKey:source.offerKey,amount:isCommissionUsd(record?.commissionUsd)?record.commissionUsd:null,brandBidding:record&&Object.hasOwn(record,'brandBidding')?record.brandBidding:'no_brand_bidding'};
        }catch(error){
          if(sameKeywordSource(campaignDeliverySource,source))clickBankCurationCommission={offerKey:source.offerKey,error:true};
          console.warn('Não foi possível consultar a comissão ClickBank da oferta.',error);
        }
      }
    }catch(error){
      clickBankKeywordSources=mergeCampaignDeliveryKeywordSource([]);
      clickBankKeywordSourcesLoaded=true;
      clickBankKeywordSourcesError='Não foi possível ler as candidatas salvas neste navegador. '+(error?.message||'Recarregue esta tela para tentar novamente.');
    }finally{
      clickBankKeywordSourcesLoading=false;
      renderClickBankKeywordSources(priorOfferKey);
      updateFinalUrlFromPreSell();
      if(campaignDeliverySource)renderCpaVariantOptions();
    }
  }

  function importSelectedClickBankKeywords({ replaceMissing = false, successMessage = '' } = {}) {
    const selected=selectedClickBankKeywordSource();
    if(!selected)return { imported: false, empty: true };
    const keywords=selected.keywords||[];
    const negativeKeywords=selected.negativeKeywords||[];
    const error=clickBankTermListError(keywords,'palavras-chave positivas')||clickBankTermListError(negativeKeywords,'palavras-chave negativas');
    if(error||(!keywords.length&&!negativeKeywords.length)){
      updateClickBankKeywordImportState();
      return { imported: false, empty: !keywords.length&&!negativeKeywords.length, error };
    }
    const imported=[];
    const updates=[
      {field:keywordField,terms:keywords,label:'positiva(s)'},
      {field:negativeKeywordField,terms:negativeKeywords,label:'negativa(s)'},
    ];
    updates.forEach(({field,terms,label})=>{
      if(!terms.length&&!replaceMissing)return;
      const nextValue=terms.join('\n');
      if(String(field.value||'')!==nextValue){
        field.value=nextValue;
        field.setCustomValidity('');
        field.dispatchEvent(new window.Event('input',{bubbles:true}));
      }
      imported.push(terms.length?terms.length+' '+label:'campo '+(label==='positiva(s)'?'positivo':'negativo')+' limpo (sem candidatas)');
    });
    const message=successMessage||('Campos atualizados com '+imported.join(' e ')+' da oferta '+selected.offerName+'. A correspondência de cada linha será aplicada na prévia.');
    updateClickBankKeywordImportState(message);
    if(!negativeKeywords.length)updateClickBankNegativeKeywordImportState(replaceMissing
      ?'A entrega não tinha candidatas negativas; o campo foi limpo para evitar misturar termos de outra oferta.'
      :'A Curadoria não tem candidatas negativas salvas para esta oferta; o campo negativo permaneceu como estava.');
    return { imported: true, importedLabels: imported };
  }

  function keywordFieldLines(field) {
    return String(field?.value||'').split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
  }

  function keywordFieldMatches(field, terms) {
    const current=keywordFieldLines(field);
    const incoming=(Array.isArray(terms)?terms:[]).map(value=>String(value||'').trim()).filter(Boolean);
    return current.length===incoming.length&&current.every((value,index)=>value===incoming[index]);
  }

  function importCampaignDeliveryKeywords() {
    const selected=selectedClickBankKeywordSource();
    if(selected?.sourceType!=='campaign-delivery')return { imported: false };
    const keywords=selected.keywords||[];
    const negativeKeywords=selected.negativeKeywords||[];
    const error=clickBankTermListError(keywords,'palavras-chave positivas')||clickBankTermListError(negativeKeywords,'palavras-chave negativas');
    if(error){
      updateClickBankKeywordImportState(error+' A entrega foi vinculada, mas os termos atuais foram preservados.');
      return { imported: false, error };
    }
    if(!keywords.length&&!negativeKeywords.length){
      const hasCurrentTerms=keywordFieldLines(keywordField).length||keywordFieldLines(negativeKeywordField).length;
      const message=hasCurrentTerms
        ?'A entrega não tem candidatas salvas. Os termos atuais foram preservados; confira se pertencem a esta oferta.'
        :'A entrega não tem candidatas salvas para importar.';
      updateClickBankKeywordImportState(message);
      return { imported: false, empty: true, hasCurrentTerms: Boolean(hasCurrentTerms) };
    }
    const hasCurrentTerms=keywordFieldLines(keywordField).length||keywordFieldLines(negativeKeywordField).length;
    const matchesSnapshot=keywordFieldMatches(keywordField,keywords)&&keywordFieldMatches(negativeKeywordField,negativeKeywords);
    if(hasCurrentTerms&&!matchesSnapshot){
      updateClickBankKeywordImportState('A Entrega de '+selected.offerName+' encontrou termos diferentes já preenchidos. Eles foram preservados. Clique em “Substituir termos pela Entrega” para revisar e confirmar a troca; o campo sem candidatas também será limpo.');
      return { imported: false, confirmationRequired: true };
    }
    return importSelectedClickBankKeywords({
      replaceMissing: true,
      successMessage:'Palavras-chave da entrega de '+selected.offerName+' carregadas automaticamente. '+keywords.length+' positiva(s), '+negativeKeywords.length+' negativa(s). A correspondência de cada linha será aplicada na prévia.',
    });
  }

  function handleClickBankKeywordImport() {
    const selected=selectedClickBankKeywordSource();
    const keywords=selected?.keywords||[];
    const negativeKeywords=selected?.negativeKeywords||[];
    const hasCurrentTerms=keywordFieldLines(keywordField).length||keywordFieldLines(negativeKeywordField).length;
    const requiresDeliveryConfirmation=selected?.sourceType==='campaign-delivery'&&(keywords.length||negativeKeywords.length)&&hasCurrentTerms
      &&!(keywordFieldMatches(keywordField,keywords)&&keywordFieldMatches(negativeKeywordField,negativeKeywords));
    if(!requiresDeliveryConfirmation)return importSelectedClickBankKeywords();
    const confirmed=globalThis.confirm('A entrega de “'+selected.offerName+'” tem '+keywords.length+' candidata(s) positiva(s) e '+negativeKeywords.length+' negativa(s). Já existem termos diferentes no formulário.\n\nSubstituir os dois campos pelos dados desta entrega? O campo sem candidatas também será limpo para evitar misturar termos de outra oferta.');
    if(!confirmed){
      updateClickBankKeywordImportState('Substituição cancelada. Os termos existentes foram preservados.');
      return { imported: false, cancelled: true };
    }
    return importSelectedClickBankKeywords({
      replaceMissing: true,
      successMessage:'Termos substituídos pelos dados da entrega de '+selected.offerName+'. '+keywords.length+' positiva(s), '+negativeKeywords.length+' negativa(s).',
    });
  }

  function campaignNameSource() {
    const parsed = parseGoogleAdsCampaignName(form.elements.namedItem('campaign_name').value);
    return {
      percent: Number(form.elements.namedItem('source_target_cpa_percent').value),
      iteration: String(form.elements.namedItem('source_iteration').value || ''),
      product: String(form.elements.namedItem('source_product').value || (parsed.ok ? parsed.product : '')).trim(),
      commission: Number(normalizeDecimal(form.elements.namedItem('source_commission_amount').value)),
      currency: String(form.elements.namedItem('source_commission_currency').value || '').toUpperCase(),
      baseCpa: normalizeDecimal(form.elements.namedItem('source_target_cpa_amount').value),
      targetCurrency: String(form.elements.namedItem('source_target_cpa_currency').value || derivedCpaCurrencyField.value || '').toUpperCase(),
      usdBrlRate: Number(normalizeDecimal(form.elements.namedItem('source_usd_brl_rate').value)),
      usdBrlQuoteDate: String(form.elements.namedItem('source_usd_brl_quote_date').value || ''),
      usdBrlRetrievedAt: String(form.elements.namedItem('source_usd_brl_retrieved_at').value || ''),
    };
  }

  function campaignNameAccountCurrency() {
    const currencies = [...new Set(campaignTargetState().targets.map(target => target.currencyCode).filter(Boolean))];
    return currencies.length === 1 ? currencies[0] : String(referenceAccount()?.currencyCode || '').toUpperCase();
  }

  function campaignUsdBrlRate(source = campaignNameSource()) {
    if (Number.isFinite(source.usdBrlRate) && source.usdBrlRate > 0 && source.usdBrlRate <= 100) return source.usdBrlRate;
    const quote = currentUsdBrlQuote();
    return isUsableUsdBrlQuote(quote) ? Number(quote.rate) : null;
  }

  function currencyPairNeedsUsdBrlRate(sourceCurrency, targetCurrency) {
    const pair = new Set([String(sourceCurrency || '').toUpperCase(), String(targetCurrency || '').toUpperCase()]);
    return pair.size === 2 && pair.has('USD') && pair.has('BRL');
  }

  function campaignNeedsUsdBrlRate(commissionCurrency, modelCurrency = campaignNameAccountCurrency(), targets = campaignTargetState().targets) {
    return targets.some(target => currencyPairNeedsUsdBrlRate(modelCurrency, target.currencyCode)
      || currencyPairNeedsUsdBrlRate(commissionCurrency, target.currencyCode));
  }

  function campaignCurrencyConversionIssue({ targets = campaignTargetState().targets, sourceCurrency = campaignNameAccountCurrency(), rate = campaignUsdBrlRate() } = {}) {
    if (!sourceCurrency) return 'A moeda da conta de referência não está identificada.';
    const unsupported = targets.filter(target => !convertGoogleAdsCurrencyAmount({ amount: 1, sourceCurrency, targetCurrency: target.currencyCode, usdBrlRate: rate }));
    if (!unsupported.length) return '';
    const currencies = [...new Set(unsupported.map(target => target.currencyCode || 'não identificada'))];
    const source = campaignNameSource();
    const needsRate = targets.some(target => currencyPairNeedsUsdBrlRate(sourceCurrency, target.currencyCode)
      || currencyPairNeedsUsdBrlRate(source.currency, target.currencyCode));
    if (needsRate && !(Number.isFinite(rate) && rate > 0)) return 'A cotação PTAX USD/BRL é necessária para converter os valores para todas as contas selecionadas.';
    return 'Não há conversão automática configurada da moeda de referência para: ' + currencies.join(', ') + '.';
  }

  function currentUsdBrlQuote() {
    try { return typeof getUsdBrlQuote === 'function' ? getUsdBrlQuote() : null; }
    catch { return null; }
  }

  function commissionCpaForTargetCurrency({ commission, percent, sourceCurrency, targetCurrency, usdBrlRate }) {
    return calculateGoogleAdsCommissionCpa({ commission, percent, sourceCurrency, targetCurrency, usdBrlRate });
  }

  function formatCpaAmountForTarget(source, percent, targetCurrency) {
    const result = commissionCpaForTargetCurrency({
      commission: source.commission,
      percent,
      sourceCurrency: source.currency,
      targetCurrency,
      usdBrlRate: campaignUsdBrlRate(source),
    });
    if (!result) return '';
    const targetLabel = cpaVariantCurrencyLabel(targetCurrency, Number(result.targetAmount));
    return result.converted
      ? targetLabel + ' · ' + cpaVariantCurrencyLabel(source.currency, Number(result.sourceAmount))
      : targetLabel;
  }

  function formatCpaAmountForTargets(source, percent) {
    const currencies = [...new Set(campaignTargetState().targets.map(target => target.currencyCode).filter(Boolean))];
    if (currencies.length <= 1) return formatCpaAmountForTarget(source, percent, currencies[0] || source.targetCurrency || source.currency);
    return [...new Set(currencies.flatMap(currency => formatCpaAmountForTarget(source, percent, currency).split(' · ').filter(Boolean)))].join(' · ');
  }

  function cpaVariantCurrencyLabel(currency, amount) {
    if (!currency || !Number.isFinite(amount)) return '';
    try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount); }
    catch { return amount.toFixed(2) + ' ' + currency; }
  }

  function cpaVariantIsAvailable(source) {
    const parsed = parseGoogleAdsCampaignName(form.elements.namedItem('campaign_name').value);
    const targets = campaignTargetState().targets;
    const currencies = [...new Set(targets.map(target => target.currencyCode).filter(Boolean))];
    const targetCurrency = campaignNameAccountCurrency();
    const targetCpaUnchanged = normalizeDecimal(targetCpaField.value) === source.baseCpa;
    const supportedCurrency = targetCurrency && targets.every(target =>
      commissionCpaForTargetCurrency({ commission: source.commission, percent: source.percent, sourceCurrency: source.currency, targetCurrency: target.currencyCode, usdBrlRate: campaignUsdBrlRate(source) })
      && convertGoogleAdsCurrencyAmount({ amount: 1, sourceCurrency: targetCurrency, targetCurrency: target.currencyCode, usdBrlRate: campaignUsdBrlRate(source) }));
    const deliveryBase=campaignDeliverySource?Math.min(...deliveryCpaSelections):null;
    const deliveryRecovered=clickBankCurationCommission?.offerKey===campaignDeliverySource?.offerKey&&keywordSourcePlatform(campaignDeliverySource)==='CB'?clickBankCurationCommission:null;
    const deliveryBrand=form.querySelector('[name="brand_bidding"]:checked')?.value
      ||(campaignDeliverySource&&Object.hasOwn(campaignDeliverySource,'brandBidding')?campaignDeliverySource.brandBidding:deliveryRecovered?.brandBidding);
    const deliveryCountries=normalizeGoogleAdsCountryCodeInput(form.elements.namedItem('geo_target_country_codes').value).countryCodes;
    const deliveryMatches=!campaignDeliverySource||(parsed.ok&&parsed.platformCode===keywordSourcePlatform(campaignDeliverySource)&&parsed.product===source.product&&parsed.geoTargetingMode===(campaignDeliverySource.geoTargetingMode||'COUNTRIES')&&parsed.countries.join(',')===deliveryCountries.join(',')&&parsed.biddingModelCode===(deliveryBrand==='brand_bidding'?'BB':deliveryBrand==='no_brand_bidding'?'NBB':'')&&Number(parsed.targetCpaPercent)===deliveryBase&&Number(parsed.commissionAmount)===source.commission&&parsed.commissionCurrency===source.currency);
    return deliveryMatches && parsed.ok && source.percent >= CPA_VARIANT_MIN_PERCENT && source.percent <= CPA_VARIANT_MAX_PERCENT
      && source.commission > 0
      && ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'].includes(biddingStrategyField.value)
      && targets.length > 0 && targets.every(target => target.account && !target.reason && target.finalUrl)
      && currencies.length > 0 && supportedCurrency
      && source.targetCurrency === targetCurrency
      && derivedCpaCurrencyField.value.toUpperCase() === targetCurrency
      && targetCpaUnchanged;
  }

  function applyAccountCurrencyToPayload(basePayload, target, sourceCurrency, rate) {
    const targetCurrency = String(target.currencyCode || '').toUpperCase();
    const convertField = (field, label) => {
      if (!basePayload[field]) return;
      const converted = convertGoogleAdsCurrencyAmount({ amount: basePayload[field], sourceCurrency, targetCurrency, usdBrlRate: rate });
      if (!converted) throw new Error('Não foi possível converter ' + label + ' de ' + sourceCurrency + ' para ' + targetCurrency + ' na conta ' + (target.account?.name || target.accountId) + '. Confira a PTAX e a moeda da conta.');
      basePayload[field] = converted.targetAmount;
    };
    convertField('dailyBudget', 'o orçamento diário');
    basePayload.dailyBudgetCurrency = targetCurrency;
    basePayload.accountCurrency = targetCurrency;
    if (basePayload.maxCpcBid) {
      convertField('maxCpcBid', 'o CPC máximo');
      basePayload.maxCpcBidCurrency = targetCurrency;
    } else basePayload.maxCpcBidCurrency = '';
    const promotion = { ...(basePayload.promotion || {}) };
    if (promotion.discount_type === 'amount_off' && promotion.discount_value) {
      const converted = convertGoogleAdsCurrencyAmount({ amount: promotion.discount_value, sourceCurrency, targetCurrency, usdBrlRate: rate });
      if (!converted) throw new Error('Não foi possível converter o valor fixo da promoção de ' + sourceCurrency + ' para ' + targetCurrency + ' na conta ' + (target.account?.name || target.accountId) + '.');
      promotion.discount_value = converted.targetAmount;
    }
    if (promotion.trigger_type === 'orders_over_amount' && promotion.trigger_value) {
      const converted = convertGoogleAdsCurrencyAmount({ amount: promotion.trigger_value, sourceCurrency, targetCurrency, usdBrlRate: rate });
      if (!converted) throw new Error('Não foi possível converter o pedido mínimo de ' + sourceCurrency + ' para ' + targetCurrency + ' na conta ' + (target.account?.name || target.accountId) + '.');
      promotion.trigger_value = converted.targetAmount;
    }
    basePayload.promotion = promotion;
    return basePayload;
  }

  function previewQuotaUsageLabel(usage = lastPreviewQuotaUsage) {
    if (!usage) return '';
    const requestsObserved = Number(usage.requestsObserved) || 0;
    if (!requestsObserved) return '0 operações estimadas';
    const estimated = Number(usage.quotaOperationsEstimated) || 0;
    const hasUnmeasuredCost = Number(usage.quotaOperationsUnknown) > 0
      || Number(usage.requestsUnknown) > 0
      || Number(usage.requestsWithoutServerCounts) > 0;
    if (estimated === 0 && hasUnmeasuredCost && Number(usage.requestsWithServerCounts) === 0) return 'operações não medidas';
    return estimated + ' operações estimadas' + (hasUnmeasuredCost ? ' · parcial' : '');
  }

  function setPreviewButtonLabel(label) {
    previewButtonBaseLabel = String(label || 'Validar prévia');
    const quotaLabel = previewQuotaUsageLabel();
    previewButton.textContent = quotaLabel
      ? previewButtonBaseLabel.endsWith(')')
        ? previewButtonBaseLabel.slice(0, -1) + ' · ' + quotaLabel + ')'
        : previewButtonBaseLabel + ' (' + quotaLabel + ')'
      : previewButtonBaseLabel;
    previewButton.title = lastPreviewQuotaUsage
      ? 'Uso estimado da cota nesta execução, informado pelos contadores do serviço privado. Não é a medição global do projeto no Google Cloud.'
        + (Number(lastPreviewQuotaUsage.requestsWithoutServerCounts) > 0 || Number(lastPreviewQuotaUsage.quotaOperationsUnknown) > 0 || Number(lastPreviewQuotaUsage.requestsUnknown) > 0
          ? ' Parte das operações não pôde ser determinada.' : '')
      : '';
  }

  function refreshPreviewButtonQuotaLabel() {
    setPreviewButtonLabel(previewButtonBaseLabel);
  }

  function emptyPreviewQuotaUsage() {
    return {
      version: 1,
      quotaOperationsEstimated: 0,
      quotaOperationsUnknown: 0,
      requestsObserved: 0,
      requestsWithServerCounts: 0,
      requestsWithoutServerCounts: 0,
      requestsUnknown: 0,
      completedAtUtc: '',
    };
  }

  function updateCpaVariantSelectionCount() {
    if (batchEntries.length) {
      const pendingCount = batchEntries.filter(entry => ['pending', 'preview_stale'].includes(entry.state)).length;
      const failedCount = batchEntries.filter(entry => entry.state === 'preview_failed').length;
      setPreviewButtonLabel(pendingCount
        ? 'Validar pendentes/desatualizadas (' + pendingCount + ')'
        : failedCount
          ? 'Tentar validações com falha (' + failedCount + ')'
          : 'Revalidar todas (' + batchEntries.length + ')');
      return;
    }
    const source = campaignNameSource();
    const available = cpaVariantIsAvailable(source);
    const selectedExtras = getCpaVariantLabels().filter(label =>
      !label.classList.contains('is-base')
      && label.querySelector('input').checked
      && !label.querySelector('input').disabled
    ).length;
    const accountCount = Math.max(1, campaignTargetState().targets.length);
    const selectedCount = accountCount * (available ? 1 + selectedExtras : 1);
    setPreviewButtonLabel('Validar prévia (' + selectedCount + ' campanha' + (selectedCount === 1 ? '' : 's') + ')');
  }

  function syncDeliveryAutomaticCampaign() {
    if(!campaignDeliverySource||restoringDraft||busy||creating||completed||uncertain||activeCampaignBatchId)return '';
    const source=campaignDeliverySource;
    const recovered=clickBankCurationCommission?.offerKey===source.offerKey&&keywordSourcePlatform(source)==='CB'?clickBankCurationCommission:null;
    const commission=isCommissionUsd(source.commissionAmountUsd)&&source.commissionCurrency==='USD'?source.commissionAmountUsd:recovered?.amount;
    const brand=form.querySelector('[name="brand_bidding"]:checked')?.value
      ||(Object.hasOwn(source,'brandBidding')?source.brandBidding:recovered?.brandBidding)
      ||'no_brand_bidding';
    const productField=form.elements.namedItem('source_product');
    const product=String(productField.value||source.productName||'').trim();
    const countries=normalizeGoogleAdsCountryCodeInput(form.elements.namedItem('geo_target_country_codes').value).countryCodes;
    const pct=Math.min(...deliveryCpaSelections);
    const oldAuto=parseGoogleAdsCampaignName(deliveryAutoName);
    const now=new Date();
    const date=oldAuto.ok?oldAuto.sourceDate:String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0');
    const iteration=oldAuto.ok?Number(oldAuto.iteration):latestGoogleAdsCampaignIteration({product,campaignNames:syncKnownCampaignNames(),reservations:readGoogleAdsCampaignSequenceReservations()})+1;
    const targets=campaignTargetState().targets;
    const currencies=[...new Set(targets.map(t=>String(t.currencyCode||'').toUpperCase()))];
    const currency=campaignNameAccountCurrency();
    const quote=currentUsdBrlQuote(),rate=isUsableUsdBrlQuote(quote)?Number(quote.rate):null;
    const needsUsdBrlRate=currencies.includes('BRL');
    const geoTargetingMode=source.geoTargetingMode||'COUNTRIES';
    const result=prepareDeliveryCampaign({product,countries,geoTargetingMode,brandBidding:brand,commissionUsd:commission,percent:pct,date,iteration,currency,usdBrlRate:rate,platformCode:keywordSourcePlatform(source)});
    if(!result.ok)return result.reason;
    const nameField=form.elements.namedItem('campaign_name');
    const currentName=String(nameField.value||'').trim();
    if(currentName&&currentName!==deliveryAutoName){
      const parsed=parseGoogleAdsCampaignName(currentName);
      if(!parsed.ok||parsed.platformCode!==keywordSourcePlatform(source)||parsed.product!==product||parsed.geoTargetingMode!==geoTargetingMode||parsed.countries.join(',')!==countries.join(',')||parsed.biddingModelCode!==(brand==='brand_bidding'?'BB':'NBB')||Number(parsed.targetCpaPercent)!==pct||Number(parsed.commissionAmount)!==commission||parsed.commissionCurrency!=='USD')return 'Nome editado preservado. Ajuste-o para a plataforma, o destino geográfico, a classificação, a menor faixa marcada e a comissão da oferta antes de validar.';
    }else{
      if(currentName!==result.name){nameField.value=result.name;deliveryAutoName=result.name;clearPreview();scheduleDraftSave({force:true});}
    }
    const currentCpa=String(targetCpaField.value||'').trim();
    if(!result.cpa){
      if(needsUsdBrlRate&&!rate&&!deliveryQuoteRequested&&typeof refreshUsdBrlQuote==='function'){
        deliveryQuoteRequested=true;Promise.resolve().then(()=>refreshUsdBrlQuote()).catch(()=>{}).finally(()=>{if(campaignDeliverySource?.offerKey===source.offerKey)renderCpaVariantOptions();});
      }
      return currency==='BRL'?'Aguardando cotação PTAX válida para calcular o CPA em BRL.':'Confira a moeda das contas para calcular o CPA.';
    }
    if(needsUsdBrlRate&&!rate){
      if(!deliveryQuoteRequested&&typeof refreshUsdBrlQuote==='function'){
        deliveryQuoteRequested=true;Promise.resolve().then(()=>refreshUsdBrlQuote()).catch(()=>{}).finally(()=>{if(campaignDeliverySource?.offerKey===source.offerKey)renderCpaVariantOptions();});
      }
      return 'Aguardando cotação PTAX USD/BRL para converter os valores entre as contas.';
    }
    const currencyIssue=campaignCurrencyConversionIssue({targets,sourceCurrency:currency,rate});
    if(currencyIssue)return currencyIssue;
    if(currentCpa&&normalizeDecimal(currentCpa)!==normalizeDecimal(deliveryAutoCpa))return 'CPA editado preservado. Confira-o antes de validar as faixas selecionadas.';
    let changed=normalizeDecimal(targetCpaField.value)!==normalizeDecimal(result.cpa);
    const dailyBudgetField=form.elements.namedItem('daily_budget');
    if(dailyBudgetField?.dataset.budgetSource!=='manual'){
      const suggestedBudget=suggestedGoogleAdsDailyBudget({commission,sourceCurrency:'USD',targetCurrency:currency,usdBrlRate:rate});
      if(suggestedBudget){if(normalizeDecimal(dailyBudgetField.value)!==normalizeDecimal(suggestedBudget)){dailyBudgetField.value=suggestedBudget;changed=true;}dailyBudgetField.dataset.budgetSource='commission';}
    }
    const sourcePlatformCode=keywordSourcePlatform(source),sourcePlatformName=keywordSourcePlatformName(source);
    const metadata={source_campaign_date:date,source_product:product,source_iteration:String(iteration),source_platform_code:sourcePlatformCode,source_platform:sourcePlatformName,source_bidding_model_code:brand==='brand_bidding'?'BB':'NBB',source_commission_amount:String(commission),source_commission_currency:'USD',source_target_cpa_percent:String(pct),source_target_cpa_amount:result.cpa,source_target_cpa_currency:result.currency,derived_target_cpa_currency:result.currency,source_usd_brl_rate:needsUsdBrlRate?String(rate):'',source_usd_brl_quote_date:needsUsdBrlRate?String(quote?.quoteDate||quote?.quotedAt||'').slice(0,10):'',source_usd_brl_retrieved_at:needsUsdBrlRate?String(quote?.retrievedAt||''):''};
    targetCpaField.value=result.cpa;targetCpaField.setCustomValidity('');deliveryAutoCpa=result.cpa;
    for(const [name,value] of Object.entries(metadata)){const field=form.elements.namedItem(name);if(field.value!==String(value)){field.value=String(value);changed=true;}}
    if(changed){clearPreview();scheduleDraftSave({force:true});}
    return '';
  }

  function renderDeliveryCpaOptions() {
    const selection=resolveDeliveryCpaSelection(deliveryCpaStart,[...deliveryCpaSelections]);
    deliveryCpaStart=selection.start;deliveryCpaSelections=new Set(selection.selected);
    const valid=selection.levels,base=selection.base;
    selectedCpaVariantPercents=new Set([...deliveryCpaSelections].filter(value=>value!==base));
    const issue=syncDeliveryAutomaticCampaign();
    const source=campaignNameSource();
    cpaVariantsOptions.replaceChildren();
    const startLabel=document.createElement('label');startLabel.className='google-ads-creation-field';
    const caption=document.createElement('span');caption.textContent='Primeira faixa (%)';
    const start=document.createElement('input');start.className='input';start.type='number';start.min='30';start.max='80';start.step='0.01';start.value=String(deliveryCpaStart);start.setAttribute('data-delivery-cpa-start','');
    startLabel.append(caption,start);cpaVariantsOptions.append(startLabel);
    for(const percent of valid){
      const label=document.createElement('label');label.className='google-ads-cpa-variant';label.dataset.cpaVariantLabel=String(percent);label.classList.toggle('is-base',percent===base);
      const input=document.createElement('input');input.type='checkbox';input.name='cpa_variant';input.value=String(percent);input.checked=deliveryCpaSelections.has(percent);
      const text=document.createElement('span');const detail=formatCpaAmountForTargets(source,percent);text.textContent=percent+'%'+(percent===base?' · menor faixa':'')+(detail?' · '+detail:'');label.append(input,text);cpaVariantsOptions.append(label);
    }
    updateCpaVariantSelectionCount();
    cpaVariantsStatus.textContent=issue||('A menor faixa marcada ('+base+'%) define o nome e o CPA base. As demais faixas marcadas serão incluídas no lote, em passos de 10 pontos.');
  }

  function renderCpaVariantOptions({ selectedPercents } = {}) {
    if(campaignDeliverySource){renderDeliveryCpaOptions();return;}
    const source = campaignNameSource();
    const parsed = parseGoogleAdsCampaignName(form.elements.namedItem('campaign_name').value);
    const hasBase = parsed.ok && source.percent > 0 && source.commission > 0;
    const available = cpaVariantIsAvailable(source);
    const previouslySelected = selectedPercents === undefined
      ? getCpaVariantLabels().filter(label => !label.classList.contains('is-base') && label.querySelector('input').checked).map(label => Number(label.dataset.cpaVariantLabel))
      : selectedPercents;
    selectedCpaVariantPercents = new Set((previouslySelected || []).map(value => Number(value)).filter(Number.isFinite));
    if (!hasBase || source.percent < CPA_VARIANT_MIN_PERCENT || source.percent > CPA_VARIANT_MAX_PERCENT) selectedCpaVariantPercents.clear();
    const levels = hasBase ? [source.percent] : [];
    if (hasBase && source.percent >= CPA_VARIANT_MIN_PERCENT && source.percent <= CPA_VARIANT_MAX_PERCENT) {
      for (let step = 1; ; step++) {
        const percent = Math.round((source.percent + step * CPA_VARIANT_STEP_PERCENT) * 1_000_000) / 1_000_000;
        if (percent > CPA_VARIANT_MAX_PERCENT + 1e-9) break;
        levels.push(percent);
      }
    }
    const eligibleLevels = new Set(levels.slice(1));
    selectedCpaVariantPercents = new Set([...selectedCpaVariantPercents].filter(percent => eligibleLevels.has(percent)));
    cpaVariantsOptions.replaceChildren();
    const variantInputs = levels.map((percent, index) => {
      const percentValue = String(percent);
      const label = document.createElement('label');
      label.className = 'google-ads-cpa-variant';
      label.dataset.cpaVariantLabel = percentValue;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'cpa_variant';
      input.value = percentValue;
      const isBase = index === 0;
      input.checked = isBase || (!isBase && selectedCpaVariantPercents.has(percent));
      input.disabled = isBase || !available;
      label.classList.toggle('is-base', isBase);
      const detailAmount = formatCpaAmountForTargets(source, percent);
      const detail = isBase
        ? 'Base obrigatória · ' + (detailAmount || 'CPA indisponível')
        : (detailAmount || 'CPA indisponível');
      const text = document.createElement('span');
      text.textContent = percentValue + '% · ' + detail;
      label.append(input, text);
      cpaVariantsOptions.append(label);
      return { label, input, percent, isBase };
    });
    const enabled = variantInputs.filter(item => !item.isBase && !item.input.disabled);
    updateCpaVariantSelectionCount();
    if (!hasBase) {
      cpaVariantsStatus.textContent = 'Calcule as informações do nome para incluir o CPA base e escolher os próximos níveis para todas as contas.';
      return;
    }
    if (source.percent < CPA_VARIANT_MIN_PERCENT || source.percent > CPA_VARIANT_MAX_PERCENT) {
      cpaVariantsStatus.textContent = 'O CPA base detectado é ' + source.percent + '%. Para criar níveis, o percentual base precisa estar entre 30% e 80%; a campanha única ainda pode ser validada.';
      return;
    }
    if (!available) {
      const currencies = [...new Set(campaignTargetState().targets.map(target => target.currencyCode).filter(Boolean))];
      const currencyIssue = campaignCurrencyConversionIssue({ targets: campaignTargetState().targets, sourceCurrency: campaignNameAccountCurrency(), rate: campaignUsdBrlRate(source) });
      const missingCpa = campaignTargetState().targets.some(target => !commissionCpaForTargetCurrency({ commission: source.commission, percent: source.percent, sourceCurrency: source.currency, targetCurrency: target.currencyCode, usdBrlRate: campaignUsdBrlRate(source) }));
      cpaVariantsStatus.textContent = currencies.length > 1 && currencyIssue
        ? currencyIssue
        : missingCpa
          ? 'Não é possível calcular o CPA em todas as moedas selecionadas a partir da comissão detectada. Confira a moeda e a cotação PTAX.'
        : source.currency === 'USD' && currencies[0] === 'BRL' && !(Number.isFinite(source.usdBrlRate) && source.usdBrlRate > 0)
          ? 'A comissão está em USD e as contas em BRL. Recalcule as informações para carregar a cotação PTAX e habilitar os níveis de CPA.'
        : 'A base detectada é ' + source.percent + '%. Confira o CPA calculado, a moeda e as URLs das contas selecionadas para habilitar os níveis acima dela.';
      return;
    }
    const fxRate = campaignUsdBrlRate(source);
    const fxNote = campaignNeedsUsdBrlRate(source.currency) && Number.isFinite(fxRate) && fxRate > 0
      ? ' Conversão PTAX de venda BCB: R$ ' + Number(fxRate).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
        + (source.usdBrlQuoteDate ? ' · cotação de ' + source.usdBrlQuoteDate : '') + '.'
      : '';
    cpaVariantsStatus.textContent = source.percent + '% obrigatório como menor CPA · ' + formatCpaAmountForTargets(source, source.percent) + '.' + fxNote + ' '
      + campaignTargetState().targets.length + ' conta(s) selecionada(s); cada nível marcado será aplicado a todas. '
      + ([...new Set(campaignTargetState().targets.map(target => target.currencyCode))].length > 1 ? 'CPA, orçamento, CPC e valores monetários da promoção serão convertidos para a moeda de cada conta; a promoção não é incluída no CSV online. ' : '')
      + (enabled.length ? 'Marque os próximos níveis em passos de 10 pontos; o último nunca ultrapassa 80%.' : 'Não há outro nível em passos de 10 pontos até o limite de 80%.');
  }

  function buildCampaignBatchEntries() {
    const basePayload = collectPayload();
    const source = campaignNameSource();
    const targetsState = campaignTargetState();
    const targets = targetsState.targets;
    const selectedPercents = getCpaVariantLabels().map(label => ({ input: label.querySelector('input'), percent: Number(label.dataset.cpaVariantLabel) }))
      .filter(item => item.input.checked && !item.input.disabled && item.percent > source.percent)
      .map(item => item.percent)
      .sort((left, right) => left - right);
    if (!targets.length) throw new Error('Não foi possível identificar nenhuma conta de destino. Selecione contas na Ficha e Presell ou uma conta de referência.');
    const invalidTargets = targets.filter(target => !target.account || !target.accountId || !target.managerCustomerId || !target.currencyCode || !target.finalUrl || target.reason);
    if (invalidTargets.length) {
      const details = invalidTargets.map(target => (target.account?.name || 'Conta ' + (target.accountId || 'sem ID'))
        + ': ' + (target.reason || (!target.finalUrl ? 'URL final HTTPS ausente na Ficha e Presell.' : !target.currencyCode ? 'moeda da conta ausente no diretório local.' : 'registro da conta incompleto.'))).join(' ');
      throw new Error('Corrija as contas de destino da Ficha e Presell antes da prévia. ' + details);
    }
    const currencies = [...new Set(targets.map(target => target.currencyCode))];
    const referenceCurrency = campaignNameAccountCurrency();
    const fxRate = campaignUsdBrlRate(source);
    const conversionIssue = campaignCurrencyConversionIssue({ targets, sourceCurrency: referenceCurrency, rate: fxRate });
    if (conversionIssue) throw new Error(conversionIssue + ' Moedas encontradas: ' + (currencies.join(', ') || 'não identificada') + '.');
    if (selectedPercents.length && !cpaVariantIsAvailable(source)) {
      throw new Error('Confira o CPA base, a moeda e as URLs das contas selecionadas antes de marcar outras faixas.');
    }
    const parsed = parseGoogleAdsCampaignName(basePayload.campaignName);
    if(campaignDeliverySource&&(!parsed.ok||Number(parsed.targetCpaPercent)!==Math.min(...deliveryCpaSelections)||!cpaVariantIsAvailable(source)))throw new Error('Confira o nome, a menor faixa marcada, o CPA e a moeda antes de validar a entrega.');
    if (!parsed.ok) {
      if (targets.length > 1 || selectedPercents.length) throw new Error('Calcule as informações de um nome no padrão antes de criar em várias contas ou usar níveis de CPA.');
      const payload = applyConversionActionForManager({ ...basePayload, promotion: { ...basePayload.promotion } }, targets[0].managerCustomerId);
      applyAccountCurrencyToPayload(payload, targets[0], referenceCurrency, fxRate);
      if (payload.targetCpa) {
        if (payload.targetCpaCurrency !== targets[0].currencyCode) throw new Error('O CPA informado precisa estar na moeda da conta de destino.');
        payload.accountCurrency = targets[0].currencyCode;
      }
      return [{ payload, percent: source.percent || 'Base', iteration: null, product: '', targetSource: targets[0].source, accountName: targets[0].account.name, accountCurrency: targets[0].currencyCode }];
    }
    if (!source.percent || !source.commission || !source.currency) {
      throw new Error('Clique em “Calcular informações” para carregar percentual, comissão e moeda antes de validar o lote.');
    }
    const usesCpa = ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'].includes(biddingStrategyField.value);
    const needsPerAccountBaseCpa = campaignDeliverySource || currencies.length > 1;
    if (usesCpa && basePayload.targetCpa) {
      if (derivedCpaCurrencyField.value.toUpperCase() !== referenceCurrency) {
        throw new Error('O CPA base precisa estar na moeda da conta de referência (' + referenceCurrency + '). Recalcule as informações do nome.');
      }
      if (needsPerAccountBaseCpa && normalizeDecimal(targetCpaField.value) !== source.baseCpa) {
        throw new Error('O CPA base foi editado. Recalcule ou restaure o valor detectado antes de converter para as moedas das contas.');
      }
      if (needsPerAccountBaseCpa && targets.some(target => !commissionCpaForTargetCurrency({ commission: source.commission, percent: source.percent, sourceCurrency: source.currency, targetCurrency: target.currencyCode, usdBrlRate: fxRate }))) {
        throw new Error('Não foi possível calcular o CPA base para todas as contas. Confira a moeda da comissão, as moedas de destino e a cotação PTAX.');
      }
    }
    const product = source.product || parsed.product;
    const reservations = readGoogleAdsCampaignSequenceReservations();
    const latest = latestGoogleAdsCampaignIteration({ product, campaignNames: syncKnownCampaignNames(), reservations });
    const firstIteration = latest + 1;
    const entries = [];
    for (const target of targets) {
      for (const percent of [source.percent, ...selectedPercents]) {
        const iteration = firstIteration + entries.length;
        const payload = {
          ...basePayload,
          managerCustomerId: target.managerCustomerId,
          customerId: target.accountId,
          campaignName: makeSequencedGoogleAdsCampaignName(basePayload.campaignName, iteration, percent),
          finalUrl: target.finalUrl,
        };
        applyConversionActionForManager(payload, target.managerCustomerId);
        applyAccountCurrencyToPayload(payload, target, referenceCurrency, fxRate);
        if (usesCpa && basePayload.targetCpa) {
          const calculateTargetCpa = campaignDeliverySource || currencies.length > 1 || percent !== source.percent;
          if (calculateTargetCpa) {
            const cpa = commissionCpaForTargetCurrency({ commission: source.commission, percent, sourceCurrency: source.currency, targetCurrency: target.currencyCode, usdBrlRate: fxRate });
            if (!cpa) throw new Error('Não foi possível calcular o CPA de ' + percent + '% na moeda da conta ' + (target.account?.name || target.accountId) + '.');
            payload.targetCpa = cpa.targetAmount;
            payload.targetCpaCurrency = target.currencyCode;
          } else {
            payload.targetCpaCurrency = target.currencyCode;
          }
        } else {
          payload.targetCpaCurrency = '';
        }
        entries.push({ payload, percent, iteration, product, targetSource: target.source, accountName: target.account?.name || target.accountId, accountCurrency: target.currencyCode });
      }
    }
    return entries;
  }

  function renderCampaignCsvControls() {
    if (!campaignCsvManagerSelect || !campaignCsvDownloadButton) return;
    const targets = campaignTargetState().targets || [];
    const byManager = new Map();
    targets.forEach(target => {
      const managerCustomerId = String(target.managerCustomerId || '').replace(/\D/g, '');
      const customerId = String(target.accountId || '').replace(/\D/g, '');
      if (!/^\d{10}$/.test(managerCustomerId) || !/^\d{10}$/.test(customerId)) return;
      const group = byManager.get(managerCustomerId) || { accountIds: new Set(), managerName: '' };
      group.accountIds.add(customerId);
      byManager.set(managerCustomerId, group);
    });
    for (const [managerCustomerId, group] of byManager) {
      const manager = (directory?.managers || []).find(item => String(item.customerId || '').replace(/\D/g, '') === managerCustomerId);
      group.managerName = String(manager?.name || 'MCC');
    }
    const managers = [...byManager.entries()].sort((left, right) => left[0].localeCompare(right[0]));
    const previous = campaignCsvManagerSelect.value;
    campaignCsvManagerSelect.replaceChildren();
    managers.forEach(([managerCustomerId, group]) => {
      selectOption(campaignCsvManagerSelect,
        group.managerName + ' · ' + managerCustomerId + ' · ' + group.accountIds.size + ' conta(s)', managerCustomerId);
    });
    if (managers.some(([managerCustomerId]) => managerCustomerId === previous)) campaignCsvManagerSelect.value = previous;
    else if (managers.some(([managerCustomerId]) => managerCustomerId === managerSelect.value)) campaignCsvManagerSelect.value = managerSelect.value;
    else if (managers.length) campaignCsvManagerSelect.value = managers[0][0];
    campaignCsvManagerField.hidden = managers.length < 2;
    const existingBatchMode = campaignBatchRestored && Boolean(activeCampaignBatchId);
    campaignCsvDownloadButton.disabled = busy || completed || uncertain || existingBatchMode || managers.length === 0;
    updateCampaignCsvWorkflowLauncher();
  }

  function setCampaignCsvStatus(message, isError = false, isWarning = false) {
    campaignCsvStatus.textContent = message;
    campaignCsvStatus.classList.toggle('is-error', isError);
    campaignCsvStatus.classList.toggle('is-warning', !isError && isWarning);
    campaignCsvStatus.classList.toggle('is-success', !isError && !isWarning && Boolean(message));
  }

  function csvWorkflowCampaignIdentity(campaign) {
    return [campaign?.managerCustomerId, campaign?.customerId, campaign?.campaignName]
      .map((value, index) => index < 2 ? String(value || '').replace(/\D/g, '') : String(value || '').trim())
      .join(':');
  }

  function csvWorkflowCampaignPlanKey(campaigns) {
    const entries = (Array.isArray(campaigns) ? campaigns : []).map(campaign => ({
      identity: csvWorkflowCampaignIdentity(campaign),
      geo: campaign?.geoTargetingSnapshot && typeof campaign.geoTargetingSnapshot === 'object'
        ? { mode: campaign.geoTargetingSnapshot.mode, countryCodes: [...(campaign.geoTargetingSnapshot.countryCodes || [])].sort() }
        : null,
    }));
    if (!entries.some(entry => entry.geo)) return JSON.stringify(entries.map(entry => entry.identity).sort());
    return JSON.stringify(entries.sort((left, right) => left.identity.localeCompare(right.identity)));
  }

  function csvWorkflowCampaignSet() {
    return JSON.stringify(createdCampaigns.map(campaignOperationKey).sort());
  }

  function currentCampaignCsvWorkflow() {
    if (campaignCsvWorkflowStorageError) return null;
    if (activeCampaignBatchId) {
      return campaignCsvWorkflowStore.workflows.find(item => item.batchId === activeCampaignBatchId) || null;
    }
    if (activeCampaignCsvWorkflowId) {
      const selected = campaignCsvWorkflowStore.workflows.find(item => item.id === activeCampaignCsvWorkflowId);
      if (selected && (!activeDraftId || selected.draftId === activeDraftId)) return selected;
    }
    if (activeDraftId) {
      return [...campaignCsvWorkflowStore.workflows].reverse().find(item => item.draftId === activeDraftId) || null;
    }
    return null;
  }

  function activeCampaignBatchUsesCsvWorkflow() {
    if (!activeCampaignBatchId) return false;
    const batch = campaignBatchStore.batches.find(item => item.id === activeCampaignBatchId);
    return batch?.creationMode === 'csv'
      || campaignCsvWorkflowStore.workflows.some(item => item.batchId === activeCampaignBatchId);
  }

  function persistCampaignCsvWorkflow(workflow, patch = {}) {
    if (!workflow) return null;
    try {
      const latest = loadGoogleAdsCampaignCsvWorkflows();
      const current = latest.workflows.find(item => item.id === workflow.id);
      if (!current) throw new Error('Este fluxo CSV não está mais salvo neste navegador.');
      const updated = { ...current, ...patch, updatedAtUtc: new Date().toISOString() };
      saveGoogleAdsCampaignCsvWorkflow(updated);
      campaignCsvWorkflowStore = loadGoogleAdsCampaignCsvWorkflows();
      activeCampaignCsvWorkflowId = updated.id;
      campaignCsvWorkflowStorageError = '';
      return campaignCsvWorkflowStore.workflows.find(item => item.id === updated.id) || updated;
    } catch (error) {
      campaignCsvWorkflowStorageError = error?.message || 'Não foi possível salvar o progresso do fluxo CSV.';
      setCampaignCsvStatus(campaignCsvWorkflowStorageError + ' O avanço não foi marcado como concluído.', true);
      return null;
    }
  }

  function updateCampaignCsvWorkflowLauncher() {
    const workflow = currentCampaignCsvWorkflow();
    if (campaignCsvWorkflowStorageError) {
      campaignCsvWorkflowButton.disabled = true;
      campaignCsvWorkflowButton.title = campaignCsvWorkflowStorageError;
      return;
    }
    campaignCsvWorkflowButton.disabled = Boolean(activeCampaignBatchId && !workflow) || busy || campaignAssociationBusy;
    campaignCsvWorkflowButton.textContent = workflow
      ? (workflow.batchId ? 'Continuar fluxo CSV' : 'Retomar fluxo CSV')
      : 'Subir campanha pelo fluxo CSV';
    campaignCsvWorkflowButton.title = activeCampaignBatchId && !workflow
      ? 'Este lote não foi criado por um fluxo CSV salvo. Abra ou crie uma preparação antes de iniciar outro.'
      : 'Abre as etapas ordenadas de upload CSV, associação e ajustes via Google Ads API.';
  }

  function csvWorkflowCurrentPlanMatches(workflow) {
    try {
      const entries = buildCampaignBatchEntries();
      return csvWorkflowCampaignPlanKey(entries.map(entry => ({
        managerCustomerId: entry.payload.managerCustomerId,
        customerId: entry.payload.customerId,
        campaignName: entry.payload.campaignName,
        geoTargetingSnapshot: googleAdsCampaignGeoTargetingFromPayload(entry.payload, { source: 'csv_export' }),
      }))) === csvWorkflowCampaignPlanKey(workflow.plannedCampaigns);
    } catch {
      return false;
    }
  }

  function csvWorkflowCampaignsMatchPlan(workflow, campaigns) {
    const present = new Set((Array.isArray(campaigns) ? campaigns : []).map(csvWorkflowCampaignIdentity));
    return workflow.plannedCampaigns.every(item => present.has(csvWorkflowCampaignIdentity(item)));
  }

  function campaignCsvWorkflowAssociationConfirmed() {
    const workflow = currentCampaignCsvWorkflow();
    if (!workflow || workflow.batchId !== activeCampaignBatchId) return true;
    const signature = csvWorkflowCampaignSet();
    return csvWorkflowCampaignsMatchPlan(workflow, createdCampaigns)
      && Boolean(workflow.associationConfirmedAtUtc) && workflow.associationCampaignSet === signature;
  }

  function campaignCsvWorkflowEuDeclarationConfirmed() {
    const workflow = currentCampaignCsvWorkflow();
    if (!workflow || workflow.batchId !== activeCampaignBatchId) return true;
    const signature = csvWorkflowCampaignSet();
    return campaignCsvWorkflowAssociationConfirmed()
      && createdCampaigns.length > 0
      && createdCampaigns.every(campaign => campaign.campaignChannelType === 'SEARCH' && campaign.euPoliticalAdvertisingResult?.verified === true)
      && Boolean(workflow.euDeclarationConfirmedAtUtc) && workflow.euDeclarationCampaignSet === signature;
  }

  function openCampaignCsvWorkflow() {
    if (campaignCsvWorkflowStorageError) {
      setCampaignCsvStatus(campaignCsvWorkflowStorageError, true);
      return;
    }
    let workflow = currentCampaignCsvWorkflow();
    let allowAdditionalFlow = false;
    if (workflow && !workflow.batchId && activeDraftId && workflow.draftId === activeDraftId && !csvWorkflowCurrentPlanMatches(workflow)) {
      const startAnother = globalThis.confirm('As contas, faixas ou nomes da preparação mudaram desde que este fluxo foi salvo. Quer iniciar um novo fluxo para a preparação atual? O fluxo anterior e suas confirmações serão preservados.');
      if (!startAnother) {
        activeCampaignCsvWorkflowId = workflow.id;
        renderCampaignCsvWorkflowDialog();
        if (typeof campaignCsvWorkflowDialog.showModal === 'function') campaignCsvWorkflowDialog.showModal();
        else campaignCsvWorkflowDialog.setAttribute('open', '');
        return;
      }
      allowAdditionalFlow = true;
      workflow = null;
    }
    if (!workflow) {
      if (activeCampaignBatchId) {
        setCampaignCsvStatus('Este lote salvo não está vinculado a um fluxo CSV. Abra uma preparação para iniciar um novo fluxo.', false, true);
        return;
      }
      let entries;
      try { entries = buildCampaignBatchEntries(); }
      catch (error) {
        setCampaignCsvStatus(error?.message || 'Confira a preparação antes de iniciar o fluxo CSV.', true);
        return;
      }
      if (entries.length > 100) {
        setCampaignCsvStatus('Este fluxo planeja ' + entries.length + ' campanhas. Reduza para até 100 antes de iniciar, limite atual da associação de campanhas existentes.', true);
        return;
      }
      draftForce = true;
      draftDirty = true;
      if (!saveDraftNow() || !activeDraftId) {
        setCampaignCsvStatus('Salve a preparação local antes de iniciar o fluxo CSV.', true);
        return;
      }
      const plannedAtUtc = new Date().toISOString();
      const plannedCampaigns = entries.map(entry => ({
        managerCustomerId: String(entry.payload.managerCustomerId || '').replace(/\D/g, ''),
        customerId: String(entry.payload.customerId || '').replace(/\D/g, ''),
        campaignName: String(entry.payload.campaignName || '').trim(),
        geoTargetingSnapshot: googleAdsCampaignGeoTargetingFromPayload(entry.payload, { source: 'csv_export', recordedAtUtc: plannedAtUtc }),
      }));
      const managersById = new Map();
      plannedCampaigns.forEach(campaign => {
        const current = managersById.get(campaign.managerCustomerId) || { managerCustomerId: campaign.managerCustomerId, accountIds: new Set(), campaignCount: 0 };
        current.accountIds.add(campaign.customerId);
        current.campaignCount += 1;
        managersById.set(campaign.managerCustomerId, current);
      });
      const managers = [...managersById.values()].map(item => ({
        managerCustomerId: item.managerCustomerId,
        name: String((directory?.managers || []).find(manager => String(manager.customerId || '').replace(/\D/g, '') === item.managerCustomerId)?.name || 'MCC'),
        campaignCount: item.campaignCount,
        accountCount: item.accountIds.size,
      }));
      const sameDraftWorkflows = campaignCsvWorkflowStore.workflows.filter(item => item.draftId === activeDraftId);
      const planKey = csvWorkflowCampaignPlanKey(plannedCampaigns);
      const existingPlan = [...sameDraftWorkflows].reverse().find(item => csvWorkflowCampaignPlanKey(item.plannedCampaigns) === planKey && !item.batchId);
      if (existingPlan) workflow = existingPlan;
      else {
        if (sameDraftWorkflows.length && !allowAdditionalFlow
            && !globalThis.confirm('Já existe outro fluxo CSV salvo para esta preparação. Quer criar um novo fluxo mantendo o histórico anterior?')) return;
        const now = new Date().toISOString();
        workflow = {
          id: 'csv-flow-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
          draftId: activeDraftId,
          batchId: '',
          product: String(entries[0]?.product || campaignNameSource()?.product || ''),
          plannedCampaigns,
          managers,
          downloadedManagerIds: [],
          uploadedManagerIds: [],
          associationConfirmedAtUtc: '',
          associationCampaignSet: '',
          euDeclarationConfirmedAtUtc: '',
          euDeclarationCampaignSet: '',
          deliverySettingsConfirmedAtUtc: '',
          deliverySettingsCampaignSet: '',
          completedAtUtc: '',
          createdAtUtc: now,
          updatedAtUtc: now,
        };
        try {
          saveGoogleAdsCampaignCsvWorkflow(workflow);
          campaignCsvWorkflowStore = loadGoogleAdsCampaignCsvWorkflows();
        } catch (error) {
          campaignCsvWorkflowStorageError = error?.message || 'Não foi possível iniciar o fluxo CSV.';
          setCampaignCsvStatus(campaignCsvWorkflowStorageError, true);
          return;
        }
      }
    }
    activeCampaignCsvWorkflowId = workflow.id;
    updateCampaignCsvWorkflowLauncher();
    renderCampaignCsvWorkflowDialog();
    if (typeof campaignCsvWorkflowDialog.showModal === 'function') campaignCsvWorkflowDialog.showModal();
    else campaignCsvWorkflowDialog.setAttribute('open', '');
  }

  function createCampaignCsvWorkflowPhase({ number, title, description, complete = false, locked = false }) {
    const section = document.createElement('section');
    section.className = 'google-ads-campaign-csv-workflow-step' + (complete ? ' is-complete' : '') + (locked ? ' is-locked' : '');
    const heading = document.createElement('div');
    heading.className = 'google-ads-campaign-csv-workflow-step-heading';
    const badge = document.createElement('span');
    badge.className = 'google-ads-campaign-csv-workflow-step-number';
    badge.textContent = complete ? '✓' : String(number);
    const titleNode = document.createElement('h3');
    titleNode.textContent = title;
    const state = document.createElement('strong');
    state.className = 'google-ads-campaign-csv-workflow-state';
    state.textContent = complete ? 'Concluída' : locked ? 'Aguardando etapa anterior' : 'Pendente';
    heading.append(badge, titleNode, state);
    const text = document.createElement('p');
    text.textContent = description;
    section.append(heading, text);
    return section;
  }

  function renderCampaignCsvWorkflowDialog() {
    const workflow = currentCampaignCsvWorkflow();
    campaignCsvWorkflowBody.replaceChildren();
    if (!workflow) {
      const empty = document.createElement('p');
      empty.textContent = campaignCsvWorkflowStorageError || 'Inicie o fluxo a partir de uma preparação válida para salvar as etapas neste navegador.';
      campaignCsvWorkflowBody.append(empty);
      return;
    }
    const intro = document.createElement('p');
    intro.className = 'google-ads-campaign-csv-workflow-intro';
    intro.textContent = (workflow.product ? workflow.product + ' · ' : '') + workflow.plannedCampaigns.length
      + ' campanha(s) pausada(s) planejada(s) em ' + workflow.managers.length + ' MCC(s). Cada upload de MCC é separado. Confirmações ficam salvas neste navegador e não criam, ativam ou alteram campanhas por si só.';
    campaignCsvWorkflowBody.append(intro);

    const allMccsUploaded = workflow.managers.length > 0 && workflow.managers.every(item => workflow.uploadedManagerIds.includes(item.managerCustomerId));
    const livePlanMatches = workflow.batchId || csvWorkflowCurrentPlanMatches(workflow);
    const uploadPhase = createCampaignCsvWorkflowPhase({ number: 1, title: 'Baixar e importar as campanhas pausadas',
      description: 'Para cada MCC, baixe o arquivo e faça o upload no Google Ads online em Ações em massa → Uploads → Campanhas → Várias contas. Depois confirme essa MCC aqui. Não aplique novamente um CSV já processado.',
      complete: allMccsUploaded });
    if (!livePlanMatches && !workflow.batchId) {
      const changed = document.createElement('p');
      changed.className = 'google-ads-campaign-csv-workflow-warning';
      changed.textContent = 'O plano atual da preparação mudou. Este fluxo mantém os nomes e contas originais; inicie um novo fluxo para baixar um CSV atualizado.';
      uploadPhase.append(changed);
    }
    workflow.managers.forEach(manager => {
      const row = document.createElement('div');
      row.className = 'google-ads-campaign-csv-workflow-manager' + (workflow.uploadedManagerIds.includes(manager.managerCustomerId) ? ' is-complete' : '');
      const label = document.createElement('strong');
      label.textContent = manager.name + ' · ' + manager.managerCustomerId;
      const detail = document.createElement('span');
      detail.textContent = manager.campaignCount + ' campanha(s) · ' + manager.accountCount + ' conta(s)'
        + (workflow.uploadedManagerIds.includes(manager.managerCustomerId) ? ' · upload confirmado' : workflow.downloadedManagerIds.includes(manager.managerCustomerId) ? ' · CSV baixado; upload ainda não confirmado' : ' · CSV ainda não baixado');
      const actions = document.createElement('div');
      actions.className = 'google-ads-campaign-csv-workflow-actions';
      const download = document.createElement('button');
      download.type = 'button';
      download.className = 'btn';
      download.textContent = workflow.downloadedManagerIds.includes(manager.managerCustomerId) ? 'Baixar CSV novamente' : 'Baixar CSV desta MCC';
      download.disabled = busy || !livePlanMatches || workflow.uploadedManagerIds.includes(manager.managerCustomerId);
      download.addEventListener('click', () => {
        if (!csvWorkflowCurrentPlanMatches(workflow)) {
          setCampaignCsvStatus('O plano atual não corresponde a este fluxo. Nenhum CSV foi gerado.', true);
          renderCampaignCsvWorkflowDialog();
          return;
        }
        campaignCsvManagerSelect.value = manager.managerCustomerId;
        if (!downloadCampaignCsvForSelectedManager()) return;
        const ids = [...new Set([...workflow.downloadedManagerIds, manager.managerCustomerId])];
        const downloadedAtUtc = new Date().toISOString();
        const plannedCampaigns = workflow.plannedCampaigns.map(campaign => campaign.managerCustomerId === manager.managerCustomerId
          && campaign.geoTargetingSnapshot
          ? { ...campaign, geoTargetingSnapshot: { ...campaign.geoTargetingSnapshot, recordedAtUtc: downloadedAtUtc } }
          : campaign);
        const saved = persistCampaignCsvWorkflow(workflow, { downloadedManagerIds: ids, plannedCampaigns });
        if (saved) renderCampaignCsvWorkflowDialog();
      });
      const uploadDone = document.createElement('button');
      uploadDone.type = 'button';
      uploadDone.className = 'btn' + (workflow.uploadedManagerIds.includes(manager.managerCustomerId) ? ' is-complete' : '');
      uploadDone.textContent = workflow.uploadedManagerIds.includes(manager.managerCustomerId) ? 'Upload concluído ✓' : 'Concluir upload desta MCC';
      uploadDone.disabled = busy || !workflow.downloadedManagerIds.includes(manager.managerCustomerId) || workflow.uploadedManagerIds.includes(manager.managerCustomerId);
      uploadDone.addEventListener('click', () => {
        if (!globalThis.confirm('Confirma que o arquivo desta MCC foi importado e aplicado no Google Ads online e que você conferiu o resultado do upload? Não confirme se o arquivo está apenas baixado ou ainda em análise.')) return;
        const ids = [...new Set([...workflow.uploadedManagerIds, manager.managerCustomerId])];
        const saved = persistCampaignCsvWorkflow(workflow, { uploadedManagerIds: ids });
        if (saved) renderCampaignCsvWorkflowDialog();
      });
      actions.append(download, uploadDone);
      row.append(label, detail, actions);
      uploadPhase.append(row);
    });
    campaignCsvWorkflowBody.append(uploadPhase);

    const linkedBatch = workflow.batchId && activeCampaignBatchId === workflow.batchId && createdCampaigns.length > 0;
    const associationMatches = linkedBatch && csvWorkflowCampaignsMatchPlan(workflow, createdCampaigns);
    const activeSet = linkedBatch ? csvWorkflowCampaignSet() : '';
    const associationDone = Boolean(associationMatches && workflow.associationConfirmedAtUtc && workflow.associationCampaignSet === activeSet);
    const associationPhase = createCampaignCsvWorkflowPhase({ number: 2, title: 'Associar as campanhas importadas ao lote do Hub',
      description: 'A associação consulta as campanhas selecionadas e salva os IDs reais no lote local. Selecione todas as campanhas previstas neste fluxo antes de concluir.',
      complete: associationDone, locked: !allMccsUploaded });
    const associationStatus = document.createElement('p');
    associationStatus.textContent = !workflow.batchId
      ? 'Ainda não há lote associado a este fluxo.'
      : !linkedBatch
        ? 'O lote associado está salvo. Abra-o no seletor de lotes para conferir e concluir esta etapa.'
        : (associationMatches ? createdCampaigns.length + ' campanha(s) carregada(s) no lote atual.' : 'O lote atual ainda não contém todas as campanhas planejadas para este fluxo.');
    associationPhase.append(associationStatus);
    const associationActions = document.createElement('div');
    associationActions.className = 'google-ads-campaign-csv-workflow-actions';
    const associate = document.createElement('button');
    associate.type = 'button';
    associate.className = 'btn';
    associate.textContent = 'Associar campanhas importadas';
    associate.disabled = !allMccsUploaded || Boolean(activeCampaignBatchId) || Boolean(workflow.batchId) || busy || campaignAssociationBusy;
    associate.addEventListener('click', () => {
      campaignCsvWorkflowDialog.close();
      campaignAssociationOpenButton.click();
    });
    const associationComplete = document.createElement('button');
    associationComplete.type = 'button';
    associationComplete.className = 'btn' + (associationDone ? ' is-complete' : '');
    associationComplete.textContent = associationDone ? 'Associação concluída ✓' : 'Concluir associação';
    associationComplete.disabled = !associationMatches || associationDone;
    associationComplete.addEventListener('click', () => {
      if (!globalThis.confirm('Confirma que este lote contém todas as campanhas previstas no fluxo?')) return;
      const saved = persistCampaignCsvWorkflow(workflow, { associationConfirmedAtUtc: new Date().toISOString(), associationCampaignSet: activeSet,
        euDeclarationConfirmedAtUtc: '', euDeclarationCampaignSet: '', deliverySettingsConfirmedAtUtc: '', deliverySettingsCampaignSet: '', completedAtUtc: '' });
      if (saved) renderCampaignCsvWorkflowDialog();
    });
    associationActions.append(associate, associationComplete);
    associationPhase.append(associationActions);
    campaignCsvWorkflowBody.append(associationPhase);

    const euDone = Boolean(associationDone && workflow.euDeclarationConfirmedAtUtc && workflow.euDeclarationCampaignSet === activeSet);
    const euPhase = createCampaignCsvWorkflowPhase({ number: 3, title: 'Conferir a declaração política enviada no CSV',
      description: 'O CSV novo inclui “EU political ads” em cada linha. Depois de importar e conferir que o Google Ads não mostrou erro nessa coluna, confirme esta etapa localmente; ela não chama a API.',
      complete: euDone, locked: !associationDone });
    const euStatus = document.createElement('p');
    euStatus.textContent = !linkedBatch ? 'Abra o lote associado para habilitar esta etapa.'
      : !associationDone ? 'Conclua primeiro a associação no passo 2.'
        : euDone ? 'Declaração do CSV conferida e confirmada neste fluxo.'
          : 'Confira o resultado do upload da versão atual do CSV antes de concluir.';
    euPhase.append(euStatus);
    const euAction = document.createElement('button');
    euAction.type = 'button';
    euAction.className = 'btn' + (euDone ? ' is-complete' : '');
    euAction.textContent = euDone ? 'Fase concluída ✓' : 'Concluir conferência da declaração';
    euAction.disabled = !linkedBatch || !associationDone || busy || euDone;
    euAction.addEventListener('click', () => {
      if (!globalThis.confirm('Confirma que baixou e aplicou o CSV atualizado e que o resultado do Google Ads não mostra erros na coluna “EU political ads”?')) return;
      const saved = persistCampaignCsvWorkflow(workflow, { euDeclarationConfirmedAtUtc: new Date().toISOString(), euDeclarationCampaignSet: activeSet,
        deliverySettingsConfirmedAtUtc: '', deliverySettingsCampaignSet: '', completedAtUtc: '' });
      if (saved) renderCampaignCsvWorkflowDialog();
    });
    euPhase.append(euAction);
    campaignCsvWorkflowBody.append(euPhase);

    const deliveryEligible = Boolean(linkedBatch && createdCampaigns.length && createdCampaigns.every(campaign => campaign.campaignChannelType === 'SEARCH'
      && campaign.status === 'PAUSED'));
    const deliveryVerified = Boolean(deliveryEligible && createdCampaigns.every(campaignDeliverySettingsVerified));
    const deliveryDone = Boolean(deliveryVerified && workflow.deliverySettingsConfirmedAtUtc && workflow.deliverySettingsCampaignSet === activeSet);
    const deliveryQuotaSummary = campaignDeliverySettingsBatchQuotaSummary?.batchId === activeCampaignBatchId
      ? campaignDeliverySettingsBatchQuotaSummary.summary : linkedBatchRecord?.deliverySettingsQuotaSummary || null;
    const deliveryPhase = createCampaignCsvWorkflowPhase({ number: 4, title: 'Aplicar presença e meta personalizada',
      description: 'O Hub verifica PRESENCE e a meta personalizada de compra em todas as campanhas Search pausadas. A API altera somente o que estiver divergente; o consumo de cota aparece no painel do lote.',
      complete: deliveryDone, locked: !euDone });
    const deliveryStatus = document.createElement('p');
    deliveryStatus.textContent = !linkedBatch ? 'Abra o lote associado para habilitar esta etapa.'
      : !euDone ? 'Conclua primeiro a conferência da declaração enviada no passo 3.'
        : !deliveryEligible ? 'Todas as campanhas do lote precisam ser Search e estar pausadas para esta ação.'
          : deliveryVerified ? 'Presença e meta personalizada estão confirmadas em todas as campanhas.'
            : 'A configuração ainda precisa ser conferida ou aplicada em todas as campanhas.';
    deliveryPhase.append(deliveryStatus);
    const deliveryAction = document.createElement('button');
    deliveryAction.type = 'button';
    deliveryAction.className = 'btn' + (deliveryDone ? ' is-complete' : '');
    deliveryAction.textContent = campaignDeliverySettingsBatchApplying ? 'Conferindo presença e meta…'
      : (deliveryDone ? 'Fase concluída ✓' : deliveryVerified ? 'Concluir fase' : 'Aplicar presença e meta personalizada')
        + (deliveryQuotaSummary ? ' (' + campaignDeliverySettingsQuotaLabel(deliveryQuotaSummary, campaignDeliverySettingsBatchApplying) + ')' : '');
    deliveryAction.disabled = !linkedBatch || !euDone || !deliveryEligible || busy;
    deliveryAction.addEventListener('click', async () => {
      if (deliveryVerified) {
        const saved = persistCampaignCsvWorkflow(workflow, { deliverySettingsConfirmedAtUtc: new Date().toISOString(), deliverySettingsCampaignSet: activeSet,
          completedAtUtc: new Date().toISOString() });
        if (saved) renderCampaignCsvWorkflowDialog();
        return;
      }
      const pendingApply = applyCampaignDeliverySettingsBatch(createdCampaigns.filter(campaign => campaign.campaignChannelType === 'SEARCH' && campaign.status === 'PAUSED'));
      renderCampaignCsvWorkflowDialog();
      await pendingApply;
      renderCampaignCsvWorkflowDialog();
    });
    deliveryPhase.append(deliveryAction);
    campaignCsvWorkflowBody.append(deliveryPhase);
    updateCampaignCsvWorkflowLauncher();
  }

  function downloadCampaignCsvForSelectedManager() {
    let entries;
    try { entries = buildCampaignBatchEntries(); }
    catch (error) {
      setCampaignCsvStatus(error?.message || 'Confira o nome, as contas, o CPA e os destinos antes de gerar o CSV.', true);
      return false;
    }
    const managerCustomerId = campaignCsvManagerSelect.value;
    const geoTargetingMode = campaignDeliverySource?.geoTargetingMode === 'WORLD' ? 'WORLD' : 'COUNTRIES';
    let result;
    try { result = buildGoogleAdsCampaignBulkUploadCsv({ entries, managerCustomerId, geoTargetingMode }); }
    catch (error) {
      setCampaignCsvStatus(error?.message || 'Não foi possível montar o CSV para esta MCC.', true);
      return false;
    }
    const date = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement('a');
    const blob = new Blob(['\uFEFF', result.csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = 'Google_Ads_Campanhas_Pausadas_MCC_' + result.managerCustomerId + '_' + date + '.csv';
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    const fxRate = campaignUsdBrlRate(campaignNameSource());
    const currencySummary = result.accountCurrencies.join('/');
    const fxSummary = result.accountCurrencies.length > 1 && fxRate
      ? ' Conversão PTAX usada: US$ 1 = R$ ' + Number(fxRate).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 6 }) + '.'
      : '';
    setCampaignCsvStatus('CSV baixado · ' + result.campaignCount + ' campanha(s) em ' + result.accountCount
      + ' conta(s) · moeda(s) por conta: ' + currencySummary + '.' + fxSummary + ' No Google Ads online, carregue-o em Ações em massa → Uploads → Campanhas → Várias contas e confira a prévia antes de aplicar. O arquivo não foi enviado pelo Hub e nenhuma chamada à API foi feita. Não aplique o mesmo arquivo mais de uma vez sem conferir o resultado no Google Ads.', false, true);
    return true;
  }

  function audienceStateForCurrentCampaign() {
    return createdCampaign ? audienceStateByCampaign.get(campaignOperationKey(createdCampaign)) || {} : {};
  }

  function audienceExclusionsStateForCampaign(campaign) {
    if (createdCampaign && campaignOperationKey(campaign) === campaignOperationKey(createdCampaign)) {
      return { audienceExclusionsResult, audienceExclusionsError };
    }
    const state = audienceStateByCampaign.get(campaignOperationKey(campaign)) || {};
    return {
      audienceExclusionsResult: state.audienceExclusionsResult || null,
      audienceExclusionsError: state.audienceExclusionsError || '',
    };
  }

  function updateAudienceExclusionsState(campaign, patch) {
    const key = campaignOperationKey(campaign);
    const state = audienceStateByCampaign.get(key) || {};
    const next = { ...state, ...patch };
    audienceStateByCampaign.set(key, next);
    if (createdCampaign && key === campaignOperationKey(createdCampaign)) {
      audienceExclusionsResult = next.audienceExclusionsResult || null;
      audienceExclusionsError = next.audienceExclusionsError || '';
    }
  }

  function pendingAudienceExclusionCampaigns() {
    return createdCampaigns.filter(campaign => campaignSupportsAudienceExclusions(campaign)
      && audienceExclusionsStateForCampaign(campaign).audienceExclusionsResult?.verified !== true);
  }

  function campaignOperationKey(campaign) {
    return String(campaign?.customerId || '') + ':' + String(campaign?.campaignId || '');
  }

  function campaignSupportsAudienceExclusions(campaign) {
    return Boolean(campaign && campaign.status === 'PAUSED'
      && campaign.campaignChannelType === 'SEARCH' && campaign.audienceGrouped === false);
  }

  function syncPreviewExistingCampaignTargets() {
    const previousByKey = new Map(createdCampaigns.map(campaign => [campaignOperationKey(campaign), campaign]));
    createdCampaigns = batchEntries.filter(entry => entry.state === 'existing'
      && ['PAUSED', 'ENABLED'].includes(entry.previewResult?.campaign_status)
      && entry.previewResult?.campaign_channel_type === 'SEARCH').map(entry => ({
      managerCustomerId: entry.payload.managerCustomerId,
      customerId: entry.payload.customerId,
      campaignId: String(entry.previewResult.campaign_id),
      adGroupId: String(entry.previewResult.ad_group_id || ''),
      campaignName: entry.payload.campaignName,
      accountName: entry.accountName || '',
      status: entry.previewResult.campaign_status,
      campaignChannelType: entry.previewResult.campaign_channel_type,
      audienceGrouped: entry.previewResult.audience_grouped === true,
      adGroupStatus: String(entry.previewResult.ad_group_status || ''),
      source: 'existing',
      activationResult: previousByKey.get(String(entry.payload.customerId) + ':' + String(entry.previewResult.campaign_id))?.activationResult || null,
      activationError: previousByKey.get(String(entry.payload.customerId) + ':' + String(entry.previewResult.campaign_id))?.activationError || '',
      deliverySettingsResult: previousByKey.get(String(entry.payload.customerId) + ':' + String(entry.previewResult.campaign_id))?.deliverySettingsResult || null,
      deliverySettingsError: previousByKey.get(String(entry.payload.customerId) + ':' + String(entry.previewResult.campaign_id))?.deliverySettingsError || '',
      euPoliticalAdvertisingResult: previousByKey.get(String(entry.payload.customerId) + ':' + String(entry.previewResult.campaign_id))?.euPoliticalAdvertisingResult || null,
      euPoliticalAdvertisingError: previousByKey.get(String(entry.payload.customerId) + ':' + String(entry.previewResult.campaign_id))?.euPoliticalAdvertisingError || '',
    }));
    createdCampaigns.forEach(campaign => {
      if (!audienceStateByCampaign.has(campaignOperationKey(campaign))) audienceStateByCampaign.set(campaignOperationKey(campaign), {});
    });
    createdCampaign = createdCampaigns[0] || null;
    const state = audienceStateForCurrentCampaign();
    audienceTargetingResult = state.audienceTargetingResult || null;
    audienceTargetingError = state.audienceTargetingError || '';
    audienceExclusionsResult = state.audienceExclusionsResult || null;
    audienceExclusionsError = state.audienceExclusionsError || '';
  }

  function saveAudienceStateForCurrentCampaign() {
    if (!createdCampaign) return;
    audienceStateByCampaign.set(campaignOperationKey(createdCampaign), {
      audienceTargetingResult, audienceTargetingError, audienceExclusionsResult, audienceExclusionsError,
    });
  }

  function audienceExportUnavailableMessage(requiredIds) {
    if (!activeCampaignBatchId && (activeDraftId || batchEntries.length || campaignDeliveryQueryId)) {
      return 'O contexto selecionado ainda está em preparação. Validar a prévia não cria nem associa campanhas; para gerar este arquivo, conclua a criação ou associe campanhas existentes. São necessários ' + requiredIds + '.';
    }
    if (activeCampaignBatchId) {
      return 'O lote aberto não tem campanhas com IDs utilizáveis para este arquivo. Reabra o lote ou associe campanhas existentes. São necessários ' + requiredIds + '.';
    }
    return 'Selecione no contexto um lote da seção “Lotes · campanhas já criadas ou associadas”. O arquivo precisa de ' + requiredIds + '.';
  }

  function campaignBatchUnavailableMessage(action) {
    if (!activeCampaignBatchId && (activeDraftId || batchEntries.length || campaignDeliveryQueryId)) {
      return 'O contexto selecionado ainda está em preparação. Validar a prévia não cria campanhas; ' + action
        + ' fica disponível depois de criar as campanhas ou associar campanhas existentes.';
    }
    return 'Abra um lote da seção “Lotes · campanhas já criadas ou associadas” para ' + action + '.';
  }

  function selectCreatedCampaign(operationKey) {
    saveAudienceStateForCurrentCampaign();
    createdCampaign = createdCampaigns.find(item => campaignOperationKey(item) === operationKey) || null;
    const state = audienceStateForCurrentCampaign();
    audienceTargetingResult = state.audienceTargetingResult || null;
    audienceTargetingError = state.audienceTargetingError || '';
    audienceExclusionsResult = state.audienceExclusionsResult || null;
    audienceExclusionsError = state.audienceExclusionsError || '';
    saveActiveCampaignBatch();
  }

  function renderConfiguredAudienceTargeting() {
    const isExporting = audienceTargetingCsvExportingManagerIds.size > 0;
    if (audienceTargetingLoadingIndicator) audienceTargetingLoadingIndicator.hidden = !isExporting;
    audienceTargetingCsvPanel.setAttribute('aria-busy', String(isExporting));
    audienceTargetingDescription.textContent = 'Use o CSV por MCC para segmentação positiva em cada grupo de anúncios. A planilha Excel de exclusões do lote fica logo abaixo para importação manual no painel do Google Ads.';
    audienceTargetingCsvPanel.replaceChildren();
    if (sharedActionsBlocked()) {
      const notice = document.createElement('p');
      notice.textContent = 'Conclua a ampliação do lote para liberar a segmentação.';
      audienceTargetingCsvPanel.append(notice);
      return;
    }
    if (!createdCampaigns.length) {
      const status = document.createElement('p');
      status.className = 'google-ads-audience-targeting-status';
      status.textContent = audienceExportUnavailableMessage('IDs reais de campanha e grupo de anúncios');
      audienceTargetingCsvPanel.append(status);
      return;
    }
    const panel = renderAudienceTargetingCsvUploadPanel();
    if (panel) audienceTargetingCsvPanel.append(panel);
  }

  function campaignStatusTarget(operation) {
    return operation === 'pause_campaign' ? 'PAUSED' : 'ENABLED';
  }

  function campaignStatusActionOperation() {
    const previousOperation = campaignStatusLog?.operation;
    if (previousOperation && campaignStatusLog.completed !== true
        && createdCampaigns.some(campaign => campaign.status !== campaignStatusTarget(previousOperation))) {
      return previousOperation;
    }
    return createdCampaigns.some(campaign => campaign.status === 'ENABLED') ? 'pause_campaign' : 'enable_campaign';
  }

  function pendingCampaignStatusActions(operation) {
    const targetStatus = campaignStatusTarget(operation);
    const retryingSameAction = campaignStatusLog?.operation === operation;
    return createdCampaigns.filter(campaign => campaign.status !== targetStatus
      && (operation === 'enable_campaign'
        || campaign.status === 'ENABLED'
        || (retryingSameAction && !campaign.status)));
  }

  function campaignStatusActionName(operation) {
    return operation === 'pause_campaign' ? 'pausa' : 'ativação';
  }

  function campaignStatusActionGerund(operation) {
    return operation === 'pause_campaign' ? 'Pausando' : 'Ativando';
  }

  function campaignStatusLogTime(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
      : 'horário não disponível';
  }

  function imageEligibleAccountsForCreatedBatch() {
    const eligibility = accountImageEligibilityStorage.read();
    const accounts = new Map();
    createdCampaigns.forEach(campaign => {
      const accountId = String(campaign.customerId || '').replace(/\D/g, '');
      const apiConfirmed = campaignImageAssetUploads.some(upload => upload.customerId === accountId && upload.status === 'uploaded');
      if ((eligibility[accountId] === 'allowed' || apiConfirmed) && !accounts.has(accountId)) {
        accounts.set(accountId, {
          accountId,
          name: campaign.accountName || ('Conta ' + accountId),
        });
      }
    });
    return [...accounts.values()];
  }

  function campaignImageAccountsForCreatedBatch() {
    const accounts = new Map();
    createdCampaigns.forEach(campaign => {
      const accountId = String(campaign.customerId || '').replace(/\D/g, '');
      if (!/^\d{10}$/.test(accountId) || accounts.has(accountId)) return;
      accounts.set(accountId, {
        accountId,
        managerCustomerId: String(campaign.managerCustomerId || '').replace(/\D/g, ''),
        name: campaign.accountName || ('Conta ' + accountId),
      });
    });
    return [...accounts.values()];
  }

  function campaignImageUploadTargetsForCreatedBatch() {
    const groups = new Map();
    createdCampaigns.forEach(campaign => {
      const managerCustomerId = String(campaign.managerCustomerId || '').replace(/\D/g, '');
      const customerId = String(campaign.customerId || '').replace(/\D/g, '');
      if (!/^\d{10}$/.test(managerCustomerId) || !/^\d{10}$/.test(customerId)
          || campaign.campaignChannelType !== 'SEARCH' || !['PAUSED', 'ENABLED'].includes(campaign.status)) return;
      const key = managerCustomerId + ':' + customerId;
      if (!groups.has(key)) groups.set(key, {
        managerCustomerId,
        customerId,
        accountName: campaign.accountName || ('Conta ' + customerId),
        campaignIds: [],
      });
      groups.get(key).campaignIds.push(String(campaign.campaignId || ''));
    });
    return [...groups.values()].map(group => ({
      ...group,
      campaignIds: [...new Set(group.campaignIds)].sort(),
    })).filter(group => group.campaignIds.length > 0 && group.campaignIds.length <= 100);
  }

  function imageUploadBatchCampaignIds(accountId) {
    return createdCampaigns.filter(campaign => String(campaign.customerId || '').replace(/\D/g, '') === accountId
        && campaign.campaignChannelType === 'SEARCH' && ['PAUSED', 'ENABLED'].includes(campaign.status))
      .map(campaign => String(campaign.campaignId || '')).sort();
  }

  function imageAssetUploadCoversBatch(upload, accountId) {
    if (!upload || upload.customerId !== accountId || upload.status !== 'uploaded'
        || upload.width !== upload.height) return false;
    const expectedIds = imageUploadBatchCampaignIds(accountId);
    const uploadedIds = [...new Set(upload.campaignIds || [])].sort();
    return expectedIds.length > 0 && expectedIds.length === uploadedIds.length
      && expectedIds.every((campaignId, index) => campaignId === uploadedIds[index]);
  }

  function campaignImageUploadFilesForBatch(batchPreviewItems = campaignImageBatchPreviewItems()) {
    if (campaignImageUploadFiles.length) return campaignImageUploadFiles;
    return batchPreviewItems.filter(image => image.localSaved && image.blob instanceof Blob
        && Number.isInteger(image.width) && Number.isInteger(image.height))
      .map(image => ({
        ...image,
        file: image.blob,
        size: Number.isInteger(image.size) ? image.size : image.blob.size,
      }));
  }

  function pendingCampaignImageUploadTasks(targets, images) {
    return targets.flatMap(account => images
      .filter(image => !campaignImageAssetUploads.some(upload => upload.customerId === account.customerId
        && upload.imageSha256 === image.imageSha256 && upload.status === 'uploaded'
        && imageAssetUploadCoversBatch(upload, account.customerId)))
      .map(image => ({ account, image })));
  }

  function campaignImageUploadSelectedAccountIdSet(targets, eligibility = accountImageEligibilityStorage.read()) {
    if (Array.isArray(campaignImageUploadSelectedAccountIds)) {
      return new Set(campaignImageUploadSelectedAccountIds);
    }
    return new Set(targets
      .filter(account => eligibility[account.customerId] !== 'not_allowed')
      .map(account => account.customerId));
  }

  function imageUploadApiConfirmedForCurrentAccounts() {
    const eligibleAccounts = imageEligibleAccountsForCreatedBatch();
    return eligibleAccounts.length > 0 && eligibleAccounts.every(account =>
      campaignImageAssetUploads.some(upload => imageAssetUploadCoversBatch(upload, account.accountId)));
  }

  function imageUploadConfirmationMatchesCurrentAccounts() {
    if (imageUploadApiConfirmedForCurrentAccounts()) return true;
    if (!imageUploadConfirmed) return false;
    const confirmedIds = [...imageUploadConfirmedAccountIds].sort();
    const currentIds = imageEligibleAccountsForCreatedBatch().map(account => account.accountId).sort();
    return confirmedIds.length === currentIds.length && confirmedIds.every((accountId, index) => accountId === currentIds[index]);
  }

  function clearCampaignImageBatchPreviews() {
    campaignImageBatchPreviewLoadSequence += 1;
    campaignImageBatchPreviews = [];
    campaignImageBatchPreviewsLoading = false;
    campaignImageBatchPreviewStorageError = '';
    campaignImageBatchPreviewRestorePromise = Promise.resolve();
  }

  function upsertCampaignImageBatchPreview(image, localSaved) {
    const blob = image?.file || image?.blob;
    if (!blob || !image?.imageSha256) return;
    const nextPreview = {
      imageSha256: image.imageSha256,
      fileName: image.fileName,
      mimeType: image.mimeType || blob.type,
      width: image.width,
      height: image.height,
      sourceImageSha256: image.sourceImageSha256 || '',
      sourceFileName: image.sourceFileName || '',
      cropSettings: image.cropSettings || null,
      savedAt: image.savedAt || '',
      blob,
      localSaved: localSaved === true,
    };
    campaignImageBatchPreviews = [
      ...campaignImageBatchPreviews.filter(item => item.imageSha256 !== nextPreview.imageSha256),
      nextPreview,
    ];
  }

  function restoreCampaignImageBatchPreviews(batch) {
    clearCampaignImageBatchPreviews();
    const batchId = String(batch?.id || '');
    const hashes = [...new Set((Array.isArray(batch?.imageAssetUploads) ? batch.imageAssetUploads : [])
      .filter(item => item?.status === 'uploaded')
      .map(item => String(item.imageSha256 || '').toLowerCase())
      .filter(hash => /^[a-f0-9]{64}$/.test(hash)))];
    if (!batchId) return Promise.resolve();
    const sequence = campaignImageBatchPreviewLoadSequence;
    campaignImageBatchPreviewsLoading = true;
    campaignImageBatchPreviewRestorePromise = Promise.all([
      loadGoogleAdsCampaignBatchImages(batchId, hashes),
      loadGoogleAdsCampaignBatchImageAdjustments(batchId),
    ]).then(([uploadedImages, adjustedImages]) => {
      if (sequence !== campaignImageBatchPreviewLoadSequence || activeCampaignBatchId !== batchId) return;
      const byHash = new Map();
      [...uploadedImages, ...adjustedImages].forEach(image => byHash.set(image.imageSha256, image));
      campaignImageBatchPreviews = [...byHash.values()].map(image => ({
        imageSha256: image.imageSha256,
        fileName: image.fileName,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        sourceImageSha256: image.sourceImageSha256 || '',
        sourceFileName: image.sourceFileName || '',
        cropSettings: image.cropSettings || null,
        savedAt: image.savedAt || '',
        blob: image.blob,
        localSaved: true,
      }));
    }).catch(error => {
      if (sequence !== campaignImageBatchPreviewLoadSequence || activeCampaignBatchId !== batchId) return;
      campaignImageBatchPreviewStorageError = error?.message || 'Não foi possível recuperar as imagens salvas neste lote.';
    }).finally(() => {
      if (sequence !== campaignImageBatchPreviewLoadSequence || activeCampaignBatchId !== batchId) return;
      campaignImageBatchPreviewsLoading = false;
      renderCampaignResult();
    });
    return campaignImageBatchPreviewRestorePromise;
  }

  async function restoreSavedCampaignImageAdjustments(sourceImages) {
    const savedImages = campaignImageBatchPreviews.filter(image => image.localSaved && image.blob instanceof Blob);
    const uploadedHashes = new Set(campaignImageAssetUploads
      .filter(image => image?.status === 'uploaded')
      .map(image => String(image.imageSha256 || '').toLowerCase()));
    const restored = [];
    for (const sourceImage of sourceImages) {
      const saved = findGoogleAdsCampaignImageAdjustment(sourceImage, savedImages, uploadedHashes);
      if (!saved) {
        restored.push(sourceImage);
        continue;
      }
      const file = new File([saved.blob], saved.fileName, { type: saved.mimeType, lastModified: Date.now() });
      const adjusted = await inspectGoogleAdsCampaignImageFile(file);
      restored.push({
        ...adjusted,
        sourceImageSha256: sourceImage.imageSha256,
        sourceFileName: sourceImage.fileName,
        sourceFile: sourceImage.file,
        cropSettings: saved.cropSettings || null,
        adjustedFromSaved: true,
      });
    }
    return restored;
  }

  function campaignImageBatchPreviewItems() {
    const items = new Map(campaignImageBatchPreviews.map(image => [image.imageSha256, { ...image, selected: false }]));
    campaignImageUploadFiles.forEach(image => {
      const saved = items.get(image.imageSha256);
      items.set(image.imageSha256, {
        ...saved,
        ...image,
        blob: image.file || image.blob,
        sourceImageSha256: image.sourceImageSha256 || saved?.sourceImageSha256 || '',
        sourceFileName: image.sourceFileName || saved?.sourceFileName || '',
        cropSettings: image.cropSettings || saved?.cropSettings || null,
        localSaved: saved?.localSaved === true,
        selected: true,
      });
    });
    return [...items.values()].filter(image => image.blob instanceof Blob);
  }

  function campaignImageUploadPreviewItems(batchPreviewItems = campaignImageBatchPreviewItems()) {
    const items = new Map(batchPreviewItems.map(image => [image.imageSha256, image]));
    campaignImageUploadNeedsAdjustment.forEach(image => {
      const blob = image.file || image.blob;
      if (!(blob instanceof Blob) || !image.imageSha256 || items.has(image.imageSha256)) return;
      items.set(image.imageSha256, {
        ...image,
        blob,
        localSaved: false,
        selected: false,
        requiresAdjustment: true,
      });
    });
    return [...items.values()].filter(image => image.blob instanceof Blob);
  }

  async function selectCampaignImageUploadFiles(files, { source = 'manual', inspectedFiles = null } = {}) {
    const selected = [...(files || [])];
    campaignImageUploadFiles = [];
    campaignImageUploadNeedsAdjustment = [];
    campaignImageUploadFilesSource = source;
    campaignImageUploadSelectionError = '';
    if (!selected.length) {
      renderCampaignResult();
      return;
    }
    if (selected.length > 20) {
      campaignImageUploadSelectionError = 'Selecione até 20 imagens por vez.';
      renderCampaignResult();
      return;
    }
    campaignImageUploadSelectionBusy = true;
    renderCampaignResult();
    try {
      const inspected = inspectedFiles ? [...inspectedFiles] : [];
      if (!inspectedFiles) {
        for (const file of selected) inspected.push(await inspectGoogleAdsCampaignImageFile(file, { allowUnsupportedDimensions: true }));
      }
      campaignImageUploadFiles = inspected.filter(image => image.dimensionsSupported !== false);
      campaignImageUploadNeedsAdjustment = inspected.filter(image => image.dimensionsSupported === false);
      const previouslyUploadedHashes = new Set(campaignImageAssetUploads
        .filter(item => item.status === 'uploaded')
        .map(item => String(item.imageSha256 || '').toLowerCase()));
      let recoveredUploadedImages = 0;
      for (const image of campaignImageUploadFiles) {
        if (!previouslyUploadedHashes.has(String(image.imageSha256 || '').toLowerCase())
          || campaignImageBatchPreviews.some(item => item.imageSha256 === image.imageSha256 && item.localSaved)) continue;
        try {
          const savedImage = await saveGoogleAdsCampaignBatchImage(activeCampaignBatchId, image);
          upsertCampaignImageBatchPreview(savedImage, true);
          campaignImageBatchPreviewStorageError = '';
          campaignImageAssetUploads = campaignImageAssetUploads.map(item => item.status === 'uploaded'
            && item.imageSha256 === image.imageSha256
            ? { ...item, message: String(item.message || '').includes('Cópia local salva neste lote.')
              ? String(item.message || '') : String(item.message || '') + ' Cópia local salva neste lote.' }
            : item);
          recoveredUploadedImages += 1;
        } catch (error) {
          upsertCampaignImageBatchPreview(image, false);
          campaignImageBatchPreviewStorageError = error?.message || 'Não foi possível salvar a cópia local da imagem neste lote.';
        }
      }
      if (recoveredUploadedImages) {
        saveActiveCampaignBatch();
        setStatus(recoveredUploadedImages + ' imagem(ns) já confirmada(s) foram salvas neste lote para manter a prévia. Nenhuma nova chamada foi feita à Google Ads API.');
      }
      if (!campaignImageUploadFiles.some(image => image.width === image.height && image.width >= 300)) {
        campaignImageUploadSelectionError = 'Inclua uma imagem quadrada de pelo menos 300 × 300 px. Imagens fora dos formatos aceitos podem ser ajustadas aqui no Hub.';
      }
    } catch (error) {
      campaignImageUploadSelectionError = error?.message || 'Não foi possível validar os arquivos selecionados.';
    } finally {
      campaignImageUploadSelectionBusy = false;
      renderCampaignResult();
    }
  }

  function renderImageCropPreview(canvas, bitmap, crop, backgroundColor = null) {
    const maxWidth = 840;
    const maxHeight = 480;
    const scale = Math.min(maxWidth / crop.outputWidth, maxHeight / crop.outputHeight, 1);
    canvas.width = Math.max(1, Math.round(crop.outputWidth * scale));
    canvas.height = Math.max(1, Math.round(crop.outputHeight * scale));
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (backgroundColor) {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  }

  async function openCampaignImageCropDialog(image) {
    const sourceFile = image?.sourceFile || image?.file;
    if (!sourceFile || campaignImageUploadApplying || campaignImageUploadSelectionBusy) return;
    let bitmap;
    try { bitmap = await createImageBitmap(sourceFile); }
    catch { campaignImageUploadSelectionError = 'Não foi possível abrir essa imagem para o recorte.'; renderCampaignResult(); return; }
    const sourceFileName = String(image.sourceFileName || sourceFile.name || image.fileName || 'imagem');
    const cropSettings = image.cropSettings && typeof image.cropSettings === 'object' ? image.cropSettings : null;
    const dialog = document.createElement('dialog');
    dialog.className = 'google-ads-image-crop-dialog';
    dialog.setAttribute('aria-labelledby', 'googleAdsImageCropTitle');
    const panel = document.createElement('section');
    panel.className = 'google-ads-image-crop-panel';
    const header = document.createElement('header');
    const heading = document.createElement('div');
    const eyebrow = document.createElement('div');
    eyebrow.className = 'google-ads-eyebrow';
    eyebrow.textContent = 'AJUSTE LOCAL';
    const title = document.createElement('h2');
    title.id = 'googleAdsImageCropTitle';
    title.textContent = 'Ajustar imagem para o Google Ads';
    const name = document.createElement('p');
    name.textContent = sourceFileName + ' · ' + bitmap.width + ' × ' + bitmap.height;
    heading.append(eyebrow, title, name);
    header.append(heading);
    const content = document.createElement('div');
    content.className = 'google-ads-image-crop-content';
    const formatLabel = document.createElement('label');
    formatLabel.textContent = 'Formato';
    const format = document.createElement('select');
    format.className = 'input';
    [['1','Quadrado · 1:1 (mínimo 300 × 300 px)'],['1.91','Paisagem · 1,91:1 (mínimo 600 × 314 px)']].forEach(([value,label]) => {
      const option = document.createElement('option'); option.value = value; option.textContent = label; format.append(option);
    });
    const savedOutputAspectRatio = image.adjustedFromSaved && image.width > 0 && image.height > 0
      ? image.width === image.height ? 1 : 1.91 : null;
    format.value = String(cropSettings?.aspectRatio || savedOutputAspectRatio || (bitmap.width === bitmap.height ? '1' : '1.91'));
    formatLabel.append(format);
    const framingTools = document.createElement('div');
    framingTools.className = 'google-ads-image-crop-tools';
    const suggestFrame = document.createElement('button');
    suggestFrame.type = 'button';
    suggestFrame.className = 'btn';
    suggestFrame.textContent = 'Enquadrar automaticamente';
    const suggestHelp = document.createElement('span');
    suggestHelp.textContent = 'Escolhe o formato que preserva mais pixels e centraliza o recorte.';
    framingTools.append(suggestFrame, suggestHelp);
    const zoomControl = document.createElement('label');
    zoomControl.className = 'google-ads-image-crop-zoom';
    const zoomHeading = document.createElement('span');
    zoomHeading.textContent = 'Zoom manual';
    const zoomValue = document.createElement('output');
    zoomValue.textContent = '100%';
    const zoom = document.createElement('input');
    zoom.type = 'range';
    zoom.min = '50';
    zoom.max = '300';
    zoom.step = '5';
    zoom.value = String(Math.min(300, Math.max(50, Math.round(Number(cropSettings?.zoom || 1) * 100))));
    zoom.setAttribute('aria-label', 'Zoom manual da imagem');
    zoomControl.append(zoomHeading, zoomValue, zoom);
    const upscaleLabel = document.createElement('label');
    upscaleLabel.className = 'google-ads-image-crop-upscale';
    const upscale = document.createElement('input');
    upscale.type = 'checkbox';
    upscale.checked = cropSettings?.allowUpscale === true;
    upscale.setAttribute('aria-label', 'Permitir ampliação até o tamanho mínimo');
    const upscaleText = document.createElement('span');
    upscaleText.textContent = 'Permitir ampliação até o mínimo (pode reduzir a nitidez)';
    upscaleLabel.append(upscale, upscaleText);
    const canvas = document.createElement('canvas');
    canvas.className = 'google-ads-image-crop-preview';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Prévia do recorte escolhido');
    const focusFields = document.createElement('div');
    focusFields.className = 'google-ads-image-crop-focus';
    const focusXLabel = document.createElement('label'); focusXLabel.textContent = 'Enquadramento horizontal';
    const focusX = document.createElement('input'); focusX.type = 'range'; focusX.min = '0'; focusX.max = '100'; focusX.value = String(Math.round(Number(cropSettings?.focalX ?? 0.5) * 100));
    focusXLabel.append(focusX);
    const focusYLabel = document.createElement('label'); focusYLabel.textContent = 'Enquadramento vertical';
    const focusY = document.createElement('input'); focusY.type = 'range'; focusY.min = '0'; focusY.max = '100'; focusY.value = String(Math.round(Number(cropSettings?.focalY ?? 0.5) * 100));
    focusYLabel.append(focusY);
    focusFields.append(focusXLabel, focusYLabel);
    const focusHelp = document.createElement('p');
    focusHelp.className = 'google-ads-image-crop-focus-help';
    focusHelp.textContent = 'Reduza o zoom para mostrar mais da imagem ou aumente para aproximar; depois mova o enquadramento horizontal e vertical.';
    const status = document.createElement('p');
    status.className = 'google-ads-image-crop-status';
    const help = document.createElement('p');
    help.textContent = 'O ajuste cria uma cópia local salva neste lote e preserva o enquadramento para reabrir ou editar depois. O arquivo original na pasta do produto permanece intacto; nada é enviado até você clicar em Enviar imagens.';
    const actions = document.createElement('footer');
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn'; cancel.textContent = 'Cancelar';
    const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'btn primary'; apply.textContent = 'Aplicar recorte';
    actions.append(cancel, apply);
    content.append(formatLabel, framingTools, canvas, zoomControl, focusFields, focusHelp, upscaleLabel, status, help);
    panel.append(header, content, actions);
    dialog.append(panel);
    page.append(dialog);
    let chosenCrop = null;
    const updatePreview = () => {
      chosenCrop = calculateGoogleAdsCampaignImageCrop({
        sourceWidth: bitmap.width,
        sourceHeight: bitmap.height,
        aspectRatio: Number(format.value),
        focalX: Number(focusX.value) / 100,
        focalY: Number(focusY.value) / 100,
        zoom: Number(zoom.value) / 100,
        allowUpscale: upscale.checked,
      });
      zoomValue.value = Number(zoom.value) + '%';
      zoomValue.textContent = zoomValue.value;
      renderImageCropPreview(canvas, bitmap, chosenCrop, image.mimeType === 'image/jpeg' ? '#fff' : null);
      focusX.disabled = Math.abs(bitmap.width - chosenCrop.width) < 1;
      focusY.disabled = Math.abs(bitmap.height - chosenCrop.height) < 1;
      apply.disabled = !chosenCrop.dimensionsSupported;
      if (chosenCrop.dimensionsSupported && chosenCrop.zoom < 1) {
        status.textContent = 'Resultado: ' + chosenCrop.outputWidth + ' × ' + chosenCrop.outputHeight + ' px · zoom abaixo de 100% mostra mais imagem com ' + (image.mimeType === 'image/png' ? 'margens transparentes.' : 'fundo branco.');
      } else if (chosenCrop.dimensionsSupported && chosenCrop.requiresUpscale) {
        status.textContent = 'Resultado: ' + chosenCrop.outputWidth + ' × ' + chosenCrop.outputHeight + ' px · ampliação de ' + chosenCrop.upscalePercent + '%; isso pode reduzir a nitidez.';
      } else if (chosenCrop.dimensionsSupported) {
        status.textContent = 'Resultado: ' + chosenCrop.outputWidth + ' × ' + chosenCrop.outputHeight + ' px · atende ao mínimo sem ampliação.';
      } else if (chosenCrop.requiresUpscale && !upscale.checked) {
        status.textContent = 'O recorte natural ficaria em ' + chosenCrop.naturalWidth + ' × ' + chosenCrop.naturalHeight + ' px. Marque “Permitir ampliação” para gerar ' + (format.value === '1' ? '300 × 300' : '600 × 314') + ' px.';
      } else {
        status.textContent = 'Este enquadramento não atende ao tamanho mínimo. Escolha outro formato ou uma imagem maior.';
      }
      status.classList.toggle('is-warning', !chosenCrop.dimensionsSupported);
    };
    format.addEventListener('change', updatePreview);
    zoom.addEventListener('input', updatePreview);
    focusX.addEventListener('input', updatePreview);
    focusY.addEventListener('input', updatePreview);
    upscale.addEventListener('change', updatePreview);
    suggestFrame.addEventListener('click', () => {
      const candidates = [1, 1.91].map(aspectRatio => calculateGoogleAdsCampaignImageCrop({
        sourceWidth: bitmap.width,
        sourceHeight: bitmap.height,
        aspectRatio,
      }));
      const best = candidates.sort((left, right) =>
        (right.width * right.height) - (left.width * left.height))[0];
      format.value = String(best.aspectRatio);
      focusX.value = '50';
      focusY.value = '50';
      zoom.value = '100';
      updatePreview();
    });
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    updatePreview();
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    const result = await new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'apply' ? chosenCrop : null), { once: true });
      apply.addEventListener('click', async () => {
        if (!chosenCrop?.dimensionsSupported) return;
        apply.disabled = true;
        status.textContent = 'Preparando a cópia recortada…';
        const output = document.createElement('canvas');
        output.width = chosenCrop.outputWidth;
        output.height = chosenCrop.outputHeight;
        const context = output.getContext('2d');
        if (image.mimeType === 'image/jpeg') {
          context.fillStyle = '#fff';
          context.fillRect(0, 0, output.width, output.height);
        }
        context.drawImage(bitmap, chosenCrop.x, chosenCrop.y, chosenCrop.width, chosenCrop.height, 0, 0, output.width, output.height);
        output.toBlob(blob => {
          if (!blob) { status.textContent = 'O navegador não conseguiu gerar a imagem recortada.'; apply.disabled = false; return; }
          if (blob.size > 5 * 1024 * 1024) { status.textContent = 'A cópia recortada passou de 5 MB. Escolha outro formato ou uma imagem menor.'; apply.disabled = false; return; }
          const stem = sourceFileName.replace(/\.[^.]+$/, '');
          const suffix = Number(format.value) === 1 ? 'quadrada' : 'paisagem';
          const extension = image.mimeType === 'image/png' ? 'png' : 'jpg';
          const adjustedFile = new File([blob], (stem + '-ajustada-' + suffix + '.' + extension).slice(0, 180), { type: image.mimeType, lastModified: Date.now() });
          void (async () => {
            const inspected = await inspectGoogleAdsCampaignImageFile(adjustedFile);
            const adjusted = {
              ...inspected,
              sourceImageSha256: image.sourceImageSha256 || image.imageSha256,
              sourceFileName,
              sourceFile,
              cropSettings: {
                aspectRatio: Number(format.value),
                focalX: Number(focusX.value) / 100,
                focalY: Number(focusY.value) / 100,
                zoom: Number(zoom.value) / 100,
                allowUpscale: upscale.checked,
                sourceWidth: bitmap.width,
                sourceHeight: bitmap.height,
              },
              adjustedFromSaved: true,
            };
            try {
              const saved = await saveGoogleAdsCampaignBatchImage(activeCampaignBatchId, adjusted);
              upsertCampaignImageBatchPreview(saved, true);
              campaignImageBatchPreviewStorageError = '';
            } catch (error) {
              upsertCampaignImageBatchPreview(adjusted, false);
              campaignImageBatchPreviewStorageError = error?.message || 'Não foi possível salvar o enquadramento da imagem neste lote.';
            }
            campaignImageUploadFiles = campaignImageUploadFiles.filter(item => item.imageSha256 !== image.imageSha256);
            campaignImageUploadFiles.push(adjusted);
            campaignImageUploadNeedsAdjustment = campaignImageUploadNeedsAdjustment.filter(item => item.imageSha256 !== image.imageSha256);
            campaignImageUploadFilesSource = campaignImageUploadFilesSource === 'none' ? 'presell' : campaignImageUploadFilesSource;
            campaignImageUploadSelectionError = campaignImageUploadFiles.some(item => item.width === item.height && item.width >= 300)
              ? '' : 'Ajuste ou selecione pelo menos uma imagem quadrada de 300 × 300 px para habilitar o envio.';
            campaignPreSellImageSelection = {
              ...campaignPreSellImageSelection,
              images: campaignPreSellImageSelection.images.map(item => item.imageSha256 === image.imageSha256 ? adjusted : item),
            };
            dialog.close('apply');
          })().catch(error => {
            status.textContent = error?.message || 'A cópia ajustada não passou na validação local.';
            apply.disabled = false;
          });
        }, image.mimeType, image.mimeType === 'image/jpeg' ? 0.92 : undefined);
      });
    });
    bitmap.close?.();
    dialog.remove();
    if (result) renderCampaignResult();
  }

  function createCampaignImageCropButton(image) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn' + (image.dimensionsSupported === false ? ' google-ads-campaign-image-adjust-required' : '');
    button.textContent = image.dimensionsSupported === false
      ? 'Ajustar para liberar envio'
      : image.cropSettings ? 'Editar recorte salvo' : 'Ajustar recorte';
    button.disabled = busy || campaignImageUploadApplying || campaignImageUploadSelectionBusy;
    button.addEventListener('click', () => { void openCampaignImageCropDialog(image); });
    return button;
  }

  function saveCampaignImageUploadResult(record) {
    // Keep the earlier result when a later upload covers an expanded set.
    campaignImageAssetUploads.push(record);
    if (record.status === 'uploaded' && record.width === record.height) {
      const eligibleIds = imageEligibleAccountsForCreatedBatch().map(account => account.accountId).sort();
      if (eligibleIds.length && eligibleIds.every(accountId =>
        campaignImageAssetUploads.some(upload => imageAssetUploadCoversBatch(upload, accountId)))) {
        imageUploadConfirmed = true;
        imageUploadConfirmedAccountIds = eligibleIds;
      }
    }
    return saveActiveCampaignBatch();
  }

  async function uploadCampaignImagesForBatch() {
    if (sharedActionsBlocked()) { setStatus('Conclua a ampliação e reabra o lote atualizado antes de enviar imagens.', true); return; }
    const imagesToUpload = campaignImageUploadFilesForBatch();
    if (busy || campaignImageUploadApplying || !activeCampaignBatchId || !imagesToUpload.length) return;
    if (!imagesToUpload.some(image => image.width === image.height && image.width >= 300)) {
      campaignImageUploadSelectionError = 'Inclua uma imagem quadrada de pelo menos 300 × 300 px antes de enviar.';
      renderCampaignResult();
      return;
    }
    const eligibility = accountImageEligibilityStorage.read();
    const targets = campaignImageUploadTargetsForCreatedBatch()
      .filter(account => eligibility[account.customerId] !== 'not_allowed');
    const selectedAccountIds = campaignImageUploadSelectedAccountIdSet(targets, eligibility);
    const selectedTargets = targets.filter(account => selectedAccountIds.has(account.customerId));
    if (!targets.length) {
      campaignImageUploadSelectionError = 'Nenhuma conta Search deste lote está disponível para envio; contas marcadas como “não permite imagem” foram ignoradas.';
      renderCampaignResult();
      return;
    }
    if (!selectedTargets.length) {
      campaignImageUploadSelectionError = 'Marque ao menos uma conta compatível para receber as imagens.';
      renderCampaignResult();
      return;
    }
    if (selectedTargets.some(account => account.campaignIds.length > 100)) {
      campaignImageUploadSelectionError = 'Uma conta do lote tem mais de 100 campanhas e precisa ser dividida antes do envio.';
      renderCampaignResult();
      return;
    }
    const tasks = pendingCampaignImageUploadTasks(selectedTargets, imagesToUpload);
    if (!tasks.length) {
      campaignImageUploadSelectionError = 'As imagens salvas neste lote já estão confirmadas em todas as campanhas compatíveis das contas liberadas.';
      renderCampaignResult();
      return;
    }
    const maxWrites = tasks.reduce((sum, task) => sum + task.account.campaignIds.length + 1, 0);
    const pendingAccounts = [...new Map(tasks.map(task => [task.account.customerId, task.account])).values()];
    const targetLabel = pendingAccounts.map(account => account.accountName + ' (' + account.campaignIds.length + ' campanha(s))').join('\n• ');
    const confirmed = globalThis.confirm('Enviar ' + new Set(tasks.map(task => task.image.imageSha256)).size + ' imagem(ns) para ' + pendingAccounts.length
      + ' conta(s) e associar às campanhas Search deste lote? O Hub reutiliza cada imagem dentro da própria conta e não altera o status das campanhas. Estimativa máxima: '
      + maxWrites + ' gravações da cota Google Ads, além das consultas de validação. Recursos já ativos serão ignorados; associações pausadas serão reativadas.'
      + '\n\nContas e campanhas:\n• ' + targetLabel);
    if (!confirmed) return;
    if (!saveActiveCampaignBatch()) {
      setStatus('Não foi possível salvar o lote antes do envio. Nenhuma imagem foi enviada.', true);
      return;
    }
    campaignImageUploadApplying = true;
    campaignImageUploadProgress = { processed: 0, total: tasks.length, currentAccountId: '', currentImageName: '' };
    campaignImageUploadSelectionError = '';
    busy = true;
    renderCampaignResult();
    updateControlState();
    let processed = 0;
    let saveFailed = false;
    try {
      for (const [index, task] of tasks.entries()) {
        const { account, image } = task;
        campaignImageUploadProgress = {
          processed: index,
          total: tasks.length,
          currentAccountId: account.customerId,
          currentImageName: image.fileName,
        };
        setStatus('Enviando ' + (index + 1) + ' de ' + tasks.length + ': ' + image.fileName + ' · ' + account.accountName + '…', false, true);
        renderCampaignResult();
        let record;
        try {
          const result = await uploadGoogleAdsCampaignImageAsset({
            managerCustomerId: account.managerCustomerId,
            customerId: account.customerId,
            batchCampaignIds: account.campaignIds,
            image,
          });
          let eligibilityMessage = '';
          try { accountImageEligibilityStorage.save(account.customerId, 'allowed'); }
          catch (error) { eligibilityMessage = ' O vínculo está confirmado, mas a permissão da conta não pôde ser atualizada fora deste lote.'; }
          try { accountImageEligibilityStorage.saveApiStatus(account.customerId, null); }
          catch (error) { eligibilityMessage += ' O retorno anterior de verificação não pôde ser limpo do armazenamento local.'; }
          let localImageMessage = '';
          const alreadySaved = campaignImageBatchPreviews.some(item => item.imageSha256 === image.imageSha256 && item.localSaved);
          if (alreadySaved) {
            localImageMessage = ' Cópia local salva neste lote.';
          } else {
            try {
              const savedImage = await saveGoogleAdsCampaignBatchImage(activeCampaignBatchId, image);
              upsertCampaignImageBatchPreview(savedImage, true);
              campaignImageBatchPreviewStorageError = '';
              localImageMessage = ' Cópia local salva neste lote.';
            } catch (error) {
              upsertCampaignImageBatchPreview(image, false);
              campaignImageBatchPreviewStorageError = error?.message || 'Não foi possível salvar a cópia local da imagem neste lote.';
              localImageMessage = ' O Google Ads confirmou o envio, mas o Hub não conseguiu salvar uma cópia local; a prévia ficará disponível somente nesta sessão.';
            }
          }
          record = {
            customerId: account.customerId,
            imageSha256: image.imageSha256,
            fileName: image.fileName,
            width: image.width,
            height: image.height,
            campaignIds: account.campaignIds,
            status: 'uploaded',
            message: 'Google Ads confirmou o vínculo em ' + result.campaignCount + ' campanha(s); '
              + result.linkedCount + ' novo(s), ' + result.alreadyPresentCount + ' já ativo(s), '
              + result.reactivatedCount + ' reativado(s).' + eligibilityMessage + localImageMessage,
            linkedCount: result.linkedCount,
            alreadyPresentCount: result.alreadyPresentCount,
            reactivatedCount: result.reactivatedCount,
            googleErrorCodes: [],
            updatedAt: new Date().toISOString(),
          };
        } catch (error) {
          const codes = [...new Set((error?.diagnostic?.googleErrorCodes || []).map(String))].slice(0, 6);
          const verificationRequired = codes.some(code => /\.CUSTOMER_NOT_VERIFIED$/i.test(code) || code === 'CUSTOMER_NOT_VERIFIED');
          let apiStatusMessage = '';
          if (verificationRequired) {
            const verificationCode = codes.find(code => /\.CUSTOMER_NOT_VERIFIED$/i.test(code) || code === 'CUSTOMER_NOT_VERIFIED') || 'CUSTOMER_NOT_VERIFIED';
            try { accountImageEligibilityStorage.saveApiStatus(account.customerId, 'verification_required', verificationCode); }
            catch { apiStatusMessage = ' O resultado de verificação do Google Ads não pôde ser salvo neste navegador.'; }
          }
          record = {
            customerId: account.customerId,
            imageSha256: image.imageSha256,
            fileName: image.fileName,
            width: image.width,
            height: image.height,
            campaignIds: account.campaignIds,
            status: verificationRequired ? 'verification_required' : 'failed',
            message: verificationRequired
              ? 'Google Ads informou que a conta ainda não está verificada. Isso não confirma que imagens estão proibidas.' + apiStatusMessage
              : formatRequestFailure(error, 'Não foi possível enviar a imagem.', 'audience'),
            linkedCount: 0,
            alreadyPresentCount: 0,
            reactivatedCount: 0,
            googleErrorCodes: codes,
            updatedAt: new Date().toISOString(),
          };
        }
        if (!saveCampaignImageUploadResult(record)) { saveFailed = true; break; }
        processed += 1;
        campaignImageUploadProgress = { processed, total: tasks.length, currentAccountId: '', currentImageName: '' };
        renderCampaignResult();
      }
      const uploaded = campaignImageAssetUploads.filter(item => item.status === 'uploaded'
        && tasks.some(task => task.account.customerId === item.customerId && task.image.imageSha256 === item.imageSha256)).length;
      const failed = tasks.length - uploaded;
      setStatus(saveFailed
        ? 'O envio foi interrompido depois de ' + processed + ' resultado(s), porque o Hub não conseguiu salvar o lote. Confira as contas e retome somente as imagens pendentes.'
        : 'Envio de imagens concluído: ' + uploaded + '/' + tasks.length + ' associações confirmadas · ' + failed + ' com falha ou verificação pendente.',
      saveFailed || failed > 0, false, failed > 0);
    } finally {
      campaignImageUploadApplying = false;
      campaignImageUploadProgress = null;
      busy = false;
      campaignImageUploadFiles = [];
      campaignImageUploadNeedsAdjustment = [];
      campaignImageUploadFilesSource = 'none';
      saveActiveCampaignBatch();
      renderCampaignResult();
      updateControlState();
    }
  }

  function campaignPreSellImageContext() {
    const products = [...new Set(createdCampaigns.map(campaign => {
      const parsed = parseGoogleAdsCampaignName(campaign.campaignName);
      return parsed.ok ? parsed.product : '';
    }).filter(Boolean))];
    if (products.length !== 1) return { ok: false, reason: 'product-not-unique' };
    const product = products[0];
    const savedHandoff = validateGoogleAdsPresellCampaignHandoff(activeCampaignBatchFormSnapshot?.__hub_presell_campaign_handoff);
    const selected = readSelectedGoogleAdsPresellCampaignHandoff();
    const savedSourceJobIds = new Set(activeCampaignBatchDestinationUrls.map(item => String(item.sourceJobId || '')).filter(Boolean));
    const candidates = [
      savedHandoff,
      selected.ok ? selected.payload : null,
      activePresellCampaignHandoff,
    ].filter(Boolean);
    const handoff = candidates.find(candidate => matchesGoogleAdsProductPhrase(candidate.product, product)
      && (candidate === savedHandoff || savedSourceJobIds.has(String(candidate.sourceJobId || ''))));
    if (!handoff) {
      return {
        ok: true,
        key: [activeCampaignBatchId, 'local-product-assets', product].join('|'),
        product,
        source: 'local-product-assets',
      };
    }
    return {
      ok: true,
      key: [activeCampaignBatchId, handoff.sourceJobId, handoff.product].join('|'),
      product: handoff.product,
      source: 'presell-handoff',
    };
  }

  function renderCampaignPreSellImageCandidates() {
    const source = campaignPreSellImageSelection;
    const panel = document.createElement('section');
    panel.className = 'google-ads-presell-image-candidates';
    const heading = document.createElement('strong');
    heading.textContent = source.product ? 'Imagens locais do produto · ' + source.product : 'Imagens locais do produto';
    panel.append(heading);

    const status = document.createElement('p');
    status.className = 'google-ads-campaign-image-upload-status';
    if (source.phase === 'loading') status.textContent = 'Localizando as imagens em ' + source.product + '/pag01/assets na pasta salva pelo Asset Studio…';
    else if (source.phase === 'requesting-permission') status.textContent = 'Aguardando autorização de leitura da pasta de produtos…';
    else if (source.phase === 'permission-required') status.textContent = 'Autorize a leitura da pasta salva para localizar e pré-selecionar as imagens deste produto.';
    else if (source.phase === 'ready') {
      const adjustmentCount = source.images.filter(image => image.dimensionsSupported === false).length;
      const savedCropCount = source.images.filter(image => image.adjustedFromSaved).length;
      status.classList.add(adjustmentCount ? 'is-warning' : 'is-success');
      status.textContent = source.images.length + ' imagem(ns) carregada(s) da pasta local e exibida(s) na prévia.'
        + (savedCropCount ? ' ' + savedCropCount + ' recorte(s) salvo(s) no lote foi/foram restaurado(s).' : '')
        + (adjustmentCount ? ' ' + adjustmentCount + ' precisa(m) de ajuste antes do envio; use “Ajustar para liberar envio”.' : '')
        + ' O envio ao Google Ads só acontece quando você clicar no botão de envio.';
    } else if (source.phase === 'error') {
      status.classList.add('is-warning');
      status.textContent = source.message || 'Não foi possível ler as imagens salvas da Pre-Sell.';
    } else status.textContent = source.message || 'A leitura automática precisa de um lote vinculado à Pre-Sell correspondente. Você ainda pode escolher arquivos manualmente.';
    panel.append(status);

    if (source.phase === 'permission-required' && source.rootHandle) {
      const authorize = document.createElement('button');
      authorize.type = 'button';
      authorize.className = 'btn';
      authorize.textContent = 'Autorizar leitura e carregar imagens';
      authorize.disabled = busy || campaignImageUploadApplying || campaignImageUploadSelectionBusy;
      authorize.addEventListener('click', () => {
        let permissionRequest;
        try {
          permissionRequest = source.rootHandle.requestPermission?.({ mode: 'read' });
        } catch (error) {
          campaignPreSellImageSelection = { ...source, phase: 'error', message: error?.message || 'O navegador não autorizou a leitura da pasta.' };
          renderCampaignResult();
          return;
        }
        if (!permissionRequest) {
          campaignPreSellImageSelection = { ...source, phase: 'error', message: 'Este navegador não oferece autorização de leitura para a pasta salva. Use o seletor manual de imagens.' };
          renderCampaignResult();
          return;
        }
        const sequence = campaignPreSellImageLookupSequence;
        campaignPreSellImageSelection = { ...source, phase: 'requesting-permission' };
        renderCampaignResult();
        void Promise.resolve(permissionRequest).then(async permission => {
          if (sequence !== campaignPreSellImageLookupSequence) return;
          if (permission !== 'granted') {
            campaignPreSellImageSelection = { ...source, phase: 'permission-required' };
            renderCampaignResult();
            return;
          }
          await loadCampaignPreSellImages(source.rootHandle, source.product, sequence);
        }).catch(error => {
          if (sequence !== campaignPreSellImageLookupSequence) return;
          campaignPreSellImageSelection = { ...source, phase: 'error', message: error?.message || 'Não foi possível ler as imagens da Pre-Sell.' };
          renderCampaignResult();
        }, image.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92);
      });
      panel.append(authorize);
    }

    if (source.phase === 'error') {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn';
      retry.textContent = 'Tentar localizar imagens novamente';
      retry.disabled = busy || campaignImageUploadApplying || campaignImageUploadSelectionBusy;
      retry.addEventListener('click', () => {
        campaignPreSellImageSelection = { ...campaignPreSellImageSelection, key: '' };
        ensureCampaignPreSellImageCandidates();
        renderCampaignResult();
      });
      panel.append(retry);
    }

    if (source.images.length) {
      const list = document.createElement('ul');
      list.className = 'google-ads-presell-image-candidate-list';
      source.images.forEach(image => {
        const item = document.createElement('li');
        const details = document.createElement('span');
        const cropSummary = image.cropSettings
          ? ' · Enquadramento salvo: ' + (image.cropSettings.aspectRatio === 1 ? '1:1' : '1,91:1')
            + ' · zoom ' + Math.round(image.cropSettings.zoom * 100) + '%'
            + ' · H ' + Math.round(image.cropSettings.focalX * 100) + '%'
            + ' · V ' + Math.round(image.cropSettings.focalY * 100) + '%'
          : image.adjustedFromSaved ? ' · recorte salvo; enquadramento anterior não registrado' : '';
        details.textContent = image.fileName + ' · ' + image.width + ' × ' + image.height + ' · '
          + (image.size / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' KB' + cropSummary;
        const selected = document.createElement('span');
        const isSelected = campaignImageUploadFilesSource === 'presell'
          && campaignImageUploadFiles.some(candidate => candidate.imageSha256 === image.imageSha256);
        selected.className = 'google-ads-presell-image-selection-tag' + (isSelected ? ' is-selected' : '');
        selected.textContent = image.adjustedFromSaved
          ? isSelected ? 'Recorte salvo e selecionado' : 'Recorte salvo'
          : image.dimensionsSupported === false ? 'Formato precisa de ajuste'
            : isSelected ? 'Pré-selecionada' : 'Disponível';
        item.append(details, selected);
        if (image.dimensionsSupported === false || image.adjustedFromSaved) item.append(createCampaignImageCropButton(image));
        list.append(item);
      });
      panel.append(list);
      if (campaignImageUploadFilesSource !== 'presell') {
        const select = document.createElement('button');
        select.type = 'button';
        select.className = 'btn';
        select.textContent = 'Pré-selecionar imagens da Pre-Sell';
        select.disabled = busy || campaignImageUploadApplying || campaignImageUploadSelectionBusy;
        select.addEventListener('click', () => {
          void selectCampaignImageUploadFiles(source.images.map(image => image.file), {
            source: 'presell',
            inspectedFiles: source.images,
          });
        });
        panel.append(select);
      }
    }
    return panel;
  }

  async function loadCampaignPreSellImages(rootHandle, product, sequence) {
    try {
      const files = await readGoogleAdsPresellProductImages(rootHandle, product);
      const inspected = [];
      for (const file of files) inspected.push(await inspectGoogleAdsCampaignImageFile(file, { allowUnsupportedDimensions: true }));
      await campaignImageBatchPreviewRestorePromise;
      if (sequence !== campaignPreSellImageLookupSequence) return;
      const restoredImages = await restoreSavedCampaignImageAdjustments(inspected);
      if (sequence !== campaignPreSellImageLookupSequence) return;
      campaignPreSellImageSelection = { ...campaignPreSellImageSelection, phase: 'ready', images: restoredImages, rootHandle, message: '' };
      if (campaignImageUploadFilesSource === 'manual') {
        renderCampaignResult();
        return;
      }
      await selectCampaignImageUploadFiles(restoredImages.map(image => image.file), { source: 'presell', inspectedFiles: restoredImages });
      renderCampaignResult();
    } catch (error) {
      if (sequence !== campaignPreSellImageLookupSequence) return;
      const permissionRequired = error?.code === 'permission-required';
      campaignPreSellImageSelection = {
        ...campaignPreSellImageSelection,
        phase: permissionRequired ? 'permission-required' : 'error',
        rootHandle,
        message: error?.message || 'Não foi possível ler as imagens da Pre-Sell.',
      };
      renderCampaignResult();
    }
  }

  function ensureCampaignPreSellImageCandidates() {
    const context = campaignPreSellImageContext();
    if (!context.ok) {
      const message = context.reason === 'product-not-unique'
        ? 'O lote não identifica um único produto; escolha as imagens manualmente.'
        : context.reason === 'presell-not-linked'
          ? 'Não encontrei a Pre-Sell correspondente vinculada a este lote. Escolha as imagens manualmente.'
          : 'Este lote não tem uma Pre-Sell vinculada ao produto. Escolha as imagens manualmente.';
      if (campaignPreSellImageSelection.key !== 'unmatched:' + activeCampaignBatchId + ':' + message) {
        campaignPreSellImageLookupSequence += 1;
        campaignPreSellImageSelection = { key: 'unmatched:' + activeCampaignBatchId + ':' + message, phase: 'idle', product: context.product || '', images: [], rootHandle: null, message };
      }
      return;
    }
    if (campaignPreSellImageSelection.key === context.key) return;
    const sequence = ++campaignPreSellImageLookupSequence;
    campaignPreSellImageSelection = { key: context.key, phase: 'loading', product: context.product, images: [], rootHandle: null, message: '' };
    void (async () => {
      try {
        const rootHandle = await loadGoogleAdsPresellProductRootHandle();
        if (sequence !== campaignPreSellImageLookupSequence) return;
        if (!rootHandle) {
          campaignPreSellImageSelection = { ...campaignPreSellImageSelection, phase: 'error', message: 'Nenhuma pasta de produtos foi salva pelo Asset Studio neste navegador.' };
          renderCampaignResult();
          return;
        }
        const permission = typeof rootHandle.queryPermission === 'function'
          ? await rootHandle.queryPermission({ mode: 'read' })
          : 'granted';
        if (sequence !== campaignPreSellImageLookupSequence) return;
        if (permission !== 'granted') {
          campaignPreSellImageSelection = { ...campaignPreSellImageSelection, phase: 'permission-required', rootHandle };
          renderCampaignResult();
          return;
        }
        await loadCampaignPreSellImages(rootHandle, context.product, sequence);
      } catch (error) {
        if (sequence !== campaignPreSellImageLookupSequence) return;
        campaignPreSellImageSelection = { ...campaignPreSellImageSelection, phase: 'error', message: error?.message || 'Não foi possível localizar a pasta salva pelo Asset Studio.' };
        renderCampaignResult();
      }
    })();
  }

  function renderCampaignImageUploadChecklist() {
    if ((!completed && !campaignBatchRestored) || !activeCampaignBatchId || !createdCampaigns.length) return;
    const allAccounts = campaignImageAccountsForCreatedBatch();
    const eligibleAccounts = imageEligibleAccountsForCreatedBatch();
    const eligibilityByAccount = accountImageEligibilityStorage.read();
    const apiStatusesByAccount = accountImageEligibilityStorage.readApiStatus();
    if (!allAccounts.length) return;
    const targets = campaignImageUploadTargetsForCreatedBatch();
    const apiConfirmed = imageUploadApiConfirmedForCurrentAccounts();
    ensureCampaignPreSellImageCandidates();
    const batchPreviewItems = campaignImageBatchPreviewItems();
    const displayPreviewItems = campaignImageUploadPreviewItems(batchPreviewItems);
    const uploadImages = campaignImageUploadFilesForBatch(batchPreviewItems);
    const uploadTargets = targets.filter(account => eligibilityByAccount[account.customerId] !== 'not_allowed');
    const selectedAccountIds = campaignImageUploadSelectedAccountIdSet(uploadTargets, eligibilityByAccount);
    const selectedTargets = uploadTargets.filter(account => selectedAccountIds.has(account.customerId));
    const pendingUploadTasks = pendingCampaignImageUploadTasks(selectedTargets, uploadImages);
    const selectedCampaignKeys = new Set(selectedTargets.flatMap(account =>
      account.campaignIds.map(campaignId => account.customerId + ':' + campaignId)));
    const pendingCampaignKeys = new Set(pendingUploadTasks
      .filter(task => selectedAccountIds.has(task.account.customerId))
      .flatMap(task => task.account.campaignIds.map(campaignId => task.account.customerId + ':' + campaignId)));
    const targetAccountIds = new Set(targets.map(account => account.customerId));
    const uploadableAccounts = selectedTargets.filter(account => targetAccountIds.has(account.customerId));

    const panel = document.createElement('section');
    panel.className = 'google-ads-audience-exclusions-batch google-ads-campaign-image-upload-checklist';
    const overview = document.createElement('div');
    overview.className = 'google-ads-campaign-image-upload-overview';
    const overviewCopy = document.createElement('div');
    overviewCopy.className = 'google-ads-campaign-image-upload-overview-copy';
    const title = document.createElement('h4');
    title.textContent = 'Recursos de imagem no Google Ads';
    const help = document.createElement('p');
    help.textContent = 'Marque as contas que receberão as imagens. Cada arquivo é enviado uma vez por conta e vinculado às campanhas Search do lote naquela conta; o Hub salva o retorno e a cópia local no lote. O envio não altera o status das campanhas.';
    const constraints = document.createElement('p');
    constraints.className = 'google-ads-campaign-image-upload-hint';
    constraints.textContent = 'PNG ou JPG · até 5 MB por arquivo · no máximo 20 imagens por seleção · inclua pelo menos uma quadrada (300 × 300 px); paisagem 1,91:1 a partir de 600 × 314 px também é aceita.';
    overviewCopy.append(title, help, constraints);

    const preview = document.createElement('div');
    preview.className = 'google-ads-campaign-image-upload-preview';
    preview.setAttribute('role', 'group');
    preview.setAttribute('aria-label', 'Prévia das imagens do lote e das imagens carregadas para ajuste');
    if (displayPreviewItems.length) {
      const previewGrid = document.createElement('div');
      previewGrid.className = 'google-ads-campaign-image-upload-preview-grid'
        + (displayPreviewItems.length === 1 ? ' is-single' : '');
      displayPreviewItems.forEach(image => {
        const figure = document.createElement('figure');
        figure.className = 'google-ads-campaign-image-upload-preview-item';
        figure.title = image.fileName;
        const thumbnail = document.createElement('img');
        thumbnail.alt = image.fileName;
        const previewUrl = URL.createObjectURL(image.file || image.blob);
        campaignImageUploadPreviewUrls.push(previewUrl);
        thumbnail.src = previewUrl;
        const caption = document.createElement('figcaption');
        caption.textContent = image.fileName + (image.localSaved ? ' · Salva no lote'
          : image.requiresAdjustment ? ' · Carregada · precisa de ajuste'
            : image.selected ? ' · Selecionada' : ' · Envio confirmado nesta sessão');
        figure.append(thumbnail, caption);
        previewGrid.append(figure);
      });
      preview.append(previewGrid);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'google-ads-campaign-image-upload-preview-empty';
      placeholder.textContent = campaignImageBatchPreviewsLoading
        ? 'Carregando imagens salvas neste lote…'
        : campaignImageAssetUploads.some(item => item.status === 'uploaded')
          ? 'Este envio é anterior à cópia local do lote. Selecione o mesmo arquivo original para recuperá-lo e exibi-lo; o Hub salva a cópia neste navegador sem reenviar ao Google Ads.'
          : 'As imagens selecionadas aparecerão aqui';
      preview.append(placeholder);
    }
    overview.append(overviewCopy, preview);

    const picker = document.createElement('label');
    picker.className = 'google-ads-campaign-image-upload-picker';
    const pickerText = document.createElement('span');
    pickerText.textContent = campaignImageUploadSelectionBusy ? 'Validando imagens…' : 'Selecionar imagens';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = 'image/png,image/jpeg,.png,.jpg,.jpeg';
    fileInput.disabled = busy || campaignImageUploadApplying || campaignImageUploadSelectionBusy;
    fileInput.addEventListener('change', () => { void selectCampaignImageUploadFiles(fileInput.files); });
    picker.append(pickerText, fileInput);

    const adjustmentList = document.createElement('div');
    adjustmentList.className = 'google-ads-campaign-image-adjustment-list';
    if (campaignImageUploadNeedsAdjustment.length && campaignImageUploadFilesSource !== 'presell') {
      const adjustmentTitle = document.createElement('strong');
      adjustmentTitle.textContent = 'Imagens que precisam de recorte';
      adjustmentList.append(adjustmentTitle);
      campaignImageUploadNeedsAdjustment.forEach(image => {
        const row = document.createElement('div');
        row.className = 'google-ads-campaign-image-adjustment-row';
        const label = document.createElement('span');
        label.textContent = image.fileName + ' · ' + image.width + ' × ' + image.height;
        row.append(label, createCampaignImageCropButton(image));
        adjustmentList.append(row);
      });
      const adjustmentHelp = document.createElement('p');
      adjustmentHelp.textContent = 'A imagem original não será substituída. O recorte gera uma cópia temporária que só é enviada quando você confirmar o envio.';
      adjustmentList.append(adjustmentHelp);
    }
    const selectedSummary = document.createElement('p');
    selectedSummary.className = 'google-ads-campaign-image-upload-selection';
    const hasRequiredSquare = uploadImages.some(image => image.width === image.height && image.width >= 300);
    selectedSummary.textContent = campaignImageUploadFiles.length
      ? campaignImageUploadFiles.map(image => image.fileName + ' · ' + image.width + ' × ' + image.height).join(' | ')
      : campaignImageUploadNeedsAdjustment.length
        ? campaignImageUploadNeedsAdjustment.length + ' imagem(ns) carregada(s) para prévia; ajuste o formato antes do envio.'
      : batchPreviewItems.length
        ? batchPreviewItems.length + ' imagem(ns) exibida(s) neste lote · ' + batchPreviewItems.filter(image => image.localSaved).length
          + ' cópia(s) salva(s) localmente. Essas cópias podem ser enviadas às contas liberadas que ainda estão pendentes.'
        : 'Nenhuma imagem selecionada.';
    if (!hasRequiredSquare && uploadImages.length) {
      selectedSummary.textContent += ' · Falta uma imagem quadrada de pelo menos 300 × 300 px.';
      selectedSummary.classList.add('is-warning');
    }
    if (!hasRequiredSquare && campaignImageUploadNeedsAdjustment.length) selectedSummary.classList.add('is-warning');
    const estimatedWrites = pendingUploadTasks.reduce((sum, task) => sum + task.account.campaignIds.length + 1, 0);
    const estimate = document.createElement('p');
    estimate.className = 'google-ads-campaign-image-upload-estimate';
    estimate.textContent = uploadImages.length && uploadableAccounts.length && pendingCampaignKeys.size
      ? 'Até ' + estimatedWrites + ' gravações Google Ads nesta seleção, além das consultas de validação. O total real pode ser menor se imagens ou vínculos já existirem.'
      : uploadImages.length && uploadableAccounts.length
        ? 'As imagens já estão confirmadas nas campanhas das contas liberadas.'
        : selectedTargets.length
          ? 'Selecione arquivos válidos para estimar o envio para as contas marcadas.'
          : 'Marque uma conta para escolher o destino das imagens.';
    const imageFormatNeedsAdjustment = !hasRequiredSquare && campaignImageUploadNeedsAdjustment.length > 0;
    const allSelectedImagesConfirmed = uploadImages.length > 0
      && selectedTargets.length > 0
      && selectedCampaignKeys.size > 0
      && selectedAccountIds.size === selectedTargets.length
      && pendingUploadTasks.length === 0
      && campaignImageUploadNeedsAdjustment.length === 0
      && hasRequiredSquare
      && !campaignImageUploadApplying
      && !campaignImageUploadSelectionBusy;
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'btn primary google-ads-campaign-image-upload-send'
      + (imageFormatNeedsAdjustment ? ' is-required' : '')
      + (allSelectedImagesConfirmed ? ' is-confirmed' : '');
    send.textContent = campaignImageUploadApplying
      ? 'Enviando imagens (' + (campaignImageUploadProgress?.processed || 0) + '/' + (campaignImageUploadProgress?.total || 1) + ')…'
      : imageFormatNeedsAdjustment ? 'Envio bloqueado · ajuste obrigatório'
      : campaignImageUploadNeedsAdjustment.length && !pendingCampaignKeys.size ? 'Ajuste as imagens pendentes'
      : pendingCampaignKeys.size
        ? 'Enviar imagens para ' + pendingCampaignKeys.size + ' campanhas'
        : uploadImages.length ? 'Imagens confirmadas nas contas selecionadas'
          : 'Enviar imagens para ' + selectedCampaignKeys.size + ' campanhas';
    send.disabled = busy || campaignImageUploadApplying || campaignImageUploadSelectionBusy
      || !uploadImages.length || !hasRequiredSquare || !uploadableAccounts.length || !pendingCampaignKeys.size || !pendingUploadTasks.length;
    send.addEventListener('click', () => { void uploadCampaignImagesForBatch(); });
    const sendRequirement = imageFormatNeedsAdjustment ? document.createElement('p') : null;
    if (sendRequirement) {
      sendRequirement.className = 'google-ads-campaign-image-upload-status google-ads-campaign-image-upload-required-status is-warning';
      sendRequirement.textContent = 'Etapa obrigatória: a imagem foi carregada na prévia, mas o formato atual não é aceito. Clique em “Ajustar para liberar envio” e aplique um recorte válido; depois, o envio ao Google Ads ficará disponível.';
    }

    const accountList = document.createElement('ul');
    accountList.className = 'google-ads-image-upload-accounts';
    const accountSelectionTitle = document.createElement('strong');
    accountSelectionTitle.className = 'google-ads-image-upload-account-selection-title';
    accountSelectionTitle.textContent = 'Contas de destino deste envio';
    const targetsByAccount = new Map(targets.map(account => [account.customerId, account]));
    allAccounts.forEach(account => {
      const row = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = account.name + ' · ' + account.accountId;
      row.append(label);
      const eligibility = eligibilityByAccount[account.accountId];
      const uploadTarget = targetsByAccount.get(account.accountId);
      const accountSelect = document.createElement('label');
      accountSelect.className = 'google-ads-image-upload-account-select';
      const accountCheckbox = document.createElement('input');
      accountCheckbox.type = 'checkbox';
      accountCheckbox.checked = selectedAccountIds.has(account.accountId) && eligibility !== 'not_allowed' && Boolean(uploadTarget);
      accountCheckbox.disabled = busy || campaignImageUploadApplying || !uploadTarget || eligibility === 'not_allowed';
      accountSelect.classList.toggle('is-disabled', accountCheckbox.disabled);
      const accountSelectText = document.createElement('span');
      accountSelectText.textContent = uploadTarget
        ? 'Enviar para esta conta · ' + uploadTarget.campaignIds.length + ' campanha(s)'
        : eligibility === 'not_allowed' ? 'Envio desativado: não permite imagem'
          : 'Sem campanhas Search compatíveis neste lote';
      accountSelect.append(accountCheckbox, accountSelectText);
      accountCheckbox.addEventListener('change', () => {
        const previousSelection = campaignImageUploadSelectedAccountIds;
        const nextSelection = new Set(selectedAccountIds);
        if (accountCheckbox.checked) nextSelection.add(account.accountId);
        else nextSelection.delete(account.accountId);
        campaignImageUploadSelectedAccountIds = [...nextSelection].sort();
        if (!saveActiveCampaignBatch()) {
          campaignImageUploadSelectedAccountIds = previousSelection;
          setStatus('A seleção de contas não foi salva no lote; a alteração foi desfeita.', true);
        }
        renderCampaignResult();
        updateControlState();
      });
      row.append(accountSelect);
      const apiStatus = apiStatusesByAccount[account.accountId];
      const savedUploads = campaignImageAssetUploads.filter(upload => upload.customerId === account.accountId);
      const lastUpload = savedUploads[savedUploads.length - 1];
      const state = document.createElement('span');
      state.className = 'google-ads-image-upload-account-status';
      state.textContent = eligibility === 'not_allowed' ? 'Não permite imagem · envio ignorado'
        : eligibility === 'allowed' ? 'Permissão marcada como permite imagem'
          : apiStatus?.status === 'verification_required' ? 'Google Ads exige verificação antes do vínculo de imagem'
            : 'Permissão ainda não confirmada';
      row.append(state);
      if (lastUpload) {
        const result = document.createElement('span');
        result.className = 'google-ads-image-upload-account-result ' + (lastUpload.status === 'uploaded' ? 'is-success'
          : lastUpload.status === 'verification_required' ? 'is-warning' : 'is-error');
        result.textContent = lastUpload.fileName + ': ' + lastUpload.message;
        row.append(result);
      }
      row.append(createGoogleAdsResourcesBookmarkControl({
        accountId: account.accountId,
        accountName: account.name,
        linkText: 'Abrir recursos ↗',
        ariaLabel: 'Abrir recursos de imagem de ' + account.name + ' · ' + account.accountId,
        linkClassName: 'google-ads-image-upload-resources-link',
      }));
      accountList.append(row);
    });
    panel.append(overview, renderCampaignPreSellImageCandidates(), picker, adjustmentList, selectedSummary,
      accountSelectionTitle, accountList, estimate);
    if (sendRequirement) panel.append(sendRequirement);
    panel.append(send);
    if (campaignImageUploadSelectionError) {
      const error = document.createElement('p');
      error.className = 'google-ads-campaign-image-upload-status is-warning';
      error.textContent = campaignImageUploadSelectionError;
      panel.append(error);
    }
    if (campaignImageBatchPreviewStorageError) {
      const storageWarning = document.createElement('p');
      storageWarning.className = 'google-ads-campaign-image-upload-status is-warning';
      storageWarning.textContent = 'A imagem enviada continua confirmada pelo Google Ads, mas o armazenamento local do lote informou: '
        + campaignImageBatchPreviewStorageError + ' Se esta tela for fechada, selecione o arquivo original novamente para voltar a exibi-lo.';
      panel.append(storageWarning);
    }
    if (campaignImageUploadApplying && campaignImageUploadProgress) {
      const progress = document.createElement('p');
      progress.className = 'google-ads-campaign-image-upload-status is-warning';
      progress.textContent = campaignImageUploadProgress.currentImageName
        ? 'Enviando ' + (campaignImageUploadProgress.processed + 1) + ' de ' + campaignImageUploadProgress.total + ': '
          + campaignImageUploadProgress.currentImageName + ' · ' + (campaignImageUploadProgress.currentAccountId || '') + '…'
        : campaignImageUploadProgress.processed + ' de ' + campaignImageUploadProgress.total + ' associações concluídas.';
      panel.append(progress);
    }
    if (eligibleAccounts.length) {
      const label = document.createElement('label');
      label.className = 'google-ads-image-upload-confirmation';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = imageUploadConfirmationMatchesCurrentAccounts();
      checkbox.disabled = busy || campaignStatusBatchApplying || apiConfirmed;
      const checkboxText = document.createElement('span');
      checkboxText.textContent = 'Já confirmei manualmente o envio de imagens quadradas em todas as contas compatíveis listadas acima.';
      label.append(checkbox, checkboxText);
      checkbox.addEventListener('change', () => {
        const previousValue = imageUploadConfirmed;
        const previousAccountIds = imageUploadConfirmedAccountIds;
        imageUploadConfirmed = checkbox.checked;
        imageUploadConfirmedAccountIds = checkbox.checked
          ? eligibleAccounts.map(account => account.accountId).sort()
          : [];
        if (!saveActiveCampaignBatch()) {
          imageUploadConfirmed = previousValue;
          imageUploadConfirmedAccountIds = previousAccountIds;
        }
        renderCampaignResult();
        updateControlState();
      });
      panel.append(label);
      const status = document.createElement('p');
      const isConfirmed = imageUploadConfirmationMatchesCurrentAccounts();
      status.className = 'google-ads-campaign-image-upload-status ' + (isConfirmed ? 'is-success' : 'is-warning');
      status.textContent = apiConfirmed
        ? 'O Google Ads confirmou pelo menos uma imagem quadrada em todas as contas compatíveis deste lote. O resultado ficou salvo no lote.'
        : isConfirmed
          ? 'Conferência manual salva neste lote.'
          : 'Pendente: confirme manualmente ou envie uma imagem quadrada pelo Hub; a ativação em massa fica bloqueada enquanto as contas marcadas como compatíveis não forem confirmadas.';
      panel.append(status);
    } else {
      const status = document.createElement('p');
      status.className = 'google-ads-campaign-image-upload-status';
      status.textContent = 'Não há contas marcadas como compatíveis com imagens. Selecione os arquivos para o Hub consultar as contas ainda sem confirmação; erros genéricos não serão gravados como “não permite”.';
      panel.append(status);
    }
    resultArea.append(panel);
  }

  function renderCampaignDeliverySettingsPanel() {
    if (campaignCreationMode() !== 'csv' || !activeCampaignBatchId || !createdCampaigns.length) return;
    const panel = document.createElement('section');
    panel.className = 'google-ads-campaign-result-account google-ads-delivery-confirmations';
    const title = document.createElement('h4');
    title.textContent = 'Presença e meta personalizada';
    const help = document.createElement('p');
    help.textContent = 'A API confere cada campanha Search pausada. Se houver divergência, ajusta a segmentação positiva para PRESENCE e aplica a meta “meta personalizada da ação compra” com “Conversão compra off-line (upload)”, desativando metas padrão para lances. O Hub salva o resultado no lote e não repete a conferência ao atualizar a tela. Após cada execução, o botão conserva as operações de cota reportadas; chamadas sem telemetria aparecem como não medidas. É uma estimativa de operações, não a medição global exata da cota do projeto.';
    const eligible = createdCampaigns.filter(campaign => campaign.campaignChannelType === 'SEARCH');
    const csvWorkflowOrderPending = currentCampaignCsvWorkflow()?.batchId === activeCampaignBatchId && !campaignCsvWorkflowEuDeclarationConfirmed();
    const pending = eligible.filter(campaign => !campaignDeliverySettingsVerified(campaign));
    const processablePending = pending.filter(campaign => campaign.status === 'PAUSED');
    const savedQuotaSummary = campaignDeliverySettingsBatchQuotaSummary?.batchId === activeCampaignBatchId
      ? campaignDeliverySettingsBatchQuotaSummary.summary
      : campaignBatchStore.batches.find(batch => batch.id === activeCampaignBatchId)?.deliverySettingsQuotaSummary || null;
    const summary = document.createElement('p');
    summary.className = 'google-ads-campaign-image-upload-status ' + (pending.length ? 'is-warning' : 'is-success');
    summary.textContent = eligible.length
      ? (eligible.length - pending.length) + '/' + eligible.length + ' campanhas Search com presença e meta confirmadas' + (pending.length ? ' · ' + pending.length + ' pendente(s).' : '.')
      : 'Este lote não contém campanhas Search para essa configuração.';
    panel.append(title, help, summary);

    const batchButton = document.createElement('button');
    batchButton.type = 'button';
    batchButton.className = 'btn primary google-ads-audience-batch-apply';
    batchButton.disabled = busy || campaignDeliverySettingsBatchApplying || Boolean(campaignDeliverySettingsBusyKey) || processablePending.length === 0 || csvWorkflowOrderPending;
    const buttonLabel = campaignDeliverySettingsBatchApplying
      ? 'Conferindo lote (' + (campaignDeliverySettingsBatchProgress?.processed || 0) + '/' + (campaignDeliverySettingsBatchProgress?.total || 1) + ')…'
      : csvWorkflowOrderPending
        ? 'Conclua a declaração UE no fluxo CSV primeiro'
      : processablePending.length
        ? 'Conferir e corrigir ' + processablePending.length + ' pendente(s) do lote'
        : pending.length
          ? 'Pause as campanhas pendentes para liberar a correção em lote'
          : 'Presença e meta confirmadas em todas as campanhas Search';
    batchButton.textContent = buttonLabel + (savedQuotaSummary ? ' (' + campaignDeliverySettingsQuotaLabel(savedQuotaSummary, campaignDeliverySettingsBatchApplying) + ')' : '');
    batchButton.title = 'O valor entre parênteses resume as operações de cota informadas pelos cabeçalhos do serviço privado na última execução. Chamadas sem telemetria aparecem como não medidas; esse número não representa unidades globais exatas do projeto.';
    batchButton.addEventListener('click', () => { void applyCampaignDeliverySettingsBatch(processablePending); });
    panel.append(batchButton);

    const activePending = pending.length - processablePending.length;
    if (activePending) {
      const reminder = document.createElement('p');
      reminder.className = 'google-ads-campaign-image-upload-status is-warning';
      reminder.textContent = activePending + ' campanha(s) Search ainda não pausada(s) ficam fora desta ação. Pause-as para poder conferir ou corrigir a configuração.';
      panel.append(reminder);
    }
    if (campaignDeliverySettingsBatchApplying && campaignDeliverySettingsBatchProgress) {
      const progress = document.createElement('p');
      const current = createdCampaigns.find(campaign => campaignOperationKey(campaign) === campaignDeliverySettingsBatchProgress.currentCampaignKey);
      progress.className = 'google-ads-audience-batch-progress';
      progress.textContent = current
        ? 'Conferindo ' + (campaignDeliverySettingsBatchProgress.processed + 1) + ' de ' + campaignDeliverySettingsBatchProgress.total
          + ': ' + current.campaignName + ' · ' + (current.accountName || current.customerId) + '.'
        : campaignDeliverySettingsBatchProgress.processed + ' de ' + campaignDeliverySettingsBatchProgress.total + ' concluídas; preparando a próxima consulta.';
      panel.append(progress);
    }

    const list = document.createElement('ul');
    list.className = 'google-ads-audience-batch-list';
    createdCampaigns.forEach(campaign => {
      const row = document.createElement('li');
      const label = document.createElement('strong');
      label.textContent = campaign.campaignName + ' · ' + (campaign.accountName || campaign.customerId);
      const detail = document.createElement('span');
      const result = campaign.deliverySettingsResult;
      if (campaignDeliverySettingsVerified(campaign)) {
        const verifiedAt = result?.verifiedAtUtc || campaign.verifiedAtUtc || '';
        detail.textContent = (campaign.source === 'created' && !result
          ? 'PRESENCE e meta personalizada já confirmadas na criação pelo Hub; nenhuma consulta nova.'
          : 'PRESENCE e meta personalizada confirmadas' + (verifiedAt ? ' em ' + localDateLabel(verifiedAt) : '') + '.');
        detail.className = 'is-success';
      } else if (campaign.campaignChannelType !== 'SEARCH') {
        detail.textContent = 'Tipo de campanha ' + (campaign.campaignChannelType || 'não identificado') + ' · configuração disponível somente para Search.';
      } else if (campaign.status !== 'PAUSED') {
        detail.textContent = (campaign.deliverySettingsError ? campaign.deliverySettingsError + ' ' : '')
          + 'Pausar esta campanha pelo lote antes de conferir ou ajustar a configuração.';
        detail.className = campaign.deliverySettingsError ? 'is-error' : 'is-warning';
      } else {
        detail.textContent = campaign.deliverySettingsError || (result
          ? 'Resultado parcial salvo · presença ' + (result.presenceVerified ? 'confirmada' : 'pendente')
            + ' · meta ' + (result.goalVerified ? 'confirmada' : 'pendente') + '. Uma nova tentativa consulta o estado atual e pula ajustes já concluídos.'
          : 'Ainda não conferida neste lote. A correção só ocorre após confirmar a ação abaixo.');
        detail.className = campaign.deliverySettingsError ? 'is-error' : 'is-warning';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn';
        const key = campaignOperationKey(campaign);
        button.disabled = busy || Boolean(campaignDeliverySettingsBusyKey) || csvWorkflowOrderPending;
        button.textContent = campaignDeliverySettingsBusyKey === key ? 'Conferindo…' : result ? 'Tentar novamente' : 'Conferir e corrigir';
        button.addEventListener('click', async () => {
          if (busy || campaignDeliverySettingsBusyKey) return;
          if (!campaignCsvWorkflowEuDeclarationConfirmed()) {
            setStatus('Conclua a declaração UE no fluxo CSV antes de aplicar presença e meta personalizada.', true);
            return;
          }
          const confirmed = globalThis.confirm('Conferir a campanha ' + campaign.campaignName + ' (ID ' + campaign.campaignId + ')? Se houver divergência, o Hub corrigirá PRESENCE e a meta personalizada de compra. As metas padrão de conversão deixarão de ser usadas para lances. Esta ação exige que a campanha continue pausada; ela não ativa nem cria campanhas.');
          if (!confirmed) return;
          saveAudienceStateForCurrentCampaign();
          campaignDeliverySettingsBusyKey = key;
          busy = true;
          renderCampaignResult();
          updateControlState();
          try {
            const verified = await applyExistingCampaignDeliverySettings(campaign);
            campaign.deliverySettingsResult = verified;
            campaign.deliverySettingsError = verified.errorMessage || '';
            if (verified.verified) setStatus('Presença e meta personalizada confirmadas para ' + campaign.campaignName + '. Nenhuma campanha foi ativada.', false);
            else setStatus(verified.errorMessage || 'A configuração ficou parcialmente confirmada. Confira o resultado salvo antes de repetir.', true);
          } catch (error) {
            campaign.deliverySettingsError = error?.message || 'A API não confirmou a operação. Confira antes de repetir.';
            setStatus(campaign.deliverySettingsError, true);
          } finally {
            campaignDeliverySettingsBusyKey = '';
            busy = false;
            const saved = saveActiveCampaignBatch();
            if (!saved) setStatus('O resultado da API não foi salvo no lote local. Anote esta confirmação antes de atualizar a tela.', true);
            renderCampaignResult();
            updateControlState();
          }
        });
        row.append(label, detail, button);
        list.append(row);
        return;
      }
      row.append(label, detail);
      list.append(row);
    });
    panel.append(list);
    resultArea.append(panel);
  }

  function renderCampaignEuPoliticalDeclarationPanel() {
    if (!activeCampaignBatchUsesCsvWorkflow() || !activeCampaignBatchId || !createdCampaigns.length) return;
    const panel = document.createElement('section');
    panel.className = 'google-ads-campaign-result-account google-ads-delivery-confirmations';
    const title = document.createElement('h4');
    title.textContent = 'Declaração de publicidade política da UE · lote CSV';
    const help = document.createElement('p');
    help.textContent = 'Para campanhas Search importadas pelo CSV, confere “Não contém publicidade política da UE” e corrige somente as divergentes. O status ativo/pausado não é alterado; a declaração reaparece após atualizar a tela.';
    const eligible = createdCampaigns.filter(campaign => campaign.campaignChannelType === 'SEARCH');
    const csvWorkflowOrderPending = currentCampaignCsvWorkflow()?.batchId === activeCampaignBatchId && !campaignCsvWorkflowAssociationConfirmed();
    const pending = eligible.filter(campaign => campaign.euPoliticalAdvertisingResult?.verified !== true);
    const confirmedCount = eligible.length - pending.length;
    const savedQuotaSummary = campaignEuPoliticalDeclarationBatchQuotaSummary?.batchId === activeCampaignBatchId
      ? campaignEuPoliticalDeclarationBatchQuotaSummary.summary
      : campaignBatchStore.batches.find(batch => batch.id === activeCampaignBatchId)?.euPoliticalAdvertisingQuotaSummary || null;
    const summary = document.createElement('p');
    summary.className = 'google-ads-campaign-image-upload-status ' + (pending.length ? 'is-warning' : 'is-success');
    summary.textContent = eligible.length
      ? confirmedCount + '/' + eligible.length + ' campanhas Search com “Não contém publicidade política da UE” confirmada'
        + (pending.length ? ' · ' + pending.length + ' pendente(s).' : '.')
      : 'Este lote não contém campanhas Search para essa declaração.';
    panel.append(title, help, summary);

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn primary google-ads-audience-batch-apply google-ads-campaign-eu-political-declaration-apply'
      + (eligible.length > 0 && pending.length === 0 ? ' is-confirmed' : '');
    apply.disabled = busy || campaignEuPoliticalDeclarationBatchApplying || pending.length === 0 || csvWorkflowOrderPending;
    const buttonLabel = campaignEuPoliticalDeclarationBatchApplying
      ? 'Aplicando declaração UE (' + (campaignEuPoliticalDeclarationBatchProgress?.processed || 0)
        + '/' + (campaignEuPoliticalDeclarationBatchProgress?.total || 1) + ' contas)…'
      : csvWorkflowOrderPending
        ? 'Conclua a associação no fluxo CSV primeiro'
      : pending.length
        ? 'Aplicar “Não contém publicidade política da UE” a ' + pending.length + ' campanha(s)'
        : 'Declaração “Não contém publicidade política da UE” confirmada no lote';
    apply.textContent = buttonLabel + (savedQuotaSummary
      ? ' (' + campaignDeliverySettingsQuotaLabel(savedQuotaSummary, campaignEuPoliticalDeclarationBatchApplying) + ')' : '');
    apply.title = 'A ação lê o estado atual, grava somente quando necessário e mostra as operações de cota reportadas pelo serviço privado. O total não representa uma leitura global exata do projeto.';
    apply.addEventListener('click', () => { void applyCampaignEuPoliticalDeclarationBatch(pending); });
    panel.append(apply);

    if (campaignEuPoliticalDeclarationBatchApplying && campaignEuPoliticalDeclarationBatchProgress) {
      const progress = document.createElement('p');
      progress.className = 'google-ads-audience-batch-progress';
      progress.textContent = campaignEuPoliticalDeclarationBatchProgress.currentAccountName
        ? 'Conferindo ' + campaignEuPoliticalDeclarationBatchProgress.processed + ' de ' + campaignEuPoliticalDeclarationBatchProgress.total
          + ' contas: ' + campaignEuPoliticalDeclarationBatchProgress.currentAccountName + ' · '
          + campaignEuPoliticalDeclarationBatchProgress.currentCampaignCount + ' campanha(s)…'
        : campaignEuPoliticalDeclarationBatchProgress.processed + ' de ' + campaignEuPoliticalDeclarationBatchProgress.total
          + ' contas concluídas; preparando a próxima conferência.';
      panel.append(progress);
    }

    const list = document.createElement('ul');
    list.className = 'google-ads-audience-batch-list';
    createdCampaigns.forEach(campaign => {
      const row = document.createElement('li');
      const label = document.createElement('strong');
      label.textContent = campaign.campaignName + ' · ' + (campaign.accountName || campaign.customerId);
      const detail = document.createElement('span');
      const result = campaign.euPoliticalAdvertisingResult;
      if (campaign.campaignChannelType !== 'SEARCH') {
        detail.textContent = 'Tipo ' + (campaign.campaignChannelType || 'não identificado') + ' · disponível somente para Search.';
        detail.className = 'is-warning';
      } else if (result?.verified === true) {
        detail.textContent = (result.changed ? 'Aplicada e confirmada' : 'Já estava correta')
          + (result.verifiedAtUtc ? ' em ' + localDateLabel(result.verifiedAtUtc) : '')
          + ' · não contém publicidade política da UE.';
        detail.className = 'is-success';
      } else {
        detail.textContent = campaign.euPoliticalAdvertisingError || (result
          ? 'Declaração ainda não confirmada. A próxima tentativa consulta o estado atual antes de gravar.'
          : 'Ainda não conferida neste lote. A alteração só ocorre após confirmar a ação.');
        detail.className = campaign.euPoliticalAdvertisingError ? 'is-error' : 'is-warning';
      }
      row.append(label, detail);
      list.append(row);
    });
    panel.append(list);
    resultArea.append(panel);
  }

  function addCampaignEuPoliticalDeclarationQuotaEvent(current, event) {
    const serverCounts = event?.serverCounts && Number(event.serverCounts.version) === 2 ? event.serverCounts : null;
    const next = {
      ...current,
      attemptCount: (Number(current?.attemptCount) || 0) + 1,
      measuredRequestCount: (Number(current?.measuredRequestCount) || 0) + (serverCounts ? 1 : 0),
      unmeasuredRequestCount: (Number(current?.unmeasuredRequestCount) || 0) + (serverCounts ? 0 : 1),
      quotaOperationsEstimated: (Number(current?.quotaOperationsEstimated) || 0) + (serverCounts ? Number(serverCounts.quotaOperationsEstimated) || 0 : 0),
      quotaOperationsUnknown: (Number(current?.quotaOperationsUnknown) || 0) + (serverCounts ? Number(serverCounts.quotaOperationsUnknown) || 0 : 0),
      status: 'running',
      updatedAtUtc: new Date().toISOString(),
    };
    campaignEuPoliticalDeclarationBatchQuotaSummary = { batchId: activeCampaignBatchId, summary: next };
  }

  async function applyCampaignEuPoliticalDeclarationBatch(campaigns) {
    if (busy || campaignEuPoliticalDeclarationBatchApplying || !activeCampaignBatchId) return;
    if (!campaignCsvWorkflowAssociationConfirmed()) {
      setStatus('Conclua a associação das campanhas no fluxo CSV antes de aplicar a declaração UE.', true);
      return;
    }
    const pending = (Array.isArray(campaigns) ? campaigns : [])
      .filter(campaign => campaign.campaignChannelType === 'SEARCH' && campaign.euPoliticalAdvertisingResult?.verified !== true);
    if (!pending.length) return;
    const grouped = new Map();
    pending.forEach(campaign => {
      const key = String(campaign.managerCustomerId) + ':' + String(campaign.customerId);
      if (!grouped.has(key)) grouped.set(key, { managerCustomerId: campaign.managerCustomerId,
        customerId: campaign.customerId, accountName: campaign.accountName || campaign.customerId, campaigns: [] });
      grouped.get(key).campaigns.push(campaign);
    });
    const activeCount = pending.filter(campaign => campaign.status === 'ENABLED').length;
    const names = pending.slice(0, 20).map(campaign => '• ' + campaign.campaignName + ' · ' + (campaign.accountName || campaign.customerId)
      + ' · ' + (campaign.status || 'status atual será conferido')).join('\n');
    const remaining = pending.length - Math.min(pending.length, 20);
    const confirmed = globalThis.confirm('Aplicar a declaração “Não contém publicidade política da UE” a ' + pending.length
      + ' campanha(s) Search deste lote, em ' + grouped.size + ' conta(s)? O Hub consultará cada conta e enviará somente as campanhas divergentes, em uma mutação por conta. A operação não pausa nem ativa campanhas. O resultado e as operações de cota ficam salvos no lote.\n\n'
      + names + (remaining ? '\n• e mais ' + remaining + ' campanha(s)' : '')
      + (activeCount ? '\n\n' + activeCount + ' campanha(s) estão ativas; o status será preservado.' : '')
      + '\n\nContinuar?');
    if (!confirmed) return;
    saveAudienceStateForCurrentCampaign();
    const batchId = activeCampaignBatchId;
    campaignEuPoliticalDeclarationBatchQuotaSummary = {
      batchId,
      summary: { attemptCount: 0, measuredRequestCount: 0, unmeasuredRequestCount: 0,
        quotaOperationsEstimated: 0, quotaOperationsUnknown: 0, status: 'running', updatedAtUtc: new Date().toISOString() },
    };
    if (!saveActiveCampaignBatch()) {
      setStatus('Não foi possível salvar o lote neste navegador. Nenhuma consulta à API foi iniciada.', true);
      return;
    }

    campaignEuPoliticalDeclarationBatchApplying = true;
    campaignEuPoliticalDeclarationBatchProgress = { processed: 0, total: grouped.size, currentAccountName: '', currentCampaignCount: 0 };
    busy = true;
    renderCampaignResult();
    updateControlState();
    let processed = 0;
    let stoppedForStorage = false;
    let stoppedForApi = false;
    let failedCount = 0;
    const stopCodes = new Set(['api_unavailable', 'api_not_configured', 'credentials_missing', 'not_authorized', 'origin_not_allowed',
      'google_ads_auth_failed', 'google_ads_access_denied', 'google_ads_quota_exceeded', 'google_ads_unavailable', 'private_service_unavailable']);
    try {
      for (const group of grouped.values()) {
        campaignEuPoliticalDeclarationBatchProgress = { processed, total: grouped.size,
          currentAccountName: group.accountName, currentCampaignCount: group.campaigns.length };
        setStatus('Aplicando “Não contém publicidade política da UE” · ' + group.accountName + ' · '
          + group.campaigns.length + ' campanha(s)…', false);
        renderCampaignResult();
        updateControlState();
        try {
          const response = await applyExistingCampaignEuPoliticalAdvertisingDeclarationBatch(group, {
            onQuotaTelemetry: event => addCampaignEuPoliticalDeclarationQuotaEvent(campaignEuPoliticalDeclarationBatchQuotaSummary.summary, event),
          });
          const byId = new Map(response.results.map(result => [String(result.campaignId), result]));
          group.campaigns.forEach(campaign => {
            const result = byId.get(String(campaign.campaignId));
            if (!result) throw new Error('A resposta não identificou todas as campanhas da conta. Confira no Google Ads antes de repetir.');
            campaign.euPoliticalAdvertisingResult = {
              verified: result.verified, changed: result.changed, status: result.status,
              channelType: result.channelType, declaration: result.declaration,
              targetDeclaration: result.targetDeclaration, failureCode: result.failureCode,
              verifiedAtUtc: result.verifiedAtUtc,
            };
            campaign.euPoliticalAdvertisingError = result.errorMessage || '';
            if (!result.verified) failedCount += 1;
          });
        } catch (error) {
          const failureCode = String(error?.code || 'campaign_eu_political_declaration_unverified');
          group.campaigns.forEach(campaign => {
            campaign.euPoliticalAdvertisingResult = {
              verified: false, changed: false, status: ['PAUSED', 'ENABLED'].includes(campaign.status) ? campaign.status : '',
              channelType: campaign.campaignChannelType === 'SEARCH' ? 'SEARCH' : '',
              declaration: 'UNSPECIFIED', targetDeclaration: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
              failureCode, verifiedAtUtc: '',
            };
            campaign.euPoliticalAdvertisingError = error?.message || 'A API não confirmou a declaração. Confira no Google Ads antes de repetir.';
          });
          failedCount += group.campaigns.length;
          if (stopCodes.has(failureCode) || Number(error?.httpStatus) === 429 || Number(error?.httpStatus) >= 500) stoppedForApi = true;
        }
        processed += 1;
        campaignEuPoliticalDeclarationBatchProgress = { processed, total: grouped.size, currentAccountName: '', currentCampaignCount: 0 };
        if (!saveActiveCampaignBatch()) { stoppedForStorage = true; break; }
        renderCampaignResult();
        updateControlState();
        if (stoppedForApi) break;
      }
      const confirmedCount = eligibleCampaignsForEuDeclaration().filter(campaign => campaign.euPoliticalAdvertisingResult?.verified === true).length;
      const eligibleCount = eligibleCampaignsForEuDeclaration().length;
      const remainingCount = eligibleCount - confirmedCount;
      const summary = campaignEuPoliticalDeclarationBatchQuotaSummary?.batchId === batchId
        ? campaignEuPoliticalDeclarationBatchQuotaSummary.summary : null;
      if (summary) campaignEuPoliticalDeclarationBatchQuotaSummary = { batchId, summary: {
        ...summary, status: stoppedForStorage || stoppedForApi || remainingCount > 0 ? 'stopped' : 'complete', updatedAtUtc: new Date().toISOString(),
      } };
      const message = stoppedForStorage
        ? 'Aplicação interrompida após ' + processed + ' conta(s): o Hub não conseguiu salvar o resultado. Confira o lote antes de continuar.'
        : stoppedForApi
          ? 'Aplicação interrompida por erro geral da API ou cota. ' + confirmedCount + '/' + eligibleCount + ' campanhas confirmadas; ' + remainingCount + ' pendente(s).'
          : 'Declaração da UE: ' + confirmedCount + '/' + eligibleCount + ' campanhas confirmadas · ' + remainingCount + ' pendente(s)'
            + (failedCount ? ' (' + failedCount + ' com falha ou confirmação parcial)' : '') + '.';
      setStatus(message, stoppedForStorage || stoppedForApi || remainingCount > 0);
    } finally {
      campaignEuPoliticalDeclarationBatchApplying = false;
      campaignEuPoliticalDeclarationBatchProgress = null;
      busy = false;
      saveActiveCampaignBatch();
      renderCampaignResult();
      updateControlState();
    }
  }

  function eligibleCampaignsForEuDeclaration() {
    return createdCampaigns.filter(campaign => campaign.campaignChannelType === 'SEARCH');
  }

  function campaignDeliverySettingsQuotaLabel(summary, isActiveRun = false) {
    const known = Number(summary?.quotaOperationsEstimated) || 0;
    const unknown = Number(summary?.quotaOperationsUnknown) || 0;
    const unmeasured = Number(summary?.unmeasuredRequestCount) || 0;
    if (!summary?.measuredRequestCount) {
      if (isActiveRun) return summary?.attemptCount || unmeasured
        ? 'até agora: sem medição (' + unmeasured + ' chamada(s))'
        : 'até agora: 0 ops';
      return summary?.attemptCount || unmeasured
        ? 'última: sem medição (' + unmeasured + ' chamada(s))'
        : 'última: 0 chamadas à API';
    }
    let value = known + ' ops estimadas';
    if (unknown) value += ' + ' + unknown + ' indet.';
    if (unmeasured) value += ' · ' + unmeasured + ' s/ medição';
    if (summary?.status === 'running') return (isActiveRun ? 'até agora: ' : 'incompleta: ') + value;
    return 'última: ' + value;
  }

  function addCampaignDeliverySettingsQuotaEvent(current, event) {
    const serverCounts = event?.serverCounts && Number(event.serverCounts.version) === 2 ? event.serverCounts : null;
    const next = {
      ...current,
      attemptCount: (Number(current?.attemptCount) || 0) + 1,
      measuredRequestCount: (Number(current?.measuredRequestCount) || 0) + (serverCounts ? 1 : 0),
      unmeasuredRequestCount: (Number(current?.unmeasuredRequestCount) || 0) + (serverCounts ? 0 : 1),
      quotaOperationsEstimated: (Number(current?.quotaOperationsEstimated) || 0) + (serverCounts ? Number(serverCounts.quotaOperationsEstimated) || 0 : 0),
      quotaOperationsUnknown: (Number(current?.quotaOperationsUnknown) || 0) + (serverCounts ? Number(serverCounts.quotaOperationsUnknown) || 0 : 0),
      status: 'running',
      updatedAtUtc: new Date().toISOString(),
    };
    campaignDeliverySettingsBatchQuotaSummary = { batchId: activeCampaignBatchId, summary: next };
  }

  async function applyCampaignDeliverySettingsBatch(campaigns) {
    if (busy || campaignDeliverySettingsBatchApplying || campaignDeliverySettingsBusyKey) return;
    if (!campaignCsvWorkflowEuDeclarationConfirmed()) {
      setStatus('Conclua a declaração UE no fluxo CSV antes de aplicar presença e meta personalizada.', true);
      return;
    }
    const pending = (Array.isArray(campaigns) ? campaigns : [])
      .filter(campaign => campaign.campaignChannelType === 'SEARCH' && campaign.status === 'PAUSED' && !campaignDeliverySettingsVerified(campaign));
    if (!pending.length) return;
    const accounts = new Set(pending.map(campaign => campaign.customerId));
    const names = pending.map(campaign => '• ' + campaign.campaignName + ' · ' + (campaign.accountName || campaign.customerId)).join('\n');
    const confirmed = globalThis.confirm('Conferir ' + pending.length + ' campanha(s) Search pausada(s) em ' + accounts.size + ' conta(s)?\n\n'
      + 'O Hub processará uma campanha por vez via Google Ads API. Se encontrar divergência, corrigirá PRESENCE e a meta personalizada de compra; se já estiverem corretas, não fará essas gravações. O status continuará pausado. A operação usa cota e salva o resultado de cada campanha no lote.\n\n'
      + names);
    if (!confirmed) return;
    saveAudienceStateForCurrentCampaign();
    const batchId = activeCampaignBatchId;
    campaignDeliverySettingsBatchQuotaSummary = {
      batchId,
      summary: {
        attemptCount: 0,
        measuredRequestCount: 0,
        unmeasuredRequestCount: 0,
        quotaOperationsEstimated: 0,
        quotaOperationsUnknown: 0,
        status: 'running',
        updatedAtUtc: new Date().toISOString(),
      },
    };
    if (!saveActiveCampaignBatch()) {
      setStatus('Não foi possível salvar o lote neste navegador. Nenhuma consulta à API foi iniciada.', true);
      return;
    }

    campaignDeliverySettingsBatchApplying = true;
    campaignDeliverySettingsBatchProgress = { processed: 0, total: pending.length, currentCampaignKey: '' };
    busy = true;
    renderCampaignResult();
    updateControlState();
    let processed = 0;
    let stoppedForStorage = false;
    let stoppedForApi = false;
    let failedCount = 0;
    const stopCodes = new Set([
      'api_unavailable', 'api_not_configured', 'credentials_missing', 'not_authorized', 'origin_not_allowed',
      'google_ads_auth_failed', 'google_ads_access_denied', 'google_ads_quota_exceeded', 'google_ads_unavailable',
      'private_service_unavailable',
    ]);
    try {
      for (let index = 0; index < pending.length; index += 1) {
        const campaign = pending[index];
        const key = campaignOperationKey(campaign);
        campaignDeliverySettingsBatchProgress = { processed: index, total: pending.length, currentCampaignKey: key };
        campaignDeliverySettingsBusyKey = key;
        setStatus('Conferindo presença e meta personalizada · ' + (index + 1) + ' de ' + pending.length + ' · ' + campaign.campaignName + '…', false);
        renderCampaignResult();
        updateControlState();
        try {
          const verified = await applyExistingCampaignDeliverySettings(campaign, {
            onQuotaTelemetry: event => addCampaignDeliverySettingsQuotaEvent(campaignDeliverySettingsBatchQuotaSummary.summary, event),
          });
          campaign.deliverySettingsResult = verified;
          campaign.deliverySettingsError = verified.errorMessage || '';
          if (!verified.verified) failedCount += 1;
        } catch (error) {
          campaign.deliverySettingsError = error?.message || 'A API não confirmou a operação. Confira antes de repetir.';
          failedCount += 1;
          if (stopCodes.has(String(error?.code || '')) || Number(error?.httpStatus) === 429) stoppedForApi = true;
        }
        processed = index + 1;
        campaignDeliverySettingsBusyKey = '';
        campaignDeliverySettingsBatchProgress = { processed, total: pending.length, currentCampaignKey: '' };
        if (!saveActiveCampaignBatch()) {
          stoppedForStorage = true;
          break;
        }
        renderCampaignResult();
        updateControlState();
        if (stoppedForApi) break;
      }
      const confirmedCount = pending.filter(campaignDeliverySettingsVerified).length;
      const remainingCount = pending.length - confirmedCount;
      const summary = campaignDeliverySettingsBatchQuotaSummary?.batchId === batchId
        ? campaignDeliverySettingsBatchQuotaSummary.summary
        : null;
      if (summary) {
        campaignDeliverySettingsBatchQuotaSummary = {
          batchId,
          summary: {
            ...summary,
            status: stoppedForStorage || stoppedForApi || remainingCount > 0 ? 'stopped' : 'complete',
            updatedAtUtc: new Date().toISOString(),
          },
        };
      }
      const message = stoppedForStorage
        ? 'Correção em lote interrompida após ' + processed + ' campanha(s): o Hub não conseguiu salvar o resultado. Confira o lote antes de continuar.'
        : stoppedForApi
          ? 'Correção em lote interrompida após ' + processed + ' campanha(s) por erro geral da API ou cota. ' + confirmedCount + ' confirmada(s); ' + remainingCount + ' continuam pendentes.'
          : 'Conferência em lote concluída: ' + confirmedCount + '/' + pending.length + ' campanha(s) confirmadas · ' + remainingCount + ' pendente(s)' + (failedCount ? ' (' + failedCount + ' com falha ou confirmação parcial)' : '') + '.';
      setStatus(message, stoppedForStorage || stoppedForApi || remainingCount > 0);
    } finally {
      campaignDeliverySettingsBatchApplying = false;
      campaignDeliverySettingsBatchProgress = null;
      campaignDeliverySettingsBusyKey = '';
      busy = false;
      saveActiveCampaignBatch();
      renderCampaignResult();
      updateControlState();
    }
  }

  function renderCampaignStatusBatch() {
    if ((!completed && !campaignBatchRestored) || !createdCampaigns.length) return;
    const operation = campaignStatusActionOperation();
    const pending = pendingCampaignStatusActions(operation);
    const isPausing = operation === 'pause_campaign';
    const pendingDeliverySteps = isPausing ? [] : pendingDeliveryManualStepsForActivation();
    const deliverySettingsPending = !isPausing && activeCampaignBatchUsesCsvWorkflow()
      && createdCampaigns.some(campaign => !campaignDeliverySettingsVerified(campaign));
    const imageUploadPending = !isPausing && imageEligibleAccountsForCreatedBatch().length > 0 && !imageUploadConfirmationMatchesCurrentAccounts();
    const logOperation = campaignStatusLog?.operation || 'enable_campaign';
    const logTargetStatus = campaignStatusTarget(logOperation);
    const logPending = pendingCampaignStatusActions(logOperation);
    const completedActions = createdCampaigns.filter(campaign => campaign.statusActionResult?.operation === logOperation
      && campaign.statusActionResult.verified === true && campaign.statusActionResult.status === logTargetStatus);
    const legacyCompletedActions = campaignStatusLog?.legacy && logOperation === 'enable_campaign'
      ? createdCampaigns.filter(campaign => campaign.activationResult?.verified === true && campaign.status === 'ENABLED')
      : [];
    const changed = completedActions.filter(campaign => campaign.statusActionResult.changed === true).length;
    const alreadyAtTarget = createdCampaigns.filter(campaign => campaign.status === logTargetStatus
      && campaign.statusActionResult?.operation !== logOperation
      && !legacyCompletedActions.includes(campaign)).length;
    const failed = createdCampaigns.filter(campaign => Boolean(campaign.statusActionError)
      || (campaignStatusLog?.legacy && Boolean(campaign.activationError))).length;
    const legacyActivationCount = legacyCompletedActions.length;
    const attempted = Boolean(campaignStatusLog) || legacyActivationCount > 0 || failed > 0;
    const panel = document.createElement('section');
    panel.className = 'google-ads-audience-exclusions-batch google-ads-campaign-activation-batch';
    const title = document.createElement('h4');
    title.textContent = 'Ativar ou pausar campanhas do lote';
    const help = document.createElement('p');
    help.textContent = 'O mesmo botão alterna entre ativar campanhas pausadas e pausar campanhas ativas deste lote. As solicitações são enviadas uma por vez, e o servidor confere o status antes de cada alteração.';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn primary google-ads-audience-batch-apply';
    const retrying = campaignStatusLog?.operation === operation && pending.length > 0;
    button.textContent = campaignStatusBatchApplying
      ? campaignStatusActionGerund(campaignStatusBatchProgress?.operation || operation) + ' lote (' + (campaignStatusBatchProgress?.processed || 0) + '/' + (campaignStatusBatchProgress?.total || 1) + ' concluídas)…'
      : pending.length
        ? retrying ? 'Tentar ' + (isPausing ? 'pausar ' : 'ativar ') + pending.length + ' pendentes'
          : (isPausing ? 'Pausar ' : 'Ativar ') + pending.length + ' campanhas do lote'
        : 'Todas as campanhas do lote já estão ' + (isPausing ? 'pausadas' : 'ativas');
    button.disabled = busy || campaignStatusBatchApplying || pending.length === 0 || imageUploadPending || deliverySettingsPending || pendingDeliverySteps.length > 0;
    button.addEventListener('click', () => { void applyCampaignStatusBatch(operation); });
    panel.append(title, help, button);
    if (imageUploadPending) {
      const reminder = document.createElement('p');
      reminder.className = 'google-ads-campaign-image-upload-status is-warning';
      reminder.textContent = 'Envie as imagens nas contas compatíveis e marque a confirmação acima para liberar a ativação em massa.';
      panel.append(reminder);
    }
    if (deliverySettingsPending) {
      const reminder = document.createElement('p');
      reminder.className = 'google-ads-campaign-image-upload-status is-warning';
      reminder.textContent = 'A ativação fica bloqueada até conferir PRESENCE e a meta personalizada em todas as campanhas Search pausadas deste lote.';
      panel.append(reminder);
    }
    if (pendingDeliverySteps.length) {
      const reminder = document.createElement('p');
      reminder.className = 'google-ads-campaign-image-upload-status is-warning';
      const labels = pendingDeliverySteps.map(step => DELIVERY_MANUAL_STEPS[step].toLocaleLowerCase('pt-BR'));
      reminder.textContent = 'Confirme ' + labels.join(', ') + ' nas configurações da entrega para liberar a ativação deste lote.';
      panel.append(reminder);
    }

    if (campaignStatusBatchApplying && campaignStatusBatchProgress) {
      const progress = document.createElement('p');
      const current = createdCampaigns.find(item => campaignOperationKey(item) === campaignStatusBatchProgress.currentCampaignKey);
      const progressAction = campaignStatusBatchProgress.operation || operation;
      progress.className = 'google-ads-audience-batch-progress';
      progress.textContent = current
        ? campaignStatusActionGerund(progressAction) + ' ' + (campaignStatusBatchProgress.processed + 1) + ' de ' + campaignStatusBatchProgress.total
          + ': ' + current.campaignName + ' · ' + (current.accountName || current.customerId) + '.'
        : campaignStatusBatchProgress.processed + ' de ' + campaignStatusBatchProgress.total + ' concluídas. Preparando a próxima solicitação.';
      panel.append(progress);
    }

    if (attempted) {
      const logTitle = document.createElement('h5');
      logTitle.className = 'google-ads-audience-batch-log-title';
      logTitle.textContent = (logOperation === 'pause_campaign' ? 'Pausa' : 'Ativação') + ' do lote · '
        + (campaignStatusLog?.atUtc ? campaignStatusLogTime(campaignStatusLog.atUtc) : 'horário não disponível no registro antigo');
      panel.append(logTitle);
      const total = document.createElement('p');
      total.className = 'google-ads-audience-batch-total';
      const statusCount = createdCampaigns.filter(campaign => campaign.status === logTargetStatus).length;
      const allActivationsConfirmed = logOperation === 'enable_campaign'
        && statusCount === createdCampaigns.length
        && completedActions.length + legacyCompletedActions.length === createdCampaigns.length
        && logPending.length === 0
        && failed === 0;
      total.classList.toggle('is-success', allActivationsConfirmed);
      const actionLabel = logOperation === 'pause_campaign' ? 'pausas' : 'ativações';
      const alreadyLabel = logOperation === 'pause_campaign' ? 'pausadas' : 'ativas';
      total.textContent = 'Resumo: ' + statusCount + '/' + createdCampaigns.length + ' campanhas ' + alreadyLabel + ' no Hub · '
        + (completedActions.length + legacyCompletedActions.length) + ' ' + actionLabel + ' confirmadas pelo servidor · ' + changed + ' alteradas agora · '
        + alreadyAtTarget + ' já estavam ' + alreadyLabel + ' na consulta local · ' + logPending.length
        + ' pendentes' + (failed ? ' (' + failed + ' com falha)' : '') + '.';
      panel.append(total);
      const list = document.createElement('ul');
      list.className = 'google-ads-audience-batch-list';
      createdCampaigns.forEach(campaign => {
        const row = document.createElement('li');
        const label = document.createElement('strong');
        label.textContent = campaign.campaignName + ' · ' + (campaign.accountName || campaign.customerId);
        const detail = document.createElement('span');
        const isCurrent = campaignStatusBatchApplying
          && campaignOperationKey(campaign) === campaignStatusBatchProgress?.currentCampaignKey;
        const result = campaign.statusActionResult?.operation === logOperation ? campaign.statusActionResult : null;
        const legacyResult = campaignStatusLog?.legacy && logOperation === 'enable_campaign' ? campaign.activationResult : null;
        const statusError = campaign.statusActionError || (campaignStatusLog?.legacy ? campaign.activationError : '');
        if (isCurrent) detail.textContent = campaignStatusActionGerund(campaignStatusBatchProgress?.operation || operation) + ' agora…';
        else if (statusError) {
          detail.textContent = 'Falha: ' + statusError;
          detail.className = 'is-error';
        } else if (result?.verified === true || legacyResult?.verified === true) {
          const changedAction = result?.changed ?? legacyResult.changed;
          detail.textContent = changedAction
            ? (logOperation === 'pause_campaign' ? 'Pausada' : 'Ativada') + ' e confirmada pelo servidor.'
            : 'Status confirmado pelo servidor; nenhuma alteração foi necessária.';
          detail.className = 'is-success';
        } else if (campaign.status === logTargetStatus) {
          detail.textContent = 'Já estava ' + (logTargetStatus === 'PAUSED' ? 'pausada' : 'ativa')
            + ' na última consulta local; nenhuma solicitação enviada.';
          detail.className = 'is-success';
        } else if (campaign.status === (logTargetStatus === 'PAUSED' ? 'ENABLED' : 'PAUSED')) {
          detail.textContent = (logTargetStatus === 'PAUSED' ? 'Ativa' : 'Pausada') + ' · aguardando ' + campaignStatusActionName(logOperation) + '.';
        } else detail.textContent = 'Status local desconhecido · o servidor verificará antes de alterar.';
        row.append(label, detail);
        list.append(row);
      });
      appendCampaignLogDetails(panel, list, 'status');
    }
    resultArea.append(panel);
  }

  async function applyCampaignStatusBatch(operation) {
    if (sharedActionsBlocked()) { setStatus('Conclua a ampliação e reabra o lote atualizado antes de alterar campanhas.', true); return; }
    if (busy || campaignStatusBatchApplying || !['pause_campaign', 'enable_campaign'].includes(operation)) return;
    const isPausing = operation === 'pause_campaign';
    const pendingDeliverySteps = isPausing ? [] : pendingDeliveryManualStepsForActivation();
    if (pendingDeliverySteps.length) {
      const labels = pendingDeliverySteps.map(step => DELIVERY_MANUAL_STEPS[step].toLocaleLowerCase('pt-BR'));
      setStatus('A ativação está bloqueada até confirmar ' + labels.join(', ') + ' nas configurações da entrega.', true);
      return;
    }
    if (!isPausing && activeCampaignBatchUsesCsvWorkflow()
        && createdCampaigns.some(campaign => !campaignDeliverySettingsVerified(campaign))) {
      setStatus('A ativação está bloqueada até conferir PRESENCE e a meta personalizada em todas as campanhas Search do lote.', true);
      return;
    }
    if (!isPausing && imageEligibleAccountsForCreatedBatch().length > 0 && !imageUploadConfirmationMatchesCurrentAccounts()) {
      setStatus('A ativação em massa está bloqueada até você enviar as imagens e confirmar a etapa obrigatória deste lote.', true);
      return;
    }
    const pending = pendingCampaignStatusActions(operation);
    if (!pending.length) return;
    saveAudienceStateForCurrentCampaign();
    const accounts = new Set(pending.map(campaign => campaign.customerId));
    const names = pending.map(campaign => '• ' + campaign.campaignName + ' · ' + (campaign.accountName || campaign.customerId)).join('\n');
    const actionName = isPausing ? 'Pausar' : 'Ativar';
    const confirmed = globalThis.confirm(actionName + ' ' + pending.length + ' campanha(s) do lote em ' + accounts.size + ' conta(s)?\n\n'
      + 'O Hub enviará uma solicitação por campanha em sequência e o servidor verificará o status atual antes de cada alteração. Se alguma falhar, as demais continuarão.\n\n'
      + (isPausing
        ? 'As campanhas pausadas deixam de veicular até serem ativadas novamente.'
        : 'Campanhas ativadas podem voltar a veicular e gerar custos conforme orçamento, revisão e elegibilidade do Google Ads.') + '\n\n'
      + names);
    if (!confirmed) return;

    if (!activeCampaignBatchId) {
      clearCampaignImageBatchPreviews();
      activeCampaignBatchId = createCampaignBatchId();
      activeCampaignBatchCreatedAt = new Date().toISOString();
      activeCampaignBatchPositiveKeywords = { inputText: '', preview: null, result: null, updatedAt: '' };
      campaignBatchPositiveKeywordsMessage = '';
      resetCampaignDestinationUrlBatchState();
    }
    const previousLog = campaignStatusLog;
    const previousResults = createdCampaigns.map(campaign => ({
      campaign,
      statusActionResult: campaign.statusActionResult || null,
      statusActionError: campaign.statusActionError || '',
      activationResult: campaign.activationResult || null,
      activationError: campaign.activationError || '',
    }));
    campaignStatusLog = { operation, atUtc: new Date().toISOString(), legacy: false, completed: false };
    createdCampaigns.forEach(campaign => {
      campaign.statusActionResult = null;
      campaign.statusActionError = '';
      campaign.activationResult = null;
      campaign.activationError = '';
    });
    if (!saveActiveCampaignBatch()) {
      campaignStatusLog = previousLog;
      previousResults.forEach(previous => {
        previous.campaign.statusActionResult = previous.statusActionResult;
        previous.campaign.statusActionError = previous.statusActionError;
        previous.campaign.activationResult = previous.activationResult;
        previous.campaign.activationError = previous.activationError;
      });
      setStatus('Não foi possível salvar o lote neste navegador. Nenhuma campanha foi alterada.', true);
      return;
    }

    campaignStatusBatchApplying = true;
    campaignStatusBatchProgress = { operation, processed: 0, total: pending.length, currentCampaignKey: '' };
    busy = true;
    renderCampaignResult();
    updateControlState();
    let processed = 0;
    let stoppedForStorage = false;
    try {
      for (let index = 0; index < pending.length; index += 1) {
        const campaign = pending[index];
        campaignStatusBatchProgress = { operation, processed: index, total: pending.length, currentCampaignKey: campaignOperationKey(campaign) };
        campaign.statusActionError = '';
        setStatus(campaignStatusActionGerund(operation) + ' campanha ' + (index + 1) + ' de ' + pending.length + ': ' + campaign.campaignName + ' · ' + (campaign.accountName || campaign.customerId) + '…');
        renderCampaignResult();
        try {
          const result = await changeGoogleAdsCampaignStatus({
            managerCustomerId: campaign.managerCustomerId,
            customerId: campaign.customerId,
            campaignId: campaign.campaignId,
            operation,
          });
          campaign.status = result.status;
          campaign.statusActionResult = {
            operation,
            verified: true,
            changed: result.changed,
            status: result.status,
            verifiedAtUtc: result.verifiedAtUtc,
          };
          campaign.statusActionError = '';
        } catch (error) {
          campaign.status = '';
          campaign.statusActionResult = null;
          campaign.statusActionError = error?.message || 'O servidor não confirmou a alteração de status. Confira a campanha no Google Ads antes de repetir.';
        }
        processed = index + 1;
        campaignStatusBatchProgress = { operation, processed, total: pending.length, currentCampaignKey: '' };
        if (!saveActiveCampaignBatch()) {
          stoppedForStorage = true;
          break;
        }
        renderCampaignResult();
      }
      const confirmedCount = createdCampaigns.filter(campaign => campaign.statusActionResult?.operation === operation
        && campaign.statusActionResult?.verified === true && campaign.status === campaignStatusTarget(operation)).length;
      const failedCount = createdCampaigns.filter(campaign => Boolean(campaign.statusActionError)).length;
      const pendingCount = pendingCampaignStatusActions(operation).length;
      campaignStatusLog.completed = pendingCount === 0;
      setStatus(stoppedForStorage
        ? campaignStatusActionName(operation) + ' interrompida após ' + processed + ' solicitação(ões), porque o Hub não conseguiu salvar o resultado do lote. Confira o status no Google Ads antes de continuar.'
        : campaignStatusActionName(operation).replace(/^./, letter => letter.toUpperCase()) + ' do lote concluída: ' + confirmedCount + ' confirmada(s) pelo servidor · '
          + pendingCount + ' pendente(s)' + (failedCount ? ' · ' + failedCount + ' com falha' : '') + '.',
      stoppedForStorage || failedCount > 0);
    } finally {
      campaignStatusBatchApplying = false;
      campaignStatusBatchProgress = null;
      busy = false;
      saveActiveCampaignBatch();
      renderCampaignResult();
      updateControlState();
    }
  }

  function campaignSitelinksSignature() {
    return sitelinksSignatureForLinks(activeCampaignBatchSitelinks);
  }

  function normalizeDraftSitelinks(value) {
    if (!Array.isArray(value)) return [];
    const anchors = new Set();
    return value.filter(item => item && typeof item === 'object' && !Array.isArray(item))
      .map(item => ({
        title: String(item.title || '').trim(),
        description1: String(item.description1 || '').trim(),
        description2: String(item.description2 || '').trim(),
        anchor: Number(item.anchor),
      }))
      .filter(item => {
        if (!item.title || Boolean(item.description1) !== Boolean(item.description2)
            || !Number.isInteger(item.anchor) || item.anchor < 1 || item.anchor > 6
            || anchors.has(item.anchor) || Array.from(item.title).length > 25
            || Array.from(item.description1).length > 35 || Array.from(item.description2).length > 35) return false;
        anchors.add(item.anchor);
        return true;
      }).slice(0, 6);
  }

  function sitelinksFromParsedCopy() {
    const all = Array.isArray(parsedCopy?.sitelinks) ? parsedCopy.sitelinks : [];
    const selectionRequired = copyImportMode === 'batch-sitelinks' || sitelinksSelectionTouched;
    const source = selectionRequired ? all.filter(link => selectedCopySitelinks.has(link.id)) : [];
    const valid = source.filter(link => {
      const title = String(link?.title?.text || '').trim();
      const description1 = String(link?.descriptions?.[0]?.text || '').trim();
      const description2 = String(link?.descriptions?.[1]?.text || '').trim();
      return Boolean(title) && Boolean(description1) === Boolean(description2)
        && Array.from(title).length <= 25
        && Array.from(description1).length <= 35
        && Array.from(description2).length <= 35;
    });
    return {
      detectedCount: source.length,
      sitelinks: valid.slice(0, 6).map((link, index) => ({
        title: link.title.text.trim(),
        description1: String(link.descriptions?.[0]?.text || '').trim(),
        description2: String(link.descriptions?.[1]?.text || '').trim(),
        anchor: selectedCopySitelinks.get(link.id),
      })),
    };
  }

  function selectedCopySitelinkCount() {
    const selectionRequired = copyImportMode === 'batch-sitelinks' || sitelinksSelectionTouched;
    return selectionRequired ? Math.min(6, selectedCopySitelinks.size) : 0;
  }

  function pendingCampaignSitelinks() {
    const signature = campaignSitelinksSignature();
    return createdCampaigns.filter(campaign => campaign.sitelinksResult?.verified !== true
      || campaign.sitelinksResult.signature !== signature);
  }

  function batchNegativeKeywordCampaigns() {
    const campaigns = createdCampaigns.map(campaign => ({
      managerCustomerId: String(campaign.managerCustomerId || '').replace(/\D/g, ''),
      customerId: String(campaign.customerId || '').replace(/\D/g, ''),
      campaignId: String(campaign.campaignId || ''),
      campaignName: String(campaign.campaignName || '').trim(),
      status: String(campaign.status || ''),
      campaignChannelType: String(campaign.campaignChannelType || ''),
      accountName: String(campaign.accountName || ''),
    }));
    const managers = [...new Set(campaigns.map(item => item.managerCustomerId).filter(Boolean))];
    return { campaigns, managerCustomerId: managers.length === 1 ? managers[0] : '', managers };
  }

  function parseBatchNegativeKeywordTerms(value) {
    const error = keywordListError(value, { required: true, label: 'palavras-chave negativas' });
    if (error) throw new Error(error);
    return String(value).split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const parsed = parseKeywordLine(line);
      if (!parsed.ok || parsed.empty) throw new Error(parsed.error || 'Confira o formato das palavras-chave negativas.');
      return { text: parsed.text.replace(/\s+/g, ' '), matchType: parsed.matchType };
    });
  }

  function batchNegativeKeywordPreviewMatchesCurrent(preview, inputText) {
    if (!preview || preview.inputText !== inputText) return false;
    const { campaigns, managerCustomerId, managers } = batchNegativeKeywordCampaigns();
    if (!managerCustomerId || managers.length !== 1 || campaigns.length !== preview.campaigns.length
        || preview.managerCustomerId !== managerCustomerId) return false;
    const campaignKey = campaign => [campaign.managerCustomerId || managerCustomerId, campaign.customerId, campaign.campaignId,
      campaign.campaignName, campaign.status].join('|');
    const current = new Set(campaigns.map(campaignKey));
    return preview.campaigns.every(campaign => current.has(campaignKey(campaign)));
  }

  function renderCampaignNegativeKeywordsBatch(container = resultArea) {
    if ((!completed && !campaignBatchRestored) || !activeCampaignBatchId || !createdCampaigns.length) return;
    const state = activeCampaignBatchNegativeKeywords || { inputText: '', preview: null, result: null };
    const { campaigns, managerCustomerId, managers } = batchNegativeKeywordCampaigns();
    const allSearch = campaigns.every(campaign => campaign.campaignChannelType === 'SEARCH');
    const allValidStatus = campaigns.every(campaign => ['ENABLED', 'PAUSED'].includes(campaign.status));
    const previewCurrent = batchNegativeKeywordPreviewMatchesCurrent(state.preview, state.inputText);
    const panel = document.createElement('section');
    panel.className = 'google-ads-audience-exclusions-batch google-ads-campaign-negative-keywords-batch';
    panel.setAttribute('aria-label', 'Adicionar palavras-chave negativas ao lote');
    const title = document.createElement('h3');
    title.textContent = 'Adicionar palavras-chave negativas ao lote';
    const scope = document.createElement('p');
    scope.className = 'google-ads-audience-batch-total';
    scope.textContent = campaigns.length + ' campanha(s) em ' + new Set(campaigns.map(item => item.customerId)).size
      + ' conta(s) · escopo fixo: este lote salvo' + (managerCustomerId ? ' · ' + managerMccLabel(managerCustomerId) : '');
    const textarea = document.createElement('textarea');
    textarea.className = 'input google-ads-campaign-negative-keywords-input';
    textarea.maxLength = 9000;
    textarea.rows = 5;
    textarea.value = state.inputText || '';
    textarea.placeholder = 'free trial\n"customer service"\n[official website]';
    textarea.setAttribute('aria-label', 'Palavras-chave negativas do lote, uma por linha');
    textarea.disabled = busy || campaignBatchNegativeKeywordsBusy;
    const keywordEditor = document.createElement('div');
    keywordEditor.className = 'google-ads-keyword-editor google-ads-campaign-negative-keywords-editor';
    const matchTypes = document.createElement('div');
    matchTypes.className = 'google-ads-keyword-types';
    matchTypes.setAttribute('aria-hidden', 'true');
    const matchTypeRows = document.createElement('div');
    const renderBatchNegativeKeywordMatchTypes = () => {
      matchTypeRows.replaceChildren();
      for (const line of String(textarea.value || '').split(/\r?\n/)) {
        const parsed = parseKeywordLine(line);
        const row = document.createElement('div');
        row.textContent = parsed.empty ? '' : parsed.ok ? parsed.label : 'Inválida';
        row.classList.toggle('is-invalid', !parsed.ok);
        matchTypeRows.append(row);
      }
      matchTypeRows.scrollTop = textarea.scrollTop;
    };
    matchTypes.append(matchTypeRows);
    keywordEditor.append(matchTypes, textarea);
    renderBatchNegativeKeywordMatchTypes();
    textarea.addEventListener('scroll', () => { matchTypeRows.scrollTop = textarea.scrollTop; });
    const controls = document.createElement('div');
    controls.className = 'google-ads-campaign-sitelinks-controls';
    const previewButton = document.createElement('button');
    previewButton.type = 'button';
    previewButton.className = 'btn';
    previewButton.textContent = campaignBatchNegativeKeywordsBusy ? 'Conferindo negativas…' : 'Conferir negativas neste lote';
    previewButton.disabled = busy || campaignBatchNegativeKeywordsBusy || !activeCampaignBatchId || !createdCampaigns.length
      || managers.length !== 1 || !allSearch || !allValidStatus;
    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.className = 'btn primary';
    applyButton.textContent = campaignBatchNegativeKeywordsBusy && state.preview
      ? 'Enviando negativas…'
      : previewCurrent && state.preview.toCreateCount > 0
        ? 'Enviar ' + state.preview.toCreateCount + ' negativa(s) ao lote'
        : previewCurrent && state.preview.toCreateCount === 0
          ? 'Negativas já presentes em todas as combinações'
          : 'Enviar negativas ao lote';
    applyButton.disabled = busy || campaignBatchNegativeKeywordsBusy || !previewCurrent || state.preview.toCreateCount < 1
      || managers.length !== 1 || !allSearch || !allValidStatus;
    controls.append(previewButton, applyButton);
    panel.append(title, scope, keywordEditor, controls);
    if (managers.length !== 1) {
      const warning = document.createElement('p'); warning.className = 'is-error';
      warning.textContent = 'Este lote não tem uma única MCC identificada para todas as campanhas; confira o lote antes de usar a função.';
      panel.append(warning);
    } else if (!allSearch) {
      const warning = document.createElement('p'); warning.className = 'is-warning';
      warning.textContent = 'A lista só pode ser aplicada quando todas as campanhas deste lote são do tipo Pesquisa (Search). Nenhuma campanha foi alterada.';
      panel.append(warning);
    } else if (!allValidStatus) {
      const warning = document.createElement('p'); warning.className = 'is-warning';
      warning.textContent = 'Uma ou mais campanhas não têm status confirmado como ativa ou pausada. Atualize/associe novamente o lote antes da prévia.';
      panel.append(warning);
    }
    const status = document.createElement('p');
    status.className = 'google-ads-audience-exclusion-export-status';
    if (campaignBatchNegativeKeywordsBusy) status.textContent = 'Aguarde a operação terminar. Nenhuma outra solicitação será iniciada em paralelo.';
    else if (campaignBatchNegativeKeywordsMessage) status.textContent = campaignBatchNegativeKeywordsMessage;
    else if (previewCurrent) {
      status.classList.add('is-success');
      status.textContent = 'Prévia atual · ' + state.preview.campaignCount + ' campanha(s) × ' + state.preview.termCount
        + ' termo(s) = ' + state.preview.pairCount + ' combinações · ' + state.preview.alreadyPresentCount
        + ' já presentes · ' + state.preview.toCreateCount + ' novas. O envio pode gerar até ' + state.preview.toCreateCount
        + ' operações de critério negativo; a prévia, revalidação e conferência também fazem leituras da API.';
    } else if (state.preview) {
      status.classList.add('is-warning');
      status.textContent = 'A lista ou as campanhas mudaram desde a prévia. Confira novamente antes de enviar.';
    } else status.textContent = 'A prévia consulta somente as campanhas e termos deste lote. O envio só ocorre após nova conferência e confirmação.';
    panel.append(status);
    previewButton.addEventListener('click', () => { void previewCampaignNegativeKeywordsBatch(); });
    applyButton.addEventListener('click', () => { void applyCampaignNegativeKeywordsBatch(); });
    textarea.addEventListener('input', () => {
      const nextText = textarea.value;
      renderBatchNegativeKeywordMatchTypes();
      if (nextText === activeCampaignBatchNegativeKeywords.inputText) return;
      activeCampaignBatchNegativeKeywords = { ...activeCampaignBatchNegativeKeywords, inputText: nextText, preview: null, updatedAt: new Date().toISOString() };
      campaignBatchNegativeKeywordsMessage = 'A lista mudou. A prévia anterior foi invalidada; gere outra antes de enviar.';
      applyButton.disabled = true;
      applyButton.textContent = 'Enviar negativas ao lote';
      status.className = 'google-ads-audience-exclusion-export-status is-warning';
      status.textContent = campaignBatchNegativeKeywordsMessage;
      panel.querySelector('.google-ads-campaign-negative-keyword-pairs')?.remove();
      globalThis.clearTimeout(campaignBatchNegativeKeywordsSaveTimer);
      campaignBatchNegativeKeywordsSaveTimer = globalThis.setTimeout(() => {
        campaignBatchNegativeKeywordsSaveTimer = 0;
        if (!saveActiveCampaignBatch()) campaignBatchNegativeKeywordsMessage = 'Não foi possível salvar a lista negativa neste lote.';
      }, 500);
    });
    textarea.addEventListener('change', () => {
      if (!campaignBatchNegativeKeywordsSaveTimer) return;
      globalThis.clearTimeout(campaignBatchNegativeKeywordsSaveTimer);
      campaignBatchNegativeKeywordsSaveTimer = 0;
      if (!saveActiveCampaignBatch()) campaignBatchNegativeKeywordsMessage = 'Não foi possível salvar a lista negativa neste lote.';
    });
    if (previewCurrent) {
      const pairs = document.createElement('ul');
      pairs.className = 'google-ads-campaign-negative-keyword-pairs';
      const countsByTerm = new Map();
      state.preview.pairs.forEach(pair => {
        const key = pair.matchType + '|' + pair.term;
        const counts = countsByTerm.get(key) || { present: 0, toCreate: 0 };
        if (pair.alreadyPresent) counts.present += 1;
        else counts.toCreate += 1;
        countsByTerm.set(key, counts);
      });
      state.preview.terms.forEach(term => {
        const row = document.createElement('li');
        const counts = countsByTerm.get(term.matchType + '|' + term.text) || { present: 0, toCreate: 0 };
        row.textContent = (term.matchType === 'EXACT' ? '[' + term.text + ']' : term.matchType === 'PHRASE' ? '"' + term.text + '"' : term.text)
          + ' · ' + counts.present + ' já presente(s) · ' + counts.toCreate + ' para criar';
        pairs.append(row);
      });
      panel.append(pairs);
    }
    if (state.result) {
      const summary = document.createElement('p');
      summary.className = 'google-ads-audience-batch-total ' + (state.result.status === 'complete' ? 'is-success' : 'is-warning');
      summary.textContent = (state.result.status === 'complete' ? 'Último envio conferido' : state.result.status === 'error' ? 'Última solicitação sem confirmação' : 'Último envio parcial')
        + ' · ' + state.result.createdCount + ' criada(s) e confirmada(s) · ' + state.result.alreadyPresentCount + ' já presente(s) · '
        + state.result.unverifiedCount + ' sem confirmação · ' + state.result.failedCount + ' falha(s)'
        + (state.result.message ? ' · ' + state.result.message : '')
        + (state.result.inputText !== state.inputText ? ' · histórico da lista anterior; a lista atual foi alterada.' : '.');
      panel.append(summary);
      if (state.result.results?.length) {
        const details = document.createElement('details');
        const summaryLabel = document.createElement('summary');
        summaryLabel.textContent = 'Ver resultados por campanha (' + state.result.results.length + ' combinação(ões))';
        details.append(summaryLabel);
        const list = document.createElement('ul'); list.className = 'google-ads-audience-batch-list';
        const campaignsByKey = new Map(createdCampaigns.map(campaign => [campaign.customerId + '|' + campaign.campaignId, campaign]));
        const groups = new Map();
        state.result.results.forEach(item => {
          const key = item.customerId + '|' + item.campaignId;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(item);
        });
        groups.forEach((items, key) => {
          const campaign = campaignsByKey.get(key);
          const counts = Object.fromEntries(['created_verified', 'already_present', 'write_unverified', 'failed'].map(result => [result, items.filter(item => item.result === result).length]));
          const row = document.createElement('li');
          const label = document.createElement('strong'); label.textContent = (campaign?.campaignName || key) + ' · ' + (campaign?.accountName || items[0].customerId);
          const detail = document.createElement('span');
          detail.textContent = counts.created_verified + ' confirmada(s) · ' + counts.already_present + ' já presente(s) · '
            + counts.write_unverified + ' sem confirmação · ' + counts.failed + ' falha(s)';
          detail.className = counts.write_unverified || counts.failed ? 'is-error' : 'is-success';
          row.append(label, detail); list.append(row);
        });
        details.append(list); panel.append(details);
      }
    }
    container.append(panel);
  }

  async function previewCampaignNegativeKeywordsBatch() {
    if (busy || campaignBatchNegativeKeywordsBusy || !activeCampaignBatchId || !createdCampaigns.length) return;
    let terms;
    try { terms = parseBatchNegativeKeywordTerms(activeCampaignBatchNegativeKeywords.inputText); }
    catch (error) { campaignBatchNegativeKeywordsMessage = error.message; renderCampaignResult(); return; }
    const { campaigns, managerCustomerId, managers } = batchNegativeKeywordCampaigns();
    if (managers.length !== 1 || !managerCustomerId || campaigns.some(item => item.campaignChannelType !== 'SEARCH'
        || !['ENABLED', 'PAUSED'].includes(item.status))) {
      campaignBatchNegativeKeywordsMessage = 'O lote precisa ter uma MCC única, campanhas Search e status confirmado antes da prévia.';
      renderCampaignResult(); return;
    }
    if (!saveActiveCampaignBatch()) { campaignBatchNegativeKeywordsMessage = 'Não foi possível salvar esta lista no lote. A prévia não foi iniciada.'; renderCampaignResult(); return; }
    campaignBatchNegativeKeywordsBusy = true; busy = true; campaignBatchNegativeKeywordsMessage = '';
    renderCampaignResult(); updateControlState();
    try {
      const preview = await previewGoogleAdsBatchNegativeKeywords({
        managerCustomerId,
        campaigns: campaigns.map(({ managerCustomerId: manager, customerId, campaignId, campaignName, status }) => ({ managerCustomerId: manager, customerId, campaignId, campaignName, status })),
        terms,
      });
      activeCampaignBatchNegativeKeywords = { ...activeCampaignBatchNegativeKeywords,
        preview: { ...preview, inputText: activeCampaignBatchNegativeKeywords.inputText }, updatedAt: new Date().toISOString() };
      campaignBatchNegativeKeywordsMessage = '';
      if (!saveActiveCampaignBatch()) throw new Error('A prévia foi consultada, mas não pôde ser salva no lote. Não clique em enviar até reabrir o lote e gerar nova prévia.');
      setCampaignBatchStatus('Prévia de negativas salva no lote · ' + preview.toCreateCount + ' combinação(ões) novas · ' + preview.alreadyPresentCount + ' já presentes.');
    } catch (error) {
      campaignBatchNegativeKeywordsMessage = error?.message || 'Não foi possível conferir as negativas deste lote.';
    } finally {
      campaignBatchNegativeKeywordsBusy = false; busy = false; renderCampaignResult(); updateControlState();
    }
  }

  async function applyCampaignNegativeKeywordsBatch() {
    if (busy || campaignBatchNegativeKeywordsBusy || !activeCampaignBatchId || !createdCampaigns.length) return;
    const state = activeCampaignBatchNegativeKeywords;
    if (!batchNegativeKeywordPreviewMatchesCurrent(state.preview, state.inputText)) {
      campaignBatchNegativeKeywordsMessage = 'A prévia não corresponde mais à lista ou às campanhas atuais. Gere uma nova prévia.';
      renderCampaignResult(); return;
    }
    const preview = state.preview;
    const activeCampaignCount = preview.campaigns.filter(campaign => campaign.status === 'ENABLED').length;
    const names = preview.campaigns.slice(0, 12).map(campaign => '• ' + campaign.campaignName + ' · ' + campaign.customerId
      + ' · ' + (campaign.status === 'ENABLED' ? 'ATIVA' : 'PAUSADA')).join('\n');
    const remaining = preview.campaigns.length - Math.min(preview.campaigns.length, 12);
    const confirmed = globalThis.confirm('Enviar ' + preview.toCreateCount + ' palavra(s)-chave negativa(s) como critérios individuais para ' + preview.campaignCount
      + ' campanha(s) deste lote? ' + preview.alreadyPresentCount + ' combinação(ões) já existem e serão ignoradas.\n\n'
      + preview.campaignCount + ' campanhas × ' + preview.termCount + ' termos = ' + preview.pairCount + ' combinações conferidas.\n\n'
      + 'Campanhas incluídas:\n' + names + (remaining > 0 ? '\n• e mais ' + remaining + ' campanha(s)' : '')
      + '\n\nA operação cria apenas as negativas ausentes, uma por campanha e termo. O serviço revalida a prévia antes de gravar e tenta confirmar os resultados depois. A solicitação pode consumir até '
      + preview.toCreateCount + ' operações de mutação, além de leituras.'
      + (activeCampaignCount ? '\n\nAtenção: ' + activeCampaignCount + ' campanha(s) está(ão) ativa(s); as negativas podem alterar o tráfego imediatamente.' : '')
      + '\n\nSe a confirmação ficar incerta, confira no Google Ads antes de qualquer nova tentativa. Continuar?');
    if (!confirmed) return;
    if (!saveActiveCampaignBatch()) { campaignBatchNegativeKeywordsMessage = 'Não foi possível salvar a prévia no lote. Nenhuma negativa foi enviada.'; renderCampaignResult(); return; }
    campaignBatchNegativeKeywordsBusy = true; busy = true; campaignBatchNegativeKeywordsMessage = '';
    renderCampaignResult(); updateControlState();
    try {
      const result = await applyGoogleAdsBatchNegativeKeywords({ managerCustomerId: preview.managerCustomerId, preview, confirm: true });
      activeCampaignBatchNegativeKeywords = {
        ...activeCampaignBatchNegativeKeywords,
        preview: null,
        result: { ...result, status: result.complete ? 'complete' : 'partial', inputText: preview.inputText, message: '',
          campaignCount: result.campaignCount, termCount: result.termCount, pairCount: result.pairCount },
        updatedAt: new Date().toISOString(),
      };
      campaignBatchNegativeKeywordsMessage = '';
      const saved = saveActiveCampaignBatch();
      setCampaignBatchStatus(saved
        ? 'Negativas do lote: ' + result.createdCount + ' criada(s) e confirmada(s) · ' + result.alreadyPresentCount + ' já presentes · '
          + result.unverifiedCount + ' sem confirmação · ' + result.failedCount + ' falha(s).'
        : 'O Google Ads respondeu, mas o resultado não foi salvo no lote. Confira as campanhas antes de repetir.', !saved || !result.complete);
    } catch (error) {
      activeCampaignBatchNegativeKeywords = {
        ...activeCampaignBatchNegativeKeywords,
        preview: null,
        result: { status: 'error', inputText: preview.inputText, campaignCount: preview.campaignCount, termCount: preview.termCount,
          pairCount: preview.pairCount, createdCount: 0, alreadyPresentCount: 0, unverifiedCount: 0, failedCount: 0,
          results: [], message: error?.message || 'Solicitação sem confirmação. Confira no Google Ads antes de repetir.', verifiedAtUtc: '' },
        updatedAt: new Date().toISOString(),
      };
      campaignBatchNegativeKeywordsMessage = 'A solicitação não foi confirmada. Confira a conta no Google Ads e gere uma nova prévia antes de tentar novamente.';
      if (!saveActiveCampaignBatch()) campaignBatchNegativeKeywordsMessage += ' O histórico também não pôde ser salvo localmente.';
      setCampaignBatchStatus(campaignBatchNegativeKeywordsMessage, true);
    } finally {
      campaignBatchNegativeKeywordsBusy = false; busy = false; renderCampaignResult(); updateControlState();
    }
  }

  function batchPositiveKeywordCampaigns() {
    const campaigns = createdCampaigns.map(campaign => ({
      managerCustomerId: String(campaign.managerCustomerId || '').replace(/\D/g, ''),
      customerId: String(campaign.customerId || '').replace(/\D/g, ''),
      campaignId: String(campaign.campaignId || ''),
      campaignName: String(campaign.campaignName || '').trim(),
      status: String(campaign.status || ''),
      campaignChannelType: String(campaign.campaignChannelType || ''),
      adGroupId: String(campaign.adGroupId || ''),
      adGroupStatus: String(campaign.adGroupStatus || ''),
      accountName: String(campaign.accountName || ''),
    }));
    const managers = [...new Set(campaigns.map(item => item.managerCustomerId).filter(Boolean))];
    return { campaigns, managerCustomerId: managers.length === 1 ? managers[0] : '', managers };
  }

  function parseBatchPositiveKeywordTerms(value) {
    const error = keywordListError(value, { required: true, label: 'palavras-chave positivas' });
    if (error) throw new Error(error);
    return String(value).split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const parsed = parseKeywordLine(line);
      if (!parsed.ok || parsed.empty) throw new Error(parsed.error || 'Confira o formato das palavras-chave positivas.');
      return { text: parsed.text.replace(/\s+/g, ' '), matchType: parsed.matchType };
    });
  }

  function batchPositiveKeywordPreviewMatchesCurrent(preview, inputText) {
    if (!preview || preview.inputText !== inputText) return false;
    const { campaigns, managerCustomerId, managers } = batchPositiveKeywordCampaigns();
    if (!managerCustomerId || managers.length !== 1 || campaigns.length !== preview.campaigns.length
        || preview.managerCustomerId !== managerCustomerId) return false;
    const campaignKey = campaign => [campaign.managerCustomerId || managerCustomerId, campaign.customerId, campaign.campaignId,
      campaign.campaignName, campaign.status, campaign.adGroupId, campaign.adGroupStatus].join('|');
    const current = new Set(campaigns.map(campaignKey));
    return preview.campaigns.every(campaign => current.has(campaignKey(campaign)));
  }

  function renderCampaignPositiveKeywordsBatch(container = resultArea) {
    if ((!completed && !campaignBatchRestored) || !activeCampaignBatchId || !createdCampaigns.length) return;
    const state = activeCampaignBatchPositiveKeywords || { inputText: '', preview: null, result: null };
    const { campaigns, managerCustomerId, managers } = batchPositiveKeywordCampaigns();
    const allSearch = campaigns.every(campaign => campaign.campaignChannelType === 'SEARCH');
    const allValidStatus = campaigns.every(campaign => ['ENABLED', 'PAUSED'].includes(campaign.status));
    const missingGroups = campaigns.filter(campaign => !/^[1-9]\d{0,19}$/.test(campaign.adGroupId)
      || !['ENABLED', 'PAUSED'].includes(campaign.adGroupStatus));
    const previewCurrent = batchPositiveKeywordPreviewMatchesCurrent(state.preview, state.inputText);
    const panel = document.createElement('section');
    panel.className = 'google-ads-audience-exclusions-batch google-ads-campaign-negative-keywords-batch google-ads-campaign-positive-keywords-batch';
    panel.setAttribute('aria-label', 'Adicionar palavras-chave positivas ao lote');
    const title = document.createElement('h3');
    title.textContent = 'Adicionar palavras-chave ao lote';
    const help = document.createElement('p');
    help.textContent = 'Inclui palavras-chave positivas no único grupo de anúncios de cada campanha Search deste lote. Informe uma por linha: ampla, "frase" ou [exata]. A prévia e a confirmação funcionam em lotes criados pela API do Hub ou pelo fluxo CSV, depois que as campanhas estão salvas e os grupos foram identificados.';
    const scope = document.createElement('p');
    scope.className = 'google-ads-audience-batch-total';
    scope.textContent = campaigns.length + ' campanha(s) em ' + new Set(campaigns.map(item => item.customerId)).size
      + ' conta(s) · escopo fixo: este lote salvo' + (managerCustomerId ? ' · ' + managerMccLabel(managerCustomerId) : '');
    const textarea = document.createElement('textarea');
    textarea.className = 'input google-ads-campaign-negative-keywords-input';
    textarea.maxLength = 9000;
    textarea.rows = 5;
    textarea.value = state.inputText || '';
    textarea.placeholder = 'buy product\n"product review"\n[official product]';
    textarea.setAttribute('aria-label', 'Palavras-chave positivas do lote, uma por linha');
    textarea.disabled = busy || campaignBatchPositiveKeywordsBusy;
    const editorLabel = document.createElement('label');
    editorLabel.className = 'google-ads-campaign-positive-keywords-label';
    const label = document.createElement('span');
    label.textContent = 'Palavras-chave positivas ';
    const hint = document.createElement('small');
    hint.textContent = 'uma por linha: [exata], "frase" ou ampla';
    label.append(hint);
    editorLabel.append(label, textarea);
    const controls = document.createElement('div');
    controls.className = 'google-ads-campaign-sitelinks-controls';
    const previewButton = document.createElement('button');
    previewButton.type = 'button';
    previewButton.className = 'btn';
    previewButton.textContent = campaignBatchPositiveKeywordsBusy ? 'Conferindo palavras-chave…' : 'Conferir palavras-chave neste lote';
    previewButton.disabled = busy || campaignBatchPositiveKeywordsBusy || !activeCampaignBatchId || !campaigns.length
      || managers.length !== 1 || !allSearch || !allValidStatus || missingGroups.length > 0;
    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.className = 'btn primary';
    applyButton.textContent = campaignBatchPositiveKeywordsBusy && state.preview
      ? 'Incluindo palavras-chave…'
      : previewCurrent && state.preview.toCreateCount > 0
        ? 'Incluir ' + state.preview.toCreateCount + ' palavra(s)-chave no lote'
        : previewCurrent && state.preview.toCreateCount === 0
          ? 'Palavras-chave já presentes em todos os grupos'
          : 'Incluir palavras-chave no lote';
    applyButton.disabled = busy || campaignBatchPositiveKeywordsBusy || !previewCurrent || state.preview.toCreateCount < 1
      || managers.length !== 1 || !allSearch || !allValidStatus || missingGroups.length > 0;
    controls.append(previewButton, applyButton);
    panel.append(title, help, scope, editorLabel, controls);
    if (managers.length !== 1) {
      const warning = document.createElement('p'); warning.className = 'is-error';
      warning.textContent = 'Este lote não tem uma única MCC identificada para todas as campanhas; confira o lote antes de usar a função.';
      panel.append(warning);
    } else if (!allSearch) {
      const warning = document.createElement('p'); warning.className = 'is-warning';
      warning.textContent = 'A inclusão só está disponível quando todas as campanhas deste lote são do tipo Pesquisa (Search). Nenhuma campanha foi alterada.';
      panel.append(warning);
    } else if (!allValidStatus) {
      const warning = document.createElement('p'); warning.className = 'is-warning';
      warning.textContent = 'Uma ou mais campanhas não têm status confirmado como ativa ou pausada. Atualize ou associe novamente o lote antes da prévia.';
      panel.append(warning);
    } else if (missingGroups.length) {
      const warning = document.createElement('p'); warning.className = 'is-warning';
      warning.textContent = missingGroups.length + ' campanha(s) não têm exatamente um grupo de anúncios identificado no lote. Reassocie ou confira os grupos no Google Ads antes de continuar.';
      panel.append(warning);
    }
    const status = document.createElement('p');
    status.className = 'google-ads-audience-exclusion-export-status';
    if (campaignBatchPositiveKeywordsBusy) status.textContent = 'Aguarde a operação terminar. Nenhuma outra solicitação será iniciada em paralelo.';
    else if (campaignBatchPositiveKeywordsMessage) status.textContent = campaignBatchPositiveKeywordsMessage;
    else if (previewCurrent) {
      status.classList.add('is-success');
      status.textContent = 'Prévia atual · ' + state.preview.campaignCount + ' campanha(s) × ' + state.preview.termCount
        + ' termo(s) = ' + state.preview.pairCount + ' combinações · ' + state.preview.alreadyPresentCount
        + ' já presentes · ' + state.preview.toCreateCount + ' novas. A inclusão grava no máximo ' + state.preview.toCreateCount
        + ' critérios de palavra-chave, no nível do grupo de anúncios; a prévia, revalidação e conferência também fazem leituras da API.';
    } else if (state.preview) {
      status.classList.add('is-warning');
      status.textContent = 'A lista, as campanhas ou os grupos mudaram desde a prévia. Confira novamente antes de enviar.';
    } else status.textContent = 'A prévia consulta somente as campanhas e os grupos deste lote. A inclusão só ocorre após nova conferência e confirmação.';
    panel.append(status);
    previewButton.addEventListener('click', () => { void previewCampaignPositiveKeywordsBatch(); });
    applyButton.addEventListener('click', () => { void applyCampaignPositiveKeywordsBatch(); });
    textarea.addEventListener('input', () => {
      const nextText = textarea.value;
      if (nextText === activeCampaignBatchPositiveKeywords.inputText) return;
      activeCampaignBatchPositiveKeywords = { ...activeCampaignBatchPositiveKeywords, inputText: nextText, preview: null, updatedAt: new Date().toISOString() };
      campaignBatchPositiveKeywordsMessage = 'A lista mudou. A prévia anterior foi invalidada; gere outra antes de incluir os termos.';
      applyButton.disabled = true;
      applyButton.textContent = 'Incluir palavras-chave no lote';
      status.className = 'google-ads-audience-exclusion-export-status is-warning';
      status.textContent = campaignBatchPositiveKeywordsMessage;
      panel.querySelector('.google-ads-campaign-positive-keyword-pairs')?.remove();
      clearCampaignBatchPositiveKeywordsSaveTimer();
      campaignBatchPositiveKeywordsSaveTimer = globalThis.setTimeout(() => {
        campaignBatchPositiveKeywordsSaveTimer = 0;
        if (!saveActiveCampaignBatch()) campaignBatchPositiveKeywordsMessage = 'Não foi possível salvar a lista positiva neste lote.';
      }, 500);
    });
    textarea.addEventListener('change', () => {
      if (!campaignBatchPositiveKeywordsSaveTimer) return;
      clearCampaignBatchPositiveKeywordsSaveTimer();
      if (!saveActiveCampaignBatch()) campaignBatchPositiveKeywordsMessage = 'Não foi possível salvar a lista positiva neste lote.';
    });
    if (previewCurrent) {
      const pairs = document.createElement('ul');
      pairs.className = 'google-ads-campaign-negative-keyword-pairs google-ads-campaign-positive-keyword-pairs';
      const countsByTerm = new Map();
      state.preview.pairs.forEach(pair => {
        const key = pair.matchType + '|' + pair.term;
        const counts = countsByTerm.get(key) || { present: 0, toCreate: 0 };
        if (pair.alreadyPresent) counts.present += 1;
        else counts.toCreate += 1;
        countsByTerm.set(key, counts);
      });
      state.preview.terms.forEach(term => {
        const row = document.createElement('li');
        const counts = countsByTerm.get(term.matchType + '|' + term.text) || { present: 0, toCreate: 0 };
        row.textContent = (term.matchType === 'EXACT' ? '[' + term.text + ']' : term.matchType === 'PHRASE' ? '"' + term.text + '"' : term.text)
          + ' · ' + counts.present + ' já presente(s) · ' + counts.toCreate + ' para incluir';
        pairs.append(row);
      });
      panel.append(pairs);
    }
    if (state.result) {
      const summary = document.createElement('p');
      summary.className = 'google-ads-audience-batch-total ' + (state.result.status === 'complete' ? 'is-success' : 'is-warning');
      summary.textContent = (state.result.status === 'complete' ? 'Última inclusão conferida' : state.result.status === 'error' ? 'Última solicitação sem confirmação' : 'Última inclusão parcial')
        + ' · ' + state.result.createdCount + ' criada(s) e confirmada(s) · ' + state.result.alreadyPresentCount + ' já presente(s) · '
        + state.result.unverifiedCount + ' sem confirmação · ' + state.result.failedCount + ' falha(s)'
        + (state.result.message ? ' · ' + state.result.message : '')
        + (state.result.inputText !== state.inputText ? ' · histórico da lista anterior; a lista atual foi alterada.' : '.');
      panel.append(summary);
      if (state.result.results?.length) {
        const details = document.createElement('details');
        const resultSummary = document.createElement('summary');
        resultSummary.textContent = 'Ver resultados por campanha (' + state.result.results.length + ' combinação(ões))';
        details.append(resultSummary);
        const list = document.createElement('ul'); list.className = 'google-ads-audience-batch-list';
        const campaignsByKey = new Map(createdCampaigns.map(campaign => [campaign.customerId + '|' + campaign.campaignId, campaign]));
        const groups = new Map();
        state.result.results.forEach(item => {
          const key = item.customerId + '|' + item.campaignId;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(item);
        });
        groups.forEach((items, key) => {
          const campaign = campaignsByKey.get(key);
          const counts = Object.fromEntries(['created_verified', 'already_present', 'write_unverified', 'failed'].map(result => [result, items.filter(item => item.result === result).length]));
          const row = document.createElement('li');
          const label = document.createElement('strong'); label.textContent = (campaign?.campaignName || key) + ' · ' + (campaign?.accountName || items[0].customerId);
          const detail = document.createElement('span');
          detail.textContent = counts.created_verified + ' confirmada(s) · ' + counts.already_present + ' já presente(s) · '
            + counts.write_unverified + ' sem confirmação · ' + counts.failed + ' falha(s)';
          detail.className = counts.write_unverified || counts.failed ? 'is-error' : 'is-success';
          row.append(label, detail); list.append(row);
        });
        details.append(list); panel.append(details);
      }
    }
    container.append(panel);
  }

  async function previewCampaignPositiveKeywordsBatch() {
    if (busy || campaignBatchPositiveKeywordsBusy || !activeCampaignBatchId || !createdCampaigns.length) return;
    let terms;
    try { terms = parseBatchPositiveKeywordTerms(activeCampaignBatchPositiveKeywords.inputText); }
    catch (error) { campaignBatchPositiveKeywordsMessage = error.message; renderCampaignResult(); return; }
    const { campaigns, managerCustomerId, managers } = batchPositiveKeywordCampaigns();
    if (managers.length !== 1 || !managerCustomerId || campaigns.some(item => item.campaignChannelType !== 'SEARCH'
        || !['ENABLED', 'PAUSED'].includes(item.status) || !/^[1-9]\d{0,19}$/.test(item.adGroupId)
        || !['ENABLED', 'PAUSED'].includes(item.adGroupStatus))) {
      campaignBatchPositiveKeywordsMessage = 'O lote precisa ter uma MCC única, campanhas Search e exatamente um grupo identificado por campanha, com status confirmado. Reassocie ou confira o lote.';
      renderCampaignResult(); return;
    }
    if (!saveActiveCampaignBatch()) { campaignBatchPositiveKeywordsMessage = 'Não foi possível salvar esta lista no lote. A prévia não foi iniciada.'; renderCampaignResult(); return; }
    campaignBatchPositiveKeywordsBusy = true; busy = true; campaignBatchPositiveKeywordsMessage = '';
    renderCampaignResult(); updateControlState();
    try {
      const preview = await previewGoogleAdsBatchPositiveKeywords({
        managerCustomerId,
        campaigns: campaigns.map(({ managerCustomerId: manager, customerId, campaignId, campaignName, status, adGroupId, adGroupStatus }) =>
          ({ managerCustomerId: manager, customerId, campaignId, campaignName, status, adGroupId, adGroupStatus })),
        terms,
      });
      activeCampaignBatchPositiveKeywords = { ...activeCampaignBatchPositiveKeywords,
        preview: { ...preview, inputText: activeCampaignBatchPositiveKeywords.inputText }, updatedAt: new Date().toISOString() };
      campaignBatchPositiveKeywordsMessage = '';
      if (!saveActiveCampaignBatch()) throw new Error('A prévia foi consultada, mas não pôde ser salva no lote. Não clique em incluir até reabrir o lote e gerar nova prévia.');
      setCampaignBatchStatus('Prévia de palavras-chave positivas salva no lote · ' + preview.toCreateCount + ' combinação(ões) novas · ' + preview.alreadyPresentCount + ' já presentes.');
    } catch (error) {
      campaignBatchPositiveKeywordsMessage = error?.message || 'Não foi possível conferir as palavras-chave positivas deste lote.';
    } finally {
      campaignBatchPositiveKeywordsBusy = false; busy = false; renderCampaignResult(); updateControlState();
    }
  }

  async function applyCampaignPositiveKeywordsBatch() {
    if (busy || campaignBatchPositiveKeywordsBusy || !activeCampaignBatchId || !createdCampaigns.length) return;
    const state = activeCampaignBatchPositiveKeywords;
    if (!batchPositiveKeywordPreviewMatchesCurrent(state.preview, state.inputText)) {
      campaignBatchPositiveKeywordsMessage = 'A prévia não corresponde mais à lista, às campanhas ou aos grupos atuais. Gere uma nova prévia.';
      renderCampaignResult(); return;
    }
    const preview = state.preview;
    const activeCampaignCount = preview.campaigns.filter(campaign => campaign.status === 'ENABLED' && campaign.adGroupStatus === 'ENABLED').length;
    const names = preview.campaigns.slice(0, 12).map(campaign => '• ' + campaign.campaignName + ' · ' + campaign.customerId
      + ' · grupo ' + campaign.adGroupId + ' · ' + (campaign.status === 'ENABLED' ? 'ATIVA' : 'PAUSADA')).join('\n');
    const remaining = preview.campaigns.length - Math.min(preview.campaigns.length, 12);
    const confirmed = globalThis.confirm('Incluir ' + preview.toCreateCount + ' palavra(s)-chave positiva(s) nos grupos de anúncios de ' + preview.campaignCount
      + ' campanha(s) deste lote? ' + preview.alreadyPresentCount + ' combinação(ões) já existem e serão ignoradas.\n\n'
      + preview.campaignCount + ' campanhas × ' + preview.termCount + ' termos = ' + preview.pairCount + ' combinações conferidas.\n\n'
      + 'Campanhas e grupos incluídos:\n' + names + (remaining > 0 ? '\n• e mais ' + remaining + ' campanha(s)' : '')
      + '\n\nAs palavras-chave novas serão criadas como critérios ativos no grupo identificado. O serviço revalida campanha, grupo e critérios antes da gravação e consulta o resultado depois. A solicitação pode consumir até '
      + preview.toCreateCount + ' operações de mutação, além de leituras.'
      + (activeCampaignCount ? '\n\nAtenção: ' + activeCampaignCount + ' campanha(s) e grupo(s) estão ativos; as palavras podem começar a acionar anúncios imediatamente.' : '')
      + '\n\nSe a confirmação ficar incerta, confira os grupos no Google Ads antes de qualquer nova tentativa. Continuar?');
    if (!confirmed) return;
    if (!saveActiveCampaignBatch()) { campaignBatchPositiveKeywordsMessage = 'Não foi possível salvar a prévia no lote. Nenhuma palavra-chave foi incluída.'; renderCampaignResult(); return; }
    campaignBatchPositiveKeywordsBusy = true; busy = true; campaignBatchPositiveKeywordsMessage = '';
    renderCampaignResult(); updateControlState();
    try {
      const result = await applyGoogleAdsBatchPositiveKeywords({ managerCustomerId: preview.managerCustomerId, preview, confirm: true });
      activeCampaignBatchPositiveKeywords = {
        ...activeCampaignBatchPositiveKeywords,
        preview: null,
        result: { ...result, status: result.complete ? 'complete' : 'partial', inputText: preview.inputText, message: '',
          campaignCount: result.campaignCount, termCount: result.termCount, pairCount: result.pairCount },
        updatedAt: new Date().toISOString(),
      };
      campaignBatchPositiveKeywordsMessage = '';
      const saved = saveActiveCampaignBatch();
      setCampaignBatchStatus(saved
        ? 'Palavras-chave positivas do lote: ' + result.createdCount + ' criada(s) e confirmada(s) · ' + result.alreadyPresentCount + ' já presentes · '
          + result.unverifiedCount + ' sem confirmação · ' + result.failedCount + ' falha(s).'
        : 'O Google Ads respondeu, mas o resultado não foi salvo no lote. Confira os grupos antes de repetir.', !saved || !result.complete);
    } catch (error) {
      activeCampaignBatchPositiveKeywords = {
        ...activeCampaignBatchPositiveKeywords,
        preview: null,
        result: { status: 'error', inputText: preview.inputText, campaignCount: preview.campaignCount, termCount: preview.termCount,
          pairCount: preview.pairCount, createdCount: 0, alreadyPresentCount: 0, unverifiedCount: 0, failedCount: 0,
          results: [], message: error?.message || 'Solicitação sem confirmação. Confira os grupos no Google Ads antes de repetir.', verifiedAtUtc: '' },
        updatedAt: new Date().toISOString(),
      };
      campaignBatchPositiveKeywordsMessage = 'A solicitação não foi confirmada. Confira o Google Ads e gere uma nova prévia antes de tentar novamente.';
      if (!saveActiveCampaignBatch()) campaignBatchPositiveKeywordsMessage += ' O histórico também não pôde ser salvo localmente.';
      setCampaignBatchStatus(campaignBatchPositiveKeywordsMessage, true);
    } finally {
      campaignBatchPositiveKeywordsBusy = false; busy = false; renderCampaignResult(); updateControlState();
    }
  }

  function renderCampaignSitelinksBatch() {
    if ((!completed && !campaignBatchRestored) || !activeCampaignBatchId || !createdCampaigns.length) return;
    const pending = pendingCampaignSitelinks();
    const signature = campaignSitelinksSignature();
    const confirmed = createdCampaigns.filter(campaign => campaign.sitelinksResult?.verified === true
      && campaign.sitelinksResult.signature === signature);
    const allCampaignSitelinksConfirmed = activeCampaignBatchSitelinks.length > 0
      && createdCampaigns.length > 0
      && pending.length === 0;
    const failed = createdCampaigns.filter(campaign => campaign.sitelinksError
      && campaign.sitelinksResult?.signature !== signature).length;
    const panel = document.createElement('section');
    panel.className = 'google-ads-audience-exclusions-batch google-ads-campaign-sitelinks-batch';
    panel.setAttribute('aria-label', 'Sitelinks deste lote');
    const title = document.createElement('h3');
    title.textContent = 'Sitelinks deste lote';
    const controls = document.createElement('div');
    controls.className = 'google-ads-campaign-sitelinks-controls';
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'btn google-ads-campaign-sitelinks-choose'
      + (!activeCampaignBatchSitelinks.length && createdCampaigns.length ? ' is-pending' : '');
    choose.textContent = activeCampaignBatchSitelinks.length ? 'Editar sitelinks do lote' : 'Selecionar sitelinks da copy';
    if (!activeCampaignBatchSitelinks.length && createdCampaigns.length) choose.title = 'Pendência: selecione os sitelinks da copy e aplique-os ao lote.';
    choose.disabled = busy || campaignSitelinksBatchApplying;
    choose.addEventListener('click', () => { void openCopyImportDialog('batch-sitelinks'); });
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn primary google-ads-campaign-sitelinks-apply'
      + (allCampaignSitelinksConfirmed ? ' is-confirmed' : '')
      + (!allCampaignSitelinksConfirmed && activeCampaignBatchSitelinks.length && pending.length && !campaignSitelinksBatchApplying ? ' is-pending' : '')
      + (campaignSitelinksBatchApplying ? ' is-applying' : '');
    apply.textContent = campaignSitelinksBatchApplying
      ? 'Aplicando sitelinks (' + (campaignSitelinksBatchProgress?.processed || 0) + '/' + (campaignSitelinksBatchProgress?.total || 1) + ')…'
      : pending.length
        ? failed ? 'Tentar novamente nos ' + pending.length + ' pendentes' : 'Aplicar a ' + pending.length + ' campanhas do lote'
        : 'Sitelinks confirmados em todas as campanhas';
    apply.disabled = busy || campaignSitelinksBatchApplying || activeCampaignBatchSitelinks.length === 0 || pending.length === 0;
    apply.addEventListener('click', () => { void applyCampaignSitelinksBatch(); });
    controls.append(choose, apply);
    panel.append(title, controls);

    if (activeCampaignBatchSitelinks.length) {
      const links = document.createElement('ul');
      links.className = 'google-ads-campaign-sitelinks-list';
      activeCampaignBatchSitelinks.forEach(link => {
        const row = document.createElement('li');
        row.textContent = '#' + link.anchor + ' · ' + link.title + ' · ' + link.description1 + ' · ' + link.description2;
        links.append(row);
      });
      panel.append(links);
      const summary = document.createElement('p');
      summary.className = 'google-ads-audience-batch-total';
      summary.classList.toggle('is-warning', pending.length > 0);
      summary.textContent = confirmed.length + '/' + createdCampaigns.length + ' campanhas com sitelinks confirmados · '
        + pending.length + ' pendentes' + (failed ? ' (' + failed + ' com falha)' : '')
        + (pending.length && !failed ? ' · aplique os sitelinks a todas as campanhas' : '') + '.';
      panel.append(summary);
    } else {
      const empty = document.createElement('p');
      empty.className = 'google-ads-audience-batch-total is-warning';
      empty.textContent = 'Pendência: importe a copy, selecione os sitelinks e aplique-os ao lote.';
      panel.append(empty);
    }

    if (campaignSitelinksBatchApplying && campaignSitelinksBatchProgress) {
      const progress = document.createElement('p');
      const current = createdCampaigns.find(item => campaignOperationKey(item) === campaignSitelinksBatchProgress.currentCampaignKey);
      progress.className = 'google-ads-audience-batch-progress';
      progress.textContent = current
        ? 'Aplicando em ' + (campaignSitelinksBatchProgress.processed + 1) + ' de ' + campaignSitelinksBatchProgress.total
          + ': ' + current.campaignName + ' · ' + (current.accountName || current.customerId) + '.'
        : campaignSitelinksBatchProgress.processed + ' de ' + campaignSitelinksBatchProgress.total + ' concluídas.';
      panel.append(progress);
    }
    if (campaignSitelinksBatchAttempted) {
      const list = document.createElement('ul');
      list.className = 'google-ads-audience-batch-list';
      createdCampaigns.forEach(campaign => {
        const row = document.createElement('li');
        const label = document.createElement('strong');
        label.textContent = campaign.campaignName + ' · ' + (campaign.accountName || campaign.customerId);
        const detail = document.createElement('span');
        const isCurrent = campaignSitelinksBatchApplying
          && campaignOperationKey(campaign) === campaignSitelinksBatchProgress?.currentCampaignKey;
        if (isCurrent) detail.textContent = 'Aplicando agora…';
        else if (campaign.sitelinksError && campaign.sitelinksResult?.signature !== signature) {
          detail.textContent = 'Falha: ' + campaign.sitelinksError;
          detail.className = 'is-error';
        } else if (campaign.sitelinksResult?.verified === true && campaign.sitelinksResult.signature === signature) {
          detail.textContent = campaign.sitelinksResult.appliedCount + ' novo(s) aplicado(s) · '
            + (campaign.sitelinksResult.reactivatedCount || 0) + ' reativado(s) · '
            + campaign.sitelinksResult.alreadyPresentCount + ' já ativo(s), sem duplicar.';
          detail.className = 'is-success';
        } else detail.textContent = 'Pendente.';
        row.append(label, detail);
        list.append(row);
      });
      appendCampaignLogDetails(panel, list, 'sitelinks');
    }
    resultArea.append(panel);
  }

  function pendingCampaignDestinationUrlUpdates(targets = campaignBatchDestinationUrlTargets()) {
    const urlByAccount = new Map(targets.map(target => [target.accountId, target.url]));
    return createdCampaigns.filter(campaign => {
      if (campaign.campaignChannelType !== 'SEARCH' || !['PAUSED', 'ENABLED'].includes(campaign.status)) return false;
      const url = urlByAccount.get(String(campaign.customerId || '').replace(/\D/g, '')) || '';
      if (!isValidCampaignBatchDestinationUrl(url)) return false;
      const signature = JSON.stringify([String(campaign.customerId || '').replace(/\D/g, ''), url]);
      return campaign.destinationUrlResult?.verified !== true || campaign.destinationUrlResult.signature !== signature;
    });
  }

  function renderCampaignDestinationUrlBatch() {
    if ((!completed && !campaignBatchRestored) || !activeCampaignBatchId || !createdCampaigns.length) return;
    const targets = campaignBatchDestinationUrlTargets();
    const source = selectedPreSellForCampaignBatch();
    const unsupported = createdCampaigns.filter(campaign => campaign.campaignChannelType !== 'SEARCH'
      || !['PAUSED', 'ENABLED'].includes(campaign.status));
    const pending = pendingCampaignDestinationUrlUpdates(targets);
    const panel = document.createElement('details');
    panel.className = 'google-ads-audience-exclusions-batch google-ads-campaign-destination-url-batch google-ads-campaign-url-disclosure';
    const title = document.createElement('summary');
    const titleLabel = document.createElement('span');
    titleLabel.textContent = 'Alteração em lote';
    title.append(titleLabel);
    bindCampaignDisclosure(panel, title, 'destination-urls-section');
    const content = document.createElement('div');
    content.className = 'google-ads-campaign-url-disclosure-content';
    panel.append(content);
    const urlProcessTitle = document.createElement('h3');
    urlProcessTitle.className = 'google-ads-campaign-batch-process-title';
    urlProcessTitle.textContent = 'URLs finais';
    content.append(urlProcessTitle);
    const help = document.createElement('p');
    help.textContent = 'Use esta seção para revisar e alterar as URLs finais das campanhas que já estão neste lote. Na criação inicial, a URL publicada da Pre-Sell selecionada é carregada no formulário acima quando produto e conta correspondem; sem correspondência, preencha a URL final no próprio formulário. Cada campo abaixo vale para todas as campanhas dessa conta neste lote. Depois clique em “Atualizar URLs em N campanhas”. O Hub altera anúncios, palavras-chave e assets das campanhas, incluindo sitelinks e promoções; mantém modelos/sufixos de acompanhamento e as seções #1–#6. Assets compartilhados fora do lote ou no nível da conta ficam intactos e são apontados no resultado. A alteração pode iniciar nova análise editorial no Google Ads.';
    content.append(help);
    const sourceStatus = document.createElement('p');
    sourceStatus.className = source.ok ? 'is-success' : 'is-warning';
    sourceStatus.textContent = source.ok
      ? 'Pre-Sell publicada selecionada: ' + source.product + ' · ' + source.handoff.targets.length + ' conta(s) na origem.'
      : 'A URL será carregada automaticamente quando a Pre-Sell publicada selecionada corresponder ao produto do lote. ' + (source.reason || '');
    content.append(sourceStatus);

    const loadButton = document.createElement('button');
    loadButton.type = 'button';
    loadButton.className = 'btn';
    loadButton.textContent = 'Carregar URLs da Pre-Sell selecionada';
    loadButton.disabled = busy || campaignDestinationUrlBatchApplying || !source.ok;
    loadButton.addEventListener('click', loadCampaignBatchDestinationUrlsFromPreSell);
    content.append(loadButton);

    let refreshApplyControl = () => {};
    const list = document.createElement('div');
    list.className = 'google-ads-campaign-destination-url-list';
    targets.forEach(target => {
      const row = document.createElement('label');
      row.className = 'google-ads-campaign-destination-url-row';
      const info = document.createElement('span');
      info.className = 'google-ads-campaign-destination-url-account';
      info.textContent = (target.accountName || ('Conta ' + target.accountId)) + ' · ' + target.accountId + ' · '
        + target.campaignCount + ' campanha(s)';
      const input = document.createElement('input');
      input.className = 'input';
      input.type = 'url';
      input.maxLength = 2048;
      input.autocomplete = 'url';
      input.placeholder = 'https://dominio-da-presell.com';
      input.value = target.url || '';
      input.dataset.campaignBatchDestinationUrlAccount = target.accountId;
      input.setAttribute('aria-label', 'URL final da Pre-Sell para ' + (target.accountName || target.accountId));
      input.addEventListener('input', () => {
        const current = activeCampaignBatchDestinationUrls.find(item => item.accountId === target.accountId);
        const next = {
          accountId: target.accountId,
          url: input.value.trim(),
          sourceJobId: current?.sourceJobId || target.sourceJobId || '',
          sourceProduct: current?.sourceProduct || target.sourceProduct || '',
          updatedAt: new Date().toISOString(),
        };
        activeCampaignBatchDestinationUrls = [
          ...activeCampaignBatchDestinationUrls.filter(item => item.accountId !== target.accountId), next,
        ];
        if (!saveActiveCampaignBatch()) setCampaignBatchStatus('A URL aparece na tela, mas não foi salva no lote neste navegador.', true);
        refreshApplyControl();
      });
      row.append(info, input);
      list.append(row);
    });
    content.append(list);

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn primary google-ads-audience-batch-apply';
    const completeCount = createdCampaigns.filter(campaign => campaign.destinationUrlResult?.verified === true
      && campaign.destinationUrlResult.complete === true
      && campaign.destinationUrlResult.signature === campaignDestinationUrlSignature(campaign)).length;
    const partialCount = createdCampaigns.filter(campaign => campaign.destinationUrlResult?.verified === true
      && campaign.destinationUrlResult.complete !== true
      && campaign.destinationUrlResult.signature === campaignDestinationUrlSignature(campaign)).length;
    apply.textContent = campaignDestinationUrlBatchApplying
      ? 'Atualizando URLs (' + (campaignDestinationUrlBatchProgress?.processed || 0) + '/' + (campaignDestinationUrlBatchProgress?.total || 1) + ')…'
      : pending.length
        ? campaignDestinationUrlBatchAttempted ? 'Tentar concluir URLs nas ' + pending.length + ' pendentes' : 'Atualizar URLs em ' + pending.length + ' campanhas'
        : completeCount === createdCampaigns.length ? 'URLs confirmadas em todas as campanhas'
          : partialCount ? 'URLs aplicadas · confira os assets preservados' : 'Nenhuma campanha compatível para URLs';
    apply.disabled = busy || campaignDestinationUrlBatchApplying || unsupported.length > 0 || targets.length === 0
      || targets.some(target => !isValidCampaignBatchDestinationUrl(target.url)) || pending.length === 0;
    refreshApplyControl = () => {
      const currentTargets = [...list.querySelectorAll('[data-campaign-batch-destination-url-account]')].map(input => ({
        accountId: input.dataset.campaignBatchDestinationUrlAccount,
        url: input.value.trim(),
      }));
      const currentPending = pendingCampaignDestinationUrlUpdates(currentTargets);
      const invalid = currentTargets.length !== targets.length
        || currentTargets.some(target => !/^\d{10}$/.test(target.accountId) || !isValidCampaignBatchDestinationUrl(target.url));
      apply.textContent = campaignDestinationUrlBatchApplying
        ? 'Atualizando URLs (' + (campaignDestinationUrlBatchProgress?.processed || 0) + '/' + (campaignDestinationUrlBatchProgress?.total || 1) + ')…'
        : currentPending.length
          ? campaignDestinationUrlBatchAttempted ? 'Tentar concluir URLs nas ' + currentPending.length + ' pendentes'
            : 'Atualizar URLs em ' + currentPending.length + ' campanhas'
          : completeCount === createdCampaigns.length ? 'URLs confirmadas em todas as campanhas'
            : partialCount ? 'URLs aplicadas · confira os assets preservados'
              : 'Nenhuma campanha pendente para atualizar';
      apply.disabled = busy || campaignDestinationUrlBatchApplying || unsupported.length > 0 || invalid || currentPending.length === 0;
    };
    refreshApplyControl();
    apply.addEventListener('click', () => { void applyCampaignDestinationUrlsBatch(); });
    content.append(apply);

    if (unsupported.length) {
      const warning = document.createElement('p');
      warning.className = 'is-warning';
      warning.textContent = unsupported.length + ' campanha(s) não Search ou sem status confirmado foram bloqueadas; nenhuma URL foi enviada.';
      content.append(warning);
    }
    if (campaignDestinationUrlBatchApplying && campaignDestinationUrlBatchProgress) {
      const progress = document.createElement('p');
      const current = createdCampaigns.find(item => campaignOperationKey(item) === campaignDestinationUrlBatchProgress.currentCampaignKey);
      progress.className = 'google-ads-audience-batch-progress';
      progress.textContent = current
        ? 'Atualizando ' + (campaignDestinationUrlBatchProgress.processed + 1) + ' de ' + campaignDestinationUrlBatchProgress.total
          + ': ' + current.campaignName + ' · ' + (current.accountName || current.customerId) + '.'
        : campaignDestinationUrlBatchProgress.processed + ' de ' + campaignDestinationUrlBatchProgress.total + ' concluídas.';
      content.append(progress);
    }
    if (campaignDestinationUrlBatchAttempted) {
      const summary = document.createElement('p');
      summary.className = 'google-ads-audience-batch-total';
      summary.textContent = completeCount + '/' + createdCampaigns.length + ' campanhas com URLs confirmadas integralmente · '
        + partialCount + ' parciais · ' + pending.length + ' pendentes'
        + (unsupported.length ? ' · ' + unsupported.length + ' incompatíveis' : '') + '.';
      content.append(summary);
      const results = document.createElement('ul');
      results.className = 'google-ads-audience-batch-list';
      createdCampaigns.forEach(campaign => {
        const row = document.createElement('li');
        const label = document.createElement('strong');
        label.textContent = campaign.campaignName + ' · ' + (campaign.accountName || campaign.customerId);
        const detail = document.createElement('span');
        const isCurrent = campaignDestinationUrlBatchApplying
          && campaignOperationKey(campaign) === campaignDestinationUrlBatchProgress?.currentCampaignKey;
        const result = campaign.destinationUrlResult;
        if (isCurrent) detail.textContent = 'Atualizando agora…';
        else if (campaign.destinationUrlError && result?.signature !== campaignDestinationUrlSignature(campaign)) {
          detail.textContent = 'Falha: ' + campaign.destinationUrlError;
          detail.className = 'is-error';
        } else if (result?.verified && result.signature === campaignDestinationUrlSignature(campaign)) {
          detail.textContent = result.complete
            ? result.adsUpdated + ' anúncio(s), ' + result.criteriaUpdated + ' palavra(s)-chave e ' + result.assetsUpdated + ' asset(s) atualizados; '
              + (result.adsAlreadyCurrent + result.criteriaAlreadyCurrent + result.assetsAlreadyCurrent) + ' já estavam corretos.'
            : 'Confirmação parcial: anúncios ' + result.adsUpdated + ', palavras-chave ' + result.criteriaUpdated + ', assets ' + result.assetsUpdated
              + '; assets compartilhados fora do lote ' + result.assetsSkippedShared + ', no nível da conta ' + result.assetsSkippedAccountLevel
              + '; total de assets de URL da conta não alterados ' + result.accountScopedUrlAssetsNotChanged + '.';
          detail.className = result.complete ? 'is-success' : 'is-warning';
        } else detail.textContent = 'Pendente.';
        row.append(label, detail);
        results.append(row);
      });
      appendCampaignLogDetails(content, results, 'destination-urls');
    }
    renderCampaignNegativeKeywordsBatch(content);
    renderCampaignPositiveKeywordsBatch(content);
    resultArea.append(panel);
  }

  async function applyCampaignDestinationUrlsBatch() {
    if (sharedActionsBlocked()) { setStatus('Conclua a ampliação e reabra o lote atualizado antes de atualizar URLs.', true); return; }
    if (busy || campaignDestinationUrlBatchApplying || !activeCampaignBatchId || !createdCampaigns.length) return;
    const targets = [...page.querySelectorAll('[data-campaign-batch-destination-url-account]')].map(input => {
      const previous = activeCampaignBatchDestinationUrls.find(item => item.accountId === input.dataset.campaignBatchDestinationUrlAccount);
      return {
        accountId: input.dataset.campaignBatchDestinationUrlAccount,
        url: input.value.trim(),
        sourceJobId: previous?.sourceJobId || '',
        sourceProduct: previous?.sourceProduct || '',
        updatedAt: new Date().toISOString(),
      };
    });
    if (!targets.length || targets.some(target => !/^\d{10}$/.test(target.accountId) || !isValidCampaignBatchDestinationUrl(target.url))) {
      setCampaignBatchStatus('Informe uma URL HTTPS válida para cada conta do lote. Nenhuma solicitação foi enviada.', true);
      return;
    }
    if (createdCampaigns.some(campaign => campaign.campaignChannelType !== 'SEARCH' || !['PAUSED', 'ENABLED'].includes(campaign.status))) {
      setCampaignBatchStatus('O lote contém campanha incompatível ou sem status confirmado. Nenhuma URL foi enviada.', true);
      return;
    }
    activeCampaignBatchDestinationUrls = targets;
    const pending = pendingCampaignDestinationUrlUpdates(targets);
    if (!pending.length) return;
    const targetByAccount = new Map(targets.map(target => [target.accountId, target]));
    const activeCount = pending.filter(campaign => campaign.status === 'ENABLED').length;
    const accountDetails = targets.map(target => '• ' + (target.accountName || target.accountId) + ': ' + target.url).join('\n');
    const campaigns = pending.map(campaign => '• ' + campaign.campaignName + ' · ' + (campaign.accountName || campaign.customerId)
      + ' → ' + targetByAccount.get(String(campaign.customerId || '').replace(/\D/g, ''))?.url).join('\n');
    const confirmed = globalThis.confirm('Atualizar os destinos finais de ' + pending.length + ' campanha(s) do lote?\n\n'
      + 'URLs por conta:\n' + accountDetails + '\n\nCampanhas:\n' + campaigns + '\n\n'
      + 'O Hub alterará URLs em anúncios, palavras-chave e assets diretamente vinculados às campanhas, incluindo sitelinks e promoções. Modelos/sufixos de acompanhamento serão preservados e âncoras #1–#6 dos sitelinks mantidas. Assets compartilhados com campanhas fora do lote e assets no nível da conta não serão alterados; o resultado indicará se houver algum. Alterações de URL podem iniciar análise editorial e interromper a veiculação enquanto aguardam revisão.'
      + '\n\nA operação faz leituras e gravações pela cota da Google Ads API.'
      + (activeCount ? '\n\n' + activeCount + ' campanha(s) estão ativas.' : ''));
    if (!confirmed) return;
    if (!saveActiveCampaignBatch()) {
      setCampaignBatchStatus('Não foi possível salvar as URLs no lote. Nenhuma solicitação foi enviada.', true);
      return;
    }
    campaignDestinationUrlBatchApplying = true;
    campaignDestinationUrlBatchAttempted = true;
    campaignDestinationUrlBatchProgress = { processed: 0, total: pending.length, currentCampaignKey: '' };
    busy = true;
    renderCampaignResult();
    updateControlState();
    let processed = 0;
    let storageFailed = false;
    try {
      for (let index = 0; index < pending.length; index += 1) {
        const campaign = pending[index];
        const customerId = String(campaign.customerId || '').replace(/\D/g, '');
        const target = targetByAccount.get(customerId);
        const signature = JSON.stringify([customerId, target.url]);
        const sameAccountCampaignIds = createdCampaigns.filter(item => String(item.customerId || '').replace(/\D/g, '') === customerId)
          .map(item => String(item.campaignId));
        campaignDestinationUrlBatchProgress = { processed: index, total: pending.length, currentCampaignKey: campaignOperationKey(campaign) };
        campaign.destinationUrlError = '';
        setStatus('Atualizando URL ' + (index + 1) + '/' + pending.length + ': ' + campaign.campaignName + '…');
        renderCampaignResult();
        try {
          campaign.destinationUrlResult = await applyGoogleAdsCampaignDestinationUrl({
            managerCustomerId: campaign.managerCustomerId,
            customerId,
            campaignId: campaign.campaignId,
            batchCampaignIds: sameAccountCampaignIds,
            finalUrl: target.url,
            signature,
          });
          campaign.destinationUrlError = '';
        } catch (error) {
          campaign.destinationUrlError = formatRequestFailure(error, 'Não foi possível atualizar os destinos finais.', 'audience');
        }
        processed = index + 1;
        campaignDestinationUrlBatchProgress = { processed, total: pending.length, currentCampaignKey: '' };
        if (!saveActiveCampaignBatch()) { storageFailed = true; break; }
        renderCampaignResult();
      }
      const completeCount = createdCampaigns.filter(campaign => campaign.destinationUrlResult?.verified === true
        && campaign.destinationUrlResult.complete === true
        && campaign.destinationUrlResult.signature === campaignDestinationUrlSignature(campaign)).length;
      const partialCount = createdCampaigns.filter(campaign => campaign.destinationUrlResult?.verified === true
        && campaign.destinationUrlResult.complete !== true
        && campaign.destinationUrlResult.signature === campaignDestinationUrlSignature(campaign)).length;
      const failedCount = createdCampaigns.filter(campaign => campaign.destinationUrlError
        && campaign.destinationUrlResult?.signature !== campaignDestinationUrlSignature(campaign)).length;
      setStatus(storageFailed
        ? 'Atualização interrompida após ' + processed + ' campanha(s), pois o Hub não conseguiu salvar o resultado do lote. Confira as contas antes de continuar.'
        : 'Atualização de URLs concluída: ' + completeCount + ' campanha(s) completas · ' + partialCount + ' parciais · ' + failedCount + ' com falha.',
      storageFailed || partialCount > 0 || failedCount > 0, false, partialCount > 0);
    } finally {
      campaignDestinationUrlBatchApplying = false;
      campaignDestinationUrlBatchProgress = null;
      busy = false;
      saveActiveCampaignBatch();
      renderCampaignResult();
      updateControlState();
    }
  }

  async function applyCampaignSitelinksBatch() {
    if (sharedActionsBlocked()) { setStatus('Conclua a ampliação e reabra o lote atualizado antes de aplicar sitelinks.', true); return; }
    if (busy || campaignSitelinksBatchApplying || !activeCampaignBatchId || !activeCampaignBatchSitelinks.length) return;
    const pending = pendingCampaignSitelinks();
    if (!pending.length) return;
    const accountCount = new Set(pending.map(campaign => campaign.customerId)).size;
    const activeCount = pending.filter(campaign => campaign.status === 'ENABLED').length;
    const names = pending.map(campaign => '• ' + campaign.campaignName + ' · ' + (campaign.accountName || campaign.customerId)).join('\n');
    const linkSummary = activeCampaignBatchSitelinks.map(link => '• #' + link.anchor + ' · ' + link.title).join('\n');
    const confirmed = globalThis.confirm('Aplicar ' + activeCampaignBatchSitelinks.length + ' sitelink(s) em ' + pending.length
      + ' campanha(s), distribuídas em ' + accountCount + ' conta(s)? Para cada campanha, o servidor consulta a URL do anúncio e os sitelinks existentes, grava o que faltar e confirma o resultado. Isso usa leituras e gravações da cota Google Ads. Links iguais ativos não serão duplicados; associações pausadas serão reativadas.'
      + (activeCount ? '\n\n' + activeCount + ' campanha(s) estão ativas; a alteração pode mudar os recursos exibidos nos anúncios.' : '')
      + '\n\nSitelinks:\n' + linkSummary + '\n\nCampanhas:\n' + names);
    if (!confirmed) return;
    if (!saveActiveCampaignBatch()) {
      setStatus('Não foi possível salvar a seleção no lote. Nenhum sitelink foi enviado.', true);
      return;
    }
    campaignSitelinksBatchApplying = true;
    campaignSitelinksBatchAttempted = true;
    campaignSitelinksBatchProgress = { processed: 0, total: pending.length, currentCampaignKey: '' };
    busy = true;
    renderCampaignResult();
    updateControlState();
    let processed = 0;
    let stoppedForStorage = false;
    const signature = campaignSitelinksSignature();
    try {
      for (let index = 0; index < pending.length; index += 1) {
        const campaign = pending[index];
        campaignSitelinksBatchProgress = { processed: index, total: pending.length, currentCampaignKey: campaignOperationKey(campaign) };
        campaign.sitelinksError = '';
        setStatus('Aplicando sitelinks ' + (index + 1) + '/' + pending.length + ': ' + campaign.campaignName + '…');
        renderCampaignResult();
        try {
          campaign.sitelinksResult = await applyGoogleAdsCampaignSitelinks({
            managerCustomerId: campaign.managerCustomerId,
            customerId: campaign.customerId,
            campaignId: campaign.campaignId,
            sitelinks: activeCampaignBatchSitelinks,
            signature,
          });
          campaign.sitelinksError = '';
        } catch (error) {
          campaign.sitelinksError = formatRequestFailure(error, 'Não foi possível aplicar os sitelinks.', 'audience');
        }
        processed = index + 1;
        campaignSitelinksBatchProgress = { processed, total: pending.length, currentCampaignKey: '' };
        if (!saveActiveCampaignBatch()) { stoppedForStorage = true; break; }
        renderCampaignResult();
      }
      const verifiedCount = createdCampaigns.filter(campaign => campaign.sitelinksResult?.verified === true
        && campaign.sitelinksResult.signature === signature).length;
      const failedCount = createdCampaigns.filter(campaign => campaign.sitelinksError
        && campaign.sitelinksResult?.signature !== signature).length;
      setStatus(stoppedForStorage
        ? 'Aplicação interrompida após ' + processed + ' solicitação(ões), porque o Hub não conseguiu salvar o resultado. Confira as campanhas no Google Ads antes de repetir.'
        : 'Sitelinks do lote: ' + verifiedCount + '/' + createdCampaigns.length + ' campanhas confirmadas · '
          + (createdCampaigns.length - verifiedCount) + ' pendentes' + (failedCount ? ' · ' + failedCount + ' com falha' : '') + '.',
      stoppedForStorage || failedCount > 0);
    } finally {
      campaignSitelinksBatchApplying = false;
      campaignSitelinksBatchProgress = null;
      busy = false;
      saveActiveCampaignBatch();
      renderCampaignResult();
      updateControlState();
    }
  }

  function managerMccLabel(managerCustomerId) {
    const customerId = String(managerCustomerId || '').replace(/\D/g, '');
    const manager = (directory?.managers || []).find(item => String(item.customerId || '').replace(/\D/g, '') === customerId);
    const name = String(manager?.name || '').trim();
    return name ? `${name} · ${customerId}` : `MCC ${customerId || 'ID indisponível'}`;
  }

  function audienceExclusionUploadGroups() {
    const groups = new Map();
    createdCampaigns.forEach(campaign => {
      const managerCustomerId = String(campaign.managerCustomerId || '').replace(/\D/g, '');
      const key = /^\d{10}$/.test(managerCustomerId) ? managerCustomerId : ('unknown:' + campaignOperationKey(campaign));
      if (!groups.has(key)) groups.set(key, {
        managerCustomerId,
        campaigns: [],
      });
      const group = groups.get(key);
      group.campaigns.push(campaign);
    });
    return [...groups.entries()].map(([key, group]) => {
      const confirmedCampaigns = group.campaigns.filter(campaign =>
        audienceExclusionsStateForCampaign(campaign).audienceExclusionsResult?.verified === true);
      const pendingCampaigns = group.campaigns.filter(campaign =>
        audienceExclusionsStateForCampaign(campaign).audienceExclusionsResult?.verified !== true);
      const campaignTargets = pendingCampaigns.map(campaign => ({
        customerId: String(campaign.customerId || '').replace(/\D/g, ''),
        campaignId: String(campaign.campaignId || ''),
      }));
      const targetKeys = campaignTargets.map(target => target.customerId + ':' + target.campaignId);
      const configurationReady = /^\d{10}$/.test(group.managerCustomerId)
        && group.campaigns.length <= 100
        && group.campaigns.every(campaign => /^\d{10}$/.test(String(campaign.customerId || '').replace(/\D/g, ''))
          && /^[1-9]\d{0,19}$/.test(String(campaign.campaignId || '')))
        && new Set(group.campaigns.map(campaignOperationKey)).size === group.campaigns.length;
      return {
        ...group,
        key,
        confirmedCampaignCount: confirmedCampaigns.length,
        pendingCampaigns,
        campaignTargets,
        accountCount: new Set(group.campaigns.map(campaign => String(campaign.customerId || '').replace(/\D/g, '')).filter(Boolean)).size,
        configurationReady: configurationReady && campaignTargets.every(target => /^\d{10}$/.test(target.customerId)
          && /^[1-9]\d{0,19}$/.test(target.campaignId)) && new Set(targetKeys).size === targetKeys.length,
        ready: pendingCampaigns.length > 0 && configurationReady
          && campaignTargets.every(target => /^\d{10}$/.test(target.customerId)
            && /^[1-9]\d{0,19}$/.test(target.campaignId))
          && new Set(targetKeys).size === targetKeys.length,
      };
    });
  }

  function renderAudienceExclusionUploadPanel() {
    if (!audienceExclusionWorkbookPanel) return;
    audienceExclusionWorkbookPanel.replaceChildren();
    if (sharedActionsBlocked()) {
      const notice = document.createElement('p');
      notice.textContent = 'Conclua a ampliação do lote para liberar as exclusões.';
      audienceExclusionWorkbookPanel.append(notice);
      return;
    }
    const groups = audienceExclusionUploadGroups();
    const renderRow = ({ group = null } = {}) => {
      const item = document.createElement('div');
      item.className = 'google-ads-audience-exclusion-workbook-item';
      const row = document.createElement('div');
      row.className = 'google-ads-audience-exclusion-export-row';
      const summary = document.createElement('div');
      summary.className = 'google-ads-audience-exclusion-export-details';
      const manager = document.createElement('strong');
      manager.textContent = group ? managerMccLabel(group.managerCustomerId) : 'Sem campanhas disponíveis';
      const count = document.createElement('span');
      count.textContent = group
        ? group.accountCount + ' conta(s) · ' + group.pendingCampaigns.length + ' campanha(s) no arquivo · '
          + (group.pendingCampaigns.length * 13) + ' critérios · ' + group.confirmedCampaignCount + ' campanha(s) já confirmada(s) ignorada(s)'
        : audienceExportUnavailableMessage('IDs reais de campanha');
      summary.append(manager, count);

      const actions = document.createElement('div');
      actions.className = 'google-ads-audience-exclusion-workbook-actions';
      const downloadButton = document.createElement('button');
      downloadButton.type = 'button';
      downloadButton.className = 'btn primary';
      const isExporting = group && audienceExclusionExportingManagerIds.has(group.key);
      downloadButton.textContent = isExporting ? 'Gerando Excel…' : 'Baixar Excel';
      downloadButton.disabled = !group || busy || isExporting || !group.ready || !isTokenReady();
      if (group) downloadButton.addEventListener('click', () => { void downloadAudienceExclusionWorkbook(group); });

      const content = document.createElement('div');
      content.className = 'google-ads-audience-exclusion-workbook-expanded';
      actions.append(createGoogleAdsCampaignBookmarkControl(group?.managerCustomerId), downloadButton);
      row.append(summary, actions);
      item.append(row);

      const help = document.createElement('p');
      help.textContent = 'Baixe um único arquivo por MCC, reunindo campanhas de todas as contas do lote e 13 exclusões no nível Campaign por campanha pendente. Campanhas com todas as 13 exclusões confirmadas pelo Hub são omitidas. Baixar não altera campanhas nem consulta a Google Ads API.';
      content.append(help);
      if (group && group.pendingCampaigns.length > 0 && (!group.configurationReady || !isTokenReady())) {
        const unavailable = document.createElement('p');
        unavailable.className = 'google-ads-audience-exclusion-export-status is-error';
        unavailable.textContent = !isTokenReady()
          ? 'Configure o token compartilhado do Hub para pedir o catálogo de exclusões ao serviço privado.'
          : 'Não foi possível reunir as campanhas deste MCC: confira os IDs da MCC, das contas e das campanhas.';
        content.append(unavailable);
      }
      if (group && group.pendingCampaigns.length === 0) {
        const complete = document.createElement('p');
        complete.className = 'google-ads-audience-exclusion-export-status is-success';
        complete.textContent = 'Todas as campanhas deste MCC já têm as 13 exclusões confirmadas pelo Hub; não há arquivo pendente.';
        content.append(complete);
      }
      const status = group ? audienceExclusionExportStatusByManager.get(group.key) : null;
      if (status?.text) {
        const message = document.createElement('p');
        message.className = 'google-ads-audience-exclusion-export-status' + (status.error ? ' is-error' : ' is-success');
        message.textContent = status.text;
        content.append(message);
      }
      const note = document.createElement('p');
      note.className = 'google-ads-audience-exclusion-export-note';
      note.textContent = 'A configuração atual identifica 9 públicos por ID e 4 por nome. Só campanhas com as 13 exclusões confirmadas pelo Hub são omitidas; alterações manuais feitas diretamente no Google Ads não são detectadas.';
      content.append(note);
      item.append(content);
      return item;
    };

    if (groups.length) {
      groups.forEach(group => audienceExclusionWorkbookPanel.append(renderRow({ group })));
      return;
    }
    audienceExclusionWorkbookPanel.append(renderRow());
  }
  async function downloadAudienceExclusionWorkbook(group) {
    if (sharedActionsBlocked()) { setStatus('Conclua a ampliação e reabra o lote atualizado antes de gerar exclusões.', true); return; }
    if (!group?.ready || !isTokenReady() || busy || audienceExclusionExportingManagerIds.has(group.key)) return;
    audienceExclusionExportingManagerIds.add(group.key);
    audienceExclusionExportStatusByManager.set(group.key, { text: 'Preparando o arquivo para a MCC ' + group.managerCustomerId + '…', error: false });
    renderCampaignResult();
    try {
      const seed = group.pendingCampaigns[0];
      const catalog = await fetchGoogleAdsAudienceExclusionUploadCatalog({
        managerCustomerId: group.managerCustomerId,
        customerId: seed.customerId,
        campaignIds: [seed.campaignId],
      });
      const workbook = buildGoogleAdsAudienceExclusionWorkbook({
        campaigns: group.campaignTargets,
        audiences: catalog.audiences,
      });
      const date = new Date().toISOString().slice(0, 10);
      const batchSuffix = String(activeCampaignBatchId || 'lote').slice(-8).replace(/[^A-Za-z0-9_-]/g, '');
      const anchor = document.createElement('a');
      const url = URL.createObjectURL(new Blob([workbook], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      anchor.href = url;
      anchor.download = 'Exclusoes_Google_Ads_MCC_' + group.managerCustomerId + '_' + date + '_' + batchSuffix + '.xlsx';
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const idCount = catalog.audiences.filter(audience => audience.id).length;
      const nameCount = catalog.audiences.filter(audience => audience.name).length;
      audienceExclusionExportStatusByManager.set(group.key, {
        text: 'Excel baixado: ' + group.pendingCampaigns.length + ' campanha(s) de ' + group.accountCount + ' conta(s), com '
          + (group.pendingCampaigns.length * 13) + ' critérios. ' + group.confirmedCampaignCount
          + ' campanha(s) confirmada(s) pelo Hub foram ignoradas. O catálogo contém ' + idCount
          + ' públicos por ID e ' + nameCount + ' por nome. Nenhuma chamada à Google Ads API foi feita.',
        error: false,
      });
    } catch (error) {
      audienceExclusionExportStatusByManager.set(group.key, {
        text: 'Não foi possível gerar o Excel: ' + String(error?.message || error),
        error: true,
      });
    } finally {
      audienceExclusionExportingManagerIds.delete(group.key);
      renderCampaignResult();
    }
  }

  function audienceTargetingCsvUploadGroups() {
    const groups = new Map();
    createdCampaigns.forEach(campaign => {
      const managerCustomerId = String(campaign.managerCustomerId || '').replace(/\D/g, '');
      const key = managerCustomerId || ('unknown:' + campaignOperationKey(campaign));
      if (!groups.has(key)) groups.set(key, {
        key,
        managerCustomerId,
        campaigns: [],
      });
      groups.get(key).campaigns.push(campaign);
    });
    return [...groups.values()].map(group => {
      const targets = group.campaigns.map(campaign => ({
        customerId: String(campaign.customerId || '').replace(/\D/g, ''),
        campaignId: String(campaign.campaignId || ''),
        adGroupId: String(campaign.adGroupId || ''),
      }));
      const targetKeys = targets.map(target => target.customerId + ':' + target.adGroupId);
      return {
        ...group,
        targets,
        accountCount: new Set(targets.map(target => target.customerId).filter(Boolean)).size,
        rowCount: targets.length * GOOGLE_ADS_CONFIGURED_AUDIENCE_COUNT,
        ready: /^\d{10}$/.test(group.managerCustomerId)
          && targets.length > 0
          && targets.length <= 1000
          && targets.length * GOOGLE_ADS_CONFIGURED_AUDIENCE_COUNT <= 1000000
          && targets.every(target => /^\d{10}$/.test(target.customerId)
            && /^[1-9]\d{0,19}$/.test(target.campaignId)
            && /^[1-9]\d{0,19}$/.test(target.adGroupId))
          && new Set(targetKeys).size === targets.length,
      };
    });
  }

  function renderAudienceTargetingCsvUploadPanel() {
    if (!createdCampaigns.length) return null;
    const panel = document.createElement('div');
    panel.className = 'google-ads-audience-targeting-csv-export';
    audienceTargetingCsvUploadGroups().forEach(group => {
      const row = document.createElement('div');
      row.className = 'google-ads-audience-exclusion-export-row';
      const details = document.createElement('div');
      details.className = 'google-ads-audience-exclusion-export-details';
      const manager = document.createElement('strong');
      manager.textContent = managerMccLabel(group.managerCustomerId);
      const count = document.createElement('span');
      count.textContent = group.accountCount + ' conta(s) · ' + group.targets.length + ' grupo(s) · '
        + GOOGLE_ADS_CONFIGURED_AUDIENCE_COUNT + ' públicos por grupo · '
        + group.rowCount.toLocaleString('pt-BR') + ' linhas';
      details.append(manager, count);

      const button = document.createElement('button');
      button.type = 'button';
      const isExporting = audienceTargetingCsvExportingManagerIds.has(group.key);
      button.className = 'btn primary' + (isExporting ? ' google-ads-audience-targeting-loading-button' : '');
      if (isExporting) {
        const spinner = document.createElement('span');
        spinner.className = 'google-ads-audience-targeting-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = 'Gerando CSV…';
        button.append(spinner, label);
        button.setAttribute('aria-busy', 'true');
      } else {
        button.textContent = 'Baixar CSV';
      }
      button.disabled = busy || isExporting || !group.ready || !isTokenReady();
      button.addEventListener('click', () => { void downloadAudienceTargetingCsv(group); });
      const actions = document.createElement('div');
      actions.className = 'google-ads-audience-exclusion-workbook-actions';
      actions.append(createGoogleAdsCampaignBookmarkControl(group.managerCustomerId), button);
      row.append(details, actions);
      panel.append(row);

      if (group.rowCount > 1000) {
        const previewNote = document.createElement('p');
        previewNote.className = 'google-ads-audience-exclusion-export-note';
        previewNote.textContent = 'A prévia do Google Ads mostra somente as primeiras 1.000 linhas; o restante do arquivo também é enviado para processamento.';
        panel.append(previewNote);
      }
      if (!group.ready || !isTokenReady()) {
        const unavailable = document.createElement('p');
        unavailable.className = 'google-ads-audience-exclusion-export-status is-error';
        unavailable.textContent = !isTokenReady()
          ? 'Configure o token compartilhado do Hub para gerar o CSV no serviço privado.'
          : 'Não foi possível incluir este grupo sem IDs válidos e únicos de MCC, conta, campanha e grupo de anúncios.';
        panel.append(unavailable);
      }
      const status = audienceTargetingCsvExportStatusByManager.get(group.key);
      if (status?.text) {
        const message = document.createElement('p');
        message.className = 'google-ads-audience-exclusion-export-status' + (status.error ? ' is-error' : ' is-success');
        message.textContent = status.text;
        panel.append(message);
      }
    });
    return panel;
  }

  async function downloadAudienceTargetingCsv(group) {
    if (sharedActionsBlocked()) { setStatus('Conclua a ampliação e reabra o lote atualizado antes de gerar a segmentação.', true); return; }
    if (!group?.ready || !isTokenReady() || busy || audienceTargetingCsvExportingManagerIds.has(group.key)) return;
    audienceTargetingCsvExportingManagerIds.add(group.key);
    const totalRows = group.rowCount;
    let latestProgress = { completedGroups: 0, totalGroups: group.targets.length, completedRows: 0, totalRows };
    const progressText = progress => 'CSV em preparação: ' + progress.completedGroups.toLocaleString('pt-BR') + '/'
      + progress.totalGroups.toLocaleString('pt-BR') + ' grupos concluídos · '
      + progress.completedRows.toLocaleString('pt-BR') + '/'
      + progress.totalRows.toLocaleString('pt-BR') + ' linhas.';
    audienceTargetingCsvExportStatusByManager.set(group.key, {
      text: 'Conectando ao serviço privado para a MCC ' + group.managerCustomerId + '… ' + progressText(latestProgress),
      error: false,
    });

    const requestController = new AbortController();
    let timeoutId = null;
    let rejectTimeout;
    const timeoutPromise = new Promise((resolve, reject) => { rejectTimeout = reject; });
    try {
      timeoutId = globalThis.setTimeout(() => {
        const error = new Error('O serviço privado não respondeu em 45 segundos. ' + progressText(latestProgress)
          + ' A geração do CSV é somente leitura e não chama a Google Ads API.');
        error.code = 'audience_targeting_csv_timeout';
        rejectTimeout(error);
        requestController.abort();
      }, 45000);
      renderConfiguredAudienceTargeting();
      const request = fetchGoogleAdsAudienceTargetingUploadCsv({
        managerCustomerId: group.managerCustomerId,
        groups: group.targets,
      }, {
        signal: requestController.signal,
        onProgress(progress) {
          latestProgress = progress;
          audienceTargetingCsvExportStatusByManager.set(group.key, {
            text: 'Gerando CSV para a MCC ' + group.managerCustomerId + '… ' + progressText(progress),
            error: false,
          });
          renderConfiguredAudienceTargeting();
        },
      });
      const result = await Promise.race([request, timeoutPromise]);
      const date = new Date().toISOString().slice(0, 10);
      const batchSuffix = String(activeCampaignBatchId || 'lote').slice(-8).replace(/[^A-Za-z0-9_-]/g, '');
      const anchor = document.createElement('a');
      const url = URL.createObjectURL(new Blob([result.csvContent], { type: 'text/csv;charset=utf-8' }));
      anchor.href = url;
      anchor.download = 'Segmentacao_Google_Ads_MCC_' + group.managerCustomerId + '_' + date + '_' + batchSuffix + '.csv';
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
      audienceTargetingCsvExportStatusByManager.set(group.key, {
        text: 'CSV baixado: ' + result.audienceCount + ' públicos × ' + result.groupCount + ' grupos = '
          + result.rowCount.toLocaleString('pt-BR') + ' linhas. A geração só leu a lista privada; nenhuma chamada à Google Ads API foi feita.',
        error: false,
      });
    } catch (error) {
      audienceTargetingCsvExportStatusByManager.set(group.key, {
        text: error?.code === 'audience_targeting_csv_timeout'
          ? 'Tempo esgotado: o serviço privado não terminou em 45 segundos. ' + progressText(latestProgress)
            + ' Esta geração é somente leitura e não consome cota da Google Ads API; confira a conexão/serviço antes de tentar novamente.'
          : 'Não foi possível gerar o CSV: ' + String(error?.message || error),
        error: true,
      });
    } finally {
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      audienceTargetingCsvExportingManagerIds.delete(group.key);
      renderConfiguredAudienceTargeting();
    }
  }

  function cpaExpansionBlocked() {
    if (!activeCampaignBatchId) return false;
    try { return cpaExpansionBlocksSharedSteps(readCpaExpansion(activeCampaignBatchId)); }
    catch { return true; }
  }

  function sharedActionsBlocked() {
    if (campaignBatchChangedInOtherTab) return true;
    if (cpaExpansionBlocked()) return true;
    if (!activeCampaignBatchId || !createdCampaigns.length) return false;
    try {
      const latest = loadGoogleAdsCampaignBatches().batches.find(batch => batch.id === activeCampaignBatchId);
      return !latest || campaignSetSignature(latest.campaigns) !== campaignSetSignature(createdCampaigns);
    } catch { return true; }
  }

  function pendingDeliveryManualStepsForActivation() {
    if (!campaignDeliverySource?.deliveryId || !activeCampaignBatchId) return [];
    const batch = campaignBatchStore?.batches?.find(item => item.id === activeCampaignBatchId);
    return pendingDeliveryManualSteps(batch, Object.keys(DELIVERY_MANUAL_STEPS));
  }

  function renderDeliverySharedConfirmations() {
    if (!campaignDeliverySource?.deliveryId || !activeCampaignBatchId || !createdCampaigns.length) return;
    const batch = campaignBatchStore.batches.find(item => item.id === activeCampaignBatchId);
    if (!batch) return;
    const panel = document.createElement('section');
    panel.className = 'google-ads-campaign-result-account google-ads-delivery-confirmations';
    const heading = document.createElement('h4'); heading.textContent = 'Confirmações da entrega';
    const help = document.createElement('p');
    help.textContent = 'Segmentação, exclusões e imagens: estes botões apenas registram sua confirmação neste Hub; não aplicam nem verificam alterações no Google Ads. Sitelinks são confirmados automaticamente quando o servidor verifica o envio para todas as campanhas do lote. Ao acrescentar campanhas, confira as etapas para o novo conjunto; o histórico anterior é preservado.';
    panel.append(heading, help);
    const state = sharedStepStatus(batch);
    for (const [step, label] of Object.entries(DELIVERY_MANUAL_STEPS)) {
      const row = document.createElement('p');
      row.classList.toggle('is-confirmed', state[step]);
      row.textContent = label + ': ' + (state[step] ? 'confirmada para todas as campanhas' : 'pendente');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn';
      button.classList.toggle('is-confirmed', state[step]);
      button.textContent = state[step] ? 'Confirmada' : 'Confirmar ' + label.toLocaleLowerCase('pt-BR');
      button.disabled = busy || state[step] || sharedActionsBlocked() || typeof navigator?.locks?.request !== 'function';
      button.addEventListener('click', async () => {
        const signature = campaignSetSignature(createdCampaigns);
        if (!globalThis.confirm('Você concluiu ' + label.toLocaleLowerCase('pt-BR') + ' para todas as ' + createdCampaigns.length + ' campanhas deste lote?')) return;
        try {
          await navigator.locks.request('hub-google-ads-cpa-expansion:' + activeCampaignBatchId, async () => {
            if (sharedActionsBlocked()) throw new Error('O lote mudou ou possui ampliação pendente. Reabra e confira antes de confirmar.');
            campaignBatchStore = confirmGoogleAdsCampaignBatchStep(activeCampaignBatchId, step, signature);
          });
          renderCampaignResult();
        } catch (error) { setCampaignBatchStatus(error.message || 'Não foi possível confirmar a etapa.', true); }
      });
      row.append(' ', button); panel.append(row);
    }
    const sitelinksRow = document.createElement('p');
    sitelinksRow.classList.toggle('is-confirmed', state.sitelinks);
    sitelinksRow.textContent = DELIVERY_SHARED_STEPS.sitelinks + ': ' + (state.sitelinks
      ? 'confirmados pelo servidor em todas as campanhas' : 'pendentes da confirmação do servidor');
    panel.append(sitelinksRow);
    resultArea.append(panel);
  }

  async function resumeCpaExpansion() {
    const batchId = activeCampaignBatchId;
    if (!batchId || busy) return;
    busy = true;
    renderCampaignResult();
    updateControlState();
    try {
      const registrationIssues = [];
      const journal = await runCpaExpansion({
        batchId,
        preparePreviewContexts: prepareGoogleAdsSearchCampaignPreviewContexts,
        preview: (payload, preparedContexts) => {
          const previewContext = preparedContexts?.getContext?.(payload) || '';
          if (!previewContext) throw new Error('O contexto compartilhado da MCC não está disponível. Nenhuma prévia foi consultada.');
          return previewGoogleAdsSearchCampaign({ ...payload, previewContext });
        },
        create: createGoogleAdsSearchCampaign,
        beforeSend: async entry => {
          const jobs = JSON.parse(localStorage.getItem('hub:presell-deploy-jobs:v1') || '[]');
          const currentBatch = loadGoogleAdsCampaignBatches().batches.find(batch => batch.id === batchId);
          const targets = resolveCpaExpansionTargets({ deliveryId: campaignDeliverySource?.deliveryId,
            product: campaignDeliverySource?.productName, jobs, accounts: directory?.accounts || [], legacyJobIds: linkedLegacyPresellJobIds(currentBatch) });
          const target = targets.find(item => item.accountId === entry.payload.customerId);
          if (!target || target.reason || target.finalUrl !== entry.payload.finalUrl
              || target.managerCustomerId !== entry.payload.managerCustomerId || target.currencyCode !== entry.payload.targetCpaCurrency) {
            throw new Error('A página ou a conta mudou após o planejamento. Confira a entrega antes de continuar.');
          }
          const latest = loadGoogleAdsCampaignBatches().batches.find(batch => batch.id === batchId);
          if (!latest) throw new Error('O lote original não está disponível.');
          const plan = planCpaExpansion({ accounts: [target], percents: [entry.percent], campaigns: latest.campaigns, parseCampaignName: parseGoogleAdsCampaignName });
          if (plan.alreadyExists.length) throw new Error('Esta combinação de conta e faixa já está no lote. Confira a ampliação antes de continuar.');
        },
        merge: async (result, entry) => {
          const campaign = { ...result, verified: true, managerCustomerId: entry.payload.managerCustomerId,
            customerId: entry.payload.customerId, accountName: entry.accountName, finalUrl: entry.payload.finalUrl,
            geoTargetingSnapshot: googleAdsCampaignGeoTargetingFromPayload(entry.payload, { source: 'hub_creation', recordedAtUtc: new Date().toISOString() }),
            source: 'created', campaignChannelType: 'SEARCH', audienceGrouped: false, adGroupStatus: result.adGroupStatus || 'ENABLED' };
          campaignBatchStore = appendGoogleAdsCampaignToBatch(batchId, campaign);
          const savedBatch = campaignBatchStore.batches.find(item => item.id === batchId);
          imageUploadConfirmed = savedBatch?.imageUploadConfirmed === true;
          imageUploadConfirmedAccountIds = savedBatch?.imageUploadConfirmedAccountIds || [];
          if (!createdCampaigns.some(item => campaignOperationKey(item) === campaignOperationKey(campaign))) {
            createdCampaigns.push(campaign);
            audienceStateByCampaign.set(campaignOperationKey(campaign), {});
          }
          if (onCampaignCreated) {
            try {
              const registration = await onCampaignCreated(campaign);
              if (registration?.conflicts?.length) registrationIssues.push('Há conflito no vínculo com a base local.');
            } catch { registrationIssues.push('O vínculo com a base local não foi confirmado.'); }
          }
          return true;
        },
        onProgress: ({ entry, phase }) => setStatus((phase === 'preview' ? 'Validando ' : 'Criando pausada ') + entry.payload.campaignName + '…', false, true),
      });
      const pending = journal.entries.filter(entry => entry.state !== 'confirmed' || !entry.integrated);
      cpaExpansionMessage = pending.length
        ? pending.length + ' campanha(s) ainda pendente(s). Uma tentativa sem confirmação exige conferência antes de continuar.'
        : 'Ampliação concluída: as campanhas confirmadas foram acrescentadas ao lote.';
      if (registrationIssues.length) cpaExpansionMessage += ' ' + registrationIssues[0] + ' Use a recuperação de campanhas salvas para conferir o vínculo.';
    } catch (error) { cpaExpansionMessage = error?.message || 'Não foi possível continuar a ampliação.'; }
    finally { busy = false; renderCampaignResult(); updateControlState(); }
  }

  async function recoverCpaExpansion(entryId) {
    if (busy || typeof navigator?.locks?.request !== 'function') return;
    const batchId = activeCampaignBatchId;
    if (!globalThis.confirm('Conferir esta tentativa no Google Ads? A consulta usa cota e não cria nem altera campanhas.')) return;
    busy = true; renderCampaignResult(); updateControlState();
    try {
      await navigator.locks.request('hub-google-ads-cpa-expansion:' + batchId, async () => {
        const entry = readCpaExpansion(batchId)?.entries.find(item => item.id === entryId);
        if (!entry || !['sending', 'uncertain'].includes(entry.state)) throw new Error('A tentativa mudou; atualize o lote antes de conferir.');
        const inspection = await inspectGoogleAdsCampaignGoal(entry.payload);
        if (!inspection.found) throw new Error('Campanha não encontrada nesta consulta. A tentativa continua pendente e não será reenviada automaticamente.');
        const campaign = inspection.result.campaign || {};
        const config = inspection.result.conversionGoalCampaignConfig || {};
        const goal = inspection.result.customConversionGoal || {};
        const action = inspection.actions[0];
        if (campaign.status !== 'PAUSED' || config.goalConfigLevel !== 'CAMPAIGN' || goal.name !== 'meta personalizada da ação compra'
          || goal.status !== 'ENABLED' || inspection.actions.length !== 1 || action?.name !== 'Conversão compra off-line (upload)'
          || action.status !== 'ENABLED' || action.category !== 'PURCHASE' || action.type !== 'UPLOAD_CLICKS'
          || inspection.standard_goals_checked !== true || inspection.standard_goals.some(item => item.biddable)) {
          throw new Error('A campanha encontrada não confirmou todos os requisitos. A tentativa permanece pendente.');
        }
        const matches = await verifyGoogleAdsCampaignsForAssociation({ managerCustomerId: entry.payload.managerCustomerId,
          customerId: entry.payload.customerId, campaigns: [{ campaignId: String(campaign.id), campaignName: entry.payload.campaignName }] });
        const found = matches[0];
        if (matches.length !== 1 || found.status !== 'PAUSED' || found.adGroupCount !== 1 || !found.adGroupId) throw new Error('Não foi possível confirmar o grupo e o estado da campanha.');
        transitionCpaExpansion(batchId, entry.id, 'confirmed', { verified: true, result: {
          campaignId: found.campaignId, campaignName: found.campaignName, status: 'PAUSED', adGroupId: found.adGroupId, adGroupStatus: found.adGroupStatus,
          goalVerification: { checkedAt: new Date().toISOString(), goalName: goal.name, actionName: action.name, noStandardGoals: true },
        } });
      });
      cpaExpansionMessage = 'Campanha conferida. Retome a ampliação para incorporá-la ao lote.';
    } catch (error) { cpaExpansionMessage = error?.message || 'A conferência não foi concluída.'; }
    finally { busy = false; renderCampaignResult(); updateControlState(); }
  }

  function renderCpaExpansionPlanner() {
    cpaExpansionPanel.replaceChildren();
    const restored = campaignBatchRestored && activeCampaignBatchId && createdCampaigns.length;
    cpaExpansionPanel.hidden = !restored;
    cpaVariantsOptions.hidden = Boolean(restored);
    cpaVariantsStatus.hidden = Boolean(restored);
    if (!restored) return;
    const panel = document.createElement('section');
    panel.className = 'google-ads-campaign-result-account google-ads-cpa-expansion';
    const roster = document.createElement('section'); roster.className = 'google-ads-cpa-expansion-roster';
    const rosterTitle = document.createElement('h4'); rosterTitle.textContent = 'Campanhas associadas a este lote (' + createdCampaigns.length + ')';
    const rosterHelp = document.createElement('p'); rosterHelp.textContent = 'A lista acompanha as campanhas já salvas e as que forem integradas após cada ampliação.';
    const rosterList = document.createElement('ul'); rosterList.className = 'google-ads-cpa-expansion-roster-list';
    for (const campaign of createdCampaigns) {
      const item = document.createElement('li');
      const name = document.createElement('strong'); name.textContent = campaign.campaignName || 'Campanha sem nome';
      const detail = document.createElement('span');
      const status = String(campaign.status || 'não informado').toUpperCase();
      const origin = campaign.source === 'existing' ? 'associada ao lote' : campaign.source === 'created' ? 'criada pelo Hub' : 'origem registrada no lote';
      const pauseConfirmation = status === 'PAUSED' && (campaign.verified === true || campaign.source === 'created')
        ? ' · criação pausada confirmada' : status === 'PAUSED' ? ' · status salvo como pausada' : '';
      detail.textContent = 'Conta ' + (campaign.accountName || campaign.customerId) + ' · ID campanha ' + campaign.campaignId
        + (campaign.adGroupId ? ' · ID grupo ' + campaign.adGroupId : '') + ' · status ' + status + pauseConfirmation + ' · ' + origin;
      item.append(name, detail); rosterList.append(item);
    }
    roster.append(rosterTitle, rosterHelp, rosterList);
    const title = document.createElement('h4');
    title.textContent = 'Ampliar este lote';
    const description = document.createElement('p');
    description.textContent = 'Selecione contas com páginas publicadas vinculadas a esta entrega e faixas de CPA. A prévia e a criação usam cota; as novas campanhas nascem pausadas.';
    panel.append(roster, title, description);
    let journal;
    try { journal = readCpaExpansion(activeCampaignBatchId); }
    catch (error) { description.textContent = error.message; cpaExpansionPanel.append(panel); return; }
    if (cpaExpansionMessage) { const note = document.createElement('p'); note.textContent = cpaExpansionMessage; panel.append(note); }
    if (cpaExpansionBlocksSharedSteps(journal)) {
      for (const entry of journal.entries.filter(item => item.state !== 'confirmed' || !item.integrated)) {
        const row = document.createElement('p');
        row.textContent = entry.payload.campaignName + ' · ' + entry.state + (entry.message ? ' · ' + entry.message : '');
        panel.append(row);
        if (['sending', 'uncertain'].includes(entry.state)) {
          const verify = document.createElement('button'); verify.type = 'button'; verify.className = 'btn';
          verify.textContent = 'Conferir tentativa no Google Ads'; verify.disabled = busy;
          verify.addEventListener('click', () => { void recoverCpaExpansion(entry.id); }); panel.append(verify);
        }
      }
      const resume = document.createElement('button'); resume.type = 'button'; resume.className = 'btn primary';
      resume.textContent = 'Retomar ampliação'; resume.disabled = busy || journal.entries.some(entry => ['sending', 'uncertain', 'failed'].includes(entry.state));
      resume.addEventListener('click', () => { void resumeCpaExpansion(); }); panel.append(resume);
      cpaExpansionPanel.append(panel); return;
    }
    let targets;
    try {
      const jobs = JSON.parse(localStorage.getItem('hub:presell-deploy-jobs:v1') || '[]');
      targets = resolveCpaExpansionTargets({ deliveryId: campaignDeliverySource?.deliveryId, product: campaignDeliverySource?.productName,
        jobs, accounts: directory?.accounts || [], legacyJobIds: linkedLegacyPresellJobIds(campaignBatchStore.batches.find(batch => batch.id === activeCampaignBatchId)) });
    } catch (error) { description.textContent = error.message; cpaExpansionPanel.append(panel); return; }
    const accounts = document.createElement('div');
    const percentages = document.createElement('div');
    const output = document.createElement('p');
    const matrix = document.createElement('div');
    accounts.className = 'google-ads-cpa-expansion-accounts';
    accounts.setAttribute('role', 'group'); accounts.setAttribute('aria-label', 'Contas para ampliação');
    percentages.className = 'google-ads-cpa-expansion-percentages';
    percentages.setAttribute('role', 'group'); percentages.setAttribute('aria-label', 'Faixas de CPA para ampliação');
    output.className = 'google-ads-cpa-expansion-summary'; output.setAttribute('role', 'status');
    matrix.className = 'google-ads-cpa-expansion-matrix-wrap';
    const accountsHeading = document.createElement('h5'); accountsHeading.textContent = 'Contas com páginas vinculadas';
    const percentagesHeading = document.createElement('h5'); percentagesHeading.textContent = 'Faixas de CPA';
    const create = document.createElement('button'); create.type = 'button'; create.className = 'btn primary';
    create.textContent = 'Conferir e criar combinações ausentes'; create.disabled = true;
    const update = () => {
      const chosenAccounts = targets.filter(target => accounts.querySelector('input[value="' + target.accountId + '"]')?.checked);
      const chosenPercents = [...percentages.querySelectorAll('input:checked')].map(input => Number(input.value));
      create.disabled = true;
      try {
        const percentOptions = [...percentages.querySelectorAll('input')].map(input => Number(input.value));
        const matrixPlan = targets.some(target => !target.reason && target.finalUrl) && percentOptions.length
          ? planCpaExpansion({ accounts: targets.filter(target => !target.reason && target.finalUrl), percents: percentOptions, campaigns: createdCampaigns, parseCampaignName: parseGoogleAdsCampaignName })
          : { toCreate: [], alreadyExists: [] };
        const plan = chosenAccounts.length && chosenPercents.length
          ? planCpaExpansion({ accounts: chosenAccounts, percents: chosenPercents, campaigns: createdCampaigns, parseCampaignName: parseGoogleAdsCampaignName })
          : { toCreate: [], alreadyExists: [] };
        const selectedPercentSet = new Set(chosenPercents), selectedAccountSet = new Set(chosenAccounts.map(account => account.accountId));
        const existingKeys = new Set(matrixPlan.alreadyExists.map(row => row.account.accountId + ':' + row.percent));
        const table = document.createElement('table'); table.className = 'google-ads-cpa-expansion-matrix';
        const thead = document.createElement('thead'), header = document.createElement('tr'), accountHeader = document.createElement('th');
        accountHeader.scope = 'col'; accountHeader.textContent = 'Conta'; header.append(accountHeader);
        for (const percent of percentOptions) { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = percent + '%'; header.append(cell); }
        thead.append(header); const tbody = document.createElement('tbody');
        for (const target of targets) {
          const row = document.createElement('tr'), accountCell = document.createElement('th'); accountCell.scope = 'row';
          accountCell.textContent = (target.account?.name || target.accountId) + ' · ' + target.accountId + (selectedAccountSet.has(target.accountId) ? ' · selecionada' : ''); row.append(accountCell);
          for (const percent of percentOptions) {
            const key = target.accountId + ':' + percent, exists = selectedAccountSet.has(target.accountId) && existingKeys.has(key), selected = selectedAccountSet.has(target.accountId) && selectedPercentSet.has(percent), cell = document.createElement('td');
            cell.className = exists ? 'is-existing' : selected ? 'is-planned' : '';
            cell.textContent = exists ? 'Já está no lote' : selected ? 'Será criada' : 'Não selecionada'; row.append(cell);
          }
          tbody.append(row);
        }
        table.append(thead, tbody); matrix.replaceChildren(table);
        if (!chosenAccounts.length || !chosenPercents.length) output.textContent = 'Marque contas e faixas para ver o que já existe e o que será criado.';
        else output.textContent = plan.toCreate.length
          ? plan.toCreate.length + ' combinação(ões) nova(s) serão validadas pela Google Ads API antes da criação. Esta matriz compara os registros locais do lote.'
          : 'Todas as combinações selecionadas já existem no lote; nenhuma campanha será criada.';
        create.disabled = busy || sharedActionsBlocked() || !activeCampaignBatchFormRestored || !plan.toCreate.length || typeof navigator?.locks?.request !== 'function';
      } catch (error) { matrix.replaceChildren(); output.textContent = error.message; }
    };
    for (const target of targets) {
      const label = document.createElement('label');
      label.className = 'google-ads-cpa-expansion-choice';
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = target.accountId;
      input.checked = cpaExpansionAccounts.has(target.accountId); input.disabled = busy || Boolean(target.reason) || !target.finalUrl;
      input.addEventListener('change', () => { input.checked ? cpaExpansionAccounts.add(target.accountId) : cpaExpansionAccounts.delete(target.accountId); update(); });
      label.append(input, document.createTextNode(' ' + (target.account?.name || target.accountId) + ' · ' + target.accountId + (target.reason ? ' · ' + target.reason : '') + ' '));
      accounts.append(label);
    }
    for (const percent of (deliveryCpaLevels(deliveryCpaStart).length ? deliveryCpaLevels(deliveryCpaStart) : LEGACY_CPA_VARIANT_OPTIONS)) {
      const label = document.createElement('label');
      label.className = 'google-ads-cpa-expansion-choice';
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = String(percent);
      input.checked = cpaExpansionPercents.has(percent); input.disabled = busy;
      input.addEventListener('change', () => { input.checked ? cpaExpansionPercents.add(percent) : cpaExpansionPercents.delete(percent); update(); });
      label.append(input, document.createTextNode(' ' + percent + '% ')); percentages.append(label);
    }
    create.addEventListener('click', async () => {
      if (busy || create.disabled) return;
      const chosenAccounts = targets.filter(target => cpaExpansionAccounts.has(target.accountId) && !target.reason);
      const chosenPercents = [...cpaExpansionPercents];
      if (!globalThis.confirm(output.textContent + '\n\nO Hub consultará a Google Ads API para validar cada combinação nova antes do envio. Essa validação usa quota. Só serão criadas as combinações ainda ausentes, e as campanhas nascerão pausadas. Continuar?')) return;
      const batchId = activeCampaignBatchId;
      busy = true; renderCampaignResult(); updateControlState();
      try {
        await navigator.locks.request('hub-google-ads-cpa-expansion:' + batchId, async () => {
          if (cpaExpansionBlocksSharedSteps(readCpaExpansion(batchId))) throw new Error('Existe uma ampliação pendente neste lote.');
          const latest = loadGoogleAdsCampaignBatches().batches.find(batch => batch.id === batchId);
          if (!latest) throw new Error('O lote não está disponível.');
          const jobs = JSON.parse(localStorage.getItem('hub:presell-deploy-jobs:v1') || '[]');
          const currentTargets = resolveCpaExpansionTargets({ deliveryId: campaignDeliverySource?.deliveryId,
            product: campaignDeliverySource?.productName, jobs, accounts: directory?.accounts || [], legacyJobIds: linkedLegacyPresellJobIds(latest) });
          if (chosenAccounts.some(target => !currentTargets.some(current => current.accountId === target.accountId && !current.reason
              && current.finalUrl === target.finalUrl && current.managerCustomerId === target.managerCustomerId && current.currencyCode === target.currencyCode))) {
            throw new Error('As páginas ou contas mudaram. Confira novamente antes de criar.');
          }
          const plan = planCpaExpansion({ accounts: chosenAccounts, percents: chosenPercents, campaigns: latest.campaigns, parseCampaignName: parseGoogleAdsCampaignName });
          if (!plan.toCreate.length || latest.campaigns.length + plan.toCreate.length > 100) throw new Error('Não há combinações novas ou o lote excederia 100 campanhas.');
          const source = campaignNameSource();
          const currencies = new Set(chosenAccounts.map(target => target.currencyCode));
          if (currencies.size !== 1 || !currencies.has(source.targetCurrency)) throw new Error('As contas precisam usar a moeda das configurações salvas do lote.');
          const names = [...syncKnownCampaignNames(), ...latest.campaigns.map(campaign => campaign.campaignName)];
          const firstIteration = latestGoogleAdsCampaignIteration({ product: source.product, campaignNames: names, reservations: readGoogleAdsCampaignSequenceReservations() }) + 1;
          const entries = buildCpaExpansionEntries({ plan, basePayload: collectPayload(), source, firstIteration,
            makeName: makeSequencedGoogleAdsCampaignName, calculateCpa: commissionCpaForTargetCurrency });
          await reserveGoogleAdsCampaignSequence(entries.map(entry => ({ product: entry.product, iteration: entry.iteration,
            campaignName: entry.payload.campaignName, customerId: entry.payload.customerId })));
          createCpaExpansion(batchId, entries);
        });
        busy = false;
        await resumeCpaExpansion();
      } catch (error) { cpaExpansionMessage = error.message || 'Não foi possível registrar a ampliação.'; }
      finally { busy = false; renderCampaignResult(); updateControlState(); }
    });
    panel.append(accountsHeading, accounts, percentagesHeading, percentages, matrix, output, create); cpaExpansionPanel.append(panel); update();
  }


  function hasLegacyCampaignCreationHistory(preview) {
    if (!preview) return false;
    if (preview?.creationAuditLegacyHistory === true) return true;
    if (preview?.creationAuditBaseline === true) return false;
    return preview?.creationAuditVersion !== 2 || !preview?.creationAuditStartedAtUtc;
  }

  function campaignCreationAuditForActiveBatch() {
    const hasActiveBatch = Boolean(activeCampaignBatchId);
    const batch = hasActiveBatch ? campaignBatchStore.batches.find(item => item.id === activeCampaignBatchId) || null : null;
    if (batch?.source === 'associated') return { skip: true };
    const savedPreviewId = batch?.previewId || (previewId && batchEntries.length ? previewId : '');
    if (!savedPreviewId) return hasActiveBatch ? { legacy: true } : { skip: true };
    let preview;
    try { preview = loadGoogleAdsCampaignPreview(savedPreviewId); }
    catch (error) { return { error: error.message || 'Não foi possível ler o registro local de tentativas.' }; }
    if (!preview) return { error: 'A prévia vinculada ao lote não está disponível no armazenamento local.' };
    if (hasActiveBatch && preview.batchId !== activeCampaignBatchId) return { error: 'A prévia local não confirma vínculo com este lote.' };
    if (!hasActiveBatch && preview.batchId) return { skip: true };
    const hasAttempt = preview.entries.some(entry => entry.creationAttempts.length > 0);
    if (!hasActiveBatch && preview.creationAuditVersion !== 2 && !hasAttempt) return { skip: true };
    return { batch, preview };
  }

  function renderCampaignCreationAttemptAudit() {
    const source = campaignCreationAuditForActiveBatch();
    if (source.skip) return;
    const panel = document.createElement('section');
    panel.className = 'google-ads-campaign-creation-audit';
    const heading = document.createElement('h4');
    heading.textContent = 'Rastro das tentativas de criação';
    panel.append(heading);
    const note = text => {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      panel.append(paragraph);
    };
    if (source.legacy) {
      note('Este lote não tem uma prévia local vinculada. Os registros salvos não permitem reconstruir o resultado individual das criações.');
      resultArea.append(panel);
      return;
    }
    if (source.error) {
      note(source.error + ' O Hub não consulta a Google Ads API para montar este relatório.');
      resultArea.append(panel);
      return;
    }
    const { preview } = source;
    const audit = summarizeGoogleAdsCampaignCreationAudit({ preview, batchCampaigns: createdCampaigns });
    if (!audit.candidateCount) {
      note('A prévia vinculada não contém campanhas para acompanhar.');
      resultArea.append(panel);
      return;
    }
    const auditWindow = audit.startedAtUtc ? ' · trilha ativa desde ' + localDateLabel(audit.startedAtUtc) : '';
    note(audit.candidateCount + ' campanha(s) na prévia: ' + audit.eligibleCount + ' apta(s) para criação, '
      + audit.existingCount + ' já existente(s). Lista local do lote: ' + audit.inBatchCount + ' consta(m), '
      + audit.missingFromBatchCount + ' não consta(m). Abaixo está o estado por campanha; as tentativas são registradas localmente antes/depois das chamadas, sem consulta à API.' + auditWindow);
    audit.rows.forEach(row => {
      const paragraph = document.createElement('article');
      paragraph.className = 'google-ads-campaign-creation-audit-item';
      const label = document.createElement('strong');
      label.textContent = (row.accountName || 'Conta ' + row.customerId) + ' · ' + row.percent + '% · ' + row.campaignName;
      paragraph.append(label);
      const batchState = document.createElement('p');
      batchState.className = row.inBatch ? 'is-success' : 'is-warning';
      if (row.batchCampaigns.length === 1) {
        const saved = row.batchCampaigns[0];
        batchState.textContent = 'Lista local do lote: consta · ID ' + (saved.campaignId || 'não salvo') + ' · status ' + (saved.status || 'não salvo') + '.';
      } else if (row.batchCampaigns.length > 1) {
        batchState.textContent = 'Lista local do lote: consta em ' + row.batchCampaigns.length + ' registros; confira possível duplicidade local.';
      } else batchState.textContent = 'Lista local do lote: não consta.';
      paragraph.append(batchState);
      const outcome = document.createElement('p');
      const latest = row.lastAttempt;
      const when = attempt => Number.isFinite(Date.parse(attempt.startedAtUtc)) ? ' · ' + localDateLabel(attempt.startedAtUtc) : '';
      if (row.outcome === 'created') {
        const createdAttempt = [...row.attempts].reverse().find(attempt => attempt.state === 'created');
        outcome.className = row.inBatch ? 'is-success' : 'is-warning';
        outcome.textContent = 'Servidor confirmou a criação · ID ' + createdAttempt.campaignId + ' · status ' + createdAttempt.campaignStatus
          + when(createdAttempt) + (row.inBatch ? '.' : ' · não consta no lote salvo; não repita antes de reconciliar o ID.');
      } else if (row.outcome === 'failed') {
        outcome.className = 'is-error';
        outcome.textContent = 'Falha confirmada pelo Hub' + when(latest) + (latest?.errorMessage ? ' · ' + latest.errorMessage : '.');
      } else if (row.outcome === 'uncertain') {
        outcome.className = 'is-warning';
        outcome.textContent = latest?.state === 'in_flight'
          ? 'O Hub gravou que iniciou a solicitação, mas não salvou o desfecho. Consulte Google Ads antes de repetir.' + when(latest)
          : 'Confirmação incerta' + when(latest) + (latest?.errorMessage ? ' · ' + latest.errorMessage : ' · consulte Google Ads antes de repetir.');
      } else if (row.outcome === 'in_batch_without_attempt') {
        outcome.className = 'is-warning';
        outcome.textContent = 'Consta no lote, mas não há tentativa individual na trilha write-ahead; o registro local do lote é a evidência disponível.';
      } else if (row.outcome === 'legacy_unknown') {
        outcome.className = 'is-warning';
        outcome.textContent = 'Histórico anterior/incompleto: não é possível determinar se a solicitação chegou ao Google Ads. Consulte a conta antes de repetir.';
      } else if (row.outcome === 'already_existed') {
        outcome.className = 'is-warning';
        outcome.textContent = 'Já existia na conta quando a prévia foi validada · ID '
          + (row.previewResult?.campaignId || 'não disponível') + ' · status '
          + (row.previewResult?.campaignStatus || 'não disponível') + '. Não foi criada nesta execução.';
      } else if (row.outcome === 'validation_failed') {
        outcome.className = 'is-error';
        outcome.textContent = 'Falha na validação; esta campanha não foi liberada para criação.'
          + (row.previewErrorMessage ? ' · ' + row.previewErrorMessage : '');
      } else if (row.outcome === 'stale') {
        outcome.className = 'is-warning';
        outcome.textContent = 'Prévia desatualizada; a campanha precisa ser revalidada antes de criar.'
          + (row.previewErrorMessage ? ' · ' + row.previewErrorMessage : '');
      } else if (row.outcome === 'not_validated') {
        outcome.className = 'is-warning';
        outcome.textContent = row.previewState === 'previewing'
          ? 'Validação ainda estava em andamento; não foi liberada para criação.'
          : 'A campanha ainda não tinha uma validação aprovada para criação.';
      } else {
        outcome.className = 'is-success';
        outcome.textContent = 'Apta para criação, mas nenhuma tentativa foi iniciada nesta trilha.';
      }
      paragraph.append(outcome);
      const attemptsToShow = audit.auditable ? row.attempts : row.historicalAttempts;
      if (attemptsToShow.length) {
        const details = document.createElement('ul');
        attemptsToShow.forEach(attempt => {
          const item = document.createElement('li');
          const stamp = when(attempt);
          if (attempt.state === 'created') item.textContent = 'Tentativa registrada: criação confirmada · ID ' + attempt.campaignId + ' · ' + attempt.campaignStatus + stamp;
          else if (attempt.state === 'failed') item.textContent = 'Tentativa registrada: falha confirmada' + stamp + (attempt.errorMessage ? ' · ' + attempt.errorMessage : '.');
          else if (attempt.state === 'uncertain') item.textContent = 'Tentativa registrada: confirmação incerta' + stamp + (attempt.errorMessage ? ' · ' + attempt.errorMessage : '.');
          else item.textContent = 'Tentativa registrada: solicitação iniciada, desfecho ainda não salvo' + stamp + '.';
          details.append(item);
        });
        paragraph.append(details);
      }
      if (audit.auditable && row.historicalAttempts.length) {
        const historical = document.createElement('p');
        historical.className = 'is-warning';
        historical.textContent = row.historicalAttempts.length + ' tentativa(s) anterior(es) à trilha write-ahead atual; não usadas para inferir o resultado desta execução.';
        paragraph.append(historical);
      }
      panel.append(paragraph);
    });
    resultArea.append(panel);
  }

  function getUnvalidatedCampaignPlan() {
    if (createdCampaigns.length || batchEntries.length || activeCampaignBatchId || campaignBatchRestored
        || completed || uncertain || !currentIds()) return null;
    try {
      return { entries: buildCampaignBatchEntries(), error: '' };
    } catch (error) {
      return { entries: [], error: error?.message || 'Confira os campos e as contas de destino antes de montar a lista.' };
    }
  }

  function renderUnvalidatedCampaignPlan(plan) {
    resultArea.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'Verificação das campanhas';
    const intro = document.createElement('p');
    intro.className = 'google-ads-campaign-preview-quota-note';
    intro.textContent = 'Lista preparada localmente. Nenhuma consulta à API foi feita.';
    resultArea.append(heading, intro);
    if (plan.error) {
      const message = document.createElement('p');
      message.className = 'is-error';
      message.textContent = 'Não foi possível montar a lista: ' + plan.error + ' Nenhuma consulta à API foi feita.';
      resultArea.append(message);
      resultArea.hidden = false;
      return;
    }

    const entries = plan.entries;
    const summary = document.createElement('p');
    summary.className = 'google-ads-campaign-preview-summary';
    summary.textContent = '0/' + entries.length + ' verificadas · ' + entries.length + ' aguardando validação';
    const quotaNote = document.createElement('p');
    quotaNote.className = 'google-ads-campaign-preview-quota-note';
    quotaNote.textContent = 'Use “Validar” em uma linha para consultar somente aquela campanha. A consulta consome cota e não cria campanhas. “Validar prévia” continua disponível para validar o lote.';
    resultArea.append(summary, quotaNote);

    const groups = new Map();
    entries.forEach((entry, index) => {
      const customerId = String(entry.payload?.customerId || '');
      const groupKey = customerId || 'account:' + String(entry.accountName || 'Conta não identificada');
      if (!groups.has(groupKey)) groups.set(groupKey, { customerId, accountName: entry.accountName || '', entries: [] });
      groups.get(groupKey).entries.push({ entry, index });
    });
    const groupsRoot = document.createElement('div');
    groupsRoot.className = 'google-ads-campaign-result-groups';
    groups.forEach(group => {
      const accountCard = document.createElement('section');
      accountCard.className = 'google-ads-campaign-result-account';
      const accountHeader = document.createElement('div');
      accountHeader.className = 'google-ads-campaign-result-account-header';
      const accountTitle = document.createElement('strong');
      accountTitle.textContent = group.accountName || 'Conta ' + group.customerId;
      const accountMeta = document.createElement('small');
      accountMeta.textContent = [group.customerId ? 'ID ' + group.customerId : '', group.entries.length + ' campanha(s)']
        .filter(Boolean).join(' · ');
      accountHeader.append(accountTitle, accountMeta);
      const list = document.createElement('ul');
      list.className = 'google-ads-cpa-batch-results google-ads-campaign-result-campaigns';
      group.entries.forEach(({ entry, index }) => {
        const item = document.createElement('li');
        const rowHeader = document.createElement('div');
        rowHeader.className = 'google-ads-campaign-result-row-header';
        const label = document.createElement('strong');
        const percentLabel = Number.isFinite(Number(entry.percent)) ? entry.percent + '%' : entry.percent;
        label.textContent = 'Campanha ' + String(index + 1).padStart(2, '0') + ' · ' + percentLabel + ' · ' + entry.payload.campaignName;
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'btn google-ads-preview-row-action google-ads-campaign-preview-action';
        action.textContent = 'Validar';
        action.title = 'Consulta somente esta campanha, consome cota e não cria a campanha.';
        action.setAttribute('aria-label', 'Validar somente a campanha ' + entry.payload.campaignName);
        action.disabled = busy;
        action.addEventListener('click', () => {
          void runCampaignPreview({ entryIdentity: {
            managerCustomerId: entry.payload.managerCustomerId,
            customerId: entry.payload.customerId,
            campaignName: entry.payload.campaignName,
            percent: entry.percent,
          }, triggerButton: action });
        });
        rowHeader.append(label, action);
        const detail = document.createElement('span');
        detail.textContent = 'Ainda não validada. A ação individual consulta apenas esta campanha.';
        item.append(rowHeader, detail);
        list.append(item);
      });
      accountCard.append(accountHeader, list);
      groupsRoot.append(accountCard);
    });
    resultArea.append(groupsRoot);
    resultArea.hidden = false;
  }

  function renderCampaignResult() {
    campaignImageUploadPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    campaignImageUploadPreviewUrls = [];
    renderConfiguredAudienceTargeting();
    renderAudienceExclusionUploadPanel();
    renderCpaExpansionPlanner();
    const unvalidatedPlan = !createdCampaigns.length && !batchEntries.length ? getUnvalidatedCampaignPlan() : null;
    if (unvalidatedPlan) {
      renderUnvalidatedCampaignPlan(unvalidatedPlan);
      return;
    }
    if (!createdCampaigns.length && !batchEntries.length) {
      resultArea.replaceChildren();
      resultArea.hidden = true;
      return;
    }
    resultArea.replaceChildren();
    const heading = document.createElement('h3');
    const isOnlyPreview = batchEntries.length > 0 && batchEntries.every(entry => ['previewed', 'existing', 'preview_failed', 'preview_stale', 'previewing', 'pending'].includes(entry.state));
    heading.textContent = isOnlyPreview ? 'Verificação das campanhas'
      : batchEntries.length > 1 ? 'Resultado da criação em lote'
      : createdCampaigns.length > 1 ? 'Lote de campanhas salvo'
        : 'Resultado da criação';
    resultArea.append(heading);
    if (createdCampaigns.length && activeCampaignBatchFormRestored && activeCampaignBatchFormSnapshot) {
      renderGoogleAdsCampaignCopySummary({ document, container: resultArea, snapshot: activeCampaignBatchFormSnapshot });
    }
    if (sharedActionsBlocked()) {
      const notice = document.createElement('p');
      notice.textContent = 'As etapas compartilhadas estão bloqueadas até a ampliação ser concluída e o lote atualizado ser reaberto.';
      resultArea.append(notice);
      resultArea.hidden = false;
      return;
    }
    if (!createdCampaigns.length && batchEntries.length && (activeDraftId || campaignDeliveryQueryId)) {
      const notice = document.createElement('p');
      notice.textContent = 'Este contexto ainda está em preparação. A validação consulta e aprova os dados, mas não cria nem associa campanhas. Envio de imagens, CSV de segmentação, Excel de exclusões, aplicação de sitelinks/URLs e ativação ou pausa ficam disponíveis depois que a criação ou associação salvar os IDs reais.';
      resultArea.append(notice);
    }
    if (isOnlyPreview) {
      const readyCount = batchEntries.filter(entry => entry.state === 'previewed').length;
      const existingCount = batchEntries.filter(entry => entry.state === 'existing').length;
      const resolvedCount = readyCount + existingCount;
      const failedCount = batchEntries.filter(entry => entry.state === 'preview_failed').length;
      const staleCount = batchEntries.filter(entry => entry.state === 'preview_stale').length;
      const pendingCount = batchEntries.filter(entry => entry.state === 'pending').length;
      const checkingCount = batchEntries.filter(entry => entry.state === 'previewing').length;
      const summary = document.createElement('p');
      summary.className = 'google-ads-campaign-preview-summary';
      summary.textContent = resolvedCount + '/' + batchEntries.length + ' verificadas · ' + readyCount + ' aptas para criação · '
        + existingCount + ' já existentes'
        + (pendingCount ? ' · ' + pendingCount + ' aguardando' : '')
        + (checkingCount ? ' · ' + checkingCount + ' em andamento' : '')
        + (staleCount ? ' · ' + staleCount + ' desatualizadas' : '')
        + (failedCount ? ' · ' + failedCount + ' com falha' : '');
      resultArea.append(summary);
      const quotaNote = document.createElement('p');
      quotaNote.className = 'google-ads-campaign-preview-quota-note';
      quotaNote.textContent = 'Os resultados ficam salvos neste navegador. Validar ou revalidar uma linha faz uma nova consulta ao Google Ads, consome cota e não cria campanhas.';
      resultArea.append(quotaNote);
      const sharedSettings = document.createElement('details');
      sharedSettings.className = 'google-ads-campaign-preview-shared-settings';
      const sharedSummary = document.createElement('summary');
      sharedSummary.textContent = 'Configurações compartilhadas do lote';
      const sharedDetail = document.createElement('p');
      const urlSummary = batchEntries.every(entry => entry.targetSource === 'ficha')
        ? 'Cada conta usa sua URL da Ficha.'
        : 'A conta de referência usa a URL manual do formulário.';
      sharedDetail.textContent = 'Anúncio, palavras-chave, GEOs, redes, promoção e orçamento são iguais ao formulário. '
        + urlSummary + ' O número é único por produto e os níveis de CPA são aplicados a todas as contas.';
      sharedSettings.append(sharedSummary, sharedDetail);
      resultArea.append(sharedSettings);
    }
    if (!batchEntries.length && createdCampaigns.length && createdCampaigns.every(item => item.goalVerification?.noStandardGoals === true && Number.isFinite(Date.parse(item.goalVerification.checkedAt)))) {
      const note = document.createElement('p');
      const checked = createdCampaigns.map(item => item.goalVerification.checkedAt).sort()[0];
      note.textContent = 'Meta da MCC e ação de conversão conferidas nas campanhas deste lote em ' + localDateLabel(checked) + '; nenhuma meta padrão estava ativa para lances nessa conferência.';
      resultArea.append(note);
    }
    renderCampaignImageUploadChecklist();
    if (batchEntries.length) {
      const groups = new Map();
      batchEntries.forEach((entry, index) => {
        const customerId = String(entry.payload?.customerId || '');
        const groupKey = customerId || 'account:' + String(entry.accountName || 'Conta não identificada');
        if (!groups.has(groupKey)) groups.set(groupKey, { customerId, accountName: entry.accountName || '', entries: [] });
        groups.get(groupKey).entries.push({ entry, index });
      });
      const groupsRoot = document.createElement('div');
      groupsRoot.className = 'google-ads-campaign-result-groups';
      groups.forEach(group => {
        const accountCard = document.createElement('section');
        accountCard.className = 'google-ads-campaign-result-account';
        const accountHeader = document.createElement('div');
        accountHeader.className = 'google-ads-campaign-result-account-header';
        const accountTitle = document.createElement('strong');
        accountTitle.textContent = group.accountName || 'Conta ' + group.customerId;
        const accountMeta = document.createElement('small');
        accountMeta.textContent = [group.customerId ? 'ID ' + group.customerId : '', group.entries.length + ' campanha(s)']
          .filter(Boolean).join(' · ');
        accountHeader.append(accountTitle, accountMeta);
        const list = document.createElement('ul');
        list.className = 'google-ads-cpa-batch-results google-ads-campaign-result-campaigns';
        group.entries.forEach(({ entry, index }) => {
          const item = document.createElement('li');
          item.classList.toggle('is-previewing', entry.state === 'previewing');
          const rowHeader = document.createElement('div');
          rowHeader.className = 'google-ads-campaign-result-row-header';
          const label = document.createElement('strong');
          label.textContent = 'Campanha ' + String(index + 1).padStart(2, '0') + ' · ' + entry.percent + '% · ' + entry.payload.campaignName;
          rowHeader.append(label);
          if (['previewed', 'existing', 'preview_failed', 'preview_stale', 'previewing', 'pending'].includes(entry.state)) {
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'btn google-ads-preview-row-action google-ads-campaign-preview-action';
            action.textContent = entry.state === 'previewing' ? 'Validando…'
              : entry.state === 'preview_failed' ? 'Tentar novamente'
                : entry.state === 'preview_stale' || entry.previewResult ? 'Revalidar' : 'Validar';
            action.title = 'Faz uma nova consulta ao Google Ads, consome cota e não cria a campanha.';
            action.setAttribute('aria-label', action.textContent + ' prévia da campanha ' + entry.payload.campaignName);
            action.disabled = busy || entry.state === 'previewing';
            action.addEventListener('click', () => { void runCampaignPreview({ entryIndex: index, triggerButton: action }); });
            rowHeader.append(action);
          }
          const detail = document.createElement('span');
          if (entry.state === 'existing') {
            const result = entry.previewResult;
            const currentCampaign = createdCampaigns.find(campaign => campaign.customerId === entry.payload.customerId
              && campaign.campaignId === String(result.campaign_id || ''));
            const campaignStatus = currentCampaign ? (currentCampaign.status || 'desconhecido') : result.campaign_status;
            const groups = result.ad_group_count === 1 ? 'grupo único ' + result.ad_group_id + ' (' + result.ad_group_status + ')'
              : result.ad_group_count === 0 ? 'nenhum grupo não removido localizado' : 'mais de um grupo não removido';
            const exclusionsReady = campaignStatus === 'PAUSED' && result.campaign_channel_type === 'SEARCH' && !result.audience_grouped;
            const targetingCsvReady = result.campaign_channel_type === 'SEARCH' && result.ad_group_count === 1
              && /^[1-9]\d{0,19}$/.test(String(result.ad_group_id || ''));
            detail.textContent = 'Já existia na conta · ID ' + result.campaign_id + ' · status ' + campaignStatus
              + ' · tipo ' + result.campaign_channel_type + (result.campaign_channel_type === 'SEARCH' ? ' · ' + groups : '')
              + (result.campaign_channel_type === 'SEARCH'
                ? (campaignStatus === 'PAUSED'
                  ? (exclusionsReady ? ' · pré-requisitos de exclusão atendidos' : ' · exclusões incompatíveis com configuração de público')
                  : ' · exclusões exigem campanha pausada')
                  + (targetingCsvReady ? ' · grupo identificado para o CSV de segmentação' : ' · grupo único não identificado para o CSV')
                : ' · sem CSV de públicos para este tipo de campanha');
          }
          else if (entry.state === 'previewed') {
            const result = entry.previewResult;
            const amount = result.target_cpa_micros
              ? formatMoneyMicros(result.target_cpa_micros, result.account_currency)
              : 'CPA não informado';
            const goal = validateHubCampaignConversionGoal(result, { input: entry.payload });
            const geoTarget = validateHubCampaignPositiveGeoTarget(result);
            detail.textContent = 'Apta para criação · validateOnly aprovado · CPA ' + amount
              + ' · orçamento ' + formatMoneyMicros(result.daily_budget_micros, result.account_currency)
              + ' · locais: ' + geoTarget.description + ' (' + geoTarget.positiveGeoTargetType + ')'
              + ' · meta personalizada: ' + goal.customConversionGoalName + ' · ação: ' + goal.conversionActionName
              + ' · ainda não criada';
            detail.classList.add('is-preview-success');
          }
          else if (entry.state === 'created') detail.textContent = 'Criada e confirmada · ID ' + entry.result.campaignId + ' · status ' + (entry.result.status || 'PAUSED')
            + ' · meta ' + entry.result.customConversionGoalName + ' · ação ' + entry.result.conversionActionName;
          else if (entry.state === 'failed') detail.textContent = 'Falha confirmada · ' + entry.errorMessage;
          else if (entry.state === 'uncertain') detail.textContent = entry.goalInspectionMessage || ('Confirmação incerta · consulte a situação antes de repetir. ' + entry.errorMessage);
          else if (entry.state === 'creating') detail.textContent = 'Enviando solicitação…';
          else if (entry.state === 'preview_failed') {
            detail.textContent = 'Prévia não validada · ' + entry.errorMessage
              + (entry.diagnostic?.id ? ' · ' + describeRequestDiagnostic(entry.diagnostic, 'preview') : '');
            detail.classList.add('is-preview-error');
          } else if (entry.state === 'preview_stale') {
            const previous = entry.previewResult?.existing_campaign === true
              ? 'Resultado anterior: campanha existente ID ' + entry.previewResult.campaign_id + ' · ' + entry.previewResult.campaign_status
              : entry.previewResult ? 'Resultado anterior: validateOnly aprovado para ' + entry.previewResult.campaign_name
                + ' · GEO por presença ' + (entry.previewResult.positive_geo_target_type || 'não confirmado')
                : 'Resultado anterior indisponível';
            detail.textContent = previous + ' · desatualizada; não libera criação · ' + (entry.errorMessage || 'Valide novamente.')
              + (entry.diagnostic?.id ? ' · ' + describeRequestDiagnostic(entry.diagnostic, 'preview') : '');
            detail.classList.add('is-preview-error');
          } else if (entry.state === 'previewing') detail.textContent = 'Consulta em andamento. Se a página for atualizada, o último checkpoint será recuperado.';
          else if (entry.state === 'pending') detail.textContent = 'Aguardando validação.';
          else detail.textContent = 'Aguardando tentativa de criação.';
          item.append(rowHeader, detail);
          const inspected = entry.goalInspectionResult;
          const inspectedConfig = inspected?.result?.conversionGoalCampaignConfig;
          const inspectedGoal = inspected?.result?.customConversionGoal;
          const matchingCustomGoal = inspectedConfig?.goalConfigLevel === 'CAMPAIGN' && inspectedGoal?.name === 'meta personalizada da ação compra' && inspectedGoal?.status === 'ENABLED' && inspected.actions?.length === 1 && inspected.actions[0].name === 'Conversão compra off-line (upload)' && inspected.actions[0].status === 'ENABLED' && inspected.actions[0].category === 'PURCHASE' && inspected.actions[0].type === 'UPLOAD_CLICKS' && inspected.standard_goals_checked === true && inspected.standard_goals?.some(goal => goal.biddable === true);
          if (entry.state === 'uncertain' && inspected?.found && inspected.result?.campaign?.status === 'PAUSED' && (inspectedConfig?.goalConfigLevel === 'CUSTOMER' || matchingCustomGoal) && !entry.goalApplicationAttempted) {
            const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'btn'; apply.disabled = busy;
            apply.textContent = matchingCustomGoal ? 'Concluir configuração da meta nesta campanha' : 'Aplicar meta da MCC nesta campanha';
            apply.addEventListener('click', async () => {
              if (busy || entry.goalApplicationAttempted) return;
              const id = String(inspected.result.campaign.id || '');
              if (!globalThis.confirm('Aplicar a meta personalizada da ação compra, com a ação Conversão compra off-line (upload), à campanha ' + entry.payload.campaignName + ' (ID ' + id + ')? As metas padrão de conversão desta campanha deixarão de ser usadas para lances. A campanha permanecerá pausada.')) return;
              entry.goalApplicationAttempted = true; busy = true; renderCampaignResult(); updateControlState();
              try {
                const verified = await applyExistingCampaignCustomGoal({...entry.payload, campaignId: id});
                entry.goalFullyVerified = true; entry.goalVerifiedAt = new Date().toISOString(); entry.goalInspectionNeedsRefresh = false;
                entry.goalInspectionMessage = 'Meta da MCC aplicada e confirmada · campanha ID ' + verified.campaign_id + ' · PAUSADA · meta ' + verified.goal_name + ' · ação ' + verified.conversion_action_name + '.';
              } catch (error) {
                entry.goalInspectionNeedsRefresh = true; entry.goalInspectionResult = null;
                entry.goalInspectionMessage = 'Aplicação não confirmada: ' + (error.message || 'erro desconhecido') + '. A meta pode ter sido alterada parcialmente; consulte novamente antes de qualquer repetição.';
              }
              busy = false; renderCampaignResult(); updateControlState();
              const unresolved = batchEntries.filter(item => item.state === 'uncertain' && item.goalFullyVerified !== true);
              if (unresolved.length === 0) setStatus('Metas e ações confirmadas nas campanhas consultadas; as campanhas permanecem pausadas. A identificação do lote ainda precisa ser consolidada no navegador.', false);
              else setStatus('Configuração da meta: ' + unresolved.length + ' campanha(s) ainda precisam de conferência.', true);
            });
            item.append(apply);
          }
          list.append(item);
        });
        accountCard.append(accountHeader, list);
        groupsRoot.append(accountCard);
      });
      resultArea.append(groupsRoot);
      if (isOnlyPreview && previewHistory?.entries?.length) {
        const history = document.createElement('details');
        history.className = 'google-ads-campaign-preview-history';
        const historySummary = document.createElement('summary');
        historySummary.textContent = 'Última validação salva · ' + localDateLabel(previewHistory.validatedAt)
          + ' · ' + previewHistory.entries.length + ' campanha(s)';
        const historyNote = document.createElement('p');
        historyNote.textContent = 'Registro local da execução anterior. Estes resultados não liberam a criação deste lote e não fazem novas consultas até você validar uma linha.';
        const historyList = document.createElement('ul');
        historyList.className = 'google-ads-campaign-preview-history-list';
        previewHistory.entries.forEach((saved, historyIndex) => {
          const historyItem = document.createElement('li');
          const historyRow = document.createElement('div');
          historyRow.className = 'google-ads-campaign-result-row-header';
          const historyLabel = document.createElement('strong');
          historyLabel.textContent = 'Campanha ' + String(historyIndex + 1).padStart(2, '0') + ' · '
            + (saved.percent || '?') + '% · ' + (saved.accountName || saved.customerId);
          const historyAction = document.createElement('button');
          historyAction.type = 'button';
          historyAction.className = 'btn google-ads-preview-row-action google-ads-campaign-preview-action';
          historyAction.textContent = saved.previewResult ? 'Revalidar' : 'Validar';
          historyAction.title = 'Faz uma nova consulta ao Google Ads, consome cota e não cria a campanha.';
          historyAction.disabled = busy;
          historyAction.addEventListener('click', () => {
            void runCampaignPreview({ entryIdentity: {
              managerCustomerId: saved.managerCustomerId,
              customerId: saved.customerId,
              campaignName: saved.campaignName,
              percent: saved.percent,
            }, triggerButton: historyAction });
          });
          historyRow.append(historyLabel, historyAction);
          const historyDetail = document.createElement('span');
          const result = saved.previewResult;
          if (result?.resultType === 'validated_new') {
            const amount = result.targetCpaMicros ? formatMoneyMicros(result.targetCpaMicros, result.accountCurrency) : 'CPA não informado';
            historyDetail.textContent = 'Aprovada anteriormente · validateOnly · ' + result.campaignName + ' · ' + amount
              + ' · GEO ' + (result.positiveGeoTargetType || 'não confirmado') + ' · não criada';
          } else if (result?.resultType === 'existing') {
            historyDetail.textContent = 'Encontrada anteriormente · ID ' + result.campaignId + ' · ' + result.campaignStatus + ' · ' + result.channelType;
          } else {
            historyDetail.textContent = (saved.state === 'preview_failed' ? 'Falha anterior · ' : '')
              + (saved.errorMessage || 'Sem resultado concluído');
          }
          if (saved.diagnostic?.id) historyDetail.textContent += ' · ' + describeRequestDiagnostic(saved.diagnostic, 'preview');
          historyItem.append(historyRow, historyDetail);
          historyList.append(historyItem);
        });
        history.append(historySummary, historyNote, historyList);
        resultArea.append(history);
      }
    }
    renderCampaignCreationAttemptAudit();
    const failedEntries = batchEntries.filter(entry => entry.state === 'failed');
    if (failedEntries.length) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn primary';
      retry.textContent = 'Tentar novamente somente as ' + failedEntries.length + ' que falharam';
      retry.disabled = busy;
      retry.addEventListener('click', () => { void retryFailedCampaigns(); });
      resultArea.append(retry);
    }
    if (batchEntries.some(entry => entry.state === 'uncertain')) {
      const warning = document.createElement('p');
      const allGoalsVerified = batchEntries.filter(entry => entry.state === 'uncertain').every(entry => entry.goalFullyVerified === true);
      warning.className = allGoalsVerified ? 'is-success' : 'is-error';
      warning.textContent = allGoalsVerified ? 'Meta e ação conferidas nas campanhas consultadas; nenhuma meta padrão está ativa para lances. A identificação do lote ainda precisa ser consolidada no navegador.' : 'Campanhas com confirmação incerta não serão repetidas automaticamente para evitar duplicidade. Confira esses nomes na conta antes de qualquer nova tentativa.';
      resultArea.append(warning);
      if (allGoalsVerified && previewId && activeDraftId && batchEntries.every(entry => entry.state === 'uncertain')) {
        const consolidate = document.createElement('button'); consolidate.type = 'button'; consolidate.className = 'btn primary';
        consolidate.textContent = 'Salvar lote recuperado'; consolidate.disabled = busy;
        consolidate.addEventListener('click', () => { void consolidateVerifiedCampaignBatch(); });
        resultArea.append(consolidate);
      }
      const inspect = document.createElement('button');
      inspect.type = 'button'; inspect.className = 'btn';
      const pending = batchEntries.filter(entry => entry.state === 'uncertain' && (!entry.goalInspectionMessage || entry.goalInspectionNeedsRefresh));
      inspect.textContent = 'Verificar ' + pending.length + ' campanha(s) pendente(s)';
      inspect.disabled = busy || !pending.length;
      inspect.addEventListener('click', async () => {
        if (busy || !pending.length) return;
        busy = true; renderCampaignResult(); updateControlState();
        for (const entry of pending) {
          try {
            const result = await inspectGoogleAdsCampaignGoal(entry.payload);
            if (!result.found) { entry.goalInspectionMessage = 'Campanha não encontrada nesta consulta. Confirmação ainda pendente; não repita a criação sem conferir.'; continue; }
            const campaign = result.result.campaign || {}; const config = result.result.conversionGoalCampaignConfig || {}; const goal = result.result.customConversionGoal || {};
            entry.goalInspectionResult = result; entry.goalInspectionNeedsRefresh = false; entry.goalApplicationAttempted = false;
            const actions = result.actions.map(item => item.name || item.resourceName || 'ação não identificada');
            const activeStandard = result.standard_goals.filter(item => item.biddable);
            const standardVerified = result.standard_goals_checked === true && activeStandard.length === 0;
            const matches = campaign.status === 'PAUSED' && config.goalConfigLevel === 'CAMPAIGN' && goal.name === 'meta personalizada da ação compra' && goal.status === 'ENABLED' && result.actions.length === 1 && result.actions[0].name === 'Conversão compra off-line (upload)' && result.actions[0].status === 'ENABLED' && result.actions[0].category === 'PURCHASE' && result.actions[0].type === 'UPLOAD_CLICKS' && standardVerified;
            entry.goalFullyVerified = matches; entry.goalVerifiedAt = matches ? new Date().toISOString() : '';
            entry.goalInspectionMessage = (matches ? 'Meta e ação correspondem ao esperado. ' : 'Configuração divergente ou não confirmada. ') + 'Encontrada · ID ' + campaign.id + ' · status ' + campaign.status + ' · origem da meta ' + (config.goalConfigLevel || 'não confirmada') + ' · meta ' + (goal.name || 'não identificada') + ' · ação: ' + (actions.join(', ') || 'não identificada') + ' · metas padrão para lances: ' + (result.standard_goals_checked !== true ? 'não confirmadas' : activeStandard.length ? activeStandard.map(item => item.category + '/' + item.origin).join(', ') : 'nenhuma ativa') + '. Nenhuma campanha foi alterada.';
          } catch (error) { entry.goalInspectionMessage = ''; entry.errorMessage = 'Consulta não concluída: ' + (error.message || 'erro desconhecido'); }
          renderCampaignResult();
        }
        busy = false; renderCampaignResult(); updateControlState();
        const unresolved = batchEntries.filter(item => item.state === 'uncertain' && item.goalFullyVerified !== true);
        setStatus(unresolved.length ? 'Conferência concluída com ' + unresolved.length + ' campanha(s) ainda pendente(s). Consulte os detalhes antes de qualquer alteração.' : 'Metas e ações conferidas nas campanhas consultadas; as campanhas permanecem pausadas. A identificação do lote ainda precisa ser consolidada no navegador.', unresolved.length > 0);
      });
      resultArea.append(inspect);
      const diagnostic = document.createElement('button'); diagnostic.type = 'button'; diagnostic.className = 'btn';
      diagnostic.textContent = 'Teste temporário da meta · uma campanha'; diagnostic.disabled = busy;
      diagnostic.addEventListener('click', async () => {
        if (busy) return;
        const entry = batchEntries.find(item => item.state === 'uncertain' && item.goalInspectionMessage?.includes('Encontrada')) || batchEntries.find(item => item.state === 'uncertain' && item.payload?.managerCustomerId && item.payload?.customerId && item.payload?.campaignName);
        if (!entry) { setStatus('Nenhuma campanha pendente possui identificação suficiente para o teste temporário.', true); return; }
        busy = true; renderCampaignResult(); updateControlState();
        setStatus('Teste temporário: validando a aplicação da meta para ' + entry.payload.campaignName + ' sem gravar alterações…');
        try {
          const result = await temporaryValidateCampaignGoal(entry.payload);
          const validId = value => /^\d{1,20}$/.test(String(value || '')) ? String(value) : 'não informado';
          const paths = Array.isArray(result.field_paths) ? result.field_paths.filter(path => typeof path === 'string' && /^[A-Za-z0-9_.]{1,240}$/.test(path)).slice(0, 5) : [];
          const details = ' · MCC ' + validId(result.manager_customer_id) + ' · conta da campanha ' + validId(result.campaign_customer_id) + ' · conta proprietária da meta ' + validId(result.goal_customer_id) + ' · conta usada na referência da meta ' + validId(result.goal_reference_customer_id) + ' · campanha ID ' + validId(result.campaign_id) + ' · campo(s): ' + (paths.join(', ') || 'não informado pelo Google');
          setStatus('Teste temporário sem gravação · ' + entry.payload.campaignName + ': ' + (result.validated ? 'o Google aceitou a validação da aplicação da meta; a meta não foi alterada.' : 'o Google recusou a validação · HTTP ' + result.google_http_status + ' · ' + (result.google_error_codes.join(', ') || 'código específico não informado')) + details + '.', !result.validated);
        } catch (error) { setStatus('Teste temporário sem gravação não concluído: ' + (error.message || 'erro desconhecido'), true); }
        busy = false; renderCampaignResult(); updateControlState();
      });
      resultArea.append(diagnostic);
    }
    renderCampaignSitelinksBatch();
    renderCampaignDestinationUrlBatch();
    if (!createdCampaigns.length) { resultArea.hidden = false; return; }
    renderCampaignDeliverySettingsPanel();
    if (activeCampaignBatchUsesCsvWorkflow()) renderCampaignEuPoliticalDeclarationPanel();
    renderCampaignStatusBatch();
    renderDeliverySharedConfirmations();
    resultArea.hidden = false;
  }

  async function applyAudienceExclusionsBatch() {
    if (sharedActionsBlocked()) { setStatus('Conclua a ampliação e reabra o lote atualizado antes de aplicar exclusões.', true); return; }
    if (createdCampaigns.length < 1 || busy || audienceExclusionsBatchApplying) return;
    saveAudienceStateForCurrentCampaign();
    const pendingCampaigns = pendingAudienceExclusionCampaigns();
    if (!pendingCampaigns.length) return;
    const accountCount = new Set(pendingCampaigns.map(campaign => campaign.customerId)).size;
    const confirmed = globalThis.confirm('Aplicar ' + audienceExclusionLabels.length + ' exclusões em ' + pendingCampaigns.length
      + ' campanha(s), distribuídas em ' + accountCount + ' conta(s)? O Hub fará uma solicitação por campanha em sequência. Campanhas já confirmadas serão puladas; critérios já ativos serão reconhecidos pelo serviço. Todas continuarão pausadas.');
    if (!confirmed) return;

    audienceExclusionsBatchApplying = true;
    audienceExclusionsBatchAttempted = true;
    audienceExclusionsBatchProgress = { processed: 0, total: pendingCampaigns.length, currentCampaignKey: '' };
    busy = true;
    renderCampaignResult();
    updateControlState();
    try {
      for (let index = 0; index < pendingCampaigns.length; index += 1) {
        const campaign = pendingCampaigns[index];
        const key = campaignOperationKey(campaign);
        audienceExclusionsBatchProgress = { processed: index, total: pendingCampaigns.length, currentCampaignKey: key };
        updateAudienceExclusionsState(campaign, { audienceExclusionsError: '' });
        setStatus('Aplicando exclusões ' + (index + 1) + '/' + pendingCampaigns.length + ': ' + campaign.campaignName + '…');
        renderCampaignResult();
        try {
          const result = await applyGoogleAdsAudienceExclusions({
            managerCustomerId: campaign.managerCustomerId,
            customerId: campaign.customerId,
            campaignId: campaign.campaignId,
          });
          updateAudienceExclusionsState(campaign, { audienceExclusionsResult: result, audienceExclusionsError: '' });
        } catch (error) {
          updateAudienceExclusionsState(campaign, {
            audienceExclusionsError: formatRequestFailure(error, 'Não foi possível aplicar as exclusões.', 'audience'),
          });
        }
        audienceExclusionsBatchProgress = { processed: index + 1, total: pendingCampaigns.length, currentCampaignKey: '' };
        saveActiveCampaignBatch();
        renderCampaignResult();
      }

      const eligibleCampaigns = createdCampaigns.filter(campaignSupportsAudienceExclusions);
      const confirmedCount = eligibleCampaigns.filter(campaign => audienceExclusionsStateForCampaign(campaign).audienceExclusionsResult?.verified === true).length;
      const failedCount = eligibleCampaigns.filter(campaign => Boolean(audienceExclusionsStateForCampaign(campaign).audienceExclusionsError)).length;
      const pendingCount = eligibleCampaigns.length - confirmedCount;
      setStatus('Lote de exclusões concluído: ' + confirmedCount + '/' + eligibleCampaigns.length + ' campanhas compatíveis confirmadas · '
        + pendingCount + ' pendentes, incluindo ' + failedCount + ' falha(s) técnica(s).', pendingCount > 0);
    } finally {
      saveAudienceStateForCurrentCampaign();
      saveActiveCampaignBatch();
      audienceExclusionsBatchApplying = false;
      audienceExclusionsBatchProgress = null;
      busy = false;
      renderCampaignResult();
      updateControlState();
    }
  }

  function createDraftId() {
    return globalThis.crypto?.randomUUID?.() || ('draft-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
  }

  function createCampaignBatchId() {
    return 'campaign-batch-' + (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)));
  }

  function createCampaignPreviewId() {
    return 'campaign-preview-' + (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)));
  }

  function createCampaignCreationAttemptId() {
    return 'creation-attempt-' + (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)));
  }

  async function fingerprintCampaignPayloads(payloads) {
    const cryptoProvider = globalThis.crypto;
    if (!cryptoProvider?.subtle?.digest || typeof TextEncoder !== 'function') return '';
    const data = new TextEncoder().encode(JSON.stringify(payloads));
    const digest = await cryptoProvider.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function storedPreviewEntries(entries = batchEntries) {
    return entries.map(entry => {
      const resultState = entry.state === 'previewing' ? entry.previewPreviousState : entry.state;
      const existing = resultState === 'existing' || entry.previewResult?.existing_campaign === true;
      const result = entry.previewResult || {};
      return {
        managerCustomerId: String(entry.payload.managerCustomerId || ''),
        customerId: String(entry.payload.customerId || ''),
        campaignName: String(entry.payload.campaignName || ''),
        accountName: String(entry.accountName || ''),
        percent: String(entry.percent ?? ''),
        payloadFingerprint: String(entry.payloadFingerprint || ''),
        validatedAt: String(entry.resultValidatedAt || ''),
        state: ['pending', 'previewing', 'preview_failed', 'preview_stale'].includes(entry.state) ? entry.state : existing ? 'existing' : 'previewed',
        errorMessage: String(entry.errorMessage || ''),
        diagnostic: entry.diagnostic || null,
        creationAttempts: Array.isArray(entry.creationAttempts) ? entry.creationAttempts : [],
        previewResult: (entry.state === 'previewing' && !entry.previewPreviousState) || ['pending', 'preview_failed'].includes(entry.state) ? null : existing ? {
          resultType: 'existing',
          campaignName: String(result.campaign_name || ''),
          campaignId: String(result.campaign_id || ''),
          campaignStatus: String(result.campaign_status || ''),
          channelType: String(result.campaign_channel_type || ''),
          audienceGrouped: result.audience_grouped === true,
          adGroupId: String(result.ad_group_id || ''),
          adGroupStatus: String(result.ad_group_status || ''),
          adGroupCount: result.ad_group_count,
        } : {
          resultType: 'validated_new',
          campaignName: String(result.campaign_name || ''),
          accountCurrency: String(result.account_currency || ''),
          dailyBudgetMicros: String(result.daily_budget_micros ?? ''),
          targetCpaMicros: String(result.target_cpa_micros ?? ''),
          positiveGeoTargetType: String(result.positive_geo_target_type || ''),
          goalConfigLevel: String(result.goal_config_level || ''),
          customConversionGoalName: String(result.custom_conversion_goal_name || ''),
          conversionActionName: String(result.conversion_action_name || ''),
          conversionActionResourceName: String(result.conversion_action_resource_name || ''),
        },
      };
    });
  }

  function storedPreviewResultToApi(result) {
    if (!result) return null;
    return result.resultType === 'existing' ? {
      existing_campaign: true,
      campaign_name: result.campaignName,
      campaign_id: result.campaignId,
      campaign_status: result.campaignStatus,
      campaign_channel_type: result.channelType,
      audience_grouped: result.audienceGrouped,
      ad_group_id: result.adGroupId,
      ad_group_status: result.adGroupStatus,
      ad_group_count: result.adGroupCount,
    } : {
      existing_campaign: false,
      campaign_name: result.campaignName,
      account_currency: result.accountCurrency,
      daily_budget_micros: result.dailyBudgetMicros,
      target_cpa_micros: result.targetCpaMicros,
      positive_geo_target_type: result.positiveGeoTargetType,
      goal_config_level: result.goalConfigLevel,
      custom_conversion_goal_name: result.customConversionGoalName,
      conversion_action_name: result.conversionActionName,
      conversion_action_resource_name: result.conversionActionResourceName,
    };
  }

  function campaignPreviewGoalMatchesSelection(result, payload, { allowLegacyResourceOmission = false } = {}) {
    try {
      validateHubCampaignConversionGoal(result, { input: payload });
      return true;
    } catch {
      const selectedActionName = String(payload?.conversionActionName || '').trim();
      const selectedActionResourceName = String(payload?.conversionActionResourceName || '').trim();
      return allowLegacyResourceOmission
        && Boolean(selectedActionName && selectedActionResourceName)
        && !String(result?.conversion_action_resource_name || '').trim()
        && result?.goal_config_level === 'CAMPAIGN'
        && String(result?.conversion_action_name || '').trim() === selectedActionName
        && Boolean(String(result?.custom_conversion_goal_name || '').trim());
    }
  }

  function storedPreviewGoalMatchesSelection(result, payload, options) {
    return campaignPreviewGoalMatchesSelection(storedPreviewResultToApi(result), payload, options);
  }

  function savePreviewCheckpoint({ draftSaved = false } = {}) {
    if (!draftSaved || !activeDraftId || !previewFingerprint) return false;
    const validatedAt = new Date().toISOString();
    if (!previewId) previewId = createCampaignPreviewId();
    try {
      let previous = null;
      try { previous = loadGoogleAdsCampaignPreview(previewId); } catch { /* Sem leitura, o histórico não é presumido como completo. */ }
      const legacyHistory = previewCreationAuditLegacyHistory || hasLegacyCampaignCreationHistory(previous);
      const auditablePrevious = previous?.creationAuditVersion === 2 && Boolean(previous.creationAuditStartedAtUtc);
      saveGoogleAdsCampaignPreview({
        id: previewId,
        draftId: activeDraftId,
        validatedAt,
        payloadFingerprint: previewFingerprint,
        batchId: previous?.batchId || '',
        invalidatedAt: '',
        creationAuditVersion: previous?.creationAuditVersion || 0,
        creationAuditStartedAtUtc: previous?.creationAuditStartedAtUtc || '',
        creationAuditBaseline: previous ? previous.creationAuditBaseline || auditablePrevious : !legacyHistory,
        creationAuditLegacyHistory: legacyHistory,
        quotaUsage: lastPreviewQuotaUsage,
        entries: storedPreviewEntries(),
      });
      previewCreationAuditLegacyHistory = legacyHistory;
      previewValidatedAt = validatedAt;
      campaignPreviewStorageError = '';
      return true;
    } catch (error) {
      campaignPreviewStorageError = error.message || 'Não foi possível salvar o progresso da prévia neste navegador.';
      return false;
    }
  }

  async function restoreSavedPreview(draftId) {
    if (!draftId || activeDraftId !== draftId || completed || uncertain || busy) return false;
    if (previewHistory?.draftId && previewHistory.draftId !== draftId) previewHistory = null;
    let previews;
    try { previews = listGoogleAdsCampaignPreviews({ draftId }); }
    catch (error) {
      setStatus(error.message || 'Não foi possível ler a prévia salva neste navegador.', true);
      return false;
    }
    const mostRecentPreview = previews.find(preview => !preview.batchId) || previews[0] || null;
    lastPreviewQuotaUsage = mostRecentPreview?.quotaUsage || null;
    updateCpaVariantSelectionCount();
    const unresolvedAttempts = previews.filter(preview => preview.batchId && !campaignBatchStore.batches.some(batch => batch.id === preview.batchId));
    if (unresolvedAttempts.length) {
      if (unresolvedAttempts.length !== 1) {
        uncertain = true; completed = true; updateControlState();
        setStatus('Há mais de uma tentativa vinculada a esta preparação. Confira os lotes existentes antes de repetir qualquer criação.', true);
        return false;
      }
      const attempt = unresolvedAttempts[0];
      previewCreationAuditLegacyHistory = hasLegacyCampaignCreationHistory(attempt);
      batchEntries = attempt.entries.map(saved => ({
        payload: { managerCustomerId: saved.managerCustomerId, customerId: saved.customerId, campaignName: saved.campaignName },
        accountName: saved.accountName, percent: saved.percent, state: 'uncertain', result: null,
        errorMessage: 'A prévia estava vinculada a uma tentativa de criação; consulte o Google Ads para confirmar a situação.', diagnostic: null,
        creationAttempts: saved.creationAttempts || [],
      }));
      batchEntriesDraftId = draftId;
      previewId = attempt.id; uncertain = true; completed = true; previewSnapshot = '';
      renderCampaignResult(); updateControlState();
      setStatus('Tentativa recuperada do navegador. As campanhas precisam ser conferidas antes de qualquer nova criação.', true);
      return true;
    }
    let entries;
    try { entries = buildCampaignBatchEntries(); }
    catch (error) {
      const latest = previews.find(preview => !preview.batchId) || null;
      if (latest) {
        previewCreationAuditLegacyHistory = hasLegacyCampaignCreationHistory(latest);
        previewHistory = latest;
        previewId = '';
        previewFingerprint = '';
        previewValidatedAt = latest.validatedAt;
        batchEntries = [];
        batchEntriesDraftId = draftId;
        renderBatchPreview();
        setStatus('Histórico de validação recuperado do navegador · ' + latest.entries.length + ' campanha(s) · a preparação atual ainda não permite reconstruir o lote. ' + (error?.message || 'Confira os campos e destinos.') + ' Nenhuma consulta à API foi feita.', true, false, true);
        return true;
      }
      setStatus('Os destinos ou campos da análise ainda não permitem recuperar uma prévia salva. Confira os dados e valide novamente.', false, false, true);
      return false;
    }
    const entriesSnapshot = JSON.stringify(entries.map(entry => entry.payload));
    let currentFingerprint = '';
    try { currentFingerprint = await fingerprintCampaignPayloads(entries.map(entry => entry.payload)); }
    catch { currentFingerprint = ''; }
    if (activeDraftId !== draftId || completed || uncertain || busy) return false;
    let currentEntries;
    try { currentEntries = buildCampaignBatchEntries(); }
    catch { currentEntries = []; }
    if (JSON.stringify(currentEntries.map(entry => entry.payload)) !== entriesSnapshot) return false;
    let currentEntryFingerprints = [];
    try { currentEntryFingerprints = await Promise.all(currentEntries.map(entry => fingerprintCampaignPayloads([entry.payload]))); }
    catch { currentEntryFingerprints = []; }
    if (activeDraftId !== draftId || completed || uncertain || busy) return false;
    const reusable = currentFingerprint ? previews.find(preview => {
      if (preview.batchId || !preview.payloadFingerprint || preview.payloadFingerprint !== currentFingerprint
          || preview.entries.length !== currentEntries.length) return false;
      return preview.entries.every((saved, index) => saved.managerCustomerId === currentEntries[index]?.payload.managerCustomerId
        && saved.customerId === currentEntries[index]?.payload.customerId
        && saved.campaignName === currentEntries[index]?.payload.campaignName
        && saved.percent === String(currentEntries[index]?.percent ?? '')
        && (!['previewed', 'existing'].includes(saved.state)
          || saved.previewResult?.resultType !== 'validated_new'
          || storedPreviewGoalMatchesSelection(saved.previewResult, currentEntries[index]?.payload, { allowLegacyResourceOmission: true })));
    }) : null;
    const latest = previews.find(preview => !preview.batchId) || null;
    if (!reusable) {
      if (!latest) return false;
      previewCreationAuditLegacyHistory = hasLegacyCampaignCreationHistory(latest);
      previewHistory = latest;
      batchEntries = currentEntries.map((entry, index) => {
        const saved = latest.entries.find(item => item.managerCustomerId === entry.payload.managerCustomerId
          && item.customerId === entry.payload.customerId
          && item.campaignName === entry.payload.campaignName
          && item.percent === String(entry.percent ?? '')) || null;
        const savedResult = saved?.previewResult || null;
        const exactEntry = Boolean(saved && currentEntryFingerprints[index]
          && saved.payloadFingerprint === currentEntryFingerprints[index]);
        const restoredState = exactEntry
          ? saved.state === 'previewing'
            ? (savedResult?.resultType === 'existing' ? 'existing' : savedResult ? 'previewed' : 'preview_failed')
            : saved.state === 'preview_stale'
              ? (savedResult?.resultType === 'existing' ? 'existing' : 'previewed')
              : saved.state
          : savedResult ? 'preview_stale' : 'pending';
        return {
          ...entry,
          payloadFingerprint: saved?.payloadFingerprint || (!savedResult ? currentEntryFingerprints[index] || '' : ''),
          currentPayloadFingerprint: currentEntryFingerprints[index] || '',
          state: restoredState,
          previewResult: storedPreviewResultToApi(savedResult),
          previewPreviousState: '',
          result: null,
          errorMessage: exactEntry
            ? saved.state === 'previewing'
              ? savedResult
                ? 'A atualização foi interrompida; o resultado anterior foi mantido. Revalide esta campanha apenas se quiser atualizar os dados.'
                : 'A página foi atualizada durante esta consulta. Tente novamente apenas esta campanha.'
              : saved.errorMessage
            : savedResult
              ? 'Resultado salvo em ' + localDateLabel(saved.validatedAt || latest.validatedAt) + '. Os dados da campanha mudaram; este resultado é apenas histórico e não libera criação.'
              : saved?.errorMessage || '',
          diagnostic: saved?.diagnostic || null,
          creationAttempts: saved?.creationAttempts || [],
          resultValidatedAt: saved?.validatedAt || latest.validatedAt,
        };
      });
      batchEntriesDraftId = draftId;
      previewSnapshot = '';
      previewFingerprint = currentFingerprint;
      previewId = createCampaignPreviewId();
      previewValidatedAt = latest.validatedAt;
      const rebasedLocally = currentFingerprint ? savePreviewCheckpoint({ draftSaved: true }) : false;
      syncPreviewExistingCampaignTargets();
      renderBatchPreview();
      const reusableCount = batchEntries.filter(entry => ['previewed', 'existing'].includes(entry.state)).length;
      const staleCount = batchEntries.filter(entry => entry.state === 'preview_stale').length;
      setStatus('Última prévia recuperada do navegador · ' + reusableCount + ' resultado(s) ainda correspondem exatamente e foram reaproveitados sem nova chamada · ' + staleCount + ' resultado(s) desatualizado(s) · nenhuma consulta foi feita.'
        + (rebasedLocally ? ' O estado atual foi salvo como checkpoint local, preservando a versão anterior no histórico.' : ' O checkpoint atual não pôde ser salvo; os resultados antigos continuam preservados.')
        + ' Revalide apenas as campanhas alteradas.', staleCount > 0 || !rebasedLocally, false, !rebasedLocally);
      renderCampaignResult();
      return true;
    }
    if (reusable.invalidatedAt) {
      try {
        saveGoogleAdsCampaignPreview({ ...reusable, invalidatedAt: '' });
      } catch (error) {
        setStatus(error.message || 'Não foi possível reativar a prévia correspondente salva neste navegador.', true);
        return false;
      }
    }
    previewCreationAuditLegacyHistory = hasLegacyCampaignCreationHistory(reusable);
    batchEntries = currentEntries.map((entry, index) => {
      const saved = reusable.entries[index];
      const interrupted = saved.state === 'previewing';
      const restoredState = interrupted
        ? (saved.previewResult?.resultType === 'existing' ? 'existing' : saved.previewResult ? 'previewed' : 'preview_failed')
        : saved.state;
      return {
        ...entry,
        payloadFingerprint: saved.payloadFingerprint || currentEntryFingerprints[index] || '',
        state: restoredState,
        previewResult: saved.previewResult?.resultType === 'existing' ? {
          campaign_name: saved.previewResult.campaignName,
          campaign_id: saved.previewResult.campaignId,
          campaign_status: saved.previewResult.campaignStatus,
          campaign_channel_type: saved.previewResult.channelType,
          audience_grouped: saved.previewResult.audienceGrouped,
          ad_group_id: saved.previewResult.adGroupId,
          ad_group_status: saved.previewResult.adGroupStatus,
          ad_group_count: saved.previewResult.adGroupCount,
        } : saved.previewResult?.resultType === 'validated_new' ? {
          campaign_name: saved.previewResult.campaignName,
          account_currency: saved.previewResult.accountCurrency,
          daily_budget_micros: saved.previewResult.dailyBudgetMicros,
          target_cpa_micros: saved.previewResult.targetCpaMicros,
          positive_geo_target_type: saved.previewResult.positiveGeoTargetType,
          goal_config_level: saved.previewResult.goalConfigLevel,
          custom_conversion_goal_name: saved.previewResult.customConversionGoalName,
          conversion_action_name: saved.previewResult.conversionActionName,
          conversion_action_resource_name: saved.previewResult.conversionActionResourceName,
        } : null,
        previewPreviousState: '',
        result: null,
        errorMessage: interrupted
          ? saved.previewResult
            ? 'A atualização foi interrompida; o resultado anterior foi mantido. Revalide esta campanha apenas se quiser atualizar os dados.'
            : 'A página foi atualizada durante esta consulta. Tente novamente apenas esta campanha.'
          : saved.errorMessage,
        diagnostic: saved.diagnostic || null,
        creationAttempts: saved.creationAttempts || [],
        resultValidatedAt: saved.validatedAt || reusable.validatedAt,
      };
    });
    batchEntriesDraftId = draftId;
    previewHistory = null;
    syncPreviewExistingCampaignTargets();
    previewId = reusable.id;
    previewFingerprint = reusable.payloadFingerprint;
    previewValidatedAt = reusable.validatedAt;
    renderBatchPreview();
    const pendingCount = batchEntries.filter(entry => entry.state === 'pending').length;
    const failedCount = batchEntries.filter(entry => entry.state === 'preview_failed').length;
    const completedCount = batchEntries.length - pendingCount - failedCount;
    setStatus('Progresso recuperado do navegador · ' + completedCount + ' de ' + batchEntries.length + ' resultados salvos · ' + pendingCount + ' aguardando · ' + failedCount + ' para tentar novamente. Nenhuma chamada nova foi feita. A recuperação exige estes mesmos campos, contas e sequência; o servidor revalida antes de criar ou alterar públicos.', false);
    renderCampaignResult();
    return true;
  }

  function localDateLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'data desconhecida';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
  }

  function isPresellPreparationDraft(draft) {
    return Boolean(validateGoogleAdsPresellCampaignHandoff(draft?.values?.__hub_presell_campaign_handoff));
  }

  function campaignDeliverySourceForDraft(draft) {
    const source = draft?.values?.__hub_campaign_delivery_source;
    return String(source?.deliveryId || '').trim() ? source : null;
  }

  function campaignDeliverySourceForBatch(batch) {
    const source = batch?.formSnapshot?.__hub_campaign_delivery_source;
    return String(source?.deliveryId || '').trim() ? source : null;
  }

  function labelForDraft(draft) {
    const handoff = validateGoogleAdsPresellCampaignHandoff(draft?.values?.__hub_presell_campaign_handoff);
    const deliverySource = campaignDeliverySourceForDraft(draft);
    if (handoff || deliverySource) {
      const product = String(deliverySource?.productName || handoff?.product || draft.values?.source_product || '').trim() || 'Produto';
      const platform = deliverySource ? ' (' + keywordSourcePlatform(deliverySource) + ')' : '';
      const targetCount = Array.isArray(handoff?.targets) ? handoff.targets.length : 0;
      return product + platform + (targetCount ? ' · ' + targetCount + ' conta(s)' : '');
    }
    const name = String(draft.values?.campaign_name || '').trim();
    return name || ('Análise · ' + localDateLabel(draft.createdAt));
  }

  function newestDraft(drafts = draftStore.drafts) {
    return [...drafts].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] || null;
  }

  function newestCampaignBatch(batches = campaignBatchStore.batches) {
    return [...batches].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] || null;
  }

  function rememberCampaignCreationContext(type, id = '') {
    try {
      savedActiveCampaignContext = saveGoogleAdsCampaignActiveContext({ type, ...(id ? { id } : {}) });
      activeCampaignContextStorageError = '';
      return true;
    } catch (error) {
      activeCampaignContextStorageError = error.message || 'Não foi possível salvar o último contexto de campanha.';
      return false;
    }
  }

  function renderDraftPickerMenu() {
    if (!draftPickerMenu || !draftPickerTrigger) return;
    draftPickerMenu.replaceChildren();
    draftPickerTrigger.textContent = draftPicker.selectedOptions[0]?.textContent || 'Selecione uma preparação ou lote';
    draftPickerTrigger.title = draftPickerTrigger.textContent;
    draftPickerTrigger.setAttribute('aria-label', 'Contexto aberto: ' + draftPickerTrigger.textContent);
    draftPickerTrigger.disabled = busy;
    draftPickerTrigger.setAttribute('aria-expanded', String(draftPickerMenuOpen && !busy));
    draftPickerCard?.classList.toggle('is-draft-picker-open', draftPickerMenuOpen && !busy);

    [...draftPicker.children].forEach(groupOption => {
      if (groupOption.tagName !== 'OPTGROUP') return;
      const group = document.createElement('div');
      group.className = 'google-ads-creation-draft-option-group';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', groupOption.label);
      const heading = document.createElement('div');
      heading.className = 'google-ads-creation-draft-option-heading';
      heading.textContent = groupOption.label;
      group.append(heading);

      [...groupOption.children].forEach(option => {
        const row = document.createElement('div');
        row.className = 'google-ads-creation-draft-option-row';
        const selectOption = document.createElement('button');
        selectOption.type = 'button';
        selectOption.className = 'google-ads-creation-draft-option';
        selectOption.setAttribute('role', 'option');
        selectOption.setAttribute('aria-selected', String(option.value === draftPicker.value));
        selectOption.dataset.googleAdsDraftOption = option.value;
        selectOption.disabled = busy;
        selectOption.textContent = option.textContent;
        row.append(selectOption);

        const draftId = option.value.startsWith('draft:') && option.value !== 'draft:__new__'
          ? option.value.slice('draft:'.length) : '';
        const draft = draftId && draftStore.drafts.find(item => item.id === draftId);
        if (draft) {
          const removeOption = document.createElement('button');
          removeOption.type = 'button';
          removeOption.className = 'google-ads-creation-draft-option-delete';
          removeOption.dataset.googleAdsDeleteDraftId = draft.id;
          const deleteLabel = (campaignDeliverySourceForDraft(draft) ? 'lote em preparação ' : isPresellPreparationDraft(draft) ? 'entrega em preparação ' : 'rascunho ') + labelForDraft(draft);
          removeOption.setAttribute('aria-label', 'Excluir ' + deleteLabel);
          removeOption.title = 'Excluir ' + deleteLabel;
          removeOption.disabled = busy;
          removeOption.textContent = '×';
          row.append(removeOption);
        }
        group.append(row);
      });
      draftPickerMenu.append(group);
    });

    draftPickerMenu.hidden = busy || !draftPickerMenuOpen;
  }

  function openDraftPickerMenu({ focusSelected = false } = {}) {
    if (busy || !draftPickerMenu || !draftPickerTrigger) return;
    draftPickerMenuOpen = true;
    renderDraftPickerMenu();
    if (focusSelected) {
      (draftPickerMenu.querySelector('[aria-selected="true"]')
        || draftPickerMenu.querySelector('[role="option"]'))?.focus();
    }
  }

  function closeDraftPickerMenu({ restoreFocus = false } = {}) {
    draftPickerMenuOpen = false;
    if (draftPickerMenu) draftPickerMenu.hidden = true;
    draftPickerTrigger?.setAttribute('aria-expanded', 'false');
    draftPickerCard?.classList.remove('is-draft-picker-open');
    if (restoreFocus) draftPickerTrigger?.focus();
  }

  function refreshDraftPicker() {
    if (!draftPicker) return;
    draftPicker.replaceChildren();
    const drafts = [...draftStore.drafts].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    const batches = [...campaignBatchStore.batches]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    const batchesByDraftId = new Map();
    batches.forEach(batch => {
      if (!batch.draftId) return;
      const linked = batchesByDraftId.get(batch.draftId) || [];
      linked.push(batch);
      batchesByDraftId.set(batch.draftId, linked);
    });
    const linkedDraftIds = new Set(batchesByDraftId.keys());
    const linkedDeliveryIds = new Set(batches.map(batch => campaignDeliverySourceForBatch(batch)?.deliveryId).filter(Boolean));
    const deliveryDrafts = drafts.filter(draft => {
      const source = campaignDeliverySourceForDraft(draft);
      return source && !linkedDraftIds.has(draft.id) && !linkedDeliveryIds.has(source.deliveryId);
    });
    const nonDeliveryDrafts = drafts.filter(draft => !campaignDeliverySourceForDraft(draft));
    const preparationDrafts = nonDeliveryDrafts.filter(isPresellPreparationDraft);
    const analysisDrafts = nonDeliveryDrafts.filter(draft => !isPresellPreparationDraft(draft));
    const preparationGroup = document.createElement('optgroup');
    preparationGroup.label = 'Preparações da Pre-Sell salvas';
    if (!activeDraftId) {
      const current = document.createElement('option');
      current.value = 'draft:__new__';
      current.textContent = 'Nova campanha · ainda não salva';
      preparationGroup.append(current);
    }
    preparationDrafts.forEach(draft => {
      const option = document.createElement('option');
      option.value = 'draft:' + draft.id;
      const linkedBatchCount = batchesByDraftId.get(draft.id)?.length || 0;
      const batchState = linkedBatchCount > 1 ? ' · vários lotes associados'
        : linkedBatchCount === 1 ? ' · lote associado' : ' · aguardando criação';
      option.textContent = labelForDraft(draft) + batchState
        + (draft.id === activeDraftId && !activeCampaignBatchId ? ' · selecionada' : '');
      preparationGroup.append(option);
    });
    if (preparationGroup.children.length) draftPicker.append(preparationGroup);
    if (deliveryDrafts.length) {
      const deliveryLotsGroup = document.createElement('optgroup');
      deliveryLotsGroup.label = 'Lotes em preparação · campanhas ainda não criadas';
      deliveryDrafts.forEach(draft => {
        const option = document.createElement('option');
        option.value = 'draft:' + draft.id;
        option.textContent = labelForDraft(draft) + ' · aguardando criação'
          + (draft.id === activeDraftId && !activeCampaignBatchId ? ' · selecionado' : '');
        deliveryLotsGroup.append(option);
      });
      draftPicker.append(deliveryLotsGroup);
    }
    if (analysisDrafts.length) {
      const draftsGroup = document.createElement('optgroup');
      draftsGroup.label = 'Análises salvas · formulários';
      analysisDrafts.forEach(draft => {
        const option = document.createElement('option');
        option.value = 'draft:' + draft.id;
        option.textContent = 'Análise · ' + labelForDraft(draft)
          + (draft.id === activeDraftId && !activeCampaignBatchId ? ' · selecionada' : '');
        draftsGroup.append(option);
      });
      draftPicker.append(draftsGroup);
    }
    if (batches.length) {
      const batchesGroup = document.createElement('optgroup');
      batchesGroup.label = 'Lotes · campanhas já criadas ou associadas';
      batches.forEach(batch => {
        const option = document.createElement('option');
        option.value = 'batch:' + batch.id;
        option.textContent = 'Lote · ' + labelForCampaignBatch(batch)
          + (batch.id === activeCampaignBatchId ? ' · selecionado' : '');
        batchesGroup.append(option);
      });
      draftPicker.append(batchesGroup);
    }
    draftPicker.value = activeCampaignBatchId
      ? 'batch:' + activeCampaignBatchId
      : activeDraftId ? 'draft:' + activeDraftId : 'draft:__new__';
    draftPicker.disabled = busy;
    renderDraftPickerMenu();
  }

  function setCampaignBatchStatus(message, isError = false) {
    campaignBatchStatus.textContent = message;
    campaignBatchStatus.classList.toggle('is-error', isError);
    campaignBatchStatus.classList.toggle('is-success', !isError && Boolean(message));
  }

  function savedHubCampaignsForRecovery() {
    const campaigns = new Map();
    for (const batch of campaignBatchStore.batches || []) {
      for (const campaign of batch.campaigns || []) {
        const manager = String(campaign.managerCustomerId || '').replace(/\D/g, '');
        const account = String(campaign.customerId || '').replace(/\D/g, '');
        const id = String(campaign.campaignId || '');
        if (campaign.source !== 'created' || !['PAUSED', 'ENABLED'].includes(campaign.status)
            || !/^\d{10}$/.test(manager) || !/^\d{10}$/.test(account)
            || !/^[1-9]\d{0,19}$/.test(id) || !String(campaign.campaignName || '').trim()) continue;
        campaigns.set(manager + ':' + account + ':' + id, campaign);
      }
    }
    return [...campaigns.values()];
  }

  async function savedHubCampaignRecoveryPlan() {
    const campaigns = savedHubCampaignsForRecovery();
    if (!campaigns.length) return { campaigns, pendingCampaigns: [], alreadyRegisteredCount: 0 };
    try {
      const status = await getSavedHubCampaignRecoveryStatus?.(campaigns);
      if (!status || !Array.isArray(status.pendingCampaigns)) throw new Error('A base local não retornou o estado dos vínculos.');
      return {
        campaigns,
        pendingCampaigns: status.pendingCampaigns,
        alreadyRegisteredCount: Math.max(0, Number(status.alreadyRegisteredCount) || 0),
      };
    } catch (error) {
      return { campaigns, pendingCampaigns: [], alreadyRegisteredCount: 0, error };
    }
  }

  async function refreshHubCampaignRecovery() {
    const checkVersion = ++hubCampaignRecoveryCheckVersion;
    const campaigns = savedHubCampaignsForRecovery();
    hubCampaignRecovery.hidden = true;
    hubCampaignRecoveryButton.hidden = true;
    if (!onRegisterSavedHubCampaigns || !campaigns.length) return;
    const plan = await savedHubCampaignRecoveryPlan();
    if (checkVersion !== hubCampaignRecoveryCheckVersion) return;
    if (plan.error) {
      hubCampaignRecovery.hidden = false;
      hubCampaignRecoveryStatus.textContent = 'Não foi possível conferir o vínculo na base local; nenhuma ação de vínculo foi iniciada. Atualize a tela para tentar novamente.';
      return;
    }
    if (!plan.pendingCampaigns.length) return;
    hubCampaignRecovery.hidden = false;
    hubCampaignRecoveryButton.hidden = false;
    hubCampaignRecoveryButton.disabled = hubCampaignRecoveryBusy;
    hubCampaignRecoveryButton.textContent = 'Vincular ' + plan.pendingCampaigns.length + ' campanha(s) à base local';
    hubCampaignRecoveryStatus.textContent = `${plan.campaigns.length} campanha(s) confirmada(s) nos lotes salvos · ${plan.pendingCampaigns.length} aguardando vínculo · ${plan.alreadyRegisteredCount} já vinculada(s) à base local.`;
  }

  async function registerSavedHubCampaigns() {
    if (hubCampaignRecoveryBusy || !onRegisterSavedHubCampaigns) return;
    const { campaigns: savedCampaigns, pendingCampaigns, error } = await savedHubCampaignRecoveryPlan();
    if (error) {
      setCampaignBatchStatus('Não foi possível conferir os vínculos na base local; nenhuma campanha foi alterada.', true);
      void refreshHubCampaignRecovery();
      return;
    }
    const campaigns = pendingCampaigns;
    if (!campaigns.length) {
      void refreshHubCampaignRecovery();
      if (savedCampaigns.length) setCampaignBatchStatus('As campanhas salvas nos lotes já estão vinculadas à base local; não é necessário repetir a ação.', false);
      return;
    }
    if (!globalThis.confirm('Vincular ' + campaigns.length + ' campanha(s) confirmada(s) dos lotes salvos à base local?\n\nA ação usa somente IDs, nomes, contas e capturas já guardados neste navegador. Não consulta nem consome cota da Google Ads API.')) return;
    hubCampaignRecoveryBusy = true;
    void refreshHubCampaignRecovery();
    setCampaignBatchStatus('Vinculando campanhas e capturas já salvas à base local…');
    try {
      const result = await onRegisterSavedHubCampaigns(campaigns);
      const registered = Number(result?.registeredCount) || 0;
      const linkedExisting = Number(result?.linkedExistingCount) || 0;
      const already = Number(result?.alreadyRegisteredCount) || 0;
      const captures = Number(result?.linkedCaptureCount) || 0;
      const conflicts = Array.isArray(result?.conflicts) ? result.conflicts : [];
      const summary = `${registered} novo(s) registro(s), ${linkedExisting} vínculo(s) atualizado(s), ${already} já vinculado(s) e ${captures} linha(s) de captura local recuperada(s).`;
      setCampaignBatchStatus(conflicts.length
        ? `${summary} ${conflicts.length} vínculo(s) exigem revisão: ${conflicts[0]}`
        : `${summary} Nenhuma consulta à Google Ads API foi feita.`, conflicts.length > 0);
    } catch (error) {
      setCampaignBatchStatus((error?.message || 'Não foi possível vincular as campanhas à base local.') + ' Os lotes salvos foram preservados.', true);
    } finally {
      hubCampaignRecoveryBusy = false;
      void refreshHubCampaignRecovery();
    }
  }
  hubCampaignRecoveryButton.addEventListener('click', () => { void registerSavedHubCampaigns(); });

  function labelForCampaignBatch(batch) {
    const firstName = batch.campaigns[0]?.campaignName || 'Campanhas';
    const deliverySource = campaignDeliverySourceForBatch(batch);
    const sourcePlatform = String(deliverySource?.platformCode || '').trim().toUpperCase();
    const namedPlatform = parseGoogleAdsCampaignName(firstName).platformCode;
    const platformMarker = ['CB', 'GM'].includes(sourcePlatform) && namedPlatform !== sourcePlatform
      ? ' · ' + sourcePlatform : '';
    return localDateLabel(batch.createdAt) + ' · ' + batch.campaigns.length + ' campanha(s)'
      + (batch.source === 'associated' ? ' · associado' : '') + platformMarker + ' · ' + firstName.slice(0, 58);
  }

  function campaignAssociationKey(campaign) {
    return String(campaign?.managerCustomerId || '') + ':' + String(campaign?.customerId || '') + ':' + String(campaign?.campaignId || '');
  }

  function savedCampaignAssociationKeys(store = campaignBatchStore) {
    return new Set((store?.batches || []).flatMap(batch => batch.campaigns || [])
      .map(campaign => campaignAssociationKey(campaign)));
  }

  function campaignAssociationAccountChoices() {
    const targetState = campaignTargetState();
    const fromFicha = targetState.targets.map(target => target.account).filter(Boolean);
    const fichaTargetsAvailable = fromFicha.length > 0;
    const currentAccount = selectedAccount();
    const accounts = fichaTargetsAvailable ? fromFicha
      : (directory?.accounts || []).filter(account => account.managerCustomerId === managerSelect.value);
    const unique = new Map();
    for (const account of accounts) {
      const managerCustomerId = String(account.managerCustomerId || '').replace(/\D/g, '');
      const customerId = String(account.customerId || '').replace(/\D/g, '');
      if (!/^\d{10}$/.test(managerCustomerId) || !/^\d{10}$/.test(customerId)) continue;
      unique.set(managerCustomerId + ':' + customerId, {
        ...account,
        managerCustomerId,
        customerId,
        associationSelected: fichaTargetsAvailable || Boolean(currentAccount
          && currentAccount.managerCustomerId === managerCustomerId && currentAccount.customerId === customerId),
      });
    }
    return [...unique.values()];
  }

  function selectedCampaignAssociationAccounts() {
    return [...campaignAssociationAccounts.querySelectorAll('[data-association-account]:checked')]
      .map(input => ({
        managerCustomerId: input.dataset.managerCustomerId || '',
        customerId: input.dataset.customerId || '',
        name: input.dataset.accountName || input.dataset.customerId || '',
      }));
  }

  function clearCampaignAssociationResults() {
    campaignAssociationCandidates = [];
    campaignAssociationSearchReady = false;
    campaignAssociationResults.hidden = true;
    campaignAssociationList.replaceChildren();
    campaignAssociationSelectAll.hidden = true;
    campaignAssociationSaveButton.disabled = true;
    campaignAssociationSaveButton.textContent = 'Associar selecionadas (0)';
  }

  function setCampaignAssociationStatus(message, isError = false) {
    campaignAssociationStatus.textContent = String(message || '');
    campaignAssociationStatus.classList.toggle('is-error', isError);
    campaignAssociationStatus.classList.toggle('is-success', !isError && Boolean(message));
  }

  function renderCampaignAssociationAccounts(accounts) {
    campaignAssociationAccounts.replaceChildren();
    for (const account of accounts) {
      const label = document.createElement('label');
      label.className = 'google-ads-campaign-association-account';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = account.associationSelected === true;
      input.dataset.associationAccount = 'true';
      input.dataset.managerCustomerId = account.managerCustomerId;
      input.dataset.customerId = account.customerId;
      input.dataset.accountName = account.name || account.customerId;
      const text = document.createElement('span');
      text.textContent = (account.name || 'Conta') + ' · ' + account.customerId;
      label.append(input, text);
      campaignAssociationAccounts.append(label);
    }
  }

  function renderCampaignAssociationResults() {
    if (!campaignAssociationCandidates.length && !campaignAssociationSearchReady) {
      campaignAssociationResults.hidden = true;
      campaignAssociationList.replaceChildren();
      campaignAssociationSelectAll.hidden = true;
      campaignAssociationSaveButton.disabled = true;
      return;
    }
    campaignAssociationList.replaceChildren();
    const savedKeys = savedCampaignAssociationKeys();
    campaignAssociationCandidates.forEach(candidate => {
      candidate.alreadySaved = savedKeys.has(campaignAssociationKey(candidate));
      const row = document.createElement('li');
      const label = document.createElement('label');
      label.className = 'google-ads-campaign-association-candidate' + (candidate.alreadySaved ? ' is-saved' : '');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = candidate.selected === true && !candidate.alreadySaved;
      input.disabled = candidate.alreadySaved || campaignAssociationBusy;
      input.dataset.associationCandidateKey = campaignAssociationKey(candidate);
      const details = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = candidate.campaignName;
      const meta = document.createElement('small');
      meta.textContent = candidate.accountName + ' · ID ' + candidate.campaignId + ' · ' + candidate.status
        + (candidate.alreadySaved ? ' · já está em lote salvo' : '');
      details.append(name, meta);
      label.append(input, details);
      row.append(label);
      campaignAssociationList.append(row);
    });
    campaignAssociationResults.hidden = false;
    campaignAssociationSelectAll.hidden = !campaignAssociationCandidates.some(candidate => !candidate.alreadySaved);
    updateCampaignAssociationSelectionState();
  }

  function updateCampaignAssociationSelectionState() {
    const eligible = campaignAssociationCandidates.filter(candidate => !candidate.alreadySaved);
    const selectedCount = eligible.filter(candidate => candidate.selected).length;
    campaignAssociationSummary.textContent = campaignAssociationCandidates.length + ' campanha(s) Search correspondem ao produto exato · '
      + selectedCount + ' selecionada(s) · limite de 100 por lote.';
    campaignAssociationSaveButton.textContent = 'Associar selecionadas (' + selectedCount + ')';
    campaignAssociationSaveButton.disabled = campaignAssociationBusy || !campaignAssociationSearchReady
      || selectedCount < 1 || selectedCount > 100;
    campaignAssociationSelectAll.textContent = selectedCount > 0 ? 'Desmarcar todas'
      : eligible.length > 100 ? 'Selecionar até 100' : 'Selecionar todas';
  }

  function openCampaignAssociationDialog() {
    if (!campaignAssociationDialog || campaignAssociationBusy) return;
    clearCampaignAssociationResults();
    campaignAssociationProduct.value = campaignProductForFinalUrl();
    const accounts = campaignAssociationAccountChoices();
    renderCampaignAssociationAccounts(accounts);
    const selectedAccountCount = selectedCampaignAssociationAccounts().length;
    campaignAssociationSearchButton.disabled = !isTokenReady() || !selectedAccountCount;
    setCampaignAssociationStatus(!isTokenReady()
      ? 'Configure o token do Hub antes de consultar as campanhas.'
      : selectedAccountCount ? 'A busca só começa quando você clicar. A verificação consulta a API; associar não altera campanhas.'
        : accounts.length ? 'Marque uma ou mais contas para iniciar a busca.'
        : 'Nenhuma conta de destino da Ficha ou conta selecionada está disponível no diretório local.',
    !isTokenReady() || !accounts.length);
    if (typeof campaignAssociationDialog.showModal === 'function') campaignAssociationDialog.showModal();
    else campaignAssociationDialog.setAttribute('open', '');
  }

  async function searchCampaignsForAssociation() {
    if (campaignAssociationBusy) return;
    const product = campaignAssociationProduct.value.trim();
    const productKey = normalizeCampaignSequenceProduct(product);
    const accounts = selectedCampaignAssociationAccounts();
    clearCampaignAssociationResults();
    if (!productKey) { setCampaignAssociationStatus('Informe o produto que aparece no padrão do nome.', true); return; }
    if (!accounts.length) { setCampaignAssociationStatus('Marque pelo menos uma conta de destino.', true); return; }
    if (!isTokenReady()) { setCampaignAssociationStatus('Configure o token compartilhado do Hub antes de consultar.', true); return; }
    campaignAssociationBusy = true;
    campaignAssociationSearchButton.disabled = true;
    campaignAssociationOpenButton.disabled = true;
    campaignAssociationProduct.disabled = true;
    campaignAssociationAccounts.querySelectorAll('input').forEach(input => { input.disabled = true; });
    campaignAssociationSearchButton.textContent = 'Buscando…';
    try {
      const found = [];
      for (let index = 0; index < accounts.length; index += 1) {
        const account = accounts[index];
        setCampaignAssociationStatus('Consultando campanhas Search em ' + (account.name || account.customerId) + ' (' + (index + 1) + '/' + accounts.length + ')…');
        const campaigns = await fetchGoogleAdsCampaignsForDuplication(account);
        for (const campaign of campaigns) {
          if (!['PAUSED', 'ENABLED'].includes(campaign.status)) continue;
          const parsed = parseGoogleAdsCampaignName(campaign.campaignName);
          if (!parsed.ok || normalizeCampaignSequenceProduct(parsed.product) !== productKey) continue;
          found.push({ ...campaign, ...account, accountName: account.name || account.customerId, selected: false });
        }
      }
      found.sort((left, right) => left.accountName.localeCompare(right.accountName)
        || left.campaignName.localeCompare(right.campaignName, 'pt-BR'));
      campaignAssociationCandidates = found;
      campaignAssociationSearchReady = true;
      if (!found.length) {
        setCampaignAssociationStatus('Nenhuma campanha Search ativa ou pausada correspondeu exatamente ao produto “' + product + '”.');
        campaignAssociationResults.hidden = false;
        campaignAssociationSummary.textContent = '0 campanhas encontradas';
        campaignAssociationSelectAll.hidden = true;
        return;
      }
      renderCampaignAssociationResults();
      setCampaignAssociationStatus('Busca concluída. Revise conta, nome, status e ID; a associação fará uma segunda conferência antes de salvar.');
    } catch (error) {
      clearCampaignAssociationResults();
      setCampaignAssociationStatus(error?.message || 'Não foi possível consultar as campanhas Search.', true);
    } finally {
      campaignAssociationBusy = false;
      campaignAssociationSearchButton.disabled = !isTokenReady() || selectedCampaignAssociationAccounts().length === 0;
      campaignAssociationSearchButton.textContent = 'Buscar campanhas';
      campaignAssociationOpenButton.disabled = false;
      campaignAssociationProduct.disabled = false;
      campaignAssociationAccounts.querySelectorAll('input').forEach(input => { input.disabled = false; });
      renderCampaignAssociationResults();
    }
  }

  async function associateSelectedCampaigns() {
    if (campaignAssociationBusy || !campaignAssociationSearchReady) return;
    const selected = campaignAssociationCandidates.filter(candidate => candidate.selected && !candidate.alreadySaved);
    if (!selected.length || selected.length > 100) return;
    const csvWorkflow = currentCampaignCsvWorkflow();
    if (csvWorkflow && !csvWorkflow.batchId) {
      const uploadedAllMccs = csvWorkflow.managers.every(manager => csvWorkflow.uploadedManagerIds.includes(manager.managerCustomerId));
      if (!uploadedAllMccs) {
        setCampaignAssociationStatus('Conclua primeiro o upload de todas as MCCs no fluxo CSV antes de associar as campanhas.', true);
        return;
      }
      const expected = csvWorkflow.plannedCampaigns.map(csvWorkflowCampaignIdentity).sort();
      const selectedKeys = selected.map(csvWorkflowCampaignIdentity).sort();
      if (expected.length !== selectedKeys.length || expected.some((key, index) => key !== selectedKeys[index])) {
        setCampaignAssociationStatus('A seleção não corresponde ao CSV deste fluxo. Selecione exatamente as ' + expected.length
          + ' campanhas planejadas (' + csvWorkflow.plannedCampaigns.length + '), sem deixar nenhuma conta ou faixa de CPA de fora.', true);
        return;
      }
    }
    const accountLabels = [...new Set(selected.map(item => item.accountName || item.customerId))];
    if (!globalThis.confirm('Associar ' + selected.length + ' campanha(s) existentes de “' + campaignAssociationProduct.value.trim()
      + '” em ' + accountLabels.length + ' conta(s)? O Hub fará uma conferência de leitura por conta e salvará um novo lote neste navegador. Nenhuma campanha será criada ou alterada.')) return;
    if (!saveDraftNow()) {
      setCampaignAssociationStatus('Não foi possível salvar a análise atual. O lote não foi associado.', true);
      return;
    }
    const associationValues = collectDraftValues();
    const associationFormSnapshot = campaignBatchFormSnapshotForCampaigns(selected, associationValues);
    const associationTargets = associationFormSnapshot ? campaignTargetState().targets : [];
    const finalUrlByAccount = new Map(associationTargets.map(target => [
      String(target.accountId || '').replace(/\D/g, ''),
      String(target.finalUrl || '').trim(),
    ]));
    campaignAssociationBusy = true;
    campaignAssociationSearchButton.disabled = true;
    campaignAssociationSaveButton.disabled = true;
    campaignAssociationOpenButton.disabled = true;
    const verifiedCampaigns = [];
    try {
      const latestStore = loadGoogleAdsCampaignBatches();
      const savedKeys = savedCampaignAssociationKeys(latestStore);
      if (selected.some(candidate => savedKeys.has(campaignAssociationKey(candidate)))) {
        throw new Error('Uma ou mais campanhas já foram associadas a outro lote neste navegador. Busque novamente para atualizar a lista.');
      }
      const groups = new Map();
      for (const candidate of selected) {
        const key = candidate.managerCustomerId + ':' + candidate.customerId;
        if (!groups.has(key)) groups.set(key, { account: candidate, campaigns: [] });
        groups.get(key).campaigns.push(candidate);
      }
      let processed = 0;
      for (const { account, campaigns } of groups.values()) {
        setCampaignAssociationStatus('Conferindo ' + campaigns.length + ' campanha(s) em ' + account.accountName + ' (' + (++processed) + '/' + groups.size + ')…');
        const verified = await verifyGoogleAdsCampaignsForAssociation({
          managerCustomerId: account.managerCustomerId,
          customerId: account.customerId,
          campaigns: campaigns.map(item => ({ campaignId: item.campaignId, campaignName: item.campaignName })),
        });
        verified.forEach(item => {
          const plannedCampaign = csvWorkflow?.plannedCampaigns.find(candidate => csvWorkflowCampaignIdentity(candidate) === csvWorkflowCampaignIdentity({
            managerCustomerId: account.managerCustomerId,
            customerId: account.customerId,
            campaignName: item.campaignName,
          }));
          verifiedCampaigns.push({
            managerCustomerId: account.managerCustomerId,
            customerId: account.customerId,
            campaignId: item.campaignId,
            adGroupId: item.adGroupId,
            campaignName: item.campaignName,
            accountName: account.accountName,
            status: item.status,
            campaignChannelType: item.channelType,
            audienceGrouped: item.audienceGrouped,
            adGroupStatus: item.adGroupStatus,
            finalUrl: finalUrlByAccount.get(String(account.customerId || '').replace(/\D/g, '')) || '',
            source: 'existing',
            geoTargetingSnapshot: plannedCampaign?.geoTargetingSnapshot || null,
          });
        });
      }
      if (verifiedCampaigns.length !== selected.length) throw new Error('A conferência não cobriu todas as campanhas selecionadas. Nenhum lote foi salvo.');
      const now = new Date().toISOString();
      const firstKey = verifiedCampaigns[0].customerId + ':' + verifiedCampaigns[0].campaignId;
      const batchId = createCampaignBatchId();
      campaignBatchStore = saveGoogleAdsCampaignBatch({
        id: batchId,
        label: 'Campanhas associadas · ' + campaignAssociationProduct.value.trim(),
        source: 'associated',
        creationMode: csvWorkflow && !csvWorkflow.batchId ? 'csv' : 'associated',
        draftId: '',
        previewId: '',
        createdAt: now,
        updatedAt: now,
        selectedCampaignKey: firstKey,
        sitelinks: [],
        imageUploadConfirmed: false,
        imageUploadConfirmedAccountIds: [],
        imageUploadSelectedAccountIds: null,
        formSnapshot: associationFormSnapshot,
        campaigns: verifiedCampaigns,
      });
      if (csvWorkflow && !csvWorkflow.batchId) {
        const linked = persistCampaignCsvWorkflow(csvWorkflow, { batchId });
        if (!linked) setCampaignCsvStatus('O lote foi salvo, mas não foi possível vinculá-lo ao fluxo CSV. Confira o registro local antes de continuar.', true);
      }
      activeCampaignBatchFormSnapshot = associationFormSnapshot;
      refreshCampaignBatchPicker();
      if (typeof campaignAssociationDialog.close === 'function') campaignAssociationDialog.close();
      else campaignAssociationDialog.removeAttribute('open');
      openSavedCampaignBatch(batchId);
      setCampaignBatchStatus(verifiedCampaigns.length + ' campanha(s) existente(s) associada(s) e salvas em um novo lote neste navegador.');
    } catch (error) {
      setCampaignAssociationStatus(error?.message || 'Não foi possível conferir e associar as campanhas. Nenhum lote novo foi salvo.', true);
    } finally {
      campaignAssociationBusy = false;
      campaignAssociationSearchButton.disabled = !isTokenReady() || selectedCampaignAssociationAccounts().length === 0;
      campaignAssociationOpenButton.disabled = false;
      renderCampaignAssociationResults();
    }
  }

  function refreshCampaignBatchPicker() {
    refreshDraftPicker();
    refreshHubCampaignRecovery();
  }

  function resetCampaignDestinationUrlBatchState() {
    activeCampaignBatchDestinationUrls = [];
    campaignDestinationUrlBatchAttempted = false;
    campaignDestinationUrlBatchProgress = null;
    campaignDestinationUrlBatchApplying = false;
  }

  function saveActiveCampaignBatch(campaigns = createdCampaigns) {
    if (!activeCampaignBatchId || !Array.isArray(campaigns) || !campaigns.length) return true;
    if (campaignBatchChangedInOtherTab) { setCampaignBatchStatus('O armazenamento de lotes mudou em outra aba. Recarregue esta tela antes de salvar.', true); return false; }
    if (cpaExpansionBlocked()) { setCampaignBatchStatus('Conclua a ampliação antes de alterar o lote.', true); return false; }
    const now = new Date().toISOString();
    let existing;
    try {
      campaignBatchStore = loadGoogleAdsCampaignBatches();
      existing = campaignBatchStore.batches.find(batch => batch.id === activeCampaignBatchId);
      const incoming = new Set(campaigns.map(campaignOperationKey));
      if (existing?.campaigns.some(campaign => !incoming.has(campaignOperationKey(campaign)))) throw new Error('O lote mudou em outra aba. Reabra o lote para preservar todas as campanhas.');
    } catch (error) { setCampaignBatchStatus(error.message, true); return false; }
    if (!activeCampaignBatchDestinationUrls.length) {
      const byAccount = new Map();
      const conflictingAccounts = new Set();
      campaigns.filter(campaign => campaign.source === 'created').forEach(campaign => {
        const accountId = String(campaign.customerId || '').replace(/\D/g, '');
        const url = String(campaign.finalUrl || '').trim();
        if (!/^\d{10}$/.test(accountId) || !isValidCampaignBatchDestinationUrl(url)) return;
        const previous = byAccount.get(accountId);
        if (conflictingAccounts.has(accountId)) return;
        if (previous && previous.url !== url) {
          conflictingAccounts.add(accountId);
          byAccount.set(accountId, null);
          return;
        }
        byAccount.set(accountId, {
          accountId,
          url,
          sourceJobId: activePresellCampaignHandoff?.sourceJobId || '',
          sourceProduct: activePresellCampaignHandoff?.product || '',
          updatedAt: now,
        });
      });
      activeCampaignBatchDestinationUrls = [...byAccount.values()].filter(Boolean);
    }
    const campaignRecords = campaigns.map(campaign => {
      const key = campaignOperationKey(campaign);
      const state = key === campaignOperationKey(createdCampaign)
        ? { audienceTargetingResult, audienceTargetingError, audienceExclusionsResult, audienceExclusionsError }
        : audienceStateByCampaign.get(key) || {};
      return {
        ...campaign,
        managerCustomerId: campaign.managerCustomerId,
        customerId: campaign.customerId,
        campaignId: campaign.campaignId,
        adGroupId: campaign.adGroupId || '',
        campaignName: campaign.campaignName,
        accountName: campaign.accountName || '',
        finalUrl: campaign.finalUrl || '',
        status: campaign.status || '',
        campaignChannelType: campaign.campaignChannelType || '',
        audienceGrouped: typeof campaign.audienceGrouped === 'boolean' ? campaign.audienceGrouped : null,
        adGroupStatus: campaign.adGroupStatus || '',
        source: campaign.source || '',
        goalVerification: campaign.goalVerification || null,
        audienceTargetingResult: state.audienceTargetingResult || null,
        audienceTargetingError: state.audienceTargetingError || '',
        audienceExclusionsResult: state.audienceExclusionsResult || null,
        audienceExclusionsError: state.audienceExclusionsError || '',
        activationResult: campaign.activationResult || null,
        activationError: campaign.activationError || '',
        deliverySettingsResult: campaign.deliverySettingsResult || null,
        deliverySettingsError: campaign.deliverySettingsError || '',
        euPoliticalAdvertisingResult: campaign.euPoliticalAdvertisingResult || null,
        euPoliticalAdvertisingError: campaign.euPoliticalAdvertisingError || '',
        statusActionResult: campaign.statusActionResult || null,
        statusActionError: campaign.statusActionError || '',
        sitelinksResult: campaign.sitelinksResult || null,
        sitelinksError: campaign.sitelinksError || '',
        destinationUrlResult: campaign.destinationUrlResult || null,
        destinationUrlError: campaign.destinationUrlError || '',
      };
    });
    const selectedCampaignKey = campaigns.some(campaign => campaignOperationKey(campaign) === campaignOperationKey(createdCampaign))
      ? campaignOperationKey(createdCampaign)
      : campaignOperationKey(campaigns[0]);
    const deliverySettingsQuotaSummary = campaignDeliverySettingsBatchQuotaSummary?.batchId === activeCampaignBatchId
      ? campaignDeliverySettingsBatchQuotaSummary.summary
      : existing?.deliverySettingsQuotaSummary || null;
    const euPoliticalAdvertisingQuotaSummary = campaignEuPoliticalDeclarationBatchQuotaSummary?.batchId === activeCampaignBatchId
      ? campaignEuPoliticalDeclarationBatchQuotaSummary.summary
      : existing?.euPoliticalAdvertisingQuotaSummary || null;
    try {
      campaignBatchStore = saveGoogleAdsCampaignBatch({
        ...existing,
        id: activeCampaignBatchId,
        label: campaignRecords.length + ' campanha(s) · ' + campaignRecords[0].campaignName,
        draftId: existing
          ? (existing.source === 'associated' ? '' : (existing.draftId || ''))
          : (activeDraftId || ''),
        previewId: existing
          ? (existing.source === 'associated' ? '' : (existing.previewId || ''))
          : (previewId || ''),
        source: existing?.source || '',
        creationMode: existing?.creationMode || (campaignCsvWorkflowStore.workflows.some(item => item.batchId === activeCampaignBatchId)
          ? 'csv' : existing?.source === 'associated' ? 'associated' : 'api'),
        createdAt: existing?.createdAt || activeCampaignBatchCreatedAt || now,
        updatedAt: now,
        selectedCampaignKey,
        campaignStatusLog,
        deliverySettingsQuotaSummary,
        euPoliticalAdvertisingQuotaSummary,
        sitelinks: activeCampaignBatchSitelinks,
        destinationUrls: activeCampaignBatchDestinationUrls,
        negativeKeywordsBatch: activeCampaignBatchNegativeKeywords,
        positiveKeywordsBatch: activeCampaignBatchPositiveKeywords,
        formSnapshot: existing
          ? (existing.formSnapshot || activeCampaignBatchFormSnapshot || null)
          : (activeCampaignBatchFormSnapshot || collectDraftValues()),
        imageUploadConfirmed,
        imageUploadConfirmedAccountIds,
        imageUploadSelectedAccountIds: campaignImageUploadSelectedAccountIds,
        imageAssetUploads: campaignImageAssetUploads,
        campaigns: campaignRecords,
      });
      campaignBatchStorageError = '';
      refreshCampaignBatchPicker();
      const contextSaved = rememberCampaignCreationContext('batch', activeCampaignBatchId);
      setCampaignBatchStatus(contextSaved
        ? 'Lote salvo neste navegador · atualizado em ' + localDateLabel(now) + '.'
        : activeCampaignContextStorageError + ' O lote foi salvo, mas a tela pode não retomá-lo automaticamente após um refresh.', !contextSaved);
      return true;
    } catch (error) {
      campaignBatchStorageError = error.message || 'Não foi possível salvar este lote neste navegador.';
      setCampaignBatchStatus(campaignBatchStorageError + ' As campanhas já criadas permanecem no Google Ads.', true);
      return false;
    }
  }

  function clearActiveCampaignBatchView() {
    if (!activeCampaignBatchId) return;
    saveAudienceStateForCurrentCampaign();
    if (!saveActiveCampaignBatch()) {
      refreshCampaignBatchPicker();
      return;
    }
    clearCampaignBatchPositiveKeywordsSaveTimer();
    clearCampaignImageBatchPreviews();
    activeCampaignBatchId = '';
    activeCampaignBatchCreatedAt = '';
    campaignStatusLog = null;
    activeCampaignBatchSitelinks = [];
    activeCampaignBatchNegativeKeywords = { inputText: '', preview: null, result: null, updatedAt: '' };
    activeCampaignBatchPositiveKeywords = { inputText: '', preview: null, result: null, updatedAt: '' };
    campaignBatchNegativeKeywordsMessage = '';
    campaignBatchPositiveKeywordsMessage = '';
    resetCampaignDestinationUrlBatchState();
    activeCampaignBatchFormSnapshot = null;
    imageUploadConfirmed = false;
    imageUploadConfirmedAccountIds = [];
    campaignImageUploadSelectedAccountIds = null;
    campaignImageAssetUploads = [];
    campaignImageUploadFiles = [];
    campaignImageUploadNeedsAdjustment = [];
    campaignImageUploadFilesSource = 'none';
    campaignImageUploadSelectionError = '';
    campaignImageUploadSelectionBusy = false;
    campaignImageUploadProgress = null;
    campaignImageUploadApplying = false;
    campaignEuPoliticalDeclarationBatchApplying = false;
    campaignEuPoliticalDeclarationBatchProgress = null;
    campaignEuPoliticalDeclarationBatchQuotaSummary = null;
    campaignSitelinksBatchAttempted = false;
    campaignSitelinksBatchProgress = null;
    campaignBatchRestored = false;
    activeCampaignBatchFormRestored = false;
    createdCampaign = null;
    createdCampaigns = [];
    batchEntries = [];
    audienceStateByCampaign = new Map();
    audienceTargetingResult = null;
    audienceTargetingError = '';
    audienceExclusionsResult = null;
    audienceExclusionsError = '';
    audienceExclusionsBatchAttempted = false;
    audienceExclusionsBatchProgress = null;
    clearPreview({ preserveStoredPreview: true });
    completed = false;
    uncertain = false;
    renderCampaignTargetSummary();
    resultArea.replaceChildren();
    resultArea.hidden = true;
    refreshCampaignBatchPicker();
    renderCampaignResult();
    updateControlState();
    setStatus('Lote fechado. O histórico continua salvo neste navegador e a análise atual pode ser editada.');
    const contextSaved = rememberCampaignCreationContext('new');
    setCampaignBatchStatus(contextSaved
      ? 'Lote fechado · continua salvo neste navegador e pode ser reaberto pelo seletor.'
      : activeCampaignContextStorageError + ' O lote continua salvo, mas a tela pode não retomar esta escolha após um refresh.', !contextSaved);
    void restoreSavedPreview(activeDraftId);
  }

  function openSavedCampaignBatch(batchId) {
    if (busy) return;
    if (batchId === '__none__') {
      clearActiveCampaignBatchView();
      return;
    }
    if (!saveDraftNow()) {
      refreshCampaignBatchPicker();
      return;
    }
    saveAudienceStateForCurrentCampaign();
    if (!saveActiveCampaignBatch()) {
      refreshCampaignBatchPicker();
      return;
    }
    clearCampaignBatchPositiveKeywordsSaveTimer();
    const batch = campaignBatchStore.batches.find(item => item.id === batchId);
    if (!batch) {
      setCampaignBatchStatus('Esse lote não está mais disponível no armazenamento local.', true);
      refreshCampaignBatchPicker();
      return;
    }
    clearCampaignImageBatchPreviews();
    activeCampaignBatchId = batch.id;
    activeCampaignBatchCreatedAt = batch.createdAt;
    const latestLegacyActivationAt = batch.campaigns
      .map(campaign => campaign.activationResult?.verifiedAtUtc || '')
      .filter(value => Number.isFinite(Date.parse(value)))
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || '';
    campaignStatusLog = batch.campaignStatusLog || (latestLegacyActivationAt
      ? { operation: 'enable_campaign', atUtc: latestLegacyActivationAt, legacy: true, completed: true }
      : null);
    campaignBatchRestored = true;
    activeCampaignBatchDestinationUrls = Array.isArray(batch.destinationUrls) ? batch.destinationUrls.map(item => ({ ...item })) : [];
    activeCampaignBatchNegativeKeywords = batch.negativeKeywordsBatch && typeof batch.negativeKeywordsBatch === 'object'
      ? JSON.parse(JSON.stringify(batch.negativeKeywordsBatch))
      : { inputText: '', preview: null, result: null, updatedAt: '' };
    campaignBatchNegativeKeywordsMessage = '';
    activeCampaignBatchPositiveKeywords = batch.positiveKeywordsBatch && typeof batch.positiveKeywordsBatch === 'object'
      ? JSON.parse(JSON.stringify(batch.positiveKeywordsBatch))
      : { inputText: '', preview: null, result: null, updatedAt: '' };
    campaignBatchPositiveKeywordsMessage = '';
    campaignDestinationUrlBatchAttempted = false;
    campaignDestinationUrlBatchProgress = null;
    campaignDestinationUrlBatchApplying = false;
    activeCampaignBatchFormRestored = false;
    completed = true;
    uncertain = false;
    clearPreview({ preserveStoredPreview: true });
    const currentFormValues = collectDraftValues();
    try {
      draftStore = loadGoogleAdsCampaignDrafts();
      if (!draftStore.drafts.some(draft => draft.id === activeDraftId)) activeDraftId = draftStore.activeDraftId || '';
    } catch { /* O retrato salvo no próprio lote ainda pode ser recuperado. */ }
    let associatedDraftId = batch.source === 'associated' ? '' : (batch.draftId || '');
    if (!associatedDraftId && batch.source !== 'associated' && batch.previewId) {
      try { associatedDraftId = loadGoogleAdsCampaignPreview(batch.previewId)?.draftId || ''; }
      catch { associatedDraftId = ''; }
    }
    let associatedDraft = null;
    let associatedDraftError = '';
    if (associatedDraftId) {
      try {
        draftStore = loadGoogleAdsCampaignDrafts();
        associatedDraft = draftStore.drafts.find(item => item.id === associatedDraftId) || null;
      } catch (error) {
        associatedDraftError = error.message || 'Não foi possível ler a análise vinculada a este lote.';
      }
    }
    let formSnapshot = batch.formSnapshot && typeof batch.formSnapshot === 'object'
      ? JSON.parse(JSON.stringify(batch.formSnapshot))
      : null;
    let formSnapshotSource = formSnapshot ? 'saved-batch' : '';
    if (!formSnapshot && associatedDraft?.values && draftHasContent(associatedDraft.values)) {
      formSnapshot = JSON.parse(JSON.stringify(associatedDraft.values));
      formSnapshotSource = 'linked-draft';
    }
    if (!formSnapshot && batch.source === 'associated') {
      const recovered = matchingCampaignBatchFormSnapshot(batch, currentFormValues);
      if (recovered) {
        formSnapshot = recovered.values;
        formSnapshotSource = recovered.source;
      }
    }
    activeCampaignBatchFormSnapshot = formSnapshot;
    activeCampaignBatchSitelinks = Array.isArray(batch.sitelinks) ? batch.sitelinks.map(link => ({ ...link })) : [];
    imageUploadConfirmed = batch.imageUploadConfirmed === true;
    imageUploadConfirmedAccountIds = Array.isArray(batch.imageUploadConfirmedAccountIds)
      ? batch.imageUploadConfirmedAccountIds.filter(accountId => /^\d{10}$/.test(String(accountId)))
      : [];
    campaignImageUploadSelectedAccountIds = Array.isArray(batch.imageUploadSelectedAccountIds)
      ? batch.imageUploadSelectedAccountIds.filter(accountId => /^\d{10}$/.test(String(accountId)))
      : null;
    campaignImageAssetUploads = Array.isArray(batch.imageAssetUploads) ? batch.imageAssetUploads.map(item => ({ ...item })) : [];
    restoreCampaignImageBatchPreviews(batch);
    campaignImageUploadFiles = [];
    campaignImageUploadNeedsAdjustment = [];
    campaignImageUploadFilesSource = 'none';
    campaignImageUploadSelectionError = '';
    campaignImageUploadSelectionBusy = false;
    campaignImageUploadProgress = null;
    campaignImageUploadApplying = false;
    audienceStateByCampaign = new Map();
    createdCampaigns = batch.campaigns.map(campaign => {
      const {
        audienceTargetingResult: targetingResult,
        audienceTargetingError: targetingError,
        audienceExclusionsResult: exclusionsResult,
        audienceExclusionsError: exclusionsError,
        ...campaignRecord
      } = campaign;
      audienceStateByCampaign.set(campaignOperationKey(campaignRecord), {
        audienceTargetingResult: targetingResult || null,
        audienceTargetingError: targetingError || '',
        audienceExclusionsResult: exclusionsResult || null,
        audienceExclusionsError: exclusionsError || '',
      });
      return campaignRecord;
    });
    batchEntries = [];
    createdCampaign = createdCampaigns.find(campaign => campaignOperationKey(campaign) === batch.selectedCampaignKey)
      || createdCampaigns[0] || null;
    const selectedState = createdCampaign ? audienceStateByCampaign.get(campaignOperationKey(createdCampaign)) || {} : {};
    audienceTargetingResult = selectedState.audienceTargetingResult || null;
    audienceTargetingError = selectedState.audienceTargetingError || '';
    audienceExclusionsResult = selectedState.audienceExclusionsResult || null;
    audienceExclusionsError = selectedState.audienceExclusionsError || '';
    audienceExclusionsBatchAttempted = createdCampaigns.some(campaign => Boolean(audienceExclusionsStateForCampaign(campaign).audienceExclusionsResult
      || audienceExclusionsStateForCampaign(campaign).audienceExclusionsError));
    audienceExclusionsBatchProgress = null;
    campaignSitelinksBatchAttempted = createdCampaigns.some(campaign => Boolean(campaign.sitelinksResult || campaign.sitelinksError));
    campaignSitelinksBatchProgress = null;
    campaignDestinationUrlBatchAttempted = createdCampaigns.some(campaign => Boolean(campaign.destinationUrlResult || campaign.destinationUrlError));
    campaignDestinationUrlBatchProgress = null;
    previewSnapshot = '';
    if (associatedDraft) restoreDraft(associatedDraft);
    if (formSnapshot) {
      applyDraftValues(formSnapshot);
      activeCampaignBatchFormRestored = true;
      updateSelectionMessage();
      refreshDraftPicker();
      const snapshotStatus = formSnapshotSource === 'saved-batch'
        ? 'Lote selecionado · configuração completa recuperada do próprio lote.'
        : formSnapshotSource === 'linked-draft'
          ? 'Lote selecionado · configuração recuperada do rascunho originalmente vinculado.'
          : 'Lote selecionado · configuração compatível recuperada de um rascunho local.';
      setDraftStatus(snapshotStatus);
      if (formSnapshotSource !== 'saved-batch') saveActiveCampaignBatch();
    } else if (associatedDraftError) setDraftStatus('Lote selecionado · ' + associatedDraftError, true);
    else if (associatedDraftId) setDraftStatus('Lote selecionado · a análise associada não está mais salva neste navegador; os campos do formulário não puderam ser recuperados.', true);
    else setDraftStatus('Lote selecionado · as campanhas e ações estão salvas, mas este lote não tem configuração completa nem rascunho compatível para recuperar os campos.', true);
    refreshCampaignBatchPicker();
    renderCampaignTargetSummary();
    renderCampaignResult();
    updateControlState();
    const accountCount = new Set(batch.campaigns.map(campaign => String(campaign.customerId || '').replace(/\D/g, '')).filter(Boolean)).size;
    const referenceName = createdCampaign?.campaignName || createdCampaigns[0]?.campaignName || '';
    setCampaignBatchStatus((batch.source === 'associated' ? 'Campanhas existentes selecionadas' : 'Lote selecionado do armazenamento local') + ' · '
      + batch.campaigns.length + ' campanha(s) em ' + accountCount + ' conta(s)'
      + (referenceName ? ' · campanha de referência: ' + referenceName : '')
      + (activeCampaignBatchFormRestored ? ' · configurações do lote recuperadas' : ' · campos de criação não recuperados')
      + '. Campanhas não serão recriadas; as ações disponíveis podem ser retomadas neste lote.', false);
    if (!rememberCampaignCreationContext('batch', batch.id)) {
      setCampaignBatchStatus(activeCampaignContextStorageError + ' O lote abriu, mas a tela pode não retomá-lo automaticamente após um refresh.', true);
    }
    setStatus('');
  }

  function collectDraftValues() {
    const values = {};
    for (const control of form.querySelectorAll('[name]')) {
      const name = control.name;
      if (!name) continue;
      if (name === 'cpa_variant') continue;
      if (control.type === 'checkbox') {
        values[name] = control.checked;
        continue;
      }
      if (control.type === 'radio') {
        if (control.checked) values[name] = control.value;
        continue;
      }
      if (Object.hasOwn(values, name)) {
        if (!Array.isArray(values[name])) values[name] = [values[name]];
        values[name].push(control.value);
      } else values[name] = control.value;
    }
    values.__hub_keyword_per_line = true;
    values.__hub_discount_value_source = discountValueField.dataset.discountValueSource || '';
    values.__hub_daily_budget_source = form.elements.namedItem('daily_budget').dataset.budgetSource || '';
    values.__hub_cpa_variants = [...selectedCpaVariantPercents];
    values.__hub_delivery_cpa = campaignDeliverySource?{start:deliveryCpaStart,selected:[...deliveryCpaSelections],autoName:deliveryAutoName,autoCpa:deliveryAutoCpa}:null;
    values.__hub_delivery_brand_bidding_override = deliveryBrandBiddingOverride;
    values.__hub_final_url_source = finalUrlSource;
    values.__hub_final_url_auto_value = finalUrlAutoValue;
    values.__hub_promotion_target_source = promotionTargetSource;
    values.__hub_promotion_target_auto_value = promotionTargetAutoValue;
    values.__hub_sitelinks = pendingDraftSitelinks.map(link => ({ ...link }));
    values.__hub_campaign_delivery_source = campaignDeliverySource
      ? JSON.parse(JSON.stringify(campaignDeliverySource))
      : null;
    values.__hub_presell_campaign_handoff = activePresellCampaignHandoff
      ? JSON.parse(JSON.stringify(activePresellCampaignHandoff))
      : null;
    return values;
  }

  function draftHasContent(values = collectDraftValues()) {
    const contentFields = new Set([
      'campaign_name', 'source_product', 'daily_budget', 'max_cpc_bid', 'geo_target_country_codes', 'keywords', 'negative_keywords', 'clickbank_offer_key',
      'contains_eu_political_advertising', 'tracking_url_template', 'final_url_suffix', 'headline', 'description',
      'language_code', 'discount_value', 'promotion_target', 'final_url', 'trigger_value', 'start_date', 'end_date',
    ]);
    return Object.entries(values).some(([name, value]) => {
      if (!contentFields.has(name)) return false;
      if (typeof value === 'boolean') return value;
      return (Array.isArray(value) ? value : [value]).some(item => String(item ?? '').trim() !== '');
    });
  }

  function setDraftStatus(message, isError = false) {
    draftStatus.textContent = message;
    draftStatus.classList.toggle('is-error', isError);
    draftStatus.classList.toggle('is-success', !isError && Boolean(message));
  }

  function saveDraftNow() {
    if (draftSaveTimer) window.clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
    if (!draftDirty) return true;
    if (draftStorageError) {
      setDraftStatus(draftStorageError + ' As alterações continuam visíveis, mas não serão guardadas.', true);
      return false;
    }
    const values = collectDraftValues();
    if (!activeDraftId && !draftForce && !draftHasContent(values)) {
      draftDirty = false;
      refreshDraftPicker();
      return true;
    }
    try {
      const latestStore = loadGoogleAdsCampaignDrafts();
      const id = activeDraftId || createDraftId();
      const previous = latestStore.drafts.find(draft => draft.id === id);
      const now = new Date().toISOString();
      const updated = {
        id,
        label: String(values.campaign_name || '').trim(),
        createdAt: previous?.createdAt || now,
        updatedAt: now,
        values,
      };
      draftStore = {
        schemaVersion: 1,
        activeDraftId: id,
        drafts: [updated, ...latestStore.drafts.filter(draft => draft.id !== id)],
      };
      const isNewDraft = !activeDraftId;
      activeDraftId = id;
      if (isNewDraft && parsedCopy && copyImportMode === 'campaign') persistCopySelection();
      saveGoogleAdsCampaignDrafts(draftStore);
      draftDirty = false;
      draftForce = false;
      refreshDraftPicker();
      const contextSaved = rememberCampaignCreationContext('draft', id);
      setDraftStatus(contextSaved
        ? (isPresellPreparationDraft({ values }) ? 'Dados da Pre-Sell salvos neste navegador · ' + localDateLabel(now) : 'Salvo neste navegador · ' + localDateLabel(now))
        : activeCampaignContextStorageError + ' O rascunho foi salvo, mas a tela pode não retomá-lo automaticamente após um refresh.', !contextSaved);
      return true;
    } catch (error) {
      setDraftStatus(error.message || 'Não foi possível salvar a análise neste navegador.', true);
      return false;
    }
  }

  function scheduleDraftSave({ force = false } = {}) {
    if (restoringDraft) return;
    draftDirty = true;
    draftForce ||= force;
    if (draftSaveTimer) window.clearTimeout(draftSaveTimer);
    draftSaveTimer = window.setTimeout(saveDraftNow, 300);
  }

  function applyDraftValues(values = {}) {
    const savedCpaVariants = Array.isArray(values.__hub_cpa_variants)
      ? values.__hub_cpa_variants.map(Number).filter(Number.isFinite)
      : Array.isArray(values.cpa_variant)
        ? LEGACY_CPA_VARIANT_OPTIONS.filter((percent, index) => values.cpa_variant[index] === true && percent !== Number(values.source_target_cpa_percent))
        : [];
    restoringDraft = true;
    campaignDeliverySource = campaignDeliveryKeywordSource(values.__hub_campaign_delivery_source);
    deliveryBrandBiddingOverride = values.__hub_delivery_brand_bidding_override === true;
    const savedDeliveryCpa=values.__hub_delivery_cpa;
    const legacyBase=Number(values.source_target_cpa_percent);
    deliveryCpaStart=deliveryCpaLevels(savedDeliveryCpa?.start).length?Number(savedDeliveryCpa.start):deliveryCpaLevels(legacyBase).length?legacyBase:40;
    const savedDeliveryLevels=Array.isArray(savedDeliveryCpa?.selected)?savedDeliveryCpa.selected:[deliveryCpaStart,...savedCpaVariants];
    deliveryCpaSelections=new Set(savedDeliveryLevels.map(Number).filter(value=>deliveryCpaLevels(deliveryCpaStart).includes(value)));
    if(!deliveryCpaSelections.size)deliveryCpaSelections.add(deliveryCpaStart);
    deliveryAutoName=String(savedDeliveryCpa?.autoName||'');deliveryAutoCpa=String(savedDeliveryCpa?.autoCpa||'');
    activePresellCampaignHandoff = validateGoogleAdsPresellCampaignHandoff(values.__hub_presell_campaign_handoff);
    pendingDraftSitelinks = normalizeDraftSitelinks(values.__hub_sitelinks);
    form.reset();
    clickBankKeywordSources = mergeCampaignDeliveryKeywordSource(clickBankKeywordSources);
    renderClickBankKeywordSources('');
    for (const control of form.querySelectorAll('[name]')) control.setCustomValidity('');
    form.elements.namedItem('start_date').required = false;
    form.elements.namedItem('end_date').required = false;
    const savedManager = String(values.manager || '');
    managerSelect.value = [...managerSelect.options].some(option => option.value === savedManager) ? savedManager : '';
    const savedAccount = String(values.account || '');
    renderAccountOptions(savedAccount, { selectFirst: false });
    for (const [name, rawValue] of Object.entries(values)) {
      if (name === '__hub_discount_value_source' || name === '__hub_daily_budget_source' || name === '__hub_cpa_variants'
          || name === '__hub_final_url_source' || name === '__hub_final_url_auto_value'
          || name === '__hub_promotion_target_source' || name === '__hub_promotion_target_auto_value'
          || name === '__hub_sitelinks' || name === '__hub_presell_campaign_handoff'
          || name === '__hub_campaign_delivery_source' || name === '__hub_delivery_cpa'
          || name === '__hub_delivery_brand_bidding_override' || name === 'cpa_variant') continue;
      if (name === 'manager' || name === 'account') continue;
      const controls = [...form.querySelectorAll('[name]')].filter(control => control.name === name);
      if (!controls.length) continue;
      const savedValues = Array.isArray(rawValue) ? rawValue : [rawValue];
      controls.forEach((control, index) => {
        const value = savedValues[index] ?? (savedValues.length === 1 ? savedValues[0] : '');
        if (control.type === 'checkbox') control.checked = value === true;
        else if (control.type === 'radio') control.checked = String(value) === control.value;
        else if (name === 'clickbank_offer_key' && typeof value === 'string'
            && ![...control.options].some(option=>option.value===value)) pendingClickBankOfferKeyRestore=value;
        else if (typeof value === 'string') control.value = value;
      });
    }
    const suffixField = form.elements.namedItem('final_url_suffix');
    try { suffixField.value = ensureGoogleAdsCampaignIdUrlParameter(suffixField.value); }
    catch { /* Preserve a saved conflicting value; validation explains how to fix it before preview. */ }
    updateCampaignDeliveryGeoField();
    if (values.__hub_keyword_per_line !== true) {
      keywordField.value = migrateLegacyKeywordText(keywordField.value, values.keyword_match_type);
      negativeKeywordField.value = migrateLegacyKeywordText(negativeKeywordField.value, values.negative_keyword_match_type);
    }
    renderKeywordMatchLabels();
    const dailyBudgetField = form.elements.namedItem('daily_budget');
    if (!dailyBudgetField.value.trim()) dailyBudgetField.value = '100';
    dailyBudgetField.dataset.budgetSource = values.__hub_daily_budget_source === 'commission' ? 'commission'
      : dailyBudgetField.value.trim() && dailyBudgetField.value.trim() !== '100' ? 'manual' : '';
    const euPoliticalAdvertisingField = form.elements.namedItem('contains_eu_political_advertising');
    if (!euPoliticalAdvertisingField.value) euPoliticalAdvertisingField.value = 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING';
    const savedDiscountSource = values.__hub_discount_value_source;
    discountValueField.dataset.discountValueSource = ['copy', 'copy-metadata'].includes(savedDiscountSource)
      ? savedDiscountSource
      : discountValueField.value.trim() ? 'manual' : '';
    finalUrlSource = values.__hub_final_url_source === 'presell'
      ? 'presell'
      : finalUrlField.value.trim() ? 'manual' : '';
    finalUrlAutoValue = finalUrlSource === 'presell'
      ? String(values.__hub_final_url_auto_value || finalUrlField.value || '').trim()
      : '';
    promotionTargetSource = ['campaign','copy'].includes(values.__hub_promotion_target_source)
      ? values.__hub_promotion_target_source
      : promotionTargetField.value.trim() ? 'manual' : '';
    promotionTargetAutoValue = ['campaign','copy'].includes(promotionTargetSource)
      ? String(values.__hub_promotion_target_auto_value || promotionTargetField.value || '').trim()
      : '';
    updateCurrencyHints();
    updateBiddingStrategyFields();
    updatePromotionTriggerFields();
    updatePromotionDiscountFields();
    updatePromotionDiscountDetection();
    updateClickBankKeywordImportState();
    updateFinalUrlFromPreSell();
    updatePromotionTargetFromCampaign();
    renderCpaVariantOptions({ selectedPercents: savedCpaVariants });
    clearPreview({ preserveStoredPreview: true });
    restoringDraft = false;
    draftDirty = false;
    draftForce = false;
    if(campaignDeliverySource)renderCpaVariantOptions();
  }

  function persistActiveDraftSelection(draftId) {
    const latestStore = loadGoogleAdsCampaignDrafts();
    const nextStore = { schemaVersion: 1, activeDraftId: draftId, drafts: latestStore.drafts };
    saveGoogleAdsCampaignDrafts(nextStore);
    draftStore = nextStore;
  }

  function restoreDraft(draft) {
    if (!draft) return false;
    activeDraftId = draft.id;
    let selectionError = '';
    if (draftStore.activeDraftId !== draft.id) {
      try { persistActiveDraftSelection(draft.id); }
      catch (error) { selectionError = error.message || 'Não foi possível marcar esta análise como atual.'; }
    }
    applyDraftValues(draft.values);
    updateFinalUrlFromPreSell();
    updatePromotionTargetFromCampaign();
    refreshDraftPicker();
    const hasAccount = Boolean(selectedAccount());
    const isPreparation = isPresellPreparationDraft(draft);
    const recoveredStatus = isPreparation
      ? 'Entrega em preparação recuperada do armazenamento local deste navegador.'
      : hasAccount ? 'Análise recuperada do armazenamento local deste navegador.'
        : 'Análise recuperada. A MCC ou conta salva não está na lista atual; atualize a lista para continuar.';
    setDraftStatus(selectionError || recoveredStatus, Boolean(selectionError) || (!isPreparation && !hasAccount));
    updateSelectionMessage();
    void restoreSavedPreview(draft.id);
    return true;
  }

  function resetForNewDraft() {
    restoringDraft = true;
    pendingDraftSitelinks = [];
    pendingClickBankOfferKeyRestore = '';
    campaignDeliverySource = null;
    deliveryCpaStart=40;deliveryCpaSelections=new Set([40]);deliveryAutoName='';deliveryAutoCpa='';deliveryQuoteRequested=false;
    activePresellCampaignHandoff = null;
    finalUrlSource = '';
    finalUrlAutoValue = '';
    promotionTargetSource = '';
    promotionTargetAutoValue = '';
    form.reset();
    updateCampaignDeliveryGeoField();
    clickBankKeywordSources = mergeCampaignDeliveryKeywordSource(clickBankKeywordSources);
    renderClickBankKeywordSources('');
    discountValueField.dataset.discountValueSource = '';
    discountDetectionStatus.textContent = '';
    discountDetectionStatus.hidden = true;
    managerSelect.value = '';
    renderAccountOptions('', { selectFirst: false });
    accountSelect.value = '';
    for (const control of form.querySelectorAll('[name]')) control.setCustomValidity('');
    form.elements.namedItem('start_date').required = false;
    form.elements.namedItem('end_date').required = false;
    updateCurrencyHints();
    updateBiddingStrategyFields();
    updatePromotionTriggerFields();
    updatePromotionDiscountFields();
    detectPromotionLanguageFromCopy();
    updateClickBankKeywordImportState();
    updateFinalUrlFromPreSell();
    updatePromotionTargetFromCampaign();
    renderCpaVariantOptions();
    clearPreview({ preserveStoredPreview: true });
    restoringDraft = false;
    draftDirty = false;
    draftForce = false;
    refreshDraftPicker();
    setDraftStatus('Nova campanha em branco. Os contextos anteriores continuam salvos neste navegador.');
    updateSelectionMessage();
  }

  function beginNewDraft({ openCopyImport = true } = {}) {
    if (busy || creating) return false;
    if (!saveDraftNow()) return false;
    if (activeCampaignBatchId) {
      saveAudienceStateForCurrentCampaign();
      if (!saveActiveCampaignBatch()) return false;
    }
    clearCampaignBatchPositiveKeywordsSaveTimer();
    try { persistActiveDraftSelection(''); }
    catch (error) { setDraftStatus(error.message || 'Não foi possível iniciar uma nova análise com segurança.', true); return false; }
    activeDraftId = '';
    clearCampaignImageBatchPreviews();
    activeCampaignBatchId = '';
    activeCampaignBatchCreatedAt = '';
    activeCampaignBatchPositiveKeywords = { inputText: '', preview: null, result: null, updatedAt: '' };
    campaignBatchPositiveKeywordsMessage = '';
    resetCampaignDestinationUrlBatchState();
    campaignStatusLog = null;
    activeCampaignBatchFormSnapshot = null;
    activeCampaignBatchFormRestored = false;
    campaignSitelinksBatchApplying = false;
    campaignSitelinksBatchAttempted = false;
    campaignSitelinksBatchProgress = null;
    imageUploadConfirmed = false;
    imageUploadConfirmedAccountIds = [];
    campaignImageUploadSelectedAccountIds = null;
    campaignImageAssetUploads = [];
    campaignImageUploadFiles = [];
    campaignImageUploadNeedsAdjustment = [];
    campaignImageUploadFilesSource = 'none';
    campaignImageUploadSelectionError = '';
    campaignImageUploadSelectionBusy = false;
    campaignImageUploadProgress = null;
    campaignImageUploadApplying = false;
    campaignBatchRestored = false;
    completed = false;
    uncertain = false;
    createdCampaign = null;
    createdCampaigns = [];
    batchEntries = [];
    audienceStateByCampaign = new Map();
    audienceTargetingResult = null;
    audienceTargetingError = '';
    audienceExclusionsResult = null;
    audienceExclusionsError = '';
    audienceExclusionsBatchApplying = false;
    audienceExclusionsBatchAttempted = false;
    audienceExclusionsBatchProgress = null;
    clearCopyImportSource();
    refreshCampaignBatchPicker();
    resetForNewDraft();
    if (!rememberCampaignCreationContext('new')) {
      setDraftStatus(activeCampaignContextStorageError + ' O formulário novo continua aberto, mas a tela pode não restaurá-lo após um refresh.', true);
    }
    renderCampaignResult();
    if (openCopyImport) {
      openCopyImportDialog('campaign', { restoreCache: false, allowClipboardRead: false });
    }
    return true;
  }

  function clearPresellHandoffQuery() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(GOOGLE_ADS_PRESELL_HANDOFF_QUERY_PARAM);
      url.searchParams.delete(GOOGLE_ADS_PRESELL_HANDOFF_JOB_QUERY_PARAM);
      window.history.replaceState(window.history.state, '', url.href);
    } catch { /* A transferência e o rascunho continuam salvos mesmo se a URL não puder ser limpa. */ }
  }

  function clearCampaignDeliveryQuery(id = campaignDeliveryQueryId) {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('campaign_delivery_id') === String(id || '')) {
        url.searchParams.delete('campaign_delivery_id');
        window.history.replaceState(window.history.state, '', url.href);
      }
    } catch { /* O vínculo também fica salvo no rascunho local. */ }
  }

  function acknowledgeReceivedPresellHandoff(payload) {
    const fingerprint = googleAdsPresellCampaignHandoffFingerprint(payload);
    if (!acknowledgeGoogleAdsPresellCampaignHandoff(payload, fingerprint)) {
      setDraftStatus('Dados da Pre-Sell salvos, mas o Hub não conseguiu confirmar o recebimento para a Ficha e Presell. Tente novamente sem reenviar os dados.', true);
      setStatus('A transferência foi salva neste navegador, mas a confirmação final não foi registrada. Nenhuma consulta à Google Ads API foi feita.', true);
      return false;
    }
    consumeGoogleAdsPresellCampaignHandoff(payload.id);
    clearPresellHandoffQuery();
    setDraftStatus('Pre-Sell recebida e salva neste navegador · ' + (String(payload.product || '').trim() || 'produto') + '.');
    setStatus('Entrega em preparação recebida: produto, ' + payload.targets.length + ' conta(s) e URLs HTTPS publicadas. As campanhas ainda não foram criadas; a copy e os e-mails não foram transferidos. Nenhuma consulta à Google Ads API foi feita.', false, false, true);
    return true;
  }

  function receivePresellHandoff(id = (new URLSearchParams(window.location.search).get(GOOGLE_ADS_PRESELL_HANDOFF_QUERY_PARAM) || ''), payloadOverride = null) {
    const queryId = String(id || '').trim();
    if (!queryId) return false;
    const payload = payloadOverride
      ? validateGoogleAdsPresellCampaignHandoff(payloadOverride)
      : readGoogleAdsPresellCampaignHandoff(queryId);
    if (!payload || payload.id !== queryId) {
      setStatus('A transferência da Pre-Sell não está disponível neste navegador. Volte à Ficha e Presell e envie os dados novamente.', true);
      return false;
    }
    if (!directory?.accounts?.length) {
      setStatus('A transferência está aguardando a lista local de MCCs e contas. Atualize ou carregue essa lista; abrir a transferência não consulta a Google Ads API.', false, false, true);
      return false;
    }
    const accountMap = new Map(directory.accounts.map(account => [String(account.customerId || '').replace(/\D/g, ''), account]));
    const resolved = payload.targets.map(target => ({ target, account: accountMap.get(target.accountId) || null }));
    const missing = resolved.filter(item => !item.account);
    if (missing.length) {
      setStatus('A transferência contém conta(s) que não estão no diretório local (' + missing.map(item => item.target.accountId).join(', ') + '). Atualize MCCs e contas e tente receber novamente; nada foi alterado.', true);
      return false;
    }
    const managers = [...new Set(resolved.map(item => String(item.account.managerCustomerId || '').replace(/\D/g, '')).filter(Boolean))];
    if (managers.length !== 1 || resolved.some(item => !/^\d{10}$/.test(String(item.account.managerCustomerId || '').replace(/\D/g, '')))) {
      setStatus('As contas transferidas não pertencem a uma única MCC acessível no diretório local. Revise a seleção na Ficha e Presell; nada foi alterado.', true);
      return false;
    }
    const existingTransferDraft = draftStore.drafts.find(draft => draft.values?.__hub_presell_campaign_handoff?.id === payload.id);
    if (existingTransferDraft) {
      if (busy || creating) {
        setStatus('Finalize a ação atual antes de retomar a transferência da Pre-Sell.', true);
        return false;
      }
      openSavedDraft(existingTransferDraft.id);
      if (activeDraftId !== existingTransferDraft.id || activeCampaignBatchId || !saveDraftNow()) {
        setStatus(draftStatus.classList.contains('is-error') ? draftStatus.textContent : 'Não foi possível abrir a preparação salva da Pre-Sell.', true);
        return false;
      }
      return acknowledgeReceivedPresellHandoff(payload);
    }
    if (!beginNewDraft({ openCopyImport: false })) {
      setStatus(draftStatus.classList.contains('is-error') ? draftStatus.textContent : 'Não foi possível iniciar a preparação da Pre-Sell. Tente novamente.', true);
      return false;
    }

    const managerId = managers[0];
    const firstTarget = resolved[0];
    restoringDraft = true;
    activePresellCampaignHandoff = payload;
    managerSelect.value = managerId;
    renderAccountOptions(firstTarget.target.accountId, { selectFirst: false });
    accountSelect.value = firstTarget.target.accountId;
    form.elements.namedItem('source_product').value = payload.product;
    finalUrlField.value = firstTarget.target.url;
    finalUrlSource = 'presell';
    finalUrlAutoValue = firstTarget.target.url;
    updateCurrencyHints();
    renderCpaVariantOptions();
    updateFinalUrlFromPreSell();
    updatePromotionTargetFromCampaign();
    renderCampaignTargetSummary();
    updateSelectionMessage();
    clearPreview();
    restoringDraft = false;
    scheduleDraftSave({ force: true });
    if (!saveDraftNow()) {
      setStatus('Não foi possível salvar a entrega em preparação com os dados recebidos. A transferência continua disponível; corrija o armazenamento e tente novamente.', true);
      return false;
    }
    return acknowledgeReceivedPresellHandoff(payload);
  }

  function receivePresellHandoffFromJob(jobId = handoffJobQueryId) {
    const selected = readSelectedGoogleAdsPresellCampaignHandoff({ jobId });
    if (!selected?.ok || !selected.payload) {
      const reason = selected?.reason === 'storage-unavailable'
        ? 'O navegador não conseguiu ler o lote local da Pre-Sell.'
        : selected?.reason === 'selected-job-not-found'
          ? 'O lote local da Pre-Sell não foi encontrado neste navegador.'
          : selected?.reason === 'invalid-selected-job'
            ? 'Os dados do lote da Pre-Sell não puderam ser validados.'
            : selected?.reason || 'A Pre-Sell deste lote não pôde ser revalidada.';
      setStatus(reason + ' Volte à Ficha e Presell para conferir o lote; nenhuma consulta à Google Ads API foi feita.', true);
      return false;
    }
    return receivePresellHandoff(selected.payload.id, selected.payload);
  }

  function receiveInitialContexts() {
    let params = new URLSearchParams(window.location.search);
    const handoffId = params.get(GOOGLE_ADS_PRESELL_HANDOFF_QUERY_PARAM) || '';
    const jobId = params.get(GOOGLE_ADS_PRESELL_HANDOFF_JOB_QUERY_PARAM) || '';
    if (handoffId || jobId) {
      const received = handoffId ? receivePresellHandoff(handoffId) : receivePresellHandoffFromJob(jobId);
      if (!received) return false;
    }
    params = new URLSearchParams(window.location.search);
    const deliveryId = params.get('campaign_delivery_id') || '';
    return deliveryId ? receiveCampaignDeliveryContext(deliveryId) : true;
  }

  function receiveCampaignDeliveryContext(id = campaignDeliveryQueryId) {
    const queryId = String(id || '').trim();
    if (!queryId) return false;
    const delivery = getCampaignDelivery(queryId);
    if (!delivery) {
      setStatus('A entrega local não está disponível neste navegador. Volte à Curadoria e abra novamente a etapa de criação de campanha.', true);
      return false;
    }
    if (activeDraftId && campaignDeliverySource?.deliveryId === queryId) {
      const refreshedSource = campaignDeliveryKeywordSource(delivery);
      if (refreshedSource && campaignDeliverySource.geoTargetingMode !== refreshedSource.geoTargetingMode) {
        campaignDeliverySource = { ...campaignDeliverySource, geoTargetingMode: refreshedSource.geoTargetingMode, countries: refreshedSource.countries };
        const refreshedCountryField = form.elements.namedItem('geo_target_country_codes');
        refreshedCountryField.value = refreshedSource.geoTargetingMode === 'WORLD' ? '' : refreshedSource.countries.join(', ');
        updateCampaignDeliveryGeoField();
        clearPreview();
        scheduleDraftSave({ force: true });
        saveDraftNow();
      } else updateCampaignDeliveryGeoField();
      clearCampaignDeliveryQuery(queryId);
      setDraftStatus('Preparação desta entrega recuperada do navegador, incluindo os campos salvos.');
      return true;
    }
    if (busy || creating || completed || uncertain || activeCampaignBatchId) {
      setStatus('Finalize a ação ou encerre o lote aberto antes de iniciar uma nova entrega local. Nenhum dado foi substituído.', true);
      return false;
    }
    const deliveryProduct = String(delivery.productName || '').trim();
    const productField = form.elements.namedItem('source_product');
    const countryField = form.elements.namedItem('geo_target_country_codes');
    const currentProduct = String(productField?.value || '').trim();
    const parsedName = parseGoogleAdsCampaignName(form.elements.namedItem('campaign_name')?.value || '');
    const namedProduct = currentProduct || (parsedName.ok ? String(parsedName.product || '').trim() : '');
    const normalizeProduct = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
    if (namedProduct && deliveryProduct && normalizeProduct(namedProduct) !== normalizeProduct(deliveryProduct)) {
      setStatus('A entrega local é de “' + deliveryProduct + '”, mas o rascunho está usando “' + namedProduct + '”. Os dados foram preservados para não misturar ofertas.', true);
      return false;
    }

    if(campaignDeliverySource?.deliveryId!==delivery.id){deliveryCpaStart=40;deliveryCpaSelections=new Set([40]);deliveryAutoName='';deliveryAutoCpa='';deliveryQuoteRequested=false;deliveryBrandBiddingOverride=false;}
    campaignDeliverySource = campaignDeliveryKeywordSource(delivery);
    updateCampaignDeliveryGeoField();
    const selectedOfferKey = campaignDeliverySource ? keywordSourceKey(campaignDeliverySource) : clickBankOfferSelect.value || pendingClickBankOfferKeyRestore || '';
    clickBankKeywordSources = mergeCampaignDeliveryKeywordSource(clickBankKeywordSources);
    renderClickBankKeywordSources(selectedOfferKey);
    let changed = false;
    if (productField && !String(productField.value || '').trim() && deliveryProduct) {
      productField.value = deliveryProduct;
      changed = true;
    }
    const rawCountries = Array.isArray(campaignDeliverySource?.countries) ? [...new Set(campaignDeliverySource.countries.map(value => String(value || '').trim().toUpperCase()).filter(Boolean))] : [];
    if (campaignDeliverySource?.geoTargetingMode !== 'WORLD' && rawCountries.some(country => !/^[A-Z]{2}$/.test(country))) {
      setStatus('A entrega contém um código de país inválido. Corrija os países na Curadoria antes de criar campanhas.', true);
      return false;
    }
    const normalizedDeliveryCountries = normalizeGoogleAdsCountryCodeInput(rawCountries.join(', '));
    const countries = normalizedDeliveryCountries.countryCodes;
    setGeoCountryNormalizationStatus(normalizedDeliveryCountries.aliases);
    const currentCountries = normalizeGoogleAdsCountryCodeInput(countryField?.value || '').countryCodes;
    if (countryField && campaignDeliverySource?.geoTargetingMode === 'WORLD' && countryField.value) {
      countryField.value = '';
      changed = true;
    } else if (countryField && countries.length && JSON.stringify(currentCountries) !== JSON.stringify(countries)) {
      countryField.value = countries.join(', ');
      changed = true;
    }
    const priorFinalUrl = String(finalUrlField.value || '').trim();
    updateCurrencyHints();
    updateFinalUrlFromPreSell();
    if (String(finalUrlField.value || '').trim() !== priorFinalUrl) changed = true;
    const keywordImport = importCampaignDeliveryKeywords();
    if (changed) clearPreview();
    renderCampaignTargetSummary();
    updateSelectionMessage();
    renderCpaVariantOptions();
    scheduleDraftSave({ force: true });
    if (!saveDraftNow()) {
      setStatus('A entrega local foi carregada na tela, mas o rascunho não pôde ser salvo neste navegador. O vínculo permanece na URL para você tentar novamente.', true);
      return false;
    }
    const keywordStatus = keywordImport.imported
      ? ' As palavras-chave disponíveis foram carregadas automaticamente.'
      : keywordImport.confirmationRequired
        ? ' Os termos diferentes foram preservados; a tela oferece a substituição com confirmação.'
        : keywordImport.empty
          ? ' A entrega não tinha candidatas; os campos atuais foram mantidos.'
          : keywordImport.error
            ? ' Os termos foram preservados porque a lista da entrega precisa de correção.'
            : '';
    setStatus('Entrega local recebida: o país de destino veio da seleção salva na Curadoria; produto e fonte de candidatas foram vinculados ao fluxo.'+keywordStatus+' O link de afiliado não é URL final; a URL final só vem da etapa publicada da Pre-Sell. Nenhuma chamada à Google Ads API foi feita.', false, false, true);
    clearCampaignDeliveryQuery(queryId);
    return true;
  }

  function deleteSelectedDraft(draftId = '') {
    if (busy || creating) return;
    const selectedValue = draftId ? 'draft:' + draftId : draftPicker.value;
    if (!selectedValue.startsWith('draft:') || selectedValue === 'draft:__new__') return;
    draftId = selectedValue.slice('draft:'.length);
    const selectedDraft = draftStore.drafts.find(draft => draft.id === draftId);
    if (!selectedDraft) {
      refreshDraftPicker();
      setDraftStatus('Esse rascunho não está mais disponível neste navegador.', true);
      return;
    }
    if (!window.confirm('Excluir o rascunho “' + labelForDraft(selectedDraft) + '”? Essa ação não pode ser desfeita.')) return;
    const activeDraftWillBeDeleted = activeDraftId === draftId;
    if (activeDraftWillBeDeleted && !saveDraftNow()) return;

    let latestStore;
    try { latestStore = loadGoogleAdsCampaignDrafts(); }
    catch (error) {
      setDraftStatus(error.message || 'Não foi possível carregar os rascunhos para exclusão.', true);
      refreshDraftPicker();
      return;
    }
    const latestDraft = latestStore.drafts.find(draft => draft.id === draftId);
    if (!latestDraft) {
      draftStore = latestStore;
      refreshDraftPicker();
      setDraftStatus('Esse rascunho já foi removido deste navegador.', true);
      return;
    }

    const remainingDrafts = latestStore.drafts.filter(draft => draft.id !== draftId);
    const nextDraft = activeDraftWillBeDeleted ? newestDraft(remainingDrafts) : null;
    const activeSelection = activeDraftWillBeDeleted
      ? (nextDraft?.id || '')
      : latestStore.drafts.some(draft => draft.id === latestStore.activeDraftId && draft.id !== draftId)
        ? latestStore.activeDraftId : '';
    const nextStore = { ...latestStore, activeDraftId: activeSelection, drafts: remainingDrafts };
    try { saveGoogleAdsCampaignDrafts(nextStore); }
    catch (error) {
      setDraftStatus(error.message || 'Não foi possível excluir o rascunho.', true);
      refreshDraftPicker();
      return;
    }
    draftStore = nextStore;

    if (!activeDraftWillBeDeleted) {
      refreshDraftPicker();
      setDraftStatus('Rascunho excluído · ' + labelForDraft(latestDraft) + '.');
      return;
    }

    activeDraftId = '';
    if (nextDraft) {
      openSavedDraft(nextDraft.id);
      setDraftStatus('Rascunho excluído · aberto o rascunho salvo mais recentemente.');
      return;
    }

    activeCampaignBatchId = '';
    clearCampaignImageBatchPreviews();
    activeCampaignBatchCreatedAt = '';
    resetCampaignDestinationUrlBatchState();
    campaignStatusLog = null;
    campaignBatchRestored = false;
    completed = false;
    uncertain = false;
    createdCampaign = null;
    createdCampaigns = [];
    batchEntries = [];
    audienceStateByCampaign = new Map();
    audienceTargetingResult = null;
    audienceTargetingError = '';
    audienceExclusionsResult = null;
    audienceExclusionsError = '';
    clearPreview({ preserveStoredPreview: true });
    resetForNewDraft();
    renderCampaignResult();
    updateControlState();
    const nextBatch = newestCampaignBatch();
    if (nextBatch) {
      openSavedCampaignBatch(nextBatch.id);
      setDraftStatus('Rascunho excluído · aberto o lote salvo mais recentemente.');
    } else {
      refreshDraftPicker();
      setDraftStatus('Rascunho excluído · o formulário está pronto para uma nova análise.');
    }
  }

  function openSavedDraft(draftId) {
    if (!draftId || busy || creating) return;
    if (!saveDraftNow()) { refreshDraftPicker(); return; }
    if (activeCampaignBatchId) {
      saveAudienceStateForCurrentCampaign();
      if (!saveActiveCampaignBatch()) { refreshDraftPicker(); return; }
    }
    let latestStore;
    try { latestStore = loadGoogleAdsCampaignDrafts(); }
    catch (error) { setDraftStatus(error.message, true); refreshDraftPicker(); return; }
    draftStore = latestStore;
    const draft = draftStore.drafts.find(item => item.id === draftId);
    if (!draft) { refreshDraftPicker(); setDraftStatus('Essa análise não está mais salva neste navegador.', true); return; }
    activeCampaignBatchId = '';
    clearCampaignImageBatchPreviews();
    activeCampaignBatchCreatedAt = '';
    resetCampaignDestinationUrlBatchState();
    campaignStatusLog = null;
    activeCampaignBatchFormSnapshot = null;
    activeCampaignBatchFormRestored = false;
    imageUploadConfirmed = false;
    imageUploadConfirmedAccountIds = [];
    campaignImageUploadSelectedAccountIds = null;
    campaignImageAssetUploads = [];
    campaignImageUploadFiles = [];
    campaignImageUploadNeedsAdjustment = [];
    campaignImageUploadFilesSource = 'none';
    campaignImageUploadSelectionError = '';
    campaignImageUploadSelectionBusy = false;
    campaignImageUploadProgress = null;
    campaignImageUploadApplying = false;
    campaignBatchRestored = false;
    completed = false;
    uncertain = false;
    createdCampaign = null;
    createdCampaigns = [];
    batchEntries = [];
    audienceStateByCampaign = new Map();
    audienceTargetingResult = null;
    audienceTargetingError = '';
    audienceExclusionsResult = null;
    audienceExclusionsError = '';
    audienceExclusionsBatchApplying = false;
    audienceExclusionsBatchAttempted = false;
    audienceExclusionsBatchProgress = null;
    refreshCampaignBatchPicker();
    restoreDraft(draft);
    if (!rememberCampaignCreationContext('draft', draft.id)) {
      setDraftStatus(activeCampaignContextStorageError + ' A análise abriu, mas pode não ser retomada automaticamente após um refresh.', true);
    }
    renderCampaignResult();
  }

  function openSavedContext(value) {
    if (busy || creating) return;
    if (value === 'draft:__new__') {
      if (activeCampaignBatchId) clearActiveCampaignBatchView();
      else refreshDraftPicker();
      if (!rememberCampaignCreationContext('new')) {
        setDraftStatus(activeCampaignContextStorageError + ' O formulário continua aberto, mas esta escolha pode não ser retomada após um refresh.', true);
      }
      return;
    }
    if (value.startsWith('draft:')) {
      openSavedDraft(value.slice('draft:'.length));
      return;
    }
    if (value.startsWith('batch:')) {
      openSavedCampaignBatch(value.slice('batch:'.length));
      return;
    }
    refreshDraftPicker();
  }

  function selectedAccount() {
    const customerId = accountSelect.value;
    return directory?.accounts?.find(account => account.customerId === customerId
      && account.managerCustomerId === managerSelect.value) || null;
  }

  function accountForCampaign(campaign) {
    return directory?.accounts?.find(account => String(account.customerId || '') === String(campaign?.customerId || '')
      && String(account.managerCustomerId || '') === String(campaign?.managerCustomerId || '')) || null;
  }

  function referenceAccount() {
    const targets = campaignTargetState().targets;
    return targets.find(target => target.account)?.account || selectedAccount();
  }

  function updateCurrencyHints() {
    const currency = referenceAccount()?.currencyCode || '';
    const mixedCurrencies = new Set(campaignTargetState().targets.map(target => target.currencyCode).filter(Boolean)).size > 1;
    const currencyLabel = currency ? currency + (mixedCurrencies ? ' da conta modelo' : '') : '';
    const hints = [...form.querySelectorAll('[data-creation-currency]')];
    if (currency) {
      hints[0].textContent = currencyLabel;
      hints[1].textContent = currencyLabel + ', para o grupo';
    } else {
      hints[0].textContent = 'moeda da conta';
      hints[1].textContent = 'moeda da conta, para o grupo';
    }
    page.querySelector('[data-bid-currency]').textContent = currencyLabel || 'moeda da conta';
    updateBiddingStrategyFields();
  }

  function updateBiddingStrategyFields() {
    const strategy = biddingStrategyField.value || 'TARGET_CPA';
    const cpaLabel = page.querySelector('[data-bidding-field="target-cpa"]');
    const roasLabel = page.querySelector('[data-bidding-field="target-roas"]');
    const maxCpcLabel = page.querySelector('[data-bidding-field="max-cpc"]');
    const impressionFields = [...page.querySelectorAll('[data-bidding-field="impression-share"]')];
    const usesCpa = strategy === 'TARGET_CPA' || strategy === 'MAXIMIZE_CONVERSIONS';
    const needsCpa = strategy === 'TARGET_CPA';
    const usesRoas = strategy === 'TARGET_ROAS' || strategy === 'MAXIMIZE_CONVERSION_VALUE';
    const needsRoas = strategy === 'TARGET_ROAS';
    const usesMaxCpc = ['MANUAL_CPC', 'MAXIMIZE_CLICKS', 'TARGET_IMPRESSION_SHARE'].includes(strategy);
    const needsMaxCpc = ['MANUAL_CPC', 'TARGET_IMPRESSION_SHARE'].includes(strategy);
    const usesImpressionShare = strategy === 'TARGET_IMPRESSION_SHARE';
    page.querySelector('.google-ads-creation-budget-grid').classList.toggle('has-no-max-cpc', !usesMaxCpc);
    cpaLabel.hidden = !usesCpa;
    targetCpaField.disabled = !usesCpa;
    targetCpaField.required = needsCpa;
    roasLabel.hidden = !usesRoas;
    targetRoasField.disabled = !usesRoas;
    targetRoasField.required = needsRoas;
    maxCpcLabel.hidden = !usesMaxCpc;
    maxCpcBidField.disabled = !usesMaxCpc;
    maxCpcBidField.required = needsMaxCpc;
    impressionFields.forEach(field => { field.hidden = !usesImpressionShare; });
    const impressionLocation = form.elements.namedItem('impression_share_location');
    const impressionPercent = form.elements.namedItem('impression_share_percent');
    impressionLocation.disabled = !usesImpressionShare;
    impressionPercent.disabled = !usesImpressionShare;
    impressionLocation.required = usesImpressionShare;
    impressionPercent.required = usesImpressionShare;
    const maxCpcLabelText = page.querySelector('[data-max-cpc-label]');
    maxCpcLabelText.firstChild.textContent = strategy === 'MAXIMIZE_CLICKS' ? 'Limite de CPC ' : 'CPC máximo ';
    const currency = referenceAccount()?.currencyCode || 'moeda da conta';
    const mixedCurrencies = new Set(campaignTargetState().targets.map(target => target.currencyCode).filter(Boolean)).size > 1;
    const currencyLabel = currency + (mixedCurrencies ? ' da conta modelo' : '');
    maxCpcLabelText.querySelector('small').textContent = strategy === 'MANUAL_CPC'
      ? currencyLabel + ', para o grupo'
      : (strategy === 'MAXIMIZE_CLICKS' ? 'limite opcional · ' : 'limite · ') + currencyLabel;
    const help = page.querySelector('[data-bidding-help]');
    const helpByStrategy = {
      TARGET_CPA: 'CPA desejado usa a ação da meta personalizada de compra do Hub. O valor precisa estar na moeda da conta. A lista de estratégias é fixa e não consulta a API.',
      MAXIMIZE_CONVERSIONS: 'Maximizar conversões usa a meta personalizada de compra do Hub; o CPA desejado é opcional e precisa usar a moeda da conta. A lista é fixa e não consulta a API.',
      TARGET_ROAS: 'ROAS desejado usa os valores da meta personalizada de compra do Hub e requer conversões com valor. Informe o ROAS como percentual (200 = 2,0x).',
      MAXIMIZE_CONVERSION_VALUE: 'Maximizar valor da conversão usa a meta personalizada de compra do Hub e depende de valores de conversão corretos; o ROAS desejado é opcional.',
      MAXIMIZE_CLICKS: 'Maximizar cliques pode usar um limite opcional de CPC na moeda da conta.',
      TARGET_IMPRESSION_SHARE: 'Parcela de impressões exige local, percentual alvo e limite de CPC na moeda da conta.',
      MANUAL_CPC: 'CPC manual usa o limite informado por grupo. A lista de estratégias é fixa e não consulta a API.',
    };
    help.textContent = (helpByStrategy[strategy] || helpByStrategy.TARGET_CPA)
      + (mixedCurrencies ? ' Os valores monetários informados na conta modelo serão convertidos para cada conta destino usando a cotação PTAX USD/BRL; moedas diferentes de USD/BRL exigem que a conta modelo e o destino tenham a mesma moeda.' : '')
      + ' Novas campanhas usam a meta "meta personalizada da ação compra" com "Conversão compra off-line (upload)"; o Hub confirma essa configuração na prévia e depois da criação pausada.'
      + ' O MVP segmenta países inteiros. Pesquisa Google é sempre incluída; parceiros e Display são opcionais.';
  }

  function setCampaignNameParseStatus(message, isError = false, isWarning = false) {
    nameParseStatus.textContent = message;
    nameParseStatus.classList.toggle('is-error', isError);
    nameParseStatus.classList.toggle('is-warning', isWarning);
    nameParseStatus.classList.toggle('is-success', !isError && Boolean(message));
  }

  function addCampaignNameDetail(label, value) {
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    nameParseDetails.append(term, detail);
  }

  let campaignNameQuoteRequest = 0;

  function calculateCampaignNameDetails() {
    parsedCampaignName = parseGoogleAdsCampaignName(nameParseInput.value);
    nameParseDetails.replaceChildren();
    if (!parsedCampaignName.ok) {
      setCampaignNameParseStatus(parsedCampaignName.error, true);
      nameParseApplyButton.disabled = true;
      return;
    }
    const accountCurrency = campaignNameAccountCurrency();
    const quote = currentUsdBrlQuote();
    const conversionRequired = parsedCampaignName.commissionCurrency === 'USD' && accountCurrency === 'BRL';
    const targets = campaignTargetState().targets;
    const targetCurrencies = [...new Set(targets.map(target => target.currencyCode).filter(Boolean))];
    const needsRate = campaignNeedsUsdBrlRate(parsedCampaignName.commissionCurrency, accountCurrency, targets);
    const directCurrencyMatch = accountCurrency === parsedCampaignName.commissionCurrency;
    const cpaCalculation = directCurrencyMatch
      ? commissionCpaForTargetCurrency({ commission: parsedCampaignName.commissionAmount, percent: parsedCampaignName.targetCpaPercent, sourceCurrency: parsedCampaignName.commissionCurrency, targetCurrency: accountCurrency })
      : currencyPairNeedsUsdBrlRate(parsedCampaignName.commissionCurrency, accountCurrency) && isUsableUsdBrlQuote(quote)
        ? commissionCpaForTargetCurrency({ commission: parsedCampaignName.commissionAmount, percent: parsedCampaignName.targetCpaPercent, sourceCurrency: parsedCampaignName.commissionCurrency, targetCurrency: accountCurrency, usdBrlRate: Number(quote.rate) })
        : null;
    parsedCampaignName.accountCpaAmount = cpaCalculation?.targetAmount || '';
    parsedCampaignName.accountCpaCurrency = cpaCalculation?.targetCurrency || '';
    parsedCampaignName.usdBrlRate = needsRate && isUsableUsdBrlQuote(quote) ? String(quote.rate) : '';
    parsedCampaignName.usdBrlQuoteDate = parsedCampaignName.usdBrlRate ? String(quote.quoteDate || quote.quotedAt || '').slice(0, 10) : '';
    parsedCampaignName.usdBrlRetrievedAt = parsedCampaignName.usdBrlRate ? String(quote.retrievedAt || '') : '';
    addCampaignNameDetail('Data no nome', parsedCampaignName.sourceDate + ' (informativa; não muda datas da promoção)');
    addCampaignNameDetail('Produto e iteração', parsedCampaignName.product + ' · ' + parsedCampaignName.iteration);
    addCampaignNameDetail('Plataforma', parsedCampaignName.platform + ' (' + parsedCampaignName.platformCode + ')');
    addCampaignNameDetail('Modelo de lance do nome', parsedCampaignName.biddingModel + ' (' + parsedCampaignName.biddingModelCode + ')');
    addCampaignNameDetail('GEOs', parsedCampaignName.geoTargetingMode === 'WORLD' ? 'Mundo (todas as regiões)' : parsedCampaignName.countries.join(', '));
    if (parsedCampaignName.countryCodeAliases?.length) {
      addCampaignNameDetail('Normalização Google Ads', parsedCampaignName.countryCodeAliases.map(alias => alias.from + ' → ' + alias.to).join(', '));
    }
    if (parsedCampaignName.destination) addCampaignNameDetail('Destino marcado', parsedCampaignName.destination);
    else if (parsedCampaignName.extraTags.length) addCampaignNameDetail('Tags adicionais', parsedCampaignName.extraTags.join(', '));
    addCampaignNameDetail('Comissão e percentual', parsedCampaignName.commissionCurrency + ' ' + parsedCampaignName.commissionAmount + ' × ' + parsedCampaignName.targetCpaPercent + '%');
    if (needsRate && parsedCampaignName.usdBrlRate) {
      addCampaignNameDetail('CPA de origem', formatMoneyMicros(Number(cpaCalculation.sourceAmount) * 1_000_000, parsedCampaignName.commissionCurrency));
      addCampaignNameDetail('Cotação usada', 'PTAX venda BCB · US$ 1 = R$ ' + Number(parsedCampaignName.usdBrlRate).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
        + (parsedCampaignName.usdBrlQuoteDate ? ' · ' + parsedCampaignName.usdBrlQuoteDate : '')
        + (quote.isStale ? ' · última cotação válida em cache' : ''));
    }
    addCampaignNameDetail('CPA calculado na moeda da conta', cpaCalculation
      ? formatMoneyMicros(Number(cpaCalculation.targetAmount) * 1_000_000, accountCurrency)
      : formatMoneyMicros(Number(parsedCampaignName.desiredCpa) * 1_000_000, parsedCampaignName.commissionCurrency) + ' · sem conversão aplicada');
    addCampaignNameDetail('Moeda das contas de destino', accountCurrency || 'Não identificada na lista local');
    if (targetCurrencies.length > 1) addCampaignNameDetail('Moedas do lote', targetCurrencies.join(' · ') + ' · valores monetários convertidos por conta');
    if (needsRate && parsedCampaignName.usdBrlRate && cpaCalculation) {
      setCampaignNameParseStatus('O CPA base será aplicado na moeda da conta de referência; CPA e demais valores monetários serão convertidos para a moeda de cada destino por PTAX USD/BRL. O rascunho guardará a taxa e a data usadas.'
        + (quote.isStale ? ' A cotação em cache está desatualizada e será usada porque o Banco Central não retornou uma atualização.' : ''), false, Boolean(quote.isStale));
    } else if (directCurrencyMatch) {
      setCampaignNameParseStatus('O botão Aplicar preencherá o nome, os GEOs e o CPA desejado na moeda da conta. NBB/BB ficam como metadados do padrão e não mudam a estratégia selecionada no combo.');
    } else {
      setCampaignNameParseStatus('A moeda da comissão (' + parsedCampaignName.commissionCurrency + ') difere da moeda da conta (' + (accountCurrency || 'desconhecida') + '). O nome e os GEOs podem ser aplicados, mas o CPA calculado não será preenchido. Para o lote, o Hub só converte USD/BRL e precisa de cotação PTAX válida.', false, true);
    }
    nameParseApplyButton.disabled = (conversionRequired && !cpaCalculation) || (needsRate && !parsedCampaignName.usdBrlRate);
  }

  function campaignNameNeedsUsdBrlRate(parsed = parsedCampaignName) {
    return Boolean(parsed?.ok && campaignNeedsUsdBrlRate(parsed.commissionCurrency));
  }

  async function refreshCampaignNameQuoteIfNeeded({ force = false } = {}) {
    const requestId = ++campaignNameQuoteRequest;
    calculateCampaignNameDetails();
    if (!campaignNameNeedsUsdBrlRate()) return;
    const quote = currentUsdBrlQuote();
    if (!force && isUsableUsdBrlQuote(quote) && !quote.isStale) return;
    const sourceName = nameParseInput.value;
    nameParseApplyButton.disabled = true;
    setCampaignNameParseStatus('Consultando a cotação PTAX de venda do Banco Central para converter USD em BRL…');
    try {
      const refresh = force ? forceRefreshUsdBrlQuote : refreshUsdBrlQuote;
      if (typeof refresh === 'function') await refresh();
    } catch {
      // The shared service exposes the last valid cached quote when refresh fails.
    }
    if (requestId !== campaignNameQuoteRequest || sourceName !== nameParseInput.value) return;
    calculateCampaignNameDetails();
  }

  function openCampaignNameDialog() {
    nameParseInput.value = form.elements.namedItem('campaign_name').value.trim();
    calculateCampaignNameDetails();
    if (typeof nameParseDialog.showModal === 'function') nameParseDialog.showModal();
    else nameParseDialog.setAttribute('open', '');
    nameParseInput.focus();
    void refreshCampaignNameQuoteIfNeeded();
  }

  function applyCampaignNameDetails() {
    if (!parsedCampaignName?.ok) return;
    const accountCurrency = campaignNameAccountCurrency();
    const dailyBudgetField = form.elements.namedItem('daily_budget');
    if (dailyBudgetField?.dataset.budgetSource !== 'manual') {
      const suggestedBudget = suggestedGoogleAdsDailyBudget({ commission: parsedCampaignName.commissionAmount,
        sourceCurrency: parsedCampaignName.commissionCurrency, targetCurrency: accountCurrency, usdBrlRate: Number(parsedCampaignName.usdBrlRate) });
      if (suggestedBudget) {
        dailyBudgetField.value = suggestedBudget;
        dailyBudgetField.dataset.budgetSource = 'commission';
      }
    }
    const cpaAvailable = Boolean(parsedCampaignName.accountCpaAmount && parsedCampaignName.accountCpaCurrency === accountCurrency);
    applyingCampaignNameParse = true;
    form.elements.namedItem('campaign_name').value = parsedCampaignName.campaignName;
    form.elements.namedItem('geo_target_country_codes').value = parsedCampaignName.countries.join(', ');
    setGeoCountryNormalizationStatus(parsedCampaignName.countryCodeAliases);
    const metadata = {
      source_campaign_date: parsedCampaignName.sourceDate,
      source_product: parsedCampaignName.product,
      source_iteration: parsedCampaignName.iteration,
      source_platform_code: parsedCampaignName.platformCode,
      source_platform: parsedCampaignName.platform,
      source_bidding_model_code: parsedCampaignName.biddingModelCode,
      source_bidding_model: parsedCampaignName.biddingModel,
      source_extra_tags: parsedCampaignName.extraTags.join(', '),
      source_destination: parsedCampaignName.destination,
      source_commission_amount: parsedCampaignName.commissionAmount,
      source_commission_currency: parsedCampaignName.commissionCurrency,
      source_target_cpa_percent: parsedCampaignName.targetCpaPercent,
      source_target_cpa_amount: cpaAvailable ? parsedCampaignName.accountCpaAmount : '',
      source_target_cpa_currency: cpaAvailable ? parsedCampaignName.accountCpaCurrency : '',
      source_usd_brl_rate: parsedCampaignName.usdBrlRate || '',
      source_usd_brl_quote_date: parsedCampaignName.usdBrlQuoteDate || '',
      source_usd_brl_retrieved_at: parsedCampaignName.usdBrlRetrievedAt || '',
    };
    for (const [name, value] of Object.entries(metadata)) form.elements.namedItem(name).value = value;
    derivedCpaCurrencyField.value = cpaAvailable ? parsedCampaignName.accountCpaCurrency : '';
    if (cpaAvailable) {
      targetCpaField.value = parsedCampaignName.accountCpaAmount;
      targetCpaField.setCustomValidity('');
    }
    applyingCampaignNameParse = false;
    renderCpaVariantOptions();
    clearPreview();
    updateFinalUrlFromPreSell();
    updatePromotionTargetFromCampaign();
    scheduleDraftSave({ force: true });
    const statusMessage = cpaAvailable && parsedCampaignName.usdBrlRate
      ? 'Informações aplicadas. Os valores monetários do lote serão convertidos por conta com a PTAX de venda (' + (parsedCampaignName.usdBrlQuoteDate || 'data indisponível') + '); a taxa ficou salva neste rascunho. Confira os valores antes de validar a prévia.'
      : cpaAvailable
        ? 'Informações calculadas e aplicadas na moeda das contas. Confira o CPA e os GEOs, ajuste o restante e valide a prévia.'
        : 'Nome e GEOs aplicados. O CPA não foi preenchido porque não há conversão compatível; o valor já digitado foi mantido.';
    setStatus(statusMessage, false, false, true);
    if (typeof nameParseDialog.close === 'function') nameParseDialog.close(); else nameParseDialog.removeAttribute('open');
  }

  function updateControlState() {
    const hasManager = managerSelect.options.length > 1;
    const hasAccount = accountSelect.options.length > 1;
    managerSelect.disabled = busy || completed || uncertain || !hasManager;
    accountSelect.disabled = busy || completed || uncertain || !hasAccount;
    refreshButton.disabled = busy;
    draftPicker.disabled = busy;
    draftPickerTrigger.disabled = busy;
    if (busy) closeDraftPickerMenu();
    newDraftButton.disabled = busy || creating;
    campaignAssociationOpenButton.disabled = busy || campaignAssociationBusy;
    const fieldsDisabled = busy || !currentIds() || completed || uncertain;
    fields.forEach(fieldset => { fieldset.disabled = fieldsDisabled; });
    const existingBatchMode = campaignBatchRestored && Boolean(activeCampaignBatchId);
    cpaVariantsOptions.inert = fieldsDisabled;
    previewButton.hidden = completed || uncertain || existingBatchMode;
    previewNextButton.hidden = completed || uncertain || existingBatchMode;
    previewButton.disabled = busy || !currentIds() || completed || uncertain || existingBatchMode;
    const pendingCount = batchEntries.filter(entry => ['pending', 'preview_stale'].includes(entry.state)).length;
    const failedCount = batchEntries.filter(entry => entry.state === 'preview_failed').length;
    if (batchEntries.length) {
      setPreviewButtonLabel(pendingCount
        ? 'Validar pendentes/desatualizadas (' + pendingCount + ')'
        : failedCount
          ? 'Tentar validações com falha (' + failedCount + ')'
          : 'Revalidar todas (' + batchEntries.length + ')');
    }
    previewNextButton.textContent = batchEntries.length
      ? pendingCount + failedCount > 0 ? 'Validar próxima campanha (' + (pendingCount + failedCount) + ' pendente(s)/falha(s))' : 'Sem campanhas pendentes'
      : 'Validar próxima campanha';
    previewNextButton.disabled = busy || !currentIds() || completed || uncertain || existingBatchMode
      || (batchEntries.length > 0 && pendingCount === 0 && failedCount === 0);
    if (existingBatchMode) {
      previewArea.hidden = true;
      createButton.hidden = true;
      if (/prévia/i.test(status.textContent + ' ' + bottomStatusText.textContent)) setStatus('');
    }
    const newCampaignCount = batchEntries.filter(entry => entry.state === 'previewed').length;
    createButton.disabled = busy || !previewSnapshot || newCampaignCount === 0 || completed || uncertain;
    createButton.textContent = 'Criar ' + newCampaignCount + ' campanha' + (newCampaignCount === 1 ? '' : 's') + ' nova' + (newCampaignCount === 1 ? '' : 's') + ' pausada' + (newCampaignCount === 1 ? '' : 's');
    renderCampaignCsvControls();
  }

  function clearPreview({ preserveStoredPreview = false } = {}) {
    setCampaignCsvStatus('');
    const hadPreview = batchEntries.length > 0 || Boolean(previewSnapshot);
    if (batchEntries.length && previewId && batchEntriesDraftId === activeDraftId) {
      previewHistory = {
        id: previewId,
        draftId: batchEntriesDraftId,
        validatedAt: previewValidatedAt || new Date().toISOString(),
        payloadFingerprint: previewFingerprint,
        entries: storedPreviewEntries(),
      };
    }
    if (previewHistory?.draftId && previewHistory.draftId !== activeDraftId) previewHistory = null;
    if (!preserveStoredPreview && previewId) {
      try { invalidateGoogleAdsCampaignPreview(previewId); }
      catch (error) { setCampaignBatchStatus(error.message || 'Não foi possível marcar a prévia salva como desatualizada.', true); }
    }
    previewSnapshot = '';
    previewFingerprint = '';
    previewId = '';
    previewCreationAuditLegacyHistory = false;
    previewValidatedAt = '';
    batchEntries = [];
    batchEntriesDraftId = '';
    if (!completed && !uncertain && !campaignBatchRestored) {
      createdCampaigns = [];
      createdCampaign = null;
      audienceStateByCampaign = new Map();
      audienceTargetingResult = null;
      audienceTargetingError = '';
      audienceExclusionsResult = null;
      audienceExclusionsError = '';
    }
    previewArea.hidden = true;
    previewTitle.textContent = 'Verificação da prévia';
    previewDescription.textContent = 'A API procura primeiro o nome exato em cada conta. Se já existir, mostra ID, status e grupos; se estiver livre, valida com validateOnly. As consultas usam cota de leitura; esta etapa não cria campanhas.';
    createButton.hidden = true;
    previewDetails.replaceChildren();
    renderCampaignResult();
    if (previewHistory?.entries?.length) renderBatchPreview();
    else updateControlState();
    if (hadPreview && !busy && !completed && !uncertain && !campaignBatchRestored) {
      setStatus('Os dados mudaram. O resultado anterior permanece no histórico, mas não libera criação; valide a prévia atual para continuar.', false, false, true);
    }
  }

  function selectOption(select, label, value = '') {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }

  function accountMapTargetCustomerId() {
    let storage;
    try { storage = window.localStorage; } catch { return ''; }
    const target = createAccountDuplicationTargetStorage(storage).read();
    const match = String(target?.accountId || '').match(/(?:^|[^\d])(\d{3})[-\s]?(\d{3})[-\s]?(\d{4})(?!\d)/);
    return match ? match.slice(1).join('') : '';
  }

  function refreshAccountTargetHighlight() {
    const targetCustomerId = accountMapTargetCustomerId();
    for (const option of accountSelect.options) {
      if (!option.dataset.accountMapBaseLabel) option.dataset.accountMapBaseLabel = option.textContent || '';
      const isTarget = Boolean(targetCustomerId) && option.value === targetCustomerId;
      option.classList.toggle('google-ads-account-option--map-target', isTarget);
      option.textContent = option.dataset.accountMapBaseLabel + (isTarget ? ' · ALVO' : '');
      option.title = isTarget ? 'Conta definida como alvo no Mapa por conta' : '';
    }
    accountSelect.classList.toggle('google-ads-creation-account--map-target',
      Boolean(targetCustomerId) && accountSelect.value === targetCustomerId);
  }

  function renderAccountOptions(preferredCustomerId = '', { selectFirst = true } = {}) {
    accountSelect.replaceChildren();
    const accounts = (directory?.accounts || []).filter(account => account.managerCustomerId === managerSelect.value);
    selectOption(accountSelect, accounts.length ? 'Selecione uma conta' : 'Nenhuma conta cliente nesta MCC');
    accounts.forEach(account => {
      const suffix = account.status && account.status !== 'ENABLED' ? ' · ' + account.status : '';
      selectOption(accountSelect, account.name + ' · ' + account.customerId + suffix, account.customerId);
    });
    if (accounts.some(account => account.customerId === preferredCustomerId)) accountSelect.value = preferredCustomerId;
    else if (accounts.length && selectFirst) accountSelect.value = accounts[0].customerId;
    refreshAccountTargetHighlight();
    return accounts.length;
  }

  function populateDirectory(nextDirectory) {
    directory = nextDirectory;
    const oldManager = managerSelect.value;
    const oldAccount = accountSelect.value;
    managerSelect.replaceChildren();
    const managers = (directory?.managers || []).filter(manager => /^\d{10}$/.test(String(manager.customerId || '')));
    selectOption(managerSelect, managers.length ? 'Selecione uma MCC' : 'Nenhuma MCC acessível');
    managers.forEach(manager => selectOption(managerSelect, manager.name + ' · ' + manager.customerId, manager.customerId));
    if (managers.some(manager => manager.customerId === oldManager)) managerSelect.value = oldManager;
    else if (managers.length) managerSelect.value = managers[0].customerId;
    const count = renderAccountOptions(oldAccount);
    updateCurrencyHints();
    renderCpaVariantOptions();
    updateControlState();
    return managers.length && count;
  }

  function currentIds() {
    const targetState = campaignTargetState();
    const account = targetState.source === 'ficha'
      ? targetState.targets.find(target => target.account)?.account || null
      : selectedAccount();
    return account ? { managerCustomerId: account.managerCustomerId, customerId: account.customerId } : null;
  }

  function updateSelectionMessage() {
    if (!isTokenReady()) {
      setStatus('Configure o token compartilhado do Hub em Integrações → Configurações globais antes de validar a campanha.', true);
      return;
    }
    if (!currentIds()) {
      setStatus('Selecione uma MCC e uma conta cliente vinculada antes de validar a prévia.', false, false, true);
      return;
    }
    setStatus('Prévia ainda não validada. Preencha e confira os dados; depois clique em “Validar prévia”. A MCC, a permissão e os destinos serão conferidos pela API nessa etapa.', false, false, true);
  }

  function normalizeDecimal(value) { return String(value ?? '').trim().replace(',', '.'); }
  function textLines(value) { return String(value ?? '').split(/\r?\n/).map(item => item.trim()).filter(Boolean); }

  function detectPromotionLanguageFromCopy() {
    const copy = [
      ...form.querySelectorAll('[name="headline"]'),
      ...form.querySelectorAll('[name="description"]'),
    ].map(field => field.value.trim()).filter(Boolean);
    const detected = detectGoogleAdsCopyLanguage(copy);
    if (!detected) {
      languageField.value = '';
      languageDetectionStatus.textContent = copy.length
        ? 'Não consegui detectar o idioma com segurança. Informe manualmente uma tag BCP 47, por exemplo pt-BR, en ou de.'
        : 'O idioma será detectado automaticamente pelos títulos e descrições. Você pode ajustar o código manualmente.';
      return false;
    }
    languageField.value = detected.languageCode;
    languageDetectionStatus.textContent = 'Idioma detectado pela copy: ' + detected.languageName + ' (' + detected.languageCode + '). Ao editar os títulos ou descrições, a detecção será refeita.';
    return true;
  }

  function updatePromotionTriggerFields() {
    const type = form.elements.namedItem('trigger_type').value;
    const enabled = type !== 'none';
    const isCode = type === 'promotion_code';
    triggerField.hidden = !enabled;
    triggerValueField.disabled = !enabled;
    triggerValueField.required = enabled;
    triggerValueField.maxLength = isCode ? 20 : 32;
    triggerValueField.inputMode = isCode ? 'text' : 'decimal';
    page.querySelector('[data-trigger-value-label]').textContent = isCode ? 'Código promocional' : 'Pedido mínimo na moeda da conta';
    triggerValueField.placeholder = isCode ? 'CODIGO20' : '50.00';
    if (!enabled) triggerValueField.value = '';
  }

  function updatePromotionDiscountFields() {
    const value = discountValueField;
    const isPercent = discountTypeField.value === 'percent_off';
    page.querySelector('[data-discount-value-label]').textContent = isPercent ? 'Desconto percentual (1–100)' : 'Valor do desconto na moeda da conta';
    value.inputMode = isPercent ? 'numeric' : 'decimal';
    value.placeholder = isPercent ? '20' : '12.50';
  }

  function updatePromotionDiscountDetection() {
    const copyEntries = [
      ...[...form.querySelectorAll('[name="headline"]')].map((field, index) => ({ label: 'Título ' + (index + 1), text: field.value })),
      ...[...form.querySelectorAll('[name="description"]')].map((field, index) => ({ label: 'Descrição ' + (index + 1), text: field.value })),
    ];
    const detected = detectGoogleAdsCopyDiscount(copyEntries);
    const currentValue = discountValueField.value.trim();
    const source = discountValueField.dataset.discountValueSource || '';
    let message = '';

    if (source === 'manual' && currentValue) {
      message = 'Valor informado manualmente; a copy não o substituirá.';
    } else if (source === 'copy-metadata' && currentValue) {
      const structuredValue = currentValue + (discountTypeField.value === 'percent_off' ? '%' : '');
      message = detected.status === 'found' && detected.value !== currentValue
        ? 'O bloco da promoção informa ' + structuredValue + ', mas a copy contém ' + detected.value + '%. Mantive o valor estruturado para conferência.'
        : 'Desconto importado do bloco estruturado da copy: ' + structuredValue + '.';
    } else if (discountTypeField.value !== 'percent_off') {
      if (source === 'copy') {
        discountValueField.value = '';
        discountValueField.dataset.discountValueSource = '';
      }
      if (detected.status === 'found') message = 'A copy contém ' + detected.value + '%, mas o tipo Valor fixo está selecionado; não preenchi esse campo.';
    } else if (detected.status === 'found') {
      discountValueField.value = detected.value;
      discountValueField.dataset.discountValueSource = 'copy';
      const labels = [...new Set(detected.matches.map(match => match.label))];
      message = 'Desconto de ' + detected.value + '% detectado em ' + labels.join(', ') + '. Você pode ajustar o valor manualmente.';
    } else if (detected.status === 'ambiguous') {
      if (source === 'copy') {
        discountValueField.value = '';
        discountValueField.dataset.discountValueSource = '';
      }
      message = 'Encontrei percentuais diferentes (' + detected.values.map(value => value + '%').join(', ') + '); não preenchi automaticamente.';
    } else if (source === 'copy') {
      discountValueField.value = '';
      discountValueField.dataset.discountValueSource = '';
      message = 'O desconto detectado anteriormente não aparece mais nos títulos e descrições.';
    }

    discountDetectionStatus.textContent = message;
    discountDetectionStatus.hidden = !message;
    return detected;
  }

  function setCopyImportStatus(message, isError = false) {
    copyImportStatus.textContent = [message, copyImportStorageError].filter(Boolean).join(' ');
    copyImportStatus.classList.toggle('is-error', isError || Boolean(copyImportStorageError));
    copyImportStatus.classList.toggle('is-success', !isError && !copyImportStorageError && Boolean(message));
  }

  function loadCopyImportSource() {
    try {
      copyImportStorageError = '';
      const source = window.localStorage.getItem(GOOGLE_ADS_COPY_IMPORT_SOURCE_KEY);
      return { exists: source !== null, source: source || '' };
    } catch {
      copyImportStorageError = 'O navegador não permitiu acessar o cache local desta resposta.';
      return { exists: false, source: '' };
    }
  }

  function persistCopyImportSource(value) {
    try {
      const source = String(value ?? '');
      window.localStorage.setItem(GOOGLE_ADS_COPY_IMPORT_SOURCE_KEY, source);
      copyImportStorageError = '';
      return true;
    } catch {
      copyImportStorageError = 'Não foi possível salvar esta resposta no cache do navegador.';
      return false;
    }
  }

  function clearCopyImportSource() {
    if (copyImportInputTimer) window.clearTimeout(copyImportInputTimer);
    copyImportInputTimer = null;
    copyImportInput.value = '';
    try {
      window.localStorage.removeItem(GOOGLE_ADS_COPY_IMPORT_SOURCE_KEY);
      copyImportStorageError = '';
    } catch {
      copyImportStorageError = 'Não foi possível limpar a resposta salva no cache do navegador.';
    }
    parsedCopy = null;
    selectedCopyAssets = new Set();
    selectedCopySitelinks = new Map();
    selectedPromotion = false;
    copyImportResults.hidden = true;
    copyImportGroups.replaceChildren();
    copyImportApplyButton.disabled = true;
    setCopyImportStatus('');
  }

  function selectedAssets(kind) {
    if (!parsedCopy) return [];
    const source = kind === 'headline' ? parsedCopy.headlines : parsedCopy.descriptions;
    return [...selectedCopyAssets].map(id => source.find(asset => asset.id === id)).filter(Boolean);
  }

  function copySelectionScope() { return copyImportMode === 'batch-sitelinks' ? activeCampaignBatchId : (activeDraftId || campaignDeliveryQueryId || 'new'); }

  function persistCopySelection() {
    if (!parsedCopy) return;
    try {
      const edits = Object.fromEntries([...parsedCopy.headlines, ...parsedCopy.descriptions].map(asset => [asset.id, asset.text]));
      const sitelinkEdits = Object.fromEntries(parsedCopy.sitelinks.map(link => [link.id, [link.title.text, ...link.descriptions.map(item => item.text)]]));
      saveCopySelection(window.localStorage, copyImportInput.value, copySelectionScope(), copyImportMode, {assets:[...selectedCopyAssets], sitelinks:[...selectedCopySitelinks], sitelinksSelectionTouched, promotion:selectedPromotion, edits, sitelinkEdits});
    } catch { copyImportStorageError = 'Não foi possível salvar as seleções no navegador.'; }
  }

  function restoreCopySelection() {
    try {
      const saved = loadCopySelection(window.localStorage, copyImportInput.value, copySelectionScope(), copyImportMode);
      if (!saved) return false;
      const assets = [...parsedCopy.headlines, ...parsedCopy.descriptions];
      for (const asset of assets) if (typeof saved.edits?.[asset.id] === 'string') asset.text = saved.edits[asset.id];
      for (const link of parsedCopy.sitelinks) {
        const values = saved.sitelinkEdits?.[link.id];
        if (Array.isArray(values) && values.length === 3 && values.every(value => typeof value === 'string')) [link.title, ...link.descriptions].forEach((asset, index) => { asset.text = values[index]; });
      }
      const ids = new Set(assets.map(asset => asset.id));
      selectedCopyAssets = new Set((Array.isArray(saved.assets) ? saved.assets : []).filter(id => ids.has(id)));
      const linkIds = new Set(parsedCopy.sitelinks.map(link => link.id));
      selectedCopySitelinks = new Map((Array.isArray(saved.sitelinks) ? saved.sitelinks : []).filter(item => Array.isArray(item) && linkIds.has(item[0]) && Number.isInteger(item[1]) && item[1] >= 1 && item[1] <= 6));
      sitelinksSelectionTouched = saved.sitelinksSelectionTouched === true;
      selectedPromotion = saved.promotion === true;
      return true;
    } catch { return false; }
  }

  function selectedCopyLimitMessage() {
    const invalid = [...selectedAssets('headline'), ...selectedAssets('description')].filter(asset => Array.from(asset.text).length > asset.limit);
    return invalid.length ? 'Edite os itens selecionados acima do limite: ' + invalid.map(asset => (asset.kind === 'headline' ? 'título ' : 'descrição ') + (Number(asset.id.split('-').pop()) + 1) + ' (' + Array.from(asset.text).length + '/' + asset.limit + ')').join(', ') + '.' : '';
  }

  function showCopyTextEditor(container, { value, limit = 0, label = 'Editar texto da copy', onSave }) {
    container.replaceChildren();
    const editor = document.createElement('textarea');
    editor.className = 'input google-ads-copy-import-editor';
    editor.value = value;
    if (limit) editor.maxLength = limit;
    editor.setAttribute('aria-label', label);
    const editorMeta = document.createElement('small');
    editorMeta.className = 'google-ads-copy-import-char-count';
    const updateEditorMeta = () => {
      const count = Array.from(editor.value).length;
      editorMeta.textContent = limit ? count + '/' + limit + ' caracteres' : count + ' caracteres';
      editorMeta.classList.toggle('is-error', Boolean(limit && count > limit));
    };
    editor.addEventListener('input', updateEditorMeta);
    updateEditorMeta();
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn primary';
    save.textContent = 'Salvar edição';
    const saveEdit = () => {
      const nextText = editor.value.trim();
      if (!nextText) { setCopyImportStatus('O texto não pode ficar vazio.', true); editor.focus(); return; }
      if (limit && Array.from(nextText).length > limit) { setCopyImportStatus('O texto excede o limite de ' + limit + ' caracteres.', true); editor.focus(); return; }
      onSave(nextText);
      persistCopySelection();
      renderCopyImportResults();
      setCopyImportStatus(selectedCopyLimitMessage() || 'Edição salva. A tradução original continua disponível como referência.', Boolean(selectedCopyLimitMessage()));
    };
    save.addEventListener('click', saveEdit);
    editor.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      saveEdit();
    });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = 'Cancelar edição';
    cancel.addEventListener('click', renderCopyImportResults);
    const editorActions = document.createElement('div');
    editorActions.className = 'google-ads-copy-import-edit-actions';
    editorActions.append(save, cancel);
    container.append(editor, editorMeta, editorActions);
    editor.focus();
  }

  function showCopySitelinkEditor(container, link) {
    container.replaceChildren();
    const editor = document.createElement('div');
    editor.className = 'google-ads-copy-import-sitelink-editor';
    const fields = [
      { asset: link.title, label: 'Título', limit: link.title.limit || 25 },
      { asset: link.descriptions[0], label: 'Descrição 1', limit: link.descriptions[0]?.limit || 35 },
      { asset: link.descriptions[1], label: 'Descrição 2', limit: link.descriptions[1]?.limit || 35 },
    ];
    const editors = fields.map(({ asset, label, limit }) => {
      const field = document.createElement('label');
      field.className = 'google-ads-copy-import-sitelink-editor-field';
      const caption = document.createElement('span');
      caption.textContent = label + ' · máx. ' + limit;
      const input = document.createElement('textarea');
      input.className = 'input google-ads-copy-import-editor';
      input.value = asset?.text || '';
      input.maxLength = limit;
      input.rows = 2;
      input.setAttribute('aria-label', caption.textContent);
      const count = document.createElement('small');
      count.className = 'google-ads-copy-import-char-count';
      const updateCount = () => {
        count.textContent = Array.from(input.value).length + '/' + limit + ' caracteres';
        count.classList.toggle('is-error', Array.from(input.value).length > limit);
      };
      input.addEventListener('input', updateCount);
      updateCount();
      field.append(caption, input, count);
      editor.append(field);
      return { asset, input, limit };
    });
    const actions = document.createElement('div');
    actions.className = 'google-ads-copy-import-edit-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn primary';
    save.textContent = 'Salvar edição';
    const saveEdit = () => {
      const values = editors.map(({ input }) => input.value.trim());
      if (!values[0]) { setCopyImportStatus('O título do sitelink não pode ficar vazio.', true); editors[0].input.focus(); return; }
      if (Boolean(values[1]) !== Boolean(values[2])) { setCopyImportStatus('Preencha as duas descrições ou deixe ambas vazias.', true); (values[1] ? editors[2].input : editors[1].input).focus(); return; }
      const overflow = editors.find(({ limit }, index) => Array.from(values[index]).length > limit);
      if (overflow) { setCopyImportStatus('Um dos textos excede o limite de caracteres do sitelink.', true); overflow.input.focus(); return; }
      editors.forEach(({ asset }, index) => { if (asset) asset.text = values[index]; });
      persistCopySelection();
      renderCopyImportResults();
      setCopyImportStatus('Sitelink editado. A tradução original continua disponível como referência.');
    };
    save.addEventListener('click', saveEdit);
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = 'Cancelar edição';
    cancel.addEventListener('click', renderCopyImportResults);
    actions.append(save, cancel);
    editor.append(actions);
    container.append(editor);
    editors[0].input.focus();
  }

  function makeCopySitelinkPreviewSide(label, assets, { translated = false } = {}) {
    const side = document.createElement('section');
    side.className = 'google-ads-copy-import-sitelink-side' + (translated ? ' is-translation' : '');
    const heading = document.createElement('h5');
    heading.className = 'google-ads-copy-import-sitelink-side-heading';
    heading.textContent = label;
    side.append(heading);
    const values = assets.map(value => String(translated ? value || '' : value?.text || '').trim());
    if (translated && values.every(value => !value)) {
      const missing = document.createElement('p');
      missing.className = 'google-ads-copy-import-sitelink-description is-empty';
      missing.textContent = 'Tradução não informada.';
      side.append(missing);
      return side;
    }
    const titleLabel = document.createElement('small');
    titleLabel.className = 'google-ads-copy-import-sitelink-kind';
    titleLabel.textContent = 'Título';
    const titleText = document.createElement('strong');
    titleText.className = 'google-ads-copy-import-sitelink-title';
    titleText.textContent = values[0] || '—';
    side.append(titleLabel, titleText);
    values.slice(1).forEach((description, index) => {
      const line = document.createElement('p');
      line.className = 'google-ads-copy-import-sitelink-description' + (description ? '' : ' is-empty');
      line.textContent = (index ? 'Descrição 2 · ' : 'Descrição 1 · ') + (description || '—');
      side.append(line);
    });
    if (!translated) {
      const count = document.createElement('small');
      count.className = 'google-ads-copy-import-char-count';
      count.textContent = assets.map((asset, index) => {
        const current = Array.from(String(asset?.text || '')).length;
        const limit = asset?.limit || (index ? 35 : 25);
        return current + '/' + limit;
      }).join(' · ') + ' caracteres';
      if (assets.some((asset, index) => Array.from(String(asset?.text || '')).length > (asset?.limit || (index ? 35 : 25)))) count.classList.add('is-error');
      side.append(count);
    }
    return side;
  }

  function makeCopyAssetCard(asset, { selectable = false, selected = false, onToggle = null, hideUnavailable = false } = {}) {
    const card = document.createElement('article');
    card.className = 'google-ads-copy-import-asset' + (selected ? ' is-selected' : '');
    const body = document.createElement('div');
    body.className = 'google-ads-copy-import-asset-body';
    const copy = document.createElement('p');
    copy.className = 'google-ads-copy-import-asset-copy';
    copy.textContent = asset.text;
    body.append(copy);
    if (asset.translationPt) {
      const translation = document.createElement('p');
      translation.className = 'google-ads-copy-import-translation';
      translation.textContent = 'PT: ' + asset.translationPt;
      body.append(translation);
    }
    const meta = document.createElement('small');
    meta.className = 'google-ads-copy-import-char-count';
    const characterCount = () => Array.from(asset.text).length;
    meta.textContent = asset.limit ? characterCount() + '/' + asset.limit + ' caracteres' : characterCount() + ' caracteres';
    if (asset.limit && characterCount() > asset.limit) meta.classList.add('is-error');
    const actions = document.createElement('div');
    actions.className = 'google-ads-copy-import-asset-actions';
    if (selectable) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'google-ads-copy-import-select' + (selected ? ' is-selected' : '');
      toggle.setAttribute('aria-pressed', String(selected));
      toggle.textContent = selected ? '✓ Selecionado' : 'Selecionar';
      toggle.addEventListener('click', onToggle);
      actions.append(toggle);
    } else if (!hideUnavailable) {
      const badge = document.createElement('span');
      badge.className = 'google-ads-copy-import-unavailable';
      badge.textContent = 'Ainda não enviado pela criação atual';
      actions.append(badge);
    }
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'google-ads-copy-import-edit';
    edit.setAttribute('aria-label', 'Editar texto');
    edit.textContent = '✎ Editar';
    edit.addEventListener('click', () => showCopyTextEditor(body, {
      value: asset.text,
      limit: asset.limit,
      label: 'Editar texto da copy',
      onSave: nextText => { asset.text = nextText; },
    }));
    actions.append(edit);
    card.append(body, meta, actions);
    return card;
  }

  function addCopyImportGroup(title, description = '') {
    const section = document.createElement('section');
    section.className = 'google-ads-copy-import-group';
    const heading = document.createElement('div');
    heading.className = 'google-ads-copy-import-group-heading';
    const name = document.createElement('h3');
    name.textContent = title;
    heading.append(name);
    if (description) {
      const note = document.createElement('small');
      note.textContent = description;
      heading.append(note);
    }
    const grid = document.createElement('div');
    grid.className = 'google-ads-copy-import-asset-grid';
    section.append(heading, grid);
    copyImportGroups.append(section);
    return grid;
  }

  function renderTextAssetGroup(title, assets, kind = '', maxSelected = 0) {
    const grid = addCopyImportGroup(title, kind ? 'Selecione até ' + maxSelected + ' para preencher o formulário.' : 'Consulta somente; não é enviado nesta versão.');
    if (!assets.length) {
      const empty = document.createElement('p');
      empty.className = 'google-ads-copy-import-empty';
      empty.textContent = 'Nenhum item neste grupo.';
      grid.append(empty);
      return;
    }
    assets.forEach(asset => {
      const selectable = kind === 'headline' || kind === 'description';
      const selected = selectedCopyAssets.has(asset.id);
      const card = makeCopyAssetCard(asset, {
        selectable,
        selected,
        onToggle: () => {
          if (selectedCopyAssets.has(asset.id)) selectedCopyAssets.delete(asset.id);
          else {
            const cap = kind === 'headline' ? 10 : 3;
            if (selectedAssets(kind).length >= cap) {
              setCopyImportStatus('O formulário aceita no máximo ' + cap + (kind === 'headline' ? ' títulos.' : ' descrições.'), true);
              return;
            }
            selectedCopyAssets.add(asset.id);
          }
          persistCopySelection();
          renderCopyImportResults();
          setCopyImportStatus(selectedCopyLimitMessage() || 'Seleção atualizada. Você pode continuar escolhendo, editando ou aplicar a copy.', Boolean(selectedCopyLimitMessage()));
        },
      });
      grid.append(card);
    });
  }

  function renderCopyImportResults() {
    if (!parsedCopy) return;
    copyImportGroups.replaceChildren();
    const batchSitelinksMode = copyImportMode === 'batch-sitelinks';
    copyImportResults.classList.toggle('is-sitelinks-only', batchSitelinksMode);
    if (!batchSitelinksMode) {
      renderTextAssetGroup('Títulos', parsedCopy.headlines, 'headline', 10);
      renderTextAssetGroup('Descrições', parsedCopy.descriptions, 'description', 3);
      renderTextAssetGroup('Frases de destaque', parsedCopy.callouts);

      const snippetsGrid = addCopyImportGroup('Snippets estruturados');
      if (!parsedCopy.structuredSnippets.length) {
        const empty = document.createElement('p'); empty.className = 'google-ads-copy-import-empty'; empty.textContent = 'Nenhum snippet estruturado informado.'; snippetsGrid.append(empty);
      }
      parsedCopy.structuredSnippets.forEach(group => {
        const snippet = document.createElement('article'); snippet.className = 'google-ads-copy-import-composite';
        const snippetHeading = document.createElement('div'); snippetHeading.className = 'google-ads-copy-import-snippet-heading';
        const header = document.createElement('h4'); header.textContent = group.header;
        const editHeader = document.createElement('button');
        editHeader.type = 'button'; editHeader.className = 'google-ads-copy-import-edit';
        editHeader.setAttribute('aria-label', 'Editar cabeçalho do snippet'); editHeader.textContent = '✎ Editar';
        editHeader.addEventListener('click', () => showCopyTextEditor(snippetHeading, {
          value: group.header,
          label: 'Editar cabeçalho do snippet',
          onSave: nextText => { group.header = nextText; },
        }));
        snippetHeading.append(header, editHeader);
        snippet.append(snippetHeading);
        if (group.headerTranslationPt) {
          const headerTranslation = document.createElement('small');
          headerTranslation.className = 'google-ads-copy-import-translation';
          headerTranslation.textContent = 'PT: ' + group.headerTranslationPt;
          snippet.append(headerTranslation);
        }
        group.values.forEach(asset => snippet.append(makeCopyAssetCard(asset)));
        snippetsGrid.append(snippet);
      });
    }

    const sitelinksGrid = addCopyImportGroup('Sitelinks', batchSitelinksMode
      ? 'Selecione até 6. Cada link usa a URL final da campanha e uma seção (#1 a #6) da Pre-Sell.'
      : 'Selecione até 6 sitelinks. Eles ficam salvos no Hub; após criar a campanha, use “Sitelinks deste lote” para enviá-los ao Google Ads.');
    if (!parsedCopy.sitelinks.length) {
      const empty = document.createElement('p'); empty.className = 'google-ads-copy-import-empty'; empty.textContent = 'Nenhum sitelink informado.'; sitelinksGrid.append(empty);
    }
    parsedCopy.sitelinks.forEach((link, index) => {
      const composite = document.createElement('article'); composite.className = 'google-ads-copy-import-composite';
      const selectedAnchor = selectedCopySitelinks.get(link.id) || 0;
      composite.classList.toggle('is-selected', Boolean(selectedAnchor));
      const heading = document.createElement('h4'); heading.textContent = 'Sitelink ' + (index + 1) + (selectedAnchor ? ' · destino #' + selectedAnchor : ''); composite.append(heading);
      let toggleButton;
      {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'google-ads-copy-import-select' + (selectedAnchor ? ' is-selected' : '');
        toggle.setAttribute('aria-pressed', String(Boolean(selectedAnchor)));
        toggle.textContent = selectedAnchor ? '✓ Selecionado' : 'Selecionar';
        toggle.addEventListener('click', () => {
          if (selectedCopySitelinks.has(link.id)) selectedCopySitelinks.delete(link.id);
          else {
            if (selectedCopySitelinks.size >= 6) { setCopyImportStatus('O Google Ads aceita até 6 sitelinks neste fluxo.', true); return; }
            const used = new Set(selectedCopySitelinks.values());
            const anchor = [1, 2, 3, 4, 5, 6].find(value => !used.has(value));
            if (!anchor) { setCopyImportStatus('As seis seções já estão em uso.', true); return; }
            selectedCopySitelinks.set(link.id, anchor);
          }
          sitelinksSelectionTouched = true;
          persistCopySelection();
          renderCopyImportResults();
        });
        toggleButton = toggle;
        if (selectedAnchor && batchSitelinksMode) {
          const anchorLabel = document.createElement('label');
          anchorLabel.className = 'google-ads-creation-field google-ads-copy-import-sitelink-anchor';
          const label = document.createElement('span'); label.textContent = 'Seção de destino da Pre-Sell';
          const select = document.createElement('select'); select.className = 'input';
          const used = new Set([...selectedCopySitelinks.entries()].filter(([id]) => id !== link.id).map(([, anchor]) => anchor));
          [1, 2, 3, 4, 5, 6].forEach(anchor => {
            if (used.has(anchor) && anchor !== selectedAnchor) return;
            const option = document.createElement('option'); option.value = String(anchor); option.textContent = 'Seção #' + anchor; option.selected = anchor === selectedAnchor; select.append(option);
          });
          select.addEventListener('change', () => { selectedCopySitelinks.set(link.id, Number(select.value)); persistCopySelection(); renderCopyImportResults(); });
          anchorLabel.append(label, select);
          composite.append(anchorLabel);
        }
      }
      composite.classList.add('google-ads-copy-import-sitelink-composite');
      const preview = document.createElement('div');
      preview.className = 'google-ads-copy-import-sitelink-preview';
      const originalLanguage = String(parsedCopy.languageCode || 'EN').trim().toUpperCase();
      preview.append(
        makeCopySitelinkPreviewSide('Original · ' + originalLanguage, [link.title, ...link.descriptions]),
        makeCopySitelinkPreviewSide('Tradução · PT', [link.title.translationPt, ...link.descriptions.map(asset => asset.translationPt)], { translated: true }),
      );
      const actions = document.createElement('div');
      actions.className = 'google-ads-copy-import-sitelink-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'google-ads-copy-import-edit';
      edit.setAttribute('aria-label', 'Editar Sitelink ' + (index + 1));
      edit.textContent = '✎ Editar';
      const editorSlot = document.createElement('div');
      editorSlot.className = 'google-ads-copy-import-sitelink-editor-slot';
      editorSlot.hidden = true;
      edit.addEventListener('click', () => {
        editorSlot.hidden = false;
        edit.disabled = true;
        showCopySitelinkEditor(editorSlot, link);
      });
      actions.append(toggleButton, edit);
      composite.append(preview, actions, editorSlot);
      sitelinksGrid.append(composite);
    });

    if (!batchSitelinksMode) {
      const promotionGrid = addCopyImportGroup('Recurso de promoção', 'O item selecionado será preenchido no formulário; confira URL e datas na tela.');
      if (parsedCopy.promotion) {
      const promotion = parsedCopy.promotion;
      const promotionCard = document.createElement('article');
      promotionCard.className = 'google-ads-copy-import-asset google-ads-copy-import-promotion' + (selectedPromotion ? ' is-selected' : '');
      const details = document.createElement('p');
      const discount = promotion.discountType === 'percent_off' && promotion.discountValue ? promotion.discountValue + '%' : promotion.discountValue;
      details.textContent = [promotion.target, discount, promotion.languageCode].filter(Boolean).join(' · ') || 'Dados de promoção incompletos';
      const subdetails = document.createElement('small');
      subdetails.textContent = 'Ocasião: ' + (promotion.occasion || 'Nenhuma') + ' · Detalhes: ' + (promotion.triggerType === 'none' ? 'Nenhuma' : promotion.triggerType);
      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'google-ads-copy-import-select' + (selectedPromotion ? ' is-selected' : '');
      toggle.setAttribute('aria-pressed', String(selectedPromotion)); toggle.textContent = selectedPromotion ? '✓ Selecionado' : 'Selecionar';
      toggle.addEventListener('click', () => { selectedPromotion = !selectedPromotion; persistCopySelection(); renderCopyImportResults(); });
      promotionCard.append(details, subdetails, toggle);
      promotionGrid.append(promotionCard);
      } else {
        const empty = document.createElement('p'); empty.className = 'google-ads-copy-import-empty'; empty.textContent = 'A resposta não contém um recurso de promoção estruturado.'; promotionGrid.append(empty);
      }
    }

    const headlineCount = selectedAssets('headline').length;
    const descriptionCount = selectedAssets('description').length;
    const headlineCountIndicator = page.querySelector('[data-copy-import-headline-count]');
    const descriptionCountIndicator = page.querySelector('[data-copy-import-description-count]');
    const promotionCountIndicator = page.querySelector('[data-copy-import-promotion-count]');
    const sitelinksCountIndicator = page.querySelector('[data-copy-import-sitelinks-count]');
    const sitelinksCount = selectedCopySitelinkCount();
    headlineCountIndicator.textContent = batchSitelinksMode
      ? selectedCopySitelinks.size + '/6 sitelinks' : headlineCount + '/10 títulos';
    descriptionCountIndicator.textContent = batchSitelinksMode
      ? 'seções #1–#6' : descriptionCount + '/3 descrições';
    promotionCountIndicator.textContent = batchSitelinksMode
      ? 'URL por campanha' : (selectedPromotion ? '1' : '0') + '/1 promoção';
    sitelinksCountIndicator.textContent = sitelinksCount + '/6 sitelinks';
    sitelinksCountIndicator.hidden = batchSitelinksMode;
    headlineCountIndicator.classList.toggle('is-complete', batchSitelinksMode ? selectedCopySitelinks.size === 6 : headlineCount === 10);
    descriptionCountIndicator.classList.toggle('is-complete', !batchSitelinksMode && descriptionCount === 3);
    promotionCountIndicator.classList.toggle('is-complete', !batchSitelinksMode && selectedPromotion);
    sitelinksCountIndicator.classList.toggle('is-complete', !batchSitelinksMode && sitelinksCount === 6);
    const selected = [...selectedAssets('headline'), ...selectedAssets('description')];
    const withinLimits = selected.every(asset => Array.from(asset.text).length <= asset.limit);
    const sitelinksWithinLimits = [...selectedCopySitelinks.keys()].every(id => {
      const link = parsedCopy.sitelinks.find(item => item.id === id);
      if (!link) return false;
      const title = link.title.text.trim();
      const description1 = link.descriptions[0]?.text.trim() || '';
      const description2 = link.descriptions[1]?.text.trim() || '';
      return Boolean(title) && Boolean(description1) === Boolean(description2)
        && Array.from(title).length <= link.title.limit
        && Array.from(description1).length <= (link.descriptions[0]?.limit || 35)
        && Array.from(description2).length <= (link.descriptions[1]?.limit || 35);
    });
    copyImportApplyButton.textContent = batchSitelinksMode ? 'Salvar sitelinks no lote' : 'Aplicar selecionados (10 títulos e 3 descrições)';
    copyImportApplyButton.disabled = batchSitelinksMode
      ? selectedCopySitelinks.size < 1 || !sitelinksWithinLimits
      : headlineCount !== 10 || descriptionCount !== 3 || !withinLimits;
  }

  function organizeCopyImportInput() {
    try {
      parsedCopy = parseGoogleAdsCopyImport(copyImportInput.value);
      selectedCopyAssets = new Set();
      selectedCopySitelinks = new Map();
      sitelinksSelectionTouched = false;
      selectedPromotion = false;
      const restoredSelection = restoreCopySelection();
      if (!restoredSelection && copyImportMode !== 'batch-sitelinks' && parsedCopy.promotion) selectedPromotion = true;
      if (!restoredSelection && copyImportMode === 'batch-sitelinks' && activeCampaignBatchSitelinks.length) {
        const unmatched = [...activeCampaignBatchSitelinks];
        parsedCopy.sitelinks.forEach(link => {
          const matchIndex = unmatched.findIndex(saved => saved.title === link.title.text.trim()
            && saved.description1 === link.descriptions[0]?.text.trim()
            && saved.description2 === link.descriptions[1]?.text.trim());
          if (matchIndex < 0) return;
          selectedCopySitelinks.set(link.id, unmatched[matchIndex].anchor);
          unmatched.splice(matchIndex, 1);
        });
      }
      copyImportResults.hidden = false;
      renderCopyImportResults();
      setCopyImportStatus(selectedCopyLimitMessage() || (copyImportMode === 'batch-sitelinks'
        ? 'Copy organizada: selecione e edite os sitelinks que serão vinculados a este lote.'
        : 'Copy organizada: ' + parsedCopy.headlines.length + ' títulos, ' + parsedCopy.descriptions.length + ' descrições e ' + (parsedCopy.sitelinks.length + parsedCopy.callouts.length + parsedCopy.structuredSnippets.length) + ' grupos/recursos adicionais.'), Boolean(selectedCopyLimitMessage()));
      return true;
    } catch (error) {
      parsedCopy = null;
      selectedCopyAssets = new Set();
      selectedCopySitelinks = new Map();
      selectedPromotion = false;
      copyImportResults.hidden = true;
      copyImportGroups.replaceChildren();
      copyImportApplyButton.disabled = true;
      page.querySelector('[data-copy-import-headline-count]').textContent = '0/10 títulos';
      page.querySelector('[data-copy-import-description-count]').textContent = '0/3 descrições';
      page.querySelector('[data-copy-import-promotion-count]').textContent = '0/1 promoção';
      setCopyImportStatus(error.message || 'Não foi possível organizar a copy.', true);
      return false;
    }
  }

  function scheduleCopyImportParse() {
    if (copyImportInputTimer) window.clearTimeout(copyImportInputTimer);
    const source = copyImportInput.value.trim();
    if (!source) {
      parsedCopy = null;
      selectedCopyAssets = new Set();
      selectedCopySitelinks = new Map();
      selectedPromotion = false;
      copyImportResults.hidden = true;
      copyImportGroups.replaceChildren();
      copyImportApplyButton.disabled = true;
      page.querySelector('[data-copy-import-headline-count]').textContent = copyImportMode === 'batch-sitelinks' ? '0/6 sitelinks' : '0/10 títulos';
      page.querySelector('[data-copy-import-description-count]').textContent = copyImportMode === 'batch-sitelinks' ? 'seções #1–#6' : '0/3 descrições';
      page.querySelector('[data-copy-import-promotion-count]').textContent = copyImportMode === 'batch-sitelinks' ? 'URL por campanha' : '0/1 promoção';
      setCopyImportStatus('');
      return;
    }
    if (!source.includes('[/HUB_COPY_IMPORT_V1]')) {
      parsedCopy = null;
      selectedCopyAssets = new Set();
      selectedCopySitelinks = new Map();
      selectedPromotion = false;
      copyImportResults.hidden = true;
      copyImportGroups.replaceChildren();
      copyImportApplyButton.disabled = true;
      page.querySelector('[data-copy-import-headline-count]').textContent = '0/10 títulos';
      page.querySelector('[data-copy-import-description-count]').textContent = '0/3 descrições';
      page.querySelector('[data-copy-import-promotion-count]').textContent = '0/1 promoção';
      setCopyImportStatus('Aguardando o fim do bloco estruturado do Gemini…');
      return;
    }
    copyImportInputTimer = window.setTimeout(organizeCopyImportInput, 250);
  }

  function applySelectedCopy() {
    if (copyImportMode === 'batch-sitelinks') {
      if (!activeCampaignBatchId || !createdCampaigns.length) {
        setCopyImportStatus(campaignBatchUnavailableMessage('guardar sitelinks para aplicação nas campanhas'), true);
        return;
      }
      const selectedLinks = parsedCopy?.sitelinks
        .filter(link => selectedCopySitelinks.has(link.id))
        .map(link => ({
          title: link.title.text.trim(),
          description1: link.descriptions[0].text.trim(),
          description2: link.descriptions[1].text.trim(),
          anchor: selectedCopySitelinks.get(link.id),
        })) || [];
      if (!selectedLinks.length || selectedLinks.length > 6 || selectedLinks.some(link => !link.title
          || Boolean(link.description1) !== Boolean(link.description2)
          || Array.from(link.title).length > 25 || Array.from(link.description1).length > 35 || Array.from(link.description2).length > 35)) {
        setCopyImportStatus('Escolha de 1 a 6 sitelinks completos e respeite os limites de caracteres indicados.', true);
        return;
      }
      const previous = activeCampaignBatchSitelinks;
      const previousResults = createdCampaigns.map(campaign => ({
        sitelinksResult: campaign.sitelinksResult || null,
        sitelinksError: campaign.sitelinksError || '',
      }));
      activeCampaignBatchSitelinks = selectedLinks.sort((left, right) => left.anchor - right.anchor);
      createdCampaigns.forEach(campaign => { campaign.sitelinksResult = null; campaign.sitelinksError = ''; });
      if (!saveActiveCampaignBatch()) {
        activeCampaignBatchSitelinks = previous;
        createdCampaigns.forEach((campaign, index) => {
          campaign.sitelinksResult = previousResults[index].sitelinksResult;
          campaign.sitelinksError = previousResults[index].sitelinksError;
        });
        setCopyImportStatus('Não foi possível salvar os sitelinks no navegador. O lote manteve a configuração anterior.', true);
        return;
      }
      campaignSitelinksBatchAttempted = false;
      setCampaignBatchStatus('Sitelinks salvos no lote neste navegador. Eles ainda não foram enviados ao Google Ads.', false);
      setStatus('Sitelinks vinculados ao lote. Quando quiser, aplique-os às campanhas pela seção “Sitelinks deste lote”.');
      if (typeof copyImportDialog.close === 'function') copyImportDialog.close(); else copyImportDialog.removeAttribute('open');
      renderCampaignResult();
      updateControlState();
      return;
    }
    const headlines = selectedAssets('headline');
    const descriptions = selectedAssets('description');
    if (headlines.length !== 10 || descriptions.length !== 3) {
      setCopyImportStatus('Selecione exatamente 10 títulos e 3 descrições para preencher todos os campos obrigatórios.', true);
      return;
    }
    if (!headlines.concat(descriptions).every(asset => Array.from(asset.text).length <= asset.limit)) {
      setCopyImportStatus('Edite os itens selecionados que excedem o limite de caracteres antes de aplicar.', true);
      return;
    }
    const promotion = selectedPromotion ? parsedCopy.promotion : null;
    const importedSitelinks = sitelinksFromParsedCopy();
    const currentSitelinks = activeCampaignBatchId ? activeCampaignBatchSitelinks : pendingDraftSitelinks;
    const copyAlreadyFilled = [...form.querySelectorAll('[name="headline"], [name="description"]')].some(field => field.value.trim());
    const promotionAlreadyFilled = Boolean(promotion && (['promotion_target', 'discount_value', 'language_code', 'trigger_value'].some(name => form.elements.namedItem(name).value.trim())
      || form.elements.namedItem('promotion_occasion').value || form.elements.namedItem('trigger_type').value !== 'none'));
    const replacements = [];
    if (copyAlreadyFilled) replacements.push('os títulos e descrições atuais');
    if (promotionAlreadyFilled) replacements.push('os dados de promoção preenchidos');
    if (importedSitelinks.sitelinks.length && currentSitelinks.length) {
      replacements.push(currentSitelinks.length + ' sitelink(s) salvo(s) ' + (activeCampaignBatchId ? 'neste lote' : 'neste rascunho'));
    }
    if (replacements.length && !globalThis.confirm('Aplicar a copy selecionada substituirá ' + replacements.join(' e ')
        + '. Os demais campos da campanha, incluindo URL final, orçamento e palavras-chave, serão mantidos. Continuar?')) return;

    [...form.querySelectorAll('[name="headline"]')].forEach((field, index) => { field.value = headlines[index].text; });
    [...form.querySelectorAll('[name="description"]')].forEach((field, index) => { field.value = descriptions[index].text; });
    if (promotion) {
      if (promotion.target) {
        promotionTargetField.value = promotion.target;
        promotionTargetSource = 'copy';
        promotionTargetAutoValue = promotion.target;
      }
      if (promotion.discountType) { form.elements.namedItem('discount_type').value = promotion.discountType; updatePromotionDiscountFields(); }
      if (promotion.discountValue) {
        discountValueField.value = promotion.discountValue;
        discountValueField.dataset.discountValueSource = 'copy-metadata';
      }
      form.elements.namedItem('promotion_occasion').value = promotion.occasion || '';
      if (promotion.triggerType) form.elements.namedItem('trigger_type').value = promotion.triggerType;
      if (promotion.triggerValue) triggerValueField.value = promotion.triggerValue;
      updatePromotionTriggerFields();
    }
    if (!promotion && discountValueField.dataset.discountValueSource === 'copy-metadata') {
      discountValueField.dataset.discountValueSource = 'copy';
    }
    if (promotion && !promotion.discountValue && discountValueField.dataset.discountValueSource === 'copy-metadata') {
      discountValueField.dataset.discountValueSource = 'copy';
    }
    updatePromotionDiscountDetection();
    const detected = detectPromotionLanguageFromCopy();
    const importedLanguage = promotion?.languageCode || parsedCopy.languageCode;
    if (!detected && importedLanguage) {
      languageField.value = importedLanguage;
      languageDetectionStatus.textContent = 'Idioma informado no bloco da copy: ' + importedLanguage + '. Confira antes de validar a prévia.';
    }
    updatePromotionTargetFromCampaign();
    let sitelinksImportError = false;
    let sitelinksImportNotice = '';
    if (importedSitelinks.detectedCount > 0) {
      if (!importedSitelinks.sitelinks.length) {
        sitelinksImportNotice = ' A copy contém ' + importedSitelinks.detectedCount
          + ' sitelink(s), mas nenhum passou pelos limites de texto; os sitelinks salvos foram mantidos.';
      } else if (activeCampaignBatchId) {
        const previousSitelinks = activeCampaignBatchSitelinks;
        const previousResults = createdCampaigns.map(campaign => ({
          sitelinksResult: campaign.sitelinksResult || null,
          sitelinksError: campaign.sitelinksError || '',
        }));
        activeCampaignBatchSitelinks = importedSitelinks.sitelinks;
        createdCampaigns.forEach(campaign => { campaign.sitelinksResult = null; campaign.sitelinksError = ''; });
        if (!saveActiveCampaignBatch()) {
          activeCampaignBatchSitelinks = previousSitelinks;
          createdCampaigns.forEach((campaign, index) => {
            campaign.sitelinksResult = previousResults[index].sitelinksResult;
            campaign.sitelinksError = previousResults[index].sitelinksError;
          });
          sitelinksImportError = true;
          sitelinksImportNotice = ' A copy detectou ' + importedSitelinks.sitelinks.length
            + ' sitelink(s), mas não foi possível salvá-los no lote; a configuração anterior foi mantida.';
        } else {
          const savedBatch = campaignBatchStore.batches.find(batch => batch.id === activeCampaignBatchId);
          if (activeDraftId && savedBatch?.draftId === activeDraftId) {
            pendingDraftSitelinks = importedSitelinks.sitelinks.map(link => ({ ...link }));
          }
          sitelinksImportNotice = ' ' + importedSitelinks.sitelinks.length
            + ' sitelink(s) detectado(s) e salvo(s) neste lote, com seções numeradas na ordem (#1–#'
            + importedSitelinks.sitelinks.length + '). Use “Sitelinks deste lote” para aplicá-los às campanhas.';
        }
      } else {
        pendingDraftSitelinks = importedSitelinks.sitelinks.map(link => ({ ...link }));
        sitelinksImportNotice = ' ' + importedSitelinks.sitelinks.length
          + ' sitelink(s) detectado(s) e salvo(s) neste rascunho; serão vinculados ao lote quando as campanhas forem criadas, nas seções #1–#'
          + importedSitelinks.sitelinks.length + '.';
      }
      if (importedSitelinks.detectedCount > importedSitelinks.sitelinks.length) {
        sitelinksImportNotice += ' ' + (importedSitelinks.detectedCount - importedSitelinks.sitelinks.length)
          + ' item(ns) não entrou(aram) no lote por exceder o limite de 6 ou os limites de caracteres.';
      }
    }
    clearPreview();
    scheduleDraftSave();
    const draftSaved = saveDraftNow();
    if (draftSaved) persistCopySelection();
    if (!draftSaved && importedSitelinks.detectedCount > 0 && !activeCampaignBatchId) sitelinksImportError = true;
    setStatus('Copy importada. Prévia não validada: confira os campos e clique em “Validar prévia” antes de criar as campanhas.'
      + sitelinksImportNotice + (draftSaved ? '' : ' O navegador não confirmou o salvamento do rascunho.'), sitelinksImportError || !draftSaved, false, true);
    if (typeof copyImportDialog.close === 'function') copyImportDialog.close(); else copyImportDialog.removeAttribute('open');
    if (activeCampaignBatchId) {
      renderCampaignResult();
      updateControlState();
    }
  }

  function validateCampaignFields() {
    const dailyBudget = form.elements.namedItem('daily_budget');
    const maxCpcBid = maxCpcBidField;
    const targetCpa = targetCpaField;
    const targetRoas = targetRoasField;
    const impressionLocation = form.elements.namedItem('impression_share_location');
    const impressionPercent = form.elements.namedItem('impression_share_percent');
    const countryField = form.elements.namedItem('geo_target_country_codes');
    const keywordField = form.elements.namedItem('keywords');
    const negativeField = form.elements.namedItem('negative_keywords');
    const trackingField = form.elements.namedItem('tracking_url_template');
    const suffixField = form.elements.namedItem('final_url_suffix');
    for (const field of [dailyBudget, maxCpcBid, targetCpa, targetRoas, impressionLocation, impressionPercent, countryField, keywordField, negativeField, trackingField, suffixField, finalUrlField]) field.setCustomValidity('');
    for (const field of [dailyBudget]) {
      const value = normalizeDecimal(field.value);
      if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/.test(value) || Number(value) <= 0) {
        field.setCustomValidity('Informe um valor positivo na moeda da conta, com até 6 casas decimais.');
      }
    }
    const strategy = biddingStrategyField.value;
    const positiveDecimal = value => /^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/.test(value) && Number(value) > 0;
    if ((targetCpa.required || targetCpa.value.trim()) && !positiveDecimal(normalizeDecimal(targetCpa.value))) {
      targetCpa.setCustomValidity('Informe o CPA desejado como valor positivo na moeda da conta.');
    }
    if ((targetRoas.required || targetRoas.value.trim())
        && (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(normalizeDecimal(targetRoas.value)) || Number(normalizeDecimal(targetRoas.value)) <= 0)) {
      targetRoas.setCustomValidity('Informe um ROAS positivo em percentual; por exemplo, 200 para 2,0x.');
    }
    if (maxCpcBid.required || maxCpcBid.value.trim()) {
      if (!positiveDecimal(normalizeDecimal(maxCpcBid.value))) maxCpcBid.setCustomValidity('Informe um limite de CPC positivo na moeda da conta.');
    }
    if (impressionLocation.required && !['ANYWHERE_ON_PAGE', 'TOP_OF_PAGE', 'ABSOLUTE_TOP_OF_PAGE'].includes(impressionLocation.value)) {
      impressionLocation.setCustomValidity('Selecione o local desejado na página.');
    }
    if (impressionPercent.required && !/^(?:[1-9]|[1-9]\d|100)$/.test(impressionPercent.value.trim())) {
      impressionPercent.setCustomValidity('Informe uma parcela de impressões inteira entre 1 e 100%.');
    }
    const targetState = campaignTargetState();
    const targetCurrencies = [...new Set(targetState.targets.map(target => target.currencyCode).filter(Boolean))];
    const referenceCurrency = campaignNameAccountCurrency();
    if (targetState.source === 'ficha' && targetState.targets.some(target => !target.account || !target.finalUrl || !target.currencyCode || target.reason)) {
      finalUrlField.setCustomValidity('Uma ou mais contas selecionadas na Ficha não têm conta, moeda ou URL HTTPS válida. Confira a lista de destinos acima.');
    } else if (targetState.targets.length) {
      const conversionIssue = campaignCurrencyConversionIssue({ targets: targetState.targets, sourceCurrency: referenceCurrency, rate: campaignUsdBrlRate() });
      if (conversionIssue) finalUrlField.setCustomValidity(conversionIssue);
    }
    if (['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'].includes(strategy) && targetCpa.value.trim()
        && derivedCpaCurrencyField.value && referenceCurrency && derivedCpaCurrencyField.value !== referenceCurrency) {
      targetCpa.setCustomValidity('O CPA base está em ' + derivedCpaCurrencyField.value + ' e a conta de referência está em ' + referenceCurrency + '. Recalcule as informações do nome.');
    } else if (['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'].includes(strategy) && targetCpa.value.trim() && targetCurrencies.length > 1) {
      const source = campaignNameSource();
      if (!source.commission || !source.percent || targetState.targets.some(target => !commissionCpaForTargetCurrency({
        commission: source.commission,
        percent: source.percent,
        sourceCurrency: source.currency,
        targetCurrency: target.currencyCode,
        usdBrlRate: campaignUsdBrlRate(source),
      }))) targetCpa.setCustomValidity('Não foi possível calcular o CPA em todas as moedas do lote. Recalcule o nome e confira a PTAX USD/BRL.');
    }
    const countries = normalizeGeoCountryField().countryCodes;
    const worldMode = campaignDeliverySource?.geoTargetingMode === 'WORLD';
    if (worldMode ? Boolean(countryField.value.trim())
      : (!countries.length || countries.some(code => !/^[A-Z]{2}$/.test(code))
        || new Set(countries).size !== countries.length)) {
      countryField.setCustomValidity(worldMode
        ? 'O destino Mundo não pode incluir códigos de países específicos.'
        : 'Informe um ou mais códigos de país aceitos pelo Google Ads, sem repetir, por exemplo: DE, FR, US. UK é convertido para GB.');
    }
    keywordField.setCustomValidity(keywordListError(keywordField.value, {required:true, label:'palavras-chave'}));
    negativeField.setCustomValidity(keywordListError(negativeField.value, {label:'palavras-chave negativas'}));
    const trackingValue = trackingField.value.trim();
    if (trackingValue && (!/^https:\/\//i.test(trackingValue) || !/^https:\/\/[^\s]+$/.test(trackingValue))) {
      trackingField.setCustomValidity('O modelo de acompanhamento deve começar com https://.');
    }
    try { ensureGoogleAdsCampaignIdUrlParameter(suffixField.value); }
    catch (error) { suffixField.setCustomValidity(error.message || 'Confira o parâmetro dinâmico de campanha no sufixo da URL final.'); }
    return form.checkValidity();
  }

  function validatePromotionFields() {
    const discountType = form.elements.namedItem('discount_type').value;
    const discountValue = form.elements.namedItem('discount_value');
    const promotionTarget = form.elements.namedItem('promotion_target');
    const triggerType = form.elements.namedItem('trigger_type').value;
    const triggerValue = form.elements.namedItem('trigger_value');
    const language = form.elements.namedItem('language_code');
    discountValue.setCustomValidity('');
    promotionTarget.setCustomValidity('');
    triggerValue.setCustomValidity('');
    language.setCustomValidity('');
    if (discountType === 'percent_off' && !/^(?:[1-9]|[1-9][0-9]|100)$/.test(discountValue.value.trim())) {
      discountValue.setCustomValidity('Informe um percentual inteiro entre 1 e 100.');
    } else if (discountType === 'amount_off' && (!/^[0-9]+(?:\.[0-9]{1,6})?$/.test(normalizeDecimal(discountValue.value)) || Number(normalizeDecimal(discountValue.value)) <= 0)) {
      discountValue.setCustomValidity('Informe um valor positivo usando ponto ou vírgula decimal.');
    }
    if (Array.from(promotionTarget.value.trim()).length > 20) promotionTarget.setCustomValidity('O item da promoção aceita até 20 caracteres.');
    if (triggerType === 'promotion_code' && !/^[A-Za-z0-9-]{1,20}$/.test(triggerValue.value.trim())) {
      triggerValue.setCustomValidity('Use de 1 a 20 letras, números ou hífens.');
    } else if (triggerType === 'orders_over_amount' && (!/^[0-9]+(?:\.[0-9]{1,6})?$/.test(normalizeDecimal(triggerValue.value)) || Number(normalizeDecimal(triggerValue.value)) <= 0)) {
      triggerValue.setCustomValidity('Informe um valor mínimo positivo usando ponto ou vírgula decimal.');
    }
    if (!language.value.trim()) {
      language.setCustomValidity('Preencha a copy para tentar detectar o idioma ou informe uma tag BCP 47, por exemplo pt-BR.');
    } else if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language.value.trim())) {
      language.setCustomValidity('Informe uma tag de idioma BCP 47 válida, por exemplo pt-BR.');
    }
    const start = form.elements.namedItem('start_date');
    const end = form.elements.namedItem('end_date');
    const hasDates = Boolean(start.value || end.value);
    start.required = hasDates;
    end.required = hasDates;
    start.setCustomValidity('');
    end.setCustomValidity('');
    if (start.value && end.value && end.value < start.value) end.setCustomValidity('A data final deve ser igual ou posterior à inicial.');
    return validateCampaignFields();
  }

  function selectedConversionActionForManager(managerCustomerId) {
    const conversionActionSettings = readGuruMediaConversionActionSettings();
    if (conversionActionSettings.invalid) {
      throw new Error('A configuração de ação de conversão por MCC está inválida neste navegador. Revise Configurações globais antes de validar a campanha.');
    }
    const managerId = String(managerCustomerId || '').replace(/\D/g, '');
    return conversionActionSettings.settings.find(setting => setting.mccCustomerId === managerId) || null;
  }

  function applyConversionActionForManager(payload, managerCustomerId) {
    delete payload.conversionActionName;
    delete payload.conversionActionResourceName;
    const selected = selectedConversionActionForManager(managerCustomerId);
    if (selected) {
      payload.conversionActionName = selected.name;
      payload.conversionActionResourceName = selected.resourceName;
    }
    return payload;
  }

  function collectPayload() {
    const ids = currentIds();
    if (!ids) throw new Error('Selecione uma MCC e uma conta Google Ads.');
    const selectedConversionAction = selectedConversionActionForManager(ids.managerCustomerId);
    const discountType = form.elements.namedItem('discount_type').value;
    const triggerType = form.elements.namedItem('trigger_type').value;
    const suffixField = form.elements.namedItem('final_url_suffix');
    const finalUrlSuffix = ensureGoogleAdsCampaignIdUrlParameter(suffixField.value);
    suffixField.value = finalUrlSuffix;
    return {
      ...ids,
      ...(selectedConversionAction ? {
        conversionActionName: selectedConversionAction.name,
        conversionActionResourceName: selectedConversionAction.resourceName,
      } : {}),
      campaignName: form.elements.namedItem('campaign_name').value.trim(),
      finalUrl: form.elements.namedItem('final_url').value.trim(),
      dailyBudget: normalizeDecimal(form.elements.namedItem('daily_budget').value),
      maxCpcBid: ['MANUAL_CPC', 'MAXIMIZE_CLICKS', 'TARGET_IMPRESSION_SHARE'].includes(biddingStrategyField.value)
        ? normalizeDecimal(maxCpcBidField.value) : '',
      biddingStrategy: biddingStrategyField.value,
      targetCpa: ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'].includes(biddingStrategyField.value) ? normalizeDecimal(targetCpaField.value) : '',
      targetCpaCurrency: ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'].includes(biddingStrategyField.value) ? derivedCpaCurrencyField.value.trim().toUpperCase() : '',
      targetRoasPercent: ['TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE'].includes(biddingStrategyField.value) ? normalizeDecimal(targetRoasField.value) : '',
      impressionShareLocation: biddingStrategyField.value === 'TARGET_IMPRESSION_SHARE' ? form.elements.namedItem('impression_share_location').value : '',
      impressionSharePercent: biddingStrategyField.value === 'TARGET_IMPRESSION_SHARE' ? form.elements.namedItem('impression_share_percent').value.trim() : '',
      geoTargetingMode: campaignDeliverySource?.geoTargetingMode === 'WORLD' ? 'WORLD' : 'COUNTRIES',
      geoTargetCountryCodes: normalizeGoogleAdsCountryCodes(form.elements.namedItem('geo_target_country_codes').value.trim().split(/[\s,;]+/).filter(Boolean)),
      keywords: textLines(form.elements.namedItem('keywords').value),
      keywordMatchType: 'BROAD',
      individualKeywordMatch: true,
      negativeKeywords: textLines(form.elements.namedItem('negative_keywords').value),
      negativeKeywordMatchType: 'BROAD',
      targetSearchNetwork: form.elements.namedItem('target_search_network').checked,
      targetContentNetwork: form.elements.namedItem('target_content_network').checked,
      containsEuPoliticalAdvertising: form.elements.namedItem('contains_eu_political_advertising').value,
      trackingUrlTemplate: form.elements.namedItem('tracking_url_template').value.trim(),
      finalUrlSuffix,
      headlines: [...form.querySelectorAll('[name="headline"]')].map(input => input.value.trim()),
      descriptions: [...form.querySelectorAll('[name="description"]')].map(input => input.value.trim()),
      promotion: {
        target: form.elements.namedItem('promotion_target').value.trim(),
        occasion: form.elements.namedItem('promotion_occasion').value || null,
        discount_type: discountType,
        discount_value: discountType === 'percent_off' ? form.elements.namedItem('discount_value').value.trim() : normalizeDecimal(form.elements.namedItem('discount_value').value),
        trigger_type: triggerType,
        trigger_value: triggerType === 'none' ? '' : triggerType === 'promotion_code' ? form.elements.namedItem('trigger_value').value.trim() : normalizeDecimal(form.elements.namedItem('trigger_value').value),
        language_code: form.elements.namedItem('language_code').value.trim(),
        start_date: form.elements.namedItem('start_date').value || null,
        end_date: form.elements.namedItem('end_date').value || null,
      },
    };
  }

  function addPreviewRow(label, value, isError = false, action = null, isSuccess = false) {
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    if (isError) { term.classList.add("is-preview-error"); detail.classList.add("is-preview-error"); }
    else if (isSuccess) detail.classList.add('is-preview-success');
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn google-ads-preview-row-action';
      button.textContent = action.label;
      if (Number.isInteger(action.historyIndex)) button.dataset.googleAdsPreviewHistoryEntry = String(action.historyIndex);
      else button.dataset.googleAdsPreviewEntry = String(action.index);
      button.disabled = busy;
      detail.append(button);
    }
    previewDetails.append(term, detail);
  }

  function describeRequestDiagnostic(diagnostic, retryContext = 'creation') {
    if (!diagnostic?.id) return '';
    if (retryContext === true) retryContext = 'preview';
    if (retryContext === false) retryContext = 'creation';
    const parts = ['diagnóstico ' + diagnostic.id];
    if (diagnostic.stage) parts.push('etapa ' + diagnostic.stage);
    if (diagnostic.upstreamHttpStatus) parts.push('HTTP Google ' + diagnostic.upstreamHttpStatus);
    if (diagnostic.googleStatus) parts.push('status ' + diagnostic.googleStatus);
    if (diagnostic.googleErrorCodes?.length) parts.push('código(s) ' + diagnostic.googleErrorCodes.join(', '));
    if (diagnostic.googleErrorCodes?.some(code => /(?:^|\.)POLICY_FINDING$/.test(code))) {
      parts.push('rejeição por política do Google Ads; revise os textos e recursos do anúncio antes de revalidar');
    }
    if (diagnostic.fieldPaths?.length) parts.push('campo(s) ' + diagnostic.fieldPaths.join(', '));
    if (diagnostic.googleErrorSummary) parts.push('detalhe Google: ' + diagnostic.googleErrorSummary);
    if (diagnostic.curlErrno) parts.push('cURL ' + diagnostic.curlErrno);
    if (diagnostic.responseFormat) parts.push('resposta ' + diagnostic.responseFormat);
    if (diagnostic.googleRequestId) parts.push('requisição Google ' + diagnostic.googleRequestId);
    parts.push(diagnostic.retryable
      ? retryContext === 'preview'
        ? 'a falha pode ser temporária; é seguro validar a prévia novamente'
        : retryContext === 'audience'
          ? 'a falha pode ser temporária; revise este diagnóstico antes de tentar novamente'
          : 'a falha pode ser temporária; confira a conta antes de repetir a criação'
      : retryContext === 'audience'
        ? 'a falha não foi marcada como temporária; corrija a causa antes de tentar novamente'
        : 'a falha não foi marcada como temporária; corrija a causa antes de repetir');
    return parts.join(' · ');
  }

  function formatRequestFailure(error, fallback, retryContext = 'creation') {
    let message = error?.message || fallback;
    if (retryContext === 'preview' && error?.code === 'browser_no_response') {
      message += ' Confira no Network se o preflight OPTIONS ou o POST falhou; o Hub não consegue distinguir isso pela mensagem do navegador. Consultas preparatórias podem ter chegado ao servidor, então eventual consumo de cota não é confirmável.';
    }
    if (retryContext === 'preview' && error?.code === 'server_error') {
      message += ' A falha ocorreu durante a preparação; a resposta não informa se consultas Google Ads anteriores chegaram a ser executadas ou consumiram cota.';
    }
    if (Number.isInteger(error?.httpStatus)) message += ' Resposta HTTP ' + error.httpStatus + '.';
    if (error?.safeFailure) {
      const failure = error.safeFailure;
      message += ' Detalhe técnico: ' + failure.type + ' · ' + failure.file + ':' + failure.line
        + (failure.missingFunction ? ' · função ausente: ' + failure.missingFunction : '') + '.';
    }
    const details = describeRequestDiagnostic(error?.diagnostic, retryContext);
    return details ? message + ' (' + details + ').' : message;
  }

  function renderSavedPreviewHistory() {
    if (!previewHistory?.entries?.length) return false;
    previewDetails.replaceChildren();
    previewTitle.textContent = 'Últimos resultados salvos';
    previewDescription.textContent = 'Histórico local da última execução. Estes dados permanecem visíveis após atualizar a página; quando os parâmetros mudarem, o histórico não libera a criação. Use a ação de uma linha para validar somente aquela campanha.';
    addPreviewRow('Execução', localDateLabel(previewHistory.validatedAt) + ' · ' + previewHistory.entries.length + ' campanha(s) · nenhum resultado abaixo dispara nova consulta');
    previewHistory.entries.forEach((entry, index) => {
      const label = 'Campanha ' + String(index + 1).padStart(2, '0') + ' · ' + (entry.percent || '?') + '% · ' + (entry.accountName || entry.customerId);
      let detail = '';
      let isError = false;
      if (entry.previewResult?.resultType === 'validated_new') {
        const result = entry.previewResult;
        const amount = result.targetCpaMicros ? formatMoneyMicros(result.targetCpaMicros, result.accountCurrency) : 'CPA não informado';
        detail = 'Validada anteriormente · validateOnly aprovado · ' + result.campaignName + ' · ' + amount
          + ' · segmentação por presença: ' + (result.positiveGeoTargetType || 'não confirmada') + ' · não criada';
      } else if (entry.previewResult?.resultType === 'existing') {
        const result = entry.previewResult;
        detail = 'Encontrada anteriormente · ID ' + result.campaignId + ' · ' + result.campaignStatus + ' · ' + result.channelType
          + (result.adGroupCount === 1 ? ' · grupo ' + result.adGroupId : '');
      } else if (entry.state === 'preview_failed') {
        detail = 'Falha na última tentativa · ' + entry.errorMessage;
        isError = true;
      } else if (entry.state === 'previewing') {
        detail = entry.previewResult ? 'A execução foi interrompida; o resultado anterior foi preservado.' : 'A execução foi interrompida antes de salvar o resultado.';
      } else detail = entry.errorMessage || 'Ainda não havia resultado concluído para esta campanha.';
      if (entry.diagnostic?.id) detail += ' · ' + describeRequestDiagnostic(entry.diagnostic, 'preview');
      addPreviewRow(label, detail, isError, {
        historyIndex: index,
        label: entry.previewResult ? 'Revalidar' : 'Validar campanha',
      }, !isError && !['preview_failed', 'preview_stale'].includes(entry.state)
        && entry.previewResult?.resultType === 'validated_new');
    });
    previewArea.hidden = true;
    createButton.hidden = true;
    previewSnapshot = '';
    return true;
  }

  function renderBatchPreview() {
    previewDetails.replaceChildren();
    if (!batchEntries.length) {
      if (renderSavedPreviewHistory()) updateControlState();
      else {
        previewArea.hidden = true;
        createButton.hidden = true;
      }
      return;
    }
    batchEntries.forEach(entry => {
      if (entry.state === 'previewed' && entry.previewResult?.positive_geo_target_type !== 'PRESENCE') {
        entry.state = 'preview_failed';
        entry.errorMessage = 'A prévia salva não confirma a segmentação por presença. Valide novamente com o serviço privado atualizado.';
      } else if (entry.state === 'previewed') {
        if (!campaignPreviewGoalMatchesSelection(entry.previewResult, entry.payload, {
          allowLegacyResourceOmission: Boolean(entry.payloadFingerprint && entry.payloadFingerprint === entry.currentPayloadFingerprint),
        })) {
          entry.state = 'preview_failed';
          entry.errorMessage = 'A prévia salva não corresponde à ação de conversão selecionada para esta MCC. Valide esta campanha novamente.';
        }
      }
    });
    const allResolved = batchEntries.length > 0 && batchEntries.every(entry => ['previewed', 'existing'].includes(entry.state));
    const newCount = batchEntries.filter(entry => entry.state === 'previewed').length;
    const existingCount = batchEntries.filter(entry => entry.state === 'existing').length;
    const staleCount = batchEntries.filter(entry => entry.state === 'preview_stale').length;
    previewArea.hidden = true;
    createButton.hidden = !allResolved || newCount === 0;
    previewSnapshot = allResolved ? JSON.stringify(batchEntries.map(entry => entry.payload)) : '';
    const failedEntries = batchEntries.filter(entry => entry.state === 'preview_failed');
    const allHaveDiagnostics = failedEntries.length > 0 && failedEntries.every(entry => entry.diagnostic?.id);
    const allRetryable = allHaveDiagnostics && failedEntries.every(entry => entry.diagnostic.retryable === true);
    const failureStatus = allRetryable
      ? 'A prévia falhou por uma causa possivelmente temporária. Nenhuma campanha foi criada; clique em “Validar prévia” para tentar de novo. Confira o ID de diagnóstico nos detalhes.'
      : allHaveDiagnostics
        ? 'A prévia falhou e nenhuma campanha foi criada. Confira o código/etapa e o ID de diagnóstico antes de repetir.'
        : 'Uma ou mais prévias falharam. Nenhuma campanha foi criada; confira o detalhe da falha e valide novamente após corrigir a causa.';
    const successStatus = existingCount && newCount
      ? 'A consulta encontrou ' + existingCount + ' campanha(s) já existente(s) e validou ' + newCount + ' nova(s) com validateOnly. Só as novas serão criadas; as existentes elegíveis ficam disponíveis para ações de público.'
      : existingCount
        ? 'A consulta encontrou ' + existingCount + ' campanha(s) já existente(s) pelo nome exato. Nenhuma criação foi validada nem enviada; exclusões e segmentação aparecem somente para Search pausada, e a segmentação exige grupo único.'
        : 'A API validou ' + newCount + ' campanha(s) nova(s) com validateOnly. Nenhum recurso foi criado; confirme para criá-las pausadas.';
    const pendingCount = batchEntries.filter(entry => entry.state === 'pending').length;
    const failedCount = batchEntries.filter(entry => entry.state === 'preview_failed').length;
    const unresolvedCount = pendingCount + failedCount + staleCount;
    const partialStatus = 'Progresso da validação: ' + (batchEntries.length - unresolvedCount) + ' de ' + batchEntries.length
      + ' resultados atuais · ' + pendingCount + ' pendentes · ' + staleCount + ' desatualizados · ' + failedCount + ' falharam. Revalide somente as linhas pendentes, desatualizadas ou com falha.';
    setStatus(allResolved ? successStatus : partialStatus + ((failedCount || staleCount) ? ' Nenhuma criação é liberada até todas as linhas atuais passarem.' : ''), !allResolved && (failedCount > 0 || staleCount > 0));
    renderCampaignResult();
    updateControlState();
  }

  async function runBatchCreation(entriesToCreate) {
    if (!entriesToCreate.length || busy) return;
    for (const entry of entriesToCreate) {
      try { validateHubCampaignPositiveGeoTarget(entry.previewResult); }
      catch (error) {
        entry.state = 'preview_failed';
        entry.errorMessage = error.message || 'A prévia não confirmou a segmentação por presença.';
        renderBatchPreview();
        setStatus(entry.errorMessage + ' Nenhuma criação foi solicitada.', true);
        return;
      }
    }
    if (!activeCampaignBatchId) {
      clearCampaignImageBatchPreviews();
      activeCampaignBatchId = createCampaignBatchId();
      activeCampaignBatchCreatedAt = new Date().toISOString();
      activeCampaignBatchPositiveKeywords = { inputText: '', preview: null, result: null, updatedAt: '' };
      campaignBatchPositiveKeywordsMessage = '';
      resetCampaignDestinationUrlBatchState();
      campaignStatusLog = null;
      activeCampaignBatchSitelinks = pendingDraftSitelinks.map(link => ({ ...link }));
      activeCampaignBatchFormSnapshot = campaignBatchFormSnapshotForCampaigns(
        entriesToCreate.map(entry => ({ campaignName: entry.payload.campaignName })),
        collectDraftValues(),
      );
      imageUploadConfirmed = false;
      imageUploadConfirmedAccountIds = [];
      campaignImageUploadSelectedAccountIds = null;
      campaignImageAssetUploads = [];
      campaignImageUploadFiles = [];
      campaignImageUploadNeedsAdjustment = [];
      campaignImageUploadFilesSource = 'none';
      campaignImageUploadSelectionError = '';
      campaignImageUploadSelectionBusy = false;
      campaignImageUploadProgress = null;
      campaignImageUploadApplying = false;
      campaignSitelinksBatchAttempted = false;
    }
    if (!previewId) {
      clearCampaignImageBatchPreviews();
      activeCampaignBatchId = '';
      activeCampaignBatchCreatedAt = '';
      resetCampaignDestinationUrlBatchState();
      campaignStatusLog = null;
      activeCampaignBatchFormSnapshot = null;
      setStatus('A prévia local não está disponível para registrar as tentativas. Nenhuma criação foi enviada.', true);
      return;
    }
    try {
      linkGoogleAdsCampaignPreviewToBatch(previewId, activeCampaignBatchId);
      const linkedPreview = loadGoogleAdsCampaignPreview(previewId);
      if (!linkedPreview || linkedPreview.batchId !== activeCampaignBatchId || linkedPreview.creationAuditVersion !== 2) {
        throw new Error('Não foi possível confirmar a trilha local write-ahead deste lote.');
      }
      for (const entry of entriesToCreate) {
        const matches = linkedPreview.entries.filter(saved => saved.managerCustomerId === String(entry.payload.managerCustomerId || '')
          && saved.customerId === String(entry.payload.customerId || '')
          && saved.campaignName === String(entry.payload.campaignName || '')
          && saved.previewResult?.resultType === 'validated_new');
        if (matches.length !== 1) throw new Error('A campanha ' + entry.payload.campaignName + ' não corresponde a uma única linha nova da prévia salva.');
      }
    } catch (error) {
        clearCampaignImageBatchPreviews();
        activeCampaignBatchId = '';
        activeCampaignBatchCreatedAt = '';
        resetCampaignDestinationUrlBatchState();
        campaignStatusLog = null;
        activeCampaignBatchFormSnapshot = null;
        setStatus((error.message || 'Não foi possível vincular a prévia ao lote.') + ' Nenhuma criação foi enviada.', true);
        return;
    }
    campaignBatchRestored = false;
    busy = true;
    creating = true;
    updateControlState();
    const existingTargets = createdCampaigns.filter(campaign => campaign.source === 'existing');
    const createdDuringRun = [];
    let stoppedBeforeRequest = false;
    for (let index = 0; index < entriesToCreate.length; index++) {
      const entry = entriesToCreate[index];
      const startedAtUtc = new Date().toISOString();
      const attemptId = createCampaignCreationAttemptId();
      const inFlightAttempt = {
        attemptId,
        state: 'in_flight',
        startedAtUtc,
        completedAtUtc: '',
        campaignId: '',
        campaignStatus: '',
        errorMessage: '',
        diagnostic: null,
      };
      try {
        saveGoogleAdsCampaignCreationAttempt(previewId, {
          managerCustomerId: entry.payload.managerCustomerId,
          customerId: entry.payload.customerId,
          campaignName: entry.payload.campaignName,
          attempt: inFlightAttempt,
        });
        entry.creationAttempts = [...(entry.creationAttempts || []).filter(item => item.attemptId !== attemptId), inFlightAttempt].slice(-20);
      } catch (error) {
        entry.state = 'failed';
        entry.errorMessage = 'Falha local antes do envio: não foi possível gravar o registro da tentativa ('
          + (error.message || 'erro de armazenamento') + '). Nenhuma solicitação de criação foi enviada.';
        stoppedBeforeRequest = true;
        renderCampaignResult();
        setStatus(entry.errorMessage + ' As campanhas seguintes também não foram enviadas.', true);
        break;
      }
      entry.state = 'creating';
      renderCampaignResult();
      setStatus('Criando campanha ' + (index + 1) + ' de ' + entriesToCreate.length + ' em ' + entry.accountName + ': ' + entry.payload.campaignName + '.');
      let result = null;
      try {
        result = await createGoogleAdsSearchCampaign(entry.payload);
      } catch (error) {
        entry.state = error?.code && definitiveCreationFailureCodes.has(error.code) ? 'failed' : 'uncertain';
        entry.diagnostic = error?.diagnostic || null;
        entry.errorMessage = formatRequestFailure(error, 'O servidor não confirmou a criação.');
      }
      const completedAtUtc = new Date().toISOString();
      const terminalAttempt = result ? {
        ...inFlightAttempt,
        state: 'created',
        completedAtUtc,
        campaignId: String(result.campaignId || ''),
        campaignStatus: String(result.status || 'PAUSED'),
        errorMessage: '',
        diagnostic: null,
      } : {
        ...inFlightAttempt,
        state: entry.state,
        completedAtUtc,
        errorMessage: entry.errorMessage,
        diagnostic: entry.diagnostic,
      };
      try {
        saveGoogleAdsCampaignCreationAttempt(previewId, {
          managerCustomerId: entry.payload.managerCustomerId,
          customerId: entry.payload.customerId,
          campaignName: entry.payload.campaignName,
          attempt: terminalAttempt,
        });
        entry.creationAttempts = [...(entry.creationAttempts || []).filter(item => item.attemptId !== attemptId), terminalAttempt].slice(-20);
      } catch (error) {
        entry.creationAttemptSaveError = 'O resultado da solicitação não pôde ser gravado no histórico local: ' + (error.message || 'erro de armazenamento');
        if (entry.state === 'created') setCampaignBatchStatus(entry.creationAttemptSaveError + ' A criação pode estar confirmada; confira o ID antes de qualquer repetição.', true);
      }
      if (result) {
        entry.state = 'created';
        entry.errorMessage = '';
        entry.result = {
          ...result,
          verified: true,
          managerCustomerId: entry.payload.managerCustomerId,
          customerId: entry.payload.customerId,
          accountName: entry.accountName,
          finalUrl: entry.payload.finalUrl,
          geoTargetingSnapshot: googleAdsCampaignGeoTargetingFromPayload(entry.payload, { source: 'hub_creation', recordedAtUtc: completedAtUtc }),
        };
        entry.result.source = 'created';
        entry.result.campaignChannelType = 'SEARCH';
        entry.result.audienceGrouped = false;
        entry.result.adGroupStatus = 'ENABLED';
        if (!audienceStateByCampaign.has(campaignOperationKey(entry.result))) audienceStateByCampaign.set(campaignOperationKey(entry.result), {});
        createdDuringRun.push(entry.result);
        const confirmedCampaigns = [...existingTargets, ...batchEntries.filter(item => item.state === 'created').map(item => item.result)];
        const batchSaved = saveActiveCampaignBatch(confirmedCampaigns);
        let localRegistrationError = '';
        if (typeof onCampaignsCreated !== 'function' && onCampaignCreated) {
          try {
            const registration = await onCampaignCreated(entry.result);
            if (registration?.conflicts?.length) localRegistrationError = 'A criação foi confirmada, mas o vínculo local ficou pendente: ' + registration.conflicts[0];
          } catch (error) {
            localRegistrationError = 'A criação foi confirmada, mas a base local não foi atualizada: ' + (error?.message || 'erro local');
          } finally {
            refreshHubCampaignRecovery();
          }
        }
        if (localRegistrationError) setCampaignBatchStatus(localRegistrationError + ' O lote salvo poderá ser usado para recuperar o vínculo sem consultar a API.', true);
        else if (!batchSaved) setCampaignBatchStatus('A criação foi confirmada, mas o lote não foi salvo neste navegador. A campanha permanece criada no Google Ads.', true);
      }
      renderCampaignResult();
    }
    completed = true;
    uncertain = batchEntries.some(entry => entry.state === 'uncertain');
    createdCampaigns = [...existingTargets, ...batchEntries.filter(entry => entry.state === 'created').map(entry => entry.result)];
    createButton.hidden = true;
    previewSnapshot = '';
    if (!createdCampaigns.some(item => campaignOperationKey(item) === campaignOperationKey(createdCampaign))) {
      const nextCampaign = createdCampaigns[0] || null;
      if (nextCampaign) selectCreatedCampaign(campaignOperationKey(nextCampaign));
      else {
        createdCampaign = null;
        audienceTargetingResult = null;
        audienceTargetingError = '';
        audienceExclusionsResult = null;
        audienceExclusionsError = '';
      }
    }
    if (createdCampaigns.length) saveActiveCampaignBatch();
    else {
      const attemptedBatchId = activeCampaignBatchId;
      if (previewId && attemptedBatchId && !uncertain) {
        try { releaseGoogleAdsCampaignPreviewFromBatch(previewId, attemptedBatchId); }
        catch { /* Se não for possível liberar, a prévia segue bloqueada; ela nunca será reutilizada em duplicidade. */ }
      }
      activeCampaignBatchId = '';
      clearCampaignImageBatchPreviews();
      activeCampaignBatchCreatedAt = '';
      resetCampaignDestinationUrlBatchState();
      campaignStatusLog = null;
      activeCampaignBatchFormSnapshot = null;
      imageUploadConfirmed = false;
      imageUploadConfirmedAccountIds = [];
      campaignImageUploadSelectedAccountIds = null;
      campaignImageAssetUploads = [];
      campaignImageUploadFiles = [];
      campaignImageUploadNeedsAdjustment = [];
      campaignImageUploadFilesSource = 'none';
      campaignImageUploadSelectionError = '';
      campaignImageUploadSelectionBusy = false;
      campaignImageUploadProgress = null;
      campaignImageUploadApplying = false;
      refreshCampaignBatchPicker();
    }
    if (createdDuringRun.length && onCampaignsCreated) {
      setStatus('Registrando ' + createdDuringRun.length + ' campanha(s) confirmada(s) na base local…', false, true);
      let localRegistrationError = '';
      try {
        const registration = await onCampaignsCreated(createdDuringRun);
        if (registration?.conflicts?.length) localRegistrationError = 'A criação foi confirmada, mas o vínculo local ficou pendente: ' + registration.conflicts[0];
      } catch (error) {
        localRegistrationError = 'A criação foi confirmada, mas a base local não foi atualizada: ' + (error?.message || 'erro local');
      } finally {
        refreshHubCampaignRecovery();
      }
      if (localRegistrationError) setCampaignBatchStatus(localRegistrationError + ' O lote salvo poderá ser usado para recuperar o vínculo sem consultar a API.', true);
    }
    busy = false;
    creating = false;
    const successes = batchEntries.filter(entry => entry.state === 'created').length;
    const failures = batchEntries.filter(entry => entry.state === 'failed').length;
    const uncertainCount = batchEntries.filter(entry => entry.state === 'uncertain').length;
    const existingCount = batchEntries.filter(entry => entry.state === 'existing').length;
    const statusMessage = successes + ' campanha(s) nova(s) confirmada(s) pausada(s); ' + existingCount
      + ' campanha(s) já encontrada(s) e preservada(s), sem recriação; ' + failures + ' falha(s) confirmada(s), ' + uncertainCount + ' sem confirmação conclusiva.';
    renderCampaignResult();
    updateControlState();
    setStatus(stoppedBeforeRequest
      ? statusMessage + ' A execução foi interrompida antes de uma campanha; ela e as seguintes não tiveram solicitação enviada.'
      : statusMessage + (entriesToCreate.some(entry => entry.creationAttemptSaveError) ? ' O registro final de uma ou mais tentativas falhou; use o ID confirmado e confira no Google Ads antes de repetir.' : ''),
    failures > 0 || uncertainCount > 0 || stoppedBeforeRequest || entriesToCreate.some(entry => entry.creationAttemptSaveError));
  }

  async function consolidateVerifiedCampaignBatch() {
    if (busy || !previewId || !activeDraftId || !batchEntries.length || batchEntries.some(entry => entry.state !== 'uncertain' || entry.goalFullyVerified !== true || !entry.goalInspectionResult?.found)) return;
    const pending = batchEntries.map(entry => ({ entry, campaignId: String(entry.goalInspectionResult.result.campaign?.id || '') }));
    if (pending.some(item => !/^[1-9]\d{0,19}$/.test(item.campaignId))) { setStatus('Não foi possível confirmar todos os IDs. Nenhum lote foi salvo.', true); return; }
    const groups = new Map();
    for (const item of pending) { const key = item.entry.payload.managerCustomerId + ':' + item.entry.payload.customerId; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); }
    if (!globalThis.confirm('Salvar estas ' + pending.length + ' campanhas como lote neste navegador? O Hub fará uma conferência de leitura por conta (' + groups.size + ' conta(s)), que usa cota da API. Nenhuma campanha será criada ou alterada.')) return;
    busy = true; renderCampaignResult(); updateControlState();
    try {
      const preview = loadGoogleAdsCampaignPreview(previewId);
      if (!preview?.batchId || preview.draftId !== activeDraftId || preview.entries.length !== pending.length) throw new Error('O vínculo da tentativa não está disponível. Nenhum lote foi salvo.');
      const latest = loadGoogleAdsCampaignBatches();
      if (latest.batches.some(batch => batch.id === preview.batchId)) throw new Error('Esta tentativa já possui um lote salvo. Abra o lote existente.');
      const savedKeys = savedCampaignAssociationKeys(latest);
      const candidates = pending.map(({entry, campaignId}) => ({managerCustomerId: entry.payload.managerCustomerId, customerId: entry.payload.customerId, campaignId, campaignName: entry.payload.campaignName}));
      if (candidates.some(item => savedKeys.has(campaignAssociationKey(item)))) throw new Error('Uma campanha já pertence a outro lote salvo. Confira os lotes antes de continuar.');
      if (candidates.some(item => !preview.entries.some(saved => saved.managerCustomerId === item.managerCustomerId && saved.customerId === item.customerId && saved.campaignName === item.campaignName))) throw new Error('As campanhas não correspondem à tentativa salva. Nenhum lote foi salvo.');
      const targets = campaignTargetState().targets || [];
      const urls = new Map(targets.map(target => [String(target.accountId || ''), String(target.finalUrl || '').trim()]));
      const verifiedCampaigns = [];
      for (const group of groups.values()) {
        const first = group[0].entry; setStatus('Conferindo ' + (first.accountName || first.payload.customerId) + ' para salvar o lote…', false, true, true);
        const result = await verifyGoogleAdsCampaignsForAssociation({managerCustomerId:first.payload.managerCustomerId,customerId:first.payload.customerId,campaigns:group.map(item => ({campaignId:item.campaignId,campaignName:item.entry.payload.campaignName}))});
        const expectedIds = new Set(group.map(item => item.campaignId));
        if (result.length !== group.length || new Set(result.map(item => item.campaignId)).size !== expectedIds.size || result.some(item => !expectedIds.has(item.campaignId) || item.status !== 'PAUSED' || item.channelType !== 'SEARCH')) throw new Error('A conferência encontrou campanha ausente, duplicada, não pausada ou de outro tipo. Nenhum lote foi salvo.');
        for (const item of result) { const match = group.find(candidate => candidate.campaignId === item.campaignId); const checkedAt = match?.entry.goalVerifiedAt || ''; if (!Number.isFinite(Date.parse(checkedAt))) throw new Error('A data da conferência da meta não está disponível. Consulte a campanha novamente.'); verifiedCampaigns.push({managerCustomerId:first.payload.managerCustomerId,customerId:first.payload.customerId,campaignId:item.campaignId,campaignName:item.campaignName,accountName:first.accountName || '',status:item.status,campaignChannelType:item.channelType,audienceGrouped:item.audienceGrouped,adGroupId:item.adGroupId,adGroupStatus:item.adGroupStatus,finalUrl:urls.get(String(first.payload.customerId)) || '',geoTargetingSnapshot:googleAdsCampaignGeoTargetingFromPayload(match?.entry?.payload,{source:'hub_creation',recordedAtUtc:new Date().toISOString()}),source:'existing',goalVerification:{checkedAt,goalName:'meta personalizada da ação compra',actionName:'Conversão compra off-line (upload)',noStandardGoals:true}}); }
      }
      if (verifiedCampaigns.length !== pending.length) throw new Error('A conferência não cobriu todas as campanhas. Nenhum lote foi salvo.');
      const latestAgain = loadGoogleAdsCampaignBatches();
      if (latestAgain.batches.some(batch => batch.id === preview.batchId) || candidates.some(item => savedCampaignAssociationKeys(latestAgain).has(campaignAssociationKey(item)))) throw new Error('Um lote mudou durante a conferência. Confira os lotes antes de repetir.');
      const now = new Date().toISOString();
      const snapshot = campaignBatchFormSnapshotForCampaigns(verifiedCampaigns, collectDraftValues());
      campaignBatchStore = saveGoogleAdsCampaignBatch({id:preview.batchId,label:'Campanhas recuperadas · ' + verifiedCampaigns[0].campaignName,draftId:activeDraftId,previewId:preview.id,createdAt:now,updatedAt:now,selectedCampaignKey:verifiedCampaigns[0].customerId + ':' + verifiedCampaigns[0].campaignId,sitelinks:[],destinationUrls:[],formSnapshot:snapshot,campaigns:verifiedCampaigns});
      busy = false; openSavedCampaignBatch(preview.batchId);
      setStatus('Lote recuperado e salvo neste navegador com ' + verifiedCampaigns.length + ' campanha(s) já existentes e pausadas. Nenhuma campanha foi criada ou alterada.', false);
    } catch (error) { busy = false; setStatus(error.message || 'Não foi possível salvar o lote recuperado.', true); renderCampaignResult(); updateControlState(); }
  }

  async function retryFailedCampaigns() {
    const failedEntries = batchEntries.filter(entry => entry.state === 'failed');
    if (!failedEntries.length || busy) return;
    const names = failedEntries.map(entry => '• ' + entry.accountName + ' · ' + entry.payload.campaignName).join('\n');
    if (!globalThis.confirm('Tentar novamente somente ' + failedEntries.length + ' campanha(s) com falha confirmada? As criações já confirmadas serão mantidas e não serão repetidas.\n\n' + names)) return;
    await runBatchCreation(failedEntries);
  }

  function samePreviewBatch(entries) {
    return batchEntries.length === entries.length
      && batchEntries.every((entry, index) => JSON.stringify(entry.payload) === JSON.stringify(entries[index].payload));
  }

  async function runCampaignPreview({ mode = 'bulk', entryIndex = null, entryIdentity = null, triggerButton = null } = {}) {
    if (busy || completed || uncertain || !currentIds()) return;
    const draftSaved = saveDraftNow();
    const quotaUsage = emptyPreviewQuotaUsage();
    lastPreviewQuotaUsage = quotaUsage;
    updateCpaVariantSelectionCount();
    function recordPreviewQuotaTelemetry({ serverCounts = null } = {}) {
      quotaUsage.requestsObserved += 1;
      if (serverCounts?.version === 2) {
        quotaUsage.requestsWithServerCounts += 1;
        quotaUsage.quotaOperationsEstimated += Number(serverCounts.quotaOperationsEstimated) || 0;
        quotaUsage.quotaOperationsUnknown += Number(serverCounts.quotaOperationsUnknown) || 0;
        quotaUsage.requestsUnknown += Number(serverCounts.requestsUnknown) || 0;
      } else quotaUsage.requestsWithoutServerCounts += 1;
      lastPreviewQuotaUsage = { ...quotaUsage };
      refreshPreviewButtonQuotaLabel();
      if (previewFingerprint) savePreviewCheckpoint({ draftSaved });
    }
    function finishPreviewQuotaMeasurement() {
      quotaUsage.completedAtUtc = new Date().toISOString();
      lastPreviewQuotaUsage = { ...quotaUsage };
      refreshPreviewButtonQuotaLabel();
      if (quotaUsage.requestsObserved > 0 && previewFingerprint) savePreviewCheckpoint({ draftSaved });
    }
    if (!validatePromotionFields()) {
      const invalidControl = [...form.querySelectorAll(':invalid')]
        .find(control => !control.disabled && control.type !== 'hidden');
      const fieldLabel = invalidControl?.closest('label')?.querySelector('span')?.textContent?.trim()
        || invalidControl?.labels?.[0]?.textContent?.trim()
        || invalidControl?.getAttribute('aria-label')
        || 'um campo obrigatório';
      const reason = invalidControl?.validationMessage?.trim();
      setStatus('A prévia não começou. Corrija "' + fieldLabel + '"' + (reason ? ': ' + reason : ' e tente novamente.'), true);
      form.reportValidity();
      return;
    }
    let entries;
    try { entries = buildCampaignBatchEntries(); }
    catch (error) { setStatus((error?.message || 'Confira os campos e destinos antes de validar.') + ' Nenhuma consulta à API foi feita.', true); return; }
    if (entryIdentity) {
      let matchedIndex = entries.findIndex(entry =>
        String(entry.payload.managerCustomerId || '') === String(entryIdentity.managerCustomerId || '')
        && String(entry.payload.customerId || '') === String(entryIdentity.customerId || '')
        && String(entry.payload.campaignName || '') === String(entryIdentity.campaignName || '')
        && String(entry.percent ?? '') === String(entryIdentity.percent ?? ''));
      if (matchedIndex < 0) {
        const historicName = parseGoogleAdsCampaignName(entryIdentity.campaignName);
        const historicProduct = historicName.ok ? normalizeCampaignSequenceProduct(historicName.product) : '';
        if (historicProduct) matchedIndex = entries.findIndex(entry =>
          String(entry.payload.managerCustomerId || '') === String(entryIdentity.managerCustomerId || '')
          && String(entry.payload.customerId || '') === String(entryIdentity.customerId || '')
          && String(entry.percent ?? '') === String(entryIdentity.percent ?? '')
          && normalizeCampaignSequenceProduct(entry.product || campaignNameSource().product) === historicProduct);
        if (matchedIndex >= 0) {
          entries[matchedIndex] = {
            ...entries[matchedIndex],
            payload: { ...entries[matchedIndex].payload, campaignName: entryIdentity.campaignName },
          };
        }
      }
      if (matchedIndex < 0) {
        setStatus('Esta linha do histórico não corresponde a uma campanha da preparação atual. Confira nome, conta e faixa de CPA; nenhuma consulta foi feita.', true);
        return;
      }
      entryIndex = matchedIndex;
    }
    if (!samePreviewBatch(entries)) {
      clearPreview();
      batchEntries = entries.map(entry => ({
        ...entry,
        state: 'pending',
        previewResult: null,
        previewPreviousState: '',
        result: null,
        errorMessage: '',
        diagnostic: null,
      }));
    }
    batchEntriesDraftId = activeDraftId;
    busy = true;
    updateControlState();
    page.querySelectorAll('.google-ads-campaign-preview-action').forEach(button => { button.disabled = true; });
    if (triggerButton) {
      triggerButton.disabled = true;
      triggerButton.textContent = 'Preparando…';
      triggerButton.setAttribute('aria-label', 'Preparando validação da campanha');
    }
    setStatus('Preparando a validação local… Nenhuma consulta à API começou ainda.', false, true);
    try { previewFingerprint = await fingerprintCampaignPayloads(batchEntries.map(entry => entry.payload)); }
    catch { previewFingerprint = ''; }
    let currentEntryFingerprints = [];
    try { currentEntryFingerprints = await Promise.all(batchEntries.map(entry => fingerprintCampaignPayloads([entry.payload]))); }
    catch { currentEntryFingerprints = []; }
    batchEntries.forEach((entry, index) => { entry.currentPayloadFingerprint = currentEntryFingerprints[index] || ''; });
    if (batchEntries.some(entry => entry.previewResult)) {
      previewHistory = {
        id: previewId,
        draftId: activeDraftId,
        validatedAt: previewValidatedAt || new Date().toISOString(),
        payloadFingerprint: previewFingerprint,
        entries: storedPreviewEntries(),
      };
    }
    if (previewFingerprint && !previewId) previewId = createCampaignPreviewId();

    let indices = [];
    if (Number.isInteger(entryIndex)) {
      if (entryIndex >= 0 && entryIndex < batchEntries.length) indices = [entryIndex];
    } else if (mode === 'next') {
      const nextIndex = batchEntries.findIndex(entry => ['pending', 'preview_stale', 'preview_failed'].includes(entry.state));
      if (nextIndex >= 0) indices = [nextIndex];
    } else {
      const pending = batchEntries.map((entry, index) => ['pending', 'preview_stale'].includes(entry.state) ? index : -1).filter(index => index >= 0);
      const failed = batchEntries.map((entry, index) => entry.state === 'preview_failed' ? index : -1).filter(index => index >= 0);
      indices = pending.length ? pending : failed.length ? failed : batchEntries.map((_, index) => index);
    }
    if (!indices.length) {
      busy = false;
      renderBatchPreview();
      updateControlState();
      setStatus('Não há validações pendentes. Use a ação individual de uma campanha se quiser revalidar um resultado salvo.', false);
      return;
    }

    previewArea.hidden = false;
    renderBatchPreview();
    updateControlState();

    if (previewFingerprint && !savePreviewCheckpoint({ draftSaved })) {
      setStatus('A validação vai continuar, mas o progresso ainda não foi salvo neste navegador. ' + campaignPreviewStorageError, false, false, true);
    }
    let preparedPreviewContexts;
    try {
      setStatus('Preparando consultas compartilhadas por conta de conversão para ' + indices.length + ' validação(ões)…', false, true, true);
      preparedPreviewContexts = await prepareGoogleAdsSearchCampaignPreviewContexts(
        indices.map(index => batchEntries[index].payload),
        { onQuotaTelemetry: recordPreviewQuotaTelemetry },
      );
      const groupedNameSearches = preparedPreviewContexts.nameLookupQueryCount;
      setStatus('Consultas compartilhadas preparadas para ' + preparedPreviewContexts.accountCount + ' conta(s) e '
        + preparedPreviewContexts.conversionAccountCount + ' conta(s) de conversão/MCC. '
        + (groupedNameSearches > 0
          ? groupedNameSearches + ' busca(s) de nome agrupada(s) por conta; '
          : 'o serviço atual não agrupou as buscas de nome; ')
        + 'a verificação individual vai começar.', false, false, true);
    } catch (error) {
      const message = formatRequestFailure(error, 'Não foi possível preparar as consultas compartilhadas por MCC.', 'preview');
      for (const index of indices) {
        const entry = batchEntries[index];
        entry.state = 'preview_failed';
        entry.previewResult = null;
        entry.payloadFingerprint = entry.currentPayloadFingerprint || '';
        entry.resultValidatedAt = new Date().toISOString();
        entry.previewPreviousState = '';
        entry.diagnostic = error?.diagnostic || null;
        entry.errorMessage = message + ' Nenhuma validação individual de campanha foi iniciada.';
        if (previewFingerprint && !savePreviewCheckpoint({ draftSaved })) {
          setCampaignBatchStatus('O contexto não foi preparado e o checkpoint local falhou: ' + campaignPreviewStorageError, true);
        }
      }
      busy = false;
      finishPreviewQuotaMeasurement();
      renderBatchPreview();
      updateControlState();
      setStatus(message + ' Nenhuma validação individual de campanha foi iniciada.', true);
      return;
    }
    for (const index of indices) {
      const entry = batchEntries[index];
      entry.previewPreviousState = ['previewed', 'existing', 'preview_stale'].includes(entry.state) ? entry.state : '';
      entry.state = 'previewing';
      entry.errorMessage = 'A página foi atualizada durante esta consulta. O resultado anterior, se houver, será mantido; tente novamente esta campanha para concluir a revalidação.';
      entry.diagnostic = null;
      if (previewFingerprint) savePreviewCheckpoint({ draftSaved });
      renderBatchPreview();
      const campaignNameLookupContext = preparedPreviewContexts.getCampaignNameLookupContext(entry.payload);
      setStatus('Verificando campanha ' + String(index + 1).padStart(2, '0') + ' de ' + batchEntries.length
        + ' · execução ' + (indices.indexOf(index) + 1) + ' de ' + indices.length + ' nesta tentativa · '
        + (entry.accountName || entry.payload.customerId) + ': '
        + (campaignNameLookupContext ? 'nome conferido no lote; ' : 'busca de nome individual; ')
        + 'verificação sem gravação…', false, true, true);
      try {
        const previewContext = preparedPreviewContexts.getContext(entry.payload);
        if (!previewContext) throw new Error('O contexto compartilhado da MCC não está disponível. Nenhuma prévia foi consultada.');
        entry.previewResult = await previewGoogleAdsSearchCampaign({
          ...entry.payload,
          previewContext,
          campaignNameLookupContext,
        }, { onQuotaTelemetry: recordPreviewQuotaTelemetry });
        entry.state = entry.previewResult.existing_campaign === true ? 'existing' : 'previewed';
        entry.payloadFingerprint = entry.currentPayloadFingerprint || '';
        entry.resultValidatedAt = new Date().toISOString();
        entry.previewPreviousState = '';
        entry.errorMessage = '';
      } catch (error) {
        entry.state = 'preview_failed';
        entry.previewResult = null;
        entry.payloadFingerprint = entry.currentPayloadFingerprint || '';
        entry.resultValidatedAt = new Date().toISOString();
        entry.previewPreviousState = '';
        entry.diagnostic = error?.diagnostic || null;
        entry.errorMessage = formatRequestFailure(error, 'A API não validou esta campanha.', 'preview');
        if (error?.code === 'invalid_payload') entry.errorMessage += ' O servidor recusou os parâmetros. Confira se o serviço privado de criação foi atualizado para aceitar a correspondência individual; outros parâmetros inválidos também podem causar esta resposta.';
      }
      if (previewFingerprint && !savePreviewCheckpoint({ draftSaved })) {
        setCampaignBatchStatus('A campanha foi consultada, mas o checkpoint local falhou: ' + campaignPreviewStorageError, true);
      }
      renderBatchPreview();
    }
    busy = false;
    finishPreviewQuotaMeasurement();
    syncPreviewExistingCampaignTargets();
    const allResolved = batchEntries.length > 0 && batchEntries.every(entry => ['previewed', 'existing'].includes(entry.state));
    if (allResolved) {
      previewSnapshot = JSON.stringify(batchEntries.map(entry => entry.payload));
      previewValidatedAt = new Date().toISOString();
      previewHistory = null;
    } else previewSnapshot = '';
    if (previewFingerprint && !savePreviewCheckpoint({ draftSaved })) {
      setCampaignBatchStatus('O progresso continua na tela, mas não foi salvo para retomada: ' + campaignPreviewStorageError, true);
    }
    renderBatchPreview();
    if (allResolved) {
      if (!draftSaved || !activeDraftId || !previewId) {
        setStatus('A verificação terminou. Esta prévia vale nesta sessão, mas não foi salva para retomada após recarregar.'
          + (campaignPreviewStorageError ? ' ' + campaignPreviewStorageError : ''), false, false, true);
      } else if (!previewFingerprint) {
        setStatus('A verificação terminou, mas o navegador não ofereceu uma assinatura verificável; ela não poderá ser recuperada com segurança após recarregar.', false, false, true);
      } else {
        setStatus('Verificações salvas campanha por campanha e recuperáveis sem prazo enquanto campos, destinos e sequência permanecerem iguais. Use “Revalidar” em uma linha para atualizar somente aquela campanha.', false);
      }
    } else {
      const pendingCount = batchEntries.filter(entry => entry.state === 'pending').length;
      const staleCount = batchEntries.filter(entry => entry.state === 'preview_stale').length;
      const failedCount = batchEntries.filter(entry => entry.state === 'preview_failed').length;
      const resolvedCount = batchEntries.filter(entry => ['previewed', 'existing'].includes(entry.state)).length;
      setStatus('Checkpoint salvo: ' + resolvedCount + ' de ' + batchEntries.length + ' atuais concluídas · ' + pendingCount + ' aguardando · ' + staleCount + ' desatualizadas · ' + failedCount + ' falharam.'
        + (campaignPreviewStorageError ? ' Não foi possível persistir o último avanço: ' + campaignPreviewStorageError : ''), failedCount > 0 || staleCount > 0, false, Boolean(campaignPreviewStorageError));
    }
    updateControlState();
  }

  previewButton.addEventListener('click', () => { void runCampaignPreview({ mode: 'bulk' }); });
  previewNextButton.addEventListener('click', () => { void runCampaignPreview({ mode: 'next' }); });
  campaignCsvDownloadButton.addEventListener('click', downloadCampaignCsvForSelectedManager);
  campaignCsvWorkflowButton.addEventListener('click', openCampaignCsvWorkflow);
  campaignCsvManagerSelect.addEventListener('change', () => setCampaignCsvStatus(''));
  previewDetails.addEventListener('click', event => {
    const historyButton = event.target.closest('[data-google-ads-preview-history-entry]');
    if (historyButton && previewDetails.contains(historyButton)) {
      const historyIndex = Number(historyButton.dataset.googleAdsPreviewHistoryEntry);
      const saved = Number.isInteger(historyIndex) ? previewHistory?.entries?.[historyIndex] : null;
      if (!saved) {
        setStatus('Esta linha do histórico não está mais disponível. Reabra a preparação salva antes de validar.', true);
        return;
      }
      void runCampaignPreview({
        entryIdentity: {
          managerCustomerId: saved.managerCustomerId,
          customerId: saved.customerId,
          campaignName: saved.campaignName,
          percent: saved.percent,
        },
        triggerButton: historyButton,
      });
      return;
    }
    const button = event.target.closest('[data-google-ads-preview-entry]');
    if (!button || !previewDetails.contains(button)) return;
    const index = Number(button.dataset.googleAdsPreviewEntry);
    if (Number.isInteger(index)) void runCampaignPreview({ entryIndex: index, triggerButton: button });
  });

  nameCalculateButton.addEventListener('click', openCampaignNameDialog);
  nameParseInput.addEventListener('input', () => { calculateCampaignNameDetails(); void refreshCampaignNameQuoteIfNeeded(); });
  page.querySelector('[data-campaign-name-recalculate]').addEventListener('click', () => { void refreshCampaignNameQuoteIfNeeded({ force: true }); });
  nameParseApplyButton.addEventListener('click', applyCampaignNameDetails);
  page.querySelectorAll('[data-campaign-name-close]').forEach(button => button.addEventListener('click', () => {
    if (typeof nameParseDialog.close === 'function') nameParseDialog.close(); else nameParseDialog.removeAttribute('open');
  }));

  createButton.addEventListener('click', async () => {
    if (!previewSnapshot || uncertain || completed) return;
    saveDraftNow();
    let entries;
    try { entries = buildCampaignBatchEntries(); }
    catch (error) { setStatus(error.message, true); clearPreview(); return; }
    if (JSON.stringify(entries.map(entry => entry.payload)) !== previewSnapshot) { clearPreview(); setStatus('Os destinos ou a sequência do produto mudaram. Valide novamente todas as campanhas antes de criar.', true); return; }
    const entriesToCreate = batchEntries.filter(entry => entry.state === 'previewed');
    if (!entriesToCreate.length) return;
    const names = entriesToCreate.map((entry, index) => '• ' + String(index + 1).padStart(2, '0') + ' · ' + entry.percent + '% · ' + entry.accountName + ' · ' + entry.payload.campaignName).join('\n');
    const existingCount = batchEntries.filter(entry => entry.state === 'existing').length;
    const urlSummary = batchEntries.every(entry => entry.targetSource === 'ficha')
      ? 'Cada campanha usará a URL correspondente da Ficha.'
      : 'A campanha usará a URL manual do formulário.';
    const message = 'Criar ' + entriesToCreate.length + ' campanha(s) nova(s) pausada(s) em ' + [...new Set(entriesToCreate.map(entry => entry.accountName))].length
      + ' conta(s)? Estas passaram por validateOnly. ' + existingCount + ' campanha(s) já existente(s) não serão recriadas; as elegíveis ficam disponíveis para ações de público. Cada nova campanha será criada separadamente; o número é único para o produto. ' + urlSummary + '\n\n' + names
      + '\n\nSe alguma falhar com confirmação definitiva, o Hub permitirá repetir somente essa campanha. Resultados incertos não serão repetidos automaticamente.';
    if (!globalThis.confirm(message)) return;
    const reservations = entriesToCreate.filter(entry => Number.isInteger(entry.iteration) && entry.product).map(entry => ({
      product: entry.product,
      iteration: entry.iteration,
      campaignName: entry.payload.campaignName,
      customerId: entry.payload.customerId,
    }));
    if (reservations.length) {
      try { await reserveGoogleAdsCampaignSequence(reservations); }
      catch (error) { clearPreview(); setStatus(error.message || 'Não foi possível reservar a numeração. Nenhuma campanha foi enviada.', true); return; }
    }
    await runBatchCreation(entriesToCreate);
  });

  campaignTargetsList.addEventListener('click', event => {
    const button = event.target.closest('[data-google-ads-image-eligibility]');
    if (button && campaignTargetsList.contains(button)) openImageEligibilityDialog(button.dataset.googleAdsImageEligibility);
  });
  imageEligibilityDialog.addEventListener('click', event => {
    const choice = event.target.closest('[data-image-eligibility-choice]');
    if (choice) saveImageEligibility(choice.dataset.imageEligibilityChoice);
    else if (event.target.closest('[data-image-eligibility-close]')) imageEligibilityDialog.close?.();
  });
  imageEligibilityDialog.addEventListener('close', () => { pendingImageEligibilityAccountId = ''; });

  function openCopyImportDialog(mode = 'campaign', { restoreCache = true, allowClipboardRead = true } = {}) {
    if (mode === 'batch-sitelinks' && (!activeCampaignBatchId || !createdCampaigns.length)) {
      setCampaignBatchStatus(campaignBatchUnavailableMessage('selecionar sitelinks para aplicação nas campanhas'), true);
      return;
    }
    if (copyImportDialog.open) return;
    copyImportMode = mode === 'batch-sitelinks' ? 'batch-sitelinks' : 'campaign';
    const cachedSource = restoreCache ? loadCopyImportSource() : { exists: false, source: '' };
    copyImportInput.value = cachedSource.source;
    if (cachedSource.exists) {
      if (copyImportInputTimer) window.clearTimeout(copyImportInputTimer);
      copyImportInputTimer = null;
      parsedCopy = null;
      selectedCopyAssets = new Set();
      selectedCopySitelinks = new Map();
      selectedPromotion = false;
      page.querySelector('#googleAdsCopyImportTitle').textContent = copyImportMode === 'batch-sitelinks'
        ? 'Selecionar sitelinks para o lote' : 'Selecionar copy para a campanha';
      copyImportApplyButton.textContent = copyImportMode === 'batch-sitelinks'
        ? 'Salvar sitelinks no lote' : 'Aplicar selecionados (10 títulos e 3 descrições)';
      copyImportResults.hidden = true;
      copyImportResults.classList.toggle('is-sitelinks-only', copyImportMode === 'batch-sitelinks');
      copyImportGroups.replaceChildren();
      copyImportApplyButton.disabled = true;
      page.querySelector('[data-copy-import-headline-count]').textContent = copyImportMode === 'batch-sitelinks' ? '0/6 sitelinks' : '0/10 títulos';
      page.querySelector('[data-copy-import-description-count]').textContent = copyImportMode === 'batch-sitelinks' ? 'seções #1–#6' : '0/3 descrições';
      page.querySelector('[data-copy-import-promotion-count]').textContent = copyImportMode === 'batch-sitelinks' ? 'URL por campanha' : '0/1 promoção';
      if (typeof copyImportDialog.showModal === 'function') copyImportDialog.showModal();
      else copyImportDialog.setAttribute('open', '');
      if (copyImportInput.value.trim()) {
        scheduleCopyImportParse();
        setCopyImportStatus('Resposta do Gemini restaurada do cache deste navegador.');
      } else {
        setCopyImportStatus('O campo está vazio. Cole uma resposta do Gemini para continuar.');
      }
      copyImportInput.focus();
      return;
    }
    if (!allowClipboardRead) {
      if (copyImportInputTimer) window.clearTimeout(copyImportInputTimer);
      copyImportInputTimer = null;
      parsedCopy = null;
      selectedCopyAssets = new Set();
      selectedCopySitelinks = new Map();
      selectedPromotion = false;
      page.querySelector('#googleAdsCopyImportTitle').textContent = 'Selecionar copy para a campanha';
      copyImportApplyButton.textContent = 'Aplicar selecionados (10 títulos e 3 descrições)';
      copyImportResults.hidden = true;
      copyImportResults.classList.remove('is-sitelinks-only');
      copyImportGroups.replaceChildren();
      copyImportApplyButton.disabled = true;
      page.querySelector('[data-copy-import-headline-count]').textContent = '0/10 títulos';
      page.querySelector('[data-copy-import-description-count]').textContent = '0/3 descrições';
      page.querySelector('[data-copy-import-promotion-count]').textContent = '0/1 promoção';
      if (typeof copyImportDialog.showModal === 'function') copyImportDialog.showModal();
      else copyImportDialog.setAttribute('open', '');
      setCopyImportStatus('Nova campanha iniciada. Cole aqui a nova resposta completa do Gemini.');
      copyImportInput.focus();
      return;
    }
    const readClipboard = globalThis.navigator?.clipboard?.readText;
    let clipboardPromise;
    let clipboardReadFailed = typeof readClipboard !== 'function';
    if (!clipboardReadFailed) {
      try { clipboardPromise = readClipboard.call(globalThis.navigator); }
      catch { clipboardReadFailed = true; }
    }
    if (copyImportInputTimer) window.clearTimeout(copyImportInputTimer);
    copyImportInputTimer = null;
    parsedCopy = null;
    selectedCopyAssets = new Set();
    selectedCopySitelinks = new Map();
    selectedPromotion = false;
    page.querySelector('#googleAdsCopyImportTitle').textContent = copyImportMode === 'batch-sitelinks'
      ? 'Selecionar sitelinks para o lote' : 'Selecionar copy para a campanha';
    copyImportApplyButton.textContent = copyImportMode === 'batch-sitelinks'
      ? 'Salvar sitelinks no lote' : 'Aplicar selecionados (10 títulos e 3 descrições)';
    copyImportResults.hidden = true;
    copyImportResults.classList.toggle('is-sitelinks-only', copyImportMode === 'batch-sitelinks');
    copyImportGroups.replaceChildren();
    copyImportApplyButton.disabled = true;
    page.querySelector('[data-copy-import-headline-count]').textContent = copyImportMode === 'batch-sitelinks' ? '0/6 sitelinks' : '0/10 títulos';
    page.querySelector('[data-copy-import-description-count]').textContent = copyImportMode === 'batch-sitelinks' ? 'seções #1–#6' : '0/3 descrições';
    page.querySelector('[data-copy-import-promotion-count]').textContent = copyImportMode === 'batch-sitelinks' ? 'URL por campanha' : '0/1 promoção';
    const showCopyImportDialog = () => {
      if (copyImportDialog.open) return;
      if (typeof copyImportDialog.showModal === 'function') copyImportDialog.showModal();
      else copyImportDialog.setAttribute('open', '');
    };
    if (clipboardReadFailed) {
      showCopyImportDialog();
      if (copyImportInput.value.trim()) {
        scheduleCopyImportParse();
        setCopyImportStatus('Resposta do Gemini restaurada do cache deste navegador.');
      } else {
        setCopyImportStatus('Não foi possível ler a área de transferência automaticamente. Cole a resposta completa nesta caixa.');
      }
      copyImportInput.focus();
      return;
    }
    copyImportOpenButton.disabled = true;
    Promise.resolve(clipboardPromise).then(clipboardText => {
      if (copyImportDialog.open) return;
      if (!String(clipboardText ?? '').trim()) {
        showCopyImportDialog();
        if (copyImportInput.value.trim()) {
          scheduleCopyImportParse();
          setCopyImportStatus('Resposta do Gemini restaurada do cache deste navegador.');
        } else {
          setCopyImportStatus('A área de transferência está vazia. Cole a resposta completa do Gemini nesta caixa.');
        }
        copyImportInput.focus();
        return;
      }
      copyImportInput.value = String(clipboardText);
      persistCopyImportSource(copyImportInput.value);
      organizeCopyImportInput();
      showCopyImportDialog();
    }).catch(() => {
      if (copyImportDialog.open) return;
      showCopyImportDialog();
      if (copyImportInput.value.trim()) {
        scheduleCopyImportParse();
        setCopyImportStatus('Resposta do Gemini restaurada do cache deste navegador.');
      } else {
        setCopyImportStatus('O navegador bloqueou a leitura automática. Permita o acesso à área de transferência para este endereço ou cole a resposta completa nesta caixa.');
      }
      copyImportInput.focus();
    }).finally(() => { copyImportOpenButton.disabled = false; });
  }
  copyImportOpenButton.addEventListener('click', () => { void openCopyImportDialog('campaign'); });
  newDraftButton.addEventListener('click', beginNewDraft);
  draftPickerTrigger.addEventListener('click', () => {
    if (draftPickerMenuOpen) closeDraftPickerMenu();
    else openDraftPickerMenu();
  });
  draftPickerTrigger.addEventListener('keydown', event => {
    if (!['ArrowDown', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openDraftPickerMenu({ focusSelected: true });
  });
  draftPickerMenu.addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-google-ads-delete-draft-id]');
    if (deleteButton) {
      event.preventDefault();
      event.stopPropagation();
      const draftId = deleteButton.dataset.googleAdsDeleteDraftId;
      closeDraftPickerMenu({ restoreFocus: true });
      deleteSelectedDraft(draftId);
      return;
    }
    const optionButton = event.target.closest('[data-google-ads-draft-option]');
    if (!optionButton) return;
    draftPicker.value = optionButton.dataset.googleAdsDraftOption;
    closeDraftPickerMenu({ restoreFocus: true });
    draftPicker.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  draftPickerMenu.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDraftPickerMenu({ restoreFocus: true });
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const options = [...draftPickerMenu.querySelectorAll('[data-google-ads-draft-option]')];
    if (!options.length) return;
    event.preventDefault();
    const currentRow = event.target.closest('.google-ads-creation-draft-option-row');
    const currentOption = currentRow?.querySelector('[data-google-ads-draft-option]');
    const currentIndex = options.indexOf(currentOption);
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? options.length - 1
        : event.key === 'ArrowDown' ? Math.min(options.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex < 0 ? 0 : currentIndex - 1);
    options[nextIndex].focus();
  });
  page.addEventListener('pointerdown', event => {
    if (draftPickerMenuOpen && !draftPickerWrap.contains(event.target)) closeDraftPickerMenu();
  });
  draftPicker.addEventListener('change', event => openSavedContext(event.target.value));
  campaignAssociationOpenButton.addEventListener('click', openCampaignAssociationDialog);
  campaignAssociationSearchButton.addEventListener('click', () => { void searchCampaignsForAssociation(); });
  campaignAssociationSaveButton.addEventListener('click', () => { void associateSelectedCampaigns(); });
  campaignAssociationProduct.addEventListener('input', () => {
    if (campaignAssociationBusy) return;
    clearCampaignAssociationResults();
    setCampaignAssociationStatus('Produto alterado. Faça uma nova busca para atualizar os resultados.');
  });
  campaignAssociationAccounts.addEventListener('change', () => {
    if (campaignAssociationBusy) return;
    clearCampaignAssociationResults();
    campaignAssociationSearchButton.disabled = !isTokenReady() || selectedCampaignAssociationAccounts().length === 0;
    setCampaignAssociationStatus('Contas alteradas. Faça uma nova busca para atualizar os resultados.');
  });
  campaignAssociationList.addEventListener('change', event => {
    const key = event.target?.dataset?.associationCandidateKey;
    if (!key) return;
    const candidate = campaignAssociationCandidates.find(item => campaignAssociationKey(item) === key);
    if (!candidate) return;
    candidate.selected = event.target.checked;
    updateCampaignAssociationSelectionState();
  });
  campaignAssociationSelectAll.addEventListener('click', () => {
    const eligible = campaignAssociationCandidates.filter(candidate => !candidate.alreadySaved);
    const selectedCount = eligible.filter(candidate => candidate.selected).length;
    if (selectedCount > 0) eligible.forEach(candidate => { candidate.selected = false; });
    else eligible.forEach((candidate, index) => { candidate.selected = index < 100; });
    renderCampaignAssociationResults();
  });
  campaignAssociationDialog.querySelectorAll('[data-campaign-association-close]').forEach(button => button.addEventListener('click', () => {
    if (typeof campaignAssociationDialog.close === 'function') campaignAssociationDialog.close();
    else campaignAssociationDialog.removeAttribute('open');
  }));
  window.addEventListener('pagehide', saveDraftNow);
  page.querySelectorAll('[data-google-ads-copy-import-close]').forEach(button => button.addEventListener('click', () => {
    if (typeof copyImportDialog.close === 'function') copyImportDialog.close(); else copyImportDialog.removeAttribute('open');
  }));
  copyImportInput.addEventListener('input', () => {
    persistCopyImportSource(copyImportInput.value);
    scheduleCopyImportParse();
  });
  copyImportInput.addEventListener('paste', () => window.setTimeout(() => {
    persistCopyImportSource(copyImportInput.value);
    scheduleCopyImportParse();
  }, 0));
  copyImportApplyButton.addEventListener('click', applySelectedCopy);
  clickBankOfferSelect.addEventListener('change',()=>{
    pendingClickBankOfferKeyRestore='';
    updateClickBankKeywordImportState();
    updateFinalUrlFromPreSell();
  });
  clickBankKeywordsImportButton.addEventListener('click',handleClickBankKeywordImport);
  form.addEventListener('submit', event => event.preventDefault());
  renderKeywordMatchLabels();
  updatePromotionTriggerFields();
  form.addEventListener('input', event => {
    if (cpaExpansionPanel.contains(event.target)) return;
    if (event.target.matches('[name="daily_budget"]')) event.target.dataset.budgetSource = 'manual';
    if (event.target === geoCountryField) setGeoCountryNormalizationStatus([]);
    if (event.target === keywordField || event.target === negativeKeywordField) renderKeywordMatchLabels();
    if (event.target.matches('[name="manager"], [name="account"]')) return;
    if (event.target.matches('[name="cpa_variant"]') && campaignDeliverySource) {
      const marked=getCpaVariantLabels().filter(label=>label.querySelector('input').checked).map(label=>Number(label.dataset.cpaVariantLabel));
      if(!marked.length){event.target.checked=true;return;}
      deliveryCpaSelections=new Set(marked);renderCpaVariantOptions();clearPreview();scheduleDraftSave({force:true});return;
    }
    if (event.target.matches('[name="cpa_variant"]')) {
      selectedCpaVariantPercents = new Set(getCpaVariantLabels()
        .filter(label => !label.classList.contains('is-base') && label.querySelector('input').checked)
        .map(label => Number(label.dataset.cpaVariantLabel)));
      updateCpaVariantSelectionCount();
      clearPreview();
      scheduleDraftSave();
      return;
    }
    if (event.target.matches('[name="target_cpa"]') && !applyingCampaignNameParse) {
      const accountCurrency = campaignNameAccountCurrency();
      derivedCpaCurrencyField.value = accountCurrency;
      form.elements.namedItem('source_target_cpa_currency').value = accountCurrency;
      renderCpaVariantOptions();
    }
    if (event.target===finalUrlField) {
      if (!(finalUrlSource==='presell'&&String(finalUrlField.value||'').trim()===finalUrlAutoValue)) {
        finalUrlSource='manual';
        finalUrlAutoValue='';
        setPresellUrlStatus('URL editada manualmente; o Hub preservará seu valor.',false);
      }
    }
    if (event.target.matches('[name="campaign_name"]')) {
      for (const name of ['source_campaign_date', 'source_product', 'source_iteration', 'source_platform_code', 'source_platform', 'source_bidding_model_code', 'source_bidding_model', 'source_extra_tags', 'source_destination', 'source_commission_amount', 'source_commission_currency', 'source_target_cpa_percent', 'source_target_cpa_amount', 'source_target_cpa_currency', 'source_usd_brl_rate', 'source_usd_brl_quote_date', 'source_usd_brl_retrieved_at']) {
        if(name==='source_product'&&campaignDeliverySource)continue;
        form.elements.namedItem(name).value = '';
      }
      derivedCpaCurrencyField.value = '';
      renderCpaVariantOptions();
    }
    if (event.target.matches('[name="headline"], [name="description"]')) {
      detectPromotionLanguageFromCopy();
      updatePromotionDiscountDetection();
    }
    if (event.target.matches('[name="headline"], [name="keywords"]')) updatePromotionTargetFromCampaign();
    if (event.target === discountValueField) {
      discountValueField.dataset.discountValueSource = discountValueField.value.trim() ? 'manual' : '';
      updatePromotionDiscountDetection();
    }
    if (event.target.matches('[name="promotion_target"]')) {
      event.target.setCustomValidity('');
      if (!(promotionTargetSource!=='manual'&&String(promotionTargetField.value||'').trim()===promotionTargetAutoValue)) {
        promotionTargetSource='manual';
        promotionTargetAutoValue='';
        setPromotionTargetStatus('Item editado manualmente; o Hub preservará seu valor.');
      }
    }
    if(campaignDeliverySource&&event.target.matches('[name="geo_target_country_codes"]'))renderCpaVariantOptions();
    if (event.target===keywordField) { updateClickBankKeywordImportState(); updatePromotionTargetFromCampaign(); }
    if (event.target===negativeKeywordField) updateClickBankNegativeKeywordImportState();
    clearPreview();
    scheduleDraftSave();
  });
  form.addEventListener('change', event => {
    if (cpaExpansionPanel.contains(event.target)) return;
    if (event.target.matches('[data-curation-brand-bidding]')) {
      deliveryBrandBiddingOverride = true;
      renderCpaVariantOptions();
      clearPreview();
      scheduleDraftSave({ force: true });
      return;
    }
    if (event.target.matches('[name="cpa_variant"]')) return;
    if (event.target === geoCountryField) {
      normalizeGeoCountryField();
      renderCpaVariantOptions();
      scheduleDraftSave({ force: true });
      return;
    }
    if(event.target.matches('[data-delivery-cpa-start]')){const levels=deliveryCpaLevels(event.target.value);if(!levels.length){event.target.setCustomValidity('Informe um percentual entre 30 e 80.');event.target.reportValidity();return;}event.target.setCustomValidity('');deliveryCpaStart=levels[0];deliveryCpaSelections=new Set([deliveryCpaStart]);renderCpaVariantOptions();clearPreview();scheduleDraftSave({force:true});return;}
    if (event.target.matches('[name="manager"]')) {
      renderAccountOptions();
      updateCurrencyHints();
      renderCpaVariantOptions();
      updateFinalUrlFromPreSell();
      clearPreview();
      updateSelectionMessage();
      scheduleDraftSave({ force: true });
      return;
    }
    if (event.target.matches('[name="account"]')) { refreshAccountTargetHighlight(); updateCurrencyHints(); renderCpaVariantOptions(); updateFinalUrlFromPreSell(); clearPreview(); updateSelectionMessage(); scheduleDraftSave({ force: true }); return; }
    if (event.target.matches('[name="campaign_name"]')) { updateFinalUrlFromPreSell(); updatePromotionTargetFromCampaign(); }
    if (event.target.matches('[name="bidding_strategy"]')) { updateBiddingStrategyFields(); renderCpaVariantOptions(); }
    if (event.target===keywordMatchTypeField) updateClickBankKeywordImportState();
    if (event.target===negativeKeywordMatchTypeField) updateClickBankNegativeKeywordImportState();
    if (event.target.matches('[name="discount_type"]')) {
      updatePromotionDiscountFields();
      if (discountValueField.dataset.discountValueSource === 'copy-metadata') {
        discountValueField.dataset.discountValueSource = discountValueField.value.trim() ? 'manual' : '';
      }
      updatePromotionDiscountDetection();
    }
    if (event.target.matches('[name="trigger_type"]')) updatePromotionTriggerFields();
    clearPreview();
    scheduleDraftSave();
  });

  updateBiddingStrategyFields();
  updatePromotionDiscountDetection();
  renderCpaVariantOptions();
  async function refreshDirectory() {
    if (!isTokenReady()) {
      setStatus('Configure o token compartilhado do Hub em Integrações → Configurações globais antes de carregar as MCCs.', true);
      return false;
    }
    if (busy) return false;
    busy = true;
    clearPreview();
    updateControlState();
    setStatus('Atualizando a lista de MCCs e contas…');
    try {
      const nextDirectory = normalizeGoogleAdsAccounts(await fetchGoogleAdsAccounts());
      directory = nextDirectory;
      directoryCacheAt = new Date().toISOString();
      directoryRefreshedAt = directoryCacheAt;
      directoryCachePersisted = false;
      try {
        const saved = saveGoogleAdsAccountsCache(nextDirectory, { savedAtUtc: directoryCacheAt, refreshedAtUtc: directoryRefreshedAt });
        directoryCacheAt = saved.savedAtUtc;
        directoryRefreshedAt = saved.refreshedAtUtc;
        directoryCachePersisted = true;
      } catch { /* A lista atual continua disponível nesta tela. */ }
      const usable = populateDirectory(nextDirectory);
      clearPreview();
      busy = false;
      updateControlState();
      if (!usable) {
        setStatus('Nenhuma conta cliente está disponível nas MCCs acessíveis.', true);
        return false;
      }
      window.dispatchEvent(new CustomEvent('hub:google-ads-account-directory-updated', {
        detail: { accounts: nextDirectory, savedAtUtc: directoryCacheAt, refreshedAtUtc: directoryRefreshedAt, persisted: directoryCachePersisted },
      }));
      setStatus(directoryCachePersisted
        ? 'Lista atualizada e compartilhada com a tela Snapshots da Operação. A consulta de MCCs não será repetida ao reabrir esta tela.'
        : 'Lista atualizada nesta tela, mas o armazenamento local falhou; a outra tela e próximas sessões podem não receber esta atualização.', !directoryCachePersisted);
      receiveInitialContexts();
      return true;
    } catch (error) {
      busy = false;
      updateControlState();
      setStatus((directory?.accounts?.length ? 'A atualização falhou; a lista local anterior foi mantida. ' : '') + (error.message || 'Não foi possível atualizar as MCCs e contas.'), true);
      return false;
    }
  }

  refreshButton.addEventListener('click', () => { void refreshDirectory(); });
  function formatDirectoryTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
  }
  function syncDirectoryFromCache({ accounts: suppliedAccounts = null, savedAtUtc: suppliedAt = '', refreshedAtUtc: suppliedRefreshedAt = '', persisted = true } = {}) {
    refreshAccountTargetHighlight();
    if (busy || completed || uncertain) return false;
    const cached = suppliedAccounts ? { accounts: suppliedAccounts, savedAtUtc: suppliedAt, refreshedAtUtc: suppliedRefreshedAt } : loadGoogleAdsAccountsCache();
    if (!cached?.accounts) {
      if (!directory) setStatus('Nenhuma lista local de MCCs e contas foi salva. Clique em “Atualizar MCCs e contas” ou atualize a lista na tela Snapshots da Operação.', true);
      return false;
    }
    const nextAt = cached.savedAtUtc || '';
    const nextRefreshedAt = cached.refreshedAtUtc || nextAt;
    if (!suppliedAccounts && nextAt && directoryCacheAt
        && Date.parse(nextAt) < Date.parse(directoryCacheAt)) return false;
    if (nextAt && nextAt === directoryCacheAt) {
      directoryRefreshedAt = nextRefreshedAt || directoryRefreshedAt;
      if (suppliedAccounts) return false;
      const time = formatDirectoryTimestamp(directoryRefreshedAt);
      setStatus('Lista de MCCs e contas reutilizada do cache compartilhado' + (time ? ' · atualizada em ' + time : '') + '. Abrir esta tela não consulta a API.');
      return true;
    }
    directory = cached.accounts;
    directoryCacheAt = nextAt;
    directoryRefreshedAt = nextRefreshedAt;
    directoryCachePersisted = persisted;
    const usable = populateDirectory(directory);
    clearPreview();
    if (!usable) {
      setStatus('A lista compartilhada não contém contas cliente vinculadas a uma MCC.', true);
      return false;
    }
    updateFinalUrlFromPreSell();
    const time = formatDirectoryTimestamp(directoryRefreshedAt);
    setStatus('Lista de MCCs e contas reutilizada do cache compartilhado' + (time ? ' · atualizada em ' + time : '')
      + (persisted ? '. Abrir esta tela não consulta a API.' : '. Esta atualização vale nesta sessão; o armazenamento local falhou.'));
    receiveInitialContexts();
    return true;
  }
  const onDirectoryUpdated = event => {
    const detail = event?.detail;
    if (detail?.accounts) syncDirectoryFromCache(detail);
  };
  const onDirectoryStorage = event => {
    if (event?.key === GOOGLE_ADS_ACCOUNTS_CACHE_STORAGE_KEY) syncDirectoryFromCache();
    else if (event?.key === GOOGLE_ADS_RESOURCE_BOOKMARKS_STORAGE_KEY) {
      resourceBookmarks = loadGoogleAdsResourceBookmarks(window.localStorage);
      resourceBookmarkSyncNotice = null;
      renderCampaignTargetSummary();
    }
    else if (event?.key === GOOGLE_ADS_CAMPAIGN_BOOKMARKS_STORAGE_KEY) {
      campaignBookmarks = loadGoogleAdsCampaignBookmarks(window.localStorage);
      if (activeCampaignBatchId && createdCampaigns.length) renderCampaignResult();
    }
    else if (event?.key === GOOGLE_ADS_MANAGER_BOOKMARKS_STORAGE_KEY) {
      managerBookmarks = loadGoogleAdsManagerBookmarks(window.localStorage);
      if (activeCampaignBatchId && createdCampaigns.length) renderCampaignResult();
    }
    else if (event?.key === ACCOUNT_DIRECTORY_EMAIL_KEY) renderCampaignTargetSummary();
    else if (event?.key === GOOGLE_ADS_ACCOUNT_IMAGE_ELIGIBILITY_STORAGE_KEY) {
      renderCampaignTargetSummary();
      if (activeCampaignBatchId && createdCampaigns.length) renderCampaignResult();
    }
    else if (event?.key === GOOGLE_ADS_ACCOUNT_IMAGE_API_STATUS_STORAGE_KEY) {
      renderCampaignTargetSummary();
      if (activeCampaignBatchId && createdCampaigns.length) renderCampaignResult();
    }
    else if (event?.key === ACCOUNT_MAP_DUPLICATION_TARGET_KEY) refreshAccountTargetHighlight();
    else if (event?.key === 'hub.google-ads.campaign-creation.batches:v1' && activeCampaignBatchId) {
      campaignBatchChangedInOtherTab = true;
      if (!busy) {
        setCampaignBatchStatus('Os lotes mudaram em outra aba. Recarregue esta tela para preservar os resultados.', true);
        renderCampaignResult();
        updateControlState();
      }
    }
    else if (event?.key === 'hub:google-ads:cpa-expansion:v1:' + activeCampaignBatchId && activeCampaignBatchId && !busy) {
      renderCampaignResult();
      updateControlState();
    }
    else if (event?.key === GOOGLE_ADS_CAMPAIGN_SEQUENCE_STORAGE_KEY) {
      if (!completed && !uncertain && !busy) {
        clearPreview();
        renderCpaVariantOptions();
        setStatus('Prévia não validada: a numeração deste produto foi reservada em outra aba. Clique em “Validar prévia” para obter a próxima sequência.', false, false, true);
      }
    }
  };
  // Serialize shared actions with expansion across tabs before any remote effect.
  const withSharedBatchLock = action => async (...args) => {
    const batchId = activeCampaignBatchId;
    if (!batchId || typeof navigator?.locks?.request !== 'function') {
      setStatus('O bloqueio do navegador é necessário para executar esta etapa com segurança.', true);
      return;
    }
    return navigator.locks.request('hub-google-ads-cpa-expansion:' + batchId, async () => {
      if (activeCampaignBatchId !== batchId || sharedActionsBlocked()) {
        setStatus('A ampliação está pendente ou o lote mudou. Reabra a entrega antes de continuar.', true);
        return;
      }
      return action(...args);
    });
  };
  uploadCampaignImagesForBatch = withSharedBatchLock(uploadCampaignImagesForBatch);
  applyCampaignStatusBatch = withSharedBatchLock(applyCampaignStatusBatch);
  applyCampaignDestinationUrlsBatch = withSharedBatchLock(applyCampaignDestinationUrlsBatch);
  applyCampaignSitelinksBatch = withSharedBatchLock(applyCampaignSitelinksBatch);
  applyAudienceExclusionsBatch = withSharedBatchLock(applyAudienceExclusionsBatch);
  downloadAudienceExclusionWorkbook = withSharedBatchLock(downloadAudienceExclusionWorkbook);
  downloadAudienceTargetingCsv = withSharedBatchLock(downloadAudienceTargetingCsv);
  accountSelect.addEventListener('focus', refreshAccountTargetHighlight);
  accountSelect.addEventListener('pointerdown', refreshAccountTargetHighlight);
  window.addEventListener(ACCOUNT_MAP_DUPLICATION_TARGET_UPDATED_EVENT, refreshAccountTargetHighlight);
  window.addEventListener('hub:google-ads-account-directory-updated', onDirectoryUpdated);
  window.addEventListener('storage', onDirectoryStorage);
  window.addEventListener('message', onGoogleAdsResourceBookmarksUpdate);
  void readGoogleAdsResourceBookmarksViaExtension({ document, window })
    .then(applyGoogleAdsResourceBookmarksSnapshot)
    .catch(error => {
      resourceBookmarkSyncNotice = { message: error?.message || 'Não consegui sincronizar os favoritos. Sem um favorito correspondente, o Hub mostra aviso amarelo no lugar do link.', kind: 'warning' };
      renderResourceBookmarkStatus(campaignTargetSummaryState()?.targets || []);
    });
  updateControlState();
  if (directory) {
    populateDirectory(directory);
    updateCurrencyHints();
    const time = formatDirectoryTimestamp(directoryRefreshedAt);
    if (!isTokenReady()) setStatus('A lista local está disponível, mas configure o token compartilhado do Hub antes de validar a campanha.', true);
    else setStatus('Lista de MCCs e contas reutilizada do cache compartilhado' + (time ? ' · atualizada em ' + time : '') + '. Abrir esta tela não consulta a API.');
  } else if (!isTokenReady()) {
    setStatus('Configure o token compartilhado do Hub em Integrações → Configurações globais antes de continuar.', true);
  } else {
    setStatus('Nenhuma lista local de MCCs e contas foi salva. Atualize a lista em Google Ads API ou clique em “Atualizar MCCs e contas”.', true);
  }
  let initialDeliveryBatchId = '';
  let initialSavedBatchId = '';
  let ambiguousDeliveryBatches = false;
  if (campaignDeliveryQueryId && !handoffQueryId && !handoffJobQueryId) {
    const linked = draftStore.drafts.filter(draft => String(draft.values?.__hub_campaign_delivery_source?.deliveryId || '') === campaignDeliveryQueryId);
    const linkedIds = new Set(linked.map(draft => draft.id));
    const linkedBatches = campaignBatchStore.batches.filter(batch => (batch.draftId && linkedIds.has(batch.draftId)) || String(batch.formSnapshot?.__hub_campaign_delivery_source?.deliveryId || '') === campaignDeliveryQueryId);
    ambiguousDeliveryBatches = linkedBatches.length > 1;
    if (linkedBatches.length === 1) {
      initialDeliveryBatchId = linkedBatches[0].id;
      activeDraftId = linkedIds.has(linkedBatches[0].draftId) ? linkedBatches[0].draftId : (newestDraft(linked)?.id || '');
    } else activeDraftId = newestDraft(linked)?.id || '';
  } else if (handoffJobQueryId && !handoffQueryId) activeDraftId = '';
  let initialContext = null;
  const hasExternalCampaignContext = Boolean(handoffQueryId || handoffJobQueryId || campaignDeliveryQueryId);
  if (!hasExternalCampaignContext) {
    initialContext = resolveInitialGoogleAdsCampaignContext({
      savedContext: savedActiveCampaignContext,
      drafts: draftStore.drafts,
      batches: campaignBatchStore.batches,
      activeDraftId,
    });
    if (initialContext.type === 'batch') {
      initialSavedBatchId = initialContext.id;
      const selectedBatch = campaignBatchStore.batches.find(batch => batch.id === initialSavedBatchId);
      activeDraftId = selectedBatch?.draftId && draftStore.drafts.some(draft => draft.id === selectedBatch.draftId)
        ? selectedBatch.draftId : '';
    } else if (initialContext.type === 'draft') activeDraftId = initialContext.id;
    else if (initialContext.type === 'new') activeDraftId = '';
  }
  // Links e entregas explícitos têm precedência; sem eles, retome o último contexto local.
  refreshDraftPicker();
  refreshCampaignBatchPicker();
  renderConfiguredAudienceTargeting();
  if (campaignBatchStorageError) setCampaignBatchStatus(campaignBatchStorageError + ' Lotes não foram alterados.', true);
  else if (campaignBatchStore.batches.length) {
    setCampaignBatchStatus(initialSavedBatchId || initialDeliveryBatchId
      ? 'O último lote foi retomado do armazenamento local; abrir não consulta a API.'
      : campaignBatchStore.batches.length + ' lote(s) disponível(is) neste navegador. Selecione um para reabrir; abrir não consulta a API.');
  } else setCampaignBatchStatus('Os lotes serão salvos neste navegador após a criação ou pela associação de campanhas existentes.');
  if (draftStorageError) setDraftStatus(draftStorageError + ' O formulário continuará disponível nesta sessão.', true);
  else if (activeDraftId) {
    const savedDraft = draftStore.drafts.find(draft => draft.id === activeDraftId);
    if (savedDraft) restoreDraft(savedDraft);
    else setDraftStatus('Nenhuma análise ativa foi encontrada. O formulário está pronto para uma nova análise.');
  } else setDraftStatus('As alterações do formulário são salvas automaticamente neste navegador.');
  if ((initialDeliveryBatchId || initialSavedBatchId) && !campaignBatchStorageError && !draftStorageError) {
    openSavedCampaignBatch(initialDeliveryBatchId || initialSavedBatchId);
  } else if (!hasExternalCampaignContext && initialContext?.source === 'legacy' && initialContext.type !== 'batch') {
    if (!rememberCampaignCreationContext(initialContext.type, initialContext.id)) {
      setDraftStatus(activeCampaignContextStorageError + ' O contexto atual permanece aberto nesta sessão, mas pode não ser retomado após um refresh.', true);
    }
  }
  if (activeCampaignContextStorageError) {
    setCampaignBatchStatus(activeCampaignContextStorageError + ' O contexto salvo foi ignorado; selecione um lote ou rascunho e ele será salvo novamente.', true);
  }
  receiveInitialContexts();
  if (ambiguousDeliveryBatches) setCampaignBatchStatus('Esta entrega tem mais de um lote salvo. Selecione no contexto da campanha o lote que deseja abrir; nenhum dado foi alterado.', true);
  renderCampaignResult();
  updateControlState();
  void refreshClickBankKeywordSources();
  const controller = {
    refreshDirectory,
    syncDirectoryFromCache,
    receivePresellHandoff,
    receivePresellHandoffFromJob,
    receiveInitialContexts,
    receiveCampaignDeliveryContext,
    syncCampaignNames: nextNames => {
      const before = knownCampaignNames.join('\n');
      syncKnownCampaignNames(nextNames);
      renderCpaVariantOptions();
      if (before !== knownCampaignNames.join('\n') && !completed && !uncertain && !busy) {
        if (batchEntries.length) {
          let entriesMatch = false;
          try { entriesMatch = samePreviewBatch(buildCampaignBatchEntries()); }
          catch { entriesMatch = false; }
          if (entriesMatch) {
            renderBatchPreview();
            updateControlState();
          } else clearPreview();
        } else if (activeDraftId) {
          void restoreSavedPreview(activeDraftId);
        }
      }
    },
    syncFichaTargets: () => {
      const before = JSON.stringify(campaignTargetState().targets.map(target => [target.accountId, target.finalUrl, target.currencyCode]));
      updateFinalUrlFromPreSell();
      renderCpaVariantOptions();
      const after = JSON.stringify(campaignTargetState().targets.map(target => [target.accountId, target.finalUrl, target.currencyCode]));
      if (before !== after && !completed && !uncertain && !busy) clearPreview();
    },
    refreshHubCampaignRecovery: () => { void refreshHubCampaignRecovery(); },
  };
  mountedRoots.set(root, controller);
  return controller;
}
