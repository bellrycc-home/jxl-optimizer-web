import { SequentialQueue, STATUS } from './core/queue.js';
import { describeAnalysis } from './core/analyzer.js';
import { getProfile, resolveProfileSettings } from './core/profiles.js';
import { downloadItem, outputPathFor } from './core/download-manager.js';
import { deliverResults, loadZipLimits } from './core/zip-safe.js';
import { checkCompatibility } from './core/compat.js';
import { EncoderWorkerClient } from './core/worker-client.js';
import { formatDuration, formatSize, initSettings } from './ui/settings.js';
import { renderFileList } from './ui/file-list.js';
import { LogPanel } from './ui/log-panel.js';
import { updateStatistics } from './ui/statistics.js';
import { initTheme } from './ui/theme.js';
import { initTabs } from './ui/tabs.js';
import { initProfileCards } from './ui/profile-cards.js';
import { askZipStrategy, mountZipLimitControl } from './ui/zip-dialog.js';
import { showCompatError, showCompatWarnings } from './ui/compat-banner.js';
import { registerServiceWorker } from './ui/update-banner.js';

const log = new LogPanel(document.querySelector('#logEntries'));
const queue = new SequentialQueue();

const dom = {
  dropzone: document.querySelector('#dropzone'),
  fileInput: document.querySelector('#fileInput'),
  folderInput: document.querySelector('#folderInput'),
  addFolderBtn: document.querySelector('#addFolderBtn'),
  fileList: document.querySelector('#fileList'),
  queueEmpty: document.querySelector('#queueEmpty'),
  clearQueueBtn: document.querySelector('#clearQueueBtn'),
  startBtn: document.querySelector('#startBtn'),
  cancelBtn: document.querySelector('#cancelBtn'),
  zipBtn: document.querySelector('#zipBtn'),
  globalProgress: document.querySelector('#globalProgress'),
  globalProgressTrack: document.querySelector('#globalProgressTrack'),
  globalProgressText: document.querySelector('#globalProgressText'),
  globalProgressCount: document.querySelector('#globalProgressCount'),
  currentProgress: document.querySelector('#currentProgress'),
  currentProgressTrack: document.querySelector('#currentProgressTrack'),
  currentLabel: document.querySelector('#currentLabel'),
  currentPercent: document.querySelector('#currentPercent'),
  engineBadge: document.querySelector('#engineBadge'),
  engineDetail: document.querySelector('#engineDetail'),
  zipStatus: document.querySelector('#zipStatus'),
  queueCount: document.querySelector('#queueCount'),
  logCount: document.querySelector('#logCount'),
  stats: {
    files: document.querySelector('#statFiles'),
    done: document.querySelector('#statDone'),
    errors: document.querySelector('#statErrors'),
    original: document.querySelector('#statOriginal'),
    result: document.querySelector('#statResult'),
    saved: document.querySelector('#statSaved'),
    time: document.querySelector('#statTime'),
  },
};

const baseUrl = (() => {
  const resolved = new URL(import.meta.env.BASE_URL, window.location.href).href;
  return resolved.endsWith('/') ? resolved : `${resolved}/`;
})();

const client = new EncoderWorkerClient({
  onLog: (message, level) => log.add(message, level),
  onProgress: handleWorkerProgress,
  onWorkerDied: () => {
    engineReady = false;
    dom.engineBadge.textContent = 'Motor: reiniciando…';
    dom.engineBadge.classList.add('badge-error');
    log.error('El worker del motor se detuvo. Se intentará reiniciar para la siguiente imagen.');
  },
});

let settingsApi;
let engineReady = false;
let running = false;
let appBlocked = false;
let batchStart = 0;
let batchTotal = 0;
let processed = 0;
let lastElapsed = 0;
let currentItem = null;
let currentStageKey = null;
let lastZip = null;
let analysisChain = Promise.resolve();

const STAGE_FRACTION = {
  analyze: 0.12,
  decode: 0.2,
  encode: 0.55,
  verify: 0.9,
  done: 1,
};

settingsApi = initSettings({
  onChange: () => {
    refreshControls();
  },
});

const queueCallbacks = {
  onDownload: (item) => {
    if (downloadItem(item)) {
      log.info(`Descarga preparada: ${item.result.outputName}`);
    } else {
      log.warn(`No hay resultado descargable para ${item.file.name}.`);
    }
  },
  onRemove: (item) => {
    if (running && item.status === STATUS.PROCESSING) return;
    queue.remove(item.id);
    log.info(`Quitado de la cola: ${item.file.name}. El archivo original no se ha tocado.`);
    settingsApi.setHasJpeg(queue.items.some((entry) => isJpeg(entry.file)));
    refresh();
  },
  onRetry: (item) => {
    if (running) return;
    item.status = STATUS.PENDING;
    item.error = null;
    item.skipReason = null;
    item.result = null;
    item.finishedAt = null;
    if (!item.analysis) scheduleAnalysis(item);
    log.info(`Reintento preparado: ${item.file.name}`);
    refresh();
  },
};

function renderQueue() {
  renderFileList(dom.fileList, queue.items, queueCallbacks);
}

function refresh() {
  renderQueue();

  dom.queueEmpty.hidden = queue.items.length > 0;
  updateStatistics(dom.stats, queue.items, running ? performance.now() - batchStart : lastElapsed);
  dom.queueCount.textContent = String(queue.items.length);
  dom.logCount.textContent = String(log.lines.length);
  refreshControls();
  updateProgress();
}

function refreshControls() {
  const counts = queue.counts();
  dom.startBtn.disabled = running || !engineReady || counts.pending === 0;
  dom.cancelBtn.disabled = !running;
  dom.clearQueueBtn.disabled = running || queue.items.length === 0;
  dom.zipBtn.disabled = running || counts.done === 0;
}

function updateProgress() {
  const counts = queue.counts();
  const finished = counts.done + counts.skipped + counts.error;

  if (running) {
    const currentFraction = currentItem ? (STAGE_FRACTION[currentItem.stageKey] ?? 0.05) : 0;
    const percent = batchTotal > 0
      ? Math.min(99, ((processed + currentFraction) / batchTotal) * 100)
      : 0;
    dom.globalProgress.style.width = `${percent}%`;
    dom.globalProgressTrack.setAttribute('aria-valuenow', String(Math.round(percent)));
    dom.globalProgressText.textContent = `Procesando ${Math.min(processed + 1, batchTotal)} de ${batchTotal}`;
    dom.globalProgressCount.textContent = `${finished} / ${batchTotal}`;
  } else {
    const percent = queue.items.length ? (finished / queue.items.length) * 100 : 0;
    dom.globalProgress.style.width = `${percent}%`;
    dom.globalProgressTrack.setAttribute('aria-valuenow', String(Math.round(percent)));
    dom.globalProgressText.textContent = queue.items.length
      ? (finished === queue.items.length ? 'Cola procesada' : 'Listo para iniciar')
      : 'Sin lote en curso';
    dom.globalProgressCount.textContent = `${finished} / ${queue.items.length}`;
    dom.currentLabel.textContent = queue.items.length ? 'Esperando inicio' : 'Esperando archivos';
    dom.currentProgress.style.width = '0%';
    dom.currentPercent.textContent = '';
    dom.currentProgress.classList.remove('indeterminate');
  }
}

function handleWorkerProgress(data) {
  if (!running) return;
  const item = queue.get(data.id);
  if (!item || item.status !== STATUS.PROCESSING) return;

  item.stage = data.label;
  item.stageKey = data.stage;
  currentItem = item;
  if (currentStageKey !== data.stage) {
    currentStageKey = data.stage;
    if (data.stage === 'decode' || data.stage === 'verify') {
      log.info(`${item.file.name}: ${data.label}`);
    }
  }

  const fraction = STAGE_FRACTION[data.stage] ?? 0.1;
  dom.currentLabel.textContent = `${item.file.name}: ${data.label}`;
  if (data.stage === 'encode') {
    dom.currentProgress.classList.add('indeterminate');
    dom.currentPercent.textContent = '';
  } else {
    dom.currentProgress.classList.remove('indeterminate');
    dom.currentProgress.style.width = `${Math.round(fraction * 100)}%`;
    dom.currentPercent.textContent = `${Math.round(fraction * 100)} %`;
  }
  dom.currentProgressTrack.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
  renderQueue();
  updateProgress();
}

async function ensureEngine() {
  if (engineReady && client.ready) return client.engineInfo;
  const info = await client.init(baseUrl);
  engineReady = true;
  dom.engineBadge.classList.remove('badge-error');
  const variant = info.variant === 'simd' ? 'SIMD' : 'estándar';
  dom.engineBadge.textContent = `Motor: ${info.version} (${variant})`;
  dom.engineDetail.textContent = `WASM ${variant} · effort ${info.effortMin}–${info.effortMax}`;
  refreshControls();
  return info;
}

async function initEngine() {
  log.info('Iniciando motor libjxl compilado a WebAssembly...');
  try {
    const info = await ensureEngine();
    log.success(`Motor ${info.version} listo (${info.variant === 'simd' ? 'SIMD' : 'estándar'}).`);
    refreshControls();
  } catch (error) {
    engineReady = false;
    dom.engineBadge.textContent = 'Motor no disponible';
    dom.engineBadge.classList.add('badge-error');
    log.error(`No se pudo cargar el motor JPEG XL: ${error.message}`);
    log.error('Comprueba que existen public/wasm/jxl_engine_std.js y .wasm (npm run build:wasm).');
    refreshControls();
  }
}

function isJpeg(file) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return file.type === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg';
}

function supportedFormat(file) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (file.type === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') return 'JPEG';
  if (file.type === 'image/png' || ext === 'png') return 'PNG';
  if (file.type === 'image/webp' || ext === 'webp') return 'WebP';
  return null;
}

function addFiles(files, explicitPath = '') {
  if (appBlocked) return;
  let added = 0;
  for (const file of files) {
    if (!supportedFormat(file)) {
      log.warn(`Formato no admitido: ${file.name}. Esta versión solo procesa JPEG, PNG y WebP.`);
      continue;
    }
    if (!file.size) {
      log.warn(`Archivo vacío omitido: ${file.name}`);
      continue;
    }
    const path = explicitPath || file.webkitRelativePath || '';
    const duplicate = queue.items.some((item) =>
      item.file.name === file.name
      && item.file.size === file.size
      && item.file.lastModified === file.lastModified
      && item.path === path,
    );
    if (duplicate) {
      log.warn(`Ya está en la cola: ${path || file.name}`);
      continue;
    }

    const item = queue.add(file, path);
    added += 1;
    log.info(`Añadida: ${path || file.name} · ${formatSize(file.size)}`);
    scheduleAnalysis(item);
  }

  if (added > 0) {
    settingsApi.setHasJpeg(queue.items.some((item) => isJpeg(item.file)));
    log.info(`${added} archivo(s) añadidos a la cola.`);
    refresh();
  }
}

function scheduleAnalysis(item) {
  analysisChain = analysisChain
    .then(async () => {
      if (!queue.get(item.id)) return;
      const settings = settingsApi.getSettings();
      log.info(`Analizando: ${item.path || item.file.name}`);
      try {
        await ensureEngine();
        const data = await client.request('analyze', {
          file: item.file,
          metrics: settings.autoAnalyze,
          maxPixels: settings.maxPixels,
        });
        if (!queue.get(item.id)) return;
        item.analysis = data.analysis;
        item.analysisError = null;
        if (data.skippedByLimit) {
          log.warn(
            `${item.file.name}: ${data.analysis.width}×${data.analysis.height} supera el límite de ${(settings.maxPixels / 1_000_000).toFixed(0)} MP. Se omitirá al procesar.`,
          );
        } else if (data.analysis.width) {
          log.info(`Formato: ${data.analysis.format} | ${data.analysis.width}×${data.analysis.height} | ${formatSize(item.file.size)}`);
          if (data.analysis.kind) {
            log.info(describeAnalysis(data.analysis));
            if (data.analysis.recommendedProfile) {
              log.info(`Perfil recomendado: ${profileLabel(data.analysis.recommendedProfile)} — ${data.analysis.recommendationReason}`);
            }
          } else {
            log.info('Análisis automático desactivado; solo se leyeron las dimensiones.');
          }
          if (data.analysis.warning) log.warn(data.analysis.warning);
        }
        refresh();
      } catch (error) {
        if (!queue.get(item.id)) return;
        item.analysisError = error.message;
        log.warn(`No se pudo analizar ${item.file.name}: ${error.message}`);
        refresh();
      }
    })
    .catch((error) => {
      log.error(`Error en la cola de análisis: ${error.message}`);
    });
}

function profileLabel(id) {
  return getProfile(id).label;
}

function resolveBatchOptions(item, settings) {
  const resolved = resolveProfileSettings({
    profileId: settings.profileId,
    effort: settings.effort,
    distance: settings.distance,
  });
  const format = item.analysis?.format ?? supportedFormat(item.file);
  const jpeg = format === 'JPEG';
  const jpegMode = jpeg
    ? (resolved.lossless ? 'reversible' : settings.jpegMode)
    : 'n/a';
  const distance = jpeg && jpegMode === 'reversible' ? null : resolved.distance;

  return {
    profileId: resolved.profile.id,
    profileLabel: resolved.profile.label,
    effort: resolved.effort,
    distance,
    lossless: resolved.lossless,
    jpegMode,
  };
}

function markSkipped(items, reason) {
  for (const item of items) {
    if (item.status !== STATUS.PENDING) continue;
    item.status = STATUS.SKIPPED;
    item.skipReason = reason;
    log.warn(`Omitido: ${item.path || item.file.name} — ${reason}`);
  }
}

async function startBatch() {
  if (running) return;
  const settings = settingsApi.getSettings();
  const pending = queue.pending();
  if (pending.length === 0) {
    log.warn('No hay imágenes pendientes en la cola.');
    return;
  }

  running = true;
  queue.resetCancel();
  batchTotal = pending.length;
  batchStart = performance.now();
  processed = 0;
  lastElapsed = 0;
  currentItem = null;
  currentStageKey = null;
  lastZip = null;

  log.info(`Lote iniciado: ${batchTotal} imagen(es).`);
  log.info(`Perfil: ${settings.profileLabel} | Distance: ${settings.lossless ? '0 (lossless)' : settings.distance} | Effort: ${settings.effort}`);
  if (pending.some((item) => isJpeg(item.file))) {
    log.info(`Modo JPEG: ${settings.jpegMode === 'reversible' ? 'reversible (bitstream original)' : 'con pérdida (recodifica píxeles)'}${settings.jpegMode === 'reversible' ? '; Distance no se aplica a JPEG reversible' : ''}`);
  }
  log.info('Procesamiento secuencial, una imagen a la vez, en un Web Worker.');

  dom.zipStatus.textContent = 'Preparando resultados…';
  refresh();

  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index];
    if (!queue.get(item.id)) continue;
    if (queue.cancelled) {
      markSkipped(pending.slice(index), 'Cancelado por el usuario.');
      break;
    }

    const analysis = item.analysis;
    const megapixels = analysis?.width && analysis?.height
      ? (analysis.width * analysis.height) / 1_000_000
      : 0;

    if (item.file.size > settings.maxFileBytes) {
      item.status = STATUS.SKIPPED;
      item.skipReason = `Supera el límite de tamaño (${formatSize(settings.maxFileBytes)}).`;
      log.warn(`Omitido: ${item.file.name} — ${item.skipReason}`);
      processed += 1;
      refresh();
      continue;
    }
    if (megapixels > 0 && megapixels * 1_000_000 > settings.maxPixels) {
      item.status = STATUS.SKIPPED;
      item.skipReason = `Supera el límite de ${(settings.maxPixels / 1_000_000).toFixed(0)} MP.`;
      log.warn(`Omitido: ${item.file.name} — ${item.skipReason}`);
      processed += 1;
      refresh();
      continue;
    }

    try {
      await ensureEngine();
      if (queue.cancelled) {
        markSkipped(pending.slice(index), 'Cancelado por el usuario.');
        break;
      }

      item.status = STATUS.PROCESSING;
      item.stage = 'Preparando…';
      item.stageKey = null;
      item.startedAt = performance.now();
      item.error = null;
      item.skipReason = null;
      currentItem = item;
      currentStageKey = null;
      refresh();

      const options = resolveBatchOptions(item, settings);
      log.info(`Procesando (${index + 1}/${batchTotal}): ${item.path || item.file.name}`);
      if (analysis?.width) {
        log.info(`Formato: ${analysis.format} | ${analysis.width}×${analysis.height} | ${formatSize(item.file.size)}`);
        if (analysis.recommendedProfile) {
          log.info(`Perfil recomendado: ${profileLabel(analysis.recommendedProfile)}`);
        }
      } else {
        log.info(`Formato: ${supportedFormat(item.file)} | ${formatSize(item.file.size)}`);
      }
      log.info(`Perfil seleccionado: ${options.profileLabel} | Distance: ${options.distance === null ? 'no aplica (JPEG reversible)' : options.distance} | Effort: ${options.effort}`);
      if (options.jpegMode !== 'n/a') {
        log.info(`Modo JPEG: ${options.jpegMode === 'reversible' ? 'reversible' : 'con pérdida'}`);
      }
      log.info(`Codificando JPEG XL...`);

      const encodeStart = performance.now();
      const result = await client.request('encode', {
        file: item.file,
        header: analysis ? { formatHint: analysis.format, details: analysis.details } : null,
        options,
      });

      if (!queue.get(item.id)) continue;

      const wallMs = performance.now() - encodeStart;
      const outputName = outputPathFor(item);
      item.result = {
        ...result,
        outputName,
        durationMs: wallMs,
        profileLabel: options.profileLabel,
        distance: options.distance,
        effort: options.effort,
        jpegMode: result.jpegMode,
      };
      item.status = STATUS.DONE;
      item.finishedAt = performance.now();
      item.stage = null;
      item.stageKey = 'done';
      currentItem = null;

      const savings = (1 - result.size / item.file.size) * 100;
      log.success(`Conversión completada: ${item.path || item.file.name}`);
      log.info(`Original: ${formatSize(item.file.size)}`);
      log.info(`Resultado: ${formatSize(result.size)}`);
      log.info(`Ahorro: ${savings >= 0 ? savings.toFixed(2) : `+${Math.abs(savings).toFixed(2)}`} %`);
      const t = result.timings ?? {};
      log.info(`Tiempo: ${formatDuration(wallMs)} (decodificación ${formatDuration(t.decodeMs ?? 0)}, codificación ${formatDuration(t.encodeMs ?? 0)}, verificación ${formatDuration(t.verifyMs ?? 0)})`);
      if (result.verification) {
        const method = result.verification.kind === 'jpeg-reversible'
          ? 'reconstrucción JPEG'
          : result.verification.kind === 'lossless'
            ? 'píxeles'
            : 'decodificación';
        if (result.verification.ok) {
          log.success(`Verificación (${method}): correcta. ${result.verification.message}`);
        } else {
          log.warn(`Verificación (${method}): advertencia. ${result.verification.message}`);
        }
      } else {
        log.warn('Verificación: no se ejecutó ninguna comprobación.');
      }

      if (batchTotal === 1) {
        downloadItem(item);
        log.info(`Descarga preparada: ${outputName}`);
      }
    } catch (error) {
      if (!queue.get(item.id)) continue;
      item.status = STATUS.ERROR;
      item.error = error.message;
      item.finishedAt = performance.now();
      item.stage = null;
      currentItem = null;
      log.error(`Error en ${item.path || item.file.name}: ${error.message}`);
      log.warn('Se continúa con la siguiente imagen cuando sea seguro.');
    } finally {
      processed += 1;
      lastElapsed = performance.now() - batchStart;
      currentStageKey = null;
      dom.currentProgress.classList.remove('indeterminate');
      dom.currentProgress.style.width = '0%';
      dom.currentPercent.textContent = '';
      refresh();
    }
  }

  running = false;
  currentItem = null;
  lastElapsed = performance.now() - batchStart;

  if (queue.cancelled) {
    log.warn(`Lote cancelado. Imágenes completadas: ${queue.counts().done}.`);
    dom.zipStatus.textContent = 'Lote cancelado. Puedes descargar las conversiones completadas en ZIP.';
  } else {
    const completed = queue.items.filter((item) => item.status === STATUS.DONE && item.result);
    if (completed.length > 0) {
      const outcome = await deliver({ automatic: true });
      if (outcome.zip) lastZip = outcome.zip;
    } else {
      dom.zipStatus.textContent = 'No se completó ninguna conversión.';
    }
    log.info(`Lote finalizado en ${formatDuration(lastElapsed)}. Completados: ${queue.counts().done} · Errores: ${queue.counts().error} · Omitidos: ${queue.counts().skipped}.`);
  }

  if (lastZip) {
    log.info(`Último ZIP disponible: ${lastZip.filename}`);
  }
  refresh();
}

function cancelBatch() {
  if (!running) return;
  queue.cancel();
  log.warn('Cancelación solicitada. La imagen que está codificándose terminará antes de detener la cola.');
  dom.currentLabel.textContent = 'Cancelación pendiente...';
}

async function deliver({ automatic }) {
  return deliverResults({
    items: queue.items,
    limits: loadZipLimits(),
    automatic,
    ask: askZipStrategy,
    formatSize,
    log,
    setStatus: (text) => {
      dom.zipStatus.textContent = text;
    },
  });
}

async function downloadZipManually() {
  dom.zipBtn.disabled = true;
  try {
    const outcome = await deliver({ automatic: false });
    if (outcome.zip) lastZip = outcome.zip;
  } catch (error) {
    log.error(`No se pudo preparar la descarga: ${error.message}`);
  } finally {
    refreshControls();
  }
}

async function filesFromDataTransfer(dataTransfer) {
  const entries = [];
  if (dataTransfer.items?.length) {
    for (const item of dataTransfer.items) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
  }
  if (entries.length === 0) {
    return [...dataTransfer.files].map((file) => ({ file, path: file.webkitRelativePath || '' }));
  }

  const out = [];
  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      out.push({ file, path: `${prefix}${file.name}` });
      return;
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) {
        const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) break;
        for (const child of batch) {
          await walk(child, `${prefix}${entry.name}/`);
        }
      }
    }
  }
  for (const entry of entries) await walk(entry, '');
  return out;
}

dom.fileInput.addEventListener('change', () => {
  addFiles([...dom.fileInput.files]);
  dom.fileInput.value = '';
});

dom.addFolderBtn.addEventListener('click', () => dom.folderInput.click());
dom.folderInput.addEventListener('change', () => {
  for (const file of dom.folderInput.files) {
    addFiles([file], file.webkitRelativePath || '');
  }
  dom.folderInput.value = '';
});

for (const eventName of ['dragenter', 'dragover']) {
  dom.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dom.dropzone.classList.add('dragging');
  });
}
dom.dropzone.addEventListener('dragleave', (event) => {
  event.preventDefault();
  dom.dropzone.classList.remove('dragging');
});
dom.dropzone.addEventListener('drop', async (event) => {
  event.preventDefault();
  dom.dropzone.classList.remove('dragging');
  try {
    const files = await filesFromDataTransfer(event.dataTransfer);
    for (const { file, path } of files) addFiles([file], path);
  } catch (error) {
    log.error(`No se pudieron leer los archivos arrastrados: ${error.message}`);
  }
});

dom.startBtn.addEventListener('click', startBatch);
dom.cancelBtn.addEventListener('click', cancelBatch);
dom.zipBtn.addEventListener('click', downloadZipManually);

dom.clearQueueBtn.addEventListener('click', () => {
  if (running) return;
  queue.clear();
  lastZip = null;
  lastElapsed = 0;
  dom.zipStatus.textContent = 'El ZIP de un lote se prepara localmente al terminar.';
  log.info('Cola vaciada. Los archivos originales no se han modificado.');
  settingsApi.setHasJpeg(false);
  refresh();
});

document.querySelector('#clearLogBtn').addEventListener('click', () => {
  log.clear();
  log.info('Registro limpiado.');
});
document.querySelector('#copyLogBtn').addEventListener('click', async () => {
  const ok = await log.copy();
  if (ok) log.info('Registro copiado al portapapeles.');
  else log.warn('No se pudo copiar el registro.');
});

window.addEventListener('beforeunload', (event) => {
  if (running) {
    event.preventDefault();
    event.returnValue = '';
  }
});

if (import.meta.env.PROD) {
  registerServiceWorker({
    isBusy: () => running,
    onInfo: (message) => log.info(message),
    onWarn: (message) => log.warn(message),
  });
}

initTheme(document.querySelector('#themeToggle'));
initProfileCards(document.querySelector('#profileCards'), document.querySelector('#profile'));
initTabs([
  { button: document.querySelector('#tab-workspace'), panel: document.querySelector('#view-workspace') },
  { button: document.querySelector('#tab-logs'), panel: document.querySelector('#view-logs') },
]);
mountZipLimitControl(dom.zipStatus);

const compat = checkCompatibility();
if (!compat.ok) {
  appBlocked = true;
  showCompatError(compat);
} else {
  showCompatWarnings(compat, log);
  refresh();
  initEngine();
}
