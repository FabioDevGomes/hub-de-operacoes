<?php
declare(strict_types=1);

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

$privateTools = false;
$service = false;
$sharedService = false;
if ($publicRoot !== false && $publicHtmlRoot !== false) {
    $domainRoot = dirname($publicHtmlRoot);
    $domainName = basename($domainRoot);
    $publicPrefix = rtrim($publicHtmlRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    $candidates = [
        $domainRoot . DIRECTORY_SEPARATOR . 'private-tools',
        $domainRoot . DIRECTORY_SEPARATOR . 'domains' . DIRECTORY_SEPARATOR . $domainName . DIRECTORY_SEPARATOR . 'private-tools',
    ];
    foreach ($candidates as $candidate) {
        $resolved = realpath($candidate);
        if ($resolved === false || str_starts_with($resolved . DIRECTORY_SEPARATOR, $publicPrefix)) continue;
        $resolvedService = realpath($resolved . DIRECTORY_SEPARATOR . 'gurumedia-sales-service.php');
        $resolvedShared = realpath($resolved . DIRECTORY_SEPARATOR . 'tracking-clicks-report-service.php');
        if ($resolvedService === false || $resolvedShared === false
            || !str_starts_with($resolvedService, $resolved . DIRECTORY_SEPARATOR)
            || !str_starts_with($resolvedShared, $resolved . DIRECTORY_SEPARATOR)) continue;
        $privateTools = $resolved;
        $service = $resolvedService;
        $sharedService = $resolvedShared;
        break;
    }
}

if ($publicRoot === false || $publicHtmlRoot === false || $privateTools === false || $service === false || $sharedService === false) {
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'error' => 'service_unavailable']);
    exit;
}

require_once $sharedService;
require_once $service;
