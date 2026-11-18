<?php
declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-sales-api-service.php';

final class HubSalesApiBridgeRepository implements ClickBankInsV8SalesRepository
{
    public function __construct(private array $transactions, private array $clicks) {}
    public function snapshotMaxId(): string
    {
        return $this->transactions === [] ? '0' : (string)max(array_map(static fn($row) => (int)$row['id'], $this->transactions));
    }
    public function eligibleSalesPage(string $afterId, string $snapshotMaxId): array
    {
        $rows = array_values(array_filter($this->transactions, static fn($row) =>
            (string)$row['id'] > $afterId && (string)$row['id'] <= $snapshotMaxId
            && ($row['source'] ?? 'clickbank_ins_v8') === 'clickbank_ins_v8'
            && ($row['role'] ?? 'AFFILIATE') === 'AFFILIATE'
            && ($row['transaction_type'] ?? 'SALE') === 'SALE'
            && (int)($row['is_test'] ?? 0) === 0
        ));
        usort($rows, static fn($a, $b) => (int)$a['id'] <=> (int)$b['id']);
        return array_slice($rows, 0, CLICKBANK_INS_V8_SALES_PAGE_SIZE + 1);
    }
    public function outboundClicks(array $extclids, array $legacyClickIds): array
    {
        return array_values(array_filter($this->clicks, static fn($click) =>
            ($click['event_type'] ?? null) === 'outbound_click'
            && (in_array($click['clickbank_extclid'] ?? null, $extclids, true)
                || in_array($click['click_id'] ?? null, $legacyClickIds, true))
        ));
    }
}

$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$token = str_repeat('a', 64);
$config = ['tracking_hub_allowed_origins' => ['https://hub.example.test'], 'tracking_hub_api_token' => $token];
$repository = new HubSalesApiBridgeRepository($input['transactions'], $input['clicks']);
$result = clickbank_ins_v8_sales_api_handle_request([
    'method' => 'POST', 'origin' => 'https://hub.example.test', 'authorization' => 'Bearer ' . $token,
    'query_string' => '', 'content_type' => 'application/json',
    'body' => '{"after_id":"0","snapshot_max_id":null}',
], $config, $repository);
echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
