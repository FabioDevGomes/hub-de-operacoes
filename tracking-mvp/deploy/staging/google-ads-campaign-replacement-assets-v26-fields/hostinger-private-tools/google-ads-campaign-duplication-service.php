<?php
declare(strict_types=1);

/** Strict, explicit duplication of supported Search campaign graphs. */

function hub_google_ads_campaign_duplication_ids(array $payload, array $expectedKeys): array
{
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expectedKeys, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    if ($keys !== $expectedKeys || $managerId === null || $customerId === null) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    return [$managerId, $customerId];
}

function hub_google_ads_campaign_duplication_campaign_id(mixed $value): string
{
    if (!is_string($value) || preg_match('/^[1-9][0-9]{0,19}$/D', $value) !== 1) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    return $value;
}

function hub_google_ads_campaign_duplication_search(string $customerId, string $managerId, string $token, string $query): array
{
    return hub_google_ads_search($customerId, $query, $token, $managerId);
}

function hub_google_ads_campaign_duplication_validate_access(array $config, string $token, string $managerId, string $customerId): void
{
    hub_google_ads_campaign_creation_authorize($config, $token, $managerId, $customerId);
}

function hub_google_ads_campaign_duplication_user_list_refs(array $bundle): array
{
    $references = [];
    $add = static function (array $criterion) use (&$references): void {
        if (($criterion['type'] ?? null) !== 'USER_LIST') return;
        $resource = (string)($criterion['userList']['userList'] ?? '');
        if (preg_match('#^customers/([1-9][0-9]{9})/userLists/([1-9][0-9]{0,19})$#D', $resource, $matches) !== 1) {
            throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422);
        }
        $references[$resource] = ['resource_name' => $resource, 'list_id' => $matches[2]];
    };
    foreach ($bundle['campaign_criteria'] ?? [] as $criterion) $add($criterion);
    foreach ($bundle['ad_group_criteria'] ?? [] as $item) $add($item['criterion'] ?? []);
    if (count($references) > 100) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
    return $references;
}

function hub_google_ads_campaign_duplication_list(array $config, array $payload): array
{
    $associationLookup = array_key_exists('campaign_ids', $payload);
    $expectedKeys = ['customer_id', 'manager_customer_id', 'operation'];
    if ($associationLookup) $expectedKeys[] = 'campaign_ids';
    [$managerId, $customerId] = hub_google_ads_campaign_duplication_ids($payload, $expectedKeys);
    if (($payload['operation'] ?? null) !== 'campaign_duplication_list') throw new HubGoogleAdsApiException('invalid_payload', 400);
    $requestedIds = [];
    if ($associationLookup) {
        $rawIds = $payload['campaign_ids'];
        if (!is_array($rawIds) || array_values($rawIds) !== $rawIds || count($rawIds) < 1 || count($rawIds) > 100) throw new HubGoogleAdsApiException('invalid_payload', 400);
        foreach ($rawIds as $rawId) $requestedIds[] = hub_google_ads_campaign_duplication_campaign_id($rawId);
        if (count(array_unique($requestedIds)) !== count($requestedIds)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $token = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_duplication_validate_access($config, $token, $managerId, $customerId);
    $campaignIdFilter = $associationLookup
        ? ' AND campaign.id IN (' . implode(', ', array_map(static fn(string $id): string => "'" . $id . "'", $requestedIds)) . ')'
        : '';
    $rows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
        "SELECT customer.currency_code, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.audience_setting.use_audience_grouped FROM campaign WHERE campaign.status != 'REMOVED' AND campaign.advertising_channel_type = 'SEARCH'" . $campaignIdFilter . ' ORDER BY campaign.name LIMIT ' . ($associationLookup ? '101' : '1001'));
    if (count($rows) > ($associationLookup ? 100 : 1000)) throw new HubGoogleAdsApiException('campaign_duplication_source_limit', 422);
    $campaigns = [];
    foreach ($rows as $row) {
        $campaign = $row['campaign'] ?? null;
        if (!is_array($campaign)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $id = (string)($campaign['id'] ?? '');
        if (preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1 || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH') {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }
        $campaigns[] = [
            'campaign_id' => $id,
            'campaign_name' => (string)($campaign['name'] ?? ''),
            'status' => (string)($campaign['status'] ?? ''),
            'channel_type' => 'SEARCH',
            'currency_code' => (string)($row['customer']['currencyCode'] ?? ''),
        ];
        if ($associationLookup) {
            $campaigns[array_key_last($campaigns)]['audience_grouped'] = ($campaign['audienceSetting']['useAudienceGrouped'] ?? false) === true;
            $campaigns[array_key_last($campaigns)]['ad_group_count'] = 0;
        }
    }
    if ($associationLookup) {
        if (count($campaigns) !== count($requestedIds)) throw new HubGoogleAdsApiException('campaign_duplication_changed', 409);
        $idFilter = implode(', ', array_map(static fn(string $id): string => "'" . $id . "'", $requestedIds));
        $groupRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
            "SELECT campaign.id, ad_group.id, ad_group.status FROM ad_group WHERE campaign.id IN ($idFilter) AND ad_group.status != 'REMOVED' ORDER BY campaign.id, ad_group.id LIMIT 1001");
        if (count($groupRows) > 1000) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
        $campaignIndex = [];
        foreach ($campaigns as $index => $campaign) $campaignIndex[$campaign['campaign_id']] = $index;
        foreach ($groupRows as $groupRow) {
            $campaignId = (string)($groupRow['campaign']['id'] ?? '');
            $group = $groupRow['adGroup'] ?? null;
            if (!isset($campaignIndex[$campaignId]) || !is_array($group)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $groupId = (string)($group['id'] ?? '');
            if (preg_match('/^[1-9][0-9]{0,19}$/D', $groupId) !== 1) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $index = $campaignIndex[$campaignId];
            $campaigns[$index]['ad_group_count']++;
            if ($campaigns[$index]['ad_group_count'] === 1) {
                $campaigns[$index]['ad_group_id'] = $groupId;
                $campaigns[$index]['ad_group_status'] = (string)($group['status'] ?? '');
            } else {
                unset($campaigns[$index]['ad_group_id'], $campaigns[$index]['ad_group_status']);
            }
        }
    }
    return ['ok' => true, 'schema_version' => 1, 'operation' => 'campaign_duplication_list', 'campaigns' => array_values($campaigns)];
}

function hub_google_ads_campaign_duplication_query_bundle(string $managerId, string $customerId, string $campaignId, string $token, bool $allowUnverifiedAssetAutomation = false): array
{
    $quotedId = $campaignId;
    $rows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
        'SELECT customer.currency_code, customer.time_zone, campaign.id, campaign.name, campaign.status, campaign.experiment_type, campaign.advertising_channel_type, campaign.advertising_channel_sub_type, campaign.bidding_strategy_type, campaign.bidding_strategy, campaign.maximize_conversions.target_cpa_micros, campaign.ai_max_setting.enable_ai_max, campaign.ad_serving_optimization_status, campaign.keyword_match_type, campaign.start_date_time, campaign.end_date_time, campaign.audience_setting.use_audience_grouped, campaign.geo_target_type_setting.positive_geo_target_type, campaign.geo_target_type_setting.negative_geo_target_type, campaign.network_settings.target_google_search, campaign.network_settings.target_search_network, campaign.network_settings.target_content_network, campaign.network_settings.target_partner_search_network, campaign.contains_eu_political_advertising, campaign.tracking_url_template, campaign.final_url_suffix, campaign.url_custom_parameters, campaign_budget.amount_micros, campaign_budget.period, campaign_budget.explicitly_shared, campaign_budget.delivery_method FROM campaign WHERE campaign.id = ' . $quotedId . ' LIMIT 2');
    if (count($rows) !== 1 || !is_array($rows[0]['campaign'] ?? null) || !is_array($rows[0]['campaignBudget'] ?? null)) {
        throw new HubGoogleAdsApiException('campaign_not_found', 404);
    }
    $campaign = $rows[0]['campaign'];
    $budget = $rows[0]['campaignBudget'];
    if ((string)($campaign['id'] ?? '') !== $campaignId || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH') {
        throw new HubGoogleAdsApiException('campaign_duplication_source_changed', 409);
    }
    $bundle = [
        'campaign' => $campaign,
        'budget' => $budget,
        'currency_code' => (string)($rows[0]['customer']['currencyCode'] ?? ''),
        'customer_time_zone' => (string)($rows[0]['customer']['timeZone'] ?? ''),
        'ad_groups' => [], 'campaign_criteria' => [], 'ad_group_criteria' => [], 'ads' => [],
        'campaign_assets' => [], 'ad_group_assets' => [], 'shared_sets' => [], 'labels' => [],
        'campaign_asset_automation' => [], 'campaign_bid_modifiers' => [], 'ad_group_bid_modifiers' => [],
        'conversion_goal_config' => [], 'campaign_customizers' => [], 'ad_group_customizers' => [],
        'ad_group_labels' => [], 'ad_group_ad_labels' => [], 'ad_group_criterion_labels' => [], 'campaign_asset_sets' => [], 'ad_group_asset_sets' => [],
        'user_lists' => [], 'user_list_lookup_failed' => [], 'blockers' => [],
    ];
    $bundle['campaign_asset_automation_unverified'] = true;
    $campaignBidModifierRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
        "SELECT campaign_bid_modifier.resource_name FROM campaign_bid_modifier WHERE campaign.id = $quotedId LIMIT 101");
    if (count($campaignBidModifierRows) > 100) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
    $bundle['campaign_bid_modifiers'] = $campaignBidModifierRows;
    $groupRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
        "SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, ad_group.ad_rotation_mode, ad_group.ai_max_ad_group_setting.disable_search_term_matching, ad_group.cpc_bid_micros, ad_group.target_cpa_micros, ad_group.targeting_setting.target_restrictions, ad_group.tracking_url_template, ad_group.final_url_suffix, ad_group.url_custom_parameters FROM ad_group WHERE campaign.id = $quotedId AND ad_group.status != 'REMOVED' ORDER BY ad_group.id LIMIT 101");
    if (count($groupRows) > 100) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
    foreach ($groupRows as $row) {
        $group = $row['adGroup'] ?? null;
        $id = is_array($group) ? (string)($group['id'] ?? '') : '';
        if (!is_array($group) || preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $bundle['ad_groups'][$id] = $group;
    }
    $adGroupBidModifierRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
        "SELECT ad_group_bid_modifier.resource_name FROM ad_group_bid_modifier WHERE campaign.id = $quotedId LIMIT 101");
    if (count($adGroupBidModifierRows) > 100) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
    $bundle['ad_group_bid_modifiers'] = $adGroupBidModifierRows;
    if (!$bundle['ad_groups']) $bundle['blockers'][] = 'A campanha não possui grupos de anúncios ativos para copiar.';

    $criteriaFields = 'campaign_criterion.resource_name, campaign_criterion.type, campaign_criterion.status, campaign_criterion.negative, campaign_criterion.location.geo_target_constant, campaign_criterion.language.language_constant, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type, campaign_criterion.device.type, campaign_criterion.age_range.type, campaign_criterion.gender.type, campaign_criterion.parental_status.type, campaign_criterion.income_range.type, campaign_criterion.user_interest.user_interest_category, campaign_criterion.user_list.user_list, campaign_criterion.placement.url, campaign_criterion.topic.topic_constant';
    $criteriaRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
        "SELECT $criteriaFields FROM campaign_criterion WHERE campaign.id = $quotedId AND campaign_criterion.status != 'REMOVED' LIMIT 1001");
    if (count($criteriaRows) > 1000) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
    foreach ($criteriaRows as $row) {
        $criterion = $row['campaignCriterion'] ?? null;
        if (!is_array($criterion)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $bundle['campaign_criteria'][] = $criterion;
    }
    $sharedRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
        "SELECT campaign_shared_set.resource_name, campaign_shared_set.status, campaign_shared_set.shared_set FROM campaign_shared_set WHERE campaign.id = $quotedId AND campaign_shared_set.status != 'REMOVED' LIMIT 101");
    if (count($sharedRows) > 100) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
    $sharedLinksByResource = [];
    foreach ($sharedRows as $row) {
        $link = $row['campaignSharedSet'] ?? null;
        $sharedSetResource = is_array($link) ? (string)($link['sharedSet'] ?? '') : '';
        if (!is_array($link) || !preg_match('#^customers/[1-9][0-9]{9}/sharedSets/[1-9][0-9]{0,19}$#D', $sharedSetResource)) {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }
        $sharedLinksByResource[$sharedSetResource] = $link;
    }
    if ($sharedLinksByResource) {
        $resourceList = implode(', ', array_map('hub_google_ads_campaign_creation_gaql_string', array_keys($sharedLinksByResource)));
        $setRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
            "SELECT shared_set.resource_name, shared_set.name, shared_set.type, shared_set.status, shared_set.member_count FROM shared_set WHERE shared_set.resource_name IN ($resourceList) LIMIT 101");
        if (count($setRows) !== count($sharedLinksByResource)) throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422);
        $setsByResource = [];
        foreach ($setRows as $row) {
            $set = $row['sharedSet'] ?? null;
            $resource = is_array($set) ? (string)($set['resourceName'] ?? '') : '';
            if (!isset($sharedLinksByResource[$resource])) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $setsByResource[$resource] = $set;
        }
        $criteriaRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
            "SELECT shared_criterion.resource_name, shared_criterion.shared_set, shared_criterion.type, shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion WHERE shared_criterion.shared_set IN ($resourceList) LIMIT 1001");
        if (count($criteriaRows) > 1000) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
        $criteriaBySet = array_fill_keys(array_keys($sharedLinksByResource), []);
        foreach ($criteriaRows as $row) {
            $criterion = $row['sharedCriterion'] ?? null;
            $resource = is_array($criterion) ? (string)($criterion['sharedSet'] ?? '') : '';
            if (!isset($criteriaBySet[$resource])) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $criteriaBySet[$resource][] = $row;
        }
        foreach ($sharedLinksByResource as $resource => $link) {
            $bundle['shared_sets'][] = ['campaign_shared_set' => $link, 'shared_set' => $setsByResource[$resource], 'criteria' => $criteriaBySet[$resource]];
        }
    }
    $labelRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
        "SELECT campaign_label.resource_name, campaign_label.label FROM campaign_label WHERE campaign.id = $quotedId LIMIT 101");
    if (count($labelRows) > 100) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
    $bundle['labels'] = $labelRows;
    $goalRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
        "SELECT conversion_goal_campaign_config.resource_name, conversion_goal_campaign_config.goal_config_level, conversion_goal_campaign_config.custom_conversion_goal FROM conversion_goal_campaign_config WHERE campaign.id = $quotedId LIMIT 2");
    $bundle['conversion_goal_config'] = $goalRows;
    $customizerRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
        "SELECT campaign_customizer.resource_name FROM campaign_customizer WHERE campaign.id = $quotedId AND campaign_customizer.status != 'REMOVED' LIMIT 101");
    if (count($customizerRows) > 100) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
    $bundle['campaign_customizers'] = $customizerRows;

    $groupIds = array_keys($bundle['ad_groups']);
    $idSql = implode(', ', $groupIds);
    $adCriterionFields = 'ad_group_criterion.resource_name, ad_group_criterion.type, ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.user_interest.user_interest_category, ad_group_criterion.user_list.user_list, ad_group_criterion.age_range.type, ad_group_criterion.gender.type, ad_group_criterion.parental_status.type, ad_group_criterion.income_range.type, ad_group_criterion.placement.url, ad_group_criterion.topic.topic_constant, ad_group_criterion.final_urls, ad_group_criterion.final_mobile_urls, ad_group_criterion.tracking_url_template, ad_group_criterion.final_url_suffix, ad_group_criterion.url_custom_parameters';
    if ($idSql !== '') {
        $criterionRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
            "SELECT ad_group.id, $adCriterionFields FROM ad_group_criterion WHERE ad_group.id IN ($idSql) AND ad_group_criterion.status != 'REMOVED' ORDER BY ad_group.id LIMIT 2001");
        if (count($criterionRows) > 2000) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
        foreach ($criterionRows as $row) {
            $groupId = (string)($row['adGroup']['id'] ?? '');
            $criterion = $row['adGroupCriterion'] ?? null;
            if (!isset($bundle['ad_groups'][$groupId]) || !is_array($criterion)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $bundle['ad_group_criteria'][] = ['ad_group_id' => $groupId, 'criterion' => $criterion];
        }
        $groupCustomizerRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
            "SELECT ad_group.id, ad_group_customizer.resource_name FROM ad_group_customizer WHERE ad_group.id IN ($idSql) AND ad_group_customizer.status != 'REMOVED' LIMIT 101");
        if (count($groupCustomizerRows) > 100) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
        $bundle['ad_group_customizers'] = $groupCustomizerRows;
        $groupLabelRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
            "SELECT ad_group.id, ad_group_label.resource_name FROM ad_group_label WHERE ad_group.id IN ($idSql) LIMIT 101");
        if (count($groupLabelRows) > 100) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
        $bundle['ad_group_labels'] = $groupLabelRows;
        $criterionLabelRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
            "SELECT ad_group.id, ad_group_criterion_label.resource_name FROM ad_group_criterion_label WHERE ad_group.id IN ($idSql) LIMIT 1001");
        if (count($criterionLabelRows) > 1000) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
        $bundle['ad_group_criterion_labels'] = $criterionLabelRows;
        $adLabelRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
            "SELECT ad_group.id, ad_group_ad_label.resource_name FROM ad_group_ad_label WHERE ad_group.id IN ($idSql) LIMIT 501");
        if (count($adLabelRows) > 500) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
        $bundle['ad_group_ad_labels'] = $adLabelRows;
        $groupAssetSetRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
            "SELECT ad_group.id, ad_group_asset_set.resource_name FROM ad_group_asset_set WHERE ad_group.id IN ($idSql) AND ad_group_asset_set.status != 'REMOVED' LIMIT 101");
        if (count($groupAssetSetRows) > 100) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
        $bundle['ad_group_asset_sets'] = $groupAssetSetRows;
        $adRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
            "SELECT ad_group.id, ad_group_ad.status, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.final_mobile_urls, ad_group_ad.ad.tracking_url_template, ad_group_ad.ad.final_url_suffix, ad_group_ad.ad.url_custom_parameters, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2 FROM ad_group_ad WHERE ad_group.id IN ($idSql) AND ad_group_ad.status != 'REMOVED' ORDER BY ad_group.id, ad_group_ad.ad.id LIMIT 501");
        if (count($adRows) > 500) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
        foreach ($adRows as $row) {
            $groupId = (string)($row['adGroup']['id'] ?? '');
            $adGroupAd = $row['adGroupAd'] ?? null;
            if (!isset($bundle['ad_groups'][$groupId]) || !is_array($adGroupAd) || !is_array($adGroupAd['ad'] ?? null)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $bundle['ads'][] = ['ad_group_id' => $groupId, 'ad_group_ad' => $adGroupAd];
        }
        $assetFields = 'campaign_asset.resource_name, campaign_asset.field_type, campaign_asset.status, campaign_asset.asset, asset.type, asset.final_urls, asset.tracking_url_template, asset.final_url_suffix, asset.url_custom_parameters, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2, asset.sitelink_asset.start_date, asset.sitelink_asset.end_date, asset.callout_asset.callout_text, asset.structured_snippet_asset.header, asset.structured_snippet_asset.values, asset.promotion_asset.discount_modifier, asset.promotion_asset.percent_off, asset.promotion_asset.money_amount_off.amount_micros, asset.promotion_asset.money_amount_off.currency_code, asset.promotion_asset.promotion_target, asset.promotion_asset.occasion, asset.promotion_asset.redemption_start_date, asset.promotion_asset.redemption_end_date, asset.promotion_asset.orders_over_amount.amount_micros, asset.promotion_asset.orders_over_amount.currency_code, asset.promotion_asset.promotion_code, asset.promotion_asset.language_code';
        $assetRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
            "SELECT $assetFields FROM campaign_asset WHERE campaign.id = $quotedId AND campaign_asset.status != 'REMOVED' LIMIT 201");
        if (count($assetRows) > 200) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
        foreach ($assetRows as $row) {
            if (!is_array($row['campaignAsset'] ?? null) || !is_array($row['asset'] ?? null)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $bundle['campaign_assets'][] = ['campaign_asset' => $row['campaignAsset'], 'asset' => $row['asset']];
        }
        $campaignAssetSetRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
            "SELECT campaign_asset_set.resource_name FROM campaign_asset_set WHERE campaign.id = $quotedId AND campaign_asset_set.status != 'REMOVED' LIMIT 101");
        if (count($campaignAssetSetRows) > 100) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
        $bundle['campaign_asset_sets'] = $campaignAssetSetRows;
        $groupAssetRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
            "SELECT ad_group.id, ad_group_asset.resource_name, ad_group_asset.field_type, ad_group_asset.status, ad_group_asset.asset, asset.type, asset.final_urls, asset.tracking_url_template, asset.final_url_suffix, asset.url_custom_parameters, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2, asset.sitelink_asset.start_date, asset.sitelink_asset.end_date, asset.callout_asset.callout_text, asset.structured_snippet_asset.header, asset.structured_snippet_asset.values, asset.promotion_asset.discount_modifier, asset.promotion_asset.percent_off, asset.promotion_asset.money_amount_off.amount_micros, asset.promotion_asset.money_amount_off.currency_code, asset.promotion_asset.promotion_target, asset.promotion_asset.occasion, asset.promotion_asset.redemption_start_date, asset.promotion_asset.redemption_end_date, asset.promotion_asset.orders_over_amount.amount_micros, asset.promotion_asset.orders_over_amount.currency_code, asset.promotion_asset.promotion_code, asset.promotion_asset.language_code FROM ad_group_asset WHERE ad_group.id IN ($idSql) AND ad_group_asset.status != 'REMOVED' ORDER BY ad_group.id LIMIT 201");
        if (count($groupAssetRows) > 200) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
        foreach ($groupAssetRows as $row) {
            $groupId = (string)($row['adGroup']['id'] ?? '');
            if (!isset($bundle['ad_groups'][$groupId]) || !is_array($row['adGroupAsset'] ?? null) || !is_array($row['asset'] ?? null)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $bundle['ad_group_assets'][] = ['ad_group_id' => $groupId, 'ad_group_asset' => $row['adGroupAsset'], 'asset' => $row['asset']];
        }
    }

    $userListRefs = hub_google_ads_campaign_duplication_user_list_refs($bundle);
    if ($userListRefs) {
        $resourceList = implode(', ', array_map('hub_google_ads_campaign_creation_gaql_string', array_keys($userListRefs)));
        $userListRows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
            "SELECT user_list.id, user_list.resource_name, user_list.name, user_list.type, user_list.status, user_list.membership_status, user_list.eligible_for_search FROM user_list WHERE user_list.resource_name IN ($resourceList) LIMIT 101");
        $listsByResource = [];
        foreach ($userListRows as $row) {
            $userList = $row['userList'] ?? null;
            if (!is_array($userList)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $id = (string)($userList['id'] ?? '');
            $resource = (string)($userList['resourceName'] ?? '');
            if (!preg_match('/^[1-9][0-9]{0,19}$/D', $id) || !isset($userListRefs[$resource]) || isset($listsByResource[$resource])) {
                throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            }
            $listsByResource[$resource] = $userList;
        }
        foreach ($userListRefs as $resource => $reference) {
            if (isset($listsByResource[$resource])) $bundle['user_lists'][$resource] = $listsByResource[$resource];
            else $bundle['user_list_lookup_failed'][] = $resource;
        }
    }

    hub_google_ads_campaign_duplication_collect_blockers($bundle, $allowUnverifiedAssetAutomation);
    return $bundle;
}

function hub_google_ads_campaign_duplication_collect_blockers(array &$bundle, bool $allowUnverifiedAssetAutomation = false): void
{
    $campaign = $bundle['campaign'];
    $budget = $bundle['budget'];
    if (($campaign['biddingStrategy'] ?? '') !== '') $bundle['blockers'][] = 'A campanha usa uma estratégia de lance compartilhada; ela não pode ser transferida para outra conta com segurança.';
    if (($campaign['experimentType'] ?? null) !== 'BASE') $bundle['blockers'][] = 'A origem é uma campanha de rascunho, experimento ou tipo não identificado; só campanhas normais podem ser duplicadas.';
    if (($campaign['biddingStrategyType'] ?? null) !== 'MAXIMIZE_CONVERSIONS') $bundle['blockers'][] = 'A cópia de CPA exige estratégia Maximizar conversões; a estratégia desta campanha não recebe as faixas com segurança.';
    if (($campaign['aiMaxSetting']['enableAiMax'] ?? false) === true) $bundle['blockers'][] = 'A campanha usa AI Max para Pesquisa; a cópia fiel dessas configurações ainda não está disponível.';
    if ($bundle['campaign_asset_automation']) $bundle['blockers'][] = 'A campanha tem automações de assets configuradas. Elas ainda não podem ser reproduzidas com segurança na conta destino.';
    elseif (!empty($bundle['campaign_asset_automation_unverified']) && !$allowUnverifiedAssetAutomation) $bundle['blockers'][] = 'A API não permite consultar automações de assets nesta campanha. Verifique essas configurações manualmente antes de duplicar; o fluxo em lote permanece bloqueado.';
    if ($bundle['campaign_bid_modifiers'] || $bundle['ad_group_bid_modifiers']) $bundle['blockers'][] = 'A campanha tem ajustes de lance vinculados à campanha ou aos grupos. Eles ainda não podem ser copiados com segurança.';
    if (isset($campaign['adServingOptimizationStatus']) && !in_array($campaign['adServingOptimizationStatus'], ['UNSPECIFIED', 'CONVERSION_OPTIMIZE', 'OPTIMIZE', 'ROTATE', 'ROTATE_INDEFINITELY'], true)) $bundle['blockers'][] = 'A campanha usa um modo de rotação de anúncios que não pode ser preservado.';
    if (isset($campaign['keywordMatchType']) && !in_array($campaign['keywordMatchType'], ['UNSPECIFIED', 'BROAD'], true)) $bundle['blockers'][] = 'A campanha usa um modo de correspondência de palavras-chave desconhecido.';
    if (($budget['period'] ?? null) !== 'DAILY' || ($budget['explicitlyShared'] ?? null) !== false
        || preg_match('/^[1-9][0-9]{0,19}$/D', (string)($budget['amountMicros'] ?? '')) !== 1) {
        $bundle['blockers'][] = 'O orçamento de origem é compartilhado, não diário ou não pôde ser lido.';
    }
    if (($campaign['networkSettings']['targetGoogleSearch'] ?? null) !== true) $bundle['blockers'][] = 'A campanha de origem não está configurada para Pesquisa Google.';
    if (!in_array($campaign['advertisingChannelSubType'] ?? null, ['UNSPECIFIED', 'SEARCH_STANDARD'], true)) $bundle['blockers'][] = 'A campanha usa um subtipo de Pesquisa que esta cópia não preserva.';
    if (!in_array($campaign['containsEuPoliticalAdvertising'] ?? null, ['DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING', 'CONTAINS_EU_POLITICAL_ADVERTISING'], true)) $bundle['blockers'][] = 'A declaração de publicidade política da UE não pode ser preservada.';
    if (!preg_match('/^[A-Z]{3}$/D', $bundle['currency_code'])) $bundle['blockers'][] = 'Não foi possível confirmar a moeda da conta de origem.';
    foreach ($bundle['shared_sets'] as $shared) {
        $set = $shared['shared_set'] ?? [];
        $link = $shared['campaign_shared_set'] ?? [];
        if (($set['type'] ?? null) !== 'NEGATIVE_KEYWORDS' || ($set['status'] ?? null) !== 'ENABLED'
            || ($link['status'] ?? null) !== 'ENABLED') {
            $bundle['blockers'][] = 'A campanha usa uma lista compartilhada que não é uma lista ativa de palavras-chave negativas.';
            continue;
        }
        if ((int)($set['memberCount'] ?? -1) !== count($shared['criteria'] ?? [])) {
            $bundle['blockers'][] = 'Não foi possível ler todos os termos da lista compartilhada de palavras-chave negativas.';
            continue;
        }
        foreach ($shared['criteria'] as $criterionRow) {
            $criterion = $criterionRow['sharedCriterion'] ?? [];
            if (($criterion['type'] ?? null) !== 'KEYWORD'
                || trim((string)($criterion['keyword']['text'] ?? '')) === ''
                || !in_array($criterion['keyword']['matchType'] ?? null, ['BROAD', 'PHRASE', 'EXACT'], true)) {
                $bundle['blockers'][] = 'A lista compartilhada contém um critério que ainda não pode ser recriado com fidelidade.';
                break;
            }
        }
    }
    if ($bundle['labels']) $bundle['blockers'][] = 'A campanha tem rótulos vinculados que ainda não podem ser recriados na conta destino.';
    if (count($bundle['conversion_goal_config']) !== 1) $bundle['blockers'][] = 'Não foi possível confirmar a configuração de metas de conversão da campanha.';
    elseif (($bundle['conversion_goal_config'][0]['conversionGoalCampaignConfig']['goalConfigLevel'] ?? null) !== 'CUSTOMER'
        || !empty($bundle['conversion_goal_config'][0]['conversionGoalCampaignConfig']['customConversionGoal'])) {
        $bundle['blockers'][] = 'A campanha usa metas de conversão personalizadas. A cópia delas ainda não está disponível.';
    }
    if ($bundle['campaign_customizers'] || $bundle['ad_group_customizers']) $bundle['blockers'][] = 'A campanha usa personalizadores de anúncios vinculados, que ainda não podem ser recriados na conta destino.';
    if ($bundle['ad_group_labels'] || $bundle['ad_group_ad_labels'] || $bundle['ad_group_criterion_labels']) $bundle['blockers'][] = 'Grupos, anúncios ou critérios têm rótulos vinculados, que ainda não podem ser recriados na conta destino.';
    if ($bundle['campaign_asset_sets'] || $bundle['ad_group_asset_sets']) $bundle['blockers'][] = 'A campanha usa conjuntos de assets vinculados, que ainda não podem ser recriados na conta destino.';
    foreach ($bundle['ad_groups'] as $group) {
        if (($group['type'] ?? null) !== 'SEARCH_STANDARD') $bundle['blockers'][] = 'Há grupo de anúncios que não é Search padrão.';
        if (!in_array($group['status'] ?? null, ['ENABLED', 'PAUSED'], true)) $bundle['blockers'][] = 'Há grupo de anúncios em estado não copiável.';
        if (($group['aiMaxAdGroupSetting']['disableSearchTermMatching'] ?? false) === true) $bundle['blockers'][] = 'Há grupo com uma configuração de AI Max que esta cópia não preserva.';
        if (isset($group['adRotationMode']) && !in_array($group['adRotationMode'], ['UNSPECIFIED', 'OPTIMIZE', 'ROTATE'], true)) $bundle['blockers'][] = 'Há grupo com um modo de rotação de anúncios desconhecido.';
    }
    foreach ($bundle['campaign_criteria'] as $criterion) {
        $type = (string)($criterion['type'] ?? 'UNKNOWN');
        $supported = in_array($type, ['LOCATION', 'LANGUAGE', 'KEYWORD', 'DEVICE', 'AGE_RANGE', 'GENDER', 'PARENTAL_STATUS', 'INCOME_RANGE', 'USER_INTEREST', 'USER_LIST', 'PLACEMENT', 'TOPIC'], true);
        if ($type === 'USER_LIST') {
            $resource = (string)($criterion['userList']['userList'] ?? '');
            preg_match('#^customers/[1-9][0-9]{9}/userLists/([1-9][0-9]{0,19})$#D', $resource, $matches);
            $userList = $bundle['user_lists'][$resource] ?? null;
            if (!is_array($userList) || in_array($resource, $bundle['user_list_lookup_failed'], true)) {
                $bundle['blockers'][] = 'Não foi possível ler os dados do segmento de lista de usuários da campanha.';
            } elseif (($userList['status'] ?? null) !== 'ENABLED' || ($userList['membershipStatus'] ?? null) !== 'OPEN' || ($userList['eligibleForSearch'] ?? null) !== true) {
                $bundle['blockers'][] = 'O segmento de lista de usuários da campanha não está ativo e elegível para Pesquisa.';
            }
        }
        elseif (!$supported || ($type === 'KEYWORD' && ($criterion['negative'] ?? false) !== true)
            || ($type === 'USER_INTEREST' && !is_string($criterion['userInterest']['userInterestCategory'] ?? null))) {
            $bundle['blockers'][] = 'Critério de campanha não copiável sem perda: ' . $type . '.';
        }
    }
    foreach ($bundle['ad_group_criteria'] as $item) {
        $criterion = $item['criterion']; $type = (string)($criterion['type'] ?? 'UNKNOWN');
        if ($type === 'USER_LIST') {
            $resource = (string)($criterion['userList']['userList'] ?? '');
            preg_match('#^customers/[1-9][0-9]{9}/userLists/([1-9][0-9]{0,19})$#D', $resource, $matches);
            $userList = $bundle['user_lists'][$resource] ?? null;
            if (!is_array($userList) || in_array($resource, $bundle['user_list_lookup_failed'], true)) {
                $bundle['blockers'][] = 'Não foi possível ler os dados do segmento de lista de usuários do grupo.';
            } elseif (($userList['status'] ?? null) !== 'ENABLED' || ($userList['membershipStatus'] ?? null) !== 'OPEN' || ($userList['eligibleForSearch'] ?? null) !== true) {
                $bundle['blockers'][] = 'O segmento de lista de usuários do grupo não está ativo e elegível para Pesquisa.';
            }
        }
        elseif (!in_array($type, ['KEYWORD', 'AGE_RANGE', 'GENDER', 'PARENTAL_STATUS', 'INCOME_RANGE', 'USER_INTEREST', 'USER_LIST', 'PLACEMENT', 'TOPIC'], true)
            || ($type === 'USER_INTEREST' && !is_string($criterion['userInterest']['userInterestCategory'] ?? null))) {
            $bundle['blockers'][] = 'Critério de grupo não copiável para outra conta sem perda: ' . $type . '.';
        }
    }
    if (!$bundle['ads']) $bundle['blockers'][] = 'A campanha não tem anúncios ativos para copiar.';
    foreach ($bundle['ads'] as $entry) {
        $ad = $entry['ad_group_ad'];
        $resource = $ad['ad'] ?? [];
        if (($resource['type'] ?? null) !== 'RESPONSIVE_SEARCH_AD' || !is_array($resource['responsiveSearchAd']['headlines'] ?? null)
            || !is_array($resource['responsiveSearchAd']['descriptions'] ?? null) || !in_array($ad['status'] ?? null, ['ENABLED', 'PAUSED'], true)) {
            $bundle['blockers'][] = 'Há anúncio que não é RSA compatível ou está em estado não copiável.';
        }
        if (!is_array($resource['finalUrls'] ?? null) || !$resource['finalUrls']) $bundle['blockers'][] = 'Há RSA sem URL final para substituir pela Pre-Sell de destino.';
    }
    foreach ($bundle['ad_group_criteria'] as $item) {
        $criterion = $item['criterion'];
        if (($criterion['type'] ?? null) === 'KEYWORD') {
            foreach (['finalUrls', 'finalMobileUrls'] as $field) if (!is_array($criterion[$field] ?? [])) $bundle['blockers'][] = 'A palavra-chave tem URLs que não puderam ser lidas.';
        }
    }
    foreach (array_merge($bundle['campaign_assets'], $bundle['ad_group_assets']) as $entry) {
        $asset = $entry['asset']; $type = (string)($asset['type'] ?? 'UNKNOWN');
        if (!in_array($type, ['SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET', 'PROMOTION'], true)) {
            $bundle['blockers'][] = 'Asset vinculado não suportado para cópia fiel: ' . $type . '.'; continue;
        }
        $linkage = $entry['campaign_asset'] ?? $entry['ad_group_asset'] ?? [];
        if (!in_array($linkage['status'] ?? null, ['ENABLED', 'PAUSED'], true)) $bundle['blockers'][] = 'Asset vinculado com estado não copiável.';
        if ($type === 'SITELINK' && trim((string)($asset['sitelinkAsset']['linkText'] ?? '')) === '') $bundle['blockers'][] = 'Sitelink sem texto legível para recriar.';
        if ($type === 'CALLOUT' && trim((string)($asset['calloutAsset']['calloutText'] ?? '')) === '') $bundle['blockers'][] = 'Frase de destaque incompleta para recriar.';
        if ($type === 'STRUCTURED_SNIPPET' && (trim((string)($asset['structuredSnippetAsset']['header'] ?? '')) === '' || empty($asset['structuredSnippetAsset']['values']))) $bundle['blockers'][] = 'Snippet estruturado incompleto para recriar.';
        if ($type === 'PROMOTION' && (trim((string)($asset['promotionAsset']['promotionTarget'] ?? '')) === '' || trim((string)($asset['promotionAsset']['languageCode'] ?? '')) === '')) $bundle['blockers'][] = 'Recurso de promoção incompleto para recriar.';
        if ($type === 'SITELINK') {
            $urls = $asset['finalUrls'] ?? [];
            if (!is_array($urls) || count($urls) !== 1 || preg_match('/#([1-6])$/D', (string)($urls[0] ?? ''), $matches) !== 1) {
                $bundle['blockers'][] = 'Sitelink sem âncora #1 a #6; corrija a URL de origem antes de duplicar.';
            }
        }
    }
    $bundle['blockers'] = array_values(array_unique($bundle['blockers']));
}

function hub_google_ads_campaign_duplication_user_list_map_for_target(array $bundle, string $managerId, string $targetCustomerId, string $token): array
{
    $references = hub_google_ads_campaign_duplication_user_list_refs($bundle);
    if (!$references) return [];
    $listIds = array_values(array_unique(array_map(static fn(array $reference): string => $reference['list_id'], $references)));
    $idList = implode(', ', $listIds);
    $rows = hub_google_ads_campaign_duplication_search($targetCustomerId, $managerId, $token,
        "SELECT user_list.id, user_list.resource_name, user_list.name, user_list.type, user_list.status, user_list.membership_status, user_list.eligible_for_search, user_list.access_reason, user_list.account_user_list_status FROM user_list WHERE user_list.id IN ($idList) LIMIT 101");
    $listsById = [];
    foreach ($rows as $row) {
        $userList = $row['userList'] ?? null;
        if (!is_array($userList)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $id = (string)($userList['id'] ?? '');
        $resource = (string)($userList['resourceName'] ?? '');
        if (!in_array($id, $listIds, true)
            || preg_match('#^customers/[1-9][0-9]{9}/userLists/' . preg_quote($id, '#') . '$#D', $resource) !== 1) {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }
        $listsById[$id][] = $userList;
    }
    $resourceMap = [];
    foreach ($references as $sourceResource => $reference) {
        $id = $reference['list_id'];
        $sourceList = $bundle['user_lists'][$sourceResource] ?? null;
        $matches = [];
        foreach ($listsById[$id] ?? [] as $targetList) {
            if (!is_array($sourceList) || (string)($sourceList['name'] ?? '') === ''
                || ($sourceList['name'] ?? null) !== ($targetList['name'] ?? null)
                || ($sourceList['type'] ?? null) !== ($targetList['type'] ?? null)
                || ($targetList['status'] ?? null) !== 'ENABLED' || ($targetList['membershipStatus'] ?? null) !== 'OPEN'
                || ($targetList['eligibleForSearch'] ?? null) !== true || ($targetList['accountUserListStatus'] ?? null) !== 'ENABLED'
                || !in_array($targetList['accessReason'] ?? null, ['AFFILIATED', 'LICENSED', 'SHARED', 'SUBSCRIBED'], true)) continue;
            $matches[] = $targetList;
        }
        if (!is_array($sourceList) || count($matches) !== 1) {
            throw new HubGoogleAdsApiException('campaign_duplication_audience_unavailable', 422);
        }
        $resourceMap[$sourceResource] = (string)$matches[0]['resourceName'];
    }
    ksort($resourceMap, SORT_STRING);
    return $resourceMap;
}

function hub_google_ads_campaign_duplication_public_inspection(array $bundle, string $campaignId): array
{
    $campaign = $bundle['campaign'];
    $sitelinks = [];
    foreach (array_merge($bundle['campaign_assets'], $bundle['ad_group_assets']) as $entry) {
        if (($entry['asset']['type'] ?? null) !== 'SITELINK') continue;
        $asset = $entry['asset']; $urls = $asset['finalUrls'] ?? [];
        $url = is_array($urls) && count($urls) === 1 ? (string)$urls[0] : '';
        $supported = preg_match('/#([1-6])$/D', $url, $matches) === 1;
        $sitelinks[] = ['text' => (string)($asset['sitelinkAsset']['linkText'] ?? ''), 'source_url' => $url,
            'supported' => $supported, 'reason' => $supported ? '' : 'O sitelink não termina em #1 a #6.'];
    }
    return ['ok' => true, 'schema_version' => 1, 'operation' => 'campaign_duplication_inspect', 'campaign_id' => $campaignId,
        'source' => ['campaign_name' => (string)($campaign['name'] ?? ''), 'status' => (string)($campaign['status'] ?? ''), 'currency_code' => $bundle['currency_code']],
        'resources' => ['campaign_criteria' => count($bundle['campaign_criteria']), 'ad_groups' => count($bundle['ad_groups']),
            'ad_group_criteria' => count($bundle['ad_group_criteria']), 'ads' => count($bundle['ads']),
            'campaign_assets' => count($bundle['campaign_assets']), 'ad_group_assets' => count($bundle['ad_group_assets']),
            'campaign_asset_automation' => count($bundle['campaign_asset_automation']), 'campaign_bid_modifiers' => count($bundle['campaign_bid_modifiers']),
            'ad_group_bid_modifiers' => count($bundle['ad_group_bid_modifiers']),
            'shared_exclusion_lists' => count($bundle['shared_sets']), 'campaign_labels' => count($bundle['labels']),
            'shared_negative_keywords' => array_sum(array_map(static fn(array $shared): int => count($shared['criteria'] ?? []), $bundle['shared_sets'])),
            'audience_user_lists' => count(hub_google_ads_campaign_duplication_user_list_refs($bundle)),
            'conversion_goal_config' => count($bundle['conversion_goal_config']), 'campaign_customizers' => count($bundle['campaign_customizers']),
            'ad_group_customizers' => count($bundle['ad_group_customizers']), 'ad_group_labels' => count($bundle['ad_group_labels']),
            'ad_group_ad_labels' => count($bundle['ad_group_ad_labels']), 'ad_group_criterion_labels' => count($bundle['ad_group_criterion_labels']),
            'campaign_asset_sets' => count($bundle['campaign_asset_sets']),
            'ad_group_asset_sets' => count($bundle['ad_group_asset_sets'])],
        'blockers' => $bundle['blockers'], 'copyable' => !$bundle['blockers'], 'sitelinks' => $sitelinks,
        'source_version' => hash('sha256', json_encode($bundle, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE))];
}

function hub_google_ads_campaign_duplication_inspect(array $config, array $payload): array
{
    [$managerId, $customerId] = hub_google_ads_campaign_duplication_ids($payload, ['campaign_id', 'customer_id', 'manager_customer_id', 'operation']);
    if (($payload['operation'] ?? null) !== 'campaign_duplication_inspect') throw new HubGoogleAdsApiException('invalid_payload', 400);
    $campaignId = hub_google_ads_campaign_duplication_campaign_id($payload['campaign_id'] ?? null);
    $token = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_duplication_validate_access($config, $token, $managerId, $customerId);
    return hub_google_ads_campaign_duplication_public_inspection(
        hub_google_ads_campaign_duplication_query_bundle($managerId, $customerId, $campaignId, $token), $campaignId);
}

function hub_google_ads_campaign_duplication_parse_name(string $name): ?array
{
    if (preg_match('/^(?<date>\d{1,2}\/\d{1,2})\s*-\s*(?<product>.+?)\s+(?<iteration>\d{1,3})(?<iteration_variant>B?)\s+\((?<tags>[^)]+)\)\s+(?<percent>\d{1,3}(?:[.,]\d+)?)%\s*-\s*(?<currency>US\$|U\$|USD|R\$|BRL|C\$|CAD|A\$|AUD|€|EUR|£|GBP)\s*(?<commission>\d+(?:[.,]\d+)?)$/iuD', trim($name), $m) !== 1) return null;
    $currency = strtoupper($m['currency']);
    $currency = match ($currency) { 'U$', 'US$' => 'USD', 'R$' => 'BRL', 'C$' => 'CAD', 'A$' => 'AUD', '€' => 'EUR', '£' => 'GBP', default => $currency };
    $tags = explode('-', $m['tags']);
    return ['date' => $m['date'], 'product' => hub_google_ads_campaign_creation_lower(trim($m['product'])), 'iteration' => (int)$m['iteration'], 'iteration_variant' => strtoupper((string)($m['iteration_variant'] ?? '')),
        'width' => strlen($m['iteration']), 'platform' => strtoupper(trim($tags[0] ?? '')), 'model' => strtoupper(trim($tags[1] ?? '')),
        'currency' => $currency, 'commission' => (float)str_replace(',', '.', $m['commission']),
        'commission_text' => $m['commission'], 'tags' => $m['tags'], 'percent' => $m['percent']];
}

function hub_google_ads_campaign_duplication_identity(array $parsed): string
{
    return implode('|', [$parsed['date'], $parsed['product'], $parsed['platform'], $parsed['model'], $parsed['currency'], number_format($parsed['commission'], 6, '.', '')]);
}

function hub_google_ads_campaign_duplication_format_name(array $source, int $iteration, int $percent): string
{
    $commission = $source['commission_text'];
    return $source['date'] . ' - ' . $source['product_display'] . ' ' . str_pad((string)$iteration, max(2, $source['width']), '0', STR_PAD_LEFT)
        . ' (' . $source['tags'] . ') ' . $percent . '% - ' . $source['currency_display'] . ' ' . $commission;
}

function hub_google_ads_campaign_duplication_source_name(string $name): array
{
    $parsed = hub_google_ads_campaign_duplication_parse_name($name);
    if ($parsed === null || $parsed['iteration'] < 1 || $parsed['commission'] <= 0) throw new HubGoogleAdsApiException('campaign_duplication_name_invalid', 422);
    preg_match('/^\d{1,2}\/\d{1,2}\s*-\s*(.+?)\s+\d{1,3}B?\s+\(/iu', trim($name), $m);
    $parsed['product_display'] = (string)($m[1] ?? '');
    $parsed['currency_display'] = (string)(preg_match('/\s*-\s*(US\$|U\$|USD|R\$|BRL|C\$|CAD|A\$|AUD|€|EUR|£|GBP)\s*\d/u', $name, $currencyMatch) ? $currencyMatch[1] : '');
    return $parsed;
}

function hub_google_ads_campaign_duplication_target_rows(array $targets): array
{
    if (!is_array($targets) || !array_is_list($targets) || count($targets) < 1 || count($targets) > 20) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $seen = []; $normalized = [];
    foreach ($targets as $target) {
        if (!is_array($target)) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $keys = array_keys($target); sort($keys, SORT_STRING);
        if ($keys !== ['customer_id', 'currency_code', 'manager_customer_id', 'name', 'pre_sell_url']) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $managerId = hub_google_ads_valid_customer_id($target['manager_customer_id'] ?? null);
        $customerId = hub_google_ads_valid_customer_id($target['customer_id'] ?? null);
        $url = $target['pre_sell_url'] ?? null;
        if ($managerId === null || $customerId === null || !is_string($url) || strlen($url) > 2048 || preg_match('/[\x00-\x20\x7F]/', $url) === 1) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $parts = parse_url($url);
        if (!is_array($parts) || strtolower((string)($parts['scheme'] ?? '')) !== 'https' || !is_string($parts['host'] ?? null)
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])) throw new HubGoogleAdsApiException('campaign_duplication_url_invalid', 422);
        $url = rtrim($url, '/'); if ($url === '') $url = 'https://' . $parts['host'];
        $key = $customerId;
        if (isset($seen[$key])) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $seen[$key] = true;
        $name = $target['name'] ?? '';
        if (!is_string($name) || strlen($name) > 160 || preg_match('/[\x00-\x1F\x7F]/', $name) === 1) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $normalized[] = ['manager_id' => $managerId, 'customer_id' => $customerId, 'name' => trim($name), 'pre_sell_url' => $url, 'target' => true];
    }
    return $normalized;
}

function hub_google_ads_campaign_duplication_sequence_account_rows(mixed $accounts, array $targets, string $sourceManagerId, string $sourceCustomerId): array
{
    if (!is_array($accounts) || !array_is_list($accounts) || count($accounts) > 21) {
        throw new HubGoogleAdsApiException('campaign_duplication_sequence_too_large', 422);
    }
    $allowed = [];
    $addAllowed = static function (string $managerId, string $customerId) use (&$allowed): void {
        $allowed[$managerId . ':' . $customerId] = ['manager_id' => $managerId, 'customer_id' => $customerId];
    };
    $addAllowed($sourceManagerId, $sourceCustomerId);
    foreach ($targets as $target) $addAllowed($target['manager_id'], $target['customer_id']);

    $provided = [];
    $addProvided = static function (mixed $account) use (&$provided, $allowed): void {
        if (!is_array($account)) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $keys = array_keys($account); sort($keys, SORT_STRING);
        if ($keys !== ['customer_id', 'manager_customer_id']) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $managerId = hub_google_ads_valid_customer_id($account['manager_customer_id'] ?? null);
        $customerId = hub_google_ads_valid_customer_id($account['customer_id'] ?? null);
        if ($managerId === null || $customerId === null) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $key = $managerId . ':' . $customerId;
        if (!isset($allowed[$key]) || isset($provided[$key])) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $provided[$key] = true;
    };
    foreach ($accounts as $account) $addProvided($account);
    if (count($provided) !== count($allowed)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    return array_values($allowed);
}

function hub_google_ads_campaign_duplication_existing_names(string $managerId, string $customerId, string $token): array
{
    $rows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
        "SELECT campaign.name FROM campaign WHERE campaign.status != 'REMOVED' AND campaign.advertising_channel_type = 'SEARCH' LIMIT 1001");
    if (count($rows) > 1000) throw new HubGoogleAdsApiException('campaign_duplication_sequence_unavailable', 422);
    return array_values(array_filter(array_map(static fn(array $row): string => (string)($row['campaign']['name'] ?? ''), $rows)));
}

function hub_google_ads_campaign_duplication_source_url_hosts(array $bundle): array
{
    $urls = [];
    $add = static function (mixed $values) use (&$urls): void {
        if (!is_array($values)) return;
        foreach ($values as $value) if (is_string($value) && $value !== '') $urls[] = explode('#', $value, 2)[0];
    };
    foreach ($bundle['ads'] as $entry) {
        $ad = $entry['ad_group_ad']['ad'] ?? [];
        $add($ad['finalUrls'] ?? null); $add($ad['finalMobileUrls'] ?? null);
    }
    foreach ($bundle['ad_group_criteria'] as $entry) {
        $criterion = $entry['criterion'] ?? [];
        $add($criterion['finalUrls'] ?? null); $add($criterion['finalMobileUrls'] ?? null);
    }
    foreach (array_merge($bundle['campaign_assets'], $bundle['ad_group_assets']) as $entry) {
        $asset = $entry['asset'] ?? [];
        $add($asset['finalUrls'] ?? null); $add($asset['finalMobileUrls'] ?? null);
    }
    $hosts = [];
    foreach ($urls as $url) {
        $parts = parse_url($url);
        if (is_array($parts) && in_array(strtolower((string)($parts['scheme'] ?? '')), ['http', 'https'], true)
            && is_string($parts['host'] ?? null)) $hosts[strtolower($parts['host'])] = true;
    }
    return array_keys($hosts);
}

function hub_google_ads_campaign_duplication_rewrite_url_metadata(mixed $value, string $preSellUrl, array $sourceHosts, string $key = '', bool $insideMetadata = false): mixed
{
    $metadataKeys = ['trackingUrlTemplate', 'finalUrlSuffix', 'urlCustomParameters'];
    $insideMetadata = $insideMetadata || in_array($key, $metadataKeys, true);
    if (is_array($value)) {
        foreach ($value as $childKey => $child) $value[$childKey] = hub_google_ads_campaign_duplication_rewrite_url_metadata($child, $preSellUrl, $sourceHosts, (string)$childKey, $insideMetadata);
        return $value;
    }
    if (!is_string($value) || !$insideMetadata) return $value;
    foreach ($sourceHosts as $host) {
        $host = strtolower((string)$host);
        if ($host === '') continue;

        // Replace the complete old landing URL (origin, path, query and fragment),
        // not just its host. Appending the old path to a Pre-Sell URL that already
        // has a path or query can create a broken destination.
        $plainPattern = '~https?://' . preg_quote($host, '~') . '(?::[0-9]+)?(?:/[^\s"\'<>),;\]}]*)?~i';
        $value = preg_replace_callback($plainPattern, static fn(array $match): string => $preSellUrl, $value) ?? $value;

        // Tracking metadata may percent-encode a nested destination URL. In that
        // form, replace the encoded URL as one unit while leaving outer parameters
        // (introduced by a literal ampersand) intact.
        $encodedHost = preg_quote(rawurlencode($host), '~');
        $encodedPattern = '~https?%3a%2f%2f' . $encodedHost . '(?:%3a[0-9]+)?(?:(?:%2f|%3f|%23)[^&\s"\'<>),;\]}]*)?~i';
        $encodedTarget = rawurlencode($preSellUrl);
        $value = preg_replace_callback($encodedPattern, static fn(array $match): string => $encodedTarget, $value) ?? $value;
    }
    return $value;
}

function hub_google_ads_campaign_duplication_has_old_url_host_in_metadata(array $bundle, array $sourceHosts, string $preSellUrl): bool
{
    $targetHost = strtolower((string)(parse_url($preSellUrl, PHP_URL_HOST) ?: ''));
    $oldHosts = array_values(array_filter(array_map('strtolower', $sourceHosts), static fn(string $host): bool => $host !== '' && $host !== $targetHost));
    if (!$oldHosts) return false;
    $scan = static function (mixed $value, string $key = '', bool $insideMetadata = false) use (&$scan, $oldHosts): bool {
        $metadataKeys = ['trackingUrlTemplate', 'finalUrlSuffix', 'urlCustomParameters'];
        $insideMetadata = $insideMetadata || in_array($key, $metadataKeys, true);
        if (is_array($value)) {
            foreach ($value as $childKey => $child) if ($scan($child, (string)$childKey, $insideMetadata)) return true;
            return false;
        }
        if (!is_string($value) || !$insideMetadata) return false;
        foreach ($oldHosts as $host) {
            $plainPattern = '~https?://' . preg_quote($host, '~') . '(?::[0-9]+)?(?=$|[/:?#\s"\'<>),;\]}])~i';
            $encodedPattern = '~https?%3a%2f%2f' . preg_quote(rawurlencode($host), '~') . '(?:%3a[0-9]+)?(?=$|%2f|%3f|%23|[&\s"\'<>),;\]}])~i';
            if (preg_match($plainPattern, $value) === 1 || preg_match($encodedPattern, $value) === 1) return true;
        }
        return false;
    };
    foreach ([$bundle['campaign'], $bundle['ad_groups'], $bundle['campaign_criteria'], $bundle['ad_group_criteria'], $bundle['ads'], $bundle['campaign_assets'], $bundle['ad_group_assets']] as $resource) {
        if ($scan($resource)) return true;
    }
    return false;
}

function hub_google_ads_campaign_duplication_asset_create(array $entry, string $customerId, string $campaignRef, array $groupMap, array &$operations, int &$assetNumber, array $sourceHosts, bool $preserveUrls = false): void
{
    $asset = $entry['asset']; $linkage = $entry['campaign_asset'] ?? $entry['ad_group_asset'];
    $type = (string)($asset['type'] ?? '');
    $assetNumber--; $assetRef = 'customers/' . $customerId . '/assets/' . $assetNumber;
    $create = [];
    if ($type === 'SITELINK') {
        $urls = $asset['finalUrls'] ?? []; $url = (string)($urls[0] ?? '');
        if (preg_match('/#([1-6])$/D', $url, $m) !== 1) throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422);
        $create = ['sitelinkAsset' => ['linkText' => (string)$asset['sitelinkAsset']['linkText']]];
        foreach (['description1' => 'description1', 'description2' => 'description2'] as $key => $out) if (is_string($asset['sitelinkAsset'][$key] ?? null) && $asset['sitelinkAsset'][$key] !== '') $create['sitelinkAsset'][$out] = $asset['sitelinkAsset'][$key];
        foreach (['startDate' => 'startDate', 'endDate' => 'endDate'] as $key => $out) if (is_string($asset['sitelinkAsset'][$key] ?? null) && $asset['sitelinkAsset'][$key] !== '') $create['sitelinkAsset'][$out] = $asset['sitelinkAsset'][$key];
        $create['finalUrls'] = $preserveUrls ? array_values($urls) : [rtrim($entry['pre_sell_url'], '/') . '#' . $m[1]];
        if ($preserveUrls && !empty($asset['finalMobileUrls'])) $create['finalMobileUrls'] = array_values($asset['finalMobileUrls']);
    } elseif ($type === 'CALLOUT') $create = ['calloutAsset' => ['calloutText' => (string)$asset['calloutAsset']['calloutText']]];
    elseif ($type === 'STRUCTURED_SNIPPET') $create = ['structuredSnippetAsset' => ['header' => (string)$asset['structuredSnippetAsset']['header'], 'values' => array_values($asset['structuredSnippetAsset']['values'] ?? [])]];
    elseif ($type === 'PROMOTION') {
        $promotion = $asset['promotionAsset'] ?? [];
        $create['promotionAsset'] = [];
        foreach (['discountModifier', 'percentOff', 'promotionTarget', 'occasion', 'redemptionStartDate', 'redemptionEndDate', 'promotionCode', 'languageCode'] as $field) {
            if (array_key_exists($field, $promotion) && $promotion[$field] !== '' && $promotion[$field] !== null) $create['promotionAsset'][$field] = $promotion[$field];
        }
        foreach (['moneyAmountOff', 'ordersOverAmount'] as $field) {
            if (is_array($promotion[$field] ?? null)) $create['promotionAsset'][$field] = $promotion[$field];
        }
        $create['finalUrls'] = $preserveUrls ? array_values($asset['finalUrls'] ?? []) : [$entry['pre_sell_url']];
        if ($preserveUrls && !empty($asset['finalMobileUrls'])) $create['finalMobileUrls'] = array_values($asset['finalMobileUrls']);
    } else throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422);
    foreach (['trackingUrlTemplate' => 'trackingUrlTemplate', 'finalUrlSuffix' => 'finalUrlSuffix', 'urlCustomParameters' => 'urlCustomParameters'] as $source => $target) {
        if (isset($asset[$source]) && $asset[$source] !== '' && $asset[$source] !== []) $create[$target] = $asset[$source];
    }
    if (!$preserveUrls) $create = hub_google_ads_campaign_duplication_rewrite_url_metadata($create, (string)$entry['pre_sell_url'], $sourceHosts);
    $operations[] = ['assetOperation' => ['create' => ['resourceName' => $assetRef] + $create]];
    if (isset($entry['campaign_asset'])) {
        $operations[] = ['campaignAssetOperation' => ['create' => ['campaign' => $campaignRef, 'asset' => $assetRef, 'fieldType' => (string)$linkage['fieldType'], 'status' => (string)$linkage['status']]]];
    } else {
        $groupId = (string)$entry['ad_group_id'];
        $operations[] = ['adGroupAssetOperation' => ['create' => ['adGroup' => $groupMap[$groupId], 'asset' => $assetRef, 'fieldType' => (string)$linkage['fieldType'], 'status' => (string)$linkage['status']]]];
    }
}

function hub_google_ads_campaign_duplication_criterion_create(array $criterion, string $resourceKey, string $parentRef, string $customerId, string $preSellUrl, array $sourceHosts, array $userListResourceMap = [], bool $preserveUrls = false): array
{
    $type = (string)($criterion['type'] ?? '');
    $status = (string)($criterion['status'] ?? '');
    if (!in_array($status, ['ENABLED', 'PAUSED'], true)) throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422);
    $create = ['status' => $status, 'negative' => ($criterion['negative'] ?? false) === true];
    if ($type === 'LOCATION') $create['location'] = ['geoTargetConstant' => (string)$criterion['location']['geoTargetConstant']];
    elseif ($type === 'LANGUAGE') $create['language'] = ['languageConstant' => (string)$criterion['language']['languageConstant']];
    elseif ($type === 'KEYWORD') {
        $create['keyword'] = ['text' => (string)$criterion['keyword']['text'], 'matchType' => (string)$criterion['keyword']['matchType']];
        if (!empty($criterion['finalUrls'])) $create['finalUrls'] = $preserveUrls ? array_values($criterion['finalUrls']) : [$preSellUrl];
        if (!empty($criterion['finalMobileUrls'])) $create['finalMobileUrls'] = $preserveUrls ? array_values($criterion['finalMobileUrls']) : [$preSellUrl];
        foreach (['trackingUrlTemplate' => 'trackingUrlTemplate', 'finalUrlSuffix' => 'finalUrlSuffix', 'urlCustomParameters' => 'urlCustomParameters'] as $source => $target) if (isset($criterion[$source]) && $criterion[$source] !== '' && $criterion[$source] !== []) $create[$target] = $criterion[$source];
    }
    elseif ($type === 'DEVICE') $create['device'] = ['type' => (string)$criterion['device']['type']];
    elseif ($type === 'AGE_RANGE') $create['ageRange'] = ['type' => (string)$criterion['ageRange']['type']];
    elseif ($type === 'GENDER') $create['gender'] = ['type' => (string)$criterion['gender']['type']];
    elseif ($type === 'PARENTAL_STATUS') $create['parentalStatus'] = ['type' => (string)$criterion['parentalStatus']['type']];
    elseif ($type === 'INCOME_RANGE') $create['incomeRange'] = ['type' => (string)$criterion['incomeRange']['type']];
    elseif ($type === 'USER_INTEREST') {
        $sourceResource = (string)$criterion['userInterest']['userInterestCategory'];
        if (preg_match('#^customers/[1-9][0-9]{9}/userInterests/([1-9][0-9]{0,19})$#D', $sourceResource, $matches) !== 1) throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422);
        $create['userInterest'] = ['userInterestCategory' => 'customers/' . $customerId . '/userInterests/' . $matches[1]];
    }
    elseif ($type === 'USER_LIST') {
        $sourceResource = (string)($criterion['userList']['userList'] ?? '');
        $targetResource = $userListResourceMap[$sourceResource] ?? null;
        if (!is_string($targetResource) || $targetResource === '') throw new HubGoogleAdsApiException('campaign_duplication_audience_unavailable', 422);
        $create['userList'] = ['userList' => $targetResource];
    }
    elseif ($type === 'PLACEMENT') {
        $placementUrl = trim((string)($criterion['placement']['url'] ?? ''));
        if ($placementUrl === '') throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422);
        $create['placement'] = ['url' => $placementUrl];
    }
    elseif ($type === 'TOPIC') {
        $topicConstant = (string)($criterion['topic']['topicConstant'] ?? '');
        if (preg_match('#^topicConstants/[1-9][0-9]*$#D', $topicConstant) !== 1) {
            throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422);
        }
        $create['topic'] = ['topicConstant' => $topicConstant];
    }
    else throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422);
    if (!$preserveUrls) $create = hub_google_ads_campaign_duplication_rewrite_url_metadata($create, $preSellUrl, $sourceHosts);
    $create[$resourceKey] = $parentRef;
    return $resourceKey === 'campaign' ? ['campaignCriterionOperation' => ['create' => $create]] : ['adGroupCriterionOperation' => ['create' => $create]];
}

function hub_google_ads_campaign_duplication_shared_set_fingerprint(array $bundle): array
{
    $fingerprints = [];
    foreach ($bundle['shared_sets'] ?? [] as $shared) {
        $criteria = [];
        foreach ($shared['criteria'] ?? [] as $row) {
            $criterion = $row['sharedCriterion'] ?? [];
            $criteria[] = ['type' => (string)($criterion['type'] ?? ''),
                'text' => (string)($criterion['keyword']['text'] ?? ''),
                'match_type' => (string)($criterion['keyword']['matchType'] ?? '')];
        }
        usort($criteria, static fn(array $left, array $right): int => strcmp(
            json_encode($left, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '',
            json_encode($right, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: ''));
        $fingerprints[] = ['type' => (string)($shared['shared_set']['type'] ?? ''), 'criteria' => $criteria];
    }
    usort($fingerprints, static fn(array $left, array $right): int => strcmp(
        json_encode($left, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '',
        json_encode($right, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: ''));
    return $fingerprints;
}

function hub_google_ads_campaign_duplication_user_list_fingerprint(array $bundle): array
{
    $fingerprints = [];
    $add = static function (array $criterion, string $scope, string $groupName = '') use (&$fingerprints): void {
        if (($criterion['type'] ?? null) !== 'USER_LIST') return;
        $resource = (string)($criterion['userList']['userList'] ?? '');
        if (preg_match('#^customers/[1-9][0-9]{9}/userLists/([1-9][0-9]{0,19})$#D', $resource, $matches) !== 1) {
            $fingerprints[] = ['invalid' => true];
            return;
        }
        $fingerprints[] = ['scope' => $scope, 'group' => $groupName, 'list_id' => $matches[1],
            'status' => (string)($criterion['status'] ?? ''), 'negative' => ($criterion['negative'] ?? false) === true];
    };
    foreach ($bundle['campaign_criteria'] ?? [] as $criterion) $add($criterion, 'campaign');
    foreach ($bundle['ad_group_criteria'] ?? [] as $item) {
        $groupName = (string)($bundle['ad_groups'][$item['ad_group_id']]['name'] ?? '');
        $add($item['criterion'] ?? [], 'ad_group', $groupName);
    }
    usort($fingerprints, static fn(array $left, array $right): int => strcmp(
        json_encode($left, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '',
        json_encode($right, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: ''));
    return $fingerprints;
}

function hub_google_ads_campaign_duplication_utf8_prefix(string $value, int $maxBytes): string
{
    if ($maxBytes <= 0) return '';
    if (strlen($value) <= $maxBytes) return $value;
    if (function_exists('mb_strcut')) return mb_strcut($value, 0, $maxBytes, 'UTF-8');
    $prefix = substr($value, 0, $maxBytes);
    while ($prefix !== '' && preg_match('//u', $prefix) !== 1) $prefix = substr($prefix, 0, -1);
    return $prefix;
}

function hub_google_ads_campaign_duplication_operations(array $bundle, array $entry, string $targetCustomerId, int $sequence, string $campaignStatus = 'PAUSED', bool $preserveUrls = false, ?string $pauseSourceCampaignId = null): array
{
    $sourceCampaign = $bundle['campaign']; $sourceBudget = $bundle['budget'];
    $sourceHosts = hub_google_ads_campaign_duplication_source_url_hosts($bundle);
    $userListResourceMap = is_array($entry['user_list_resource_map'] ?? null) ? $entry['user_list_resource_map'] : [];
    $campaignRef = 'customers/' . $targetCustomerId . '/campaigns/-2';
    $budgetRef = 'customers/' . $targetCustomerId . '/campaignBudgets/-1';
    $budgetName = hub_google_ads_campaign_creation_substr($entry['campaign_name'] . ' - budget', 0, 255);
    $budget = ['resourceName' => $budgetRef, 'name' => $budgetName, 'amountMicros' => (string)$sourceBudget['amountMicros'], 'deliveryMethod' => (string)($sourceBudget['deliveryMethod'] ?? 'STANDARD'), 'period' => 'DAILY', 'explicitlyShared' => false];
    $operations = [['campaignBudgetOperation' => ['create' => $budget]]];
    // Search campaigns use the target CPA; CPC bid limits are not queryable on Campaign and are ignored for Search.
    $maximizeConversions = ['targetCpaMicros' => $entry['cpa_micros']];
    $campaign = ['resourceName' => $campaignRef, 'name' => $entry['campaign_name'], 'status' => $campaignStatus, 'advertisingChannelType' => 'SEARCH', 'campaignBudget' => $budgetRef,
        'networkSettings' => $sourceCampaign['networkSettings'], 'containsEuPoliticalAdvertising' => $sourceCampaign['containsEuPoliticalAdvertising'],
        'maximizeConversions' => $maximizeConversions];
    foreach (['adServingOptimizationStatus' => 'adServingOptimizationStatus', 'keywordMatchType' => 'keywordMatchType'] as $source => $target) {
        if (isset($sourceCampaign[$source]) && !in_array($sourceCampaign[$source], ['', 'UNSPECIFIED'], true)) $campaign[$target] = $sourceCampaign[$source];
    }
    if (isset($sourceCampaign['audienceSetting']) && is_array($sourceCampaign['audienceSetting'])) $campaign['audienceSetting'] = $sourceCampaign['audienceSetting'];
    if (isset($sourceCampaign['geoTargetTypeSetting']) && is_array($sourceCampaign['geoTargetTypeSetting'])) $campaign['geoTargetTypeSetting'] = $sourceCampaign['geoTargetTypeSetting'];
    if (is_array($entry['replacement_schedule'] ?? null)) {
        $schedule = $entry['replacement_schedule'];
        $startDate = $schedule['start_date'] ?? null;
        if (!is_string($startDate) || preg_match('/^\d{4}-\d{2}-\d{2}$/D', $startDate) !== 1) {
            throw new HubGoogleAdsApiException('campaign_replacement_expired', 409);
        }
        $startDateTime = $schedule['start_date_time'] ?? null;
        if (!is_string($startDateTime) || preg_match('/^\d{4}-\d{2}-\d{2} 00:00:00$/D', $startDateTime) !== 1) {
            throw new HubGoogleAdsApiException('campaign_replacement_expired', 409);
        }
        $campaign['startDateTime'] = $startDateTime;
        $endDateTime = $schedule['end_date_time'] ?? null;
        if ($endDateTime !== null) {
            if (!is_string($endDateTime) || preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/D', $endDateTime) !== 1 || substr($endDateTime, 0, 10) <= $startDate) {
                throw new HubGoogleAdsApiException('campaign_replacement_expired', 409);
            }
            $campaign['endDateTime'] = $endDateTime;
        }
    } else {
        foreach (['startDateTime' => 'startDateTime', 'endDateTime' => 'endDateTime'] as $source => $target) if (is_string($sourceCampaign[$source] ?? null) && $sourceCampaign[$source] !== '') $campaign[$target] = $sourceCampaign[$source];
    }
    foreach (['trackingUrlTemplate' => 'trackingUrlTemplate', 'finalUrlSuffix' => 'finalUrlSuffix', 'urlCustomParameters' => 'urlCustomParameters'] as $source => $target) {
        if (isset($sourceCampaign[$source]) && $sourceCampaign[$source] !== '' && $sourceCampaign[$source] !== []) $campaign[$target] = $sourceCampaign[$source];
    }
    if (!$preserveUrls) $campaign = hub_google_ads_campaign_duplication_rewrite_url_metadata($campaign, (string)$entry['pre_sell_url'], $sourceHosts);
    $operations[] = ['campaignOperation' => ['create' => $campaign]];
    foreach ($bundle['campaign_criteria'] as $criterion) $operations[] = hub_google_ads_campaign_duplication_criterion_create($criterion, 'campaign', $campaignRef, $targetCustomerId, $entry['pre_sell_url'], $sourceHosts, $userListResourceMap, $preserveUrls);
    $sharedSetNumber = 0;
    foreach ($bundle['shared_sets'] as $shared) {
        $sharedSetNumber++;
        $sharedSetRef = 'customers/' . $targetCustomerId . '/sharedSets/' . (-2000 - $sharedSetNumber);
        $suffix = ' - Neg ' . substr(hash('sha256', $targetCustomerId . ':' . $entry['campaign_name'] . ':' . $sharedSetNumber), 0, 12);
        $sharedSetName = hub_google_ads_campaign_duplication_utf8_prefix((string)$entry['campaign_name'], 255 - strlen($suffix)) . $suffix;
        $operations[] = ['sharedSetOperation' => ['create' => ['resourceName' => $sharedSetRef, 'name' => $sharedSetName, 'type' => 'NEGATIVE_KEYWORDS']]];
        foreach ($shared['criteria'] as $row) {
            $criterion = $row['sharedCriterion'] ?? [];
            $operations[] = ['sharedCriterionOperation' => ['create' => ['sharedSet' => $sharedSetRef,
                'keyword' => ['text' => (string)$criterion['keyword']['text'], 'matchType' => (string)$criterion['keyword']['matchType']]]]];
        }
        $operations[] = ['campaignSharedSetOperation' => ['create' => ['campaign' => $campaignRef, 'sharedSet' => $sharedSetRef]]];
    }
    $groupMap = []; $nextGroup = -2;
    foreach ($bundle['ad_groups'] as $id => $group) {
        $nextGroup--;
        $groupMap[$id] = 'customers/' . $targetCustomerId . '/adGroups/' . $nextGroup;
        $create = ['resourceName' => $groupMap[$id], 'campaign' => $campaignRef, 'name' => (string)$group['name'], 'status' => (string)$group['status'], 'type' => (string)$group['type'],
            'targetingSetting' => ['targetRestrictions' => array_values($group['targetingSetting']['targetRestrictions'] ?? [])]];
        if (isset($group['adRotationMode']) && $group['adRotationMode'] !== 'UNSPECIFIED') $create['adRotationMode'] = $group['adRotationMode'];
        foreach (['trackingUrlTemplate' => 'trackingUrlTemplate', 'finalUrlSuffix' => 'finalUrlSuffix', 'urlCustomParameters' => 'urlCustomParameters'] as $source => $target) if (isset($group[$source]) && $group[$source] !== '' && $group[$source] !== []) $create[$target] = $group[$source];
        if (!$preserveUrls) $create = hub_google_ads_campaign_duplication_rewrite_url_metadata($create, (string)$entry['pre_sell_url'], $sourceHosts);
        $operations[] = ['adGroupOperation' => ['create' => $create]];
    }
    foreach ($bundle['ad_group_criteria'] as $item) $operations[] = hub_google_ads_campaign_duplication_criterion_create($item['criterion'], 'adGroup', $groupMap[$item['ad_group_id']], $targetCustomerId, $entry['pre_sell_url'], $sourceHosts, $userListResourceMap, $preserveUrls);
    foreach ($bundle['ads'] as $item) {
        $adGroupAd = $item['ad_group_ad']; $sourceAd = $adGroupAd['ad']; $rsa = $sourceAd['responsiveSearchAd'];
        $headlines = []; $descriptions = [];
        foreach ($rsa['headlines'] as $asset) { if (!is_array($asset) || !is_string($asset['text'] ?? null)) throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422); $row = ['text' => $asset['text']]; if (isset($asset['pinnedField'])) $row['pinnedField'] = $asset['pinnedField']; $headlines[] = $row; }
        foreach ($rsa['descriptions'] as $asset) { if (!is_array($asset) || !is_string($asset['text'] ?? null)) throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422); $row = ['text' => $asset['text']]; if (isset($asset['pinnedField'])) $row['pinnedField'] = $asset['pinnedField']; $descriptions[] = $row; }
        $newAd = ['finalUrls' => $preserveUrls ? array_values($sourceAd['finalUrls']) : [$entry['pre_sell_url']], 'responsiveSearchAd' => ['headlines' => $headlines, 'descriptions' => $descriptions]];
        if (!empty($sourceAd['finalMobileUrls'])) $newAd['finalMobileUrls'] = $preserveUrls ? array_values($sourceAd['finalMobileUrls']) : [$entry['pre_sell_url']];
        foreach (['path1' => 'path1', 'path2' => 'path2', 'trackingUrlTemplate' => 'trackingUrlTemplate', 'finalUrlSuffix' => 'finalUrlSuffix', 'urlCustomParameters' => 'urlCustomParameters'] as $source => $target) if (isset($rsa[$source])) $newAd['responsiveSearchAd'][$target] = $rsa[$source];
        foreach (['trackingUrlTemplate' => 'trackingUrlTemplate', 'finalUrlSuffix' => 'finalUrlSuffix', 'urlCustomParameters' => 'urlCustomParameters'] as $source => $target) if (isset($sourceAd[$source]) && $sourceAd[$source] !== '' && $sourceAd[$source] !== []) $newAd[$target] = $sourceAd[$source];
        if (!$preserveUrls) $newAd = hub_google_ads_campaign_duplication_rewrite_url_metadata($newAd, (string)$entry['pre_sell_url'], $sourceHosts);
        if (!in_array($adGroupAd['status'] ?? null, ['ENABLED', 'PAUSED'], true)) throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422);
        $operations[] = ['adGroupAdOperation' => ['create' => ['adGroup' => $groupMap[$item['ad_group_id']], 'status' => (string)$adGroupAd['status'], 'ad' => $newAd]]];
    }
    $assetNumber = -1000;
    foreach ($bundle['campaign_assets'] as $asset) hub_google_ads_campaign_duplication_asset_create($asset + ['pre_sell_url' => $entry['pre_sell_url']], $targetCustomerId, $campaignRef, $groupMap, $operations, $assetNumber, $sourceHosts, $preserveUrls);
    foreach ($bundle['ad_group_assets'] as $asset) hub_google_ads_campaign_duplication_asset_create($asset + ['pre_sell_url' => $entry['pre_sell_url']], $targetCustomerId, $campaignRef, $groupMap, $operations, $assetNumber, $sourceHosts, $preserveUrls);
    if ($pauseSourceCampaignId !== null) {
        $sourceId = hub_google_ads_campaign_duplication_campaign_id($pauseSourceCampaignId);
        $operations[] = ['campaignOperation' => ['update' => [
            'resourceName' => 'customers/' . $targetCustomerId . '/campaigns/' . $sourceId,
            'status' => 'PAUSED',
        ], 'updateMask' => 'status']];
    }
    if (count($operations) > 1000) throw new HubGoogleAdsApiException('campaign_duplication_resource_limit', 422);
    return $operations;
}

function hub_google_ads_campaign_duplication_plan_path(string $token): string
{
    $directory = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'hub-google-ads-campaign-duplication';
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) throw new HubGoogleAdsApiException('campaign_duplication_plan_unavailable', 503);
    @chmod($directory, 0700);
    return $directory . DIRECTORY_SEPARATOR . hash('sha256', $token) . '.json';
}

function hub_google_ads_campaign_duplication_plan_save(string $token, array $plan): void
{
    $json = json_encode($plan, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($json) || strlen($json) > 20_000_000) throw new HubGoogleAdsApiException('campaign_duplication_plan_unavailable', 503);
    $path = hub_google_ads_campaign_duplication_plan_path($token);
    if (file_put_contents($path, $json, LOCK_EX) === false) throw new HubGoogleAdsApiException('campaign_duplication_plan_unavailable', 503);
    @chmod($path, 0600);
}

function hub_google_ads_campaign_duplication_plan_write_handle(mixed $handle, array $plan): void
{
    $json = json_encode($plan, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($json) || ftruncate($handle, 0) !== true || rewind($handle) !== true
        || fwrite($handle, $json) !== strlen($json) || fflush($handle) !== true) {
        throw new HubGoogleAdsApiException('campaign_duplication_plan_unavailable', 503);
    }
}

function hub_google_ads_campaign_duplication_sequence_reservation_update(string $identity, int $existingMax, int $count, string $planToken, int $expiresAt, bool $release = false): ?array
{
    $path = dirname(hub_google_ads_campaign_duplication_plan_path('sequence-reservation-directory')) . DIRECTORY_SEPARATOR
        . 'sequence-' . hash('sha256', $identity) . '.json';
    if ($release && !is_file($path)) return null;
    $handle = fopen($path, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) fclose($handle);
        throw new HubGoogleAdsApiException('campaign_duplication_plan_unavailable', 503);
    }
    try {
        rewind($handle); $json = stream_get_contents($handle);
        $store = is_string($json) && $json !== '' ? json_decode($json, true) : ['schema_version' => 1, 'reservations' => []];
        if (!is_array($store) || ($store['schema_version'] ?? null) !== 1 || !is_array($store['reservations'] ?? null)) {
            throw new HubGoogleAdsApiException('campaign_duplication_plan_unavailable', 503);
        }
        $persist = static function (array $reservations) use ($handle, $store, $path): void {
            try { hub_google_ads_campaign_duplication_plan_write_handle($handle, ['schema_version' => 1, 'reservations' => $reservations]); }
            catch (Throwable $error) {
                try { hub_google_ads_campaign_duplication_plan_write_handle($handle, $store); } catch (Throwable $ignored) {}
                throw $error;
            }
            @chmod($path, 0600);
        };
        $identityHash = hash('sha256', $identity); $tokenHash = hash('sha256', $planToken); $now = time(); $active = [];
        foreach ($store['reservations'] as $reservation) {
            if (!is_array($reservation) || ($reservation['identity_hash'] ?? null) !== $identityHash
                || !is_string($reservation['plan_token_hash'] ?? null) || preg_match('/^[a-f0-9]{64}$/D', $reservation['plan_token_hash']) !== 1
                || !is_int($reservation['start'] ?? null) || !is_int($reservation['end'] ?? null)
                || !is_int($reservation['expires_at'] ?? null) || $reservation['start'] < 1 || $reservation['end'] < $reservation['start']) {
                throw new HubGoogleAdsApiException('campaign_duplication_plan_unavailable', 503);
            }
            if ($reservation['expires_at'] > $now && (!$release || $reservation['plan_token_hash'] !== $tokenHash)) $active[] = $reservation;
        }
        if ($release) {
            $persist($active);
            return null;
        }
        if ($existingMax < 0 || $count < 1 || $count > 24 || $expiresAt <= $now) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $previousMax = $existingMax;
        foreach ($active as $reservation) $previousMax = max($previousMax, $reservation['end']);
        $start = $previousMax + 1; $end = $start + $count - 1;
        $active[] = ['identity_hash' => $identityHash, 'plan_token_hash' => $tokenHash, 'start' => $start, 'end' => $end, 'expires_at' => $expiresAt];
        $persist($active);
        return ['previous_max' => $previousMax, 'start' => $start, 'end' => $end];
    } finally { flock($handle, LOCK_UN); fclose($handle); }
}

function hub_google_ads_campaign_duplication_sequence_reservation_release(string $identity, string $planToken): void
{
    hub_google_ads_campaign_duplication_sequence_reservation_update($identity, 0, 0, $planToken, 0, true);
}

function hub_google_ads_campaign_duplication_preview(array $config, array $payload): array
{
    [$managerId, $customerId] = hub_google_ads_campaign_duplication_ids($payload, ['customer_id', 'cpa_percents', 'manager_customer_id', 'operation', 'sequence_accounts', 'source_campaign_id', 'target_accounts']);
    if (($payload['operation'] ?? null) !== 'campaign_duplication_preview') throw new HubGoogleAdsApiException('invalid_payload', 400);
    $sourceCampaignId = hub_google_ads_campaign_duplication_campaign_id($payload['source_campaign_id'] ?? null);
    $targets = hub_google_ads_campaign_duplication_target_rows($payload['target_accounts'] ?? null);
    $sequenceAccounts = hub_google_ads_campaign_duplication_sequence_account_rows($payload['sequence_accounts'] ?? null, $targets, $managerId, $customerId);
    $percents = $payload['cpa_percents'] ?? null;
    if (!is_array($percents) || !array_is_list($percents) || !$percents || count($percents) > 6) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $percents = array_values(array_unique($percents)); sort($percents, SORT_NUMERIC);
    foreach ($percents as $percent) if (!is_int($percent) || !in_array($percent, [30, 40, 50, 60, 70, 80], true)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    if (count($targets) * count($percents) > 24) throw new HubGoogleAdsApiException('campaign_duplication_batch_too_large', 422);
    $token = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_duplication_validate_access($config, $token, $managerId, $customerId);
    $bundle = hub_google_ads_campaign_duplication_query_bundle($managerId, $customerId, $sourceCampaignId, $token);
    if ($bundle['blockers']) throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422);
    $sourceName = (string)$bundle['campaign']['name']; $source = hub_google_ads_campaign_duplication_source_name($sourceName);
    if ($source['currency'] !== $bundle['currency_code']) throw new HubGoogleAdsApiException('campaign_currency_mismatch', 422);
    foreach ($targets as $target) {
        if ($target['customer_id'] === $customerId) {
            throw new HubGoogleAdsApiException('campaign_duplication_source_target', 422);
        }
    }
    foreach ($targets as $target) {
        hub_google_ads_campaign_duplication_validate_access($config, $token, $target['manager_id'], $target['customer_id']);
    }
    $sequenceMax = $source['iteration'];
    $allAccounts = $sequenceAccounts;
    $targetAccountKeys = [];
    foreach ($targets as $target) {
        $targetKey = $target['manager_id'] . ':' . $target['customer_id'];
        $targetAccountKeys[$targetKey] = true;
    }
    $uniqueAccounts = [];
    foreach ($allAccounts as $account) $uniqueAccounts[$account['manager_id'] . ':' . $account['customer_id']] = $account;
    $existingNamesByAccount = [];
    foreach ($uniqueAccounts as $accountKey => $account) {
        try {
            $names = hub_google_ads_campaign_duplication_existing_names($account['manager_id'], $account['customer_id'], $token);
        } catch (HubGoogleAdsApiException $error) {
            if ($error->apiCode === 'google_ads_access_denied') {
                throw new HubGoogleAdsApiException('campaign_duplication_sequence_unavailable', 422);
            }
            throw $error;
        }
        $existingNamesByAccount[$accountKey] = array_fill_keys($names, true);
        foreach ($names as $name) {
            $candidate = hub_google_ads_campaign_duplication_parse_name($name);
            if ($candidate !== null && hub_google_ads_campaign_duplication_identity($candidate) === hub_google_ads_campaign_duplication_identity($source)) $sequenceMax = max($sequenceMax, $candidate['iteration']);
        }
        if (isset($targetAccountKeys[$accountKey])) {
            $currency = hub_google_ads_campaign_creation_customer_currency($token, $account['manager_id'], $account['customer_id']);
            if ($currency !== $source['currency']) throw new HubGoogleAdsApiException('campaign_currency_mismatch', 422);
        }
    }
    $entries = []; $blockers = []; $sequence = $sequenceMax + 1; $entryIndex = 0; $stopValidating = false;
    $targetUserListMaps = []; $targetUserListBlockers = [];
    if (hub_google_ads_campaign_duplication_user_list_refs($bundle)) {
        foreach ($targets as $target) {
            $targetKey = $target['manager_id'] . ':' . $target['customer_id'];
            if (isset($targetUserListMaps[$targetKey]) || isset($targetUserListBlockers[$targetKey])) continue;
            try {
                $targetUserListMaps[$targetKey] = hub_google_ads_campaign_duplication_user_list_map_for_target($bundle, $target['manager_id'], $target['customer_id'], $token);
            } catch (HubGoogleAdsApiException $error) {
                $targetUserListBlockers[$targetKey] = $error->apiCode === 'campaign_duplication_audience_unavailable'
                    ? 'A conta destino não tem acesso ativo a todos os públicos de lista de usuários da campanha.'
                    : 'Não foi possível confirmar os públicos de lista de usuários na conta destino (' . $error->apiCode . ').';
                if (in_array($error->apiCode, ['google_ads_quota_exceeded', 'google_ads_auth_failed', 'google_ads_access_denied', 'google_ads_unavailable'], true)) $stopValidating = true;
            }
        }
    }
    $planToken = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $expiresAt = time() + 1800;
    $sequenceIdentity = hub_google_ads_campaign_duplication_identity($source);
    $sequenceReservation = hub_google_ads_campaign_duplication_sequence_reservation_update(
        $sequenceIdentity, $sequenceMax, count($targets) * count($percents), $planToken, $expiresAt
    );
    $sequence = $sequenceReservation['start'];
    $reservationRetained = false;
    try {
    foreach ($targets as $target) {
        foreach ($percents as $percent) {
            $name = hub_google_ads_campaign_duplication_format_name($source, $sequence, $percent);
            if (hub_google_ads_campaign_creation_text_length($name) > 255) throw new HubGoogleAdsApiException('campaign_duplication_name_too_long', 422);
            $entryId = 'entry_' . (++$entryIndex);
            $cpaMicros = (string)round($source['commission'] * $percent / 100 * 1_000_000);
            $entry = ['entry_id' => $entryId, 'customer_id' => $target['customer_id'], 'manager_id' => $target['manager_id'],
                'account_name' => $target['name'] ?: $target['customer_id'], 'currency_code' => $source['currency'], 'campaign_name' => $name,
                'iteration' => $sequence,
                'percent' => $percent, 'cpa_micros' => $cpaMicros, 'cpa' => number_format((int)$cpaMicros / 1_000_000, 2, '.', ''),
                'pre_sell_url' => $target['pre_sell_url'], 'user_list_resource_map' => $targetUserListMaps[$target['manager_id'] . ':' . $target['customer_id']] ?? [], 'state' => 'planned'];
            $targetKey = $target['manager_id'] . ':' . $target['customer_id'];
            if (isset($targetUserListBlockers[$targetKey])) { $entry['blockers'][] = $targetUserListBlockers[$targetKey]; $entry['validated'] = false; }
            elseif (isset($existingNamesByAccount[$targetKey][$name])) { $entry['blockers'][] = 'Já existe uma campanha com este nome na conta de destino.'; $entry['validated'] = false; }
            elseif ($stopValidating) { $entry['blockers'][] = 'A validação restante foi interrompida após uma falha temporária da API.'; $entry['validated'] = false; }
            else {
                try {
                    $operations = hub_google_ads_campaign_duplication_operations($bundle, $entry, $target['customer_id'], $sequence);
                    hub_google_ads_api_request('POST', 'customers/' . $target['customer_id'] . '/googleAds:mutate', $token,
                        json_encode(['mutateOperations' => $operations, 'validateOnly' => true], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $target['manager_id']);
                    $entry['validated'] = true;
                } catch (HubGoogleAdsApiException $error) {
                    $entry['blockers'][] = $error->apiCode === 'campaign_duplication_resource_limit'
                        ? 'A campanha excede o limite de recursos que podem ser copiados em uma única operação.'
                        : 'A validação do Google Ads falhou para esta cópia (' . $error->apiCode . ').';
                    $entry['validated'] = false;
                    if (in_array($error->apiCode, ['google_ads_quota_exceeded', 'google_ads_auth_failed', 'google_ads_access_denied', 'google_ads_unavailable'], true)) $stopValidating = true;
                }
            }
            $entry['blockers'] ??= [];
            if (!$entry['validated']) $blockers = array_merge($blockers, $entry['blockers']);
            $entries[] = $entry; $sequence++;
        }
    }
    $sourceVersion = hash('sha256', json_encode($bundle, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    $plan = ['expires_at' => $expiresAt, 'sequence_reservation' => ['identity_hash' => hash('sha256', $sequenceIdentity),
        'start' => $sequenceReservation['start'], 'end' => $sequenceReservation['end']],
        'source' => ['manager_id' => $managerId, 'customer_id' => $customerId, 'campaign_id' => $sourceCampaignId],
        'source_version' => $sourceVersion, 'bundle' => $bundle, 'entries' => $entries];
    hub_google_ads_campaign_duplication_plan_save($planToken, $plan);
    $reservationRetained = !$blockers && $entries && !array_filter($entries, static fn(array $entry): bool => empty($entry['validated']) || !empty($entry['blockers']));
    } finally {
        if (!$reservationRetained) {
            try { hub_google_ads_campaign_duplication_sequence_reservation_release($sequenceIdentity, $planToken); }
            catch (Throwable $ignored) {}
        }
    }
    $publicEntries = array_map(static fn(array $entry): array => ['entry_id' => $entry['entry_id'], 'customer_id' => $entry['customer_id'],
        'account_name' => $entry['account_name'], 'campaign_name' => $entry['campaign_name'], 'percent' => $entry['percent'], 'cpa' => $entry['cpa'],
        'currency_code' => $entry['currency_code'], 'pre_sell_url' => $entry['pre_sell_url'], 'validated' => $entry['validated'] ?? false, 'blockers' => $entry['blockers']], $entries);
    return ['ok' => true, 'schema_version' => 1, 'operation' => 'campaign_duplication_preview', 'validated_only' => true,
        'will_create_paused' => true, 'plan_token' => $planToken, 'source_campaign_name' => $sourceName, 'source_version' => $sourceVersion,
        'existing_sequence_max' => $sequenceMax, 'sequence_accounts_checked' => count($uniqueAccounts),
        'sequence_reserved' => (bool)$reservationRetained, 'sequence_start' => $sequenceReservation['start'], 'sequence_end' => $sequenceReservation['end'],
        'resources' => ['ad_groups' => count($bundle['ad_groups']), 'ads' => count($bundle['ads']),
            'campaign_criteria' => count($bundle['campaign_criteria']), 'ad_group_criteria' => count($bundle['ad_group_criteria']),
            'campaign_assets' => count($bundle['campaign_assets']), 'ad_group_assets' => count($bundle['ad_group_assets']),
            'campaign_asset_automation' => count($bundle['campaign_asset_automation']), 'campaign_bid_modifiers' => count($bundle['campaign_bid_modifiers']),
            'ad_group_bid_modifiers' => count($bundle['ad_group_bid_modifiers']),
            'shared_exclusion_lists' => count($bundle['shared_sets']), 'campaign_labels' => count($bundle['labels']),
            'shared_negative_keywords' => array_sum(array_map(static fn(array $shared): int => count($shared['criteria'] ?? []), $bundle['shared_sets'])),
            'audience_user_lists' => count(hub_google_ads_campaign_duplication_user_list_refs($bundle)),
            'conversion_goal_config' => count($bundle['conversion_goal_config']), 'campaign_customizers' => count($bundle['campaign_customizers']),
            'ad_group_customizers' => count($bundle['ad_group_customizers']), 'ad_group_labels' => count($bundle['ad_group_labels']),
            'ad_group_ad_labels' => count($bundle['ad_group_ad_labels']), 'ad_group_criterion_labels' => count($bundle['ad_group_criterion_labels']),
            'campaign_asset_sets' => count($bundle['campaign_asset_sets']),
            'ad_group_asset_sets' => count($bundle['ad_group_asset_sets'])],
        'sitelinks' => hub_google_ads_campaign_duplication_public_inspection($bundle, $sourceCampaignId)['sitelinks'],
        'blockers' => array_values(array_unique($blockers)), 'entries' => $publicEntries];
}

function hub_google_ads_campaign_duplication_create(array $config, array $payload): array
{
    $expected = ['confirm', 'entry_id', 'operation', 'plan_token']; $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    $tokenValue = $payload['plan_token'] ?? null; $entryId = $payload['entry_id'] ?? null;
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'campaign_duplication_create' || ($payload['confirm'] ?? null) !== true
        || !is_string($tokenValue) || preg_match('/^[A-Za-z0-9_-]{40,60}$/D', $tokenValue) !== 1
        || !is_string($entryId) || preg_match('/^entry_[1-9][0-9]{0,2}$/D', $entryId) !== 1) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $path = hub_google_ads_campaign_duplication_plan_path($tokenValue);
    $handle = fopen($path, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) throw new HubGoogleAdsApiException('campaign_duplication_plan_expired', 409);
    try {
        rewind($handle); $json = stream_get_contents($handle); $plan = is_string($json) ? json_decode($json, true) : null;
        if (!is_array($plan) || !is_array($plan['entries'] ?? null) || (int)($plan['expires_at'] ?? 0) < time()) throw new HubGoogleAdsApiException('campaign_duplication_plan_expired', 409);
        $entryIndex = null;
        foreach ($plan['entries'] as $index => $entry) if (($entry['entry_id'] ?? null) === $entryId) $entryIndex = $index;
        if ($entryIndex === null) throw new HubGoogleAdsApiException('campaign_duplication_plan_expired', 409);
        $entry = $plan['entries'][$entryIndex];
        if (($entry['state'] ?? null) === 'created') return ['ok' => true, 'schema_version' => 1, 'operation' => 'campaign_duplication_create', 'created' => true, 'verified' => true,
            'entry_id' => $entryId, 'campaign_id' => (string)$entry['campaign_id'], 'campaign_name' => (string)$entry['campaign_name'], 'status' => 'PAUSED', 'verified_at_utc' => (string)$entry['verified_at_utc']];
        if (in_array($entry['state'] ?? '', ['creating', 'uncertain'], true)) throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
        if (!in_array($entry['state'] ?? null, ['planned', 'failed'], true)) throw new HubGoogleAdsApiException('campaign_duplication_entry_already_attempted', 409);
        if (empty($entry['validated']) || !empty($entry['blockers'])) throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422);
        $managerId = (string)$entry['manager_id']; $customerId = (string)$entry['customer_id'];
        $googleToken = hub_google_ads_access_token(hub_google_ads_credentials());
        hub_google_ads_campaign_duplication_validate_access($config, $googleToken, $managerId, $customerId);
        $source = $plan['source'];
        hub_google_ads_campaign_duplication_validate_access($config, $googleToken, (string)$source['manager_id'], (string)$source['customer_id']);
        $currentBundle = hub_google_ads_campaign_duplication_query_bundle((string)$source['manager_id'], (string)$source['customer_id'], (string)$source['campaign_id'], $googleToken);
        if (hash('sha256', json_encode($currentBundle, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) !== $plan['source_version'] || $currentBundle['blockers']) {
            throw new HubGoogleAdsApiException('campaign_duplication_changed', 409);
        }
        try {
            $currentUserListMap = hub_google_ads_campaign_duplication_user_list_map_for_target($currentBundle, $managerId, $customerId, $googleToken);
        } catch (HubGoogleAdsApiException $error) {
            if ($error->apiCode === 'campaign_duplication_audience_unavailable') throw new HubGoogleAdsApiException('campaign_duplication_changed', 409);
            throw $error;
        }
        if ($currentUserListMap !== ($entry['user_list_resource_map'] ?? [])) throw new HubGoogleAdsApiException('campaign_duplication_changed', 409);
        $duplicates = hub_google_ads_campaign_duplication_search($customerId, $managerId, $googleToken,
            'SELECT campaign.id, campaign.status FROM campaign WHERE campaign.name = ' . hub_google_ads_campaign_creation_gaql_string((string)$entry['campaign_name']) . " AND campaign.status != 'REMOVED' LIMIT 2");
        if ($duplicates) throw new HubGoogleAdsApiException('campaign_name_already_exists', 409);
        $operations = hub_google_ads_campaign_duplication_operations($currentBundle, $entry, $customerId, (int)$entry['iteration']);
        $plan['entries'][$entryIndex]['state'] = 'creating';
        hub_google_ads_campaign_duplication_plan_write_handle($handle, $plan);
        try {
            $result = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $googleToken,
                json_encode(['mutateOperations' => $operations], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
        } catch (HubGoogleAdsApiException $error) {
            $plan['entries'][$entryIndex]['state'] = in_array($error->apiCode, ['google_ads_request_rejected', 'google_ads_access_denied', 'google_ads_quota_exceeded'], true) ? 'failed' : 'uncertain';
            $plan['entries'][$entryIndex]['error'] = $error->apiCode;
            hub_google_ads_campaign_duplication_plan_write_handle($handle, $plan);
            throw $error;
        }
        $responses = $result['mutateOperationResponses'] ?? null;
        $campaignResource = is_array($responses) ? ($responses[1]['campaignResult']['resourceName'] ?? null) : null;
        if (!is_string($campaignResource) || preg_match('#^customers/' . preg_quote($customerId, '#') . '/campaigns/([1-9][0-9]{0,19})$#D', $campaignResource, $matches) !== 1) {
            $plan['entries'][$entryIndex]['state'] = 'uncertain';
            hub_google_ads_campaign_duplication_plan_write_handle($handle, $plan);
            throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
        }
        $campaignId = $matches[1];
        try { $verified = hub_google_ads_campaign_action_read($googleToken, $managerId, $customerId, $campaignId); }
        catch (Throwable $error) { $verified = null; }
        if (!is_array($verified) || $verified['status'] !== 'PAUSED' || $verified['name'] !== $entry['campaign_name']) {
            $plan['entries'][$entryIndex]['state'] = 'uncertain';
            hub_google_ads_campaign_duplication_plan_write_handle($handle, $plan);
            throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
        }
        try { $verifiedBundle = hub_google_ads_campaign_duplication_query_bundle($managerId, $customerId, $campaignId, $googleToken); }
        catch (Throwable $error) { $verifiedBundle = null; }
        $expectedCounts = [count($currentBundle['ad_groups']), count($currentBundle['campaign_criteria']), count($currentBundle['ad_group_criteria']),
            count($currentBundle['ads']), count($currentBundle['campaign_assets']), count($currentBundle['ad_group_assets']), count($currentBundle['shared_sets'])];
        $actualCounts = is_array($verifiedBundle) ? [count($verifiedBundle['ad_groups']), count($verifiedBundle['campaign_criteria']), count($verifiedBundle['ad_group_criteria']),
            count($verifiedBundle['ads']), count($verifiedBundle['campaign_assets']), count($verifiedBundle['ad_group_assets']), count($verifiedBundle['shared_sets'])] : [];
        $sharedSetsVerified = is_array($verifiedBundle)
            && hub_google_ads_campaign_duplication_shared_set_fingerprint($verifiedBundle) === hub_google_ads_campaign_duplication_shared_set_fingerprint($currentBundle);
        $userListsVerified = is_array($verifiedBundle)
            && hub_google_ads_campaign_duplication_user_list_fingerprint($verifiedBundle) === hub_google_ads_campaign_duplication_user_list_fingerprint($currentBundle);
        $urlsVerified = is_array($verifiedBundle);
        $sourceSitelinkAnchors = [];
        foreach (array_merge($currentBundle['campaign_assets'], $currentBundle['ad_group_assets']) as $sourceAsset) {
            if (($sourceAsset['asset']['type'] ?? null) === 'SITELINK' && preg_match('/#([1-6])$/D', (string)($sourceAsset['asset']['finalUrls'][0] ?? ''), $anchor) === 1) $sourceSitelinkAnchors[] = $anchor[1];
        }
        $targetSitelinkAnchors = [];
        if ($urlsVerified) {
            foreach ($verifiedBundle['ads'] as $item) {
                $ad = $item['ad_group_ad']['ad'];
                if (($ad['finalUrls'] ?? null) !== [$entry['pre_sell_url']]) $urlsVerified = false;
                if (!empty($ad['finalMobileUrls']) && $ad['finalMobileUrls'] !== [$entry['pre_sell_url']]) $urlsVerified = false;
            }
            $expectedKeywordUrlCount = 0; $actualKeywordUrlCount = 0;
            foreach ($currentBundle['ad_group_criteria'] as $item) if (($item['criterion']['type'] ?? null) === 'KEYWORD' && !empty($item['criterion']['finalUrls'])) $expectedKeywordUrlCount++;
            foreach ($verifiedBundle['ad_group_criteria'] as $item) {
                $criterion = $item['criterion'];
                if (($criterion['type'] ?? null) !== 'KEYWORD') continue;
                if (!empty($criterion['finalUrls'])) {
                    $actualKeywordUrlCount++;
                    if ($criterion['finalUrls'] !== [$entry['pre_sell_url']]) $urlsVerified = false;
                }
                if (!empty($criterion['finalMobileUrls']) && $criterion['finalMobileUrls'] !== [$entry['pre_sell_url']]) $urlsVerified = false;
            }
            if ($actualKeywordUrlCount !== $expectedKeywordUrlCount) $urlsVerified = false;
            foreach (array_merge($verifiedBundle['campaign_assets'], $verifiedBundle['ad_group_assets']) as $asset) {
                $type = $asset['asset']['type'] ?? null; $urls = $asset['asset']['finalUrls'] ?? [];
                if ($type === 'SITELINK') {
                    if (count($urls) !== 1 || preg_match('/#([1-6])$/D', (string)($urls[0] ?? ''), $anchor) !== 1
                        || (string)$urls[0] !== rtrim($entry['pre_sell_url'], '/') . '#' . $anchor[1]) $urlsVerified = false;
                    else $targetSitelinkAnchors[] = $anchor[1];
                } elseif ($type === 'PROMOTION' && $urls !== [$entry['pre_sell_url']]) $urlsVerified = false;
            }
        }
        sort($sourceSitelinkAnchors); sort($targetSitelinkAnchors);
        if ($sourceSitelinkAnchors !== $targetSitelinkAnchors) $urlsVerified = false;
        $targetCpa = is_array($verifiedBundle) ? (string)($verifiedBundle['campaign']['maximizeConversions']['targetCpaMicros'] ?? '') : '';
        $budgetMatches = is_array($verifiedBundle) && (string)($verifiedBundle['budget']['amountMicros'] ?? '') === (string)($currentBundle['budget']['amountMicros'] ?? '');
        $metadataUrlsVerified = is_array($verifiedBundle)
            && !hub_google_ads_campaign_duplication_has_old_url_host_in_metadata($verifiedBundle,
                hub_google_ads_campaign_duplication_source_url_hosts($currentBundle), (string)$entry['pre_sell_url']);
        if (!is_array($verifiedBundle) || $verifiedBundle['blockers'] || $actualCounts !== $expectedCounts || !$sharedSetsVerified || !$userListsVerified || !$urlsVerified
            || !$metadataUrlsVerified || !$budgetMatches || $targetCpa !== (string)$entry['cpa_micros']) {
            $plan['entries'][$entryIndex]['state'] = 'uncertain';
            hub_google_ads_campaign_duplication_plan_write_handle($handle, $plan);
            throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
        }
        $verifiedAt = gmdate('Y-m-d\TH:i:s\Z');
        $plan['entries'][$entryIndex]['state'] = 'created'; $plan['entries'][$entryIndex]['campaign_id'] = $campaignId; $plan['entries'][$entryIndex]['verified_at_utc'] = $verifiedAt;
            hub_google_ads_campaign_duplication_plan_write_handle($handle, $plan);
        return ['ok' => true, 'schema_version' => 1, 'operation' => 'campaign_duplication_create', 'created' => true, 'verified' => true,
            'entry_id' => $entryId, 'campaign_id' => $campaignId, 'campaign_name' => $verified['name'], 'status' => 'PAUSED', 'verified_at_utc' => $verifiedAt];
    } finally { flock($handle, LOCK_UN); fclose($handle); }
}

function hub_google_ads_campaign_duplication_replacement_name(string $sourceName, array $parsed): string
{
    if (($parsed['iteration_variant'] ?? '') !== '') throw new HubGoogleAdsApiException('campaign_replacement_not_eligible', 422);
    $replacement = preg_replace('/(\s\d{1,3})\s+\(/u', '$1B (', $sourceName, 1, $matches);
    if (!is_string($replacement) || $matches !== 1 || strlen($replacement) > 255) {
        throw new HubGoogleAdsApiException('campaign_duplication_name_too_long', 422);
    }
    return $replacement;
}

function hub_google_ads_campaign_duplication_replacement_name_exists(string $managerId, string $customerId, string $token, string $name): bool
{
    $rows = hub_google_ads_campaign_duplication_search($customerId, $managerId, $token,
        'SELECT campaign.id FROM campaign WHERE campaign.name = ' . hub_google_ads_campaign_creation_gaql_string($name) . " AND campaign.status != 'REMOVED' LIMIT 2");
    if (count($rows) > 1) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    return count($rows) === 1;
}

function hub_google_ads_campaign_duplication_replacement_resource_counts(array $bundle): array
{
    return ['ad_groups' => count($bundle['ad_groups'] ?? []), 'ads' => count($bundle['ads'] ?? []),
        'campaign_criteria' => count($bundle['campaign_criteria'] ?? []), 'ad_group_criteria' => count($bundle['ad_group_criteria'] ?? []),
        'campaign_assets' => count($bundle['campaign_assets'] ?? []), 'ad_group_assets' => count($bundle['ad_group_assets'] ?? []),
        'shared_exclusion_lists' => count($bundle['shared_sets'] ?? [])];
}

function hub_google_ads_campaign_duplication_replacement_clean(mixed $value): mixed
{
    if (!is_array($value)) return $value;
    $out = [];
    foreach ($value as $key => $child) {
        if (is_string($key) && in_array($key, ['resourceName', 'campaign', 'adGroup', 'id', 'criterionId', 'adGroupId'], true)) continue;
        $out[$key] = hub_google_ads_campaign_duplication_replacement_clean($child);
    }
    if (!array_is_list($out)) ksort($out, SORT_STRING);
    return $out;
}

function hub_google_ads_campaign_duplication_replacement_fingerprint(array $bundle, bool $includeSchedule = true): string
{
    $campaign = $bundle['campaign'];
    $campaignSettings = [];
    foreach (['advertisingChannelType', 'advertisingChannelSubType', 'biddingStrategyType', 'maximizeConversions', 'networkSettings',
        'containsEuPoliticalAdvertising', 'adServingOptimizationStatus', 'keywordMatchType', 'audienceSetting',
        'geoTargetTypeSetting', 'trackingUrlTemplate', 'finalUrlSuffix', 'urlCustomParameters'] as $key) {
        if (array_key_exists($key, $campaign)) $campaignSettings[$key] = $campaign[$key];
    }
    if ($includeSchedule) {
        foreach (['startDateTime', 'endDateTime'] as $key) if (array_key_exists($key, $campaign)) $campaignSettings[$key] = $campaign[$key];
    }
    $groups = [];
    foreach ($bundle['ad_groups'] as $group) $groups[] = hub_google_ads_campaign_duplication_replacement_clean($group);
    usort($groups, static fn(array $left, array $right): int => strcmp((string)($left['name'] ?? ''), (string)($right['name'] ?? '')));
    $campaignCriteria = array_map('hub_google_ads_campaign_duplication_replacement_clean', $bundle['campaign_criteria']);
    $groupCriteria = [];
    foreach ($bundle['ad_group_criteria'] as $item) $groupCriteria[] = ['group' => (string)($bundle['ad_groups'][$item['ad_group_id']]['name'] ?? ''),
        'criterion' => hub_google_ads_campaign_duplication_replacement_clean($item['criterion'])];
    $ads = [];
    foreach ($bundle['ads'] as $item) $ads[] = ['group' => (string)($bundle['ad_groups'][$item['ad_group_id']]['name'] ?? ''),
        'status' => (string)($item['ad_group_ad']['status'] ?? ''), 'ad' => hub_google_ads_campaign_duplication_replacement_clean($item['ad_group_ad']['ad'] ?? [])];
    $assets = [];
    foreach ($bundle['campaign_assets'] as $item) $assets[] = ['scope' => 'campaign', 'field_type' => (string)($item['campaign_asset']['fieldType'] ?? ''),
        'status' => (string)($item['campaign_asset']['status'] ?? ''), 'asset' => hub_google_ads_campaign_duplication_replacement_clean($item['asset'] ?? [])];
    foreach ($bundle['ad_group_assets'] as $item) $assets[] = ['scope' => (string)($bundle['ad_groups'][$item['ad_group_id']]['name'] ?? ''),
        'field_type' => (string)($item['ad_group_asset']['fieldType'] ?? ''), 'status' => (string)($item['ad_group_asset']['status'] ?? ''),
        'asset' => hub_google_ads_campaign_duplication_replacement_clean($item['asset'] ?? [])];
    $sortRows = static function (array &$rows): void { usort($rows, static fn(array $left, array $right): int => strcmp(
        json_encode($left, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '', json_encode($right, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '')); };
    $sortRows($campaignCriteria); $sortRows($groupCriteria); $sortRows($ads); $sortRows($assets);
    $material = ['currency_code' => $bundle['currency_code'], 'campaign' => $campaignSettings,
        'budget' => ['amountMicros' => (string)($bundle['budget']['amountMicros'] ?? ''), 'period' => $bundle['budget']['period'] ?? null,
            'explicitlyShared' => $bundle['budget']['explicitlyShared'] ?? null, 'deliveryMethod' => $bundle['budget']['deliveryMethod'] ?? null],
        'groups' => $groups, 'campaign_criteria' => $campaignCriteria, 'ad_group_criteria' => $groupCriteria, 'ads' => $ads, 'assets' => $assets,
        'shared_sets' => hub_google_ads_campaign_duplication_shared_set_fingerprint($bundle),
        'user_lists' => hub_google_ads_campaign_duplication_user_list_fingerprint($bundle)];
    return hash('sha256', json_encode($material, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '');
}

function hub_google_ads_campaign_duplication_replacement_source_version(array $bundle): string
{
    $blockers = array_values(array_map('strval', (array)($bundle['blockers'] ?? [])));
    sort($blockers, SORT_STRING);
    $material = ['campaign_name' => (string)($bundle['campaign']['name'] ?? ''),
        'campaign_status' => (string)($bundle['campaign']['status'] ?? ''),
        'customer_time_zone' => (string)($bundle['customer_time_zone'] ?? ''),
        'blockers' => $blockers,
        'copy_fingerprint' => hub_google_ads_campaign_duplication_replacement_fingerprint($bundle)];
    return hash('sha256', json_encode($material, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '');
}

function hub_google_ads_campaign_duplication_replacement_schedule(array $bundle): array
{
    $timeZoneName = (string)($bundle['customer_time_zone'] ?? '');
    try {
        $timeZone = new DateTimeZone($timeZoneName);
    } catch (Throwable $error) {
        throw new HubGoogleAdsApiException('campaign_replacement_expired', 409);
    }
    $startDate = (new DateTimeImmutable('now', $timeZone))->format('Y-m-d');
    $startDateTime = $startDate . ' 00:00:00';
    $sourceEndDateTime = $bundle['campaign']['endDateTime'] ?? null;
    $endDateTime = null;
    $endDate = null;
    if (is_string($sourceEndDateTime)
        && preg_match('/^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}:\d{2}))?$/D', $sourceEndDateTime, $matches) === 1
        && $matches[1] > $startDate) {
        $endDate = $matches[1];
        $endDateTime = $matches[1] . ' ' . (($matches[2] ?? '') !== '' ? $matches[2] : '23:59:59');
    }
    return ['start_date' => $startDate, 'end_date' => $endDate, 'start_date_time' => $startDateTime,
        'end_date_time' => $endDateTime, 'time_zone' => $timeZoneName];
}

function hub_google_ads_campaign_duplication_replace_preview(array $config, array $payload): array
{
    [$managerId, $customerId] = hub_google_ads_campaign_duplication_ids($payload, ['campaign_id', 'customer_id', 'manager_customer_id', 'operation']);
    if (($payload['operation'] ?? null) !== 'campaign_duplication_replace_preview') throw new HubGoogleAdsApiException('invalid_payload', 400);
    $campaignId = hub_google_ads_campaign_duplication_campaign_id($payload['campaign_id'] ?? null);
    if (!hub_google_ads_campaign_creation_enabled($config) || !hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
        throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
    }
    $token = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_duplication_validate_access($config, $token, $managerId, $customerId);
    $bundle = hub_google_ads_campaign_duplication_query_bundle($managerId, $customerId, $campaignId, $token, true);
    $campaign = $bundle['campaign'];
    if (($campaign['status'] ?? null) !== 'ENABLED' || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH'
        || ($campaign['biddingStrategyType'] ?? null) !== 'MAXIMIZE_CONVERSIONS' || !empty($campaign['biddingStrategy'])) {
        throw new HubGoogleAdsApiException('campaign_replacement_not_eligible', 422);
    }
    $cpaMicros = (string)($campaign['maximizeConversions']['targetCpaMicros'] ?? '');
    if (preg_match('/^[1-9][0-9]{0,19}$/D', $cpaMicros) !== 1) throw new HubGoogleAdsApiException('campaign_replacement_not_eligible', 422);
    if ($bundle['blockers']) throw new HubGoogleAdsApiException('campaign_duplication_unsupported', 422);
    $sourceName = (string)$campaign['name'];
    $parsed = hub_google_ads_campaign_duplication_parse_name($sourceName);
    if ($parsed === null) throw new HubGoogleAdsApiException('campaign_duplication_name_invalid', 422);
    $replacementName = hub_google_ads_campaign_duplication_replacement_name($sourceName, $parsed);
    if (hub_google_ads_campaign_duplication_replacement_name_exists($managerId, $customerId, $token, $replacementName)) {
        throw new HubGoogleAdsApiException('campaign_replacement_name_exists', 409);
    }
    $userListMap = [];
    foreach (hub_google_ads_campaign_duplication_user_list_refs($bundle) as $resource => $_reference) $userListMap[$resource] = $resource;
    $replacementSchedule = hub_google_ads_campaign_duplication_replacement_schedule($bundle);
    $entry = ['campaign_name' => $replacementName, 'cpa_micros' => $cpaMicros, 'pre_sell_url' => '', 'user_list_resource_map' => $userListMap,
        'replacement_schedule' => $replacementSchedule];
    $operations = hub_google_ads_campaign_duplication_operations($bundle, $entry, $customerId, (int)$parsed['iteration'], 'ENABLED', true, $campaignId);
    hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $token,
        json_encode(['mutateOperations' => $operations, 'validateOnly' => true, 'partialFailure' => false], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
    $planToken = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $expiresAt = time() + 1800;
    $sourceVersion = hub_google_ads_campaign_duplication_replacement_source_version($bundle);
    hub_google_ads_campaign_duplication_plan_save($planToken, ['kind' => 'replacement', 'expires_at' => $expiresAt, 'state' => 'ready',
        'source' => ['manager_id' => $managerId, 'customer_id' => $customerId, 'campaign_id' => $campaignId, 'campaign_name' => $sourceName],
        'source_version' => $sourceVersion, 'replacement' => ['campaign_name' => $replacementName, 'cpa_micros' => $cpaMicros, 'schedule' => $replacementSchedule],
        'bundle' => $bundle, 'user_list_resource_map' => $userListMap]);
    return ['ok' => true, 'schema_version' => 1, 'operation' => 'campaign_duplication_replace_preview', 'validated_only' => true,
        'will_pause_source' => true, 'will_create_enabled' => true, 'source_campaign_id' => $campaignId,
        'source' => ['campaign_name' => $sourceName, 'status' => 'ENABLED'],
        'replacement' => ['campaign_name' => $replacementName, 'currency_code' => (string)$bundle['currency_code'],
            'target_cpa_micros' => $cpaMicros, 'daily_budget_micros' => (string)$bundle['budget']['amountMicros'],
            'start_date' => $replacementSchedule['start_date'], 'end_date' => $replacementSchedule['end_date'], 'time_zone' => $replacementSchedule['time_zone']],
        'resources' => hub_google_ads_campaign_duplication_replacement_resource_counts($bundle), 'blockers' => [],
        'asset_automation_settings_status' => 'manual_check_required',
        'plan_token' => $planToken, 'expires_at_utc' => gmdate('Y-m-d\TH:i:s\Z', $expiresAt)];
}

function hub_google_ads_campaign_duplication_replace_execute(array $config, array $payload): array
{
    $expected = ['campaign_id', 'confirm', 'customer_id', 'manager_customer_id', 'operation', 'plan_token'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $campaignId = is_string($payload['campaign_id'] ?? null) ? $payload['campaign_id'] : '';
    $planToken = $payload['plan_token'] ?? null;
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'campaign_duplication_replace_execute' || ($payload['confirm'] ?? null) !== true
        || $managerId === null || $customerId === null || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
        || !is_string($planToken) || preg_match('/^[A-Za-z0-9_-]{40,60}$/D', $planToken) !== 1) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $path = hub_google_ads_campaign_duplication_plan_path($planToken);
    $handle = fopen($path, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) throw new HubGoogleAdsApiException('campaign_replacement_expired', 409);
    try {
        rewind($handle); $json = stream_get_contents($handle); $plan = is_string($json) ? json_decode($json, true) : null;
        if (!is_array($plan) || ($plan['kind'] ?? null) !== 'replacement') throw new HubGoogleAdsApiException('campaign_replacement_expired', 409);
        $source = $plan['source'] ?? [];
        if (($source['manager_id'] ?? null) !== $managerId || ($source['customer_id'] ?? null) !== $customerId || ($source['campaign_id'] ?? null) !== $campaignId) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        if (($plan['state'] ?? null) === 'completed') return ['ok' => true, 'schema_version' => 1, 'operation' => 'campaign_duplication_replace_execute',
            'replaced' => true, 'verified' => true, 'source_campaign_id' => $campaignId, 'source_campaign_name' => (string)$source['campaign_name'],
            'source_status' => 'PAUSED', 'replacement_campaign_id' => (string)$plan['replacement']['campaign_id'],
            'replacement_campaign_name' => (string)$plan['replacement']['campaign_name'], 'replacement_status' => 'ENABLED',
            'verified_at_utc' => (string)$plan['verified_at_utc']];
        if ((int)($plan['expires_at'] ?? 0) < time()) throw new HubGoogleAdsApiException('campaign_replacement_expired', 409);
        if (($plan['state'] ?? null) !== 'ready') throw new HubGoogleAdsApiException('campaign_replacement_already_attempted', 409);
        if (!hub_google_ads_campaign_creation_enabled($config) || !hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
            throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
        }
        $token = hub_google_ads_access_token(hub_google_ads_credentials());
        hub_google_ads_campaign_duplication_validate_access($config, $token, $managerId, $customerId);
        $current = hub_google_ads_campaign_duplication_query_bundle($managerId, $customerId, $campaignId, $token, true);
        if (($current['campaign']['status'] ?? null) !== 'ENABLED' || $current['blockers']
            || hub_google_ads_campaign_duplication_replacement_source_version($current) !== ($plan['source_version'] ?? null)) {
            throw new HubGoogleAdsApiException('campaign_replacement_changed', 409);
        }
        $currentSchedule = hub_google_ads_campaign_duplication_replacement_schedule($current);
        if ($currentSchedule !== ($plan['replacement']['schedule'] ?? null)) throw new HubGoogleAdsApiException('campaign_replacement_expired', 409);
        if (hub_google_ads_campaign_duplication_replacement_name_exists($managerId, $customerId, $token, (string)$plan['replacement']['campaign_name'])) {
            throw new HubGoogleAdsApiException('campaign_replacement_name_exists', 409);
        }
        $entry = ['campaign_name' => (string)$plan['replacement']['campaign_name'], 'cpa_micros' => (string)$plan['replacement']['cpa_micros'],
            'pre_sell_url' => '', 'user_list_resource_map' => (array)$plan['user_list_resource_map'],
            'replacement_schedule' => (array)$plan['replacement']['schedule']];
        $operations = hub_google_ads_campaign_duplication_operations($current, $entry, $customerId,
            (int)(hub_google_ads_campaign_duplication_parse_name((string)$source['campaign_name'])['iteration'] ?? 0), 'ENABLED', true, $campaignId);
        $plan['state'] = 'mutating';
        hub_google_ads_campaign_duplication_plan_write_handle($handle, $plan);
        try {
            $result = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $token,
                json_encode(['mutateOperations' => $operations, 'partialFailure' => false], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
        } catch (Throwable $error) {
            $plan['state'] = $error instanceof HubGoogleAdsApiException
                && in_array($error->apiCode, ['google_ads_request_rejected', 'google_ads_access_denied', 'google_ads_quota_exceeded'], true) ? 'failed' : 'uncertain';
            $plan['failure_code'] = $error instanceof HubGoogleAdsApiException ? $error->apiCode : 'unknown';
            hub_google_ads_campaign_duplication_plan_write_handle($handle, $plan);
            if ($error instanceof HubGoogleAdsApiException) throw $error;
            throw new HubGoogleAdsApiException('campaign_replacement_unverified', 502);
        }
        $responses = $result['mutateOperationResponses'] ?? null;
        $resourceName = is_array($responses) ? ($responses[1]['campaignResult']['resourceName'] ?? null) : null;
        if (!is_string($resourceName) || preg_match('#^customers/' . preg_quote($customerId, '#') . '/campaigns/([1-9][0-9]{0,19})$#D', $resourceName, $matches) !== 1) {
            $plan['state'] = 'uncertain'; hub_google_ads_campaign_duplication_plan_write_handle($handle, $plan);
            throw new HubGoogleAdsApiException('campaign_replacement_unverified', 502);
        }
        $replacementId = $matches[1]; $plan['replacement']['campaign_id'] = $replacementId;
        try {
            $sourceAfter = hub_google_ads_campaign_action_read($token, $managerId, $customerId, $campaignId);
            $replacementAfter = hub_google_ads_campaign_action_read($token, $managerId, $customerId, $replacementId);
            $replacementBundle = hub_google_ads_campaign_duplication_query_bundle($managerId, $customerId, $replacementId, $token, true);
        } catch (Throwable $error) { $sourceAfter = $replacementAfter = $replacementBundle = null; }
        $verified = is_array($sourceAfter) && is_array($replacementAfter) && is_array($replacementBundle)
            && $sourceAfter['name'] === (string)$source['campaign_name'] && $sourceAfter['status'] === 'PAUSED'
            && $replacementAfter['name'] === (string)$plan['replacement']['campaign_name'] && $replacementAfter['status'] === 'ENABLED'
            && $replacementAfter['channel_type'] === 'SEARCH' && !$replacementBundle['blockers']
            && (string)($replacementBundle['campaign']['startDateTime'] ?? '') === (string)$plan['replacement']['schedule']['start_date_time']
            && (empty($plan['replacement']['schedule']['end_date'])
                ? ((string)($replacementBundle['campaign']['endDateTime'] ?? '') === '' || substr((string)$replacementBundle['campaign']['endDateTime'], 0, 10) > (string)$plan['replacement']['schedule']['start_date'])
                : (string)($replacementBundle['campaign']['endDateTime'] ?? '') === (string)$plan['replacement']['schedule']['end_date_time'])
            && hub_google_ads_campaign_duplication_replacement_resource_counts($current) === hub_google_ads_campaign_duplication_replacement_resource_counts($replacementBundle)
            && (string)($replacementBundle['campaign']['maximizeConversions']['targetCpaMicros'] ?? '') === (string)$plan['replacement']['cpa_micros']
            && (string)($replacementBundle['budget']['amountMicros'] ?? '') === (string)$current['budget']['amountMicros']
            && hub_google_ads_campaign_duplication_replacement_fingerprint($current, false) === hub_google_ads_campaign_duplication_replacement_fingerprint($replacementBundle, false);
        if (!$verified) {
            $plan['state'] = 'uncertain'; hub_google_ads_campaign_duplication_plan_write_handle($handle, $plan);
            throw new HubGoogleAdsApiException('campaign_replacement_unverified', 502);
        }
        $verifiedAt = gmdate('Y-m-d\TH:i:s\Z'); $plan['state'] = 'completed'; $plan['verified_at_utc'] = $verifiedAt;
        hub_google_ads_campaign_duplication_plan_write_handle($handle, $plan);
        return ['ok' => true, 'schema_version' => 1, 'operation' => 'campaign_duplication_replace_execute', 'replaced' => true, 'verified' => true,
            'source_campaign_id' => $campaignId, 'source_campaign_name' => $sourceAfter['name'], 'source_status' => 'PAUSED',
            'replacement_campaign_id' => $replacementId, 'replacement_campaign_name' => $replacementAfter['name'],
            'replacement_status' => 'ENABLED', 'verified_at_utc' => $verifiedAt];
    } finally { flock($handle, LOCK_UN); fclose($handle); }
}
