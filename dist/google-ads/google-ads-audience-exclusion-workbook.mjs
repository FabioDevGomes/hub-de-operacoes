const HEADERS = Object.freeze([
  'Action', 'Customer ID', 'Campaign', 'Campaign ID', 'Ad group', 'Ad group ID',
  'Type', 'Excluded Audience', 'Excluded Audience ID', 'Level',
]);

const utf8 = value => new TextEncoder().encode(value);

function xmlEscape(value) {
  return String(value ?? '').replace(/[<>&'\"]/g, character => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[character]);
}

function columnName(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function worksheetXml(rows) {
  const lastRow = rows.length;
  const rowXml = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((value, columnIndex) => {
      const address = `${columnName(columnIndex)}${rowNumber}`;
      const escaped = xmlEscape(value);
      return `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${escaped}</t></is></c>`;
    }).join('');
    return row.length ? `<row r="${rowNumber}">${cells}</row>` : `<row r="${rowNumber}"/>`;
  }).join('');
  const columnWidths = [12, 16, 32, 20, 24, 20, 28, 44, 24, 16];
  const cols = columnWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<dimension ref="A1:J${lastRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="1"/></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rowXml}</sheetData>`
    + `<autoFilter ref="A2:J${lastRow}"/><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>`
    + `</worksheet>`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStored(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const dosNow = new Date();
  const dosTime = (dosNow.getHours() << 11) | (dosNow.getMinutes() << 5) | Math.floor(dosNow.getSeconds() / 2);
  const dosDate = ((Math.max(1980, dosNow.getFullYear()) - 1980) << 9) | ((dosNow.getMonth() + 1) << 5) | dosNow.getDate();
  const write16 = (view, offset, value) => view.setUint16(offset, value, true);
  const write32 = (view, offset, value) => view.setUint32(offset, value >>> 0, true);

  for (const file of files) {
    const name = utf8(file.name);
    const data = utf8(file.content);
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30 + name.length);
    const localView = new DataView(localHeader.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800);
    write16(localView, 8, 0);
    write16(localView, 10, dosTime);
    write16(localView, 12, dosDate);
    write32(localView, 14, checksum);
    write32(localView, 18, data.length);
    write32(localView, 22, data.length);
    write16(localView, 26, name.length);
    write16(localView, 28, 0);
    localHeader.set(name, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0);
    write16(centralView, 12, dosTime);
    write16(centralView, 14, dosDate);
    write32(centralView, 16, checksum);
    write32(centralView, 20, data.length);
    write32(centralView, 24, data.length);
    write16(centralView, 28, name.length);
    write16(centralView, 30, 0);
    write16(centralView, 32, 0);
    write16(centralView, 34, 0);
    write16(centralView, 36, 0);
    write32(centralView, 38, 0);
    write32(centralView, 42, localOffset);
    centralHeader.set(name, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 4, 0);
  write16(endView, 6, 0);
  write16(endView, 8, files.length);
  write16(endView, 10, files.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, localOffset);
  write16(endView, 20, 0);

  const parts = [...localParts, ...centralParts, end];
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

export function buildGoogleAdsAudienceExclusionWorkbook({ campaigns: campaignTargets, customerId, campaignIds, audiences } = {}) {
  const legacyCustomer = String(customerId ?? '').replace(/\D/g, '');
  const targets = Array.isArray(campaignTargets)
    ? campaignTargets.map(target => ({
      customerId: String(target?.customerId ?? '').replace(/\D/g, ''),
      campaignId: String(target?.campaignId ?? ''),
    }))
    : (Array.isArray(campaignIds) ? campaignIds : []).map(value => ({
      customerId: legacyCustomer,
      campaignId: String(value ?? ''),
    }));
  const targetKeys = targets.map(target => target.customerId + ':' + target.campaignId);
  if (targets.length < 1 || targets.length > 100
      || targets.some(target => !/^\d{10}$/.test(target.customerId) || !/^[1-9]\d{0,19}$/.test(target.campaignId))
      || new Set(targetKeys).size !== targets.length
      || !Array.isArray(audiences) || audiences.length !== 13) {
    throw new Error('A planilha exige campanhas válidas de até 100 campanhas e exatamente 13 públicos de exclusão.');
  }

  const normalizedAudiences = audiences.map(audience => {
    const id = String(audience?.id ?? '');
    const name = String(audience?.name ?? '').trim();
    if ((id && (!/^[1-9]\d{0,19}$/.test(id) || name)) || (!id && !name)) {
      throw new Error('O catálogo contém um público sem ID ou nome válido. Nenhuma planilha foi gerada.');
    }
    return { id, name };
  });
  const audienceKeys = normalizedAudiences.map(audience => audience.id
    ? 'id:' + audience.id : 'name:' + audience.name.toLocaleLowerCase());
  if (new Set(audienceKeys).size !== 13) throw new Error('O catálogo não contém 13 públicos de exclusão distintos.');

  const rows = [[], HEADERS];
  for (const target of targets) {
    for (const audience of normalizedAudiences) {
      rows.push([
        'Add', target.customerId, '', target.campaignId, '', '', '', audience.name, audience.id, 'Campaign',
      ]);
    }
  }

  const files = [
    {
      name: '[Content_Types].xml',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '</Types>',
    },
    {
      name: '_rels/.rels',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheets><sheet name="(Template) Apply Exclusions" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        + '</Relationships>',
    },
    { name: 'xl/worksheets/sheet1.xml', content: worksheetXml(rows) },
  ];
  return zipStored(files);
}
