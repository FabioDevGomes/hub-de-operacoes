// Cliente para a tela de entrega. Não ativa a base central por conta própria.
export function createCentralDeliveryClient({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Serviço central indisponível.');

  async function request(path, input) {
    const response = await fetchImpl(`/central${path}`, input === undefined
      ? { cache: 'no-store', headers: { 'X-Hub-Lab': '1' } }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 409 ? 'Dados alterados; atualize a tela.' : 'Serviço central indisponível.');
    return response.json();
  }

  return {
    async list() {
      const result = await request('/transaction/read', { operations: [{ type: 'delivery_list', input: {} }] });
      const row = result?.results?.[0];
      if (!Number.isSafeInteger(result?.revision) || result.results.length !== 1 || row?.revision !== result.revision || row.state !== 'present' || !Array.isArray(row.value)) throw new Error('Resposta de entregas inválida.');
      return { revision: result.revision, deliveries: row.value };
    },
    async progress(id, revision) {
      const result = await request(`/progress/${encodeURIComponent(id)}`);
      if (result?.revision !== revision || !result.progress || typeof result.progress !== 'object') throw new Error('Andamento indisponível ou alterado; atualize a tela.');
      return result.progress;
    },
    async update(revision, operation, args) {
      const result = await request('/transaction', { expectedRevision: revision, operations: [{ type: 'delivery_operation', input: { operation, args } }] });
      if (!Number.isSafeInteger(result?.revision) || result.results?.length !== 1 || result.results[0]?.revision !== result.revision) throw new Error('Operação central não confirmada.');
      return result;
    },
  };
}
