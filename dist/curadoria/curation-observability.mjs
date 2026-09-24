import * as Domain from './curation-observability-domain.mjs';
import * as Storage from './curation-observability-storage.mjs';

// Keep page-load work out of the curatorial screens; IndexedDB is opened on first write or when the history view mounts.
export const ready=Promise.resolve();

export async function recordAssessment({origin,subjectId,productKey,productName,offerRefs=[],kind,assessment,summary={}}){
  const eventType=kind==='trends'?'trends_saved':kind==='images'?'images_saved':null;
  if(!eventType)throw new Error('Tipo de avaliação de Curadoria desconhecido.');
  return Storage.recordAction(Domain.createAssessmentEvent({origin,subjectId,productKey,productName,offerRefs,assessment,eventType,summary}));
}

export async function recordGlimpse({origin,subjectId,productKey,productName,offerRefs=[],analysis}){
  return Storage.recordAction(Domain.createGlimpseEvent({origin,subjectId,productKey,productName,offerRefs,analysis}));
}

export async function recordDecision(input){
  const bundle=Domain.createDecisionBundle(input);
  return Storage.recordDecisionBundle(bundle);
}

export function suggestOperationalCandidates(events,productName){
  return Domain.summarizeOperationalCandidates(events,productName);
}

export const Repository=Storage;
export const Model=Domain;
