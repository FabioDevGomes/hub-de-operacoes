<?php
declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$temporaryRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'tracking-domains-api-path-' . bin2hex(random_bytes(8));

function expect_tracking_domains_path(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function mkdir_tracking_domains_path(string $path): void
{
    if (!is_dir($path) && !mkdir($path, 0777, true) && !is_dir($path)) {
        throw new RuntimeException('Could not create an isolated domain API fixture.');
    }
}

function remove_tracking_domains_path_tree(string $path): void
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
            remove_tracking_domains_path_tree($child);
        } else {
            unlink($child);
        }
    }
    rmdir($path);
}

mkdir_tracking_domains_path($temporaryRoot);
register_shutdown_function(static function () use ($temporaryRoot): void {
    remove_tracking_domains_path_tree($temporaryRoot);
});

$domainRoot = $temporaryRoot . DIRECTORY_SEPARATOR . 'domains' . DIRECTORY_SEPARATOR . 'travenzo.shop';
$publicTrack = $domainRoot . DIRECTORY_SEPARATOR . 'public_html' . DIRECTORY_SEPARATOR . 'track';
$privateTools = $domainRoot . DIRECTORY_SEPARATOR . 'domains' . DIRECTORY_SEPARATOR . 'travenzo.shop' . DIRECTORY_SEPARATOR . 'private-tools';
mkdir_tracking_domains_path($publicTrack);
mkdir_tracking_domains_path($privateTools);
file_put_contents($domainRoot . DIRECTORY_SEPARATOR . 'tracking-config.php', "<?php return ['db_host'=>'localhost','db_name'=>'synthetic','db_user'=>'synthetic','db_password'=>'synthetic','tracking_hub_allowed_origins'=>['http://127.0.0.1:8765']];\n");
file_put_contents($domainRoot . DIRECTORY_SEPARATOR . 'tracking-domain-admin-config.php', "<?php return ['tracking_domain_admin_token'=>'" . str_repeat('a', 64) . "'];\n");
foreach (['public/tracking-domains.php', 'tools/tracking-domains-api-service.php', 'tools/tracking-domain-allowlist-lib.php'] as $relative) {
    $source = $projectRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    $targetDirectory = str_starts_with($relative, 'public/') ? $publicTrack : $privateTools;
    copy($source, $targetDirectory . DIRECTORY_SEPARATOR . basename($relative));
}

$endpoint = $publicTrack . DIRECTORY_SEPARATOR . 'tracking-domains.php';
$harness = $publicTrack . DIRECTORY_SEPARATOR . 'request-harness.php';
$harnessCode = "<?php\n\$_SERVER['REQUEST_METHOD'] = 'OPTIONS';\n\$_SERVER['HTTP_ORIGIN'] = 'http://127.0.0.1:8765';\nrequire " . var_export($endpoint, true) . ";\n";
file_put_contents($harness, $harnessCode);
$command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($harness);
$output = [];
exec($command, $output, $exitCode);
$response = implode("\n", $output);
expect_tracking_domains_path($exitCode === 0 && $response === '', 'The public wrapper did not locate and authorize its private service. Response: ' . $response);

echo "Teste de caminho privado da API de domínios aprovado.\n";
