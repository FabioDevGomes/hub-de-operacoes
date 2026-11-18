<?php
declare(strict_types=1);

// Separate write surface. Shared authentication, credentials, OAuth and
// Google Ads HTTP helpers remain defined by the read-only service.
require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-readonly-service.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-campaign-pause-email-service.php';

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
    $expected = ['campaign_name', 'customer_id', 'descriptions', 'final_url', 'headlines', 'manager_customer_id', 'operation', 'promotion', 'source_campaign_id'];
    if ($confirmRequired) $expected[] = 'confirm';
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    if ($keys !== $expected || ($confirmRequired && ($payload['confirm'] ?? null) !== true)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
    $sourceId = $payload['source_campaign_id'];
    $name = $payload['campaign_name'];
    $url = $payload['final_url'];
    if ($managerId === null || $customerId === null
        || !is_string($sourceId) || preg_match('/^[1-9][0-9]{0,19}$/D', $sourceId) !== 1
        || !is_string($name) || trim($name) !== $name || $name === '' || hub_google_ads_campaign_creation_text_length($name) > 128
        || preg_match('/[\x00-\x1F\x7F]/', $name) === 1
        || !is_string($url) || strlen($url) > 2048 || filter_var($url, FILTER_VALIDATE_URL) === false
        || strtolower((string)parse_url($url, PHP_URL_SCHEME)) !== 'https'
        || !is_string(parse_url($url, PHP_URL_HOST))) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
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
    $expectedPromo = ['discount_type', 'discount_value', 'end_date', 'language_code', 'start_date', 'target', 'trigger_type', 'trigger_value']; sort($expectedPromo, SORT_STRING);
    if ($promoKeys !== $expectedPromo
        || !is_string($promotion['target'] ?? null) || trim($promotion['target']) !== ($promotion['target'] ?? null)
        || $promotion['target'] === '' || hub_google_ads_campaign_creation_text_length($promotion['target']) > 25
        || !in_array($promotion['discount_type'] ?? null, ['percent_off', 'amount_off'], true)
        || !is_string($promotion['discount_value'] ?? null)
        || !in_array($promotion['trigger_type'] ?? null, ['promotion_code', 'orders_over_amount'], true)
        || !is_string($promotion['trigger_value'] ?? null)
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
    } elseif (hub_google_ads_campaign_creation_decimal_micros($promotion['trigger_value']) === null
        || hub_google_ads_campaign_creation_decimal_micros($promotion['trigger_value']) === '0') {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    return [$managerId, $customerId, $sourceId, $name, $url, $payload['headlines'], $payload['descriptions'], $promotion];
}

function hub_google_ads_campaign_creation_operations(string $customerId, array $template, string $campaignName, string $finalUrl, array $headlines, array $descriptions, array $promotion, string $currencyCode): array
{
    $campaignResource = 'customers/' . $customerId . '/campaigns/-2';
    $adGroupResource = 'customers/' . $customerId . '/adGroups/-3';
    $budgetResource = 'customers/' . $customerId . '/campaignBudgets/-1';
    $assetResource = 'customers/' . $customerId . '/assets/-4';
    $operations = [[
        'campaignBudgetOperation' => ['create' => [
            'resourceName' => $budgetResource,
            'name' => hub_google_ads_campaign_creation_substr($campaignName . ' - orçamento Hub', 0, 255),
            'deliveryMethod' => 'STANDARD',
            'amountMicros' => (string)$template['daily_budget_micros'],
            'explicitlyShared' => false,
        ]],
    ], [
        'campaignOperation' => ['create' => [
            'resourceName' => $campaignResource,
            'name' => $campaignName,
            'advertisingChannelType' => 'SEARCH',
            'status' => 'PAUSED',
            'manualCpc' => ['enhancedCpcEnabled' => (bool)$template['enhanced_cpc_enabled']],
            'campaignBudget' => $budgetResource,
            'networkSettings' => $template['network_settings'],
            'containsEuPoliticalAdvertising' => $template['contains_eu_political_advertising'],
        ]],
    ]];
    foreach ($template['tracking_settings'] as $field => $value) {
        if ($value === null || $value === '' || $value === []) continue;
        $apiField = match ($field) {
            'tracking_url_template' => 'trackingUrlTemplate',
            'final_url_suffix' => 'finalUrlSuffix',
            'url_custom_parameters' => 'urlCustomParameters',
            default => null,
        };
        if ($apiField !== null) $operations[1]['campaignOperation']['create'][$apiField] = $value;
    }
    foreach ($template['campaign_criteria'] as $criterion) {
        if ($criterion['type'] === 'LOCATION') {
            $operations[] = ['campaignCriterionOperation' => ['create' => [
                'campaign' => $campaignResource,
                'negative' => (bool)$criterion['negative'],
                'location' => ['geoTargetConstant' => 'geoTargetConstants/' . basename((string)$criterion['geo_target_constant'])],
            ]]];
        } elseif ($criterion['type'] === 'KEYWORD') {
            $operations[] = ['campaignCriterionOperation' => ['create' => [
                'campaign' => $campaignResource,
                'negative' => true,
                'keyword' => ['text' => $criterion['text'], 'matchType' => $criterion['match_type']],
            ]]];
        }
    }
    $adGroupName = hub_google_ads_campaign_creation_substr((string)$template['source_ad_group']['name'] . ' - novo', 0, 255);
    $operations[] = ['adGroupOperation' => ['create' => [
        'resourceName' => $adGroupResource,
        'name' => $adGroupName,
        'campaign' => $campaignResource,
        'status' => 'ENABLED',
        'type' => 'SEARCH_STANDARD',
        'cpcBidMicros' => (string)$template['source_ad_group']['cpc_bid_micros'],
    ]]];
    foreach ($template['source_ad_group']['tracking_settings'] as $field => $value) {
        if ($value === null || $value === '' || $value === []) continue;
        $apiField = match ($field) {
            'tracking_url_template' => 'trackingUrlTemplate',
            'final_url_suffix' => 'finalUrlSuffix',
            'url_custom_parameters' => 'urlCustomParameters',
            default => null,
        };
        if ($apiField !== null) $operations[array_key_last($operations)]['adGroupOperation']['create'][$apiField] = $value;
    }
    foreach ($template['keywords'] as $keyword) {
        $operations[] = ['adGroupCriterionOperation' => ['create' => [
            'adGroup' => $adGroupResource,
            'status' => 'ENABLED',
            'keyword' => ['text' => $keyword['text'], 'matchType' => $keyword['match_type']],
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
    foreach ($template['source_ad']['tracking_settings'] as $field => $value) {
        if ($value === null || $value === '' || $value === []) continue;
        $apiField = match ($field) {
            'tracking_url_template' => 'trackingUrlTemplate',
            'final_url_suffix' => 'finalUrlSuffix',
            'url_custom_parameters' => 'urlCustomParameters',
            default => null,
        };
        if ($apiField !== null) $operations[array_key_last($operations)]['adGroupAdOperation']['create']['ad'][$apiField] = $value;
    }
    $promotionAsset = [
        'resourceName' => $assetResource,
        'name' => hub_google_ads_campaign_creation_substr($campaignName . ' - promoção Hub', 0, 255),
        'promotionAsset' => [
            'promotionTarget' => $promotion['target'],
            'languageCode' => $promotion['language_code'],
        ],
    ];
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
    } else {
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
    [$managerId, $customerId, $sourceId, $name, $url, $headlines, $descriptions, $promotion] =
        hub_google_ads_campaign_creation_validate_payload($payload, $create);
    if (!hub_google_ads_campaign_creation_enabled($config)) throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);
    $catalog = hub_google_ads_campaign_creation_templates($accessToken, $managerId, $customerId);
    $template = null;
    foreach ($catalog['templates'] as $candidate) if ($candidate['campaign_id'] === $sourceId) { $template = $candidate; break; }
    if (!is_array($template)) throw new HubGoogleAdsApiException('campaign_template_not_eligible', 422);
    $duplicateQuery = 'SELECT campaign.id FROM campaign WHERE campaign.name = '
        . hub_google_ads_campaign_creation_gaql_string($name) . " AND campaign.status != 'REMOVED' LIMIT 2";
    $duplicates = hub_google_ads_search($customerId, $duplicateQuery, $accessToken, $managerId);
    if (count($duplicates) > 1) throw new HubGoogleAdsApiException('campaign_name_conflict', 409);
    if ($duplicates) throw new HubGoogleAdsApiException('campaign_name_already_exists', 409);
    $operations = hub_google_ads_campaign_creation_operations($customerId, $template, $name, $url, $headlines, $descriptions, $promotion, (string)$catalog['currency_code']);
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
            'account_currency' => $catalog['currency_code'],
            'source_campaign_id' => $template['campaign_id'],
            'source_campaign_name' => $template['campaign_name'],
            'copied_daily_budget_micros' => $template['daily_budget_micros'],
            'copied_network_settings' => $template['network_settings'],
            'copied_location_count' => count(array_filter($template['campaign_criteria'], static fn(array $item): bool => $item['type'] === 'LOCATION')),
            'copied_keyword_count' => count($template['keywords']),
            'tracking_settings_copied' => [
                'campaign' => array_filter($template['tracking_settings'], static fn(mixed $value): bool => $value !== null && $value !== '' && $value !== []) !== [],
                'ad_group' => array_filter($template['source_ad_group']['tracking_settings'], static fn(mixed $value): bool => $value !== null && $value !== '' && $value !== []) !== [],
                'ad' => array_filter($template['source_ad']['tracking_settings'], static fn(mixed $value): bool => $value !== null && $value !== '' && $value !== []) !== [],
            ],
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
                'allowed_operations' => $enabled ? ['campaign_templates', 'preview_search_campaign', 'create_search_campaign'] : [],
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
