export function mountClickBankDtcCountries({document,sendMessage,setDisabled,timeoutMs=35_000}) {
  const button=document.querySelector('#capture-dtc-countries');
  const status=document.querySelector('#dtc-countries-status');
  let busy=false;
  const report=(message,error=false)=>{status.textContent=message;status.classList.toggle('error',error);};
  button.addEventListener('click',async()=>{
    if(busy)return;
    busy=true;setDisabled(true);button.disabled=true;
    report('Lendo “Países Comuns” e identificando a oferta no checkout DTC…');
    let timer;
    try {
      const response=await Promise.race([
        Promise.resolve().then(()=>sendMessage({type:'CAPTURE_DTC_COMMON_COUNTRIES'})),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('A captura excedeu o tempo de espera. Confirme que Top Offers CB continua aberta no Hub; nenhum outro dado do checkout é consultado.')),timeoutMs);})
      ]);
      if(!response?.ok||!response.result?.saved)throw new Error(response?.message||response?.result?.message||'Não foi possível salvar a lista de países.');
      const result=response.result;
      report(`Lista capturada da DTC: ${result.countryCount} países em ${result.offerName} (${result.addedCount} novos). A lista Top Offers foi atualizada.`);
    } catch(error) { report(error?.message||'Falha ao capturar países da DTC.',true); }
    finally {clearTimeout(timer);busy=false;setDisabled(false);button.disabled=false;}
  });
}
