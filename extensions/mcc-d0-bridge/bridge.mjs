export async function deliverD0GridToPreparador(capture) {
  const fail = message => ({ ok: false, message });
  if (location.origin !== 'http://127.0.0.1:8765' || !location.pathname.startsWith('/preparador-MCC/')) {
    return fail('A aba de destino não é o Preparador MCC local.');
  }
  if (!capture || capture.schema !== 'mcc-d0-grid-v3' || capture.source !== 'mcc_chrome_extension' || !Array.isArray(capture.records)) {
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

export async function deliverD1GridToPreparador(capture) {
  const fail = message => ({ ok: false, message });
  if (location.origin !== 'http://127.0.0.1:8765' || !location.pathname.startsWith('/preparador-MCC/')) {
    return fail('A aba de destino não é o Preparador MCC local.');
  }
  if (!capture || capture.schema !== 'mcc-d1-grid-v3' || capture.periodRole !== 'd1' || capture.source !== 'mcc_chrome_extension' || !Array.isArray(capture.records)) {
    return fail('A captura estrutural D−1 chegou incompleta ou em formato incompatível.');
  }
  if (typeof window.__hubReceiveMccD1Grid !== 'function') {
    return fail('O Preparador MCC carregou sem o receptor da captura D−1. Atualize o Hub e tente novamente.');
  }
  try {
    return await window.__hubReceiveMccD1Grid(capture);
  } catch (error) {
    return fail(error?.message || 'O Preparador não conseguiu processar a captura estrutural D−1.');
  }
}
