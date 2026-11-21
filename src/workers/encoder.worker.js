import { analyzeImage, probeHeader, sampleTiles } from '../core/analyzer.js';
import { createEngine } from '../wasm/jxl-engine.js';
import {
  compareByteStreams,
  comparePixelBuffers,
  jpegVerification,
  losslessVerification,
  lossyVerification,
} from '../core/verifier.js';

let engine = null;

function post(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

function log(message, level = 'info') {
  post('log', { message, level });
}

function detectFormat(file, header) {
  if (header?.formatHint) return header.formatHint;
  if (file.type === 'image/jpeg') return 'JPEG';
  if (file.type === 'image/png') return 'PNG';
  if (file.type === 'image/webp') return 'WebP';
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'JPEG';
  if (ext === 'png') return 'PNG';
  if (ext === 'webp') return 'WebP';
  return 'desconocido';
}

function decodeFailureMessage(file, error) {
  const detail = /could not be decoded/i.test(error?.message ?? '')
    ? 'El archivo no es una imagen válida o está dañado.'
    : (error?.message ?? 'error desconocido');
  return `El navegador no pudo decodificar la imagen (${file.type || 'desconocido'}): ${detail}`;
}

async function decodeToPixels(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new Error(decodeFailureMessage(file, error));
  }
  const width = bitmap.width;
  const height = bitmap.height;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
  if (!context) {
    bitmap.close();
    throw new Error('El navegador no pudo crear un contexto 2D offscreen.');
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = context.getImageData(0, 0, width, height);
  // Release the canvas backing store as soon as possible.
  canvas.width = 0;
  canvas.height = 0;
  return { width, height, data: imageData.data };
}

function detectTransparency(data) {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return true;
  }
  return false;
}

async function analyze({ id, file, maxPixels, metrics }) {
  const header = await probeHeader(file);
  const format = detectFormat(file, header);

  post('progress', { id, stage: 'analyze', label: 'Leyendo imagen...' });

  if (
    maxPixels
    && header.details.width
    && header.details.height
    && header.details.width * header.details.height > maxPixels
  ) {
    return {
      id,
      skippedByLimit: true,
      analysis: {
        format,
        width: header.details.width,
        height: header.details.height,
        megapixels: (header.details.width * header.details.height) / 1_000_000,
        recommendedProfile: null,
        recommendationReason: `Supera el límite configurado de ${(maxPixels / 1_000_000).toFixed(0)} MP.`,
        details: header.details,
      },
    };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new Error(decodeFailureMessage(file, error));
  }

  const width = bitmap.width;
  const height = bitmap.height;

  if (maxPixels && width * height > maxPixels) {
    bitmap.close();
    return {
      id,
      skippedByLimit: true,
      analysis: {
        format,
        width,
        height,
        megapixels: (width * height) / 1_000_000,
        recommendedProfile: null,
        recommendationReason: `Supera el límite configurado de ${(maxPixels / 1_000_000).toFixed(0)} MP.`,
        details: header.details,
      },
    };
  }

  if (metrics === false) {
    bitmap.close();
    return {
      id,
      analysis: {
        format,
        width,
        height,
        megapixels: (width * height) / 1_000_000,
        hasTransparency: null,
        uniqueColors: 0,
        uniqueRatio: 0,
        entropy: 0,
        edgeRatio: 0,
        avgLuma: 0,
        kind: null,
        kindConfidence: null,
        kindReason: null,
        complexity: null,
        recommendedProfile: null,
        recommendationReason: 'Análisis automático desactivado por el usuario.',
        details: header.details,
      },
    };
  }

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
  if (!context) {
    bitmap.close();
    throw new Error('El navegador no pudo crear un contexto 2D offscreen.');
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = context.getImageData(0, 0, width, height);
  canvas.width = 0;
  canvas.height = 0;

  const hasTransparency = detectTransparency(imageData.data);

  // Native-resolution tile mosaic (~147k px max): keeps the local pixel noise
  // that separates photos from screenshots, unlike a point-sampled thumbnail.
  const sample = sampleTiles(imageData.data, width, height);

  const analysis = analyzeImage({
    file,
    header: { ...header, formatHint: format },
    width,
    height,
    sample,
    hasTransparency,
  });
  analysis.format = format;
  analysis.details = header.details;

  return { id, analysis };
}

function preparePixels(imageData, hasTransparency) {
  if (hasTransparency) {
    return {
      pixels: new Uint8Array(
        imageData.data.buffer,
        imageData.data.byteOffset,
        imageData.data.byteLength,
      ),
      channels: 4,
    };
  }
  const { width, height, data } = imageData;
  const rgb = new Uint8Array(width * height * 3);
  for (let src = 0, dst = 0; src < data.length; src += 4, dst += 3) {
    rgb[dst] = data[src];
    rgb[dst + 1] = data[src + 1];
    rgb[dst + 2] = data[src + 2];
  }
  return { pixels: rgb, channels: 3 };
}

async function encodeJPEGReversible({ id, file, effort }) {
  post('progress', { id, stage: 'encode', label: 'Recompilando JPEG sin pérdida...' });
  const original = new Uint8Array(await file.arrayBuffer());
  const t0 = performance.now();
  const jxl = engine.encodeJPEG({ bytes: original, effort });
  const encodeMs = performance.now() - t0;

  post('progress', { id, stage: 'verify', label: 'Verificando reconstrucción JPEG...' });
  const t1 = performance.now();
  let verification;
  try {
    const reconstructed = engine.reconstructJPEG({ bytes: jxl });
    verification = jpegVerification(compareByteStreams(original, reconstructed));
  } catch (error) {
    verification = {
      kind: 'jpeg-reversible',
      ok: false,
      message: `No se pudo verificar la reconstrucción JPEG: ${error.message}`,
    };
  }
  const verifyMs = performance.now() - t1;

  return {
    id,
    bytes: jxl,
    size: jxl.length,
    width: null,
    height: null,
    channels: null,
    modes: { jpegMode: 'reversible' },
    verification,
    timings: { encodeMs, verifyMs },
  };
}

async function encodePixels({ id, file, distance, effort, lossless, header }) {
  post('progress', { id, stage: 'decode', label: 'Decodificando imagen en el navegador...' });
  const t0 = performance.now();
  const imageData = await decodeToPixels(file);
  const decodeMs = performance.now() - t0;

  const hasTransparency = detectTransparency(imageData.data);
  const { pixels, channels } = preparePixels(imageData, hasTransparency);

  post('progress', {
    id,
    stage: 'encode',
    label: `Codificando JPEG XL (${lossless ? 'lossless' : `distance ${distance}`}, effort ${effort})...`,
  });
  const t1 = performance.now();
  const jxl = engine.encodeRGBA({
    pixels,
    width: imageData.width,
    height: imageData.height,
    channels,
    distance,
    effort,
    lossless,
  });
  const encodeMs = performance.now() - t1;

  post('progress', { id, stage: 'verify', label: 'Verificando el JXL generado...' });
  const t2 = performance.now();
  let verification;
  try {
    const decoded = engine.decode({ bytes: jxl });
    if (lossless) {
      verification = losslessVerification(
        comparePixelBuffers(
          pixels,
          decoded.pixels,
          channels,
          decoded.channels,
          imageData.width,
          imageData.height,
        ),
      );
    } else {
      verification = lossyVerification({
        width: decoded.width,
        height: decoded.height,
        channels: decoded.channels,
        expectedWidth: imageData.width,
        expectedHeight: imageData.height,
      });
    }
  } catch (error) {
    verification = {
      kind: lossless ? 'lossless' : 'lossy',
      ok: false,
      message: `No se pudo decodificar el JXL para verificar: ${error.message}`,
    };
  }
  const verifyMs = performance.now() - t2;

  return {
    id,
    bytes: jxl,
    size: jxl.length,
    width: imageData.width,
    height: imageData.height,
    channels,
    hasTransparency,
    modes: { jpegMode: 'pixels' },
    verification,
    timings: { decodeMs, encodeMs, verifyMs },
  };
}

self.onmessage = async (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'init') {
    const missing = [];
    if (typeof createImageBitmap !== 'function') missing.push('createImageBitmap');
    if (typeof OffscreenCanvas === 'undefined') missing.push('OffscreenCanvas');
    if (missing.length > 0) {
      post('fatal', {
        message: `Este navegador no ofrece dentro de un Web Worker: ${missing.join(', ')}. Usa una versión reciente de Chrome, Edge, Firefox o Safari.`,
      });
      return;
    }
    try {
      engine = await createEngine(data.baseUrl, log);
      post('ready', {
        version: engine.version,
        variant: engine.variant,
        effortMin: engine.effortMin,
        effortMax: engine.effortMax,
      });
    } catch (error) {
      post('fatal', { message: error.message });
    }
    return;
  }

  if (!engine) {
    post('error', { id: data.id, message: 'El motor JPEG XL todavía no está cargado.' });
    return;
  }

  try {
    if (data.type === 'analyze') {
      const result = await analyze(data);
      post('analyzed', result);
      return;
    }

    if (data.type === 'encode') {
      const format = detectFormat(data.file, data.header);
      const useJpegReversible = format === 'JPEG' && data.options.jpegMode === 'reversible';
      let result;
      if (useJpegReversible) {
        result = await encodeJPEGReversible({
          id: data.id,
          file: data.file,
          effort: data.options.effort,
        });
      } else {
        result = await encodePixels({
          id: data.id,
          file: data.file,
          distance: data.options.distance,
          effort: data.options.effort,
          lossless: data.options.lossless,
          header: data.header,
        });
      }
      result.format = format;
      result.profileId = data.options.profileId;
      result.profileLabel = data.options.profileLabel;
      result.distance = data.options.distance;
      result.effort = data.options.effort;
      result.lossless = data.options.lossless;
      result.jpegMode = useJpegReversible ? 'reversible' : (format === 'JPEG' ? 'lossy' : 'n/a');

      const buffer = result.bytes.buffer;
      post('encoded', result, [buffer]);
      return;
    }

    post('error', { id: data.id, message: `Mensaje de worker desconocido: ${data.type}` });
  } catch (error) {
    post('error', {
      id: data.id,
      message: error?.message ?? String(error),
      stack: error?.stack ?? null,
    });
  }
};
