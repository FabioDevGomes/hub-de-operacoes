export const VSL_RATES = Object.freeze([1, 20, 30, 40, 50]);

export function isVslRate(value) {
  return typeof value === 'number' && VSL_RATES.includes(value);
}

export function isVslPage(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch { return false; }
}
