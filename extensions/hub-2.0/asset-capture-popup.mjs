import { showCaptureError, showCaptureStatus } from './capture-status-view.mjs';

export function mountAssetCapture({ document, sendMessage, setDisabled }) {
  const status = document.querySelector('#asset-capture-status');
  const desktopButton = document.querySelector('#capture-asset-desktop');
  const mobileButton = document.querySelector('#capture-asset-mobile');
  const faviconButton = document.querySelector('#capture-asset-favicon');

  async function run(message, loadingText) {
    setDisabled(true);
    showCaptureStatus(status, loadingText);
    try {
      const response = await sendMessage(message);
      if (!response?.ok) throw new Error(response?.message || 'A captura não foi enviada ao Asset Studio.');
      showCaptureStatus(status, response.result?.message || 'Asset enviado ao Asset Studio.');
    } catch (error) {
      showCaptureError(status, error);
    } finally {
      setDisabled(false);
    }
  }

  desktopButton.addEventListener('click', () => run(
    { type: 'CAPTURE_VISIBLE_ASSET', slot: 'desktop' },
    'Capturando a área visível e enviando como Desktop…'
  ));
  mobileButton.addEventListener('click', () => run(
    { type: 'CAPTURE_VISIBLE_ASSET', slot: 'mobile' },
    'Capturando a área visível e enviando como Mobile…'
  ));
  faviconButton.addEventListener('click', () => run(
    { type: 'CAPTURE_PAGE_FAVICON' },
    'Localizando o favicon da página e enviando ao Asset Studio…'
  ));
}
