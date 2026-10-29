(function (root) {
  'use strict';
  const messages = {
    loading:'Carregando base local…',
    ready:'Nenhuma base local carregada. Importe uma base JSON ou atualize os dados pelo Preparador MCC.',
    error:'Não foi possível recuperar a base local. Recarregue a página para tentar novamente; os dados salvos não foram apagados.'
  };
  function create({element, hasBase, onLoadingChange=()=>{}}) {
    let phase = 'loading';
    function refresh() {
      element.textContent = messages[phase];
      const hasLoadedBase=Boolean(hasBase()),loading=phase==='loading'&&!hasLoadedBase;
      element.classList.toggle('hidden', hasLoadedBase);
      element.setAttribute('aria-busy', String(loading));
      onLoadingChange(loading);
    }
    refresh();
    return Object.freeze({refresh,
      ready(){phase = 'ready'; refresh();},
      fail(){phase = 'error'; refresh();}
    });
  }
  const api = Object.freeze({create});
  root.OverviewBaseLoadNotice = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
