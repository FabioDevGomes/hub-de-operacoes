import { formatCommissionUsd, isCommissionUsd } from '../../campaign-delivery/commission-domain.mjs?v=2';
import { normalizeAffiliateUrl } from '../../campaign-delivery/affiliate-url-domain.mjs?v=1';
import { guruMediaCommission } from './guru-media-delivery-domain.mjs?v=5';
import { getCampaignDeliveriesForOffer } from '../../campaign-delivery/delivery-store.mjs?v=17';
import { saveGuruMediaAffiliateUrl, saveGuruMediaCanonicalProductName, saveGuruMediaCommission, startGuruMediaCampaignDelivery, watchGuruMediaCampaignDeliverySources } from './guru-media-campaign-delivery.mjs?v=8';
import { curationBridges } from '../central-bridge-slot.mjs';

function loadStyles() {
  if (document.querySelector('[data-guru-media-delivery-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/curadoria/top-performance/guru-media-campaign-delivery.css?v=6';
  link.dataset.guruMediaDeliveryStyle = 'true';
  document.head.append(link);
}

export function mountGuruMediaCampaignDeliveryView({ root, getContext, beforeStart = async () => true, onCommissionSaved = () => {}, onProductNameSaved = () => {}, onAffiliateLinkSaved = () => {} }) {
  if (!root) return { render() {}, dispose() {} };
  loadStyles();
  const header = root.querySelector('.sheet-top');
  const closeButton = root.querySelector('#closeSheet');
  const offerDetails = root.querySelector('#offerDetails');
  if (!header || !closeButton || !offerDetails) return { render() {}, dispose() {} };

  const countryCard = root.querySelector('.trends-country-card');
  const countryTitle = countryCard?.querySelector('h2');
  const countryHeading = countryCard && countryTitle
    ? countryCard.querySelector('.trends-country-heading') || document.createElement('div')
    : null;
  const countryActions = countryHeading
    ? countryHeading.querySelector('.guru-media-country-actions') || document.createElement('div')
    : null;
  const commissionButton = document.createElement('button');
  commissionButton.className = 'btn commission-value-button';
  commissionButton.type = 'button';
  commissionButton.dataset.state = 'missing';
  commissionButton.setAttribute('aria-haspopup', 'dialog');
  commissionButton.setAttribute('aria-controls', 'guruMediaCommissionDialog');
  const offerActionTarget = countryHeading?.querySelector('#topGuruMediaOfferAction') || document.createElement('div');
  if (countryHeading && countryActions) {
    countryHeading.classList.add('trends-country-heading', 'guru-media-country-heading');
    countryActions.className = 'guru-media-country-actions';
    if (countryTitle.parentElement !== countryHeading) countryHeading.insertBefore(countryTitle, countryHeading.firstChild);
    countryActions.append(offerActionTarget, commissionButton);
    if (countryActions.parentElement !== countryHeading) countryHeading.append(countryActions);
    if (countryHeading.parentElement !== countryCard) countryCard.insertBefore(countryHeading, countryCard.firstChild);
    offerActionTarget.id = 'topGuruMediaOfferAction';
    offerActionTarget.className = 'trends-country-offer-action';
  } else {
    header.insertBefore(commissionButton, closeButton);
  }

  const trendsSearchRow = root.querySelector('.trends-search-row');
  const trendsSearchButton = root.querySelector('#openTrends');
  const productNameButton = document.createElement('button');
  productNameButton.className = 'btn';
  productNameButton.type = 'button';
  productNameButton.textContent = 'Definir nome do produto';
  productNameButton.dataset.guruMediaProductName = 'true';
  const searchActions = document.createElement('div');
  searchActions.className = 'trends-search-actions';
  searchActions.append(productNameButton);
  if (trendsSearchButton) searchActions.append(trendsSearchButton);
  if (trendsSearchRow) trendsSearchRow.append(searchActions);
  const productNameStatus = document.createElement('p');
  productNameStatus.className = 'guru-media-product-name-status';
  productNameStatus.setAttribute('role', 'status');
  productNameStatus.setAttribute('aria-live', 'polite');
  if (trendsSearchRow) trendsSearchRow.insertAdjacentElement('afterend', productNameStatus);
  const affiliateLinkSection = document.createElement('section');
  affiliateLinkSection.className = 'guru-media-affiliate-link';
  affiliateLinkSection.setAttribute('aria-label', 'Link de afiliado');
  if (productNameStatus.parentElement) productNameStatus.insertAdjacentElement('afterend', affiliateLinkSection);

  const deliveryButton = document.createElement('button');
  deliveryButton.className = 'btn';
  deliveryButton.type = 'button';
  deliveryButton.textContent = 'Iniciar entrega';
  const barActions = root.querySelector('.sheet-tab-bar .sheet-bar-actions');
  const saveButton = barActions?.querySelector('#saveSheetButton');
  if (barActions) barActions.insertBefore(deliveryButton, saveButton || barActions.firstChild);
  else header.insertBefore(deliveryButton, closeButton);

  const message = document.createElement('p');
  message.className = 'guru-media-delivery-message';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  const tabBar = root.querySelector('.sheet-tab-bar');
  if (tabBar) tabBar.insertAdjacentElement('afterend', message);
  else offerDetails.insertAdjacentElement('afterend', message);

  const dialog = document.createElement('dialog');
  dialog.className = 'guru-media-commission-dialog';
  dialog.id = 'guruMediaCommissionDialog';
  dialog.innerHTML = `<form method="dialog" id="guruMediaCommissionForm"><header class="modalhead"><div><b>Comissão Guru Media</b><div class="sub">O payout preenche o valor inicial. Você pode informar a comissão efetiva em USD.</div></div><button class="btn" type="button" data-close-commission>Fechar</button></header><div class="modalbody"><label class="guru-media-commission-field" for="guruMediaCommissionInput">Comissão da oferta (USD)<input class="control" id="guruMediaCommissionInput" type="number" inputmode="decimal" min="0.01" max="99999999.99" step="0.01" required placeholder="Ex.: 110.00"></label><p class="guru-media-delivery-dialog-message" role="alert" aria-live="polite"></p></div><footer class="modalfoot"><button class="btn primary" type="submit">Salvar comissão</button></footer></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const commissionInput = dialog.querySelector('#guruMediaCommissionInput');
  const dialogMessage = dialog.querySelector('.guru-media-delivery-dialog-message');
  const submitButton = form.querySelector('[type="submit"]');
  let renderedOfferId = '';
  let busy = false;
  let affiliateEditorOfferId = '';
  let affiliateDraft = '';
  let editingAffiliateLink = false;
  let affiliateSaving = false;
  let affiliateStatus = '';
  let affiliateStatusState = '';
  let centralLoading = false;
  let centralLoadError = '';

  function currentOffer() {
    const offer = getContext?.()?.offer;
    return offer && String(offer.offerId || '').trim() ? offer : null;
  }

  function linkedDeliveries(offer) {
    if (curationBridges.delivery) {
      const snapshot = curationBridges.guruDeliverySnapshot;
      if (!snapshot) throw new Error('Entregas centrais ainda não foram carregadas.');
      return curationBridges.delivery.forOffer(snapshot, String(offer?.offerId || ''), 'GM');
    }
    return getCampaignDeliveriesForOffer(String(offer?.offerId || ''), undefined, 'GM');
  }

  async function loadCentralDeliveries() {
    if (centralLoading || !curationBridges.delivery) return;
    centralLoading = true;
    try {
      curationBridges.guruDeliverySnapshot = await curationBridges.delivery.list();
      centralLoadError = '';
    } catch {
      centralLoadError = 'Não foi possível carregar as entregas centrais. Reabra a oferta e tente novamente.';
    } finally {
      centralLoading = false;
      render();
    }
  }

  function renderAffiliateLink(offer, deliveries = linkedDeliveries(offer)) {
    if (!offer) return;
    const savedLink = normalizeAffiliateUrl(offer.affiliateUrl || offer.affiliateLink) || '';
    const legacyDeliveryLink = !savedLink
      ? normalizeAffiliateUrl(deliveries.length === 1 ? deliveries[0].affiliateUrl : '') || ''
      : '';
    if (affiliateEditorOfferId !== String(offer.offerId)) {
      affiliateEditorOfferId = String(offer.offerId);
      affiliateDraft = savedLink || legacyDeliveryLink;
      editingAffiliateLink = !savedLink;
      affiliateSaving = false;
      affiliateStatus = legacyDeliveryLink
        ? 'Link encontrado no fluxo existente. Salve-o para vinculá-lo à oferta e liberar a continuação.'
        : '';
      affiliateStatusState = legacyDeliveryLink ? 'notice' : '';
    }
    affiliateLinkSection.replaceChildren();
    if (savedLink && !editingAffiliateLink) {
      const row = document.createElement('div');
      row.className = 'guru-media-affiliate-link-saved';
      const value = document.createElement('div');
      value.className = 'guru-media-affiliate-link-value';
      const label = document.createElement('span');
      label.className = 'field-label';
      label.textContent = 'Link de afiliado';
      const anchor = document.createElement('a');
      anchor.href = savedLink;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.title = savedLink;
      anchor.textContent = savedLink;
      value.append(label, anchor);
      const copyButton = document.createElement('button');
      copyButton.className = 'btn guru-media-affiliate-copy';
      copyButton.type = 'button';
      copyButton.dataset.affiliateCopy = 'true';
      copyButton.setAttribute('aria-label', 'Copiar link de afiliado');
      copyButton.title = 'Copiar link de afiliado';
      copyButton.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg>';
      const editButton = document.createElement('button');
      editButton.className = 'btn';
      editButton.type = 'button';
      editButton.dataset.affiliateEdit = 'true';
      editButton.textContent = 'Editar';
      row.append(value, copyButton, editButton);
      affiliateLinkSection.append(row);
    } else {
      const row = document.createElement('div');
      row.className = 'guru-media-affiliate-link-entry';
      const label = document.createElement('label');
      const labelText = document.createElement('span');
      labelText.className = 'field-label';
      labelText.textContent = 'Link de afiliado · obrigatório';
      const input = document.createElement('input');
      input.className = 'control';
      input.id = 'guruMediaAffiliateLinkInput';
      input.type = 'url';
      input.maxLength = 4096;
      input.required = true;
      input.autocomplete = 'off';
      input.placeholder = 'Cole o link de afiliado HTTP ou HTTPS';
      input.setAttribute('aria-label', 'Link de afiliado obrigatório');
      input.value = affiliateDraft;
      input.disabled = affiliateSaving;
      input.addEventListener('input', () => {
        affiliateDraft = input.value;
        input.removeAttribute('aria-invalid');
        const currentSavedLink = normalizeAffiliateUrl(offer.affiliateUrl || offer.affiliateLink) || '';
        const changed = normalizeAffiliateUrl(affiliateDraft) !== currentSavedLink;
        deliveryButton.disabled = busy || deliveries.length > 1 || !currentSavedLink || changed;
        deliveryButton.title = deliveries.length > 1
          ? 'Há vários fluxos associados; abra Entrega de campanha para selecionar um.'
          : !currentSavedLink ? 'Informe e salve o link de afiliado para continuar.'
            : changed ? 'Salve ou cancele a edição do link de afiliado para continuar.' : '';
      });
      label.append(labelText, input);
      const saveLinkButton = document.createElement('button');
      saveLinkButton.className = 'btn primary';
      saveLinkButton.type = 'button';
      saveLinkButton.dataset.affiliateSave = 'true';
      saveLinkButton.disabled = affiliateSaving;
      saveLinkButton.textContent = affiliateSaving ? 'Salvando…' : savedLink ? 'Salvar alteração' : 'Salvar link';
      row.append(label, saveLinkButton);
      if (savedLink) {
        const cancelButton = document.createElement('button');
        cancelButton.className = 'btn';
        cancelButton.type = 'button';
        cancelButton.dataset.affiliateCancel = 'true';
        cancelButton.textContent = 'Cancelar';
        cancelButton.disabled = affiliateSaving;
        row.append(cancelButton);
      }
      affiliateLinkSection.append(row);
    }
    const status = document.createElement('p');
    status.className = 'guru-media-affiliate-message';
    status.dataset.state = affiliateStatusState;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = affiliateStatus || (!savedLink ? 'Salve uma URL HTTP ou HTTPS válida para liberar o fluxo de entrega.' : '');
    affiliateLinkSection.append(status);
  }

  function showCommissionDialog(offer = currentOffer()) {
    if (!offer) return;
    const commission = guruMediaCommission(offer);
    commissionInput.value = commission.amount == null ? '' : String(commission.amount);
    dialogMessage.textContent = '';
    dialog.showModal();
    commissionInput.focus({ preventScroll: true });
  }

  function render() {
    const offer = currentOffer();
    if (!offer) return;
    if (curationBridges.delivery && !curationBridges.guruDeliverySnapshot) {
      deliveryButton.disabled = true;
      deliveryButton.textContent = 'Carregando entrega…';
      message.textContent = centralLoadError || 'Consultando entregas centrais…';
      if (!centralLoadError) void loadCentralDeliveries();
      return;
    }
    const offerId = String(offer.offerId);
    const commission = guruMediaCommission(offer);
    const payout = offer.payout?.currency === 'USD' && isCommissionUsd(Number(offer.payout?.value))
      ? formatCommissionUsd(Number(offer.payout.value))
      : 'indisponível';
    const sourceNote = commission.source === 'manual'
      ? `Valor editado manualmente · payout atual: ${payout}.`
      : commission.source === 'payout'
        ? 'Payout usado como valor inicial da comissão. Você pode editá-lo.'
        : 'A captura não trouxe um payout em USD válido. Informe a comissão para iniciar uma nova entrega.';
    const deliveries = linkedDeliveries(offer);
    renderAffiliateLink(offer, deliveries);
    const currentDeliveryId = new URLSearchParams(location.search).get('delivery_id') || '';
    const currentDelivery = deliveries.find(item => item.id === currentDeliveryId);
    const savedAffiliateLink = normalizeAffiliateUrl(offer.affiliateUrl || offer.affiliateLink) || '';
    const editedAffiliateLink = editingAffiliateLink && normalizeAffiliateUrl(affiliateDraft) !== savedAffiliateLink;
    deliveryButton.textContent = currentDelivery ? 'Voltar à entrega' : deliveries.length ? 'Abrir fluxo da entrega' : 'Iniciar entrega';
    deliveryButton.disabled = busy || deliveries.length > 1 || !savedAffiliateLink || editedAffiliateLink;
    deliveryButton.title = deliveries.length > 1
      ? 'Há vários fluxos associados; abra Entrega de campanha para selecionar um.'
      : !savedAffiliateLink ? 'Informe e salve o link de afiliado para continuar.'
        : editedAffiliateLink ? 'Salve ou cancele a edição do link de afiliado para continuar.' : '';
    const canonicalProductName = String(offer.canonicalProductName || '').trim();
    productNameStatus.dataset.state = canonicalProductName ? 'saved' : 'empty';
    productNameStatus.textContent = canonicalProductName
      ? `✓ Nome do produto salvo: ${canonicalProductName}. Será usado na campanha, no Asset Studio e na Ficha e Pre-Sell.${deliveries.length ? ' O fluxo existente também recebe esse nome; confira etapas já iniciadas.' : ''}`
      : 'Nome ainda não definido. Use o termo de pesquisa acima para definir o nome que seguirá para o fluxo de entrega.';
    productNameButton.textContent = canonicalProductName ? 'Atualizar nome do produto' : 'Definir nome do produto';
    commissionButton.dataset.state = commission.amount == null ? 'missing' : 'saved';
    commissionButton.textContent = commission.amount == null
      ? 'Definir comissão Guru Media · USD'
      : `Comissão Guru Media · ${formatCommissionUsd(commission.amount)}`;
    commissionButton.title = sourceNote;
    commissionButton.setAttribute('aria-label', `${commissionButton.textContent}. ${sourceNote} Clique para editar.`);
    if (renderedOfferId !== offerId) {
      message.textContent = '';
      renderedOfferId = offerId;
    }
  }

  commissionButton.addEventListener('click', () => showCommissionDialog());

  productNameButton.addEventListener('click', async () => {
    const offer = currentOffer();
    const input = root.querySelector('#trendsTerm');
    const value = String(input?.value || '').trim();
    if (!offer || busy || productNameButton.disabled) return;
    if (!value) {
      productNameStatus.dataset.state = 'error';
      productNameStatus.textContent = 'Digite no termo de pesquisa o nome que deseja definir para o produto.';
      input?.focus();
      return;
    }
    if (value.length > 100) {
      productNameStatus.dataset.state = 'error';
      productNameStatus.textContent = 'O nome do produto pode ter até 100 caracteres.';
      input?.focus();
      return;
    }
    productNameButton.disabled = true;
    productNameButton.textContent = 'Salvando…';
    productNameStatus.dataset.state = 'saving';
    productNameStatus.textContent = 'Salvando nome do produto…';
    try {
      const result = await saveGuruMediaCanonicalProductName(offer.offerId, value);
      if (result.offer?.canonicalProductName !== value) throw new Error('O armazenamento não confirmou o nome do produto.');
      await onProductNameSaved(result.offer);
      productNameStatus.dataset.state = result.deliverySyncWarning ? 'error' : 'saved';
      productNameStatus.textContent = result.deliverySyncWarning
        ? `Nome salvo na Curadoria, mas o fluxo existente não foi atualizado: ${result.deliverySyncWarning}`
        : `✓ Nome do produto salvo${result.deliveriesUpdated ? ' e sincronizado ao fluxo existente' : ''}: ${value}. Campanha, Asset Studio e Ficha e Pre-Sell usarão este nome.`;
    } catch (error) {
      productNameStatus.dataset.state = 'error';
      productNameStatus.textContent = error?.message || 'Não foi possível salvar o nome do produto. Os dados anteriores foram preservados.';
    } finally {
      productNameButton.disabled = false;
      productNameButton.textContent = String(currentOffer()?.canonicalProductName || '').trim() ? 'Atualizar nome do produto' : 'Definir nome do produto';
    }
  });

  deliveryButton.addEventListener('click', async () => {
    const offer = currentOffer();
    if (!offer || busy) return;
    const savedAffiliateLink = normalizeAffiliateUrl(offer.affiliateUrl || offer.affiliateLink);
    if (!savedAffiliateLink || (editingAffiliateLink && normalizeAffiliateUrl(affiliateDraft) !== savedAffiliateLink)) {
      message.textContent = 'Informe e salve o link de afiliado antes de iniciar ou continuar a entrega.';
      root.querySelector('#guruMediaAffiliateLinkInput')?.focus();
      return;
    }
    if (linkedDeliveries(offer).length > 1) {
      message.textContent = 'Há mais de uma entrega para esta oferta. Abra Entrega de campanha e selecione o fluxo correto.';
      return;
    }
    if (!linkedDeliveries(offer).length && !isCommissionUsd(guruMediaCommission(offer).amount)) {
      message.textContent = 'Defina a comissão em USD antes de iniciar uma nova entrega.';
      showCommissionDialog(offer);
      return;
    }
    busy = true;
    deliveryButton.disabled = true;
    message.textContent = 'Salvando a seleção de Trends e preparando a entrega…';
    try {
      if (await beforeStart(offer) !== true) throw new Error('Não foi possível salvar a seleção de Trends. Nenhuma entrega foi criada.');
      const delivery = await startGuruMediaCampaignDelivery(offer.offerId);
      if (!delivery?.id) throw new Error('Não foi possível recuperar a entrega salva.');
      window.location.assign(`/campaign-delivery/?delivery_id=${encodeURIComponent(delivery.id)}`);
    } catch (error) {
      message.textContent = error?.message || 'Não foi possível iniciar a entrega Guru Media.';
      busy = false;
      render();
    }
  });

  async function submitAffiliateLink() {
    const offer = currentOffer();
    const input = root.querySelector('#guruMediaAffiliateLinkInput');
    if (!offer || !input || busy || affiliateSaving) return;
    const affiliateUrl = normalizeAffiliateUrl(input.value);
    if (!affiliateUrl) {
      affiliateDraft = input.value;
      affiliateStatus = 'Informe uma URL HTTP ou HTTPS válida para o link de afiliado.';
      affiliateStatusState = 'error';
      renderAffiliateLink(offer);
      const invalidInput = root.querySelector('#guruMediaAffiliateLinkInput');
      invalidInput?.setAttribute('aria-invalid', 'true');
      invalidInput?.focus();
      return;
    }
    affiliateDraft = affiliateUrl;
    affiliateSaving = true;
    affiliateStatus = 'Salvando link de afiliado…';
    affiliateStatusState = 'saving';
    renderAffiliateLink(offer);
    try {
      const result = await saveGuruMediaAffiliateUrl(offer.offerId, affiliateUrl);
      if (normalizeAffiliateUrl(result.offer?.affiliateUrl) !== affiliateUrl) throw new Error('O armazenamento não confirmou o link de afiliado.');
      await onAffiliateLinkSaved(result.offer);
      editingAffiliateLink = false;
      affiliateDraft = affiliateUrl;
      affiliateStatusState = result.deliverySyncWarning ? 'error' : 'saved';
      affiliateStatus = result.deliverySyncWarning
        ? `Link salvo na Curadoria, mas o fluxo existente não foi atualizado: ${result.deliverySyncWarning}`
        : `Link de afiliado salvo${result.deliveriesUpdated ? ' e sincronizado ao fluxo existente' : ''}.`;
    } catch (error) {
      affiliateStatusState = 'error';
      affiliateStatus = error?.message || 'Não foi possível salvar o link de afiliado. Os dados anteriores foram preservados.';
    } finally {
      affiliateSaving = false;
      render();
    }
  }

  affiliateLinkSection.addEventListener('click', async event => {
    const offer = currentOffer();
    if (!offer) return;
    if (event.target.closest('[data-affiliate-edit]')) {
      affiliateDraft = normalizeAffiliateUrl(offer.affiliateUrl || offer.affiliateLink) || '';
      editingAffiliateLink = true;
      affiliateStatus = '';
      affiliateStatusState = '';
      renderAffiliateLink(offer);
      root.querySelector('#guruMediaAffiliateLinkInput')?.focus();
      return;
    }
    if (event.target.closest('[data-affiliate-cancel]')) {
      editingAffiliateLink = false;
      affiliateDraft = normalizeAffiliateUrl(offer.affiliateUrl || offer.affiliateLink) || '';
      affiliateStatus = '';
      affiliateStatusState = '';
      renderAffiliateLink(offer);
      render();
      return;
    }
    if (event.target.closest('[data-affiliate-save]')) {
      await submitAffiliateLink();
      return;
    }
    if (event.target.closest('[data-affiliate-copy]')) {
      const link = normalizeAffiliateUrl(offer.affiliateUrl || offer.affiliateLink);
      if (!link) return;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('A área de transferência não está disponível neste navegador.');
        await navigator.clipboard.writeText(link);
        affiliateStatus = 'Link de afiliado copiado.';
        affiliateStatusState = 'saved';
      } catch (error) {
        affiliateStatus = error?.message || 'Não foi possível copiar. Selecione o link e copie manualmente.';
        affiliateStatusState = 'error';
      }
      renderAffiliateLink(offer);
    }
  });
  affiliateLinkSection.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.closest('#guruMediaAffiliateLinkInput')) {
      event.preventDefault();
      void submitAffiliateLink();
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const offer = currentOffer();
    if (!offer || busy) return;
    busy = true;
    submitButton.disabled = true;
    dialogMessage.textContent = '';
    try {
      const result = await saveGuruMediaCommission(offer.offerId, commissionInput.value.trim());
      await onCommissionSaved(result.offer);
      if (dialog.open) dialog.close();
      message.textContent = result.deliverySyncWarning
        ? 'Comissão Guru Media salva na Curadoria, mas não foi sincronizada com a entrega existente: ' + result.deliverySyncWarning
        : 'Comissão Guru Media salva. O valor será usado no fluxo e no cálculo inicial do CPA.';
      render();
    } catch (error) {
      dialogMessage.textContent = error?.message || 'Não foi possível salvar a comissão Guru Media.';
    } finally {
      busy = false;
      submitButton.disabled = false;
    }
  });
  dialog.querySelector('[data-close-commission]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  const observer = new MutationObserver(() => {
    if (root.classList.contains('hidden')) centralLoadError = '';
    else render();
  });
  observer.observe(root.querySelector('#sheetTitle'), { childList: true, characterData: true, subtree: true });
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  const stopWatchingSources = watchGuruMediaCampaignDeliverySources(error => {
    if (currentOffer()?.offerId) message.textContent = 'A Curadoria foi salva, mas os dados não puderam ser sincronizados com a entrega. ' + (error?.message || 'Tente reabrir o fluxo.');
  });

  return {
    render,
    dispose() {
      observer.disconnect(); stopWatchingSources(); dialog.remove(); actions.remove(); searchActions.remove(); productNameStatus.remove(); affiliateLinkSection.remove(); commissionButton.remove(); message.remove();
    },
  };
}
