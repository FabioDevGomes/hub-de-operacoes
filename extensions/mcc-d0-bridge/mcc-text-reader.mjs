// Captura somente o texto já renderizado pela página. Não seleciona a página,
// não lê o clipboard e não interage com controles da MCC.
export function collectMccSelectableText(doc = document) {
  if (!doc?.body) return { ok: false, error: 'A página ativa ainda não tem conteúdo renderizado.' };
  return {
    ok: true,
    text: String(doc.body.innerText || '')
  };
}
