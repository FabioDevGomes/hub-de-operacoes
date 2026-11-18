import {
  readWaterReminderSettings,
  saveWaterReminderSettings,
  pauseWaterReminderUntilTomorrow,
} from './water-reminder.mjs?v=8';
import {
  readCampaignImpressionThreshold,
  saveCampaignImpressionThreshold,
} from '../google-ads/campaign-impression-notification.mjs?v=3';

function setStatus(status, message, isError = false) {
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

export function mount({ root } = {}) {
  if (!root) throw new Error('Contêiner de Notificações não encontrado.');
  const settings = readWaterReminderSettings();
  const impressionThreshold = readCampaignImpressionThreshold();
  root.innerHTML = `<div class="water-reminder-settings-view">
    <section class="card time-panel water-reminder-settings-card" aria-labelledby="waterReminderSettingsTitle">
      <div class="time-panel-head"><h2 id="waterReminderSettingsTitle">Notificação de água</h2></div>
      <form class="water-reminder-settings-form" data-water-reminder-settings-form>
        <label class="water-reminder-settings-field">Intervalo entre avisos (minutos)
          <input class="time-select water-reminder-settings-select" name="intervalMinutes" type="number" min="1" step="1" required value="${settings.intervalMinutes}">
        </label>
        <label class="water-reminder-settings-field">Reaparecer após dispensar (minutos)
          <input class="time-select water-reminder-settings-select" name="snoozeMinutes" type="number" min="1" step="1" required value="${settings.snoozeMinutes}">
        </label>
        <div class="water-reminder-settings-time-grid">
          <label class="water-reminder-settings-field">Início do horário de notificação
            <input class="time-select water-reminder-settings-select" name="startTime" type="time" required value="${settings.startTime}">
          </label>
          <label class="water-reminder-settings-field">Fim do horário de notificação
            <input class="time-select water-reminder-settings-select" name="endTime" type="time" required value="${settings.endTime}">
          </label>
        </div>
        <p class="water-reminder-settings-description">Os horários podem atravessar a meia-noite, mas não podem ser iguais.</p>
        <div class="water-reminder-settings-actions">
          <button type="submit" class="btn primary">Salvar configurações</button>
        </div>
      </form>
      <p class="water-reminder-settings-status" data-water-reminder-settings-status role="status" aria-live="polite"></p>
      <div class="water-reminder-settings-pause">
        <button type="button" class="btn" data-water-reminder-pause-until-tomorrow>Não avisar até amanhã</button>
      </div>
    </section>
    <section class="card time-panel water-reminder-settings-card" aria-labelledby="campaignImpressionSettingsTitle">
      <div class="time-panel-head"><h2 id="campaignImpressionSettingsTitle">Notificação de impressões</h2></div>
      <p class="water-reminder-settings-description">Receba um aviso informativo quando uma campanha registrar essa quantidade de impressões no dia. O alerta ajuda a acompanhar a entrega da campanha e não exige nenhuma ação.</p>
      <form class="water-reminder-settings-form" data-campaign-impression-settings-form>
        <label class="water-reminder-settings-field" for="campaignImpressionThreshold">Impressões para avisar
          <input class="time-select water-reminder-settings-select" id="campaignImpressionThreshold" name="threshold" type="number" min="1" step="1" required value="${impressionThreshold}">
        </label>
        <div class="water-reminder-settings-actions">
          <button type="submit" class="btn primary">Salvar alerta</button>
        </div>
      </form>
      <p class="water-reminder-settings-status" data-campaign-impression-settings-status role="status" aria-live="polite"></p>
    </section>
  </div>`;

  const form = root.querySelector('[data-water-reminder-settings-form]');
  const status = root.querySelector('[data-water-reminder-settings-status]');
  const impressionForm = root.querySelector('[data-campaign-impression-settings-form]');
  const impressionStatus = root.querySelector('[data-campaign-impression-settings-status]');
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity?.();
      setStatus(status, 'Informe minutos inteiros maiores que zero e horários válidos.', true);
      return;
    }
    const values = new FormData(form);
    const startTime = String(values.get('startTime') || ''), endTime = String(values.get('endTime') || '');
    if (startTime === endTime) {
      setStatus(status, 'Os horários de início e fim não podem ser iguais.', true);
      return;
    }
    const saved = saveWaterReminderSettings({
      intervalMinutes:Number(values.get('intervalMinutes')),
      snoozeMinutes:Number(values.get('snoozeMinutes')),
      startTime,
      endTime,
    });
    setStatus(status, saved ? 'Configurações salvas.' : 'Não foi possível salvar as opções neste navegador.', !saved);
  });
  impressionForm.addEventListener('submit', event => {
    event.preventDefault();
    const input = impressionForm.elements.namedItem('threshold');
    const saved = input.validity.valid && saveCampaignImpressionThreshold(input.valueAsNumber);
    setStatus(impressionStatus, saved ? 'Alerta salvo.' : 'Informe um número inteiro maior que zero.', !saved);
  });
  root.querySelector('[data-water-reminder-pause-until-tomorrow]').addEventListener('click', () => {
    const pausedUntil = pauseWaterReminderUntilTomorrow();
    if (!pausedUntil) {
      setStatus(status, 'Não foi possível salvar a pausa neste navegador.', true);
      return;
    }
    const resumeAt = new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }).format(new Date(pausedUntil));
    setStatus(status, `Avisos pausados até ${resumeAt}.`);
  });
}
