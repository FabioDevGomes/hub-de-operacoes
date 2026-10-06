import { showCaptureStatus, showCaptureError } from './capture-status-view.mjs';
import { mountClickBankCapture } from './clickbank-popup.mjs';
import { mountClickBankDtcCountries } from './clickbank-dtc-popup.mjs';
import { mountVslSpeed } from './vsl-popup.mjs';

const captureButton = document.querySelector('#capture-d0');
const captureD1Button = document.querySelector('#capture-d1');
const scrollButton = document.querySelector('#scroll-to-bottom');
const captureStatus = document.querySelector('#capture-status');
const actionButtons = [scrollButton, captureD1Button, captureButton,
  document.querySelector('#capture-clickbank'), document.querySelector('#restore-clickbank'),
  document.querySelector('#capture-dtc-countries'),
  ...[1,10,20,30].map(rate => document.querySelector(`#vsl-speed-${rate}`))];

function setActionsDisabled(disabled) {
  for (const button of actionButtons) button.disabled = disabled;
}

mountClickBankCapture({ document, sendMessage:message => chrome.runtime.sendMessage(message),
  clipboard:navigator.clipboard, setDisabled:setActionsDisabled });
mountClickBankDtcCountries({document,sendMessage:message=>chrome.runtime.sendMessage(message),setDisabled:setActionsDisabled});
mountVslSpeed({ document, sendMessage:message => chrome.runtime.sendMessage(message), setDisabled:setActionsDisabled });

scrollButton.addEventListener('click', async () => {
  setActionsDisabled(true);
  showCaptureStatus(captureStatus, 'Rolando a grade da MCC até o final; aguarde o carregamento das campanhas…');
  try {
    const response = await chrome.runtime.sendMessage({ type: 'SCROLL_ACTIVE_MCC_TO_BOTTOM' });
    if (!response?.ok) throw response || new Error('Não foi possível rolar a página da MCC.');
    const message = response.result?.steps
      ? 'Fim da grade alcançado. Agora você pode capturar D0 ou D−1.'
      : 'A grade já estava no final. Agora você pode capturar D0 ou D−1.';
    showCaptureStatus(captureStatus, message);
  } catch (error) {
    showCaptureError(captureStatus, error);
  } finally {
    setActionsDisabled(false);
  }
});

captureButton.addEventListener('click', async () => {
  setActionsDisabled(true);
  showCaptureStatus(captureStatus, 'Validando e capturando a grade D0 da aba ativa…');
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_AND_FORWARD_MCC_D0' });
    if (!response?.ok) throw response || new Error('Não foi possível preparar a captura D0.');
    showCaptureStatus(captureStatus, `${response.result.campaignCount} campanhas recebidas pelo Preparador. Revise a prévia; a base só muda se você clicar em “Atualizar base”.`);
  } catch (error) {
    showCaptureError(captureStatus, error);
  } finally {
    setActionsDisabled(false);
  }
});

captureD1Button.addEventListener('click', async () => {
  setActionsDisabled(true);
  showCaptureStatus(captureStatus, 'Validando a data de ontem e capturando a grade D−1 da aba ativa…');
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_AND_FORWARD_MCC_D1' });
    if (!response?.ok) throw response || new Error('Não foi possível preparar a captura D−1.');
    const result = response.result;
    const nextStep = result.waitingForD0
      ? 'D−1 recebido e validado. Aguardando D0 para gerar a prévia.'
      : result.previewReady
        ? 'D−1 validado e prévia pronta. A base só muda se você clicar em “Atualizar base”.'
        : 'Revise a prévia; a base só muda se você clicar em “Atualizar base”.';
    showCaptureStatus(captureStatus, `D−1 (${result.reportDate}) · ${result.campaignCount} campanhas. ${nextStep}`);
  } catch (error) {
    showCaptureError(captureStatus, error);
  } finally {
    setActionsDisabled(false);
  }
});
