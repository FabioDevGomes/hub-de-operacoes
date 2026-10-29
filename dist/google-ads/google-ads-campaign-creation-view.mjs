import {
  applyGoogleAdsAudienceExclusions,
  createGoogleAdsSearchCampaign,
  fetchGoogleAdsAudienceExclusionUploadCatalog,
  fetchGoogleAdsAudienceTargetingUploadCsv,
  previewGoogleAdsSearchCampaign,
} from './google-ads-campaign-creation-service.mjs?v=11';
import { buildGoogleAdsAudienceExclusionWorkbook } from './google-ads-audience-exclusion-workbook.mjs?v=2';
import { applyGoogleAdsCampaignSitelinks, changeGoogleAdsCampaignStatus } from './google-ads-campaign-actions-service.mjs?v=4';
import { fetchGoogleAdsAccounts } from './google-ads-service.mjs?v=10';
import { normalizeGoogleAdsAccounts } from './google-ads-domain.mjs?v=6';
import { readTrackingHubToken } from '../tracking/tracking-token-storage.mjs?v=2';
import { GOOGLE_ADS_ACCOUNTS_CACHE_STORAGE_KEY, loadGoogleAdsAccountsCache, saveGoogleAdsAccountsCache } from './google-ads-accounts-cache.mjs?v=2';
import { ACCOUNT_MAP_DUPLICATION_TARGET_KEY, ACCOUNT_MAP_DUPLICATION_TARGET_UPDATED_EVENT, createAccountDuplicationTargetStorage } from '../accounts/accounts-target-storage.mjs?v=3';
import { ACCOUNT_DIRECTORY_EMAIL_KEY, createAccountDirectoryEmailStorage } from '../accounts/accounts-list-storage.mjs?v=5';
import { normalizeAccountDirectoryId } from '../accounts/accounts-list-domain.mjs?v=8';
import { detectGoogleAdsCopyLanguage } from './google-ads-copy-language.mjs?v=1';
import { detectGoogleAdsCopyDiscount } from './google-ads-discount-detection.mjs?v=1';
import { parseGoogleAdsCopyImport } from './google-ads-copy-import.mjs?v=1';
import { loadGoogleAdsCampaignDrafts, saveGoogleAdsCampaignDrafts } from './google-ads-campaign-drafts-storage.mjs?v=1';
import { loadGoogleAdsCampaignBatches, saveGoogleAdsCampaignBatch } from './google-ads-campaign-batches-storage.mjs?v=2';
import { fetchGoogleAdsCampaignsForDuplication, verifyGoogleAdsCampaignsForAssociation } from './google-ads-campaign-duplication-service.mjs?v=2';
import {
  invalidateGoogleAdsCampaignPreview,
  linkGoogleAdsCampaignPreviewToBatch,
  listGoogleAdsCampaignPreviews,
  loadGoogleAdsCampaignPreview,
  releaseGoogleAdsCampaignPreviewFromBatch,
  saveGoogleAdsCampaignPreview,
} from './google-ads-campaign-preview-storage.mjs?v=2';
import { parseGoogleAdsCampaignName } from './google-ads-campaign-name-parser.mjs?v=2';
import { listClickBankKeywordSources } from './google-ads-clickbank-keyword-bridge.mjs?v=2';
import { matchesGoogleAdsProductPhrase, resolveGoogleAdsPresellTargets } from './google-ads-presell-url-bridge.mjs?v=3';
import { latestGoogleAdsCampaignIteration, makeSequencedGoogleAdsCampaignName, normalizeCampaignSequenceProduct } from './google-ads-campaign-sequence-domain.mjs?v=1';
import { GOOGLE_ADS_CAMPAIGN_SEQUENCE_STORAGE_KEY, readGoogleAdsCampaignSequenceReservations, reserveGoogleAdsCampaignSequence } from './google-ads-campaign-sequence-storage.mjs?v=1';
import { googleAdsAccountAssetsHref } from './google-ads-account-assets-link.mjs?v=3';
import {
  createGoogleAdsAccountImageEligibilityStorage,
  GOOGLE_ADS_ACCOUNT_IMAGE_ELIGIBILITY_STORAGE_KEY,
} from './google-ads-account-image-eligibility-storage.mjs?v=1';

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
    '<header class="google-ads-creation-page-header"><div class="google-ads-creation-page-heading"><div class="google-ads-eyebrow">CRIAÇÃO CONTROLADA</div><h2 id="googleAdsCreationPageTitle">Nova campanha de Pesquisa</h2></div><div class="google-ads-creation-header-buttons"><button class="btn" type="button" data-google-ads-campaign-association-open>Associar campanhas existentes</button><button class="btn primary" type="button" data-google-ads-copy-import-open>Colar copy do Gemini</button><button class="btn" type="button" data-google-ads-creation-refresh>Atualizar MCCs e contas</button></div><div class="google-ads-creation-header-actions"><div class="google-ads-creation-draft-controls"><div class="google-ads-creation-draft-picker"><label for="googleAdsDraftPicker">Contexto aberto · rascunhos e lotes</label><div class="google-ads-creation-draft-select-wrap"><select id="googleAdsDraftPicker" class="input" data-google-ads-draft-picker aria-label="Selecionar rascunho ou lote"></select><button class="btn google-ads-creation-draft-delete" type="button" data-google-ads-delete-draft aria-label="Excluir rascunho selecionado" title="Excluir rascunho selecionado" hidden>×</button></div></div><button class="btn" type="button" data-google-ads-new-draft>Novo rascunho</button></div><small class="google-ads-creation-draft-status" data-google-ads-draft-status role="status" aria-label="Estado do rascunho" aria-live="polite"></small><small class="google-ads-creation-draft-status google-ads-campaign-batch-status" data-google-ads-campaign-batch-status role="status" aria-label="Estado do lote" aria-live="polite"></small></div></header>',
    '<form class="google-ads-creation-form" novalidate>',
    '<div class="google-ads-creation-account-grid">',
    '<label class="google-ads-creation-field"><span>MCC</span><select class="input" name="manager" required></select></label>',
    '<label class="google-ads-creation-field"><span>Conta de referência e fallback</span><select class="input google-ads-creation-account-select" name="account" required></select></label>',
    '</div>',
    '<section class="google-ads-campaign-targets" aria-label="Contas de destino da campanha"><div><h3>Contas de destino</h3><p data-google-ads-campaign-targets-status role="status" aria-live="polite">Ao calcular o nome, o Hub identifica as contas e URLs selecionadas na Ficha e Presell.</p><small class="google-ads-campaign-targets-help">Use “Abrir recursos no Google Ads” em cada conta para conferir manualmente os recursos de imagem. A abertura não consulta a API pelo Hub nem altera a conta.</small></div><ul data-google-ads-campaign-targets-list></ul></section>',
    '<p class="google-ads-creation-status" role="status" aria-live="polite"></p>',
    '<fieldset class="google-ads-creation-fields" disabled>',
    '<div class="google-ads-creation-budget-grid"><div class="google-ads-creation-name-field"><label class="google-ads-creation-field"><span>Novo nome da campanha</span><input class="input" name="campaign_name" type="text" maxlength="128" required autocomplete="off"></label><button class="btn google-ads-creation-calculate" type="button" data-google-ads-campaign-name-calculate>Calcular informações</button></div><label class="google-ads-creation-field"><span>Orçamento diário <small data-creation-currency>moeda da conta</small></span><input class="input" name="daily_budget" type="text" inputmode="decimal" value="100" placeholder="100" required></label><label class="google-ads-creation-field" data-bidding-field="max-cpc" hidden><span data-max-cpc-label>CPC máximo <small data-creation-currency>moeda da conta</small></span><input class="input" name="max_cpc_bid" type="text" inputmode="decimal" placeholder="2,00"></label></div>',
    '<h3>Segmentação e lances</h3>',
    '<div class="google-ads-creation-settings-grid">',
    '<label class="google-ads-creation-field"><span>Estratégia de lances</span><select class="input" name="bidding_strategy" required><option value="TARGET_CPA" selected>CPA desejado</option><option value="MAXIMIZE_CONVERSIONS">Maximizar conversões</option><option value="TARGET_ROAS">ROAS desejado</option><option value="MAXIMIZE_CONVERSION_VALUE">Maximizar valor da conversão</option><option value="MAXIMIZE_CLICKS">Maximizar cliques</option><option value="TARGET_IMPRESSION_SHARE">Parcela de impressões desejada</option><option value="MANUAL_CPC">CPC manual</option></select></label>',
    '<label class="google-ads-creation-field" data-bidding-field="target-cpa"><span data-target-cpa-label>CPA desejado <small data-bid-currency>moeda da conta</small></span><input class="input" name="target_cpa" type="text" inputmode="decimal" placeholder="88,50"></label>',
    '<label class="google-ads-creation-field" data-bidding-field="target-roas" hidden><span>ROAS desejado <small>percentual, por exemplo 200</small></span><input class="input" name="target_roas_percent" type="text" inputmode="decimal" placeholder="200"></label>',
    '<label class="google-ads-creation-field" data-bidding-field="impression-share" hidden><span>Local da parcela de impressões</span><select class="input" name="impression_share_location"><option value="">Selecione</option><option value="ANYWHERE_ON_PAGE">Em qualquer lugar da página</option><option value="TOP_OF_PAGE">Parte superior da página</option><option value="ABSOLUTE_TOP_OF_PAGE">Primeira posição absoluta</option></select></label>',
    '<label class="google-ads-creation-field" data-bidding-field="impression-share" hidden><span>Parcela de impressões desejada <small>1–100%</small></span><input class="input" name="impression_share_percent" type="text" inputmode="decimal" placeholder="80"></label>',
    '<label class="google-ads-creation-field"><span>Países alvo <small>códigos ISO de 2 letras, separados por vírgula</small></span><input class="input" name="geo_target_country_codes" type="text" maxlength="80" placeholder="DE, FR, US" required autocomplete="off"></label>',
    '<label class="google-ads-creation-field"><span>Correspondência das palavras-chave</span><select class="input" name="keyword_match_type" required><option value="">Selecione</option><option value="PHRASE">Frase</option><option value="EXACT">Exata</option><option value="BROAD">Ampla</option></select></label>',
    '<label class="google-ads-creation-field"><span>Correspondência das negativas <small>se houver</small></span><select class="input" name="negative_keyword_match_type"><option value="PHRASE">Frase</option><option value="EXACT">Exata</option><option value="BROAD">Ampla</option></select></label>',
    '<div class="google-ads-clickbank-keyword-source"><label class="google-ads-creation-field"><span>Oferta da garimpagem ClickBank <small>vincula as candidatas de Google Trends e Google Imagens</small></span><select class="input" name="clickbank_offer_key" data-google-ads-clickbank-offer><option value="">Selecione a oferta ClickBank</option></select></label><div class="google-ads-clickbank-keyword-actions"><button class="btn" type="button" data-google-ads-clickbank-refresh>Atualizar ofertas</button></div><small class="google-ads-clickbank-keyword-status" data-google-ads-clickbank-status role="status" aria-live="polite">As ofertas e candidatas são lidas do armazenamento local ClickBank. Esta lista não consulta a API do Google Ads.</small></div>',
    '<label class="google-ads-creation-field"><span>Palavras-chave <small>uma por linha, de 1 a 100</small></span><textarea class="input" name="keywords" rows="5" maxlength="9000" required placeholder="exemplo de busca\noutro termo de busca"></textarea></label>',
    '<label class="google-ads-creation-field"><span>Palavras-chave negativas <small>opcional, uma por linha</small></span><textarea class="input" name="negative_keywords" rows="5" maxlength="9000" placeholder="termo a excluir"></textarea></label>',
    '<div class="google-ads-clickbank-keyword-source google-ads-clickbank-negative-source"><div class="google-ads-clickbank-keyword-actions"><button class="btn primary" type="button" data-google-ads-clickbank-import-all disabled>Importar palavras-chave da Curadoria</button></div><small class="google-ads-clickbank-keyword-status" data-google-ads-clickbank-negative-status role="status" aria-live="polite">Selecione a oferta e clique para trazer as candidatas positivas do Google Trends e as negativas do Google Imagens para os campos acima.</small></div>',
    '<label class="google-ads-creation-field"><span>Declaração de publicidade política da UE</span><select class="input" name="contains_eu_political_advertising" required><option value="">Selecione a declaração correta</option><option value="DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING" selected>Não contém publicidade política</option><option value="CONTAINS_EU_POLITICAL_ADVERTISING">Contém publicidade política</option></select></label>',
    '</div><p class="google-ads-creation-help" data-bidding-help>CPA desejado exige uma ação de conversão principal configurada na conta. A lista de estratégias é fixa e não consulta a API. O MVP permite segmentar países inteiros. Pesquisa Google é sempre incluída; parceiros e Display são opcionais.</p><p class="google-ads-creation-help">A declaração da UE precisa refletir o conteúdo real dos anúncios.</p>',
    '<fieldset class="google-ads-creation-network-options"><legend>Redes adicionais</legend><label><input name="target_search_network" type="checkbox"> Parceiros da Rede de Pesquisa do Google</label><label><input name="target_content_network" type="checkbox"> Rede de Display</label></fieldset>',
    '<div class="google-ads-creation-settings-grid"><label class="google-ads-creation-field"><span>Modelo de acompanhamento <small>opcional; aplicado à campanha</small></span><input class="input" name="tracking_url_template" type="text" maxlength="2048" placeholder="https://rastreador.example/?url={lpurl}"></label><label class="google-ads-creation-field"><span>Sufixo da URL final <small>opcional, sem ? no início</small></span><input class="input" name="final_url_suffix" type="text" maxlength="1024" placeholder="utm_source=google&amp;utm_campaign={campaignid}"></label></div>',
    '<details class="google-ads-copy-assets-details" data-google-ads-copy-assets-details><summary>Títulos e descrições</summary><div class="google-ads-copy-assets-content">',
    '<h3>10 títulos</h3><div class="google-ads-creation-assets-grid">', headlines, '</div>',
    '<h3>3 descrições</h3><div class="google-ads-creation-assets-grid">', descriptions, '</div>',
    '</div></details>',
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
    '<section class="google-ads-cpa-variants" aria-labelledby="googleAdsCpaVariantsTitle"><div><h3 id="googleAdsCpaVariantsTitle">Variações de CPA</h3><p data-cpa-variants-status role="status" aria-live="polite">Calcule as informações do nome para incluir o CPA base e escolher os próximos níveis para todas as contas.</p></div><div class="google-ads-cpa-variants-options" data-cpa-variants-options></div></section>',
    '<input type="hidden" name="source_campaign_date"><input type="hidden" name="source_product"><input type="hidden" name="source_iteration"><input type="hidden" name="source_platform_code"><input type="hidden" name="source_platform"><input type="hidden" name="source_bidding_model_code"><input type="hidden" name="source_bidding_model"><input type="hidden" name="source_extra_tags"><input type="hidden" name="source_destination"><input type="hidden" name="source_commission_amount"><input type="hidden" name="source_commission_currency"><input type="hidden" name="source_target_cpa_percent"><input type="hidden" name="source_target_cpa_amount"><input type="hidden" name="derived_target_cpa_currency">',
    '</fieldset>',
    '<section class="google-ads-audience-targeting google-ads-audience-targeting--csv" aria-label="Planilha de segmentação por públicos">',
    '<div><h3 class="google-ads-audience-targeting-title">Segmentação por públicos <span class="google-ads-audience-targeting-spinner" data-google-ads-audience-loading hidden aria-hidden="true"></span></h3><p data-google-ads-audience-description>Depois de salvar ou reabrir um lote, baixe um CSV por MCC com os 918 públicos para cada grupo de anúncios. A exportação não consulta nem altera a Google Ads API.</p></div>',
    '<div class="google-ads-audience-targeting-control" data-google-ads-audience-csv-panel></div>',
    '</section>',
    '<section class="google-ads-audience-exclusion-info" aria-label="Exclusões de público da campanha"><div><h3>Exclusões de público</h3><p>Depois de criar a campanha pausada, use <strong>Aplicar exclusões</strong> para excluir estes interesses no nível da campanha. O serviço consulta o catálogo do Google Ads e resolve automaticamente pelo nome os itens sem ID informado. Esta ação é independente da segmentação positiva.</p></div><details><summary>Ver os 13 públicos</summary><ul>',
    audienceExclusionLabels.map(label => '<li>' + label + '</li>').join(''),
    '</ul></details></section>',
    '<section class="google-ads-creation-preview" hidden aria-live="polite"><h3 data-google-ads-creation-preview-title>Verificação da prévia</h3><p data-google-ads-creation-preview-description>A API procura primeiro o nome exato em cada conta. Se já existir, mostra ID, status e grupos; se estiver livre, valida com validateOnly. As consultas usam cota de leitura; esta etapa não cria campanhas.</p><dl data-google-ads-creation-preview-details></dl></section>',
    '<section class="google-ads-creation-result" hidden role="status" aria-live="polite"></section>',
    '<footer class="google-ads-creation-actions"><button class="btn" type="button" data-google-ads-creation-preview disabled>Validar prévia</button><button class="btn primary" type="button" data-google-ads-creation-submit hidden disabled>Criar campanha pausada</button><p class="google-ads-creation-status google-ads-creation-status-bottom" data-google-ads-creation-status-bottom aria-live="off" hidden><span data-google-ads-creation-status-text></span><span class="google-ads-creation-status-spinner" data-google-ads-creation-status-spinner hidden aria-hidden="true"></span></p></footer>',
    '</form></section>',
    '<dialog class="google-ads-copy-import-dialog" data-google-ads-copy-import-dialog aria-labelledby="googleAdsCopyImportTitle">',
    '<section class="google-ads-copy-import-panel">',
    '<header class="google-ads-copy-import-header"><div><div class="google-ads-eyebrow">IMPORTAÇÃO LOCAL</div><h2 id="googleAdsCopyImportTitle">Selecionar copy para a campanha</h2></div><button class="google-ads-copy-import-close" type="button" data-google-ads-copy-import-close aria-label="Fechar">×</button></header>',
    '<div class="google-ads-copy-import-source"><label class="google-ads-creation-field"><span>Resposta completa do Gemini</span><textarea class="input" data-google-ads-copy-import-input rows="3" placeholder="A resposta será lida da área de transferência. Se necessário, cole aqui."></textarea></label></div>',
    '<p class="google-ads-copy-import-status" data-google-ads-copy-import-status role="status" aria-live="polite"></p>',
    '<section class="google-ads-copy-import-results" data-google-ads-copy-import-results hidden>',
    '<div class="google-ads-copy-import-counts"><span data-copy-import-headline-count>0/10 títulos</span><span data-copy-import-description-count>0/3 descrições</span><span data-copy-import-promotion-count>0/1 promoção</span></div>',
    '<div class="google-ads-copy-import-groups" data-google-ads-copy-import-groups></div>',
    '</section>',
    '<footer class="google-ads-copy-import-footer"><button class="btn" type="button" data-google-ads-copy-import-close>Fechar</button><button class="btn primary" type="button" data-google-ads-copy-import-apply disabled>Aplicar selecionados (10 títulos e 3 descrições)</button></footer>',
    '</section></dialog>',
    '<dialog class="google-ads-campaign-name-dialog" data-google-ads-campaign-name-dialog aria-labelledby="googleAdsCampaignNameDialogTitle"><section class="google-ads-campaign-name-panel"><header><div><div class="google-ads-eyebrow">LEITURA DO PADRÃO</div><h2 id="googleAdsCampaignNameDialogTitle">Informações da campanha</h2></div><button class="google-ads-copy-import-close" type="button" data-campaign-name-close aria-label="Fechar">×</button></header><div class="google-ads-campaign-name-content"><label class="google-ads-creation-field"><span>Nome para analisar</span><input class="input" type="text" data-campaign-name-source maxlength="128" autocomplete="off"></label><button class="btn" type="button" data-campaign-name-recalculate>Recalcular</button><p class="google-ads-campaign-name-status" data-campaign-name-status role="status" aria-live="polite"></p><dl data-campaign-name-details></dl></div><footer><button class="btn" type="button" data-campaign-name-close>Cancelar</button><button class="btn primary" type="button" data-campaign-name-apply>Aplicar nome, GEO e CPA calculado</button></footer></section></dialog>',
    '<dialog class="google-ads-image-eligibility-dialog" data-google-ads-image-eligibility-dialog aria-labelledby="googleAdsImageEligibilityTitle"><section class="google-ads-image-eligibility-panel"><header><div><div class="google-ads-eyebrow">VERIFICAÇÃO DA CONTA</div><h2 id="googleAdsImageEligibilityTitle">A conta permite recursos de imagem?</h2></div><button class="google-ads-copy-import-close" type="button" data-image-eligibility-close aria-label="Fechar">×</button></header><div class="google-ads-image-eligibility-content"><p data-image-eligibility-account></p><p>Confira a disponibilidade em Recursos no Google Ads e escolha o resultado. Essa informação fica salva neste navegador para esta conta.</p><div class="google-ads-image-eligibility-options"><button class="btn primary" type="button" data-image-eligibility-choice="allowed">Permite imagem</button><button class="btn" type="button" data-image-eligibility-choice="not_allowed">Não permite imagem</button></div></div><footer><button class="btn" type="button" data-image-eligibility-close>Cancelar</button></footer></section></dialog>',
    '<dialog class="google-ads-campaign-association-dialog" data-google-ads-campaign-association-dialog aria-labelledby="googleAdsCampaignAssociationTitle"><section class="google-ads-campaign-association-panel"><header><div><div class="google-ads-eyebrow">RECUPERAÇÃO DE CAMPANHAS</div><h2 id="googleAdsCampaignAssociationTitle">Identificar e associar campanhas existentes</h2></div><button class="google-ads-copy-import-close" type="button" data-campaign-association-close aria-label="Fechar">×</button></header><div class="google-ads-campaign-association-content"><p>A busca consulta campanhas Search nas contas marcadas e compara o produto exato no padrão do nome. Cada busca usa uma leitura por conta; associar confirma nomes, IDs e grupos com duas leituras por conta. As consultas usam cota do Google Ads. O lote fica neste navegador; nenhuma campanha é criada ou alterada.</p><label class="google-ads-creation-field"><span>Produto para identificar</span><input class="input" type="text" data-campaign-association-product autocomplete="off"></label><fieldset class="google-ads-campaign-association-accounts"><legend>Contas de destino</legend><div data-campaign-association-accounts></div></fieldset><div class="google-ads-campaign-association-search"><button class="btn primary" type="button" data-campaign-association-search>Buscar campanhas</button><small data-campaign-association-status role="status" aria-live="polite">A busca só começa quando você clicar.</small></div><section class="google-ads-campaign-association-results" data-campaign-association-results hidden><div class="google-ads-campaign-association-results-header"><strong data-campaign-association-summary></strong><button class="btn" type="button" data-campaign-association-select-all hidden>Selecionar todas</button></div><ul data-campaign-association-list></ul></section></div><footer><button class="btn" type="button" data-campaign-association-close>Fechar</button><button class="btn primary" type="button" data-campaign-association-save disabled>Associar selecionadas (0)</button></footer></section></dialog></div>',
  ].join('');
}

export function mountGoogleAdsCampaignCreation({ root, campaignNames = [], getCampaignNames = null } = {}) {
  if (!root) throw new Error('A área de criação de campanhas Google Ads não foi encontrada.');
  const existing = mountedRoots.get(root);
  if (existing) {
    existing.syncDirectoryFromCache();
    existing.syncCampaignNames(Array.isArray(campaignNames) && campaignNames.length ? campaignNames : getCampaignNames?.() || []);
    existing.syncFichaTargets();
    return existing;
  }
  root.dataset.googleAdsCampaignCreationMounted = 'true';
  root.innerHTML = makeFields();
  const form = root.querySelector('form');
  const page = root.querySelector('.google-ads-creation-page');
  const managerSelect = form.elements.namedItem('manager');
  const accountSelect = form.elements.namedItem('account');
  const fields = page.querySelector('.google-ads-creation-fields');
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
  const createButton = page.querySelector('[data-google-ads-creation-submit]');
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
  const campaignTargetsStatus = page.querySelector('[data-google-ads-campaign-targets-status]');
  const campaignTargetsList = page.querySelector('[data-google-ads-campaign-targets-list]');
  const imageEligibilityDialog = page.querySelector('[data-google-ads-image-eligibility-dialog]');
  const imageEligibilityAccount = page.querySelector('[data-image-eligibility-account]');
  let pendingImageEligibilityAccountId = '';
  let accountDirectoryEmailStorage;
  try { accountDirectoryEmailStorage = createAccountDirectoryEmailStorage(window.localStorage); }
  catch { accountDirectoryEmailStorage = createAccountDirectoryEmailStorage(null); }
  let accountImageEligibilityStorage;
  try { accountImageEligibilityStorage = createGoogleAdsAccountImageEligibilityStorage(window.localStorage); }
  catch { accountImageEligibilityStorage = createGoogleAdsAccountImageEligibilityStorage(null); }
  const getCpaVariantLabels = () => [...cpaVariantsOptions.querySelectorAll('[data-cpa-variant-label]')];
  const audienceTargetingDescription = page.querySelector('[data-google-ads-audience-description]');
  const audienceTargetingLoadingIndicator = page.querySelector('[data-google-ads-audience-loading]');
  const audienceTargetingCsvPanel = page.querySelector('[data-google-ads-audience-csv-panel]');
  const refreshButton = page.querySelector('[data-google-ads-creation-refresh]');
  const copyImportOpenButton = page.querySelector('[data-google-ads-copy-import-open]');
  const draftPicker = page.querySelector('[data-google-ads-draft-picker]');
  const deleteDraftButton = page.querySelector('[data-google-ads-delete-draft]');
  const newDraftButton = page.querySelector('[data-google-ads-new-draft]');
  const draftStatus = page.querySelector('[data-google-ads-draft-status]');
  const campaignBatchStatus = page.querySelector('[data-google-ads-campaign-batch-status]');
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
  const clickBankOffersRefreshButton = page.querySelector('[data-google-ads-clickbank-refresh]');
  const clickBankKeywordsImportButton = page.querySelector('[data-google-ads-clickbank-import-all]');
  const clickBankKeywordStatus = page.querySelector('[data-google-ads-clickbank-status]');
  const clickBankNegativeKeywordStatus = page.querySelector('[data-google-ads-clickbank-negative-status]');
  const keywordField = form.elements.namedItem('keywords');
  const keywordMatchTypeField = form.elements.namedItem('keyword_match_type');
  const negativeKeywordField = form.elements.namedItem('negative_keywords');
  const negativeKeywordMatchTypeField = form.elements.namedItem('negative_keyword_match_type');
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
  let directoryCachePersisted = Boolean(cachedDirectory);
  let knownCampaignNames = Array.isArray(campaignNames) ? campaignNames.map(String).filter(Boolean) : [];
  let previewSnapshot = '';
  let previewFingerprint = '';
  let previewId = '';
  let previewValidatedAt = '';
  let campaignPreviewStorageError = '';
  let batchEntries = [];
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
  const audienceTargetingCsvExportingManagerIds = new Set();
  const audienceTargetingCsvExportStatusByManager = new Map();
  let campaignActivationBatchApplying = false;
  let campaignActivationBatchProgress = null;
  let campaignSitelinksBatchApplying = false;
  let campaignSitelinksBatchAttempted = false;
  let campaignSitelinksBatchProgress = null;
  let parsedCopy = null;
  let parsedCampaignName = null;
  let applyingCampaignNameParse = false;
  let selectedCopyAssets = new Set();
  let selectedCopySitelinks = new Map();
  let selectedPromotion = false;
  let copyImportInputTimer = null;
  let copyImportStorageError = '';
  let copyImportMode = 'campaign';
  let draftStore = { schemaVersion: 1, activeDraftId: '', drafts: [] };
  let activeDraftId = '';
  let draftStorageError = '';
  let campaignBatchStore = { schemaVersion: 1, batches: [] };
  let activeCampaignBatchId = '';
  let campaignAssociationCandidates = [];
  let campaignAssociationBusy = false;
  let campaignAssociationSearchReady = false;
  let activeCampaignBatchCreatedAt = '';
  let activeCampaignBatchSitelinks = [];
  let pendingDraftSitelinks = [];
  let imageUploadConfirmed = false;
  let imageUploadConfirmedAccountIds = [];
  let campaignBatchRestored = false;
  let campaignBatchStorageError = '';
  let draftSaveTimer = null;
  let draftDirty = false;
  let draftForce = false;
  let restoringDraft = false;
  let clickBankKeywordSources = [];
  let clickBankKeywordSourcesLoaded = false;
  let clickBankKeywordSourcesLoading = false;
  let clickBankKeywordSourcesError = '';
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
  try {
    campaignBatchStore = loadGoogleAdsCampaignBatches();
  } catch (error) {
    campaignBatchStorageError = error.message || 'Não foi possível acessar os lotes de campanhas deste navegador.';
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
    return clickBankKeywordSources.find(item=>item.offerKey===clickBankOfferSelect.value)||null;
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

  function campaignTargetState() {
    const campaignProduct = campaignProductForFinalUrl();
    const offer = selectedClickBankKeywordSource();
    const ficha = resolveGoogleAdsPresellTargets({ campaignProduct, offerName: offer?.offerName || '' });
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

  function renderCampaignTargetSummary() {
    const state = campaignTargetState();
    const accountEmails = accountDirectoryEmailStorage.read();
    const imageEligibilityByAccount = accountImageEligibilityStorage.read();
    campaignTargetsList.replaceChildren();
    state.targets.forEach(target => {
      const item = document.createElement('li');
      const name = target.account?.name || ('Conta ' + (target.accountId || 'não encontrada'));
      const summary = document.createElement('span');
      summary.className = 'google-ads-campaign-target-summary';
      summary.textContent = name + ' · ' + (target.currencyCode || 'moeda não identificada') + ' · '
        + (target.finalUrl || target.reason || 'URL não informada');
      const emailKey = normalizeAccountDirectoryId(target.accountId);
      const accountEmail = emailKey ? accountEmails[emailKey] || '' : '';
      const creationDate = formatCampaignTargetCreationDate(target.account?.creationDate);
      const emailLine = document.createElement('small');
      emailLine.className = 'google-ads-campaign-target-email' + (accountEmail ? '' : ' is-missing');
      emailLine.textContent = (accountEmail ? 'E-mail: ' + accountEmail : 'E-mail não cadastrado em Contas')
        + ' · Criação: ' + (creationDate || 'data indisponível');
      item.append(summary, emailLine);
      const imageEligibility = imageEligibilityByAccount[target.accountId] || '';
      const imageEligibilityButton = document.createElement('button');
      imageEligibilityButton.type = 'button';
      imageEligibilityButton.className = 'google-ads-image-eligibility-button';
      imageEligibilityButton.dataset.googleAdsImageEligibility = target.accountId;
      imageEligibilityButton.setAttribute('aria-haspopup', 'dialog');
      imageEligibilityButton.textContent = imageEligibility === 'allowed'
        ? 'Permite imagem · alterar'
        : imageEligibility === 'not_allowed'
          ? 'Não permite imagem · alterar'
          : 'Verificar permissão de imagem';
      imageEligibilityButton.classList.toggle('is-pending', !imageEligibility);
      imageEligibilityButton.classList.toggle('is-allowed', imageEligibility === 'allowed');
      imageEligibilityButton.classList.toggle('is-unavailable', imageEligibility === 'not_allowed');
      imageEligibilityButton.setAttribute('aria-label', 'Verificar se a conta ' + name + ' permite recursos de imagem');
      item.append(imageEligibilityButton);
      const assetsHref = googleAdsAccountAssetsHref(target.accountId);
      if (assetsHref) {
        const assetsLink = document.createElement('a');
        assetsLink.href = assetsHref;
        assetsLink.target = '_blank';
        assetsLink.rel = 'noopener noreferrer';
        assetsLink.textContent = 'Abrir recursos no Google Ads ↗';
        assetsLink.setAttribute('aria-label', 'Abrir recursos do Google Ads para ' + name + ' · ' + target.accountId);
        item.append(assetsLink);
      }
      item.classList.toggle('is-warning', Boolean(target.reason || !target.account || !target.currencyCode || !target.finalUrl));
      campaignTargetsList.append(item);
    });
    const invalid = state.targets.filter(target => target.reason || !target.account || !target.currencyCode || !target.finalUrl);
    campaignTargetsStatus.classList.toggle('is-warning', invalid.length > 0);
    campaignTargetsStatus.classList.toggle('is-success', state.source === 'ficha' && state.targets.length > 0 && !invalid.length);
    if (state.source === 'ficha') {
      campaignTargetsStatus.textContent = state.targets.length
        ? state.targets.length + ' conta(s) selecionada(s) na Ficha para ' + state.product + '. Todas recebem os níveis de CPA marcados, cada uma com sua URL.'
          + (invalid.length ? ' Corrija os itens destacados antes de validar.' : '')
        : 'A Ficha corresponde a ' + state.product + ', mas não há conta de destino selecionada.';
    } else if (state.targets.length) {
      campaignTargetsStatus.textContent = 'Nenhuma seleção da Ficha corresponde a este produto. O lote usará somente a conta de referência e a URL do formulário.';
    } else {
      campaignTargetsStatus.textContent = 'Selecione uma conta ou escolha as contas e URLs na Ficha e Presell para este produto.';
    }
    return state;
  }

  function openImageEligibilityDialog(accountId) {
    const normalizedAccountId = String(accountId || '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(normalizedAccountId)) return;
    const target = campaignTargetState().targets.find(item => item.accountId === normalizedAccountId);
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
    const ficha=resolveGoogleAdsPresellTargets({campaignProduct:product,offerName:offer?.offerName||''});
    const firstFichaTarget=ficha.matched?ficha.targets.find(target=>target.ok):null;
    const result=firstFichaTarget||{...resolveGoogleAdsPresellTargets({campaignProduct:product,offerName:offer?.offerName||''}),...{ok:false,reason:ficha.reason}};
    const current=String(finalUrlField.value||'').trim();
    const stillAutomatic=finalUrlSource==='presell'&&current===finalUrlAutoValue;
    if(result.ok){
      if(!current||stillAutomatic){
        finalUrlField.value=result.url;
        finalUrlSource='presell';
        finalUrlAutoValue=result.url;
        setPresellUrlStatus(ficha.targets.length>1
          ? 'URL de referência preenchida da Ficha. Cada conta do lote usará sua URL individual mostrada acima.'
          : 'URL preenchida da Ficha e Presell · '+result.product+' · conta '+result.accountId+'. Você pode editá-la; ela será usada no anúncio e na promoção.',true);
        scheduleDraftSave();
        renderCampaignTargetSummary();
        return;
      }
      setPresellUrlStatus(finalUrlSource==='manual'
        ?(ficha.matched?'URL editada manualmente; o lote continua usando as URLs individuais salvas na Ficha.':'URL editada manualmente; o Hub preservou seu valor.')
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
      'no-ficha':'Nenhuma ficha local foi encontrada. Salve o produto e a URL na tela Ficha e Presell.',
      'tracking-disabled':'Ative o rastreamento e salve a URL na tela Ficha e Presell.',
      'no-product':'A ficha local não tem um produto identificado.',
      'no-campaign-product':'Informe o nome da campanha no padrão ou selecione uma oferta ClickBank correspondente.',
      'product-mismatch':'O produto da campanha não corresponde ao produto salvo na Ficha e Presell.',
      'offer-mismatch':'A oferta ClickBank selecionada não corresponde ao produto salvo na Ficha e Presell.',
      'no-account':'Selecione a conta Google Ads para localizar a URL correspondente.',
      'account-not-selected':'A conta atual não está selecionada como destino na Ficha e Presell.',
      'no-url':'Não há URL da Pre-Sell salva para esta conta na Ficha e Presell.',
      'invalid-url':'A URL salva precisa ser HTTPS para ser usada na campanha.',
    };
    setPresellUrlStatus(finalUrlSource==='manual'
      ?'URL editada manualmente; o Hub preservou seu valor.'
      :messages[result.reason]||'Não foi encontrada uma URL compatível na Ficha e Presell.',false);
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
    clickBankOfferSelect.replaceChildren();
    const placeholder=document.createElement('option');
    placeholder.value='';
    placeholder.textContent=clickBankKeywordSources.length?'Selecione a oferta ClickBank':'Nenhuma oferta com candidatas salvas';
    clickBankOfferSelect.append(placeholder);
    clickBankKeywordSources.forEach(item=>{
      const option=document.createElement('option');
      option.value=item.offerKey;
      option.textContent=item.offerName+(item.seller?' · '+item.seller:'')+' · +'+item.keywords.length+' positivas / −'+item.negativeKeywords.length+' negativas';
      clickBankOfferSelect.append(option);
    });
    if(restoreOfferKey&&!clickBankKeywordSources.some(item=>item.offerKey===restoreOfferKey)){
      const unavailable=document.createElement('option');
      unavailable.value=restoreOfferKey;
      unavailable.textContent='Oferta deste rascunho sem candidatas disponíveis';
      clickBankOfferSelect.append(unavailable);
    }
    clickBankOfferSelect.value=restoreOfferKey||'';
    updateClickBankKeywordImportState();
  }

  function clickBankTermListError(keywords, label) {
    const duplicateKeywords=new Set();
    const hasDuplicates=keywords.some(value=>{
      const key=value.toLocaleLowerCase('pt-BR');
      if(duplicateKeywords.has(key))return true;
      duplicateKeywords.add(key);return false;
    });
    if(keywords.length>100)return 'A lista de '+label+' excede o limite de 100 termos.';
    if(keywords.some(value=>Array.from(value).length>80))return 'Um termo de '+label+' excede o limite de 80 caracteres.';
    if(hasDuplicates)return 'A lista de '+label+' contém termos repetidos.';
    return '';
  }

  function updateClickBankKeywordImportState(message = '') {
    updateClickBankNegativeKeywordImportState();
    const selected=selectedClickBankKeywordSource();
    const keywords=selected?.keywords||[];
    const negativeKeywords=selected?.negativeKeywords||[];
    const positiveError=clickBankTermListError(keywords,'palavras-chave positivas');
    const negativeError=clickBankTermListError(negativeKeywords,'palavras-chave negativas');
    const hasCandidates=keywords.length>0||negativeKeywords.length>0;
    clickBankKeywordsImportButton.disabled=clickBankKeywordSourcesLoading||!selected||!hasCandidates||Boolean(positiveError||negativeError);
    clickBankKeywordsImportButton.textContent='Importar palavras-chave da Curadoria';
    if(message){clickBankKeywordStatus.textContent=message;return;}
    if(clickBankKeywordSourcesLoading){clickBankKeywordStatus.textContent='Lendo as ofertas e candidatas salvas no armazenamento local ClickBank…';return;}
    if(clickBankKeywordSourcesError){clickBankKeywordStatus.textContent=clickBankKeywordSourcesError;return;}
    if(!clickBankKeywordSourcesLoaded){clickBankKeywordStatus.textContent='As candidatas positivas e negativas são lidas localmente no ClickBank. Esta importação não consulta a API do Google Ads.';return;}
    if(!clickBankKeywordSources.length){clickBankKeywordStatus.textContent='Nenhuma oferta ClickBank tem candidatas salvas. Adicione termos nas fichas Google Trends ou Google Imagens para importá-los aqui.';return;}
    if(!selected){
      clickBankKeywordStatus.textContent=clickBankOfferSelect.value
        ? 'A oferta salva neste rascunho não tem candidatas ClickBank disponíveis. Escolha uma oferta atual ou atualize a lista.'
        : 'Selecione a oferta da garimpagem. Depois clique em Importar palavras-chave da Curadoria para trazer as listas disponíveis aos campos.';
      return;
    }
    if(!hasCandidates){clickBankKeywordStatus.textContent='Esta oferta não tem candidatas salvas no Google Trends nem no Google Imagens.';return;}
    if(positiveError||negativeError){clickBankKeywordStatus.textContent=[positiveError,negativeError].filter(Boolean).join(' ');return;}
    const matchMessage='Correspondência positiva: '+(keywordMatchTypeField.value?clickBankMatchTypeLabel():'não selecionada')+' · negativa: '+(negativeKeywordMatchTypeField.value?clickBankNegativeMatchTypeLabel():'não selecionada')+'.';
    clickBankKeywordStatus.textContent=keywords.length+' candidata(s) positiva(s) e '+negativeKeywords.length+' negativa(s) salvas para '+selected.offerName+(selected.seller?' · '+selected.seller:'')+'. '+matchMessage+' O clique atualiza cada campo com os termos disponíveis; se uma lista não tiver candidatas, o campo correspondente permanece como está.';
  }

  function updateClickBankNegativeKeywordImportState(message = '') {
    const selected=selectedClickBankKeywordSource();
    const keywords=selected?.negativeKeywords||[];
    if(message){clickBankNegativeKeywordStatus.textContent=message;return;}
    if(clickBankKeywordSourcesLoading){clickBankNegativeKeywordStatus.textContent='Lendo as avaliações salvas de Google Imagens no armazenamento local ClickBank…';return;}
    if(clickBankKeywordSourcesError){clickBankNegativeKeywordStatus.textContent=clickBankKeywordSourcesError;return;}
    if(!clickBankKeywordSourcesLoaded){clickBankNegativeKeywordStatus.textContent='As candidatas negativas são lidas localmente da aba Google Imagens; não há consulta à API do Google Ads.';return;}
    if(!selected){
      clickBankNegativeKeywordStatus.textContent=clickBankOfferSelect.value
        ? 'A oferta salva neste rascunho não tem candidatas ClickBank disponíveis. Escolha uma oferta atual ou atualize a lista.'
        : 'Selecione a oferta da garimpagem acima e clique em Importar palavras-chave da Curadoria para trazer as listas disponíveis aos campos.';
      return;
    }
    if(!keywords.length){clickBankNegativeKeywordStatus.textContent='Nenhuma candidata negativa está salva para esta oferta. O campo negativo permanecerá como está ao importar; adicione termos na aba Google Imagens da ficha ClickBank.';return;}
    const error=clickBankTermListError(keywords,'palavras-chave negativas');
    if(error){clickBankNegativeKeywordStatus.textContent=error+' Ajuste a lista na ficha ClickBank.';return;}
    const countries=(selected.negativeKeywordCountries||[]).join(', ');
    const matchMessage=negativeKeywordMatchTypeField.value
      ? 'Correspondência negativa: '+clickBankNegativeMatchTypeLabel()+'.'
      : 'Selecione a correspondência negativa no formulário.';
    clickBankNegativeKeywordStatus.textContent=keywords.length+' candidata(s) negativas'+(countries?' ('+countries+')':'')+' salvas para '+selected.offerName+(selected.seller?' · '+selected.seller:'')+'. '+matchMessage;
  }

  async function refreshClickBankKeywordSources() {
    const priorOfferKey=clickBankOfferSelect.value||pendingClickBankOfferKeyRestore;
    pendingClickBankOfferKeyRestore='';
    clickBankKeywordSourcesLoading=true;
    clickBankKeywordSourcesError='';
    clickBankOffersRefreshButton.disabled=true;
    updateClickBankKeywordImportState();
    try{
      clickBankKeywordSources=await listClickBankKeywordSources();
      clickBankKeywordSourcesLoaded=true;
    }catch(error){
      clickBankKeywordSources=[];
      clickBankKeywordSourcesLoaded=true;
      clickBankKeywordSourcesError='Não foi possível ler as candidatas ClickBank salvas neste navegador. '+(error?.message||'Tente atualizar a lista.');
    }finally{
      clickBankKeywordSourcesLoading=false;
      clickBankOffersRefreshButton.disabled=false;
      renderClickBankKeywordSources(priorOfferKey);
      updateFinalUrlFromPreSell();
    }
  }

  function importSelectedClickBankKeywords() {
    const selected=selectedClickBankKeywordSource();
    if(!selected)return;
    const keywords=selected.keywords||[];
    const negativeKeywords=selected.negativeKeywords||[];
    const error=clickBankTermListError(keywords,'palavras-chave positivas')||clickBankTermListError(negativeKeywords,'palavras-chave negativas');
    if(error||(!keywords.length&&!negativeKeywords.length)){
      updateClickBankKeywordImportState();
      return;
    }
    const imported=[];
    if(keywords.length){
      keywordField.value=keywords.join('\n');
      keywordField.setCustomValidity('');
      keywordField.dispatchEvent(new window.Event('input',{bubbles:true}));
      imported.push(keywords.length+' positiva(s)');
    }
    if(negativeKeywords.length){
      negativeKeywordField.value=negativeKeywords.join('\n');
      negativeKeywordField.setCustomValidity('');
      negativeKeywordField.dispatchEvent(new window.Event('input',{bubbles:true}));
      imported.push(negativeKeywords.length+' negativa(s)');
    }
    updateClickBankKeywordImportState('Campos atualizados com '+imported.join(' e ')+' da oferta '+selected.offerName+'. As correspondências selecionadas serão aplicadas na prévia.');
    if(!negativeKeywords.length)updateClickBankNegativeKeywordImportState('A Curadoria não tem candidatas negativas salvas para esta oferta; o campo negativo permaneceu como estava.');
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
    };
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
    const targetCpaUnchanged = normalizeDecimal(targetCpaField.value) === source.baseCpa;
    return parsed.ok && source.percent >= CPA_VARIANT_MIN_PERCENT && source.percent <= CPA_VARIANT_MAX_PERCENT
      && source.commission > 0
      && ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'].includes(biddingStrategyField.value)
      && targets.length > 0 && targets.every(target => target.account && !target.reason && target.finalUrl)
      && currencies.length === 1 && currencies[0] === source.currency
      && derivedCpaCurrencyField.value.toUpperCase() === source.currency
      && targetCpaUnchanged;
  }

  function updateCpaVariantSelectionCount() {
    const source = campaignNameSource();
    const available = cpaVariantIsAvailable(source);
    const selectedExtras = getCpaVariantLabels().filter(label =>
      !label.classList.contains('is-base')
      && label.querySelector('input').checked
      && !label.querySelector('input').disabled
    ).length;
    const accountCount = Math.max(1, campaignTargetState().targets.length);
    const selectedCount = accountCount * (available ? 1 + selectedExtras : 1);
    previewButton.textContent = 'Validar prévia (' + selectedCount + ' campanha' + (selectedCount === 1 ? '' : 's') + ')';
  }

  function renderCpaVariantOptions({ selectedPercents } = {}) {
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
      const amount = Math.round((source.commission * percent / 100 + Number.EPSILON) * 100) / 100;
      const detail = isBase
        ? 'Base obrigatória · ' + cpaVariantCurrencyLabel(source.currency, amount)
        : cpaVariantCurrencyLabel(source.currency, amount);
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
      cpaVariantsStatus.textContent = currencies.length > 1
        ? 'As contas selecionadas usam moedas diferentes (' + currencies.join(', ') + '). Use contas na mesma moeda para compartilhar orçamento e CPA.'
        : 'A base detectada é ' + source.percent + '%. Confira o CPA calculado, a moeda e as URLs das contas selecionadas para habilitar os níveis acima dela.';
      return;
    }
    cpaVariantsStatus.textContent = source.percent + '% obrigatório como menor CPA · ' + cpaVariantCurrencyLabel(source.currency, source.commission * source.percent / 100) + '. '
      + campaignTargetState().targets.length + ' conta(s) selecionada(s); cada nível marcado será aplicado a todas. '
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
    if (currencies.length !== 1 || !currencies[0] || targets.some(target => target.currencyCode !== String(referenceAccount()?.currencyCode || '').toUpperCase())) {
      throw new Error('As contas selecionadas precisam usar a mesma moeda da conta de referência. Orçamento, promoção e lances são compartilhados e o Hub não faz conversão cambial. Moedas encontradas: ' + (currencies.join(', ') || 'não identificada') + '.');
    }
    if (selectedPercents.length && !cpaVariantIsAvailable(source)) {
      throw new Error('Confira o CPA base, a moeda e as URLs das contas selecionadas antes de marcar outras faixas.');
    }
    const parsed = parseGoogleAdsCampaignName(basePayload.campaignName);
    if (!parsed.ok) {
      if (targets.length > 1 || selectedPercents.length) throw new Error('Calcule as informações de um nome no padrão antes de criar em várias contas ou usar níveis de CPA.');
      return [{ payload: basePayload, percent: source.percent || 'Base', iteration: null, product: '', targetSource: targets[0].source, accountName: targets[0].account.name, accountCurrency: targets[0].currencyCode }];
    }
    if (!source.percent || !source.commission || !source.currency) {
      throw new Error('Clique em “Calcular informações” para carregar percentual, comissão e moeda antes de validar o lote.');
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
        if (percent !== source.percent && ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'].includes(biddingStrategyField.value)) {
          payload.targetCpa = (Math.round((source.commission * percent / 100 + Number.EPSILON) * 100) / 100).toFixed(2);
          payload.targetCpaCurrency = source.currency;
        }
        entries.push({ payload, percent, iteration, product, targetSource: target.source, accountName: target.account?.name || target.accountId, accountCurrency: target.currencyCode });
      }
    }
    return entries;
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
    audienceTargetingDescription.textContent = 'Baixe um arquivo CSV por MCC com a lista de ' + GOOGLE_ADS_CONFIGURED_AUDIENCE_COUNT
      + ' públicos para cada grupo de anúncios identificado no lote salvo. Gerar o arquivo não consulta nem altera a Google Ads API.';
    audienceTargetingCsvPanel.replaceChildren();
    if (!createdCampaigns.length) {
      const status = document.createElement('p');
      status.className = 'google-ads-audience-targeting-status';
      status.textContent = 'Crie ou selecione um lote salvo para liberar os arquivos CSV por MCC.';
      audienceTargetingCsvPanel.append(status);
      return;
    }
    const panel = renderAudienceTargetingCsvUploadPanel();
    if (panel) audienceTargetingCsvPanel.append(panel);
  }

  function pendingCampaignActivations() {
    return createdCampaigns.filter(campaign => campaign.status !== 'ENABLED');
  }

  function imageEligibleAccountsForCreatedBatch() {
    const eligibility = accountImageEligibilityStorage.read();
    const accounts = new Map();
    createdCampaigns.forEach(campaign => {
      const accountId = String(campaign.customerId || '').replace(/\D/g, '');
      if (eligibility[accountId] === 'allowed' && !accounts.has(accountId)) {
        accounts.set(accountId, {
          accountId,
          name: campaign.accountName || ('Conta ' + accountId),
        });
      }
    });
    return [...accounts.values()];
  }

  function imageUploadConfirmationMatchesCurrentAccounts() {
    if (!imageUploadConfirmed) return false;
    const confirmedIds = [...imageUploadConfirmedAccountIds].sort();
    const currentIds = imageEligibleAccountsForCreatedBatch().map(account => account.accountId).sort();
    return confirmedIds.length === currentIds.length && confirmedIds.every((accountId, index) => accountId === currentIds[index]);
  }

  function renderCampaignImageUploadChecklist() {
    if ((!completed && !campaignBatchRestored) || !activeCampaignBatchId || !createdCampaigns.length) return;
    const eligibleAccounts = imageEligibleAccountsForCreatedBatch();
    if (!eligibleAccounts.length) return;

    const panel = document.createElement('section');
    panel.className = 'google-ads-audience-exclusions-batch google-ads-campaign-image-upload-checklist';
    const title = document.createElement('h4');
    title.textContent = 'Recursos de imagem no Google Ads';
    const help = document.createElement('p');
    help.textContent = 'Você marcou ' + eligibleAccounts.length + ' conta(s) deste lote como compatível(is) com imagens. Depois de criar ou reabrir o lote, confira no Google Ads se os recursos foram enviados a essas contas e marque a caixa abaixo. Isso registra sua conferência neste navegador, não bloqueia a validação da prévia nem a criação e só é exigido para liberar a ativação em massa.';
    const accountList = document.createElement('ul');
    accountList.className = 'google-ads-image-upload-accounts';
    eligibleAccounts.forEach(account => {
      const row = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = account.name + ' · ' + account.accountId;
      row.append(label);
      const href = googleAdsAccountAssetsHref(account.accountId);
      if (href) {
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Abrir recursos ↗';
        link.setAttribute('aria-label', 'Abrir recursos de imagem de ' + account.name + ' · ' + account.accountId);
        row.append(link);
      }
      accountList.append(row);
    });
    const label = document.createElement('label');
    label.className = 'google-ads-image-upload-confirmation';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = imageUploadConfirmationMatchesCurrentAccounts();
    checkbox.disabled = busy || campaignActivationBatchApplying;
    const checkboxText = document.createElement('span');
    checkboxText.textContent = 'Já confirmei o envio dos recursos de imagem em todas as contas compatíveis listadas acima.';
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
    const status = document.createElement('p');
    const isConfirmed = imageUploadConfirmationMatchesCurrentAccounts();
    status.className = 'google-ads-campaign-image-upload-status ' + (isConfirmed ? 'is-success' : 'is-warning');
    status.textContent = isConfirmed
      ? 'Conferência salva neste lote.'
      : 'Pendente: confirme após enviar as imagens; somente a ativação em massa fica bloqueada.';
    panel.append(title, help, accountList, label, status);
    resultArea.append(panel);
  }

  function renderCampaignActivationBatch() {
    if ((!completed && !campaignBatchRestored) || !createdCampaigns.length) return;
    const pending = pendingCampaignActivations();
    const completedActivations = createdCampaigns.filter(campaign => campaign.activationResult?.verified === true
      && campaign.status === 'ENABLED');
    const changed = completedActivations.filter(campaign => campaign.activationResult.changed === true).length;
    const alreadyEnabled = createdCampaigns.filter(campaign => campaign.status === 'ENABLED'
      && campaign.activationResult?.changed !== true).length;
    const failed = createdCampaigns.filter(campaign => Boolean(campaign.activationError)).length;
    const attempted = completedActivations.length > 0 || failed > 0;
    const imageUploadPending = imageEligibleAccountsForCreatedBatch().length > 0 && !imageUploadConfirmationMatchesCurrentAccounts();
    const panel = document.createElement('section');
    panel.className = 'google-ads-audience-exclusions-batch google-ads-campaign-activation-batch';
    const title = document.createElement('h4');
    title.textContent = 'Ativação em massa';
    const help = document.createElement('p');
    help.textContent = 'Ativa as campanhas pausadas deste lote, uma por vez. Exclusões e segmentação são opcionais: campanhas sem essas ações também podem ser ativadas. O servidor confere o status atual antes de cada alteração.';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn primary google-ads-audience-batch-apply';
    button.textContent = campaignActivationBatchApplying
      ? 'Ativando lote (' + (campaignActivationBatchProgress?.processed || 0) + '/' + (campaignActivationBatchProgress?.total || 1) + ' concluídas)…'
      : pending.length
        ? failed ? 'Tentar ativar ' + pending.length + ' pendentes' : 'Ativar ' + pending.length + ' campanhas do lote'
        : 'Todas as campanhas do lote já estão ativas';
    button.disabled = busy || campaignActivationBatchApplying || pending.length === 0 || imageUploadPending;
    button.addEventListener('click', () => { void activateCampaignsBatch(); });
    panel.append(title, help, button);
    if (imageUploadPending) {
      const reminder = document.createElement('p');
      reminder.className = 'google-ads-campaign-image-upload-status is-warning';
      reminder.textContent = 'Envie as imagens nas contas compatíveis e marque a confirmação acima para liberar a ativação em massa.';
      panel.append(reminder);
    }

    if (campaignActivationBatchApplying && campaignActivationBatchProgress) {
      const progress = document.createElement('p');
      const current = createdCampaigns.find(item => campaignOperationKey(item) === campaignActivationBatchProgress.currentCampaignKey);
      progress.className = 'google-ads-audience-batch-progress';
      progress.textContent = current
        ? 'Ativando ' + (campaignActivationBatchProgress.processed + 1) + ' de ' + campaignActivationBatchProgress.total
          + ': ' + current.campaignName + ' · ' + (current.accountName || current.customerId) + '.'
        : campaignActivationBatchProgress.processed + ' de ' + campaignActivationBatchProgress.total + ' concluídas. Preparando a próxima solicitação.';
      panel.append(progress);
    }

    if (attempted) {
      const total = document.createElement('p');
      total.className = 'google-ads-audience-batch-total';
      total.textContent = 'Resumo: ' + completedActivations.length + '/' + createdCampaigns.length + ' ativações confirmadas · '
        + changed + ' alteradas agora · ' + alreadyEnabled + ' já estavam ativas · ' + pending.length
        + ' pendentes' + (failed ? ' (' + failed + ' com falha)' : '') + '.';
      panel.append(total);
      const list = document.createElement('ul');
      list.className = 'google-ads-audience-batch-list';
      createdCampaigns.forEach(campaign => {
        const row = document.createElement('li');
        const label = document.createElement('strong');
        label.textContent = campaign.campaignName + ' · ' + (campaign.accountName || campaign.customerId);
        const detail = document.createElement('span');
        const isCurrent = campaignActivationBatchApplying
          && campaignOperationKey(campaign) === campaignActivationBatchProgress?.currentCampaignKey;
        if (isCurrent) detail.textContent = 'Ativando agora…';
        else if (campaign.activationError) {
          detail.textContent = 'Falha: ' + campaign.activationError;
          detail.className = 'is-error';
        } else if (campaign.activationResult?.verified === true) {
          detail.textContent = campaign.activationResult.changed
            ? 'Ativada e confirmada pelo servidor.'
            : 'Já estava ativa; nenhuma alteração foi necessária.';
          detail.className = 'is-success';
        } else if (campaign.status === 'ENABLED') {
          detail.textContent = 'Já ativa na última consulta; nenhuma alteração enviada.';
          detail.className = 'is-success';
        } else if (campaign.status === 'PAUSED') detail.textContent = 'Pausada · aguardando ativação.';
        else detail.textContent = 'Status local desconhecido · o servidor verificará antes de alterar.';
        row.append(label, detail);
        list.append(row);
      });
      panel.append(list);
    }
    resultArea.append(panel);
  }

  async function activateCampaignsBatch() {
    if (busy || campaignActivationBatchApplying) return;
    if (imageEligibleAccountsForCreatedBatch().length > 0 && !imageUploadConfirmationMatchesCurrentAccounts()) {
      setStatus('A ativação em massa está bloqueada até você enviar as imagens e confirmar a etapa obrigatória deste lote.', true);
      return;
    }
    const pending = pendingCampaignActivations();
    if (!pending.length) return;
    saveAudienceStateForCurrentCampaign();
    const accounts = new Set(pending.map(campaign => campaign.customerId));
    const excluded = createdCampaigns.filter(campaign =>
      audienceExclusionsStateForCampaign(campaign).audienceExclusionsResult?.verified === true).length;
    const names = pending.map(campaign => '• ' + campaign.campaignName + ' · ' + (campaign.accountName || campaign.customerId)).join('\n');
    const confirmed = globalThis.confirm('Ativar ' + pending.length + ' campanha(s) pausada(s) ou com status local ainda não confirmado, distribuídas em ' + accounts.size + ' conta(s)?\n\n'
      + 'O Hub enviará uma solicitação por campanha em sequência e o servidor verificará o status atual antes de cada alteração. Se alguma falhar, as demais continuarão.\n\n'
      + 'Campanhas ativadas podem voltar a veicular e gerar custos conforme orçamento, revisão e elegibilidade do Google Ads.\n\n'
      + 'A segmentação positiva é preparada por CSV e não é aplicada pelo Hub. Exclusões confirmadas: ' + excluded + '/' + createdCampaigns.length + '. Essas etapas são opcionais e não bloqueiam a ativação.\n\n'
      + names);
    if (!confirmed) return;

    if (!activeCampaignBatchId) {
      activeCampaignBatchId = createCampaignBatchId();
      activeCampaignBatchCreatedAt = new Date().toISOString();
    }
    if (!saveActiveCampaignBatch()) {
      setStatus('Não foi possível salvar o lote neste navegador. Nenhuma ativação foi enviada.', true);
      return;
    }

    campaignActivationBatchApplying = true;
    campaignActivationBatchProgress = { processed: 0, total: pending.length, currentCampaignKey: '' };
    busy = true;
    renderCampaignResult();
    updateControlState();
    let processed = 0;
    let stoppedForStorage = false;
    try {
      for (let index = 0; index < pending.length; index += 1) {
        const campaign = pending[index];
        campaignActivationBatchProgress = { processed: index, total: pending.length, currentCampaignKey: campaignOperationKey(campaign) };
        campaign.activationError = '';
        setStatus('Ativando campanha ' + (index + 1) + ' de ' + pending.length + ': ' + campaign.campaignName + ' · ' + (campaign.accountName || campaign.customerId) + '…');
        renderCampaignResult();
        try {
          const result = await changeGoogleAdsCampaignStatus({
            managerCustomerId: campaign.managerCustomerId,
            customerId: campaign.customerId,
            campaignId: campaign.campaignId,
            operation: 'enable_campaign',
          });
          campaign.status = 'ENABLED';
          campaign.activationResult = {
            verified: true,
            changed: result.changed,
            status: result.status,
            verifiedAtUtc: result.verifiedAtUtc,
          };
          campaign.activationError = '';
        } catch (error) {
          campaign.status = '';
          campaign.activationResult = null;
          campaign.activationError = error?.message || 'O servidor não confirmou a ativação. Verifique esta campanha antes de repetir.';
        }
        processed = index + 1;
        campaignActivationBatchProgress = { processed, total: pending.length, currentCampaignKey: '' };
        if (!saveActiveCampaignBatch()) {
          stoppedForStorage = true;
          break;
        }
        renderCampaignResult();
      }
      const confirmedCount = createdCampaigns.filter(campaign => campaign.activationResult?.verified === true
        && campaign.status === 'ENABLED').length;
      const failedCount = createdCampaigns.filter(campaign => Boolean(campaign.activationError)).length;
      const pendingCount = pendingCampaignActivations().length;
      setStatus(stoppedForStorage
        ? 'Ativação interrompida após ' + processed + ' solicitação(ões), porque o Hub não conseguiu salvar o resultado do lote. Confira o status no Google Ads antes de continuar.'
        : 'Ativação do lote concluída: ' + confirmedCount + ' confirmada(s) · ' + pendingCount + ' pendente(s)' + (failedCount ? ' · ' + failedCount + ' com falha' : '') + '.',
      stoppedForStorage || failedCount > 0);
    } finally {
      campaignActivationBatchApplying = false;
      campaignActivationBatchProgress = null;
      busy = false;
      saveActiveCampaignBatch();
      renderCampaignResult();
      updateControlState();
    }
  }

  function campaignSitelinksSignature() {
    return JSON.stringify(activeCampaignBatchSitelinks.map(link => ({
      title: link.title, description1: link.description1, description2: link.description2, anchor: link.anchor,
    })));
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
    const source = Array.isArray(parsedCopy?.sitelinks) ? parsedCopy.sitelinks : [];
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
        anchor: index + 1,
      })),
    };
  }

  function pendingCampaignSitelinks() {
    const signature = campaignSitelinksSignature();
    return createdCampaigns.filter(campaign => campaign.sitelinksResult?.verified !== true
      || campaign.sitelinksResult.signature !== signature);
  }

  function renderCampaignSitelinksBatch() {
    if ((!completed && !campaignBatchRestored) || !activeCampaignBatchId || !createdCampaigns.length) return;
    const pending = pendingCampaignSitelinks();
    const signature = campaignSitelinksSignature();
    const confirmed = createdCampaigns.filter(campaign => campaign.sitelinksResult?.verified === true
      && campaign.sitelinksResult.signature === signature);
    const failed = createdCampaigns.filter(campaign => campaign.sitelinksError
      && campaign.sitelinksResult?.signature !== signature).length;
    const panel = document.createElement('section');
    panel.className = 'google-ads-audience-exclusions-batch google-ads-campaign-sitelinks-batch';
    const title = document.createElement('h4');
    title.textContent = 'Sitelinks deste lote';
    const help = document.createElement('p');
    help.textContent = 'Aplique até 6 sitelinks da copy a todas as campanhas salvas neste lote. O destino usa a URL final de cada campanha sem a barra terminal, seguida da seção #1 a #6 (ex.: https://getdentabiome.travenzo.shop#1). As duas descrições são opcionais, mas devem ser preenchidas juntas. O Hub consulta os recursos atuais, grava o que faltar e confirma o resultado; campanhas ativas também podem ser alteradas.';
    const controls = document.createElement('div');
    controls.className = 'google-ads-campaign-sitelinks-controls';
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'btn';
    choose.textContent = activeCampaignBatchSitelinks.length ? 'Editar sitelinks do lote' : 'Selecionar sitelinks da copy';
    choose.disabled = busy || campaignSitelinksBatchApplying;
    choose.addEventListener('click', () => { void openCopyImportDialog('batch-sitelinks'); });
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn primary';
    apply.textContent = campaignSitelinksBatchApplying
      ? 'Aplicando sitelinks (' + (campaignSitelinksBatchProgress?.processed || 0) + '/' + (campaignSitelinksBatchProgress?.total || 1) + ')…'
      : pending.length
        ? failed ? 'Tentar novamente nos ' + pending.length + ' pendentes' : 'Aplicar a ' + pending.length + ' campanhas do lote'
        : 'Sitelinks confirmados em todas as campanhas';
    apply.disabled = busy || campaignSitelinksBatchApplying || activeCampaignBatchSitelinks.length === 0 || pending.length === 0;
    apply.addEventListener('click', () => { void applyCampaignSitelinksBatch(); });
    controls.append(choose, apply);
    panel.append(title, help, controls);

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
      summary.textContent = confirmed.length + '/' + createdCampaigns.length + ' campanhas com sitelinks confirmados · '
        + pending.length + ' pendentes' + (failed ? ' (' + failed + ' com falha)' : '') + '.';
      panel.append(summary);
    } else {
      const empty = document.createElement('p');
      empty.textContent = 'Nenhum sitelink foi salvo neste lote. Importe a copy para escolher até 6 links.';
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
      panel.append(list);
    }
    resultArea.append(panel);
  }

  async function applyCampaignSitelinksBatch() {
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
    if (!createdCampaigns.length) return null;
    const panel = document.createElement('section');
    panel.className = 'google-ads-audience-exclusions-batch google-ads-audience-exclusion-export';
    const heading = document.createElement('h4');
    heading.textContent = 'Planilha Excel de exclusões';
    const help = document.createElement('p');
    help.textContent = 'Baixe um único arquivo por MCC, reunindo campanhas de todas as contas do lote e 13 exclusões no nível Campaign por campanha pendente. Campanhas com todas as 13 exclusões confirmadas pelo Hub são omitidas. Baixar não altera campanhas nem consulta a Google Ads API.';
    panel.append(heading, help);

    audienceExclusionUploadGroups().forEach(group => {
      const row = document.createElement('div');
      row.className = 'google-ads-audience-exclusion-export-row';
      const details = document.createElement('div');
      details.className = 'google-ads-audience-exclusion-export-details';
      const manager = document.createElement('strong');
      manager.textContent = managerMccLabel(group.managerCustomerId);
      const count = document.createElement('span');
      count.textContent = group.accountCount + ' conta(s) · ' + group.pendingCampaigns.length + ' campanha(s) no arquivo · '
        + (group.pendingCampaigns.length * 13) + ' critérios · ' + group.confirmedCampaignCount + ' campanha(s) já confirmada(s) ignorada(s)';
      details.append(manager, count);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn primary';
      const isExporting = audienceExclusionExportingManagerIds.has(group.key);
      button.textContent = isExporting ? 'Gerando Excel…' : 'Baixar Excel';
      button.disabled = busy || isExporting || !group.ready || !isTokenReady();
      button.addEventListener('click', () => { void downloadAudienceExclusionWorkbook(group); });
      row.append(details, button);
      panel.append(row);

      if (group.pendingCampaigns.length > 0 && (!group.configurationReady || !isTokenReady())) {
        const unavailable = document.createElement('p');
        unavailable.className = 'google-ads-audience-exclusion-export-status is-error';
        unavailable.textContent = !isTokenReady()
          ? 'Configure o token compartilhado do Hub para pedir o catálogo de exclusões ao serviço privado.'
          : 'Não foi possível reunir as campanhas deste MCC: confira os IDs da MCC, das contas e das campanhas.';
        panel.append(unavailable);
      }
      if (group.pendingCampaigns.length === 0) {
        const complete = document.createElement('p');
        complete.className = 'google-ads-audience-exclusion-export-status is-success';
        complete.textContent = 'Todas as campanhas deste MCC já têm as 13 exclusões confirmadas pelo Hub; não há arquivo pendente.';
        panel.append(complete);
      }
      const status = audienceExclusionExportStatusByManager.get(group.key);
      if (status?.text) {
        const message = document.createElement('p');
        message.className = 'google-ads-audience-exclusion-export-status' + (status.error ? ' is-error' : ' is-success');
        message.textContent = status.text;
        panel.append(message);
      }
    });
    const note = document.createElement('p');
    note.className = 'google-ads-audience-exclusion-export-note';
    note.textContent = 'A configuração atual identifica 9 públicos por ID e 4 por nome. Só campanhas com as 13 exclusões confirmadas pelo Hub são omitidas; alterações manuais feitas diretamente no Google Ads não são detectadas.';
    panel.append(note);
    return panel;
  }

  async function downloadAudienceExclusionWorkbook(group) {
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
    const help = document.createElement('p');
    help.textContent = 'Gera um arquivo por MCC usando os IDs deste lote e o modelo Apply Audience(s). Cada grupo recebe os 918 públicos positivos; nenhum ID antigo da planilha de origem é reaproveitado.';
    const targetingWarning = document.createElement('p');
    targetingWarning.className = 'google-ads-audience-targeting-csv-warning';
    targetingWarning.textContent = 'Depois de importar, abra os públicos de cada grupo e selecione “Segmentação” (Targeting), não “Observação”. Em campanhas Search, novos públicos assumem Observação por padrão; o CSV não consegue mudar esse modo.';
    panel.append(help, targetingWarning);

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
      row.append(details, button);
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

  function renderCampaignResult() {
    renderConfiguredAudienceTargeting();
    if (!createdCampaigns.length && !batchEntries.length) { resultArea.hidden = true; return; }
    resultArea.replaceChildren();
    const heading = document.createElement('h3');
    const isOnlyPreview = batchEntries.length > 0 && batchEntries.every(entry => ['previewed', 'existing', 'preview_failed', 'pending'].includes(entry.state));
    heading.textContent = isOnlyPreview ? 'Verificação das campanhas'
      : batchEntries.length > 1 ? 'Resultado da criação em lote'
      : createdCampaigns.length > 1 ? 'Lote de campanhas salvo'
        : 'Resultado da criação';
    resultArea.append(heading);
    renderCampaignImageUploadChecklist();
    if (batchEntries.length) {
      const list = document.createElement('ul');
      list.className = 'google-ads-cpa-batch-results';
      batchEntries.forEach((entry, index) => {
        const item = document.createElement('li');
        const label = document.createElement('strong');
        label.textContent = 'Campanha ' + String(index + 1).padStart(2, '0') + ' · ' + entry.percent + '% · ' + entry.accountName + ' · ' + entry.payload.campaignName;
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
        else if (entry.state === 'previewed') detail.textContent = 'Nome livre na conta · validateOnly aprovado · ainda não criada';
        else if (entry.state === 'created') detail.textContent = 'Criada e confirmada · ID ' + entry.result.campaignId + ' · status ' + (entry.result.status || 'PAUSED');
        else if (entry.state === 'failed') detail.textContent = 'Falha confirmada · ' + entry.errorMessage;
        else if (entry.state === 'uncertain') detail.textContent = 'Confirmação incerta · confira esta conta no Google Ads antes de repetir. ' + entry.errorMessage;
        else if (entry.state === 'creating') detail.textContent = 'Enviando solicitação…';
        else detail.textContent = 'Aguardando tentativa de criação.';
        item.append(label, detail);
        list.append(item);
      });
      resultArea.append(list);
    }
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
      warning.className = 'is-error';
      warning.textContent = 'Campanhas com confirmação incerta não serão repetidas automaticamente para evitar duplicidade. Confira esses nomes na conta antes de qualquer nova tentativa.';
      resultArea.append(warning);
    }
    if (createdCampaigns.length > 0) {
      const pendingCampaigns = pendingAudienceExclusionCampaigns();
      const eligibleExclusionCampaigns = createdCampaigns.filter(campaignSupportsAudienceExclusions);
      const batchPanel = document.createElement('section');
      batchPanel.className = 'google-ads-audience-exclusions-batch';
      const batchTitle = document.createElement('h4');
      batchTitle.textContent = 'Exclusões para campanhas compatíveis';
      const batchHelp = document.createElement('p');
      batchHelp.textContent = 'Só entram campanhas Search pausadas com configuração de público compatível. O Hub processa uma por vez; as já confirmadas são puladas e uma nova tentativa inclui somente as pendentes.';
      const batchButton = document.createElement('button');
      batchButton.type = 'button';
      batchButton.className = 'btn primary google-ads-audience-batch-apply';
      batchButton.textContent = audienceExclusionsBatchApplying
        ? 'Aplicando exclusões em lote (' + (audienceExclusionsBatchProgress?.processed || 0) + '/' + (audienceExclusionsBatchProgress?.total || 1) + ' concluídas)…'
        : pendingCampaigns.length
          ? audienceExclusionsBatchAttempted
            ? 'Aplicar exclusões nas ' + pendingCampaigns.length + ' pendentes'
            : 'Aplicar exclusões em lote (' + pendingCampaigns.length + ' campanhas)'
          : eligibleExclusionCampaigns.length
            ? 'Exclusões confirmadas em todas as campanhas compatíveis'
            : 'Nenhuma campanha compatível para exclusões';
      batchButton.disabled = busy || audienceExclusionsBatchApplying || pendingCampaigns.length === 0;
      batchButton.addEventListener('click', () => { void applyAudienceExclusionsBatch(); });
      batchPanel.append(batchTitle, batchHelp, batchButton);

      if (audienceExclusionsBatchApplying && audienceExclusionsBatchProgress) {
        const progress = document.createElement('p');
        const current = createdCampaigns.find(item => campaignOperationKey(item) === audienceExclusionsBatchProgress.currentCampaignKey);
        progress.className = 'google-ads-audience-batch-progress';
        progress.textContent = current
          ? 'Processando ' + (audienceExclusionsBatchProgress.processed + 1) + ' de ' + audienceExclusionsBatchProgress.total
            + ': ' + current.campaignName + ' · ' + (current.accountName || current.customerId) + '. A campanha permanece pausada.'
          : audienceExclusionsBatchProgress.processed + ' de ' + audienceExclusionsBatchProgress.total + ' concluídas. Preparando a próxima solicitação.';
        batchPanel.append(progress);
      }

      if (audienceExclusionsBatchAttempted) {
        const states = eligibleExclusionCampaigns.map(campaign => ({ campaign, ...audienceExclusionsStateForCampaign(campaign) }));
        const confirmedCount = states.filter(item => item.audienceExclusionsResult?.verified === true).length;
        const failedCount = states.filter(item => item.audienceExclusionsError).length;
        const pendingCount = states.length - confirmedCount;
        const total = document.createElement('p');
        total.className = 'google-ads-audience-batch-total';
        total.textContent = 'Resumo: ' + confirmedCount + '/' + states.length + ' confirmadas · ' + pendingCount + ' pendentes (' + failedCount + ' com falha técnica).';
        batchPanel.append(total);
        const batchList = document.createElement('ul');
        batchList.className = 'google-ads-audience-batch-list';
        states.forEach(item => {
          const row = document.createElement('li');
          const label = document.createElement('strong');
          label.textContent = item.campaign.campaignName + ' · ' + (item.campaign.accountName || item.campaign.customerId);
          const detail = document.createElement('span');
          const isCurrent = audienceExclusionsBatchApplying
            && campaignOperationKey(item.campaign) === audienceExclusionsBatchProgress?.currentCampaignKey;
          if (isCurrent) detail.textContent = 'Aplicando agora…';
          else if (item.audienceExclusionsError) {
            detail.textContent = 'Falha: ' + item.audienceExclusionsError;
            detail.className = 'is-error';
          } else if (item.audienceExclusionsResult?.verified) {
            detail.textContent = 'Confirmadas ' + item.audienceExclusionsResult.verifiedCount + '/' + item.audienceExclusionsResult.submittedCount
              + ' · novas ' + item.audienceExclusionsResult.addedCount + ' · já ativas ' + item.audienceExclusionsResult.alreadyPresentCount + '.';
            detail.className = 'is-success';
          } else if (item.audienceExclusionsResult) {
            detail.textContent = 'Resposta recebida, mas com pendências: ' + item.audienceExclusionsResult.verifiedCount
              + '/' + item.audienceExclusionsResult.submittedCount + ' confirmadas · falhas ' + item.audienceExclusionsResult.failedCount + '.';
          } else detail.textContent = 'Pendente.';
          row.append(label, detail);
          batchList.append(row);
        });
        batchPanel.append(batchList);
      }
      resultArea.append(batchPanel);
    }
    const exclusionWorkbookPanel = renderAudienceExclusionUploadPanel();
    if (exclusionWorkbookPanel) resultArea.append(exclusionWorkbookPanel);
    renderCampaignSitelinksBatch();
    if (!createdCampaigns.length) { resultArea.hidden = false; return; }
    renderCampaignActivationBatch();
    resultArea.hidden = false;
  }

  async function applyAudienceExclusionsBatch() {
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

  async function fingerprintCampaignPayloads(payloads) {
    const cryptoProvider = globalThis.crypto;
    if (!cryptoProvider?.subtle?.digest || typeof TextEncoder !== 'function') return '';
    const data = new TextEncoder().encode(JSON.stringify(payloads));
    const digest = await cryptoProvider.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function storedPreviewEntries(entries = batchEntries) {
    return entries.map(entry => {
      const existing = entry.state === 'existing';
      const result = entry.previewResult || {};
      return {
        managerCustomerId: String(entry.payload.managerCustomerId || ''),
        customerId: String(entry.payload.customerId || ''),
        campaignName: String(entry.payload.campaignName || ''),
        accountName: String(entry.accountName || ''),
        percent: String(entry.percent ?? ''),
        previewResult: existing ? {
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
        },
      };
    });
  }

  async function restoreSavedPreview(draftId) {
    if (!draftId || activeDraftId !== draftId || completed || uncertain || busy) return false;
    let previews;
    try { previews = listGoogleAdsCampaignPreviews({ draftId }); }
    catch (error) {
      setStatus(error.message || 'Não foi possível ler a prévia salva neste navegador.', true);
      return false;
    }
    let entries;
    try { entries = buildCampaignBatchEntries(); }
    catch {
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
    const reusable = currentFingerprint ? previews.find(preview => {
      if (preview.batchId || !preview.payloadFingerprint || preview.payloadFingerprint !== currentFingerprint
          || preview.entries.length !== currentEntries.length) return false;
      return preview.entries.every((saved, index) => saved.managerCustomerId === currentEntries[index]?.payload.managerCustomerId
        && saved.customerId === currentEntries[index]?.payload.customerId
        && saved.campaignName === currentEntries[index]?.payload.campaignName
        && saved.percent === String(currentEntries[index]?.percent ?? ''));
    }) : null;
    if (!reusable) {
      if (previews.length) setStatus('Não há prévia salva para esta combinação exata de campos, contas e sequência. Clique em “Validar prévia” para consultar a API.', false, false, true);
      return false;
    }
    if (reusable.invalidatedAt) {
      try {
        saveGoogleAdsCampaignPreview({ ...reusable, invalidatedAt: '' });
      } catch (error) {
        setStatus(error.message || 'Não foi possível reativar a prévia correspondente salva neste navegador.', true);
        return false;
      }
    }
    batchEntries = currentEntries.map((entry, index) => ({
      ...entry,
      state: reusable.entries[index].previewResult.resultType === 'existing' ? 'existing' : 'previewed',
      previewResult: reusable.entries[index].previewResult.resultType === 'existing' ? {
        campaign_name: reusable.entries[index].previewResult.campaignName,
        campaign_id: reusable.entries[index].previewResult.campaignId,
        campaign_status: reusable.entries[index].previewResult.campaignStatus,
        campaign_channel_type: reusable.entries[index].previewResult.channelType,
        audience_grouped: reusable.entries[index].previewResult.audienceGrouped,
        ad_group_id: reusable.entries[index].previewResult.adGroupId,
        ad_group_status: reusable.entries[index].previewResult.adGroupStatus,
        ad_group_count: reusable.entries[index].previewResult.adGroupCount,
      } : {
        campaign_name: reusable.entries[index].previewResult.campaignName,
        account_currency: reusable.entries[index].previewResult.accountCurrency,
        daily_budget_micros: reusable.entries[index].previewResult.dailyBudgetMicros,
        target_cpa_micros: reusable.entries[index].previewResult.targetCpaMicros,
      },
      result: null,
      errorMessage: '',
      diagnostic: null,
    }));
    syncPreviewExistingCampaignTargets();
    previewId = reusable.id;
    previewFingerprint = reusable.payloadFingerprint;
    previewValidatedAt = reusable.validatedAt;
    renderBatchPreview();
    setStatus('Prévia recuperada do navegador · consultada em ' + localDateLabel(previewValidatedAt) + '. Nenhuma chamada nova foi feita. Ela só é reutilizada para estes mesmos campos, contas e nomes; o servidor revalida antes de criar ou alterar públicos.', false);
    renderCampaignResult();
    return true;
  }

  function localDateLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'data desconhecida';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
  }

  function labelForDraft(draft) {
    const name = String(draft.values?.campaign_name || '').trim();
    return name || ('Análise · ' + localDateLabel(draft.createdAt));
  }

  function newestDraft(drafts = draftStore.drafts) {
    return [...drafts].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] || null;
  }

  function newestCampaignBatch(batches = campaignBatchStore.batches) {
    return [...batches].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] || null;
  }

  function refreshDraftPicker() {
    if (!draftPicker) return;
    draftPicker.replaceChildren();
    const draftsGroup = document.createElement('optgroup');
    draftsGroup.label = 'Rascunhos · formulário';
    if (!activeDraftId) {
      const current = document.createElement('option');
      current.value = 'draft:__new__';
      current.textContent = 'Rascunho em branco · ainda não salvo';
      draftsGroup.append(current);
    }
    const drafts = [...draftStore.drafts].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    drafts.forEach(draft => {
      const option = document.createElement('option');
      option.value = 'draft:' + draft.id;
      option.textContent = 'Rascunho · ' + labelForDraft(draft)
        + (draft.id === activeDraftId && !activeCampaignBatchId ? ' · aberto' : '');
      draftsGroup.append(option);
    });
    draftPicker.append(draftsGroup);
    const batches = [...campaignBatchStore.batches]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    if (batches.length) {
      const batchesGroup = document.createElement('optgroup');
      batchesGroup.label = 'Lotes · campanhas já criadas ou associadas';
      batches.forEach(batch => {
        const option = document.createElement('option');
        option.value = 'batch:' + batch.id;
        option.textContent = 'Lote · ' + labelForCampaignBatch(batch)
          + (batch.id === activeCampaignBatchId ? ' · aberto' : '');
        batchesGroup.append(option);
      });
      draftPicker.append(batchesGroup);
    }
    draftPicker.value = activeCampaignBatchId
      ? 'batch:' + activeCampaignBatchId
      : activeDraftId ? 'draft:' + activeDraftId : 'draft:__new__';
    draftPicker.disabled = busy;
    const selectedDraftId = draftPicker.value.startsWith('draft:') ? draftPicker.value.slice('draft:'.length) : '';
    const selectedDraft = selectedDraftId && selectedDraftId !== '__new__'
      ? draftStore.drafts.find(draft => draft.id === selectedDraftId)
      : null;
    deleteDraftButton.hidden = !selectedDraft;
    deleteDraftButton.disabled = busy;
    deleteDraftButton.title = selectedDraft
      ? 'Excluir rascunho: ' + labelForDraft(selectedDraft)
      : 'Excluir rascunho selecionado';
    deleteDraftButton.setAttribute('aria-label', selectedDraft
      ? 'Excluir rascunho ' + labelForDraft(selectedDraft)
      : 'Excluir rascunho selecionado');
  }

  function setCampaignBatchStatus(message, isError = false) {
    campaignBatchStatus.textContent = message;
    campaignBatchStatus.classList.toggle('is-error', isError);
    campaignBatchStatus.classList.toggle('is-success', !isError && Boolean(message));
  }

  function labelForCampaignBatch(batch) {
    const firstName = batch.campaigns[0]?.campaignName || 'Campanhas';
    return localDateLabel(batch.createdAt) + ' · ' + batch.campaigns.length + ' campanha(s)'
      + (batch.source === 'associated' ? ' · associado' : '') + ' · ' + firstName.slice(0, 58);
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
    const accountLabels = [...new Set(selected.map(item => item.accountName || item.customerId))];
    if (!globalThis.confirm('Associar ' + selected.length + ' campanha(s) existentes de “' + campaignAssociationProduct.value.trim()
      + '” em ' + accountLabels.length + ' conta(s)? O Hub fará uma conferência de leitura por conta e salvará um novo lote neste navegador. Nenhuma campanha será criada ou alterada.')) return;
    if (!saveDraftNow()) {
      setCampaignAssociationStatus('Não foi possível salvar a análise atual. O lote não foi associado.', true);
      return;
    }
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
        verified.forEach(item => verifiedCampaigns.push({
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
          source: 'existing',
        }));
      }
      if (verifiedCampaigns.length !== selected.length) throw new Error('A conferência não cobriu todas as campanhas selecionadas. Nenhum lote foi salvo.');
      const now = new Date().toISOString();
      const firstKey = verifiedCampaigns[0].customerId + ':' + verifiedCampaigns[0].campaignId;
      const batchId = createCampaignBatchId();
      campaignBatchStore = saveGoogleAdsCampaignBatch({
        id: batchId,
        label: 'Campanhas associadas · ' + campaignAssociationProduct.value.trim(),
        source: 'associated',
        draftId: '',
        previewId: '',
        createdAt: now,
        updatedAt: now,
        selectedCampaignKey: firstKey,
        sitelinks: [],
        imageUploadConfirmed: false,
        imageUploadConfirmedAccountIds: [],
        campaigns: verifiedCampaigns,
      });
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
  }

  function saveActiveCampaignBatch(campaigns = createdCampaigns) {
    if (!activeCampaignBatchId || !Array.isArray(campaigns) || !campaigns.length) return true;
    const now = new Date().toISOString();
    const existing = campaignBatchStore.batches.find(batch => batch.id === activeCampaignBatchId);
    const campaignRecords = campaigns.map(campaign => {
      const key = campaignOperationKey(campaign);
      const state = key === campaignOperationKey(createdCampaign)
        ? { audienceTargetingResult, audienceTargetingError, audienceExclusionsResult, audienceExclusionsError }
        : audienceStateByCampaign.get(key) || {};
      return {
        managerCustomerId: campaign.managerCustomerId,
        customerId: campaign.customerId,
        campaignId: campaign.campaignId,
        adGroupId: campaign.adGroupId || '',
        campaignName: campaign.campaignName,
        accountName: campaign.accountName || '',
        status: campaign.status || '',
        campaignChannelType: campaign.campaignChannelType || '',
        audienceGrouped: typeof campaign.audienceGrouped === 'boolean' ? campaign.audienceGrouped : null,
        adGroupStatus: campaign.adGroupStatus || '',
        source: campaign.source || '',
        audienceTargetingResult: state.audienceTargetingResult || null,
        audienceTargetingError: state.audienceTargetingError || '',
        audienceExclusionsResult: state.audienceExclusionsResult || null,
        audienceExclusionsError: state.audienceExclusionsError || '',
        activationResult: campaign.activationResult || null,
        activationError: campaign.activationError || '',
        sitelinksResult: campaign.sitelinksResult || null,
        sitelinksError: campaign.sitelinksError || '',
      };
    });
    const selectedCampaignKey = campaigns.some(campaign => campaignOperationKey(campaign) === campaignOperationKey(createdCampaign))
      ? campaignOperationKey(createdCampaign)
      : campaignOperationKey(campaigns[0]);
    try {
      campaignBatchStore = saveGoogleAdsCampaignBatch({
        id: activeCampaignBatchId,
        label: campaignRecords.length + ' campanha(s) · ' + campaignRecords[0].campaignName,
        draftId: existing ? (existing.draftId || '') : (activeDraftId || ''),
        previewId: previewId || existing?.previewId || '',
        source: existing?.source || '',
        createdAt: existing?.createdAt || activeCampaignBatchCreatedAt || now,
        updatedAt: now,
        selectedCampaignKey,
        sitelinks: activeCampaignBatchSitelinks,
        imageUploadConfirmed,
        imageUploadConfirmedAccountIds,
        campaigns: campaignRecords,
      });
      campaignBatchStorageError = '';
      refreshCampaignBatchPicker();
      setCampaignBatchStatus('Lote salvo neste navegador · atualizado em ' + localDateLabel(now) + '.', false);
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
    activeCampaignBatchId = '';
    activeCampaignBatchCreatedAt = '';
    activeCampaignBatchSitelinks = [];
    imageUploadConfirmed = false;
    imageUploadConfirmedAccountIds = [];
    campaignSitelinksBatchAttempted = false;
    campaignSitelinksBatchProgress = null;
    campaignBatchRestored = false;
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
    resultArea.replaceChildren();
    resultArea.hidden = true;
    refreshCampaignBatchPicker();
    renderCampaignResult();
    updateControlState();
    setStatus('Lote fechado. O histórico continua salvo neste navegador e a análise atual pode ser editada.');
    setCampaignBatchStatus('Lote fechado · continua salvo neste navegador e pode ser reaberto pelo seletor.');
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
    const batch = campaignBatchStore.batches.find(item => item.id === batchId);
    if (!batch) {
      setCampaignBatchStatus('Esse lote não está mais disponível no armazenamento local.', true);
      refreshCampaignBatchPicker();
      return;
    }
    activeCampaignBatchId = batch.id;
    activeCampaignBatchCreatedAt = batch.createdAt;
    campaignBatchRestored = true;
    completed = true;
    uncertain = false;
    clearPreview({ preserveStoredPreview: true });
    let associatedDraftId = batch.draftId || '';
    if (!associatedDraftId && batch.previewId) {
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
    activeCampaignBatchSitelinks = Array.isArray(batch.sitelinks) ? batch.sitelinks.map(link => ({ ...link })) : [];
    imageUploadConfirmed = batch.imageUploadConfirmed === true;
    imageUploadConfirmedAccountIds = Array.isArray(batch.imageUploadConfirmedAccountIds)
      ? batch.imageUploadConfirmedAccountIds.filter(accountId => /^\d{10}$/.test(String(accountId)))
      : [];
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
    previewSnapshot = '';
    if (associatedDraft) {
      restoreDraft(associatedDraft);
      setDraftStatus('Lote aberto · o rascunho vinculado foi recuperado como referência; as campanhas existentes são o contexto ativo.');
    } else if (associatedDraftError) setDraftStatus('Lote aberto · ' + associatedDraftError, true);
    else if (batch.source === 'associated') setDraftStatus('Lote aberto · campanhas existentes sem rascunho vinculado. IDs, nomes e estados permanecem salvos neste navegador.');
    else if (associatedDraftId) setDraftStatus('Lote aberto · a análise associada não está mais salva neste navegador.', true);
    else setDraftStatus('Lote aberto · este lote antigo não tem rascunho associado. O lote e a prévia original permanecem disponíveis.', true);
    refreshCampaignBatchPicker();
    renderCampaignResult();
    updateControlState();
    setCampaignBatchStatus((batch.source === 'associated' ? 'Lote de campanhas existentes reaberto' : 'Lote reaberto do armazenamento local') + ' · '
      + batch.campaigns.length + ' campanha(s). Campanhas não serão recriadas; as ações disponíveis podem ser retomadas neste lote.', false);
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
      if (Object.hasOwn(values, name)) {
        if (!Array.isArray(values[name])) values[name] = [values[name]];
        values[name].push(control.value);
      } else values[name] = control.value;
    }
    values.__hub_discount_value_source = discountValueField.dataset.discountValueSource || '';
    values.__hub_cpa_variants = [...selectedCpaVariantPercents];
    values.__hub_final_url_source = finalUrlSource;
    values.__hub_final_url_auto_value = finalUrlAutoValue;
    values.__hub_promotion_target_source = promotionTargetSource;
    values.__hub_promotion_target_auto_value = promotionTargetAutoValue;
    values.__hub_sitelinks = pendingDraftSitelinks.map(link => ({ ...link }));
    return values;
  }

  function draftHasContent(values = collectDraftValues()) {
    const contentFields = new Set([
      'campaign_name', 'daily_budget', 'max_cpc_bid', 'geo_target_country_codes', 'keywords', 'negative_keywords', 'clickbank_offer_key',
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
      activeDraftId = id;
      saveGoogleAdsCampaignDrafts(draftStore);
      draftDirty = false;
      draftForce = false;
      refreshDraftPicker();
      setDraftStatus('Salvo neste navegador · ' + localDateLabel(now));
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
    pendingDraftSitelinks = normalizeDraftSitelinks(values.__hub_sitelinks);
    form.reset();
    for (const control of form.querySelectorAll('[name]')) control.setCustomValidity('');
    form.elements.namedItem('start_date').required = false;
    form.elements.namedItem('end_date').required = false;
    const savedManager = String(values.manager || '');
    managerSelect.value = [...managerSelect.options].some(option => option.value === savedManager) ? savedManager : '';
    const savedAccount = String(values.account || '');
    renderAccountOptions(savedAccount, { selectFirst: false });
    for (const [name, rawValue] of Object.entries(values)) {
      if (name === '__hub_discount_value_source' || name === '__hub_cpa_variants'
          || name === '__hub_final_url_source' || name === '__hub_final_url_auto_value'
          || name === '__hub_promotion_target_source' || name === '__hub_promotion_target_auto_value'
          || name === '__hub_sitelinks' || name === 'cpa_variant') continue;
      if (name === 'manager' || name === 'account') continue;
      const controls = [...form.querySelectorAll('[name]')].filter(control => control.name === name);
      if (!controls.length) continue;
      const savedValues = Array.isArray(rawValue) ? rawValue : [rawValue];
      controls.forEach((control, index) => {
        const value = savedValues[index] ?? (savedValues.length === 1 ? savedValues[0] : '');
        if (control.type === 'checkbox') control.checked = value === true;
        else if (name === 'clickbank_offer_key' && typeof value === 'string'
            && ![...control.options].some(option=>option.value===value)) pendingClickBankOfferKeyRestore=value;
        else if (typeof value === 'string') control.value = value;
      });
    }
    const dailyBudgetField = form.elements.namedItem('daily_budget');
    if (!dailyBudgetField.value.trim()) dailyBudgetField.value = '100';
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
    setDraftStatus(selectionError || (hasAccount
      ? 'Análise recuperada do armazenamento local deste navegador.'
      : 'Análise recuperada. A MCC ou conta salva não está na lista atual; atualize a lista para continuar.'), Boolean(selectionError) || !hasAccount);
    updateSelectionMessage();
    void restoreSavedPreview(draft.id);
    return true;
  }

  function resetForNewDraft() {
    restoringDraft = true;
    pendingDraftSitelinks = [];
    pendingClickBankOfferKeyRestore = '';
    finalUrlSource = '';
    finalUrlAutoValue = '';
    promotionTargetSource = '';
    promotionTargetAutoValue = '';
    form.reset();
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
    setDraftStatus('Nova análise em branco. A análise anterior continua salva neste navegador.');
    updateSelectionMessage();
  }

  function beginNewDraft() {
    if (busy || creating) return;
    if (!saveDraftNow()) return;
    if (activeCampaignBatchId) {
      saveAudienceStateForCurrentCampaign();
      if (!saveActiveCampaignBatch()) return;
    }
    try { persistActiveDraftSelection(''); }
    catch (error) { setDraftStatus(error.message || 'Não foi possível iniciar uma nova análise com segurança.', true); return; }
    activeDraftId = '';
    activeCampaignBatchId = '';
    activeCampaignBatchCreatedAt = '';
    imageUploadConfirmed = false;
    imageUploadConfirmedAccountIds = [];
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
    resetForNewDraft();
    renderCampaignResult();
    clearCopyImportSource();
    openCopyImportDialog('campaign', { restoreCache: false, allowClipboardRead: false });
  }

  function deleteSelectedDraft() {
    const selectedValue = draftPicker.value;
    if (!selectedValue.startsWith('draft:') || selectedValue === 'draft:__new__') return;
    const draftId = selectedValue.slice('draft:'.length);
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
    activeCampaignBatchCreatedAt = '';
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
    activeCampaignBatchCreatedAt = '';
    imageUploadConfirmed = false;
    imageUploadConfirmedAccountIds = [];
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
    renderCampaignResult();
  }

  function openSavedContext(value) {
    if (busy || creating) return;
    if (value === 'draft:__new__') {
      if (activeCampaignBatchId) clearActiveCampaignBatchView();
      else refreshDraftPicker();
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
    const hints = [...form.querySelectorAll('[data-creation-currency]')];
    if (currency) {
      hints[0].textContent = currency;
      hints[1].textContent = currency + ', para o grupo';
    } else {
      hints[0].textContent = 'moeda da conta';
      hints[1].textContent = 'moeda da conta, para o grupo';
    }
    page.querySelector('[data-bid-currency]').textContent = currency || 'moeda da conta';
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
    maxCpcLabelText.querySelector('small').textContent = strategy === 'MANUAL_CPC'
      ? currency + ', para o grupo'
      : (strategy === 'MAXIMIZE_CLICKS' ? 'limite opcional · ' : 'limite · ') + currency;
    const help = page.querySelector('[data-bidding-help]');
    const helpByStrategy = {
      TARGET_CPA: 'CPA desejado usa uma ação de conversão principal configurada na conta. O valor precisa estar na moeda da conta. A lista de estratégias é fixa e não consulta a API.',
      MAXIMIZE_CONVERSIONS: 'Maximizar conversões otimiza para ações de conversão configuradas na conta; o CPA desejado é opcional e precisa usar a moeda da conta. A lista é fixa e não consulta a API.',
      TARGET_ROAS: 'ROAS desejado otimiza para valor de conversão e requer conversões com valor. Informe o ROAS como percentual (200 = 2,0x).',
      MAXIMIZE_CONVERSION_VALUE: 'Maximizar valor da conversão depende de valores de conversão corretos na conta; o ROAS desejado é opcional.',
      MAXIMIZE_CLICKS: 'Maximizar cliques pode usar um limite opcional de CPC na moeda da conta.',
      TARGET_IMPRESSION_SHARE: 'Parcela de impressões exige local, percentual alvo e limite de CPC na moeda da conta.',
      MANUAL_CPC: 'CPC manual usa o limite informado por grupo. A lista de estratégias é fixa e não consulta a API.',
    };
    help.textContent = (helpByStrategy[strategy] || helpByStrategy.TARGET_CPA)
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

  function calculateCampaignNameDetails() {
    parsedCampaignName = parseGoogleAdsCampaignName(nameParseInput.value);
    nameParseDetails.replaceChildren();
    if (!parsedCampaignName.ok) {
      setCampaignNameParseStatus(parsedCampaignName.error, true);
      nameParseApplyButton.disabled = true;
      return;
    }
    const accountCurrency = String(referenceAccount()?.currencyCode || '').toUpperCase();
    const matchingCurrency = accountCurrency === parsedCampaignName.commissionCurrency;
    addCampaignNameDetail('Data no nome', parsedCampaignName.sourceDate + ' (informativa; não muda datas da promoção)');
    addCampaignNameDetail('Produto e iteração', parsedCampaignName.product + ' · ' + parsedCampaignName.iteration);
    addCampaignNameDetail('Plataforma', parsedCampaignName.platform + ' (' + parsedCampaignName.platformCode + ')');
    addCampaignNameDetail('Modelo de lance do nome', parsedCampaignName.biddingModel + ' (' + parsedCampaignName.biddingModelCode + ')');
    addCampaignNameDetail('GEOs', parsedCampaignName.countries.join(', '));
    if (parsedCampaignName.destination) addCampaignNameDetail('Destino marcado', parsedCampaignName.destination);
    else if (parsedCampaignName.extraTags.length) addCampaignNameDetail('Tags adicionais', parsedCampaignName.extraTags.join(', '));
    addCampaignNameDetail('Comissão e percentual', parsedCampaignName.commissionCurrency + ' ' + parsedCampaignName.commissionAmount + ' × ' + parsedCampaignName.targetCpaPercent + '%');
    addCampaignNameDetail('CPA calculado', formatMoneyMicros(Number(parsedCampaignName.desiredCpa) * 1_000_000, parsedCampaignName.commissionCurrency));
    addCampaignNameDetail('Moeda da conta', accountCurrency || 'Não identificada na lista local');
    if (matchingCurrency) {
      setCampaignNameParseStatus('O botão Aplicar preencherá o nome, os GEOs e o CPA desejado. Nenhum câmbio será aplicado. NBB/BB ficam como metadados do padrão e não mudam a estratégia selecionada no combo.');
    } else {
      setCampaignNameParseStatus('A moeda da comissão (' + parsedCampaignName.commissionCurrency + ') difere da moeda da conta (' + (accountCurrency || 'desconhecida') + '). O nome e os GEOs podem ser aplicados, mas o CPA calculado não será preenchido. Nenhuma conversão cambial será feita.', false, true);
    }
    nameParseApplyButton.disabled = false;
  }

  function openCampaignNameDialog() {
    nameParseInput.value = form.elements.namedItem('campaign_name').value.trim();
    calculateCampaignNameDetails();
    if (typeof nameParseDialog.showModal === 'function') nameParseDialog.showModal();
    else nameParseDialog.setAttribute('open', '');
    nameParseInput.focus();
  }

  function applyCampaignNameDetails() {
    if (!parsedCampaignName?.ok) return;
    const accountCurrency = String(referenceAccount()?.currencyCode || '').toUpperCase();
    const matchingCurrency = accountCurrency === parsedCampaignName.commissionCurrency;
    applyingCampaignNameParse = true;
    form.elements.namedItem('campaign_name').value = parsedCampaignName.campaignName;
    form.elements.namedItem('geo_target_country_codes').value = parsedCampaignName.countries.join(', ');
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
      source_target_cpa_amount: parsedCampaignName.desiredCpa,
    };
    for (const [name, value] of Object.entries(metadata)) form.elements.namedItem(name).value = value;
    derivedCpaCurrencyField.value = parsedCampaignName.commissionCurrency;
    if (matchingCurrency) {
      targetCpaField.value = parsedCampaignName.desiredCpa;
      targetCpaField.setCustomValidity('');
    }
    applyingCampaignNameParse = false;
    renderCpaVariantOptions();
    clearPreview();
    updateFinalUrlFromPreSell();
    updatePromotionTargetFromCampaign();
    scheduleDraftSave({ force: true });
    const statusMessage = matchingCurrency
      ? 'Informações calculadas e aplicadas. Confira o CPA e os GEOs, ajuste o restante e valide a prévia.'
      : 'Nome e GEOs aplicados. O CPA calculado foi guardado como metadado, mas não foi preenchido por divergência de moeda; o valor já digitado foi mantido.';
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
    newDraftButton.disabled = busy || creating;
    campaignAssociationOpenButton.disabled = busy || campaignAssociationBusy;
    fields.disabled = busy || !currentIds() || completed || uncertain;
    const existingBatchMode = campaignBatchRestored && Boolean(activeCampaignBatchId);
    previewButton.hidden = completed || uncertain || existingBatchMode;
    previewButton.disabled = busy || !currentIds() || completed || uncertain || existingBatchMode;
    if (existingBatchMode) {
      previewArea.hidden = true;
      createButton.hidden = true;
      if (/prévia/i.test(status.textContent + ' ' + bottomStatusText.textContent)) setStatus('');
    }
    const newCampaignCount = batchEntries.filter(entry => entry.state === 'previewed').length;
    createButton.disabled = busy || !previewSnapshot || newCampaignCount === 0 || completed || uncertain;
    createButton.textContent = 'Criar ' + newCampaignCount + ' campanha' + (newCampaignCount === 1 ? '' : 's') + ' nova' + (newCampaignCount === 1 ? '' : 's') + ' pausada' + (newCampaignCount === 1 ? '' : 's');
  }

  function clearPreview({ preserveStoredPreview = false } = {}) {
    const hadPreview = !previewArea.hidden || Boolean(previewSnapshot);
    if (!preserveStoredPreview && previewId) {
      try { invalidateGoogleAdsCampaignPreview(previewId); }
      catch (error) { setCampaignBatchStatus(error.message || 'Não foi possível marcar a prévia salva como desatualizada.', true); }
    }
    previewSnapshot = '';
    previewFingerprint = '';
    previewId = '';
    previewValidatedAt = '';
    batchEntries = [];
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
    resultArea.hidden = true;
    createButton.hidden = true;
    previewDetails.replaceChildren();
    resultArea.replaceChildren();
    renderConfiguredAudienceTargeting();
    updateControlState();
    if (hadPreview && !busy && !completed && !uncertain && !campaignBatchRestored) {
      setStatus('Prévia não validada: os dados foram alterados e a anterior foi descartada. Clique em “Validar prévia”; depois da aprovação, o botão de confirmação aparecerá aqui.', false, false, true);
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
      renderCopyImportResults();
      setCopyImportStatus('Edição salva nesta janela. A tradução original continua disponível como referência.');
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
          renderCopyImportResults();
          setCopyImportStatus('Seleção atualizada. Você pode continuar escolhendo, editando ou aplicar a copy.');
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
      ? 'Marque até 6. Cada link usa a URL final lida do anúncio da campanha e pode apontar para uma seção (#1 a #6) da Pre-Sell.'
      : 'Ao aplicar a copy, até 6 sitelinks dentro dos limites serão salvos junto ao rascunho e vinculados automaticamente ao lote. As seções (#1–#6) seguem a ordem da lista; a aplicação às campanhas continua na seção “Sitelinks deste lote”.');
    if (!parsedCopy.sitelinks.length) {
      const empty = document.createElement('p'); empty.className = 'google-ads-copy-import-empty'; empty.textContent = 'Nenhum sitelink informado.'; sitelinksGrid.append(empty);
    }
    parsedCopy.sitelinks.forEach((link, index) => {
      const composite = document.createElement('article'); composite.className = 'google-ads-copy-import-composite';
      const selectedAnchor = selectedCopySitelinks.get(link.id) || 0;
      const heading = document.createElement('h4'); heading.textContent = 'Sitelink ' + (index + 1) + (selectedAnchor ? ' · destino #' + selectedAnchor : ''); composite.append(heading);
      if (batchSitelinksMode) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'google-ads-copy-import-select' + (selectedAnchor ? ' is-selected' : '');
        toggle.setAttribute('aria-pressed', String(Boolean(selectedAnchor)));
        toggle.textContent = selectedAnchor ? '✓ Selecionado para o lote' : 'Selecionar para o lote';
        toggle.addEventListener('click', () => {
          if (selectedCopySitelinks.has(link.id)) selectedCopySitelinks.delete(link.id);
          else {
            if (selectedCopySitelinks.size >= 6) { setCopyImportStatus('O Google Ads aceita até 6 sitelinks neste fluxo.', true); return; }
            const used = new Set(selectedCopySitelinks.values());
            const anchor = [1, 2, 3, 4, 5, 6].find(value => !used.has(value));
            if (!anchor) { setCopyImportStatus('As seis seções já estão em uso.', true); return; }
            selectedCopySitelinks.set(link.id, anchor);
          }
          renderCopyImportResults();
        });
        composite.append(toggle);
        if (selectedAnchor) {
          const anchorLabel = document.createElement('label');
          anchorLabel.className = 'google-ads-creation-field google-ads-copy-import-sitelink-anchor';
          const label = document.createElement('span'); label.textContent = 'Seção de destino da Pre-Sell';
          const select = document.createElement('select'); select.className = 'input';
          const used = new Set([...selectedCopySitelinks.entries()].filter(([id]) => id !== link.id).map(([, anchor]) => anchor));
          [1, 2, 3, 4, 5, 6].forEach(anchor => {
            if (used.has(anchor) && anchor !== selectedAnchor) return;
            const option = document.createElement('option'); option.value = String(anchor); option.textContent = 'Seção #' + anchor; option.selected = anchor === selectedAnchor; select.append(option);
          });
          select.addEventListener('change', () => {
            selectedCopySitelinks.set(link.id, Number(select.value));
            renderCopyImportResults();
          });
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
      actions.append(edit);
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
      toggle.addEventListener('click', () => { selectedPromotion = !selectedPromotion; renderCopyImportResults(); });
      promotionCard.append(details, subdetails, toggle);
      promotionGrid.append(promotionCard);
      } else {
        const empty = document.createElement('p'); empty.className = 'google-ads-copy-import-empty'; empty.textContent = 'A resposta não contém um recurso de promoção estruturado.'; promotionGrid.append(empty);
      }
    }

    const headlineCount = selectedAssets('headline').length;
    const descriptionCount = selectedAssets('description').length;
    page.querySelector('[data-copy-import-headline-count]').textContent = batchSitelinksMode
      ? selectedCopySitelinks.size + '/6 sitelinks' : headlineCount + '/10 títulos';
    page.querySelector('[data-copy-import-description-count]').textContent = batchSitelinksMode
      ? 'seções #1–#6' : descriptionCount + '/3 descrições';
    page.querySelector('[data-copy-import-promotion-count]').textContent = batchSitelinksMode
      ? 'URL por campanha' : (selectedPromotion ? '1' : '0') + '/1 promoção';
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
      if (copyImportMode === 'batch-sitelinks' && activeCampaignBatchSitelinks.length) {
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
      selectedPromotion = false;
      copyImportResults.hidden = false;
      renderCopyImportResults();
      setCopyImportStatus(copyImportMode === 'batch-sitelinks'
        ? 'Copy organizada: selecione e edite os sitelinks que serão vinculados a este lote.'
        : 'Copy organizada: ' + parsedCopy.headlines.length + ' títulos, ' + parsedCopy.descriptions.length + ' descrições e ' + (parsedCopy.sitelinks.length + parsedCopy.callouts.length + parsedCopy.structuredSnippets.length) + ' grupos/recursos adicionais.');
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
        setCopyImportStatus('Abra um lote de campanhas salvo antes de guardar sitelinks para ele.', true);
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
    const commonCurrency = targetCurrencies.length === 1 ? targetCurrencies[0] : '';
    if (targetState.source === 'ficha' && targetState.targets.some(target => !target.account || !target.finalUrl || !target.currencyCode || target.reason)) {
      finalUrlField.setCustomValidity('Uma ou mais contas selecionadas na Ficha não têm conta, moeda ou URL HTTPS válida. Confira a lista de destinos acima.');
    } else if (targetCurrencies.length > 1) {
      finalUrlField.setCustomValidity('As contas selecionadas usam moedas diferentes. O Hub não converte orçamento, promoção ou lances entre moedas.');
    }
    if (['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'].includes(strategy) && targetCpa.value.trim()
        && derivedCpaCurrencyField.value && commonCurrency && derivedCpaCurrencyField.value !== commonCurrency) {
      targetCpa.setCustomValidity('O CPA calculado está em ' + derivedCpaCurrencyField.value + ' e as contas de destino estão em ' + commonCurrency + '. Edite o CPA manualmente na moeda das contas ou escolha destinos compatíveis.');
    }
    const countries = countryField.value.trim().toUpperCase().split(/[\s,;]+/).filter(Boolean);
    if (!countries.length || countries.length > 20 || countries.some(code => !/^[A-Z]{2}$/.test(code))
        || new Set(countries).size !== countries.length) {
      countryField.setCustomValidity('Informe de 1 a 20 códigos ISO de país, sem repetir, por exemplo: DE, FR, US.');
    }
    const positiveKeywords = textLines(keywordField.value);
    const negativeKeywords = textLines(negativeField.value);
    if (!positiveKeywords.length || positiveKeywords.length > 100 || positiveKeywords.some(value => Array.from(value).length > 80)
        || new Set(positiveKeywords.map(value => value.toLocaleLowerCase())).size !== positiveKeywords.length) {
      keywordField.setCustomValidity('Informe de 1 a 100 palavras-chave únicas, uma por linha, com até 80 caracteres.');
    }
    if (negativeKeywords.length > 100 || negativeKeywords.some(value => Array.from(value).length > 80)
        || new Set(negativeKeywords.map(value => value.toLocaleLowerCase())).size !== negativeKeywords.length) {
      negativeField.setCustomValidity('Informe até 100 palavras-chave negativas únicas, uma por linha, com até 80 caracteres.');
    }
    const trackingValue = trackingField.value.trim();
    if (trackingValue && (!/^https:\/\//i.test(trackingValue) || !/^https:\/\/[^\s]+$/.test(trackingValue))) {
      trackingField.setCustomValidity('O modelo de acompanhamento deve começar com https://.');
    }
    if (suffixField.value.trim().startsWith('?')) suffixField.setCustomValidity('Informe o sufixo sem o ? inicial.');
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

  function collectPayload() {
    const ids = currentIds();
    if (!ids) throw new Error('Selecione uma MCC e uma conta Google Ads.');
    const discountType = form.elements.namedItem('discount_type').value;
    const triggerType = form.elements.namedItem('trigger_type').value;
    return {
      ...ids,
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
      geoTargetCountryCodes: form.elements.namedItem('geo_target_country_codes').value.trim().toUpperCase().split(/[\s,;]+/).filter(Boolean),
      keywords: textLines(form.elements.namedItem('keywords').value),
      keywordMatchType: form.elements.namedItem('keyword_match_type').value,
      negativeKeywords: textLines(form.elements.namedItem('negative_keywords').value),
      negativeKeywordMatchType: form.elements.namedItem('negative_keyword_match_type').value,
      targetSearchNetwork: form.elements.namedItem('target_search_network').checked,
      targetContentNetwork: form.elements.namedItem('target_content_network').checked,
      containsEuPoliticalAdvertising: form.elements.namedItem('contains_eu_political_advertising').value,
      trackingUrlTemplate: form.elements.namedItem('tracking_url_template').value.trim(),
      finalUrlSuffix: form.elements.namedItem('final_url_suffix').value.trim(),
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

  function addPreviewRow(label, value) {
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
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
    if (diagnostic.fieldPaths?.length) parts.push('campo(s) ' + diagnostic.fieldPaths.join(', '));
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
    const message = error?.message || fallback;
    const details = describeRequestDiagnostic(error?.diagnostic, retryContext);
    return details ? message + ' (' + details + ').' : message;
  }

  function renderBatchPreview() {
    previewDetails.replaceChildren();
    previewTitle.textContent = 'Verificação da prévia';
    previewDescription.textContent = 'A API procura o nome exato em cada conta. Se já existir, mostra ID, status, grupo e os pré-requisitos das ações de público; se estiver livre, valida com validateOnly. Não consulta os critérios individuais de público nem cria campanhas nesta etapa.';
    const allResolved = batchEntries.length > 0 && batchEntries.every(entry => ['previewed', 'existing'].includes(entry.state));
    const newCount = batchEntries.filter(entry => entry.state === 'previewed').length;
    const existingCount = batchEntries.filter(entry => entry.state === 'existing').length;
    const accountNames = [...new Set(batchEntries.map(entry => entry.accountName || entry.payload.customerId))];
    addPreviewRow('Contas de destino', accountNames.join(' · ') || '—');
    addPreviewRow('Campanhas verificadas', String(batchEntries.length) + ' · ' + existingCount + ' já existentes · ' + newCount + ' novas aprovadas para criação');
    batchEntries.forEach((entry, index) => {
      const label = 'Campanha ' + String(index + 1).padStart(2, '0') + ' · ' + entry.percent + '% · ' + (entry.accountName || entry.payload.customerId);
      if (entry.state === 'previewed') {
        const result = entry.previewResult;
        const amount = result.target_cpa_micros
          ? formatMoneyMicros(result.target_cpa_micros, result.account_currency)
          : 'CPA não informado';
        addPreviewRow(label, 'Nome livre · validateOnly aprovado · ' + result.campaign_name + ' · ' + amount + ' · orçamento ' + formatMoneyMicros(result.daily_budget_micros, result.account_currency) + ' · ainda não criada');
      } else if (entry.state === 'existing') {
        const result = entry.previewResult;
        const group = result.ad_group_count === 1 ? ' · grupo único ' + result.ad_group_id + ' (' + result.ad_group_status + ')'
          : result.ad_group_count === 0 ? ' · nenhum grupo não removido localizado' : ' · vários grupos não removidos';
        const exclusionsReady = result.campaign_status === 'PAUSED' && result.campaign_channel_type === 'SEARCH' && !result.audience_grouped;
        const targetingCsvReady = result.campaign_channel_type === 'SEARCH' && result.ad_group_count === 1
          && /^[1-9]\d{0,19}$/.test(String(result.ad_group_id || ''));
        addPreviewRow(label, 'Já existe · ID ' + result.campaign_id + ' · ' + result.campaign_status + ' · ' + result.campaign_channel_type
          + (result.campaign_channel_type === 'SEARCH' ? group : '')
          + (result.campaign_channel_type === 'SEARCH'
            ? (result.campaign_status === 'PAUSED'
              ? (exclusionsReady ? ' · pré-requisitos de exclusão atendidos' : ' · exclusões incompatíveis com a configuração de público')
              : ' · exclusões exigem campanha pausada')
              + (targetingCsvReady ? ' · grupo identificado para o CSV de segmentação' : ' · grupo único não identificado para o CSV')
            : ' · sem CSV de públicos para este tipo de campanha'));
      } else if (entry.state === 'preview_failed') addPreviewRow(label, 'Prévia não validada: ' + entry.errorMessage);
      else addPreviewRow(label, 'Aguardando validação.');
    });
    const urlSummary = batchEntries.every(entry => entry.targetSource === 'ficha')
      ? 'Cada conta usa sua URL da Ficha.'
      : 'A conta de referência usa a URL manual do formulário.';
    addPreviewRow('Configurações compartilhadas', 'Anúncio, palavras-chave, GEOs, redes, promoção e orçamento são iguais ao formulário. ' + urlSummary + ' O número é único por produto e os níveis de CPA são aplicados a todas as contas.');
    previewArea.hidden = false;
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
    setStatus(allResolved ? successStatus : failureStatus, !allResolved);
    renderCampaignResult();
    updateControlState();
  }

  async function runBatchCreation(entriesToCreate) {
    if (!entriesToCreate.length || busy) return;
    if (!activeCampaignBatchId) {
      activeCampaignBatchId = createCampaignBatchId();
      activeCampaignBatchCreatedAt = new Date().toISOString();
      activeCampaignBatchSitelinks = pendingDraftSitelinks.map(link => ({ ...link }));
      imageUploadConfirmed = false;
      imageUploadConfirmedAccountIds = [];
      campaignSitelinksBatchAttempted = false;
    }
    if (previewId) {
      try { linkGoogleAdsCampaignPreviewToBatch(previewId, activeCampaignBatchId); }
      catch (error) {
        activeCampaignBatchId = '';
        activeCampaignBatchCreatedAt = '';
        setStatus((error.message || 'Não foi possível vincular a prévia ao lote.') + ' Nenhuma criação foi enviada.', true);
        return;
      }
    }
    campaignBatchRestored = false;
    busy = true;
    creating = true;
    updateControlState();
    const existingTargets = createdCampaigns.filter(campaign => campaign.source === 'existing');
    for (let index = 0; index < entriesToCreate.length; index++) {
      const entry = entriesToCreate[index];
      entry.state = 'creating';
      renderCampaignResult();
      setStatus('Criando campanha ' + (index + 1) + ' de ' + entriesToCreate.length + ' em ' + entry.accountName + ': ' + entry.payload.campaignName + '.');
      try {
        const result = await createGoogleAdsSearchCampaign(entry.payload);
        entry.state = 'created';
        entry.errorMessage = '';
        entry.result = {
          ...result,
          managerCustomerId: entry.payload.managerCustomerId,
          customerId: entry.payload.customerId,
          accountName: entry.accountName,
        };
        entry.result.source = 'created';
        entry.result.campaignChannelType = 'SEARCH';
        entry.result.audienceGrouped = false;
        entry.result.adGroupStatus = 'ENABLED';
        if (!audienceStateByCampaign.has(campaignOperationKey(entry.result))) audienceStateByCampaign.set(campaignOperationKey(entry.result), {});
        const confirmedCampaigns = [...existingTargets, ...batchEntries.filter(item => item.state === 'created').map(item => item.result)];
        saveActiveCampaignBatch(confirmedCampaigns);
      } catch (error) {
        entry.state = error?.code && definitiveCreationFailureCodes.has(error.code) ? 'failed' : 'uncertain';
        entry.diagnostic = error?.diagnostic || null;
        entry.errorMessage = formatRequestFailure(error, 'O servidor não confirmou a criação.');
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
      activeCampaignBatchCreatedAt = '';
      imageUploadConfirmed = false;
      imageUploadConfirmedAccountIds = [];
      refreshCampaignBatchPicker();
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
    setStatus(statusMessage, failures > 0 || uncertainCount > 0);
  }

  async function retryFailedCampaigns() {
    const failedEntries = batchEntries.filter(entry => entry.state === 'failed');
    if (!failedEntries.length || busy) return;
    const names = failedEntries.map(entry => '• ' + entry.accountName + ' · ' + entry.payload.campaignName).join('\n');
    if (!globalThis.confirm('Tentar novamente somente ' + failedEntries.length + ' campanha(s) com falha confirmada? As criações já confirmadas serão mantidas e não serão repetidas.\n\n' + names)) return;
    await runBatchCreation(failedEntries);
  }

  previewButton.addEventListener('click', async () => {
    const draftSaved = saveDraftNow();
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
    catch (error) { setStatus(error.message, true); return; }
    clearPreview();
    batchEntries = entries.map(entry => ({
      ...entry,
      state: 'pending',
      previewResult: null,
      result: null,
      errorMessage: '',
      diagnostic: null,
    }));
    busy = true;
    updateControlState();
    for (let index = 0; index < batchEntries.length; index++) {
      const entry = batchEntries[index];
      setStatus('Verificando ' + (index + 1) + ' de ' + batchEntries.length + ' · ' + (entry.accountName || entry.payload.customerId) + ': busca de nome e validação sem gravação…', false, true, true);
      try {
        entry.previewResult = await previewGoogleAdsSearchCampaign(entry.payload);
        entry.state = entry.previewResult.existing_campaign === true ? 'existing' : 'previewed';
      } catch (error) {
        entry.state = 'preview_failed';
        entry.diagnostic = error?.diagnostic || null;
        entry.errorMessage = formatRequestFailure(error, 'A API não validou esta campanha.', true);
      }
    }
    busy = false;
    syncPreviewExistingCampaignTargets();
    const allResolved = batchEntries.length > 0 && batchEntries.every(entry => ['previewed', 'existing'].includes(entry.state));
    if (allResolved) {
      previewValidatedAt = new Date().toISOString();
      try { previewFingerprint = await fingerprintCampaignPayloads(batchEntries.map(entry => entry.payload)); }
      catch { previewFingerprint = ''; }
      if (draftSaved && activeDraftId) {
        try {
          const nextPreviewId = createCampaignPreviewId();
          const saved = saveGoogleAdsCampaignPreview({
            id: nextPreviewId,
            draftId: activeDraftId,
            validatedAt: previewValidatedAt,
            payloadFingerprint: previewFingerprint,
            batchId: '',
            invalidatedAt: '',
            entries: storedPreviewEntries(),
          });
          previewId = saved.previews.some(item => item.id === nextPreviewId) ? nextPreviewId : '';
          campaignPreviewStorageError = '';
        } catch (error) {
          previewId = '';
          campaignPreviewStorageError = error.message || 'Não foi possível salvar a prévia neste navegador.';
        }
      }
    }
    renderBatchPreview();
    if (allResolved) {
      if (!draftSaved || !activeDraftId || !previewId) {
        setStatus('A verificação terminou. Esta prévia vale nesta sessão, mas não foi salva para reabertura; aja agora ou valide novamente após recarregar.'
          + (campaignPreviewStorageError ? ' ' + campaignPreviewStorageError : ''), false, false, true);
      } else if (!previewFingerprint) {
        setStatus('A verificação terminou, mas o navegador não ofereceu uma assinatura verificável; ela não poderá ser recuperada com segurança após recarregar.', false, false, true);
      } else {
        setStatus('Verificação salva nesta análise e recuperável sem prazo enquanto campos, destinos e sequência permanecerem iguais. Use “Validar prévia” quando quiser atualizar os dados da API.', false);
      }
    }
    updateControlState();
  });

  nameCalculateButton.addEventListener('click', openCampaignNameDialog);
  nameParseInput.addEventListener('input', calculateCampaignNameDetails);
  page.querySelector('[data-campaign-name-recalculate]').addEventListener('click', calculateCampaignNameDetails);
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
      setCampaignBatchStatus('Abra um lote salvo para selecionar sitelinks para ele.', true);
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
      setCopyImportStatus('Novo rascunho iniciado. Cole aqui a nova resposta completa do Gemini.');
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
  deleteDraftButton.addEventListener('click', deleteSelectedDraft);
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
  clickBankOffersRefreshButton.addEventListener('click',()=>{void refreshClickBankKeywordSources();});
  clickBankKeywordsImportButton.addEventListener('click',importSelectedClickBankKeywords);
  form.addEventListener('submit', event => event.preventDefault());
  updatePromotionTriggerFields();
  form.addEventListener('input', event => {
    if (event.target.matches('[name="manager"], [name="account"]')) return;
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
      derivedCpaCurrencyField.value = '';
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
      for (const name of ['source_campaign_date', 'source_product', 'source_iteration', 'source_platform_code', 'source_platform', 'source_bidding_model_code', 'source_bidding_model', 'source_extra_tags', 'source_destination', 'source_commission_amount', 'source_commission_currency', 'source_target_cpa_percent', 'source_target_cpa_amount']) {
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
    if (event.target===keywordField) { updateClickBankKeywordImportState(); updatePromotionTargetFromCampaign(); }
    if (event.target===negativeKeywordField) updateClickBankNegativeKeywordImportState();
    clearPreview();
    scheduleDraftSave();
  });
  form.addEventListener('change', event => {
    if (event.target.matches('[name="cpa_variant"]')) return;
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
      directoryCachePersisted = false;
      try {
        const saved = saveGoogleAdsAccountsCache(nextDirectory, { savedAtUtc: directoryCacheAt });
        directoryCacheAt = saved.savedAtUtc;
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
        detail: { accounts: nextDirectory, savedAtUtc: directoryCacheAt, persisted: directoryCachePersisted },
      }));
      setStatus(directoryCachePersisted
        ? 'Lista atualizada e compartilhada com a tela Google Ads API. A consulta de MCCs não será repetida ao reabrir esta tela.'
        : 'Lista atualizada nesta tela, mas o armazenamento local falhou; a outra tela e próximas sessões podem não receber esta atualização.', !directoryCachePersisted);
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
  function syncDirectoryFromCache({ accounts: suppliedAccounts = null, savedAtUtc: suppliedAt = '', persisted = true } = {}) {
    refreshAccountTargetHighlight();
    if (busy || completed || uncertain) return false;
    const cached = suppliedAccounts ? { accounts: suppliedAccounts, savedAtUtc: suppliedAt } : loadGoogleAdsAccountsCache();
    if (!cached?.accounts) {
      if (!directory) setStatus('Nenhuma lista local de MCCs e contas foi salva. Clique em “Atualizar MCCs e contas” ou atualize a lista na tela Google Ads API.', true);
      return false;
    }
    const nextAt = cached.savedAtUtc || '';
    if (!suppliedAccounts && nextAt && directoryCacheAt
        && Date.parse(nextAt) < Date.parse(directoryCacheAt)) return false;
    if (nextAt && nextAt === directoryCacheAt) {
      if (suppliedAccounts) return false;
      const time = formatDirectoryTimestamp(nextAt);
      setStatus('Lista de MCCs e contas reutilizada do cache compartilhado' + (time ? ' · atualizada em ' + time : '') + '. Abrir esta tela não consulta a API.');
      return true;
    }
    directory = cached.accounts;
    directoryCacheAt = nextAt;
    directoryCachePersisted = persisted;
    const usable = populateDirectory(directory);
    clearPreview();
    if (!usable) {
      setStatus('A lista compartilhada não contém contas cliente vinculadas a uma MCC.', true);
      return false;
    }
    updateFinalUrlFromPreSell();
    const time = formatDirectoryTimestamp(nextAt);
    setStatus('Lista de MCCs e contas reutilizada do cache compartilhado' + (time ? ' · atualizada em ' + time : '')
      + (persisted ? '. Abrir esta tela não consulta a API.' : '. Esta atualização vale nesta sessão; o armazenamento local falhou.'));
    return true;
  }
  const onDirectoryUpdated = event => {
    const detail = event?.detail;
    if (detail?.accounts) syncDirectoryFromCache(detail);
  };
  const onDirectoryStorage = event => {
    if (event?.key === GOOGLE_ADS_ACCOUNTS_CACHE_STORAGE_KEY) syncDirectoryFromCache();
    else if (event?.key === ACCOUNT_DIRECTORY_EMAIL_KEY) renderCampaignTargetSummary();
    else if (event?.key === GOOGLE_ADS_ACCOUNT_IMAGE_ELIGIBILITY_STORAGE_KEY) {
      renderCampaignTargetSummary();
      if (activeCampaignBatchId && createdCampaigns.length) renderCampaignResult();
    }
    else if (event?.key === ACCOUNT_MAP_DUPLICATION_TARGET_KEY) refreshAccountTargetHighlight();
    else if (event?.key === GOOGLE_ADS_CAMPAIGN_SEQUENCE_STORAGE_KEY) {
      if (!completed && !uncertain && !busy) {
        clearPreview();
        renderCpaVariantOptions();
        setStatus('Prévia não validada: a numeração deste produto foi reservada em outra aba. Clique em “Validar prévia” para obter a próxima sequência.', false, false, true);
      }
    }
    else if (event?.key === 'copy-ficha-draft-v1') {
      updateFinalUrlFromPreSell();
      renderCpaVariantOptions();
      if (!completed && !uncertain && !busy) clearPreview();
    }
  };
  accountSelect.addEventListener('focus', refreshAccountTargetHighlight);
  accountSelect.addEventListener('pointerdown', refreshAccountTargetHighlight);
  window.addEventListener(ACCOUNT_MAP_DUPLICATION_TARGET_UPDATED_EVENT, refreshAccountTargetHighlight);
  window.addEventListener('hub:google-ads-account-directory-updated', onDirectoryUpdated);
  window.addEventListener('storage', onDirectoryStorage);
  updateControlState();
  if (directory) {
    populateDirectory(directory);
    updateCurrencyHints();
    const time = formatDirectoryTimestamp(directoryCacheAt);
    if (!isTokenReady()) setStatus('A lista local está disponível, mas configure o token compartilhado do Hub antes de validar a campanha.', true);
    else setStatus('Lista de MCCs e contas reutilizada do cache compartilhado' + (time ? ' · atualizada em ' + time : '') + '. Abrir esta tela não consulta a API.');
  } else if (!isTokenReady()) {
    setStatus('Configure o token compartilhado do Hub em Integrações → Configurações globais antes de continuar.', true);
  } else {
    setStatus('Nenhuma lista local de MCCs e contas foi salva. Atualize a lista em Google Ads API ou clique em “Atualizar MCCs e contas”.', true);
  }
  if (!draftStorageError && !activeDraftId) activeDraftId = newestDraft()?.id || '';
  const latestBatchToOpenByDefault = !draftStorageError && !activeDraftId && draftStore.drafts.length === 0
    && !campaignBatchStorageError ? newestCampaignBatch() : null;
  refreshDraftPicker();
  refreshCampaignBatchPicker();
  renderConfiguredAudienceTargeting();
  if (campaignBatchStorageError) setCampaignBatchStatus(campaignBatchStorageError + ' Lotes não foram alterados.', true);
  else if (campaignBatchStore.batches.length) {
    setCampaignBatchStatus(campaignBatchStore.batches.length + ' lote(s) disponível(is) neste navegador. Selecione um para reabrir; abrir não consulta a API.');
  } else setCampaignBatchStatus('Os lotes serão salvos neste navegador após a criação ou pela associação de campanhas existentes.');
  if (draftStorageError) setDraftStatus(draftStorageError + ' O formulário continuará disponível nesta sessão.', true);
  else if (activeDraftId) {
    const savedDraft = draftStore.drafts.find(draft => draft.id === activeDraftId);
    if (savedDraft) restoreDraft(savedDraft);
    else setDraftStatus('Nenhuma análise ativa foi encontrada. O formulário está pronto para uma nova análise.');
  } else setDraftStatus('As alterações do formulário são salvas automaticamente neste navegador.');
  if (latestBatchToOpenByDefault) openSavedCampaignBatch(latestBatchToOpenByDefault.id);
  void refreshClickBankKeywordSources();
  const controller = {
    refreshDirectory,
    syncDirectoryFromCache,
    syncCampaignNames: nextNames => {
      const before = knownCampaignNames.join('\n');
      syncKnownCampaignNames(nextNames);
      renderCpaVariantOptions();
      if (before !== knownCampaignNames.join('\n') && !completed && !uncertain && !busy) clearPreview();
    },
    syncFichaTargets: () => {
      const before = JSON.stringify(campaignTargetState().targets.map(target => [target.accountId, target.finalUrl, target.currencyCode]));
      updateFinalUrlFromPreSell();
      renderCpaVariantOptions();
      const after = JSON.stringify(campaignTargetState().targets.map(target => [target.accountId, target.finalUrl, target.currencyCode]));
      if (before !== after && !completed && !uncertain && !busy) clearPreview();
    },
  };
  mountedRoots.set(root, controller);
  return controller;
}
