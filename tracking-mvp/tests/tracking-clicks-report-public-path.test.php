<?php
declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$temporaryRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'tracking-clicks-path-' . bin2hex(random_bytes(8));

function expect_tracking_clicks_path(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function mkdir_tracking_clicks_path(string $path): void
{
    if (!is_dir($path) && !mkdir($path, 0777, true) && !is_dir($path)) throw new RuntimeException('Could not create isolated API path fixture.');
}

function remove_tracking_clicks_path_tree(string $path): void
{
    if (!is_dir($path)) return;
    foreach (scandir($path) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        $child = $path . DIRECTORY_SEPARATOR . $entry;
        if (is_dir($child) && !is_link($child)) remove_tracking_clicks_path_tree($child);
        else unlink($child);
    }
    rmdir($path);
}

mkdir_tracking_clicks_path($temporaryRoot);
register_shutdown_function(static function () use ($temporaryRoot): void { remove_tracking_clicks_path_tree($temporaryRoot); });
$publicTrack = $temporaryRoot . DIRECTORY_SEPARATOR . 'domains' . DIRECTORY_SEPARATOR . 'travenzo.shop' . DIRECTORY_SEPARATOR . 'public_html' . DIRECTORY_SEPARATOR . 'track';
$privateTools = $temporaryRoot . DIRECTORY_SEPARATOR . 'domains' . DIRECTORY_SEPARATOR . 'travenzo.shop' . DIRECTORY_SEPARATOR . 'domains' . DIRECTORY_SEPARATOR . 'travenzo.shop' . DIRECTORY_SEPARATOR . 'private-tools';
mkdir_tracking_clicks_path($publicTrack);
mkdir_tracking_clicks_path($privateTools);
file_put_contents(dirname($privateTools) . DIRECTORY_SEPARATOR . 'tracking-config.php', "<?php return ['db_host'=>'localhost','db_name'=>'synthetic','db_user'=>'synthetic','db_password'=>'synthetic','tracking_hub_api_token'=>'" . str_repeat('a', 64) . "','tracking_hub_allowed_origins'=>['http://127.0.0.1:8765']];\n");
copy($projectRoot . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'tracking-clicks-report.php', $publicTrack . DIRECTORY_SEPARATOR . 'tracking-clicks-report.php');
copy($projectRoot . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'tracking-clicks-report-service.php', $privateTools . DIRECTORY_SEPARATOR . 'tracking-clicks-report-service.php');
$harness = $publicTrack . DIRECTORY_SEPARATOR . 'request-harness.php';
file_put_contents($harness, "<?php\n\$_SERVER['REQUEST_METHOD'] = 'OPTIONS';\n\$_SERVER['HTTP_ORIGIN'] = 'http://127.0.0.1:8765';\nrequire " . var_export($publicTrack . DIRECTORY_SEPARATOR . 'tracking-clicks-report.php', true) . ";\n");
$command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($harness);
$output = [];
exec($command, $output, $exitCode);
expect_tracking_clicks_path($exitCode === 0 && implode("\n", $output) === '', 'The public wrapper did not resolve its private service.');

echo "Teste de caminho público/privado do relatório de cliques aprovado.\n";
