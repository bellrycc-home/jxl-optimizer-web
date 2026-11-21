import { zipSync, strToU8 } from 'fflate';

const INVALID_PATH_CHARS = /[<>:"|?*\u0000-\u001f]/g;

export function sanitizePath(path) {
  const parts = String(path || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .map((part) => part.replace(INVALID_PATH_CHARS, '_').replace(/[ .]+$/g, '').trim())
    .filter(Boolean);
  return parts.join('/');
}

export function outputPathFor(item) {
  const source = sanitizePath(item.path || item.file.name);
  const name = source.split('/').pop() || 'imagen';
  const base = name.replace(/\.[^.]+$/, '') || 'imagen';
  const folder = source.slice(0, Math.max(0, source.length - name.length));
  return `${folder}${base}.jxl`;
}

/** Ensures unique paths inside the ZIP, preserving folders. */
export function uniquePath(path, used) {
  let candidate = path;
  let counter = 1;
  while (used.has(candidate.toLowerCase())) {
    const slash = candidate.lastIndexOf('/');
    const folder = slash >= 0 ? candidate.slice(0, slash + 1) : '';
    const name = candidate.slice(slash + 1);
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    candidate = `${folder}${base}-${counter}${ext}`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before revoking the URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadItem(item) {
  if (!item.result?.bytes) return false;
  const filename = item.result.outputName || outputPathFor(item);
  downloadBlob(new Blob([item.result.bytes], { type: 'image/jxl' }), filename.split('/').pop());
  return true;
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildReport(items, finalPaths) {
  const header = [
    'archivo_original',
    'archivo_jxl',
    'estado',
    'formato',
    'ancho',
    'alto',
    'bytes_original',
    'bytes_jxl',
    'ahorro_porcentaje',
    'perfil',
    'distance',
    'effort',
    'modo_jpeg',
    'verificacion',
    'error',
  ];
  const rows = items.map((item) => {
    const r = item.result;
    return [
      item.path || item.file.name,
      (finalPaths?.get(item) ?? r?.outputName ?? ''),
      item.status,
      item.analysis?.format ?? '',
      item.analysis?.width ?? '',
      item.analysis?.height ?? '',
      item.file.size,
      r?.size ?? '',
      r ? ((1 - r.size / item.file.size) * 100).toFixed(2) : '',
      r?.profileLabel ?? '',
      r?.distance ?? '',
      r?.effort ?? '',
      r?.jpegMode ?? '',
      r?.verification?.message ?? item.skipReason ?? '',
      item.error ?? '',
    ].map(csvEscape).join(';');
  });
  return [header.join(';'), ...rows].join('\r\n');
}

export function buildReadme(items, generatedAt) {
  const done = items.filter((item) => item.result).length;
  return [
    'JXL Optimizer Web - lote de conversión',
    `Generado: ${generatedAt}`,
    `Imágenes en el lote: ${items.length}`,
    `Conversiones completadas: ${done}`,
    '',
    'Este ZIP se ha generado localmente en el navegador. Ninguna imagen se ha subido a un servidor.',
    'Los archivos originales no se han modificado ni eliminado.',
    'Los nombres se conservan cambiando la extensión a .jxl. Las colisiones reciben un sufijo -1, -2, ...',
    '',
    'El informe report.csv contiene tamaños, perfiles, parámetros reales y el resultado de verificación.',
  ].join('\r\n');
}

/**
 * Builds a ZIP with all completed outputs plus report.csv and README.txt.
 * Returns { blob, bytes, filename, included, skipped }.
 */
export function buildZip(items) {
  const completed = items.filter((item) => item.status === 'done' && item.result?.bytes);
  if (completed.length === 0) {
    throw new Error('No hay conversiones completadas para incluir en el ZIP.');
  }

  const used = new Set();
  const files = {};
  let totalBytes = 0;
  const finalPaths = new Map();

  for (const item of completed) {
    const path = uniquePath(item.result.outputName || outputPathFor(item), used);
    files[path] = item.result.bytes;
    totalBytes += item.result.bytes.length;
    finalPaths.set(item, path);
  }

  const generatedAt = new Date().toLocaleString('es-ES');
  files['report.csv'] = strToU8(`\uFEFF${buildReport(items, finalPaths)}`);
  files['README.txt'] = strToU8(buildReadme(items, generatedAt));

  // Level 0: JXL files are already compressed; recompressing them wastes CPU
  // and memory. fflate still stores the ZIP container structures.
  const zipped = zipSync(files, { level: 0 });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return {
    blob: new Blob([zipped], { type: 'application/zip' }),
    bytes: zipped,
    filename: `jxl-optimizer-${stamp}.zip`,
    included: completed.length,
    skipped: items.length - completed.length,
    totalBytes,
  };
}

export function downloadZip(items) {
  const zip = buildZip(items);
  if (zip.totalBytes > 1_500_000_000) {
    console.warn('El lote es muy grande; preparar el ZIP puede consumir bastante memoria.');
  }
  downloadBlob(zip.blob, zip.filename);
  return zip;
}

export function totalResultBytes(items) {
  return items.reduce((sum, item) => sum + (item.result?.size ?? 0), 0);
}
