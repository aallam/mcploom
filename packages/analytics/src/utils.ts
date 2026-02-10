/**
 * Returns the byte length of a string (UTF-8).
 */
export function byteSize(value: unknown): number {
  if (value === undefined || value === null) return 0;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return new TextEncoder().encode(str).byteLength;
}

/**
 * Compute a percentile from a sorted array of numbers.
 * Uses linear interpolation between the closest ranks.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Insert a value into an already-sorted array (ascending), maintaining sort order.
 */
export function sortedInsert(arr: number[], value: number): void {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  arr.splice(lo, 0, value);
}
