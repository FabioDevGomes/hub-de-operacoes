<?php
declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$packageRoot = $projectRoot . DIRECTORY_SEPARATOR . 'deploy' . DIRECTORY_SEPARATOR . 'staging'
    . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-conversion-profiles';
$source = $projectRoot . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-api-service.php';
$staged = $packageRoot . DIRECTORY_SEPARATOR . 'hostinger-private-tools' . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-api-service.php';

function expect_conversion_profile_package(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

expect_conversion_profile_package(is_file($staged), 'The private service update is missing from staging.');
expect_conversion_profile_package(
    hash_file('sha256', $source) === hash_file('sha256', $staged),
    'The staged private service differs from its source.'
);
$actualFiles = [];
foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($packageRoot)) as $file) {
    if (!$file->isFile()) continue;
    $actualFiles[] = str_replace(DIRECTORY_SEPARATOR, '/', substr($file->getPathname(), strlen($packageRoot) + 1));
}
sort($actualFiles);
$expectedFiles = ['README.md', 'hostinger-private-tools/clickbank-ins-v8-api-service.php'];
sort($expectedFiles);
expect_conversion_profile_package($actualFiles === $expectedFiles, 'The update package contains unexpected files.');
expect_conversion_profile_package(!is_file($packageRoot . DIRECTORY_SEPARATOR . 'tracking-config.php'), 'Private configuration must not be staged.');
expect_conversion_profile_package(!is_file($packageRoot . DIRECTORY_SEPARATOR . 'clickbank-ins-v8.sql'), 'No SQL belongs in this API-only update.');

echo "Pacote de perfis de conversão confere; inclui apenas o serviço privado e o README.\n";
