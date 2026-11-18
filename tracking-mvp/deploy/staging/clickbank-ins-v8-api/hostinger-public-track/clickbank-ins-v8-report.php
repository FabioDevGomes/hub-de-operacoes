<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$publicRoot = realpath(__DIR__);
$publicHtmlRoot = false;
$cursor = $publicRoot;
while (is_string($cursor) && $cursor !== dirname($cursor)) {
    if (strtolower(basename($cursor)) === 'public_html') {
        $publicHtmlRoot = $cursor;
        break;
    }
    $cursor = dirname($cursor);
}

$service = false;
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
        $resolvedService = realpath($resolved . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-api-service.php');
        if ($resolvedService === false || !str_starts_with($resolvedService, $resolved . DIRECTORY_SEPARATOR)) {
            continue;
        }
        $privateTools = $resolved;
        $service = $resolvedService;
        break;
    }
}

if ($publicRoot === false || $publicHtmlRoot === false || $privateTools === false || $service === false) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'api_unavailable']);
    exit;
}

require_once $service;
clickbank_ins_v8_api_dispatch('report');
