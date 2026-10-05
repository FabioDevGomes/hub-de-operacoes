// Função serializável pelo chrome.scripting.executeScript; não depende de
// seletores/classes internos do Google Ads nem interage com a página.
export function collectMccGrid(fields, headerAliases, doc = document) {
  const collapse = value => String(value ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
  const normalize = value => collapse(value).replace(/1\s*ª/g, '1a').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[%]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  const aliasLookup = new Map(Object.entries(headerAliases || {}).flatMap(([field, aliases]) =>
    aliases.map(alias => [normalize(alias), field])));
  const visible = element => {
    if (!element || element.getAttribute?.('aria-hidden') === 'true') return false;
    if (typeof element.getClientRects !== 'function') return true;
    return element.getClientRects().length > 0;
  };
  const cleanDecorative = value => collapse(value).replace(/\bhelp_outline\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const displayedText = element => {
    const aria = cleanDecorative(element?.getAttribute?.('aria-label'));
    const inner = cleanDecorative(element?.innerText);
    const content = cleanDecorative(element?.textContent);
    return inner || content || aria;
  };
  const mappedHeader = cell => {
    // A MCC expõe o estado operacional só como ícone; primary_status é a
    // coluna textual, inclusive quando seu valor é “Pausada”.
    const id = collapse(cell?.getAttribute?.('essfield'));
    if (id === 'status') return 'campaign_state';
    if (id === 'primary_status') return 'status';
    const choices = [cell?.getAttribute?.('aria-label'), cell?.innerText, cell?.textContent].map(cleanDecorative).filter(Boolean);
    for (const choice of choices) {
      const field = aliasLookup.get(normalize(choice));
      if (field) return field;
    }
    return null;
  };
  const semanticLinks = cell => {
    if (!cell) return 0;
    if (cell.matches?.('a, [role="link"]')) return 1;
    return all(cell, 'a, [role="link"]').length;
  };
  const all = (root, selector) => [...(root?.querySelectorAll?.(selector) || [])];
  const namedLinks = cell => all(cell, 'a, [role="link"]').filter(link => displayedText(link));
  const accountIdIn = cell => {
    const values = [cell?.innerText, cell?.textContent, cell?.getAttribute?.('aria-label')];
    const ids = new Set(values.flatMap(value => [...String(value ?? '').matchAll(/\b\d{3}[-‐‑–]\d{3}[-‐‑–]\d{4}\b/g)]
      .map(match => match[0].replace(/[-‐‑–]/g, '-'))));
    return ids.size === 1 ? [...ids][0] : null;
  };
  const cellsIn = (row, selector) => all(row, selector);
  const candidateSelector = '[role="grid"], [role="table"], table';
  const candidates = all(doc, candidateSelector);
  const inspectCandidate = element => {
    const rows = all(element, '[role="row"], tr');
    const headerSelector = '[role="columnheader"], th';
    const headerRow = rows.find(row => cellsIn(row, headerSelector).length > 0);
    if (!headerRow) return null;
    const headers = cellsIn(headerRow, headerSelector);
    const mapped = headers.map(mappedHeader);
    const score = mapped.filter(Boolean).length;
    const hasCampaign = mapped.includes('campaign');
    const metricCount = ['impressions', 'clicks', 'cost'].filter(key => mapped.includes(key)).length;
    if (!hasCampaign || metricCount < 2) return null;
    return { element, rows, headerRow, headers, mapped, score };
  };
  const grids = candidates.map(inspectCandidate).filter(Boolean).sort((a, b) => b.score - a.score);
  if (!grids.length) return {
    ok: false,
    error: 'Não encontrei uma grade semântica inequívoca com cabeçalho de campanha e métricas D0. Nenhuma leitura foi feita.',
    strategy: 'roles ARIA [grid]/[table], columnheader/row/cell e fallback semântico table/tr/th/td'
  };
  if (grids.length > 1 && grids[0].score === grids[1].score) return {
    ok: false,
    error: 'Encontrei mais de uma grade MCC igualmente provável; a leitura foi interrompida para evitar misturar tabelas.',
    candidates: grids.length,
    strategy: 'roles ARIA [grid]/[table], columnheader/row/cell e fallback semântico table/tr/th/td'
  };

  const selected = grids[0];
  const headerInfo = selected.headers.map((cell, index) => ({
    index, text: displayedText(cell), field: selected.mapped[index], visible: visible(cell),
    essfield: collapse(cell.getAttribute?.('essfield')) || null,
    ariaLabel: collapse(cell.getAttribute?.('aria-label')) || null,
    textContent: collapse(cell.textContent), innerText: collapse(cell.innerText)
  }));
  const mapping = {};
  const duplicateFields = {};
  headerInfo.forEach(header => {
    if (!header.field) return;
    if (mapping[header.field] == null) mapping[header.field] = header.index;
    else (duplicateFields[header.field] ||= [mapping[header.field]]).push(header.index);
  });

  const rows = selected.rows.filter(row => row !== selected.headerRow);
  const campaignHeaderIndex = mapping.campaign;
  const rowCells = rows.map(row => ({ row, cells: cellsIn(row, '[role="cell"], [role="gridcell"], [role="rowheader"], td, th') }))
    .filter(item => item.cells.length);
  const campaignTextAt = (cells, index) => displayedText(cells[index]);
  const isCampaignLabel = value => value && !/^total\b/i.test(value);
  const mappedHeaders = headerInfo.filter(header => header.field);
  const useFieldIds = mappedHeaders.length > 0 && mappedHeaders.every(header => header.essfield);
  const campaignRows = [];
  for (const item of rowCells) {
    const offset = item.cells.length - selected.headers.length;
    const fieldCells = new Map();
    let campaignCell;
    if (useFieldIds) {
      const byId = new Map();
      item.cells.forEach(cell => {
        const id = collapse(cell.getAttribute?.('essfield'));
        if (id) (byId.get(id) || byId.set(id, []).get(id)).push(cell);
      });
      const campaignMatches = byId.get(headerInfo[campaignHeaderIndex].essfield) || [];
      if (!campaignMatches.length) continue;
      if (campaignMatches.length !== 1) {
        return { ok: false, error: 'Encontrei mais de uma célula vinculada ao cabeçalho Campanha. Nenhum dado foi enviado.' };
      }
      campaignCell = campaignMatches[0];
      if (!namedLinks(campaignCell).length) continue; // Linhas de total/rascunho não são campanhas.
      for (const header of mappedHeaders) {
        const matches = byId.get(header.essfield) || [];
        if (matches.length !== 1) {
          return { ok: false, error: `A coluna ${header.text || header.field} não tem uma célula única na linha de campanha. Nenhum dado foi enviado.` };
        }
        if (!fieldCells.has(header.field)) fieldCells.set(header.field, matches[0]);
      }
    } else {
      // Compatibilidade com tabelas sem identificadores de coluna explícitos.
      if (offset < 0) continue;
      const campaignCellIndex = campaignHeaderIndex + offset;
      if (campaignCellIndex >= item.cells.length) continue;
      campaignCell = item.cells[campaignCellIndex];
      if (offset > 0) {
        if (namedLinks(campaignCell).length !== 1) continue;
        const directCell = item.cells[campaignHeaderIndex];
        if (isCampaignLabel(campaignTextAt(item.cells, campaignHeaderIndex)) && semanticLinks(directCell)) {
          return { ok: false, error: 'A associação estrutural entre o cabeçalho Campanha e suas células não pôde ser confirmada sem ambiguidade. Nenhum dado foi enviado.' };
        }
      }
      selected.mapped.forEach((field, index) => {
        if (field && !fieldCells.has(field)) fieldCells.set(field, item.cells[index + offset]);
      });
    }
    const links = namedLinks(campaignCell);
    if (links.length > 1) {
      return { ok: false, error: 'A célula Campanha contém mais de um nome vinculado. Nenhum dado foi enviado.' };
    }
    const name = links.length ? displayedText(links[0]) : displayedText(campaignCell);
    if (!isCampaignLabel(name)) continue;
    campaignRows.push({ ...item, offset, fieldCells, name });
  }
  if (!campaignRows.length) {
    return { ok: false, error: 'A quantidade de células não permite associar nenhuma linha ao cabeçalho Campanha. Nenhum dado foi enviado.' };
  }
  const recordRows = [];
  let summaryRows = 0;
  let viewportRows = 0;
  let visualTextMismatches = 0;
  const maxRecords = 5000;
  for (const { row, cells, fieldCells, name } of campaignRows) {
    const record = {};
    for (const [field, cell] of fieldCells) {
      if (field === 'campaign') record[field] = name;
      else if (field === 'account') {
        record.account_id = accountIdIn(cell);
        const label = displayedText(cell).replace(record.account_id || '', '').trim();
        const linkedLabel = namedLinks(cell).length === 1 ? displayedText(namedLinks(cell)[0]).replace(record.account_id || '', '').trim() : '';
        record[field] = linkedLabel || label || displayedText(cell);
      }
      else if (field === 'status') record[field] = String(cell?.innerText || '').split(/\r?\n/).map(cleanDecorative).find(Boolean) || displayedText(cell);
      else if (field === 'campaign_state') {
        const labels = [cell?.getAttribute?.('aria-label'), ...all(cell, '[role="img"][aria-label], img[aria-label]')
          .filter(visible).map(icon => icon.getAttribute?.('aria-label')),
          String(cell?.innerText || '').split(/\r?\n/)[0]].map(cleanDecorative)
          .filter(label => /^(?:ativad[oa]|ativ[oa]|pausad[oa]|removid[oa]|excluid[oa]|inativ[oa]|enabled|activated|active|paused|removed|disabled)$/i.test(label));
        const states = [...new Set(labels.map(normalize))];
        record[field] = states.length === 1 ? labels[0] : null;
      }
      else record[field] = displayedText(cell);
    }
    const campaign = collapse(record.campaign);
    if (!campaign || /^total\b/i.test(campaign)) { if (campaign) summaryRows++; continue; }
    if (typeof row.getBoundingClientRect === 'function' && doc.defaultView) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom > 0 && rect.right > 0 && rect.top < doc.defaultView.innerHeight && rect.left < doc.defaultView.innerWidth) viewportRows++;
    }
    cells.forEach(cell => {
      const inner = collapse(cell.innerText), content = collapse(cell.textContent);
      if (inner && content && inner !== content) visualTextMismatches++;
    });
    if (recordRows.length < maxRecords) recordRows.push(record);
  }

  const rawBodyText = doc.body?.innerText || doc.body?.textContent || '';
  const bodyText = collapse(rawBodyText);
  const bodyLines = String(rawBodyText).split(/\r?\n/).map(collapse).filter(Boolean).slice(0, 40);
  const managerHeaders = [];
  for (let index = 0; index < bodyLines.length; index++) {
    const name = bodyLines[index];
    if (!/^MCC(?:\s+.+)?$/i.test(name)) continue;
    const managerAccountId = bodyLines[index + 1]?.match(/^(\d{3}-\d{3}-\d{4})$/)?.[1] || null;
    if (managerAccountId) managerHeaders.push({ managerAccountId, managerAccountName:name });
  }
  const uniqueManagerHeaders = [...new Map(managerHeaders.map(item => [`${item.managerAccountId}|${item.managerAccountName.toLocaleLowerCase()}`, item])).values()];
  const managerIdentity = uniqueManagerHeaders.length === 1 ? uniqueManagerHeaders[0] : { managerAccountId:null, managerAccountName:null };
  const pageMatches = [...bodyText.matchAll(/\b(\d+)\s*[-–]\s*(\d+)\s+(?:de|of)\s+([\d,.]+)/gi)];
  const pagination = pageMatches.length ? pageMatches.map(match => ({
    first: Number(match[1]), last: Number(match[2]), total: Number(match[3].replace(/,/g, '')),
    text: match[0]
  })).sort((a, b) => b.total - a.total)[0] : null;
  const ariaRowCount = Number(selected.element.getAttribute?.('aria-rowcount')) || null;
  const indexedRows = selected.rows.map(row => Number(row.getAttribute?.('aria-rowindex'))).filter(Number.isFinite);
  const rowIndexGaps = indexedRows.some((value, index) => index > 0 && value > indexedRows[index - 1] + 1);
  const ariaSuggestsVirtual = ariaRowCount != null && ariaRowCount > selected.rows.length + 1;
  const pageSuggestsMissingRows = pagination != null && recordRows.length < pagination.last - pagination.first + 1;
  const truncatedByCap = campaignRows.length > maxRecords;
  const virtualized = rowIndexGaps || ariaSuggestsVirtual || pageSuggestsMissingRows || truncatedByCap;
  const qualificationStatusConfirmed = useFieldIds && headerInfo[mapping.status]?.essfield === 'primary_status';
  const fieldResults = {};
  for (const field of fields || []) {
    const headers = headerInfo.filter(header => header.field === field);
    const genericStatusLabel = field === 'status' && headers.some(header => normalize(header.text) === 'status') && !qualificationStatusConfirmed;
    fieldResults[field] = {
      found: headers.some(header => header.visible),
      hidden: headers.length > 0 && headers.every(header => !header.visible),
      ambiguous: Boolean(duplicateFields[field]) || genericStatusLabel,
      semanticAmbiguity: genericStatusLabel ? 'Cabeçalho genérico “Status”; confirme se corresponde ao status de qualificação do CSV.' : null,
      header: headers[0]?.text || null
    };
  }
  const ancestors = [];
  for (let node = selected.element; node && ancestors.length < 8; node = node.parentElement) ancestors.push(node);
  const scrollContainers = ancestors.filter(node => {
    const style = doc.defaultView?.getComputedStyle?.(node);
    return node.scrollHeight > node.clientHeight + 2 && /auto|scroll|overlay/i.test(style?.overflowY || '');
  }).length;
  const root = selected.element.getRootNode?.();

  const names = recordRows.map(record => record.campaign);
  const duplicateCampaigns = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
  const uniqueCampaignCount = new Set(names).size;
  const cellOffsets = [...new Set(campaignRows.map(item => item.offset))].sort((a, b) => a - b);
  const reportDate = readSelectedReportDate(doc, collapse, visible);
  return {
    ok: true,
    capturedAt: new Date().toISOString(),
    title: collapse(doc.title),
    ...managerIdentity,
    managerIdentityAmbiguous: uniqueManagerHeaders.length > 1,
    strategy: 'roles ARIA [grid]/[table], columnheader/row/cell; vínculo essfield quando disponível; fallback table/tr/th/td',
    associationMethod: useFieldIds ? 'essfield' : 'header-offset',
    headers: headerInfo,
    fields: fieldResults,
    cellOffset: cellOffsets.length === 1 ? cellOffsets[0] : null,
    cellOffsets,
    records: recordRows,
    rowsCaptured: recordRows.length,
    uniqueCampaignCount,
    duplicateCampaigns,
    locale: collapse(doc?.documentElement?.lang || doc?.defaultView?.navigator?.language || 'en-US'),
    rowsInDom: rows.length,
    rowsInViewport: viewportRows,
    summaryRowsExcluded: summaryRows,
    recordCap: maxRecords,
    truncatedByCap,
    pagination,
    ariaRowCount,
    rowIndexGaps,
    virtualized,
    scrollContainers,
    shadowDom: Boolean(root?.host),
    shadowDomNote: 'A captura não atravessa shadow roots fechados; a ausência de um root aberto não prova que não existam.',
    visualTextMismatches,
    unknownHeaders: headerInfo.filter(header => !header.field).map(header => header.text),
    hiddenHeaders: headerInfo.filter(header => !header.visible).map(header => header.text),
    duplicateFields,
    totalRowsApparent: pagination?.total ?? (ariaRowCount != null ? Math.max(0, ariaRowCount - 1) : null),
    reportDate,
    completeness: virtualized ? 'partial-or-virtualized'
      : pagination && pagination.first === 1 && pagination.last === pagination.total && pagination.total === recordRows.length
        ? 'current-page-matches-apparent-total'
        : 'unverified',
    limitations: [
      'Leitura somente do DOM já materializado; a extensão não rola a página nem aciona paginação.',
      'Campos da MCC podem depender de colunas selecionadas, filtros, permissões ou cabeçalhos dinâmicos.',
      'Não é possível provar por uma única captura que a interface não use lazy loading/virtualização fora da área renderizada.'
    ]
  };

  function readSelectedReportDate(document, collapseText, isVisible) {
    const controls = [...(document?.querySelectorAll?.('button, [role="button"], input, [aria-label], [title]') || [])];
    const dateCue = /\b(date|dates|period|range|calendar|data|per[ií]odo|intervalo|custom)\b/i;
    const monthNames = {
      jan:1, january:1, janeiro:1, feb:2, february:2, fevereiro:2, mar:3, march:3, marco:3,
      apr:4, april:4, abril:4, may:5, maio:5, jun:6, june:6, junho:6, jul:7, july:7, julho:7,
      aug:8, august:8, agosto:8, sep:9, sept:9, september:9, setembro:9, set:9,
      oct:10, october:10, outubro:10, out:10, nov:11, november:11, novembro:11,
      dec:12, december:12, dezembro:12, dez:12
    };
    const validIso = (year, month, day) => {
      const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
      return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day)
        ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
    };
    const parseDates = (text, locale) => {
      const dates = [];
      for (const match of text.matchAll(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/g)) {
        const iso = validIso(match[1], match[2], match[3]); if (iso) dates.push(iso);
      }
      for (const match of text.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/g)) {
        const order = new Intl.DateTimeFormat(locale || 'en-US').formatToParts(new Date(Date.UTC(2026, 10, 23)))
          .filter(part => ['day', 'month', 'year'].includes(part.type)).map(part => part.type[0]).join('');
        const values = { d:match[1], m:match[2], y:match[3] };
        const orderedIso = order === 'dmy' ? validIso(values.y, values.m, values.d)
          : order === 'mdy' ? validIso(values.y, values.d, values.m) : null;
        if (orderedIso) dates.push(orderedIso);
      }
      const monthPattern = Object.keys(monthNames).sort((a, b) => b.length - a.length).join('|');
      for (const match of text.toLowerCase().matchAll(new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${monthPattern})\\.?[,]?\\s*(?:de\\s+)?(20\\d{2})\\b`, 'g'))) {
        const iso = validIso(match[3], monthNames[match[2]], match[1]); if (iso) dates.push(iso);
      }
      for (const match of text.toLowerCase().matchAll(new RegExp(`\\b(${monthPattern})\\.?\\s+(\\d{1,2})[,]?\\s+(20\\d{2})\\b`, 'g'))) {
        const iso = validIso(match[3], monthNames[match[1]], match[2]); if (iso) dates.push(iso);
      }
      return dates;
    };
    const locale = collapseText(document?.documentElement?.lang || document?.defaultView?.navigator?.language || '');
    const candidates = controls.filter(isVisible).map(element => {
      const label = collapseText([element.getAttribute?.('aria-label'), element.getAttribute?.('title'), element.value, element.innerText, element.textContent].filter(Boolean).join(' '));
      const dates = parseDates(label, locale);
      const role = element.getAttribute?.('role');
      const tag = String(element.tagName || '').toUpperCase();
      const dateInput = tag === 'INPUT' && String(element.getAttribute?.('type') || '').toLowerCase() === 'date';
      const dateControl = role === 'button' || tag === 'BUTTON' || dateInput;
      const explicitlyDateLabelled = dateCue.test(`${element.getAttribute?.('aria-label') || ''} ${element.getAttribute?.('title') || ''} ${element.getAttribute?.('type') || ''}`);
      return { label, dates, semantic: explicitlyDateLabelled || (dateControl && dates.length > 0) };
    }).filter(item => item.semantic && item.dates.length);
    if (!candidates.length) return { value: null, reason: 'Não encontrei uma data explícita no controle de período da MCC.' };
    const eligible = candidates.filter(item => item.dates.length);
    const distinct = [...new Set(eligible.flatMap(item => item.dates))];
    const ambiguousRange = eligible.some(item => {
      const rangeLabel = /\b(?:to|through|até)\b|[–—]|\s-\s/i.test(item.label);
      const unique = [...new Set(item.dates)];
      return unique.length > 1 || (rangeLabel && item.dates.length < 2);
    });
    if (distinct.length !== 1 || ambiguousRange) return { value: null, reason: 'O período selecionado não representa uma única data inequívoca.' };
    return { value: distinct[0], label: eligible[0]?.label || null };
  }
}
