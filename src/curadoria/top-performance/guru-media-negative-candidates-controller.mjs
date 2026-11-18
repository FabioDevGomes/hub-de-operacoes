import { planAddCandidates, planEditCandidate, planRemoveCandidate } from './guru-media-negative-candidates-domain.mjs?v=2';

const SAVE_FAILURE = 'Não foi possível salvar as candidatas negativas. A lista anterior foi preservada; tente novamente.';

function messageFor(action, plan) {
  if (plan.reason === 'empty') return 'Cole uma candidata por linha antes de adicionar.';
  if (plan.reason === 'invalid') {
    const first = plan.invalid?.[0];
    return first ? `Linha ${first.line}: ${first.message}` : 'Revise o formato das candidatas.';
  }
  if (plan.reason === 'invalid-edit') return plan.invalid?.[0]?.message || 'Revise o formato da candidata.';
  if (plan.reason === 'limit') return 'A lista global aceita até 100 palavras-chave negativas. Nada foi salvo.';
  if (plan.reason === 'missing') return 'Esta candidata não está mais disponível.';
  if (plan.reason === 'duplicate') return 'Já existe uma candidata igual na lista global.';
  if (plan.reason === 'empty-edit') return 'Informe o texto da candidata.';
  if (!plan.changed && action === 'add') {
    return plan.duplicateCount
      ? 'Todas as candidatas já estavam salvas; nenhuma duplicata foi adicionada.'
      : '';
  }
  if (action === 'add') {
    const count = plan.additions.length;
    return `${count} ${count === 1 ? 'candidata adicionada' : 'candidatas adicionadas'}${plan.duplicateCount ? `; ${plan.duplicateCount} repetida(s) ignorada(s)` : ''}.`;
  }
  return action === 'edit' ? 'Candidata negativa atualizada.' : 'Candidata negativa removida.';
}

export function createGuruMediaNegativeCandidatesController({ getSnapshot, saveCandidates, saveConfirmation, onSaved = () => {} } = {}) {
  if (typeof getSnapshot !== 'function' || typeof saveCandidates !== 'function' || typeof saveConfirmation !== 'function') {
    throw new TypeError('O fluxo global de candidatas negativas precisa de leitura, gravação e confirmação explícitas.');
  }

  async function apply(action, plan) {
    const snapshot = getSnapshot();
    if (!snapshot?.offerId) return { ok: false, message: 'Não foi possível identificar a oferta.' };
    if (!plan.ok) return { ok: false, message: messageFor(action, plan), reason: plan.reason };
    if (!plan.changed) return { ok: true, changed: false, message: messageFor(action, plan) };

    try {
      const record = await saveCandidates(snapshot, plan.candidates);
      if (!record) throw new Error('A gravação não foi confirmada.');
      onSaved(record);
      return { ok: true, changed: true, message: messageFor(action, plan), candidates: plan.candidates, record };
    } catch (error) {
      return { ok: false, changed: false, message: SAVE_FAILURE, error };
    }
  }

  async function confirmNoCandidates() {
    const snapshot = getSnapshot();
    if (!snapshot?.offerId) return { ok: false, message: 'Não foi possível identificar a oferta.' };
    if (Array.isArray(snapshot.candidates) && snapshot.candidates.length) {
      return { ok: false, message: 'A lista ainda contém candidatas negativas. Revise ou remova os termos antes de confirmar a ausência.' };
    }
    if (snapshot.negativeKeywordCandidatesReviewedAt) {
      return { ok: true, changed: false, message: 'A ausência de candidatas negativas já está confirmada para esta oferta.' };
    }

    try {
      const record = await saveConfirmation(snapshot);
      if (!record) throw new Error('A gravação não foi confirmada.');
      onSaved(record, 'confirm-empty');
      return { ok: true, changed: true, message: 'Ausência de candidatas negativas confirmada para esta oferta.', record };
    } catch (error) {
      return { ok: false, changed: false, message: error?.message || 'Não foi possível salvar a confirmação. Tente novamente.', error };
    }
  }

  return {
    add(value) { return apply('add', planAddCandidates(getSnapshot()?.candidates, value)); },
    edit(index, value) { return apply('edit', planEditCandidate(getSnapshot()?.candidates, index, value)); },
    remove(index) { return apply('remove', planRemoveCandidate(getSnapshot()?.candidates, index)); },
    confirmNoCandidates,
  };
}
