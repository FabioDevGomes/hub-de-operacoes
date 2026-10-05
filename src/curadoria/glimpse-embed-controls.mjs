export function mountGlimpseHeaderAction({frame,panel,backButton}) {
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
    finishButton.textContent = 'Concluir';
    finishButton.hidden = true;
    controls.append(finishButton, backButton);
    parent.append(controls);
  }

  backButton.classList.add('glimpse-host-back');
  const syncVisibility = () => {
    const active = !panel.classList.contains('hidden');
    finishButton.hidden = !active;
    if (active) finishButton.disabled = false;
  };
  finishButton.onclick = () => {
    const child = frame.contentWindow;
    if (!child) return;
    finishButton.disabled = true;
    child.postMessage({type:'hub-glimpse-finish'},location.origin);
  };
  new MutationObserver(syncVisibility).observe(panel,{attributes:true,attributeFilter:['class']});
  syncVisibility();
  return finishButton;
}
