<?php
declare(strict_types=1);

// This exporter is intentionally CLI-only. Deploy it outside public_html.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-export-service.php';

function usage(): void
{
    echo <<<TXT
Exportador manual ClickBank → Google Ads (GCLID)

Uso:
  php export-google-ads.php --conversion-name="NOME EXATO DA AÇÃO"
  php export-google-ads.php --conversion-name="NOME EXATO DA AÇÃO" --write
  php export-google-ads.php --self-test

Sem --write, o comando apenas mostra uma prévia resumida. Com --write,
grava um CSV na pasta privada exports/, fora de public_html.
Opcional: --since=AAAA-MM-DD (padrão: últimos 90 dias de postbacks).

TXT;
}

function parse_options(array $arguments): array
{
    $options = ['conversion_name' => null, 'since' => null, 'write' => false, 'help' => false, 'self_test' => false];
    foreach (array_slice($arguments, 1) as $argument) {
        if ($argument === '--write') {
            $options['write'] = true;
        } elseif ($argument === '--help' || $argument === '-h') {
            $options['help'] = true;
        } elseif ($argument === '--self-test') {
            $options['self_test'] = true;
        } elseif (strpos($argument, '--conversion-name=') === 0) {
            $options['conversion_name'] = trim(substr($argument, strlen('--conversion-name=')), " \t\n\r\0\x0B\"");
        } elseif (strpos($argument, '--since=') === 0) {
            $options['since'] = trim(substr($argument, strlen('--since=')), " \t\n\r\0\x0B\"");
        } else {
            throw new InvalidArgumentException('Opção não reconhecida. Use --help para ver a sintaxe.');
        }
    }
    return $options;
}

function run_self_test(): int
{
    $base = [
        'event_id' => 'cb-event-1',
        'event_type' => 'PURCHASE',
        'receipt_id' => 'receipt-1',
        'order_id' => 'order-1',
        'extclid' => '00000000-0000-4000-8000-000000000001',
        'matched_click_id' => '00000000-0000-4000-8000-000000000001',
        'gclid' => 'RealClickIdExample123',
        'click_received_at_utc' => '2026-10-15 17:34:25.990',
        'event_time' => '2026-10-15T18:22:09.403411897Z[UTC]',
        'affiliate_earnings' => '1.00',
        'order_currency' => 'USD',
    ];

    $valid = google_ads_prepare_conversion_row($base, 'Purchase - ClickBank');
    if ($valid['row'] === null || $valid['row']['Conversion Time'] !== '2026-10-15 18:22:09+0000') {
        fwrite(STDERR, "Falha no teste de preparação de linha/horário.\n");
        return 1;
    }

    $synthetic = $base;
    $synthetic['gclid'] = 'TEST-GCLID-123';
    if (google_ads_prepare_conversion_row($synthetic, 'Purchase - ClickBank')['reason'] !== 'synthetic_gclid') {
        fwrite(STDERR, "Falha no filtro de GCLID fictício.\n");
        return 1;
    }

    $unmatched = $base;
    $unmatched['matched_click_id'] = '';
    if (google_ads_prepare_conversion_row($unmatched, 'Purchase - ClickBank')['reason'] !== 'unmatched_click') {
        fwrite(STDERR, "Falha no filtro de clique não associado.\n");
        return 1;
    }

    $beforeClick = $base;
    $beforeClick['event_time'] = '2026-10-15T17:00:00Z';
    if (google_ads_prepare_conversion_row($beforeClick, 'Purchase - ClickBank')['reason'] !== 'conversion_before_click') {
        fwrite(STDERR, "Falha no filtro de conversão anterior ao clique.\n");
        return 1;
    }

    $deduped = google_ads_build_export_rows([$base, $base], 'Purchase - ClickBank');
    if (count($deduped['rows']) !== 1 || ($deduped['skipped']['duplicate_order_id'] ?? 0) !== 1) {
        fwrite(STDERR, "Falha na deduplicação por Order ID.\n");
        return 1;
    }

    echo "Autotestes do exportador aprovados.\n";
    return 0;
}

function print_summary(array $result): void
{
    echo 'Conversões elegíveis: ' . count($result['rows']) . "\n";
    if ($result['skipped'] === []) {
        echo "Registros ignorados: 0\n";
        return;
    }

    $labels = [
        'unmatched_click' => 'sem clique correspondente',
        'missing_gclid' => 'sem GCLID',
        'synthetic_gclid' => 'GCLID fictício/de teste',
        'invalid_or_missing_time' => 'horário ausente/inválido',
        'conversion_before_click' => 'conversão anterior ao clique',
        'outside_90_day_window' => 'fora da janela de 90 dias',
        'missing_or_invalid_affiliate_earnings' => 'comissão ausente/inválida',
        'missing_or_invalid_currency' => 'moeda ausente/inválida',
        'missing_order_identifier' => 'sem identificador de pedido',
        'duplicate_order_id' => 'pedido duplicado no arquivo',
        'not_initial_purchase' => 'evento que não é compra inicial',
    ];
    echo "Registros ignorados:\n";
    foreach ($result['skipped'] as $reason => $count) {
        echo '  - ' . ($labels[$reason] ?? $reason) . ': ' . $count . "\n";
    }
}

function write_private_csv(array $rows): string
{
    $exportDirectory = __DIR__ . DIRECTORY_SEPARATOR . 'exports';
    if (!is_dir($exportDirectory) && !mkdir($exportDirectory, 0700, true) && !is_dir($exportDirectory)) {
        throw new RuntimeException('Não foi possível criar a pasta privada exports/.');
    }
    if (is_link($exportDirectory)) {
        throw new RuntimeException('Por segurança, exports/ não pode ser um link simbólico.');
    }
    @chmod($exportDirectory, 0700);
    clearstatcache(true, $exportDirectory);
    $directoryPermissions = @fileperms($exportDirectory);
    if ($directoryPermissions === false || ($directoryPermissions & 0077) !== 0) {
        throw new RuntimeException('Não foi possível restringir o acesso à pasta exports/.');
    }

    $filename = 'clickbank-google-ads-' . gmdate('Ymd-His') . '.csv';
    $path = $exportDirectory . DIRECTORY_SEPARATOR . $filename;
    $handle = @fopen($path, 'x');
    if ($handle === false) {
        throw new RuntimeException('Não foi possível criar um novo arquivo CSV privado.');
    }
    @chmod($path, 0600);

    try {
        clearstatcache(true, $path);
        $filePermissions = @fileperms($path);
        if ($filePermissions === false || ($filePermissions & 0077) !== 0) {
            throw new RuntimeException('Não foi possível restringir o acesso ao arquivo CSV.');
        }
        if (fputcsv($handle, GOOGLE_ADS_UPLOAD_HEADERS, ',', '"', '') === false) {
            throw new RuntimeException('Falha ao escrever o cabeçalho do CSV.');
        }
        foreach ($rows as $row) {
            $values = [];
            foreach (GOOGLE_ADS_UPLOAD_HEADERS as $header) {
                $values[] = $row[$header];
            }
            if (fputcsv($handle, $values, ',', '"', '') === false) {
                throw new RuntimeException('Falha ao escrever uma linha do CSV.');
            }
        }
    } finally {
        fclose($handle);
    }

    return $path;
}

try {
    $options = parse_options($argv);
    if ($options['help']) {
        usage();
        exit(0);
    }
    if ($options['self_test']) {
        exit(run_self_test());
    }
    if (!is_string($options['conversion_name']) || $options['conversion_name'] === '') {
        usage();
        fwrite(STDERR, "Informe --conversion-name com o nome exato da ação no Google Ads.\n");
        exit(2);
    }
    if (strlen($options['conversion_name']) > 255) {
        throw new InvalidArgumentException('O nome da ação ultrapassa 255 caracteres.');
    }

    $config = google_ads_load_tracking_config();
    $export = google_ads_collect_export($config, $options['conversion_name'], $options['since']);
    $result = ['rows' => $export['rows'], 'skipped' => $export['skipped']];
    print_summary($result);

    if (!$options['write']) {
        echo "Prévia apenas: nenhum arquivo foi gravado. Use --write depois de revisar o resultado.\n";
        exit(0);
    }
    if ($result['rows'] === []) {
        throw new RuntimeException('Nenhuma conversão elegível; não foi criado arquivo vazio.');
    }

    $path = write_private_csv($result['rows']);
    echo 'CSV criado fora da pasta pública: ' . $path . "\n";
} catch (Throwable $error) {
    fwrite(STDERR, 'Exportação interrompida: ' . $error->getMessage() . "\n");
    exit(1);
}
