<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
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

// Keep private-tools outside public_html. Hostinger accounts may use either
// the domain-root sibling layout or the nested domains/<domain> layout.
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
        $privateTools = $resolved;
        break;
    }
}

if ($publicRoot === false || $publicHtmlRoot === false || $privateTools === false) {
    http_response_code(404);
    header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'error' => 'private_service_unavailable']);
    exit;
}
$apiLibrary = realpath($privateTools . DIRECTORY_SEPARATOR . 'google-ads-api-lib.php');
if ($apiLibrary === false || !str_starts_with($apiLibrary, $privateTools . DIRECTORY_SEPARATOR)) {
    http_response_code(404);
    header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'error' => 'private_service_unavailable']);
    exit;
}
require_once $apiLibrary;
google_ads_api_dispatch('csv');
