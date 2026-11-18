import { planAddCandidates, planEditCandidate, planRemoveCandidate } from './guru-media-trend-candidates-domain.mjs?v=2';

const FAILURE = 'Não foi possível salvar as candidatas. Tente novamente.';

function resultMessage(action, plan) {
  if (plan.reason === 'empty') return '';
  if (plan.reason === 'too-long') {
    return `Não foi possível adicionar: ${plan.tooLongCount} candidata(s) excede(m) o limite de 80 caracteres usado na criação de campanhas. Nada foi salvo.`;
  }
  if (plan.reason === 'limit') return 'Não foi possível adicionar: a lista aceita até 100 candidatas para transferência à campanha. Nada foi salvo.';
  if (plan.reason === 'missing') return 'Não foi possível alterar: esta candidata não está mais disponível.';
  if (plan.reason === 'duplicate') return 'Não foi possível editar: já existe uma candidata igual na lista.';
  if (plan.reason === 'empty-edit') return 'Não foi possível editar: informe o texto da candidata.';
  if (plan.reason === 'too-long-edit') return 'Não foi possível editar: o limite é de 80 caracteres.';

  if (!plan.changed && action === 'add') {
    return plan.duplicateCount
      ? 'Todas as candidatas já estavam na lista; nenhuma duplicata foi adicionada.'
      : '';
  }
  if (action === 'add') {
    const count = plan.additions.length;
    return `${count} ${count === 1 ? 'candidata adicionada' : 'candidatas adicionadas'}${plan.duplicateCount ? `; ${plan.duplicateCount} ${plan.duplicateCount === 1 ? 'duplicata ignorada' : 'duplicatas ignoradas'}` : ''}.`;
  }
  if (action === 'edit') return 'Candidata à palavra-chave atualizada.';
  return 'Candidata à palavra-chave removida.';
}

export function createGuruMediaTrendCandidatesController({
  getRecord,
  saveRecord,
  onSaved = () => {},
} = {}) {
  if (typeof getRecord !== 'function' || typeof saveRecord !== 'function') {
    throw new TypeError('O fluxo de candidatas precisa de leitura e gravação explícitas.');
  }

  async function persist(item, candidates) {
    const current = getRecord(item.offerId) || {};
    const record = await saveRecord({
      ...current,
      offerId: item.offerId,
      productName: item.productName,
      keywordCandidates: candidates,
    });
    onSaved(record);
    return record;
  }

  async function apply(action, item, plan) {
    if (!item) return { ok: false, message: 'Não foi possível identificar a oferta.' };
    if (!plan.ok) return { ok: false, message: resultMessage(action, plan), reason: plan.reason };
    if (!plan.changed) return { ok: true, changed: false, message: resultMessage(action, plan) };
    try {
      const record = await persist(item, plan.candidates);
      return { ok: true, changed: true, message: resultMessage(action, plan), record };
    } catch (error) {
      return { ok: false, changed: false, message: FAILURE, error };
    }
  }

  return {
    add(item, pastedValues) {
      return apply('add', item, planAddCandidates(getRecord(item?.offerId)?.keywordCandidates, pastedValues));
    },
    edit(item, index, value) {
      const plan = planEditCandidate(getRecord(item?.offerId)?.keywordCandidates, index, value);
      if (plan.reason === 'empty') plan.reason = 'empty-edit';
      if (plan.reason === 'too-long') plan.reason = 'too-long-edit';
      return apply('edit', item, plan);
    },
    remove(item, index) {
      return apply('remove', item, planRemoveCandidate(getRecord(item?.offerId)?.keywordCandidates, index));
    },
  };
}
