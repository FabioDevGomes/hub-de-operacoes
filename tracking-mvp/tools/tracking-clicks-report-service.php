<?php
declare(strict_types=1);

const TRACKING_CLICKS_MAX_DAYS = 366;
const TRACKING_CLICKS_MAX_ROWS = 5000;
const TRACKING_CLICKS_BODY_MAX_BYTES = 2048;

function tracking_clicks_load_config(): array
{
    $candidates = [
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tracking-config.php',
        dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'tracking-config.php',
    ];
    foreach ($candidates as $path) {
        if (!is_file($path)) {
            continue;
        }
        $config = require $path;
        if (!is_array($config)) {
            break;
        }
        foreach (['db_host', 'db_name', 'db_user', 'db_password'] as $key) {
            if (!isset($config[$key]) || !is_string($config[$key]) || $config[$key] === '') {
                break 2;
            }
        }
        return $config;
    }
    throw new RuntimeException('api_not_configured');
}

function tracking_clicks_authorize(string $method, ?string $origin, ?string $authorization, array $config): array
{
    $allowedOrigins = $config['tracking_hub_allowed_origins'] ?? null;
    if (!is_array($allowedOrigins) || !is_string($origin) || $origin === '' || !in_array($origin, $allowedOrigins, true)) {
        return ['status' => 403, 'error' => 'origin_not_allowed', 'allow_origin' => null];
    }
    $method = strtoupper($method);
    if ($method === 'OPTIONS') {
        return ['status' => 204, 'error' => null, 'allow_origin' => $origin];
    }
    if ($method !== 'POST') {
        return ['status' => 405, 'error' => 'method_not_allowed', 'allow_origin' => $origin];
    }
    $expectedToken = $config['tracking_hub_api_token'] ?? null;
    if (!is_string($expectedToken) || preg_match('/^[a-f0-9]{64}$/iD', $expectedToken) !== 1) {
        return ['status' => 503, 'error' => 'api_not_configured', 'allow_origin' => $origin];
    }
    if (!is_string($authorization)
        || preg_match('/^Bearer ([a-f0-9]{64})$/iD', $authorization, $matches) !== 1
        || !hash_equals($expectedToken, $matches[1])) {
        return ['status' => 401, 'error' => 'not_authorized', 'allow_origin' => $origin];
    }
    return ['status' => 200, 'error' => null, 'allow_origin' => $origin];
}

function tracking_clicks_normalize_dates($startDate, $endDate): array
{
    if (!is_string($startDate) || !is_string($endDate)
        || preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $startDate, $start) !== 1
        || preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $endDate, $end) !== 1
        || !checkdate((int)$start[2], (int)$start[3], (int)$start[1])
        || !checkdate((int)$end[2], (int)$end[3], (int)$end[1])) {
        throw new InvalidArgumentException('invalid_date_range');
    }
    $startUtc = new DateTimeImmutable($startDate . ' 00:00:00', new DateTimeZone('UTC'));
    $endUtc = new DateTimeImmutable($endDate . ' 00:00:00', new DateTimeZone('UTC'));
    if ($endUtc < $startUtc) {
        throw new InvalidArgumentException('invalid_date_range');
    }
    $days = (int)$startUtc->diff($endUtc)->format('%a') + 1;
    if ($days > TRACKING_CLICKS_MAX_DAYS) {
        throw new InvalidArgumentException('date_range_too_large');
    }
    return [
        'start_date' => $startDate,
        'end_date' => $endDate,
        'start_at_utc' => $startUtc->format('Y-m-d H:i:s'),
        'end_before_utc' => $endUtc->modify('+1 day')->format('Y-m-d H:i:s'),
    ];
}

function tracking_clicks_connect_db(array $config): PDO
{
    $dsn = 'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

/** Return daily event counts only; no visitor, click, campaign, or URL identifiers leave the database. */
function tracking_clicks_fetch_report(PDO $pdo, array $dates, string $platform, bool $includeTrafficSource = false): array
{
    $trafficSourceEnabled = $includeTrafficSource && $platform === 'gurumedia';
    $trafficSourceExpression = $trafficSourceEnabled
        ? "CASE
                WHEN NULLIF(TRIM(e.gclid), '') IS NOT NULL
                  OR NULLIF(TRIM(e.gbraid), '') IS NOT NULL
                  OR NULLIF(TRIM(e.wbraid), '') IS NOT NULL THEN 'Google Ads'
                WHEN NULLIF(TRIM(e.utm_source), '') IS NOT NULL THEN CONCAT(
                    'UTM: ', LEFT(TRIM(e.utm_source), 80),
                    CASE WHEN NULLIF(TRIM(e.utm_medium), '') IS NOT NULL
                      THEN CONCAT(' / ', LEFT(TRIM(e.utm_medium), 60)) ELSE '' END
                )
                WHEN NULLIF(TRIM(e.referrer_origin), '') IS NOT NULL THEN CONCAT(
                    'Referência: ', LEFT(LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(e.referrer_origin, '://', -1), '/', 1)), 120)
                )
                ELSE 'Sem origem identificada'
            END"
        : "'Não segmentada'";
    $statement = $pdo->prepare(
        "SELECT DATE(e.received_at_utc) AS date_utc, e.product_key, d.product_label, e.presell_host,
                {$trafficSourceExpression} AS traffic_source,
                SUM(CASE WHEN e.event_type = 'page_view' THEN 1 ELSE 0 END) AS page_views,
                SUM(CASE WHEN e.event_type = 'outbound_click' THEN 1 ELSE 0 END) AS outbound_clicks
         FROM tracking_events AS e
         INNER JOIN tracking_allowed_domains AS d ON d.page_host = e.presell_host
         WHERE e.received_at_utc >= :start_at_utc
           AND e.received_at_utc < :end_before_utc
           AND e.event_type IN ('page_view', 'outbound_click')
           AND d.platform = :platform
         GROUP BY DATE(e.received_at_utc), e.product_key, d.product_label, e.presell_host, traffic_source
         ORDER BY DATE(e.received_at_utc) DESC, e.product_key ASC, e.presell_host ASC, traffic_source ASC
         LIMIT " . (TRACKING_CLICKS_MAX_ROWS + 1)
    );
    $statement->execute([
        ':start_at_utc' => $dates['start_at_utc'],
        ':end_before_utc' => $dates['end_before_utc'],
        ':platform' => $platform,
    ]);
    $rows = $statement->fetchAll();
    if (count($rows) > TRACKING_CLICKS_MAX_ROWS) {
        throw new RuntimeException('report_limit_exceeded');
    }
    return array_map(static function (array $row) use ($trafficSourceEnabled): array {
        $result = [
            'date_utc' => (string)$row['date_utc'],
            'product_key' => is_string($row['product_key'] ?? null) && trim($row['product_key']) !== '' ? strtolower(trim($row['product_key'])) : null,
            'product_label' => is_string($row['product_label'] ?? null) && trim($row['product_label']) !== '' ? trim($row['product_label']) : null,
            'presell_host' => is_string($row['presell_host'] ?? null) && trim($row['presell_host']) !== '' ? strtolower(trim($row['presell_host'])) : null,
            'page_views' => max(0, (int)$row['page_views']),
            'outbound_clicks' => max(0, (int)$row['outbound_clicks']),
        ];
        if ($trafficSourceEnabled) {
            $result['traffic_source'] = is_string($row['traffic_source'] ?? null) && trim($row['traffic_source']) !== ''
                ? trim($row['traffic_source'])
                : 'Sem origem identificada';
        }
        return $result;
    }, $rows);
}

/** Aggregate sessions without exposing visitor or click identifiers. */
function tracking_clicks_campaign_advance(PDO $pdo, array $dates, string $campaignId): array
{
    $stmt = $pdo->prepare("SELECT COUNT(*) AS sessions, COALESCE(SUM(advanced),0) AS advanced FROM (
        SELECT e.presell_host, e.visitor_id,
            CASE WHEN MAX(CASE WHEN e.event_type='outbound_click' THEN e.received_at_utc END)
              >= MIN(CASE WHEN e.event_type='page_view' THEN e.received_at_utc END) THEN 1 ELSE 0 END AS advanced
        FROM tracking_events e INNER JOIN tracking_allowed_domains d ON d.page_host=e.presell_host
        WHERE e.received_at_utc >= :start_at AND e.received_at_utc < :end_at
          AND e.utm_campaign=:campaign_id AND d.platform='gurumedia'
          AND e.event_type IN ('page_view','outbound_click')
          AND NULLIF(TRIM(e.visitor_id),'') IS NOT NULL AND NULLIF(TRIM(e.presell_host),'') IS NOT NULL
        GROUP BY e.presell_host,e.visitor_id
        HAVING MIN(CASE WHEN e.event_type='page_view' THEN e.received_at_utc END) IS NOT NULL
    ) sessions");
    $stmt->execute([':start_at'=>$dates['start_at_utc'], ':end_at'=>$dates['end_before_utc'], ':campaign_id'=>$campaignId]);
    $row = $stmt->fetch();
    return ['sessions'=>(int)$row['sessions'], 'advanced'=>(int)$row['advanced']];
}

function tracking_clicks_authorization_header(): ?string
{
    $value = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null;
    if (is_string($value)) {
        return $value;
    }
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $headerValue) {
            if (strcasecmp((string)$name, 'Authorization') === 0 && is_string($headerValue)) {
                return $headerValue;
            }
        }
    }
    return null;
}

function tracking_clicks_send_json(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function tracking_clicks_report_dispatch(): never
{
    header('Cache-Control: no-store, private');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    try {
        $config = tracking_clicks_load_config();
    } catch (Throwable $error) {
        tracking_clicks_send_json(503, ['ok' => false, 'error' => 'api_not_configured']);
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
        header('Access-Control-Allow-Headers: Authorization, Content-Type');
        header('Access-Control-Max-Age: 300');
    }
    if ($decision['status'] === 204) {
        http_response_code(204);
        exit;
    }
    if ($decision['status'] !== 200) {
        tracking_clicks_send_json($decision['status'], ['ok' => false, 'error' => $decision['error']]);
    }
    if (($_SERVER['QUERY_STRING'] ?? '') !== '') {
        tracking_clicks_send_json(400, ['ok' => false, 'error' => 'query_not_supported']);
    }
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > TRACKING_CLICKS_BODY_MAX_BYTES) {
        tracking_clicks_send_json(413, ['ok' => false, 'error' => 'payload_too_large']);
    }
    $contentType = strtolower(trim(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
    if ($contentType !== 'application/json') {
        tracking_clicks_send_json(415, ['ok' => false, 'error' => 'unsupported_content_type']);
    }
    $rawBody = file_get_contents('php://input');
    if (!is_string($rawBody) || $rawBody === '' || strlen($rawBody) > TRACKING_CLICKS_BODY_MAX_BYTES) {
        tracking_clicks_send_json(400, ['ok' => false, 'error' => 'invalid_payload']);
    }
    try {
        $payload = json_decode($rawBody, true, 8, JSON_THROW_ON_ERROR);
    } catch (Throwable $error) {
        tracking_clicks_send_json(400, ['ok' => false, 'error' => 'invalid_json']);
    }
    if (!is_array($payload) || array_diff(array_keys($payload), ['start_date', 'end_date', 'platform', 'include_traffic_source', 'campaign_advance_id']) !== []
        || !array_key_exists('start_date', $payload) || !array_key_exists('end_date', $payload)) {
        tracking_clicks_send_json(400, ['ok' => false, 'error' => 'invalid_payload']);
    }
    try {
        $platform = $payload['platform'] ?? 'clickbank';
        if (!is_string($platform) || !in_array($platform, ['clickbank', 'gurumedia'], true)) {
            throw new InvalidArgumentException('invalid_platform');
        }
        $includeTrafficSource = $payload['include_traffic_source'] ?? false;
        if (!is_bool($includeTrafficSource)) {
            throw new InvalidArgumentException('invalid_payload');
        }
        $dates = tracking_clicks_normalize_dates($payload['start_date'], $payload['end_date']);
        $pdo = tracking_clicks_connect_db($config);
        if (array_key_exists('campaign_advance_id', $payload)) {
            $id = $payload['campaign_advance_id'];
            if ($platform !== 'gurumedia' || !is_string($id) || preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1) {
                throw new InvalidArgumentException('invalid_payload');
            }
            $result = tracking_clicks_campaign_advance($pdo, $dates, $id);
            tracking_clicks_send_json(200, ['ok'=>true, 'campaign_id'=>$id, 'start_date'=>$dates['start_date'], 'end_date'=>$dates['end_date'], 'generated_at_utc'=>gmdate('Y-m-d\TH:i:s\Z')] + $result);
        }
        $rows = tracking_clicks_fetch_report($pdo, $dates, $platform, $includeTrafficSource);
    } catch (InvalidArgumentException $error) {
        tracking_clicks_send_json(400, ['ok' => false, 'error' => $error->getMessage()]);
    } catch (Throwable $error) {
        $code = $error instanceof RuntimeException && $error->getMessage() === 'report_limit_exceeded'
            ? 'report_limit_exceeded'
            : 'server_error';
        error_log('Tracking clicks report request failed.');
        tracking_clicks_send_json($code === 'report_limit_exceeded' ? 413 : 503, ['ok' => false, 'error' => $code]);
    }
    tracking_clicks_send_json(200, [
        'ok' => true,
        'schema_version' => 2,
        'platform' => $platform,
        'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'start_date' => $dates['start_date'],
        'end_date' => $dates['end_date'],
        'count_semantics' => 'events_not_unique_visitors',
        'rows' => $rows,
    ]);
}
