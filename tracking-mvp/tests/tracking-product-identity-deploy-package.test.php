<?php
declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$packageRoot = $projectRoot . DIRECTORY_SEPARATOR . 'deploy' . DIRECTORY_SEPARATOR . 'staging'
    . DIRECTORY_SEPARATOR . 'presell-product-identity';

function expect_product_identity_package(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }
}

$sourceToPackage = [
    'public/collect.php' => 'hostinger-public-track/collect.php',
    'public/track.js' => 'hostinger-public-track/track.js',
    'public/tracking-domains.php' => 'hostinger-public-track/tracking-domains.php',
    'tools/tracking-domains-api-service.php' => 'hostinger-private-tools/tracking-domains-api-service.php',
    'tools/tracking-domain-allowlist-lib.php' => 'hostinger-private-tools/tracking-domain-allowlist-lib.php',
    'tracking-product-identity.sql' => 'database/tracking-product-identity.sql',
];
foreach ($sourceToPackage as $sourceRelative => $packageRelative) {
    $source = $projectRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $sourceRelative);
    $packaged = $packageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $packageRelative);
    expect_product_identity_package(is_file($source) && is_file($packaged), 'Missing source or staged file: ' . $sourceRelative);
    expect_product_identity_package(hash_file('sha256', $source) === hash_file('sha256', $packaged), 'Staged file differs from source: ' . $packageRelative);
}

$migration = file_get_contents($projectRoot . DIRECTORY_SEPARATOR . 'tracking-product-identity.sql');
expect_product_identity_package(is_string($migration), 'The migration is not readable.');
expect_product_identity_package(stripos($migration, 'ADD COLUMN product_key') !== false, 'The migration must add nullable product-key columns.');
expect_product_identity_package(stripos($migration, 'ADD COLUMN product_label') !== false, 'The migration must add the nullable human-readable Track label.');
expect_product_identity_package(stripos($migration, 'ADD COLUMN presell_host') !== false, 'The migration must add nullable pre-sell hostname columns.');
expect_product_identity_package(stripos($migration, 'ADD KEY idx_tracking_events_product_key') !== false, 'The migration must add its lookup index.');
expect_product_identity_package(stripos($migration, 'ADD KEY idx_tracking_events_presell_host') !== false, 'The migration must add its pre-sell lookup index.');
expect_product_identity_package(stripos($migration, 'information_schema.COLUMNS') !== false
    && stripos($migration, 'information_schema.STATISTICS') !== false
    && stripos($migration, 'PREPARE tracking_identity_stmt') !== false, 'The migration must skip already existing columns and indexes safely.');
expect_product_identity_package(preg_match('/\b(DROP|TRUNCATE|DELETE|REPLACE|UPDATE)\b/i', $migration) !== 1, 'The migration must preserve existing values and rows.');

$collector = file_get_contents($projectRoot . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'collect.php');
expect_product_identity_package(is_string($collector)
    && str_contains($collector, 'tracking_dynamic_domain_product_key')
    && str_contains($collector, 'hash_equals($registeredProductKey, $providedProductKey)')
    && str_contains($collector, 'presell_host_mismatch')
    && str_contains($collector, ':product_key')
    && str_contains($collector, ':presell_host'), 'The collector must validate and bind product IDs and pre-sell hostnames to the authorized domain.');

$publicFiles = scandir($packageRoot . DIRECTORY_SEPARATOR . 'hostinger-public-track');
expect_product_identity_package(is_array($publicFiles) && !in_array('tracking-config.php', $publicFiles, true), 'Private configuration must not be staged publicly.');

echo "OK: pacote de identidade por produto corresponde às fontes e usa migração aditiva." . PHP_EOL;
