// Reversible serialization of IndexedDB values for the migration package.
// Binary contents are supplied to the caller, never written to the original store.
export async function encodeMigrationValue(value, addBinary, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { $hubType: 'number', value: 'NaN' };
    if (!Number.isFinite(value)) return { $hubType: 'number', value: value > 0 ? 'Infinity' : '-Infinity' };
    if (Object.is(value, -0)) return { $hubType: 'number', value: '-0' };
    return value;
  }
  if (typeof value === 'undefined') return { $hubType: 'undefined' };
  if (typeof value === 'bigint') return { $hubType: 'bigint', value: String(value) };
  if (typeof value !== 'object') throw new Error('Tipo de dado não suportado na exportação.');
  if (ancestors.has(value)) throw new Error('Referência circular não pode ser exportada.');
  if (value instanceof Date) return { $hubType: 'date', value: value.toISOString() };
  if (value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    const isFile = typeof File !== 'undefined' && value instanceof File;
    const reference = await addBinary(bytes, { mime: value.type, name: isFile ? value.name : null, ...(isFile ? { lastModified: value.lastModified } : {}) });
    return { $hubType: isFile ? 'file' : 'blob', ...reference };
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const reference = await addBinary(bytes, { mime: 'application/octet-stream', name: null });
    return { $hubType: 'buffer', kind: value.constructor.name, ...reference };
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const holes = [];
      const items = await Promise.all(Array.from({ length: value.length }, (_, index) => {
        const present = Object.hasOwn(value, index);
        if (!present) holes.push(index);
        return encodeMigrationValue(present ? value[index] : undefined, addBinary, new Set(ancestors));
      }));
      const properties = [];
      for (const key of Object.keys(value)) {
        const index = Number(key);
        if (Number.isInteger(index) && index >= 0 && index < value.length && String(index) === key) continue;
        properties.push([key, await encodeMigrationValue(value[key], addBinary, new Set(ancestors))]);
      }
      return { $hubType: 'array', value: items, holes, properties };
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error(`Tipo estruturado não suportado: ${value.constructor?.name || 'desconhecido'}.`);
    const entries = [];
    for (const [key, item] of Object.entries(value)) entries.push([key, await encodeMigrationValue(item, addBinary, new Set(ancestors))]);
    return { $hubType: 'object', entries };
  } finally { ancestors.delete(value); }
}
