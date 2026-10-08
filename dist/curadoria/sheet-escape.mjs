export const CURATION_ESCAPE_MESSAGE = 'hub-curation-sheet-escape';

// Reutiliza a ação de retorno da view: não salva, não navega por conta própria
// e não duplica a restauração de rolagem/foco de list-focus.mjs.
export function mountCurationSheetEscape({doc=document,win=window}={}) {
  const hasDialog = () => Boolean(doc.querySelector('dialog[open]'));
  const backButton = () => {
    const sheet=doc.querySelector('#productSheet:not(.hidden), #offerSheet:not(.hidden)');
    if (sheet) return sheet.querySelector('#closeSheet');
    return null;
  };
  const returnToList = () => {
    const button=backButton();
    if (!button || button.disabled || hasDialog()) return false;
    button.click();
    return true;
  };
  const onKeydown = event => {
    if (event.key!=='Escape' || event.defaultPrevented || event.repeat || event.isComposing) return;
    // Um diálogo interno usa seu cancelamento nativo, sem fechar a ficha atrás.
    if (hasDialog() || event.target?.closest?.('dialog')) return;
    if (win.parent!==win && doc.documentElement.classList.contains('embedded')) {
      event.preventDefault();
      event.stopPropagation();
      win.parent.postMessage({type:CURATION_ESCAPE_MESSAGE},win.location.origin);
      return;
    }
    const standalone=doc.querySelector('#cancelTop');
    if (returnToList() || (standalone && !standalone.disabled && (standalone.click(),true))) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const onMessage = event => {
    if (event.origin!==win.location.origin || event.data?.type!==CURATION_ESCAPE_MESSAGE || hasDialog()) return;
    const sheet=doc.querySelector('#productSheet:not(.hidden), #offerSheet:not(.hidden)');
    // Somente o iframe ativo da ficha pode solicitar retorno.
    const trustedFrame=sheet && [...sheet.querySelectorAll('iframe')].some(frame=>
      frame.contentWindow===event.source && !frame.closest('.hidden') && frame.getClientRects().length>0);
    if (trustedFrame) returnToList();
  };
  doc.addEventListener('keydown',onKeydown);
  win.addEventListener('message',onMessage);
  return () => {
    doc.removeEventListener('keydown',onKeydown);
    win.removeEventListener('message',onMessage);
  };
}

if (typeof document!=='undefined' && typeof window!=='undefined') mountCurationSheetEscape();
