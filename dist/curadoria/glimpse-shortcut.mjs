import {normalize} from './glimpse-domain.mjs';

function managerContext(){
  const productName=document.querySelector('#sheetName')?.textContent.trim()||'';
  const offerIds=[...document.querySelectorAll('#variantRows tr td:first-child')].map(cell=>cell.textContent.trim()).filter(Boolean);
  return{productName,productKey:normalize(productName),offerIds};
}

function topContext(){
  const title=document.querySelector('#sheetTitle')?.textContent.trim()||'',match=title.match(/^(.*?)\s*·\s*#(.+)$/);
  const productName=(match?.[1]||title).trim(),offerIds=match?.[2]?[match[2].trim()]:[];
  return{productName,productKey:normalize(productName),offerIds};
}

export function glimpseUrl(origin,context){
  const params=new URLSearchParams({origin,productKey:context.productKey||normalize(context.productName),product:context.productName});
  if(context.offerIds?.length)params.set('offerIds',context.offerIds.join(','));
  return `../glimpse/?${params}`;
}

export function mountGlimpseShortcut(origin){
  const trendsButton=document.querySelector(origin==='top'?'#openTrends':'#managerOpenTrends');
  if(!trendsButton||document.querySelector('[data-open-glimpse-from-trends]'))return;
  const button=document.createElement('button');button.type='button';button.className='btn glimpse-shortcut';button.dataset.openGlimpseFromTrends=origin;button.textContent='Abrir Glimpse';
  button.onclick=()=>{const context=origin==='top'?topContext():managerContext();if(!context.productName)return;location.href=glimpseUrl(origin,context)};
  trendsButton.insertAdjacentElement('afterend',button);
}

const loader=[...document.scripts].find(script=>script.src.includes('glimpse-shortcut.mjs'));
if(loader?.dataset.origin)mountGlimpseShortcut(loader.dataset.origin);
