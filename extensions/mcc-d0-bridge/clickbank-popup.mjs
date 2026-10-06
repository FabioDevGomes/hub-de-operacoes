import { productsToTsv } from './clickbank-domain.mjs';

export function mountClickBankCapture({ document, sendMessage, clipboard, setDisabled, timeoutMs = 55_000 }) {
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
    report('Capturando produtos e preparando a prévia em Top Offers CB…');
    try {
      let timer;
      const response = await Promise.race([
        Promise.resolve().then(() => sendMessage({ type:'CAPTURE_AND_FORWARD_CLICKBANK' })),
        new Promise((_,reject) => {
          timer = setTimeout(() => reject(new Error('A captura excedeu o tempo de espera. Confira as abas ClickBank e Top Offers CB antes de tentar novamente; nada é salvo sem sua confirmação.')),timeoutMs);
        })
      ]).finally(() => clearTimeout(timer));
      const result = response?.result;
      if (!response?.ok || !result?.ok || !result.previewReady) {
        if (result?.rows?.length) { text.value = productsToTsv(result.rows); fallback.hidden = false; }
        throw new Error(result?.message || response?.message || 'A extensão não respondeu. Recarregue Hub MCC D0 em chrome://extensions e tente novamente.');
      }
      const tsv = productsToTsv(result.rows);
      try {
        await clipboard.writeText(tsv);
        report(`${result.parsedCount} ofertas recebidas em Top Offers CB e TSV copiado. Revise a prévia e clique em “Salvar captura”. Nada foi salvo automaticamente.`);
      } catch {
        text.value = tsv; fallback.hidden = false;
        text.focus(); text.select();
        report(`${result.parsedCount} ofertas recebidas em Top Offers CB. A cópia TSV falhou, mas o Hub já está preenchido: não é necessário Ctrl+C/Ctrl+V. Revise e clique em “Salvar captura”.`);
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
