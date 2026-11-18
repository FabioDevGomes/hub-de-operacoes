// Pure planning logic: this module never contacts Google Ads or changes saved data.
export function planCpaExpansion({ accounts, percents, campaigns, parseCampaignName }) {
  if (!Array.isArray(accounts) || !Array.isArray(percents) || !Array.isArray(campaigns) || typeof parseCampaignName !== 'function') {
    throw new TypeError('Dados incompletos para planejar a ampliação do lote.');
  }
  const digits = value => String(value || '').replace(/\D/g, '');
  const selected = new Map();
  for (const account of accounts) {
    const accountId = digits(account?.accountId);
    if (!/^\d{10}$/.test(accountId) || selected.has(accountId)) throw new Error('Conta inválida ou selecionada mais de uma vez.');
    let url;
    try { url = new URL(account.finalUrl); } catch { throw new Error('A conta ' + accountId + ' precisa de uma URL final HTTPS.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('A conta ' + accountId + ' precisa de uma URL final HTTPS.');
    selected.set(accountId, { ...account, accountId });
  }
  const ranges = [...new Set(percents.map(Number))].sort((a, b) => a - b);
  if (!selected.size || !ranges.length || ranges.some(value => !Number.isFinite(value) || value <= 0 || value > 100)) {
    throw new Error('Selecione contas e faixas de CPA válidas.');
  }
  const existing = new Map();
  for (const campaign of campaigns) {
    const accountId = digits(campaign?.customerId);
    if (!selected.has(accountId)) continue;
    const parsed = parseCampaignName(campaign.campaignName);
    const percent = Number(parsed?.targetCpaPercent);
    if (!parsed?.ok || !Number.isFinite(percent) || percent <= 0 || percent > 100) {
      throw new Error('Não foi possível identificar a faixa de CPA de uma campanha da conta ' + accountId + '. Confira o lote antes de continuar.');
    }
    const key = accountId + ':' + percent;
    if (!existing.has(key)) existing.set(key, []);
    existing.get(key).push(campaign);
  }
  const toCreate = [], alreadyExists = [];
  for (const account of selected.values()) {
    for (const percent of ranges) {
      const matches = existing.get(account.accountId + ':' + percent) || [];
      const entry = { account, percent };
      if (matches.length) alreadyExists.push({ ...entry, campaigns: matches });
      else toCreate.push(entry);
    }
  }
  return { toCreate, alreadyExists };
}
