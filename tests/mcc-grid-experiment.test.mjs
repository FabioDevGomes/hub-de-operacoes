import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectMccGrid } from '../extensions/mcc-d0-bridge/mcc-grid-reader.mjs';
import {
  compareMccSnapshotToCsv, D0_FIELDS, HEADER_ALIASES, mapHeaders, normalizeHeader,
  parseCsvForComparison
} from '../extensions/mcc-d0-bridge/mcc-grid-domain.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('extensions/mcc-d0-bridge/manifest.json', root), 'utf8'));
const source = await readFile(new URL('extensions/mcc-d0-bridge/mcc-grid-reader.mjs', root), 'utf8');
const domainSource = await readFile(new URL('extensions/mcc-d0-bridge/mcc-grid-domain.mjs', root), 'utf8');

assert.deepEqual(manifest.permissions, ['scripting', 'activeTab']);
assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1:8765/preparador-MCC/*']);
assert.equal(D0_FIELDS.length, 18);
assert.equal(Object.keys(HEADER_ALIASES).length, 18);
assert.ok(!/\.([a-z]+__[a-z0-9_-]+|_[a-z0-9]{6,})/i.test(source), 'não usar classes CSS obfuscadas como seletor');
assert.ok(!/fetch\s*\(|indexedDB|chrome\.storage|\.click\s*\(|\.scroll(?:To|By)?\s*\(/i.test(`${source}\n${domainSource}`), 'leitura/comparação não deve enviar, gravar, clicar ou rolar');
assert.equal(normalizeHeader('Impr. (1ª posição)'), 'impr 1a posicao');

const mapped = mapHeaders(['Campanha', 'Conta', 'Impr.', 'Cliques', 'Status da campanha', 'Coluna desconhecida']);
assert.equal(mapped.mapping.campaign, 0);
assert.equal(mapped.mapping.impressions, 2);
assert.equal(mapped.mapping.campaign_state, 4);
assert.equal(mapped.unknown[0].header, 'Coluna desconhecida');
assert.deepEqual(mapHeaders(['Campaign', 'Campaign']).duplicates.campaign, [0, 1]);

class Cell {
  constructor(text, role) { this.innerText = text; this.textContent = text; this.role = role; this.visible = true; }
  getAttribute(name) { return name === 'role' ? this.role : null; }
  getClientRects() { return this.visible ? [{}] : []; }
}
class Row {
  constructor(cells, header = false, index = null) { this.cells = cells; this.header = header; this.index = index; }
  querySelectorAll(selector) {
    if (this.header) return selector.includes('columnheader') || selector.includes('th') ? this.cells : [];
    return selector.includes('gridcell') || selector.includes('td') ? this.cells : [];
  }
  getAttribute(name) { return name === 'aria-rowindex' && this.index != null ? String(this.index) : null; }
  getBoundingClientRect() { return { top: 10, bottom: 20, left: 10, right: 100 }; }
}
class Grid {
  constructor(rows, ariaRowCount = null) { this.rows = rows; this.ariaRowCount = ariaRowCount; this.scrollHeight = 100; this.clientHeight = 100; }
  querySelectorAll(selector) { return selector.includes('columnheader') || selector.includes('th') ? this.rows.find(row => row.header)?.cells || [] : this.rows; }
  getAttribute(name) { return name === 'aria-rowcount' ? this.ariaRowCount : null; }
  getRootNode() { return {}; }
}
function fixture({ headers = ['Campanha', 'Conta', 'Impr.', 'Cliques', 'Custo'], records = [['Produto A', '6497', '12', '3', 'US$ 4,50']], ariaRowCount = null, footer = null } = {}) {
  const header = new Row(headers.map(text => new Cell(text, 'columnheader')), true, 1);
  const data = records.map((row, index) => new Row(row.map(text => new Cell(text, 'gridcell')), false, index + 2));
  const grid = new Grid([header, ...data], ariaRowCount);
  const doc = {
    title: 'Campanhas - Google Ads',
    body: { innerText: footer || `${records.length ? `1 - ${records.length} de ${records.length}` : ''}` },
    defaultView: { innerHeight: 800, innerWidth: 1200 },
    querySelectorAll(selector) { return selector.includes('[role="grid"]') ? [grid] : []; }
  };
  return { doc, grid };
}

const { doc: validDoc } = fixture();
const snapshot = collectMccGrid(D0_FIELDS, HEADER_ALIASES, validDoc);
assert.equal(snapshot.ok, true);
assert.equal(snapshot.rowsCaptured, 1);
assert.equal(snapshot.totalRowsApparent, 1);
assert.equal(snapshot.fields.campaign.found, true);
assert.equal(snapshot.fields.account.found, true);
assert.equal(snapshot.fields.target_geo.found, false);
assert.equal(snapshot.fields.date.found, false);
assert.equal(snapshot.fields.currency.found, false);
assert.equal(snapshot.completeness, 'current-page-matches-apparent-total');
const { doc: mismatchDoc, grid: mismatchGrid } = fixture();
mismatchGrid.rows[1].cells[2].textContent = '12 carregado no nó';
const mismatchSnapshot = collectMccGrid(D0_FIELDS, HEADER_ALIASES, mismatchDoc);
assert.ok(mismatchSnapshot.visualTextMismatches > 0, 'diferenças entre texto visual e textContent devem ser sinalizadas');
const hiddenHeader = fixture();
hiddenHeader.grid.rows[0].cells[2].visible = false;
const hiddenSnapshot = collectMccGrid(D0_FIELDS, HEADER_ALIASES, hiddenHeader.doc);
assert.equal(hiddenSnapshot.fields.impressions.found, false);
assert.equal(hiddenSnapshot.fields.impressions.hidden, true);
const genericStatus = fixture({ headers: ['Campanha', 'Conta', 'Status', 'Impr.', 'Cliques', 'Custo'], records: [['Produto A', '6497', 'Eligible', '12', '3', 'US$ 4,50']] });
const statusSnapshot = collectMccGrid(D0_FIELDS, HEADER_ALIASES, genericStatus.doc);
assert.equal(statusSnapshot.fields.status.found, true);
assert.equal(statusSnapshot.fields.status.ambiguous, true, 'Status genérico não pode ser tratado silenciosamente como status de qualificação');

const virtual = fixture({ records: [['Produto A', '6497', '12', '3', 'US$ 4,50']], ariaRowCount: 120, footer: '1 - 60 de 120' });
const virtualSnapshot = collectMccGrid(D0_FIELDS, HEADER_ALIASES, virtual.doc);
assert.equal(virtualSnapshot.virtualized, true, 'não deve chamar a prévia parcial de completa');
assert.equal(virtualSnapshot.totalRowsApparent, 120);
assert.equal(virtualSnapshot.completeness, 'partial-or-virtualized');

const unexpected = collectMccGrid(D0_FIELDS, HEADER_ALIASES, { querySelectorAll: () => [], body: { innerText: '' } });
assert.equal(unexpected.ok, false, 'DOM inesperado deve falhar sem selecionar outra área');
const ambiguousDoc = { ...validDoc, querySelectorAll(selector) { return selector.includes('[role="grid"]') ? [validDoc.querySelectorAll(selector)[0], validDoc.querySelectorAll(selector)[0]] : []; } };
assert.equal(collectMccGrid(D0_FIELDS, HEADER_ALIASES, ambiguousDoc).ok, false, 'grades igualmente prováveis devem falhar sem misturar');

const csvText = 'Campaign,Account,Impr.,Clicks,Cost\r\n"Produto A",6497,0,3,"US$ 4.50"\r\nTotal,,,,\r\n';
const csv = parseCsvForComparison(csvText);
assert.equal(csv.records.length, 1, 'linha agregada Total deve ser ignorada');
assert.equal(csv.mapping.impressions, 2);
assert.equal(csv.records[0].campaign, 'Produto A');

const comparisonSnapshot = {
  ...snapshot,
  fields: {
    ...snapshot.fields,
    impressions: { found: true }, clicks: { found: true }, cost: { found: true }
  },
  records: [{ campaign: 'Produto A', account: '6497', impressions: '—', clicks: '3', cost: 'US$ 4,50' }]
};
const report = compareMccSnapshotToCsv(comparisonSnapshot, csvText);
assert.equal(report.screenUniqueCampaigns, 1);
assert.equal(report.csvUniqueCampaigns, 1);
assert.equal(report.absentZeroDifferences, 1, 'ausente deve ser distinguido de zero explícito');
assert.ok(report.divergences.some(item => item.field === 'impressions'));
assert.ok(!report.divergences.some(item => item.field === 'cost'), 'formatações numéricas locais diferentes devem normalizar para o mesmo valor');
assert.equal(report.dateComparison, 'nao_comparavel_por_campanha');

const duplicatedScreen = {
  ...comparisonSnapshot,
  records: [...comparisonSnapshot.records, { ...comparisonSnapshot.records[0] }]
};
const duplicatedScreenReport = compareMccSnapshotToCsv(duplicatedScreen, csvText);
assert.deepEqual(duplicatedScreenReport.duplicateScreen, ['Produto A']);

const duplicateCsv = parseCsvForComparison('Campaign,Impr.\nProduto A,1\nProduto A,2\n');
assert.equal(duplicateCsv.byCampaign.get('Produto A').length, 2, 'duplicidade deve ser preservada para ser sinalizada');
const duplicateReport = compareMccSnapshotToCsv(comparisonSnapshot, 'Campaign,Impr.\nProduto A,1\nProduto A,2\n');
assert.deepEqual(duplicateReport.duplicateCsv, ['Produto A']);

console.log('experimento de grade MCC: mapeamento, campos ausentes, paginação/virtualização, duplicidade, ausente×zero, comparação CSV e falha segura ok');
