import * as DecisionUI from '../decision-ui.mjs?v=curation-decision-options-1';

export const DEFAULT_DECISION=DecisionUI.DEFAULT_DECISION;
export const OPTIONS=Object.freeze([
  ...DecisionUI.DECISION_OPTIONS.slice(0,4),
  Object.freeze({value:'Solicitação Enviada',tone:'review'}),
  ...DecisionUI.DECISION_OPTIONS.slice(4)
]);

export function normalizeDecision(value){return DecisionUI.normalizeDecision(value,OPTIONS)}
export function rowClass(value){return DecisionUI.rowClass(value,OPTIONS)}
export function buttonHtml(value,attribute,identity){return DecisionUI.buttonHtml(value,attribute,identity,OPTIONS)}
export function openDecisionPicker(settings){return DecisionUI.openDecisionPicker({...settings,options:OPTIONS})}
