import { CAMPAIGN_DELIVERY_STORAGE_KEY, getCampaignDelivery, listCampaignDeliveries, markCampaignDeliveryOpened, updateCampaignDeliveryAssetStudioRoute } from './delivery-store.mjs?v=19';
import {formatCommissionUsd,isCommissionUsd} from './commission-domain.mjs?v=2';
import { deliveryProgress, DELIVERY_SHARED_STEPS } from './progress-domain.mjs?v=8';
import { loadGoogleAdsCampaignBatches } from '../google-ads/google-ads-campaign-batches-storage.mjs?v=10';
import { loadGoogleAdsCampaignDrafts } from '../google-ads/google-ads-campaign-drafts-storage.mjs?v=1';
import { readCpaExpansion, cpaExpansionBlocksSharedSteps } from '../google-ads/google-ads-cpa-expansion-store.mjs?v=2';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const labels = { curadoria:'Curadoria', assets:'Asset Studio', presell:'Ficha e Pre-Sell', campaign:'Criação de campanha' };
const query = new URLSearchParams(location.search);
let deliveries = listCampaignDeliveries();
let active = getCampaignDelivery(query.get('delivery_id')) || deliveries[0] || null;

function platformCode(delivery) {
  return String(delivery?.platformCode || 'CB').trim().toUpperCase() === 'GM' ? 'GM' : 'CB';
}

function platformName(delivery) {
  return platformCode(delivery) === 'GM' ? 'Guru Media' : 'ClickBank';
}

function listMarkup(title, values) {
  const terms = Array.isArray(values) ? values : [];
  return `<div class="data-block"><h3>${escape(title)} · ${terms.length}</h3>${terms.length ? `<ul class="term-list">${terms.map(value => `<li>${escape(value)}</li>`).join('')}</ul>` : '<p>Nenhum termo salvo para esta oferta.</p>'}</div>`;
}

function assetStudioMarkup(work, bypassed = false) {
  const labels = { draft:'Rascunho local', processing:'Envio em andamento', completed:'Assets gerados', completed_with_warnings:'Concluído com avisos', failed:'Envio com falha', interrupted:'Envio interrompido' };
  const heading = bypassed ? 'Asset Studio · etapa dispensada' : `Asset Studio · ${labels[work?.status] || labels.draft}`;
  const bypassNote = bypassed ? '<p>Fluxo de página local existente selecionado. Esta entrega não exige gerar ou confirmar assets no Asset Studio.</p>' : '';
  if (!work) return `<div class="data-block"><h3>${heading}</h3>${bypassNote || '<p>Ainda não há rascunho ou confirmações salvos para esta entrega.</p>'}</div>`;
  const updated = Number.isFinite(Date.parse(work.updatedAtUtc)) ? ` · atualizado em ${new Date(work.updatedAtUtc).toLocaleString('pt-BR')}` : '';
  const images = Array.isArray(work.selectedProductImages) ? work.selectedProductImages : [];
  const imageSummary = images.length
    ? `<p>Imagens escolhidas: ${images.map(image => escape(image.fileName || image.alt || 'Imagem de produto') + (image.width && image.height ? ` · ${image.width} × ${image.height}` : '')).join('; ')}.</p>`
    : '<p>Nenhuma imagem de produto selecionada.</p>';
  const results = [
    ...(Array.isArray(work.results) ? work.results : []).map(row => ({ ...row, group: 'Envio de assets' })),
    ...(Array.isArray(work.productImageResults) ? work.productImageResults : []).map(row => ({ ...row, group: 'Imagem do produto' }))
  ].slice(-100);
  const resultMarkup = results.length
    ? `<ul class="asset-work-results">${results.map(row => `<li class="${['ok','error','warning'].includes(row.status) ? `is-${row.status}` : ''}"><span>${escape(row.group)}:</span> ${escape(row.text)}</li>`).join('')}</ul>`
    : '<p>Nenhuma confirmação de arquivo registrada.</p>';
  return `<div class="data-block"><h3>${escape(heading)}</h3>${bypassNote}<p>Produto: ${escape(work.productName || 'não informado')}${updated}.</p>${imageSummary}${work.productImageStatus ? `<p>${escape(work.productImageStatus)}</p>` : ''}${resultMarkup}</div>`;
}

function setStageStatus(node, state, message) {
  node.classList.remove('is-complete', 'is-pending', 'is-warning');
  node.classList.add(state);
  node.textContent = message;
}

function stageUrl(stage) {
  const id = encodeURIComponent(active.id);
  if (stage === 'curadoria') {
    if (platformCode(active) === 'GM') return `/curadoria/top-performance/?offerId=${encodeURIComponent(active.offerKey)}&delivery_id=${encodeURIComponent(active.id)}`;
    return active.offerKey
      ? `/curadoria/clickbank-top-offers/?offerKey=${encodeURIComponent(active.offerKey)}`
      : '/curadoria/clickbank-top-offers/';
  }
  if (stage === 'assets') return `/asset-studio/?campaign_delivery_id=${id}`;
  if (stage === 'presell') return `/?view=copy&campaign_delivery_id=${id}`;
  return `/?view=google-ads-create&campaign_delivery_id=${id}`;
}

function currentProgress(delivery) {
  try {
    const jobs = JSON.parse(localStorage.getItem('hub:presell-deploy-jobs:v1') || '[]');
    if (!Array.isArray(jobs)) throw new Error('Páginas inválidas');
    const batches = loadGoogleAdsCampaignBatches().batches;
    const drafts = loadGoogleAdsCampaignDrafts().drafts;
    let progress = deliveryProgress({ delivery, jobs, batches, drafts });
    let expansionBlocked = false;
    if (progress.batch) {
      try { expansionBlocked = cpaExpansionBlocksSharedSteps(readCpaExpansion(progress.batch.id)); }
      catch { expansionBlocked = true; }
    }
    progress = deliveryProgress({ delivery, jobs, batches, drafts, expansionBlocked });
    return { ...progress, expansionBlocked };
  } catch { return null; }
}

function render() {
  const picker = $('#deliveryPicker');
  const existingLocalPageCheckbox = $('#deliveryExistingLocalPage');
  if (existingLocalPageCheckbox) {
    existingLocalPageCheckbox.checked = active?.assetStudioRoute?.mode === 'existing_local_page';
    existingLocalPageCheckbox.disabled = !active;
  }
  picker.replaceChildren();
  if (!deliveries.length) {
    const option = new Option('Nenhuma entrega salva', '');
    picker.add(option);
    picker.disabled = true;
    $('#deliveryOfferTitle').textContent = 'Nenhuma entrega selecionada';
    $('#deliveryMeta').textContent = 'Inicie uma entrega pela ficha de uma oferta na Curadoria.';
    $('#deliveryData').replaceChildren();
    document.querySelectorAll('[data-stage-link]').forEach(link => { link.classList.remove('is-complete'); link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); });
    document.querySelectorAll('[data-stage-status]').forEach(node => { node.textContent = 'Aguardando uma oferta.'; });
    return;
  }
  picker.disabled = false;
  deliveries.forEach(record => picker.add(new Option(`${record.productName} · ${platformCode(record)} · ${new Date(record.createdAt).toLocaleString('pt-BR')}`, record.id)));
  picker.value = active?.id || deliveries[0].id;
  if (!active) active = deliveries[0];
  const curadoriaBackLink = document.querySelector('[data-curadoria-back-link]');
  if (curadoriaBackLink) curadoriaBackLink.href = !active ? '/curadoria/' : platformCode(active) === 'GM' ? '/curadoria/top-performance/' : '/curadoria/clickbank-top-offers/';
  $('#deliveryOfferTitle').textContent = active.offerName;
  $('#deliveryMeta').textContent = `${active.productName}${active.seller ? ` · ${active.seller}` : ''} · criada em ${new Date(active.createdAt).toLocaleString('pt-BR')}`;
  const commissionNode = $('#deliveryCommission');
  if (commissionNode) commissionNode.textContent = active.commissionCurrency === 'USD' && isCommissionUsd(active.commissionAmountUsd)
    ? `Comissão ${platformName(active)} recebida da Curadoria: ${formatCommissionUsd(active.commissionAmountUsd)}.`
    : `Esta entrega antiga não tem comissão ${platformName(active)} registrada.`;
  let affiliateHref = '';
  try {
    const parsed = new URL(active.affiliateUrl);
    if (['http:', 'https:'].includes(parsed.protocol)) affiliateHref = parsed.href;
  } catch {}
  const affiliate = affiliateHref
    ? `<a href="${escape(affiliateHref)}" target="_blank" rel="noopener noreferrer">${escape(active.affiliateUrl)}</a>`
    : '<span>Link de afiliado ainda não salvo na Curadoria.</span>';
  const progress = currentProgress(active);
  const duplicateDeliveries = deliveries.filter(record => platformCode(record) === platformCode(active) && String(record.productName || '').trim().toLocaleLowerCase('pt-BR') === String(active.productName || '').trim().toLocaleLowerCase('pt-BR')).length > 1;
  const summary = !progress ? 'Não foi possível conferir todos os registros locais.' : progress.ambiguous ? 'Mais de um lote vinculado: selecione e confira o lote na criação de campanhas.' : progress.complete && !duplicateDeliveries ? 'Entrega concluída: todas as etapas estão confirmadas.' : 'Entrega em andamento: há etapas pendentes ou que precisam de conferência.';
  const details = progress ? ['Curadoria: ' + (progress.curadoria ? 'confirmada' : 'pendente'), ...Object.entries(DELIVERY_SHARED_STEPS).map(([key, label]) => {
    const confirmed = progress.shared[key];
    const sitelinksHint = key === 'sitelinks' && !confirmed
      ? progress.batch?.campaigns?.length
        ? ' · aplicar a todas as ' + progress.batch.campaigns.length + ' campanhas'
        : ' · aplicar depois de salvar as campanhas'
      : '';
    return escape(label) + ': ' + (confirmed ? 'confirmada' : 'pendente' + sitelinksHint);
  })].join(' · ') : '';
  const destinationSummary = active.geoTargetingMode === 'WORLD'
    ? 'Mundo — todas as regiões, sem país específico.'
    : (active.countries || []).join(', ') || 'Nenhum país salvo.';
  const imageSearchTermMarkup = String(active.imageSearchTerm || '').trim()
    ? `<div class="data-block"><h3>Termo de pesquisa no Google Imagens</h3><p>${escape(active.imageSearchTerm)}</p></div>`
    : '';
  $('#deliveryData').innerHTML = `<div class="data-block"><h3>Andamento da entrega</h3><p>${escape(summary)}</p><p>${details}</p>${duplicateDeliveries ? '<p>Há mais de uma entrega para este produto. Confira a seleção; os registros foram preservados.</p>' : ''}</div><div class="data-block"><h3>Link de afiliado</h3><p>${affiliate}</p><p class="muted">Este link não é a URL final da Pre-Sell.</p></div><div class="data-block"><h3>Destino geográfico na Curadoria</h3><p>${escape(destinationSummary)}</p></div>${imageSearchTermMarkup}${listMarkup('Palavras-chave positivas', active.positiveKeywords)}${listMarkup('Palavras-chave negativas', active.negativeKeywords)}${assetStudioMarkup(active.assetStudioWork, progress?.assetsBypassed === true)}`;
  document.querySelectorAll('[data-stage-link]').forEach(link => {
    const stage = link.dataset.stageLink;
    const completed = Boolean(progress && (stage === 'campaign'
      ? progress.complete && !duplicateDeliveries
      : progress[stage]));
    link.classList.toggle('is-complete', completed);
    link.href = stageUrl(stage);
    link.removeAttribute('aria-disabled');
  });
  document.querySelectorAll('[data-stage-status]').forEach(node => {
    const stage = node.dataset.stageStatus;
    if (!progress) { setStageStatus(node, 'is-warning', 'Andamento indisponível; confira o armazenamento local.'); return; }
    if (stage === 'curadoria') {
      setStageStatus(node, progress.curadoria ? 'is-complete' : 'is-pending', progress.curadoria
        ? `Oferta ${platformName(active)} vinculada · destino geográfico: ${active.geoTargetingMode === 'WORLD' ? 'Mundo (todas as regiões)' : (active.countries || []).join(', ')}.`
        : `Pendência: conferir a oferta ${platformName(active)} e o destino geográfico na Curadoria.`);
      return;
    }
    if (stage === 'assets') {
      const workStatus = active.assetStudioWork?.status;
      const state = progress.assets ? 'is-complete'
        : ['failed', 'interrupted', 'completed_with_warnings'].includes(workStatus) ? 'is-warning' : 'is-pending';
      const message = progress.assetsBypassed ? 'Fluxo de página local existente selecionado; etapa Asset Studio dispensada.'
        : progress.assets ? 'Assets confirmados.'
        : workStatus === 'completed_with_warnings' ? 'Assets gerados com avisos; confira e resolva no Asset Studio.'
          : workStatus === 'failed' || workStatus === 'interrupted' ? 'Envio de assets com falha ou interrupção; confira no Asset Studio.'
            : 'Pendência: conclua o rascunho e confirme os assets no Asset Studio.';
      setStageStatus(node, state, message);
      return;
    }
    if (stage === 'presell') {
      setStageStatus(node, progress.presell ? 'is-complete' : 'is-pending', progress.presell
        ? `${progress.pages} conta(s) com página publicada ou validada.`
        : 'Pendência: publicar ou validar as páginas vinculadas a todas as contas do lote.');
      return;
    }
    const pendingShared = Object.entries(DELIVERY_SHARED_STEPS).filter(([key]) => !progress.shared[key]);
    if (progress.ambiguous) {
      setStageStatus(node, 'is-warning', 'Mais de um lote vinculado; selecione o lote correto na criação de campanhas.');
    } else if (duplicateDeliveries) {
      setStageStatus(node, 'is-warning', 'Há mais de uma entrega para este produto; confira a seleção antes de concluir.');
    } else if (progress.expansionBlocked) {
      setStageStatus(node, 'is-pending', 'Pendência: concluir e reabrir a ampliação antes de confirmar as etapas compartilhadas.');
    } else if (progress.batch && progress.batch.campaigns.length === 0) {
      setStageStatus(node, 'is-pending', 'Pendência: criar as campanhas e salvar seus IDs neste lote.');
    } else if (progress.batch && !progress.campaignSettings) {
      setStageStatus(node, 'is-pending', 'Pendência: confirmar presença e meta personalizada em cada campanha na tela de criação.');
    } else if (progress.campaign && pendingShared.length) {
      const names = pendingShared.map(([, label]) => label);
      const message = names.length === 1 && pendingShared[0][0] === 'sitelinks'
        ? 'Campanhas no lote; pendência: aplicar sitelinks a todas as ' + progress.batch.campaigns.length + ' campanhas.'
        : 'Campanhas no lote; etapas compartilhadas pendentes: ' + names.join(', ') + '.';
      setStageStatus(node, 'is-pending', message);
    } else if (!progress.campaign) {
      setStageStatus(node, 'is-pending', 'Pendência: criar e salvar as campanhas em um lote.');
    } else {
      const remaining = [
        !progress.curadoria ? 'Curadoria' : '',
        !progress.assets ? 'Asset Studio' : '',
        !progress.presell ? 'Ficha e Pre-Sell' : '',
      ].filter(Boolean);
      if (remaining.length) setStageStatus(node, 'is-pending', 'Campanhas e etapas compartilhadas confirmadas; ainda falta concluir: ' + remaining.join(', ') + '.');
      else setStageStatus(node, 'is-complete', 'Campanhas e etapas compartilhadas confirmadas; entrega concluída.');
    }
  });
}

$('#deliveryExistingLocalPage').addEventListener('change', event => {
  if (!active) return;
  try {
    active = updateCampaignDeliveryAssetStudioRoute(active.id, event.currentTarget.checked);
    deliveries = listCampaignDeliveries();
    $('#deliveryMessage').textContent = '';
    $('#deliveryMessage').classList.remove('error');
    render();
  } catch (error) {
    event.currentTarget.checked = active.assetStudioRoute?.mode === 'existing_local_page';
    $('#deliveryMessage').textContent = error?.message || 'Não foi possível salvar a opção de página local existente.';
    $('#deliveryMessage').classList.add('error');
  }
});

$('#deliveryPicker').addEventListener('change', event => {
  active = getCampaignDelivery(event.target.value);
  render();
  history.replaceState(null, '', `?delivery_id=${encodeURIComponent(active?.id || '')}`);
});

window.addEventListener('storage', event => {
  if (event.key !== CAMPAIGN_DELIVERY_STORAGE_KEY && event.key !== 'hub.google-ads.campaign-creation.batches:v1'
      && event.key !== 'hub:presell-deploy-jobs:v1' && !String(event.key || '').startsWith('hub:google-ads:cpa-expansion:v1:')) return;
  const activeId = active?.id || query.get('delivery_id') || '';
  deliveries = listCampaignDeliveries();
  active = getCampaignDelivery(activeId) || deliveries[0] || null;
  render();
});

document.querySelectorAll('[data-stage-link]').forEach(link => link.addEventListener('click', event => {
  if (!active) { event.preventDefault(); return; }
  const stage = link.dataset.stageLink;
  try {
    active = markCampaignDeliveryOpened(active.id, stage) || active;
    deliveries = listCampaignDeliveries();
    render();
  } catch {
    event.preventDefault();
    $('#deliveryMessage').textContent = 'Não foi possível salvar o acesso à etapa no armazenamento local.';
    $('#deliveryMessage').classList.add('error');
  }
}));

render();
