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
  ...[1, 10, 20, 30].map(rate => document.querySelector(`#vsl-speed-${rate}`))
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
