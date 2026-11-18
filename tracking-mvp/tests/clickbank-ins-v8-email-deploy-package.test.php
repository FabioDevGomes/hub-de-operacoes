<?php
declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$packageRoot = $projectRoot . DIRECTORY_SEPARATOR . 'deploy' . DIRECTORY_SEPARATOR . 'staging'
    . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-email';

function expect_email_package(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$sourceToPackage = [
    'tools/clickbank-ins-v8-service.php' => 'hostinger-private-tools/clickbank-ins-v8-service.php',
    'tools/clickbank-ins-v8-lib.php' => 'hostinger-private-tools/clickbank-ins-v8-lib.php',
    'tools/clickbank-ins-v8-email-service.php' => 'hostinger-private-tools/clickbank-ins-v8-email-service.php',
    'tools/clickbank-ins-v8-email-worker.php' => 'hostinger-private-tools/clickbank-ins-v8-email-worker.php',
    'clickbank-ins-v8-email-outbox.sql' => 'database/clickbank-ins-v8-email-outbox.sql',
    'public/clickbank-postback.php' => 'hostinger-public-track/clickbank-postback.php',
    'public/clickbank-postback-email-lib.php' => 'hostinger-public-track/clickbank-postback-email-lib.php',
    'clickbank-postback-email-outbox.sql' => 'database/clickbank-postback-email-outbox.sql',
    'clickbank-postback-event-type-key.sql' => 'database/clickbank-postback-event-type-key.sql',
];
foreach ($sourceToPackage as $sourceRelative => $packageRelative) {
    $source = $projectRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $sourceRelative);
    $packaged = $packageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $packageRelative);
    expect_email_package(is_file($source) && is_file($packaged), 'Missing email notification source/package file: ' . $sourceRelative);
    expect_email_package(hash_file('sha256', $source) === hash_file('sha256', $packaged), 'Staged package differs from source: ' . $packageRelative);
}

$expected = array_merge(array_values($sourceToPackage), ['README.md']);
sort($expected);
$actual = [];
foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($packageRoot)) as $file) {
    if ($file->isFile()) {
        $actual[] = str_replace(DIRECTORY_SEPARATOR, '/', substr($file->getPathname(), strlen($packageRoot) + 1));
    }
}
sort($actual);
expect_email_package($actual === $expected, 'The email staging package contains unexpected/missing files.');
expect_email_package(!is_file($packageRoot . DIRECTORY_SEPARATOR . 'clickbank-email-config.php'), 'SMTP credentials must not be packaged.');
expect_email_package(!is_file($packageRoot . DIRECTORY_SEPARATOR . 'tracking-config.php'), 'The private tracking config must not be packaged.');

echo "Pacote de notificações ClickBank confere; configurações privadas foram excluídas.\n";
