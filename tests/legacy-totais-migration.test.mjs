import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  LEGACY_TOTAIS_SEED_SCHEMA,
  LEGACY_TOTAIS_VERSION,
  migrationAlreadyApplied,
  planLegacyTotaisMigration,
  refreshLegacyTotalsReport,
} from '../src/legacy-totais-migration.mjs';

const metric = (value, state = 'observed') => ({ value, state });
const sourceCampaign = (overrides = {}) => ({
  historical_number: 1,
  name: 'Campaign North 01',
  account_legacy: 'Conta 4',
  end_date: '2026-05-14',
  reported_roi_percent: null,
  metrics: {
    investment_brl: metric(100),
    clicks: metric(12),
    conversions: metric(2),
    commission_brl: metric(145),
  },
  ...overrides,
});
const seed = (...campaigns) => ({
  schema: LEGACY_TOTAIS_SEED_SCHEMA,
  sheet: 'totais',
  rows_analyzed: campaigns.length,
  summary_rows_ignored: 1,
  campaigns,
});
const base = () => ({
  schema: 'base_campanhas_v1',
  atualizado_em: '2026-09-25T00:00:00.000Z',
  manifesto_atual: null,
  campanhas: [],
  diario: [],
  campos_operacionais: [],
  importacoes: [],
  snapshots_campanhas: [],
  vendas_provisorias: [],
  event_log: [{ event_id: 'evt-existing', event_type: 'existing' }],
});

const legacyOnlyInput = base();
const legacyOnly = planLegacyTotaisMigration(legacyOnlyInput, seed(sourceCampaign()), { appliedAt: '2026-09-25T12:00:00.000Z' });
assert.equal(legacyOnly.status, 'ready');
assert.equal(legacyOnly.base.campanhas.length, 1);
assert.equal(legacyOnly.base.diario.length, 0, 'não cria linhas diárias artificiais');
assert.equal(legacyOnly.base.campanhas[0].status, 'historico');
assert.equal(legacyOnly.base.campanhas[0].registro_origem, 'legacy_totais');
assert.equal(legacyOnly.base.campanhas[0].nome_mcc, 'Campaign North 01');
assert.equal(legacyOnly.base.campanhas[0].legacy_totais.origin, 'legacy_totais');
assert.equal(legacyOnly.base.campanhas[0].legacy_totais.profit_brl.value, 45);
assert.equal(legacyOnly.base.campanhas[0].legacy_totais.roi_percent.value, 45);
assert.equal(legacyOnly.report.created_legacy, 1);
assert.equal(legacyOnly.report.not_linked, 1);
assert.deepEqual(legacyOnly.report.persisted_legacy_totals.derived_profit_brl, { count: 1, sum: 45 }, 'o relatório contabiliza o lucro derivado observado');
assert.equal(legacyOnly.report.summary_rows_ignored, 1);
assert.equal(legacyOnly.base.legacy_totais_migration.version, LEGACY_TOTAIS_VERSION);
assert.deepEqual(legacyOnlyInput.campanhas, [], 'o planejamento não altera a base de entrada');

const staleMigrationReport = structuredClone(legacyOnly.base);
delete staleMigrationReport.legacy_totais_migration.report.persisted_summary_reconciled;
staleMigrationReport.legacy_totais_migration.report.source_totals.derived_profit_brl = { count: 0, sum: 0 };
staleMigrationReport.legacy_totais_migration.report.persisted_legacy_totals.derived_profit_brl = { count: 0, sum: 0 };
const refreshedReport = refreshLegacyTotalsReport(staleMigrationReport);
assert.equal(refreshedReport.changed, true, 'corrige agregados desatualizados a partir dos resumos já persistidos');
assert.deepEqual(refreshedReport.base.legacy_totais_migration.report.persisted_legacy_totals.derived_profit_brl, { count: 1, sum: 45 });
assert.deepEqual(staleMigrationReport.legacy_totais_migration.report.persisted_legacy_totals.derived_profit_brl, { count: 0, sum: 0 }, 'não altera a entrada');
assert.equal(refreshLegacyTotalsReport(refreshedReport.base).changed, false, 'a reconciliação do relatório é idempotente');
assert.equal(refreshedReport.base.legacy_totais_migration.report.persisted_summary_reconciled, true, 'grava marcador para não percorrer os resumos em todo carregamento');

const missingFields = sourceCampaign({
  historical_number: 1,
  name: 'Campaign Zero And Unknown',
  account_legacy: 'Conta 4',
  end_date: null,
  metrics: {
    investment_brl: metric(0),
    clicks: metric(0),
    conversions: metric(null, 'missing'),
    commission_brl: metric(null, 'unknown'),
  },
});
const zeroAndUnknown = planLegacyTotaisMigration(base(), seed(missingFields));
const zeroSummary = zeroAndUnknown.base.campanhas[0].legacy_totais;
assert.equal(zeroSummary.metrics.investment_brl.value, 0, 'zero explícito permanece zero');
assert.equal(zeroSummary.metrics.investment_brl.state, 'observed');
assert.equal(zeroSummary.metrics.clicks.value, 0, 'clique zero não vira ausência');
assert.equal(zeroSummary.metrics.conversions.state, 'missing');
assert.equal(zeroSummary.metrics.conversions.value, null);
assert.equal(zeroSummary.metrics.commission_brl.state, 'unknown');
assert.equal(zeroSummary.profit_brl.value, null, 'não deriva lucro com comissão ausente');
assert.equal(zeroSummary.roi_percent.value, null, 'não deriva ROI com comissão ausente nem investimento zero');
assert.equal(zeroSummary.account_legacy, 'Conta 4', 'conta antiga é preservada literalmente');
assert.equal(zeroSummary.account_suffix, null, 'uma conta não numérica não ganha sufixo inferido');
assert.equal(zeroSummary.end_date, null, 'não infere data ausente');
assert.equal(zeroAndUnknown.report.campaigns_without_end_date, 1);

const native = base();
native.campanhas.push({ id: 'native-1', nome_mcc: 'Campaign North 01', nome_exibicao: 'Campaign North 01', status: 'ativa' });
native.manifesto_atual = { campanhas: [{ nome_campanha_exato: 'Campaign North 01', metricas_D_zero: { custo_total: { valor: 80 } } }] };
native.diario.push({ campanha_id: 'native-1', data: '2026-09-24', celulas: { O: { value: 80 }, C: { value: 8 }, F: { value: 1 }, P: { value: 100 } } });
const linkedSeedRow = sourceCampaign({ account_legacy: '123-456-9999' });
const linked = planLegacyTotaisMigration(native, seed(linkedSeedRow));
assert.equal(linked.status, 'ready');
assert.equal(linked.report.existing_in_hub, 1);
assert.equal(linked.report.linked_safely, 1);
assert.equal(linked.report.duplicates_avoided, 1);
assert.equal(linked.report.created_legacy, 0);
assert.equal(linked.report.divergences.length, 4, 'divergências nativas são reportadas sem substituir dados');
assert.equal(linked.base.campanhas.length, 1, 'não duplica campanha nativa');
assert.equal(linked.base.campanhas[0].status, 'ativa', 'status nativo permanece intacto');
assert.equal(linked.base.diario.length, 1, 'diário nativo permanece intacto');
assert.equal(linked.base.diario[0].celulas.O.value, 80, 'investimento nativo não é sobrescrito');
assert.equal(linked.base.campanhas[0].registro_origem, 'native');
assert.equal(linked.base.campanhas[0].legacy_totais.metrics.investment_brl.value, 100, 'o resumo fica separado, como dado legado');
assert.equal(linked.base.campanhas[0].conta_sufixo, '9999', 'associa ao cadastro nativo o sufixo MCC fornecido pela fonte quando não havia conta');

const existingAccount = base();
existingAccount.campanhas.push({ id: 'native-current-account', nome_mcc: 'Campaign Existing Account', nome_exibicao: 'Campaign Existing Account', status: 'ativa', conta_sufixo: '7890' });
const existingAccountPlan = planLegacyTotaisMigration(existingAccount, seed(sourceCampaign({ name: 'Campaign Existing Account', account_legacy: '123-456-7890' })));
assert.equal(existingAccountPlan.status, 'ready');
assert.equal(existingAccountPlan.report.rows_analyzed, 1);
assert.equal(existingAccountPlan.report.existing_account_rows_excluded, 1, 'não migra campanhas de conta que já existe no Hub');
assert.equal(existingAccountPlan.report.existing_accounts_excluded, 1);
assert.equal(existingAccountPlan.report.campaigns_valid, 0);
assert.equal(existingAccountPlan.report.created_legacy, 0);
assert.equal(existingAccountPlan.base.campanhas.length, 1, 'linha de conta existente não duplica nem altera campanha');

const accountless = planLegacyTotaisMigration(base(), seed(sourceCampaign({ name: 'Campaign Without Account', account_legacy: '—' })));
assert.equal(accountless.status, 'ready');
assert.equal(accountless.report.rows_without_account, 1);
assert.equal(accountless.base.campanhas[0].legacy_totais.account_legacy, null, 'campanha sem conta é importada sem associação');
assert.equal(accountless.base.campanhas[0].conta_sufixo, undefined);

const createdWithAccount = planLegacyTotaisMigration(base(), seed(sourceCampaign({ name: 'Campaign New MCC Account', account_legacy: '123-456-3333' })));
assert.equal(createdWithAccount.status, 'ready');
assert.equal(createdWithAccount.base.campanhas[0].conta_sufixo, '3333', 'campanha nova conserva o sufixo da conta MCC da planilha');
assert.equal(createdWithAccount.base.campanhas[0].legacy_totais.account_legacy, '123-456-3333', 'ID de conta original continua preservado');

const duplicateNative = base();
duplicateNative.campanhas.push(
  { id: 'native-a', nome_mcc: 'Campaign North 01', nome_exibicao: 'Campaign North 01', status: 'historico' },
  { id: 'native-b', nome_mcc: 'Campaign North 01', nome_exibicao: 'Campaign North 01', status: 'pausada' },
);
const duplicatePlan = planLegacyTotaisMigration(duplicateNative, seed(sourceCampaign()));
assert.equal(duplicatePlan.status, 'ready');
assert.equal(duplicatePlan.report.ambiguities.length, 0);
assert.equal(duplicatePlan.report.not_linked_reasons.length, 1);
assert.equal(duplicatePlan.base.campanhas.length, 3, 'campanha de nome duplicado fica separada, sem associação insegura');
assert.equal(duplicateNative.campanhas.some(campaign => campaign.legacy_totais), false);

const accountConflict = base();
accountConflict.campanhas.push({ id: 'native-1', nome_mcc: 'Campaign North 01', nome_exibicao: 'Campaign North 01', status: 'ativa', conta_sufixo: '7890' });
const conflictPlan = planLegacyTotaisMigration(accountConflict, seed(sourceCampaign({ account_legacy: 'Conta 4' })));
assert.equal(conflictPlan.status, 'ready', 'uma conta não comparável permanece em resumo independente');
assert.match(conflictPlan.report.not_linked_reasons[0].reason, /conta/i);
assert.equal(accountConflict.campanhas[0].legacy_totais, undefined);
assert.equal(conflictPlan.base.campanhas.length, 2);
assert.equal(conflictPlan.base.campanhas[1].legacy_totais.account_legacy, 'Conta 4');

const displayOnly = base();
displayOnly.campanhas.push({ id: 'native-display', nome_mcc: 'Different exact MCC name', nome_exibicao: 'Campaign North 01', status: 'historico' });
const displayOnlyPlan = planLegacyTotaisMigration(displayOnly, seed(sourceCampaign()));
assert.equal(displayOnlyPlan.status, 'ready', 'nome de exibição não substitui identidade exata MCC');
assert.equal(displayOnlyPlan.base.campanhas.length, 2, 'nome de exibição semelhante não vincula o resumo ao registro nativo');

const duplicateSeed = seed(sourceCampaign(), sourceCampaign({ historical_number: 2 }));
const duplicateSeedPlan = planLegacyTotaisMigration(base(), duplicateSeed);
assert.equal(duplicateSeedPlan.status, 'blocked', 'nomes fonte duplicados interrompem a migração antes da escrita');
assert.equal(duplicateSeedPlan.base.campanhas.length, 0);

const onceAgain = planLegacyTotaisMigration(legacyOnly.base, seed(sourceCampaign()));
assert.equal(onceAgain.status, 'already_applied');
assert.equal(onceAgain.base.campanhas.length, 1, 'reload/build não reinserem campanhas');
assert.equal(migrationAlreadyApplied(onceAgain.base), true);

const databaseSource = await readFile(new URL('../src/database.js', import.meta.url), 'utf8');
const databaseContext = vm.createContext({ window: {}, structuredClone });
vm.runInContext(databaseSource, databaseContext);
const CampaignDatabase = databaseContext.window.CampaignDatabase;
const exported = JSON.stringify(legacyOnly.base);
const restored = CampaignDatabase.mergeEventLogs(CampaignDatabase.normalize(JSON.parse(exported)), []);
assert.equal(restored.campanhas[0].legacy_totais.metrics.commission_brl.value, 145, 'backup/restore preserva resumo legado');
assert.equal(restored.campanhas[0].registro_origem, 'legacy_totais');
assert.equal(restored.legacy_totais_migration.version, 1, 'backup/restore preserva o marcador de idempotência');
assert.equal(restored.diario.length, 0, 'restore não cria diário a partir do resumo');
assert.equal(restored.event_log.length, 1, 'Event Log operacional continua preservado');

const template = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');
assert.ok(template.includes('label:`${c.nome_exibicao||c.nome_mcc} · resumo Totais`'), 'resumos legados ficam acessíveis no Histórico inclusive quando vinculados a campanhas nativas');
assert.ok(template.includes("showProduct(b.dataset.name,b.dataset.source,b.dataset.id||null)"), 'a tela de resumo localiza a campanha pelo ID estável');
assert.ok(template.includes("source==='legacy'?[]"), 'resumo legado não fabrica registros diários');
assert.ok(template.includes("$('#productPanelTitle').textContent='Resumo histórico legado'"), 'campanha legada abre resumo dentro do Diário existente');
assert.ok(template.includes('<span>Lucro derivado</span>'), 'investimento e lucro são destacados no resumo de campanha');
assert.ok(template.includes("value.state==='observed'||value.state==='derived'"), 'valores derivados de lucro e ROI aparecem no resumo');
assert.ok(template.includes("$('#productTableWrap').classList.add('hidden')"), 'tabela diária fica oculta no resumo consolidado legado');
assert.ok(template.includes('legacyTotalsMigrationModulePromise')&&template.includes("fetch('legacy-totais-migration-v1.json',{cache:'no-store'})"), 'módulo utiliza payload local, sem importar XLSX na interface');
assert.ok(template.includes("if(result.status==='blocked'){blockedMigration=true;shouldPersist=false;}"), 'ambiguidades bloqueiam a persistência');
assert.ok(template.includes('function testedProducts()')&&template.includes('state.database?.campanhas||currentCampaignRows()'), 'Produtos Testados reutiliza o agrupamento existente');
assert.ok(template.includes('function localBasePayload()')&&template.includes('async function loadBase(file)'), 'backup e restore continuam na base única do Hub');
assert.ok(!template.includes('legacy-totais-migration-v1.json";base64,'), 'dados históricos não são embutidos como texto no código');

console.log('legacy Totais migration tests passed');
