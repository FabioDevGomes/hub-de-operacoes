export function mountGlimpseHeaderAction({frame,panel,backButton,finishLabel='Concluir',showSavedFeedback=false}) {
  if (!frame || !panel || !backButton?.parentElement) return null;

  const parent = backButton.parentElement;
  let controls = parent.querySelector(':scope > .glimpse-host-controls');
  let finishButton = controls?.querySelector('.glimpse-host-finish');
  if (!controls) {
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
  let savedMessage = controls.querySelector('.glimpse-host-saved');
  if (showSavedFeedback && !savedMessage) {
    savedMessage = document.createElement('span');
    savedMessage.className = 'glimpse-host-saved';
    savedMessage.setAttribute('role', 'status');
    savedMessage.setAttribute('aria-live', 'polite');
    savedMessage.hidden = true;
    controls.insertBefore(savedMessage, backButton);
  }
  const clearSavedMessage = () => {
    if (!savedMessage) return;
    savedMessage.textContent = '';
    savedMessage.hidden = true;
  };

  backButton.classList.add('glimpse-host-back');
  const syncVisibility = () => {
    const active = !panel.classList.contains('hidden');
    finishButton.hidden = !active;
    if (active) finishButton.disabled = false;
    else clearSavedMessage();
  };
  finishButton.onclick = () => {
    const child = frame.contentWindow;
    if (!child) return;
    clearSavedMessage();
    finishButton.disabled = true;
    child.postMessage({type:'hub-glimpse-finish'},location.origin);
  };
  if (showSavedFeedback) {
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== 'hub-glimpse-save-result') return;
      finishButton.disabled = false;
      if (event.data.saved === true) {
        savedMessage.textContent = 'Salvo';
        savedMessage.hidden = false;
      } else clearSavedMessage();
    });
  }
  new MutationObserver(syncVisibility).observe(panel,{attributes:true,attributeFilter:['class']});
  syncVisibility();
  return finishButton;
}
