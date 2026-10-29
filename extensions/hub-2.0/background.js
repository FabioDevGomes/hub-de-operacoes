import { collectClickBankProducts } from './clickbank-reader.mjs';
import { CLICKBANK_COLUMNS, isClickBankMarketplace } from './clickbank-domain.mjs';
import { isVslRate, isVslPage } from './vsl-domain.mjs';
import { controlVslSpeed } from './vsl-controller.mjs';
import { collectClickBankDtcCommonCountries, isClickBankDtcCheckout } from './clickbank-dtc-reader.mjs';
import { createClickBankTransfer, deliverClickBankPreview, isClickBankReceiverReady, deliverDtcCommonCountries, isDtcCountryReceiverReady } from './clickbank-forward.mjs';

const ASSET_STUDIO_URL = 'http://127.0.0.1:8765/asset-studio/';
const ASSET_STUDIO_MATCH = `${ASSET_STUDIO_URL}*`;
const HUB_ORIGIN = 'http://127.0.0.1:8765';

function hubScreenKey(urlText) {
  try {
    const url = new URL(urlText);
    if (url.origin !== HUB_ORIGIN || url.protocol !== 'http:') return '';
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path !== '/') return `path:${path}`;
    const requestedView = url.searchParams.get('view') || '';
    const view = requestedView === 'presell' ? 'copy' : requestedView;
    return `view:${view || 'totals'}`;
  } catch {
    return '';
  }
}

async function activateMatchingHubScreen(targetUrl, sender) {
  const sourceUrl = sender?.url || sender?.tab?.url || '';
  if (!hubScreenKey(sourceUrl)) return { matched: false };
  const requestedScreen = hubScreenKey(targetUrl);
  if (!requestedScreen) return { matched: false };

  const tabs = await chrome.tabs.query({ url: `${HUB_ORIGIN}/*` });
  const matchingTabs = tabs
    .filter(tab => tab?.id != null && hubScreenKey(tab.url) === requestedScreen)
    .sort((left, right) => {
      const leftSameWindow = left.windowId === sender?.tab?.windowId;
      const rightSameWindow = right.windowId === sender?.tab?.windowId;
      if (leftSameWindow !== rightSameWindow) return leftSameWindow ? -1 : 1;
      return Number(Boolean(right.active)) - Number(Boolean(left.active));
    });
  const targetTab = matchingTabs[0];
  if (!targetTab) return { matched: false };

  const currentTab = targetTab.id === sender?.tab?.id;
  if (!currentTab) {
    try {
      const targetWindow = await chrome.windows.get(targetTab.windowId);
      if (targetWindow.state === 'minimized') await chrome.windows.update(targetTab.windowId, { state: 'normal' });
    } catch { /* The tab may close between discovery and activation. */ }
    try { await chrome.tabs.update(targetTab.id, { active: true }); }
    catch { return { matched: false }; }
    try { await chrome.windows.update(targetTab.windowId, { focused: true }); }
    catch { /* Keep the matched tab active even if Chrome declines window focus. */ }
  }
  return { matched: true, currentTab };
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
  if (action === 'set' && !isVslRate(rate)) throw new Error('Velocidade inválida. Use 1×, 10×, 20× ou 30×.');
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
    try { return new URL(candidate.url).pathname.startsWith('/asset-studio/'); }
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
  if (message?.type === 'ACTIVATE_HUB_SCREEN_TAB') {
    activateMatchingHubScreen(message.targetUrl, sender)
      .then(result => sendResponse(result))
      .catch(() => sendResponse({ matched: false }));
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
