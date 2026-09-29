import { createCsvTransferPayload } from './payload.mjs';
import { compareMccSnapshotToCsv, decodeCsvBuffer } from './mcc-grid-domain.mjs';
import { compareMccTextToCsv } from './mcc-text-domain.mjs';

const PREPARADOR_URL = 'http://127.0.0.1:8765/preparador-MCC/';
const fileInput = document.querySelector('#csv-file');
const sendButton = document.querySelector('#send-button');
const status = document.querySelector('#status');
const form = document.querySelector('#send-form');
const captureButton = document.querySelector('#capture-d0');
const captureD1Button = document.querySelector('#capture-d1');
const captureStatus = document.querySelector('#capture-status');
const readButton = document.querySelector('#read-grid');
const readTextButton = document.querySelector('#read-text');
const compareInput = document.querySelector('#compare-csv');
const compareButton = document.querySelector('#compare-button');
const experimentStatus = document.querySelector('#experiment-status');
const experimentResult = document.querySelector('#experiment-result');
let currentSnapshot = null;
let currentSnapshotKind = null;

fileInput.addEventListener('change', () => {
  sendButton.disabled = !fileInput.files?.[0];
  status.textContent = '';
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const file = fileInput.files?.[0];
  if (!file) return;
  sendButton.disabled = true;
  status.textContent = 'Preparando o arquivo original…';
  try {
    const payload = await createCsvTransferPayload(file);
    status.textContent = 'Enviando ao Preparador MCC…';
    const response = await chrome.runtime.sendMessage({ type: 'FORWARD_D0_CSV', payload });
    if (!response?.ok) throw new Error(response?.message || 'Não foi possível encaminhar o CSV.');
    status.textContent = 'Arquivo entregue. Confira a validação e confirme em “Atualizar base” no Preparador.';
  } catch (error) {
    status.textContent = error?.message || 'Falha ao encaminhar o CSV.';
    sendButton.disabled = false;
  }
});

captureButton.addEventListener('click', async () => {
  captureButton.disabled = true;
  captureStatus.textContent = 'Validando e capturando a grade D0 da aba ativa…';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_AND_FORWARD_MCC_D0' });
    if (!response?.ok) throw new Error(response?.message || 'Não foi possível preparar a captura D0.');
    captureStatus.textContent = `${response.result.campaignCount} campanhas recebidas pelo Preparador. Revise a prévia; a base só muda se você clicar em “Atualizar base”.`;
  } catch (error) {
    captureStatus.textContent = error?.message || 'Falha na captura estrutural da MCC.';
  } finally {
    captureButton.disabled = false;
  }
});

captureD1Button.addEventListener('click', async () => {
  captureD1Button.disabled = true;
  captureStatus.textContent = 'Validando a data de ontem e capturando a grade D−1 da aba ativa…';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_AND_FORWARD_MCC_D1' });
    if (!response?.ok) throw new Error(response?.message || 'Não foi possível preparar a captura D−1.');
    const result = response.result;
    const nextStep = result.waitingForD0
      ? 'D−1 recebido e validado. Aguardando D0 para gerar a prévia.'
      : 'Revise a prévia; a base só muda se você clicar em “Atualizar base”.';
    captureStatus.textContent = `D−1 (${result.reportDate}) · ${result.campaignCount} campanhas. ${nextStep}`;
  } catch (error) {
    captureStatus.textContent = error?.message || 'Falha na captura estrutural da MCC para D−1.';
  } finally {
    captureD1Button.disabled = false;
  }
});

readButton.addEventListener('click', async () => {
  readButton.disabled = true;
  compareButton.disabled = true;
  experimentStatus.textContent = 'Lendo somente a grade da aba ativa…';
  experimentResult.hidden = true;
  currentSnapshot = null;
  currentSnapshotKind = null;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'READ_ACTIVE_MCC_GRID' });
    if (!response?.ok) throw new Error(response?.message || 'Não foi possível ler a grade MCC.');
    currentSnapshot = response.result;
    currentSnapshotKind = 'grid';
    experimentResult.textContent = formatSnapshot(currentSnapshot);
    experimentResult.hidden = false;
    compareButton.disabled = !compareInput.files?.[0];
    experimentStatus.textContent = 'Prévia local pronta. Nenhum dado foi enviado.';
  } catch (error) {
    experimentStatus.textContent = error?.message || 'Falha segura na leitura da grade.';
  } finally {
    readButton.disabled = false;
  }
});

readTextButton.addEventListener('click', async () => {
  readTextButton.disabled = true;
  compareButton.disabled = true;
  experimentStatus.textContent = 'Capturando somente o texto renderizado da aba ativa…';
  experimentResult.hidden = true;
  currentSnapshot = null;
  currentSnapshotKind = null;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'READ_ACTIVE_MCC_TEXT' });
    if (!response?.ok) throw new Error(response?.message || 'Não foi possível capturar o texto da MCC.');
    currentSnapshot = response.result;
    currentSnapshotKind = 'text';
    experimentResult.textContent = formatTextSnapshot(currentSnapshot);
    experimentResult.hidden = false;
    compareButton.disabled = !compareInput.files?.[0];
    const summary = currentSnapshot.complete
      ? `${currentSnapshot.campaignCount} campanhas; paginação completa confirmada.`
      : `${currentSnapshot.campaignCount} campanhas detectadas; completude ${currentSnapshot.completeness}.`;
    experimentStatus.textContent = `Captura local pronta: ${summary} Nenhum dado foi enviado ou gravado.`;
  } catch (error) {
    experimentStatus.textContent = error?.message || 'Falha segura na captura textual.';
  } finally {
    readTextButton.disabled = false;
  }
});

compareInput.addEventListener('change', () => {
  compareButton.disabled = !currentSnapshot || !compareInput.files?.[0];
  experimentStatus.textContent = '';
});

compareButton.addEventListener('click', async () => {
  const file = compareInput.files?.[0];
  if (!currentSnapshot || !file) return;
  compareButton.disabled = true;
  experimentStatus.textContent = 'Comparando localmente…';
  try {
    const decoded = decodeCsvBuffer(await file.arrayBuffer());
    const report = currentSnapshotKind === 'text'
      ? compareMccTextToCsv(currentSnapshot, decoded.text)
      : compareMccSnapshotToCsv(currentSnapshot, decoded.text);
    const captureText = currentSnapshotKind === 'text' ? formatTextSnapshot(currentSnapshot) : formatSnapshot(currentSnapshot);
    experimentResult.textContent = `${captureText}\n\n${formatComparison(report, file.name, decoded.encoding, currentSnapshotKind)}`;
    experimentResult.hidden = false;
    experimentStatus.textContent = 'Comparação concluída localmente. Nenhum dado foi enviado ou gravado.';
  } catch (error) {
    experimentStatus.textContent = error?.message || 'Não foi possível comparar esse CSV.';
  } finally {
    compareButton.disabled = !currentSnapshot || !compareInput.files?.[0];
  }
});

const FIELD_LABELS = {
  date: 'Data', campaign: 'Campanha', account: 'Conta', target_geo: 'Target geo / GEO',
  campaign_state: 'Status da campanha', status: 'Status de qualificação', currency: 'Moeda',
  impressions: 'Impressões', clicks: 'Cliques', conversions: 'Conversões',
  conversion_value: 'Valor da conversão', avg_cost: 'Custo médio', abs_top_share: 'Impr. primeira posição',
  top_share: 'Impr. parte superior', budget: 'Orçamento', bid_strategy: 'Estratégia de lance',
  target_cpa: 'CPA desejado', cost: 'Custo'
};

const CLASS_LABELS = { A: 'Explícito', B: 'Recuperável por contexto', C: 'Ausente', D: 'Ambíguo' };

function formatTextSnapshot(snapshot) {
  const page = snapshot.pagination
    ? `${snapshot.pagination.first}–${snapshot.pagination.last} de ${snapshot.pagination.total}`
    : 'não detectada';
  const lines = [
    'CAPTURA TEXTUAL MCC · EXPERIMENTO',
    `Fonte: ${snapshot.source}; sem clipboard/seleção nem extração do título da página.`,
    `Tamanho do texto renderizado: ${snapshot.textLength} caracteres`,
    `Campanhas detectadas: ${snapshot.campaignCount} (${snapshot.uniqueCampaignCount} únicas) | declarado no cabeçalho: ${snapshot.declaredCampaigns ?? 'não detectado'}`,
    `Paginação: ${page} | completude: ${snapshot.completeness}${snapshot.complete ? ' (confirmada)' : ' (não confirmada)'}`,
    `Nomes duplicados: ${snapshot.duplicateCampaigns.length}`,
    `Cabeçalhos MCC reconhecidos no texto: ${snapshot.recognizedHeaders.map(field => FIELD_LABELS[field] || field).join(', ') || 'nenhum'}`,
    '', 'ALGUNS NOMES DETECTADOS:',
    ...(snapshot.sampleCampaigns.length ? snapshot.sampleCampaigns.map(name => `- ${name}`) : ['- Nenhum bloco reconhecido.']),
    '', 'CAMPOS DO PARSER D0:',
    ...Object.entries(snapshot.fieldMatrix).map(([field, info]) => `- ${FIELD_LABELS[field] || field}: ${CLASS_LABELS[info.classification]}; cobertura ${info.detected}/${snapshot.campaignCount}. ${info.reason}`),
    '', `Valores sem rótulo preservados sem atribuição: números ${snapshot.unmappedValues.numeric} (zeros ${snapshot.unmappedValues.zeroNumeric}), monetários ${snapshot.unmappedValues.money} (zeros ${snapshot.unmappedValues.zeroMoney}), percentuais ${snapshot.unmappedValues.percent} (zeros ${snapshot.unmappedValues.zeroPercent}), traços ${snapshot.unmappedValues.dash}. Linhas/células vazias não podem ser associadas a uma coluna no texto plano.`,
    '', 'LIMITAÇÕES:'
  ];
  snapshot.limitations.forEach(item => lines.push(`- ${item}`));
  return lines.join('\n');
}

function formatSnapshot(snapshot) {
  const lines = [
    'PRÉVIA MCC',
    `Linhas de campanha capturadas: ${snapshot.rowsCaptured}${snapshot.totalRowsApparent == null ? '' : ` / ${snapshot.totalRowsApparent} aparentes`}`,
    `Linhas presentes no DOM: ${snapshot.rowsInDom}; dentro da viewport: ${snapshot.rowsInViewport}`,
    `Paginação: ${snapshot.pagination?.text || 'não detectada'}; virtualização/recorte detectado: ${snapshot.virtualized ? 'sim' : 'não detectado'}`,
    `Completude: ${snapshot.completeness}; contêiner(es) rolável(is) da grade: ${snapshot.scrollContainers}`,
    `Cabeçalho reconhecido: ${snapshot.headers.filter(item => item.field).length} de ${snapshot.headers.length}; linhas-resumo excluídas: ${snapshot.summaryRowsExcluded}`,
    `Divergência innerText × textContent em células: ${snapshot.visualTextMismatches}`,
    `Shadow DOM aberto na raiz da grade: ${snapshot.shadowDom ? 'sim' : 'não detectado'} (shadow roots fechados não são verificáveis)`,
    '', 'CAMPOS DO PARSER D0 NA GRADE:'
  ];
  for (const [field, info] of Object.entries(snapshot.fields)) {
    const caution = info.semanticAmbiguity ? ` — ATENÇÃO: ${info.semanticAmbiguity}` : info.ambiguous ? ' (cabeçalho duplicado/ambíguo)' : '';
    lines.push(`- ${FIELD_LABELS[field] || field}: ${info.found ? `encontrado${info.header ? ` — “${info.header}”` : ''}${caution}` : info.hidden ? `presente, mas oculto${info.header ? ` — “${info.header}”` : ''}${caution}` : 'ausente'}`);
  }
  lines.push('', 'Cabeçalhos encontrados:', ...snapshot.headers.map(item => `- ${item.visible ? '' : '[oculto] '}${item.text || '(sem texto)'}${item.field ? ` → ${FIELD_LABELS[item.field] || item.field}` : ' → não mapeado'}`));
  if (snapshot.unknownHeaders.length) lines.push('', `Cabeçalhos não mapeados: ${snapshot.unknownHeaders.join(' | ')}`);
  lines.push('', 'AMOSTRA DE ATÉ 5 LINHAS:');
  for (const record of snapshot.records.slice(0, 5)) {
    lines.push(`- ${record.campaign || '(sem campanha)'} | conta: ${record.account || '—'} · ${record.account_id || 'ID ausente'} | impressões: ${record.impressions || '—'} | cliques: ${record.clicks || '—'} | conversões: ${record.conversions || '—'} | custo: ${record.cost || '—'}`);
  }
  lines.push('', 'LIMITAÇÕES:');
  snapshot.limitations.forEach(item => lines.push(`- ${item}`));
  return lines.join('\n');
}

function formatComparison(report, fileName, encoding, sourceKind = 'grid') {
  if (sourceKind === 'text') {
    const lines = [
      `COMPARAÇÃO LOCAL CAPTURA TEXTUAL × CSV: ${fileName} (${encoding})`,
      `Campanhas: texto ${report.textCampaigns} (${report.textUniqueCampaigns} únicas) | CSV ${report.csvCampaigns} (${report.csvUniqueCampaigns} únicas)`,
      `Registros de campanha no CSV: ${report.csvRows}; placeholders ignorados: ${report.csvPlaceholderCount}`,
      `Completude da captura: ${report.textCompleteness}; valores comparados: ${report.valuesCompared}; divergências: ${report.divergenceCount}`,
      `Equivalências textuais normalizadas: ${report.normalizedEquivalentCount}${Object.keys(report.normalizedEquivalentByField).length ? ` (${Object.entries(report.normalizedEquivalentByField).map(([field, count]) => `${FIELD_LABELS[field] || field}: ${count}`).join('; ')})` : ''}`,
      `Divergências por campo (total): ${Object.keys(report.divergenceByField).length ? Object.entries(report.divergenceByField).map(([field, count]) => `${FIELD_LABELS[field] || field}: ${count}`).join('; ') : 'nenhuma'}`,
      `Campos comparados: ${report.comparableFields.map(field => FIELD_LABELS[field] || field).join(', ') || 'nenhum'}`,
      `Campos do parser textual sem comparação segura: ${report.textMissingFields.map(field => FIELD_LABELS[field] || field).join(', ') || 'nenhum'}`,
      `Campos ausentes no CSV: ${report.csvMissingFields.map(field => FIELD_LABELS[field] || field).join(', ') || 'nenhum'}`,
      `Campanhas só no texto (${report.onlyText.length}): ${report.onlyText.slice(0, 10).join(' | ') || 'nenhuma'}`,
      `Campanhas só no CSV (${report.onlyCsv.length}): ${report.onlyCsv.slice(0, 10).join(' | ') || 'nenhuma'}`,
      `Nomes duplicados — texto: ${report.duplicateScreen.length}; CSV: ${report.duplicateCsv.length}`,
      `Contas que não puderam ser comparadas por igualdade exata entre nome/ID: ${report.accountUnresolved}`,
      `Delimitador CSV: ${report.csv.delimiter === '\t' ? 'tabulação' : report.csv.delimiter === ';' ? 'ponto e vírgula' : 'vírgula'}; cabeçalho na linha ${report.csv.headerRow}`,
      '', 'DIAGNÓSTICO POSICIONAL DE MÉTRICAS (experimental; não alimenta a importação):',
      ...(report.positionalMetricAlignment.length
        ? report.positionalMetricAlignment.map(item => {
          const bestPosition = item.bestPosition == null ? 'ambígua' : `#${item.bestPosition}`;
          return `- ${FIELD_LABELS[item.field] || item.field}: cabeçalho #${item.headerPosition} ${item.expectedMatches}/${item.csvValues} (tokens presentes ${item.expectedCoverage}/${item.csvValues}); melhor posição ${bestPosition}, ${item.bestMatches} correspondências; ${item.status}`;
        })
        : ['- Nenhum campo métrico tem cabeçalho e valores CSV comparáveis para este diagnóstico.']),
      'A correspondência é apenas uma hipótese local contra este CSV; não é mapeamento confirmado nem dado de produção.',
      '', 'AMOSTRA DE DIVERGÊNCIAS (máximo 30; totais por campo acima):'
    ];
    report.divergences.slice(0, 30).forEach(item => {
      const show = value => value.state === 'absent' ? 'ausente' : value.value;
      lines.push(`- ${item.campaign} · ${FIELD_LABELS[item.field] || item.field}: texto=${show(item.screen)}; CSV=${show(item.csv)}`);
    });
    if (!report.divergences.length) lines.push('- Nenhuma divergência nos campos comparáveis.');
    return lines.join('\n');
  }
  const lines = [
    `COMPARAÇÃO LOCAL COM CSV: ${fileName} (${encoding})`,
    `Campanhas: MCC ${report.screenCampaigns} (${report.screenUniqueCampaigns} únicas) | CSV ${report.csvCampaigns} (${report.csvUniqueCampaigns} únicas)`,
    `Campos comparáveis: ${report.comparableFields.map(field => FIELD_LABELS[field] || field).join(', ') || 'nenhum'}`,
    `Campos ausentes na grade: ${report.screenMissingFields.map(field => FIELD_LABELS[field] || field).join(', ') || 'nenhum'}`,
    `Campos ausentes no CSV: ${report.csvMissingFields.map(field => FIELD_LABELS[field] || field).join(', ') || 'nenhum'}`,
    `Data por campanha: ${report.dateComparison === 'nao_comparavel_por_campanha' ? 'não comparável (a grade não fornece data por linha)' : 'comparável'}`,
    `Campanhas só na grade (${report.onlyScreen.length}): ${report.onlyScreen.slice(0, 10).join(' | ') || 'nenhuma'}`,
    `Campanhas só no CSV (${report.onlyCsv.length}): ${report.onlyCsv.slice(0, 10).join(' | ') || 'nenhuma'}`,
    `Nomes duplicados — grade: ${report.duplicateScreen.length}; CSV: ${report.duplicateCsv.length}`,
    `Divergências de campo: ${report.divergenceCount}; casos ausente × zero: ${report.absentZeroDifferences}`,
    `Delimitador CSV: ${report.csv.delimiter === '\t' ? 'tabulação' : report.csv.delimiter === ';' ? 'ponto e vírgula' : 'vírgula'}; cabeçalho na linha ${report.csv.headerRow}`,
    `Cabeçalhos desconhecidos no CSV: ${report.csv.unknownHeaders.map(item => item.header).join(' | ') || 'nenhum'}`,
    '', 'PRIMEIRAS DIVERGÊNCIAS (máximo 30):'
  ];
  report.divergences.slice(0, 30).forEach(item => {
    const show = value => value.state === 'absent' ? 'ausente' : value.value;
    lines.push(`- ${item.campaign} · ${FIELD_LABELS[item.field] || item.field}: grade=${show(item.screen)}; CSV=${show(item.csv)}`);
  });
  if (!report.divergences.length) lines.push('- Nenhuma divergência nos campos comparáveis.');
  return lines.join('\n');
}
