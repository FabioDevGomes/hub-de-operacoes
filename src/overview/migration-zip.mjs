const encoder = new TextEncoder();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ZIP without compression; reject ZIP64-sized packages instead of corrupting them.
export function buildMigrationZip(files) {
  if (files.length > 65535) throw new Error('O pacote possui arquivos demais para este formato ZIP.');
  const parts = [], central = [], names = new Set();
  let offset = 0;
  const w16 = (view, at, value) => view.setUint16(at, value, true);
  const w32 = (view, at, value) => view.setUint32(at, value, true);
  for (const { name, bytes } of files) {
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').some(p => !p || p === '.' || p === '..') || names.has(name)) throw new Error('Caminho inválido ou duplicado no ZIP.');
    names.add(name);
    const path = encoder.encode(name), data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (path.length > 65535 || data.length > 0xffffffff || offset + 30 + path.length + data.length > 0xffffffff) throw new Error('Pacote maior que o limite do ZIP.');
    const crc = crc32(data), local = new Uint8Array(30 + path.length), lv = new DataView(local.buffer);
    w32(lv, 0, 0x04034b50); w16(lv, 4, 20); w16(lv, 6, 0x0800); w32(lv, 14, crc); w32(lv, 18, data.length); w32(lv, 22, data.length); w16(lv, 26, path.length); local.set(path, 30);
    const header = new Uint8Array(46 + path.length), cv = new DataView(header.buffer);
    w32(cv, 0, 0x02014b50); w16(cv, 4, 20); w16(cv, 6, 20); w16(cv, 8, 0x0800); w32(cv, 16, crc); w32(cv, 20, data.length); w32(cv, 24, data.length); w16(cv, 28, path.length); w32(cv, 42, offset); header.set(path, 46);
    parts.push(local, data); central.push(header); offset += local.length + data.length;
  }
  const size = central.reduce((sum, value) => sum + value.length, 0);
  if (offset + size > 0xffffffff) throw new Error('Pacote maior que o limite do ZIP.');
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  w32(ev, 0, 0x06054b50); w16(ev, 8, files.length); w16(ev, 10, files.length); w32(ev, 12, size); w32(ev, 16, offset);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
