import {DECISION_OPTIONS} from '../decision-ui.mjs?v=curation-app-option-1';

export const GURU_MEDIA_DECISION_OPTIONS=Object.freeze([
  ...DECISION_OPTIONS,
  Object.freeze({value:'App',tone:'app'}),
  Object.freeze({value:'DTC',tone:'dtc'}),
  Object.freeze({value:'Solicitação enviada',tone:'request-sent'}),
  Object.freeze({value:'VSL',tone:'vsl'}),
  Object.freeze({value:'Precisa de VPN',tone:'vpn'}),
  Object.freeze({value:'Coletar dados',tone:'collect'}),
  Object.freeze({value:'Coleta concluída',tone:'collection-complete'})
]);
