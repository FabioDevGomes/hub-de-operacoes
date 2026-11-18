<?php
declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$packageRoot = $projectRoot . DIRECTORY_SEPARATOR . 'deploy' . DIRECTORY_SEPARATOR . 'staging'
    . DIRECTORY_SEPARATOR . 'presell-single-script';

function expect_presell_script_package(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }
}

$sourceToPackage = [
    'public/collect.php' => 'hostinger-public-track/collect.php',
    'public/track.js' => 'hostinger-public-track/track.js',
    'tools/clickbank-ins-v8-service.php' => 'hostinger-private-tools/clickbank-ins-v8-service.php',
    'tracking-clickbank-extclid.sql' => 'database/tracking-clickbank-extclid.sql',
];
foreach ($sourceToPackage as $sourceRelative => $packageRelative) {
    $source = $projectRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $sourceRelative);
    $packaged = $packageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $packageRelative);
    expect_presell_script_package(is_file($source) && is_file($packaged), 'Missing source or staged file: ' . $sourceRelative);
    expect_presell_script_package(hash_file('sha256', $source) === hash_file('sha256', $packaged), 'Staged file differs from source: ' . $sourceRelative);
}

$migration = file_get_contents($projectRoot . DIRECTORY_SEPARATOR . 'tracking-clickbank-extclid.sql');
expect_presell_script_package(is_string($migration), 'Migration is not readable.');
expect_presell_script_package(stripos($migration, 'ADD COLUMN clickbank_extclid') !== false, 'Migration must add the extclid column.');
expect_presell_script_package(stripos($migration, 'ADD KEY idx_tracking_events_clickbank_extclid') !== false, 'Migration must add the lookup index.');
expect_presell_script_package(preg_match('/\b(DROP|TRUNCATE|DELETE|REPLACE)\b/i', $migration) !== 1, 'Migration must preserve existing rows.');

$publicFiles = scandir($packageRoot . DIRECTORY_SEPARATOR . 'hostinger-public-track');
expect_presell_script_package(is_array($publicFiles) && !in_array('tracking-config.php', $publicFiles, true), 'Private configuration must not be staged publicly.');

echo "OK: pacote do script único corresponde às fontes e a migração é aditiva." . PHP_EOL;
