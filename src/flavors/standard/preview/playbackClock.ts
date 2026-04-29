export function getStandardPreviewNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
