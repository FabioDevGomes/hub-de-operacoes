import { renderKeywordCandidates } from '../keyword-candidates-ui.mjs?v=5';

const $ = (selector, root) => root.querySelector(selector);

export function mountGuruMediaTrendCandidatesView({
  root,
  onAdd = async () => ({ ok: false }),
  onEdit = async () => ({ ok: false }),
  onRemove = async () => ({ ok: false }),
  onSearch = () => {},
} = {}) {
  const card = root?.querySelector('.trends-search-card');
  if (!card) throw new Error('A ficha Guru Media não tem o cartão de pesquisa do Google Trends.');

  card.insertAdjacentHTML('beforeend', `
    <section class="top-trends-keyword-summary" id="topTrendsKeywordEditor" aria-label="Candidatas positivas de palavra-chave">
      <header class="top-trends-keyword-summary-head">
        <div><b>Candidatas à palavra-chave</b></div>
        <span id="topTrendsLastSearch" class="top-trends-last-search sub"></span>
      </header>
      <div class="top-trends-keyword-entry">
        <label class="top-trends-keyword-entry-label" for="topTrendsKeywordInput">Novas candidatas · uma por linha</label>
        <textarea class="control" id="topTrendsKeywordInput" rows="5" maxlength="9000" placeholder="Cole uma candidata por linha" aria-label="Novas candidatas positivas, uma por linha"></textarea>
        <div class="top-trends-keyword-entry-actions"><button class="btn primary" id="topTrendsKeywordAdd" type="button">Adicionar candidatas <span aria-hidden="true">→</span></button></div>
      </div>
      <section class="top-trends-keyword-output" aria-label="Candidatas positivas salvas">
        <header class="top-trends-keyword-output-head"><span>Lista de candidatas salvas</span><span id="topTrendsKeywordCount" aria-live="polite">0 termos</span></header>
        <div id="topTrendsKeywordList"></div>
      </section>
      <p class="top-trends-keyword-feedback" id="topTrendsKeywordFeedback" role="status" aria-live="polite"></p>
    </section>`);

  const editor = $('#topTrendsKeywordEditor', card);
  const input = $('#topTrendsKeywordInput', editor);
  const addButton = $('#topTrendsKeywordAdd', editor);
  const list = $('#topTrendsKeywordList', editor);
  const count = $('#topTrendsKeywordCount', editor);
  const feedback = $('#topTrendsKeywordFeedback', editor);
  const dialog = document.createElement('dialog');
  dialog.className = 'top-trends-candidate-edit-dialog';
  dialog.setAttribute('aria-labelledby', 'topTrendsCandidateEditTitle');
  dialog.setAttribute('aria-describedby', 'topTrendsCandidateEditDescription');
  dialog.innerHTML = `
    <form class="top-trends-candidate-edit-form">
      <header><div><b id="topTrendsCandidateEditTitle">Editar candidata à palavra-chave</b><p id="topTrendsCandidateEditDescription">Atualize a candidata positiva salva para esta oferta.</p></div><button class="btn" type="button" data-candidate-edit-close>Fechar</button></header>
      <div class="top-trends-candidate-edit-body"><label for="topTrendsCandidateEditInput">Texto da candidata</label><input class="control" id="topTrendsCandidateEditInput" type="text" maxlength="80" autocomplete="off"><p id="topTrendsCandidateEditMessage" role="alert" aria-live="polite"></p></div>
      <footer><button class="btn" type="button" data-candidate-edit-cancel>Cancelar</button><button class="btn primary" type="submit">Salvar</button></footer>
    </form>`;
  root.append(dialog);

  const editForm = $('form', dialog);
  const editInput = $('#topTrendsCandidateEditInput', dialog);
  const editMessage = $('#topTrendsCandidateEditMessage', dialog);
  const editSave = $('button[type="submit"]', dialog);
  let activeItem = null;
  let editing = null;
  let editTrigger = null;
  let saving = false;

  function setBusy(value) {
    saving = value;
    editor.setAttribute('aria-busy', String(value));
    input.disabled = value;
    addButton.disabled = value;
    for (const button of list.querySelectorAll('button')) button.disabled = value;
  }

  function showFeedback(message, error = false) {
    feedback.textContent = message || '';
    feedback.dataset.state = message ? (error ? 'error' : 'success') : 'empty';
  }

  function render(item, candidates = [], { preserveDraft = false } = {}) {
    const offerId = String(item?.offerId ?? '');
    if (input.dataset.owner !== offerId) {
      input.value = '';
      input.dataset.owner = offerId;
      showFeedback('');
    } else if (!preserveDraft) input.value = '';
    activeItem = item;
    const saved = Array.isArray(candidates) ? candidates : [];
    count.textContent = `${saved.length} ${saved.length === 1 ? 'termo' : 'termos'}`;
    renderKeywordCandidates(list, {
      candidates: saved,
      variant: 'positive',
      searchContext: 'Google Trends',
      showRemoveForSaved: true,
      emptyText: 'Nenhuma candidata adicionada.',
      onSearch: term => onSearch(item, term),
      onEdit: (candidate, index, button) => openEdit(candidate, index, button),
      onRemove: (_candidate, index) => { void remove(index); },
    });
  }

  async function run(action) {
    if (!activeItem || saving) return { ok: false, message: '' };
    setBusy(true);
    try {
      const result = await action();
      if (result?.ok && result.record) render(activeItem, result.record.keywordCandidates, { preserveDraft: true });
      showFeedback(result?.message || '', !result?.ok && Boolean(result?.message));
      return result || { ok: false, message: 'Não foi possível salvar as candidatas.' };
    } catch {
      const result = { ok: false, message: 'Não foi possível salvar as candidatas. Tente novamente.' };
      showFeedback(result.message, true);
      return result;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const result = await run(() => onAdd(activeItem, input.value));
    if (result.ok && result.changed) {
      input.value = '';
      input.focus({ preventScroll: true });
    }
  }

  async function remove(index) {
    const result = await run(() => onRemove(activeItem, index));
    if (result.ok && result.changed) {
      (list.querySelector('.keyword-candidate-remove') || list.querySelector('.keyword-candidate-search') || input)?.focus?.({ preventScroll: true });
    }
  }

  function openEdit(candidate, index, trigger) {
    editing = { index };
    editTrigger = trigger;
    editInput.value = candidate;
    editMessage.textContent = '';
    editSave.disabled = false;
    dialog.showModal();
    editInput.focus({ preventScroll: true });
    editInput.select();
  }

  function closeEdit(restoreFocus = true) {
    if (dialog.open) dialog.close();
    editing = null;
    const trigger = editTrigger;
    editTrigger = null;
    if (restoreFocus) trigger?.focus?.({ preventScroll: true });
  }

  editForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!editing || saving) return;
    editSave.disabled = true;
    editMessage.textContent = '';
    const result = await run(() => onEdit(activeItem, editing.index, editInput.value));
    if (result.ok) {
      const editedIndex = editing.index;
      closeEdit(false);
      list.querySelector(`[data-keyword-candidate-edit="${editedIndex}"]`)?.focus?.({ preventScroll: true });
    } else {
      editMessage.textContent = result.message || 'Não foi possível atualizar a candidata.';
      editSave.disabled = false;
    }
  });
  $('[data-candidate-edit-close]', dialog).addEventListener('click', () => closeEdit());
  $('[data-candidate-edit-cancel]', dialog).addEventListener('click', () => closeEdit());
  dialog.addEventListener('click', event => { if (event.target === dialog) closeEdit(); });
  dialog.addEventListener('close', () => {
    if (editing) {
      editing = null;
      const trigger = editTrigger;
      editTrigger = null;
      trigger?.focus?.({ preventScroll: true });
    }
  });

  addButton.addEventListener('click', () => { void add(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void add();
    }
  });

  return { render, dispose() { dialog.remove(); editor.remove(); } };
}
