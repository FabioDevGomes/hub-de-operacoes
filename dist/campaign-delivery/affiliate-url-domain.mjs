export function normalizeAffiliateUrl(value) {
  if (typeof value !== 'string') return null;
  const link = value.trim();
  if (!link || link.length > 4096) return null;
  try {
    const url = new URL(link);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password
      ? link
      : null;
  } catch { return null; }
}
