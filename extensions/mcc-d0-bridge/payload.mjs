function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function createCsvTransferPayload(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || !/\.csv$/i.test(String(file.name || ''))) {
    throw new Error('Selecione um arquivo com extensão .csv.');
  }
  const buffer = await file.arrayBuffer();
  if (!buffer.byteLength) throw new Error('O arquivo CSV está vazio.');
  return {
    name: String(file.name),
    type: String(file.type || 'text/csv'),
    lastModified: Number(file.lastModified) || 0,
    size: buffer.byteLength,
    base64: bytesToBase64(new Uint8Array(buffer))
  };
}
