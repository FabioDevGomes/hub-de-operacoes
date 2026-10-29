export function mountVslSpeed({ document, sendMessage, setDisabled }) {
  const buttons = [1,10,20,30].map(rate => document.querySelector(`#vsl-speed-${rate}`));
  const status = document.querySelector('#vsl-status');
  let pending = false, interacted = false;
  const show = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('error', error);
  };
  const mark = rate => {
    for (const [index, button] of buttons.entries()) button.setAttribute('aria-pressed', String([1,10,20,30][index] === rate));
  };
  for (const [index, button] of buttons.entries()) button.addEventListener('click', async () => {
    if (pending || button.disabled) return;
    pending = true;
    interacted = true;
    setDisabled(true);
    mark(null);
    show('Ajustando a VSL da aba ativa…');
    try {
      const response = await sendMessage({ type:'SET_ACTIVE_VSL_SPEED', rate:[1,10,20,30][index] });
      const result = response?.result;
      if (!response?.ok || !result?.ok) throw new Error(result?.message || response?.message || 'O player não respondeu.');
      if (result.verified) mark(result.rate);
      show(result.message);
    } catch (error) { show(error?.message || 'Não foi possível ajustar a VSL.', true); }
    finally { pending = false; setDisabled(false); }
  });
  // Consulta somente o estado da aba ao reabrir, sem iniciar/alterar mídia.
  sendMessage({ type:'READ_ACTIVE_VSL_SPEED' }).then(response => {
    if (interacted || !response?.result) return;
    const result = response.result;
    // Não exibe alerta ao abrir o popup em páginas comuns sem player. A falha
    // continua visível quando o usuário pede explicitamente uma velocidade.
    if (!result.ok) return;
    if (result.verified) mark(result.rate);
    if (result.mode === 'skip') show(`Avanço por saltos ativo: ${result.rate}× aproximados, sem áudio. Use 1× para parar.`);
    else if (result.message) show(result.message);
  }).catch(() => {});
}
