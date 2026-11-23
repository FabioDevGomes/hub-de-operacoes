// Cópia explícita por lote, armazenada pelo serviço transacional central existente.
const PREFIX = 'hub:campaign-snapshot:v1:';
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);

export function createCampaignSnapshotClient({request}) {
  if (typeof request !== 'function') throw new TypeError('Serviço central indisponível.');
  async function list() {
    let offset = 0, revision;
    const snapshots = [];
    while (offset !== null) {
      const input = {operations:[{type:'local_list',input:{prefix:PREFIX,offset,limit:100}}],...(revision === undefined ? {} : {expectedRevision:revision})};
      const result = await request('/transaction/read',input);
      const row = result?.results?.[0];
      if (!Number.isSafeInteger(result?.revision) || (revision !== undefined && revision !== result.revision) || result.results?.length !== 1 || row?.revision !== result.revision || !Array.isArray(row.records) || (row.nextOffset !== null && (!Number.isInteger(row.nextOffset) || row.nextOffset <= offset))) throw new Error('Listagem central incompleta.');
      revision = result.revision;
      for (const record of row.records) {
        if (typeof record?.key !== 'string' || !record.key.startsWith(PREFIX) || typeof record.value !== 'string') throw new Error('Cópia central inválida.');
        const snapshot = JSON.parse(record.value);
        if (snapshot?.schemaVersion !== 1 || !validId(snapshot.batchId) || record.key !== PREFIX + snapshot.batchId || !snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data)) throw new Error('Cópia central inválida.');
        snapshots.push(snapshot);
      }
      offset = row.nextOffset;
    }
    return {revision,snapshots};
  }
  async function read(id) {
    if (!validId(id)) throw new Error('Identificador de lote inválido.');
    const key = PREFIX + id;
    const result = await request('/transaction/read', {operations:[{type:'local_get',input:{key}}]});
    const row = result?.results?.[0];
    if (!Number.isSafeInteger(result?.revision) || result.results?.length !== 1 || row?.revision !== result.revision || !['present','absent'].includes(row?.state)) throw new Error('Leitura da cópia não confirmada.');
    let snapshot = null;
    if (row.state === 'present') {
      snapshot = JSON.parse(row.value);
      if (snapshot?.schemaVersion !== 1 || snapshot?.batchId !== id || !snapshot?.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data)) throw new Error('Cópia central inválida.');
    }
    return {revision:result.revision,raw:row.state === 'present' ? row.value : null,snapshot};
  }
  async function save(id, data, previous, savedAt = new Date().toISOString()) {
    if (!validId(id) || !data || typeof data !== 'object' || Array.isArray(data) || !previous || !Number.isSafeInteger(previous.revision) || (previous.raw !== null && typeof previous.raw !== 'string') || !Number.isFinite(Date.parse(savedAt))) throw new Error('Dados da cópia inválidos.');
    const value = JSON.stringify({schemaVersion:1,batchId:id,savedAt,data});
    const input = {key:PREFIX+id,value,expectedState:previous.raw === null ? 'absent' : 'present',...(previous.raw === null ? {} : {expectedValue:previous.raw})};
    const result = await request('/transaction',{expectedRevision:previous.revision,operations:[{type:'local_put',input}]});
    if (!Number.isSafeInteger(result?.revision) || result.results?.length !== 1 || result.results[0]?.revision !== result.revision) throw new Error('Gravação da cópia não confirmada.');
    return {revision:result.revision,raw:value,snapshot:JSON.parse(value)};
  }
  return {list,read,save};
}

export async function recordConfirmedCampaign(client, snapshotId, campaign) {
  if (!client?.read || !client?.save || !validId(snapshotId) || !campaign || typeof campaign !== 'object' || !String(campaign.customerId || '').trim() || !String(campaign.campaignId || '').trim()) throw new Error('Resultado confirmado incompleto.');
  const previous = await client.read(snapshotId);
  if (!previous.snapshot?.data?.preview) throw new Error('Prévia central não encontrada.');
  const data = previous.snapshot.data;
  if (data.createdCampaigns !== undefined && !Array.isArray(data.createdCampaigns)) throw new Error('Resultados centrais inválidos.');
  const campaigns = data.createdCampaigns || [];
  const index = campaigns.findIndex(item => String(item.customerId) === String(campaign.customerId) && String(item.campaignId) === String(campaign.campaignId));
  if (index >= 0) {
    if (JSON.stringify(campaigns[index]) !== JSON.stringify(campaign)) throw new Error('Resultado existente diverge; confira antes de continuar.');
    return previous;
  }
  return client.save(snapshotId, {...data,createdCampaigns:[...campaigns,campaign]}, previous);
}

export async function recordCampaignStatus(client, snapshotId, campaign) {
  if (!client?.read || !client?.save || !validId(snapshotId) || !campaign?.statusActionResult?.verified || !String(campaign.customerId || '').trim() || !String(campaign.campaignId || '').trim()) throw new Error('Status confirmado incompleto.');
  const previous = await client.read(snapshotId);
  const data = previous.snapshot?.data;
  if (!Array.isArray(data?.createdCampaigns)) throw new Error('Campanhas centrais não encontradas.');
  const index = data.createdCampaigns.findIndex(item => String(item.customerId) === String(campaign.customerId) && String(item.campaignId) === String(campaign.campaignId));
  if (index < 0) throw new Error('Campanha não encontrada na cópia central.');
  const campaigns = [...data.createdCampaigns];
  const current = campaigns[index];
  const history = current.statusHistory === undefined ? [] : current.statusHistory;
  if (!Array.isArray(history)) throw new Error('Histórico de status inválido.');
  const action = structuredClone(campaign.statusActionResult);
  campaigns[index] = {...current,status:campaign.status,statusActionResult:action,statusHistory:[...history,action]};
  return client.save(snapshotId,{...data,createdCampaigns:campaigns},previous);
}
