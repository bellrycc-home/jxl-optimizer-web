// Memory-aware ZIP delivery. The old path built the whole archive with
// zipSync (one big Uint8Array) AND kept both that array and a Blob alive in
// `lastZip`. This module:
//  - plans before building (size estimate + warn/block levels, configurable),
//  - streams entries with fflate's Zip/ZipPassThrough so the UI is never
//    blocked by one huge synchronous call,
//  - returns only metadata (no buffers) so nothing stays retained,
//  - falls back to individual downloads when the ZIP would be unsafe.
import { Zip, ZipPassThrough, strToU8 } from 'fflate';
import {
  buildReadme,
  buildReport,
  downloadBlob,
  downloadItem,
  outputPathFor,
  uniquePath,
} from './download-manager.js';

const MB = 1024 * 1024;
export const DEFAULT_MAX_MB = 800;
const WARN_FRACTION = 0.4;
const STORAGE_KEY = 'jxl-optimizer.zipMaxMB';

export function limitsFromMaxMB(maxMB) {
  const max = Number.isFinite(maxMB) && maxMB >= 1 ? Math.round(maxMB) : DEFAULT_MAX_MB;
  return { maxMB: max, warnMB: Math.max(1, Math.round(max * WARN_FRACTION)) };
}

export function loadZipLimits(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return limitsFromMaxMB(raw === null || raw === undefined ? NaN : Number(raw));
  } catch {
    return limitsFromMaxMB(NaN);
  }
}

export function saveZipLimits(maxMB, storage = globalThis.localStorage) {
  const limits = limitsFromMaxMB(maxMB);
  try {
    storage?.setItem(STORAGE_KEY, String(limits.maxMB));
  } catch {
    // Storage unavailable: the limit simply applies for this session only.
  }
  return limits;
}

const resultSize = (item) => item.result?.size ?? item.result?.bytes?.length ?? 0;
const completedItems = (items) =>
  items.filter((item) => item.status === 'done' && item.result?.bytes);

/**
 * Estimates the cost of a ZIP BEFORE building it. Result buffers are already
 * in memory; creating the archive needs roughly one extra copy (the Blob),
 * and browsers may briefly hold more while handing it to the download, so the
 * estimate is deliberately conservative (2x).
 */
export function planZip(items, limits = limitsFromMaxMB(NaN)) {
  const done = completedItems(items);
  const totalBytes = done.reduce((sum, item) => sum + resultSize(item), 0);
  const level = totalBytes > limits.maxMB * MB ? 'block' : totalBytes > limits.warnMB * MB ? 'warn' : 'ok';
  return {
    count: done.length,
    totalBytes,
    estimatedPeakBytes: totalBytes * 2,
    level,
    limits,
  };
}

/** Pure decision used by the UI and by the unit tests. */
export function decideDownload(items, limits) {
  const plan = planZip(items, limits);
  if (plan.count === 0) return { mode: 'none', plan };
  if (plan.count === 1) return { mode: 'single', plan };
  if (plan.level === 'ok') return { mode: 'zip', plan };
  return { mode: plan.level === 'warn' ? 'confirm-zip' : 'individual-only', plan };
}

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Builds the ZIP asynchronously. Returns { blob, filename, size, included,
 * skipped, totalBytes }. Entry order, names and report match buildZip().
 */
export async function buildZipAsync(items, { onProgress } = {}) {
  const done = completedItems(items);
  if (done.length === 0) throw new Error('No hay conversiones completadas para incluir en el ZIP.');

  const used = new Set();
  const finalPaths = new Map();
  const entries = done.map((item) => {
    const path = uniquePath(item.result.outputName || outputPathFor(item), used);
    finalPaths.set(item, path);
    return { path, bytes: item.result.bytes };
  });

  const chunks = [];
  let finished;
  const finishedPromise = new Promise((resolve, reject) => {
    finished = { resolve, reject };
  });
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      finished.reject(error);
      return;
    }
    chunks.push(chunk);
    if (final) finished.resolve();
  });

  const addFile = (name, bytes) => {
    // Level 0 (stored): JXL is already compressed; recompressing wastes CPU.
    const file = new ZipPassThrough(name);
    zip.add(file);
    file.push(bytes, true);
  };

  let totalBytes = 0;
  for (let i = 0; i < entries.length; i += 1) {
    addFile(entries[i].path, entries[i].bytes);
    totalBytes += entries[i].bytes.length;
    onProgress?.({ done: i + 1, total: entries.length });
    await yieldToUi();
  }
  addFile('report.csv', strToU8(`\uFEFF${buildReport(items, finalPaths)}`));
  addFile('README.txt', strToU8(buildReadme(items, new Date().toLocaleString('es-ES'))));
  zip.end();
  await finishedPromise;

  const blob = new Blob(chunks, { type: 'application/zip' });
  chunks.length = 0; // drop references to the chunk list right away
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return {
    blob,
    filename: `jxl-optimizer-${stamp}.zip`,
    size: blob.size,
    included: done.length,
    skipped: items.length - done.length,
    totalBytes,
  };
}

/** Downloads every completed result as its own .jxl (no ZIP, no big buffers). */
export async function downloadIndividually(
  items,
  { delayMs = 400, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), onProgress } = {},
) {
  const done = completedItems(items);
  const used = new Set();
  let count = 0;
  for (const item of done) {
    const base = (item.result.outputName || outputPathFor(item)).split('/').pop();
    const name = uniquePath(base, used);
    downloadBlob(item.result.blob ?? new Blob([item.result.bytes], { type: 'image/jxl' }), name);
    count += 1;
    onProgress?.({ done: count, total: done.length });
    if (count < done.length) await sleep(delayMs);
  }
  return count;
}

/**
 * Orchestrates delivery. `ask(plan)` resolves to 'zip' | 'individual' |
 * 'cancel' and is only called when the batch is large.
 */
export async function deliverResults({ items, limits, automatic = false, ask, formatSize, log, setStatus }) {
  const decision = decideDownload(items, limits);
  const { plan } = decision;

  if (decision.mode === 'none') {
    setStatus('No se completó ninguna conversión.');
    return { mode: 'none' };
  }
  if (decision.mode === 'single') {
    // A single image is downloaded directly by the batch loop; a manual click
    // on the button downloads it here.
    if (!automatic) downloadItem(completedItems(items)[0]);
    setStatus('Imagen única: descarga directa .jxl, sin ZIP.');
    return { mode: 'single' };
  }

  let choice = 'zip';
  if (decision.mode !== 'zip') {
    log.warn(
      `Los resultados suman ${formatSize(plan.totalBytes)}; crear un ZIP necesitaría unos ${formatSize(plan.estimatedPeakBytes)} de memoria adicional.`,
    );
    setStatus(`Resultados: ${formatSize(plan.totalBytes)}. Elige cómo descargarlos.`);
    choice = await ask(plan);
  }

  if (choice === 'cancel') {
    setStatus('Descarga cancelada. Las conversiones siguen disponibles en la cola.');
    return { mode: 'cancelled' };
  }

  if (choice === 'zip') {
    try {
      setStatus('Preparando ZIP…');
      const zip = await buildZipAsync(items, {
        onProgress: ({ done, total }) => setStatus(`Preparando ZIP… ${done}/${total}`),
      });
      downloadBlob(zip.blob, zip.filename);
      // Keep metadata only: the Blob is released once the download URL expires.
      const meta = {
        filename: zip.filename,
        size: zip.size,
        included: zip.included,
        skipped: zip.skipped,
        totalBytes: zip.totalBytes,
      };
      log.success(`ZIP preparado: ${meta.filename} (${formatSize(meta.size)}).`);
      log.info('Incluye report.csv y README.txt. Si el navegador bloquea la descarga automática, usa «Descargar ZIP».');
      setStatus(`ZIP listo: ${meta.filename} · ${formatSize(meta.size)} · ${meta.included} archivo(s).`);
      return { mode: 'zip', zip: meta };
    } catch (error) {
      log.error(`No se pudo preparar el ZIP (${error.message}). Se ofrecen descargas individuales.`);
      choice = await ask({ ...plan, level: 'block', failed: true });
      if (choice === 'cancel') {
        setStatus('Descarga cancelada. Las conversiones siguen disponibles en la cola.');
        return { mode: 'cancelled' };
      }
    }
  }

  const count = await downloadIndividually(items, {
    onProgress: ({ done, total }) => setStatus(`Descargando archivos… ${done}/${total}`),
  });
  log.info(`Descargas individuales iniciadas: ${count} archivo(s). Si faltan, permite descargas múltiples en tu navegador.`);
  setStatus(`${count} archivo(s) descargados por separado.`);
  return { mode: 'individual', count };
}
