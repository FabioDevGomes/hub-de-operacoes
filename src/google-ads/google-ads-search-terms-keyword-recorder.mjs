function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function customerDigits(value) {
  const valueDigits = digits(value);
  return valueDigits && valueDigits.length <= 10 ? valueDigits.padStart(10, '0') : valueDigits;
}

function campaignName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function resolveSearchTermsDiaryCampaignId({ database, inventory, managerCustomerId, result } = {}) {
  const manager = customerDigits(managerCustomerId);
  const customerId = customerDigits(result?.customer_id ?? result?.customerId);
  const campaignId = String(result?.campaign_id ?? result?.campaignId ?? '');
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customerId) || !/^[1-9]\d{0,19}$/.test(campaignId)) return '';

  const mappings = [...(inventory instanceof Map ? inventory.entries() : [])]
    .filter(([, mapping]) => mapping?.mappingStatus === 'mapped'
      && customerDigits(mapping.managerCustomerId) === manager
      && customerDigits(mapping.customerId) === customerId
      && String(mapping.campaignId ?? '') === campaignId);
  if (mappings.length === 1) return String(mappings[0][0]);
  if (mappings.length > 1) return '';

  const name = campaignName(result?.campaign_name ?? result?.campaignName);
  if (!name) return '';
  const candidates = (Array.isArray(database?.campanhas) ? database.campanhas : [])
    .filter(campaign => customerDigits(campaign?.conta_id) === customerId
      && customerDigits(campaign?.mcc_id) === manager
      && campaignName(campaign?.nome_mcc) === name);
  return candidates.length === 1 ? String(candidates[0].id ?? '') : '';
}

export async function recordGoogleAdsSearchTermsKeywordAdditions({
  database, managerCustomerId, term, matchType, occurredAtUtc, results, inventory,
  openDatabase, storage, domain, onSaved = null,
} = {}) {
  const inputs = [];
  let unresolvedCount = 0;
  for (const item of Array.isArray(results) ? results : []) {
    const campaignId = resolveSearchTermsDiaryCampaignId({ database, inventory, managerCustomerId, result: item });
    if (!campaignId) {
      unresolvedCount += 1;
      continue;
    }
    inputs.push({ campaignId, term, matchType, kind: 'negative', source: 'search_terms', occurredAtUtc });
  }
  if (!inputs.length) {
    return { recorded: false, recordedCount: 0, unresolvedCount, reason: 'Não foi encontrado um vínculo único entre a resposta do Google Ads e uma campanha do Diário local.' };
  }

  const saved = await storage.appendCampaignKeywordAddedEvents({ openDatabase, domain, inputs });
  if (saved.changed) await onSaved?.(saved);
  return {
    recorded: unresolvedCount === 0 && inputs.length === (Array.isArray(results) ? results.length : 0),
    recordedCount: inputs.length,
    unresolvedCount,
    changed: saved.changed,
    reason: unresolvedCount ? 'Uma ou mais campanhas não puderam ser associadas com segurança ao Diário local.' : '',
  };
}
