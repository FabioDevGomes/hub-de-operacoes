import {loadGoogleAdsAccountsCache} from '../google-ads/google-ads-accounts-cache.mjs?v=2';
import {normalizeAccountDomain, normalizeCustomerId, suggestedLegacyAccountDomain} from './account-domains-domain.mjs?v=1';
import {ACCOUNT_DOMAIN_ASSOCIATIONS_KEY, ACCOUNT_DOMAIN_ASSOCIATIONS_UPDATED_EVENT, readAccountDomainAssociations, saveAccountDomainAssociation} from './account-domains-storage.mjs?v=1';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const formatCustomerId = value => { const id = normalizeCustomerId(value); return id ? `${id.slice(0,3)}-${id.slice(3,6)}-${id.slice(6)}` : String(value || ''); };
const formatDate = value => { const date = new Date(value || ''); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', {dateStyle:'short', timeStyle:'short'}).format(date) : 'Data não informada'; };

async function fetchDomainPortfolio(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('O servidor local do Hub não está disponível.');
  let response;
  try { response = await fetchImpl('/api/hostinger/domain-portfolio', {method:'GET', cache:'no-store', credentials:'same-origin', headers:{Accept:'application/json'}}); }
  catch { throw new Error('Não foi possível acessar a API local. Confira se o painel foi iniciado novamente.'); }
  let payload;
  try { payload = await response.json(); } catch { throw new Error('O servidor local retornou uma resposta ilegível.'); }
  if (!response.ok) throw new Error(String(payload?.error || `A Hostinger respondeu com HTTP ${response.status}.`));
  const values = Array.isArray(payload?.domains) ? payload.domains : [];
  return values.map(item => ({
    domain: normalizeAccountDomain(item?.domain),
    status: String(item?.status || '').slice(0, 40),
    createdAt: String(item?.createdAt || ''),
  })).filter(item => item.domain).sort((a,b) => (Date.parse(b.createdAt)||0) - (Date.parse(a.createdAt)||0) || a.domain.localeCompare(b.domain));
}

export function mountAccountDomains({root, storage = globalThis.localStorage, fetchImpl = globalThis.fetch} = {}) {
  if (!root) throw new Error('A área de associação de domínios não foi encontrada.');
  const state = {accounts:[], managers:[], filter:'', portfolio:[], busy:false, message:'', messageType:'info'};

  function readDirectory() {
    const directory = loadGoogleAdsAccountsCache({storage});
    state.accounts = Array.isArray(directory?.accounts?.accounts) ? directory.accounts.accounts : [];
    state.managers = Array.isArray(directory?.accounts?.managers) ? directory.accounts.managers : [];
  }

  function currentDomain(entry, account) {
    return entry ? entry.domain || '' : suggestedLegacyAccountDomain(account);
  }

  function accountRows({ignoreFilter = false} = {}) {
    const associations = readAccountDomainAssociations(storage).accounts;
    const managerById = new Map(state.managers.map(manager => [normalizeCustomerId(manager.customerId), manager]));
    const query = ignoreFilter ? '' : state.filter.trim().toLocaleLowerCase('pt-BR');
    return [...state.accounts].map(account => {
      const customerId = normalizeCustomerId(account.customerId);
      const entry = associations.find(item => item.customerId === customerId) || null;
      const manager = account.managerCustomerId ? managerById.get(normalizeCustomerId(account.managerCustomerId)) : null;
      const legacyDomain = suggestedLegacyAccountDomain(account);
      return {account, customerId, entry, manager, legacyDomain, domain:currentDomain(entry, account)};
    }).filter(row => row.customerId && (!query || `${row.account.name} ${row.customerId} ${row.manager?.name || ''} ${row.domain}`.toLocaleLowerCase('pt-BR').includes(query)))
      .sort((a,b) => String(a.manager?.name || '').localeCompare(String(b.manager?.name || ''),'pt-BR',{numeric:true,sensitivity:'base'}) || String(a.account.name || '').localeCompare(String(b.account.name || ''),'pt-BR',{numeric:true,sensitivity:'base'}));
  }

  function availablePortfolioDomains() {
    const associations = readAccountDomainAssociations(storage).accounts;
    const occupied = new Set(associations.map(item => item.domain).filter(Boolean));
    for (const account of state.accounts) {
      const entry = associations.find(item => item.customerId === normalizeCustomerId(account.customerId));
      const legacy = !entry ? suggestedLegacyAccountDomain(account) : '';
      if (legacy) occupied.add(legacy);
    }
    return state.portfolio.filter(item => !occupied.has(item.domain));
  }

  function accountOptions() {
    const rows = accountRows({ignoreFilter:true});
    const byManager = new Map();
    for (const row of rows) {
      const key = row.account.managerCustomerId ? normalizeCustomerId(row.account.managerCustomerId) : 'direct';
      const group = byManager.get(key) || {label:row.manager?.name || 'Conta direta', accounts:[]};
      group.accounts.push(row); byManager.set(key, group);
    }
    return [...byManager.values()].map(group => `<optgroup label="${esc(group.label)}">${group.accounts.map(row => `<option value="${esc(row.customerId)}">${esc(row.account.name || 'Conta Google Ads')} · ${formatCustomerId(row.customerId)}</option>`).join('')}</optgroup>`).join('');
  }

  function renderRows() {
    const rows = accountRows();
    if (!state.accounts.length) return '<div class="account-domains-empty">Nenhuma lista local de contas foi encontrada. Atualize a lista na tela Google Ads API; essa ação não consulta a API automaticamente.</div>';
    if (!rows.length) return '<div class="account-domains-empty">Nenhuma conta corresponde à busca.</div>';
    return `<div class="account-domains-table-wrap"><table class="account-domains-table"><thead><tr><th>MCC</th><th>Conta Google Ads</th><th>Domínio associado</th><th>Estado</th><th></th></tr></thead><tbody>${rows.map(row => {
      const status = row.entry ? (row.entry.domain ? 'Associação salva' : 'Sem domínio definido') : row.legacyDomain ? 'Sugestão do nome atual' : 'Sem associação';
      const statusClass = row.entry?.domain ? 'is-associated' : row.legacyDomain && !row.entry ? 'is-legacy' : '';
      const history = row.entry?.history?.length ? `<details class="account-domains-history"><summary>Histórico (${row.entry.history.length})</summary><ul>${[...row.entry.history].reverse().map(item => `<li><strong>${esc(item.domain)}</strong><span>${item.source === 'legacy-name' ? 'Detectado no nome anterior' : 'Associação anterior'} · ${esc(formatDate(item.endedAtUtc))}</span></li>`).join('')}</ul></details>` : '';
      return `<tr data-account-domain-row="${esc(row.customerId)}"><td>${esc(row.manager?.name || (row.account.managerCustomerId ? 'MCC não identificada' : 'Direta'))}${row.account.managerCustomerId ? `<small>${formatCustomerId(row.account.managerCustomerId)}</small>` : ''}</td><td><strong>${esc(row.account.name || 'Conta Google Ads')}</strong><small>${formatCustomerId(row.customerId)}</small></td><td><input class="input account-domains-input" data-domain-value type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="exemplo.com" value="${esc(row.domain)}" aria-label="Domínio da conta ${esc(row.account.name || row.customerId)}"></td><td><span class="account-domains-status ${statusClass}">${status}</span>${history}</td><td><button type="button" class="btn" data-save-account-domain="${esc(row.customerId)}">Salvar</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function renderDialog() {
    const domains = availablePortfolioDomains();
    const accountOptionsHtml = accountOptions();
    const noDomains = !domains.length;
    return `<dialog class="account-domains-dialog" data-domain-dialog aria-labelledby="accountDomainsDialogTitle"><form method="dialog" class="account-domains-dialog-head"><div><span class="account-domains-kicker">PORTFÓLIO HOSTINGER</span><h2 id="accountDomainsDialogTitle">Associar domínio a uma conta</h2><p>O Hub encontrou ${state.portfolio.length} domínio(s), dos quais ${domains.length} ainda não têm uma associação ativa. Os mais recentes aparecem primeiro.</p></div><button type="submit" class="btn" aria-label="Fechar">×</button></form><div class="account-domains-dialog-body">${noDomains ? '<p class="account-domains-empty">Não há domínios sem associação ativa no portfólio. Você ainda pode cadastrar ou trocar um domínio diretamente na lista de contas.</p>' : `<label>Domínio no portfólio<select class="input" data-portfolio-domain>${domains.map((item,index) => `<option value="${esc(item.domain)}" ${index===0?'selected':''}>${esc(item.domain)} · ${item.createdAt ? `criado em ${esc(formatDate(item.createdAt))}` : 'data indisponível'}${item.status ? ` · ${esc(item.status)}` : ''}</option>`).join('')}</select></label><label>Conta Google Ads<select class="input" data-portfolio-account><option value="">Selecione a conta</option>${accountOptionsHtml}</select></label><p class="account-domains-modal-note">A consulta apenas identifica domínios no portfólio Hostinger. Ela não compra nem associa nada até você selecionar a conta e clicar em Associar domínio.</p>`}<p class="account-domains-feedback" data-dialog-feedback role="status" aria-live="polite"></p><div class="account-domains-dialog-actions"><button type="button" class="btn" data-close-domain-dialog>Cancelar</button><button type="button" class="btn primary" data-link-portfolio-domain ${noDomains || !state.accounts.length ? 'disabled' : ''}>Associar domínio</button></div></div></dialog>`;
  }

  function render() {
    readDirectory();
    const rows = renderRows();
    root.innerHTML = `<main class="account-domains-page"><header class="account-domains-header"><div><span class="account-domains-kicker">INTEGRAÇÕES</span><h2>Domínios por conta</h2><p>Defina o domínio principal de cada conta. As telas do Hub usarão essa associação; o domínio anterior fica no histórico.</p></div><button type="button" class="btn primary" data-register-domain ${state.busy?'disabled':''}>${state.busy?'Consultando Hostinger…':'Registrar novo domínio comprado recentemente'}</button></header><section class="card panel account-domains-panel"><div class="account-domains-toolbar"><div><strong>Associação de domínio e conta</strong><p>Usa o diretório de contas já salvo neste navegador. Abrir esta tela não consulta Google Ads.</p></div><label class="account-domains-search">Buscar conta<input class="input" data-account-domain-search type="search" value="${esc(state.filter)}" placeholder="Nome, MCC ou ID"></label></div>${state.message ? `<div class="account-domains-message ${state.messageType==='error'?'is-error':'is-success'}" role="status" aria-live="polite">${esc(state.message)}</div>` : ''}${rows}<p class="account-domains-footnote">Domínios sugeridos a partir do nome atual continuam funcionando até você salvar uma associação explícita. As alterações são locais a este navegador.</p></section>${renderDialog()}</main>`;
  }

  async function registerRecentlyPurchasedDomain() {
    state.busy = true; state.message = ''; render();
    try {
      state.portfolio = await fetchDomainPortfolio(fetchImpl);
      const candidates = availablePortfolioDomains();
      state.message = candidates.length
        ? `${candidates.length} domínio(s) do portfólio sem associação ativa. Escolha o domínio e a conta para vincular.`
        : 'A consulta terminou. Não há domínios do portfólio sem associação ativa.';
      state.messageType = 'success';
    } catch (error) { state.message = error.message; state.messageType = 'error'; }
    finally { state.busy = false; render(); }
    if (state.portfolio.length && availablePortfolioDomains().length) root.querySelector('[data-domain-dialog]')?.showModal();
  }

  function saveForAccount(customerId, domain) {
    const row = state.accounts.find(item => normalizeCustomerId(item.customerId) === customerId);
    if (!row) throw new Error('A conta escolhida não está mais no diretório local. Atualize a tela e tente novamente.');
    const manager = state.managers.find(item => normalizeCustomerId(item.customerId) === normalizeCustomerId(row.managerCustomerId));
    const existing = readAccountDomainAssociations(storage).accounts.find(item => item.customerId === customerId);
    return saveAccountDomainAssociation({
      customerId,
      managerCustomerId:row.managerCustomerId,
      accountName:row.name,
      managerName:manager?.name || '',
      domain,
      legacyDomain:existing ? '' : suggestedLegacyAccountDomain(row),
    }, {storage});
  }

  async function onClick(event) {
    const register = event.target.closest('[data-register-domain]');
    if (register) { await registerRecentlyPurchasedDomain(); return; }
    const save = event.target.closest('[data-save-account-domain]');
    if (save) {
      const id = normalizeCustomerId(save.dataset.saveAccountDomain), row = save.closest('[data-account-domain-row]'), input = row?.querySelector('[data-domain-value]');
      try { saveForAccount(id, input?.value || ''); state.message = 'Associação salva. As telas que usam o domínio da conta já podem reutilizar o novo valor.'; state.messageType = 'success'; render(); }
      catch (error) { state.message = error.message; state.messageType = 'error'; render(); }
      return;
    }
    if (event.target.closest('[data-close-domain-dialog]')) { root.querySelector('[data-domain-dialog]')?.close(); return; }
    if (event.target.closest('[data-link-portfolio-domain]')) {
      const dialog = root.querySelector('[data-domain-dialog]'), domain = normalizeAccountDomain(dialog?.querySelector('[data-portfolio-domain]')?.value), customerId = normalizeCustomerId(dialog?.querySelector('[data-portfolio-account]')?.value), feedback = dialog?.querySelector('[data-dialog-feedback]');
      try {
        if (!domain) throw new Error('Selecione um domínio válido do portfólio.');
        if (!customerId) throw new Error('Selecione a conta Google Ads que usará o domínio.');
        saveForAccount(customerId, domain);
        dialog?.close(); state.message = `${domain} associado à conta ${formatCustomerId(customerId)}.`; state.messageType = 'success'; render();
      } catch (error) { if (feedback) feedback.textContent = error.message; }
    }
  }

  function onInput(event) {
    if (!event.target.matches('[data-account-domain-search]')) return;
    state.filter = event.target.value; render();
    const input = root.querySelector('[data-account-domain-search]'); input?.focus(); input?.setSelectionRange(state.filter.length, state.filter.length);
  }
  function onStorage(event) { if (!event.key || event.key === ACCOUNT_DOMAIN_ASSOCIATIONS_KEY || event.key === 'hub.google-ads-account-directory:v1') { readDirectory(); render(); } }
  const onUpdated = () => render();
  const onDirectoryUpdated = () => { readDirectory(); render(); };
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  globalThis.window?.addEventListener('storage', onStorage);
  globalThis.window?.addEventListener(ACCOUNT_DOMAIN_ASSOCIATIONS_UPDATED_EVENT, onUpdated);
  globalThis.window?.addEventListener('hub:google-ads-account-directory-updated', onDirectoryUpdated);
  readDirectory(); render();
  return {render, destroy(){root.removeEventListener('click',onClick);root.removeEventListener('input',onInput);globalThis.window?.removeEventListener('storage',onStorage);globalThis.window?.removeEventListener(ACCOUNT_DOMAIN_ASSOCIATIONS_UPDATED_EVENT,onUpdated);globalThis.window?.removeEventListener('hub:google-ads-account-directory-updated',onDirectoryUpdated)}};
}
