// Apresentação apenas: códigos e nomes vêm da validação estrutural.
export function showCaptureStatus(root, message) {
  root.classList.remove('error', 'warning');
  root.textContent = message;
}

export function showCaptureWarning(root, message) {
  const doc = root.ownerDocument;
  root.replaceChildren();
  root.classList.remove('error');
  root.classList.add('warning');
  const title = doc.createElement('strong');
  title.textContent = 'Captura referente a data anterior a D−1';
  const detail = doc.createElement('p');
  detail.textContent = message;
  root.append(title);
  root.append(detail);
}

export function showCaptureError(root, failure) {
  const doc = root.ownerDocument;
  root.replaceChildren();
  root.classList.remove('warning');
  root.classList.add('error');
  const add = (tag, text) => {
    const node = doc.createElement(tag);
    node.textContent = text;
    root.append(node);
    return node;
  };
  const errors = failure?.errors || [];
  const duplicates = errors.find(error => error.code === 'duplicates');
  add('strong', duplicates ? 'Captura bloqueada: campanha duplicada' : 'Captura bloqueada');
  if (duplicates) {
    add('p', 'O mesmo nome de campanha aparece em mais de uma linha da MCC:');
    const list = add('ul', '');
    for (const campaign of duplicates.campaigns || []) {
      const item = doc.createElement('li');
      item.textContent = campaign;
      list.append(item);
    }
    if (!duplicates.campaigns?.length) add('p', duplicates.message);
    add('p', 'Confira essas campanhas na MCC e diferencie os nomes duplicados antes de tentar novamente. Nenhum dado foi enviado ao Preparador.');
    const others = errors.filter(error => error.code !== 'duplicates');
    if (others.length) {
      add('strong', 'Outros problemas encontrados');
      const list = add('ul', '');
      for (const error of others) {
        const item = doc.createElement('li');
        item.textContent = error.message;
        list.append(item);
      }
    }
  } else {
    add('p', errors.length ? errors.map(error => error.message).join('\n')
      : failure?.message || 'Falha na captura estrutural da MCC.');
  }
}
