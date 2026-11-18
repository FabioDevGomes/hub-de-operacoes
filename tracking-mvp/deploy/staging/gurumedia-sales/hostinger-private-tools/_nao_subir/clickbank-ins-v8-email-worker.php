<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-service.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-email-service.php';

$trackingConfigPath = clickbank_ins_v8_email_find_private_config();
$privateRoot = realpath(__DIR__);
$emailConfigPath = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'tracking-email-config.php');
if ($emailConfigPath === false) {
    // Backward compatibility for the previously named shared SMTP configuration.
    $emailConfigPath = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'clickbank-email-config.php');
}
if ($privateRoot === false || $emailConfigPath === false || !is_file($emailConfigPath)
    || !str_starts_with($emailConfigPath, rtrim($privateRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)
    || str_contains(
        str_replace(['/', '\\'], DIRECTORY_SEPARATOR, strtolower($privateRoot)),
        DIRECTORY_SEPARATOR . 'public_html' . DIRECTORY_SEPARATOR
    )
    || $trackingConfigPath === null) {
    fwrite(STDOUT, "Notificações por e-mail: configuração privada ainda não instalada.\n");
    exit(0);
}

$trackingConfig = require $trackingConfigPath;
$emailConfig = require $emailConfigPath;
if (!is_array($trackingConfig) || !is_array($emailConfig)) {
    fwrite(STDERR, "Notificações ClickBank: configuração privada inválida.\n");
    exit(1);
}

try {
    $pdo = clickbank_ins_v8_open_database($trackingConfig);
    $saleResult = clickbank_ins_v8_email_process_batch($pdo, $emailConfig);
    $checkoutResult = clickbank_postback_email_process_batch($pdo, $emailConfig);
    $guruMediaResult = gurumedia_sales_email_process_batch($pdo, $emailConfig);
    $guruMediaUnmatchedResult = gurumedia_postback_email_process_batch($pdo, $emailConfig);
    fwrite(STDOUT, sprintf(
        "Notificações por e-mail: %d enviadas, %d pendentes com erro, %d ignoradas por Track não cadastrada, %d selecionadas (%d vendas ClickBank, %d checkouts ClickBank, %d vendas GuruMedia, %d vendas GuruMedia sem clique correspondente).\n",
        $saleResult['sent'] + $checkoutResult['sent'] + $guruMediaResult['sent'] + $guruMediaUnmatchedResult['sent'],
        $saleResult['failed'] + $checkoutResult['failed'] + $guruMediaResult['failed'] + $guruMediaUnmatchedResult['failed'],
        $checkoutResult['ignored'],
        $saleResult['selected'] + $checkoutResult['selected'] + $guruMediaResult['selected'] + $guruMediaUnmatchedResult['selected'],
        $saleResult['selected'],
        $checkoutResult['selected'],
        $guruMediaResult['selected'],
        $guruMediaUnmatchedResult['selected']
    ));
} catch (Throwable $error) {
    // Do not print raw exception text: it can include server paths or provider details.
    fwrite(STDERR, "Notificações por e-mail: execução falhou; confira configuração e banco.\n");
    exit(1);
}

