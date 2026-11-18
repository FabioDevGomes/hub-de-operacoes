function selectionKey(source, scope, mode) {
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619) >>> 0;
  return 'google-ads-copy-selection-v1:' + encodeURIComponent(scope || 'new') + ':' + mode + ':' + source.length + ':' + hash.toString(16);
}

export function saveCopySelection(storage, source, scope, mode, selection) {
  storage.setItem(selectionKey(source, scope, mode), JSON.stringify({ ...selection, source }));
}

export function loadCopySelection(storage, source, scope, mode) {
  const saved = JSON.parse(storage.getItem(selectionKey(source, scope, mode)) || 'null');
  return saved?.source === source ? saved : null;
}
