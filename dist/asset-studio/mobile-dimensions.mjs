export function isMobileDimensionsCompatible(width, height, reference, tolerance = 0.1) {
  if (![width, height, reference?.width, reference?.height, tolerance].every(Number.isFinite)) return false;
  if (width <= 0 || height <= 0 || reference.width <= 0 || reference.height <= 0 || tolerance < 0) return false;
  const widthScale = width / reference.width;
  const heightScale = height / reference.height;
  const scaleRatio = Math.max(widthScale, heightScale) / Math.min(widthScale, heightScale);
  return scaleRatio <= 1 + tolerance;
}
