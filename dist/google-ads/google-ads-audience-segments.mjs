export const MAX_GOOGLE_ADS_AUDIENCE_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_GOOGLE_ADS_AUDIENCE_IDS = 1000;

function decodeAudienceCsv(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes);
}

function parseCsvRows(source, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field === '') { quoted = true; continue; }
    if (char === delimiter) { row.push(field); field = ''; continue; }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      row.push(field); field = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  if (quoted) throw new Error('A planilha tem um campo entre aspas que não foi fechado.');
  row.push(field);
  if (row.some(value => value.trim() !== '')) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value ?? '').replace(/^\ufeff/, '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function findAudienceTable(source) {
  const candidates = [];
  for (const delimiter of [',', ';', '\t']) {
    const rows = parseCsvRows(source, delimiter);
    const headerIndex = rows.findIndex(row => {
      const headers = row.map(normalizeHeader);
      return headers.includes('action') && headers.includes('audience id') && headers.includes('level');
    });
    if (headerIndex < 0) continue;
    const headers = rows[headerIndex].map(normalizeHeader);
    candidates.push({ rows: rows.slice(headerIndex + 1), indexes: {
      action: headers.indexOf('action'), audienceId: headers.indexOf('audience id'), level: headers.indexOf('level'),
    } });
  }
  if (!candidates.length) throw new Error('Não encontrei as colunas Action, Audience ID e Level na planilha.');
  return candidates[0];
}

/** Extract only Add audience rows; old campaign and ad-group IDs from the file are deliberately ignored. */
export function parseGoogleAdsAudienceSegments(source) {
  const text = String(source ?? '').replace(/^\ufeff/, '');
  if (!text.trim()) throw new Error('A planilha de segmentação está vazia.');
  const table = findAudienceTable(text);
  const ids = [];
  const seen = new Set();
  const counts = { totalRows: 0, skippedBlank: 0, skippedDuplicate: 0, skippedAction: 0, skippedLevel: 0, skippedInvalid: 0 };
  for (const row of table.rows) {
    counts.totalRows++;
    const action = String(row[table.indexes.action] ?? '').trim().toLocaleLowerCase();
    if (action !== 'add') { counts.skippedAction++; continue; }
    const level = String(row[table.indexes.level] ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    if (level !== 'ad group') { counts.skippedLevel++; continue; }
    const id = String(row[table.indexes.audienceId] ?? '').trim();
    if (!id) { counts.skippedBlank++; continue; }
    if (!/^[1-9]\d{0,19}$/.test(id)) { counts.skippedInvalid++; continue; }
    if (seen.has(id)) { counts.skippedDuplicate++; continue; }
    seen.add(id);
    ids.push(id);
  }
  if (!ids.length) throw new Error('A planilha não contém IDs de público válidos para adicionar ao nível de grupo de anúncios.');
  if (ids.length > MAX_GOOGLE_ADS_AUDIENCE_IDS) throw new Error('A planilha contém mais de ' + MAX_GOOGLE_ADS_AUDIENCE_IDS + ' IDs únicos. Divida em arquivos menores.');
  return { ids, ...counts };
}

export async function readGoogleAdsAudienceSegmentsFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Selecione um arquivo CSV de segmentação.');
  if (file.size > MAX_GOOGLE_ADS_AUDIENCE_FILE_BYTES) throw new Error('O arquivo ultrapassa o limite local de 2 MB.');
  return parseGoogleAdsAudienceSegments(decodeAudienceCsv(await file.arrayBuffer()));
}
