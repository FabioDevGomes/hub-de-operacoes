<?php
declare(strict_types=1);

const TRACKING_DOMAIN_ALLOWLIST_TABLE = 'tracking_allowed_domains';

function tracking_domains_normalize_host($value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $value = trim($value);
    if ($value === '' || strlen($value) > 2048 || preg_match('/[\x00-\x20\x7F]/', $value)) {
        return null;
    }

    if (preg_match('~^https?://~i', $value) !== 1) {
        $value = 'https://' . $value;
    }
    $parts = parse_url($value);
    if (!is_array($parts)
        || strtolower((string)($parts['scheme'] ?? '')) !== 'https'
        || isset($parts['user']) || isset($parts['pass'])
        || isset($parts['query']) || isset($parts['fragment'])
        || (isset($parts['path']) && $parts['path'] !== '' && $parts['path'] !== '/')
        || (isset($parts['port']) && (int)$parts['port'] !== 443)) {
        return null;
    }

    $host = strtolower(rtrim((string)($parts['host'] ?? ''), '.'));
    if ($host === '' || strlen($host) > 253 || filter_var($host, FILTER_VALIDATE_IP) !== false) {
        return null;
    }
    if (preg_match('/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/D', $host) !== 1) {
        return null;
    }
    return $host;
}

function tracking_domains_normalize_product_key($value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $key = strtolower(trim($value));
    if ($key === '' || strlen($key) > 253
        || preg_match('/^[a-z0-9](?:[a-z0-9._-]{0,251}[a-z0-9])?$/D', $key) !== 1
        || str_contains($key, '..')) {
        return null;
    }
    return $key;
}

function tracking_domains_normalize_product_label($value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $label = trim($value);
    $keyCandidate = strtolower(preg_replace('/[\s-]+/u', '-', $label) ?? '');
    if ($label === '' || strlen($label) > 253 || preg_match('/[\x00-\x1f\x7f]/', $label) === 1
        || tracking_domains_normalize_product_key($keyCandidate) === null) {
        return null;
    }
    return $label;
}

function tracking_domains_default_product_key(string $host): string
{
    return strtolower($host);
}

function tracking_domains_product_key_changed($storedKey, $requestedKey, string $host): bool
{
    if ($requestedKey === null) {
        return false;
    }
    $currentKey = tracking_domains_normalize_product_key($storedKey)
        ?? tracking_domains_default_product_key($host);
    return $currentKey !== $requestedKey;
}

function tracking_domains_normalize_platform($value): ?string
{
    if ($value === null) return 'clickbank';
    if (!is_string($value)) return null;
    $platform = strtolower(trim($value));
    return in_array($platform, ['clickbank', 'gurumedia'], true) ? $platform : null;
}

function tracking_domains_normalize_offer_id($value): ?string
{
    if ($value === null || $value === '') return null;
    if (!is_string($value)) return null;
    $offerId = trim($value);
    if ($offerId === '' || strlen($offerId) > 64 || preg_match('/^[A-Za-z0-9._-]+$/D', $offerId) !== 1) return null;
    return $offerId;
}

function tracking_domains_input_entries($domain, $includeWww, $productKey = null, $productLabel = null, $platform = null, $offerId = null): array
{
    if (!is_bool($includeWww)) {
        throw new InvalidArgumentException('invalid_domain');
    }
    $host = tracking_domains_normalize_host($domain);
    if ($host === null) {
        throw new InvalidArgumentException('invalid_domain');
    }
    $normalizedProductKey = $productKey === null ? null : tracking_domains_normalize_product_key($productKey);
    if ($productKey !== null && $normalizedProductKey === null) {
        throw new InvalidArgumentException('invalid_product_key');
    }
    $normalizedProductLabel = $productLabel === null ? null : tracking_domains_normalize_product_label($productLabel);
    if ($productLabel !== null && $normalizedProductLabel === null) {
        throw new InvalidArgumentException('invalid_product_label');
    }
    $normalizedPlatform = tracking_domains_normalize_platform($platform);
    if ($normalizedPlatform === null) throw new InvalidArgumentException('invalid_platform');
    $normalizedOfferId = tracking_domains_normalize_offer_id($offerId);
    if ($offerId !== null && $normalizedOfferId === null) throw new InvalidArgumentException('invalid_offer_id');
    if ($normalizedOfferId !== null && $normalizedPlatform !== 'gurumedia') throw new InvalidArgumentException('offer_id_requires_gurumedia');

    $hosts = [$host];
    if ($includeWww && !str_starts_with($host, 'www.')) {
        $hosts[] = 'www.' . $host;
    }
    $entries = [];
    foreach (array_values(array_unique($hosts)) as $entryHost) {
        if (strlen($entryHost) > 253) {
            throw new InvalidArgumentException('invalid_domain');
        }
        $entries[] = [
            'page_host' => $entryHost,
            'origin' => 'https://' . $entryHost,
            'product_key' => $normalizedProductKey,
            'product_label' => $normalizedProductLabel,
            'platform' => $normalizedPlatform,
            'offer_id' => $normalizedOfferId,
        ];
    }
    return $entries;
}

function tracking_domains_connect_db(array $config): PDO
{
    foreach (['db_host', 'db_name', 'db_user', 'db_password'] as $requiredKey) {
        if (!isset($config[$requiredKey]) || !is_string($config[$requiredKey]) || $config[$requiredKey] === '') {
            throw new RuntimeException('domain_registry_unavailable');
        }
    }
    $dsn = 'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function tracking_domains_origin_allowed(PDO $pdo, string $origin, ?string $pageHost = null): bool
{
    $sql = 'SELECT 1 FROM ' . TRACKING_DOMAIN_ALLOWLIST_TABLE . ' WHERE origin = :origin';
    if ($pageHost !== null) {
        $sql .= ' AND page_host = :page_host';
    }
    $sql .= ' LIMIT 1';
    $statement = $pdo->prepare($sql);
    $parameters = [':origin' => $origin];
    if ($pageHost !== null) {
        $parameters[':page_host'] = $pageHost;
    }
    $statement->execute($parameters);
    return $statement->fetchColumn() !== false;
}

function tracking_domains_fetch(PDO $pdo): array
{
    $statement = $pdo->query(
        'SELECT page_host, origin, product_key, product_label, platform, offer_id, created_at_utc FROM ' . TRACKING_DOMAIN_ALLOWLIST_TABLE . ' ORDER BY page_host ASC'
    );
    $rows = $statement->fetchAll();
    foreach ($rows as &$row) {
        $row['product_key'] = tracking_domains_normalize_product_key($row['product_key'] ?? null)
            ?? tracking_domains_default_product_key((string)$row['page_host']);
        $row['platform'] = tracking_domains_normalize_platform($row['platform'] ?? null) ?? 'clickbank';
        $row['offer_id'] = tracking_domains_normalize_offer_id($row['offer_id'] ?? null);
    }
    unset($row);
    return $rows;
}

function tracking_domains_add(PDO $pdo, array $entries): array
{
    $added = [];
    $updated = [];
    $alreadyAllowed = [];
    $find = $pdo->prepare(
        'SELECT product_key, product_label, platform, offer_id FROM ' . TRACKING_DOMAIN_ALLOWLIST_TABLE . ' WHERE page_host = :page_host LIMIT 1 FOR UPDATE'
    );
    $insert = $pdo->prepare(
        'INSERT INTO ' . TRACKING_DOMAIN_ALLOWLIST_TABLE . ' (page_host, origin, product_key, product_label, platform, offer_id, created_at_utc)
         VALUES (:page_host, :origin, :product_key, :product_label, :platform, :offer_id, UTC_TIMESTAMP())'
    );
    $update = $pdo->prepare(
        'UPDATE ' . TRACKING_DOMAIN_ALLOWLIST_TABLE . '
         SET product_key = :product_key, product_label = COALESCE(:product_label, product_label), platform = :platform,
             offer_id = CASE
                 WHEN :offer_platform <> \'gurumedia\' THEN NULL
                 WHEN :offer_id_is_set = 1 THEN :offer_id
                 WHEN :product_key_changed = 1 THEN NULL
                 ELSE offer_id
             END
         WHERE page_host = :page_host'
    );
    $pdo->beginTransaction();
    try {
        foreach ($entries as $entry) {
            $find->execute([':page_host' => $entry['page_host']]);
            $existing = $find->fetch(PDO::FETCH_ASSOC);
            if (!is_array($existing)) {
                $insert->execute([
                    ':page_host' => $entry['page_host'],
                    ':origin' => $entry['origin'],
                    ':product_key' => $entry['product_key'] ?? tracking_domains_default_product_key($entry['page_host']),
                    ':product_label' => $entry['product_label'] ?? null,
                    ':platform' => $entry['platform'] ?? 'clickbank',
                    ':offer_id' => $entry['offer_id'] ?? null,
                ]);
                $added[] = $entry['page_host'];
            } else {
                $productKeyChanged = tracking_domains_product_key_changed(
                    $existing['product_key'] ?? null,
                    $entry['product_key'] ?? null,
                    $entry['page_host']
                );
                $productLabelChanged = tracking_domains_product_label_changed(
                    $existing['product_label'] ?? null,
                    $entry['product_label'] ?? null
                );
                $platformChanged = ($existing['platform'] ?? 'clickbank') !== ($entry['platform'] ?? 'clickbank');
                $offerIdChanged = ($entry['offer_id'] ?? null) !== null
                    && tracking_domains_normalize_offer_id($existing['offer_id'] ?? null) !== $entry['offer_id'];
                if ($productKeyChanged || $productLabelChanged || $platformChanged || $offerIdChanged) {
                    $update->execute([
                        ':product_key' => $entry['product_key'] ?? ($existing['product_key'] ?? tracking_domains_default_product_key($entry['page_host'])),
                        ':product_label' => $entry['product_label'] ?? null,
                        ':platform' => $entry['platform'] ?? 'clickbank',
                        ':offer_platform' => $entry['platform'] ?? 'clickbank',
                        ':offer_id_is_set' => ($entry['offer_id'] ?? null) !== null ? 1 : 0,
                        ':offer_id' => $entry['offer_id'] ?? null,
                        ':product_key_changed' => $productKeyChanged ? 1 : 0,
                        ':page_host' => $entry['page_host'],
                    ]);
                    $updated[] = $entry['page_host'];
                } else {
                    $alreadyAllowed[] = $entry['page_host'];
                }
            }
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
    return ['added' => $added, 'updated' => $updated, 'already_allowed' => $alreadyAllowed];
}

function tracking_domains_product_label_changed($storedLabel, $requestedLabel): bool
{
    return $requestedLabel !== null && $storedLabel !== $requestedLabel;
}
