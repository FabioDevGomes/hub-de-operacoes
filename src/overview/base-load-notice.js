(function (root) {
  'use strict';
  const messages = {
    loading:'Carregando base local…',
    ready:'Nenhuma base local carregada. Importe uma base JSON ou atualize os dados pelo Preparador MCC.',
    error:'Não foi possível recuperar a base local. Recarregue a página para tentar novamente; os dados salvos não foram apagados.'
  };
  function create({element, hasBase, onLoadingChange=()=>{}, loadingMessage=messages.loading}) {
    let phase = 'loading', currentLoadingMessage=String(loadingMessage||messages.loading);
    function refresh() {
      element.textContent = phase==='loading'?currentLoadingMessage:messages[phase];
      const hasLoadedBase=Boolean(hasBase()),loading=phase==='loading'&&!hasLoadedBase;
      element.classList.toggle('hidden', hasLoadedBase);
      element.setAttribute('aria-busy', String(loading));
      onLoadingChange(loading);
    }
    refresh();
    return Object.freeze({refresh,
      stage(message){if(phase!=='loading'||hasBase())return false;const next=String(message||'').trim();if(!next||next===currentLoadingMessage)return false;currentLoadingMessage=next;element.textContent=currentLoadingMessage;return true;},
      ready(){phase = 'ready'; currentLoadingMessage=messages.loading; refresh();},
      fail(){phase = 'error'; currentLoadingMessage=messages.loading; refresh();}
    });
  }
  const api = Object.freeze({create});
  root.OverviewBaseLoadNotice = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
