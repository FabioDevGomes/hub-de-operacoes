// Reminder state follows the Meu Tempo water-tracking item, not a finance expense.
export const WATER_REMINDER_INTERVAL_MS = 90 * 60 * 1000;
export const WATER_REMINDER_SNOOZE_MS = 20 * 60 * 1000;
export const WATER_REMINDER_INTERVAL_OPTIONS = Object.freeze([60, 90, 120]);
export const WATER_REMINDER_SNOOZE_OPTIONS = Object.freeze([10, 20, 30, 60]);
export const WATER_REMINDER_STORAGE_KEY = 'painel-water-reminder-v1';
export const WATER_REMINDER_SETTINGS_KEY = 'painel-water-reminder-settings-v1';
export const WATER_TRACKER_ITEM_ID = 'item-agua';
const DEFAULT_REMINDER_SETTINGS = Object.freeze({ intervalMinutes:90, snoozeMinutes:20 });
const REMINDER_START_HOUR = 8;
const REMINDER_END_HOUR = 20;
const UPDATE_EVENT = 'hub-water-reminder-updated';

const asDate = value => {
  if (value == null || value === '') return null;
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

export function isWaterReminderDue({ lastLoggedAt, lastNotifiedAt = null, snoozedUntil = null, pausedUntil = null, settings = null, now = new Date() } = {}) {
  const current = asDate(now), lastLogged = asDate(lastLoggedAt), lastNotified = asDate(lastNotifiedAt);
  if (!current || !lastLogged || !isWithinWaterReminderHours(current)) return false;
  const pause = asDate(pausedUntil);
  if (pause && current.getTime() < pause.getTime()) return false;
  const intervalMs = normalizeReminderSettings(settings).intervalMinutes * 60 * 1000;
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
  return { ...state, snoozedUntil:new Date(current.getTime() + settings.snoozeMinutes * 60 * 1000).toISOString(), pausedUntil:null };
}

function normalizeReminderSettings(value = {}) {
  const intervalMinutes = Number(value?.intervalMinutes), snoozeMinutes = Number(value?.snoozeMinutes);
  return {
    intervalMinutes:WATER_REMINDER_INTERVAL_OPTIONS.includes(intervalMinutes) ? intervalMinutes : DEFAULT_REMINDER_SETTINGS.intervalMinutes,
    snoozeMinutes:WATER_REMINDER_SNOOZE_OPTIONS.includes(snoozeMinutes) ? snoozeMinutes : DEFAULT_REMINDER_SETTINGS.snoozeMinutes,
  };
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
  const date = new Date(current.getTime());
  date.setHours(REMINDER_START_HOUR, 0, 0, 0);
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
  const normalized = normalizeReminderSettings(settings);
  try {
    globalThis.localStorage?.setItem(WATER_REMINDER_SETTINGS_KEY, JSON.stringify(normalized));
    globalThis.dispatchEvent?.(new CustomEvent(UPDATE_EVENT, { detail:{ ...readReminderState(), settings:normalized } }));
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
    globalThis.dispatchEvent?.(new CustomEvent(UPDATE_EVENT, { detail:{ ...normalized, settings:readReminderSettings() } }));
    return true;
  } catch {
    return false;
  }
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

function optionMarkup(values, selectedValue, format) {
  return values.map(value => `<option value="${value}"${value === selectedValue ? ' selected' : ''}>${format(value)}</option>`).join('');
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
      .hub-water-reminder[hidden],.hub-water-reminder__settings[hidden]{display:none}.hub-water-reminder__head{display:flex;align-items:center;gap:10px;margin-bottom:6px}.hub-water-reminder__head strong{font-size:15px}.hub-water-reminder__icon{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#183c55;color:#70c9ff;font-size:16px}.hub-water-reminder__configure,.hub-water-reminder__close{border:0;background:transparent;color:#9eb8d4;cursor:pointer}.hub-water-reminder__configure{margin-left:auto;font-size:17px}.hub-water-reminder__close{font-size:22px;line-height:1}.hub-water-reminder button:focus-visible,.hub-water-reminder a:focus-visible,.hub-water-reminder select:focus-visible{outline:2px solid #70c9ff;outline-offset:2px}.hub-water-reminder p{margin:0 0 12px;color:#b8cce2}.hub-water-reminder__actions{display:flex;justify-content:flex-end;gap:8px}.hub-water-reminder__actions a,.hub-water-reminder__actions button,.hub-water-reminder__settings button{padding:7px 11px;border:1px solid #315579;border-radius:9px;background:#142b43;color:#d8eaff;text-decoration:none;font:inherit;cursor:pointer}.hub-water-reminder__actions a{border-color:#228ca9;background:#1584a7;color:white;font-weight:700}.hub-water-reminder__settings{display:grid;gap:9px;margin-top:12px;padding-top:12px;border-top:1px solid #315579}.hub-water-reminder__settings label{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#c8d9eb;font-size:13px}.hub-water-reminder__settings select{max-width:140px;padding:6px 8px;border:1px solid #315579;border-radius:8px;background:#0a1728;color:#eff6ff;font:inherit}.hub-water-reminder__settings-actions{display:flex;justify-content:flex-end;gap:8px}.hub-water-reminder__settings button[data-water-reminder-pause]{border-color:#695124;background:#302515;color:#ffd071}.hub-water-reminder__settings [data-water-reminder-error]{margin:0;color:#ff9fa8;font-size:12px}.hub-water-reminder__settings [data-water-reminder-error][hidden]{display:none}
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
  banner.innerHTML = `<div class="hub-water-reminder__head"><span class="hub-water-reminder__icon" aria-hidden="true">⌁</span><strong>Hora de registrar Água</strong><button class="hub-water-reminder__configure" type="button" data-water-reminder-configure aria-label="Configurar aviso de água" aria-expanded="false" title="Configurar aviso">⚙</button><button class="hub-water-reminder__close" type="button" aria-label="Dispensar lembrete">×</button></div><p data-water-reminder-message></p><div class="hub-water-reminder__actions"><button type="button" data-water-reminder-dismiss>Dispensar</button><a href="/?view=time">Abrir Meu Tempo</a></div><div class="hub-water-reminder__settings" data-water-reminder-settings hidden><label>Intervalo entre avisos<select data-water-reminder-interval>${optionMarkup(WATER_REMINDER_INTERVAL_OPTIONS, DEFAULT_REMINDER_SETTINGS.intervalMinutes, value => formatReminderInterval(value))}</select></label><label>Reaparecer após dispensar<select data-water-reminder-snooze>${optionMarkup(WATER_REMINDER_SNOOZE_OPTIONS, DEFAULT_REMINDER_SETTINGS.snoozeMinutes, value => `${value} minutos`)}</select></label><p data-water-reminder-error role="alert" hidden></p><div class="hub-water-reminder__settings-actions"><button type="button" data-water-reminder-cancel>Cancelar</button><button type="button" data-water-reminder-save>Salvar opções</button></div><button type="button" data-water-reminder-pause>Não avisar até amanhã</button></div>`;
  documentRef.body.append(banner);

  let stopped = false;
  let checking = false;
  let reminderVisible = false;
  let observedLastLoggedAt = readReminderState().lastLoggedAt;
  const hide = () => {
    banner.hidden = true;
    reminderVisible = false;
    const panel = banner.querySelector('[data-water-reminder-settings]');
    panel.hidden = true;
    banner.querySelector('[data-water-reminder-configure]')?.setAttribute('aria-expanded', 'false');
  };
  const snooze = () => {
    hide();
    const state = snoozeWaterReminderState(readReminderState(), now());
    if (state) writeReminderState(state);
  };
  const settingsPanel = banner.querySelector('[data-water-reminder-settings]');
  const settingsButton = banner.querySelector('[data-water-reminder-configure]');
  const intervalSelect = banner.querySelector('[data-water-reminder-interval]');
  const snoozeSelect = banner.querySelector('[data-water-reminder-snooze]');
  const settingsError = banner.querySelector('[data-water-reminder-error]');
  const fillSettings = settings => {
    const normalized = normalizeReminderSettings(settings);
    intervalSelect.value = String(normalized.intervalMinutes);
    snoozeSelect.value = String(normalized.snoozeMinutes);
    settingsError.hidden = true;
    settingsError.textContent = '';
  };
  const closeSettings = () => {
    settingsPanel.hidden = true;
    settingsButton.setAttribute('aria-expanded', 'false');
    fillSettings(readReminderState().settings);
  };
  const showSettings = () => {
    fillSettings(readReminderState().settings);
    settingsPanel.hidden = false;
    settingsButton.setAttribute('aria-expanded', 'true');
  };
  settingsButton.addEventListener('click', () => settingsPanel.hidden ? showSettings() : closeSettings());
  banner.querySelector('[data-water-reminder-cancel]')?.addEventListener('click', closeSettings);
  banner.querySelector('[data-water-reminder-save]')?.addEventListener('click', () => {
    const state = readReminderState();
    const settings = normalizeReminderSettings({ intervalMinutes:Number(intervalSelect.value), snoozeMinutes:Number(snoozeSelect.value) });
    if (!writeReminderSettings(settings)) {
      settingsError.textContent = 'Não foi possível salvar as opções neste navegador.';
      settingsError.hidden = false;
      return;
    }
    banner.querySelector('[data-water-reminder-message]').textContent = `Já se passaram pelo menos ${formatReminderInterval(settings.intervalMinutes)} desde o último lançamento de Água (${formatTime(state.lastLoggedAt)}). Abra Meu Tempo para lançar.`;
    closeSettings();
  });
  banner.querySelector('[data-water-reminder-pause]')?.addEventListener('click', () => {
    const state = readReminderState(), pausedUntil = nextReminderWindowStart(now());
    if (!pausedUntil || !writeReminderState({ ...state, snoozedUntil:null, pausedUntil })) {
      settingsError.textContent = 'Não foi possível salvar a pausa neste navegador.';
      settingsError.hidden = false;
      return;
    }
    hide();
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
    if (newLog || !state.lastLoggedAt || (state.lastNotifiedAt && state.lastNotifiedAt >= state.lastLoggedAt)) hide();
    claimAndNotify();
  };
  const handlePageHide = () => { if (reminderVisible) snooze(); };
  const handleUpdate = event => {
    const state = event.detail || readReminderState();
    const newLog = state.lastLoggedAt !== observedLastLoggedAt;
    observedLastLoggedAt = state.lastLoggedAt;
    if (newLog || !state.lastLoggedAt || !state.lastNotifiedAt) hide();
    claimAndNotify();
  };
  documentRef.addEventListener('visibilitychange', handleVisibility);
  windowRef.addEventListener('focus', handleVisibility);
  windowRef.addEventListener('storage', handleStorage);
  windowRef.addEventListener('pagehide', handlePageHide);
  windowRef.addEventListener(UPDATE_EVENT, handleUpdate);
  claimAndNotify();

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    windowRef.clearInterval(timer);
    documentRef.removeEventListener('visibilitychange', handleVisibility);
    windowRef.removeEventListener('focus', handleVisibility);
    windowRef.removeEventListener('storage', handleStorage);
    windowRef.removeEventListener('pagehide', handlePageHide);
    windowRef.removeEventListener(UPDATE_EVENT, handleUpdate);
    banner.remove();
    delete windowRef.__hubWaterReminderCleanup;
  };
  windowRef.__hubWaterReminderCleanup = cleanup;
  return cleanup;
}
