import { renderKeywordCandidates } from '../keyword-candidates-ui.mjs?v=5';
import { MAX_CANDIDATES } from './guru-media-negative-candidates-domain.mjs?v=2';

const $ = (selector, root) => root.querySelector(selector);

function loadStyles() {
  if (document.querySelector('[data-guru-media-negative-candidates-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/curadoria/top-performance/guru-media-negative-candidates.css?v=3';
  link.dataset.guruMediaNegativeCandidatesStyle = 'true';
  document.head.append(link);
}

export function mountGuruMediaNegativeCandidatesView({
  root,
  getSnapshot = () => null,
  onAdd = async () => ({ ok: false }),
  onEdit = async () => ({ ok: false }),
  onRemove = async () => ({ ok: false }),
  onConfirmNoCandidates = async () => ({ ok: false }),
  onSearch = () => {},
} = {}) {
  const countries = root?.querySelector('#imageCountries');
  if (!countries) throw new Error('A ficha Guru Media não tem a área de pesquisas do Google Imagens.');
  loadStyles();

  const panel = document.createElement('section');
  panel.className = 'card gm-negative-candidate-panel';
  panel.setAttribute('aria-labelledby', 'gmNegativeCandidateHeading');
  panel.innerHTML = `
    <header class="gm-negative-candidate-heading">
      <div class="gm-negative-candidate-heading-copy">
        <b id="gmNegativeCandidateHeading">Candidatas a palavras-chave negativas</b>
        <p>Esta lista é única para a oferta e será usada em todas as buscas de imagens, além de ser sincronizada com a Entrega da campanha.</p>
      </div>
      <button class="btn primary gm-negative-candidate-review" type="button" data-gm-negative-candidate-review aria-pressed="false" title="Registra que você revisou esta oferta e não encontrou candidatas negativas.">Confirmar ausência de candidatas negativas</button>
    </header>
    <div class="gm-negative-candidate-grid">
      <div class="gm-negative-candidate-entry">
        <label class="gm-negative-candidate-entry-label" for="gmNegativeCandidateInput">Novas candidatas · uma por linha</label>
        <textarea class="control" id="gmNegativeCandidateInput" rows="6" maxlength="10000" placeholder="Cole termos ou frases, um por linha" aria-label="Candidatas negativas globais, uma por linha"></textarea>
        <div class="gm-negative-candidate-entry-actions"><button class="btn primary" type="button" data-gm-negative-candidate-add>Adicionar candidatas <span aria-hidden="true">→</span></button><span class="gm-negative-candidate-count" aria-live="polite"></span></div>
      </div>
      <section class="gm-negative-candidate-output" role="region" aria-label="Lista global de candidatas negativas">
        <header class="gm-negative-candidate-output-head"><span>Lista usada em todas as buscas e na integração</span><span data-gm-negative-candidate-total></span></header>
        <div class="gm-negative-candidate-list" data-gm-negative-candidate-list></div>
      </section>
    </div>
    <p class="gm-negative-candidate-feedback" data-gm-negative-candidate-feedback role="status" aria-live="polite"></p>`;
  countries.before(panel);

  const dialog = document.createElement('dialog');
  dialog.className = 'gm-negative-candidate-edit-dialog';
  dialog.setAttribute('aria-labelledby', 'gmNegativeCandidateEditTitle');
  dialog.setAttribute('aria-describedby', 'gmNegativeCandidateEditDescription');
  dialog.innerHTML = `
    <form class="gm-negative-candidate-edit-form">
      <header><div><b id="gmNegativeCandidateEditTitle">Editar candidata negativa</b><p id="gmNegativeCandidateEditDescription">A alteração será salva na lista global da oferta e usada em todas as buscas de imagens.</p></div><button class="btn" type="button" data-gm-negative-edit-close>Fechar</button></header>
      <div class="gm-negative-candidate-edit-body"><label for="gmNegativeCandidateEditInput">Texto da candidata</label><input class="control" id="gmNegativeCandidateEditInput" type="text" maxlength="82" autocomplete="off"><p id="gmNegativeCandidateEditMessage" role="alert" aria-live="polite"></p></div>
      <footer><button class="btn" type="button" data-gm-negative-edit-cancel>Cancelar</button><button class="btn primary" type="submit">Salvar</button></footer>
    </form>`;
  document.body.append(dialog);

  const input = $('#gmNegativeCandidateInput', panel);
  const addButton = $('[data-gm-negative-candidate-add]', panel);
  const reviewButton = $('[data-gm-negative-candidate-review]', panel);
  const count = $('.gm-negative-candidate-count', panel);
  const list = $('[data-gm-negative-candidate-list]', panel);
  const total = $('[data-gm-negative-candidate-total]', panel);
  const editForm = $('form', dialog);
  const editInput = $('#gmNegativeCandidateEditInput', dialog);
  const editMessage = $('#gmNegativeCandidateEditMessage', dialog);
  const editSave = $('button[type="submit"]', dialog);
  let editing = null;
  let editTrigger = null;
  let busy = false;

  function snapshot() {
    const value = getSnapshot() || {};
    return { ...value, candidates: Array.isArray(value.candidates) ? value.candidates : [] };
  }

  function showFeedback(message, error = false) {
    const feedback = $('[data-gm-negative-candidate-feedback]', panel);
    feedback.textContent = message || '';
    feedback.dataset.state = message ? (error ? 'error' : 'success') : 'empty';
  }

  function setBusy(value) {
    busy = value;
    input.disabled = value;
    addButton.disabled = value;
    for (const button of panel.querySelectorAll('button')) button.disabled = value;
  }

  function render() {
    const current = snapshot();
    const candidates = current.candidates;
    const label = `${candidates.length} ${candidates.length === 1 ? 'termo' : 'termos'}`;
    count.textContent = `${label} nesta oferta · ${candidates.length}/${MAX_CANDIDATES}`;
    total.textContent = label;
    const confirmed = !candidates.length && Boolean(current.negativeKeywordCandidatesReviewedAt);
    reviewButton.hidden = candidates.length > 0;
    reviewButton.classList.toggle('is-confirmed', confirmed);
    reviewButton.setAttribute('aria-pressed', String(confirmed));
    reviewButton.textContent = confirmed ? 'Ausência de candidatas confirmada' : 'Confirmar ausência de candidatas negativas';
    reviewButton.title = confirmed
      ? `Ausência confirmada em ${new Date(current.negativeKeywordCandidatesReviewedAt).toLocaleString('pt-BR')}. Uma nova avaliação visual ou alteração da lista pede nova confirmação.`
      : 'Registra que você revisou esta oferta e não encontrou candidatas negativas.';
    renderKeywordCandidates(list, {
      candidates,
      variant: 'negative',
      saved: true,
      showRemoveForSaved: true,
      emptyText: 'Nenhuma candidata negativa salva para esta oferta.',
      onEdit: (candidate, index, trigger) => openEdit(candidate, index, trigger),
      onRemove: (_candidate, index) => { void remove(index); },
    });
  }

  async function confirmNoCandidates() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await onConfirmNoCandidates();
      if (result?.ok) render();
      showFeedback(result?.message || '', !result?.ok && Boolean(result?.message));
    } catch {
      showFeedback('Não foi possível salvar a confirmação. Tente novamente.', true);
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await onAdd(input.value);
      if (result?.ok) input.value = '';
      if (result?.ok && result.changed) render();
      showFeedback(result?.message || '', !result?.ok && Boolean(result?.message));
    } catch {
      showFeedback('Não foi possível salvar as candidatas negativas. A colagem foi mantida; tente novamente.', true);
    } finally {
      setBusy(false);
    }
  }

  async function remove(index) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await onRemove(index);
      if (result?.ok && result.changed) render();
      showFeedback(result?.message || '', !result?.ok && Boolean(result?.message));
    } catch {
      showFeedback('Não foi possível remover a candidata. A lista anterior foi preservada.', true);
    } finally {
      setBusy(false);
    }
  }

  function openEdit(candidate, index, trigger) {
    if (busy) return;
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

  async function saveEdit(event) {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    editSave.disabled = true;
    editInput.disabled = true;
    editMessage.textContent = '';
    try {
      const result = await onEdit(editing.index, editInput.value);
      if (result?.ok) {
        if (result.changed) render();
        closeEdit(false);
        showFeedback(result.message || 'Candidata negativa atualizada.');
      } else {
        editMessage.textContent = result?.message || 'Não foi possível atualizar a candidata.';
      }
    } catch {
      editMessage.textContent = 'Não foi possível atualizar a candidata. A lista anterior foi preservada.';
    } finally {
      setBusy(false);
      editSave.disabled = false;
      editInput.disabled = false;
    }
  }

  function interceptCountrySearch(event) {
    const button = event.target instanceof Element ? event.target.closest('[data-top-image-search]') : null;
    if (!button || !countries.contains(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onSearch(button.dataset.topImageSearch, snapshot().candidates);
  }

  function removeLegacyCountryCandidates() {
    countries.querySelectorAll('.image-candidate-summary').forEach(summary => summary.remove());
    countries.querySelectorAll('.sheet-status').forEach(status => {
      const label = status.textContent.replace(/\s*[·•]\s*\d+\s+candidata(?:s)?\s*$/iu, '');
      if (label !== status.textContent) status.textContent = label;
    });
  }

  const observer = new MutationObserver(() => {
    removeLegacyCountryCandidates();
    render();
  });
  observer.observe(countries, { childList: true, subtree: true, characterData: true });
  countries.addEventListener('click', interceptCountrySearch, true);
  addButton.addEventListener('click', () => { void add(); });
  reviewButton.addEventListener('click', () => { void confirmNoCandidates(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void add();
    }
  });
  editForm.addEventListener('submit', saveEdit);
  $('[data-gm-negative-edit-close]', dialog).addEventListener('click', () => closeEdit());
  $('[data-gm-negative-edit-cancel]', dialog).addEventListener('click', () => closeEdit());
  dialog.addEventListener('click', event => { if (event.target === dialog) closeEdit(); });
  dialog.addEventListener('close', () => {
    if (editing) {
      editing = null;
      const trigger = editTrigger;
      editTrigger = null;
      trigger?.focus?.({ preventScroll: true });
    }
  });

  removeLegacyCountryCandidates();
  render();

  return {
    render,
    dispose() {
      observer.disconnect();
      countries.removeEventListener('click', interceptCountrySearch, true);
      panel.remove();
      dialog.remove();
    },
  };
}
