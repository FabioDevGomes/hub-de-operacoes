import { createAssetDeliveryLabClient } from './asset-delivery-central-lab.mjs';
import { createAssetCaptureLabBridge } from './asset-capture-central-lab.mjs';
import { createAssetPageHandoffLab } from './passagem-asset-central-lab.mjs';
import { encodeMigrationValue } from '../overview/migration-serialization.mjs';
import { reconstructTagged } from '../curadoria/reconstruct-types.mjs';

// A criação destes clientes não configura a tela nem ativa o modo central.
export function createAssetCentralClients({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Serviço central indisponível');
  const request = async (path, input) => {
    let response;
    try {
      response = await fetchImpl(`/central${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    } catch {
      throw new Error('Serviço central indisponível');
    }
    if (!response.ok) {
      const error = new Error(response.status === 409 ? 'Dados alterados em outra sessão; atualize a tela.' : 'Serviço central recusou a operação');
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
  return {
    delivery: createAssetDeliveryLabClient({ request }),
    capture: createAssetCaptureLabBridge({ request, encode: encodeMigrationValue, decode }),
    handoff: createAssetPageHandoffLab({ request }),
  };
}
