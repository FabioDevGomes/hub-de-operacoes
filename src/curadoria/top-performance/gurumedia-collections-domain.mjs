import * as Domain from './top-performance-domain.mjs?v=2';
import {GURU_MEDIA_SCOPES,collectionScope,categoryScope,scopeByKey} from './gurumedia-scopes.mjs?v=1';

// Projection only: older captures remain untouched and are assigned by their
// explicit source format, not by names, payout, GEO or the latest global list.
export function projectGuruMediaCollections(offers=[],collections=[],snapshots=[]){
  const snapshotsByCollection=new Map(),states=new Map(),latestByScope=new Map(),knownByScope=new Map();
  for(const row of snapshots){const rows=snapshotsByCollection.get(row.collectionId)||[];rows.push(row);snapshotsByCollection.set(row.collectionId,rows)}
  const previousByScope=new Map();
  for(const collection of [...collections].sort((a,b)=>String(a.capturedAt).localeCompare(String(b.capturedAt)))){
    const scope=collectionScope(collection);if(!scope)continue;
    const rows=snapshotsByCollection.get(collection.collectionId)||[],previous=previousByScope.get(scope.key)||[];
    const complete=collection.parsedCount===collection.declaredCount&&rows.length===collection.parsedCount;
    const known=knownByScope.get(scope.key)||new Set(),comparison=Domain.compareCollections(rows,previous,[...known]);
    for(const entry of comparison.entries){
      if(entry.movement==='exited'&&!complete)continue;
      const scopes=states.get(entry.offerId)||new Map();
      scopes.set(scope.key,{presentInLatestCollection:entry.movement!=='exited',latestMovement:entry.movement,positionDelta:entry.positionDelta,latestSourceOrder:entry.currentOrder,latestCollectionId:collection.collectionId,capturedAt:collection.capturedAt});
      states.set(entry.offerId,scopes);
    }
    for(const row of rows)known.add(row.offerId);knownByScope.set(scope.key,known);
    if(complete)previousByScope.set(scope.key,rows);
    latestByScope.set(scope.key,collection);
  }
  // No history is fabricated for legacy offers whose collection is unavailable.
  for(const offer of offers){
    if(states.has(offer.offerId))continue;
    const scope=collectionScope({source:offer.sourceFormat})||categoryScope(offer.category);
    if(scope)states.set(offer.offerId,new Map([[scope.key,{presentInLatestCollection:offer.presentInLatestCollection,latestMovement:offer.latestMovement,positionDelta:offer.positionDelta,latestSourceOrder:offer.latestSourceOrder,latestCollectionId:offer.latestCollectionId,capturedAt:offer.lastSeenAt}]]));
  }
  return{offers,states,latestByScope,previousByScope};
}
export function offersForGuruMediaScope(index,scopeKey=''){
  const result=[];
  for(const offer of index.offers){
    const states=index.states.get(offer.offerId),explicit=states?.get(scopeKey);
    if(scopeKey&&!explicit&&categoryScope(offer.category)?.key!==scopeKey)continue;
    const observed=states?[...states.values()]:[],present=observed.filter(state=>state.presentInLatestCollection);
    const state=scopeKey?explicit:(present.length?present:observed).sort((a,b)=>String(b.capturedAt).localeCompare(String(a.capturedAt)))[0];
    result.push(state?{...offer,...state}:offer);
  }
  return result;
}
export function guruMediaFilterScopes(index){
  const used=new Set([...index.latestByScope.keys(),...index.offers.map(offer=>categoryScope(offer.category)?.key).filter(Boolean)]);
  return GURU_MEDIA_SCOPES.filter(scope=>scope.category||scope.key==='top-performers'||used.has(scope.key));
}
export function prepareGuruMediaCollection({parsed,offers=[],collections=[],snapshots=[],collectionId,capturedAt}){
  const scope=scopeByKey(parsed.captureScope);if(!scope)throw new Error('Copie o título da categoria/lista antes de confirmar a coleta.');
  const index=projectGuruMediaCollections(offers,collections,snapshots),previous=index.previousByScope.get(scope.key)||[],current=parsed.offers.map(offer=>Domain.snapshotFromOffer(offer,{collectionId,capturedAt}));
  const known=[...index.states].filter(([,states])=>states.has(scope.key)).map(([id])=>id),comparison=Domain.compareCollections(current,previous,known);
  // An explicit count override remains available, but an incomplete paste never
  // establishes disappearance of an omitted offer, even within its own list.
  if(!parsed.valid){comparison.entries=comparison.entries.filter(entry=>entry.movement!=='exited');comparison.summary.exited=0}
  const entryById=new Map(comparison.entries.map(entry=>[entry.offerId,entry])),existing=new Map(offers.map(offer=>[offer.offerId,offer])),updates=new Map();
  for(const offer of parsed.offers){const entry=entryById.get(offer.offerId);updates.set(offer.offerId,Domain.mergeOffer(existing.get(offer.offerId),offer,{collectionId,capturedAt,movement:entry.movement,positionDelta:entry.positionDelta}))}
  for(const entry of comparison.entries.filter(entry=>entry.movement==='exited')){const old=existing.get(entry.offerId);if(old)updates.set(entry.offerId,Domain.markExited(old,{collectionId,capturedAt}))}
  const collection={collectionId,capturedAt,source:parsed.sourceFormat,captureScope:scope.key,scopeLabel:scope.label,category:scope.category,declaredCount:parsed.declaredCount,parsedCount:parsed.parsedCount,offerIds:parsed.offers.map(offer=>offer.offerId),summary:comparison.summary,movements:comparison.entries,changes:comparison.changes};
  const combined=new Map(existing);for(const [id,offer]of updates)combined.set(id,offer);
  const projected=offersForGuruMediaScope(projectGuruMediaCollections([...combined.values()],[...collections,collection],[...snapshots,...current]));
  const updated=projected.filter(offer=>updates.has(offer.offerId));
  return{parsed,capturedAt,collectionId,current,previous,comparison,collection,updated};
}
