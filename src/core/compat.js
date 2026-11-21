import { supportsSimd } from '../wasm/jxl-engine.js';

// Feature detection for everything the app needs. No fallbacks are faked: a
// missing required feature produces a readable message instead of a silent
// failure.

function supportsModuleWorker() {
  // A blob: URL is allowed by the page CSP (worker-src 'self' blob:); a data:
  // URL would be blocked. The `type` getter only runs in browsers that
  // implement module workers.
  let url;
  try {
    let used = false;
    url = URL.createObjectURL(new Blob([''], { type: 'text/javascript' }));
    const worker = new Worker(url, {
      get type() {
        used = true;
        return 'module';
      },
    });
    worker.terminate();
    return used;
  } catch {
    return false;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

export function describeBrowser(ua = navigator.userAgent) {
  const pick = (re) => re.exec(ua)?.[1]?.split('.')[0];
  const edge = pick(/Edg\/([\d.]+)/);
  if (edge) return `Edge ${edge}`;
  const firefox = pick(/Firefox\/([\d.]+)/);
  if (firefox) return `Firefox ${firefox}`;
  const chrome = pick(/(?:Chrome|CriOS)\/([\d.]+)/);
  if (chrome) return `Chrome ${chrome}`;
  const safari = /Safari\//.test(ua) ? pick(/Version\/([\d.]+)/) : null;
  if (safari) return `Safari ${safari}`;
  return 'navegador desconocido';
}

export function checkCompatibility() {
  const missing = [];
  const warnings = [];
  const need = (id, label, hint) => missing.push({ id, label, hint });

  if (typeof WebAssembly !== 'object') {
    need('wasm', 'WebAssembly', 'Es el motor que comprime las imágenes. Todos los navegadores actuales lo incluyen.');
  }
  if (typeof Worker === 'undefined' || !supportsModuleWorker()) {
    need('module-worker', 'Web Workers de tipo módulo', 'Chrome/Edge 80+, Firefox 114+ o Safari 15+.');
  }
  if (typeof createImageBitmap !== 'function') {
    need('createImageBitmap', 'createImageBitmap', 'Chrome 50+, Firefox 42+ o Safari 15+.');
  }
  if (typeof OffscreenCanvas === 'undefined') {
    need('offscreen', 'OffscreenCanvas', 'Chrome/Edge 69+, Firefox 105+ o Safari 16.4+.');
  } else {
    try {
      if (!new OffscreenCanvas(1, 1).getContext('2d')) throw new Error('no 2d');
    } catch {
      need('offscreen-2d', 'Contexto 2D de OffscreenCanvas', 'Actualiza el navegador a una versión reciente.');
    }
  }
  if (typeof File === 'undefined' || typeof Blob === 'undefined' || !('arrayBuffer' in Blob.prototype)) {
    need('files', 'API de archivos (File/Blob.arrayBuffer)', 'Actualiza el navegador a una versión reciente.');
  }
  if (!(typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') || !('download' in document.createElement('a'))) {
    need('download', 'Descarga de archivos generados', 'Actualiza el navegador a una versión reciente.');
  }

  if (missing.every((m) => m.id !== 'wasm') && !supportsSimd()) {
    warnings.push('Tu navegador no soporta WebAssembly SIMD: se usará el motor estándar, más lento.');
  }
  if (!('webkitdirectory' in document.createElement('input'))) {
    warnings.push('Este navegador no permite seleccionar carpetas: «Añadir carpeta» no estará disponible.');
  }
  if (!('serviceWorker' in navigator)) {
    warnings.push('Sin Service Worker: la aplicación no funcionará sin conexión.');
  }

  return { ok: missing.length === 0, missing, warnings, browser: describeBrowser() };
}
