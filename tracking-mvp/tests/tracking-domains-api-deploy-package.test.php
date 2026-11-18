<?php
declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$packageRoot = $projectRoot . DIRECTORY_SEPARATOR . 'deploy' . DIRECTORY_SEPARATOR . 'staging'
    . DIRECTORY_SEPARATOR . 'tracking-domain-allowlist';

function expect_tracking_domains_package(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$sourceToPackage = [
    'public/collect.php' => 'hostinger-public-track/collect.php',
    'public/tracking-domains.php' => 'hostinger-public-track/tracking-domains.php',
    'tools/tracking-domains-api-service.php' => 'hostinger-private-tools/tracking-domains-api-service.php',
    'tools/tracking-domain-allowlist-lib.php' => 'hostinger-private-tools/tracking-domain-allowlist-lib.php',
    'tracking-domain-allowlist.sql' => 'database/tracking-domain-allowlist.sql',
];
foreach ($sourceToPackage as $sourceRelative => $packageRelative) {
    $sourcePath = $projectRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $sourceRelative);
    $packagePath = $packageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $packageRelative);
    expect_tracking_domains_package(is_file($sourcePath), 'Missing source: ' . $sourceRelative);
    expect_tracking_domains_package(is_file($packagePath), 'Missing staged file: ' . $packageRelative);
    expect_tracking_domains_package(
        hash_file('sha256', $sourcePath) === hash_file('sha256', $packagePath),
        'Staged file differs from source: ' . $packageRelative
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
expect_tracking_domains_package($actualFiles === $expectedFiles, 'The domain-management package has unexpected or missing files.');
expect_tracking_domains_package(!is_file($packageRoot . DIRECTORY_SEPARATOR . 'tracking-config.php'), 'The existing private config must never enter staging.');
expect_tracking_domains_package(!is_file($packageRoot . DIRECTORY_SEPARATOR . 'tracking-domain-admin-config.php'), 'The generated admin secret must never enter staging.');

echo "Pacote de cadastro de domínios confere e não inclui segredos privados.\n";
