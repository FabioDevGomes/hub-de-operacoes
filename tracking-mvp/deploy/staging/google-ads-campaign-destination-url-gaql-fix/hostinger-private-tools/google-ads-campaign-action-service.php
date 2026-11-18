<?php
declare(strict_types=1);

// Separate write surface. Shared authentication, credentials, OAuth and
// Google Ads HTTP helpers remain defined by the read-only service.
require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-readonly-service.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-campaign-pause-email-service.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-campaign-duplication-service.php';

function hub_google_ads_campaign_actions_enabled(array $config): bool
{
    return ($config['tracking_google_ads_campaign_writes_enabled'] ?? false) === true
        && count(hub_google_ads_campaign_write_manager_customer_ids($config)) > 0;
}

/** Only explicitly listed manager accounts can authorize their linked advertiser accounts. */
function hub_google_ads_campaign_write_manager_customer_ids(array $config): array
{
    $configured = $config['tracking_google_ads_campaign_write_manager_customer_ids'] ?? [];
    if (!is_array($configured)) return [];
    $managerIds = [];
    foreach ($configured as $value) {
        $managerId = hub_google_ads_valid_customer_id($value);
        if ($managerId !== null) $managerIds[$managerId] = $managerId;
    }
    return array_values($managerIds);
}

function hub_google_ads_campaign_manager_is_allowed(array $config, string $managerId): bool
{
    return in_array($managerId, hub_google_ads_campaign_write_manager_customer_ids($config), true);
}

/** Check current manager hierarchy, so new active advertiser accounts are included automatically. */
function hub_google_ads_campaign_customer_is_active_child(string $accessToken, string $managerId, string $customerId): bool
{
    if ($managerId === $customerId) return false;
    $query = 'SELECT customer_client.id, customer_client.level, customer_client.manager, customer_client.status '
        . 'FROM customer_client WHERE customer_client.id = ' . $customerId
        . ' AND customer_client.level > 0 AND customer_client.manager = FALSE'
        . " AND customer_client.status = 'ENABLED' LIMIT 2";
    $rows = hub_google_ads_search($managerId, $query, $accessToken, $managerId);
    if (count($rows) > 1) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    if (!$rows) return false;
    $client = $rows[0]['customerClient'] ?? null;
    if (!is_array($client)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    $returnedId = hub_google_ads_valid_customer_id((string)($client['id'] ?? ''));
    $level = $client['level'] ?? null;
    if ($returnedId !== $customerId || !is_numeric($level) || (int)$level < 1
        || ($client['manager'] ?? null) !== false || ($client['status'] ?? null) !== 'ENABLED') {
        throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    }
    return true;
}

function hub_google_ads_campaign_action_validate_status_change(array $payload): array
{
    $transitions = [
        'pause_campaign' => ['ENABLED', 'PAUSED'],
        'enable_campaign' => ['PAUSED', 'ENABLED'],
    ];
    $operation = $payload['operation'] ?? null;
    $transition = is_string($operation) ? ($transitions[$operation] ?? null) : null;
    $keys = array_keys($payload);
    sort($keys, SORT_STRING);
    $hasNotificationContext = array_key_exists('notification_context', $payload);
    $notificationContext = $hasNotificationContext ? $payload['notification_context'] : null;
    $allowedKeys = ['campaign_id', 'confirm', 'customer_id', 'expected_status', 'manager_customer_id', 'operation'];
    if (array_key_exists('notification_context', $payload)) {
        $allowedKeys[] = 'notification_context';
        sort($allowedKeys, SORT_STRING);
    }
    if ($keys !== $allowedKeys
        || ($payload['confirm'] ?? null) !== true
        || $transition === null
        || ($payload['expected_status'] ?? null) !== $transition[0]
        || ($hasNotificationContext
            && ($notificationContext !== 'automatic_negative_remaining' || $operation !== 'pause_campaign'))) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }

    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
    $campaignId = $payload['campaign_id'];
    if ($managerId === null || $customerId === null
        || !is_string($campaignId)
        || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }

    return [$managerId, $customerId, $campaignId, $operation, $transition[0], $transition[1], $notificationContext];
}

/** Read the current campaign state using a server-built, ID-validated GAQL query. */
function hub_google_ads_campaign_action_read(string $accessToken, ?string $managerId, string $customerId, string $campaignId): array
{
    $query = 'SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.id = '
        . $campaignId . ' LIMIT 2';
    $rows = hub_google_ads_search($customerId, $query, $accessToken, $managerId);
    if (!$rows) throw new HubGoogleAdsApiException('campaign_not_found', 404);
    if (count($rows) !== 1 || !is_array($rows[0]['campaign'] ?? null)) {
        throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    }

    $campaign = $rows[0]['campaign'];
    if ((string)($campaign['id'] ?? '') !== $campaignId || !is_string($campaign['status'] ?? null)) {
        throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    }
    return [
        'id' => $campaignId,
        'name' => is_string($campaign['name'] ?? null) ? $campaign['name'] : '',
        'status' => $campaign['status'],
    ];
}

/** Only explicit ENABLED ↔ PAUSED status changes are available. */
function hub_google_ads_change_campaign_status(
    array $config,
    string $managerId,
    string $customerId,
    string $campaignId,
    string $operation,
    string $expectedStatus,
    string $targetStatus
): array
{
    $transitions = [
        'pause_campaign' => ['ENABLED', 'PAUSED'],
        'enable_campaign' => ['PAUSED', 'ENABLED'],
    ];
    if (($transitions[$operation] ?? null) !== [$expectedStatus, $targetStatus]) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    if (!hub_google_ads_campaign_actions_enabled($config)) {
        throw new HubGoogleAdsApiException('campaign_writes_disabled', 403);
    }
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
        throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    }

    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    if (!hub_google_ads_campaign_customer_is_active_child($accessToken, $managerId, $customerId)) {
        throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    }
    $campaign = hub_google_ads_campaign_action_read($accessToken, $managerId, $customerId, $campaignId);
    if ($campaign['status'] === $targetStatus) {
        return [
            'ok' => true,
            'schema_version' => 1,
            'operation' => $operation,
            'changed' => false,
            'verified' => true,
            'campaign_id' => $campaignId,
            'campaign_name' => $campaign['name'],
            'status' => $targetStatus,
            'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        ];
    }
    if ($campaign['status'] !== $expectedStatus) {
        throw new HubGoogleAdsApiException('campaign_status_changed', 409);
    }

    $resourceName = 'customers/' . $customerId . '/campaigns/' . $campaignId;
    $mutation = hub_google_ads_api_request(
        'POST',
        'customers/' . $customerId . '/campaigns:mutate',
        $accessToken,
        json_encode([
            'operations' => [[
                'update' => ['resourceName' => $resourceName, 'status' => $targetStatus],
                'updateMask' => 'status',
            ]],
        ], JSON_UNESCAPED_SLASHES),
        $managerId
    );
    if (count($mutation['results'] ?? []) !== 1) {
        throw new HubGoogleAdsApiException('campaign_status_unverified', 502);
    }

    try {
        $verifiedCampaign = hub_google_ads_campaign_action_read($accessToken, $managerId, $customerId, $campaignId);
    } catch (Throwable $error) {
        throw new HubGoogleAdsApiException('campaign_status_unverified', 502);
    }
    if ($verifiedCampaign['status'] !== $targetStatus) {
        throw new HubGoogleAdsApiException('campaign_status_unverified', 502);
    }

    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => $operation,
        'changed' => true,
        'verified' => true,
        'campaign_id' => $campaignId,
        'campaign_name' => $verifiedCampaign['name'],
        'status' => $targetStatus,
        'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

/** Campaign creation is separately gated so existing pause/enable access stays unchanged. */
function hub_google_ads_campaign_creation_enabled(array $config): bool
{
    return ($config['tracking_google_ads_campaign_creation_enabled'] ?? false) === true
        && count(hub_google_ads_campaign_write_manager_customer_ids($config)) > 0;
}

function hub_google_ads_campaign_creation_authorize(array $config, string $accessToken, string $managerId, string $customerId): void
{
    if (!hub_google_ads_campaign_creation_enabled($config)) {
        throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
    }
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)
        || !hub_google_ads_campaign_customer_is_active_child($accessToken, $managerId, $customerId)) {
        throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    }
}

function hub_google_ads_campaign_creation_text_length(string $value): int
{
    if (preg_match_all('/./us', $value, $matches) === false) return PHP_INT_MAX;
    return count($matches[0]);
}

function hub_google_ads_campaign_creation_lower(string $value): string
{
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

function hub_google_ads_campaign_creation_substr(string $value, int $start, int $length): string
{
    return function_exists('mb_substr') ? mb_substr($value, $start, $length, 'UTF-8') : substr($value, $start, $length);
}

function hub_google_ads_campaign_creation_decimal_micros(mixed $value): ?string
{
    if (!is_string($value) || preg_match('/^(?:0|[1-9][0-9]{0,9})(?:\.([0-9]{1,6}))?$/D', $value, $matches) !== 1) return null;
    $parts = explode('.', $value, 2);
    $micros = $parts[0] . str_pad($parts[1] ?? '', 6, '0');
    $micros = ltrim($micros, '0');
    if ($micros === '') $micros = '0';
    if (strlen($micros) > 16 || (strlen($micros) === 16 && strcmp($micros, '9999999999999999') > 0)) return null;
    return $micros;
}

function hub_google_ads_campaign_creation_gaql_string(string $value): string
{
    return "'" . str_replace(['\\', "'"], ['\\\\', "\\'"], $value) . "'";
}

function hub_google_ads_campaign_creation_customer_currency(string $accessToken, string $managerId, string $customerId): string
{
    $rows = hub_google_ads_search($customerId, 'SELECT customer.currency_code FROM customer LIMIT 1', $accessToken, $managerId);
    $currency = (string)($rows[0]['customer']['currencyCode'] ?? '');
    if (count($rows) !== 1 || preg_match('/^[A-Z]{3}$/D', $currency) !== 1) {
        throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    }
    return $currency;
}

/** Resolve a small explicit list of ISO-3166 alpha-2 countries to active Google geo targets. */
function hub_google_ads_campaign_creation_resolve_countries(string $accessToken, string $managerId, string $customerId, array $countryCodes): array
{
    $quoted = array_map(static fn(string $code): string => hub_google_ads_campaign_creation_gaql_string($code), $countryCodes);
    $rows = hub_google_ads_search($customerId,
        'SELECT geo_target_constant.canonical_name, geo_target_constant.country_code, geo_target_constant.id, geo_target_constant.name, geo_target_constant.status, geo_target_constant.target_type FROM geo_target_constant WHERE geo_target_constant.country_code IN (' . implode(', ', $quoted) . ") AND geo_target_constant.target_type = 'Country' AND geo_target_constant.status = 'ENABLED' LIMIT 51",
        $accessToken, $managerId);
    if (count($rows) > 50) throw new HubGoogleAdsApiException('campaign_country_limit_exceeded', 422);
    $resolved = [];
    foreach ($rows as $row) {
        $geo = $row['geoTargetConstant'] ?? null;
        if (!is_array($geo)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $code = (string)($geo['countryCode'] ?? '');
        $id = (string)($geo['id'] ?? '');
        if (!in_array($code, $countryCodes, true) || preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1
            || ($geo['status'] ?? null) !== 'ENABLED' || ($geo['targetType'] ?? null) !== 'Country'
            || isset($resolved[$code])) {
            throw new HubGoogleAdsApiException('campaign_country_not_targetable', 422);
        }
        $resolved[$code] = [
            'country_code' => $code,
            'name' => (string)($geo['canonicalName'] ?? $geo['name'] ?? $code),
            'resource_name' => 'geoTargetConstants/' . $id,
        ];
    }
    if (count($resolved) !== count($countryCodes)) throw new HubGoogleAdsApiException('campaign_country_not_targetable', 422);
    return array_values(array_map(static fn(string $code): array => $resolved[$code], $countryCodes));
}

/**
 * Return only simple Search campaigns that can be copied without silently
 * dropping targeting: one enabled standard ad group, daily unshared budget,
 * manual CPC, enabled positive keywords, and supported campaign criteria.
 */
function hub_google_ads_campaign_creation_templates(string $accessToken, string $managerId, string $customerId): array
{
    $campaignRows = hub_google_ads_search($customerId,
        "SELECT customer.currency_code, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.manual_cpc.enhanced_cpc_enabled, campaign.network_settings.target_google_search, campaign.network_settings.target_search_network, campaign.network_settings.target_content_network, campaign.network_settings.target_partner_search_network, campaign.contains_eu_political_advertising, campaign.tracking_url_template, campaign.final_url_suffix, campaign.url_custom_parameters, campaign_budget.amount_micros, campaign_budget.period, campaign_budget.explicitly_shared FROM campaign WHERE campaign.status != 'REMOVED' AND campaign.advertising_channel_type = 'SEARCH' LIMIT 101",
        $accessToken, $managerId);
    if (count($campaignRows) > 100) throw new HubGoogleAdsApiException('campaign_template_limit_exceeded', 422);

    $currency = '';
    $candidates = [];
    foreach ($campaignRows as $row) {
        $campaign = $row['campaign'] ?? [];
        $budget = $row['campaignBudget'] ?? [];
        if (!is_array($campaign) || !is_array($budget)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $currency = (string)($row['customer']['currencyCode'] ?? $currency);
        $euPolitical = $campaign['containsEuPoliticalAdvertising'] ?? null;
        $id = (string)($campaign['id'] ?? '');
        $amount = (string)($budget['amountMicros'] ?? '');
        if (preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        if (($campaign['advertisingChannelType'] ?? null) !== 'SEARCH'
            || ($campaign['biddingStrategyType'] ?? null) !== 'MANUAL_CPC'
            || ($budget['period'] ?? null) !== 'DAILY'
            || ($budget['explicitlyShared'] ?? null) !== false
            || preg_match('/^[1-9][0-9]{0,19}$/D', $amount) !== 1
            || ($campaign['networkSettings']['targetGoogleSearch'] ?? null) !== true
            || !in_array($euPolitical, ['DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING', 'CONTAINS_EU_POLITICAL_ADVERTISING'], true)) continue;
        $candidates[$id] = [
            'campaign_id' => $id,
            'campaign_name' => (string)($campaign['name'] ?? ''),
            'campaign_status' => (string)($campaign['status'] ?? ''),
            'daily_budget_micros' => $amount,
            'currency_code' => $currency,
            'enhanced_cpc_enabled' => (bool)($campaign['manualCpc']['enhancedCpcEnabled'] ?? false),
            'network_settings' => [
                'target_google_search' => true,
                'target_search_network' => (bool)($campaign['networkSettings']['targetSearchNetwork'] ?? false),
                'target_content_network' => (bool)($campaign['networkSettings']['targetContentNetwork'] ?? false),
                'target_partner_search_network' => (bool)($campaign['networkSettings']['targetPartnerSearchNetwork'] ?? false),
            ],
            'contains_eu_political_advertising' => $euPolitical,
            'tracking_settings' => [
                'tracking_url_template' => $campaign['trackingUrlTemplate'] ?? null,
                'final_url_suffix' => $campaign['finalUrlSuffix'] ?? null,
                'url_custom_parameters' => $campaign['urlCustomParameters'] ?? [],
            ],
        ];
    }
    if (!$candidates) return ['currency_code' => $currency, 'templates' => []];
    if (preg_match('/^[A-Z]{3}$/D', $currency) !== 1) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);

    $idsSql = implode(', ', array_keys($candidates));
    $adGroupRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, ad_group.type, ad_group.cpc_bid_micros, ad_group.tracking_url_template, ad_group.final_url_suffix, ad_group.url_custom_parameters FROM ad_group WHERE campaign.id IN ($idsSql) AND ad_group.status != 'REMOVED' LIMIT 501",
        $accessToken, $managerId);
    if (count($adGroupRows) > 500) throw new HubGoogleAdsApiException('campaign_template_limit_exceeded', 422);
    $groups = [];
    foreach ($adGroupRows as $row) {
        $campaignId = (string)($row['campaign']['id'] ?? '');
        if (!isset($candidates[$campaignId]) || !is_array($row['adGroup'] ?? null)) continue;
        $groups[$campaignId][] = $row['adGroup'];
    }
    foreach ($candidates as $id => &$candidate) {
        $candidate['source_ad_group'] = null;
        $rows = $groups[$id] ?? [];
        if (count($rows) !== 1) { unset($candidates[$id]); continue; }
        $group = $rows[0];
        $groupId = (string)($group['id'] ?? '');
        $bid = (string)($group['cpcBidMicros'] ?? '');
        if (preg_match('/^[1-9][0-9]{0,19}$/D', $groupId) !== 1
            || ($group['status'] ?? null) !== 'ENABLED'
            || ($group['type'] ?? null) !== 'SEARCH_STANDARD'
            || preg_match('/^[1-9][0-9]{0,19}$/D', $bid) !== 1) {
            unset($candidates[$id]); continue;
        }
        $candidate['source_ad_group'] = [
            'id' => $groupId,
            'name' => (string)($group['name'] ?? ''),
            'cpc_bid_micros' => $bid,
            'tracking_settings' => [
                'tracking_url_template' => $group['trackingUrlTemplate'] ?? null,
                'final_url_suffix' => $group['finalUrlSuffix'] ?? null,
                'url_custom_parameters' => $group['urlCustomParameters'] ?? [],
            ],
        ];
    }
    unset($candidate);
    if (!$candidates) return ['currency_code' => $currency, 'templates' => []];

    $idsSql = implode(', ', array_keys($candidates));
    $adRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad.type, ad_group_ad.ad.tracking_url_template, ad_group_ad.ad.final_url_suffix, ad_group_ad.ad.url_custom_parameters FROM ad_group_ad WHERE campaign.id IN ($idsSql) AND ad_group_ad.status != 'REMOVED' LIMIT 501",
        $accessToken, $managerId);
    if (count($adRows) > 500) throw new HubGoogleAdsApiException('campaign_template_limit_exceeded', 422);
    $ads = [];
    foreach ($adRows as $row) {
        $campaignId = (string)($row['campaign']['id'] ?? '');
        if (!isset($candidates[$campaignId]) || !is_array($row['adGroupAd'] ?? null)) continue;
        if ((string)($row['adGroup']['id'] ?? '') !== (string)$candidates[$campaignId]['source_ad_group']['id']) continue;
        $ads[$campaignId][] = $row['adGroupAd'];
    }
    foreach ($candidates as $id => &$candidate) {
        $rows = $ads[$id] ?? [];
        if (count($rows) !== 1 || ($rows[0]['status'] ?? null) !== 'ENABLED'
            || ($rows[0]['ad']['type'] ?? null) !== 'RESPONSIVE_SEARCH_AD'
            || preg_match('/^[1-9][0-9]{0,19}$/D', (string)($rows[0]['ad']['id'] ?? '')) !== 1) {
            unset($candidates[$id]); continue;
        }
        $candidate['source_ad'] = [
            'id' => (string)$rows[0]['ad']['id'],
            'tracking_settings' => [
                'tracking_url_template' => $rows[0]['ad']['trackingUrlTemplate'] ?? null,
                'final_url_suffix' => $rows[0]['ad']['finalUrlSuffix'] ?? null,
                'url_custom_parameters' => $rows[0]['ad']['urlCustomParameters'] ?? [],
            ],
        ];
    }
    unset($candidate);
    if (!$candidates) return ['currency_code' => $currency, 'templates' => []];

    $idsSql = implode(', ', array_keys($candidates));
    $criterionRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, campaign_criterion.type, campaign_criterion.status, campaign_criterion.negative, campaign_criterion.location.geo_target_constant, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign.id IN ($idsSql) AND campaign_criterion.status != 'REMOVED' LIMIT 1001",
        $accessToken, $managerId);
    if (count($criterionRows) > 1000) throw new HubGoogleAdsApiException('campaign_template_limit_exceeded', 422);
    $campaignCriteria = [];
    foreach ($criterionRows as $row) {
        $campaignId = (string)($row['campaign']['id'] ?? '');
        if (!isset($candidates[$campaignId])) continue;
        $criterion = $row['campaignCriterion'] ?? [];
        if (!is_array($criterion) || ($criterion['status'] ?? null) !== 'ENABLED') {
            $candidates[$campaignId]['unsupported_targeting'] = true; continue;
        }
        $type = $criterion['type'] ?? null;
        $negative = ($criterion['negative'] ?? false) === true;
        if ($type === 'LOCATION') {
            $geo = (string)($criterion['location']['geoTargetConstant'] ?? '');
            if (preg_match('#^geoTargetConstants/[1-9][0-9]{0,19}$#D', $geo) !== 1) {
                $candidates[$campaignId]['unsupported_targeting'] = true; continue;
            }
            $campaignCriteria[$campaignId][] = ['type' => 'LOCATION', 'negative' => $negative, 'geo_target_constant' => $geo];
        } elseif ($type === 'KEYWORD') {
            $text = $criterion['keyword']['text'] ?? null;
            $matchType = $criterion['keyword']['matchType'] ?? null;
            if (!is_string($text) || $text === '' || !in_array($matchType, ['EXACT', 'PHRASE', 'BROAD'], true) || !$negative) {
                $candidates[$campaignId]['unsupported_targeting'] = true; continue;
            }
            $campaignCriteria[$campaignId][] = ['type' => 'KEYWORD', 'negative' => true, 'text' => $text, 'match_type' => $matchType];
        } else {
            $candidates[$campaignId]['unsupported_targeting'] = true;
        }
    }

    $idsSql = implode(', ', array_keys($candidates));
    $keywordRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, ad_group.id, ad_group_criterion.type, ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE campaign.id IN ($idsSql) AND ad_group_criterion.status != 'REMOVED' LIMIT 2001",
        $accessToken, $managerId);
    if (count($keywordRows) > 2000) throw new HubGoogleAdsApiException('campaign_template_limit_exceeded', 422);
    $keywords = [];
    foreach ($keywordRows as $row) {
        $campaignId = (string)($row['campaign']['id'] ?? '');
        if (!isset($candidates[$campaignId])) continue;
        $criterion = $row['adGroupCriterion'] ?? [];
        $groupId = (string)($row['adGroup']['id'] ?? '');
        if (!is_array($criterion) || $groupId !== (string)$candidates[$campaignId]['source_ad_group']['id']) continue;
        if (($criterion['type'] ?? null) !== 'KEYWORD'
            || ($criterion['status'] ?? null) !== 'ENABLED'
            || ($criterion['negative'] ?? false) !== false
            || !is_string($criterion['keyword']['text'] ?? null)
            || trim($criterion['keyword']['text']) === ''
            || !in_array($criterion['keyword']['matchType'] ?? null, ['EXACT', 'PHRASE', 'BROAD'], true)) {
            $candidates[$campaignId]['unsupported_keywords'] = true; continue;
        }
        $keywords[$campaignId][] = [
            'text' => (string)$criterion['keyword']['text'],
            'match_type' => (string)$criterion['keyword']['matchType'],
        ];
    }

    $templates = [];
    foreach ($candidates as $id => $candidate) {
        $criteria = $campaignCriteria[$id] ?? [];
        $positiveLocations = array_filter($criteria, static fn(array $item): bool => $item['type'] === 'LOCATION' && $item['negative'] === false);
        $templateKeywords = $keywords[$id] ?? [];
        if (!empty($candidate['unsupported_targeting']) || !empty($candidate['unsupported_keywords'])
            || !$positiveLocations || !$templateKeywords || count($templateKeywords) > 500 || count($criteria) > 500) continue;
        $candidate['campaign_criteria'] = $criteria;
        $candidate['keywords'] = $templateKeywords;
        unset($candidate['unsupported_targeting'], $candidate['unsupported_keywords']);
        $templates[] = $candidate;
    }
    usort($templates, static fn(array $a, array $b): int => strcasecmp($a['campaign_name'], $b['campaign_name']));
    return ['currency_code' => $currency, 'templates' => $templates];
}

function hub_google_ads_campaign_creation_validate_payload(array $payload, bool $confirmRequired): array
{
    $expected = ['bidding_settings', 'bidding_strategy', 'campaign_name', 'contains_eu_political_advertising', 'customer_id', 'daily_budget', 'descriptions', 'final_url', 'final_url_suffix', 'geo_target_country_codes', 'headlines', 'keyword_match_type', 'keywords', 'manager_customer_id', 'max_cpc_bid', 'network_settings', 'negative_keyword_match_type', 'negative_keywords', 'operation', 'promotion', 'tracking_url_template'];
    if ($confirmRequired) $expected[] = 'confirm';
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    if ($keys !== $expected || ($confirmRequired && ($payload['confirm'] ?? null) !== true)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
    $name = $payload['campaign_name'];
    $url = $payload['final_url'];
    if ($managerId === null || $customerId === null
        || !is_string($name) || trim($name) !== $name || $name === '' || hub_google_ads_campaign_creation_text_length($name) > 128
        || preg_match('/[\x00-\x1F\x7F]/', $name) === 1
        || !is_string($url) || strlen($url) > 2048 || filter_var($url, FILTER_VALIDATE_URL) === false
        || strtolower((string)parse_url($url, PHP_URL_SCHEME)) !== 'https'
        || !is_string(parse_url($url, PHP_URL_HOST))) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $dailyBudgetMicros = hub_google_ads_campaign_creation_decimal_micros($payload['daily_budget']);
    $biddingStrategy = $payload['bidding_strategy'] ?? null;
    $allowedBiddingStrategies = ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS', 'TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE', 'MAXIMIZE_CLICKS', 'TARGET_IMPRESSION_SHARE', 'MANUAL_CPC'];
    $bidding = $payload['bidding_settings'] ?? null;
    $expectedBiddingKeys = ['impression_share_location', 'impression_share_percent', 'target_cpa', 'target_cpa_currency', 'target_roas_percent'];
    if (!is_array($bidding)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $biddingKeys = array_keys($bidding); sort($biddingKeys, SORT_STRING); sort($expectedBiddingKeys, SORT_STRING);
    if ($biddingKeys !== $expectedBiddingKeys
        || !in_array($biddingStrategy, $allowedBiddingStrategies, true)
        || !is_string($payload['max_cpc_bid'] ?? null)
        || !is_string($bidding['target_cpa'] ?? null)
        || !is_string($bidding['target_cpa_currency'] ?? null)
        || !is_string($bidding['target_roas_percent'] ?? null)
        || !is_string($bidding['impression_share_location'] ?? null)
        || !is_string($bidding['impression_share_percent'] ?? null)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $maxCpcValue = $payload['max_cpc_bid'];
    $maxCpcBidMicros = $maxCpcValue === '' ? null : hub_google_ads_campaign_creation_decimal_micros($maxCpcValue);
    $targetCpaValue = $bidding['target_cpa'];
    $targetCpaCurrency = strtoupper($bidding['target_cpa_currency']);
    $targetCpaMicros = $targetCpaValue === '' ? null : hub_google_ads_campaign_creation_decimal_micros($targetCpaValue);
    $targetRoasPercentValue = $bidding['target_roas_percent'];
    $targetRoas = $targetRoasPercentValue === '' ? null : (float)$targetRoasPercentValue / 100;
    $impressionLocation = $bidding['impression_share_location'];
    $impressionPercentValue = $bidding['impression_share_percent'];
    $usesCpa = in_array($biddingStrategy, ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'], true);
    $needsCpa = $biddingStrategy === 'TARGET_CPA';
    $usesRoas = in_array($biddingStrategy, ['TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE'], true);
    $needsRoas = $biddingStrategy === 'TARGET_ROAS';
    $usesMaxCpc = in_array($biddingStrategy, ['MANUAL_CPC', 'MAXIMIZE_CLICKS', 'TARGET_IMPRESSION_SHARE'], true);
    $needsMaxCpc = in_array($biddingStrategy, ['MANUAL_CPC', 'TARGET_IMPRESSION_SHARE'], true);
    $usesImpressionShare = $biddingStrategy === 'TARGET_IMPRESSION_SHARE';
    $validMaxCpc = $maxCpcValue === ''
        ? !$needsMaxCpc
        : ($usesMaxCpc && $maxCpcBidMicros !== null && $maxCpcBidMicros !== '0');
    $validTargetCpa = $targetCpaValue === ''
        ? !$needsCpa
        : ($usesCpa && $targetCpaMicros !== null && $targetCpaMicros !== '0');
    $validTargetRoas = $targetRoasPercentValue === ''
        ? !$needsRoas
        : ($usesRoas && preg_match('/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/D', $targetRoasPercentValue) === 1 && $targetRoas > 0);
    $validImpressionShare = $usesImpressionShare
        ? (in_array($impressionLocation, ['ANYWHERE_ON_PAGE', 'TOP_OF_PAGE', 'ABSOLUTE_TOP_OF_PAGE'], true)
            && preg_match('/^(?:[1-9]|[1-9]\d|100)$/D', $impressionPercentValue) === 1)
        : ($impressionLocation === '' && $impressionPercentValue === '');
    if ($dailyBudgetMicros === null || $dailyBudgetMicros === '0'
        || !$validMaxCpc || !$validTargetCpa || !$validTargetRoas || !$validImpressionShare
        || (!$usesCpa && ($targetCpaValue !== '' || $targetCpaCurrency !== ''))
        || ($usesCpa && $targetCpaCurrency !== '' && preg_match('/^[A-Z]{3}$/D', $targetCpaCurrency) !== 1)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $countryCodes = $payload['geo_target_country_codes'];
    if (!is_array($countryCodes) || !array_is_list($countryCodes) || count($countryCodes) < 1 || count($countryCodes) > 20) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $countrySeen = [];
    foreach ($countryCodes as $code) {
        if (!is_string($code) || preg_match('/^[A-Z]{2}$/D', $code) !== 1 || isset($countrySeen[$code])) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $countrySeen[$code] = true;
    }
    $networkSettings = $payload['network_settings'] ?? null;
    if (!is_array($networkSettings)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $networkKeys = array_keys($networkSettings); sort($networkKeys, SORT_STRING);
    if ($networkKeys !== ['target_content_network', 'target_search_network']
        || !is_bool($networkSettings['target_search_network'] ?? null)
        || !is_bool($networkSettings['target_content_network'] ?? null)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $politicalDeclaration = $payload['contains_eu_political_advertising'] ?? null;
    if (!in_array($politicalDeclaration, ['DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING', 'CONTAINS_EU_POLITICAL_ADVERTISING'], true)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $trackingTemplate = $payload['tracking_url_template'] ?? null;
    $urlSuffix = $payload['final_url_suffix'] ?? null;
    if (!is_string($trackingTemplate) || strlen($trackingTemplate) > 2048 || preg_match('/[\x00-\x1F\x7F]/', $trackingTemplate) === 1
        || ($trackingTemplate !== '' && (strtolower((string)parse_url($trackingTemplate, PHP_URL_SCHEME)) !== 'https'
            || !is_string(parse_url($trackingTemplate, PHP_URL_HOST))))
        || !is_string($urlSuffix) || strlen($urlSuffix) > 1024 || preg_match('/[\x00-\x1F\x7F]/', $urlSuffix) === 1
        || str_starts_with($urlSuffix, '?')) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $keywordMatchType = $payload['keyword_match_type'] ?? null;
    $negativeKeywordMatchType = $payload['negative_keyword_match_type'] ?? null;
    if (!in_array($keywordMatchType, ['EXACT', 'PHRASE', 'BROAD'], true)
        || !in_array($negativeKeywordMatchType, ['EXACT', 'PHRASE', 'BROAD'], true)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $normalizeKeywords = static function (mixed $items, bool $required): array {
        if (!is_array($items) || !array_is_list($items) || count($items) > 100 || ($required && count($items) < 1)) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $seen = [];
        foreach ($items as $item) {
            if (!is_string($item) || trim($item) !== $item || $item === '' || hub_google_ads_campaign_creation_text_length($item) > 80
                || preg_match('/[\x00-\x1F\x7F]/', $item) === 1) {
                throw new HubGoogleAdsApiException('invalid_payload', 400);
            }
            $key = hub_google_ads_campaign_creation_lower($item);
            if (isset($seen[$key])) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $seen[$key] = true;
        }
        return $items;
    };
    $keywords = $normalizeKeywords($payload['keywords'] ?? null, true);
    $negativeKeywords = $normalizeKeywords($payload['negative_keywords'] ?? null, false);
    foreach ([['headlines', 10, 30], ['descriptions', 3, 90]] as [$field, $count, $maxLength]) {
        $items = $payload[$field] ?? null;
        if (!is_array($items) || !array_is_list($items) || count($items) !== $count) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $seen = [];
        foreach ($items as $item) {
            if (!is_string($item) || trim($item) !== $item || $item === '' || preg_match('/[\x00-\x1F\x7F]/', $item) === 1
                || hub_google_ads_campaign_creation_text_length($item) > $maxLength) {
                throw new HubGoogleAdsApiException('invalid_payload', 400);
            }
            $normalized = hub_google_ads_campaign_creation_lower($item);
            if (isset($seen[$normalized])) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $seen[$normalized] = true;
        }
    }
    $promotion = $payload['promotion'] ?? null;
    if (!is_array($promotion)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $promoKeys = array_keys($promotion); sort($promoKeys, SORT_STRING);
    $expectedPromo = ['discount_type', 'discount_value', 'end_date', 'language_code', 'occasion', 'start_date', 'target', 'trigger_type', 'trigger_value']; sort($expectedPromo, SORT_STRING);
    $promotionOccasions = [
        'BACK_TO_SCHOOL', 'BLACK_FRIDAY', 'BOXING_DAY', 'CARNIVAL', 'CHINESE_NEW_YEAR', 'CHRISTMAS',
        'CYBER_MONDAY', 'DIWALI', 'EASTER', 'EID_AL_ADHA', 'EID_AL_FITR', 'END_OF_SEASON', 'EPIPHANY',
        'FALL_SALE', 'FATHERS_DAY', 'HALLOWEEN', 'HANUKKAH', 'HOLI', 'INDEPENDENCE_DAY', 'LABOR_DAY',
        'MOTHERS_DAY', 'NATIONAL_DAY', 'NAVRATRI', 'NEW_YEARS', 'PARENTS_DAY', 'PASSOVER', 'RAMADAN',
        'ROSH_HASHANAH', 'SINGLES_DAY', 'SONGKRAN', 'SPRING_SALE', 'ST_NICHOLAS_DAY', 'SUMMER_SALE',
        'VALENTINES_DAY', 'WINTER_SALE', 'WOMENS_DAY', 'YEAR_END_GIFT',
    ];
    $occasion = $promotion['occasion'] ?? null;
    if ($promoKeys !== $expectedPromo
        || !is_string($promotion['target'] ?? null) || trim($promotion['target']) !== ($promotion['target'] ?? null)
        || $promotion['target'] === '' || hub_google_ads_campaign_creation_text_length($promotion['target']) > 20
        || ($occasion !== null && !in_array($occasion, $promotionOccasions, true))
        || !in_array($promotion['discount_type'] ?? null, ['percent_off', 'amount_off'], true)
        || !is_string($promotion['discount_value'] ?? null)
        || !in_array($promotion['trigger_type'] ?? null, ['none', 'promotion_code', 'orders_over_amount'], true)
        || !is_string($promotion['trigger_value'] ?? null)
        || ($promotion['trigger_type'] === 'none' && $promotion['trigger_value'] !== '')
        || !is_string($promotion['language_code'] ?? null)
        || preg_match('/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/D', $promotion['language_code']) !== 1) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $startDate = $promotion['start_date']; $endDate = $promotion['end_date'];
    if (($startDate === null) !== ($endDate === null)
        || ($startDate !== null && (!is_string($startDate) || preg_match('/^\d{4}-\d{2}-\d{2}$/D', $startDate) !== 1
            || !is_string($endDate) || preg_match('/^\d{4}-\d{2}-\d{2}$/D', $endDate) !== 1
            || !checkdate((int)substr($startDate, 5, 2), (int)substr($startDate, 8, 2), (int)substr($startDate, 0, 4))
            || !checkdate((int)substr($endDate, 5, 2), (int)substr($endDate, 8, 2), (int)substr($endDate, 0, 4))
            || $endDate < $startDate))) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    if ($promotion['discount_type'] === 'percent_off') {
        if (preg_match('/^(?:[1-9]|[1-9][0-9]|100)$/D', $promotion['discount_value']) !== 1) throw new HubGoogleAdsApiException('invalid_payload', 400);
    } elseif (hub_google_ads_campaign_creation_decimal_micros($promotion['discount_value']) === null
        || hub_google_ads_campaign_creation_decimal_micros($promotion['discount_value']) === '0') {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    if ($promotion['trigger_type'] === 'promotion_code') {
        if (preg_match('/^[A-Za-z0-9-]{1,20}$/D', $promotion['trigger_value']) !== 1) throw new HubGoogleAdsApiException('invalid_payload', 400);
    } elseif ($promotion['trigger_type'] === 'orders_over_amount' && (hub_google_ads_campaign_creation_decimal_micros($promotion['trigger_value']) === null
        || hub_google_ads_campaign_creation_decimal_micros($promotion['trigger_value']) === '0')) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    return [
        $managerId, $customerId, $name, $url, $payload['headlines'], $payload['descriptions'], $promotion,
        [
            'daily_budget_micros' => $dailyBudgetMicros,
            'max_cpc_bid_micros' => $maxCpcBidMicros,
            'bidding_strategy' => $biddingStrategy,
            'target_cpa_micros' => $targetCpaMicros,
            'target_cpa_currency' => $targetCpaCurrency,
            'target_roas' => $targetRoas,
            'impression_share_location' => $usesImpressionShare ? $impressionLocation : null,
            'impression_share_percent' => $usesImpressionShare ? (int)$impressionPercentValue : null,
            'country_codes' => $countryCodes,
            'keywords' => $keywords,
            'keyword_match_type' => $keywordMatchType,
            'negative_keywords' => $negativeKeywords,
            'negative_keyword_match_type' => $negativeKeywordMatchType,
            'network_settings' => [
                'target_google_search' => true,
                'target_search_network' => $networkSettings['target_search_network'],
                'target_partner_search_network' => false,
                'target_content_network' => $networkSettings['target_content_network'],
            ],
            'contains_eu_political_advertising' => $politicalDeclaration,
            'tracking_settings' => [
                'tracking_url_template' => $trackingTemplate,
                'final_url_suffix' => $urlSuffix,
            ],
        ],
    ];
}

/** Validate a single, explicit request to add audience IDs to a paused Hub-created Search campaign. */
function hub_google_ads_campaign_audience_targeting_validate_payload(array $payload): array
{
    $expected = ['ad_group_id', 'audience_ids', 'campaign_id', 'confirm', 'customer_id', 'manager_customer_id', 'operation'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $campaignId = $payload['campaign_id'] ?? null;
    $adGroupId = $payload['ad_group_id'] ?? null;
    $audienceIds = $payload['audience_ids'] ?? null;
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'apply_audience_targeting'
        || ($payload['confirm'] ?? null) !== true
        || $managerId === null || $customerId === null
        || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
        || !is_string($adGroupId) || preg_match('/^[1-9][0-9]{0,19}$/D', $adGroupId) !== 1
        || !is_array($audienceIds) || !array_is_list($audienceIds)
        || count($audienceIds) < 1 || count($audienceIds) > 1000) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $seen = [];
    foreach ($audienceIds as $audienceId) {
        if (!is_string($audienceId) || preg_match('/^[1-9][0-9]{0,19}$/D', $audienceId) !== 1 || isset($seen[$audienceId])) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $seen[$audienceId] = true;
    }
    return [$managerId, $customerId, $campaignId, $adGroupId, $audienceIds];
}

/** Load the fixed user-interest/user-list IDs without exposing them to the Hub client. */
function hub_google_ads_campaign_configured_audience_ids(): array
{
    $path = __DIR__ . '/google-ads-audience-targeting-ids.json';
    if (!is_file($path) || !is_readable($path)) {
        throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    }
    $json = file_get_contents($path);
    if (!is_string($json) || $json === '') {
        throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    }
    try {
        $ids = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    } catch (Throwable $error) {
        throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    }
    if (!is_array($ids) || !array_is_list($ids) || count($ids) !== 918) {
        throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    }
    $seen = [];
    foreach ($ids as $id) {
        if (!is_string($id) || preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1 || isset($seen[$id])) {
            throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
        }
        $seen[$id] = true;
    }
    return $ids;
}

/** Accept no audience IDs from the browser; the fixed private list is authoritative. */
function hub_google_ads_campaign_configured_audience_targeting_validate_payload(array $payload): array
{
    $expected = ['ad_group_id', 'campaign_id', 'confirm', 'customer_id', 'manager_customer_id', 'operation'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'apply_configured_audience_targeting'
        || ($payload['confirm'] ?? null) !== true) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $payload['operation'] = 'apply_audience_targeting';
    $payload['audience_ids'] = hub_google_ads_campaign_configured_audience_ids();
    return hub_google_ads_campaign_audience_targeting_validate_payload($payload);
}

/** Add the imported IDs as positive user-interest/user-list criteria in Targeting mode. */
function hub_google_ads_campaign_audience_targeting_apply(
    array $config,
    string $managerId,
    string $customerId,
    string $campaignId,
    string $adGroupId,
    array $audienceIds
): array {
    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);
    $targetQuery = 'SELECT campaign.id, campaign.status, campaign.advertising_channel_type, ad_group.id, ad_group.status, ad_group.targeting_setting.target_restrictions'
        . ' FROM ad_group WHERE ad_group.id = ' . $adGroupId . ' LIMIT 2';
    $targetRows = hub_google_ads_search($customerId, $targetQuery, $accessToken, $managerId);
    if (count($targetRows) !== 1 || !is_array($targetRows[0]['campaign'] ?? null) || !is_array($targetRows[0]['adGroup'] ?? null)) {
        throw new HubGoogleAdsApiException('audience_targeting_target_unavailable', 404);
    }
    $campaign = $targetRows[0]['campaign'];
    $adGroup = $targetRows[0]['adGroup'];
    if ((string)($campaign['id'] ?? '') !== $campaignId || (string)($adGroup['id'] ?? '') !== $adGroupId) {
        throw new HubGoogleAdsApiException('audience_targeting_target_mismatch', 409);
    }
    if (($campaign['status'] ?? null) !== 'PAUSED'
        || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH'
        || ($adGroup['status'] ?? null) !== 'ENABLED') {
        throw new HubGoogleAdsApiException('audience_targeting_campaign_must_be_paused', 409);
    }

    $idsSql = implode(', ', $audienceIds);
    $catalog = [];
    $interestRows = hub_google_ads_search($customerId,
        'SELECT user_interest.user_interest_id, user_interest.resource_name FROM user_interest WHERE user_interest.user_interest_id IN (' . $idsSql . ') LIMIT 1001',
        $accessToken, $managerId);
    foreach ($interestRows as $row) {
        $interest = $row['userInterest'] ?? null;
        if (!is_array($interest)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $id = (string)($interest['userInterestId'] ?? '');
        $resourceName = $interest['resourceName'] ?? null;
        if (!is_string($resourceName) || preg_match('#^customers/' . preg_quote($customerId, '#') . '/userInterests/([1-9][0-9]{0,19})$#D', $resourceName, $matches) !== 1
            || $id !== $matches[1] || !in_array($id, $audienceIds, true)) {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }
        $catalog[$id][] = ['kind' => 'user_interest', 'resource_name' => $resourceName];
    }
    $listRows = hub_google_ads_search($customerId,
        'SELECT user_list.id, user_list.resource_name FROM user_list WHERE user_list.id IN (' . $idsSql . ') LIMIT 1001',
        $accessToken, $managerId);
    foreach ($listRows as $row) {
        $list = $row['userList'] ?? null;
        if (!is_array($list)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $id = (string)($list['id'] ?? '');
        $resourceName = $list['resourceName'] ?? null;
        if (!is_string($resourceName) || preg_match('#^customers/' . preg_quote($customerId, '#') . '/userLists/([1-9][0-9]{0,19})$#D', $resourceName, $matches) !== 1
            || $id !== $matches[1] || !in_array($id, $audienceIds, true)) {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }
        $catalog[$id][] = ['kind' => 'user_list', 'resource_name' => $resourceName];
    }

    $adGroupResource = 'customers/' . $customerId . '/adGroups/' . $adGroupId;
    $candidateResources = ['USER_INTEREST' => [], 'USER_LIST' => []];
    foreach ($catalog as $matches) {
        foreach ($matches as $match) {
            $type = $match['kind'] === 'user_interest' ? 'USER_INTEREST' : 'USER_LIST';
            $candidateResources[$type][$match['resource_name']] = $match['resource_name'];
        }
    }
    $candidateFilters = [];
    if ($candidateResources['USER_INTEREST']) {
        $values = array_map('hub_google_ads_campaign_creation_gaql_string', array_values($candidateResources['USER_INTEREST']));
        $candidateFilters[] = "(ad_group_criterion.type = 'USER_INTEREST' AND ad_group_criterion.user_interest.user_interest_category IN (" . implode(', ', $values) . '))';
    }
    if ($candidateResources['USER_LIST']) {
        $values = array_map('hub_google_ads_campaign_creation_gaql_string', array_values($candidateResources['USER_LIST']));
        $candidateFilters[] = "(ad_group_criterion.type = 'USER_LIST' AND ad_group_criterion.user_list.user_list IN (" . implode(', ', $values) . '))';
    }
    $existingRows = $candidateFilters
        ? hub_google_ads_search($customerId,
            "SELECT ad_group_criterion.type, ad_group_criterion.user_interest.user_interest_category, ad_group_criterion.user_list.user_list FROM ad_group_criterion WHERE ad_group.id = " . $adGroupId . " AND ad_group_criterion.status != 'REMOVED' AND (" . implode(' OR ', $candidateFilters) . ') LIMIT 2001',
            $accessToken, $managerId)
        : [];
    if (count($existingRows) > 2000) throw new HubGoogleAdsApiException('audience_targeting_unverified', 502);
    $existing = [];
    foreach ($existingRows as $row) {
        $criterion = $row['adGroupCriterion'] ?? null;
        if (!is_array($criterion)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $kind = $criterion['type'] ?? null;
        $resourceName = $kind === 'USER_INTEREST'
            ? ($criterion['userInterest']['userInterestCategory'] ?? null)
            : ($kind === 'USER_LIST' ? ($criterion['userList']['userList'] ?? null) : null);
        if (!is_string($resourceName)) continue;
        if (preg_match('#^customers/' . preg_quote($customerId, '#') . '/userInterests/([1-9][0-9]{0,19})$#D', $resourceName, $matches) === 1) {
            $existing['user_interest:' . $matches[1]] = true;
        } elseif (preg_match('#^customers/' . preg_quote($customerId, '#') . '/userLists/([1-9][0-9]{0,19})$#D', $resourceName, $matches) === 1) {
            $existing['user_list:' . $matches[1]] = true;
        }
    }

    $operations = [];
    $eligible = [];
    $unrecognizedCount = 0;
    $ambiguousCount = 0;
    $alreadyPresentCount = 0;
    foreach ($audienceIds as $id) {
        $matches = $catalog[$id] ?? [];
        if (!$matches) { $unrecognizedCount++; continue; }
        if (count($matches) !== 1) { $ambiguousCount++; continue; }
        $match = $matches[0];
        $key = $match['kind'] . ':' . $id;
        if (isset($existing[$key])) { $alreadyPresentCount++; continue; }
        $eligible[$key] = $match;
        if ($match['kind'] === 'user_interest') {
            $operations[] = ['adGroupCriterionOperation' => ['create' => [
                'adGroup' => $adGroupResource,
                'status' => 'ENABLED',
                'userInterest' => ['userInterestCategory' => $match['resource_name']],
            ]]];
        } else {
            $operations[] = ['adGroupCriterionOperation' => ['create' => [
                'adGroup' => $adGroupResource,
                'status' => 'ENABLED',
                'userList' => ['userList' => $match['resource_name']],
            ]]];
        }
    }

    $restrictions = $adGroup['targetingSetting']['targetRestrictions'] ?? [];
    if (!is_array($restrictions)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    $audienceRestriction = null;
    foreach ($restrictions as $restriction) {
        if (!is_array($restriction)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        if (($restriction['targetingDimension'] ?? null) === 'AUDIENCE') $audienceRestriction = $restriction;
    }
    $targetingSettingNeedsUpdate = ($audienceRestriction['bidOnly'] ?? false) === true;
    if ($targetingSettingNeedsUpdate) {
        $nextRestrictions = array_values(array_filter($restrictions, static fn(array $item): bool => ($item['targetingDimension'] ?? null) !== 'AUDIENCE'));
        $nextRestrictions[] = ['targetingDimension' => 'AUDIENCE', 'bidOnly' => false];
        array_unshift($operations, ['adGroupOperation' => [
            'update' => ['resourceName' => $adGroupResource, 'targetingSetting' => ['targetRestrictions' => $nextRestrictions]],
            'updateMask' => 'targetingSetting.targetRestrictions',
        ]]);
    }

    $acceptedCount = 0;
    if ($operations) {
        $response = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $accessToken,
            json_encode(['mutateOperations' => $operations, 'partialFailure' => true], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
        $results = $response['mutateOperationResponses'] ?? null;
        if (!is_array($results) || count($results) !== count($operations)) throw new HubGoogleAdsApiException('audience_targeting_unverified', 502);
        foreach ($results as $result) {
            if (isset($result['adGroupCriterionResult']['resourceName'])) $acceptedCount++;
        }
    }

    $verifiedCount = 0;
    $targetingSettingVerified = false;
    $verificationAvailable = true;
    try {
        $verificationRows = $candidateFilters
            ? hub_google_ads_search($customerId,
                "SELECT ad_group.targeting_setting.target_restrictions, ad_group_criterion.type, ad_group_criterion.user_interest.user_interest_category, ad_group_criterion.user_list.user_list FROM ad_group_criterion WHERE ad_group.id = " . $adGroupId . " AND ad_group_criterion.status != 'REMOVED' AND (" . implode(' OR ', $candidateFilters) . ') LIMIT 2001',
                $accessToken, $managerId)
            : [];
        if (count($verificationRows) > 2000) throw new HubGoogleAdsApiException('audience_targeting_unverified', 502);
        $verified = [];
        foreach ($verificationRows as $row) {
            $criterion = $row['adGroupCriterion'] ?? null;
            $group = $row['adGroup'] ?? null;
            if (!is_array($criterion) || !is_array($group)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            foreach (($group['targetingSetting']['targetRestrictions'] ?? []) as $restriction) {
                if (($restriction['targetingDimension'] ?? null) === 'AUDIENCE' && ($restriction['bidOnly'] ?? false) === false) {
                    $targetingSettingVerified = true;
                }
            }
            $kind = $criterion['type'] ?? null;
            $resourceName = $kind === 'USER_INTEREST'
                ? ($criterion['userInterest']['userInterestCategory'] ?? null)
                : ($kind === 'USER_LIST' ? ($criterion['userList']['userList'] ?? null) : null);
            if (is_string($resourceName)) $verified[$resourceName] = true;
        }
        if (!$verificationRows && $targetingSettingNeedsUpdate) {
            $settingRows = hub_google_ads_search($customerId, $targetQuery, $accessToken, $managerId);
            if (count($settingRows) !== 1 || !is_array($settingRows[0]['adGroup'] ?? null)) {
                throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            }
            $postRestrictions = $settingRows[0]['adGroup']['targetingSetting']['targetRestrictions'] ?? [];
            if (!is_array($postRestrictions)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $targetingSettingVerified = true;
            foreach ($postRestrictions as $restriction) {
                if (!is_array($restriction)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
                if (($restriction['targetingDimension'] ?? null) === 'AUDIENCE' && ($restriction['bidOnly'] ?? false) === true) {
                    $targetingSettingVerified = false;
                }
            }
        }
        if (!$targetingSettingVerified && $audienceRestriction === null && !$targetingSettingNeedsUpdate) {
            // Google Ads API defaults an omitted AUDIENCE restriction to Targeting (bid_only=false).
            $targetingSettingVerified = true;
        }
        foreach ($eligible as $match) if (isset($verified[$match['resource_name']])) $verifiedCount++;
        $targetingSettingVerified = $targetingSettingVerified || (!$eligible && !$targetingSettingNeedsUpdate);
    } catch (Throwable $error) {
        $verificationAvailable = false;
    }
    $failedCount = max(0, count($eligible) - $acceptedCount);
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'apply_audience_targeting',
        'campaign_id' => $campaignId,
        'ad_group_id' => $adGroupId,
        'targeting_mode' => 'TARGETING',
        'submitted_count' => count($audienceIds),
        'eligible_count' => count($eligible),
        'applied_count' => $acceptedCount,
        'verified_count' => $verifiedCount,
        'already_present_count' => $alreadyPresentCount,
        'unrecognized_count' => $unrecognizedCount,
        'ambiguous_count' => $ambiguousCount,
        'failed_count' => $failedCount,
        'targeting_setting_verified' => $targetingSettingVerified,
        'verification_available' => $verificationAvailable,
        'verified' => $verificationAvailable && $verifiedCount === count($eligible) && $targetingSettingVerified,
        'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

/** The fixed exclusion list with official Google Ads audience criterion IDs. */
function hub_google_ads_campaign_audience_exclusion_catalog(): array
{
    return [
        ['name' => 'Usuários avançados de serviços em nuvem', 'id' => '92931'],
        ['name' => 'Empregos em marketing e vendas', 'id' => '80422'],
        ['name' => 'Armazenamento em nuvem e dados hospedados', 'id' => '80538'],
        ['name' => 'Serviços de SEO e SEM', 'id' => '80529'],
        ['name' => 'Serviços de e-mail marketing', 'id' => '80528'],
        ['name' => 'Serviços de publicidade e marketing', 'id' => '80517'],
        ['name' => 'Soluções de CRM', 'id' => '80535'],
        ['name' => 'Registro de domínio', 'id' => '80542'],
        ['name' => 'Hospedagem na web', 'id' => '80544'],
        ['name' => 'Desenvolvimento de websites e webdesign', 'id' => '80543'],
        ['name' => 'Softwares empresariais', 'id' => '80279'],
        ['name' => 'Tecnologia de negócios', 'id' => '80520'],
        ['name' => 'Serviços da web', 'id' => '80532'],
    ];
}

function hub_google_ads_campaign_audience_exclusion_upload_validate_payload(array $payload): array
{
    $expected = ['campaign_ids', 'customer_id', 'manager_customer_id', 'operation'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $campaignIds = $payload['campaign_ids'] ?? null;
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'audience_exclusion_upload_catalog'
        || $managerId === null || $customerId === null || !is_array($campaignIds)
        || count($campaignIds) < 1 || count($campaignIds) > 100) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $normalized = [];
    foreach ($campaignIds as $campaignId) {
        if (!is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $normalized[] = $campaignId;
    }
    if (count(array_unique($normalized)) !== count($normalized)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    return [$managerId, $customerId, $normalized];
}

function hub_google_ads_campaign_audience_exclusion_upload_catalog(): array
{
    $catalog = hub_google_ads_campaign_audience_exclusion_catalog();
    $audiences = [];
    foreach ($catalog as $item) {
        $id = is_string($item['id'] ?? null) ? $item['id'] : '';
        $name = '';
        if ($id === '') {
            $aliases = is_array($item['aliases'] ?? null) ? $item['aliases'] : [];
            $name = is_string($aliases[0] ?? null) && trim($aliases[0]) !== ''
                ? trim($aliases[0])
                : trim((string)($item['name'] ?? ''));
        }
        if (($id === '' && $name === '') || ($id !== '' && preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1)) {
            throw new HubGoogleAdsApiException('audience_exclusion_unverified', 500);
        }
        $audiences[] = ['id' => $id, 'name' => $name];
    }
    if (count($audiences) !== 13) throw new HubGoogleAdsApiException('audience_exclusion_unverified', 500);
    return $audiences;
}

/** Validate the saved ad-group targets for a local bulk-upload CSV. */
function hub_google_ads_campaign_audience_targeting_upload_validate_payload(
    array $payload,
    string $expectedOperation = 'audience_targeting_upload_csv'
): array
{
    $expected = ['groups', 'manager_customer_id', 'operation'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $groups = $payload['groups'] ?? null;
    if (!in_array($expectedOperation, ['audience_targeting_upload_csv', 'audience_targeting_upload_csv_stream'], true)
        || $keys !== $expected || ($payload['operation'] ?? null) !== $expectedOperation
        || $managerId === null || !is_array($groups) || !array_is_list($groups)
        || count($groups) < 1 || count($groups) > 1000 || count($groups) * 918 > 1000000) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }

    $normalized = [];
    $seen = [];
    foreach ($groups as $group) {
        if (!is_array($group)) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $groupKeys = array_keys($group); sort($groupKeys, SORT_STRING);
        if ($groupKeys !== ['ad_group_id', 'campaign_id', 'customer_id']) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $customerId = hub_google_ads_valid_customer_id($group['customer_id']);
        $campaignId = $group['campaign_id'];
        $adGroupId = $group['ad_group_id'];
        if ($customerId === null || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
            || !is_string($adGroupId) || preg_match('/^[1-9][0-9]{0,19}$/D', $adGroupId) !== 1) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $key = $customerId . ':' . $adGroupId;
        if (isset($seen[$key])) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $seen[$key] = true;
        $normalized[] = ['customer_id' => $customerId, 'campaign_id' => $campaignId, 'ad_group_id' => $adGroupId];
    }

    return [$managerId, $normalized];
}

/** Build the user's Apply Audience(s) CSV from the private, fixed 918-ID list. */
function hub_google_ads_campaign_audience_targeting_upload_csv(array $groups): string
{
    $audienceIds = hub_google_ads_campaign_configured_audience_ids();
    $stream = fopen('php://temp', 'w+');
    if ($stream === false) throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    $headers = ['Action', 'Customer ID', 'Campaign', 'Campaign ID', 'Ad group', 'Ad group ID', 'Audience status', 'Audience', 'Audience ID', 'Type', 'Level', 'Bid adj.'];
    if (fputcsv($stream, $headers, ',', '"', '\\', "\r\n") === false) {
        fclose($stream);
        throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    }
    foreach ($groups as $group) {
        foreach ($audienceIds as $audienceId) {
            $row = ['Add', $group['customer_id'], '', $group['campaign_id'], '', $group['ad_group_id'], '', '', $audienceId, '', 'Ad Group', ''];
            if (fputcsv($stream, $row, ',', '"', '\\', "\r\n") === false) {
                fclose($stream);
                throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
            }
        }
    }
    rewind($stream);
    $csv = stream_get_contents($stream);
    fclose($stream);
    if (!is_string($csv) || $csv === '') throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    return $csv;
}

/** Stream the same private audience CSV in group-sized chunks with real progress events. */
function hub_google_ads_campaign_audience_targeting_upload_csv_stream(string $managerId, array $groups): never
{
    $audienceIds = hub_google_ads_campaign_configured_audience_ids();
    if (count($audienceIds) !== 918) throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    $headers = ['Action', 'Customer ID', 'Campaign', 'Campaign ID', 'Ad group', 'Ad group ID', 'Audience status', 'Audience', 'Audience ID', 'Type', 'Level', 'Bid adj.'];
    $headerStream = fopen('php://temp', 'w+');
    if ($headerStream === false || fputcsv($headerStream, $headers, ',', '"', '\\', "\r\n") === false) {
        if (is_resource($headerStream)) fclose($headerStream);
        throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    }
    rewind($headerStream);
    $headerCsv = stream_get_contents($headerStream);
    fclose($headerStream);
    if (!is_string($headerCsv) || $headerCsv === '') throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);

    while (ob_get_level() > 0) {
        if (!@ob_end_clean()) break;
    }
    @ini_set('output_buffering', '0');
    @ini_set('zlib.output_compression', '0');
    header('Content-Type: application/x-ndjson; charset=utf-8');
    header('X-Accel-Buffering: no');
    header('Content-Encoding: identity');

    $operation = 'audience_targeting_upload_csv_stream';
    $groupCount = count($groups);
    $totalRows = $groupCount * count($audienceIds);
    $sendEvent = static function (array $event): void {
        $json = json_encode($event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($json)) throw new RuntimeException('Could not encode audience CSV progress event.');
        echo $json . "\n";
        flush();
    };
    $baseEvent = [
        'ok' => true,
        'schema_version' => 1,
        'operation' => $operation,
        'manager_customer_id' => $managerId,
        'audience_count' => count($audienceIds),
        'group_count' => $groupCount,
        'total_row_count' => $totalRows,
    ];

    try {
        $sendEvent($baseEvent + [
            'type' => 'progress',
            'completed_groups' => 0,
            'completed_rows' => 0,
            'csv_chunk' => $headerCsv,
        ]);
        foreach ($groups as $groupIndex => $group) {
            $stream = fopen('php://temp', 'w+');
            if ($stream === false) throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
            try {
                foreach ($audienceIds as $audienceId) {
                    $row = ['Add', $group['customer_id'], '', $group['campaign_id'], '', $group['ad_group_id'], '', '', $audienceId, '', 'Ad Group', ''];
                    if (fputcsv($stream, $row, ',', '"', '\\', "\r\n") === false) {
                        throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
                    }
                }
                rewind($stream);
                $csvChunk = stream_get_contents($stream);
            } finally {
                fclose($stream);
            }
            if (!is_string($csvChunk) || $csvChunk === '') throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
            $completedGroups = $groupIndex + 1;
            $sendEvent($baseEvent + [
                'type' => 'progress',
                'completed_groups' => $completedGroups,
                'completed_rows' => $completedGroups * count($audienceIds),
                'csv_chunk' => $csvChunk,
            ]);
        }
        $sendEvent($baseEvent + [
            'type' => 'complete',
            'completed_groups' => $groupCount,
            'completed_rows' => $totalRows,
        ]);
    } catch (HubGoogleAdsApiException $error) {
        $sendEvent(['ok' => false, 'type' => 'error', 'error' => $error->apiCode]);
    } catch (Throwable $error) {
        error_log('Google Ads audience-targeting CSV stream failed.');
        $sendEvent(['ok' => false, 'type' => 'error', 'error' => 'server_error']);
    }
    exit;
}

function hub_google_ads_campaign_audience_exclusions_validate_payload(array $payload): array
{
    $expected = ['campaign_id', 'confirm', 'customer_id', 'manager_customer_id', 'operation'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $campaignId = $payload['campaign_id'] ?? null;
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'apply_audience_exclusions'
        || ($payload['confirm'] ?? null) !== true || $managerId === null || $customerId === null
        || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    return [$managerId, $customerId, $campaignId];
}

function hub_google_ads_campaign_audience_exclusion_search_compatible(array $interest): bool
{
    if (($interest['launchedToAll'] ?? false) === true) return true;
    $availabilities = $interest['availabilities'] ?? null;
    if (!is_array($availabilities)) return false;
    foreach ($availabilities as $availability) {
        $channel = is_array($availability) ? ($availability['channel'] ?? null) : null;
        if (!is_array($channel)) continue;
        if (($channel['availabilityMode'] ?? null) === 'ALL_CHANNELS'
            || ($channel['advertisingChannelType'] ?? null) === 'SEARCH') return true;
    }
    return false;
}

/** Resolve the configured audience names/IDs, then add negative user-interest criteria to one paused Search campaign. */
function hub_google_ads_campaign_audience_exclusions_apply(
    array $config,
    string $managerId,
    string $customerId,
    string $campaignId
): array {
    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);
    $campaignQuery = 'SELECT campaign.id, campaign.status, campaign.advertising_channel_type, campaign.audience_setting.use_audience_grouped'
        . ' FROM campaign WHERE campaign.id = ' . $campaignId . ' LIMIT 2';
    $campaignRows = hub_google_ads_search($customerId, $campaignQuery, $accessToken, $managerId);
    if (count($campaignRows) !== 1 || !is_array($campaignRows[0]['campaign'] ?? null)) {
        throw new HubGoogleAdsApiException('audience_exclusion_target_unavailable', 404);
    }
    $campaign = $campaignRows[0]['campaign'];
    if ((string)($campaign['id'] ?? '') !== $campaignId) throw new HubGoogleAdsApiException('audience_exclusion_target_mismatch', 409);
    if (($campaign['status'] ?? null) !== 'PAUSED' || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH') {
        throw new HubGoogleAdsApiException('audience_exclusion_campaign_must_be_paused', 409);
    }
    if (($campaign['audienceSetting']['useAudienceGrouped'] ?? false) === true) {
        throw new HubGoogleAdsApiException('audience_exclusion_campaign_setting_incompatible', 409);
    }

    $configured = hub_google_ads_campaign_audience_exclusion_catalog();
    $knownIds = [];
    $nameFilters = [];
    foreach ($configured as $entry) {
        if ($entry['id'] !== null) $knownIds[$entry['id']] = $entry['id'];
        else foreach (array_merge([$entry['name']], $entry['aliases'] ?? []) as $candidateName) $nameFilters[$candidateName] = $candidateName;
    }
    $filters = [];
    if ($knownIds) $filters[] = 'user_interest.user_interest_id IN (' . implode(', ', array_values($knownIds)) . ')';
    if ($nameFilters) {
        $filters[] = 'user_interest.name IN (' . implode(', ', array_map('hub_google_ads_campaign_creation_gaql_string', $nameFilters)) . ')';
    }
    $interestRows = hub_google_ads_search($customerId,
        'SELECT user_interest.availabilities, user_interest.launched_to_all, user_interest.name, user_interest.resource_name, user_interest.user_interest_id'
            . ' FROM user_interest WHERE (' . implode(' OR ', $filters) . ') LIMIT 100',
        $accessToken, $managerId);
    if (count($interestRows) > 100) throw new HubGoogleAdsApiException('audience_exclusion_unverified', 502);
    $byId = [];
    $byName = [];
    foreach ($interestRows as $row) {
        $interest = $row['userInterest'] ?? null;
        if (!is_array($interest)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $id = (string)($interest['userInterestId'] ?? '');
        $name = $interest['name'] ?? null;
        $resourceName = $interest['resourceName'] ?? null;
        if (preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1
            || !is_string($name) || trim($name) === ''
            || !is_string($resourceName)
            || preg_match('#^customers/' . preg_quote($customerId, '#') . '/userInterests/' . preg_quote($id, '#') . '$#D', $resourceName) !== 1) {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }
        $byId[$id] = $interest;
        $normalizedName = hub_google_ads_campaign_creation_lower(trim($name));
        $normalizedName = preg_replace('/[^\\p{L}\\p{N}]+/u', ' ', $normalizedName) ?? $normalizedName;
        $normalizedName = trim(preg_replace('/\\s+/u', ' ', $normalizedName) ?? $normalizedName);
        $byName[$normalizedName][] = $interest;
    }

    $resolved = [];
    $unresolvedNames = [];
    $ambiguousNames = [];
    $unsupportedNames = [];
    foreach ($configured as $entry) {
        if ($entry['id'] !== null) {
            $interest = $byId[$entry['id']] ?? null;
            if (!is_array($interest)) { $unresolvedNames[] = $entry['name']; continue; }
            $resolutionSource = 'id';
        } else {
            $matches = [];
            foreach (array_merge([$entry['name']], $entry['aliases'] ?? []) as $candidateName) {
                $normalizedCandidate = hub_google_ads_campaign_creation_lower(trim($candidateName));
                $normalizedCandidate = preg_replace('/[^\\p{L}\\p{N}]+/u', ' ', $normalizedCandidate) ?? $normalizedCandidate;
                $normalizedCandidate = trim(preg_replace('/\\s+/u', ' ', $normalizedCandidate) ?? $normalizedCandidate);
                foreach ($byName[$normalizedCandidate] ?? [] as $candidateInterest) {
                    $matches[(string)($candidateInterest['resourceName'] ?? '')] = $candidateInterest;
                }
            }
            $matches = array_values($matches);
            if (!$matches) { $unresolvedNames[] = $entry['name']; continue; }
            if (count($matches) !== 1) { $ambiguousNames[] = $entry['name']; continue; }
            $interest = $matches[0];
            $resolutionSource = 'name';
        }
        if (!hub_google_ads_campaign_audience_exclusion_search_compatible($interest)) {
            $unsupportedNames[] = $entry['name'];
            continue;
        }
        $resolved[] = [
            'name' => $entry['name'],
            'id' => (string)$interest['userInterestId'],
            'resource_name' => (string)$interest['resourceName'],
            'api_name' => (string)$interest['name'],
            'resolution_source' => $resolutionSource,
        ];
    }

    $resourceNames = array_values(array_unique(array_column($resolved, 'resource_name')));
    $existingRows = [];
    if ($resourceNames) {
        $quotedResources = array_map('hub_google_ads_campaign_creation_gaql_string', $resourceNames);
        $existingRows = hub_google_ads_search($customerId,
            "SELECT campaign_criterion.negative, campaign_criterion.resource_name, campaign_criterion.status, campaign_criterion.user_interest.user_interest_category"
                . " FROM campaign_criterion WHERE campaign.id = " . $campaignId
                . " AND campaign_criterion.type = 'USER_INTEREST' AND campaign_criterion.status != 'REMOVED'"
                . ' AND campaign_criterion.user_interest.user_interest_category IN (' . implode(', ', $quotedResources) . ') LIMIT 101',
            $accessToken, $managerId);
    }
    if (count($existingRows) > 100) throw new HubGoogleAdsApiException('audience_exclusion_unverified', 502);
    $existing = [];
    foreach ($existingRows as $row) {
        $criterion = $row['campaignCriterion'] ?? null;
        if (!is_array($criterion)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $resourceName = $criterion['userInterest']['userInterestCategory'] ?? null;
        if (!is_string($resourceName) || !in_array($resourceName, $resourceNames, true)) continue;
        $existing[$resourceName][] = [
            'negative' => ($criterion['negative'] ?? false) === true,
            'status' => $criterion['status'] ?? null,
            'resource_name' => $criterion['resourceName'] ?? null,
        ];
    }

    $operations = [];
    $operationKinds = [];
    $alreadyPresentCount = 0;
    $conflictNames = [];
    foreach ($resolved as $entry) {
        $criteria = $existing[$entry['resource_name']] ?? [];
        $activeNegative = false;
        $pausedNegative = null;
        $positiveExists = false;
        foreach ($criteria as $criterion) {
            if ($criterion['negative'] && $criterion['status'] === 'ENABLED') $activeNegative = true;
            elseif ($criterion['negative'] && $criterion['status'] === 'PAUSED' && is_string($criterion['resource_name'])) $pausedNegative = $criterion['resource_name'];
            elseif (!$criterion['negative']) $positiveExists = true;
        }
        if ($activeNegative) { $alreadyPresentCount++; continue; }
        if ($positiveExists) { $conflictNames[] = $entry['name']; continue; }
        if ($pausedNegative !== null) {
            $operations[] = ['campaignCriterionOperation' => [
                'update' => ['resourceName' => $pausedNegative, 'status' => 'ENABLED'],
                'updateMask' => 'status',
            ]];
            $operationKinds[] = 'reactivate';
            continue;
        }
        $operations[] = ['campaignCriterionOperation' => ['create' => [
            'campaign' => 'customers/' . $customerId . '/campaigns/' . $campaignId,
            'negative' => true,
            'userInterest' => ['userInterestCategory' => $entry['resource_name']],
        ]]];
        $operationKinds[] = 'add';
    }

    $addedCount = 0;
    $reactivatedCount = 0;
    $failedCount = 0;
    if ($operations) {
        $response = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $accessToken,
            json_encode(['mutateOperations' => $operations, 'partialFailure' => true], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
        $results = $response['mutateOperationResponses'] ?? null;
        if (!is_array($results) || count($results) !== count($operations)) throw new HubGoogleAdsApiException('audience_exclusion_unverified', 502);
        foreach ($results as $index => $result) {
            if (!isset($result['campaignCriterionResult']['resourceName'])) { $failedCount++; continue; }
            if (($operationKinds[$index] ?? null) === 'add') $addedCount++;
            else $reactivatedCount++;
        }
    }

    $verificationAvailable = true;
    $verifiedCount = 0;
    $verifiedResources = [];
    try {
        $verificationRows = $resourceNames
            ? hub_google_ads_search($customerId,
                "SELECT campaign_criterion.negative, campaign_criterion.status, campaign_criterion.user_interest.user_interest_category"
                    . " FROM campaign_criterion WHERE campaign.id = " . $campaignId
                    . " AND campaign_criterion.type = 'USER_INTEREST' AND campaign_criterion.status != 'REMOVED'"
                    . ' AND campaign_criterion.user_interest.user_interest_category IN (' . implode(', ', array_map('hub_google_ads_campaign_creation_gaql_string', $resourceNames)) . ') LIMIT 101',
                $accessToken, $managerId)
            : [];
        if (count($verificationRows) > 100) throw new HubGoogleAdsApiException('audience_exclusion_unverified', 502);
        foreach ($verificationRows as $row) {
            $criterion = $row['campaignCriterion'] ?? null;
            if (!is_array($criterion)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $resourceName = $criterion['userInterest']['userInterestCategory'] ?? null;
            if (is_string($resourceName) && ($criterion['negative'] ?? false) === true && ($criterion['status'] ?? null) === 'ENABLED') {
                $verifiedResources[$resourceName] = true;
            }
        }
        foreach ($resolved as $entry) if (isset($verifiedResources[$entry['resource_name']])) $verifiedCount++;
    } catch (Throwable $error) {
        $verificationAvailable = false;
    }

    $complete = !$unresolvedNames && !$ambiguousNames && !$unsupportedNames && !$conflictNames && !$failedCount;
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'apply_audience_exclusions',
        'campaign_id' => $campaignId,
        'target_level' => 'CAMPAIGN',
        'submitted_count' => count($configured),
        'resolved_count' => count($resolved),
        'added_count' => $addedCount,
        'reactivated_count' => $reactivatedCount,
        'already_present_count' => $alreadyPresentCount,
        'verified_count' => $verifiedCount,
        'unresolved_count' => count($unresolvedNames),
        'ambiguous_count' => count($ambiguousNames),
        'unsupported_count' => count($unsupportedNames),
        'conflict_count' => count($conflictNames),
        'failed_count' => $failedCount,
        'unresolved_names' => $unresolvedNames,
        'ambiguous_names' => $ambiguousNames,
        'unsupported_names' => $unsupportedNames,
        'conflict_names' => $conflictNames,
        'resolved_segments' => $resolved,
        'verification_available' => $verificationAvailable,
        'verified' => $verificationAvailable && $complete && $verifiedCount === count($resolved),
        'verified_at_utc' => gmdate('Y-m-d\\TH:i:s\\Z'),
    ];
}

function hub_google_ads_campaign_creation_operations(string $customerId, array $settings, array $locations, string $campaignName, string $finalUrl, array $headlines, array $descriptions, array $promotion, string $currencyCode): array
{
    $campaignResource = 'customers/' . $customerId . '/campaigns/-2';
    $adGroupResource = 'customers/' . $customerId . '/adGroups/-3';
    $budgetResource = 'customers/' . $customerId . '/campaignBudgets/-1';
    $assetResource = 'customers/' . $customerId . '/assets/-4';
    $campaignCreate = [
        'resourceName' => $campaignResource,
        'name' => $campaignName,
        'advertisingChannelType' => 'SEARCH',
        'status' => 'PAUSED',
        'campaignBudget' => $budgetResource,
        'networkSettings' => $settings['network_settings'],
        'containsEuPoliticalAdvertising' => $settings['contains_eu_political_advertising'],
    ];
    switch ($settings['bidding_strategy']) {
        case 'TARGET_CPA':
            // Standard Search campaigns use MaximizeConversions with a required target CPA.
            $campaignCreate['maximizeConversions'] = ['targetCpaMicros' => (string)$settings['target_cpa_micros']];
            break;
        case 'MAXIMIZE_CONVERSIONS':
            $campaignCreate['maximizeConversions'] = $settings['target_cpa_micros'] === null
                ? new stdClass()
                : ['targetCpaMicros' => (string)$settings['target_cpa_micros']];
            break;
        case 'TARGET_ROAS':
            // Standard Search campaigns use MaximizeConversionValue with a required target ROAS.
            $campaignCreate['maximizeConversionValue'] = ['targetRoas' => $settings['target_roas']];
            break;
        case 'MAXIMIZE_CONVERSION_VALUE':
            $campaignCreate['maximizeConversionValue'] = $settings['target_roas'] === null
                ? new stdClass()
                : ['targetRoas' => $settings['target_roas']];
            break;
        case 'MAXIMIZE_CLICKS':
            // The Google Ads API represents Maximize clicks with the TargetSpend scheme.
            $campaignCreate['targetSpend'] = $settings['max_cpc_bid_micros'] === null
                ? new stdClass()
                : ['cpcBidCeilingMicros' => (string)$settings['max_cpc_bid_micros']];
            break;
        case 'TARGET_IMPRESSION_SHARE':
            $campaignCreate['targetImpressionShare'] = [
                'location' => $settings['impression_share_location'],
                'locationFractionMicros' => (string)($settings['impression_share_percent'] * 10000),
                'cpcBidCeilingMicros' => (string)$settings['max_cpc_bid_micros'],
            ];
            break;
        case 'MANUAL_CPC':
            $campaignCreate['manualCpc'] = ['enhancedCpcEnabled' => false];
            break;
    }
    $operations = [[
        'campaignBudgetOperation' => ['create' => [
            'resourceName' => $budgetResource,
            'name' => hub_google_ads_campaign_creation_substr($campaignName . ' - orçamento Hub', 0, 255),
            'deliveryMethod' => 'STANDARD',
            'amountMicros' => (string)$settings['daily_budget_micros'],
            'explicitlyShared' => false,
        ]],
    ], [
        'campaignOperation' => ['create' => $campaignCreate],
    ]];
    foreach ($settings['tracking_settings'] as $field => $value) {
        if ($value === null || $value === '' || $value === []) continue;
        $apiField = match ($field) {
            'tracking_url_template' => 'trackingUrlTemplate',
            'final_url_suffix' => 'finalUrlSuffix',
            'url_custom_parameters' => 'urlCustomParameters',
            default => null,
        };
        if ($apiField !== null) $operations[1]['campaignOperation']['create'][$apiField] = $value;
    }
    foreach ($locations as $location) {
        $operations[] = ['campaignCriterionOperation' => ['create' => [
            'campaign' => $campaignResource,
            'negative' => false,
            'location' => ['geoTargetConstant' => $location['resource_name']],
        ]]];
    }
    foreach ($settings['negative_keywords'] as $keyword) {
        $operations[] = ['campaignCriterionOperation' => ['create' => [
            'campaign' => $campaignResource,
            'negative' => true,
            'keyword' => ['text' => $keyword, 'matchType' => $settings['negative_keyword_match_type']],
        ]]];
    }
    $adGroupName = hub_google_ads_campaign_creation_substr($campaignName . ' - Grupo', 0, 255);
    $adGroupCreate = [
        'resourceName' => $adGroupResource,
        'name' => $adGroupName,
        'campaign' => $campaignResource,
        'status' => 'ENABLED',
        'type' => 'SEARCH_STANDARD',
    ];
    if ($settings['bidding_strategy'] === 'MANUAL_CPC') $adGroupCreate['cpcBidMicros'] = (string)$settings['max_cpc_bid_micros'];
    $operations[] = ['adGroupOperation' => ['create' => $adGroupCreate]];
    foreach ($settings['keywords'] as $keyword) {
        $operations[] = ['adGroupCriterionOperation' => ['create' => [
            'adGroup' => $adGroupResource,
            'status' => 'ENABLED',
            'keyword' => ['text' => $keyword, 'matchType' => $settings['keyword_match_type']],
        ]]];
    }
    $operations[] = ['adGroupAdOperation' => ['create' => [
        'adGroup' => $adGroupResource,
        'status' => 'ENABLED',
        'ad' => [
            'finalUrls' => [$finalUrl],
            'responsiveSearchAd' => [
                'headlines' => array_map(static fn(string $text): array => ['text' => $text], $headlines),
                'descriptions' => array_map(static fn(string $text): array => ['text' => $text], $descriptions),
            ],
        ],
    ]]];
    $promotionAsset = [
        'resourceName' => $assetResource,
        'name' => hub_google_ads_campaign_creation_substr($campaignName . ' - promoção Hub', 0, 255),
        'finalUrls' => [$finalUrl],
        'promotionAsset' => [
            'promotionTarget' => $promotion['target'],
            'languageCode' => $promotion['language_code'],
        ],
    ];
    if ($promotion['occasion'] !== null) {
        $promotionAsset['promotionAsset']['occasion'] = $promotion['occasion'];
    }
    if ($promotion['discount_type'] === 'percent_off') {
        $promotionAsset['promotionAsset']['percentOff'] = (string)((int)$promotion['discount_value'] * 10000);
    } else {
        $promotionAsset['promotionAsset']['moneyAmountOff'] = [
            'amountMicros' => hub_google_ads_campaign_creation_decimal_micros($promotion['discount_value']),
            'currencyCode' => $currencyCode,
        ];
    }
    if ($promotion['trigger_type'] === 'promotion_code') {
        $promotionAsset['promotionAsset']['promotionCode'] = $promotion['trigger_value'];
    } elseif ($promotion['trigger_type'] === 'orders_over_amount') {
        $promotionAsset['promotionAsset']['ordersOverAmount'] = [
            'amountMicros' => hub_google_ads_campaign_creation_decimal_micros($promotion['trigger_value']),
            'currencyCode' => $currencyCode,
        ];
    }
    if ($promotion['start_date'] !== null) {
        $promotionAsset['promotionAsset']['startDate'] = $promotion['start_date'];
        $promotionAsset['promotionAsset']['endDate'] = $promotion['end_date'];
    }
    $operations[] = ['assetOperation' => ['create' => $promotionAsset]];
    $operations[] = ['campaignAssetOperation' => ['create' => [
        'campaign' => $campaignResource,
        'asset' => $assetResource,
        'fieldType' => 'PROMOTION',
        'status' => 'ENABLED',
    ]]];
    return $operations;
}

function hub_google_ads_campaign_creation_preview_or_create(array $config, array $payload, bool $create): array
{
    [$managerId, $customerId, $name, $url, $headlines, $descriptions, $promotion, $settings] =
        hub_google_ads_campaign_creation_validate_payload($payload, $create);
    if (!hub_google_ads_campaign_creation_enabled($config)) throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);
    $duplicateQuery = 'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.audience_setting.use_audience_grouped FROM campaign WHERE campaign.name = '
        . hub_google_ads_campaign_creation_gaql_string($name) . " AND campaign.status != 'REMOVED' LIMIT 2";
    $duplicates = hub_google_ads_search($customerId, $duplicateQuery, $accessToken, $managerId);
    if (count($duplicates) > 1) throw new HubGoogleAdsApiException('campaign_name_conflict', 409);
    if ($duplicates && $create) throw new HubGoogleAdsApiException('campaign_name_already_exists', 409);
    if ($duplicates) {
        $existing = $duplicates[0]['campaign'] ?? null;
        $campaignId = is_array($existing) ? (string)($existing['id'] ?? '') : '';
        $existingName = is_array($existing) ? ($existing['name'] ?? null) : null;
        $existingStatus = is_array($existing) ? ($existing['status'] ?? null) : null;
        $channelType = is_array($existing) ? ($existing['advertisingChannelType'] ?? null) : null;
        $audienceGrouped = is_array($existing) ? ($existing['audienceSetting']['useAudienceGrouped'] ?? false) : null;
        if (preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
            || $existingName !== $name
            || !in_array($existingStatus, ['ENABLED', 'PAUSED'], true)
            || !is_string($channelType) || preg_match('/^[A-Z][A-Z_]{1,63}$/D', $channelType) !== 1
            || !is_bool($audienceGrouped)) {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }

        $adGroups = [];
        if ($channelType === 'SEARCH') {
            $adGroupRows = hub_google_ads_search($customerId,
                "SELECT ad_group.id, ad_group.status FROM ad_group WHERE campaign.id = $campaignId AND ad_group.status != 'REMOVED' LIMIT 2",
                $accessToken, $managerId);
            if (count($adGroupRows) > 2) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            foreach ($adGroupRows as $row) {
                $adGroup = $row['adGroup'] ?? null;
                $adGroupId = is_array($adGroup) ? (string)($adGroup['id'] ?? '') : '';
                $adGroupStatus = is_array($adGroup) ? ($adGroup['status'] ?? null) : null;
                if (preg_match('/^[1-9][0-9]{0,19}$/D', $adGroupId) !== 1
                    || !in_array($adGroupStatus, ['ENABLED', 'PAUSED'], true)) {
                    throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
                }
                $adGroups[$adGroupId] = $adGroupStatus;
            }
        }
        $adGroupCount = count($adGroups);
        $uniqueAdGroupId = $adGroupCount === 1 ? (string)array_key_first($adGroups) : '';
        return [
            'ok' => true,
            'schema_version' => 1,
            'operation' => 'preview_search_campaign',
            'existing_campaign' => true,
            'validated_only' => false,
            'will_create_paused' => false,
            'campaign_name' => $existingName,
            'campaign_id' => $campaignId,
            'campaign_status' => $existingStatus,
            'campaign_channel_type' => $channelType,
            'audience_grouped' => $audienceGrouped,
            'ad_group_id' => $uniqueAdGroupId,
            'ad_group_status' => $uniqueAdGroupId !== '' ? $adGroups[$uniqueAdGroupId] : '',
            'ad_group_count' => $adGroupCount,
        ];
    }
    $currencyCode = hub_google_ads_campaign_creation_customer_currency($accessToken, $managerId, $customerId);
    if ($settings['target_cpa_micros'] !== null && $settings['target_cpa_currency'] !== ''
        && $settings['target_cpa_currency'] !== $currencyCode) {
        throw new HubGoogleAdsApiException('campaign_currency_mismatch', 422);
    }
    $locations = hub_google_ads_campaign_creation_resolve_countries($accessToken, $managerId, $customerId, $settings['country_codes']);
    $operations = hub_google_ads_campaign_creation_operations($customerId, $settings, $locations, $name, $url, $headlines, $descriptions, $promotion, $currencyCode);
    $request = ['mutateOperations' => $operations];
    if (!$create) $request['validateOnly'] = true;
    $response = hub_google_ads_api_request(
        'POST',
        'customers/' . $customerId . '/googleAds:mutate',
        $accessToken,
        json_encode($request, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        $managerId
    );
    if (!$create) {
        return [
            'ok' => true,
            'schema_version' => 1,
            'operation' => 'preview_search_campaign',
            'validated_only' => true,
            'campaign_status' => 'PAUSED',
            'campaign_name' => $name,
            'account_currency' => $currencyCode,
            'daily_budget_micros' => $settings['daily_budget_micros'],
            'bidding_strategy' => $settings['bidding_strategy'],
            'target_cpa_micros' => $settings['target_cpa_micros'],
            'target_roas' => $settings['target_roas'],
            'max_cpc_bid_micros' => $settings['max_cpc_bid_micros'],
            'impression_share_location' => $settings['impression_share_location'],
            'impression_share_percent' => $settings['impression_share_percent'],
            'target_countries' => array_map(static fn(array $location): array => ['country_code' => $location['country_code'], 'name' => $location['name']], $locations),
            'keyword_count' => count($settings['keywords']),
            'negative_keyword_count' => count($settings['negative_keywords']),
            'network_settings' => $settings['network_settings'],
            'contains_eu_political_advertising' => $settings['contains_eu_political_advertising'],
            'tracking_settings_provided' => array_filter($settings['tracking_settings'], static fn(mixed $value): bool => $value !== null && $value !== '') !== [],
            'headline_count' => count($headlines),
            'description_count' => count($descriptions),
            'promotion_target' => $promotion['target'],
            'will_create_paused' => true,
        ];
    }
    $results = $response['mutateOperationResponses'] ?? null;
    if (!is_array($results) || count($results) !== count($operations)) throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
    $campaignResource = $results[1]['campaignResult']['resourceName'] ?? null;
    if (!is_string($campaignResource)
        || preg_match('#^customers/' . preg_quote($customerId, '#') . '/campaigns/([1-9][0-9]{0,19})$#D', $campaignResource, $matches) !== 1) {
        throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
    }
    $campaignId = $matches[1];
    try { $verified = hub_google_ads_campaign_action_read($accessToken, $managerId, $customerId, $campaignId); }
    catch (Throwable $error) { throw new HubGoogleAdsApiException('campaign_creation_unverified', 502); }
    if ($verified['status'] !== 'PAUSED' || $verified['name'] !== $name) throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
    $createdResources = [];
    foreach ($results as $result) {
        if (!is_array($result)) throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
        foreach (['campaignBudgetResult', 'campaignResult', 'campaignCriterionResult', 'adGroupResult', 'adGroupCriterionResult', 'adGroupAdResult', 'assetResult', 'campaignAssetResult'] as $resultKey) {
            if (!isset($result[$resultKey])) continue;
            $resourceName = $result[$resultKey]['resourceName'] ?? null;
            if (!is_string($resourceName) || !str_starts_with($resourceName, 'customers/' . $customerId . '/')) {
                throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
            }
            $createdResources[$resultKey] = $resourceName;
        }
    }
    if (!isset($createdResources['campaignBudgetResult'], $createdResources['campaignResult'], $createdResources['adGroupResult'], $createdResources['adGroupAdResult'], $createdResources['assetResult'], $createdResources['campaignAssetResult'])) {
        throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
    }
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'create_search_campaign',
        'created' => true,
        'verified' => true,
        'campaign_id' => $campaignId,
        'campaign_resource_name' => $campaignResource,
        'campaign_name' => $verified['name'],
        'status' => $verified['status'],
        'campaign_budget_resource_name' => $createdResources['campaignBudgetResult'],
        'ad_group_resource_name' => $createdResources['adGroupResult'],
        'ad_resource_name' => $createdResources['adGroupAdResult'],
        'promotion_asset_resource_name' => $createdResources['assetResult'],
        'campaign_asset_resource_name' => $createdResources['campaignAssetResult'],
        'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

function hub_google_ads_campaign_sitelinks_normalize_base_url(string $url): ?string
{
    $parts = parse_url($url);
    if (!is_array($parts) || !is_string($parts['scheme'] ?? null) || !is_string($parts['host'] ?? null)) return null;
    $scheme = strtolower($parts['scheme']);
    $host = $parts['host'];
    if (str_contains($host, ':') && !str_starts_with($host, '[')) $host = '[' . $host . ']';
    $baseUrl = $scheme . '://' . $host;
    if (isset($parts['port'])) $baseUrl .= ':' . $parts['port'];
    $baseUrl .= rtrim((string)($parts['path'] ?? ''), '/');
    if (array_key_exists('query', $parts)) $baseUrl .= '?' . $parts['query'];
    return $baseUrl;
}

function hub_google_ads_campaign_sitelinks_validate_payload(array $payload): array
{
    $expected = ['campaign_id', 'confirm', 'customer_id', 'manager_customer_id', 'operation', 'sitelinks'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $campaignId = $payload['campaign_id'] ?? null;
    $rawLinks = $payload['sitelinks'] ?? null;
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'apply_campaign_sitelinks'
        || ($payload['confirm'] ?? null) !== true || $managerId === null || $customerId === null
        || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
        || !is_array($rawLinks) || count($rawLinks) < 1 || count($rawLinks) > 6) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $anchors = [];
    $links = [];
    foreach ($rawLinks as $link) {
        if (!is_array($link)) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $linkKeys = array_keys($link); sort($linkKeys, SORT_STRING);
        if ($linkKeys !== ['anchor', 'description1', 'description2', 'title']) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $title = is_string($link['title']) ? trim($link['title']) : '';
        $description1 = is_string($link['description1']) ? trim($link['description1']) : '';
        $description2 = is_string($link['description2']) ? trim($link['description2']) : '';
        $anchor = $link['anchor'];
        if (!is_int($anchor) || $anchor < 1 || $anchor > 6 || isset($anchors[$anchor])
            || $title === '' || hub_google_ads_campaign_creation_text_length($title) > 25
            || (($description1 === '') !== ($description2 === ''))
            || hub_google_ads_campaign_creation_text_length($description1) > 35
            || hub_google_ads_campaign_creation_text_length($description2) > 35) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $anchors[$anchor] = true;
        $links[] = ['title' => $title, 'description1' => $description1, 'description2' => $description2, 'anchor' => $anchor];
    }
    return [$managerId, $customerId, $campaignId, $links];
}

function hub_google_ads_campaign_sitelinks_apply(array $config, string $managerId, string $customerId, string $campaignId, array $links): array
{
    if (!hub_google_ads_campaign_creation_enabled($config) || !hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
        throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
    }
    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);
    $adRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, campaign.status, campaign.advertising_channel_type, ad_group_ad.ad.final_urls FROM ad_group_ad"
            . " WHERE campaign.id = $campaignId AND campaign.status != 'REMOVED' AND ad_group_ad.status != 'REMOVED' LIMIT 101",
        $accessToken, $managerId);
    if (count($adRows) < 1 || count($adRows) > 100) throw new HubGoogleAdsApiException('campaign_sitelinks_campaign_unavailable', 404);
    $campaign = null;
    $baseUrls = [];
    foreach ($adRows as $row) {
        $currentCampaign = $row['campaign'] ?? null;
        $ad = $row['adGroupAd']['ad'] ?? null;
        if (!is_array($currentCampaign) || (string)($currentCampaign['id'] ?? '') !== $campaignId
            || !in_array($currentCampaign['status'] ?? null, ['PAUSED', 'ENABLED'], true)
            || ($currentCampaign['advertisingChannelType'] ?? null) !== 'SEARCH'
            || !is_array($ad) || !is_array($ad['finalUrls'] ?? null)) {
            throw new HubGoogleAdsApiException('campaign_sitelinks_campaign_unavailable', 409);
        }
        $campaign = $currentCampaign;
        foreach ($ad['finalUrls'] as $url) {
            if (!is_string($url) || strlen($url) > 2048) throw new HubGoogleAdsApiException('campaign_sitelinks_url_mismatch', 409);
            $parts = parse_url($url);
            if (!is_array($parts) || strtolower((string)($parts['scheme'] ?? '')) !== 'https'
                || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])) {
                throw new HubGoogleAdsApiException('campaign_sitelinks_url_mismatch', 409);
            }
            $normalizedUrl = hub_google_ads_campaign_sitelinks_normalize_base_url($url);
            if ($normalizedUrl === null) throw new HubGoogleAdsApiException('campaign_sitelinks_url_mismatch', 409);
            $baseUrls[$normalizedUrl] = $normalizedUrl;
        }
    }
    if (!is_array($campaign) || count($baseUrls) !== 1) throw new HubGoogleAdsApiException('campaign_sitelinks_url_mismatch', 409);
    $baseUrl = (string)array_values($baseUrls)[0];
    $campaignRef = 'customers/' . $customerId . '/campaigns/' . $campaignId;
    $desired = [];
    foreach ($links as $link) {
        $url = $baseUrl . '#' . $link['anchor'];
        $key = hash('sha256', json_encode([$link['title'], $link['description1'], $link['description2'], $url], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        $desired[$key] = $link + ['final_url' => $url];
    }

    $existingRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, campaign_asset.resource_name, campaign_asset.status, campaign_asset.field_type, asset.type, asset.final_urls, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2"
            . " FROM campaign_asset WHERE campaign.id = $campaignId AND campaign_asset.field_type = 'SITELINK'"
            . " AND campaign_asset.status != 'REMOVED' LIMIT 201",
        $accessToken, $managerId);
    if (count($existingRows) > 200) throw new HubGoogleAdsApiException('campaign_sitelinks_write_rejected', 502);
    $present = [];
    foreach ($existingRows as $row) {
        $asset = $row['asset'] ?? null;
        if (!is_array($asset) || ($asset['type'] ?? null) !== 'SITELINK') continue;
        $sitelink = $asset['sitelinkAsset'] ?? null;
        $urls = $asset['finalUrls'] ?? null;
        if (!is_array($sitelink) || !is_array($urls)) continue;
        foreach ($urls as $existingUrl) {
            if (!is_string($existingUrl)) continue;
            $key = hash('sha256', json_encode([
                (string)($sitelink['linkText'] ?? ''),
                (string)($sitelink['description1'] ?? ''),
                (string)($sitelink['description2'] ?? ''),
                $existingUrl,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            $present[$key][] = [
                'resource_name' => (string)($row['campaignAsset']['resourceName'] ?? ''),
                'status' => (string)($row['campaignAsset']['status'] ?? ''),
            ];
        }
    }
    $operations = [];
    $operationResultTypes = [];
    $newCount = 0;
    $reactivatedCount = 0;
    $alreadyPresentCount = 0;
    foreach ($desired as $key => $link) {
        $matches = $present[$key] ?? [];
        $active = array_filter($matches, static fn(array $match): bool => $match['status'] === 'ENABLED');
        if ($active) {
            $alreadyPresentCount++;
            continue;
        }
        $paused = null;
        foreach ($matches as $match) {
            if ($match['status'] === 'PAUSED' && preg_match('#^customers/' . preg_quote($customerId, '#') . '/campaignAssets/[1-9][0-9]*~[1-9][0-9]*~SITELINK$#D', $match['resource_name']) === 1) {
                $paused = $match;
                break;
            }
        }
        if ($paused !== null) {
            $operations[] = ['campaignAssetOperation' => [
                'update' => ['resourceName' => $paused['resource_name'], 'status' => 'ENABLED'],
                'updateMask' => 'status',
            ]];
            $operationResultTypes[] = 'campaign_asset';
            $reactivatedCount++;
            continue;
        }
        $assetRef = 'customers/' . $customerId . '/assets/-' . (2 * $newCount + 1);
        $assetName = hub_google_ads_campaign_creation_substr((string)($campaign['name'] ?? 'Campanha') . ' - Sitelink ' . $link['title'], 0, 255);
        $sitelinkAsset = [
            'linkText' => $link['title'],
        ];
        if ($link['description1'] !== '') {
            $sitelinkAsset['description1'] = $link['description1'];
            $sitelinkAsset['description2'] = $link['description2'];
        }
        $operations[] = ['assetOperation' => ['create' => [
            'resourceName' => $assetRef,
            'name' => $assetName,
            'finalUrls' => [$link['final_url']],
            'sitelinkAsset' => $sitelinkAsset,
        ]]];
        $operationResultTypes[] = 'asset';
        $operations[] = ['campaignAssetOperation' => ['create' => [
            'campaign' => $campaignRef,
            'asset' => $assetRef,
            'fieldType' => 'SITELINK',
            'status' => 'ENABLED',
        ]]];
        $operationResultTypes[] = 'campaign_asset';
        $newCount++;
    }
    if ($operations) {
        $response = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $accessToken,
            json_encode(['mutateOperations' => $operations, 'partialFailure' => false], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
        $results = $response['mutateOperationResponses'] ?? null;
        if (!is_array($results) || count($results) !== count($operations)) {
            throw new HubGoogleAdsApiException('campaign_sitelinks_write_rejected', 502);
        }
        foreach ($results as $index => $result) {
            $resultType = $operationResultTypes[$index] ?? '';
            $resultKey = $resultType === 'asset' ? 'assetResult' : 'campaignAssetResult';
            $expectedPrefix = 'customers/' . $customerId . '/' . ($resultType === 'asset' ? 'assets/' : 'campaignAssets/');
            $resourceName = $result[$resultKey]['resourceName'] ?? null;
            if (!is_string($resourceName) || !str_starts_with($resourceName, $expectedPrefix)) {
                throw new HubGoogleAdsApiException('campaign_sitelinks_write_rejected', 502);
            }
        }
    }
    $verifiedRows = $operations
        ? hub_google_ads_search($customerId,
            "SELECT campaign.id, campaign_asset.resource_name, campaign_asset.status, campaign_asset.field_type, asset.type, asset.final_urls, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2"
                . " FROM campaign_asset WHERE campaign.id = $campaignId AND campaign_asset.field_type = 'SITELINK'"
                . " AND campaign_asset.status != 'REMOVED' LIMIT 201",
            $accessToken, $managerId)
        : $existingRows;
    if (count($verifiedRows) > 200) throw new HubGoogleAdsApiException('campaign_sitelinks_write_rejected', 502);
    $verifiedActive = [];
    foreach ($verifiedRows as $row) {
        if (($row['campaignAsset']['status'] ?? null) !== 'ENABLED') continue;
        $asset = $row['asset'] ?? null;
        if (!is_array($asset) || ($asset['type'] ?? null) !== 'SITELINK') continue;
        $sitelink = $asset['sitelinkAsset'] ?? null;
        $urls = $asset['finalUrls'] ?? null;
        if (!is_array($sitelink) || !is_array($urls)) continue;
        foreach ($urls as $url) {
            if (!is_string($url)) continue;
            $key = hash('sha256', json_encode([
                (string)($sitelink['linkText'] ?? ''),
                (string)($sitelink['description1'] ?? ''),
                (string)($sitelink['description2'] ?? ''),
                $url,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            $verifiedActive[$key] = true;
        }
    }
    foreach (array_keys($desired) as $key) {
        if (!isset($verifiedActive[$key])) throw new HubGoogleAdsApiException('campaign_sitelinks_write_rejected', 502);
    }
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'apply_campaign_sitelinks',
        'campaign_id' => $campaignId,
        'campaign_name' => (string)($campaign['name'] ?? ''),
        'campaign_status' => (string)($campaign['status'] ?? ''),
        'submitted_count' => count($links),
        'applied_count' => $newCount,
        'reactivated_count' => $reactivatedCount,
        'already_present_count' => $alreadyPresentCount,
        'verified' => true,
        'verified_at_utc' => gmdate('Y-m-d\\TH:i:s\\Z'),
    ];
}

function hub_google_ads_campaign_destination_url_validate_payload(array $payload): array
{
    $expected = ['batch_campaign_ids', 'campaign_id', 'confirm', 'customer_id', 'final_url', 'manager_customer_id', 'operation'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $campaignId = $payload['campaign_id'] ?? null;
    $rawBatchIds = $payload['batch_campaign_ids'] ?? null;
    $url = $payload['final_url'] ?? null;
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'apply_campaign_destination_url'
        || ($payload['confirm'] ?? null) !== true || $managerId === null || $customerId === null
        || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
        || !is_array($rawBatchIds) || !array_is_list($rawBatchIds) || count($rawBatchIds) < 1 || count($rawBatchIds) > 100
        || !is_string($url) || strlen($url) > 2048) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $batchIds = [];
    foreach ($rawBatchIds as $rawId) {
        if (!is_string($rawId) || preg_match('/^[1-9][0-9]{0,19}$/D', $rawId) !== 1) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $batchIds[$rawId] = $rawId;
    }
    if (!isset($batchIds[$campaignId])) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $parts = parse_url($url);
    if (!is_array($parts) || strtolower((string)($parts['scheme'] ?? '')) !== 'https'
        || !is_string($parts['host'] ?? null) || $parts['host'] === ''
        || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])
        || filter_var($url, FILTER_VALIDATE_URL) === false) {
        throw new HubGoogleAdsApiException('campaign_destination_url_invalid', 422);
    }
    return [$managerId, $customerId, $campaignId, array_values($batchIds), $url];
}

function hub_google_ads_campaign_destination_url_rewrite(array $urls, string $newUrl, bool $preserveSitelinkSection): array
{
    $result = [];
    foreach ($urls as $url) {
        if (!is_string($url) || strlen($url) > 2048) throw new HubGoogleAdsApiException('campaign_destination_url_update_rejected', 502);
        $replacement = $newUrl;
        if ($preserveSitelinkSection) {
            $fragment = (string)(parse_url($url, PHP_URL_FRAGMENT) ?? '');
            if (preg_match('/^[1-6]$/D', $fragment) === 1) {
                $parts = parse_url($newUrl);
                if (!is_array($parts) || !is_string($parts['scheme'] ?? null) || !is_string($parts['host'] ?? null)) {
                    throw new HubGoogleAdsApiException('campaign_destination_url_invalid', 422);
                }
                $host = $parts['host'];
                if (str_contains($host, ':') && !str_starts_with($host, '[')) $host = '[' . $host . ']';
                $replacement = strtolower($parts['scheme']) . '://' . $host
                    . (isset($parts['port']) ? ':' . $parts['port'] : '')
                    . rtrim((string)($parts['path'] ?? ''), '/')
                    . (array_key_exists('query', $parts) ? '?' . $parts['query'] : '') . '#' . $fragment;
            }
        }
        $result[$replacement] = $replacement;
    }
    return array_values($result);
}

function hub_google_ads_campaign_destination_url_apply(
    array $config,
    string $managerId,
    string $customerId,
    string $campaignId,
    array $batchCampaignIds,
    string $finalUrl
): array {
    if (!hub_google_ads_campaign_creation_enabled($config) || !hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
        throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
    }
    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);

    $campaignRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id = $campaignId LIMIT 2",
        $accessToken, $managerId);
    if (count($campaignRows) !== 1 || !is_array($campaignRows[0]['campaign'] ?? null)) {
        throw new HubGoogleAdsApiException('campaign_not_found', 404);
    }
    $campaign = $campaignRows[0]['campaign'];
    if ((string)($campaign['id'] ?? '') !== $campaignId
        || !in_array($campaign['status'] ?? null, ['PAUSED', 'ENABLED'], true)
        || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH') {
        throw new HubGoogleAdsApiException('campaign_destination_url_campaign_unavailable', 409);
    }

    $batchIdsSql = implode(', ', $batchCampaignIds);
    $batchCampaignRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id IN ($batchIdsSql) LIMIT 101",
        $accessToken, $managerId);
    $verifiedBatchIds = [];
    foreach ($batchCampaignRows as $row) {
        $batchCampaign = $row['campaign'] ?? null;
        $id = is_array($batchCampaign) ? (string)($batchCampaign['id'] ?? '') : '';
        if ($id === '' || !in_array($batchCampaign['status'] ?? null, ['PAUSED', 'ENABLED'], true)
            || ($batchCampaign['advertisingChannelType'] ?? null) !== 'SEARCH') {
            throw new HubGoogleAdsApiException('campaign_destination_url_campaign_unavailable', 409);
        }
        $verifiedBatchIds[$id] = true;
    }
    if (count($verifiedBatchIds) !== count($batchCampaignIds) || !isset($verifiedBatchIds[$campaignId])) {
        throw new HubGoogleAdsApiException('campaign_destination_url_campaign_unavailable', 409);
    }

    $adRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, ad_group_ad.status, ad_group_ad.ad.id, ad_group_ad.ad.resource_name, ad_group_ad.ad.final_urls, ad_group_ad.ad.final_mobile_urls FROM ad_group_ad WHERE campaign.id = $campaignId AND ad_group_ad.status != 'REMOVED' LIMIT 501",
        $accessToken, $managerId);
    if (count($adRows) > 500) throw new HubGoogleAdsApiException('campaign_destination_url_resource_limit', 422);
    $criterionRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, ad_group_criterion.resource_name, ad_group_criterion.type, ad_group_criterion.status, ad_group_criterion.final_urls, ad_group_criterion.final_mobile_urls FROM ad_group_criterion WHERE campaign.id = $campaignId AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED' LIMIT 2001",
        $accessToken, $managerId);
    if (count($criterionRows) > 2000) throw new HubGoogleAdsApiException('campaign_destination_url_resource_limit', 422);
    $campaignAssetRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, campaign_asset.resource_name, campaign_asset.asset, campaign_asset.field_type, campaign_asset.status, asset.resource_name, asset.id, asset.type, asset.final_urls, asset.final_mobile_urls FROM campaign_asset WHERE campaign.id = $campaignId AND campaign_asset.status != 'REMOVED' LIMIT 301",
        $accessToken, $managerId);
    $groupAssetRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, ad_group_asset.resource_name, ad_group_asset.asset, ad_group_asset.field_type, ad_group_asset.status, asset.resource_name, asset.id, asset.type, asset.final_urls, asset.final_mobile_urls FROM ad_group_asset WHERE campaign.id = $campaignId AND ad_group_asset.status != 'REMOVED' LIMIT 301",
        $accessToken, $managerId);
    if (count($campaignAssetRows) > 300 || count($groupAssetRows) > 300) {
        throw new HubGoogleAdsApiException('campaign_destination_url_resource_limit', 422);
    }

    $assetsByResource = [];
    foreach (array_merge($campaignAssetRows, $groupAssetRows) as $row) {
        $asset = $row['asset'] ?? null;
        $assetResource = is_array($asset) ? (string)($asset['resourceName'] ?? '') : '';
        $urls = is_array($asset) ? ($asset['finalUrls'] ?? []) : [];
        if ($assetResource === '' || !is_array($urls) || !$urls) continue;
        $assetsByResource[$assetResource] = [
            'resource_name' => $assetResource,
            'id' => (string)($asset['id'] ?? ''),
            'type' => (string)($asset['type'] ?? ''),
            'final_urls' => $urls,
            'final_mobile_urls' => is_array($asset['finalMobileUrls'] ?? null) ? $asset['finalMobileUrls'] : [],
        ];
    }

    $sharedOutsideBatch = [];
    $accountLinkedAssets = [];
    if ($assetsByResource) {
        $assetRefs = implode(', ', array_map('hub_google_ads_campaign_creation_gaql_string', array_keys($assetsByResource)));
        $otherCampaignRows = hub_google_ads_search($customerId,
            "SELECT campaign.id, campaign_asset.asset, campaign_asset.status FROM campaign_asset WHERE campaign_asset.asset IN ($assetRefs) AND campaign_asset.status != 'REMOVED' LIMIT 1001",
            $accessToken, $managerId);
        if (count($otherCampaignRows) > 1000) throw new HubGoogleAdsApiException('campaign_destination_url_resource_limit', 422);
        foreach ($otherCampaignRows as $row) {
            $assetResource = (string)($row['campaignAsset']['asset'] ?? '');
            $linkedCampaignId = (string)($row['campaign']['id'] ?? '');
            if ($assetResource !== '' && !in_array($linkedCampaignId, $batchCampaignIds, true)) $sharedOutsideBatch[$assetResource] = true;
        }
        $otherGroupRows = hub_google_ads_search($customerId,
            "SELECT campaign.id, ad_group_asset.asset, ad_group_asset.status FROM ad_group_asset WHERE ad_group_asset.asset IN ($assetRefs) AND ad_group_asset.status != 'REMOVED' LIMIT 1001",
            $accessToken, $managerId);
        if (count($otherGroupRows) > 1000) throw new HubGoogleAdsApiException('campaign_destination_url_resource_limit', 422);
        foreach ($otherGroupRows as $row) {
            $assetResource = (string)($row['adGroupAsset']['asset'] ?? '');
            $linkedCampaignId = (string)($row['campaign']['id'] ?? '');
            if ($assetResource !== '' && !in_array($linkedCampaignId, $batchCampaignIds, true)) $sharedOutsideBatch[$assetResource] = true;
        }
    }

    $customerAssetRows = hub_google_ads_search($customerId,
        "SELECT customer_asset.asset, customer_asset.status, asset.final_urls FROM customer_asset WHERE customer_asset.status != 'REMOVED' LIMIT 1001",
        $accessToken, $managerId);
    if (count($customerAssetRows) > 1000) throw new HubGoogleAdsApiException('campaign_destination_url_resource_limit', 422);
    $accountScopedUrlAssetCount = 0;
    foreach ($customerAssetRows as $row) {
        $assetResource = (string)($row['customerAsset']['asset'] ?? '');
        if (is_array($row['asset']['finalUrls'] ?? null) && $row['asset']['finalUrls']) {
            $accountScopedUrlAssetCount++;
            if ($assetResource !== '' && isset($assetsByResource[$assetResource])) $accountLinkedAssets[$assetResource] = true;
        }
    }

    $mutateOperations = [];
    $expectedAds = [];
    $expectedCriteria = [];
    $expectedAssets = [];
    $adsAlreadyCurrent = 0;
    $criteriaAlreadyCurrent = 0;
    $assetsAlreadyCurrent = 0;
    $assetsSkippedShared = 0;
    $assetsSkippedAccount = 0;
    foreach ($adRows as $row) {
        $ad = $row['adGroupAd']['ad'] ?? null;
        $resourceName = is_array($ad) ? (string)($ad['resourceName'] ?? '') : '';
        $urls = is_array($ad) ? ($ad['finalUrls'] ?? null) : null;
        if ($resourceName === '' || !is_array($urls) || !$urls) throw new HubGoogleAdsApiException('campaign_destination_url_update_rejected', 502);
        $update = ['resourceName' => $resourceName, 'finalUrls' => [$finalUrl]];
        $mask = ['finalUrls'];
        if (is_array($ad['finalMobileUrls'] ?? null) && $ad['finalMobileUrls']) {
            $update['finalMobileUrls'] = [$finalUrl];
            $mask[] = 'finalMobileUrls';
        }
        $expectedAds[$resourceName] = ['final_urls' => [$finalUrl], 'final_mobile_urls' => $update['finalMobileUrls'] ?? []];
        if ($urls === [$finalUrl] && ($update['finalMobileUrls'] ?? ($ad['finalMobileUrls'] ?? [])) === ($ad['finalMobileUrls'] ?? [])) {
            $adsAlreadyCurrent++;
            unset($expectedAds[$resourceName]);
            continue;
        }
        $mutateOperations[] = ['adOperation' => ['update' => $update, 'updateMask' => implode(',', $mask)]];
    }
    foreach ($criterionRows as $row) {
        $criterion = $row['adGroupCriterion'] ?? null;
        if (!is_array($criterion) || ($criterion['type'] ?? null) !== 'KEYWORD') continue;
        $resourceName = (string)($criterion['resourceName'] ?? '');
        $urls = $criterion['finalUrls'] ?? [];
        if ($resourceName === '' || !is_array($urls)) throw new HubGoogleAdsApiException('campaign_destination_url_update_rejected', 502);
        if (!$urls) continue;
        $update = ['resourceName' => $resourceName, 'finalUrls' => [$finalUrl]];
        $mask = ['finalUrls'];
        if (is_array($criterion['finalMobileUrls'] ?? null) && $criterion['finalMobileUrls']) {
            $update['finalMobileUrls'] = [$finalUrl];
            $mask[] = 'finalMobileUrls';
        }
        $expectedCriteria[$resourceName] = ['final_urls' => [$finalUrl], 'final_mobile_urls' => $update['finalMobileUrls'] ?? []];
        if ($urls === [$finalUrl] && ($update['finalMobileUrls'] ?? ($criterion['finalMobileUrls'] ?? [])) === ($criterion['finalMobileUrls'] ?? [])) {
            $criteriaAlreadyCurrent++;
            unset($expectedCriteria[$resourceName]);
            continue;
        }
        $mutateOperations[] = ['adGroupCriterionOperation' => ['update' => $update, 'updateMask' => implode(',', $mask)]];
    }
    foreach ($assetsByResource as $resourceName => $asset) {
        $isSitelink = false;
        foreach (array_merge($campaignAssetRows, $groupAssetRows) as $row) {
            if (($row['asset']['resourceName'] ?? '') === $resourceName
                && (($row['campaignAsset']['fieldType'] ?? $row['adGroupAsset']['fieldType'] ?? '') === 'SITELINK')) {
                $isSitelink = true; break;
            }
        }
        $nextUrls = hub_google_ads_campaign_destination_url_rewrite($asset['final_urls'], $finalUrl, $isSitelink);
        $update = ['resourceName' => $resourceName, 'finalUrls' => $nextUrls];
        $mask = ['finalUrls'];
        $nextMobileUrls = [];
        if ($asset['final_mobile_urls']) {
            $nextMobileUrls = hub_google_ads_campaign_destination_url_rewrite($asset['final_mobile_urls'], $finalUrl, $isSitelink);
            $update['finalMobileUrls'] = $nextMobileUrls;
            $mask[] = 'finalMobileUrls';
        }
        if ($nextUrls === $asset['final_urls'] && $nextMobileUrls === $asset['final_mobile_urls']) {
            $assetsAlreadyCurrent++;
            continue;
        }
        if (isset($accountLinkedAssets[$resourceName])) { $assetsSkippedAccount++; continue; }
        if (isset($sharedOutsideBatch[$resourceName])) { $assetsSkippedShared++; continue; }
        $expectedAssets[$resourceName] = ['final_urls' => $nextUrls, 'final_mobile_urls' => $nextMobileUrls];
        $mutateOperations[] = ['assetOperation' => ['update' => $update, 'updateMask' => implode(',', $mask)]];
    }
    if (count($mutateOperations) > 1000) throw new HubGoogleAdsApiException('campaign_destination_url_resource_limit', 422);
    if ($mutateOperations) {
        $response = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $accessToken,
            json_encode(['mutateOperations' => $mutateOperations, 'partialFailure' => false], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
        $results = $response['mutateOperationResponses'] ?? null;
        if (!is_array($results) || count($results) !== count($mutateOperations)) {
            throw new HubGoogleAdsApiException('campaign_destination_url_update_rejected', 502);
        }
    }

    $verifiedAdRows = $adRows;
    $verifiedCriterionRows = $criterionRows;
    $verifiedAssetRows = array_merge($campaignAssetRows, $groupAssetRows);
    if ($mutateOperations) {
        $verifiedAdRows = hub_google_ads_search($customerId,
            "SELECT campaign.id, ad_group_ad.status, ad_group_ad.ad.resource_name, ad_group_ad.ad.final_urls, ad_group_ad.ad.final_mobile_urls FROM ad_group_ad WHERE campaign.id = $campaignId AND ad_group_ad.status != 'REMOVED' LIMIT 501",
            $accessToken, $managerId);
        $verifiedCriterionRows = hub_google_ads_search($customerId,
            "SELECT campaign.id, ad_group_criterion.resource_name, ad_group_criterion.type, ad_group_criterion.status, ad_group_criterion.final_urls, ad_group_criterion.final_mobile_urls FROM ad_group_criterion WHERE campaign.id = $campaignId AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED' LIMIT 2001",
            $accessToken, $managerId);
        $verifiedAssetRows = array_merge(
            hub_google_ads_search($customerId,
                "SELECT campaign.id, campaign_asset.resource_name, campaign_asset.asset, campaign_asset.field_type, campaign_asset.status, asset.resource_name, asset.final_urls, asset.final_mobile_urls FROM campaign_asset WHERE campaign.id = $campaignId AND campaign_asset.status != 'REMOVED' LIMIT 301",
                $accessToken, $managerId),
            hub_google_ads_search($customerId,
                "SELECT campaign.id, ad_group_asset.resource_name, ad_group_asset.asset, ad_group_asset.field_type, ad_group_asset.status, asset.resource_name, asset.final_urls, asset.final_mobile_urls FROM ad_group_asset WHERE campaign.id = $campaignId AND ad_group_asset.status != 'REMOVED' LIMIT 301",
                $accessToken, $managerId)
        );
    }
    $verifiedAds = [];
    foreach ($verifiedAdRows as $row) {
        $ad = $row['adGroupAd']['ad'] ?? null;
        if (is_array($ad)) $verifiedAds[(string)($ad['resourceName'] ?? '')] = $ad;
    }
    foreach ($expectedAds as $resource => $expected) {
        $current = $verifiedAds[$resource] ?? null;
        if (!is_array($current) || ($current['finalUrls'] ?? []) !== $expected['final_urls']
            || (($expected['final_mobile_urls'] ?? []) && ($current['finalMobileUrls'] ?? []) !== $expected['final_mobile_urls'])) {
            throw new HubGoogleAdsApiException('campaign_destination_url_update_unverified', 502);
        }
    }
    $verifiedCriteria = [];
    foreach ($verifiedCriterionRows as $row) {
        $criterion = $row['adGroupCriterion'] ?? null;
        if (is_array($criterion)) $verifiedCriteria[(string)($criterion['resourceName'] ?? '')] = $criterion;
    }
    foreach ($expectedCriteria as $resource => $expected) {
        $current = $verifiedCriteria[$resource] ?? null;
        if (!is_array($current) || ($current['finalUrls'] ?? []) !== $expected['final_urls']
            || (($expected['final_mobile_urls'] ?? []) && ($current['finalMobileUrls'] ?? []) !== $expected['final_mobile_urls'])) {
            throw new HubGoogleAdsApiException('campaign_destination_url_update_unverified', 502);
        }
    }
    $verifiedAssets = [];
    foreach ($verifiedAssetRows as $row) {
        $asset = $row['asset'] ?? null;
        if (is_array($asset)) $verifiedAssets[(string)($asset['resourceName'] ?? '')] = $asset;
    }
    foreach ($expectedAssets as $resource => $expected) {
        $current = $verifiedAssets[$resource] ?? null;
        if (!is_array($current) || ($current['finalUrls'] ?? []) !== $expected['final_urls']
            || (($expected['final_mobile_urls'] ?? []) && ($current['finalMobileUrls'] ?? []) !== $expected['final_mobile_urls'])) {
            throw new HubGoogleAdsApiException('campaign_destination_url_update_unverified', 502);
        }
    }
    $changedAds = count($mutateOperations) - count($expectedCriteria) - count($expectedAssets);
    $changedCriteria = count($expectedCriteria);
    $changedAssets = count($expectedAssets);
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'apply_campaign_destination_url',
        'campaign_id' => $campaignId,
        'campaign_name' => (string)($campaign['name'] ?? ''),
        'campaign_status' => (string)($campaign['status'] ?? ''),
        'final_url' => $finalUrl,
        'ads_updated' => $changedAds,
        'criteria_updated' => $changedCriteria,
        'assets_updated' => $changedAssets,
        'ads_already_current' => $adsAlreadyCurrent,
        'criteria_already_current' => $criteriaAlreadyCurrent,
        'assets_already_current' => $assetsAlreadyCurrent,
        'assets_skipped_shared' => $assetsSkippedShared,
        'assets_skipped_account_level' => $assetsSkippedAccount,
        'account_scoped_url_assets_not_changed' => $accountScopedUrlAssetCount,
        'verified' => true,
        'complete' => $assetsSkippedShared === 0 && $assetsSkippedAccount === 0 && $accountScopedUrlAssetCount === 0,
        'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

function hub_google_ads_campaign_action_json(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function hub_google_ads_campaign_action_dispatch(): never
{
    header('Cache-Control: no-store, private');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    try {
        $config = hub_google_ads_load_tracking_config();
        $authorization = hub_google_ads_authorize($config);
        if (is_string($authorization['origin'])) {
            header('Access-Control-Allow-Origin: ' . $authorization['origin']);
            header('Vary: Origin');
            header('Access-Control-Allow-Methods: POST, OPTIONS');
            header('Access-Control-Allow-Headers: Authorization, Content-Type');
            header('Access-Control-Max-Age: 300');
        }
        if ($authorization['status'] === 204) { http_response_code(204); exit; }
        if ($authorization['status'] !== 200) {
            hub_google_ads_campaign_action_json($authorization['status'], ['ok' => false, 'error' => $authorization['error']]);
        }
        if (($_SERVER['QUERY_STRING'] ?? '') !== '') {
            hub_google_ads_campaign_action_json(400, ['ok' => false, 'error' => 'invalid_payload']);
        }

        $payload = hub_google_ads_parse_request();
        $operation = $payload['operation'] ?? null;
        if ($operation === 'campaign_duplication_list') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_campaign_duplication_list($config, $payload));
        }
        if ($operation === 'campaign_duplication_inspect') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_campaign_duplication_inspect($config, $payload));
        }
        if ($operation === 'campaign_duplication_preview') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_campaign_duplication_preview($config, $payload));
        }
        if ($operation === 'campaign_duplication_create') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_campaign_duplication_create($config, $payload));
        }
        if ($operation === 'capabilities') {
            $keys = array_keys($payload);
            sort($keys, SORT_STRING);
            if ($keys !== ['customer_id', 'manager_customer_id', 'operation']) {
                hub_google_ads_campaign_action_json(400, ['ok' => false, 'error' => 'invalid_payload']);
            }
            $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
            $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
            if ($managerId === null || $customerId === null) {
                hub_google_ads_campaign_action_json(400, ['ok' => false, 'error' => 'invalid_payload']);
            }
            $enabled = false;
            if (hub_google_ads_campaign_actions_enabled($config)
                && hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
                $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
                $enabled = hub_google_ads_campaign_customer_is_active_child($accessToken, $managerId, $customerId);
            }
            hub_google_ads_campaign_action_json(200, [
                'ok' => true,
                'schema_version' => 1,
                'campaign_actions_enabled' => $enabled,
                'allowed_operations' => $enabled ? ['pause_campaign', 'enable_campaign'] : [],
            ]);
        }
        if ($operation === 'creation_capabilities') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['customer_id', 'manager_customer_id', 'operation']) {
                hub_google_ads_campaign_action_json(400, ['ok' => false, 'error' => 'invalid_payload']);
            }
            $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
            $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
            if ($managerId === null || $customerId === null) {
                hub_google_ads_campaign_action_json(400, ['ok' => false, 'error' => 'invalid_payload']);
            }
            $enabled = hub_google_ads_campaign_creation_enabled($config)
                && hub_google_ads_campaign_manager_is_allowed($config, $managerId);
            if ($enabled) {
                $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
                $enabled = hub_google_ads_campaign_customer_is_active_child($accessToken, $managerId, $customerId);
            }
            hub_google_ads_campaign_action_json(200, [
                'ok' => true,
                'schema_version' => 1,
                'campaign_creation_enabled' => $enabled,
                'allowed_operations' => $enabled ? ['preview_search_campaign', 'create_search_campaign', 'apply_audience_targeting', 'apply_configured_audience_targeting', 'apply_audience_exclusions', 'apply_campaign_sitelinks', 'apply_campaign_destination_url', 'campaign_duplication_list', 'campaign_duplication_inspect', 'campaign_duplication_preview', 'campaign_duplication_create'] : [],
            ]);
        }
        if ($operation === 'campaign_templates') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['customer_id', 'manager_customer_id', 'operation']) {
                throw new HubGoogleAdsApiException('invalid_payload', 400);
            }
            $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
            $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
            if ($managerId === null || $customerId === null) throw new HubGoogleAdsApiException('invalid_payload', 400);
            if (!hub_google_ads_campaign_creation_enabled($config) || !hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
                throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
            }
            $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
            hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);
            $catalog = hub_google_ads_campaign_creation_templates($accessToken, $managerId, $customerId);
            hub_google_ads_campaign_action_json(200, [
                'ok' => true,
                'schema_version' => 1,
                'operation' => 'campaign_templates',
                'customer_id' => $customerId,
                'currency_code' => $catalog['currency_code'],
                'template_count' => count($catalog['templates']),
                'templates' => $catalog['templates'],
            ]);
        }
        if ($operation === 'preview_search_campaign' || $operation === 'create_search_campaign') {
            $result = hub_google_ads_campaign_creation_preview_or_create($config, $payload, $operation === 'create_search_campaign');
            hub_google_ads_campaign_action_json(200, $result);
        }
        if ($operation === 'apply_audience_targeting') {
            [$managerId, $customerId, $campaignId, $adGroupId, $audienceIds] = hub_google_ads_campaign_audience_targeting_validate_payload($payload);
            $result = hub_google_ads_campaign_audience_targeting_apply($config, $managerId, $customerId, $campaignId, $adGroupId, $audienceIds);
            hub_google_ads_campaign_action_json(200, $result);
        }
        if ($operation === 'apply_configured_audience_targeting') {
            [$managerId, $customerId, $campaignId, $adGroupId, $audienceIds] = hub_google_ads_campaign_configured_audience_targeting_validate_payload($payload);
            $result = hub_google_ads_campaign_audience_targeting_apply($config, $managerId, $customerId, $campaignId, $adGroupId, $audienceIds);
            $result['operation'] = 'apply_configured_audience_targeting';
            hub_google_ads_campaign_action_json(200, $result);
        }
        if ($operation === 'apply_audience_exclusions') {
            [$managerId, $customerId, $campaignId] = hub_google_ads_campaign_audience_exclusions_validate_payload($payload);
            $result = hub_google_ads_campaign_audience_exclusions_apply($config, $managerId, $customerId, $campaignId);
            hub_google_ads_campaign_action_json(200, $result);
        }
        if ($operation === 'audience_targeting_upload_csv') {
            [$managerId, $groups] = hub_google_ads_campaign_audience_targeting_upload_validate_payload($payload);
            if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
                throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
            }
            $csv = hub_google_ads_campaign_audience_targeting_upload_csv($groups);
            hub_google_ads_campaign_action_json(200, [
                'ok' => true,
                'schema_version' => 1,
                'operation' => 'audience_targeting_upload_csv',
                'manager_customer_id' => $managerId,
                'audience_count' => 918,
                'group_count' => count($groups),
                'row_count' => count($groups) * 918,
                'csv_content' => $csv,
            ]);
        }
        if ($operation === 'audience_targeting_upload_csv_stream') {
            [$managerId, $groups] = hub_google_ads_campaign_audience_targeting_upload_validate_payload($payload, 'audience_targeting_upload_csv_stream');
            if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
                throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
            }
            hub_google_ads_campaign_audience_targeting_upload_csv_stream($managerId, $groups);
        }
        if ($operation === 'audience_exclusion_upload_catalog') {
            [$managerId, $customerId, $campaignIds] = hub_google_ads_campaign_audience_exclusion_upload_validate_payload($payload);
            if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
                throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
            }
            $audiences = hub_google_ads_campaign_audience_exclusion_upload_catalog();
            hub_google_ads_campaign_action_json(200, [
                'ok' => true,
                'schema_version' => 1,
                'operation' => 'audience_exclusion_upload_catalog',
                'customer_id' => $customerId,
                'campaign_count' => count($campaignIds),
                'exclusion_count_per_campaign' => count($audiences),
                'audiences' => $audiences,
            ]);
        }
        if ($operation === 'apply_campaign_sitelinks') {
            [$managerId, $customerId, $campaignId, $sitelinks] = hub_google_ads_campaign_sitelinks_validate_payload($payload);
            $result = hub_google_ads_campaign_sitelinks_apply($config, $managerId, $customerId, $campaignId, $sitelinks);
            hub_google_ads_campaign_action_json(200, $result);
        }
        if ($operation === 'apply_campaign_destination_url') {
            [$managerId, $customerId, $campaignId, $batchCampaignIds, $finalUrl] = hub_google_ads_campaign_destination_url_validate_payload($payload);
            $result = hub_google_ads_campaign_destination_url_apply($config, $managerId, $customerId, $campaignId, $batchCampaignIds, $finalUrl);
            hub_google_ads_campaign_action_json(200, $result);
        }
        if (!in_array($operation, ['pause_campaign', 'enable_campaign'], true)) {
            hub_google_ads_campaign_action_json(400, ['ok' => false, 'error' => 'invalid_payload']);
        }

        [$managerId, $customerId, $campaignId, $operation, $expectedStatus, $targetStatus, $notificationContext] = hub_google_ads_campaign_action_validate_status_change($payload);
        if (!hub_google_ads_campaign_actions_enabled($config)) {
            throw new HubGoogleAdsApiException('campaign_writes_disabled', 403);
        }
        if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
            throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
        }
        $result = hub_google_ads_change_campaign_status(
            $config,
            $managerId,
            $customerId,
            $campaignId,
            $operation,
            $expectedStatus,
            $targetStatus
        );
        if ($notificationContext === 'automatic_negative_remaining' && $operation === 'pause_campaign') {
            $result['email_notification_status'] = $result['changed'] === true && $result['status'] === 'PAUSED'
                ? google_ads_campaign_pause_email_queue_verified_transition(
                    $config,
                    $managerId,
                    $customerId,
                    $campaignId,
                    (string)($result['campaign_name'] ?? ''),
                    (string)($result['verified_at_utc'] ?? '')
                )
                : 'not_queued_no_change';
        }
        hub_google_ads_campaign_action_json(200, $result);
    } catch (HubGoogleAdsApiException $error) {
        hub_google_ads_campaign_action_json($error->httpStatus, ['ok' => false, 'error' => $error->apiCode]);
    } catch (Throwable $error) {
        error_log('Google Ads campaign action request failed.');
        hub_google_ads_campaign_action_json(500, ['ok' => false, 'error' => 'server_error']);
    }
}
