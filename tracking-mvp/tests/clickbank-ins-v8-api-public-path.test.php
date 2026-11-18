<?php
declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$temporaryRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'tracking-ins-v8-api-path-' . bin2hex(random_bytes(8));

function expect_ins_api_path(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function mkdir_ins_api_path(string $path): void
{
    if (!is_dir($path) && !mkdir($path, 0777, true) && !is_dir($path)) {
        throw new RuntimeException('Could not create an isolated API path fixture.');
    }
}

function remove_ins_api_path_tree(string $path): void
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
            remove_ins_api_path_tree($child);
        } else {
            unlink($child);
        }
    }
    rmdir($path);
}

mkdir_ins_api_path($temporaryRoot);
register_shutdown_function(static function () use ($temporaryRoot): void {
    remove_ins_api_path_tree($temporaryRoot);
});

$packageFiles = [
    'public/clickbank-ins-v8-report.php',
    'public/clickbank-ins-v8-csv.php',
    'public/clickbank-ins-v8-sales.php',
    'tools/clickbank-ins-v8-api-service.php',
    'tools/clickbank-ins-v8-sales-api-service.php',
];
$fixtures = [
    'sibling' => static fn(string $domainRoot): string => $domainRoot . DIRECTORY_SEPARATOR . 'private-tools',
    'nested' => static fn(string $domainRoot): string => $domainRoot . DIRECTORY_SEPARATOR . 'domains'
        . DIRECTORY_SEPARATOR . basename($domainRoot) . DIRECTORY_SEPARATOR . 'private-tools',
    'public_html' => static fn(string $domainRoot): string => $domainRoot . DIRECTORY_SEPARATOR . 'public_html'
        . DIRECTORY_SEPARATOR . 'private-tools',
];

foreach ($fixtures as $layout => $privatePathFactory) {
    $base = $temporaryRoot . DIRECTORY_SEPARATOR . $layout;
    $domainRoot = $base . DIRECTORY_SEPARATOR . 'domains' . DIRECTORY_SEPARATOR . 'travenzo.shop';
    $publicHtml = $domainRoot . DIRECTORY_SEPARATOR . 'public_html';
    $publicTrack = $publicHtml . DIRECTORY_SEPARATOR . 'track';
    $privateTools = $privatePathFactory($domainRoot);
    mkdir_ins_api_path($publicTrack);
    mkdir_ins_api_path($privateTools);
    file_put_contents($domainRoot . DIRECTORY_SEPARATOR . 'tracking-config.php', "<?php return ['db_host'=>'localhost','db_name'=>'synthetic','db_user'=>'synthetic','db_password'=>'synthetic','tracking_hub_api_token'=>'" . str_repeat('a', 64) . "','tracking_hub_allowed_origins'=>['http://127.0.0.1:8765']];\n");
    foreach ($packageFiles as $relative) {
        $source = $projectRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
        $targetDirectory = str_starts_with($relative, 'public/') ? $publicTrack : $privateTools;
        copy($source, $targetDirectory . DIRECTORY_SEPARATOR . basename($relative));
    }

    foreach (['clickbank-ins-v8-report.php', 'clickbank-ins-v8-csv.php', 'clickbank-ins-v8-sales.php'] as $name) {
        $endpoint = $publicTrack . DIRECTORY_SEPARATOR . $name;
        $harness = $publicTrack . DIRECTORY_SEPARATOR . 'request-harness.php';
        $harnessCode = "<?php\n\$_SERVER['REQUEST_METHOD'] = 'GET';\nrequire " . var_export($endpoint, true) . ";\n";
        file_put_contents($harness, $harnessCode);
        $command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($harness);
        $output = [];
        exec($command, $output, $exitCode);
        $response = implode("\n", $output);
        if ($layout === 'public_html') {
            expect_ins_api_path($exitCode === 0 && str_contains($response, 'api_unavailable'), 'A private-tools folder inside public_html must be rejected.');
        } else {
            expect_ins_api_path($exitCode === 0 && str_contains($response, 'origin_not_allowed'), 'The API wrapper did not find private-tools in the ' . $layout . ' layout. Response: ' . $response);
        }
    }
}

echo "Testes de caminho público/privado da API INS v8 aprovados.\n";
