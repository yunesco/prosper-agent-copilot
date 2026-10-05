export const MIN_SPLIT = 40;
export const MAX_SPLIT = 75;
export const DEFAULT_SPLIT = 70;
export const clampSplit = (value: number, min = MIN_SPLIT, max = MAX_SPLIT) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : Math.max(min, Math.min(max, DEFAULT_SPLIT));
