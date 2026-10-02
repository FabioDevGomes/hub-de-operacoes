import { showCaptureStatus, showCaptureError } from './capture-status-view.mjs';

const captureButton = document.querySelector('#capture-d0');
const captureD1Button = document.querySelector('#capture-d1');
const captureStatus = document.querySelector('#capture-status');

captureButton.addEventListener('click', async () => {
  captureButton.disabled = true;
  showCaptureStatus(captureStatus, 'Validando e capturando a grade D0 da aba ativa…');
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_AND_FORWARD_MCC_D0' });
    if (!response?.ok) throw response || new Error('Não foi possível preparar a captura D0.');
    showCaptureStatus(captureStatus, `${response.result.campaignCount} campanhas recebidas pelo Preparador. Revise a prévia; a base só muda se você clicar em “Atualizar base”.`);
  } catch (error) {
    showCaptureError(captureStatus, error);
  } finally {
    captureButton.disabled = false;
  }
});

captureD1Button.addEventListener('click', async () => {
  captureD1Button.disabled = true;
  showCaptureStatus(captureStatus, 'Validando a data de ontem e capturando a grade D−1 da aba ativa…');
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_AND_FORWARD_MCC_D1' });
    if (!response?.ok) throw response || new Error('Não foi possível preparar a captura D−1.');
    const result = response.result;
    const nextStep = result.waitingForD0
      ? 'D−1 recebido e validado. Aguardando D0 para gerar a prévia.'
      : 'Revise a prévia; a base só muda se você clicar em “Atualizar base”.';
    showCaptureStatus(captureStatus, `D−1 (${result.reportDate}) · ${result.campaignCount} campanhas. ${nextStep}`);
  } catch (error) {
    showCaptureError(captureStatus, error);
  } finally {
    captureD1Button.disabled = false;
  }
});
