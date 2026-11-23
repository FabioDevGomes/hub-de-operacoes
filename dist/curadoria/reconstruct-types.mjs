// Prova isolada: reconstrói valores com bytes já conferidos; não grava em IndexedDB.
export async function reconstructTagged(input, readBinary) {
  const losses = new Set();
  const constructors = { Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView };
  async function decode(value, depth = 0) {
    if (depth > 150) throw new Error('Profundidade excedida');
    if (Array.isArray(value)) return Promise.all(value.map(item => decode(item, depth + 1)));
    if (!value || typeof value !== 'object') return value;
    const type = value.$hubType;
    if (!Object.hasOwn(value, '$hubType')) {
      const object = {};
      for (const [key, item] of Object.entries(value)) Object.defineProperty(object, key, { value: await decode(item, depth + 1), writable: true, enumerable: true, configurable: true });
      return object;
    }
    if (type === 'object') {
      if (!Array.isArray(value.entries)) throw new Error('Objeto inválido');
      const object = {}, seen = new Set();
      for (const entry of value.entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || seen.has(entry[0])) throw new Error('Entrada inválida');
        seen.add(entry[0]); Object.defineProperty(object, entry[0], { value: await decode(entry[1], depth + 1), writable: true, enumerable: true, configurable: true });
      }
      return object;
    }
    if (type === 'array') {
      if (!Array.isArray(value.value)) throw new Error('Array inválido');
      const result = await Promise.all(value.value.map(item => decode(item, depth + 1)));
      if (!Object.hasOwn(value, 'holes') && !Object.hasOwn(value, 'properties')) {
        losses.add('A exportação não distingue arrays esparsos de valores ausentes.');
        return result;
      }
      if (!Array.isArray(value.holes) || !Array.isArray(value.properties)) throw new Error('Metadados de array inválidos');
      const holes = new Set();
      for (const index of value.holes) {
        if (!Number.isSafeInteger(index) || index < 0 || index >= result.length || holes.has(index) || value.value[index]?.$hubType !== 'undefined' || Object.keys(value.value[index]).length !== 1) throw new Error('Posição vazia inválida');
        holes.add(index); delete result[index];
      }
      const keys = new Set();
      for (const pair of value.properties) {
        if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || pair[0] === 'length' || keys.has(pair[0]) || (String(Number(pair[0])) === pair[0] && Number.isInteger(Number(pair[0])) && Number(pair[0]) >= 0 && Number(pair[0]) < 4294967295)) throw new Error('Propriedade de array inválida');
        keys.add(pair[0]); Object.defineProperty(result, pair[0], { value: await decode(pair[1], depth + 1), writable: true, enumerable: true, configurable: true });
      }
      return result;
    }
    if (type === 'undefined') return undefined;
    if (type === 'number') {
      if (value.value === 'NaN') return NaN;
      if (value.value === 'Infinity') return Infinity;
      if (value.value === '-Infinity') return -Infinity;
      if (value.value === '-0') return -0;
      throw new Error('Número especial inválido');
    }
    if (type === 'bigint') {
      if (typeof value.value !== 'string' || !/^-?(0|[1-9][0-9]*)$/.test(value.value)) throw new Error('Bigint inválido');
      return BigInt(value.value);
    }
    if (type === 'date') {
      const date = new Date(value.value);
      if (!Number.isFinite(date.getTime()) || date.toISOString() !== value.value) throw new Error('Data inválida ou não canônica');
      return date;
    }
    if (['blob', 'file', 'buffer'].includes(type)) {
      const bytes = await readBinary(value);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== value.size) throw new Error('Bytes binários inválidos');
      if (!globalThis.crypto?.subtle) throw new Error('SHA-256 indisponível neste contexto do navegador');
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (digest !== value.sha256) throw new Error('Hash binário divergente');
      if (type === 'blob') return new Blob([bytes], { type: value.mime || '' });
      if (type === 'file') {
        if (typeof value.name !== 'string') throw new Error('Nome de arquivo ausente');
        const lastModified = value.lastModified;
        if (lastModified === undefined) losses.add('File.lastModified não foi exportado; a reconstrução usa zero.');
        else if (!Number.isSafeInteger(lastModified)) throw new Error('File.lastModified inválido');
        return new File([bytes], value.name, { type: value.mime || '', lastModified: lastModified ?? 0 });
      }
      losses.add('Compartilhamento de buffers e byteOffset originais não foram exportados.');
      const buffer = bytes.slice().buffer;
      if (value.kind === 'ArrayBuffer') return buffer;
      const Ctor = constructors[value.kind];
      if (!Ctor) throw new Error('Tipo de buffer desconhecido');
      try { return new Ctor(buffer); } catch { throw new Error('Tamanho incompatível com tipo de buffer'); }
    }
    throw new Error('Tipo marcado desconhecido');
  }
  return { value: await decode(input), losses: [...losses] };
}

