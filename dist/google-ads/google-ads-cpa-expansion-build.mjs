export function buildCpaExpansionEntries({ plan, basePayload, source, firstIteration, makeName, calculateCpa }) {
  if (!Array.isArray(plan?.toCreate) || !plan.toCreate.length || !basePayload || !source?.product || !Number.isInteger(firstIteration) || firstIteration < 1 || typeof makeName !== 'function' || typeof calculateCpa !== 'function') throw new Error('A configuração da ampliação está incompleta.');
  if (!['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'].includes(basePayload.biddingStrategy)) throw new Error('A ampliação por faixa exige estratégia de CPA.');
  return plan.toCreate.map((row, index) => {
    const iteration = firstIteration + index;
    if (iteration > 999) throw new Error('A numeração disponível para o produto foi esgotada.');
    const target = row.account;
    if (!/^\d{10}$/.test(String(target.managerCustomerId || '')) || !/^[A-Z]{3}$/.test(String(target.currencyCode || ''))) throw new Error('Confira a MCC e a moeda da conta ' + target.accountId + '.');
    const cpa = calculateCpa({ commission: source.commission, percent: row.percent, sourceCurrency: source.currency, targetCurrency: target.currencyCode, usdBrlRate: source.usdBrlRate });
    if (!cpa?.targetAmount) throw new Error('Não foi possível calcular o CPA para a conta ' + target.accountId + '.');
    const campaignName = makeName(basePayload.campaignName, iteration, row.percent);
    if (!campaignName) throw new Error('Não foi possível gerar um nome para a campanha.');
    return { id: target.accountId + ':' + row.percent + ':' + iteration, percent: row.percent, iteration, product: source.product, accountName: target.account?.name || target.accountId, payload: { ...basePayload, managerCustomerId: target.managerCustomerId, customerId: target.accountId, campaignName, finalUrl: target.finalUrl, targetCpa: cpa.targetAmount, targetCpaCurrency: target.currencyCode } };
  });
}
