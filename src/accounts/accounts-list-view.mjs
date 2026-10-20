import {buildAccountDirectory, normalizeAccountDirectoryId} from './accounts-list-domain.mjs?v=2';
import {createAccountDirectoryEmailStorage, createAccountDirectoryManualAccountsStorage, createAccountDirectoryPaymentProfileStorage, createAccountDirectoryStatusStorage} from './accounts-list-storage.mjs?v=4';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export const accountsListTemplate = `<section class="account-directory-status-kpis" aria-label="Resumo do status das contas">
  <article class="account-directory-status-kpi is-active"><span>Contas ativas</span><strong id="accountDirectoryActiveCount" aria-live="polite">0</strong></article>
  <article class="account-directory-status-kpi is-suspended"><span>Contas suspensas</span><strong id="accountDirectorySuspendedCount" aria-live="polite">0</strong></article>
</section>
<div class="card panel account-directory-panel">
  <div class="panel-head"><div><h2>Contas disponíveis</h2><p>A data de início mostra a primeira data encontrada no histórico de capturas.</p></div><div class="account-directory-head-actions"><span id="accountDirectoryCount" class="tag"></span><button id="accountDirectoryAddButton" type="button" class="account-directory-add-button" data-account-create-open aria-haspopup="dialog" aria-controls="accountDirectoryManualAccountDialog">Adicionar conta</button></div></div>
  <div class="table-wrap"><table class="account-directory-table"><thead><tr><th scope="col">Conta</th><th scope="col">E-mail</th><th scope="col">ID de perfil de pagamento</th><th scope="col">MCC</th><th scope="col" title="Primeira data encontrada no histórico de capturas">Data de início</th><th scope="col">Status</th></tr></thead><tbody id="accountDirectoryBody"></tbody></table></div>
</div>
<dialog id="accountDirectoryStatusDialog" class="account-directory-status-dialog" aria-labelledby="accountDirectoryStatusTitle" aria-describedby="accountDirectoryStatusDescription">
  <header class="account-directory-status-head"><div><span class="account-directory-status-kicker">STATUS DA CONTA</span><h2 id="accountDirectoryStatusTitle">Situação da conta</h2><p id="accountDirectoryStatusDescription">Selecione se esta conta está ativa ou suspensa.</p></div><button type="button" class="account-directory-status-close" aria-label="Fechar" data-account-status-close>×</button></header>
  <div class="account-directory-status-body"><strong id="accountDirectoryStatusAccount"></strong><p id="accountDirectoryStatusError" class="account-directory-status-error" role="alert" aria-live="assertive"></p><div class="account-directory-status-actions"><button type="button" class="account-directory-status-choice is-active" data-account-status-choice="active">Ativa</button><button type="button" class="account-directory-status-choice is-suspended" data-account-status-choice="suspended">Suspensa</button></div></div>
</dialog>`;

export const accountsListEmailDialogTemplate = `<dialog id="accountDirectoryEmailDialog" class="account-directory-status-dialog account-directory-email-dialog" aria-labelledby="accountDirectoryEmailTitle" aria-describedby="accountDirectoryEmailDescription">
  <header class="account-directory-status-head"><div><span class="account-directory-status-kicker">E-MAIL DA CONTA</span><h2 id="accountDirectoryEmailTitle">Cadastrar e-mail</h2><p id="accountDirectoryEmailDescription">O e-mail é uma anotação manual salva somente neste navegador.</p></div><button type="button" class="account-directory-status-close" aria-label="Fechar" data-account-email-close>×</button></header>
  <form id="accountDirectoryEmailForm" class="account-directory-email-form">
    <div class="account-directory-status-body"><strong id="accountDirectoryEmailAccount"></strong><label class="account-directory-email-label" for="accountDirectoryEmailInput">E-mail</label><input id="accountDirectoryEmailInput" class="account-directory-email-input" type="email" name="email" maxlength="254" autocomplete="off" placeholder="nome@dominio.com" required><p id="accountDirectoryEmailError" class="account-directory-status-error" role="alert" aria-live="assertive"></p><div class="account-directory-email-actions"><button type="button" class="account-directory-email-cancel" data-account-email-cancel>Cancelar</button><button type="submit" class="account-directory-status-choice is-active">Salvar e-mail</button></div></div>
  </form>
</dialog>`;

export const accountsListPaymentProfileDialogTemplate = `<dialog id="accountDirectoryPaymentProfileDialog" class="account-directory-status-dialog account-directory-payment-profile-dialog" aria-labelledby="accountDirectoryPaymentProfileTitle" aria-describedby="accountDirectoryPaymentProfileDescription">
  <header class="account-directory-status-head"><div><span class="account-directory-status-kicker">PERFIL DE PAGAMENTO</span><h2 id="accountDirectoryPaymentProfileTitle">Cadastrar ID de perfil de pagamento</h2><p id="accountDirectoryPaymentProfileDescription">O ID é uma anotação manual salva somente neste navegador.</p></div><button type="button" class="account-directory-status-close" aria-label="Fechar" data-account-payment-profile-close>×</button></header>
  <form id="accountDirectoryPaymentProfileForm" class="account-directory-payment-profile-form">
    <div class="account-directory-status-body"><strong id="accountDirectoryPaymentProfileAccount"></strong><label class="account-directory-email-label" for="accountDirectoryPaymentProfileInput">ID de perfil de pagamento</label><input id="accountDirectoryPaymentProfileInput" class="account-directory-payment-profile-input" type="text" name="payment-profile-id" maxlength="128" autocomplete="off" placeholder="Informe o ID do perfil" required><p id="accountDirectoryPaymentProfileError" class="account-directory-status-error" role="alert" aria-live="assertive"></p><div class="account-directory-payment-profile-actions"><button type="button" class="account-directory-email-cancel" data-account-payment-profile-cancel>Cancelar</button><button type="submit" class="account-directory-status-choice is-active">Salvar ID</button></div></div>
  </form>
</dialog>`;

export const accountsListManualAccountDialogTemplate = `<dialog id="accountDirectoryManualAccountDialog" class="account-directory-status-dialog account-directory-manual-account-dialog" aria-labelledby="accountDirectoryManualAccountTitle" aria-describedby="accountDirectoryManualAccountDescription">
  <header class="account-directory-status-head"><div><span class="account-directory-status-kicker">NOVA CONTA</span><h2 id="accountDirectoryManualAccountTitle">Adicionar conta</h2><p id="accountDirectoryManualAccountDescription">Cadastre o ID completo. MCC e data de início serão preenchidos quando houver dados de captura.</p></div><button type="button" class="account-directory-status-close" aria-label="Fechar" data-account-create-close>×</button></header>
  <form id="accountDirectoryManualAccountForm" class="account-directory-manual-account-form">
    <div class="account-directory-status-body"><label class="account-directory-field-label" for="accountDirectoryManualAccountInput">ID completo da conta do Google Ads</label><input id="accountDirectoryManualAccountInput" class="account-directory-account-input" type="text" name="account" inputmode="numeric" maxlength="12" autocomplete="off" placeholder="123-456-7890" required><p id="accountDirectoryManualAccountError" class="account-directory-status-error" role="alert" aria-live="assertive"></p><div class="account-directory-account-actions"><button type="button" class="account-directory-email-cancel" data-account-create-cancel>Cancelar</button><button type="submit" class="account-directory-status-choice is-active">Adicionar conta</button></div></div>
  </form>
</dialog>`;

const statusLabel = status => status === 'active' ? 'Ativa' : status === 'suspended' ? 'Suspensa' : 'Não definido';

export function mount({root, getSnapshot, format, storage}) {
  root.innerHTML = accountsListTemplate + accountsListEmailDialogTemplate + accountsListPaymentProfileDialogTemplate + accountsListManualAccountDialogTemplate;
  const by = id => root.querySelector('#' + id);
  const statusStorage = createAccountDirectoryStatusStorage(storage);
  const emailStorage = createAccountDirectoryEmailStorage(storage);
  const paymentProfileStorage = createAccountDirectoryPaymentProfileStorage(storage);
  const manualAccountStorage = createAccountDirectoryManualAccountsStorage(storage);
  const dialog = by('accountDirectoryStatusDialog');
  const emailDialog = by('accountDirectoryEmailDialog');
  const paymentProfileDialog = by('accountDirectoryPaymentProfileDialog');
  const manualAccountDialog = by('accountDirectoryManualAccountDialog');
  let selectedAccount = null;
  let selectedEmailAccount = null;
  let selectedPaymentProfileAccount = null;

  function closeStatusDialog() {
    if (dialog.open) dialog.close();
    selectedAccount = null;
  }

  function openStatusDialog(account) {
    selectedAccount = account;
    by('accountDirectoryStatusAccount').textContent = `Conta ${account}`;
    by('accountDirectoryStatusError').textContent = '';
    dialog.showModal();
  }

  function closeEmailDialog() {
    if (emailDialog.open) emailDialog.close();
    selectedEmailAccount = null;
  }

  function openEmailDialog(account) {
    selectedEmailAccount = account;
    const email = emailStorage.read()[account] || '';
    by('accountDirectoryEmailAccount').textContent = `Conta ${account}`;
    by('accountDirectoryEmailTitle').textContent = email ? 'Alterar e-mail' : 'Cadastrar e-mail';
    by('accountDirectoryEmailInput').value = email;
    by('accountDirectoryEmailError').textContent = '';
    emailDialog.showModal();
    by('accountDirectoryEmailInput').focus?.({preventScroll:true});
  }

  function closePaymentProfileDialog() {
    if (paymentProfileDialog.open) paymentProfileDialog.close();
    selectedPaymentProfileAccount = null;
  }

  function openPaymentProfileDialog(account) {
    selectedPaymentProfileAccount = account;
    const id = paymentProfileStorage.read()[account] || '';
    by('accountDirectoryPaymentProfileAccount').textContent = `Conta ${account}`;
    by('accountDirectoryPaymentProfileTitle').textContent = id ? 'Alterar ID de perfil de pagamento' : 'Cadastrar ID de perfil de pagamento';
    by('accountDirectoryPaymentProfileInput').value = id;
    by('accountDirectoryPaymentProfileError').textContent = '';
    paymentProfileDialog.showModal();
    by('accountDirectoryPaymentProfileInput').focus?.({preventScroll:true});
  }

  function saveEmail(event) {
    event.preventDefault();
    if (!selectedEmailAccount) return;
    const account = selectedEmailAccount;
    try {
      emailStorage.save(account, by('accountDirectoryEmailInput').value);
    } catch (error) {
      by('accountDirectoryEmailError').textContent = error?.message || 'Não foi possível salvar o e-mail neste navegador.';
      return;
    }
    closeEmailDialog();
    render();
    const focusTarget = [...(root.querySelectorAll?.('[data-account-email-open]') || [])]
      .find(button => button.dataset.accountEmailOpen === account);
    focusTarget?.focus({preventScroll:true});
  }

  function savePaymentProfile(event) {
    event.preventDefault();
    if (!selectedPaymentProfileAccount) return;
    const account = selectedPaymentProfileAccount;
    try {
      paymentProfileStorage.save(account, by('accountDirectoryPaymentProfileInput').value);
    } catch (error) {
      by('accountDirectoryPaymentProfileError').textContent = error?.message || 'Não foi possível salvar o ID do perfil de pagamento neste navegador.';
      return;
    }
    closePaymentProfileDialog();
    render();
    const focusTarget = [...(root.querySelectorAll?.('[data-account-payment-profile-open]') || [])]
      .find(link => link.dataset.accountPaymentProfileOpen === account);
    focusTarget?.focus({preventScroll:true});
  }

  function closeManualAccountDialog() {
    if (manualAccountDialog.open) manualAccountDialog.close();
  }

  function openManualAccountDialog() {
    by('accountDirectoryManualAccountInput').value = '';
    by('accountDirectoryManualAccountError').textContent = '';
    manualAccountDialog.showModal();
    by('accountDirectoryManualAccountInput').focus?.({preventScroll:true});
  }

  function saveManualAccount(event) {
    event.preventDefault();
    const raw = by('accountDirectoryManualAccountInput').value;
    const account = normalizeAccountDirectoryId(raw);
    if (!account) {
      by('accountDirectoryManualAccountError').textContent = 'Informe o ID completo no formato 123-456-7890.';
      return;
    }
    const snapshot = getSnapshot() || {};
    const rows = buildAccountDirectory(snapshot);
    const knownAccounts = [...rows.map(row => row.account), ...Object.values(snapshot.accountIdentities || {})];
    if (knownAccounts.some(value => normalizeAccountDirectoryId(value) === account)) {
      by('accountDirectoryManualAccountError').textContent = 'Esta conta já aparece na lista.';
      return;
    }
    try {
      manualAccountStorage.add(account);
    } catch (error) {
      by('accountDirectoryManualAccountError').textContent = error?.message || 'Não foi possível adicionar a conta neste navegador.';
      return;
    }
    closeManualAccountDialog();
    render();
    const focusTarget = [...(root.querySelectorAll?.('[data-account-create-open]') || [])]
      .find(button => button.id === 'accountDirectoryAddButton');
    focusTarget?.focus({preventScroll:true});
  }

  dialog.addEventListener('close', () => { selectedAccount = null; });
  emailDialog.addEventListener('close', () => { selectedEmailAccount = null; });
  paymentProfileDialog.addEventListener('close', () => { selectedPaymentProfileAccount = null; });
  by('accountDirectoryEmailForm').addEventListener('submit', saveEmail);
  by('accountDirectoryPaymentProfileForm').addEventListener('submit', savePaymentProfile);
  by('accountDirectoryManualAccountForm').addEventListener('submit', saveManualAccount);
  root.addEventListener('click', event => {
    const target = event.target;
    const choice = target?.closest?.('[data-account-status-choice]');
    if (choice) {
      if (!selectedAccount) return;
      const account = selectedAccount;
      try {
        statusStorage.save(account, choice.dataset.accountStatusChoice);
      } catch (error) {
        by('accountDirectoryStatusError').textContent = error?.message || 'Não foi possível salvar o status neste navegador.';
        return;
      }
      closeStatusDialog();
      render();
      const focusTarget = [...(root.querySelectorAll?.('[data-account-status-open]') || [])]
        .find(button => button.dataset.accountStatusOpen === account);
      focusTarget?.focus({preventScroll:true});
      return;
    }
    const close = target?.closest?.('[data-account-status-close]');
    if (close) {
      closeStatusDialog();
      return;
    }
    const emailClose = target?.closest?.('[data-account-email-close],[data-account-email-cancel]');
    if (emailClose) {
      closeEmailDialog();
      return;
    }
    const emailOpener = target?.closest?.('[data-account-email-open]');
    if (emailOpener) {
      event.preventDefault();
      openEmailDialog(emailOpener.dataset.accountEmailOpen);
      return;
    }
    const paymentProfileClose = target?.closest?.('[data-account-payment-profile-close],[data-account-payment-profile-cancel]');
    if (paymentProfileClose) {
      closePaymentProfileDialog();
      return;
    }
    const paymentProfileOpener = target?.closest?.('[data-account-payment-profile-open]');
    if (paymentProfileOpener) {
      event.preventDefault();
      openPaymentProfileDialog(paymentProfileOpener.dataset.accountPaymentProfileOpen);
      return;
    }
    const manualAccountClose = target?.closest?.('[data-account-create-close],[data-account-create-cancel]');
    if (manualAccountClose) {
      closeManualAccountDialog();
      return;
    }
    const manualAccountOpener = target?.closest?.('[data-account-create-open]');
    if (manualAccountOpener) {
      openManualAccountDialog();
      return;
    }
    const opener = target?.closest?.('[data-account-status-open]');
    if (opener) openStatusDialog(opener.dataset.accountStatusOpen);
  });

  function render() {
    const snapshot = getSnapshot() || {};
    const rows = buildAccountDirectory({...snapshot,manualAccounts:manualAccountStorage.read()});
    const statuses = statusStorage.read();
    const emails = emailStorage.read();
    const paymentProfileIds = paymentProfileStorage.read();
    by('accountDirectoryCount').textContent = `${rows.length} conta${rows.length === 1 ? '' : 's'}`;
    by('accountDirectoryActiveCount').textContent = String(rows.filter(row => statuses[row.account] === 'active').length);
    by('accountDirectorySuspendedCount').textContent = String(rows.filter(row => statuses[row.account] === 'suspended').length);
    by('accountDirectoryBody').innerHTML = rows.length ? rows.map(row => {
      const email = emails[row.account] || '';
      const emailAction = email ? 'Editar' : 'Cadastrar';
      const paymentProfileId = paymentProfileIds[row.account] || '';
      const paymentProfileAction = paymentProfileId ? 'Editar' : 'Cadastrar';
      return `<tr><td>${esc(row.account)}</td><td class="account-directory-email-cell hub-edit-host"><span class="account-directory-email-value" title="${esc(email || 'E-mail não definido')}">${esc(email || 'Não definido')}</span><a href="#" class="hub-corner-edit" data-account-email-open="${esc(row.account)}" aria-haspopup="dialog" aria-controls="accountDirectoryEmailDialog" aria-label="${emailAction} e-mail da conta ${esc(row.account)}" title="${emailAction} e-mail da conta">${emailAction}</a></td><td class="account-directory-payment-profile-cell hub-edit-host"><span class="account-directory-payment-profile-value" title="${esc(paymentProfileId || 'ID de perfil de pagamento não definido')}">${esc(paymentProfileId || 'Não definido')}</span><a href="#" class="hub-corner-edit" data-account-payment-profile-open="${esc(row.account)}" aria-haspopup="dialog" aria-controls="accountDirectoryPaymentProfileDialog" aria-label="${paymentProfileAction} ID de perfil de pagamento da conta ${esc(row.account)}" title="${paymentProfileAction} ID de perfil de pagamento">${paymentProfileAction}</a></td><td title="${esc(row.mcc)}">${esc(row.mcc)}</td><td class="account-directory-date">${row.startDate ? esc(format.date(row.startDate)) : '—'}</td><td class="account-directory-status-cell"><button type="button" class="account-directory-status-button" data-status="${esc(statuses[row.account] || 'unset')}" data-account-status-open="${esc(row.account)}" aria-haspopup="dialog" aria-label="Alterar status da conta ${esc(row.account)}">${statusLabel(statuses[row.account])}</button></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="account-directory-empty">Nenhuma conta identificada na base atual.</td></tr>';
  }
  return {render};
}
