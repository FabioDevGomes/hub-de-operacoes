import {mountGlimpseHeaderAction} from './glimpse-embed-controls.mjs?v=2';

// Move os controles existentes: preserva os listeners e as abas de cada origem.
export function mountGlimpseReferenceBar({sheet,frame,panel,backButton}) {
  const tabs=sheet?.querySelector('.tabs'),header=sheet?.querySelector('.sheet-top');
  if (!tabs||!header||!frame||!panel||!backButton) return null;
  const existing=sheet.querySelector('.sheet-tab-bar');
  if (existing) return existing;
  const bar=document.createElement('nav'),actions=document.createElement('div'),save=document.createElement('button');
  bar.className='sheet-tab-bar';bar.setAttribute('aria-label','Abas e ações da análise');
  actions.className='sheet-bar-actions';save.type='button';save.className='btn primary';save.textContent='Salvar';
  backButton.textContent='← Voltar à lista';
  actions.append(save,backButton);bar.append(tabs,actions);header.before(bar);
  mountGlimpseHeaderAction({frame,panel,backButton,actionButton:save,finishLabel:'Salvar',showSavedFeedback:true});
  const syncAction=()=>{
    const active=!panel.classList.contains('hidden');
    if (!active) save.disabled=true;
    const reason=active?'Salvar análise Glimpse':'As ações desta aba já salvam seus dados, ou são somente leitura.';
    save.title=reason;save.setAttribute('aria-label',reason);
  };
  new MutationObserver(syncAction).observe(panel,{attributes:true,attributeFilter:['class']});
  syncAction();
  return bar;
}
