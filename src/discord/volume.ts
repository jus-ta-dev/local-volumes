// Conversion used by Discord's desktop per-user volume slider.
export const MAX_RAW = 100 * Math.pow(10, 6 / 20);

export function rawToDisplayedPercent(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0)
    throw new Error("Invalid individual volume.");
  if (raw === 0) return 0;
  const ratio = raw / 100;
  return (
    100 *
    (ratio < 1 ? Math.pow(ratio, 1 / 2.8) : (20 * Math.log10(ratio)) / 6 + 1)
  );
}

export function displayedPercentToRaw(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0 || percent > 200)
    throw new Error("Invalid displayed volume.");
  const ratio = percent / 100;
  return (
    100 *
    (ratio < 1 ? Math.pow(ratio, 2.8) : Math.pow(10, ((ratio - 1) * 6) / 20))
  );
}
