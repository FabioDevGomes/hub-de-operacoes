export function deliverD0CsvToPreparador(payload) {
  const fail = message => ({ ok: false, message });
  if (location.origin !== 'http://127.0.0.1:8765' || !location.pathname.startsWith('/preparador-MCC/')) {
    return fail('A aba de destino não é o Preparador MCC local.');
  }
  if (!payload || !payload.name || !payload.base64) return fail('O arquivo CSV não chegou completo à ponte.');

  const box = document.querySelector('.paste-box[data-slot="d0"]');
  const input = box?.querySelector('input.file-input[type="file"]');
  if (!input) return fail('Não encontrei o campo existente de CSV D0 no Preparador MCC.');

  const binary = atob(payload.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);

  const file = new File([bytes], payload.name, {
    type: payload.type || 'text/csv',
    lastModified: payload.lastModified || Date.now()
  });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, name: file.name, size: file.size };
}

export async function deliverD0GridToPreparador(capture) {
  const fail = message => ({ ok: false, message });
  if (location.origin !== 'http://127.0.0.1:8765' || !location.pathname.startsWith('/preparador-MCC/')) {
    return fail('A aba de destino não é o Preparador MCC local.');
  }
  if (!capture || capture.schema !== 'mcc-d0-grid-v1' || capture.source !== 'mcc_chrome_extension' || !Array.isArray(capture.records)) {
    return fail('A captura estrutural D0 chegou incompleta ou em formato incompatível.');
  }
  if (typeof window.__hubReceiveMccD0Grid !== 'function') {
    return fail('O Preparador MCC carregou sem o receptor da captura estrutural. Atualize o Hub e tente novamente.');
  }
  try {
    return await window.__hubReceiveMccD0Grid(capture);
  } catch (error) {
    return fail(error?.message || 'O Preparador não conseguiu processar a captura estrutural.');
  }
}
