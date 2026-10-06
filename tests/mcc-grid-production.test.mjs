import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { deliverD0GridToPreparador, deliverD1GridToPreparador } from '../extensions/mcc-d0-bridge/bridge.mjs';
import { expectedMccD1Date, validateMccD0Capture, validateMccD1Capture } from '../extensions/mcc-d0-bridge/mcc-grid-domain.mjs';
import { collectMccGrid } from '../extensions/mcc-d0-bridge/mcc-grid-reader.mjs';
import { D0_FIELDS, HEADER_ALIASES } from '../extensions/mcc-d0-bridge/mcc-grid-domain.mjs';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('dist/preparador-MCC/index.html', root), 'utf8');
assert.ok(html.includes("metaLine('MCC', managerLabel)"),'os cartões D−1 e D0 exibem o nome e o ID da MCC recebida');
const popupHtml = await readFile(new URL('extensions/mcc-d0-bridge/popup.html', root), 'utf8');
const popup = await readFile(new URL('extensions/mcc-d0-bridge/popup.js', root), 'utf8');
const background = await readFile(new URL('extensions/mcc-d0-bridge/background.js', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('extensions/mcc-d0-bridge/manifest.json', root), 'utf8'));

class Cell {
  constructor(text, { role = 'gridcell', ariaLabel = '', link = false, linkText = text, essfield = null, iconLabels = [] } = {}) {
    this.innerText = text;
    this.textContent = text;
    this.role = role;
    this.ariaLabel = ariaLabel;
    this.link = link;
    this.linkText = linkText;
    this.essfield = essfield;
    this.iconLabels = iconLabels;
  }
  getAttribute(name) {
    if (name === 'role') return this.role;
    if (name === 'aria-label') return this.ariaLabel || null;
    if (name === 'essfield') return this.essfield;
    return null;
  }
  getClientRects() { return [{}]; }
  querySelectorAll(selector) {
    if (selector.includes('[role="img"]')) return this.iconLabels.map(label => new Cell('', { role:'img', ariaLabel:label }));
    return this.link && (selector.includes('a,') || selector.includes('a[href]'))
      ? [{ innerText: this.linkText, textContent: this.linkText, getAttribute: () => null }] : [];
  }
}

class Row {
  constructor(cells, header = false, index = null) { this.cells = cells; this.header = header; this.index = index; }
  querySelectorAll(selector) {
    if (this.header) return selector.includes('columnheader') || selector.includes('th') ? this.cells : [];
    return selector.includes('gridcell') || selector.includes('td') ? this.cells : [];
  }
  getAttribute(name) { return name === 'aria-rowindex' && this.index != null ? String(this.index) : null; }
  getBoundingClientRect() { return { top: 10, bottom: 30, left: 10, right: 900 }; }
}

class Grid {
  constructor(rows) { this.rows = rows; this.scrollHeight = 300; this.clientHeight = 300; }
  querySelectorAll(selector) {
    return selector.includes('columnheader') || selector.includes('th') ? this.rows.find(row => row.header)?.cells || [] : this.rows;
  }
  getAttribute(name) { return name === 'aria-rowcount' ? null : null; }
  getRootNode() { return {}; }
}

const headers = [
  'Campanha', 'Conta', 'Status de qualificação', 'Impressions', 'Cliques', 'Conversões',
  'Custo médio', '% de impr. (1ª posição) help_outline', 'Search top IS', 'Orçamento', 'Estratégia de lance', 'Custo'
];
const rowValues = [
  ['Oferta Zero', '7527 - Conta Alpha\n111-222-3333', 'Qualificada', '0', '0', '0.00', '—', '0%', '—', 'US$ 45.00/day', 'Maximizar conversões', 'US$ 0.00'],
  ['Oferta Ativa', '7527 - Conta Alpha\n111-222-3333', 'Qualificada', '1,234', '10', '0.00', 'US$ 1.25', '75%', '20%', 'US$ 45.00/day', 'Maximizar conversões', 'US$ 12.50']
];

function makeDocument({ values = rowValues, footer = '1 - ' + rowValues.length + ' de ' + rowValues.length, dateRange = 'Sep 23, 2026 – Sep 23, 2026', linkedColumns = [0], leadingCell = true, leadingCellCounts = null, leadingCellLink = false, leadingCellText = '', managerName='MCC de teste', managerAccountId='999-888-7777' } = {}) {
  const header = new Row(headers.map((label, index) => new Cell(label, {
    role: 'columnheader',
    ariaLabel: index === 7 ? '% de impr. (1ª posição)' : ''
  })), true, 1);
  const rows = values.map((valuesRow, index) => {
    const leadingCount = leadingCellCounts?.[index] ?? (leadingCell ? 1 : 0);
    const cells = Array.from({ length: leadingCount }, (_, prefixIndex) => new Cell(
      prefixIndex === 0 ? leadingCellText : '',
      { role: 'gridcell', link: prefixIndex === 0 && leadingCellLink }
    ));
    valuesRow.forEach((value, column) => cells.push(new Cell(value, { role: 'gridcell', link: linkedColumns.includes(column), linkText:column===1 ? String(value).split('\n')[0] : value })));
    return new Row(cells, false, index + 2);
  });
  const grid = new Grid([header, ...rows]);
  const dateControl = new Cell(dateRange, { role: 'button', ariaLabel: 'Custom date range' });
  const doc = {
    title: 'Campanhas - Google Ads',
    documentElement: { lang: 'en-US' },
    defaultView: { innerHeight: 900, innerWidth: 1200, navigator: { language: 'en-US' } },
    body: { innerText: `${managerName}\n${managerAccountId}\n${footer}` },
    querySelectorAll(selector) {
      if (selector.includes('[role="grid"]')) return [grid];
      if (selector.includes('[aria-label]')) return [dateControl];
      return [];
    }
  };
  return { doc, grid };
}

const { doc } = makeDocument();
const snapshot = collectMccGrid(D0_FIELDS, HEADER_ALIASES, doc);
assert.equal(snapshot.ok, true);
assert.equal(snapshot.cellOffset, 1, 'usa o vínculo da célula Campanha para confirmar a coluna extra estrutural');
assert.equal(snapshot.rowsCaptured, 2);
assert.equal(snapshot.uniqueCampaignCount, 2);
assert.equal(snapshot.completeness, 'current-page-matches-apparent-total');
assert.equal(snapshot.campaignFilterScope,'unknown','não presume o filtro quando a MCC não mostra o resumo da visualização');
assert.equal(snapshot.reportDate.value, '2026-09-23', 'aceita apenas um dia explícito no filtro da MCC');
assert.equal(snapshot.fields.abs_top_share.found, true, 'resolve help_outline usando o nome acessível do cabeçalho');
assert.equal(snapshot.records[0].impressions, '0');
assert.equal(snapshot.records[0].avg_cost, '—');
assert.equal(snapshot.records[0].abs_top_share, '0%');
assert.equal(snapshot.records[1].impressions, '1,234');
assert.equal(collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({footer:'Total: todas as campanhas na sua visualização atual, exceto as removidas'}).doc).campaignFilterScope,'all_campaigns');
assert.equal(collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({footer:'Total: todas as campanhas ativadas na sua visualização atual'}).doc).campaignFilterScope,'active_only');
assert.equal(collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({footer:'Total: all enabled campaigns in your current view'}).doc).campaignFilterScope,'active_only');
const activeFilterCapture=validateMccD0Capture(collectMccGrid(D0_FIELDS,HEADER_ALIASES,makeDocument({footer:'1 - 2 de 2\nTotal: todas as campanhas ativadas na sua visualização atual'}).doc));
assert.equal(activeFilterCapture.ok,true,JSON.stringify(activeFilterCapture.errors));
assert.equal(activeFilterCapture.capture.campaignFilterScope,'active_only','o filtro reconhecido acompanha a captura validada até o Preparador');

const linkedAccount = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({ linkedColumns: [0, 1] }).doc);
assert.equal(linkedAccount.ok, true, linkedAccount.error || 'links em outras colunas não devem criar deslocamentos concorrentes');
assert.equal(linkedAccount.cellOffset, 1, 'usa o deslocamento estrutural consistente, não o link da Conta');
assert.equal(linkedAccount.records[0].campaign, 'Oferta Zero');
assert.equal(linkedAccount.records[0].account, '7527 - Conta Alpha');
assert.equal(linkedAccount.records[0].account_id, '111-222-3333');
const accountWithoutPrefix = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({
  values:[[rowValues[0][0], 'Conta sem prefixo\n111-222-3333', ...rowValues[0].slice(2)], rowValues[1]],
  linkedColumns:[0, 1]
}).doc);
assert.equal(accountWithoutPrefix.records[0].account,'Conta sem prefixo');
assert.equal(accountWithoutPrefix.records[0].account_id,'111-222-3333');
assert.equal(validateMccD0Capture(accountWithoutPrefix).ok,true,'o nome da conta pode não ter prefixo');
assert.equal(linkedAccount.records[1].impressions, '1,234');

const variableRowWidths = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({ leadingCellCounts: [1, 2] }).doc);
assert.equal(variableRowWidths.ok, true, variableRowWidths.error || 'linhas auxiliares de larguras diferentes não devem bloquear a grade');
assert.equal(variableRowWidths.cellOffset, null, 'expõe que o deslocamento varia entre linhas');
assert.deepEqual(variableRowWidths.cellOffsets, [1, 2]);
assert.equal(variableRowWidths.records[0].campaign, 'Oferta Zero');
assert.equal(variableRowWidths.records[1].campaign, 'Oferta Ativa');
assert.equal(variableRowWidths.records[1].account, '7527 - Conta Alpha');

const competingCampaignAlignment = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({
  leadingCellLink: true,
  leadingCellText: 'Oferta Zero'
}).doc);
assert.equal(competingCampaignAlignment.ok, false, 'bloqueia quando há dois alinhamentos de campanha semanticamente plausíveis');
assert.match(competingCampaignAlignment.error, /sem ambiguidade/i);

const alignedGridWithOtherLinks = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({
  leadingCell: false,
  linkedColumns: [0, 1]
}).doc);
assert.equal(alignedGridWithOtherLinks.ok, true, alignedGridWithOtherLinks.error || 'com cabeçalho e células alinhados, links em outras colunas são irrelevantes');
assert.equal(alignedGridWithOtherLinks.cellOffset, 0);
assert.equal(alignedGridWithOtherLinks.records[0].campaign, 'Oferta Zero');
assert.equal(alignedGridWithOtherLinks.records[0].account, '7527 - Conta Alpha');

// Forma observada na MCC: as células compartilham essfield com os cabeçalhos;
// o link da campanha não possui href e o texto da célula inclui controles extras.
function makeEssfieldDocument(footer = '1 - 2 de 2', { statuses = ['Qualificada', 'Qualificada'], states = ['Ativado', 'Ativado'] } = {}) {
  const columns = [
    ['', 'selection'], ['', 'status'], ['Campanha', 'name'], ['Conta', 'entity_owner_info.descriptive_name'],
    ['Status', 'primary_status'], ['Impr. help_outline', 'stats.impressions'], ['Cliques', 'stats.clicks'],
    ['Conversões', 'stats.conversions'], ['Custo médio', 'stats.average_cost'],
    ['% de impr. (1ª posição)', 'stats.absolute_top_impression_percentage'],
    ['% de impr. (parte sup.)', 'stats.top_impression_percentage'], ['Orçamento', 'budget_amount'],
    ['Tipo de estratégia de lances', 'bid_config.type'], ['Custo', 'stats.cost']
  ];
  const header = new Row(columns.map(([text, essfield]) => new Cell(text, { role:'columnheader', essfield })), true, 1);
  const makeCampaignRow = (name, index) => {
    const values = [
      '', '', `${name}\nsettings`, 'Conta Alpha\n111-222-3333', `${statuses[index]}\nDetalhes da qualificação`,
      index ? '1,234' : '0', index ? '10' : '0', '0.00', '—', '0%', '—',
      'US$ 45.00/day', 'Maximizar conversões', index ? 'US$ 12.50' : 'US$ 0.00'
    ];
    return new Row([
      new Cell('', { essfield:'selection' }),
      ...values.map((value, column) => new Cell(value, {
        essfield: columns[column][1],
        link: column === 2 || column === 3,
        linkText: column === 2 ? name : column === 3 ? 'Conta Alpha' : value,
        iconLabels: column === 1 ? [states[index]] : []
      }))
    ], false, index + 2);
  };
  const summary = new Row(columns.map(([, essfield]) => new Cell('Total', { essfield })), false, 4);
  const grid = new Grid([header, makeCampaignRow('Oferta Zero', 0), makeCampaignRow('Oferta Ativa', 1), summary]);
  const dateControl = new Cell('Sep 23, 2026 – Sep 23, 2026', { role:'button', ariaLabel:'Custom date range' });
  return {
    title:'Campanhas - Google Ads', documentElement:{lang:'en-US'},
    defaultView:{ innerHeight:900, innerWidth:1200, navigator:{language:'en-US'} },
    body:{ innerText:`MCC de teste\n999-888-7777\n${footer}` },
    querySelectorAll(selector) {
      if (selector.includes('[role="grid"]')) return [grid];
      if (selector.includes('[aria-label]')) return [dateControl];
      return [];
    }
  };
}
const essfieldSnapshot = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeEssfieldDocument());
assert.equal(essfieldSnapshot.ok, true, essfieldSnapshot.error);
assert.equal(essfieldSnapshot.associationMethod, 'essfield');
assert.equal(essfieldSnapshot.rowsCaptured, 2, 'linha de resumo não é campanha');
assert.equal(essfieldSnapshot.virtualized, false, 'linha de resumo não significa truncamento');
assert.equal(essfieldSnapshot.completeness, 'current-page-matches-apparent-total');
assert.equal(essfieldSnapshot.records[0].campaign, 'Oferta Zero', 'controle de edição não contamina o nome');
assert.equal(essfieldSnapshot.records[0].account, 'Conta Alpha', 'ID adicional não contamina o nome da conta');
assert.equal(essfieldSnapshot.records[0].account_id, '111-222-3333', 'o número completo é lido da célula da conta');
assert.equal(essfieldSnapshot.records[0].status, 'Qualificada', 'usa somente a primeira linha do status');
assert.equal(essfieldSnapshot.fields.status.ambiguous, false, 'primary_status identifica a qualificação');
assert.equal(validateMccD0Capture(essfieldSnapshot).ok, true, JSON.stringify(validateMccD0Capture(essfieldSnapshot).errors));
const pausedGrid = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeEssfieldDocument('1 - 2 de 2', {
  statuses:['Pausada', 'Qualificada (aprendizado)'], states:['Pausado', 'Ativado']
}));
assert.equal(pausedGrid.fields.status.ambiguous, false, 'primary_status permanece inequívoco quando inclui campanhas pausadas');
assert.equal(pausedGrid.fields.campaign_state.found, true, 'o cabeçalho operacional com ícone é identificado por essfield');
assert.equal(pausedGrid.records[0].status, 'Pausada');
assert.equal(pausedGrid.records[0].campaign_state, 'Pausado', 'o estado vem do rótulo acessível do ícone operacional');
assert.equal(pausedGrid.records[1].campaign_state, 'Ativado');
assert.equal(validateMccD0Capture(pausedGrid).ok, true, JSON.stringify(validateMccD0Capture(pausedGrid).errors));
assert.equal(validateMccD1Capture(pausedGrid, { now:new Date('2026-09-24T15:00:00Z') }).ok, true, 'a correção também permite a captura D−1');
const removedGrid = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeEssfieldDocument('1 - 2 de 2', {
  statuses:['Removida', 'Pendente'], states:['Removido', 'Ativado']
}));
assert.equal(validateMccD0Capture(removedGrid).ok, true, 'a identificação estrutural aceita outros valores legítimos da coluna Status');
assert.equal(removedGrid.records[0].campaign_state, 'Removido');
const unreadableState = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeEssfieldDocument('1 - 2 de 2', {
  statuses:['Pausada', 'Qualificada'], states:['', 'Ativado']
}));
assert.ok(validateMccD0Capture(unreadableState).errors.some(error => error.code === 'campaign_state'), 'ícone ilegível não pode transformar uma pausada em ativa');
const essfieldPartial = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeEssfieldDocument('1 - 2 de 3'));
assert.equal(essfieldPartial.completeness, 'unverified');
assert.equal(validateMccD0Capture(essfieldPartial).ok, false, 'a grade incompleta continua bloqueada');

const visibleDateButton = makeDocument({ dateRange:'Sep 23, 2026 – Sep 23, 2026' }).doc;
const visibleDateControl = visibleDateButton.querySelectorAll('[aria-label]')[0];
visibleDateControl.ariaLabel = '';
visibleDateControl.role = 'button';
const dateOnlyButtonSnapshot = collectMccGrid(D0_FIELDS, HEADER_ALIASES, visibleDateButton);
assert.equal(dateOnlyButtonSnapshot.reportDate.value, '2026-09-23', 'aceita datas explícitas no texto visível de um botão, mesmo sem aria-label descritivo');
const valid = validateMccD0Capture(snapshot);
assert.equal(valid.ok, true, JSON.stringify(valid.errors));
assert.equal(valid.capture.schema, 'mcc-d0-grid-v3', 'o contrato D0 exige o número completo da conta e a identidade da MCC');
assert.equal(valid.capture.managerAccountId,'999-888-7777','o ID da MCC é separado do número da conta cliente');
assert.equal(valid.capture.managerAccountName,'MCC de teste','o nome visível da MCC acompanha a captura');
assert.equal(valid.capture.capturedAt, snapshot.capturedAt, 'o instante lido na MCC acompanha o D0 até o Preparador');
assert.equal(valid.capture.records[0].currency, 'USD', 'extrai a moeda somente de código/símbolo explícito');
assert.equal(valid.capture.records[0].impressions, '0', 'zero permanece explícito');
assert.equal(valid.capture.records[0].avg_cost, '—', 'traço permanece ausência, não zero');
const missingAccountId = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({
  values:[[rowValues[0][0], '7527 - Conta Alpha', ...rowValues[0].slice(2)], rowValues[1]]
}).doc);
assert.ok(validateMccD0Capture(missingAccountId).errors.some(error => error.code === 'account_id'), 'a captura para se o número completo estiver ausente');
const ambiguousAccountId = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({
  values:[[rowValues[0][0], '7527 - Conta Alpha\n111-222-3333\n999-888-7777', ...rowValues[0].slice(2)], rowValues[1]]
}).doc);
assert.ok(validateMccD0Capture(ambiguousAccountId).errors.some(error => error.code === 'account_id'), 'a captura para se a célula contiver dois números de conta');
const missingManager = makeDocument().doc;
missingManager.body.innerText='Pesquise uma página ou campanha\nNotificações\n1 - 2 de 2';
assert.ok(validateMccD0Capture(collectMccGrid(D0_FIELDS,HEADER_ALIASES,missingManager)).errors.some(error=>error.code==='manager_identity'),'a captura é bloqueada quando falta o contexto MCC');
const ambiguousManager = makeDocument().doc;
ambiguousManager.body.innerText='MCC uma\n111-222-3333\nMCC outra\n222-333-4444\n1 - 2 de 2';
assert.ok(validateMccD0Capture(collectMccGrid(D0_FIELDS,HEADER_ALIASES,ambiguousManager)).errors.some(error=>error.code==='manager_identity'),'a captura é bloqueada quando há contexto MCC ambíguo');

const referenceNow = new Date('2026-09-24T15:00:00.000Z');
assert.equal(expectedMccD1Date(referenceNow), '2026-09-23', 'ontem é calculado no fuso operacional, não em UTC');
assert.equal(expectedMccD1Date(new Date('2026-09-24T02:30:00.000Z')), '2026-09-22', 'a virada de dia respeita America/Sao_Paulo perto da meia-noite UTC');
const d1Snapshot = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({ dateRange:'Sep 23, 2026' }).doc);
const validD1 = validateMccD1Capture(d1Snapshot, { now:referenceNow });
assert.equal(validD1.ok, true, JSON.stringify(validD1.errors));
assert.equal(validD1.capture.schema, 'mcc-d1-grid-v3');
assert.equal(validD1.capture.periodRole, 'd1');
assert.equal(validD1.capture.records[0].impressions, '0', 'D−1 preserva zero confirmado');
assert.equal(validD1.capture.records[0].avg_cost, '—', 'D−1 preserva ausência sem convertê-la em zero');

const wrongD1 = validateMccD1Capture(collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({ dateRange:'Sep 22, 2026' }).doc), { now:referenceNow });
assert.ok(wrongD1.errors.some(error => error.code === 'date_expected'), 'D−1 com data diferente de ontem é bloqueado');
const intervalD1 = validateMccD1Capture(collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({ dateRange:'Sep 1, 2026 – Sep 23, 2026' }).doc), { now:referenceNow });
assert.ok(intervalD1.errors.some(error => error.code === 'date'), 'intervalo MCC é bloqueado para D−1');
const relativeD1 = validateMccD1Capture(collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({ dateRange:'Yesterday' }).doc), { now:referenceNow });
assert.ok(relativeD1.errors.some(error => error.code === 'date'), 'texto relativo sem data real é bloqueado');
assert.ok(validateMccD1Capture(essfieldPartial, { now:referenceNow }).errors.some(error => error.code === 'incomplete'), 'a completude D−1 é verificada independentemente');

const partial = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({
  values: rowValues.slice(0, 1), footer: '1 - 1 de 2'
}).doc);
assert.equal(validateMccD0Capture(partial).ok, false, 'paginação parcial bloqueia o envio');

const multiDay = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({
  dateRange: 'Sep 1, 2026 – Sep 23, 2026'
}).doc);
assert.equal(multiDay.reportDate.value, null, 'intervalo de vários dias não é tratado como data D0');
assert.ok(validateMccD0Capture(multiDay).errors.some(error => error.code === 'date'));

const duplicated = {
  ...snapshot,
  rowsCaptured: 3,
  uniqueCampaignCount: 2,
  records: [...snapshot.records, { ...snapshot.records[0] }],
  duplicateCampaigns: ['Oferta Zero']
};
assert.ok(validateMccD0Capture(duplicated).errors.some(error => error.code === 'duplicates'));
assert.ok(validateMccD0Capture(duplicated).errors.some(error => error.code === 'incomplete'), 'duplicidade não esconde uma divergência real de contagem');
const duplicatesOnly = { ...duplicated, pagination: { first:1, last:3, total:3 } };
for (const validation of [
  validateMccD0Capture(duplicatesOnly),
  validateMccD1Capture(duplicatesOnly, { now:referenceNow })
]) {
  assert.equal(validation.ok, false, 'duplicidade continua bloqueando D0 e D−1');
  assert.deepEqual(validation.errors.map(error => error.code), ['duplicates'], 'contagem completa com duplicidade não é descrita como captura incompleta');
  assert.deepEqual(validation.errors[0].campaigns, ['Oferta Zero']);
}
assert.ok(validateMccD0Capture({ ...duplicatesOnly, virtualized:true }).errors.some(error => error.code === 'incomplete'), 'virtualização continua bloqueante mesmo com duplicidade');

const missingHeader = {
  ...snapshot,
  fields: { ...snapshot.fields, cost: { found:false, hidden:false, ambiguous:false } }
};
assert.ok(validateMccD0Capture(missingHeader).errors.some(error => error.code === 'required_header'));
assert.ok(validateMccD1Capture(duplicated, { now:referenceNow }).errors.some(error => error.code === 'duplicates'), 'D−1 duplicado é bloqueado');
assert.ok(validateMccD1Capture(missingHeader, { now:referenceNow }).errors.some(error => error.code === 'required_header'), 'cabeçalho D−1 obrigatório ausente é bloqueado');

const incompleteDate = { ...snapshot, reportDate: { value:null, reason:'Data não encontrada.' } };
assert.ok(validateMccD0Capture(incompleteDate).errors.some(error => error.code === 'date'));

// Testa a normalização numérica isolada do adaptador do Preparador, sem IndexedDB.
const numberStart = html.indexOf('    function mccGridNumber(');
const numberEnd = html.indexOf('    function csvCell(', numberStart);
assert.ok(numberStart >= 0 && numberEnd > numberStart);
const numberContext = vm.createContext({
  ABSENT: new Set(['', '--', '—', '-', 'n/a']),
  normalize: value => String(value ?? '').trim().toLowerCase()
});
vm.runInContext(html.slice(numberStart, numberEnd) + '\nglobalThis.__mccGridNumber = mccGridNumber;', numberContext);
const mccNumber = numberContext.__mccGridNumber;
assert.equal(mccNumber('1,234', 'en-US', 'impressions'), '1234');
assert.equal(mccNumber('1.234', 'pt-BR', 'impressions'), '1234');
assert.equal(mccNumber('US$ 1.234,50', 'pt-BR', 'cost'), '1234.5');
assert.equal(mccNumber('75%', 'en-US', 'top_share'), '75');
assert.equal(mccNumber('0', 'en-US', 'clicks'), '0');
assert.equal(mccNumber('—', 'en-US', 'avg_cost'), '—');
assert.throws(() => mccNumber('12.34', 'pt-BR', 'impressions'), /ambíguo/i);

const parserStart = html.indexOf('    const ABSENT = new Set');
const parserEnd = html.indexOf('    function uniqueRecord(', parserStart);
assert.ok(parserStart >= 0 && parserEnd > parserStart);
const parserContext = vm.createContext({ crypto:webcrypto, TextEncoder, Intl, Date });
vm.runInContext(await readFile(new URL('../src/storage/hub-database.js', import.meta.url),'utf8'), parserContext);
vm.runInContext(html.slice(parserStart, parserEnd) + '\nglobalThis.__gridAdapter = decodeMccGridCapture; globalThis.__parseSource = parseSource;', parserContext);
const decodedGrid = await parserContext.__gridAdapter(valid.capture);
const parsedGrid = parserContext.__parseSource(decodedGrid, 'd0');
assert.equal(parsedGrid.source, 'mcc_chrome_extension');
assert.deepEqual(Array.from(parsedGrid.dates), ['2026-09-23']);
assert.equal(parsedGrid.records.length, 2);
assert.equal(parsedGrid.records[0].moeda, 'USD');
assert.equal(parsedGrid.records[0].conta_id, '111-222-3333');
assert.equal(parsedGrid.records[0].raw.impressions, '0');
assert.equal(parsedGrid.records[0].raw.avg_cost, '—');
assert.equal(parsedGrid.records[0].raw.abs_top_share, '0');
assert.equal(parsedGrid.records[0].raw.top_share, '—');
assert.equal(parsedGrid.records[1].raw.impressions, '1234');

// Another MCC may have a single pending campaign and an ordinal account label.
// Keep the example synthetic; no operational account IDs or campaign names.
const otherMccDocument = makeDocument({
  values:[['04/10 - Produto Sintético 01 (MS-BB-DE) 70% - U$ 60','1ª da MCC de teste .example.shop\n444-555-6666','Pendente\nTodos os anúncios estão em análise','0','0','0,00','—','—','—','US$ 101,01/dia','CPA desejado','US$ 0,00']],
  footer:'2 filtros · 1 campanha\n1 - 1 de 1',dateRange:'04/10/2026',linkedColumns:[0,1],managerName:'MCC Nutra de teste',managerAccountId:'888-777-6666'
}).doc;
otherMccDocument.documentElement.lang='pt-BR';
const otherMccSnapshot=collectMccGrid(D0_FIELDS,HEADER_ALIASES,otherMccDocument);
const otherMccValidation=validateMccD0Capture(otherMccSnapshot);
assert.equal(otherMccValidation.ok,true,JSON.stringify(otherMccValidation.errors));
assert.equal(otherMccValidation.capture.managerAccountName,'MCC Nutra de teste');
assert.equal(otherMccValidation.capture.managerAccountId,'888-777-6666');
const otherMccParsed=parserContext.__parseSource(await parserContext.__gridAdapter(otherMccValidation.capture),'d0');
assert.equal(otherMccParsed.records.length,1);
assert.equal(otherMccParsed.records[0].conta_id,'444-555-6666');
assert.equal(otherMccParsed.records[0].status_qualificacao,'Pendente');
assert.equal(otherMccParsed.records[0].raw.budget,'101.01');
assert.equal(otherMccParsed.records[0].raw.cost,'0');
assert.equal(otherMccParsed.records[0].raw.impressions,'0');
assert.equal(otherMccParsed.records[0].raw.abs_top_share,'—');
assert.equal(otherMccParsed.records[0].raw.top_share,'—');

const percentageStart=html.indexOf('    function uniqueRecord('),percentageEnd=html.indexOf('    function percentageValidationNotApplicable(',percentageStart);
vm.runInContext(html.slice(percentageStart,percentageEnd),parserContext);
const smallD1={...otherMccParsed,role:'d1'};
const percentageMetrics=key=>parserContext.stateValue(smallD1.records[0].raw[key],parserContext.parseNumber);
const smallD1Campaigns=[{nome_campanha_exato:smallD1.records[0].nome_campanha_exato,metricas_D_menos_1:{porcentagem_impressao_primeira_posicao:percentageMetrics('abs_top_share'),porcentagem_impressao_parte_superior:percentageMetrics('top_share')}}];
const smallD1Validation=parserContext.buildPercentageValidation(smallD1,smallD1Campaigns);
assert.equal(smallD1Validation.teste_regressao_aprovado,true,'a one-campaign D−1 validates its one available campaign');
assert.equal(smallD1Validation.amostragem_quantidade_exigida,1);
assert.equal(smallD1Validation.amostragem_minima_tres_campanhas_ok,false,'do not claim to have checked three samples');
const missingSmallD1Header={...smallD1,mapping:{...smallD1.mapping}};delete missingSmallD1Header.mapping.top_share;
assert.equal(parserContext.buildPercentageValidation(missingSmallD1Header,smallD1Campaigns).teste_regressao_aprovado,false,'small MCCs still require both distinct mapped percentage columns');

// Testa a ordenação pura por valores, preservando linhas associadas à campanha.
const sortStart = html.indexOf('    function sortPreviewRows(');
const sortEnd = html.indexOf('    function renderPreviewTable(', sortStart);
assert.ok(sortStart >= 0 && sortEnd > sortStart);
const sortContext = vm.createContext({});
vm.runInContext(html.slice(sortStart, sortEnd) + '\nglobalThis.__sortPreviewRows = sortPreviewRows;', sortContext);
const sortRows = sortContext.__sortPreviewRows;
const previewRows = [
  { campanha:'Duas', impressoes:{valor:2,estado:'confirmado'}, cliques:{valor:0,estado:'zero_confirmado'}, conversoes:{valor:0,estado:'zero_confirmado'}, primeira_posicao:{valor:null,estado:'ausente'}, parte_superior:{valor:8,estado:'confirmado'}, custo:{valor:9,estado:'confirmado'}, conta:{valor:'7527',estado:'confirmado'}, status:{valor:'Ativa',estado:'confirmado'} },
  { campanha:'Dez', impressoes:{valor:10,estado:'confirmado'}, cliques:{valor:10,estado:'confirmado'}, conversoes:{valor:0,estado:'zero_confirmado'}, primeira_posicao:{valor:20,estado:'confirmado'}, parte_superior:{valor:20,estado:'confirmado'}, custo:{valor:80,estado:'confirmado'}, conta:{valor:'7527',estado:'confirmado'}, status:{valor:'Ativa',estado:'confirmado'} },
  { campanha:'Cem', impressoes:{valor:100,estado:'confirmado'}, cliques:{valor:2,estado:'confirmado'}, conversoes:{valor:1,estado:'confirmado'}, primeira_posicao:{valor:75,estado:'confirmado'}, parte_superior:{valor:75,estado:'confirmado'}, custo:{valor:120,estado:'confirmado'}, conta:{valor:'7527',estado:'confirmado'}, status:{valor:'Ativa',estado:'confirmado'} },
  { campanha:'Ausente', impressoes:{valor:null,estado:'ausente'}, cliques:{valor:null,estado:'ausente'}, conversoes:{valor:null,estado:'ausente'}, primeira_posicao:{valor:null,estado:'ausente'}, parte_superior:{valor:null,estado:'ausente'}, custo:{valor:null,estado:'ausente'}, conta:{valor:'7527',estado:'confirmado'}, status:{valor:'Ativa',estado:'confirmado'} }
];
assert.deepEqual(Array.from(sortRows(previewRows, {key:'impressions',direction:'asc'}), row => row.campanha), ['Duas','Dez','Cem','Ausente']);
assert.deepEqual(Array.from(sortRows(previewRows, {key:'impressions',direction:'desc'}), row => row.campanha), ['Cem','Dez','Duas','Ausente']);
assert.deepEqual(Array.from(sortRows(previewRows, {key:'cost',direction:'asc'}), row => row.campanha), ['Duas','Dez','Cem','Ausente']);
assert.deepEqual(Array.from(sortRows(previewRows, {key:'cost',direction:'desc'}), row => row.campanha), ['Cem','Dez','Duas','Ausente']);
assert.deepEqual(Array.from(sortRows(previewRows, {key:'clicks',direction:'asc'}), row => row.campanha), ['Duas','Cem','Dez','Ausente']);
assert.deepEqual(Array.from(sortRows(previewRows, {key:'conversions',direction:'asc'}), row => row.campanha), ['Duas','Dez','Cem','Ausente']);
assert.deepEqual(Array.from(sortRows(previewRows, {key:'abs_top_share',direction:'desc'}), row => row.campanha), ['Cem','Dez','Duas','Ausente']);
assert.deepEqual(Array.from(sortRows(previewRows, {key:'top_share',direction:'asc'}), row => row.campanha), ['Duas','Dez','Cem','Ausente']);
assert.deepEqual(Array.from(sortRows(previewRows, null), row => row.campanha), ['Duas','Dez','Cem','Ausente'], 'sem ordenação explícita, preserva a ordem original');
assert.deepEqual(previewRows.map(row => row.campanha), ['Duas','Dez','Cem','Ausente'], 'ordenação visual não altera a coleção de entrada');

assert.ok(html.includes('data-sort-key="abs_top_share"') && html.includes('data-sort-key="top_share"'));
assert.ok(html.includes('1ª posição<span class="sort-arrow"'), 'a prévia expõe uma coluna ordenável para primeira posição');
assert.ok(popup.includes("type: 'CAPTURE_AND_FORWARD_MCC_D0'"));
assert.ok(popup.includes("type: 'CAPTURE_AND_FORWARD_MCC_D1'"));
assert.ok(popupHtml.indexOf('id="capture-d1"') < popupHtml.indexOf('id="capture-d0"'), 'o botão Capturar D−1 deve aparecer antes do Capturar D0');
assert.ok(popup.includes('D−1 validado e prévia pronta. A base só muda se você clicar em “Atualizar base”.'));
assert.ok(background.includes('validateMccD0Capture(snapshot)'));
assert.ok(background.includes('validateMccD1Capture(snapshot)'));
assert.ok(background.includes('deliverD0GridToPreparador'));
assert.ok(background.includes('deliverD1GridToPreparador'));
assert.ok(background.includes("chrome.tabs.create({ url: PREPARADOR_URL, active: false })"), 'mantém o popup aberto para mostrar erros enquanto o Preparador recebe a captura');
assert.ok(background.indexOf("if (!execution?.result?.ok)") < background.indexOf("chrome.tabs.update(tab.id, { active: true })"), 'só foca o Preparador depois do aceite da captura');
assert.deepEqual(manifest.permissions, ['scripting','activeTab','clipboardWrite']);
assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1:8765/preparador-MCC/*','http://127.0.0.1:8765/curadoria/clickbank-top-offers/*']);
const receiverStart = html.indexOf('window.__hubReceiveMccD0Grid = async capture =>');
const receiverEnd = html.indexOf("q('#apply-manifest').addEventListener", receiverStart);
assert.ok(receiverStart >= 0 && receiverEnd > receiverStart);
const receiverSource = html.slice(receiverStart, receiverEnd);
assert.ok(receiverSource.includes("installParsedSource('d0', parsed, { capturedAt:capture.capturedAt })"));
assert.ok(!receiverSource.includes('applyManifestToPanel'), 'o receptor só prepara a prévia; não aplica a base');
assert.ok(receiverSource.includes("renderPreviewTable(currentResult.manifest, 'd0')"));

// A função registrada pelo Preparador vive no MAIN world. O DOM é comum aos
// dois mundos, mas o window da injeção ISOLATED não contém esse receptor.
const forwardStart = background.indexOf('async function forwardD0Grid(capture) {');
const forwardEnd = background.indexOf('async function readActiveMccGrid()', forwardStart);
assert.ok(forwardStart >= 0 && forwardEnd > forwardStart);
let injectedWorld = null;
let captureReceivedInMain = null;
const mainWindow = {
  async __hubReceiveMccD0Grid(capture) {
    captureReceivedInMain = capture;
    return { ok:true, campaignCount:capture.campaignCount, previewReady:true };
  },
  async __hubReceiveMccD1Grid(capture) {
    captureReceivedInMain = capture;
    return { ok:true, campaignCount:capture.campaignCount, previewReady:true, waitingForD0:false };
  }
};
const forwardContext = vm.createContext({
  PREPARADOR_URL:'http://127.0.0.1:8765/preparador-MCC/',
  PREPARADOR_MATCH:'http://127.0.0.1:8765/preparador-MCC/*',
  waitUntilLoaded:async () => {},
  deliverD0GridToPreparador,
  deliverD1GridToPreparador,
  chrome: {
    tabs: {
      query:async () => [{id:42}],
      update:async id => ({id}),
      create:async () => { throw new Error('A aba de teste já existe.'); }
    },
    scripting: {
      executeScript:async ({world, func, args}) => {
        injectedWorld = world || 'ISOLATED';
        const pageContext = vm.createContext({
          location:{origin:'http://127.0.0.1:8765',pathname:'/preparador-MCC/'},
          window:injectedWorld === 'MAIN' ? mainWindow : {}
        });
        const injected = vm.runInContext(`(${func.toString()})`, pageContext);
        return [{result:await injected(...args)}];
      }
    }
  }
});
vm.runInContext(background.slice(forwardStart, forwardEnd) + '\nglobalThis.__forwardD0Grid = forwardD0Grid; globalThis.__forwardD1Grid = forwardD1Grid;', forwardContext);
const forwarded = await forwardContext.__forwardD0Grid(valid.capture);
assert.equal(injectedWorld, 'MAIN', 'usa o mesmo mundo JavaScript do receptor da página');
assert.equal(forwarded.previewReady, true);
assert.equal(captureReceivedInMain, valid.capture, 'a ponte entrega a captura ao receptor real, não ao window isolado');
const forwardedD1 = await forwardContext.__forwardD1Grid(validD1.capture);
assert.equal(injectedWorld, 'MAIN', 'a entrega D−1 também usa o mundo da página');
assert.equal(forwardedD1.waitingForD0, false);
assert.equal(forwardedD1.previewReady, true);
assert.equal(captureReceivedInMain, validD1.capture, 'a ponte entrega o contrato D−1 ao receptor D−1');

const previous = new Map(['location','window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let receivedCapture = null;
let receivedD1Capture = null;
Object.assign(globalThis, {
  location: { origin:'http://127.0.0.1:8765', pathname:'/preparador-MCC/' },
  window: {
    async __hubReceiveMccD0Grid(capture) { receivedCapture = capture; return {ok:true,campaignCount:capture.campaignCount,previewReady:true}; },
    async __hubReceiveMccD1Grid(capture) { receivedD1Capture = capture; return {ok:true,campaignCount:capture.campaignCount,previewReady:true,waitingForD0:false}; }
  }
});
try {
  const delivered = await deliverD0GridToPreparador(valid.capture);
  assert.equal(delivered.ok, true);
  assert.equal(receivedCapture.source, 'mcc_chrome_extension');
  assert.equal(delivered.campaignCount, 2);
  const deliveredD1 = await deliverD1GridToPreparador(validD1.capture);
  assert.equal(deliveredD1.ok, true);
  assert.equal(deliveredD1.waitingForD0, false);
  assert.equal(deliveredD1.previewReady, true);
  assert.equal(receivedD1Capture.schema, 'mcc-d1-grid-v3');
} finally {
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

console.log('captura MCC estrutural D0/D−1, completude, data operacional, zero×ausência, ponte e ordenação visual ok');
