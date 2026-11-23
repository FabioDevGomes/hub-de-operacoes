import {createAssetCentralClients} from './asset-central-client.mjs';

const response = await fetch('/api/presell/health', {cache:'no-store'});
if (!response.ok) throw new Error('Não foi possível identificar o armazenamento do Asset Studio.');
const health = await response.json();
if (health.centralWriteProxy === true) {
  const clients = createAssetCentralClients();
  globalThis.__HUB_CENTRAL_LAB_MODE__ = true;
  globalThis.__HUB_CENTRAL_LAB_DELIVERY__ = clients.delivery;
  globalThis.__HUB_CENTRAL_LAB_ASSET_BRIDGE__ = clients.capture;
  globalThis.__HUB_CENTRAL_LAB_ASSET_HANDOFF__ = clients.handoff;
}
await import('./app.js?v=18');
