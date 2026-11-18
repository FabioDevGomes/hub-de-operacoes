<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$publicRoot = realpath(__DIR__);
$publicHtmlRoot = false;
$service = false;
$cursor = $publicRoot;
while (is_string($cursor) && $cursor !== dirname($cursor)) {
    if (strtolower(basename($cursor)) === 'public_html') {
        $publicHtmlRoot = $cursor;
        break;
    }
    $cursor = dirname($cursor);
}

// Resolve the service only from a private-tools folder outside public_html.
$privateTools = false;
if ($publicRoot !== false && $publicHtmlRoot !== false) {
    $domainRoot = dirname($publicHtmlRoot);
    $domainName = basename($domainRoot);
    $privateCandidates = [
        $domainRoot . DIRECTORY_SEPARATOR . 'private-tools',
        $domainRoot . DIRECTORY_SEPARATOR . 'domains' . DIRECTORY_SEPARATOR . $domainName . DIRECTORY_SEPARATOR . 'private-tools',
    ];
    $publicHtmlPrefix = rtrim($publicHtmlRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    foreach ($privateCandidates as $candidate) {
        $resolved = realpath($candidate);
        if ($resolved === false || str_starts_with($resolved . DIRECTORY_SEPARATOR, $publicHtmlPrefix)) {
            continue;
        }
        $resolvedService = realpath($resolved . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-service.php');
        if ($resolvedService === false || !str_starts_with($resolvedService, $resolved . DIRECTORY_SEPARATOR)) {
            continue;
        }
        $privateTools = $resolved;
        $service = $resolvedService;
        break;
    }
}

if ($publicRoot === false || $publicHtmlRoot === false || $privateTools === false) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'receiver_unavailable']);
    exit;
}

if ($service === false) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'receiver_unavailable']);
    exit;
}

$configPath = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'tracking-config.php';
if (!is_file($configPath)) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'receiver_unavailable']);
    exit;
}
$config = require $configPath;
if (!is_array($config)) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'receiver_unavailable']);
    exit;
}

require_once $service;
$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > 65536) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'error' => 'payload_too_large']);
    exit;
}
$rawBody = file_get_contents('php://input', false, null, 0, 65537);
if (!is_string($rawBody)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid_envelope']);
    exit;
}
if (strlen($rawBody) > 65536) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'error' => 'payload_too_large']);
    exit;
}

$result = clickbank_ins_v8_handle_request(
    (string)($_SERVER['REQUEST_METHOD'] ?? 'GET'),
    $rawBody,
    $config
);
http_response_code($result['status']);
echo json_encode($result['body'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
