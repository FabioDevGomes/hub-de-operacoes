<?php
declare(strict_types=1);
require_once __DIR__ . '/../tools/google-ads-campaign-action-service.php';
$missing = hub_google_ads_campaign_action_safe_failure(new Error('Call to undefined function hub_google_ads_missing_helper()'));
if (($missing['missing_function'] ?? '') !== 'hub_google_ads_missing_helper') throw new RuntimeException('Função ausente não identificada.');
$private = hub_google_ads_campaign_action_safe_failure(new RuntimeException('token=SECRET endereço e dados particulares'));
if (str_contains(json_encode($private), 'SECRET') || isset($private['missing_function'])) throw new RuntimeException('Detalhe privado exposto.');
echo "OK: diagnóstico restrito e sem mensagem confidencial.\n";
