const campaignIdPattern = /^[1-9]\d{0,19}$/;

function validFinalUrl(value) {
  const candidate = String(value ?? '').trim();
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return '';
    return candidate;
  } catch {
    return '';
  }
}

export function googleAdsCampaignBatchFinalUrlIndex(snapshot) {
  const latest = new Map();
  const batches = Array.isArray(snapshot?.batches) ? snapshot.batches : [];
  for (const batch of batches) {
    const updatedAt = Date.parse(batch?.updatedAt || batch?.createdAt || '') || 0;
    const destinations = Array.isArray(batch?.destinationUrls) ? batch.destinationUrls : [];
    for (const campaign of Array.isArray(batch?.campaigns) ? batch.campaigns : []) {
      const customerId = String(campaign?.customerId ?? '').replace(/\D/g, '');
      const campaignId = String(campaign?.campaignId ?? '');
      if (!/^\d{10}$/.test(customerId) || !campaignIdPattern.test(campaignId)) continue;

      const destination = destinations.find(item => String(item?.accountId ?? '').replace(/\D/g, '') === customerId);
      const destinationUrlValue = String(destination?.url ?? '').trim();
      const destinationUrl = validFinalUrl(destinationUrlValue);
      const destinationSignature = JSON.stringify([customerId, destinationUrlValue]);
      const destinationVerified = Boolean(destinationUrl)
        && campaign?.destinationUrlResult?.verified === true
        && campaign.destinationUrlResult.signature === destinationSignature;
      const url = destinationVerified ? destinationUrl : validFinalUrl(campaign?.finalUrl);
      const key = `${customerId}:${campaignId}`;
      const previous = latest.get(key);
      if (!previous || updatedAt > previous.updatedAt) {
        latest.set(key, { url, updatedAt, ambiguous: false });
      } else if (updatedAt === previous.updatedAt && previous.url !== url) {
        latest.set(key, { url: '', updatedAt, ambiguous: true });
      }
    }
  }
  return new Map([...latest].flatMap(([key, item]) => item.url && !item.ambiguous ? [[key, item.url]] : []));
}
