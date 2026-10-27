(function(root){
  const key='hub.google-ads-source-mode:v1';
  function read(storage){try{return(storage||root.localStorage)?.getItem(key)==='api'?'api':'manifest'}catch{return'manifest'}}
  function write(mode,storage){const next=mode==='api'?'api':'manifest';try{(storage||root.localStorage).setItem(key,next)}catch{throw new Error('Não foi possível salvar a fonte neste perfil do navegador.')}return next}
  root.GoogleAdsSourcePreference=Object.freeze({key,read,write});
})(globalThis);
