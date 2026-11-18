<?php
declare(strict_types=1);

const GURUMEDIA_SALES_MAX_REPORT_BODY_BYTES = 262144;
const GURUMEDIA_CAMPAIGN_MAX_TRACKS = 100;
const GURUMEDIA_CAMPAIGN_MAX_SALES = 500;
const GURUMEDIA_CAMPAIGN_MAX_GOOGLE_ADS_QUERIES = 20;
const GURUMEDIA_CAMPAIGN_MAX_GCLIDS_PER_QUERY = 50;
const GURUMEDIA_CAMPAIGN_MAX_GAQL_LENGTH = 8000;
const GURUMEDIA_ADS_MAX_ROUTES = 500;
const GURUMEDIA_ADS_ADMIN_HEADER = 'X-Tracking-Admin';

function gurumedia_sales_send_json(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function gurumedia_sales_config(): array
{
    if (!function_exists('tracking_clicks_load_config')) {
        throw new RuntimeException('api_not_configured');
    }
    return tracking_clicks_load_config();
}

function gurumedia_sales_text($value, int $maxLength): ?string
{
    if (!is_string($value) || $value === '' || strlen($value) > $maxLength
        || preg_match('/[\x00-\x1F\x7F]/', $value) === 1) {
        return null;
    }
    return trim($value) !== '' ? trim($value) : null;
}

function gurumedia_sales_uuid($value): ?string
{
    if (!is_string($value) || preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $value) !== 1) {
        return null;
    }
    return strtolower($value);
}

function gurumedia_sales_new_uuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-'
        . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
}

/** Normalize a GuruMedia conversion timestamp to UTC without falling back to receipt time. */
function gurumedia_sales_normalize_conversion_time(mixed $value): array
{
    if ($value === null || $value === '') return [null, 'missing'];
    if (!is_string($value) || trim($value) === '' || strlen($value) > 64) return [null, 'invalid'];
    $raw = trim($value);
    $utc = new DateTimeZone('UTC');

    if (preg_match('/^\d{10}$/D', $raw) === 1 || preg_match('/^\d{13}$/D', $raw) === 1) {
        $isMilliseconds = preg_match('/^\d{13}$/D', $raw) === 1;
        $seconds = $isMilliseconds ? substr($raw, 0, 10) : $raw;
        $microseconds = $isMilliseconds
            ? str_pad((string)((int)substr($raw, 10, 3) * 1000), 6, '0', STR_PAD_LEFT)
            : '000000';
        $date = DateTimeImmutable::createFromFormat('U.u', $seconds . '.' . $microseconds, $utc);
        $errors = DateTimeImmutable::getLastErrors();
        if ($date === false || (is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
            return [null, 'invalid'];
        }
        return [$date->setTimezone($utc)->format('Y-m-d H:i:s.v'), 'valid'];
    }

    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/iD', $raw, $parts) !== 1) {
        return [null, 'invalid'];
    }
    $year = (int)$parts[1];
    $month = (int)$parts[2];
    $day = (int)$parts[3];
    $hour = (int)$parts[4];
    $minute = (int)$parts[5];
    $second = (int)$parts[6];
    if (!checkdate($month, $day, $year) || $hour > 23 || $minute > 59 || $second > 59) {
        return [null, 'invalid'];
    }
    $fraction = str_pad((string)($parts[7] ?? ''), 6, '0');
    $zone = strtoupper($parts[8]) === 'Z' ? '+00:00' : $parts[8];
    if ($zone !== '+00:00' && $zone !== '-00:00') {
        $zoneParts = array_map('intval', explode(':', substr($zone, 1)));
        if (($zoneParts[0] ?? 99) > 23 || ($zoneParts[1] ?? 99) > 59) return [null, 'invalid'];
    }
    $formatted = sprintf('%04d-%02d-%02dT%02d:%02d:%02d.%s%s', $year, $month, $day, $hour, $minute, $second, $fraction, $zone);
    $date = DateTimeImmutable::createFromFormat('!Y-m-d\\TH:i:s.uP', $formatted);
    $errors = DateTimeImmutable::getLastErrors();
    if ($date === false || (is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
        return [null, 'invalid'];
    }
    return [$date->setTimezone($utc)->format('Y-m-d H:i:s.v'), 'valid'];
}

function gurumedia_sales_attempt(PDO $pdo, string $transactionHash, string $result, bool $hasClickId, array $details = []): int
{
    $statement = $pdo->prepare(
        'INSERT INTO gurumedia_postback_attempts
            (transaction_hash, result_code, has_click_id, offer_id, offer_name, payout_amount, currency,
             conversion_at_utc, product_key, product_label, presell_host, offer_mapping_status)
         VALUES (:transaction_hash, :result_code, :has_click_id, :offer_id, :offer_name, :payout_amount, :currency,
             :conversion_at_utc, :product_key, :product_label, :presell_host, :offer_mapping_status)
         ON DUPLICATE KEY UPDATE
            id = LAST_INSERT_ID(id),
            result_code = VALUES(result_code),
            has_click_id = VALUES(has_click_id),
            offer_id = COALESCE(VALUES(offer_id), offer_id),
            offer_name = COALESCE(VALUES(offer_name), offer_name),
            payout_amount = COALESCE(VALUES(payout_amount), payout_amount),
            currency = COALESCE(VALUES(currency), currency),
            conversion_at_utc = COALESCE(VALUES(conversion_at_utc), conversion_at_utc),
            product_key = COALESCE(VALUES(product_key), product_key),
            product_label = COALESCE(VALUES(product_label), product_label),
            presell_host = COALESCE(VALUES(presell_host), presell_host),
            offer_mapping_status = COALESCE(VALUES(offer_mapping_status), offer_mapping_status),
            attempt_count = attempt_count + 1,
            last_received_at_utc = CURRENT_TIMESTAMP(3)'
    );
    $statement->execute([
        ':transaction_hash' => $transactionHash,
        ':result_code' => $result,
        ':has_click_id' => $hasClickId ? 1 : 0,
        ':offer_id' => $details['offer_id'] ?? null,
        ':offer_name' => $details['offer_name'] ?? null,
        ':payout_amount' => $details['payout_amount'] ?? null,
        ':currency' => $details['currency'] ?? null,
        ':conversion_at_utc' => $details['conversion_at_utc'] ?? null,
        ':product_key' => $details['product_key'] ?? null,
        ':product_label' => $details['product_label'] ?? null,
        ':presell_host' => $details['presell_host'] ?? null,
        ':offer_mapping_status' => $details['offer_mapping_status'] ?? null,
    ]);
    $id = (int)$pdo->lastInsertId();
    if ($id < 1) {
        $find = $pdo->prepare('SELECT id FROM gurumedia_postback_attempts WHERE transaction_hash = :hash LIMIT 1');
        $find->execute([':hash' => $transactionHash]);
        $id = (int)$find->fetchColumn();
    }
    if ($id < 1) throw new RuntimeException('attempt_reference_invalid');
    return $id;
}

function gurumedia_sales_find_offer_tracks(PDO $pdo, string $offerId): array
{
    $statement = $pdo->prepare(
        'SELECT COALESCE(product_key, page_host) AS product_key,
                MAX(product_label) AS product_label,
                MIN(page_host) AS presell_host
         FROM tracking_allowed_domains
         WHERE platform = \'gurumedia\' AND offer_id = :offer_id
         GROUP BY COALESCE(product_key, page_host)
         ORDER BY product_key ASC
         LIMIT 2'
    );
    $statement->execute([':offer_id' => $offerId]);
    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

function gurumedia_sales_email_enqueue_unmatched(PDO $pdo, int $attemptId): void
{
    if ($attemptId < 1) throw new RuntimeException('attempt_reference_invalid');
    $statement = $pdo->prepare(
        'INSERT IGNORE INTO gurumedia_postback_email_outbox
            (postback_attempt_id, notification_kind, created_at_utc, next_attempt_at_utc)
         VALUES (:attempt_id, \'unmatched_sale\', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))'
    );
    $statement->execute([':attempt_id' => $attemptId]);
}

function gurumedia_sales_find_track(PDO $pdo, string $clickId): array
{
    $statement = $pdo->prepare(
        'SELECT e.product_key, e.presell_host, d.product_label, d.offer_id,
                COALESCE(d.product_key, d.page_host) AS mapping_product_key
         FROM tracking_events AS e
         INNER JOIN tracking_allowed_domains AS d
            ON d.page_host = e.presell_host
            AND (d.product_key IS NULL OR d.product_key = e.product_key)
            AND d.platform = \'gurumedia\'
         WHERE e.event_type = \'outbound_click\'
           AND e.click_id = :click_id
         LIMIT 2'
    );
    $statement->execute([':click_id' => $clickId]);
    return $statement->fetchAll();
}

function gurumedia_sales_valid_host(mixed $value): ?string
{
    if (!is_string($value) || strlen($value) > 253) return null;
    $host = strtolower(trim($value));
    if ($host === '' || preg_match('/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/D', $host) !== 1) return null;
    return $host;
}

function gurumedia_sales_valid_campaign_track_accounts(mixed $value): array
{
    if (!is_array($value) || !array_is_list($value) || count($value) > GURUMEDIA_CAMPAIGN_MAX_TRACKS) {
        throw new InvalidArgumentException('invalid_track_accounts');
    }
    $tracks = [];
    foreach ($value as $track) {
        if (!is_array($track) || array_is_list($track)) throw new InvalidArgumentException('invalid_track_accounts');
        $keys = array_keys($track);
        sort($keys, SORT_STRING);
        if ($keys !== ['customer_id', 'manager_customer_id', 'presell_host', 'product_key']) {
            throw new InvalidArgumentException('invalid_track_accounts');
        }
        $host = gurumedia_sales_valid_host($track['presell_host'] ?? null);
        $productKey = $track['product_key'] ?? null;
        if ($productKey !== null && (!is_string($productKey) || preg_match('/^[a-z0-9](?:[a-z0-9._-]{0,251}[a-z0-9])?$/D', $productKey) !== 1)) {
            throw new InvalidArgumentException('invalid_track_accounts');
        }
        $customerId = is_string($track['customer_id'] ?? null) ? $track['customer_id'] : '';
        $managerId = is_string($track['manager_customer_id'] ?? null) ? $track['manager_customer_id'] : '';
        if ($host === null || preg_match('/^[1-9][0-9]{9}$/D', $customerId) !== 1
            || preg_match('/^[1-9][0-9]{9}$/D', $managerId) !== 1) {
            throw new InvalidArgumentException('invalid_track_accounts');
        }
        $identity = $host . "\0" . ($productKey ?? '');
        if (isset($tracks[$identity])) throw new InvalidArgumentException('invalid_track_accounts');
        $tracks[$identity] = [
            'presell_host' => $host,
            'product_key' => $productKey,
            'customer_id' => $customerId,
            'manager_customer_id' => $managerId,
        ];
    }
    return array_values($tracks);
}

function gurumedia_sales_mask_gclid(?string $gclid): ?string
{
    if (!is_string($gclid) || strlen($gclid) < 12 || preg_match('/^[\x21-\x7e]+$/D', $gclid) !== 1) return null;
    return '…' . substr($gclid, -6);
}

function gurumedia_sales_campaign_detail(
    array $sale,
    string $status,
    ?array $campaign = null,
    ?string $errorCode = null,
    ?array $clickDiagnostics = null
): array
{
    return [
        'received_at_utc' => (string)$sale['received_at_utc'],
        'conversion_at_utc' => $sale['conversion_at_utc'] === null ? null : (string)$sale['conversion_at_utc'],
        'product_key' => $sale['product_key'] === null ? null : (string)$sale['product_key'],
        'product_label' => $sale['product_label'] === null ? null : (string)$sale['product_label'],
        'presell_host' => (string)$sale['presell_host'],
        'offer_name' => $sale['offer_name'] === null ? null : (string)$sale['offer_name'],
        'currency' => (string)$sale['currency'],
        'payout_amount' => (string)$sale['payout_amount'],
        'status' => $status,
        'campaign_id' => $campaign['campaign_id'] ?? null,
        'campaign_name' => $campaign['campaign_name'] ?? null,
        'error_code' => $errorCode,
        'click_at_utc' => $clickDiagnostics['click_at_utc'] ?? null,
        'gclid_masked' => $clickDiagnostics['gclid_masked'] ?? null,
    ];
}

/** Split exact GCLID values into bounded GAQL batches. */
function gurumedia_sales_campaign_gclid_batches(array $gclids): array
{
    $baseLength = strlen("SELECT click_view.gclid, segments.date, campaign.id, campaign.name FROM click_view WHERE segments.date = '0000-00-00' AND click_view.gclid IN () LIMIT 1000");
    $batches = [];
    $batch = [];
    $batchLength = $baseLength;
    foreach (array_values(array_unique($gclids)) as $gclid) {
        if (!is_string($gclid) || $gclid === '') continue;
        $escapedLength = strlen(str_replace(['\\', "'"], ['\\\\', "\\'"], $gclid)) + 2;
        $additionLength = $escapedLength + ($batch === [] ? 0 : 2);
        if ($batch !== [] && (count($batch) >= GURUMEDIA_CAMPAIGN_MAX_GCLIDS_PER_QUERY
            || $batchLength + $additionLength > GURUMEDIA_CAMPAIGN_MAX_GAQL_LENGTH)) {
            $batches[] = $batch;
            $batch = [];
            $batchLength = $baseLength;
            $additionLength = $escapedLength;
        }
        if ($batchLength + $additionLength > GURUMEDIA_CAMPAIGN_MAX_GAQL_LENGTH) {
            throw new InvalidArgumentException('invalid_campaign_gclid');
        }
        $batch[] = $gclid;
        $batchLength += $additionLength;
    }
    if ($batch !== []) $batches[] = $batch;
    return $batches;
}

/** Look up exact GCLIDs in one customer-local ClickView day using the shared Google Ads transport. */
function gurumedia_sales_campaign_click_view_matches(
    string $customerId,
    ?string $managerId,
    string $clickDate,
    array $gclids,
    string $accessToken
): array {
    if (hub_google_ads_valid_customer_id($customerId) === null
        || ($managerId !== null && hub_google_ads_valid_customer_id($managerId) === null)
        || hub_google_ads_parse_date($clickDate) === null
        || $gclids === [] || count($gclids) > GURUMEDIA_CAMPAIGN_MAX_GCLIDS_PER_QUERY) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $safeGclids = [];
    foreach ($gclids as $gclid) {
        if (!is_string($gclid) || strlen($gclid) > 2048
            || preg_match('/^[\x21-\x7e]+$/D', $gclid) !== 1) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $safeGclids[$gclid] = true;
    }
    $quotedGclids = array_map(
        static fn(string $gclid): string => "'" . str_replace(['\\', "'"], ['\\\\', "\\'"], $gclid) . "'",
        array_keys($safeGclids)
    );
    $query = 'SELECT click_view.gclid, segments.date, campaign.id, campaign.name '
        . 'FROM click_view WHERE segments.date = ' . "'{$clickDate}'"
        . ' AND click_view.gclid IN (' . implode(', ', $quotedGclids) . ') LIMIT 1000';
    $rows = hub_google_ads_search($customerId, $query, $accessToken, $managerId);
    $matches = [];
    foreach ($rows as $row) {
        $clickView = is_array($row['clickView'] ?? null) ? $row['clickView'] : [];
        $campaign = is_array($row['campaign'] ?? null) ? $row['campaign'] : [];
        $gclid = $clickView['gclid'] ?? null;
        $campaignId = (string)($campaign['id'] ?? '');
        $campaignName = (string)($campaign['name'] ?? '');
        if (!is_string($gclid) || !isset($safeGclids[$gclid])
            || !preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId)
            || $campaignName === '') continue;
        $matches[$gclid][] = ['campaign_id' => $campaignId, 'campaign_name' => $campaignName];
    }
    return $matches;
}

/** Resolve matched GuruMedia sales to Google Ads campaigns through server-side GCLID lookups. */
function gurumedia_sales_campaign_attribution(PDO $pdo, array $dates, array $trackAccounts): array
{
    if ($trackAccounts === []) {
        return ['rows' => [], 'query_count' => 0, 'truncated' => false];
    }
    require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-readonly-service.php';

    $predicates = [];
    $parameters = [
        ':start_at_utc' => $dates['start_at_utc'],
        ':end_before_utc' => $dates['end_before_utc'],
    ];
    foreach ($trackAccounts as $index => $track) {
        $hostName = ':track_host_' . $index;
        $productName = ':track_product_' . $index;
        $predicates[] = '(s.presell_host = ' . $hostName . ' AND s.product_key <=> ' . $productName . ')';
        $parameters[$hostName] = $track['presell_host'];
        $parameters[$productName] = $track['product_key'];
    }
    $statement = $pdo->prepare(
        'SELECT s.id, s.click_id,
                CONCAT(SUBSTRING(DATE_FORMAT(s.received_at_utc, \'%Y-%m-%dT%H:%i:%s.%f\'), 1, 23), \'Z\') AS received_at_utc,
                CASE WHEN s.conversion_at_utc IS NULL THEN NULL
                     ELSE CONCAT(SUBSTRING(DATE_FORMAT(s.conversion_at_utc, \'%Y-%m-%dT%H:%i:%s.%f\'), 1, 23), \'Z\')
                END AS conversion_at_utc,
                s.product_key, s.product_label, s.presell_host, s.offer_name, s.currency,
                CAST(s.payout_amount AS CHAR) AS payout_amount
         FROM gurumedia_sales AS s
         WHERE s.received_at_utc >= :start_at_utc AND s.received_at_utc < :end_before_utc
           AND (' . implode(' OR ', $predicates) . ')
           AND EXISTS (
               SELECT 1 FROM tracking_allowed_domains AS d
               WHERE d.page_host = s.presell_host AND d.platform = \'gurumedia\'
                 AND (d.product_key IS NULL OR d.product_key = s.product_key)
           )
         ORDER BY COALESCE(s.conversion_at_utc, s.received_at_utc) DESC, s.id DESC
         LIMIT ' . (GURUMEDIA_CAMPAIGN_MAX_SALES + 1)
    );
    $statement->execute($parameters);
    $sales = $statement->fetchAll();
    $truncated = count($sales) > GURUMEDIA_CAMPAIGN_MAX_SALES;
    if ($truncated) $sales = array_slice($sales, 0, GURUMEDIA_CAMPAIGN_MAX_SALES);
    if ($sales === []) return ['rows' => [], 'query_count' => 0, 'truncated' => $truncated];

    $clickIds = array_values(array_unique(array_filter(array_map(
        static fn(array $sale): ?string => is_string($sale['click_id'] ?? null) ? (string)$sale['click_id'] : null,
        $sales
    ))));
    $clicksById = [];
    if ($clickIds !== []) {
        $placeholders = [];
        $clickParameters = [];
        foreach ($clickIds as $index => $clickId) {
            $placeholder = ':click_id_' . $index;
            $placeholders[] = $placeholder;
            $clickParameters[$placeholder] = $clickId;
        }
        $clickStatement = $pdo->prepare(
            'SELECT click_id, COUNT(*) AS event_count,
                    COUNT(DISTINCT NULLIF(gclid, \'\')) AS gclid_count,
                    MIN(NULLIF(gclid, \'\')) AS gclid,
                    COUNT(DISTINCT NULLIF(gbraid, \'\')) AS gbraid_count,
                    COUNT(DISTINCT NULLIF(wbraid, \'\')) AS wbraid_count,
                    MIN(received_at_utc) AS click_at_utc
             FROM tracking_events
             WHERE event_type = \'outbound_click\' AND click_id IN (' . implode(', ', $placeholders) . ')
             GROUP BY click_id'
        );
        $clickStatement->execute($clickParameters);
        foreach ($clickStatement->fetchAll() as $click) $clicksById[(string)$click['click_id']] = $click;
    }

    $trackMap = [];
    foreach ($trackAccounts as $track) $trackMap[$track['presell_host'] . "\0" . ($track['product_key'] ?? '')] = $track;
    $results = [];
    $groups = [];
    $utc = new DateTimeZone('UTC');
    foreach ($sales as $sale) {
        $identity = (string)$sale['presell_host'] . "\0" . (($sale['product_key'] === null) ? '' : (string)$sale['product_key']);
        $track = $trackMap[$identity] ?? null;
        $index = count($results);
        if ($track === null) {
            $results[] = gurumedia_sales_campaign_detail($sale, 'track_mapping_missing');
            continue;
        }
        $click = $clicksById[(string)$sale['click_id']] ?? null;
        if (!is_array($click) || (int)$click['event_count'] < 1) {
            $results[] = gurumedia_sales_campaign_detail($sale, 'click_missing');
            continue;
        }
        if ((int)$click['event_count'] !== 1 || (int)$click['gclid_count'] > 1) {
            $results[] = gurumedia_sales_campaign_detail($sale, 'click_ambiguous');
            continue;
        }
        if ((int)$click['gclid_count'] !== 1 || !is_string($click['gclid'] ?? null) || $click['gclid'] === '') {
            $braidExists = (int)$click['gbraid_count'] > 0 || (int)$click['wbraid_count'] > 0;
            $results[] = gurumedia_sales_campaign_detail($sale, $braidExists ? 'gclid_missing_braid_present' : 'gclid_missing');
            continue;
        }
        if (strlen((string)$click['gclid']) > 2048 || preg_match('/^[\x21-\x7e]+$/D', (string)$click['gclid']) !== 1) {
            $results[] = gurumedia_sales_campaign_detail($sale, 'gclid_invalid');
            continue;
        }
        try {
            $clickUtc = new DateTimeImmutable((string)$click['click_at_utc'], $utc);
        } catch (Throwable $error) {
            $results[] = gurumedia_sales_campaign_detail($sale, 'click_time_invalid');
            continue;
        }
        $customerId = $track['customer_id'];
        $managerId = $track['manager_customer_id'];
        $customerKey = $managerId . ':' . $customerId;
        if (!isset($groups['customers'][$customerKey])) {
            $groups['customers'][$customerKey] = ['manager_customer_id' => $managerId, 'customer_id' => $customerId];
        }
        $groups['pending'][] = [
            'index' => $index,
            'sale' => $sale,
            'gclid' => (string)$click['gclid'],
            'click_utc' => $clickUtc,
            'click_diagnostics' => [
                'click_at_utc' => $clickUtc->format('Y-m-d\\TH:i:s.v\\Z'),
                'gclid_masked' => gurumedia_sales_mask_gclid((string)$click['gclid']),
            ],
            'customer_key' => $customerKey,
        ];
        $results[] = null;
    }

    $queryGroups = [];
    $customerTimeZones = [];
    $apiErrorCodes = [];
    $queryCount = 0;
    $accountTimeZoneQueryCount = 0;
    $clickViewQueryCount = 0;
    if (!empty($groups['pending'])) {
        try {
            $credentials = hub_google_ads_credentials();
            $accessToken = hub_google_ads_access_token($credentials);
            foreach ($groups['customers'] as $customerKey => $customer) {
                if ($queryCount >= GURUMEDIA_CAMPAIGN_MAX_GOOGLE_ADS_QUERIES) {
                    $apiErrorCodes[$customerKey] = 'lookup_limit';
                    continue;
                }
                $queryCount++;
                $accountTimeZoneQueryCount++;
                try {
                    $accountRows = hub_google_ads_search(
                        $customer['customer_id'],
                        'SELECT customer.time_zone FROM customer LIMIT 1',
                        $accessToken,
                        $customer['manager_customer_id']
                    );
                    $timeZone = $accountRows[0]['customer']['timeZone'] ?? null;
                    if (!is_string($timeZone) || $timeZone === '') throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
                    new DateTimeZone($timeZone);
                    $customerTimeZones[$customerKey] = $timeZone;
                } catch (Throwable $error) {
                    $code = $error instanceof HubGoogleAdsApiException ? $error->apiCode : 'google_ads_request_rejected';
                    $apiErrorCodes[$customerKey] = $code;
                }
            }
            foreach ($groups['pending'] as $pending) {
                if (!isset($customerTimeZones[$pending['customer_key']])) {
                    $errorCode = $apiErrorCodes[$pending['customer_key']] ?? 'google_ads_request_rejected';
                    $results[$pending['index']] = $errorCode === 'lookup_limit'
                        ? gurumedia_sales_campaign_detail($pending['sale'], 'lookup_limit', null, null, $pending['click_diagnostics'])
                        : gurumedia_sales_campaign_detail($pending['sale'], 'lookup_error', null, $errorCode, $pending['click_diagnostics']);
                    continue;
                }
                $timeZone = $customerTimeZones[$pending['customer_key']];
                $localClick = $pending['click_utc']->setTimezone(new DateTimeZone($timeZone));
                $localToday = new DateTimeImmutable('today', new DateTimeZone($timeZone));
                $localDate = $localClick->format('Y-m-d');
                if ($localClick->setTime(0, 0) > $localToday) {
                    $results[$pending['index']] = gurumedia_sales_campaign_detail($pending['sale'], 'click_date_future', null, null, $pending['click_diagnostics']);
                    continue;
                }
                if ($localClick->setTime(0, 0) < $localToday->modify('-89 days')) {
                    $results[$pending['index']] = gurumedia_sales_campaign_detail($pending['sale'], 'outside_click_view_window', null, null, $pending['click_diagnostics']);
                    continue;
                }
                $queryKey = $pending['customer_key'] . ':' . $localDate;
                $queryGroups[$queryKey] ??= [
                    'customer' => $groups['customers'][$pending['customer_key']],
                    'date' => $localDate,
                    'items' => [],
                ];
                $queryGroups[$queryKey]['items'][] = $pending;
            }

            foreach (array_values($queryGroups) as $group) {
                $itemsByGclid = [];
                foreach ($group['items'] as $item) $itemsByGclid[$item['gclid']][] = $item;
                $batches = gurumedia_sales_campaign_gclid_batches(array_keys($itemsByGclid));
                foreach ($batches as $batchIndex => $gclids) {
                    if ($queryCount >= GURUMEDIA_CAMPAIGN_MAX_GOOGLE_ADS_QUERIES) {
                        foreach (array_slice($batches, $batchIndex) as $remainingBatch) {
                            foreach ($remainingBatch as $gclid) {
                                foreach ($itemsByGclid[$gclid] as $item) {
                                    $results[$item['index']] = gurumedia_sales_campaign_detail($item['sale'], 'lookup_limit', null, null, $item['click_diagnostics']);
                                }
                            }
                        }
                        break;
                    }
                    $queryCount++;
                    $clickViewQueryCount++;
                    try {
                        $campaignMatches = gurumedia_sales_campaign_click_view_matches(
                            $group['customer']['customer_id'],
                            $group['customer']['manager_customer_id'],
                            $group['date'],
                            $gclids,
                            $accessToken
                        );
                        foreach ($gclids as $gclid) {
                            $campaigns = [];
                            foreach ($campaignMatches[$gclid] ?? [] as $campaign) {
                                $campaigns[$campaign['campaign_id']] = $campaign;
                            }
                            foreach ($itemsByGclid[$gclid] as $item) {
                                if (count($campaigns) === 1) {
                                    $results[$item['index']] = gurumedia_sales_campaign_detail($item['sale'], 'matched', array_values($campaigns)[0], null, $item['click_diagnostics']);
                                } elseif (count($campaigns) > 1) {
                                    $results[$item['index']] = gurumedia_sales_campaign_detail($item['sale'], 'ambiguous_campaign', null, null, $item['click_diagnostics']);
                                } else {
                                    $results[$item['index']] = gurumedia_sales_campaign_detail($item['sale'], 'no_match', null, null, $item['click_diagnostics']);
                                }
                            }
                        }
                    } catch (Throwable $error) {
                        $code = $error instanceof HubGoogleAdsApiException ? $error->apiCode : 'google_ads_request_rejected';
                        foreach ($gclids as $gclid) {
                            foreach ($itemsByGclid[$gclid] as $item) {
                                $results[$item['index']] = gurumedia_sales_campaign_detail($item['sale'], 'lookup_error', null, $code, $item['click_diagnostics']);
                            }
                        }
                    }
                }
            }
        } catch (Throwable $error) {
            $code = $error instanceof HubGoogleAdsApiException ? $error->apiCode : 'google_ads_request_rejected';
            foreach ($groups['pending'] as $pending) {
                if ($results[$pending['index']] === null) {
                    $results[$pending['index']] = gurumedia_sales_campaign_detail($pending['sale'], 'lookup_error', null, $code, $pending['click_diagnostics']);
                }
            }
        }
    }

    $summary = [
        'matched_count' => 0,
        'no_match_count' => 0,
        'missing_gclid_count' => 0,
        'ambiguous_count' => 0,
        'lookup_error_count' => 0,
        'not_queried_count' => 0,
    ];
    foreach ($results as $result) {
        if (!is_array($result)) continue;
        $bucket = match ($result['status']) {
            'matched' => 'matched_count',
            'no_match' => 'no_match_count',
            'gclid_missing', 'gclid_missing_braid_present' => 'missing_gclid_count',
            'click_ambiguous', 'ambiguous_campaign' => 'ambiguous_count',
            'lookup_error' => 'lookup_error_count',
            'lookup_limit', 'outside_click_view_window', 'click_date_future', 'track_mapping_missing',
            'click_missing', 'click_time_invalid', 'mcc_ambiguous', 'mcc_unidentified', 'gclid_invalid' => 'not_queried_count',
            default => null,
        };
        if ($bucket !== null) $summary[$bucket]++;
    }
    return [
        'rows' => array_values(array_filter($results, 'is_array')),
        'summary' => $summary,
        'query_count' => $queryCount,
        'account_timezone_query_count' => $accountTimeZoneQueryCount,
        'click_view_query_count' => $clickViewQueryCount,
        'truncated' => $truncated,
    ];
}

/** Learn an offer ID only from a postback whose click uniquely identifies a registered GuruMedia Track. */
function gurumedia_sales_learn_offer_id(PDO $pdo, array $track, string $offerId): string
{
    $host = (string)($track['presell_host'] ?? '');
    if ($host === '') return 'track_missing';

    $currentProductKey = (string)($track['mapping_product_key'] ?? $track['product_key'] ?? $host);
    $offerRows = gurumedia_sales_find_offer_tracks($pdo, $offerId);
    foreach ($offerRows as $offerRow) {
        if ((string)($offerRow['product_key'] ?? '') !== $currentProductKey) return 'ambiguous_offer';
    }

    $find = $pdo->prepare(
        'SELECT offer_id FROM tracking_allowed_domains
         WHERE page_host = :page_host AND platform = \'gurumedia\'
         LIMIT 1 FOR UPDATE'
    );
    $find->execute([':page_host' => $host]);
    $existing = $find->fetchColumn();
    if ($existing === false) return 'track_missing';
    $learned = false;
    if (is_string($existing) && $existing !== '') {
        if (!hash_equals($existing, $offerId)) return 'track_offer_conflict';
    } else {
        $update = $pdo->prepare(
            'UPDATE tracking_allowed_domains
             SET offer_id = :offer_id
             WHERE page_host = :page_host AND platform = \'gurumedia\' AND offer_id IS NULL'
        );
        $update->execute([':offer_id' => $offerId, ':page_host' => $host]);
        $learned = $update->rowCount() === 1;
        if (!$learned) {
            $find->execute([':page_host' => $host]);
            $current = $find->fetchColumn();
            if (!is_string($current) || !hash_equals($current, $offerId)) return 'track_offer_conflict';
        }
    }

    return $learned ? 'learned_offer' : 'registered_offer';
}

function gurumedia_sales_admin_token_config(): ?string
{
    $directories = array_unique([
        dirname(__DIR__),
        dirname(__DIR__, 3),
        dirname(__DIR__, 5),
    ]);
    foreach ($directories as $directory) {
        $path = $directory . DIRECTORY_SEPARATOR . 'tracking-domain-admin-config.php';
        if (!is_file($path)) continue;
        $adminConfig = require $path;
        $token = is_array($adminConfig) ? ($adminConfig['tracking_domain_admin_token'] ?? null) : null;
        return is_string($token) && preg_match('/^[a-f0-9]{64}$/iD', $token) === 1 ? $token : null;
    }
    return null;
}

function gurumedia_sales_google_ads_allowed_manager_ids(): array
{
    try {
        $config = gurumedia_sales_config();
    } catch (Throwable $error) {
        return [];
    }
    // Conversion delivery is separately allowlisted from campaign mutations.
    $configured = $config['tracking_google_ads_conversion_upload_manager_customer_ids'] ?? [];
    if (!is_array($configured)) return [];
    $allowed = [];
    foreach ($configured as $value) {
        if (!is_string($value)) continue;
        $id = preg_replace('/\D/', '', $value);
        if (is_string($id) && preg_match('/^[1-9][0-9]{9}$/D', $id) === 1) $allowed[$id] = $id;
    }
    return array_values($allowed);
}

function gurumedia_sales_google_ads_manager_is_allowed(string $managerId): bool
{
    return in_array($managerId, gurumedia_sales_google_ads_allowed_manager_ids(), true);
}

function gurumedia_sales_admin_authorized(): bool
{
    $expected = gurumedia_sales_admin_token_config();
    $received = $_SERVER['HTTP_X_TRACKING_ADMIN'] ?? null;
    if (!is_string($received) && function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp((string)$name, GURUMEDIA_ADS_ADMIN_HEADER) === 0 && is_string($value)) {
                $received = $value;
                break;
            }
        }
    }
    return is_string($expected) && is_string($received)
        && preg_match('/^Bearer ([a-f0-9]{64})$/iD', $received, $matches) === 1
        && hash_equals($expected, $matches[1]);
}

function gurumedia_sales_google_ads_routes_validate(PDO $pdo, mixed $rawRoutes): array
{
    if (!is_array($rawRoutes) || count($rawRoutes) > GURUMEDIA_ADS_MAX_ROUTES) {
        throw new InvalidArgumentException('invalid_routes');
    }
    $routes = [];
    $seen = [];
    $registeredTracks = [];
    foreach ($pdo->query(
        'SELECT page_host, product_key FROM tracking_allowed_domains WHERE platform = \'gurumedia\''
    )->fetchAll() as $registered) {
        $registeredTracks[(string)$registered['page_host'] . "\0" . (string)$registered['product_key']] = true;
    }
    $allowedManagerIds = gurumedia_sales_google_ads_allowed_manager_ids();
    foreach ($rawRoutes as $raw) {
        if (!is_array($raw) || array_diff(array_keys($raw), [
            'presell_host', 'product_key', 'customer_id', 'mcc_customer_id', 'conversion_action_resource_name',
        ]) !== []) throw new InvalidArgumentException('invalid_routes');
        $host = gurumedia_sales_valid_host($raw['presell_host'] ?? null);
        $productKey = is_string($raw['product_key'] ?? null) ? trim($raw['product_key']) : '';
        $customerId = is_string($raw['customer_id'] ?? null) ? preg_replace('/\D/', '', $raw['customer_id']) : '';
        $mccId = is_string($raw['mcc_customer_id'] ?? null) ? preg_replace('/\D/', '', $raw['mcc_customer_id']) : '';
        $resourceName = $raw['conversion_action_resource_name'] ?? null;
        if ($host === null || !preg_match('/^[a-z0-9](?:[a-z0-9._-]{0,251}[a-z0-9])?$/D', $productKey)
            || !preg_match('/^[1-9][0-9]{9}$/D', (string)$customerId)
            || !preg_match('/^[1-9][0-9]{9}$/D', (string)$mccId)
            || !is_string($resourceName)
            || preg_match('/^customers\/([1-9][0-9]{9})\/conversionActions\/([1-9][0-9]{0,19})$/D', $resourceName, $parts) !== 1
            || $parts[1] !== $mccId) {
            throw new InvalidArgumentException('invalid_routes');
        }
        if (!in_array((string)$mccId, $allowedManagerIds, true)) {
            throw new InvalidArgumentException('mcc_not_allowed');
        }
        $key = $host . "\0" . $productKey;
        if (isset($seen[$key])) throw new InvalidArgumentException('duplicate_route');
        $seen[$key] = true;
        if (!isset($registeredTracks[$host . "\0" . $productKey])) throw new InvalidArgumentException('track_not_registered');
        $routes[] = [
            'presell_host' => $host,
            'product_key' => $productKey,
            'customer_id' => $customerId,
            'mcc_customer_id' => $mccId,
            'conversion_action_id' => $parts[2],
        ];
    }
    return $routes;
}

function gurumedia_sales_google_ads_sync_routes(PDO $pdo, array $routes): int
{
    $pdo->beginTransaction();
    try {
        $pdo->query('SELECT id FROM gurumedia_google_ads_settings WHERE id = 1 FOR UPDATE')->fetchColumn();
        $pdo->exec('UPDATE gurumedia_google_ads_settings SET live_enabled = 0, updated_at_utc = UTC_TIMESTAMP(3) WHERE id = 1');
        $pdo->exec('DELETE FROM gurumedia_google_ads_routes');
        $insert = $pdo->prepare(
            'INSERT INTO gurumedia_google_ads_routes
                (presell_host, product_key, customer_id, mcc_customer_id, conversion_action_id, updated_at_utc)
             VALUES (:presell_host, :product_key, :customer_id, :mcc_customer_id, :conversion_action_id, UTC_TIMESTAMP(3))'
        );
        foreach ($routes as $route) $insert->execute(array_combine(
            [':presell_host', ':product_key', ':customer_id', ':mcc_customer_id', ':conversion_action_id'],
            array_values($route)
        ));
        $pdo->exec(
            'UPDATE gurumedia_google_ads_outbox AS o
             INNER JOIN gurumedia_sales AS s ON s.id = o.sale_id
             LEFT JOIN gurumedia_google_ads_routes AS r
               ON r.presell_host = s.presell_host AND r.product_key = s.product_key
               AND r.mcc_customer_id = o.mcc_customer_id
               AND r.conversion_action_id = o.conversion_action_id
             SET o.status = \'blocked\', o.last_error_code = \'route_changed\'
             WHERE o.status IN (\'pending\', \'validated\') AND r.id IS NULL'
        );
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    return count($routes);
}

function gurumedia_sales_google_ads_route(PDO $pdo, array $sale): ?array
{
    $statement = $pdo->prepare(
        'SELECT r.customer_id, r.mcc_customer_id, r.conversion_action_id
         FROM gurumedia_google_ads_routes AS r
         INNER JOIN tracking_allowed_domains AS d
           ON d.page_host = r.presell_host AND d.product_key = r.product_key AND d.platform = \'gurumedia\'
         WHERE r.presell_host = :presell_host AND r.product_key = :product_key
         LIMIT 2'
    );
    $statement->execute([
        ':presell_host' => (string)$sale['presell_host'],
        ':product_key' => (string)$sale['product_key'],
    ]);
    $rows = $statement->fetchAll();
    if (count($rows) !== 1 || !gurumedia_sales_google_ads_manager_is_allowed((string)$rows[0]['mcc_customer_id'])) return null;
    return $rows[0];
}

function gurumedia_sales_google_ads_event(PDO $pdo, array $sale): array
{
    if (!is_string($sale['conversion_at_utc'] ?? null) || $sale['conversion_at_utc'] === '') {
        throw new RuntimeException('conversion_time_missing');
    }
    if (!is_string($sale['click_id'] ?? null) || gurumedia_sales_uuid($sale['click_id']) === null) {
        throw new RuntimeException('click_missing');
    }
    if (!is_numeric($sale['payout_amount'] ?? null) || (float)$sale['payout_amount'] <= 0
        || !is_string($sale['currency'] ?? null) || preg_match('/^[A-Z]{3}$/D', $sale['currency']) !== 1) {
        throw new RuntimeException('value_invalid');
    }
    $click = $pdo->prepare(
        'SELECT COUNT(*) AS event_count,
                COUNT(DISTINCT NULLIF(gclid, \'\')) AS gclid_count, MIN(NULLIF(gclid, \'\')) AS gclid,
                COUNT(DISTINCT NULLIF(gbraid, \'\')) AS gbraid_count, MIN(NULLIF(gbraid, \'\')) AS gbraid,
                COUNT(DISTINCT NULLIF(wbraid, \'\')) AS wbraid_count, MIN(NULLIF(wbraid, \'\')) AS wbraid
         FROM tracking_events WHERE event_type = \'outbound_click\' AND click_id = :click_id'
    );
    $click->execute([':click_id' => $sale['click_id']]);
    $row = $click->fetch();
    if (!is_array($row) || (int)$row['event_count'] !== 1) throw new RuntimeException('click_ambiguous');
    $identifiers = [];
    foreach (['gclid', 'gbraid', 'wbraid'] as $field) {
        $count = (int)$row[$field . '_count'];
        $value = $row[$field] ?? null;
        if ($count > 1 || ($count === 1 && (!is_string($value) || $value === '' || strlen($value) > 2048 || preg_match('/^[\x21-\x7e]+$/D', $value) !== 1))) {
            throw new RuntimeException('click_identifier_ambiguous');
        }
        if ($count === 1) $identifiers[$field] = $value;
    }
    // Google Ads accepts every captured click identifier on the same conversion;
    // when multiple types are present it applies its documented precedence.
    // Keep only the safeguards against missing IDs and conflicting values of one type.
    if ($identifiers === []) throw new RuntimeException('click_identifier_missing');
    try {
        $timestamp = (new DateTimeImmutable((string)$sale['conversion_at_utc'], new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
    } catch (Throwable $error) {
        throw new RuntimeException('conversion_time_invalid');
    }
    return [
        'adIdentifiers' => $identifiers,
        'conversionValue' => (float)$sale['payout_amount'],
        'currency' => (string)$sale['currency'],
        'eventTimestamp' => $timestamp,
        'transactionId' => (string)$sale['sale_key'],
        'eventSource' => 'WEB',
    ];
}

function gurumedia_sales_data_manager_access_token(): string
{
    require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-readonly-service.php';
    $credentials = hub_google_ads_credentials();
    if (!function_exists('openssl_sign')) throw new RuntimeException('google_ads_auth_failed');
    $issuedAt = time();
    $base64url = static fn(string $value): string => rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    $header = $base64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_UNESCAPED_SLASHES));
    $claims = $base64url(json_encode([
        'iss' => $credentials['client_email'],
        'scope' => 'https://www.googleapis.com/auth/datamanager',
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $issuedAt,
        'exp' => $issuedAt + 3600,
    ], JSON_UNESCAPED_SLASHES));
    $unsigned = $header . '.' . $claims;
    $privateKey = openssl_pkey_get_private($credentials['private_key']);
    if ($privateKey === false || !openssl_sign($unsigned, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('google_ads_auth_failed');
    }
    $tokenResponse = hub_google_ads_http('https://oauth2.googleapis.com/token', 'POST', [
        'Content-Type: application/x-www-form-urlencoded', 'Accept: application/json',
    ], http_build_query([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion' => $unsigned . '.' . $base64url($signature),
    ]));
    $payload = json_decode($tokenResponse['body'], true);
    if ($tokenResponse['status'] < 200 || $tokenResponse['status'] >= 300
        || !is_array($payload) || !is_string($payload['access_token'] ?? null) || $payload['access_token'] === '') {
        throw new RuntimeException('google_ads_auth_failed');
    }
    return $payload['access_token'];
}

function gurumedia_sales_data_manager_request(array $body): array
{
    require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-readonly-service.php';
    $token = gurumedia_sales_data_manager_access_token();
    $response = hub_google_ads_http('https://datamanager.googleapis.com/v1/events:ingest', 'POST', [
        'Authorization: Bearer ' . $token,
        'Accept: application/json',
        'Content-Type: application/json',
    ], json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    $payload = json_decode($response['body'], true);
    if ($response['status'] < 200 || $response['status'] >= 300 || !is_array($payload)) {
        $status = is_array($payload) ? (string)($payload['error']['status'] ?? 'google_request_rejected') : 'google_request_rejected';
        return ['ok' => false, 'http_status' => $response['status'], 'error_code' => preg_match('/^[A-Z_]{1,64}$/D', $status) === 1 ? strtolower($status) : 'google_request_rejected'];
    }
    return [
        'ok' => true,
        'request_id' => is_string($payload['requestId'] ?? null) ? substr($payload['requestId'], 0, 128) : null,
        'field_warnings' => is_array($payload['fieldWarnings'] ?? null) ? count($payload['fieldWarnings']) : 0,
    ];
}

function gurumedia_sales_google_ads_destination(array $route): array
{
    return [
        'operatingAccount' => ['accountType' => 'GOOGLE_ADS', 'accountId' => (string)$route['mcc_customer_id']],
        'loginAccount' => ['accountType' => 'GOOGLE_ADS', 'accountId' => (string)$route['mcc_customer_id']],
        'productDestinationId' => (string)$route['conversion_action_id'],
    ];
}

function gurumedia_sales_google_ads_sale(PDO $pdo, string $saleKey): array
{
    $statement = $pdo->prepare(
        'SELECT id, sale_key, click_id, conversion_at_utc, product_key, product_label, presell_host,
                currency, CAST(payout_amount AS CHAR) AS payout_amount
         FROM gurumedia_sales WHERE sale_key = :sale_key LIMIT 1'
    );
    $statement->execute([':sale_key' => $saleKey]);
    $sale = $statement->fetch();
    if (!is_array($sale)) throw new RuntimeException('sale_not_found');
    $route = gurumedia_sales_google_ads_route($pdo, $sale);
    if (!is_array($route)) throw new RuntimeException('route_not_configured');
    return [$sale, $route, gurumedia_sales_google_ads_event($pdo, $sale)];
}

function gurumedia_sales_google_ads_status(PDO $pdo): array
{
    $settings = $pdo->query('SELECT live_enabled FROM gurumedia_google_ads_settings WHERE id = 1')->fetchColumn();
    $routes = (int)$pdo->query('SELECT COUNT(*) FROM gurumedia_google_ads_routes')->fetchColumn();
    $counts = $pdo->query(
        'SELECT status, COUNT(*) AS status_count FROM gurumedia_google_ads_outbox GROUP BY status'
    )->fetchAll();
    $byStatus = [];
    foreach ($counts as $row) $byStatus[(string)$row['status']] = (int)$row['status_count'];
    return ['live_enabled' => (int)$settings === 1, 'route_count' => $routes, 'outbox_counts' => $byStatus];
}

function gurumedia_sales_google_ads_validation_hash(array $route, array $event): string
{
    return hash('sha256', json_encode([
        'mcc_customer_id' => (string)$route['mcc_customer_id'],
        'conversion_action_id' => (string)$route['conversion_action_id'],
        'event' => $event,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
}

function gurumedia_sales_google_ads_record_validation(PDO $pdo, array $sale, array $route, array $event, array $result): void
{
    $statement = $pdo->prepare(
        'INSERT INTO gurumedia_google_ads_outbox
            (sale_id, mcc_customer_id, conversion_action_id, status, validation_at_utc, validation_event_hash, validation_request_id, last_error_code, created_at_utc, next_attempt_at_utc)
         VALUES (:sale_id, :mcc_customer_id, :conversion_action_id, \'validated\', UTC_TIMESTAMP(3), :event_hash, :request_id, :error_code, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE
            mcc_customer_id = IF(status IN (\'validated\', \'blocked\', \'rejected\'), VALUES(mcc_customer_id), mcc_customer_id),
            conversion_action_id = IF(status IN (\'validated\', \'blocked\', \'rejected\'), VALUES(conversion_action_id), conversion_action_id),
            status = IF(status IN (\'validated\', \'blocked\', \'rejected\'), \'validated\', status),
            validation_at_utc = UTC_TIMESTAMP(3), validation_event_hash = VALUES(validation_event_hash),
            validation_request_id = VALUES(validation_request_id),
            last_error_code = VALUES(last_error_code)'
    );
    $statement->execute([
        ':sale_id' => (int)$sale['id'],
        ':mcc_customer_id' => $route['mcc_customer_id'],
        ':conversion_action_id' => $route['conversion_action_id'],
        ':event_hash' => gurumedia_sales_google_ads_validation_hash($route, $event),
        ':request_id' => $result['request_id'],
        ':error_code' => $result['field_warnings'] > 0 ? 'field_warnings' : null,
    ]);
}

function gurumedia_sales_google_ads_submit(PDO $pdo, int $saleId, array $route, array $event): array
{
    $result = gurumedia_sales_data_manager_request([
        'destinations' => [gurumedia_sales_google_ads_destination($route)],
        'events' => [$event],
        'validateOnly' => false,
    ]);
    if (!$result['ok']) return $result;
    if (!is_string($result['request_id'] ?? null) || $result['request_id'] === '') {
        $unknown = $pdo->prepare(
            'UPDATE gurumedia_google_ads_outbox SET status = \'unknown\', last_error_code = \'missing_request_id\'
             WHERE sale_id = :sale_id AND status = \'processing\''
        );
        $unknown->execute([':sale_id' => $saleId]);
        return ['ok' => false, 'http_status' => 200, 'error_code' => 'missing_request_id'];
    }
    $update = $pdo->prepare(
        'UPDATE gurumedia_google_ads_outbox
         SET status = \'accepted\', request_id = :request_id, request_accepted_at_utc = UTC_TIMESTAMP(3),
             next_attempt_at_utc = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 MINUTE), last_error_code = NULL
         WHERE sale_id = :sale_id AND status = \'processing\''
    );
    $update->execute([':request_id' => $result['request_id'], ':sale_id' => $saleId]);
    return $result;
}

function gurumedia_sales_google_ads_set_enabled(PDO $pdo, bool $enabled): array
{
    if ($enabled && (int)$pdo->query('SELECT COUNT(*) FROM gurumedia_google_ads_routes')->fetchColumn() < 1) {
        throw new RuntimeException('routes_not_configured');
    }
    if ($enabled) {
        foreach ($pdo->query('SELECT DISTINCT mcc_customer_id FROM gurumedia_google_ads_routes')->fetchAll(PDO::FETCH_COLUMN) as $managerId) {
            if (!is_string($managerId) || !gurumedia_sales_google_ads_manager_is_allowed($managerId)) {
                throw new RuntimeException('mcc_not_allowed');
            }
        }
    }
    $statement = $pdo->prepare(
        'UPDATE gurumedia_google_ads_settings SET live_enabled = :enabled, updated_at_utc = UTC_TIMESTAMP(3) WHERE id = 1'
    );
    $statement->execute([':enabled' => $enabled ? 1 : 0]);
    return gurumedia_sales_google_ads_status($pdo);
}

function gurumedia_sales_google_ads_queue_sale(PDO $pdo, int $saleId, array $sale): void
{
    try {
        if ((int)$pdo->query('SELECT live_enabled FROM gurumedia_google_ads_settings WHERE id = 1')->fetchColumn() !== 1) return;
        $route = gurumedia_sales_google_ads_route($pdo, $sale);
        if (!is_array($route)) return;
        $statement = $pdo->prepare(
            'INSERT IGNORE INTO gurumedia_google_ads_outbox
                (sale_id, mcc_customer_id, conversion_action_id, status, created_at_utc, next_attempt_at_utc)
             VALUES (:sale_id, :mcc_customer_id, :conversion_action_id, \'pending\', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))'
        );
        $statement->execute([
            ':sale_id' => $saleId,
            ':mcc_customer_id' => $route['mcc_customer_id'],
            ':conversion_action_id' => $route['conversion_action_id'],
        ]);
    } catch (Throwable $error) {
        error_log('GuruMedia conversion queue insert was skipped.');
    }
}

function gurumedia_sales_google_ads_status_poll(PDO $pdo, string $requestId): array
{
    require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-readonly-service.php';
    $token = gurumedia_sales_data_manager_access_token();
    $url = 'https://datamanager.googleapis.com/v1/requestStatus:retrieve?requestId=' . rawurlencode($requestId);
    $response = hub_google_ads_http($url, 'GET', ['Authorization: Bearer ' . $token, 'Accept: application/json']);
    $payload = json_decode($response['body'], true);
    if ($response['status'] < 200 || $response['status'] >= 300 || !is_array($payload)) {
        return ['status' => 'unknown', 'error_code' => 'status_lookup_failed'];
    }
    $items = $payload['requestStatusPerDestination'] ?? null;
    if (!is_array($items) || count($items) !== 1 || !is_array($items[0])) {
        return ['status' => 'unknown', 'error_code' => 'status_unavailable'];
    }
    $item = $items[0];
    $status = (string)($item['requestStatus'] ?? 'REQUEST_STATUS_UNKNOWN');
    $errorReasons = [];
    foreach (($item['errorInfo']['errorCounts'] ?? []) as $error) {
        if (is_array($error) && is_string($error['reason'] ?? null) && preg_match('/^[A-Z0-9_]{1,80}$/D', $error['reason']) === 1) {
            $errorReasons[] = $error['reason'];
        }
    }
    foreach (($item['warningInfo']['warningCounts'] ?? []) as $warning) {
        if (is_array($warning) && is_string($warning['reason'] ?? null) && preg_match('/^[A-Z0-9_]{1,80}$/D', $warning['reason']) === 1) {
            $errorReasons[] = 'WARN_' . $warning['reason'];
        }
    }
    return [
        'status' => match ($status) {
            'SUCCESS' => 'processed',
            'PROCESSING' => 'accepted',
            'PARTIAL_SUCCESS' => 'partial_success',
            'FAILED' => 'rejected',
            default => 'unknown',
        },
        'error_code' => $errorReasons === [] ? null : substr(implode(',', array_unique($errorReasons)), 0, 120),
    ];
}

function gurumedia_sales_google_ads_process_batch(PDO $pdo, int $limit = 10): array
{
    try {
        $liveEnabled = (int)$pdo->query('SELECT live_enabled FROM gurumedia_google_ads_settings WHERE id = 1')->fetchColumn() === 1;
    } catch (Throwable $error) {
        return ['disabled' => true, 'submitted' => 0, 'processed' => 0, 'failed' => 0];
    }
    $limit = max(1, min(20, $limit));
    $poll = $pdo->query(
        'SELECT id, request_id FROM gurumedia_google_ads_outbox
         WHERE status = \'accepted\' AND request_id IS NOT NULL AND next_attempt_at_utc <= UTC_TIMESTAMP(3)
         ORDER BY id ASC LIMIT ' . $limit
    )->fetchAll();
    $result = ['disabled' => !$liveEnabled, 'submitted' => 0, 'processed' => 0, 'failed' => 0];
    foreach ($poll as $item) {
        try {
            $status = gurumedia_sales_google_ads_status_poll($pdo, (string)$item['request_id']);
            $update = $pdo->prepare(
                'UPDATE gurumedia_google_ads_outbox SET status = :status, last_error_code = :error_code,
                    status_checked_at_utc = UTC_TIMESTAMP(3),
                    next_attempt_at_utc = IF(:keep_polling = 1, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 MINUTE), next_attempt_at_utc)
                 WHERE id = :id AND status = \'accepted\''
            );
            $keepPolling = $status['status'] === 'accepted';
            $update->execute([
                ':status' => $status['status'], ':error_code' => $status['error_code'],
                ':keep_polling' => $keepPolling ? 1 : 0, ':id' => (int)$item['id'],
            ]);
            if ($status['status'] === 'processed') $result['processed']++;
            if (in_array($status['status'], ['rejected', 'partial_success', 'unknown'], true)) $result['failed']++;
        } catch (Throwable $error) {
            $result['failed']++;
        }
    }

    if (!$liveEnabled) return $result;

    for ($index = 0; $index < $limit; $index++) {
        $pdo->beginTransaction();
        try {
            $stillEnabled = (int)$pdo->query(
                'SELECT live_enabled FROM gurumedia_google_ads_settings WHERE id = 1 FOR UPDATE'
            )->fetchColumn() === 1;
            if (!$stillEnabled) { $pdo->commit(); break; }
            $row = $pdo->query(
                'SELECT o.id, o.sale_id, o.mcc_customer_id, o.conversion_action_id, s.sale_key, s.click_id,
                        s.conversion_at_utc, s.product_key, s.product_label, s.presell_host, s.currency,
                        CAST(s.payout_amount AS CHAR) AS payout_amount,
                        (SELECT COUNT(*) FROM gurumedia_google_ads_routes AS r
                         WHERE r.presell_host = s.presell_host AND r.product_key = s.product_key
                           AND r.mcc_customer_id = o.mcc_customer_id
                           AND r.conversion_action_id = o.conversion_action_id) AS route_match_count
                 FROM gurumedia_google_ads_outbox AS o
                 INNER JOIN gurumedia_sales AS s ON s.id = o.sale_id
                 WHERE o.status = \'pending\' AND o.next_attempt_at_utc <= UTC_TIMESTAMP(3)
                 ORDER BY o.id ASC LIMIT 1 FOR UPDATE'
            )->fetch();
            if (!is_array($row)) { $pdo->commit(); break; }
            if ((int)$row['route_match_count'] !== 1 || !gurumedia_sales_google_ads_manager_is_allowed((string)$row['mcc_customer_id'])) {
                $block = $pdo->prepare(
                    'UPDATE gurumedia_google_ads_outbox SET status = \'blocked\', last_error_code = :error_code
                     WHERE id = :id AND status = \'pending\''
                );
                $block->execute([
                    ':error_code' => (int)$row['route_match_count'] === 1 ? 'mcc_not_allowed' : 'route_changed',
                    ':id' => (int)$row['id'],
                ]);
                $pdo->commit();
                $result['failed']++;
                continue;
            }
            $claim = $pdo->prepare(
                'UPDATE gurumedia_google_ads_outbox SET status = \'processing\', attempt_count = attempt_count + 1
                 WHERE id = :id AND status = \'pending\''
            );
            $claim->execute([':id' => (int)$row['id']]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $result['failed']++;
            break;
        }
        try {
            $route = [
                'mcc_customer_id' => (string)$row['mcc_customer_id'],
                'conversion_action_id' => (string)$row['conversion_action_id'],
            ];
            $event = gurumedia_sales_google_ads_event($pdo, $row);
            $response = gurumedia_sales_data_manager_request([
                'destinations' => [gurumedia_sales_google_ads_destination($route)], 'events' => [$event], 'validateOnly' => false,
            ]);
            if ($response['ok'] && is_string($response['request_id'] ?? null) && $response['request_id'] !== '') {
                $update = $pdo->prepare(
                    'UPDATE gurumedia_google_ads_outbox SET status = \'accepted\', request_id = :request_id,
                        request_accepted_at_utc = UTC_TIMESTAMP(3), next_attempt_at_utc = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 MINUTE),
                        last_error_code = NULL WHERE id = :id AND status = \'processing\''
                );
                $update->execute([':request_id' => $response['request_id'], ':id' => (int)$row['id']]);
                $result['submitted']++;
            } else {
                $missingRequestId = $response['ok'] && (!is_string($response['request_id'] ?? null) || $response['request_id'] === '');
                $response['error_code'] = $response['error_code'] ?? 'missing_request_id';
                $retry = !$missingRequestId && (int)($response['http_status'] ?? 0) === 429;
                $nextStatus = $missingRequestId ? 'unknown' : ($retry ? 'pending' : ((int)($response['http_status'] ?? 0) >= 500 ? 'unknown' : 'rejected'));
                $update = $pdo->prepare(
                    'UPDATE gurumedia_google_ads_outbox SET status = :status, last_error_code = :error_code,
                        next_attempt_at_utc = IF(:retry = 1, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE), next_attempt_at_utc)
                     WHERE id = :id AND status = \'processing\''
                );
                $update->execute([
                    ':status' => $nextStatus,
                    ':error_code' => $response['error_code'], ':retry' => $retry ? 1 : 0, ':id' => (int)$row['id'],
                ]);
                $result['failed']++;
            }
        } catch (Throwable $error) {
            $update = $pdo->prepare(
                'UPDATE gurumedia_google_ads_outbox SET status = \'blocked\', last_error_code = :error_code
                 WHERE id = :id AND status = \'processing\''
            );
            $errorCode = preg_match('/^[a-z0-9_]{1,64}$/D', $error->getMessage()) === 1 ? $error->getMessage() : 'conversion_submit_failed';
            $update->execute([':error_code' => $errorCode, ':id' => (int)$row['id']]);
            $result['failed']++;
        }
    }
    return $result;
}

/** Server-to-server receiver for GuruMedia conversion postbacks. It stores only sales tied to a registered Hub Track. */
function gurumedia_sales_postback_dispatch(): never
{
    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
        gurumedia_sales_send_json(405, ['ok' => false, 'error' => 'method_not_allowed']);
    }
    if (strlen((string)($_SERVER['QUERY_STRING'] ?? '')) > 4096) {
        gurumedia_sales_send_json(413, ['ok' => false, 'error' => 'payload_too_large']);
    }

    try {
        $config = gurumedia_sales_config();
    } catch (Throwable $error) {
        error_log('GuruMedia sales postback is not configured.');
        gurumedia_sales_send_json(503, ['ok' => false, 'error' => 'service_unavailable']);
    }

    $expectedToken = $config['gurumedia_postback_token'] ?? null;
    $receivedToken = $_GET['token'] ?? null;
    if (!is_string($expectedToken) || preg_match('/^[a-f0-9]{64}$/iD', $expectedToken) !== 1
        || !is_string($receivedToken) || !hash_equals($expectedToken, $receivedToken)) {
        gurumedia_sales_send_json(403, ['ok' => false, 'error' => 'not_authorized']);
    }

    $transactionId = gurumedia_sales_text($_GET['transaction_id'] ?? null, 128);
    $rawClickId = $_GET['click_id'] ?? null;
    $clickId = gurumedia_sales_uuid($rawClickId);
    $hasClickId = is_string($rawClickId) && trim($rawClickId) !== '';
    $rawOfferId = $_GET['offer_id'] ?? null;
    $offerId = gurumedia_sales_text($rawOfferId, 64);
    if ($offerId !== null && preg_match('/^[A-Za-z0-9._-]+$/D', $offerId) !== 1) {
        gurumedia_sales_send_json(400, ['ok' => false, 'error' => 'invalid_payload']);
    }
    $offerName = gurumedia_sales_text($_GET['offer_name'] ?? null, 253);
    $payout = $_GET['payout_amount'] ?? null;
    $currency = $_GET['currency'] ?? null;
    [$conversionAtUtc, $conversionTimeStatus] = gurumedia_sales_normalize_conversion_time($_GET['conversion_time'] ?? null);
    if ($transactionId === null || preg_match('/^[\x21-\x7E]+$/D', $transactionId) !== 1
        || !is_string($payout) || preg_match('/^\d{1,10}(?:\.\d{1,4})?$/D', $payout) !== 1
        || !is_string($currency) || preg_match('/^[A-Za-z]{3}$/D', $currency) !== 1) {
        gurumedia_sales_send_json(400, ['ok' => false, 'error' => 'invalid_payload']);
    }
    $currency = strtoupper($currency);
    $transactionHash = hash('sha256', $transactionId);

    try {
        $pdo = tracking_clicks_connect_db($config);
        $trackRows = $clickId === null ? [] : gurumedia_sales_find_track($pdo, $clickId);
        if (count($trackRows) !== 1) {
            $result = count($trackRows) > 1 ? 'ambiguous_click' : 'unmatched_click';
            $offerRows = $offerId === null ? [] : gurumedia_sales_find_offer_tracks($pdo, $offerId);
            $offerTrack = count($offerRows) === 1 ? $offerRows[0] : null;
            $offerMappingStatus = count($offerRows) === 0 ? 'unregistered_offer' : (count($offerRows) === 1 ? 'registered_offer' : 'ambiguous_offer');
            $pdo->beginTransaction();
            $attemptId = gurumedia_sales_attempt($pdo, $transactionHash, $result, $hasClickId, [
                'offer_id' => $offerId,
                'offer_name' => $offerName,
                'payout_amount' => $payout,
                'currency' => $currency,
                'conversion_at_utc' => $conversionAtUtc,
                'product_key' => is_array($offerTrack) ? ($offerTrack['product_key'] ?? null) : null,
                'product_label' => is_array($offerTrack) ? ($offerTrack['product_label'] ?? null) : null,
                'presell_host' => is_array($offerTrack) ? ($offerTrack['presell_host'] ?? null) : null,
                'offer_mapping_status' => $offerMappingStatus,
            ]);
            if ($offerId !== null && count($offerRows) > 0) {
                gurumedia_sales_email_enqueue_unmatched($pdo, $attemptId);
            }
            $pdo->commit();
            gurumedia_sales_send_json(200, ['ok' => true, 'recorded' => false, 'reason' => $result]);
        }

        $track = $trackRows[0];
        $pdo->beginTransaction();
        $offerMappingStatus = $offerId === null
            ? 'missing_offer_id'
            : gurumedia_sales_learn_offer_id($pdo, $track, $offerId);
        $statement = $pdo->prepare(
            'INSERT INTO gurumedia_sales
                (sale_key, transaction_id, click_id, offer_id, offer_name, payout_amount, currency,
                 product_key, product_label, presell_host, conversion_at_utc)
             VALUES
                (:sale_key, :transaction_id, :click_id, :offer_id, :offer_name, :payout_amount, :currency,
                 :product_key, :product_label, :presell_host, :conversion_at_utc)'
        );
        $inserted = true;
        try {
            $statement->execute([
                ':sale_key' => gurumedia_sales_new_uuid(),
                ':transaction_id' => $transactionId,
                ':click_id' => $clickId,
                ':offer_id' => $offerId,
                ':offer_name' => $offerName,
                ':payout_amount' => $payout,
                ':currency' => $currency,
                ':product_key' => $track['product_key'] ?? null,
                ':product_label' => $track['product_label'] ?? null,
                ':presell_host' => $track['presell_host'],
                ':conversion_at_utc' => $conversionAtUtc,
            ]);
        } catch (PDOException $error) {
            if ((string)$error->getCode() !== '23000') throw $error;
            $inserted = false;
        }
        $conversionTimeAddedOnRetry = false;
        if (!$inserted && $conversionAtUtc !== null) {
            $enrich = $pdo->prepare(
                'UPDATE gurumedia_sales
                 SET conversion_at_utc = :conversion_at_utc
                 WHERE transaction_id = :transaction_id AND conversion_at_utc IS NULL'
            );
            $enrich->execute([
                ':conversion_at_utc' => $conversionAtUtc,
                ':transaction_id' => $transactionId,
            ]);
            $conversionTimeAddedOnRetry = $enrich->rowCount() === 1;
        }
        if ($inserted) {
            $saleId = (int)$pdo->lastInsertId();
            if ($saleId < 1) throw new RuntimeException('sale_reference_invalid');
            gurumedia_sales_google_ads_queue_sale($pdo, $saleId, [
                'product_key' => $track['product_key'] ?? null,
                'presell_host' => $track['presell_host'],
            ]);
            $outbox = $pdo->prepare(
                'INSERT IGNORE INTO gurumedia_sales_email_outbox
                    (sale_id, notification_kind, created_at_utc, next_attempt_at_utc)
                 VALUES (:sale_id, \'sale\', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))'
            );
            $outbox->execute([':sale_id' => $saleId]);
        }
        $attemptResult = $conversionTimeAddedOnRetry
            ? 'duplicate_time_added'
            : ($inserted ? 'recorded' : 'duplicate');
        if ($conversionTimeStatus !== 'valid') {
            $attemptResult .= $conversionTimeStatus === 'missing' ? '_time_missing' : '_time_invalid';
        }
        gurumedia_sales_attempt($pdo, $transactionHash, $attemptResult, true, [
            'offer_id' => $offerId,
            'offer_name' => $offerName,
            'payout_amount' => $payout,
            'currency' => $currency,
            'conversion_at_utc' => $conversionAtUtc,
            'product_key' => $track['product_key'] ?? null,
            'product_label' => $track['product_label'] ?? null,
            'presell_host' => $track['presell_host'] ?? null,
            'offer_mapping_status' => $offerMappingStatus,
        ]);
        $pdo->commit();
    } catch (Throwable $error) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        error_log('GuruMedia sales postback processing failed.');
        gurumedia_sales_send_json(503, ['ok' => false, 'error' => 'service_unavailable']);
    }

    gurumedia_sales_send_json(200, ['ok' => true, 'recorded' => $inserted, 'duplicate' => !$inserted]);
}

/** Read-only, aggregate report for Hub. Buyer data, click IDs, and transaction IDs never leave the server. */
function gurumedia_sales_report_dispatch(): never
{
    header('Cache-Control: no-store, private');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    try {
        $config = gurumedia_sales_config();
    } catch (Throwable $error) {
        gurumedia_sales_send_json(503, ['ok' => false, 'error' => 'api_not_configured']);
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    $decision = tracking_clicks_authorize(
        (string)($_SERVER['REQUEST_METHOD'] ?? 'GET'),
        is_string($origin) ? $origin : null,
        tracking_clicks_authorization_header(),
        $config
    );
    if (is_string($decision['allow_origin'])) {
        header('Access-Control-Allow-Origin: ' . $decision['allow_origin']);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Tracking-Admin');
        header('Access-Control-Max-Age: 300');
    }
    if ($decision['status'] === 204) {
        http_response_code(204);
        exit;
    }
    if ($decision['status'] !== 200) {
        gurumedia_sales_send_json($decision['status'], ['ok' => false, 'error' => $decision['error']]);
    }
    if (($_SERVER['QUERY_STRING'] ?? '') !== '') {
        gurumedia_sales_send_json(400, ['ok' => false, 'error' => 'query_not_supported']);
    }
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > GURUMEDIA_SALES_MAX_REPORT_BODY_BYTES) {
        gurumedia_sales_send_json(413, ['ok' => false, 'error' => 'payload_too_large']);
    }
    $contentType = strtolower(trim(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
    if ($contentType !== 'application/json') {
        gurumedia_sales_send_json(415, ['ok' => false, 'error' => 'unsupported_content_type']);
    }
    $rawBody = file_get_contents('php://input', false, null, 0, GURUMEDIA_SALES_MAX_REPORT_BODY_BYTES + 1);
    if (is_string($rawBody) && strlen($rawBody) > GURUMEDIA_SALES_MAX_REPORT_BODY_BYTES) {
        gurumedia_sales_send_json(413, ['ok' => false, 'error' => 'payload_too_large']);
    }
    try {
        $payload = is_string($rawBody) && $rawBody !== ''
            ? json_decode($rawBody, true, 8, JSON_THROW_ON_ERROR)
            : null;
    } catch (Throwable $error) {
        $payload = null;
    }
    $allowedPayloadKeys = [
        'start_date', 'end_date', 'report_type', 'page_size', 'after_sale_key', 'track_accounts',
        'routes', 'live_enabled', 'sale_key',
    ];
    if (!is_array($payload) || array_diff(array_keys($payload), $allowedPayloadKeys) !== []) {
        gurumedia_sales_send_json(400, ['ok' => false, 'error' => 'invalid_payload']);
    }
    $reportType = $payload['report_type'] ?? 'summary';
    $adminTypes = ['google_ads_sync_routes', 'google_ads_status', 'google_ads_set_enabled', 'google_ads_validate_sale', 'google_ads_send_sale'];
    if (!is_string($reportType) || !in_array($reportType, ['summary', 'billing_sales', 'campaign_attribution', ...$adminTypes], true)) {
        gurumedia_sales_send_json(400, ['ok' => false, 'error' => 'invalid_report_type']);
    }
    if (in_array($reportType, $adminTypes, true) && !gurumedia_sales_admin_authorized()) {
        gurumedia_sales_send_json(401, ['ok' => false, 'error' => 'admin_not_authorized']);
    }
    $adminPayloadKeys = match ($reportType) {
        'google_ads_sync_routes' => ['report_type', 'routes'],
        'google_ads_status' => ['report_type'],
        'google_ads_set_enabled' => ['report_type', 'live_enabled'],
        'google_ads_validate_sale', 'google_ads_send_sale' => ['report_type', 'sale_key'],
        default => null,
    };
    if ($adminPayloadKeys !== null && array_diff(array_keys($payload), $adminPayloadKeys) !== []) {
        gurumedia_sales_send_json(400, ['ok' => false, 'error' => 'invalid_payload']);
    }
    if (in_array($reportType, $adminTypes, true)) {
        if (array_key_exists('start_date', $payload) || array_key_exists('end_date', $payload)
            || array_key_exists('page_size', $payload) || array_key_exists('after_sale_key', $payload)
            || array_key_exists('track_accounts', $payload)) {
            gurumedia_sales_send_json(400, ['ok' => false, 'error' => 'invalid_payload']);
        }
        try {
            $pdo = tracking_clicks_connect_db($config);
            if ($reportType === 'google_ads_sync_routes') {
                $routes = gurumedia_sales_google_ads_routes_validate($pdo, $payload['routes'] ?? null);
                $routeCount = gurumedia_sales_google_ads_sync_routes($pdo, $routes);
                gurumedia_sales_send_json(200, [
                    'ok' => true,
                    'report_type' => $reportType,
                    'route_count' => $routeCount,
                    'live_enabled' => false,
                    'message' => 'Rotas sincronizadas; o envio automático foi desligado para revisão.',
                ]);
            }
            if ($reportType === 'google_ads_status') {
                gurumedia_sales_send_json(200, ['ok' => true, 'report_type' => $reportType] + gurumedia_sales_google_ads_status($pdo));
            }
            if ($reportType === 'google_ads_set_enabled') {
                if (!is_bool($payload['live_enabled'] ?? null)) gurumedia_sales_send_json(400, ['ok' => false, 'error' => 'invalid_payload']);
                gurumedia_sales_send_json(200, ['ok' => true, 'report_type' => $reportType] + gurumedia_sales_google_ads_set_enabled($pdo, $payload['live_enabled']));
            }
            $saleKey = gurumedia_sales_uuid($payload['sale_key'] ?? null);
            if ($saleKey === null) gurumedia_sales_send_json(400, ['ok' => false, 'error' => 'invalid_sale_key']);
            if ($reportType === 'google_ads_validate_sale') {
                [$sale, $route, $event] = gurumedia_sales_google_ads_sale($pdo, $saleKey);
                $deliveryStateQuery = $pdo->prepare('SELECT status FROM gurumedia_google_ads_outbox WHERE sale_id = :sale_id LIMIT 1');
                $deliveryStateQuery->execute([':sale_id' => (int)$sale['id']]);
                $deliveryState = $deliveryStateQuery->fetchColumn();
                $manualSendAvailable = $deliveryState === false || in_array($deliveryState, ['validated', 'blocked', 'rejected'], true);
                $result = gurumedia_sales_data_manager_request([
                    'destinations' => [gurumedia_sales_google_ads_destination($route)],
                    'events' => [$event],
                    'validateOnly' => true,
                ]);
                if ($result['ok'] && $manualSendAvailable) gurumedia_sales_google_ads_record_validation($pdo, $sale, $route, $event, $result);
                gurumedia_sales_send_json(200, [
                    'ok' => true,
                    'report_type' => $reportType,
                    'validated' => (bool)$result['ok'],
                    'request_id' => $result['request_id'] ?? null,
                    'field_warnings' => (int)($result['field_warnings'] ?? 0),
                    'manual_send_available' => $manualSendAvailable,
                    'error_code' => $result['error_code'] ?? null,
                ]);
            }
            [$sale, $route, $event] = gurumedia_sales_google_ads_sale($pdo, $saleKey);
            $saleId = (int)$sale['id'];
            $pdo->beginTransaction();
            $outboxQuery = $pdo->prepare(
                'SELECT status, validation_at_utc, validation_event_hash, mcc_customer_id, conversion_action_id
                 FROM gurumedia_google_ads_outbox WHERE sale_id = :sale_id FOR UPDATE'
            );
            $outboxQuery->execute([':sale_id' => $saleId]);
            $outbox = $outboxQuery->fetch();
            if (!is_array($outbox) || $outbox['status'] !== 'validated' || $outbox['validation_at_utc'] === null) {
                $pdo->rollBack();
                gurumedia_sales_send_json(409, ['ok' => false, 'error' => 'validation_required']);
            }
            $eventHash = gurumedia_sales_google_ads_validation_hash($route, $event);
            $sameValidatedPayload = is_string($outbox['validation_event_hash'] ?? null)
                && hash_equals((string)$outbox['validation_event_hash'], $eventHash)
                && (string)$outbox['mcc_customer_id'] === (string)$route['mcc_customer_id']
                && (string)$outbox['conversion_action_id'] === (string)$route['conversion_action_id'];
            if (!$sameValidatedPayload) {
                $stale = $pdo->prepare(
                    'UPDATE gurumedia_google_ads_outbox SET status = \'blocked\', last_error_code = \'validation_stale\'
                     WHERE sale_id = :sale_id AND status = \'validated\''
                );
                $stale->execute([':sale_id' => $saleId]);
                $pdo->commit();
                gurumedia_sales_send_json(409, ['ok' => false, 'error' => 'validation_stale']);
            }
            $claim = $pdo->prepare('UPDATE gurumedia_google_ads_outbox SET status = \'processing\', attempt_count = attempt_count + 1 WHERE sale_id = :sale_id AND status = \'validated\'');
            $claim->execute([':sale_id' => $saleId]);
            if ($claim->rowCount() !== 1) {
                $pdo->rollBack();
                gurumedia_sales_send_json(409, ['ok' => false, 'error' => 'validation_required']);
            }
            $pdo->commit();
            try {
                $result = gurumedia_sales_google_ads_submit($pdo, $saleId, $route, $event);
                if (!$result['ok']) {
                    $retry = false;
                    $status = (int)($result['http_status'] ?? 0) >= 500 ? 'unknown' : 'rejected';
                    $update = $pdo->prepare('UPDATE gurumedia_google_ads_outbox SET status = :status, last_error_code = :error_code, next_attempt_at_utc = IF(:retry = 1, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE), next_attempt_at_utc) WHERE sale_id = :sale_id AND status = \'processing\'');
                    $update->execute([':status' => $status, ':error_code' => $result['error_code'], ':retry' => $retry ? 1 : 0, ':sale_id' => $saleId]);
                }
                gurumedia_sales_send_json(200, [
                    'ok' => true,
                    'report_type' => $reportType,
                    'accepted' => (bool)$result['ok'],
                    'request_id' => $result['request_id'] ?? null,
                    'error_code' => $result['error_code'] ?? null,
                ]);
            } catch (Throwable $error) {
                $update = $pdo->prepare('UPDATE gurumedia_google_ads_outbox SET status = \'unknown\', last_error_code = \'submit_outcome_unknown\' WHERE sale_id = :sale_id AND status = \'processing\'');
                $update->execute([':sale_id' => $saleId]);
                throw $error;
            }
        } catch (InvalidArgumentException $error) {
            $code = preg_match('/^[a-z0-9_]{1,64}$/D', $error->getMessage()) === 1 ? $error->getMessage() : 'invalid_payload';
            gurumedia_sales_send_json(400, ['ok' => false, 'error' => $code]);
        } catch (Throwable $error) {
            if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
            $code = preg_match('/^[a-z0-9_]{1,64}$/D', $error->getMessage()) === 1 ? $error->getMessage() : 'google_ads_request_failed';
            error_log('GuruMedia Google Ads request failed.');
            gurumedia_sales_send_json(502, ['ok' => false, 'error' => $code]);
        }
    }
    if (!array_key_exists('start_date', $payload) || !array_key_exists('end_date', $payload)) {
        gurumedia_sales_send_json(400, ['ok' => false, 'error' => 'invalid_payload']);
    }
    $pageSize = $payload['page_size'] ?? 500;
    $afterSaleKey = $payload['after_sale_key'] ?? null;
    if ($reportType === 'billing_sales') {
        if (!is_int($pageSize) || $pageSize < 1 || $pageSize > 500
            || ($afterSaleKey !== null && gurumedia_sales_uuid($afterSaleKey) === null)) {
            gurumedia_sales_send_json(400, ['ok' => false, 'error' => 'invalid_pagination']);
        }
    } elseif (array_key_exists('page_size', $payload) || array_key_exists('after_sale_key', $payload)) {
        gurumedia_sales_send_json(400, ['ok' => false, 'error' => 'pagination_requires_billing_sales']);
    }
    if (($reportType === 'campaign_attribution') !== array_key_exists('track_accounts', $payload)) {
        gurumedia_sales_send_json(400, ['ok' => false, 'error' => 'invalid_payload']);
    }
    try {
        $dates = tracking_clicks_normalize_dates($payload['start_date'], $payload['end_date']);
        $pdo = tracking_clicks_connect_db($config);
        if ($reportType === 'campaign_attribution') {
            require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-readonly-service.php';
            $trackAccounts = gurumedia_sales_valid_campaign_track_accounts($payload['track_accounts']);
            $attribution = gurumedia_sales_campaign_attribution($pdo, $dates, $trackAccounts);
            $summary = $attribution['summary'] ?? [
                'matched_count' => 0, 'no_match_count' => 0, 'missing_gclid_count' => 0,
                'ambiguous_count' => 0, 'lookup_error_count' => 0, 'not_queried_count' => 0,
            ];
            gurumedia_sales_send_json(200, [
                'ok' => true,
                'schema_version' => 1,
                'report_type' => 'campaign_attribution',
                'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
                'start_date' => $dates['start_date'],
                'end_date' => $dates['end_date'],
                'summary' => $summary,
                'query_count' => (int)($attribution['query_count'] ?? 0),
                'account_timezone_query_count' => (int)($attribution['account_timezone_query_count'] ?? 0),
                'click_view_query_count' => (int)($attribution['click_view_query_count'] ?? 0),
                'truncated' => (bool)($attribution['truncated'] ?? false),
                'rows' => $attribution['rows'] ?? [],
            ]);
        }
        if ($reportType === 'billing_sales') {
            $cursorId = 0;
            if ($afterSaleKey !== null) {
                $cursorQuery = $pdo->prepare(
                    'SELECT id FROM gurumedia_sales
                     WHERE sale_key = :sale_key
                       AND received_at_utc >= :start_at_utc AND received_at_utc < :end_before_utc
                     LIMIT 1'
                );
                $cursorQuery->execute([
                    ':sale_key' => gurumedia_sales_uuid($afterSaleKey),
                    ':start_at_utc' => $dates['start_at_utc'],
                    ':end_before_utc' => $dates['end_before_utc'],
                ]);
                $cursorIdValue = $cursorQuery->fetchColumn();
                if ($cursorIdValue === false) {
                    gurumedia_sales_send_json(400, ['ok' => false, 'error' => 'invalid_cursor']);
                }
                $cursorId = (int)$cursorIdValue;
            }

            $totalQuery = $pdo->prepare(
                'SELECT COUNT(*) FROM gurumedia_sales
                 WHERE received_at_utc >= :start_at_utc AND received_at_utc < :end_before_utc'
            );
            $totalQuery->execute([
                ':start_at_utc' => $dates['start_at_utc'],
                ':end_before_utc' => $dates['end_before_utc'],
            ]);
            $totalSales = (int)$totalQuery->fetchColumn();

            $saleDetailsQuery = $pdo->prepare(
                'SELECT id, sale_key,
                        CONCAT(SUBSTRING(DATE_FORMAT(received_at_utc, \'%Y-%m-%dT%H:%i:%s.%f\'), 1, 23), \'Z\') AS received_at_utc,
                        CASE WHEN conversion_at_utc IS NULL THEN NULL
                             ELSE CONCAT(SUBSTRING(DATE_FORMAT(conversion_at_utc, \'%Y-%m-%dT%H:%i:%s.%f\'), 1, 23), \'Z\')
                        END AS conversion_at_utc,
                        offer_id, product_key, product_label, presell_host, offer_name, currency,
                        CAST(payout_amount AS CHAR) AS payout_amount
                 FROM gurumedia_sales
                 WHERE received_at_utc >= :start_at_utc AND received_at_utc < :end_before_utc
                   AND id > :cursor_id
                 ORDER BY id ASC LIMIT :page_limit'
            );
            $saleDetailsQuery->bindValue(':start_at_utc', $dates['start_at_utc']);
            $saleDetailsQuery->bindValue(':end_before_utc', $dates['end_before_utc']);
            $saleDetailsQuery->bindValue(':cursor_id', $cursorId, PDO::PARAM_INT);
            $saleDetailsQuery->bindValue(':page_limit', $pageSize + 1, PDO::PARAM_INT);
            $saleDetailsQuery->execute();
            $saleDetailsRows = $saleDetailsQuery->fetchAll();
            $hasMore = count($saleDetailsRows) > $pageSize;
            if ($hasMore) $saleDetailsRows = array_slice($saleDetailsRows, 0, $pageSize);
            $nextCursor = $hasMore && $saleDetailsRows !== []
                ? (string)$saleDetailsRows[count($saleDetailsRows) - 1]['sale_key']
                : null;

            gurumedia_sales_send_json(200, [
                'ok' => true,
                'schema_version' => 2,
                'report_type' => 'billing_sales',
                'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
                'start_date' => $dates['start_date'],
                'end_date' => $dates['end_date'],
                'date_filter_basis' => 'received_at_utc',
                'total_sales' => $totalSales,
                'page_size' => $pageSize,
                'has_more' => $hasMore,
                'next_cursor' => $nextCursor,
                'sales' => array_map(static function (array $row): array {
                    $conversionAt = $row['conversion_at_utc'] === null ? null : (string)$row['conversion_at_utc'];
                    $receivedAt = (string)$row['received_at_utc'];
                    return [
                        'sale_key' => (string)$row['sale_key'],
                        'source_platform' => 'gurumedia',
                        'conversion_at_utc' => $conversionAt,
                        'received_at_utc' => $receivedAt,
                        'billing_at_utc' => $conversionAt ?? $receivedAt,
                        'billing_date_source' => $conversionAt === null ? 'received_time_fallback' : 'conversion_time',
                        'product_key' => $row['product_key'] === null ? null : (string)$row['product_key'],
                        'product_label' => $row['product_label'] === null ? null : (string)$row['product_label'],
                        'presell_host' => (string)$row['presell_host'],
                        'offer_id' => $row['offer_id'] === null ? null : (string)$row['offer_id'],
                        'offer_name' => $row['offer_name'] === null ? null : (string)$row['offer_name'],
                        'payout_amount' => (string)$row['payout_amount'],
                        'currency' => (string)$row['currency'],
                    ];
                }, $saleDetailsRows),
            ]);
        }
        $statement = $pdo->prepare(
            'SELECT DATE(received_at_utc) AS date_utc, product_key, product_label,
                    presell_host, offer_name, currency, COUNT(*) AS sales_count,
                    CAST(SUM(payout_amount) AS CHAR) AS payout_total
             FROM gurumedia_sales
             WHERE received_at_utc >= :start_at_utc AND received_at_utc < :end_before_utc
             GROUP BY DATE(received_at_utc), product_key, product_label, presell_host, offer_name, currency
             ORDER BY DATE(received_at_utc) DESC, product_label ASC, presell_host ASC, currency ASC
             LIMIT 5001'
        );
        $statement->execute([
            ':start_at_utc' => $dates['start_at_utc'],
            ':end_before_utc' => $dates['end_before_utc'],
        ]);
        $rows = $statement->fetchAll();
        if (count($rows) > 5000) throw new RuntimeException('report_limit_exceeded');
        $summary = $pdo->prepare(
            'SELECT currency, COUNT(*) AS sales_count, CAST(SUM(payout_amount) AS CHAR) AS payout_total
             FROM gurumedia_sales
             WHERE received_at_utc >= :start_at_utc AND received_at_utc < :end_before_utc
             GROUP BY currency ORDER BY currency ASC'
        );
        $summary->execute([
            ':start_at_utc' => $dates['start_at_utc'],
            ':end_before_utc' => $dates['end_before_utc'],
        ]);
        $totalsByCurrency = $summary->fetchAll();
        $diagnostics = $pdo->prepare(
            'SELECT result_code, COUNT(*) AS callbacks
             FROM gurumedia_postback_attempts
             WHERE last_received_at_utc >= :start_at_utc AND last_received_at_utc < :end_before_utc
               AND result_code IN (\'unmatched_click\', \'ambiguous_click\')
             GROUP BY result_code'
        );
        $diagnostics->execute([
            ':start_at_utc' => $dates['start_at_utc'],
            ':end_before_utc' => $dates['end_before_utc'],
        ]);
        $diagnosticCounts = ['unmatched_click' => 0, 'ambiguous_click' => 0];
        foreach ($diagnostics->fetchAll() as $diagnostic) {
            $diagnosticCounts[(string)$diagnostic['result_code']] = (int)$diagnostic['callbacks'];
        }
        $totalSales = array_sum(array_map(static fn(array $row): int => (int)$row['sales_count'], $totalsByCurrency));
        $timeCoverage = $pdo->prepare(
            'SELECT COUNT(*) AS sales_count, COUNT(conversion_at_utc) AS sales_with_conversion_time
             FROM gurumedia_sales
             WHERE received_at_utc >= :start_at_utc AND received_at_utc < :end_before_utc'
        );
        $timeCoverage->execute([
            ':start_at_utc' => $dates['start_at_utc'],
            ':end_before_utc' => $dates['end_before_utc'],
        ]);
        $timeCoverageRow = $timeCoverage->fetch() ?: ['sales_count' => 0, 'sales_with_conversion_time' => 0];
        $saleDetailsQuery = $pdo->prepare(
            'SELECT s.sale_key,
                    CONCAT(SUBSTRING(DATE_FORMAT(s.received_at_utc, \'%Y-%m-%dT%H:%i:%s.%f\'), 1, 23), \'Z\') AS received_at_utc,
                    CASE WHEN s.conversion_at_utc IS NULL THEN NULL
                         ELSE CONCAT(SUBSTRING(DATE_FORMAT(s.conversion_at_utc, \'%Y-%m-%dT%H:%i:%s.%f\'), 1, 23), \'Z\')
                    END AS conversion_at_utc,
                    s.product_key, s.product_label, s.presell_host, s.offer_name, s.currency,
                    CAST(s.payout_amount AS CHAR) AS payout_amount,
                    COALESCE(o.status, \'not_sent\') AS google_ads_status,
                    o.last_error_code AS google_ads_error_code
             FROM gurumedia_sales AS s
             LEFT JOIN gurumedia_google_ads_outbox AS o ON o.sale_id = s.id
             WHERE s.received_at_utc >= :start_at_utc AND s.received_at_utc < :end_before_utc
             ORDER BY COALESCE(s.conversion_at_utc, s.received_at_utc) DESC, s.id DESC
             LIMIT 1001'
        );
        $saleDetailsQuery->execute([
            ':start_at_utc' => $dates['start_at_utc'],
            ':end_before_utc' => $dates['end_before_utc'],
        ]);
        $saleDetailsRows = $saleDetailsQuery->fetchAll();
        $saleDetailsTruncated = count($saleDetailsRows) > 1000;
        if ($saleDetailsTruncated) $saleDetailsRows = array_slice($saleDetailsRows, 0, 1000);
    } catch (InvalidArgumentException $error) {
        gurumedia_sales_send_json(400, ['ok' => false, 'error' => $error->getMessage()]);
    } catch (Throwable $error) {
        $code = $error instanceof RuntimeException && $error->getMessage() === 'report_limit_exceeded'
            ? 'report_limit_exceeded' : 'server_error';
        error_log('GuruMedia sales report request failed.');
        gurumedia_sales_send_json($code === 'report_limit_exceeded' ? 413 : 503, ['ok' => false, 'error' => $code]);
    }
    gurumedia_sales_send_json(200, [
        'ok' => true,
        'schema_version' => 1,
        'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'start_date' => $dates['start_date'],
        'end_date' => $dates['end_date'],
        'count_semantics' => 'matched_sales_only',
        'summary' => [
            'sales_count' => $totalSales,
            'payout_by_currency' => array_map(static fn(array $row): array => [
                'currency' => (string)$row['currency'],
                'sales_count' => (int)$row['sales_count'],
                'payout_total' => (string)$row['payout_total'],
            ], $totalsByCurrency),
            'unmatched_callbacks' => $diagnosticCounts['unmatched_click'],
            'ambiguous_callbacks' => $diagnosticCounts['ambiguous_click'],
            'conversion_time_coverage' => [
                'sales_count' => (int)$timeCoverageRow['sales_count'],
                'sales_with_conversion_time' => (int)$timeCoverageRow['sales_with_conversion_time'],
                'sales_missing_conversion_time' => max(0, (int)$timeCoverageRow['sales_count'] - (int)$timeCoverageRow['sales_with_conversion_time']),
            ],
        ],
        'rows' => array_map(static fn(array $row): array => [
            'date_utc' => (string)$row['date_utc'],
            'product_key' => $row['product_key'] === null ? null : (string)$row['product_key'],
            'product_label' => $row['product_label'] === null ? null : (string)$row['product_label'],
            'presell_host' => (string)$row['presell_host'],
            'offer_name' => $row['offer_name'] === null ? null : (string)$row['offer_name'],
            'currency' => (string)$row['currency'],
            'sales_count' => (int)$row['sales_count'],
            'payout_total' => (string)$row['payout_total'],
        ], $rows),
        'sale_details' => array_map(static fn(array $row): array => [
            'sale_key' => (string)$row['sale_key'],
            'received_at_utc' => (string)$row['received_at_utc'],
            'conversion_at_utc' => $row['conversion_at_utc'] === null ? null : (string)$row['conversion_at_utc'],
            'product_key' => $row['product_key'] === null ? null : (string)$row['product_key'],
            'product_label' => $row['product_label'] === null ? null : (string)$row['product_label'],
            'presell_host' => (string)$row['presell_host'],
            'offer_name' => $row['offer_name'] === null ? null : (string)$row['offer_name'],
            'currency' => (string)$row['currency'],
            'payout_amount' => (string)$row['payout_amount'],
            'google_ads_status' => (string)$row['google_ads_status'],
            'google_ads_error_code' => $row['google_ads_error_code'] === null ? null : (string)$row['google_ads_error_code'],
        ], $saleDetailsRows),
        'sale_details_truncated' => $saleDetailsTruncated,
    ]);
}
