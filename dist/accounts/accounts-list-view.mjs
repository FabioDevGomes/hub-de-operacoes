import {buildAccountDirectory, normalizeAccountDirectoryId, sortAccountDirectoryRows} from './accounts-list-domain.mjs?v=7';
import {createAccountDirectoryDetailsStorage, createAccountDirectoryEmailStorage, createAccountDirectoryManualAccountsStorage, createAccountDirectoryPaymentProfileStorage, createAccountDirectoryStatusStorage} from './accounts-list-storage.mjs?v=5';

export const ACCOUNT_DIRECTORY_COLUMN_WIDTHS_KEY = 'hub:account-directory:column-widths:v1';
const accountColumns = ['account','email','paymentProfile','mcc','startDate','impressions','clicks','campaignCount','conversions','status','edit'];
const accountSortableColumns = accountColumns.filter(key=>key !== 'edit');
const previousAccountColumns = ['account','email','paymentProfile','mcc','startDate','status'];
const accountColumnLabels = {account:'Conta',email:'E-mail',paymentProfile:'ID de perfil de pagamento',mcc:'MCC',startDate:'Data de início',impressions:'Impressões totais',clicks:'Cliques totais',campaignCount:'Total de campanhas',conversions:'Conversões totais',status:'Status',edit:'Editar'};
const accountColumnMinimums = {account:132,email:150,paymentProfile:190,mcc:144,startDate:124,impressions:150,clicks:130,campaignCount:158,conversions:154,status:136,edit:104};
const accountConversionsFormatter = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:6});
const accountColumnWidthMinimum = key => accountColumnMinimums[key] || 64;
const clampAccountColumnWidth = (key,value) => Math.round(Math.min(1200,Math.max(accountColumnWidthMinimum(key),value)));

const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

const accountColumnHeader = (key,label) => `<th scope="col" data-column="${key}"${key==='edit'?'': ' aria-sort="none"'}${key==='startDate'?' title="Primeira data encontrada no histórico de capturas"':key==='impressions'?' title="Soma das impressões diárias registradas no Diário de campanha para esta conta"':key==='clicks'?' title="Soma dos cliques diários registrados no Diário de campanha para esta conta"':key==='campaignCount'?' title="Quantidade de campanhas distintas registradas nesta conta"':key==='conversions'?' title="Soma dos valores registrados nas células F do Diário de campanha; não inclui vendas provisórias"':''}>${key==='edit'?esc(label):`<button type="button" class="account-directory-sort" data-account-directory-sort="${key}" aria-label="Ordenar por ${esc(label)}" aria-pressed="false"><span class="account-directory-sort-label">${esc(label)}</span><span class="account-directory-sort-arrow" aria-hidden="true">↕</span></button>`}<span class="account-directory-column-resizer" data-account-column-resizer="${key}" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Redimensionar coluna ${esc(label)}" aria-valuemin="${accountColumnWidthMinimum(key)}" aria-valuemax="1200" aria-valuenow="${accountColumnWidthMinimum(key)}" title="Arraste para ajustar a largura; use também as setas esquerda e direita"></span></th>`;

export const accountsListTemplate = `<section class="account-directory-status-kpis" aria-label="Resumo do status das contas">
  <article class="account-directory-status-kpi is-active"><span>Contas ativas</span><strong id="accountDirectoryActiveCount" aria-live="polite">0</strong></article>
  <article class="account-directory-status-kpi is-suspended"><span>Contas suspensas</span><strong id="accountDirectorySuspendedCount" aria-live="polite">0</strong></article>
</section>
<div class="card panel account-directory-panel">
  <div class="panel-head"><div><h2>Contas disponíveis</h2><p>A data de início mostra a primeira data encontrada no histórico de capturas.</p></div><div class="account-directory-head-actions"><span id="accountDirectoryCount" class="tag"></span><button id="accountDirectoryAddButton" type="button" class="btn hub-standard-action account-directory-add-button" data-account-create-open aria-haspopup="dialog" aria-controls="accountDirectoryManualAccountDialog">Adicionar conta</button></div></div>
  <p id="accountDirectoryWidthsMessage" class="account-directory-widths-message" role="status" aria-live="polite"></p>
  <div class="table-wrap"><table class="account-directory-table"><thead><tr>${accountColumns.map(key=>accountColumnHeader(key,accountColumnLabels[key])).join('')}</tr></thead><tbody id="accountDirectoryBody"></tbody></table></div>
</div>
<dialog id="accountDirectoryStatusDialog" class="account-directory-status-dialog" aria-labelledby="accountDirectoryStatusTitle" aria-describedby="accountDirectoryStatusDescription">
  <header class="account-directory-status-head"><div><span class="account-directory-status-kicker">STATUS DA CONTA</span><h2 id="accountDirectoryStatusTitle">Situação da conta</h2><p id="accountDirectoryStatusDescription">Selecione se esta conta está ativa ou suspensa.</p></div><button type="button" class="account-directory-status-close" aria-label="Fechar" data-account-status-close>×</button></header>
  <div class="account-directory-status-body"><strong id="accountDirectoryStatusAccount"></strong><p id="accountDirectoryStatusError" class="account-directory-status-error" role="alert" aria-live="assertive"></p><div class="account-directory-status-actions"><button type="button" class="account-directory-status-choice is-active" data-account-status-choice="active">Ativa</button><button type="button" class="account-directory-status-choice is-suspended" data-account-status-choice="suspended">Suspensa</button></div></div>
</dialog>`;

export const accountsListEditDialogTemplate = `<dialog id="accountDirectoryEditDialog" class="account-directory-status-dialog account-directory-edit-dialog" aria-labelledby="accountDirectoryEditTitle" aria-describedby="accountDirectoryEditDescription">
  <header class="account-directory-status-head"><div><span class="account-directory-status-kicker">DADOS DA CONTA</span><h2 id="accountDirectoryEditTitle">Editar dados</h2><p id="accountDirectoryEditDescription">Edite os campos desejados e clique em Salvar. Apenas as alterações feitas serão atualizadas.</p></div><button type="button" class="account-directory-status-close" aria-label="Fechar" data-account-edit-close>×</button></header>
  <form id="accountDirectoryEditForm" class="account-directory-edit-form" novalidate><div class="account-directory-status-body"><strong id="accountDirectoryEditAccount"></strong><div class="account-directory-edit-fields">
    <div class="account-directory-edit-field"><label class="account-directory-email-label" for="accountDirectoryEmailInput">E-mail</label><input id="accountDirectoryEmailInput" class="account-directory-email-input" type="email" name="email" maxlength="254" autocomplete="off" placeholder="nome@dominio.com"><p id="accountDirectoryEmailError" class="account-directory-status-error" role="alert" aria-live="assertive"></p></div>
    <div class="account-directory-edit-field"><label class="account-directory-email-label" for="accountDirectoryPaymentProfileInput">ID de perfil de pagamento</label><input id="accountDirectoryPaymentProfileInput" class="account-directory-payment-profile-input" type="text" name="payment-profile-id" maxlength="128" autocomplete="off" placeholder="Informe o ID do perfil"><p id="accountDirectoryPaymentProfileError" class="account-directory-status-error" role="alert" aria-live="assertive"></p></div>
  </div><p id="accountDirectoryEditError" class="account-directory-status-error" role="alert" aria-live="assertive"></p><div class="account-directory-edit-actions"><button type="submit" class="account-directory-status-choice is-active">Salvar</button></div></div></form>
</dialog>`;

export const accountsListManualAccountDialogTemplate = `<dialog id="accountDirectoryManualAccountDialog" class="account-directory-status-dialog account-directory-manual-account-dialog" aria-labelledby="accountDirectoryManualAccountTitle" aria-describedby="accountDirectoryManualAccountDescription">
  <header class="account-directory-status-head"><div><span class="account-directory-status-kicker">NOVA CONTA</span><h2 id="accountDirectoryManualAccountTitle">Adicionar conta</h2><p id="accountDirectoryManualAccountDescription">Cadastre o ID completo. MCC e data de início serão preenchidos quando houver dados de captura.</p></div><button type="button" class="account-directory-status-close" aria-label="Fechar" data-account-create-close>×</button></header>
  <form id="accountDirectoryManualAccountForm" class="account-directory-manual-account-form">
    <div class="account-directory-status-body"><label class="account-directory-field-label" for="accountDirectoryManualAccountInput">ID completo da conta do Google Ads</label><input id="accountDirectoryManualAccountInput" class="account-directory-account-input" type="text" name="account" inputmode="numeric" maxlength="12" autocomplete="off" placeholder="123-456-7890" required><p id="accountDirectoryManualAccountError" class="account-directory-status-error" role="alert" aria-live="assertive"></p><div class="account-directory-account-actions"><button type="button" class="account-directory-email-cancel" data-account-create-cancel>Cancelar</button><button type="submit" class="account-directory-status-choice is-active">Adicionar conta</button></div></div>
  </form>
</dialog>`;

const statusLabel = status => status === 'active' ? 'Ativa' : status === 'suspended' ? 'Suspensa' : 'Não definido';

export function mount({root, getSnapshot, format, storage}) {
  root.innerHTML = accountsListTemplate + accountsListEditDialogTemplate + accountsListManualAccountDialogTemplate;
  const by = id => root.querySelector('#' + id);
  const table = () => root.querySelector('.account-directory-table');
  const statusStorage = createAccountDirectoryStatusStorage(storage);
  const emailStorage = createAccountDirectoryEmailStorage(storage);
  const paymentProfileStorage = createAccountDirectoryPaymentProfileStorage(storage);
  const detailsStorage = createAccountDirectoryDetailsStorage(storage);
  const manualAccountStorage = createAccountDirectoryManualAccountsStorage(storage);
  const dialog = by('accountDirectoryStatusDialog');
  const editDialog = by('accountDirectoryEditDialog');
  const manualAccountDialog = by('accountDirectoryManualAccountDialog');
  let selectedAccount = null;
  let selectedEditAccount = null;
  let selectedEditOriginal = null;
  let sortKey = null;
  let sortDirection = 'asc';
  let columnWidths = {};
  let resizeGesture = null;
  try {
    const saved = JSON.parse(storage?.getItem?.(ACCOUNT_DIRECTORY_COLUMN_WIDTHS_KEY) || 'null');
    if (saved && typeof saved === 'object' && !Array.isArray(saved) && previousAccountColumns.every(key=>typeof saved[key] === 'number' && Number.isFinite(saved[key]) && saved[key] > 0)) {
      columnWidths = Object.fromEntries(accountColumns.map(key=>[key,clampAccountColumnWidth(key,typeof saved[key] === 'number' && Number.isFinite(saved[key]) && saved[key] > 0 ? saved[key] : accountColumnWidthMinimum(key))]));
    }
  } catch {}

  function applyColumnWidths() {
    const currentTable = table();
    if (!currentTable) return;
    if (!Object.keys(columnWidths).length) {
      currentTable.removeAttribute?.('style');
      root.querySelectorAll('.account-directory-table th[data-column],.account-directory-table td[data-column]').forEach(cell=>cell.removeAttribute?.('style'));
    } else {
      const total = accountColumns.reduce((sum,key)=>sum+(columnWidths[key]||accountColumnWidthMinimum(key)),0);
      currentTable.setAttribute('style',`table-layout:fixed;width:${total}px;min-width:${total}px`);
      root.querySelectorAll('.account-directory-table th[data-column],.account-directory-table td[data-column]').forEach(cell=>{
        const key=cell.dataset?.column;
        if (accountColumns.includes(key)) cell.setAttribute('style',`width:${columnWidths[key]||accountColumnWidthMinimum(key)}px`);
      });
    }
    const renderedWidths=new Map([...root.querySelectorAll('.account-directory-table th[data-column]')].map(header=>[header.dataset.column,header.getBoundingClientRect?.().width]));
    root.querySelectorAll('[data-account-column-resizer]').forEach(handle=>{
      const key=handle.dataset.accountColumnResizer,rendered=renderedWidths.get(key),width=columnWidths[key]||(Number.isFinite(rendered)&&rendered>0?clampAccountColumnWidth(key,rendered):accountColumnWidthMinimum(key));
      handle.setAttribute('aria-valuenow',String(width));
    });
  }

  function freezeAccountColumnWidths() {
    root.querySelectorAll('.account-directory-table th[data-column]').forEach(header=>{
      const width=header.getBoundingClientRect?.().width;
      if (Number.isFinite(width) && width > 0) columnWidths[header.dataset.column]=clampAccountColumnWidth(header.dataset.column,width);
    });
    for (const key of accountColumns) columnWidths[key] ||= accountColumnWidthMinimum(key);
  }

  function saveColumnWidths() {
    try {
      if (!storage?.setItem) throw Error('Storage unavailable');
      storage.setItem(ACCOUNT_DIRECTORY_COLUMN_WIDTHS_KEY,JSON.stringify(columnWidths));
      by('accountDirectoryWidthsMessage').textContent='';
    } catch {
      by('accountDirectoryWidthsMessage').textContent='Larguras ajustadas nesta sessão; não foi possível salvá-las no navegador.';
    }
  }

  function endColumnResize(cancel=false) {
    if (!resizeGesture) return;
    const gesture=resizeGesture;resizeGesture=null;
    root.classList?.remove('account-directory-resizing');gesture.handle.classList?.remove('is-resizing');
    if (gesture.handle.hasPointerCapture?.(gesture.pointerId)) gesture.handle.releasePointerCapture?.(gesture.pointerId);
    if (cancel || !gesture.changed) columnWidths=gesture.previous;
    else saveColumnWidths();
    applyColumnWidths();
  }

  function moveColumnResize(event) {
    const gesture=resizeGesture;
    if (!gesture || event.pointerId!==gesture.pointerId || !Number.isFinite(event.clientX)) return;
    const width=clampAccountColumnWidth(gesture.key,gesture.startWidth+event.clientX-gesture.startX);
    columnWidths[gesture.key]=width;gesture.changed=width!==gesture.startWidth;applyColumnWidths();
  }

  root.addEventListener('pointerdown',event=>{
    const handle=event.target?.closest?.('[data-account-column-resizer]');
    if (!handle || event.button!==0 || resizeGesture || !Number.isFinite(event.clientX)) return;
    event.preventDefault();event.stopPropagation();
    const previous={...columnWidths};freezeAccountColumnWidths();
    const key=handle.dataset.accountColumnResizer;
    resizeGesture={key,handle,previous,pointerId:event.pointerId,startX:event.clientX,startWidth:columnWidths[key],changed:false};
    handle.setPointerCapture?.(event.pointerId);handle.classList?.add('is-resizing');root.classList?.add('account-directory-resizing');applyColumnWidths();
  });
  root.addEventListener('pointermove',moveColumnResize);
  root.addEventListener('pointerup',event=>{if(resizeGesture?.pointerId===event.pointerId){moveColumnResize(event);endColumnResize()}});
  root.addEventListener('pointercancel',()=>endColumnResize(true));
  root.addEventListener('lostpointercapture',()=>endColumnResize(true));
  root.addEventListener('keydown',event=>{
    const handle=event.target?.closest?.('[data-account-column-resizer]');
    if (!handle) return;
    if (event.key==='Escape' && resizeGesture) {event.preventDefault();endColumnResize(true);return}
    if (event.key!=='ArrowLeft' && event.key!=='ArrowRight') return;
    event.preventDefault();event.stopPropagation();
    const key=handle.dataset.accountColumnResizer,previous={...columnWidths};freezeAccountColumnWidths();
    const current=columnWidths[key],width=clampAccountColumnWidth(key,current+(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?30:10));
    if (width===current) {columnWidths=previous;return}
    columnWidths[key]=width;applyColumnWidths();saveColumnWidths();
  });

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

  function closeEditDialog() {
    if (editDialog.open) editDialog.close();
    selectedEditAccount = null;
    selectedEditOriginal = null;
  }

  function openEditDialog(account) {
    selectedEditAccount = account;
    const email = emailStorage.read()[account] || '';
    const paymentProfileId = paymentProfileStorage.read()[account] || '';
    selectedEditOriginal = {email,paymentProfileId};
    by('accountDirectoryEditAccount').textContent = `Conta ${account}`;
    by('accountDirectoryEmailInput').value = email;
    by('accountDirectoryEmailError').textContent = '';
    by('accountDirectoryPaymentProfileInput').value = paymentProfileId;
    by('accountDirectoryPaymentProfileError').textContent = '';
    by('accountDirectoryEditError').textContent = '';
    editDialog.showModal();
    by('accountDirectoryEmailInput').focus?.({preventScroll:true});
  }

  function saveEditDetails(event) {
    event.preventDefault();
    if (!selectedEditAccount || !selectedEditOriginal) return;
    const account = selectedEditAccount;
    const email = String(by('accountDirectoryEmailInput').value ?? '').trim();
    const paymentProfileId = String(by('accountDirectoryPaymentProfileInput').value ?? '').trim();
    const patch = {};
    if (email !== selectedEditOriginal.email) patch.email = email;
    if (paymentProfileId !== selectedEditOriginal.paymentProfileId) patch.paymentProfileId = paymentProfileId;
    by('accountDirectoryEmailError').textContent = '';
    by('accountDirectoryPaymentProfileError').textContent = '';
    by('accountDirectoryEditError').textContent = '';
    if (!Object.keys(patch).length) { closeEditDialog(); return; }
    try {
      detailsStorage.save(account,patch);
    } catch (error) {
      const message = error?.message || 'Não foi possível salvar os dados desta conta neste navegador.';
      if (error?.field === 'email') by('accountDirectoryEmailError').textContent = message;
      else if (error?.field === 'paymentProfileId') by('accountDirectoryPaymentProfileError').textContent = message;
      else by('accountDirectoryEditError').textContent = message;
      return;
    }
    render();
    closeEditDialog();
    const focusTarget = [...(root.querySelectorAll?.('[data-account-edit-open]') || [])]
      .find(button => button.dataset.accountEditOpen === account);
    focusTarget?.focus?.({preventScroll:true});
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
  editDialog.addEventListener('close', () => { selectedEditAccount = null; selectedEditOriginal = null; });
  by('accountDirectoryEditForm').addEventListener('submit', saveEditDetails);
  by('accountDirectoryEmailInput').addEventListener('input', () => { by('accountDirectoryEmailError').textContent = ''; by('accountDirectoryEditError').textContent = ''; });
  by('accountDirectoryPaymentProfileInput').addEventListener('input', () => { by('accountDirectoryPaymentProfileError').textContent = ''; by('accountDirectoryEditError').textContent = ''; });
  by('accountDirectoryManualAccountForm').addEventListener('submit', saveManualAccount);
  root.addEventListener('click', event => {
    const target = event.target;
    const sortButton = target?.closest?.('[data-account-directory-sort]');
    if (sortButton) {
      const key = sortButton.dataset.accountDirectorySort;
      if (!accountSortableColumns.includes(key)) return;
      sortDirection = sortKey === key && sortDirection === 'asc' ? 'desc' : 'asc';
      sortKey = key;
      render();
      return;
    }
    const editClose = target?.closest?.('[data-account-edit-close]');
    if (editClose) {
      closeEditDialog();
      return;
    }
    const editOpener = target?.closest?.('[data-account-edit-open]');
    if (editOpener) {
      openEditDialog(editOpener.dataset.accountEditOpen);
      return;
    }
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
    endColumnResize(true);
    const snapshot = getSnapshot() || {};
    const rows = buildAccountDirectory({...snapshot,manualAccounts:manualAccountStorage.read()});
    const statuses = statusStorage.read();
    const emails = emailStorage.read();
    const paymentProfileIds = paymentProfileStorage.read();
    by('accountDirectoryCount').textContent = `${rows.length} conta${rows.length === 1 ? '' : 's'}`;
    by('accountDirectoryActiveCount').textContent = String(rows.filter(row => statuses[row.account] === 'active').length);
    by('accountDirectorySuspendedCount').textContent = String(rows.filter(row => statuses[row.account] === 'suspended').length);
    root.querySelectorAll('[data-account-directory-sort]').forEach(button=>{
      const key = button.dataset.accountDirectorySort;
      const active = key === sortKey;
      const header = button.closest?.('th[data-column]');
      header?.setAttribute?.('aria-sort',active?(sortDirection==='asc'?'ascending':'descending'):'none');
      button.setAttribute?.('aria-pressed',String(active));
      button.setAttribute?.('aria-label',`Ordenar por ${accountColumnLabels[key]}${active?(sortDirection==='asc'?' crescente':' decrescente'):''}`);
      const arrow = button.querySelector?.('.account-directory-sort-arrow');
      if (arrow) arrow.textContent = active?(sortDirection==='asc'?'↑':'↓'):'↕';
    });
    const sortedRows = sortAccountDirectoryRows(rows,sortKey,sortDirection,row=>{
      if (sortKey === 'email') return emails[row.account] || null;
      if (sortKey === 'paymentProfile') return paymentProfileIds[row.account] || null;
      if (sortKey === 'status') return statuses[row.account] ? statusLabel(statuses[row.account]) : null;
      if (sortKey === 'mcc') return row.mcc === 'Não identificada' ? null : row.mcc;
      return row[sortKey] ?? null;
    });
    by('accountDirectoryBody').innerHTML = rows.length ? sortedRows.map(row => {
      const email = emails[row.account] || '';
      const paymentProfileId = paymentProfileIds[row.account] || '';
      const impressions = row.impressions == null ? '—' : (format.num ? format.num(row.impressions) : new Intl.NumberFormat('pt-BR').format(row.impressions));
      const clicks = row.clicks == null ? '—' : (format.num ? format.num(row.clicks) : new Intl.NumberFormat('pt-BR').format(row.clicks));
      const campaignCount = format.num ? format.num(row.campaignCount) : new Intl.NumberFormat('pt-BR').format(row.campaignCount);
      const conversions = row.conversions == null ? '—' : accountConversionsFormatter.format(row.conversions);
      return `<tr><td data-column="account">${esc(row.account)}</td><td data-column="email" class="account-directory-email-cell"><span class="account-directory-email-value" title="${esc(email || 'E-mail não definido')}">${esc(email || 'Não definido')}</span></td><td data-column="paymentProfile" class="account-directory-payment-profile-cell"><span class="account-directory-payment-profile-value" title="${esc(paymentProfileId || 'ID de perfil de pagamento não definido')}">${esc(paymentProfileId || 'Não definido')}</span></td><td data-column="mcc" title="${esc(row.mcc)}">${esc(row.mcc)}</td><td data-column="startDate" class="account-directory-date">${row.startDate ? esc(format.date(row.startDate)) : '—'}</td><td data-column="impressions" class="account-directory-impressions-cell">${esc(impressions)}</td><td data-column="clicks" class="account-directory-clicks-cell">${esc(clicks)}</td><td data-column="campaignCount" class="account-directory-campaign-count-cell">${esc(campaignCount)}</td><td data-column="conversions" class="account-directory-conversions-cell">${esc(conversions)}</td><td data-column="status" class="account-directory-status-cell"><button type="button" class="account-directory-status-button" data-status="${esc(statuses[row.account] || 'unset')}" data-account-status-open="${esc(row.account)}" aria-haspopup="dialog" aria-label="Alterar status da conta ${esc(row.account)}">${statusLabel(statuses[row.account])}</button></td><td data-column="edit" class="account-directory-edit-cell"><button type="button" class="account-directory-edit-button" data-account-edit-open="${esc(row.account)}" aria-haspopup="dialog" aria-controls="accountDirectoryEditDialog" aria-label="Editar e-mail ou ID de perfil de pagamento da conta ${esc(row.account)}">Editar</button></td></tr>`;
    }).join('') : '<tr><td colspan="11" class="account-directory-empty">Nenhuma conta identificada na base atual.</td></tr>';
    applyColumnWidths();
  }
  return {render};
}
