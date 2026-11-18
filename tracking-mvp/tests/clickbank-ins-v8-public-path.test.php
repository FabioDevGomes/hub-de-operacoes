<?php
declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$temporaryRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'tracking-ins-v8-path-' . bin2hex(random_bytes(8));

function expect_ins_path(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function mkdir_ins_path(string $path): void
{
    if (!is_dir($path) && !mkdir($path, 0777, true) && !is_dir($path)) {
        throw new RuntimeException('Could not create an isolated endpoint-path fixture.');
    }
}

function remove_ins_path_tree(string $path): void
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
            remove_ins_path_tree($child);
        } else {
            unlink($child);
        }
    }
    rmdir($path);
}

mkdir_ins_path($temporaryRoot);
register_shutdown_function(static function () use ($temporaryRoot): void {
    remove_ins_path_tree($temporaryRoot);
});

$endpointSource = $projectRoot . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'clickbank-ins-v8.php';
$serviceSource = $projectRoot . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-service.php';
$librarySource = $projectRoot . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-lib.php';
$emailServiceSource = $projectRoot . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-email-service.php';
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
    mkdir_ins_path($publicTrack);
    mkdir_ins_path($privateTools);
    file_put_contents($domainRoot . DIRECTORY_SEPARATOR . 'tracking-config.php', "<?php return ['clickbank_ins_v8_secret_key' => 'SYNTHETIC_TEST_KEY'];\n");
    copy($endpointSource, $publicTrack . DIRECTORY_SEPARATOR . 'clickbank-ins-v8.php');
    copy($serviceSource, $privateTools . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-service.php');
    copy($librarySource, $privateTools . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-lib.php');
    copy($emailServiceSource, $privateTools . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-email-service.php');

    $endpoint = $publicTrack . DIRECTORY_SEPARATOR . 'clickbank-ins-v8.php';
    $harness = $publicTrack . DIRECTORY_SEPARATOR . 'request-harness.php';
    $harnessCode = "<?php\n\$_SERVER['REQUEST_METHOD'] = 'GET';\nrequire " . var_export($endpoint, true) . ";\n";
    file_put_contents($harness, $harnessCode);
    $command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($harness);
    $output = [];
    exec($command, $output, $exitCode);
    $response = implode("\n", $output);

    if ($layout === 'public_html') {
        expect_ins_path(
            $exitCode === 0 && str_contains($response, '"error":"receiver_unavailable"'),
            'A private-tools directory inside public_html was not rejected.'
        );
    } else {
        expect_ins_path(
            $exitCode === 0 && str_contains($response, '"error":"method_not_allowed"'),
            'The endpoint did not locate private-tools in the ' . $layout . ' layout. Response: ' . $response
        );
    }
}

echo "Testes de caminho público/privado do receptor INS v8 aprovados.\n";
