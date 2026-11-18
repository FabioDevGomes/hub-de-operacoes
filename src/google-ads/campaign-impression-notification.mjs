export const GOOGLE_ADS_IMPRESSION_THRESHOLD_KEY = 'hub:google-ads-impression-notification:threshold:v1';
export const GOOGLE_ADS_IMPRESSION_NOTIFICATION_STATE_KEY = 'hub:google-ads-impression-notification:state:v1';
export const GOOGLE_ADS_IMPRESSION_SNAPSHOT_EVENT = 'hub:google-ads-impression-snapshot-updated';
export const GOOGLE_ADS_IMPRESSION_NOTIFICATION_STATE_EVENT = 'hub:google-ads-impression-notification-state-updated';
const DEFAULT_IMPRESSION_THRESHOLD = 10;
const STATE_VERSION = 1;
const SNAPSHOT_LOCK_NAME = 'hub-google-ads-impression-snapshot';

function validThreshold(value) {
  const threshold = Number(value);
  return Number.isSafeInteger(threshold) && threshold >= 1 ? threshold : null;
}

function saoPauloDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year && values.month && values.day ? `${values.year}-${values.month}-${values.day}` : '';
}

function campaignKeyForIdentity(campaign) {
  const managerCustomerId = String(campaign?.managerCustomerId || '').replace(/\D/g, '');
  const customerId = String(campaign?.customerId || '').replace(/\D/g, '');
  const campaignId = String(campaign?.campaignId || '').replace(/\D/g, '');
  const campaignInternalId = String(campaign?.campaignInternalId || '');
  if ((managerCustomerId && !/^\d{10}$/.test(managerCustomerId)) || !/^\d{10}$/.test(customerId) || !/^[1-9]\d{0,19}$/.test(campaignId) || !campaignInternalId) return '';
  return JSON.stringify([managerCustomerId || 'direct', customerId, campaignId, campaignInternalId]);
}

export function readCampaignImpressionNotificationForToday(campaign, { storage = globalThis.localStorage, now = new Date() } = {}) {
  const key = campaignKeyForIdentity(campaign);
  if (!key) return null;
  const item = readNotificationState(storage).campaigns[key];
  const threshold = validThreshold(item?.alertedThreshold);
  if (!item || !threshold) return null;
  const alertedDate = item.alertedAtUtc ? saoPauloDate(item.alertedAtUtc) : item.date;
  if (!alertedDate || alertedDate !== saoPauloDate(now)) return null;
  return { date:item.date, impressions:item.impressions, threshold };
}

export function readCampaignImpressionThreshold(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(GOOGLE_ADS_IMPRESSION_THRESHOLD_KEY) || 'null');
    return validThreshold(value?.threshold) || DEFAULT_IMPRESSION_THRESHOLD;
  } catch {
    return DEFAULT_IMPRESSION_THRESHOLD;
  }
}

export function saveCampaignImpressionThreshold(value, storage = globalThis.localStorage) {
  const threshold = validThreshold(value);
  if (!threshold) return false;
  try {
    storage?.setItem(GOOGLE_ADS_IMPRESSION_THRESHOLD_KEY, JSON.stringify({ version:STATE_VERSION, threshold }));
    return true;
  } catch {
    return false;
  }
}

function emptyState() {
  return { version:STATE_VERSION, lastSnapshotId:'', lastSnapshotAtUtc:'', campaigns:{}, pending:[] };
}

function normalizePending(item) {
  const id = String(item?.id || '').slice(0, 1200);
  const campaignInternalId = String(item?.campaignInternalId || '').slice(0, 240);
  const campaignName = String(item?.campaignName || '').trim().slice(0, 240);
  const campaignId = String(item?.campaignId || '').replace(/\D/g, '').slice(0, 20);
  const customerId = String(item?.customerId || '').replace(/\D/g, '').slice(0, 10);
  const managerCustomerId = String(item?.managerCustomerId || '').replace(/\D/g, '').slice(0, 10);
  const date = String(item?.date || '');
  const impressions = Number(item?.impressions), threshold = Number(item?.threshold);
  if (!id || !campaignInternalId || !campaignName || !/^[1-9]\d{0,19}$/.test(campaignId) || !/^\d{10}$/.test(customerId) || (managerCustomerId && !/^\d{10}$/.test(managerCustomerId)) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isSafeInteger(impressions) || impressions < 0 || !validThreshold(threshold)) return null;
  return { id, campaignInternalId, campaignName, campaignId, customerId, managerCustomerId, date, impressions, threshold };
}

function readNotificationState(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(GOOGLE_ADS_IMPRESSION_NOTIFICATION_STATE_KEY) || 'null');
    if (raw?.version !== STATE_VERSION) return emptyState();
    const campaigns = {};
    for (const [key, item] of Object.entries(raw.campaigns || {})) {
      const date = String(item?.date || ''), impressions = Number(item?.impressions), alertedThreshold = item?.alertedThreshold == null ? null : validThreshold(item.alertedThreshold), alertedAt = Date.parse(item?.alertedAtUtc || ''), alertedAtUtc = Number.isFinite(alertedAt) ? new Date(alertedAt).toISOString() : '';
      if (key.length <= 700 && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isSafeInteger(impressions) && impressions >= 0) campaigns[key] = { date, impressions, alertedThreshold, alertedAtUtc };
    }
    const pending = Array.isArray(raw.pending) ? raw.pending.map(normalizePending).filter(Boolean) : [];
    return {
      version:STATE_VERSION,
      lastSnapshotId:String(raw.lastSnapshotId || '').slice(0, 240),
      lastSnapshotAtUtc:String(raw.lastSnapshotAtUtc || '').slice(0, 40),
      campaigns,
      pending,
    };
  } catch {
    return emptyState();
  }
}

function writeNotificationState(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(GOOGLE_ADS_IMPRESSION_NOTIFICATION_STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function campaignKey(account, campaign) {
  return JSON.stringify([
    String(account.managerCustomerId || 'direct'),
    String(account.customerId || ''),
    String(campaign.campaignId || ''),
    String(campaign.campaignInternalId || ''),
  ]);
}

function eligibleCampaign(account, campaign) {
  const managerCustomerId = String(account.managerCustomerId || '').replace(/\D/g, ''),
    customerId = String(account.customerId || '').replace(/\D/g, ''),
    campaignId = String(campaign.campaignId || '').replace(/\D/g, ''),
    campaignInternalId = String(campaign.campaignInternalId || ''),
    impressions = Number(campaign.impressions), date = String(account.date || '');
  if (account.queryComplete !== true || campaign.mappingStatus !== 'mapped' || campaign.metricsAvailable !== true) return null;
  if (!/^\d{10}$/.test(customerId) || (managerCustomerId && !/^\d{10}$/.test(managerCustomerId)) || !/^[1-9]\d{0,19}$/.test(campaignId) || !campaignInternalId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!Number.isSafeInteger(impressions) || impressions < 0) return null;
  return { managerCustomerId, customerId, campaignId, campaignInternalId, campaignName:String(campaign.campaignName || '').trim().slice(0, 240) || 'Campanha', impressions, date };
}

function ensureStyles(documentRef) {
  if (documentRef.getElementById('hub-campaign-impression-notification-style')) return;
  const style = documentRef.createElement('style');
  style.id = 'hub-campaign-impression-notification-style';
  style.textContent = `
    .hub-campaign-impression-notification{position:fixed;z-index:2147482999;top:18px;right:18px;width:min(410px,calc(100vw - 36px));box-sizing:border-box;padding:16px 18px;border:1px solid #315579;border-left:4px solid #45d6aa;border-radius:14px;background:#102137;color:#eff6ff;box-shadow:0 16px 44px #0007;font:500 14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;animation:hub-campaign-impression-in .2s ease-out}
    .hub-campaign-impression-notification__head{display:flex;align-items:center;gap:10px;margin-bottom:8px}.hub-campaign-impression-notification__head strong{font-size:15px}.hub-campaign-impression-notification__icon{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#183c55;color:#70c9ff;font-size:15px}.hub-campaign-impression-notification__close{margin-left:auto;border:0;background:transparent;color:#9eb8d4;font-size:22px;line-height:1;cursor:pointer}.hub-campaign-impression-notification p{margin:0 0 12px;color:#b8cce2}.hub-campaign-impression-notification__actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.hub-campaign-impression-notification__actions button{padding:7px 11px;border:1px solid #315579;border-radius:9px;background:#142b43;color:#d8eaff;text-decoration:none;font:inherit;cursor:pointer}.hub-campaign-impression-notification__actions [data-impression-open]{border-color:#228ca9;background:#1584a7;color:white;font-weight:700}.hub-campaign-impression-notification button:focus-visible{outline:2px solid #70c9ff;outline-offset:2px}
    @keyframes hub-campaign-impression-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
    @media(prefers-reduced-motion:reduce){.hub-campaign-impression-notification{animation:none}}
  `;
  documentRef.head?.append(style);
}

export function mountGlobalCampaignImpressionNotification({ documentRef = globalThis.document, windowRef = globalThis.window } = {}) {
  if (!documentRef?.body || !windowRef) return () => {};
  if (windowRef.__hubCampaignImpressionNotificationCleanup) return windowRef.__hubCampaignImpressionNotificationCleanup;
  ensureStyles(documentRef);

  let stopped = false, processing = false, banner = null, bannerAlertId = '';
  const notificationLookup = campaign => readCampaignImpressionNotificationForToday(campaign, { storage:windowRef.localStorage });
  windowRef.__hubGetCampaignImpressionNotificationForToday = notificationLookup;
  function emitNotificationStateChanged() {
    const EventConstructor = windowRef.CustomEvent || globalThis.CustomEvent;
    if (EventConstructor) documentRef.dispatchEvent(new EventConstructor(GOOGLE_ADS_IMPRESSION_NOTIFICATION_STATE_EVENT));
  }

  function showPending() {
    if (stopped) return;
    const alert = readNotificationState().pending[0];
    if (!alert) {
      banner?.remove();
      banner = null;
      bannerAlertId = '';
      return;
    }
    if (bannerAlertId === alert.id && banner?.isConnected) return;
    banner?.remove();
    bannerAlertId = alert.id;
    banner = documentRef.createElement('section');
    banner.className = 'hub-campaign-impression-notification';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = `<div class="hub-campaign-impression-notification__head"><span class="hub-campaign-impression-notification__icon" aria-hidden="true">▥</span><strong>Campanha em entrega</strong><button type="button" class="hub-campaign-impression-notification__close" data-impression-dismiss aria-label="Dispensar notificação">×</button></div><p data-impression-message></p><div class="hub-campaign-impression-notification__actions"><button type="button" data-impression-open>Abrir Diário de campanha</button><button type="button" data-impression-dismiss>Dispensar</button></div>`;
    const count = new Intl.NumberFormat('pt-BR').format(alert.impressions);
    banner.querySelector('[data-impression-message]').textContent = `Hoje, ${alert.campaignName} registrou ${count} impressões.`;
    const resolve = openDiary => {
      const state = readNotificationState(), target = state.pending.find(item => item.id === alert.id);
      if (!target) return showPending();
      state.pending = state.pending.filter(item => item.id !== alert.id);
      if (!writeNotificationState(state)) return;
      banner?.remove();
      banner = null;
      bannerAlertId = '';
      if (openDiary) {
        const EventConstructor = windowRef.CustomEvent || globalThis.CustomEvent;
        if (EventConstructor) documentRef.dispatchEvent(new EventConstructor('hub:open-campaign-diary', { detail:{ campaignName:target.campaignName, campaignInternalId:target.campaignInternalId, campaignId:target.campaignId, customerId:target.customerId, managerCustomerId:target.managerCustomerId, source:'api' } }));
      }
      showPending();
    };
    banner.querySelector('[data-impression-open]').addEventListener('click', () => resolve(true));
    banner.querySelectorAll('[data-impression-dismiss]').forEach(button => button.addEventListener('click', () => resolve(false)));
    documentRef.body.append(banner);
    const waterBanner = documentRef.querySelector('.hub-water-reminder:not([hidden])');
    if (waterBanner) {
      const lowerEdge = waterBanner.getBoundingClientRect().bottom + 12, maxTop = Math.max(18, windowRef.innerHeight - banner.offsetHeight - 18);
      banner.style.top = `${Math.max(18, Math.min(lowerEdge, maxTop))}px`;
    }
  }

  function processSnapshot(detail) {
    const snapshot = detail?.snapshot;
    if (stopped || processing || snapshot?.periodType !== 'D0' || !snapshot?.id || !Array.isArray(snapshot.accounts)) {
      showPending();
      return;
    }
    processing = true;
    const threshold = readCampaignImpressionThreshold(), state = readNotificationState(), snapshotId = String(snapshot.id), completedAtUtc = String(snapshot.completedAtUtc || ''), snapshotAt = Date.parse(completedAtUtc), previousAt = Date.parse(state.lastSnapshotAtUtc || ''), baseline = detail?.baseline === true;
    if (snapshotId === state.lastSnapshotId || (Number.isFinite(snapshotAt) && Number.isFinite(previousAt) && snapshotAt < previousAt)) {
      processing = false;
      showPending();
      return;
    }
    const firstObservation = !state.lastSnapshotId, useAsBaseline = baseline || firstObservation && detail?.baseline !== false;
    for (const account of snapshot.accounts) {
      for (const campaign of Array.isArray(account?.campaigns) ? account.campaigns : []) {
        const current = eligibleCampaign(account, campaign);
        if (!current) continue;
        const key = campaignKey(account, campaign), prior = state.campaigns[key], sameDate = prior?.date === current.date;
        const crossed = !useAsBaseline && current.impressions >= threshold && (!sameDate || (prior.impressions < threshold && prior.alertedThreshold !== threshold));
        let alertedThreshold = sameDate ? prior.alertedThreshold : null, alertedAtUtc = sameDate ? prior.alertedAtUtc || '' : '';
        if (crossed) {
          const id = `impressions:${encodeURIComponent(key)}:${current.date}:${threshold}`;
          if (!state.pending.some(item => item.id === id)) state.pending.push({ id, ...current, threshold });
          alertedThreshold = threshold;
          alertedAtUtc = Number.isFinite(snapshotAt) ? new Date(snapshotAt).toISOString() : new Date().toISOString();
        }
        state.campaigns[key] = { date:current.date, impressions:current.impressions, alertedThreshold, alertedAtUtc };
      }
    }
    state.lastSnapshotId = snapshotId;
    if (Number.isFinite(snapshotAt)) state.lastSnapshotAtUtc = new Date(snapshotAt).toISOString();
    const saved = writeNotificationState(state);
    processing = false;
    if (saved) { emitNotificationStateChanged(); showPending(); }
  }

  async function handleSnapshot(event) {
    const detail = event.detail || {};
    if (globalThis.navigator?.locks?.request) {
      try {
        await navigator.locks.request(SNAPSHOT_LOCK_NAME, { ifAvailable:true }, lock => lock ? processSnapshot(detail) : undefined);
        return;
      } catch {}
    }
    processSnapshot(detail);
  }

  const handleStorage = event => { if (event.key === GOOGLE_ADS_IMPRESSION_NOTIFICATION_STATE_KEY) { showPending(); emitNotificationStateChanged(); } };
  const handleVisibility = () => { if (!documentRef.hidden) { showPending(); emitNotificationStateChanged(); } };
  documentRef.addEventListener(GOOGLE_ADS_IMPRESSION_SNAPSHOT_EVENT, handleSnapshot);
  windowRef.addEventListener('storage', handleStorage);
  windowRef.addEventListener('focus', handleVisibility);
  documentRef.addEventListener('visibilitychange', handleVisibility);
  const latestSnapshot = windowRef.__hubLatestGoogleAdsImpressionSnapshot;
  if (latestSnapshot) void handleSnapshot({ detail:latestSnapshot });
  else showPending();
  emitNotificationStateChanged();

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    documentRef.removeEventListener(GOOGLE_ADS_IMPRESSION_SNAPSHOT_EVENT, handleSnapshot);
    windowRef.removeEventListener('storage', handleStorage);
    windowRef.removeEventListener('focus', handleVisibility);
    documentRef.removeEventListener('visibilitychange', handleVisibility);
    banner?.remove();
    if (windowRef.__hubGetCampaignImpressionNotificationForToday === notificationLookup) delete windowRef.__hubGetCampaignImpressionNotificationForToday;
    delete windowRef.__hubCampaignImpressionNotificationCleanup;
  };
  windowRef.__hubCampaignImpressionNotificationCleanup = cleanup;
  return cleanup;
}
