// Função serializável pelo chrome.scripting.executeScript. Ela usa somente
// semântica/layout do DOM para rolar a grade; não lê conteúdo das campanhas.
export async function scrollMccPageToBottom(doc = document, win = window) {
  const epsilon = 2;
  const maxSteps = 120;
  const settleChecks = 3;
  const waitMs = 250;
  const pageScroller = doc.scrollingElement || doc.documentElement || doc.body;
  if (!pageScroller) return { ok: false, message: 'Não encontrei uma área rolável na página da MCC.' };

  const verticalRange = element => Math.max(0,
    Number(element?.scrollHeight || 0) - Number(element?.clientHeight || 0));
  const isVisible = element => !element?.getClientRects || element.getClientRects().length > 0;
  const isScrollable = element => {
    if (verticalRange(element) <= epsilon) return false;
    if (element === pageScroller) return true;
    const overflowY = String(win.getComputedStyle?.(element)?.overflowY || '');
    return /^(auto|scroll|overlay)$/i.test(overflowY);
  };

  // Prefere o contêiner rolável mais próximo da grade semântica. Se não houver
  // um, usa a rolagem normal da página, sem depender de classes do Google Ads.
  const grids = [...(doc.querySelectorAll?.('[role="grid"], [role="table"], table') || [])].filter(isVisible);
  const scores = new Map();
  for (const grid of grids) {
    let element = grid;
    let distance = 0;
    while (element && element !== doc) {
      if (isScrollable(element)) {
        const score = scores.get(element) || { count: 0, distance: 0 };
        score.count += 1;
        score.distance += distance;
        scores.set(element, score);
      }
      if (element === pageScroller) break;
      element = element.parentElement;
      distance += 1;
    }
  }
  const target = [...scores.entries()]
    .sort(([elementA, scoreA], [elementB, scoreB]) =>
      scoreB.count - scoreA.count
      || scoreA.distance / scoreA.count - scoreB.distance / scoreB.count
      || verticalRange(elementB) - verticalRange(elementA))[0]?.[0]
    || pageScroller;

  if (verticalRange(target) <= epsilon) return { ok: true, steps: 0, alreadyAtBottom: true };

  const stepSize = Math.max(120, Math.floor((Number(target.clientHeight) || 600) * 0.8));
  let steps = 0;
  let stableBottomChecks = 0;
  let previousHeight = Number(target.scrollHeight || 0);
  while (steps < maxSteps) {
    const maximum = verticalRange(target);
    const currentTop = Number(target.scrollTop || 0);
    if (currentTop < maximum - epsilon) {
      target.scrollTop = Math.min(maximum, currentTop + stepSize);
      steps += 1;
    }

    await new Promise(resolve => win.setTimeout(resolve, waitMs));

    const currentHeight = Number(target.scrollHeight || 0);
    const currentMaximum = verticalRange(target);
    const atBottom = Number(target.scrollTop || 0) >= currentMaximum - epsilon;
    if (atBottom) {
      stableBottomChecks = currentHeight === previousHeight ? stableBottomChecks + 1 : 0;
      if (stableBottomChecks >= settleChecks) return { ok: true, steps, alreadyAtBottom: steps === 0 };
    } else {
      stableBottomChecks = 0;
    }
    previousHeight = currentHeight;
  }

  return {
    ok: false,
    message: 'A rolagem não confirmou o fim da grade após várias tentativas. Aguarde a MCC carregar e tente novamente.'
  };
}
