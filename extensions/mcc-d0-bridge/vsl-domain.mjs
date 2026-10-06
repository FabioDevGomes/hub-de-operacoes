export const VSL_RATES = Object.freeze([1, 10, 20, 30]);

export function isVslRate(value) {
  return typeof value === 'number' && VSL_RATES.includes(value);
}

export function isVslPage(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch { return false; }
}
