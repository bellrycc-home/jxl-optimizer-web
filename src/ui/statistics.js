import { formatSize } from './settings.js';

export function updateStatistics(elements, items, batchElapsedMs = 0) {
  const counts = { done: 0, error: 0, skipped: 0, pending: 0, processing: 0 };
  let original = 0;
  let result = 0;

  for (const item of items) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    if (item.status === 'done' && item.result) {
      original += item.file.size;
      result += item.result.size;
    }
  }

  elements.files.textContent = String(items.length);
  elements.done.textContent = String(counts.done);
  elements.errors.textContent = String(counts.error + counts.skipped);
  elements.original.textContent = formatSize(original);
  elements.result.textContent = formatSize(result);

  if (original > 0 && result > 0) {
    const savings = (1 - result / original) * 100;
    elements.saved.textContent = savings >= 0 ? `${savings.toFixed(2)} %` : `+${Math.abs(savings).toFixed(2)} %`;
    elements.saved.className = savings >= 0 ? 'saving' : 'growth';
  } else {
    elements.saved.textContent = '—';
    elements.saved.className = '';
  }

  if (batchElapsedMs > 0) {
    elements.time.textContent = batchElapsedMs < 60_000
      ? `${(batchElapsedMs / 1000).toFixed(1)} s`
      : `${Math.floor(batchElapsedMs / 60_000)} min ${((batchElapsedMs % 60_000) / 1000).toFixed(0)} s`;
  } else {
    elements.time.textContent = '0 s';
  }

  return { ...counts, original, result };
}
