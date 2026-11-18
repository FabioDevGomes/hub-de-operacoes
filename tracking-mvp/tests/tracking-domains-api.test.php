<?php
declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'tracking-domains-api-service.php';

function expect_tracking_domains_same($expected, $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

$validHosts = [
    'Example.COM' => 'example.com',
    'https://Example.COM/' => 'example.com',
    'https://www.example.com:443/' => 'www.example.com',
    'example.com.' => 'example.com',
    'xn--caf-dma.example' => 'xn--caf-dma.example',
];
foreach ($validHosts as $input => $expected) {
    expect_tracking_domains_same($expected, tracking_domains_normalize_host($input), 'A valid HTTPS hostname should normalize consistently.');
}

$invalidHosts = [
    'http://example.com',
    'https://example.com/path',
    'https://example.com?x=1',
    'https://user:pass@example.com',
    'https://example.com:8443',
    '*.example.com',
    'localhost',
    '127.0.0.1',
    'example',
    '-bad.example.com',
    'bad-.example.com',
    'https://example.com/#fragment',
];
foreach ($invalidHosts as $input) {
    expect_tracking_domains_same(null, tracking_domains_normalize_host($input), 'Unsafe or malformed host must be rejected: ' . $input);
}

$entries = tracking_domains_input_entries('Example.com', true);
expect_tracking_domains_same([
    ['page_host' => 'example.com', 'origin' => 'https://example.com', 'product_key' => null, 'product_label' => null],
    ['page_host' => 'www.example.com', 'origin' => 'https://www.example.com', 'product_key' => null, 'product_label' => null],
], $entries, 'The explicit www option should add the exact second HTTPS host.');
expect_tracking_domains_same(1, count(tracking_domains_input_entries('www.example.com', true)), 'A supplied www host must not become www.www.');
expect_tracking_domains_same(
    'metabo-drops',
    tracking_domains_input_entries('metabo.zinvero.shop', false, 'Metabo-Drops', 'Metabo Drops')[0]['product_key'],
    'Product keys should normalize to a stable lowercase identifier.'
);
expect_tracking_domains_same(
    'Metabo Drops - Zinvero',
    tracking_domains_input_entries('metabo.zinvero.shop', false, 'metabo-drops-zinvero', 'Metabo Drops - Zinvero')[0]['product_label'],
    'The human-readable Track label should remain separate from its technical key.'
);
expect_tracking_domains_same(true, tracking_domains_product_label_changed(null, 'Metabo Drops'), 'A new label should update an existing host row.');
expect_tracking_domains_same(false, tracking_domains_product_label_changed('Metabo Drops', null), 'An older client must not erase a saved label.');
expect_tracking_domains_same(false, tracking_domains_product_key_changed(null, null, 'example.com'), 'An older client must not erase or change an existing mapping.');
expect_tracking_domains_same(false, tracking_domains_product_key_changed(null, 'example.com', 'example.com'), 'The host fallback is already the effective product identifier.');
expect_tracking_domains_same(true, tracking_domains_product_key_changed(null, 'product-a', 'example.com'), 'A submitted product key must replace the hostname fallback.');
expect_tracking_domains_same(true, tracking_domains_product_key_changed('product-a', 'product-b', 'example.com'), 'Changing a product key must be reported as an update.');
foreach (['', 'two words', 'product/<script>', str_repeat('x', 254), 'bad..key'] as $invalidProductKey) {
    expect_tracking_domains_same(null, tracking_domains_normalize_product_key($invalidProductKey), 'An invalid product key must be rejected.');
}
foreach (['', '   ', '<script>', str_repeat('x', 254)] as $invalidProductLabel) {
    expect_tracking_domains_same(null, tracking_domains_normalize_product_label($invalidProductLabel), 'An invalid Track label must be rejected.');
}
try {
    tracking_domains_input_entries('http://example.com', false);
    throw new RuntimeException('HTTP domains must be rejected.');
} catch (InvalidArgumentException $error) {
    expect_tracking_domains_same('invalid_domain', $error->getMessage(), 'Invalid domains have a stable error code.');
}

$token = str_repeat('a', 64);
$origin = 'http://127.0.0.1:8765';
$config = [
    'tracking_domain_admin_token' => $token,
    'tracking_hub_allowed_origins' => [$origin],
];
expect_tracking_domains_same(200, tracking_domains_api_authorize('GET', $origin, 'Bearer ' . $token, $config)['status'], 'Valid administrative reads should be authorized.');
expect_tracking_domains_same(200, tracking_domains_api_authorize('POST', $origin, 'Bearer ' . $token, $config)['status'], 'Valid administrative writes should be authorized.');
expect_tracking_domains_same(204, tracking_domains_api_authorize('OPTIONS', $origin, null, $config)['status'], 'CORS preflight should not require the bearer token.');
expect_tracking_domains_same(403, tracking_domains_api_authorize('POST', 'https://attacker.example', 'Bearer ' . $token, $config)['status'], 'Unknown browser origins must be rejected.');
expect_tracking_domains_same(403, tracking_domains_api_authorize('POST', null, 'Bearer ' . $token, $config)['status'], 'Requests without Origin must be rejected.');
expect_tracking_domains_same(401, tracking_domains_api_authorize('POST', $origin, 'Bearer ' . str_repeat('b', 64), $config)['status'], 'The domain-management token must be checked independently.');
expect_tracking_domains_same(401, tracking_domains_api_authorize('POST', $origin, 'Bearer ' . str_repeat('b', 64), [
    'tracking_domain_admin_token' => str_repeat('c', 64),
    'tracking_hub_api_token' => $token,
    'tracking_hub_allowed_origins' => [$origin],
])['status'], 'The read-only Hub token must not authorize domain writes.');
expect_tracking_domains_same(405, tracking_domains_api_authorize('DELETE', $origin, 'Bearer ' . $token, $config)['status'], 'The first version must not expose domain removal.');

echo "Testes da API de domínios aprovados.\n";
