export function mountGlimpseHeaderAction({frame,panel,backButton,actionButton=null,finishLabel='Concluir',showSavedFeedback=false}) {
  if (!frame || !panel || (!actionButton&&!backButton?.parentElement)) return null;

  const parent = actionButton?.parentElement || backButton.parentElement;
  let controls = actionButton ? parent : parent.querySelector(':scope > .glimpse-host-controls');
  let finishButton = actionButton || controls?.querySelector('.glimpse-host-finish');
  if (!actionButton&&!controls) {
    controls = document.createElement('div');
    controls.className = 'glimpse-host-controls';
    finishButton = document.createElement('button');
    finishButton.type = 'button';
    finishButton.className = 'btn glimpse-host-finish';
    finishButton.hidden = true;
    controls.append(finishButton, backButton);
    parent.append(controls);
  }

  finishButton.textContent = finishLabel;
  finishButton.classList.add('glimpse-host-finish');
  let savedMessage = controls.querySelector('.glimpse-host-saved');
  if (showSavedFeedback && !savedMessage) {
    savedMessage = document.createElement('span');
    savedMessage.className = 'glimpse-host-saved';
    savedMessage.setAttribute('role', 'status');
    savedMessage.setAttribute('aria-live', 'polite');
    savedMessage.hidden = true;
    controls.insertBefore(savedMessage, finishButton);
  }
  const clearSavedMessage = () => {
    if (!savedMessage) return;
    savedMessage.textContent = '';
    savedMessage.hidden = true;
  };

  let pendingFinish = false;
  backButton.classList.add('glimpse-host-back');
  const syncVisibility = () => {
    const active = !panel.classList.contains('hidden');
    if (!actionButton) finishButton.hidden = !active;
    if (active&&!actionButton) finishButton.disabled = false;
    if (active&&actionButton) finishButton.disabled = pendingFinish;
    else clearSavedMessage();
  };
  const requestFinish = () => {
    if (panel.classList.contains('hidden')||pendingFinish) return;
    const child = frame.contentWindow;
    if (!child) return;
    clearSavedMessage();
    pendingFinish = true;
    finishButton.disabled = true;
    child.postMessage({type:'hub-glimpse-finish'},location.origin);
  };
  if (actionButton) finishButton.addEventListener('click',requestFinish);
  else finishButton.onclick = requestFinish;
  if (showSavedFeedback) {
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== 'hub-glimpse-save-result') return;
      const active = !panel.classList.contains('hidden');
      pendingFinish = false;
      if (active || !actionButton) finishButton.disabled = false;
      if (active&&event.data.saved === true) {
        savedMessage.textContent = 'Salvo';
        savedMessage.hidden = false;
      } else clearSavedMessage();
    });
  }
  new MutationObserver(syncVisibility).observe(panel,{attributes:true,attributeFilter:['class']});
  syncVisibility();
  return finishButton;
}
