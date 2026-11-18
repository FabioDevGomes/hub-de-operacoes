const WEBSITES_ENDPOINT = '/api/hostinger/websites';

export async function refreshHostingerSitesDirectory({fetchImpl = globalThis.fetch} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('O servidor local do Hub não está disponível.');

  let response;
  try {
    response = await fetchImpl(WEBSITES_ENDPOINT, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {Accept: 'application/json'},
    });
  } catch {
    throw new Error('Não foi possível acessar a API local do Hub. Confira se o painel está aberto pelo iniciar-painel.cmd.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('O servidor local retornou uma resposta ilegível.');
  }
  if (!response.ok) throw new Error(String(payload?.error || `A conexão respondeu com erro HTTP ${response.status}.`));

  return {
    ...payload,
    sites: Array.isArray(payload?.sites) ? payload.sites : [],
    checkedAtUtc: String(payload?.checkedAtUtc || ''),
  };
}
