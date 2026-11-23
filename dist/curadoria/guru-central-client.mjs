import { createCurationBridge } from './curadoria-central-lab.mjs';
import { reconstructTagged } from './reconstruct-types.mjs';
import { encodeMigrationValue } from '../overview/migration-serialization.mjs';
import { createCurationDeliveryClient } from './entrega-central-client.mjs';

// A criação do cliente não configura o storage nem ativa o modo central.
export function createGuruCentralClient({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Serviço central indisponível');
  const request = async (path, input) => {
    let response;
    try {
      response = await fetchImpl(`/central${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
      });
    } catch {
      throw new Error('Serviço central indisponível');
    }
    if (!response.ok) {
      const error = new Error(response.status === 409 ? 'Conflito de revisão' : 'Serviço central recusou a operação');
      error.code = response.status === 409 ? 'VERSION_CONFLICT' : 'CENTRAL_ERROR';
      throw error;
    }
    return response.json();
  };
  const decode = async (value, readBinary) => {
    const result = await reconstructTagged(value, readBinary);
    if (result.losses.length) throw new Error('Reconstrução incompleta');
    return result.value;
  };
  return createCurationBridge({ request, encode: encodeMigrationValue, decode });
}

// A montagem futura recebe ambos os clientes; este passo não altera os storages.
export function createCurationCentralClients(options) {
  const bridge = createGuruCentralClient(options);
  return { bridge, delivery: createCurationDeliveryClient(bridge) };
}
