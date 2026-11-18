<?php
declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$packageRoot = $projectRoot . DIRECTORY_SEPARATOR . 'deploy' . DIRECTORY_SEPARATOR . 'staging'
    . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-sale-country';

function expect_ins_sale_country_package(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$sourceToPackage = [
    'tools/clickbank-ins-v8-lib.php' => 'hostinger-private-tools/clickbank-ins-v8-lib.php',
    'tools/clickbank-ins-v8-service.php' => 'hostinger-private-tools/clickbank-ins-v8-service.php',
    'tools/clickbank-ins-v8-api-service.php' => 'hostinger-private-tools/clickbank-ins-v8-api-service.php',
];
foreach ($sourceToPackage as $sourceRelative => $packageRelative) {
    $sourcePath = $projectRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $sourceRelative);
    $packagePath = $packageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $packageRelative);
    expect_ins_sale_country_package(is_file($sourcePath), 'Missing source: ' . $sourceRelative);
    expect_ins_sale_country_package(is_file($packagePath), 'Missing staged file: ' . $packageRelative);
    expect_ins_sale_country_package(
        hash_file('sha256', $sourcePath) === hash_file('sha256', $packagePath),
        'Staged file differs from source: ' . $packageRelative
    );
}

$expectedFiles = array_merge(array_values($sourceToPackage), [
    'README.md',
    'database/clickbank-ins-v8-sale-country.sql',
]);
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
expect_ins_sale_country_package($actualFiles === $expectedFiles, 'The overlay package has unexpected or missing files.');

$migration = file_get_contents($packageRoot . DIRECTORY_SEPARATOR . 'database' . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-sale-country.sql');
$migrationStatements = is_string($migration) ? preg_replace('/--[^\r\n]*/', '', $migration) : null;
expect_ins_sale_country_package(
    is_string($migration) && is_string($migrationStatements)
        && str_contains($migration, 'ADD COLUMN customer_country CHAR(2)')
        && str_contains($migration, 'ascii_bin NULL')
        && !preg_match('/\bDROP\s+|\bDELETE\s+|\bUPDATE\s+/i', $migrationStatements),
    'The migration must remain a nullable, additive country-only change.'
);
expect_ins_sale_country_package(!is_file($packageRoot . DIRECTORY_SEPARATOR . 'tracking-config.php'), 'Private configuration must never enter the package.');

echo "Pacote de país/ação INS v8 sincronizado e migração aditiva conferida.\n";
