const digits = value => String(value ?? '').replace(/\D/g, '');
const accountId = value => {
  const id = digits(value);
  return /^\d{10}$/.test(id) ? id : null;
};
const idsFromManagerLabel = value => [...new Set((String(value ?? '').match(/\d{3}[-\s]?\d{3}[-\s]?\d{4}/g) || [])
  .map(accountId).filter(Boolean))];

const apiStatusLabels = Object.freeze({
  ENABLED:'Ativa',
  SUSPENDED:'Suspensa',
  CLOSED:'Encerrada',
  CANCELED:'Cancelada',
  UNKNOWN:'Desconhecido',
  UNSPECIFIED:'Não informado',
});

function directoryData(directory) {
  const accounts = Array.isArray(directory?.accounts?.accounts)
    ? directory.accounts
    : directory;
  return {
    accounts:Array.isArray(accounts?.accounts) ? accounts.accounts : [],
    warningCount:Math.max(0, Math.trunc(Number(accounts?.warningCount) || 0)),
  };
}

function apiStatusFor(apiAccount, localStatus) {
  const status = String(apiAccount?.status ?? '').trim().toUpperCase();
  const label = apiStatusLabels[status] || (status ? status : 'Não informado');
  const localLabel = localStatus === 'active' ? 'Ativa' : localStatus === 'suspended' ? 'Suspensa' : '';
  if (!status || status === 'UNKNOWN' || status === 'UNSPECIFIED') {
    return {state:'unknown',label:`API: ${label}${localLabel ? ` · local: ${localLabel}` : ''}`};
  }
  const expectedLocalStatus = status === 'ENABLED' ? 'active' : status === 'SUSPENDED' ? 'suspended' : null;
  if (!localStatus) return {state:'unknown',label:`API: ${label} · status local não definido`};
  if (expectedLocalStatus === localStatus) return {state:'match',label:`API: ${label} · local confere`};
  return {state:'mismatch',label:`API: ${label} · local: ${localLabel || 'não comparável'}`};
}

function managerLinkFor(row, apiAccount) {
  const localManagerIds = idsFromManagerLabel(row?.mcc);
  const apiManagerId = accountId(apiAccount?.managerCustomerId);
  if (!localManagerIds.length) return {state:'unknown',label:'MCC local não identificada'};
  if (!apiManagerId) return {state:'unknown',label:'MCC não confirmada pela API'};
  if (localManagerIds.includes(apiManagerId)) return {state:'match',label:'MCC confere'};
  return {state:'mismatch',label:'MCC divergente'};
}

export function validateAccountDirectoryRows(rows = [], directory = null, localStatuses = {}) {
  const {accounts, warningCount} = directoryData(directory);
  const hasDirectory = Boolean(directory && (Array.isArray(directory?.accounts?.accounts) || Array.isArray(directory?.accounts)));
  const apiByCustomerId = new Map(accounts.flatMap(item => {
    const id = accountId(item?.customerId);
    return id ? [[id, item]] : [];
  }));
  const localIds = new Set((Array.isArray(rows) ? rows : []).map(row => accountId(row?.account)).filter(Boolean));
  const results = new Map();

  if (!hasDirectory) {
    for (const row of Array.isArray(rows) ? rows : []) {
      results.set(String(row?.account ?? ''), {
        account:{state:'unverified',label:'Ainda não consultada'},
        mcc:{state:'unknown',label:'Ainda não consultada'},
        status:{state:'unknown',label:'Ainda não consultada'},
      });
    }
    return {results,summary:{localCount:localIds.size,foundCount:0,notFoundCount:0,inconclusiveCount:0,mccMismatchCount:0,statusMismatchCount:0,apiOnlyCount:0,warningCount:0}};
  }

  for (const row of Array.isArray(rows) ? rows : []) {
    const id = accountId(row?.account);
    const apiAccount = id ? apiByCustomerId.get(id) : null;
    if (!apiAccount) {
      const state = warningCount ? 'inconclusive' : 'not-found';
      results.set(String(row?.account ?? ''), {
        account:{state,label:warningCount ? 'Não confirmada · avisos na consulta' : 'Não localizada no escopo'},
        mcc:{state:'unknown',label:'Sem dados da API'},
        status:{state:'unknown',label:'Sem dados da API'},
      });
      continue;
    }
    results.set(String(row?.account ?? ''), {
      account:{state:'match',label:'Conta localizada'},
      mcc:managerLinkFor(row, apiAccount),
      status:apiStatusFor(apiAccount, localStatuses?.[row.account]),
    });
  }

  const rowResults = [...results.values()];
  return {
    results,
    summary:{
      localCount:localIds.size,
      foundCount:rowResults.filter(item => item.account.state === 'match').length,
      notFoundCount:rowResults.filter(item => item.account.state === 'not-found').length,
      inconclusiveCount:rowResults.filter(item => item.account.state === 'inconclusive').length,
      mccMismatchCount:rowResults.filter(item => item.mcc.state === 'mismatch').length,
      statusMismatchCount:rowResults.filter(item => item.status.state === 'mismatch').length,
      apiOnlyCount:accounts.filter(item => {
        const id = accountId(item?.customerId);
        return id && !localIds.has(id);
      }).length,
      warningCount,
    },
  };
}
