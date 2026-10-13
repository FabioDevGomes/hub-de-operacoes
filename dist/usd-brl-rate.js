(function(root){
  const STORAGE_KEY='hub:usd-brl-rate:ptax:v1';
  const LEGACY_RATE=5.10;
  const REFRESH_INTERVAL_MS=30*60*1000;
  const REQUEST_TIMEOUT_MS=10000;
  const ODATA_ENDPOINT='https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)';

  function brazilDate(date){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    return`${values.month}-${values.day}-${values.year}`;
  }
  function queryUrl(now){
    const end=new Date(now.getTime()),start=new Date(end.getTime()-14*24*60*60*1000),params=new URLSearchParams({'@moeda':"'USD'",'@dataInicial':`'${brazilDate(start)}'`,'@dataFinalCotacao':`'${brazilDate(end)}'`,'$format':'json'});
    return`${ODATA_ENDPOINT}?${params}`;
  }
  function rowTimestamp(row){
    const raw=String(row?.dataHoraCotacao||'').trim(),match=raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    return match?Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),Number(match[4]),Number(match[5]),Number(match[6])):Date.parse(raw);
  }
  function validQuote(value){
    if(!value||typeof value!=='object')return null;
    const rate=Number(value.rate),retrievedAt=Date.parse(value.retrievedAt||'');
    if(!Number.isFinite(rate)||rate<=0||rate>100||!Number.isFinite(retrievedAt))return null;
    return{rate,quoteDate:String(value.quoteDate||'').slice(0,10),quotedAt:String(value.quotedAt||''),retrievedAt:new Date(retrievedAt).toISOString(),source:'Banco Central do Brasil · PTAX venda'};
  }
  function create({fetchImpl,storage,now=()=>new Date(),refreshIntervalMs=REFRESH_INTERVAL_MS,timeoutMs=REQUEST_TIMEOUT_MS}={}){
    const storageApi=storage??(()=>{try{return root.localStorage}catch{return null}})();
    const fetchApi=fetchImpl??root.fetch?.bind(root);
    const listeners=new Set();
    let cached=null,inFlight=null,timer=null,started=false,current={rate:LEGACY_RATE,status:'unavailable',isStale:true,isFallback:true,source:'Taxa legada de compatibilidade',error:null};
    try{cached=validQuote(JSON.parse(storageApi?.getItem(STORAGE_KEY)||'null'))}catch{cached=null}
    if(cached){const age=Date.parse(now())-Date.parse(cached.retrievedAt),stale=age>=refreshIntervalMs;current={...cached,status:stale?'stale':'cached',isStale:stale,isFallback:false,error:null}}
    const emit=()=>{const snapshot=getState();for(const listener of listeners)try{listener(snapshot)}catch{}}
    function getState(){return Object.freeze({...current})}
    function subscribe(listener){if(typeof listener!=='function')throw new TypeError('O observador da cotação precisa ser uma função.');listeners.add(listener);return()=>listeners.delete(listener)}
    function saveQuote(quote){cached=quote;try{storageApi?.setItem(STORAGE_KEY,JSON.stringify(quote))}catch{}current={...quote,status:'ok',isStale:false,isFallback:false,error:null};emit();return getState()}
    async function refresh({force=true}={}){
      if(inFlight)return inFlight;
      if(!fetchApi){current=cached?{...cached,status:'stale',isStale:true,isFallback:false,error:'Busca de rede indisponível.'}:{rate:LEGACY_RATE,status:'unavailable',isStale:true,isFallback:true,source:'Taxa legada de compatibilidade',error:'Busca de rede indisponível.'};emit();return getState()}
      if(!force&&cached&&Date.parse(now())-Date.parse(cached.retrievedAt)<refreshIntervalMs){current={...cached,status:'cached',isStale:false,isFallback:false,error:null};emit();return getState()}
      current=cached?{...cached,status:'refreshing',isStale:false,isFallback:false,error:null}:{rate:LEGACY_RATE,status:'loading',isStale:true,isFallback:true,source:'Taxa legada de compatibilidade',error:null};emit();
      inFlight=(async()=>{
        let timeout=null,controller=null;
        try{
          if(typeof root.AbortController==='function'){controller=new root.AbortController();timeout=setTimeout(()=>controller.abort(),timeoutMs)}
          const response=await fetchApi(queryUrl(new Date(now())),{headers:{Accept:'application/json'},...(controller?{signal:controller.signal}:{})});
          if(!response?.ok)throw new Error(`BCB respondeu HTTP ${response?.status??'indisponível'}.`);
          const payload=await response.json(),rows=Array.isArray(payload?.value)?payload.value:[],valid=rows.map(row=>({row,rate:Number(row?.cotacaoVenda),timestamp:rowTimestamp(row)})).filter(item=>Number.isFinite(item.rate)&&item.rate>0&&item.rate<=100&&Number.isFinite(item.timestamp)).sort((a,b)=>a.timestamp-b.timestamp),latest=valid.at(-1);
          if(!latest)throw new Error('A consulta não retornou uma cotação de venda PTAX válida.');
          const dateTime=String(latest.row.dataHoraCotacao),quote={rate:latest.rate,quoteDate:dateTime.slice(0,10),quotedAt:dateTime,retrievedAt:new Date(now()).toISOString(),source:'Banco Central do Brasil · PTAX venda'};
          return saveQuote(quote);
        }catch(error){
          const message=error?.name==='AbortError'?'Tempo limite ao consultar o Banco Central.':String(error?.message||'Falha ao consultar o Banco Central.');
          current=cached?{...cached,status:'stale',isStale:true,isFallback:false,error:message}:{rate:LEGACY_RATE,status:'unavailable',isStale:true,isFallback:true,source:'Taxa legada de compatibilidade',error:message};emit();return getState();
        }finally{if(timeout)clearTimeout(timeout);inFlight=null}
      })();
      return inFlight;
    }
    function refreshIfDue(){return refresh({force:false})}
    function onVisibilityChange(){if(!root.document?.hidden)void refreshIfDue()}
    function onOnline(){void refreshIfDue()}
    function onStorage(event){if(event?.key!==STORAGE_KEY||!event.newValue)return;try{const quote=validQuote(JSON.parse(event.newValue));if(quote&&(!cached||Date.parse(quote.retrievedAt)>=Date.parse(cached.retrievedAt)))saveQuote(quote)}catch{}}
    function start(){
      if(started)return()=>stop();started=true;
      void refreshIfDue();
      timer=setInterval(()=>{if(!root.document?.hidden)void refreshIfDue()},refreshIntervalMs);
      root.document?.addEventListener?.('visibilitychange',onVisibilityChange);
      root.addEventListener?.('online',onOnline);
      root.addEventListener?.('storage',onStorage);
      return()=>stop();
    }
    function stop(){if(!started)return;started=false;if(timer)clearInterval(timer);timer=null;root.document?.removeEventListener?.('visibilitychange',onVisibilityChange);root.removeEventListener?.('online',onOnline);root.removeEventListener?.('storage',onStorage)}
    return Object.freeze({getState,subscribe,refresh,refreshIfDue,start,stop});
  }
  root.UsdBrlRateService=Object.freeze({create,storageKey:STORAGE_KEY,legacyRate:LEGACY_RATE,refreshIntervalMs:REFRESH_INTERVAL_MS});
})(typeof window==='object'?window:globalThis);
