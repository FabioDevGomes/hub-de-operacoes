(() => {
  function mount({ button, modal }) {
    const closeButton = modal.querySelector('#closeKnowledgeExport');
    const cancelButton = modal.querySelector('#cancelKnowledgeExport');
    const downloadButton = modal.querySelector('#confirmKnowledgeExport');
    const status = modal.querySelector('#knowledgeExportStatus');
    const stats = modal.querySelector('#knowledgeExportStats');
    const fileList = modal.querySelector('#knowledgeExportFileList');
    let manifest = null;

    function setStatus(message, error = false) {
      status.textContent = message;
      status.dataset.state = error ? 'error' : 'ready';
    }

    function formatBytes(value) {
      const bytes = Number(value);
      if (!Number.isFinite(bytes) || bytes < 0) return '—';
      if (bytes < 1024) return `${bytes} bytes`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KiB`;
      return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MiB`;
    }

    function renderFiles(payload) {
      const generatedFiles = [
        { path: 'README.md', group: 'Informações do pacote', bytes: null },
        { path: 'MANIFEST.json', group: 'Informações do pacote', bytes: null }
      ];
      const files = [...generatedFiles, ...(Array.isArray(payload.files) ? payload.files : [])];
      fileList.replaceChildren();
      for (const file of files) {
        const item = document.createElement('li');
        const path = document.createElement('span');
        path.className = 'knowledge-export-file-path';
        path.textContent = String(file.path || 'Arquivo sem nome');
        const group = document.createElement('span');
        group.className = 'knowledge-export-file-group';
        group.textContent = String(file.group || 'Informações do pacote');
        const size = document.createElement('span');
        size.className = 'knowledge-export-file-size';
        size.textContent = formatBytes(file.bytes);
        item.append(path, group, size);
        fileList.append(item);
      }

      stats.replaceChildren();
      for (const value of [
        `${Number(payload.outputFileCount) || files.length} arquivos no ZIP`,
        `${Number(payload.sourceFileCount) || 0} fontes selecionadas`,
        `aprox. ${formatBytes(payload.totalBytes)}`
      ]) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = value;
        stats.append(tag);
      }
    }

    async function request(path) {
      return fetch(path, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'X-Hub-Knowledge-Export': '1' }
      });
    }

    async function responseError(response) {
      try {
        const payload = await response.json();
        return String(payload.error || payload.reason || 'A solicitação local foi recusada.');
      } catch {
        return 'O serviço local não respondeu com o formato esperado.';
      }
    }

    async function loadManifest() {
      manifest = null;
      downloadButton.disabled = true;
      stats.replaceChildren();
      fileList.replaceChildren();
      setStatus('Carregando a lista do pacote…');
      try {
        const response = await request('/api/knowledge/manifest');
        if (!response.ok) throw new Error(await responseError(response));
        manifest = await response.json();
        renderFiles(manifest);
        if (!manifest.available) {
          const missing = Array.isArray(manifest.missing) && manifest.missing.length
            ? ` Fontes ausentes: ${manifest.missing.join('; ')}`
            : '';
          setStatus(`${manifest.reason || 'O pacote não está disponível.'}${missing}`, true);
          return;
        }
        setStatus('Revise a lista. O ZIP só será montado quando você confirmar o download.');
        downloadButton.disabled = false;
      } catch (error) {
        setStatus(error.message || 'Não foi possível carregar a prévia do pacote.', true);
      }
    }

    function close() {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
      button.focus();
    }

    async function download() {
      if (!manifest?.available || downloadButton.disabled) return;
      downloadButton.disabled = true;
      cancelButton.disabled = true;
      closeButton.disabled = true;
      setStatus('Preparando o ZIP privado…');
      try {
        const response = await request('/api/knowledge/export.zip');
        if (!response.ok) throw new Error(await responseError(response));
        const blob = await response.blob();
        if (blob.type && blob.type !== 'application/zip' && blob.type !== 'application/octet-stream') {
          throw new Error('O serviço local retornou um arquivo em formato inesperado.');
        }
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = 'hub-conhecimento-privado.zip';
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        setStatus('Download iniciado. O ZIP contém conhecimento técnico e instruções, não registros operacionais.');
      } catch (error) {
        setStatus(error.message || 'Não foi possível gerar o ZIP.', true);
      } finally {
        downloadButton.disabled = !manifest?.available;
        cancelButton.disabled = false;
        closeButton.disabled = false;
      }
    }

    button.addEventListener('click', () => {
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
      closeButton.focus();
      void loadManifest();
    });
    closeButton.addEventListener('click', close);
    cancelButton.addEventListener('click', close);
    downloadButton.addEventListener('click', () => void download());
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.classList.contains('hidden')) close();
    });
    modal.setAttribute('aria-hidden', 'true');
  }

  window.KnowledgeExportView = { mount };
})();
