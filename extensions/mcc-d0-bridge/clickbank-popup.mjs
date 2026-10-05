import { productsToTsv } from './clickbank-domain.mjs';

export function mountClickBankCapture({ document, sendMessage, clipboard, setDisabled }) {
  const capture = document.querySelector('#capture-clickbank');
  const restore = document.querySelector('#restore-clickbank');
  const status = document.querySelector('#clickbank-status');
  const fallback = document.querySelector('#clickbank-manual');
  const text = document.querySelector('#clickbank-text');
  let busy = false;
  const report = (message, error = false) => { status.textContent = message; status.classList.toggle('error', error); };
  capture.addEventListener('click', async () => {
    if (busy) return;
    busy = true; setDisabled(true); capture.disabled = restore.disabled = true;
    fallback.hidden = true; text.value = '';
    report('Preparando produtos…');
    try {
      const response = await sendMessage({ type:'CAPTURE_CLICKBANK_PRODUCTS' });
      const result = response?.result;
      if (!response?.ok || !result?.ok) {
        if (result?.rows?.length) { text.value = productsToTsv(result.rows); fallback.hidden = false; }
        throw new Error(result?.message || response?.message || 'Não foi possível capturar os produtos.');
      }
      const tsv = productsToTsv(result.rows);
      try {
        await clipboard.writeText(tsv);
        report(`${result.capturedCount} produtos copiados da página atual.`);
      } catch {
        text.value = tsv; fallback.hidden = false;
        text.focus(); text.select();
        report(`${result.capturedCount} produtos capturados, mas a cópia automática falhou. Use Ctrl+C no texto selecionado abaixo.`, true);
      }
    } catch (error) { report(error.message, true); }
    finally { busy = false; setDisabled(false); capture.disabled = restore.disabled = false; }
  });
  restore.addEventListener('click', async () => {
    if (busy) return;
    busy = true; setDisabled(true); capture.disabled = restore.disabled = true;
    try {
      const response = await sendMessage({ type:'RESTORE_CLICKBANK_TABLE' });
      if (!response?.ok) throw new Error(response?.message || response?.result?.message || 'Não foi possível restaurar a tabela.');
      report(response.result.message);
    } catch (error) { report(error.message, true); }
    finally { busy = false; setDisabled(false); capture.disabled = restore.disabled = false; }
  });
}
