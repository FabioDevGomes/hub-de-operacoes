import { deliverD0GridToPreparador, deliverD1GridToPreparador } from './bridge.mjs';
import { collectMccGrid } from './mcc-grid-reader.mjs';
import { collectMccSelectableText } from './mcc-text-reader.mjs';
import { scrollMccPageToBottom } from './mcc-page-scroll.mjs';
import { D0_FIELDS, HEADER_ALIASES, validateMccD0Capture, validateMccD1Capture } from './mcc-grid-domain.mjs';
import { parseMccSelectableText } from './mcc-text-domain.mjs';

const PREPARADOR_URL = 'http://127.0.0.1:8765/preparador-MCC/';
const PREPARADOR_MATCH = `${PREPARADOR_URL}*`;

function waitUntilLoaded(tabId, timeoutMs = 20000) {
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
    const timer = setTimeout(() => finish(reject, new Error('O Preparador MCC demorou demais para carregar.')), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId, tab => {
      if (chrome.runtime.lastError) finish(reject, new Error('Não consegui abrir o Preparador MCC local. Inicie o Hub e tente novamente.'));
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
