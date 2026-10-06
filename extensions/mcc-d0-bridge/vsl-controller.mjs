// Autocontido: chrome.scripting serializa esta função em world MAIN.
// Estado apenas na aba; sem rede, clipboard, storage ou acesso à base do Hub.
export async function controlVslSpeed(rate, action = 'set') {
  const key = '__hubVslPlaybackV1';
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const deadline = async promise => {
    let timer;
    try {
      return await Promise.race([Promise.resolve(promise), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('O player não respondeu. Inicie a VSL e tente novamente.')), 1800);
      })]);
    } finally { clearTimeout(timer); }
  };
  if (!['set', 'read'].includes(action) || (action === 'set' && ![1, 10, 20, 30].includes(rate))) {
    return { ok:false, message:'Velocidade inválida. Use 1×, 10×, 20× ou 30×.' };
  }
  const previous = window[key];
  if (action === 'read' && previous?.signature === 'hub-vsl-v1') return previous.snapshot();

  // DOM aberto e frames da mesma origem. Não atravessa frames externos nem
  // tenta descobrir mídia, APIs privadas ou shadow roots fechadas.
  const videos = [], players = [], roots = [document], seen = new Set();
  for (let index = 0; index < roots.length && index < 100; index++) {
    const root = roots[index];
    if (!root || seen.has(root)) continue;
    seen.add(root);
    videos.push(...root.querySelectorAll('video'));
    players.push(...root.querySelectorAll('vturb-smartplayer'));
    for (const node of root.querySelectorAll('*')) {
      if (node.shadowRoot) roots.push(node.shadowRoot);
      if (node.tagName === 'IFRAME') {
        try { if (node.contentDocument) roots.push(node.contentDocument); } catch { /* origem externa */ }
      }
    }
  }
  const area = node => {
    const rect = node.getBoundingClientRect();
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  };
  const visibleVideos = videos.filter(video => area(video) > 0);
  const playable = visibleVideos.filter(video => !video.paused && !video.ended);
  const video = (playable.length ? playable : visibleVideos).sort((a,b) => area(b) - area(a))[0];
  const player = players.filter(node => area(node) > 0).sort((a,b) => area(b) - area(a))[0];
  const target = video || player;
  const kind = video ? 'HTML5' : 'VTurb';
  if (!target) return { ok:false, message:'Nenhuma VSL acessível nesta aba. Inicie o vídeo e tente novamente. Players em iframe externo podem não permitir acesso.' };
  if (action === 'read') return { ok:true, mode:'native', rate:video ? video.playbackRate : null, verified:!!video, kind };
  if (!(Number.isFinite(target.duration) && target.duration > 0) || (!video && typeof player.speed !== 'function')) {
    return { ok:false, message:'O vídeo ainda não está pronto. Inicie a VSL e escolha a velocidade novamente.' };
  }

  if (previous?.signature === 'hub-vsl-v1') previous.stop();
  let timer = null, stopped = false, busy = false, error = '', last = performance.now();
  const originalMuted = video?.muted;
  const originalVolume = player?.volume;
  const canRestoreAudio = video || (typeof player?.setVolume === 'function' && Number.isFinite(originalVolume));
  const state = {
    signature:'hub-vsl-v1', rate, mode:rate > 16 ? 'skip' : 'native', kind,
    verified:!!video,
    snapshot:() => ({ ok:!error, rate:stopped || state.mode === 'native' ? (video?.playbackRate ?? (stopped ? null : rate)) : rate,
      mode:stopped ? 'native' : state.mode, kind, verified:state.verified, message:error }),
    stop:() => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      if (state.mode === 'skip') {
        if (video) { video.muted = originalMuted; }
        else if (canRestoreAudio) { try { player.setVolume(originalVolume); } catch { /* sem unmute forçado */ } }
      }
    }
  };
  try {
    if (rate <= 16) {
      if (video) {
        const before = video.playbackRate;
        video.playbackRate = rate;
        await delay(120);
        if (video.playbackRate !== rate) {
          video.playbackRate = before;
          throw new Error(`O player recusou ${rate}×. Velocidade atual: ${video.playbackRate}×.`);
        }
        video.defaultPlaybackRate = rate;
      } else {
        await deadline(player.speed(rate));
        // A API pública VTurb não expõe getter de velocidade. Não afirmar
        // confirmação nem marcar o botão como aplicado sem leitura nativa.
        state.verified = false;
      }
      window[key] = state;
      return { ...state.snapshot(), message:video ? `Velocidade aplicada: ${rate}×.`
        : `${rate}× solicitado ao VTurb. A API não permite confirmar a velocidade efetiva.` };
    }

    if (!video && (typeof player.seek !== 'function' || !canRestoreAudio || typeof player.paused !== 'boolean')) {
      throw new Error('Este player não oferece avanço e controle de áudio seguros. Use 1× ou 10×.');
    }
    // Reprodução base em 1× + saltos calculados pelo relógio. Não é
    // decodificação contínua a 20/30×; rede/buffering podem reduzir o avanço.
    if (video) {
      video.defaultPlaybackRate = 1;
      video.playbackRate = 1;
      await delay(120);
      if (video.playbackRate !== 1) throw new Error('O player recusou a velocidade base do avanço. Escolha 1× e tente novamente.');
      video.muted = true;
    } else {
      await deadline(player.speed(1));
      player.setVolume(0);
    }
    const tick = async () => {
      const now = performance.now();
      const elapsed = Math.min(1, Math.max(0, (now - last) / 1000));
      last = now;
      if (stopped || busy) return;
      if (!target.isConnected) { state.stop(); return; }
      if (target.ended) { state.stop(); return; }
      if (target.paused || (video && (video.seeking || video.readyState < 2))) return;
      const current = target.currentTime, duration = target.duration;
      if (!Number.isFinite(current) || !Number.isFinite(duration) || duration <= 0) return;
      if (current >= duration - .1) { state.stop(); return; }
      const baseRate = video ? video.playbackRate : 1;
      const next = Math.min(duration, current + Math.max(0, rate - baseRate) * elapsed);
      busy = true;
      try {
        if (video) video.currentTime = next;
        else await deadline(player.seek(next));
        if (!stopped && Math.abs(target.currentTime - next) > 2) throw new Error('Seek recusado');
        // Não acumular os segundos de buffering/busy em um salto gigante.
      } catch {
        error = 'O player bloqueou o avanço por saltos. Selecione 1× para voltar ao modo normal.';
        state.stop();
      } finally { busy = false; last = performance.now(); }
    };
    window[key] = state;
    state.verified = true;
    timer = setInterval(tick, 500);
    return { ...state.snapshot(), verified:true,
      message:`Avanço por saltos: ${rate}× aproximados, sem áudio. ${target.paused ? 'Ative o play para começar. ' : ''}Use 1× para parar e restaurar o áudio.` };
  } catch (failure) {
    state.stop();
    return { ok:false, message:failure?.message || 'Não foi possível alterar a velocidade.' };
  }
}
