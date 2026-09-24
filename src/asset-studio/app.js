const specs = {
  desktop: { name: '01.png', width: 1892, height: 908, brightness: 0.72, colorMask: 0xFC },
  mobile: { name: '02.png', width: 373, height: 819, brightness: 0.72 },
  favicon: { name: '03.png' }
};

const state = { desktop: null, mobile: null, favicon: null, directory: null, outputDirectory: null, activeSlot: 'desktop', skipFavicon: false };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function updateReadyState() {
  $('#processAll').disabled = !(state.desktop && state.mobile && (state.favicon || state.skipFavicon) && state.directory);
  $('#processAll').textContent = state.skipFavicon ? 'Gerar 01 e 02' : 'Gerar 01, 02 e 03';
}

function setSlot(slot, file) {
  if (!file?.type?.startsWith('image/')) return;
  state[slot] = file;
  const preview = $(`[data-preview="${slot}"]`);
  const zone = $(`[data-pick="${slot}"]`);
  const url = URL.createObjectURL(file);
  preview.onload = () => URL.revokeObjectURL(url);
  preview.src = url;
  zone.classList.add('has-image');
  $(`[data-meta="${slot}"]`).textContent = `${file.name || 'Imagem colada'} · ${formatBytes(file.size)}`;
  state.activeSlot = slot === 'desktop' ? 'mobile' : slot;
  markActive(state.activeSlot);
  updateReadyState();
}

function markActive(slot) {
  $$('.asset-card').forEach(card => card.classList.toggle('active', card.dataset.slot === slot));
  const labels = { desktop: '01.png · Desktop', mobile: '02.png · Mobile', favicon: '03.png · Favicon' };
  $('#activeTargetText').textContent = labels[slot];
  $$('[data-target]').forEach(button => {
    const active = button.dataset.target === slot;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function clearSlot(slot) {
  state[slot] = null;
  const preview = $(`[data-preview="${slot}"]`);
  const zone = $(`[data-pick="${slot}"]`);
  preview.removeAttribute('src');
  zone.classList.remove('has-image');
  const messages = {
    desktop: 'Nenhuma imagem selecionada',
    mobile: 'Nenhuma imagem selecionada',
    favicon: 'Nenhum favicon selecionado. As dimensões e o fundo originais serão preservados.'
  };
  $(`[data-meta="${slot}"]`).textContent = messages[slot];
  state.activeSlot = slot;
  markActive(slot);
  updateReadyState();
}

$$('[data-clear]').forEach(button => button.addEventListener('click', () => clearSlot(button.dataset.clear)));

$('#skipFavicon').addEventListener('change', event => {
  state.skipFavicon = event.target.checked;
  $('[data-slot="favicon"]').classList.toggle('disabled', state.skipFavicon);
  if (state.skipFavicon && state.activeSlot === 'favicon') {
    state.activeSlot = state.mobile ? 'mobile' : 'desktop';
    markActive(state.activeSlot);
  }
  updateReadyState();
});

$$('[data-target]').forEach(button => button.addEventListener('click', () => {
  state.activeSlot = button.dataset.target;
  markActive(state.activeSlot);
}));

$$('[data-pick]').forEach(zone => {
  const slot = zone.dataset.pick;
  zone.addEventListener('click', () => {
    state.activeSlot = slot;
    markActive(slot);
    $(`[data-file="${slot}"]`).click();
  });
  zone.addEventListener('dragover', event => { event.preventDefault(); zone.closest('.asset-card').classList.add('active'); });
  zone.addEventListener('dragleave', () => zone.closest('.asset-card').classList.remove('active'));
  zone.addEventListener('drop', event => {
    event.preventDefault();
    zone.closest('.asset-card').classList.remove('active');
    if (slot === 'favicon') setFaviconBlob(event.dataTransfer.files[0], 'Favicon carregado');
    else setSlot(slot, event.dataTransfer.files[0]);
  });
});

$$('[data-file]').forEach(input => input.addEventListener('change', () => {
  if (input.dataset.file === 'favicon') setFaviconBlob(input.files[0], 'Favicon carregado');
  else setSlot(input.dataset.file, input.files[0]);
}));

function svgTextBlob(clipboardData) {
  const text = clipboardData?.getData('image/svg+xml') || clipboardData?.getData('text/plain') || '';
  return /^\s*<svg(?:\s|>)/i.test(text) ? new Blob([text], { type: 'image/svg+xml' }) : null;
}

window.addEventListener('paste', event => {
  const image = [...event.clipboardData.items].find(item => item.type.startsWith('image/'));
  const blob = image?.getAsFile() || (state.activeSlot === 'favicon' ? svgTextBlob(event.clipboardData) : null);
  if (!blob) return;
  event.preventDefault();
  if (state.activeSlot === 'favicon') setFaviconBlob(blob, 'Favicon colado');
  else setSlot(state.activeSlot, blob);
});

async function blobToImage(blob) {
  if (blob.type === 'image/svg+xml' || /\.svg$/i.test(blob.name || '')) {
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.decoding = 'async';
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('Não foi possível interpretar o SVG do favicon.'));
        image.src = url;
      });
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!width || !height) throw new Error('O SVG não possui dimensões válidas.');
      return { image, width, height, close: () => URL.revokeObjectURL(url) };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
  const image = await createImageBitmap(blob);
  return { image, width: image.width, height: image.height, close: () => image.close() };
}

function drawCover(ctx, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

function optimizeColorsBalanced(imageData, colorMask = 0xF8) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] &= colorMask;
    data[i + 1] &= colorMask;
    data[i + 2] &= colorMask;
  }
  return imageData;
}

async function processBackground(file, spec) {
  const decoded = await blobToImage(file);
  const image = decoded.image;
  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.filter = `brightness(${spec.brightness})`;
  drawCover(ctx, image, spec.width, spec.height);
  ctx.filter = 'none';
  const pixels = ctx.getImageData(0, 0, spec.width, spec.height);
  ctx.putImageData(optimizeColorsBalanced(pixels, spec.colorMask), 0, 0);
  decoded.close();
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function processFavicon(blob) {
  const decoded = await blobToImage(blob);
  const { image, width, height } = decoded;
  if (blob.type === 'image/png') {
    decoded.close();
    return { blob, width, height };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  decoded.close();
  const converted = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Não foi possível converter o favicon para PNG.')), 'image/png'));
  return { blob: converted, width, height };
}

async function setFaviconBlob(blob, label = 'Imagem selecionada') {
  if (!blob || (!blob.type?.startsWith('image/') && !/\.svg$/i.test(blob.name || ''))) return;
  $('#faviconMessage').textContent = 'Validando favicon…';
  try {
    const decoded = await blobToImage(blob);
    decoded.close();
  } catch (error) {
    state.favicon = null;
    $('#faviconMessage').textContent = error.message;
    $('#faviconMessage').className = 'hint error';
    updateReadyState();
    return;
  }
  state.favicon = blob;
  const previewUrl = URL.createObjectURL(blob);
  const preview = $('#faviconPreview');
  preview.onload = () => URL.revokeObjectURL(previewUrl);
  preview.src = previewUrl;
  $('[data-pick="favicon"]').classList.add('has-image');
  $('#faviconMessage').textContent = `${label} · ${formatBytes(blob.size)}`;
  $('#faviconMessage').className = 'hint';
  state.activeSlot = 'favicon';
  markActive('favicon');
  updateReadyState();
}

$('#chooseFolder').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    $('#folderHelp').textContent = 'Este navegador não oferece seleção direta de pasta. Use Chrome ou Edge atualizado.';
    return;
  }
  try {
    state.directory = await window.showDirectoryPicker({ mode: 'readwrite' });
    state.outputDirectory = null;
    $('#openFolder').hidden = true;
    $('#folderName').textContent = state.directory.name;
    $('#folderHelp').textContent = `${state.directory.name} / assets`;
    updateReadyState();
  } catch (error) {
    if (error.name !== 'AbortError') $('#folderHelp').textContent = `Falha ao abrir a pasta: ${error.message}`;
  }
});

$('#openFolder').addEventListener('click', async () => {
  if (!state.outputDirectory || !window.showDirectoryPicker) return;
  try {
    // O File System Access API não expõe o caminho local nem permite abrir o Explorer.
    // Reabrimos o seletor nativo já posicionado na pasta de saída para o usuário ver os arquivos.
    await window.showDirectoryPicker({ id: 'asset-studio-output', mode: 'readwrite', startIn: state.outputDirectory });
  } catch (error) {
    if (error.name !== 'AbortError') $('#folderHelp').textContent = `Não foi possível abrir a pasta de saída: ${error.message}`;
  }
});

async function fileExists(directory, name) {
  try { await directory.getFileHandle(name); return true; }
  catch (error) { if (error.name === 'NotFoundError') return false; throw error; }
}

async function saveBlob(directory, name, blob) {
  if (await fileExists(directory, name) && !confirm(`${name} já existe. Deseja substituir somente esse arquivo?`)) {
    return { skipped: true };
  }
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return { skipped: false };
}

function addResult(text, status = '') {
  const row = document.createElement('div');
  row.className = `result ${status}`;
  row.textContent = text;
  $('#results').appendChild(row);
}

$('#processAll').addEventListener('click', async () => {
  const button = $('#processAll');
  button.disabled = true;
  button.textContent = 'Processando…';
  $('#openFolder').hidden = true;
  $('#results').replaceChildren();
  try {
    const assetsDirectory = await state.directory.getDirectoryHandle('assets', { create: true });
    const outputs = [
      { spec: specs.desktop, blob: await processBackground(state.desktop, specs.desktop), width: specs.desktop.width, height: specs.desktop.height },
      { spec: specs.mobile, blob: await processBackground(state.mobile, specs.mobile), width: specs.mobile.width, height: specs.mobile.height }
    ];
    if (!state.skipFavicon) outputs.push({ spec: specs.favicon, ...(await processFavicon(state.favicon)) });
    for (const { spec, blob, width, height } of outputs) {
      const result = await saveBlob(assetsDirectory, spec.name, blob);
      if (result.skipped) addResult(`assets/${spec.name} preservado — substituição cancelada.`);
      else addResult(`assets/${spec.name} · ${width} × ${height} · ${formatBytes(blob.size)} · salvo`, 'ok');
    }
    state.outputDirectory = assetsDirectory;
    $('#openFolder').hidden = false;
    $('#folderHelp').textContent = `${state.directory.name} / assets · clique em “Abrir pasta” para abrir o seletor nessa pasta.`;
  } catch (error) {
    addResult(`Falha: ${error.message}`, 'error');
  } finally {
    updateReadyState();
  }
});

markActive('desktop');
