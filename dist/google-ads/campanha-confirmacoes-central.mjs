import {campaignSetSignature, campaignDeliverySettingsVerified, sharedStepStatus} from '../campaign-delivery/progress-domain.mjs?v=8';

// Apenas confirmações derivadas do lote local; não modifica campanhas nem publica dados no Google Ads.
export async function syncCampaignConfirmations(client, snapshot, batches, {isExpansionBlocked = () => true} = {}) {
  const data = snapshot?.data;
  const signature = campaignSetSignature(data?.createdCampaigns);
  if (!signature || !data?.deliveryId) return false;
  const matches = batches.filter(batch => batch?.draftId === snapshot.batchId
    && batch?.formSnapshot?.__hub_campaign_delivery_source?.deliveryId === data.deliveryId
    && campaignSetSignature(batch.campaigns) === signature);
  if (matches.length !== 1) return false;
  const batch = matches[0];
  const previous = await client.read(snapshot.batchId);
  const latest = previous.snapshot?.data;
  if (!latest || latest.deliveryId !== data.deliveryId || campaignSetSignature(latest.createdCampaigns) !== signature) throw Error('As campanhas centrais mudaram; atualize antes de sincronizar.');
  const old = latest.workflowStatus;
  if (old && old.batchId !== batch.id) throw Error('Outra confirmação de lote já está registrada; confira antes de substituir.');
  const workflowStatus = {batchId:batch.id, campaignSet:signature, shared:sharedStepStatus(batch), campaignSettings:batch.campaigns.every(campaignDeliverySettingsVerified), expansionBlocked:isExpansionBlocked(batch.id) !== false, updatedAt:batch.updatedAt};
  if (old && Date.parse(old.updatedAt) > Date.parse(workflowStatus.updatedAt)) throw Error('A confirmação central é mais recente; confira os lotes.');
  if (JSON.stringify(old) === JSON.stringify(workflowStatus)) return false;
  await client.save(snapshot.batchId, {...latest, workflowStatus}, previous);
  return true;
}

export function progressWithCentralConfirmations(progress, snapshot) {
  const data = snapshot?.data, state = data?.workflowStatus;
  const signature = campaignSetSignature(data?.createdCampaigns);
  if (!progress || progress.batch || progress.ambiguous || !signature || state?.campaignSet !== signature || !state.batchId || typeof state.campaignSettings !== 'boolean' || typeof state.expansionBlocked !== 'boolean') return progress;
  const shared = state.shared;
  if (!shared || !['targeting','exclusions','images','sitelinks'].every(key => typeof shared[key] === 'boolean')) return progress;
  const expansionBlocked = state.expansionBlocked || progress.expansionBlocked;
  const campaign = state.campaignSettings && !expansionBlocked;
  return {...progress, expansionBlocked, batch:{id:state.batchId,campaigns:data.createdCampaigns}, campaignSettings:state.campaignSettings, campaign, shared,
    complete:Boolean(progress.curadoria && progress.assets && progress.presell && campaign && Object.values(shared).every(Boolean))};
}
