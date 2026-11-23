import { collectClickBankProducts } from './clickbank-reader.mjs';
import { CLICKBANK_COLUMNS, isClickBankMarketplace } from './clickbank-domain.mjs';
import { isVslRate, isVslPage } from './vsl-domain.mjs';
import { controlVslSpeed } from './vsl-controller.mjs';
import { collectClickBankDtcCommonCountries, isClickBankDtcCheckout } from './clickbank-dtc-reader.mjs';
import { createClickBankTransfer, deliverClickBankPreview, isClickBankReceiverReady, deliverDtcCommonCountries, isDtcCountryReceiverReady } from './clickbank-forward.mjs';
import { googleAdsResourcesUrlForAccount, retryGoogleAdsAccountSelection, selectGoogleAdsAccountFromChooser } from './google-ads-resources-page.mjs';
import { readGoogleAdsResourceBookmarkFolder } from './google-ads-resource-bookmarks.mjs';

const ASSET_STUDIO_URL = 'http://127.0.0.1:8765/asset-studio/';
const ASSET_STUDIO_MATCH = ['http://127.0.0.1/asset-studio/*', 'http://192.168.15.4/asset-studio/*'];
const ASSET_STUDIO_ORIGINS = new Set(['http://127.0.0.1:8765', 'http://192.168.15.4:18790']);
const HUB_ORIGIN = 'http://127.0.0.1:8765';
const GOOGLE_ADS_RESOURCES_HOST_PERMISSION = 'https://ads.google.com/*';
const GOOGLE_ADS_RESOURCE_BOOKMARK_PERMISSION = 'bookmarks';
const GOOGLE_ADS_HISTORY_ID_PATTERN = /^[A-Za-z0-9:._-]{1,240}$/;
const PRODUCT_IMAGE_CANDIDATE_LIMIT = 36;
const PRODUCT_IMAGE_DOWNLOAD_LIMIT = 10 * 1024 * 1024;
const hubScreenActivationQueues = new Map();

function hubScreenKey(urlText) {
  try {
    const url = new URL(urlText);
    if (url.origin !== HUB_ORIGIN || url.protocol !== 'http:') return '';
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path !== '/') return `path:${path}`;
    const requestedView = url.searchParams.get('view') || '';
    const view = requestedView === 'presell' ? 'copy' : requestedView;
    const historyId = url.searchParams.get('googleAdsHistoryId') || '';
    if (view === 'google-ads' && GOOGLE_ADS_HISTORY_ID_PATTERN.test(historyId)) return `view:google-ads-history:${historyId}`;
    return `view:${view || 'totals'}`;
  } catch {
    return '';
  }
}

function hubNavigationScreenKey(urlText) {
  const screenKey = hubScreenKey(urlText);
  return screenKey.startsWith('view:google-ads-history:') ? 'view:google-ads' : screenKey;
}

function isGoogleAdsApiHubTab(urlText) {
  try {
    const url = new URL(urlText);
    return url.origin === HUB_ORIGIN && url.protocol === 'http:' && (url.pathname.replace(/\/+$/, '') || '/') === '/' && url.searchParams.get('view') === 'google-ads';
  } catch {
    return false;
  }
}

async function activateOrOpenHubScreen(targetUrl, sender, { openIfMissing = false } = {}) {
  const sourceUrl = sender?.url || sender?.tab?.url || '';
  if (!hubScreenKey(sourceUrl)) return { matched: false };
  let parsedTarget;
  try { parsedTarget = new URL(targetUrl); }
  catch { return { matched: false }; }
  if (parsedTarget.origin !== HUB_ORIGIN || parsedTarget.protocol !== 'http:') return { matched: false };
  const requestedScreen = hubNavigationScreenKey(parsedTarget.href);
  if (!requestedScreen) return { matched: false };
  const previous = hubScreenActivationQueues.get(requestedScreen) || Promise.resolve();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const queued = previous.then(() => gate);
  hubScreenActivationQueues.set(requestedScreen, queued);
  await previous;
  try {
    const tabs = await chrome.tabs.query({ url: `${HUB_ORIGIN}/*` });
    const matchingTabs = tabs
      .filter(tab => tab?.id != null && hubNavigationScreenKey(tab.url) === requestedScreen)
      .sort((left, right) => {
        const leftSameWindow = left.windowId === sender?.tab?.windowId;
        const rightSameWindow = right.windowId === sender?.tab?.windowId;
        if (leftSameWindow !== rightSameWindow) return leftSameWindow ? -1 : 1;
        return Number(Boolean(right.active)) - Number(Boolean(left.active));
      });
    const targetTab = matchingTabs[0];
    if (!targetTab) {
      if (!openIfMissing) return { matched: false, opened: false };
      const createOptions = { url:parsedTarget.href, active:true };
      if (Number.isInteger(sender?.tab?.windowId)) createOptions.windowId = sender.tab.windowId;
      const openedTab = await chrome.tabs.create(createOptions);
      return { matched:false, opened:Boolean(openedTab?.id != null), currentTab:false };
    }

    const currentTab = targetTab.id === sender?.tab?.id;
    if (!currentTab) {
      try {
        const targetWindow = await chrome.windows.get(targetTab.windowId);
        if (targetWindow.state === 'minimized') await chrome.windows.update(targetTab.windowId, { state: 'normal' });
      } catch { /* The tab may close between discovery and activation. */ }
      try { await chrome.tabs.update(targetTab.id, { active: true }); }
      catch { return { matched: false, opened:false }; }
      try { await chrome.windows.update(targetTab.windowId, { focused: true }); }
      catch { /* Keep the matched tab active even if Chrome declines window focus. */ }
    }
    return { matched: true, opened:false, currentTab };
  } finally {
    release();
    if (hubScreenActivationQueues.get(requestedScreen) === queued) hubScreenActivationQueues.delete(requestedScreen);
  }
}

function selectGoogleAdsHistorySnapshotInOpenHub(historyId) {
  if (document.documentElement?.dataset.hubGoogleAdsHistoryBridge !== 'ready') return false;
  const selection = new CustomEvent('hub:open-google-ads-history', {
    detail: { historyId },
    cancelable: true,
  });
  return !window.dispatchEvent(selection);
}

async function openOrActivateHubNotificationTab(targetUrl, sender, { openIfMissing = true } = {}) {
  const sourceUrl = sender?.url || sender?.tab?.url || '';
  if (!hubScreenKey(sourceUrl)) return { matched: false, opened: false };
  let parsedTarget;
  try { parsedTarget = new URL(targetUrl); }
  catch { return { matched: false, opened: false }; }
  if (parsedTarget.origin !== HUB_ORIGIN || parsedTarget.protocol !== 'http:' || parsedTarget.pathname !== '/' || parsedTarget.searchParams.get('view') !== 'google-ads') return { matched: false, opened: false };
  const historyId = parsedTarget.searchParams.get('googleAdsHistoryId') || '';
  if (!GOOGLE_ADS_HISTORY_ID_PATTERN.test(historyId)) return { matched: false, opened: false };
  const tabs = await chrome.tabs.query({ url: `${HUB_ORIGIN}/*` });
  const matchingTabs = tabs.filter(tab => tab?.id != null && hubScreenKey(tab.url) === `view:google-ads-history:${historyId}`)
    .sort((left, right) => {
      const leftIsSender = left.id === sender?.tab?.id;
      const rightIsSender = right.id === sender?.tab?.id;
      if (leftIsSender !== rightIsSender) return leftIsSender ? -1 : 1;
      const leftSameWindow = left.windowId === sender?.tab?.windowId;
      const rightSameWindow = right.windowId === sender?.tab?.windowId;
      if (leftSameWindow !== rightSameWindow) return leftSameWindow ? -1 : 1;
      return Number(Boolean(right.active)) - Number(Boolean(left.active));
    });
  const targetTab = matchingTabs[0] || tabs.filter(tab => tab?.id != null && isGoogleAdsApiHubTab(tab.url))
    .sort((left, right) => {
      const leftIsSender = left.id === sender?.tab?.id;
      const rightIsSender = right.id === sender?.tab?.id;
      if (leftIsSender !== rightIsSender) return leftIsSender ? -1 : 1;
      const leftSameWindow = left.windowId === sender?.tab?.windowId;
      const rightSameWindow = right.windowId === sender?.tab?.windowId;
      if (leftSameWindow !== rightSameWindow) return leftSameWindow ? -1 : 1;
      return Number(Boolean(right.active)) - Number(Boolean(left.active));
    })[0];
  if (targetTab) {
    const currentTab = targetTab.id === sender?.tab?.id;
    const alreadyAtTarget = hubScreenKey(targetTab.url) === `view:google-ads-history:${historyId}`;
    let selectedWithoutReload = alreadyAtTarget;
    if (!alreadyAtTarget) {
      try {
        const [selection] = await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          world: 'MAIN',
          func: selectGoogleAdsHistorySnapshotInOpenHub,
          args: [historyId],
        });
        selectedWithoutReload = selection?.result === true;
      } catch { /* Preserve the deep-link navigation as fallback for an older or incomplete Hub tab. */ }
    }
    if (!currentTab) {
      try {
        const targetWindow = await chrome.windows.get(targetTab.windowId);
        if (targetWindow.state === 'minimized') await chrome.windows.update(targetTab.windowId, { state: 'normal' });
      } catch { /* The tab may close between discovery and activation. */ }
    }
    if (!alreadyAtTarget && !selectedWithoutReload) {
      try { await chrome.tabs.update(targetTab.id, { url: parsedTarget.href, active: true }); }
      catch { return { matched: false, opened: false }; }
    } else if (!currentTab) {
      try { await chrome.tabs.update(targetTab.id, { active: true }); }
      catch { return { matched: false, opened: false }; }
    }
    if (!currentTab) {
      try { await chrome.windows.update(targetTab.windowId, { focused: true }); }
      catch { /* Keep the matched tab active even if Chrome declines window focus. */ }
    }
    return { matched: true, opened: false, currentTab };
  }
  if (!openIfMissing) return { matched: false, opened: false };
  const options = { url: parsedTarget.href, active: true };
  if (Number.isInteger(sender?.tab?.windowId) && sender.tab.windowId >= 0) options.windowId = sender.tab.windowId;
  const created = await chrome.tabs.create(options);
  return { matched: false, opened: Boolean(created?.id) };
}

function waitUntilLoaded(tabId, timeoutMs = 20000, label = 'Hub local') {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (callback, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      callback(value);
    };
    const onUpdated = (updatedId, changeInfo) => {
      if (updatedId === tabId && changeInfo.status === 'complete') finish(resolve);
    };
    const timer = setTimeout(() => finish(reject, new Error(`O ${label} demorou demais para carregar.`)), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId, tab => {
      if (chrome.runtime.lastError) finish(reject, new Error(`Não consegui abrir o ${label} local. Inicie o Hub e tente novamente.`));
      else if (tab?.status === 'complete') finish(resolve);
    });
  });
}

function googleAdsTabPath(tab) {
  try { return new URL(tab?.url || '').pathname.toLowerCase(); }
  catch { return ''; }
}

async function waitForGoogleAdsPath(tabId, predicate, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    let tab;
    try { tab = await chrome.tabs.get(tabId); }
    catch { throw new Error('A aba do Google Ads foi fechada durante a seleção da conta.'); }
    if (tab?.status === 'complete' && predicate(googleAdsTabPath(tab))) return tab;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('O Google Ads não concluiu a abertura da conta selecionada. Confira a aba aberta e tente novamente.');
}

function isGoogleAdsAccountChooserPath(path) {
  return /\/nav\/selectaccount\/?$/.test(path);
}

async function ensureGoogleAdsBookmarkedPage(tabId, targetUrl, accountId) {
  const targetPath = new URL(targetUrl).pathname.replace(/\/$/, '').toLowerCase();
  let navigatedToExactLink = false;
  let accountSelections = 0;
  while (accountSelections <= 2) {
    const tab = await chrome.tabs.get(tabId);
    const path = googleAdsTabPath(tab);
    if (path.replace(/\/$/, '').toLowerCase() === targetPath) return { tab, accountSelections };

    if (isGoogleAdsAccountChooserPath(path)) {
      if (accountSelections >= 2) {
        throw new Error(`O Google Ads voltou ao seletor de contas. Selecione ${formatGoogleAdsAccountId(accountId)} na aba aberta e tente novamente.`);
      }
      const selection = await retryGoogleAdsAccountSelection(async () => {
        const currentTab = await chrome.tabs.get(tabId);
        if (!isGoogleAdsAccountChooserPath(googleAdsTabPath(currentTab))) return { state: 'route-changed' };
        const [execution] = await chrome.scripting.executeScript({
          target: { tabId },
          func: selectGoogleAdsAccountFromChooser,
          args: [accountId],
          world: 'ISOLATED',
        });
        return execution?.result || { state: 'account-not-found', accountId };
      });
      if (selection?.state === 'route-changed') continue;
      if (selection?.state !== 'selected') {
        throw new Error(`O Google Ads pediu uma conta, mas não encontrei ${formatGoogleAdsAccountId(accountId)} no seletor após aguardar o carregamento da lista. A aba foi mantida aberta para conferência.`);
      }
      accountSelections += 1;
      await waitForGoogleAdsPath(tabId, nextPath => !isGoogleAdsAccountChooserPath(nextPath));
      continue;
    }

    if (!navigatedToExactLink) {
      navigatedToExactLink = true;
      await chrome.tabs.update(tabId, { url: targetUrl });
      await waitUntilLoaded(tabId, 30000, 'Google Ads');
      continue;
    }
    throw new Error('O Google Ads abriu outra página em vez da página solicitada. A aba foi mantida aberta para conferência.');
  }
  throw new Error('Não consegui concluir a seleção da conta Google Ads. A aba foi mantida aberta para conferência.');
}

function formatGoogleAdsAccountId(accountId) {
  const digits = String(accountId || '').replace(/\D/g, '');
  return /^\d{10}$/.test(digits) ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : digits;
}

function validatedGoogleAdsResourceUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.origin === 'https://ads.google.com'
        && (/^\/aw\/assetreport\/associations\/?$/i.test(url.pathname)
          || /^\/aw\/campaigns\/?$/i.test(url.pathname)
          || /^\/aw\/(?:manager-accounts\/)?accounts\/?$/i.test(url.pathname))
        && !url.username && !url.password
      ? value
      : '';
  } catch {
    return '';
  }
}

async function openGoogleAdsResources(rawAccountId, sender, rawResourceUrl = '') {
  const sourceUrl = sender?.url || sender?.tab?.url || '';
  if (!hubScreenKey(sourceUrl)) throw new Error('A solicitação não veio de uma tela válida do Hub local.');
  const accountId = String(rawAccountId || '').replace(/\D/g, '');
  const bookmarkedUrl = rawResourceUrl ? validatedGoogleAdsResourceUrl(rawResourceUrl) : '';
  if (rawResourceUrl && !bookmarkedUrl) throw new Error('O favorito não aponta para uma página autorizada do Google Ads. Nenhum link foi aberto.');
  const targetUrl = bookmarkedUrl || googleAdsResourcesUrlForAccount(accountId);
  if (!targetUrl) throw new Error('O Hub enviou um ID de conta Google Ads inválido.');
  const hasPermission = await chrome.permissions.contains({ origins: [GOOGLE_ADS_RESOURCES_HOST_PERMISSION] });
  if (!hasPermission) {
    throw new Error('Autorize o acesso ao Google Ads no menu da extensão Hub 2.0. A extensão pede acesso somente a ads.google.com; não solicita sua senha nem acessa páginas de login.');
  }

  const options = { url: targetUrl, active: true };
  if (Number.isInteger(sender?.tab?.windowId) && sender.tab.windowId >= 0) options.windowId = sender.tab.windowId;
  const tab = await chrome.tabs.create(options);
  if (!tab?.id) throw new Error('O Chrome não abriu uma nova aba do Google Ads.');
  try {
    await waitUntilLoaded(tab.id, 30000, 'Google Ads');
    const currentTab = await chrome.tabs.get(tab.id);
    let currentOrigin = '';
    try { currentOrigin = new URL(currentTab.url || '').origin; } catch { /* Report the same safe login/session guidance below. */ }
    if (currentOrigin !== 'https://ads.google.com') {
      throw new Error('O Google Ads redirecionou esta aba para outra página, possivelmente a tela de login. A extensão não acessa nem preenche páginas de autenticação; conclua o login normal no Chrome e tente novamente.');
    }
    const result = await ensureGoogleAdsBookmarkedPage(tab.id, targetUrl, accountId);
    const targetPath = new URL(targetUrl).pathname.toLowerCase();
    const pageLabel = targetPath.startsWith('/aw/campaigns') ? 'Campanhas'
      : /^\/aw\/(?:manager-accounts\/)?accounts\/?$/.test(targetPath) ? 'Contas da MCC' : 'Recursos';
    return { ok: true, opened: true, message: `${pageLabel} do Google Ads aberto(s) para a conta ${formatGoogleAdsAccountId(accountId)}${bookmarkedUrl ? ' pelo link salvo nos favoritos' : result.accountSelections ? '; a conta foi selecionada automaticamente' : ''}.` };
  } catch (error) {
    return { ok: false, opened: true, message: error?.message || 'O Google Ads abriu, mas não consegui confirmar a página solicitada. A aba foi mantida aberta para conferência.' };
  }
}

async function syncGoogleAdsResourceBookmarks() {
  const permission = await chrome.permissions.contains({ permissions: [GOOGLE_ADS_RESOURCE_BOOKMARK_PERMISSION] });
  if (!permission) {
    return {
      ok: false,
      permissionRequired: true,
      message: 'Abra o popup da extensão Hub 2.0 e autorize “Ler favoritos do Chrome” para ler links da MCC, Campanhas em Contas e Recursos/Campanhas em Contas > pag recursos.',
    };
  }
  const tree = await chrome.bookmarks.getTree();
  return { ok: true, ...readGoogleAdsResourceBookmarkFolder(tree) };
}

let bookmarkBroadcastTimer = null;
const registeredBookmarkEvents = new Set();

function broadcastGoogleAdsResourceBookmarks() {
  clearTimeout(bookmarkBroadcastTimer);
  bookmarkBroadcastTimer = setTimeout(async () => {
    let snapshot;
    try { snapshot = await syncGoogleAdsResourceBookmarks(); }
    catch { return; }
    if (!snapshot.ok) return;
    const tabs = await chrome.tabs.query({ url: `${HUB_ORIGIN}/*` });
    await Promise.all(tabs.filter(tab => tab?.id != null).map(async tab => {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'GOOGLE_ADS_RESOURCE_BOOKMARKS_UPDATED',
          folderFound: snapshot.folderFound,
          bookmarks: snapshot.bookmarks,
          campaignBookmarks: snapshot.campaignBookmarks,
          managerBookmarks: snapshot.managerBookmarks,
        });
      } catch { /* A Hub tab may close or be reloading. */ }
    }));
  }, 300);
}

function registerGoogleAdsBookmarkEvents() {
  const bookmarksApi = chrome.bookmarks;
  if (!bookmarksApi) return;
  for (const eventName of ['onCreated', 'onChanged', 'onMoved', 'onRemoved']) {
    const event = bookmarksApi[eventName];
    if (!event || registeredBookmarkEvents.has(eventName)) continue;
    try {
      event.addListener(broadcastGoogleAdsResourceBookmarks);
      registeredBookmarkEvents.add(eventName);
    } catch { /* The optional permission may not be granted yet. */ }
  }
}

registerGoogleAdsBookmarkEvents();
chrome.permissions.onAdded.addListener(({ permissions = [] } = {}) => {
  if (!permissions.includes(GOOGLE_ADS_RESOURCE_BOOKMARK_PERMISSION)) return;
  registerGoogleAdsBookmarkEvents();
  broadcastGoogleAdsResourceBookmarks();
});

function withTimeout(promise, timeoutMs, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

async function captureActiveClickBank(mode) {
  const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
  if (!tab?.id || !isClickBankMarketplace(tab.url)) throw new Error('Abra o Marketplace do ClickBank na aba ativa. Nenhum produto foi lido.');
  const [execution] = await chrome.scripting.executeScript({
    target:{ tabId:tab.id }, func:collectClickBankProducts, args:[CLICKBANK_COLUMNS, mode]
  });
  if (!execution?.result) throw new Error('A tabela não respondeu à captura. Reabra o popup e tente novamente.');
  return execution.result;
}

async function activeVslSpeed(rate, action) {
  if (action === 'set' && !isVslRate(rate)) throw new Error('Velocidade inválida. Use 1×, 20×, 30×, 40× ou 50×.');
  const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
  if (!tab?.id || !isVslPage(tab.url)) throw new Error('Abra a página da VSL na aba ativa do Chrome.');
  const [execution] = await chrome.scripting.executeScript({
    target:{ tabId:tab.id }, world:'MAIN', func:controlVslSpeed, args:[rate ?? null, action]
  });
  if (!execution?.result) throw new Error('O player não respondeu. Reabra a extensão e tente novamente.');
  return execution.result;
}

function collectPageIconCandidates() {
  const candidates = [];
  for (const link of document.querySelectorAll('link[rel]')) {
    const rel = String(link.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!rel.includes('icon') && !rel.includes('apple-touch-icon')) continue;
    try {
      candidates.push({
        url: new URL(link.href, location.href).href,
        rel: rel.join(' '),
        sizes: String(link.sizes?.value || ''),
        type: String(link.type || '')
      });
    } catch { /* Ignore malformed page-provided links. */ }
  }
  return candidates;
}

function receiveAssetInStudio(payload) {
  const allowedSlots = new Set(['desktop', 'mobile', 'favicon']);
  if (!payload || !allowedSlots.has(payload.slot) || typeof payload.dataUrl !== 'string') {
    return { ok: false, message: 'O Asset Studio recebeu um arquivo inválido.' };
  }
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i.exec(payload.dataUrl);
  if (!match) return { ok: false, message: 'Formato de imagem inválido para o Asset Studio.' };
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  const blob = new Blob([bytes], { type: match[1] });
  const extension = match[1].split('/')[1].replace('svg+xml', 'svg').replace('jpeg', 'jpg').replace('x-icon', 'ico');
  const file = new File([blob], payload.fileName || `hub-2-${payload.slot}.${extension}`, { type: match[1] });
  if (payload.slot === 'favicon') {
    const skipFavicon = document.querySelector('#skipFavicon');
    if (skipFavicon?.checked) {
      skipFavicon.checked = false;
      skipFavicon.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  const target = document.querySelector(`[data-target="${payload.slot}"]`);
  if (!target) return { ok: false, message: 'O campo de destino não foi encontrado no Asset Studio.' };
  target.click();

  if (payload.slot === 'favicon' && typeof window.setFaviconBlob === 'function') {
    return window.setFaviconBlob(file, 'Favicon importado da página')
      .then(() => {
        const message = document.querySelector('#faviconMessage');
        if (message?.classList.contains('error')) return { ok: false, message: message.textContent };
        return { ok: true, slot: payload.slot, fileName: file.name };
      });
  }
  if (payload.slot !== 'favicon' && typeof window.setSlot === 'function') {
    window.setSlot(payload.slot, file);
    return { ok: true, slot: payload.slot, fileName: file.name };
  }

  const transfer = new DataTransfer();
  transfer.items.add(file);
  window.dispatchEvent(new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: transfer
  }));
  return { ok: true, slot: payload.slot, fileName: file.name };
}

async function findOrOpenAssetStudio(windowId) {
  const candidates = await chrome.tabs.query({ windowId, url: ASSET_STUDIO_MATCH });
  let tab = candidates.find(candidate => {
    try { const url = new URL(candidate.url); return ASSET_STUDIO_ORIGINS.has(url.origin) && url.pathname.startsWith('/asset-studio/'); }
    catch { return false; }
  });
  if (!tab) tab = await chrome.tabs.create({ windowId, url: ASSET_STUDIO_URL, active: false });
  if (!tab?.id) throw new Error('Não foi possível abrir o Asset Studio local. Inicie o Hub e tente novamente.');
  await waitUntilLoaded(tab.id, 20000, 'Asset Studio');
  return tab;
}

async function deliverAssetToStudio(sourceTab, payload) {
  const tab = await findOrOpenAssetStudio(sourceTab.windowId);
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: receiveAssetInStudio,
    args: [payload]
  });
  if (!execution?.result?.ok) throw new Error(execution?.result?.message || 'O Asset Studio não recebeu a imagem.');
  await chrome.tabs.update(tab.id, { active: true });
  const names = { desktop: '01.png · Desktop', mobile: '02.png · Mobile', favicon: '03.png · Favicon' };
  return { ok: true, message: `${names[payload.slot]} enviado ao Asset Studio. Confira a prévia e gere os arquivos na pasta do produto.` };
}

function collectProductImageCandidates() {
  const candidateLimit = 36;
  const scanElementLimit = 10000;
  const imageElements = document.images;
  const imageElementCount = imageElements.length;
  const scannedImageCount = Math.min(imageElementCount, scanElementLimit);
  const seen = new Set();
  const candidates = [];
  let totalCandidates = 0;
  for (let index = 0; index < scannedImageCount; index++) {
    const image = imageElements[index];
    if (!image) continue;
    const width = Number(image.naturalWidth || 0);
    const height = Number(image.naturalHeight || 0);
    if (width < 150 || height < 150 || width * height < 40000) continue;
    let url;
    try { url = new URL(image.currentSrc || image.src, location.href); }
    catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || seen.has(url.href)) continue;
    seen.add(url.href);
    const alt = String(image.alt || image.title || '').trim().slice(0, 180);
    const productHint = /product|produto|pack|bottle|bottles|supplement|ingredient|benefit|review|gallery|hero|main|offer/i.test(`${alt} ${url.pathname}`);
    const candidate = {
      id: '',
      url: url.href,
      alt,
      width,
      height,
      score: width * height * (productHint ? 1.35 : 1)
    };
    totalCandidates++;
    let insertAt = 0;
    while (insertAt < candidates.length && candidates[insertAt].score >= candidate.score) insertAt++;
    if (insertAt < candidateLimit || candidates.length < candidateLimit) {
      candidates.splice(insertAt, 0, candidate);
      if (candidates.length > candidateLimit) candidates.pop();
    }
  }
  return {
    sourceUrl: location.href,
    sourceTitle: String(document.title || '').trim().slice(0, 180),
    totalCandidates,
    imageElementCount,
    scannedImageCount,
    scanTruncated: scannedImageCount < imageElementCount,
    candidates: candidates.map((candidate, index) => ({
      id: `product-image-${index + 1}`,
      url: candidate.url,
      alt: candidate.alt,
      width: candidate.width,
      height: candidate.height
    }))
  };
}

async function scanProductImages() {
  const [sourceTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!sourceTab?.id || !sourceTab.url) throw new Error('Abra a página do produto na aba ativa do Chrome.');
  let sourceUrl;
  try { sourceUrl = new URL(sourceTab.url); }
  catch { throw new Error('A aba ativa não é uma página web compatível.'); }
  if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.origin === HUB_ORIGIN) {
    throw new Error('Abra a página pública do produto, não uma tela local do Hub.');
  }
  const [execution] = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId: sourceTab.id },
      func: collectProductImageCandidates
    }),
    15000,
    'A página do produto não respondeu à varredura em 15 segundos. Aguarde o carregamento e tente novamente.'
  );
  const result = execution?.result;
  if (!result || !Array.isArray(result.candidates)) throw new Error('A página não respondeu à busca de imagens.');
  return {
    sourceTabId: sourceTab.id,
    sourceWindowId: sourceTab.windowId,
    ...result
  };
}

function receiveProductImageCandidatesInStudio(payload) {
  if (!payload || !Array.isArray(payload.candidates) || typeof window.setProductImageCandidates !== 'function') {
    return { ok: false, message: 'A galeria de imagens não está pronta no Asset Studio. Atualize a tela e tente novamente.' };
  }
  return window.setProductImageCandidates(payload);
}

function isProductImageGalleryReceiverReady() {
  return ['http://127.0.0.1:8765', 'http://192.168.15.4:18790'].includes(location.origin)
    && /^\/asset-studio\/?$/.test(location.pathname)
    && typeof window.setProductImageCandidates === 'function'
    && typeof window.setProductImageFiles === 'function';
}

async function openFreshAssetStudio(windowId) {
  const tab = await chrome.tabs.create({ windowId, url: ASSET_STUDIO_URL, active: false });
  if (!tab?.id) throw new Error('Não foi possível abrir uma nova aba do Asset Studio.');
  await waitUntilLoaded(tab.id, 20000, 'Asset Studio atualizado');
  return tab;
}

async function productImageStudioReceiverReady(tabId) {
  try {
    const [probe] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: isProductImageGalleryReceiverReady
    });
    return probe?.result === true;
  } catch { return false; }
}

async function findReadyProductImageStudio(windowId) {
  const candidates = await chrome.tabs.query({ windowId, url: ASSET_STUDIO_MATCH });
  for (const tab of candidates) {
    try {
      if (!tab?.id || !ASSET_STUDIO_ORIGINS.has(new URL(tab.url).origin) || !new URL(tab.url).pathname.startsWith('/asset-studio/')) continue;
      if (tab.status !== 'complete') await waitUntilLoaded(tab.id, 10000, 'Asset Studio');
      if (await productImageStudioReceiverReady(tab.id)) return tab;
    } catch { /* Try another Asset Studio tab without replacing the user's current one. */ }
  }
  const tab = await openFreshAssetStudio(windowId);
  if (await productImageStudioReceiverReady(tab.id)) return tab;
  throw new Error('O Asset Studio ainda não recebeu a galeria atualizada. Atualize o Hub local e tente novamente.');
}

async function openProductImageGallery(capture) {
  if (!capture || !Number.isInteger(capture.sourceTabId) || !Array.isArray(capture.candidates)) {
    throw new Error('A lista de imagens expirou. Procure as imagens novamente pela extensão.');
  }
  const sourceTab = await chrome.tabs.get(capture.sourceTabId).catch(() => null);
  if (!sourceTab?.id || sourceTab.url !== capture.sourceUrl) {
    throw new Error('A página do produto mudou ou foi fechada. Procure as imagens novamente.');
  }
  const candidates = capture.candidates.slice(0, PRODUCT_IMAGE_CANDIDATE_LIMIT).filter(candidate => {
    try {
      const url = new URL(candidate.url);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        && Number.isFinite(candidate.width) && Number.isFinite(candidate.height);
    } catch { return false; }
  });
  if (!candidates.length) throw new Error('A lista de imagens não contém arquivos compatíveis.');
  const candidateOrigins = [...new Set(candidates.map(candidate => {
    const url = new URL(candidate.url);
    return `${url.protocol}//${url.host}/*`;
  }))];
  const unavailableOrigins = [];
  for (const origin of candidateOrigins) {
    if (!await chrome.permissions.contains({ origins: [origin] })) unavailableOrigins.push(origin);
  }
  const tab = await findReadyProductImageStudio(sourceTab.windowId);
  const payload = {
    sourceUrl: capture.sourceUrl,
    sourceTitle: capture.sourceTitle || '',
    candidates,
    totalCandidates: Math.max(candidates.length, Number(capture.totalCandidates) || 0),
    unavailableOrigins
  };
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: receiveProductImageCandidatesInStudio,
    args: [payload]
  });
  if (!execution?.result?.ok) throw new Error(execution?.result?.message || 'O Asset Studio não recebeu a lista de imagens.');
  await chrome.tabs.update(tab.id, { active: true });
  return {
    ok: true,
    message: `${candidates.length} imagens abertas na galeria do Asset Studio. Escolha até duas para salvar em produto/pag01/assets.`
  };
}

function safeProductImageUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error('A URL de uma imagem é inválida.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('A imagem precisa vir de uma URL pública HTTP ou HTTPS.');
  }
  return url;
}

function imageBlobToDataUrl(blob, mimeType) {
  return blob.arrayBuffer().then(buffer => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
  });
}

async function fetchSelectedProductImage(image) {
  const url = safeProductImageUrl(image?.url);
  const originPattern = `${url.protocol}//${url.host}/*`;
  const granted = await chrome.permissions.contains({ origins: [originPattern] });
  if (!granted) throw new Error(`A extensão não tem acesso a ${url.host}. Reabra a extensão e permita esse domínio para salvar a imagem.`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(url.href, { credentials: 'omit', redirect: 'follow', cache: 'no-store', signal: controller.signal });
  } finally { clearTimeout(timer); }
  if (!response.ok) throw new Error(`O domínio ${url.host} respondeu com erro HTTP ${response.status}.`);
  const finalUrl = safeProductImageUrl(response.url || url.href);
  const finalOriginPattern = `${finalUrl.protocol}//${finalUrl.host}/*`;
  if (!await chrome.permissions.contains({ origins: [finalOriginPattern] })) {
    throw new Error(`A imagem redirecionou para ${finalUrl.host}, que ainda não foi autorizado.`);
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error('O arquivo de imagem está vazio.');
  if (blob.size > PRODUCT_IMAGE_DOWNLOAD_LIMIT) throw new Error('A imagem excede 10 MB; escolha uma versão menor na página.');
  const headerType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const mimeType = headerType.startsWith('image/') ? headerType : String(blob.type || '').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(mimeType)) {
    throw new Error('Formato não compatível. A página precisa fornecer JPG, PNG, WebP, AVIF ou GIF.');
  }
  return {
    candidateId: String(image.id || ''),
    dataUrl: await imageBlobToDataUrl(blob, mimeType),
    mimeType,
    size: blob.size
  };
}

function receiveProductImageFilesInStudio(payload) {
  if (!payload || !Array.isArray(payload.files) || typeof window.setProductImageFiles !== 'function') {
    return { ok: false, message: 'O Asset Studio não está pronto para receber as imagens. Atualize a tela e tente novamente.' };
  }
  return window.setProductImageFiles(payload);
}

async function importSelectedProductImages(images, sender) {
  let senderUrl;
  try { senderUrl = new URL(sender?.url || sender?.tab?.url || ''); }
  catch { throw new Error('A solicitação precisa vir do Asset Studio local.'); }
  if (!ASSET_STUDIO_ORIGINS.has(senderUrl.origin) || senderUrl.pathname.replace(/\/+$/, '') !== '/asset-studio') {
    throw new Error('A solicitação precisa vir do Asset Studio local.');
  }
  if (!Array.isArray(images) || images.length < 1 || images.length > 2) throw new Error('Escolha de uma a duas imagens para importar.');
  const unique = new Set();
  for (const image of images) {
    const url = safeProductImageUrl(image?.url);
    if (unique.has(url.href)) throw new Error('A mesma imagem foi selecionada mais de uma vez.');
    unique.add(url.href);
  }
  const settled = await Promise.all(images.map(async image => {
    try { return { file: await fetchSelectedProductImage(image) }; }
    catch (error) { return { failure: { candidateId: String(image?.id || ''), message: error?.message || 'Falha ao ler esta imagem.' } }; }
  }));
  const files = settled.flatMap(item => item.file ? [item.file] : []);
  const failures = settled.flatMap(item => item.failure ? [item.failure] : []);
  if (!files.length) return { ok: false, message: failures.map(item => item.message).join(' ') || 'Não foi possível ler as imagens selecionadas.' };
  const tabId = sender?.tab?.id;
  if (!Number.isInteger(tabId)) throw new Error('Não encontrei a aba do Asset Studio.');
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: receiveProductImageFilesInStudio,
    args: [{ files, failures }]
  });
  if (!execution?.result?.ok) throw new Error(execution?.result?.message || 'O Asset Studio não recebeu as imagens.');
  return {
    ok: true,
    imported: files.length,
    failures,
    message: execution.result.message || `${files.length} imagem(ns) carregada(s) no Asset Studio.`
  };
}

async function captureVisibleAsset(slot) {
  if (slot !== 'desktop' && slot !== 'mobile') throw new Error('Escolha Desktop ou Mobile para capturar a área visível.');
  const [sourceTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!sourceTab?.id || !sourceTab.windowId) throw new Error('Não encontrei a aba ativa para capturar.');
  const dataUrl = await chrome.tabs.captureVisibleTab(sourceTab.windowId, { format: 'png' });
  if (!dataUrl?.startsWith('data:image/png;base64,')) throw new Error('O Chrome não conseguiu capturar a área visível da aba.');
  return deliverAssetToStudio(sourceTab, { slot, dataUrl, fileName: `captura-${slot}.png` });
}

function faviconMimeType(blob, url) {
  if (blob.type?.startsWith('image/')) return blob.type;
  let pathname = '';
  try { pathname = new URL(url).pathname.toLowerCase(); } catch { /* data URL */ }
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  if (pathname.endsWith('.png')) return 'image/png';
  if (/\.jpe?g$/.test(pathname)) return 'image/jpeg';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.ico')) return 'image/x-icon';
  return '';
}

async function blobToDataUrl(blob, mimeType) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function rankFaviconCandidates(candidates) {
  const sizeScore = value => {
    const sizes = String(value || '').match(/\d+x\d+/gi) || [];
    return Math.max(0, ...sizes.map(size => Number(size.split('x')[0]) || 0));
  };
  return [...candidates].sort((left, right) => {
    const leftTouch = /apple-touch-icon/.test(left.rel || '');
    const rightTouch = /apple-touch-icon/.test(right.rel || '');
    if (leftTouch !== rightTouch) return leftTouch ? 1 : -1;
    return sizeScore(right.sizes) - sizeScore(left.sizes);
  });
}

async function capturePageFavicon() {
  const [sourceTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!sourceTab?.id || !sourceTab.url) throw new Error('Abra primeiro a página do produtor.');
  let pageUrl;
  try { pageUrl = new URL(sourceTab.url); }
  catch { throw new Error('A aba ativa não é uma página web compatível.'); }
  if (!['http:', 'https:'].includes(pageUrl.protocol)) throw new Error('Abra a página do produtor em um endereço HTTP ou HTTPS.');

  const [execution] = await chrome.scripting.executeScript({ target: { tabId: sourceTab.id }, func: collectPageIconCandidates });
  const pageCandidates = Array.isArray(execution?.result) ? execution.result : [];
  const candidates = rankFaviconCandidates(pageCandidates);
  if (sourceTab.favIconUrl) candidates.push({ url: sourceTab.favIconUrl, rel: 'tab-favicon', sizes: '' });
  candidates.push({ url: new URL('/favicon.ico', pageUrl.origin).href, rel: 'fallback', sizes: '' });

  const seen = new Set();
  for (const candidate of candidates) {
    let iconUrl;
    try { iconUrl = new URL(candidate.url, pageUrl.href); }
    catch { continue; }
    if (iconUrl.protocol !== 'data:' && iconUrl.origin !== pageUrl.origin) continue;
    if (!['http:', 'https:', 'data:'].includes(iconUrl.protocol) || seen.has(iconUrl.href)) continue;
    seen.add(iconUrl.href);
    let payload;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      let response;
      try { response = await fetch(iconUrl.href, { credentials: 'omit', redirect: 'follow', signal: controller.signal }); }
      finally { clearTimeout(timer); }
      if (!response.ok) continue;
      const rawBlob = await response.blob();
      if (!rawBlob.size || rawBlob.size > 8 * 1024 * 1024) continue;
      const mimeType = faviconMimeType(rawBlob, response.url || iconUrl.href);
      if (!mimeType) continue;
      const blob = rawBlob.type === mimeType ? rawBlob : new Blob([rawBlob], { type: mimeType });
      const extension = ({ 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/x-icon': 'ico' })[mimeType] || 'img';
      const dataUrl = await blobToDataUrl(blob, mimeType);
      payload = { slot: 'favicon', dataUrl, fileName: `favicon.${extension}` };
    } catch {
      // Ignore inaccessible/unsupported icons and try the next same-site candidate.
    }
    if (payload) return deliverAssetToStudio(sourceTab, payload);
  }
  throw new Error('Não consegui ler um favicon compatível neste domínio. Use o arquivo do favicon no Asset Studio; não dei acesso a domínios externos.');
}

async function captureAndForwardClickBank() {
  const result = await captureActiveClickBank('capture');
  try {
  const payload = createClickBankTransfer(result);
  const url = 'http://127.0.0.1:8765/curadoria/clickbank-top-offers/';
  const existing = await chrome.tabs.query({currentWindow:true,url:`${url}*`});
  let tab = null;
  for (const candidate of existing) {
    if (!candidate?.id) continue;
    try {
      if (new URL(candidate.url).pathname !== '/curadoria/clickbank-top-offers/') continue;
      const [probe] = await chrome.scripting.executeScript({
        target:{tabId:candidate.id},world:'MAIN',func:isClickBankReceiverReady
      });
      if (probe?.result === true) { tab = candidate; break; }
    } catch {
      // Aba antiga, ainda carregando ou sem receptor: preserve-a e abra uma atualizada.
    }
  }
  if (!tab) tab = await chrome.tabs.create({url,active:false});
  if (!tab?.id) throw new Error('Não foi possível abrir Top Offers CB. Inicie o Hub e tente novamente.');
  await waitUntilLoaded(tab.id,20000,'Top Offers CB');
  const [execution] = await chrome.scripting.executeScript({
    target:{tabId:tab.id},world:'MAIN',func:deliverClickBankPreview,args:[payload]
  });
  if (!execution?.result?.ok) throw new Error(execution?.result?.message || 'O Hub não recebeu a captura. Recarregue Top Offers CB e tente novamente.');
  await chrome.tabs.update(tab.id,{active:true});
  return {...result,...execution.result};
  } catch(error) {
    throw Object.assign(error,{captureResult:{...result,ok:false,message:error.message}});
  }
}

async function captureAndSaveDtcCommonCountries() {
  const [sourceTab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!sourceTab?.id || !isClickBankDtcCheckout(sourceTab.url)) {
    throw new Error('Abra o checkout da DTC em orders.clickbank.net na aba ativa. Nenhum dado foi lido.');
  }
  const [sourceExecution] = await chrome.scripting.executeScript({
    target:{tabId:sourceTab.id},func:collectClickBankDtcCommonCountries
  });
  const capture = sourceExecution?.result;
  if (!capture?.ok) throw new Error(capture?.message || 'Não consegui ler os países comuns do checkout. Nada foi salvo.');
  const payload = {schema:'clickbank-dtc-country-capture-v1',source:'clickbank_dtc_checkout',
    productName:capture.productName,countries:capture.countries,capturedAt:capture.capturedAt};

  const url = 'http://127.0.0.1:8765/curadoria/clickbank-top-offers/';
  const existing = await chrome.tabs.query({url:`${url}*`});
  let target = null;
  for (const candidate of existing) {
    if (!candidate?.id) continue;
    try {
      if (new URL(candidate.url).pathname !== '/curadoria/clickbank-top-offers/') continue;
      const [probe] = await chrome.scripting.executeScript({
        target:{tabId:candidate.id},world:'MAIN',func:isDtcCountryReceiverReady
      });
      if (probe?.result === true) { target = candidate; break; }
    } catch { /* Preserve tabs that are stale or still loading. */ }
  }
  if (!target) throw new Error('Nenhuma aba Top Offers CB atualizada foi encontrada. Recarregue a lista no Hub e tente novamente; não é necessário abrir a ficha da oferta e nada foi salvo.');
  const [delivery] = await chrome.scripting.executeScript({
    target:{tabId:target.id},world:'MAIN',func:deliverDtcCommonCountries,args:[payload]
  });
  if (!delivery?.result?.ok) throw new Error(delivery?.result?.message || 'O Hub não aplicou a lista. Nenhum dado foi salvo.');
  return delivery.result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'OPEN_GOOGLE_ADS_RESOURCES') {
    openGoogleAdsResources(message.accountId, sender, message.resourceUrl)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, opened: false, message: error?.message || 'Falha ao abrir a página do Google Ads.' }));
    return true;
  }
  if (message?.type === 'SYNC_GOOGLE_ADS_RESOURCE_BOOKMARKS') {
    if (!hubScreenKey(sender?.url || sender?.tab?.url || '')) {
      sendResponse({ ok: false, message: 'A solicitação não veio de uma tela válida do Hub local.' });
      return false;
    }
    syncGoogleAdsResourceBookmarks()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, message: error?.message || 'Não consegui ler a pasta de favoritos do Chrome.' }));
    return true;
  }
  if (message?.type === 'SCAN_PRODUCT_IMAGES') {
    scanProductImages()
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, message: error?.message || 'Falha ao procurar imagens do produto.' }));
    return true;
  }
  if (message?.type === 'OPEN_PRODUCT_IMAGE_GALLERY') {
    openProductImageGallery(message.capture, message.permissionGranted)
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, message: error?.message || 'Falha ao abrir a galeria de imagens.' }));
    return true;
  }
  if (message?.type === 'IMPORT_SELECTED_PRODUCT_IMAGES') {
    importSelectedProductImages(message.images, sender)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, message: error?.message || 'Falha ao importar imagens do produto.' }));
    return true;
  }
  if (message?.type === 'ACTIVATE_HUB_SCREEN_TAB' || message?.type === 'OPEN_OR_ACTIVATE_HUB_SCREEN_TAB') {
    activateOrOpenHubScreen(message.targetUrl, sender, { openIfMissing:message.type === 'OPEN_OR_ACTIVATE_HUB_SCREEN_TAB' })
      .then(result => sendResponse(result))
      .catch(() => sendResponse({ matched: false, opened:false }));
    return true;
  }
  if (message?.type === 'OPEN_OR_ACTIVATE_HUB_NOTIFICATION_TAB') {
    openOrActivateHubNotificationTab(message.targetUrl, sender, { openIfMissing: message.openIfMissing !== false })
      .then(result => sendResponse(result))
      .catch(() => sendResponse({ matched: false, opened: false }));
    return true;
  }
  if (message?.type === 'CAPTURE_VISIBLE_ASSET') {
    captureVisibleAsset(message.slot)
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, message: error?.message || 'Falha na captura do asset.' }));
    return true;
  }
  if (message?.type === 'CAPTURE_PAGE_FAVICON') {
    capturePageFavicon()
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, message: error?.message || 'Falha na captura do favicon.' }));
    return true;
  }
  if (message?.type === 'CAPTURE_DTC_COMMON_COUNTRIES') {
    captureAndSaveDtcCommonCountries()
      .then(result=>sendResponse({ok:true,result}))
      .catch(error=>sendResponse({ok:false,message:error?.message || 'Falha ao capturar países da DTC.'}));
    return true;
  }
  if (message?.type === 'CAPTURE_AND_FORWARD_CLICKBANK') {
    captureAndForwardClickBank()
      .then(result=>sendResponse({ok:true,result}))
      .catch(error=>sendResponse({ok:false,result:error.captureResult,message:error?.message || 'Falha ao preencher Top Offers CB.'}));
    return true;
  }
  if (message?.type === 'SET_ACTIVE_VSL_SPEED' || message?.type === 'READ_ACTIVE_VSL_SPEED') {
    activeVslSpeed(message.rate, message.type === 'READ_ACTIVE_VSL_SPEED' ? 'read' : 'set')
      .then(result => sendResponse({ ok:result.ok, result }))
      .catch(error => sendResponse({ ok:false, message:error?.message || 'Falha ao controlar a VSL.' }));
    return true;
  }
  if (message?.type === 'CAPTURE_CLICKBANK_PRODUCTS' || message?.type === 'RESTORE_CLICKBANK_TABLE') {
    captureActiveClickBank(message.type === 'RESTORE_CLICKBANK_TABLE' ? 'restore' : 'capture')
      .then(result => sendResponse({ ok:result.ok, result }))
      .catch(error => sendResponse({ ok:false, message:error?.message || 'Falha na captura ClickBank.' }));
    return true;
  }
  return undefined;
});
