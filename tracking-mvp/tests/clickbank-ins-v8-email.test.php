<?php
declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-email-service.php';

function expect_email(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$sale = ['role' => 'AFFILIATE', 'transaction_type' => 'SALE', 'is_test' => 0];
expect_email(clickbank_ins_v8_email_notification_kind($sale) === 'sale', 'A real affiliate SALE should be queued.');
expect_email(clickbank_ins_v8_email_notification_kind(['role' => 'VENDOR', 'transaction_type' => 'SALE']) === null, 'Vendor events should not create affiliate sale emails.');
expect_email(clickbank_ins_v8_email_notification_kind(['role' => 'AFFILIATE', 'transaction_type' => 'BILL']) === null, 'Non-sale affiliate events should not create regular sale emails.');
expect_email(clickbank_ins_v8_email_notification_kind(['role' => 'AFFILIATE', 'transaction_type' => 'TEST IPN']) === 'test', 'A ClickBank test IPN should be queued as a test.');
expect_email(clickbank_ins_v8_email_notification_kind(['role' => 'VENDOR', 'transaction_type' => 'TEST_SALE', 'is_test' => 1]) === 'test', 'Test events should be notified regardless of role.');
expect_email(clickbank_ins_v8_email_notification_kind(['role' => 'AFFILIATE', 'transaction_type' => 'CANCEL-TEST']) === 'test', 'ClickBank test cancellation types should remain visibly marked as tests.');

$config = [
    'to_email' => 'notify@example.invalid',
    'from_email' => 'alerts@example.invalid',
    'smtp_host' => 'smtp.example.invalid',
    'smtp_port' => 465,
    'smtp_security' => 'ssl',
    'smtp_username' => 'alerts@example.invalid',
    'smtp_password' => 'SYNTHETIC_PASSWORD',
];
$normalized = clickbank_ins_v8_email_normalize_config($config);
expect_email($normalized['smtp_port'] === 465, 'SMTP port should normalize to an integer.');
expect_email($normalized['smtp_password'] === 'SYNTHETIC_PASSWORD', 'A valid private SMTP password should remain byte-for-byte intact.');
expect_email(clickbank_ins_v8_email_format_money('137.4500', 'USD') === 'US$ 137,45', 'USD commission should use the requested Brazilian display format.');
expect_email(clickbank_ins_v8_email_format_money('1234.5', 'USD') === 'US$ 1.234,50', 'USD commission should include Brazilian thousands/decimal separators.');
expect_email(clickbank_ins_v8_email_format_money('not-a-number', 'USD') === null, 'Invalid commission values should not be formatted or added to the subject.');
$invalid = $config;
$invalid['smtp_host'] = "smtp.example.invalid\r\nMAIL FROM:<attacker@example.invalid>";
$rejected = false;
try {
    clickbank_ins_v8_email_normalize_config($invalid);
} catch (RuntimeException $error) {
    $rejected = $error->getMessage() === 'configuration_invalid';
}
expect_email($rejected, 'SMTP host header/protocol injection should be rejected.');

$message = clickbank_ins_v8_email_build_message(
    ['notification_kind' => 'test'],
    [
        'transaction_type' => 'TEST IPN',
        'is_test' => 1,
        'received_at_utc' => '2026-10-21 20:10:00.000',
        'transaction_time_utc' => '2026-10-21 20:09:00.000',
        'customer_country' => 'BR',
        'receipt_id' => 'SYNTHETIC-RECEIPT-1234',
        'sale_gross_total' => '10.0000',
        'commission_total' => '10.0000',
        'commission_currency' => 'USD',
        'gclid' => 'PRIVATE-GCLID-MUST-NOT-APPEAR',
        'extclid' => 'PRIVATE-EXTCLID-MUST-NOT-APPEAR',
    ],
    [
        ['product_title' => "Synthetic Product\nInjected header: no", 'quantity' => '1'],
        ['product_title' => 'Second item', 'quantity' => '2'],
        ['product_title' => 'Third item'],
        ['product_title' => 'Fourth item'],
        ['product_title' => 'Fifth item'],
        ['product_title' => 'Sixth item'],
    ]
);
expect_email($message['subject'] === 'TESTE - Notificação ClickBank', 'Test email subject must make its status unmistakable.');
expect_email(str_contains($message['body'], 'TESTE') && str_contains($message['body'], 'não é elegível para o CSV'), 'Test email must say it is excluded from the CSV.');
expect_email(str_contains($message['body'], 'País de cobrança: BR'), 'Email should show the saved billing country code.');
expect_email(str_contains($message['body'], '••••1234'), 'Email should mask the receipt.');
expect_email(str_contains($message['body'], 'e mais 1 item'), 'Email should cap item lines and summarize the remainder.');
expect_email(!str_contains($message['body'], 'PRIVATE-GCLID') && !str_contains($message['body'], 'PRIVATE-EXTCLID'), 'GCLID and extclid must not appear in email.');
expect_email(!str_contains($message['body'], "\nInjected header:"), 'Untrusted item text must not create additional email lines.');

$saleMessage = clickbank_ins_v8_email_build_message(
    ['notification_kind' => 'sale'],
    ['transaction_type' => 'SALE', 'is_test' => 0, 'commission_total' => '137.4500', 'commission_currency' => 'USD'],
    []
);
expect_email($saleMessage['subject'] === 'Venda ClickBank recebida - US$ 137,45', 'Real sale subject should include the formatted affiliate commission.');
expect_email(str_contains($saleMessage['body'], 'Comissão afiliada: US$ 137,45'), 'Real sale body should show the formatted affiliate commission.');
expect_email(str_contains($saleMessage['body'], 'Revise a transação e a elegibilidade no Hub'), 'Real sale emails should not claim CSV or Google Ads delivery.');
expect_email(!str_contains($saleMessage['body'], 'PRIVATE-GCLID') && !str_contains($saleMessage['body'], 'PRIVATE-EXTCLID'), 'Real sale email should not include tracking identifiers.');

$saleWithoutCommission = clickbank_ins_v8_email_build_message(
    ['notification_kind' => 'sale'],
    ['transaction_type' => 'SALE', 'is_test' => 0, 'commission_currency' => 'USD'],
    []
);
expect_email($saleWithoutCommission['subject'] === 'Venda ClickBank recebida', 'A sale without a commission amount should keep a clean subject.');
expect_email(str_contains($saleWithoutCommission['body'], 'Comissão afiliada: não informado'), 'A sale without a commission amount should say it was not provided.');

expect_email(
    clickbank_postback_email_worker_notification_kind('Order_impression') === 'checkout',
    'The private CLI worker must classify checkout events without loading public helper files.'
);
expect_email(
    clickbank_postback_email_worker_notification_kind('Purchase') === null,
    'The private worker classifier must not treat purchases as checkout events.'
);
expect_email(
    clickbank_postback_email_track_name_from_matches([['product_key' => 'dentabiome-conta-8568', 'product_label' => 'DentaBiome - conta 8568']]) === 'DentaBiome - conta 8568',
    'A uniquely matched checkout should use the configured human-readable Track label.'
);
expect_email(
    clickbank_postback_email_track_name_from_matches([['product_key' => 'dentabiome-conta-8568', 'product_label' => null]]) === 'dentabiome-conta-8568',
    'Older Track rows without a saved label should fall back to their technical key.'
);
expect_email(
    clickbank_postback_email_track_name_from_matches([
        ['product_key' => 'product-a', 'product_label' => 'Product A'],
        ['product_key' => 'product-b', 'product_label' => 'Product B'],
    ]) === null,
    'Ambiguous click attribution must not choose a Track arbitrarily.'
);
expect_email(
    clickbank_postback_email_registered_track_from_matches([[
        'presell_host' => 'getdentabiome.travenzo.shop',
        'allowed_page_host' => 'getdentabiome.travenzo.shop',
        'product_key' => 'dentabiome-conta-8568',
        'product_label' => 'Dentabiome - conta 8568',
    ]]) === 'Dentabiome - conta 8568',
    'A uniquely matched Track that remains registered in the Hub should be eligible for checkout email.'
);
expect_email(
    clickbank_postback_email_registered_track_from_matches([[
        'presell_host' => 'getdentabiome.travenzo.shop',
        'allowed_page_host' => null,
        'product_key' => 'dentabiome-conta-8568',
        'product_label' => 'Dentabiome - conta 8568',
    ]]) === null,
    'A Track removed from the Hub allowlist must not receive checkout email.'
);
expect_email(
    clickbank_postback_email_registered_track_from_matches([[
        'presell_host' => 'test.travenzo.shop',
        'allowed_page_host' => 'other.travenzo.shop',
        'product_key' => 'product-a',
        'product_label' => 'Product A',
    ]]) === null,
    'A registration for a different domain must not qualify a checkout.'
);
expect_email(
    clickbank_postback_email_registered_track_from_matches([
        [
            'presell_host' => 'a.travenzo.shop',
            'allowed_page_host' => 'a.travenzo.shop',
            'product_key' => 'product-a',
            'product_label' => 'Product A',
        ],
        [
            'presell_host' => 'b.travenzo.shop',
            'allowed_page_host' => 'b.travenzo.shop',
            'product_key' => 'product-b',
            'product_label' => 'Product B',
        ],
    ]) === null,
    'An extclid resolving to multiple Tracks must not send checkout email.'
);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'clickbank-postback-email-lib.php';
expect_email(clickbank_postback_email_notification_kind('Order_impression') === 'checkout', 'ClickBank Order_impression should enqueue a checkout alert.');
expect_email(clickbank_postback_email_notification_kind('Order form impression') === 'checkout', 'The human-readable order-form-impression label should be recognized.');
expect_email(clickbank_postback_email_notification_kind('Purchase') === null, 'Purchase postbacks must not be classified as checkout openings.');
expect_email(clickbank_postback_email_notification_kind('Upsell') === null, 'Upsell postbacks must not be classified as checkout openings.');
foreach (['Order_impression', 'Order form impression', 'Purchase', 'Upsell'] as $eventType) {
    expect_email(
        clickbank_postback_email_worker_notification_kind($eventType)
            === clickbank_postback_email_notification_kind($eventType),
        'Public and private checkout event classifiers should agree for ' . $eventType . '.'
    );
}
$checkoutMessage = clickbank_postback_email_build_message([
    'event_type' => 'Order_impression',
    'event_time' => '2026-10-22T13:58:14.000Z',
    'received_at_utc' => '2026-10-22 13:58:15.830',
    'extclid' => 'PRIVATE-EXTCLID-MUST-NOT-APPEAR',
    'track_name' => 'Dentabiome - conta 8568',
    'email' => 'buyer@example.invalid',
]);
expect_email($checkoutMessage['subject'] === 'Checkout ClickBank', 'Checkout email subject should use the fixed subject.');
expect_email(
    $checkoutMessage['body'] === "Dentabiome - conta 8568\nHorário do evento: 22/10/2026 10:58\nRecebido em: 22/10/2026 10:58\n",
    'Checkout email body should contain only the Track name and local event/received times.'
);
expect_email(!str_contains($checkoutMessage['body'], 'PRIVATE-EXTCLID') && !str_contains($checkoutMessage['body'], 'buyer@example.invalid'), 'Checkout email must not expose tracking IDs or buyer data.');
$unidentifiedCheckoutMessage = clickbank_postback_email_build_message(['event_type' => 'Order_impression']);
expect_email($unidentifiedCheckoutMessage['subject'] === 'Checkout ClickBank', 'Unidentified checkout should keep the fixed subject.');
expect_email(
    $unidentifiedCheckoutMessage['body'] === "não identificada\nHorário do evento: não informado\nRecebido em: não informado\n",
    'Unidentified checkout should use a concise fallback body.'
);

expect_email(clickbank_ins_v8_email_retry_delay_seconds(1) === 60, 'First retry should wait one minute.');
expect_email(clickbank_ins_v8_email_retry_delay_seconds(2) === 300, 'Second retry should use backoff.');
expect_email(clickbank_ins_v8_email_retry_delay_seconds(30) === 21600, 'Retry delay should cap at six hours.');
expect_email(clickbank_ins_v8_email_failure_code(new RuntimeException('smtp_auth_failed')) === 'smtp_auth_failed', 'Safe SMTP error categories should be retained.');
expect_email(clickbank_ins_v8_email_failure_code(new RuntimeException('secret password was xyz')) === 'notification_failed', 'Raw provider errors/secrets must never be written as an error code.');
expect_email(
    clickbank_ins_v8_email_failure_code(new RuntimeException('secret TLS provider details'), 'smtp_starttls') === 'smtp_starttls_failed',
    'Unexpected TLS errors should map to a safe stage-specific code.'
);
expect_email(
    clickbank_ins_v8_email_failure_code(new RuntimeException('recipient rejected with private details'), 'smtp_recipient') === 'smtp_recipient_rejected',
    'Unexpected recipient errors should map to a safe stage-specific code.'
);
expect_email(
    clickbank_ins_v8_email_failure_code(new RuntimeException('private stack trace'), 'notification_prepare') === 'notification_build_failed',
    'Unexpected message-building errors should map to a safe stage-specific code.'
);
expect_email(
    clickbank_ins_v8_email_failure_code(new RuntimeException('smtp_message_rejected')) === 'smtp_message_rejected',
    'A rejected message should be distinguishable from connection/authentication failures.'
);

echo "Notificações ClickBank: vendas, checkout, configuração, conteúdo sem PII e retentativas conferidos.\n";
