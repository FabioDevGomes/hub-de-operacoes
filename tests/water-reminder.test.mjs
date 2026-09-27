import assert from 'node:assert/strict';
import { isWaterReminderDue, isWithinWaterReminderHours, isWaterTrackerItem, recordWaterTrackerLog, WATER_REMINDER_INTERVAL_MS } from '../src/meu-tempo/water-reminder.mjs';

assert.equal(WATER_REMINDER_INTERVAL_MS, 90 * 60 * 1000, 'o lembrete de Água repete a cada 90 minutos');
assert.equal(isWaterTrackerItem('item-agua'), true, 'o lembrete acompanha o item Água do Meu Tempo');
assert.equal(isWaterTrackerItem('item-energia'), false, 'o lembrete não acompanha outros itens do Meu Tempo');
assert.equal(recordWaterTrackerLog({ itemId:'item-agua', value:0, now:new Date(2026, 8, 26, 10) }), true, 'lançar zero explicitamente também registra o momento em Água');
assert.equal(recordWaterTrackerLog({ itemId:'item-agua', value:null, now:new Date(2026, 8, 26, 10) }), false, 'valor ausente não registra um novo lançamento');
assert.equal(recordWaterTrackerLog({ itemId:'item-energia', value:25, now:new Date(2026, 8, 26, 10) }), false, 'lançar outro item não reinicia o lembrete');
assert.equal(isWithinWaterReminderHours(new Date(2026, 8, 26, 7, 59)), false, 'o lembrete não é mostrado antes das 8h');
assert.equal(isWithinWaterReminderHours(new Date(2026, 8, 26, 8, 0)), true, 'o lembrete pode começar às 8h');
assert.equal(isWithinWaterReminderHours(new Date(2026, 8, 26, 19, 59)), true, 'o lembrete pode ser mostrado até antes das 20h');
assert.equal(isWithinWaterReminderHours(new Date(2026, 8, 26, 20, 0)), false, 'o lembrete para às 20h');
assert.equal(isWaterReminderDue({ lastLoggedAt:new Date(2026, 8, 26, 10, 30), now:new Date(2026, 8, 26, 11, 59) }), false, 'o primeiro aviso só vence depois de 90 minutos completos');
assert.equal(isWaterReminderDue({ lastLoggedAt:new Date(2026, 8, 26, 10, 30), now:new Date(2026, 8, 26, 12, 0) }), true, 'o primeiro aviso vence após 90 minutos sem lançamento');
assert.equal(isWaterReminderDue({ lastLoggedAt:new Date(2026, 8, 26, 10, 30), lastNotifiedAt:new Date(2026, 8, 26, 11, 0), now:new Date(2026, 8, 26, 12, 29) }), false, 'avisos seguintes respeitam mais 90 minutos desde a notificação anterior');
assert.equal(isWaterReminderDue({ lastLoggedAt:new Date(2026, 8, 26, 10, 30), lastNotifiedAt:new Date(2026, 8, 26, 11, 0), now:new Date(2026, 8, 26, 12, 30) }), true, 'o próximo aviso vence após outros 90 minutos');
assert.equal(isWaterReminderDue({ lastLoggedAt:new Date(2026, 8, 26, 6, 0), now:new Date(2026, 8, 26, 8, 0) }), true, 'um lembrete vencido durante a noite pode ser mostrado às 8h');
assert.equal(isWaterReminderDue({ lastLoggedAt:new Date(2026, 8, 26, 10, 0), now:new Date(2026, 8, 26, 20, 0) }), false, 'um lembrete vencido às 20h aguarda o próximo horário permitido');

console.log('lembrete global de Água do Meu Tempo ok');
