// Reminder state follows the Meu Tempo water-tracking item, not a finance expense.
export const WATER_REMINDER_INTERVAL_MS = 90 * 60 * 1000;
export const WATER_REMINDER_STORAGE_KEY = 'painel-water-reminder-v1';
export const WATER_TRACKER_ITEM_ID = 'item-agua';
const REMINDER_START_HOUR = 8;
const REMINDER_END_HOUR = 20;
const UPDATE_EVENT = 'hub-water-reminder-updated';

const asDate = value => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

export function isWaterTrackerItem(itemId) {
  return String(itemId ?? '') === WATER_TRACKER_ITEM_ID;
}

export function isWithinWaterReminderHours(value) {
  const date = asDate(value);
  return Boolean(date && date.getHours() >= REMINDER_START_HOUR && date.getHours() < REMINDER_END_HOUR);
}

export function isWaterReminderDue({ lastLoggedAt, lastNotifiedAt = null, now = new Date() } = {}) {
  const current = asDate(now), lastLogged = asDate(lastLoggedAt), lastNotified = asDate(lastNotifiedAt);
  if (!current || !lastLogged || !isWithinWaterReminderHours(current)) return false;
  if (current.getTime() - lastLogged.getTime() < WATER_REMINDER_INTERVAL_MS) return false;
  return !lastNotified || current.getTime() - lastNotified.getTime() >= WATER_REMINDER_INTERVAL_MS;
}

function readReminderState() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(WATER_REMINDER_STORAGE_KEY) || 'null');
    if (value?.version !== 1) return { version:1, lastLoggedAt:null, lastNotifiedAt:null };
    return {
      version:1,
      lastLoggedAt:asDate(value.lastLoggedAt)?.toISOString() || null,
      lastNotifiedAt:asDate(value.lastNotifiedAt)?.toISOString() || null,
    };
  } catch {
    return { version:1, lastLoggedAt:null, lastNotifiedAt:null };
  }
}

function writeReminderState(state) {
  try {
    globalThis.localStorage?.setItem(WATER_REMINDER_STORAGE_KEY, JSON.stringify(state));
    globalThis.dispatchEvent?.(new CustomEvent(UPDATE_EVENT, { detail:state }));
    return true;
  } catch {
    return false;
  }
}

export function recordWaterTrackerLog({ itemId, value, now = new Date() } = {}) {
  if (!isWaterTrackerItem(itemId) || value == null || !Number.isFinite(Number(value))) return false;
  const loggedAt = asDate(now);
  if (!loggedAt) return false;
  writeReminderState({ version:1, lastLoggedAt:loggedAt.toISOString(), lastNotifiedAt:null });
  return true;
}

function formatTime(value) {
  const date = asDate(value);
  return date ? new Intl.DateTimeFormat('pt-BR', { hour:'2-digit', minute:'2-digit' }).format(date) : 'horário não disponível';
}

export function mountGlobalWaterReminder({ documentRef = globalThis.document, windowRef = globalThis.window, now = () => new Date() } = {}) {
  if (!documentRef?.body || !windowRef) return () => {};
  if (windowRef.__hubWaterReminderCleanup) return windowRef.__hubWaterReminderCleanup;

  const styleId = 'hub-water-reminder-style';
  if (!documentRef.getElementById(styleId)) {
    const style = documentRef.createElement('style');
    style.id = styleId;
    style.textContent = `
      .hub-water-reminder{position:fixed;z-index:2147483000;top:18px;right:18px;width:min(410px,calc(100vw - 36px));box-sizing:border-box;padding:16px 18px;border:1px solid #315579;border-left:4px solid #45d6aa;border-radius:14px;background:#102137;color:#eff6ff;box-shadow:0 16px 44px #0007;font:500 14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;animation:hub-water-reminder-in .2s ease-out}
      .hub-water-reminder[hidden]{display:none}.hub-water-reminder__head{display:flex;align-items:center;gap:10px;margin-bottom:6px}.hub-water-reminder__head strong{font-size:15px}.hub-water-reminder__icon{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#183c55;color:#70c9ff;font-size:16px}.hub-water-reminder__close{margin-left:auto;border:0;background:transparent;color:#9eb8d4;font-size:22px;line-height:1;cursor:pointer}.hub-water-reminder p{margin:0 0 12px;color:#b8cce2}.hub-water-reminder__actions{display:flex;justify-content:flex-end;gap:8px}.hub-water-reminder__actions a,.hub-water-reminder__actions button{padding:7px 11px;border:1px solid #315579;border-radius:9px;background:#142b43;color:#d8eaff;text-decoration:none;font:inherit;cursor:pointer}.hub-water-reminder__actions a{border-color:#228ca9;background:#1584a7;color:white;font-weight:700}
      @keyframes hub-water-reminder-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
      @media(prefers-reduced-motion:reduce){.hub-water-reminder{animation:none}}
    `;
    documentRef.head?.append(style);
  }

  const banner = documentRef.createElement('section');
  banner.className = 'hub-water-reminder';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.hidden = true;
  banner.innerHTML = '<div class="hub-water-reminder__head"><span class="hub-water-reminder__icon" aria-hidden="true">⌁</span><strong>Hora de registrar Água</strong><button class="hub-water-reminder__close" type="button" aria-label="Dispensar lembrete">×</button></div><p></p><div class="hub-water-reminder__actions"><button type="button" data-water-reminder-dismiss>Dispensar</button><a href="/?view=time">Abrir Meu Tempo</a></div>';
  documentRef.body.append(banner);

  let stopped = false;
  let checking = false;
  let observedLastLoggedAt = readReminderState().lastLoggedAt;
  const dismiss = () => { banner.hidden = true; };
  banner.querySelector('.hub-water-reminder__close')?.addEventListener('click', dismiss);
  banner.querySelector('[data-water-reminder-dismiss]')?.addEventListener('click', dismiss);

  async function claimAndNotify() {
    if (checking || stopped) return;
    checking = true;
    try {
      const notifyOnce = async () => {
        const current = asDate(now());
        let state = readReminderState();
        if (!isWaterReminderDue({ ...state, now:current })) return;
        const isVisible = documentRef.visibilityState !== 'hidden';
        const canUseSystemNotification = !isVisible && globalThis.Notification?.permission === 'granted';
        if (!isVisible && !canUseSystemNotification) return;
        state = { ...state, lastNotifiedAt:current.toISOString() };
        if (!writeReminderState(state)) return;
        const message = `Já se passaram pelo menos 90 minutos desde o último lançamento de Água (${formatTime(state.lastLoggedAt)}). Abra Meu Tempo para lançar.`;
        if (canUseSystemNotification) {
          try {
            const notification = new Notification('Hora de registrar Água', { body:message, tag:'hub-water-expense-reminder' });
            notification.onclick = () => { windowRef.focus?.(); windowRef.location.href = '/?view=time'; notification.close(); };
            return;
          } catch {}
        }
        banner.querySelector('p').textContent = message;
        banner.hidden = false;
      };

      if (globalThis.navigator?.locks?.request) {
        await navigator.locks.request('hub-water-reminder-notification', { ifAvailable:true }, lock => lock ? notifyOnce() : undefined);
      } else {
        await notifyOnce();
      }
    } catch {
      // Falha de notificação não deve interferir com a navegação ou com os lançamentos.
    } finally {
      checking = false;
    }
  }

  const timer = windowRef.setInterval(claimAndNotify, 30_000);
  const handleVisibility = () => { if (documentRef.visibilityState !== 'hidden') claimAndNotify(); };
  const handleStorage = event => {
    if (event.key !== WATER_REMINDER_STORAGE_KEY) return;
    const state = readReminderState();
    const newLog = state.lastLoggedAt !== observedLastLoggedAt;
    observedLastLoggedAt = state.lastLoggedAt;
    if (newLog || !state.lastLoggedAt || (state.lastNotifiedAt && state.lastNotifiedAt >= state.lastLoggedAt)) dismiss();
    claimAndNotify();
  };
  const handleUpdate = event => {
    const state = event.detail || readReminderState();
    const newLog = state.lastLoggedAt !== observedLastLoggedAt;
    observedLastLoggedAt = state.lastLoggedAt;
    if (newLog || !state.lastLoggedAt || !state.lastNotifiedAt) dismiss();
    claimAndNotify();
  };
  documentRef.addEventListener('visibilitychange', handleVisibility);
  windowRef.addEventListener('focus', handleVisibility);
  windowRef.addEventListener('storage', handleStorage);
  windowRef.addEventListener(UPDATE_EVENT, handleUpdate);
  claimAndNotify();

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    windowRef.clearInterval(timer);
    documentRef.removeEventListener('visibilitychange', handleVisibility);
    windowRef.removeEventListener('focus', handleVisibility);
    windowRef.removeEventListener('storage', handleStorage);
    windowRef.removeEventListener(UPDATE_EVENT, handleUpdate);
    banner.remove();
    delete windowRef.__hubWaterReminderCleanup;
  };
  windowRef.__hubWaterReminderCleanup = cleanup;
  return cleanup;
}
