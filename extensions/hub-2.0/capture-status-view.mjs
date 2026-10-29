export function showCaptureStatus(root, message) {
  root.classList.remove('error');
  root.textContent = message;
}

export function showCaptureError(root, failure) {
  const doc = root.ownerDocument;
  root.replaceChildren();
  root.classList.add('error');
  const title = doc.createElement('strong');
  title.textContent = 'Não foi possível concluir a ação';
  const detail = doc.createElement('p');
  detail.textContent = failure?.message || 'Falha na ação da extensão.';
  root.append(title, detail);
}
