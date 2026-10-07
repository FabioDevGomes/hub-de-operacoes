import {normalize} from './glimpse-domain.mjs';
import {mountGlimpseHeaderAction} from './glimpse-embed-controls.mjs?v=2';

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
  if(origin==='top'){
    const sheet=document.querySelector('#offerSheet'),tabs=sheet?.querySelector('.tabs'),overviewTab=tabs?.querySelector('[data-tab="overview"]'),trendsTab=tabs?.querySelector('[data-tab="trends"]'),imagesTab=tabs?.querySelector('[data-tab="images"]'),trendsPanel=sheet?.querySelector('[data-panel="trends"]'),imagesPanel=sheet?.querySelector('[data-panel="images"]');
    if(!tabs||!trendsTab||!imagesTab||!trendsPanel||!imagesPanel||document.querySelector('#topGlimpseTab'))return;
    overviewTab?.remove();
    const button=document.createElement('button');button.type='button';button.id='topGlimpseTab';button.className=imagesTab.className;button.dataset.tab='glimpse';button.textContent='Glimpse';imagesTab.before(button);
    const panel=document.createElement('section');panel.className='hidden';panel.dataset.panel='glimpse';panel.id='topGlimpsePanel';const frame=document.createElement('iframe');frame.id='topGlimpseFrame';frame.className='glimpse-embedded-frame';frame.title='Tela do Glimpse';frame.loading='lazy';panel.append(frame);trendsPanel.after(panel);
    mountGlimpseHeaderAction({frame,panel,backButton:sheet.querySelector('#closeSheet')});
    const showTab=name=>{tabs.querySelectorAll('[data-tab]').forEach(item=>item.classList.toggle('active',item.dataset.tab===name));document.querySelectorAll('#offerSheet [data-panel]').forEach(item=>item.classList.toggle('hidden',item.dataset.panel!==name))};
    new MutationObserver(()=>{if(!sheet.classList.contains('hidden')&&!sheet.querySelector('[data-panel="overview"]')?.classList.contains('hidden'))trendsTab.click()}).observe(sheet,{attributes:true,attributeFilter:['class']});
    button.addEventListener('click',()=>{showTab('glimpse');const context=topContext();if(!context.productName)return;const url=new URL(glimpseUrl(origin,context),location.href);url.searchParams.set('embedded','1');if(frame.dataset.url!==url.href){frame.dataset.url=url.href;frame.src=url.href}});
    document.addEventListener('click',event=>{
      if(!(event.target instanceof Element))return;
      const link=event.target.closest('[data-open-top-glimpse]');
      if(!link)return;
      event.preventDefault();event.stopPropagation();
      const row=link.closest('[data-offer]');
      if(!row)return;
      row.click();button.click();
    },true);
    window.addEventListener('message',event=>{
      if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='hub-glimpse-resize')return;
      const height=Number(event.data.height);
      if(Number.isFinite(height))frame.style.height=`${Math.max(320,Math.ceil(height))}px`;
    });
    window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='hub-glimpse-close')return;trendsTab.click()});
    return;
  }
  const trendsButton=document.querySelector(origin==='top'?'#openTrends':'#managerOpenTrends');
  if(!trendsButton||document.querySelector('[data-open-glimpse-from-trends]'))return;
  const button=document.createElement('button');button.type='button';button.className='btn glimpse-shortcut';button.dataset.openGlimpseFromTrends=origin;button.textContent='Abrir Glimpse';
  button.onclick=()=>{const context=origin==='top'?topContext():managerContext();if(!context.productName)return;location.href=glimpseUrl(origin,context)};
  trendsButton.insertAdjacentElement('afterend',button);
}

const loader=[...document.scripts].find(script=>script.src.includes('glimpse-shortcut.mjs'));
if(loader?.dataset.origin)mountGlimpseShortcut(loader.dataset.origin);
