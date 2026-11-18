import { mountClickBankCapture } from './clickbank-popup.mjs';
import { mountClickBankDtcCountries } from './clickbank-dtc-popup.mjs';
import { mountVslSpeed } from './vsl-popup.mjs';
import { mountAssetCapture } from './asset-capture-popup.mjs';

const actionButtons = [
  document.querySelector('#capture-clickbank'),
  document.querySelector('#restore-clickbank'),
  document.querySelector('#capture-dtc-countries'),
  document.querySelector('#capture-asset-desktop'),
  document.querySelector('#capture-asset-mobile'),
  document.querySelector('#capture-asset-favicon'),
  document.querySelector('#find-product-images'),
  document.querySelector('#authorize-product-images'),
  ...[1, 20, 30, 40, 50].map(rate => document.querySelector(`#vsl-speed-${rate}`))
];

function setActionsDisabled(disabled) {
  for (const button of actionButtons) button.disabled = disabled;
}

mountClickBankCapture({
  document,
  sendMessage: message => chrome.runtime.sendMessage(message),
  clipboard: navigator.clipboard,
  setDisabled: setActionsDisabled
});
mountClickBankDtcCountries({
  document,
  sendMessage: message => chrome.runtime.sendMessage(message),
  setDisabled: setActionsDisabled
});
mountVslSpeed({
  document,
  sendMessage: message => chrome.runtime.sendMessage(message),
  setDisabled: setActionsDisabled
});
mountAssetCapture({
  document,
  sendMessage: message => chrome.runtime.sendMessage(message),
  setDisabled: setActionsDisabled
});

const authorizeGoogleAdsButton = document.querySelector('#authorize-google-ads');
const googleAdsPermissionStatus = document.querySelector('#google-ads-permission-status');
const googleAdsHostPermission = 'https://ads.google.com/*';
const authorizeGoogleAdsBookmarksButton = document.querySelector('#authorize-google-ads-bookmarks');
const googleAdsBookmarksPermissionStatus = document.querySelector('#google-ads-bookmarks-permission-status');
const googleAdsBookmarksPermission = 'bookmarks';
let googleAdsPermissionRequestPending = false;
let googleAdsBookmarksPermissionRequestPending = false;

function renderGoogleAdsPermission(granted, message = '') {
  authorizeGoogleAdsButton.disabled = Boolean(granted);
  authorizeGoogleAdsButton.textContent = granted ? 'Acesso ao Google Ads autorizado' : 'Autorizar acesso ao Google Ads';
  googleAdsPermissionStatus.textContent = message || (granted
    ? 'Pronto para usar o filtro de produto no Hub.'
    : 'O Chrome perguntará se a extensão pode acessar ads.google.com.');
  googleAdsPermissionStatus.classList.toggle('error', !granted && Boolean(message));
}

authorizeGoogleAdsButton.addEventListener('click', () => {
  googleAdsPermissionStatus.classList.remove('error');
  googleAdsPermissionStatus.textContent = 'Solicitando ao Chrome acesso somente a ads.google.com…';
  authorizeGoogleAdsButton.disabled = true;
  googleAdsPermissionRequestPending = true;
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    googleAdsPermissionRequestPending = false;
    renderGoogleAdsPermission(false, 'O Chrome não respondeu à solicitação. Feche e reabra o popup da extensão e tente novamente.');
  }, 12000);
  try {
    // Call synchronously from this click handler so Chrome retains the user gesture.
    chrome.permissions.request({ origins: [googleAdsHostPermission] }, granted => {
      if (settled) return;
      settled = true;
      googleAdsPermissionRequestPending = false;
      clearTimeout(timer);
      const error = chrome.runtime.lastError?.message || '';
      if (error) {
        renderGoogleAdsPermission(false, 'O Chrome recusou a solicitação: ' + error);
        return;
      }
      renderGoogleAdsPermission(Boolean(granted), granted
        ? 'Acesso concedido. Volte ao Hub e clique em “Abrir recursos no Google Ads”.'
        : 'O acesso não foi autorizado. Você pode tentar novamente por este botão.');
    });
  } catch (error) {
    settled = true;
    googleAdsPermissionRequestPending = false;
    clearTimeout(timer);
    renderGoogleAdsPermission(false, 'Não consegui solicitar acesso ao Chrome: ' + (error?.message || 'erro desconhecido.'));
  }
});

// Attach the click handler before querying current permission state so any API
// error cannot leave the visible authorization button without an action.
try {
  chrome.permissions.contains({ origins: [googleAdsHostPermission] }, granted => {
    if (chrome.runtime.lastError) {
      renderGoogleAdsPermission(false, 'Não consegui consultar a permissão no Chrome: ' + chrome.runtime.lastError.message);
      return;
    }
    if (!googleAdsPermissionRequestPending) renderGoogleAdsPermission(Boolean(granted));
  });
} catch (error) {
  renderGoogleAdsPermission(false, 'Não consegui consultar a permissão no Chrome: ' + (error?.message || 'erro desconhecido.'));
}

function renderGoogleAdsBookmarksPermission(granted, message = '') {
  authorizeGoogleAdsBookmarksButton.disabled = Boolean(granted) || googleAdsBookmarksPermissionRequestPending;
  authorizeGoogleAdsBookmarksButton.textContent = granted ? 'Leitura de favoritos autorizada' : 'Autorizar leitura de favoritos';
  googleAdsBookmarksPermissionStatus.textContent = message || (granted
    ? 'Pronto. O Hub lê links de Campanhas salvos diretamente em contas e links de Recursos/Campanhas em contas > pag recursos ao abrir Criar campanha Google Ads ou Visão Geral e quando um favorito muda.'
    : 'O Chrome pedirá autorização para a extensão consultar a árvore de favoritos. O Hub lê links de Campanhas em contas e links de Recursos/Campanhas em contas > pag recursos.');
  googleAdsBookmarksPermissionStatus.classList.toggle('error', !granted && Boolean(message));
}

authorizeGoogleAdsBookmarksButton.addEventListener('click', () => {
  googleAdsBookmarksPermissionStatus.classList.remove('error');
  googleAdsBookmarksPermissionStatus.textContent = 'Solicitando ao Chrome permissão para ler favoritos…';
  authorizeGoogleAdsBookmarksButton.disabled = true;
  googleAdsBookmarksPermissionRequestPending = true;
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    googleAdsBookmarksPermissionRequestPending = false;
    renderGoogleAdsBookmarksPermission(false, 'O Chrome não respondeu. Feche e reabra o popup da extensão e tente novamente.');
  }, 12000);
  try {
    chrome.permissions.request({ permissions: [googleAdsBookmarksPermission] }, granted => {
      if (settled) return;
      settled = true;
      googleAdsBookmarksPermissionRequestPending = false;
      clearTimeout(timer);
      const error = chrome.runtime.lastError?.message || '';
      if (error) {
        renderGoogleAdsBookmarksPermission(false, 'O Chrome recusou a solicitação: ' + error);
        return;
      }
      renderGoogleAdsBookmarksPermission(Boolean(granted), granted
        ? 'Acesso autorizado. Volte ao Hub; os favoritos de Campanhas em contas e de Recursos/Campanhas em contas > pag recursos serão importados automaticamente.'
        : 'A permissão não foi concedida. Você pode tentar novamente por este botão.');
    });
  } catch (error) {
    settled = true;
    googleAdsBookmarksPermissionRequestPending = false;
    clearTimeout(timer);
    renderGoogleAdsBookmarksPermission(false, 'Não consegui solicitar a permissão: ' + (error?.message || 'erro desconhecido.'));
  }
});

try {
  chrome.permissions.contains({ permissions: [googleAdsBookmarksPermission] }, granted => {
    if (chrome.runtime.lastError) {
      renderGoogleAdsBookmarksPermission(false, 'Não consegui consultar a permissão no Chrome: ' + chrome.runtime.lastError.message);
      return;
    }
    if (!googleAdsBookmarksPermissionRequestPending) renderGoogleAdsBookmarksPermission(Boolean(granted));
  });
} catch (error) {
  renderGoogleAdsBookmarksPermission(false, 'Não consegui consultar a permissão no Chrome: ' + (error?.message || 'erro desconhecido.'));
}
