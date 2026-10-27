const CUSTOMER_ID_PATTERN = /^\d{10}$/;
const RESOURCE_NAME_PATTERN = /^customers\/(\d{10})\/conversionActions\/(\d{1,20})$/;
const MAX_ACTIONS = 500;

function text(value, limit = 255) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function customerId(value, field) {
  const normalized = String(value ?? '').replace(/\D/g, '');
  if (!CUSTOMER_ID_PATTERN.test(normalized)) throw new Error(`O identificador ${field} da MCC retornado pelo servidor é inválido.`);
  return normalized;
}

export function normalizeGoogleAdsConversionActions(payload, { managerCustomerId, customerId: expectedCustomerId } = {}) {
  const expectedManager = customerId(managerCustomerId, 'manager');
  const expectedCustomer = customerId(expectedCustomerId ?? managerCustomerId, 'customer');
  if (!payload || payload.ok !== true || payload.schema_version !== 1 || !Array.isArray(payload.actions)) {
    throw new Error('O servidor retornou uma lista de ações de conversão inválida.');
  }
  if (payload.actions.length > MAX_ACTIONS) {
    throw new Error('A MCC tem mais de 500 ações de conversão. Reduza o inventário no serviço antes de continuar.');
  }
  const responseManager = customerId(payload.manager_customer_id, 'manager');
  const responseCustomer = customerId(payload.customer_id, 'customer');
  if (responseManager !== expectedManager || responseCustomer !== expectedCustomer) {
    throw new Error('O servidor respondeu com ações de outra MCC; nenhuma associação foi aplicada.');
  }
  if (typeof payload.generated_at_utc !== 'string' || !Number.isFinite(Date.parse(payload.generated_at_utc))) {
    throw new Error('O servidor retornou um horário inválido para as ações de conversão.');
  }
  const actions = payload.actions.map(item => {
    const id = text(item?.id, 20);
    const resourceName = text(item?.resource_name, 100);
    const match = RESOURCE_NAME_PATTERN.exec(resourceName);
    if (!/^\d{1,20}$/.test(id) || !match || match[1] !== expectedCustomer || match[2] !== id) {
      throw new Error('O servidor retornou uma ação com identificador ou recurso inválido.');
    }
    const name = text(item?.name);
    const status = text(item?.status, 32).toUpperCase();
    const type = text(item?.type, 64).toUpperCase();
    const category = text(item?.category, 64).toUpperCase();
    const origin = text(item?.origin, 64).toUpperCase();
    const ownerCustomer = item?.owner_customer == null ? '' : text(item.owner_customer, 80);
    if (!name || !status || !type || !category
        || (ownerCustomer && !/^customers\/\d{10}$/.test(ownerCustomer))) {
      throw new Error('O servidor retornou campos incompletos para uma ação de conversão.');
    }
    const defaultCurrencyCode = text(item?.default_currency_code, 3).toUpperCase();
    if (defaultCurrencyCode && !/^[A-Z]{3}$/.test(defaultCurrencyCode)) {
      throw new Error('O servidor retornou uma moeda padrão inválida para uma ação de conversão.');
    }
    return {
      id,
      resourceName,
      name,
      status,
      type,
      category,
      origin,
      ownerCustomer,
      primaryForGoal: item?.primary_for_goal === true,
      includeInConversionsMetric: item?.include_in_conversions_metric === true,
      defaultCurrencyCode,
    };
  }).sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  if (new Set(actions.map(action => action.resourceName)).size !== actions.length) {
    throw new Error('O servidor retornou ações duplicadas. Nenhuma associação foi aplicada.');
  }
  return {
    managerCustomerId: responseManager,
    customerId: responseCustomer,
    generatedAtUtc: new Date(payload.generated_at_utc).toISOString(),
    actions,
  };
}

export function isGoogleAdsPurchaseUploadAction(action) {
  return Boolean(action && action.status === 'ENABLED' && action.type === 'UPLOAD_CLICKS' && action.category === 'PURCHASE');
}
