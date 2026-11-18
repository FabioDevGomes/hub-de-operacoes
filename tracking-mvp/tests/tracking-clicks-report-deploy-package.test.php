<?php
declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$packageRoot = $projectRoot . DIRECTORY_SEPARATOR . 'deploy' . DIRECTORY_SEPARATOR . 'staging' . DIRECTORY_SEPARATOR . 'tracking-clicks-report';
$sourceToPackage = [
    'public/tracking-clicks-report.php' => 'hostinger-public-track/tracking-clicks-report.php',
    'tools/tracking-clicks-report-service.php' => 'hostinger-private-tools/tracking-clicks-report-service.php',
];
foreach ($sourceToPackage as $sourceRelative => $packageRelative) {
    $sourcePath = $projectRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $sourceRelative);
    $packagePath = $packageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $packageRelative);
    if (!is_file($sourcePath) || !is_file($packagePath)
        || hash_file('sha256', $sourcePath) !== hash_file('sha256', $packagePath)) {
        throw new RuntimeException('Staging does not match source: ' . $sourceRelative);
    }
}
$expected = array_merge(array_values($sourceToPackage), ['README.md']);
sort($expected);
$actual = [];
foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($packageRoot)) as $file) {
    if ($file->isFile()) $actual[] = str_replace(DIRECTORY_SEPARATOR, '/', substr($file->getPathname(), strlen($packageRoot) + 1));
}
sort($actual);
if ($actual !== $expected) throw new RuntimeException('The staging package has extra or missing files.');
foreach (['tracking-config.php', 'tracking-domain-admin-config.php', '.env'] as $secretName) {
    if (is_file($packageRoot . DIRECTORY_SEPARATOR . $secretName)) throw new RuntimeException('Private configuration must never be staged.');
}

echo "Pacote de publicação do relatório de cliques confere e não contém segredos.\n";
