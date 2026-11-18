import { showCaptureError, showCaptureStatus } from './capture-status-view.mjs';

export function mountAssetCapture({ document, sendMessage, setDisabled }) {
  const status = document.querySelector('#asset-capture-status');
  const desktopButton = document.querySelector('#capture-asset-desktop');
  const mobileButton = document.querySelector('#capture-asset-mobile');
  const faviconButton = document.querySelector('#capture-asset-favicon');
  const findProductImagesButton = document.querySelector('#find-product-images');
  const authorizeProductImagesButton = document.querySelector('#authorize-product-images');
  let pendingProductImageCapture = null;

  async function sendMessageWithTimeout(message, timeoutMs, timeoutMessage) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => sendMessage(message)),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

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

  function imageHostPatterns(candidates) {
    return [...new Set(candidates.map(candidate => {
      try {
        const url = new URL(candidate.url);
        if (!['http:', 'https:'].includes(url.protocol)) return '';
        return `${url.protocol}//${url.host}/*`;
      } catch { return ''; }
    }).filter(Boolean))];
  }

  async function openProductImageGallery(capture, { requestPermission = false } = {}) {
    setDisabled(true);
    showCaptureStatus(status, requestPermission
      ? 'Aguardando a autorização dos domínios das imagens no Chrome…'
      : 'Preparando a galeria de imagens do produto…');
    try {
      if (requestPermission) {
        const origins = Array.isArray(capture.permissionOrigins) ? capture.permissionOrigins : [];
        // This call must happen synchronously in the popup button's click handler;
        // Chrome can reject permission prompts after an asynchronous scan.
        const permissionRequest = chrome.permissions.request({ origins });
        const granted = await permissionRequest;
        if (!granted) {
          showCaptureStatus(status, 'A autorização não foi concedida. A galeria não foi aberta; você pode tentar novamente por este botão.');
          return;
        }
      }
      const response = await sendMessageWithTimeout({
        type: 'OPEN_PRODUCT_IMAGE_GALLERY',
        capture
      }, 45_000, 'A galeria demorou mais que 45 segundos para responder. Confira se o Hub local está aberto e tente novamente.');
      if (!response?.ok) throw new Error(response?.message || 'Não consegui abrir a galeria no Asset Studio.');
      pendingProductImageCapture = null;
      authorizeProductImagesButton.hidden = true;
      const scanNote = capture.scanTruncated
        ? ` A busca percorreu ${capture.scannedImageCount} de ${capture.imageElementCount} imagens do documento; role a página e faça uma nova busca para procurar mais opções.`
        : '';
      showCaptureStatus(status, `${response.result?.message || 'Galeria aberta no Asset Studio.'}${scanNote}`);
    } catch (error) {
      showCaptureError(status, error);
    } finally {
      setDisabled(false);
    }
  }

  findProductImagesButton.addEventListener('click', async () => {
    setDisabled(true);
    authorizeProductImagesButton.hidden = true;
    pendingProductImageCapture = null;
    showCaptureStatus(status, 'Procurando imagens carregadas na página do produto…');
    try {
      const response = await sendMessageWithTimeout(
        { type: 'SCAN_PRODUCT_IMAGES' },
        18_000,
        'A extensão não respondeu em 18 segundos. Recarregue Hub 2.0 em chrome://extensions e tente novamente.'
      );
      if (!response?.ok) throw new Error(response?.message || 'Não consegui procurar imagens nesta página.');
      pendingProductImageCapture = response.result;
      const count = pendingProductImageCapture?.candidates?.length || 0;
      if (!count) {
        pendingProductImageCapture = null;
        showCaptureStatus(status, 'Não encontrei imagens de produto carregadas. Abra a página do produto, role até a imagem desejada e tente novamente.');
        return;
      }
      const origins = imageHostPatterns(pendingProductImageCapture.candidates);
      const permissions = await Promise.all(origins.map(origin => chrome.permissions.contains({ origins: [origin] })));
      pendingProductImageCapture.permissionOrigins = origins.filter((_, index) => !permissions[index]);
      const scanNote = pendingProductImageCapture.scanTruncated
        ? ` A busca percorreu ${pendingProductImageCapture.scannedImageCount} de ${pendingProductImageCapture.imageElementCount} imagens do documento; role a página e tente novamente para procurar mais opções.`
        : '';
      if (pendingProductImageCapture.permissionOrigins.length) {
        authorizeProductImagesButton.hidden = false;
        showCaptureStatus(status, `Encontrei ${count} imagens.${scanNote} Clique em “Autorizar acesso e abrir galeria”; o Chrome pedirá acesso somente aos domínios dessas imagens.`);
        return;
      }
      await openProductImageGallery(pendingProductImageCapture);
    } catch (error) {
      showCaptureError(status, error);
    } finally {
      setDisabled(false);
    }
  });

  authorizeProductImagesButton.addEventListener('click', () => {
    if (pendingProductImageCapture) void openProductImageGallery(pendingProductImageCapture, { requestPermission: true });
  });
}
