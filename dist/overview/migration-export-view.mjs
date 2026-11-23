import { exportMigration } from './migration-export.mjs?v=3';

export function mountMigrationExport({ button, status, cancel, windowObject = window, exporter = exportMigration }) {
  let controller = null;
  cancel.onclick = () => controller?.abort();
  button.onclick = async () => {
    if (controller) return;
    controller = new AbortController(); button.disabled = true; cancel.hidden = false; if (cancel.style) cancel.style.display = '';
    status.textContent = 'Iniciando exportação…';
    try {
      const { blob, manifest } = await exporter({ indexedDB: windowObject.indexedDB, storage: windowObject.localStorage, version: windowObject.document.querySelector('meta[name="hub-system-version"]')?.content || '', signal: controller.signal, onProgress: text => { status.textContent = text; } });
      if (controller.signal.aborted) throw new DOMException('Exportação cancelada.', 'AbortError');
      const url = windowObject.URL.createObjectURL(blob), link = windowObject.document.createElement('a');
      link.href = url; link.download = `hub-migracao-fase1-${new Date().toISOString().slice(0, 10)}.zip`; link.click();
      windowObject.setTimeout(() => windowObject.URL.revokeObjectURL(url), 60000);
      status.textContent = `ZIP gerado como parcial. ${manifest.pendencias.join(' ')} Confira manifesto.json antes de importar.`;
    } catch (error) { status.textContent = error.name === 'AbortError' ? 'Exportação cancelada.' : `Falha na exportação: ${error.message}`; }
    finally { controller = null; button.disabled = false; cancel.hidden = true; if (cancel.style) cancel.style.display = 'none'; }
  };
}

if (typeof document !== 'undefined') {
  const button = document.getElementById('downloadMigrationPackage');
  if (button) mountMigrationExport({ button, status: document.getElementById('migrationExportStatus'), cancel: document.getElementById('cancelMigrationExport') });
}
