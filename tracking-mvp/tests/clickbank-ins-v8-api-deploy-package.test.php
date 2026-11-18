<?php
declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$packageRoot = $projectRoot . DIRECTORY_SEPARATOR . 'deploy' . DIRECTORY_SEPARATOR . 'staging'
    . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-api';

function expect_ins_api_package(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$sourceToPackage = [
    'public/clickbank-ins-v8-report.php' => 'hostinger-public-track/clickbank-ins-v8-report.php',
    'public/clickbank-ins-v8-csv.php' => 'hostinger-public-track/clickbank-ins-v8-csv.php',
    'public/clickbank-ins-v8-sales.php' => 'hostinger-public-track/clickbank-ins-v8-sales.php',
    'tools/clickbank-ins-v8-api-service.php' => 'hostinger-private-tools/clickbank-ins-v8-api-service.php',
    'tools/clickbank-ins-v8-sales-api-service.php' => 'hostinger-private-tools/clickbank-ins-v8-sales-api-service.php',
];
foreach ($sourceToPackage as $sourceRelative => $packageRelative) {
    $sourcePath = $projectRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $sourceRelative);
    $packagePath = $packageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $packageRelative);
    expect_ins_api_package(is_file($sourcePath), 'Missing source: ' . $sourceRelative);
    expect_ins_api_package(is_file($packagePath), 'Missing staged API file: ' . $packageRelative);
    expect_ins_api_package(
        hash_file('sha256', $sourcePath) === hash_file('sha256', $packagePath),
        'Staged API file differs from source: ' . $packageRelative
    );
}

$expectedFiles = array_merge(array_values($sourceToPackage), ['README.md']);
sort($expectedFiles);
$actualFiles = [];
foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($packageRoot)) as $file) {
    if (!$file->isFile()) {
        continue;
    }
    $relative = substr($file->getPathname(), strlen($packageRoot) + 1);
    $actualFiles[] = str_replace(DIRECTORY_SEPARATOR, '/', $relative);
}
sort($actualFiles);
expect_ins_api_package($actualFiles === $expectedFiles, 'The new API package has unexpected or missing files.');
expect_ins_api_package(!is_file($packageRoot . DIRECTORY_SEPARATOR . 'tracking-config.php'), 'Private config must never enter staging.');
expect_ins_api_package(!is_file($packageRoot . DIRECTORY_SEPARATOR . 'clickbank-ins-v8.sql'), 'No database migration belongs in this API-only package.');

echo "Pacote API INS v8 confere e não inclui configuração ou SQL privado.\n";
