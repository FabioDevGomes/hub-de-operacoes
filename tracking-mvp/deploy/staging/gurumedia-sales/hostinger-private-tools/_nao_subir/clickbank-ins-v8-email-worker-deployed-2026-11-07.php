<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-service.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-email-service.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-campaign-pause-email-service.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'tracking-clicks-report-service.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'gurumedia-sales-service.php';

$trackingConfigPath = clickbank_ins_v8_email_find_private_config();
$privateRoot = realpath(__DIR__);
$emailConfigPath = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'tracking-email-config.php');
if ($emailConfigPath === false) {
    // Backward compatibility for the previously named shared SMTP configuration.
    $emailConfigPath = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'clickbank-email-config.php');
}
if ($privateRoot === false || $trackingConfigPath === null
    || str_contains(
        str_replace(['/', '\\'], DIRECTORY_SEPARATOR, strtolower($privateRoot)),
        DIRECTORY_SEPARATOR . 'public_html' . DIRECTORY_SEPARATOR
    )) {
    fwrite(STDOUT, "Serviço privado de Tracking não configurado.\n");
    exit(0);
}

$trackingConfig = require $trackingConfigPath;
if (!is_array($trackingConfig)) {
    fwrite(STDERR, "Configuração privada de Tracking inválida.\n");
    exit(1);
}

$emailConfig = null;
$emailConfigIsPrivate = $emailConfigPath !== false && is_file($emailConfigPath)
    && str_starts_with($emailConfigPath, rtrim($privateRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)
    && !str_contains(
        str_replace(['/', '\\'], DIRECTORY_SEPARATOR, strtolower($emailConfigPath)),
        DIRECTORY_SEPARATOR . 'public_html' . DIRECTORY_SEPARATOR
    );
if ($emailConfigIsPrivate) {
    $candidateEmailConfig = require $emailConfigPath;
    if (is_array($candidateEmailConfig)) $emailConfig = $candidateEmailConfig;
}

try {
    $pdo = clickbank_ins_v8_open_database($trackingConfig);
    $guruMediaGoogleAdsResult = gurumedia_sales_google_ads_process_batch($pdo, 10);
    if ($emailConfig !== null) {
        $saleResult = clickbank_ins_v8_email_process_batch($pdo, $emailConfig);
        $checkoutResult = clickbank_postback_email_process_batch($pdo, $emailConfig);
        $guruMediaResult = gurumedia_sales_email_process_batch($pdo, $emailConfig);
        $guruMediaUnmatchedResult = gurumedia_postback_email_process_batch($pdo, $emailConfig);
        $googleAdsPauseResult = google_ads_campaign_pause_email_process_batch($pdo, $emailConfig);
        fwrite(STDOUT, sprintf(
            "Notificações por e-mail: %d enviadas, %d pendentes com erro, %d ignoradas por Track não cadastrada, %d selecionadas (%d vendas ClickBank, %d checkouts ClickBank, %d vendas GuruMedia, %d vendas GuruMedia sem clique correspondente, %d pausas automáticas Google Ads).\n",
            $saleResult['sent'] + $checkoutResult['sent'] + $guruMediaResult['sent'] + $guruMediaUnmatchedResult['sent'] + $googleAdsPauseResult['sent'],
            $saleResult['failed'] + $checkoutResult['failed'] + $guruMediaResult['failed'] + $guruMediaUnmatchedResult['failed'] + $googleAdsPauseResult['failed'],
            $checkoutResult['ignored'],
            $saleResult['selected'] + $checkoutResult['selected'] + $guruMediaResult['selected'] + $guruMediaUnmatchedResult['selected'] + $googleAdsPauseResult['selected'],
            $saleResult['selected'],
            $checkoutResult['selected'],
            $guruMediaResult['selected'],
            $guruMediaUnmatchedResult['selected'],
            $googleAdsPauseResult['selected']
        ));
    } else {
        fwrite(STDOUT, "Notificações por e-mail: configuração ausente ou inválida; filas de e-mail não processadas.\n");
    }
    fwrite(STDOUT, sprintf(
        "Conversões GuruMedia para Google Ads: %d aceitas pela API, %d processadas, %d com erro%s.\n",
        $guruMediaGoogleAdsResult['submitted'],
        $guruMediaGoogleAdsResult['processed'],
        $guruMediaGoogleAdsResult['failed'],
        $guruMediaGoogleAdsResult['disabled'] ? ' (desativado)' : ''
    ));
} catch (Throwable $error) {
    // Do not print raw exception text: it can include server paths or provider details.
    fwrite(STDERR, "Notificações por e-mail: execução falhou; confira configuração e banco.\n");
    exit(1);
}

