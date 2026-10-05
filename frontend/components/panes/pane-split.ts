export const MIN_SPLIT = 30;
export const MAX_SPLIT = 70;
export const DEFAULT_SPLIT = 50;
export const clampSplit = (value: number) =>
  Number.isFinite(value)
    ? Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, value))
    : DEFAULT_SPLIT;
