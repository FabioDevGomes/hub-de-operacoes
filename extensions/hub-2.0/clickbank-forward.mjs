import { productsToTsv } from './clickbank-domain.mjs';

export function createClickBankTransfer(result) {
  if (!result?.ok || !Array.isArray(result.rows) || !result.rows.length
    || result.rows.length !== result.expectedCount || result.capturedCount !== result.expectedCount) {
    throw new Error(result?.message || 'Captura incompleta: nenhum dado foi enviado ao Hub.');
  }
  const page = result.page;
  if (!page || ![page.start,page.end,page.total].every(Number.isSafeInteger)
    || page.start < 1 || page.end < page.start || page.total < page.end
    || page.end - page.start + 1 !== result.rows.length) throw new Error('Paginação não confirmada; captura não enviada.');
  const capturedAt = result.capturedAt;
  if (typeof capturedAt !== 'string' || !Number.isFinite(Date.parse(capturedAt))) throw new Error('Horário da captura ausente; tente novamente.');
  const suffix = page.pageSize == null ? '' : `\nResults per page\n${page.pageSize}`;
  const text = `${productsToTsv(result.rows)}\n${page.start}–${page.end} of ${page.total}${suffix}`;
  return { schema:'clickbank-extension-preview-v1',source:'clickbank_chrome_extension',
    capturedAt,expectedCount:result.expectedCount,text };
}

// Autocontido para sondar abas existentes antes do reuso. Uma página antiga
// não recebe captura: o worker abre uma aba nova do Hub servido atualmente.
export function isClickBankReceiverReady() {
  return location.origin === 'http://127.0.0.1:8765'
    && /^\/curadoria\/clickbank-top-offers\/$/.test(location.pathname)
    && typeof window.__hubReceiveClickBankCapture === 'function';
}

// Autocontido: executado exclusivamente no destino local permitido, em MAIN.
export async function deliverClickBankPreview(payload) {
  if (location.origin !== 'http://127.0.0.1:8765' || !/^\/curadoria\/clickbank-top-offers\/$/.test(location.pathname)) {
    return {ok:false,message:'Destino inválido: a captura só pode preencher Top Offers CB local.'};
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    if (typeof window.__hubReceiveClickBankCapture === 'function') {
      try { return await window.__hubReceiveClickBankCapture(payload); }
      catch { return {ok:false,message:'O Hub não conseguiu preparar a prévia. Nenhuma captura foi salva.'}; }
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  return {ok:false,message:'Top Offers CB está sem o receptor atualizado. Recarregue essa página do Hub e tente novamente.'};
}

export function isDtcCountryReceiverReady() {
  return location.origin === 'http://127.0.0.1:8765'
    && /^\/curadoria\/clickbank-top-offers\/$/.test(location.pathname)
    && window.__hubDtcCountryReceiverVersion === 2
    && typeof window.__hubReceiveDtcCommonCountries === 'function';
}

// A ficha do Hub não precisa estar aberta. Só encaminha para uma lista Top
// Offers existente e nunca cria/foca uma nova tela.
export async function deliverDtcCommonCountries(payload) {
  if (location.origin !== 'http://127.0.0.1:8765' || !/^\/curadoria\/clickbank-top-offers\/$/.test(location.pathname)) {
    return {ok:false,message:'Destino inválido: os países só podem ser aplicados à lista local Top Offers CB.'};
  }
  if (window.__hubDtcCountryReceiverVersion !== 2) {
    return {ok:false,message:'A lista Top Offers CB está desatualizada. Recarregue a página do Hub e tente novamente; nenhum dado foi salvo.'};
  }
  if (typeof window.__hubReceiveDtcCommonCountries === 'function') {
    try { return await window.__hubReceiveDtcCommonCountries(payload); }
    catch { return {ok:false,message:'O Hub não conseguiu salvar a lista. Nenhum outro dado foi alterado.'}; }
  }
  return {ok:false,message:'Deixe a lista Top Offers CB atualizada aberta no Hub e tente novamente. Não é necessário abrir a ficha da oferta.'};
}
