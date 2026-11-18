<?php
declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$publicSource = $projectRoot . DIRECTORY_SEPARATOR . 'public';
$publicPackage = $projectRoot . DIRECTORY_SEPARATOR . 'phase2-packages'
    . DIRECTORY_SEPARATOR . 'google-ads-api-public-phase2';
$endpoints = [
    'google-ads-report.php' => 'report',
    'google-ads-csv.php' => 'csv',
];

function expect_public_path(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function mkdir_public_path(string $path): void
{
    if (!is_dir($path) && !mkdir($path, 0777, true) && !is_dir($path)) {
        throw new RuntimeException('Could not create isolated path fixture.');
    }
}

function remove_public_path_tree(string $path): void
{
    if (!is_dir($path)) {
        return;
    }
    foreach (scandir($path) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $child = $path . DIRECTORY_SEPARATOR . $entry;
        if (is_dir($child) && !is_link($child)) {
            remove_public_path_tree($child);
        } else {
            unlink($child);
        }
    }
    rmdir($path);
}

$temporaryRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'tracking-hub-path-' . bin2hex(random_bytes(8));
mkdir_public_path($temporaryRoot);
register_shutdown_function(static function () use ($temporaryRoot): void {
    remove_public_path_tree($temporaryRoot);
});

$layouts = [
    'domain-root sibling' => static fn(string $domainRoot, string $publicHtml): string =>
        $domainRoot . DIRECTORY_SEPARATOR . 'private-tools',
    'nested Hostinger' => static fn(string $domainRoot, string $publicHtml): string =>
        $domainRoot . DIRECTORY_SEPARATOR . 'domains' . DIRECTORY_SEPARATOR . basename($domainRoot) . DIRECTORY_SEPARATOR . 'private-tools',
    'inside public_html is rejected' => static fn(string $domainRoot, string $publicHtml): string =>
        $publicHtml . DIRECTORY_SEPARATOR . 'private-tools',
];

foreach ($layouts as $layoutName => $privateToolsPath) {
    $fixtureRoot = $temporaryRoot . DIRECTORY_SEPARATOR . str_replace(' ', '-', $layoutName);
    $domainRoot = $fixtureRoot . DIRECTORY_SEPARATOR . 'domains' . DIRECTORY_SEPARATOR . 'travenzo.shop';
    $publicHtml = $domainRoot . DIRECTORY_SEPARATOR . 'public_html';
    $publicDirectory = $publicHtml . DIRECTORY_SEPARATOR . 'track';
    $privateTools = $privateToolsPath($domainRoot, $publicHtml);
    mkdir_public_path($publicDirectory);
    mkdir_public_path($privateTools);

    if ($layoutName !== 'inside public_html is rejected') {
        file_put_contents(
            $privateTools . DIRECTORY_SEPARATOR . 'google-ads-api-lib.php',
            "<?php\nfunction google_ads_api_dispatch(string \$endpoint): void { echo 'dispatch:' . \$endpoint; }\n"
        );
    }

    foreach ($endpoints as $filename => $dispatchName) {
        $source = $publicSource . DIRECTORY_SEPARATOR . $filename;
        $packageCopy = $publicPackage . DIRECTORY_SEPARATOR . $filename;
        expect_public_path(is_file($source), 'Missing public source endpoint: ' . $filename);
        expect_public_path(is_file($packageCopy), 'Missing package endpoint: ' . $filename);
        expect_public_path(
            hash_file('sha256', $source) === hash_file('sha256', $packageCopy),
            'The deployment package is out of sync for ' . $filename
        );

        $fixtureEndpoint = $publicDirectory . DIRECTORY_SEPARATOR . $filename;
        expect_public_path(copy($source, $fixtureEndpoint), 'Could not copy endpoint into isolated fixture.');
        $command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($fixtureEndpoint);
        $output = [];
        exec($command, $output, $exitCode);
        $response = implode("\n", $output);

        if ($layoutName === 'inside public_html is rejected') {
            expect_public_path(
                $exitCode === 0 && str_contains($response, '"error":"private_service_unavailable"'),
                'The public endpoints must reject a private-tools directory inside public_html.'
            );
        } else {
            expect_public_path(
                $exitCode === 0 && $response === 'dispatch:' . $dispatchName,
                'The endpoint failed to find the API library in ' . $layoutName . ' layout: ' . $filename
            );
        }
        unlink($fixtureEndpoint);
    }
}

echo "Testes de resolução segura do serviço privado aprovados.\n";
