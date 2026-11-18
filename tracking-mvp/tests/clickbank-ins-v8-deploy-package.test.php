<?php
declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$packageRoot = $projectRoot . DIRECTORY_SEPARATOR . 'deploy' . DIRECTORY_SEPARATOR . 'staging'
    . DIRECTORY_SEPARATOR . 'clickbank-ins-v8';

function expect_ins_package(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$sourceToPackage = [
    'public/clickbank-ins-v8.php' => 'hostinger-public-track/clickbank-ins-v8.php',
    'tools/clickbank-ins-v8-service.php' => 'hostinger-private-tools/clickbank-ins-v8-service.php',
    'tools/clickbank-ins-v8-lib.php' => 'hostinger-private-tools/clickbank-ins-v8-lib.php',
];

foreach ($sourceToPackage as $sourceRelative => $packageRelative) {
    $sourcePath = $projectRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $sourceRelative);
    $packagePath = $packageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $packageRelative);
    expect_ins_package(is_file($sourcePath), 'Missing INS v8 source file: ' . $sourceRelative);
    expect_ins_package(is_file($packagePath), 'Missing staged INS v8 file: ' . $packageRelative);
    expect_ins_package(
        hash_file('sha256', $sourcePath) === hash_file('sha256', $packagePath),
        'Staged file differs from its source: ' . $packageRelative
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
expect_ins_package(
    $actualFiles === $expectedFiles,
    'The staging package contains an unexpected file or is missing an expected file.'
);

expect_ins_package(
    !is_file($packageRoot . DIRECTORY_SEPARATOR . 'tracking-config.php'),
    'A private tracking-config.php must never be included in the staging package.'
);
expect_ins_package(
    !is_file($packageRoot . DIRECTORY_SEPARATOR . 'clickbank-ins-v8.sql'),
    'The already-executed SQL migration must not be part of the upload package.'
);

echo "Pacote staging INS v8 confere com as fontes e não inclui configuração privada.\n";
