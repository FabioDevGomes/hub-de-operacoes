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
const popup = await readFile(new URL('extensions/mcc-d0-bridge/popup.js', root), 'utf8');
const background = await readFile(new URL('extensions/mcc-d0-bridge/background.js', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('extensions/mcc-d0-bridge/manifest.json', root), 'utf8'));

class Cell {
  constructor(text, { role = 'gridcell', ariaLabel = '', link = false, linkText = text, essfield = null } = {}) {
    this.innerText = text;
    this.textContent = text;
    this.role = role;
    this.ariaLabel = ariaLabel;
    this.link = link;
    this.linkText = linkText;
    this.essfield = essfield;
  }
  getAttribute(name) {
    if (name === 'role') return this.role;
    if (name === 'aria-label') return this.ariaLabel || null;
    if (name === 'essfield') return this.essfield;
    return null;
  }
  getClientRects() { return [{}]; }
  querySelectorAll(selector) {
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
  ['Oferta Zero', '7527', 'Qualificada', '0', '0', '0.00', '—', '0%', '—', 'US$ 45.00/day', 'Maximizar conversões', 'US$ 0.00'],
  ['Oferta Ativa', '7527', 'Qualificada', '1,234', '10', '0.00', 'US$ 1.25', '75%', '20%', 'US$ 45.00/day', 'Maximizar conversões', 'US$ 12.50']
];

function makeDocument({ values = rowValues, footer = '1 - ' + rowValues.length + ' de ' + rowValues.length, dateRange = 'Sep 23, 2026 – Sep 23, 2026', linkedColumns = [0], leadingCell = true, leadingCellCounts = null, leadingCellLink = false, leadingCellText = '' } = {}) {
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
    valuesRow.forEach((value, column) => cells.push(new Cell(value, { role: 'gridcell', link: linkedColumns.includes(column) })));
    return new Row(cells, false, index + 2);
  });
  const grid = new Grid([header, ...rows]);
  const dateControl = new Cell(dateRange, { role: 'button', ariaLabel: 'Custom date range' });
  const doc = {
    title: 'Campanhas - Google Ads',
    documentElement: { lang: 'en-US' },
    defaultView: { innerHeight: 900, innerWidth: 1200, navigator: { language: 'en-US' } },
    body: { innerText: footer },
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
assert.equal(snapshot.reportDate.value, '2026-09-23', 'aceita apenas um dia explícito no filtro da MCC');
assert.equal(snapshot.fields.abs_top_share.found, true, 'resolve help_outline usando o nome acessível do cabeçalho');
assert.equal(snapshot.records[0].impressions, '0');
assert.equal(snapshot.records[0].avg_cost, '—');
assert.equal(snapshot.records[0].abs_top_share, '0%');
assert.equal(snapshot.records[1].impressions, '1,234');

const linkedAccount = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({ linkedColumns: [0, 1] }).doc);
assert.equal(linkedAccount.ok, true, linkedAccount.error || 'links em outras colunas não devem criar deslocamentos concorrentes');
assert.equal(linkedAccount.cellOffset, 1, 'usa o deslocamento estrutural consistente, não o link da Conta');
assert.equal(linkedAccount.records[0].campaign, 'Oferta Zero');
assert.equal(linkedAccount.records[0].account, '7527');
assert.equal(linkedAccount.records[1].impressions, '1,234');

const variableRowWidths = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({ leadingCellCounts: [1, 2] }).doc);
assert.equal(variableRowWidths.ok, true, variableRowWidths.error || 'linhas auxiliares de larguras diferentes não devem bloquear a grade');
assert.equal(variableRowWidths.cellOffset, null, 'expõe que o deslocamento varia entre linhas');
assert.deepEqual(variableRowWidths.cellOffsets, [1, 2]);
assert.equal(variableRowWidths.records[0].campaign, 'Oferta Zero');
assert.equal(variableRowWidths.records[1].campaign, 'Oferta Ativa');
assert.equal(variableRowWidths.records[1].account, '7527');

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
assert.equal(alignedGridWithOtherLinks.records[0].account, '7527');

// Forma observada na MCC: as células compartilham essfield com os cabeçalhos;
// o link da campanha não possui href e o texto da célula inclui controles extras.
function makeEssfieldDocument(footer = '1 - 2 de 2') {
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
      '', '', `${name}\nsettings`, 'Conta Alpha\n0001', 'Qualificada\nDetalhes da qualificação',
      index ? '1,234' : '0', index ? '10' : '0', '0.00', '—', '0%', '—',
      'US$ 45.00/day', 'Maximizar conversões', index ? 'US$ 12.50' : 'US$ 0.00'
    ];
    return new Row([
      new Cell('', { essfield:'selection' }),
      ...values.map((value, column) => new Cell(value, {
        essfield: columns[column][1],
        link: column === 2 || column === 3,
        linkText: column === 2 ? name : column === 3 ? 'Conta Alpha' : value
      }))
    ], false, index + 2);
  };
  const summary = new Row(columns.map(([, essfield]) => new Cell('Total', { essfield })), false, 4);
  const grid = new Grid([header, makeCampaignRow('Oferta Zero', 0), makeCampaignRow('Oferta Ativa', 1), summary]);
  const dateControl = new Cell('Sep 23, 2026 – Sep 23, 2026', { role:'button', ariaLabel:'Custom date range' });
  return {
    title:'Campanhas - Google Ads', documentElement:{lang:'en-US'},
    defaultView:{ innerHeight:900, innerWidth:1200, navigator:{language:'en-US'} },
    body:{ innerText:footer },
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
assert.equal(essfieldSnapshot.records[0].status, 'Qualificada', 'usa somente a primeira linha do status');
assert.equal(essfieldSnapshot.fields.status.ambiguous, false, 'primary_status identifica a qualificação');
assert.equal(validateMccD0Capture(essfieldSnapshot).ok, true, JSON.stringify(validateMccD0Capture(essfieldSnapshot).errors));
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
assert.equal(valid.capture.schema, 'mcc-d0-grid-v1', 'o contrato D0 estável permanece sem alteração');
assert.equal(valid.capture.records[0].currency, 'USD', 'extrai a moeda somente de código/símbolo explícito');
assert.equal(valid.capture.records[0].impressions, '0', 'zero permanece explícito');
assert.equal(valid.capture.records[0].avg_cost, '—', 'traço permanece ausência, não zero');

const referenceNow = new Date('2026-09-24T15:00:00.000Z');
assert.equal(expectedMccD1Date(referenceNow), '2026-09-23', 'ontem é calculado no fuso operacional, não em UTC');
assert.equal(expectedMccD1Date(new Date('2026-09-24T02:30:00.000Z')), '2026-09-22', 'a virada de dia respeita America/Sao_Paulo perto da meia-noite UTC');
const d1Snapshot = collectMccGrid(D0_FIELDS, HEADER_ALIASES, makeDocument({ dateRange:'Sep 23, 2026' }).doc);
const validD1 = validateMccD1Capture(d1Snapshot, { now:referenceNow });
assert.equal(validD1.ok, true, JSON.stringify(validD1.errors));
assert.equal(validD1.capture.schema, 'mcc-d1-grid-v1');
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
vm.runInContext(html.slice(parserStart, parserEnd) + '\nglobalThis.__gridAdapter = decodeMccGridCapture; globalThis.__parseSource = parseSource;', parserContext);
const decodedGrid = await parserContext.__gridAdapter(valid.capture);
const parsedGrid = parserContext.__parseSource(decodedGrid, 'd0');
assert.equal(parsedGrid.source, 'mcc_chrome_extension');
assert.deepEqual(Array.from(parsedGrid.dates), ['2026-09-23']);
assert.equal(parsedGrid.records.length, 2);
assert.equal(parsedGrid.records[0].moeda, 'USD');
assert.equal(parsedGrid.records[0].raw.impressions, '0');
assert.equal(parsedGrid.records[0].raw.avg_cost, '—');
assert.equal(parsedGrid.records[0].raw.abs_top_share, '0');
assert.equal(parsedGrid.records[0].raw.top_share, '—');
assert.equal(parsedGrid.records[1].raw.impressions, '1234');

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
assert.ok(popup.includes('Aguardando D0 para gerar a prévia.'));
assert.ok(background.includes('validateMccD0Capture(snapshot)'));
assert.ok(background.includes('validateMccD1Capture(snapshot)'));
assert.ok(background.includes('deliverD0GridToPreparador'));
assert.ok(background.includes('deliverD1GridToPreparador'));
assert.ok(background.includes("chrome.tabs.create({ url: PREPARADOR_URL, active: false })"), 'mantém o popup aberto para mostrar erros enquanto o Preparador recebe a captura');
assert.ok(background.indexOf("if (!execution?.result?.ok)") < background.indexOf("chrome.tabs.update(tab.id, { active: true })"), 'só foca o Preparador depois do aceite da captura');
assert.deepEqual(manifest.permissions, ['scripting','activeTab']);
assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1:8765/preparador-MCC/*']);
const receiverStart = html.indexOf('window.__hubReceiveMccD0Grid = async capture =>');
const receiverEnd = html.indexOf("q('#apply-manifest').addEventListener", receiverStart);
assert.ok(receiverStart >= 0 && receiverEnd > receiverStart);
const receiverSource = html.slice(receiverStart, receiverEnd);
assert.ok(receiverSource.includes("installParsedSource('d0', parsed)"));
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
    return { ok:true, campaignCount:capture.campaignCount, previewReady:false, waitingForD0:true };
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
assert.equal(forwardedD1.waitingForD0, true);
assert.equal(captureReceivedInMain, validD1.capture, 'a ponte entrega o contrato D−1 ao receptor D−1');

const previous = new Map(['location','window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let receivedCapture = null;
let receivedD1Capture = null;
Object.assign(globalThis, {
  location: { origin:'http://127.0.0.1:8765', pathname:'/preparador-MCC/' },
  window: {
    async __hubReceiveMccD0Grid(capture) { receivedCapture = capture; return {ok:true,campaignCount:capture.campaignCount,previewReady:true}; },
    async __hubReceiveMccD1Grid(capture) { receivedD1Capture = capture; return {ok:true,campaignCount:capture.campaignCount,previewReady:false,waitingForD0:true}; }
  }
});
try {
  const delivered = await deliverD0GridToPreparador(valid.capture);
  assert.equal(delivered.ok, true);
  assert.equal(receivedCapture.source, 'mcc_chrome_extension');
  assert.equal(delivered.campaignCount, 2);
  const deliveredD1 = await deliverD1GridToPreparador(validD1.capture);
  assert.equal(deliveredD1.ok, true);
  assert.equal(deliveredD1.waitingForD0, true);
  assert.equal(receivedD1Capture.schema, 'mcc-d1-grid-v1');
} finally {
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

console.log('captura MCC estrutural D0/D−1, completude, data operacional, zero×ausência, ponte e ordenação visual ok');
