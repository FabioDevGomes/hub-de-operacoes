<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');

$publicRoot = realpath(__DIR__);
$publicHtmlRoot = false;
$cursor = $publicRoot;
while (is_string($cursor) && $cursor !== dirname($cursor)) {
    if (strtolower(basename($cursor)) === 'public_html') { $publicHtmlRoot = $cursor; break; }
    $cursor = dirname($cursor);
}

$privateTools = false;
$service = false;
if ($publicRoot !== false && $publicHtmlRoot !== false) {
    $domainRoot = dirname($publicHtmlRoot);
    $domainName = basename($domainRoot);
    $candidates = [
        $domainRoot . DIRECTORY_SEPARATOR . 'private-tools',
        $domainRoot . DIRECTORY_SEPARATOR . 'domains' . DIRECTORY_SEPARATOR . $domainName . DIRECTORY_SEPARATOR . 'private-tools',
    ];
    $publicHtmlPrefix = rtrim($publicHtmlRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    foreach ($candidates as $candidate) {
        $resolved = realpath($candidate);
        if ($resolved === false || str_starts_with($resolved . DIRECTORY_SEPARATOR, $publicHtmlPrefix)) continue;
        $resolvedService = realpath($resolved . DIRECTORY_SEPARATOR . 'google-ads-campaign-action-service.php');
        if ($resolvedService === false || !str_starts_with($resolvedService, $resolved . DIRECTORY_SEPARATOR)) continue;
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
hub_google_ads_campaign_action_dispatch();
