// Reminder state follows the Meu Tempo water-tracking item, not a finance expense.
export const WATER_REMINDER_INTERVAL_MS = 90 * 60 * 1000;
export const WATER_REMINDER_SNOOZE_MS = 20 * 60 * 1000;
export const WATER_REMINDER_INTERVAL_OPTIONS = Object.freeze([60, 90, 120]);
export const WATER_REMINDER_SNOOZE_OPTIONS = Object.freeze([10, 20, 30, 60]);
export const WATER_REMINDER_STORAGE_KEY = 'painel-water-reminder-v1';
export const WATER_REMINDER_SETTINGS_KEY = 'painel-water-reminder-settings-v1';
export const WATER_TRACKER_ITEM_ID = 'item-agua';
const REMINDER_START_HOUR = 8;
const REMINDER_END_HOUR = 20;
const DEFAULT_REMINDER_SETTINGS = Object.freeze({
  intervalMinutes:90,
  snoozeMinutes:20,
  startTime:`${String(REMINDER_START_HOUR).padStart(2, '0')}:00`,
  endTime:`${String(REMINDER_END_HOUR).padStart(2, '0')}:00`,
});
export const WATER_REMINDER_UPDATED_EVENT = 'hub-water-reminder-updated';

const asDate = value => {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

export function isWaterTrackerItem(itemId) {
  return String(itemId ?? '') === WATER_TRACKER_ITEM_ID;
}

export function isWithinWaterReminderHours(value, settings = null) {
  const date = asDate(value);
  if (!date) return false;
  const normalized = normalizeReminderSettings(settings ?? readReminderSettings());
  const startMinute = reminderTimeToMinutes(normalized.startTime);
  const endMinute = reminderTimeToMinutes(normalized.endTime);
  const currentMinute = date.getHours() * 60 + date.getMinutes();
  if (startMinute === endMinute) return false;
  return startMinute < endMinute
    ? currentMinute >= startMinute && currentMinute < endMinute
    : currentMinute >= startMinute || currentMinute < endMinute;
}

export function isWaterReminderDue({ lastLoggedAt, lastNotifiedAt = null, snoozedUntil = null, pausedUntil = null, settings = null, now = new Date() } = {}) {
  const current = asDate(now), lastLogged = asDate(lastLoggedAt), lastNotified = asDate(lastNotifiedAt);
  const normalizedSettings = normalizeReminderSettings(settings ?? readReminderSettings());
  if (!current || !lastLogged || !isWithinWaterReminderHours(current, normalizedSettings)) return false;
  const pause = asDate(pausedUntil);
  if (pause && current.getTime() < pause.getTime()) return false;
  const intervalMs = normalizedSettings.intervalMinutes * 60 * 1000;
  if (current.getTime() - lastLogged.getTime() < intervalMs) return false;
  const snooze = asDate(snoozedUntil);
  if (snooze && lastNotified && lastNotified.getTime() >= lastLogged.getTime()) return current.getTime() >= snooze.getTime();
  return !lastNotified || current.getTime() - lastNotified.getTime() >= intervalMs;
}

export function snoozeWaterReminderState(state, now = new Date()) {
  const current = asDate(now), lastLogged = asDate(state?.lastLoggedAt), lastNotified = asDate(state?.lastNotifiedAt);
  if (!current || !lastLogged || !lastNotified || lastNotified.getTime() < lastLogged.getTime()) return null;
  const pause = asDate(state?.pausedUntil);
  if (pause && current.getTime() < pause.getTime()) return state;
  const settings = normalizeReminderSettings(state?.settings);
  const snoozedUntil = new Date(current.getTime() + settings.snoozeMinutes * 60 * 1000);
  if (!Number.isFinite(snoozedUntil.getTime())) return null;
  return { ...state, snoozedUntil:snoozedUntil.toISOString(), pausedUntil:null };
}

function normalizeReminderSettings(value = {}) {
  const intervalMinutes = Number(value?.intervalMinutes), snoozeMinutes = Number(value?.snoozeMinutes);
  const startTime = reminderTimeToMinutes(value?.startTime) === null ? DEFAULT_REMINDER_SETTINGS.startTime : String(value.startTime);
  const endTime = reminderTimeToMinutes(value?.endTime) === null ? DEFAULT_REMINDER_SETTINGS.endTime : String(value.endTime);
  return {
    intervalMinutes:Number.isSafeInteger(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : DEFAULT_REMINDER_SETTINGS.intervalMinutes,
    snoozeMinutes:Number.isSafeInteger(snoozeMinutes) && snoozeMinutes > 0 ? snoozeMinutes : DEFAULT_REMINDER_SETTINGS.snoozeMinutes,
    startTime,
    endTime,
  };
}

function reminderTimeToMinutes(value) {
  const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/.exec(String(value ?? ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function isValidReminderSettings(value = {}) {
  const intervalMinutes = Number(value?.intervalMinutes), snoozeMinutes = Number(value?.snoozeMinutes);
  const startTime = reminderTimeToMinutes(value?.startTime ?? DEFAULT_REMINDER_SETTINGS.startTime);
  const endTime = reminderTimeToMinutes(value?.endTime ?? DEFAULT_REMINDER_SETTINGS.endTime);
  return Number.isSafeInteger(intervalMinutes) && intervalMinutes > 0
    && Number.isSafeInteger(snoozeMinutes) && snoozeMinutes > 0
    && startTime !== null && endTime !== null && startTime !== endTime;
}

function formatReminderInterval(minutes) {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  return `${minutes} minutos`;
}

function nextReminderWindowStart(value) {
  const current = asDate(value);
  if (!current) return null;
  const startMinute = reminderTimeToMinutes(readReminderSettings().startTime) ?? REMINDER_START_HOUR * 60;
  const date = new Date(current.getTime());
  date.setHours(Math.floor(startMinute / 60), startMinute % 60, 0, 0);
  if (date.getTime() <= current.getTime()) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function emptyReminderState() {
  return { version:1, lastLoggedAt:null, lastNotifiedAt:null, snoozedUntil:null, pausedUntil:null, settings:readReminderSettings() };
}

function readReminderSettings() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(WATER_REMINDER_SETTINGS_KEY) || 'null');
    return normalizeReminderSettings(value);
  } catch {
    return { ...DEFAULT_REMINDER_SETTINGS };
  }
}

function writeReminderSettings(settings) {
  if (!isValidReminderSettings(settings)) return false;
  const normalized = normalizeReminderSettings(settings);
  try {
    globalThis.localStorage?.setItem(WATER_REMINDER_SETTINGS_KEY, JSON.stringify(normalized));
    globalThis.dispatchEvent?.(new CustomEvent(WATER_REMINDER_UPDATED_EVENT, { detail:{ ...readReminderState(), settings:normalized } }));
    return true;
  } catch {
    return false;
  }
}

function readReminderState() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(WATER_REMINDER_STORAGE_KEY) || 'null');
    if (value?.version !== 1) return emptyReminderState();
    return {
      version:1,
      lastLoggedAt:asDate(value.lastLoggedAt)?.toISOString() || null,
      lastNotifiedAt:asDate(value.lastNotifiedAt)?.toISOString() || null,
      snoozedUntil:asDate(value.snoozedUntil)?.toISOString() || null,
      pausedUntil:asDate(value.pausedUntil)?.toISOString() || null,
      settings:readReminderSettings(),
    };
  } catch {
    return emptyReminderState();
  }
}

function writeReminderState(state) {
  try {
    const normalized = {
      version:1,
      lastLoggedAt:asDate(state?.lastLoggedAt)?.toISOString() || null,
      lastNotifiedAt:asDate(state?.lastNotifiedAt)?.toISOString() || null,
      snoozedUntil:asDate(state?.snoozedUntil)?.toISOString() || null,
      pausedUntil:asDate(state?.pausedUntil)?.toISOString() || null,
    };
    globalThis.localStorage?.setItem(WATER_REMINDER_STORAGE_KEY, JSON.stringify(normalized));
    globalThis.dispatchEvent?.(new CustomEvent(WATER_REMINDER_UPDATED_EVENT, { detail:{ ...normalized, settings:readReminderSettings() } }));
    return true;
  } catch {
    return false;
  }
}

export function readWaterReminderSettings() {
  return readReminderSettings();
}

export function saveWaterReminderSettings(settings) {
  return writeReminderSettings(settings);
}

export function pauseWaterReminderUntilTomorrow(now = new Date()) {
  const state = readReminderState();
  const pausedUntil = nextReminderWindowStart(now);
  if (!pausedUntil || !writeReminderState({ ...state, snoozedUntil:null, pausedUntil })) return null;
  return pausedUntil;
}

export function recordWaterTrackerLog({ itemId, value, now = new Date() } = {}) {
  if (!isWaterTrackerItem(itemId) || value == null || !Number.isFinite(Number(value))) return false;
  const loggedAt = asDate(now);
  if (!loggedAt) return false;
  writeReminderState({ ...readReminderState(), version:1, lastLoggedAt:loggedAt.toISOString(), lastNotifiedAt:null, snoozedUntil:null, pausedUntil:null });
  return true;
}

function formatTime(value) {
  const date = asDate(value);
  return date ? new Intl.DateTimeFormat('pt-BR', { hour:'2-digit', minute:'2-digit' }).format(date) : 'horário não disponível';
}

export function mountGlobalWaterReminder({ documentRef = globalThis.document, windowRef = globalThis.window, now = () => new Date() } = {}) {
  if (!documentRef?.body || !windowRef) return () => {};
  if (windowRef.__hubWaterReminderCleanup) return windowRef.__hubWaterReminderCleanup;
  const navigationType = windowRef.performance?.getEntriesByType?.('navigation')?.[0]?.type;
  if (navigationType === 'reload') {
    const state = readReminderState();
    if (state.lastNotifiedAt && !state.snoozedUntil) {
      const snoozedState = snoozeWaterReminderState(state, now());
      if (snoozedState) writeReminderState(snoozedState);
    }
  }

  const styleId = 'hub-water-reminder-style';
  if (!documentRef.getElementById(styleId)) {
    const style = documentRef.createElement('style');
    style.id = styleId;
    style.textContent = `
      .hub-water-reminder{position:fixed;z-index:2147483000;top:18px;right:18px;width:min(410px,calc(100vw - 36px));max-height:calc(100vh - 36px);overflow:auto;box-sizing:border-box;padding:16px 18px;border:1px solid #315579;border-left:4px solid #45d6aa;border-radius:14px;background:#102137;color:#eff6ff;box-shadow:0 16px 44px #0007;font:500 14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;animation:hub-water-reminder-in .2s ease-out}
      .hub-water-reminder[hidden],.hub-water-reminder__settings[hidden]{display:none}.hub-water-reminder__head{display:flex;align-items:center;gap:10px;margin-bottom:6px}.hub-water-reminder__head strong{font-size:15px}.hub-water-reminder__icon{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#183c55;color:#70c9ff;font-size:16px}.hub-water-reminder__configure,.hub-water-reminder__close{border:0;background:transparent;color:#9eb8d4;cursor:pointer}.hub-water-reminder__configure{margin-left:auto;font-size:17px}.hub-water-reminder__close{font-size:22px;line-height:1}.hub-water-reminder button:focus-visible,.hub-water-reminder a:focus-visible,.hub-water-reminder select:focus-visible{outline:2px solid #70c9ff;outline-offset:2px}.hub-water-reminder p{margin:0 0 12px;color:#b8cce2}.hub-water-reminder__actions{display:flex;justify-content:flex-end;gap:8px}.hub-water-reminder__actions a,.hub-water-reminder__actions button,.hub-water-reminder__settings button{padding:7px 11px;border:1px solid #315579;border-radius:9px;background:#142b43;color:#d8eaff;text-decoration:none;font:inherit;cursor:pointer}.hub-water-reminder__actions a{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;padding-block:3.35px;border-color:#228ca9;background:#1584a7;color:white;font-weight:700}.hub-water-reminder__settings{display:grid;gap:9px;margin-top:12px;padding-top:12px;border-top:1px solid #315579}.hub-water-reminder__settings label{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#c8d9eb;font-size:13px}.hub-water-reminder__settings select{max-width:140px;padding:6px 8px;border:1px solid #315579;border-radius:8px;background:#0a1728;color:#eff6ff;font:inherit}.hub-water-reminder__settings-actions{display:flex;justify-content:flex-end;gap:8px}.hub-water-reminder__settings button[data-water-reminder-pause]{border-color:#695124;background:#302515;color:#ffd071}.hub-water-reminder__settings [data-water-reminder-error]{margin:0;color:#ff9fa8;font-size:12px}.hub-water-reminder__settings [data-water-reminder-error][hidden]{display:none}
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
  banner.innerHTML = `<div class="hub-water-reminder__head"><span class="hub-water-reminder__icon" aria-hidden="true">⌁</span><strong>Hora de registrar Água</strong><button class="hub-water-reminder__configure" type="button" data-water-reminder-configure aria-label="Configurar aviso de água" title="Configurar aviso">⚙</button><button class="hub-water-reminder__close" type="button" aria-label="Dispensar lembrete">×</button></div><p data-water-reminder-message></p><div class="hub-water-reminder__actions"><button type="button" data-water-reminder-dismiss>Dispensar</button><a href="/?view=time">Abrir Meu Tempo</a></div>`;
  documentRef.body.append(banner);

  let stopped = false;
  let checking = false;
  let reminderVisible = false;
  let observedLastLoggedAt = readReminderState().lastLoggedAt;
  const hide = () => {
    banner.hidden = true;
    reminderVisible = false;
  };
  const snooze = () => {
    hide();
    const state = snoozeWaterReminderState(readReminderState(), now());
    if (state) writeReminderState(state);
  };
  const settingsButton = banner.querySelector('[data-water-reminder-configure]');
  settingsButton.addEventListener('click', () => {
    hide();
    if (!windowRef.HubSidebar?.openMenuDestination?.('notifications')) windowRef.location.href = '/?view=notifications';
  });
  banner.querySelector('.hub-water-reminder__close')?.addEventListener('click', snooze);
  banner.querySelector('[data-water-reminder-dismiss]')?.addEventListener('click', snooze);

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
        state = { ...state, lastNotifiedAt:current.toISOString(), snoozedUntil:null };
        if (!writeReminderState(state)) return;
        const message = `Já se passaram pelo menos ${formatReminderInterval(state.settings.intervalMinutes)} desde o último lançamento de Água (${formatTime(state.lastLoggedAt)}). Abra Meu Tempo para lançar.`;
        if (canUseSystemNotification) {
          try {
            const notification = new Notification('Hora de registrar Água', { body:message, tag:'hub-water-expense-reminder' });
            reminderVisible = true;
            notification.onclick = () => { windowRef.focus?.(); windowRef.location.href = '/?view=time'; notification.close(); };
            notification.onclose = snooze;
            return;
          } catch {}
        }
        banner.querySelector('p').textContent = message;
        banner.hidden = false;
        reminderVisible = true;
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
    if (event.key !== WATER_REMINDER_STORAGE_KEY && event.key !== WATER_REMINDER_SETTINGS_KEY) return;
    if (event.key === WATER_REMINDER_SETTINGS_KEY) { claimAndNotify(); return; }
    const state = readReminderState();
    const newLog = state.lastLoggedAt !== observedLastLoggedAt;
    observedLastLoggedAt = state.lastLoggedAt;
    const pausedUntil = asDate(state.pausedUntil);
    if (newLog || !state.lastLoggedAt || (state.lastNotifiedAt && state.lastNotifiedAt >= state.lastLoggedAt) || (pausedUntil && pausedUntil > now())) hide();
    claimAndNotify();
  };
  const handlePageHide = () => { if (reminderVisible) snooze(); };
  const handleUpdate = event => {
    const state = event.detail || readReminderState();
    const newLog = state.lastLoggedAt !== observedLastLoggedAt;
    observedLastLoggedAt = state.lastLoggedAt;
    const pausedUntil = asDate(state.pausedUntil);
    if (newLog || !state.lastLoggedAt || !state.lastNotifiedAt || (pausedUntil && pausedUntil > now())) hide();
    claimAndNotify();
  };
  documentRef.addEventListener('visibilitychange', handleVisibility);
  windowRef.addEventListener('focus', handleVisibility);
  windowRef.addEventListener('storage', handleStorage);
  windowRef.addEventListener('pagehide', handlePageHide);
  windowRef.addEventListener(WATER_REMINDER_UPDATED_EVENT, handleUpdate);
  claimAndNotify();

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    windowRef.clearInterval(timer);
    documentRef.removeEventListener('visibilitychange', handleVisibility);
    windowRef.removeEventListener('focus', handleVisibility);
    windowRef.removeEventListener('storage', handleStorage);
    windowRef.removeEventListener('pagehide', handlePageHide);
    windowRef.removeEventListener(WATER_REMINDER_UPDATED_EVENT, handleUpdate);
    banner.remove();
    delete windowRef.__hubWaterReminderCleanup;
  };
  windowRef.__hubWaterReminderCleanup = cleanup;
  return cleanup;
}
