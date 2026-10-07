import { parseTopOffersClipboard } from './clickbank-top-offers-domain.mjs?v=2';
import { matchDtcCheckoutOffer, validateDtcCountryCapture } from './dtc-country-capture.mjs?v=2';

export function validateExtensionCapture(payload) {
  if (payload?.schema !== 'clickbank-extension-preview-v1' || payload.source !== 'clickbank_chrome_extension'
    || typeof payload.text !== 'string' || !payload.text.length || payload.text.length > 2*1024*1024
    || !Number.isSafeInteger(payload.expectedCount) || payload.expectedCount < 1 || payload.expectedCount > 1000
    || typeof payload.capturedAt !== 'string' || !Number.isFinite(Date.parse(payload.capturedAt))) {
    return {ok:false,message:'Captura da extensão inválida ou incompleta. Nenhum dado foi salvo.'};
  }
  const parsed = parseTopOffersClipboard(payload.text);
  if (!parsed.valid || parsed.parsedCount !== payload.expectedCount || parsed.page.expectedOnPage !== payload.expectedCount
    || parsed.page.total === null) return {ok:false,message:'A captura não corresponde à paginação. Nenhum dado foi salvo.'};
  return {ok:true,text:payload.text,capturedAt:payload.capturedAt,parsed};
}

export function mountExtensionCapture({target,ready,getBusy,getDraft,preparePreview,getOffers,saveDtcCountries}) {
  let receiving = false;
  target.__hubDtcCountryReceiverVersion = 2;
  target.__hubReceiveClickBankCapture = async payload => {
    if (receiving || getBusy()) return {ok:false,message:'Uma captura já está sendo preparada ou salva. Aguarde e tente novamente.'};
    const valid = validateExtensionCapture(payload);
    if (!valid.ok) return valid;
    receiving = true;
    let timer;
    try {
      await Promise.race([ready,new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('O Hub ainda não terminou de carregar. Reabra Top Offers CB e tente novamente.')),8000);
      })]);
      if (getBusy() || String(getDraft() || '').trim()) return {ok:false,
        message:'Já existe um rascunho em Top Offers CB. Ele foi preservado. Salve-o ou limpe o campo antes de enviar outra captura.'};
      await preparePreview(valid.text,{capturedAt:valid.capturedAt});
      return {ok:true,parsedCount:valid.parsed.parsedCount,previewReady:true,saved:false};
    } catch(error) { return {ok:false,message:error?.message || 'Não foi possível preparar a prévia. Nenhum dado foi salvo.'}; }
    finally {clearTimeout(timer);receiving=false;}
  };
  target.__hubReceiveDtcCommonCountries = async payload => {
    if (receiving || getBusy()) return {ok:false,message:'O Hub está ocupado com outra gravação. Tente novamente em instantes; nenhum dado foi salvo.'};
    const valid = validateDtcCountryCapture(payload);
    if (!valid.ok) return valid;
    receiving = true;
    let timer;
    try {
      await Promise.race([ready,new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('O Hub ainda está carregando a lista Top Offers CB. Tente novamente quando ela aparecer.')),8000);
      })]);
      if (getBusy()) return {ok:false,message:'O Hub iniciou outra gravação. Tente novamente; nenhum dado foi salvo.'};
      const match = matchDtcCheckoutOffer(valid.productName,getOffers?.());
      if (match.status === 'none') return {ok:false,message:`Não encontrei “${valid.productName}” na lista Top Offers CB. Nenhum dado foi salvo.`};
      if (match.status === 'ambiguous') return {ok:false,message:`“${valid.productName}” corresponde a ${match.matches.length} ofertas. Nenhuma foi alterada; confira a lista no Hub.`};
      return await saveDtcCountries(match.matches[0],valid);
    } catch(error) { return {ok:false,message:error?.message || 'Não foi possível salvar os países. Nenhum dado foi salvo.'}; }
    finally {clearTimeout(timer);receiving=false;}
  };
}
