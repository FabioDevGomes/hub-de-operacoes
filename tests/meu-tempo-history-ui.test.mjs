import assert from'node:assert/strict';
import{productiveTotalHighlightClass}from'../src/meu-tempo/meu-tempo-view.mjs';

assert.equal(productiveTotalHighlightClass(480),'','exatamente oito horas não recebem destaque');
assert.equal(productiveTotalHighlightClass(481),'time-over-eight-hours','qualquer quantidade acima de oito horas recebe destaque');
assert.equal(productiveTotalHighlightClass('540'),'time-over-eight-hours','valores numéricos recebidos como texto também são tratados corretamente');
assert.equal(productiveTotalHighlightClass(null),'','valor ausente não recebe destaque');

console.log('meu tempo history UI ok');
