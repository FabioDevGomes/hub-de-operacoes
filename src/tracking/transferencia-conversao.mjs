import {readGuruMediaConversionActionSettings} from './tracking-gurumedia-conversion-actions-storage.mjs';

const key='hub:tracking:gurumedia-conversion-actions:v1';
const status=document.querySelector('#status'), input=document.querySelector('#file'), button=document.querySelector('#import');
let selected=null;
const parse=raw=>readGuruMediaConversionActionSettings({storage:{getItem:()=>raw}});
function current(){const result=readGuruMediaConversionActionSettings();if(!result.available||result.invalid)throw Error('As configurações locais não estão disponíveis ou são inválidas. Nenhum dado foi alterado.');return result.settings}
document.querySelector('#export').addEventListener('click',()=>{
 try{const settings=current();if(!settings.length)throw Error('Não há ações de conversão salvas neste navegador.');const blob=new Blob([JSON.stringify({schemaVersion:1,settings},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='hub-acoes-conversao.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent=`Arquivo preparado com ${settings.length} MCC(s).`;}
 catch(error){status.textContent=error.message}
});
input.addEventListener('change',async()=>{
 selected=null;button.disabled=true;
 try{const file=input.files?.[0];if(!file)return;if(file.size>131072)throw Error('Arquivo excede o limite permitido.');const raw=await file.text(), parsed=parse(raw);if(parsed.invalid||!parsed.available)throw Error('Arquivo inválido. Nenhum dado foi alterado.');const existing=current(), ids=new Set(existing.map(row=>row.mccCustomerId));const incoming=parsed.settings.filter(row=>!ids.has(row.mccCustomerId));selected={raw,incoming};button.disabled=incoming.length===0;status.textContent=`Arquivo válido: ${parsed.settings.length} MCC(s). Novas: ${incoming.length}. Já existentes e preservadas: ${parsed.settings.length-incoming.length}.`;}
 catch(error){status.textContent=error.message}
});
button.addEventListener('click',()=>{
 try{if(!selected)throw Error('Selecione novamente o arquivo.');const parsed=parse(selected.raw);if(parsed.invalid)throw Error('Arquivo inválido.');const existing=current(), ids=new Set(existing.map(row=>row.mccCustomerId));const incoming=parsed.settings.filter(row=>!ids.has(row.mccCustomerId));const value=JSON.stringify({schemaVersion:1,settings:[...existing,...incoming]});if(value.length>131072||parse(value).invalid)throw Error('A combinação ultrapassa os limites ou é inválida.');if(incoming.length)localStorage.setItem(key,value);selected=null;button.disabled=true;status.textContent=`Importação concluída: ${incoming.length} MCC(s) adicionada(s); ${existing.length} configuração(ões) existentes preservada(s).`;}
 catch(error){status.textContent=`Não foi possível importar: ${error.message}`}
});
