// Coordenador assíncrono para a futura montagem operacional central.
// O chamador deve aguardar flush antes de trocar contexto ou executar ações.
export function createOperationalDraftController({ bridge, createId, now = () => new Date().toISOString() }) {
  if (!bridge?.read || !bridge?.saveDraft || typeof createId !== 'function') throw new TypeError('Ponte de rascunhos indisponível');
  let store = null, current = null, pending = null, running = null, failure = null;
  async function open() {
    if (running || pending) throw new Error('Há alterações pendentes');
    store = await bridge.read();
    current = store.drafts.find(draft => draft.id === store.activeDraftId) || null;
    failure = null;
    return structuredClone({store, current});
  }
  function adopt(loadedStore, selectedId = '') {
    if (running || pending || failure) throw new Error('Há alterações pendentes');
    if (!loadedStore || !Array.isArray(loadedStore.drafts)) throw new Error('Rascunhos inválidos');
    const selected = selectedId ? loadedStore.drafts.find(draft => draft.id === selectedId) : null;
    if (selectedId && !selected) throw new Error('Rascunho não encontrado');
    store = structuredClone(loadedStore); current = selected ? structuredClone(selected) : null;
    return structuredClone(current);
  }
  async function select(id) {
    if (running || pending || failure) throw new Error('Há alterações pendentes');
    if (typeof bridge.selectDraft !== 'function') throw new Error('Seleção central indisponível');
    await bridge.read();
    await bridge.selectDraft(id);
    store = await bridge.read();
    current = store.drafts.find(draft => draft.id === id) || null;
    if (!current) throw new Error('Rascunho não encontrado');
    return structuredClone({store, current});
  }
  function queue(values, label = '', representedNames = null) {
    if (!store) throw new Error('Rascunhos não carregados');
    if (failure) throw new Error('Gravação anterior não confirmada; recarregue antes de continuar');
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('Valores inválidos');
    if (representedNames !== null && (!Array.isArray(representedNames) || representedNames.some(name => typeof name !== 'string' || !name))) throw new TypeError('Campos representados inválidos');
    const merged = {...(pending?.values || {})};
    for (const name of representedNames || []) delete merged[name];
    pending = {values: {...merged, ...structuredClone(values)}, label: String(label), representedNames: representedNames === null && pending?.representedNames == null ? null : [...new Set([...(pending?.representedNames || []), ...(representedNames || [])])]};
  }
  async function flush() {
    if (running) { await running; if (pending) return flush(); return structuredClone(current); }
    if (failure) throw failure;
    if (!pending) return structuredClone(current);
    const change = pending; pending = null;
    const timestamp = now(), previous = current;
    const draft = {id: previous?.id || createId(), label: change.label, createdAt: previous?.createdAt || timestamp, updatedAt: timestamp, values: change.values};
    running = (async () => {
      try {
        const saved = await bridge.saveDraft(draft, {representedNames: change.representedNames});
        current = saved;
        store = {...store, activeDraftId: saved.id, drafts: [...store.drafts.filter(item => item.id !== saved.id), saved]};
      } catch (error) {
        const remaining = {...change.values};
        for (const name of pending?.representedNames || []) delete remaining[name];
        pending = {values: {...remaining, ...(pending?.values || {})}, label: pending?.label ?? change.label, representedNames: change.representedNames === null && pending?.representedNames == null ? null : [...new Set([...(change.representedNames || []), ...(pending?.representedNames || [])])]};
        failure = error;
        throw error;
      }
    })();
    try { await running; } finally { running = null; }
    if (pending) return flush();
    return structuredClone(current);
  }
  function status() { return {dirty: Boolean(pending), saving: Boolean(running), failed: Boolean(failure)}; }
  return {open, adopt, select, queue, flush, status};
}
