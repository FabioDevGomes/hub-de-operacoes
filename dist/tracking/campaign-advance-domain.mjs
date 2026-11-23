// Agrega apenas sessões identificadas de uma campanha e de uma Pre-Sell.
export function calcularAvanco(eventos, campanhaId) {
  const sessoes = new Map();
  for (const e of eventos) {
    if (String(e.utm_campaign || '') !== String(campanhaId) || !e.visitor_id || !e.presell_host) continue;
    if (!['page_view', 'outbound_click'].includes(e.event_type)) continue;
    const tempo = Date.parse(e.received_at_utc);
    if (!Number.isFinite(tempo)) continue;
    const chave = JSON.stringify([e.presell_host.toLowerCase(), e.visitor_id]);
    const sessao = sessoes.get(chave) || { visita: Infinity, saida: -Infinity };
    if (e.event_type === 'page_view') sessao.visita = Math.min(sessao.visita, tempo);
    else sessao.saida = Math.max(sessao.saida, tempo);
    sessoes.set(chave, sessao);
  }
  const visitas = [...sessoes.values()].filter(s => Number.isFinite(s.visita));
  const avancos = visitas.filter(s => s.saida >= s.visita).length;
  return { sessoes: visitas.length, avancos, percentual: visitas.length ? 100 * avancos / visitas.length : null };
}
