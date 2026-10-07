import { deliverD0GridToPreparador, deliverD1GridToPreparador } from './bridge.mjs';
import { collectMccGrid } from './mcc-grid-reader.mjs';
import { collectMccSelectableText } from './mcc-text-reader.mjs';
import { scrollMccPageToBottom } from './mcc-page-scroll.mjs';
import { D0_FIELDS, HEADER_ALIASES, validateMccD0Capture, validateMccD1Capture } from './mcc-grid-domain.mjs';
import { parseMccSelectableText } from './mcc-text-domain.mjs';
import { collectClickBankProducts } from './clickbank-reader.mjs';
import { CLICKBANK_COLUMNS, isClickBankMarketplace } from './clickbank-domain.mjs';
import { isVslRate, isVslPage } from './vsl-domain.mjs';
import { controlVslSpeed } from './vsl-controller.mjs';
import { collectClickBankDtcCommonCountries, isClickBankDtcCheckout } from './clickbank-dtc-reader.mjs';
import { createClickBankTransfer, deliverClickBankPreview, isClickBankReceiverReady, deliverDtcCommonCountries, isDtcCountryReceiverReady } from './clickbank-forward.mjs';

const PREPARADOR_URL = 'http://127.0.0.1:8765/preparador-MCC/';
const PREPARADOR_MATCH = `${PREPARADOR_URL}*`;

function waitUntilLoaded(tabId, timeoutMs = 20000, label = 'Preparador MCC') {
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

async function forwardD0Grid(capture) {
  const existing = await chrome.tabs.query({ currentWindow: true, url: PREPARADOR_MATCH });
  // Keep the popup open while the receiver validates the capture so failures
  // remain visible there. Focus the Preparador only after it acknowledges.
  const tab = existing[0] || await chrome.tabs.create({ url: PREPARADOR_URL, active: false });
  if (!tab?.id) throw new Error('Não foi possível abrir uma aba do Preparador MCC.');

  await waitUntilLoaded(tab.id);
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    // O receptor é definido pelo script da própria página; ISOLATED (padrão)
    // compartilha o DOM, mas não o window JavaScript do Preparador.
    world: 'MAIN',
    func: deliverD0GridToPreparador,
    args: [capture]
  });
  if (!execution?.result?.ok) throw new Error(execution?.result?.message || 'O Preparador não recebeu a captura D0.');
  await chrome.tabs.update(tab.id, { active: true });
  return execution.result;
}

async function forwardD1Grid(capture) {
  const existing = await chrome.tabs.query({ currentWindow: true, url: PREPARADOR_MATCH });
  const tab = existing[0] || await chrome.tabs.create({ url: PREPARADOR_URL, active: false });
  if (!tab?.id) throw new Error('Não foi possível abrir uma aba do Preparador MCC.');

  await waitUntilLoaded(tab.id);
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: deliverD1GridToPreparador,
    args: [capture]
  });
  if (!execution?.result?.ok) throw new Error(execution?.result?.message || 'O Preparador não recebeu a captura D−1.');
  await chrome.tabs.update(tab.id, { active: true });
  return execution.result;
}

async function readActiveMccGrid() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/ads\.google\.com\//i.test(String(tab.url || ''))) {
    throw new Error('Abra primeiro a aba da MCC/Google Ads e tente novamente. Nenhum dado foi lido.');
  }
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: collectMccGrid,
    args: [D0_FIELDS, HEADER_ALIASES]
  });
  if (!execution?.result?.ok) throw new Error(execution?.result?.error || 'A leitura da grade MCC falhou de forma segura.');
  return execution.result;
}

async function scrollActiveMccPageToBottom() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/ads\.google\.com\//i.test(String(tab.url || ''))) {
    throw new Error('Abra primeiro a aba da MCC/Google Ads e tente novamente. Nenhum dado foi lido.');
  }
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: scrollMccPageToBottom
  });
  if (!execution?.result?.ok) throw new Error(execution?.result?.message || 'Não foi possível rolar a página da MCC.');
  return execution.result;
}

async function captureAndForwardActiveMccD0() {
  const snapshot = await readActiveMccGrid();
  const validation = validateMccD0Capture(snapshot);
  if (!validation.ok) throw Object.assign(new Error(validation.errors.map(item => item.message).join('\n')), { errors: validation.errors });
  const received = await forwardD0Grid(validation.capture);
  return { ...received, campaignCount: validation.capture.campaignCount };
}

async function captureAndForwardActiveMccD1() {
  const snapshot = await readActiveMccGrid();
  const validation = validateMccD1Capture(snapshot);
  if (!validation.ok) throw Object.assign(new Error(validation.errors.map(item => item.message).join('\n')), { errors: validation.errors });
  const received = await forwardD1Grid(validation.capture);
  return { ...received, campaignCount: validation.capture.campaignCount };
}

async function readActiveMccText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/ads\.google\.com\//i.test(String(tab.url || ''))) {
    throw new Error('Abra primeiro a aba da MCC/Google Ads e tente novamente. Nenhum dado foi lido.');
  }
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: collectMccSelectableText
  });
  const capture = execution?.result;
  if (!capture?.ok) throw new Error(capture?.error || 'Não consegui capturar o texto renderizado da MCC.');
  // O texto bruto só atravessa a mensagem internamente no service worker para
  // ser analisado; a resposta ao popup contém apenas campos reconhecidos.
  return parseMccSelectableText(capture.text);
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
  if (message?.type === 'SCROLL_ACTIVE_MCC_TO_BOTTOM') {
    scrollActiveMccPageToBottom()
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, message: error?.message || 'Falha na rolagem automática da MCC.' }));
    return true;
  }
  if (message?.type === 'CAPTURE_AND_FORWARD_MCC_D0') {
    captureAndForwardActiveMccD0()
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, message: error?.message || 'Falha na captura direta do D0.', errors: error?.errors }));
    return true;
  }
  if (message?.type === 'CAPTURE_AND_FORWARD_MCC_D1') {
    captureAndForwardActiveMccD1()
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, message: error?.message || 'Falha na captura estrutural do D−1.', errors: error?.errors }));
    return true;
  }
  if (message?.type === 'READ_ACTIVE_MCC_GRID') {
    readActiveMccGrid()
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, message: error?.message || 'Falha ao ler a grade da MCC.' }));
    return true;
  }
  if (message?.type === 'READ_ACTIVE_MCC_TEXT') {
    readActiveMccText()
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, message: error?.message || 'Falha segura na captura de texto da MCC.' }));
    return true;
  }
  return undefined;
});
