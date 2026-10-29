import * as DecisionUI from '../decision-ui.mjs?v=curation-decision-market-scope-1';

export function normalizePageClassification(value){return value==='review'||value==='cookies'?value:null}
export function pageClassificationLabel(value){const normalized=normalizePageClassification(value);return normalized==='cookies'?'cookies':normalized==='review'?'review':''}
const MARKET_SCOPES=new Set(['world','one-country','some-countries']);
export function normalizeMarketScope(value){return MARKET_SCOPES.has(value)?value:null}
export function marketScopeLabel(value){const normalized=normalizeMarketScope(value);return normalized==='world'?'Mundo':normalized==='one-country'?'Um país':normalized==='some-countries'?'Alguns países':''}

export const DEFAULT_DECISION=DecisionUI.DEFAULT_DECISION;
export const OPTIONS=Object.freeze([
  ...DecisionUI.DECISION_OPTIONS.slice(0,4),
  Object.freeze({value:'Solicitação Enviada',tone:'review'}),
  Object.freeze({value:'Precisa de aprovação',tone:'review'}),
  ...DecisionUI.DECISION_OPTIONS.slice(4)
]);

export function normalizeDecision(value){return DecisionUI.normalizeDecision(value,OPTIONS)}
export function rowClass(value){return DecisionUI.rowClass(value,OPTIONS)}
export function buttonHtml(value,attribute,identity){return DecisionUI.buttonHtml(value,attribute,identity,OPTIONS)}
export function openDecisionPicker(settings){return DecisionUI.openDecisionPicker({...settings,options:OPTIONS})}
