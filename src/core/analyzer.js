// Automatic image analysis.
//
// Everything here is a heuristic: the UI/log must say "probablemente" or
// "tipo probable" and never claim certainty about the real image type.
// The goal is to recommend a sensible profile, not to classify content perfectly.
//
// The metrics are measured on NATIVE-RESOLUTION tiles (see sampleTiles), not
// on a point-sampled thumbnail. A thumbnail destroys the signal that separates
// photos from screenshots (sensor/JPEG noise vs. exactly repeated pixels).

const KIND = {
  PHOTO: 'fotografía',
  SCREENSHOT: 'captura de pantalla',
  ILLUSTRATION: 'ilustración',
  GRAPHIC: 'gráfico',
};

const PROFILE_LABEL = {
  lossless: 'Lossless',
  'low-compression': 'Baja compresión',
  balanced: 'Equilibrado',
  low: 'Bajo',
  ultra: 'Ultraahorro',
};

function formatMp(mp) {
  return mp >= 1 ? `${mp.toFixed(1)} MP` : `${Math.round(mp * 1000)} kpx`;
}

/**
 * Reads a few header bytes without decoding the image. It detects PNG bit
 * depth/color type, JPEG sample precision and WebP chunk hints.
 */
export async function probeHeader(file) {
  // SOF markers are usually within the first few KB, but 128 KB covers
  // files with large metadata segments.
  const head = new Uint8Array(await file.slice(0, 131072).arrayBuffer());
  const result = { formatHint: null, details: {} };
  const u16be = (offset) => (head[offset] << 8) | head[offset + 1];
  const u32be = (offset) =>
    ((head[offset] << 24) | (head[offset + 1] << 16) | (head[offset + 2] << 8) | head[offset + 3]) >>> 0;

  if (head.length >= 33 && head[0] === 0x89 && head[1] === 0x50) {
    result.formatHint = 'PNG';
    result.details.pngBitDepth = head[24];
    result.details.pngColorType = head[25];
    result.details.width = u32be(16);
    result.details.height = u32be(20);
    if (head[24] > 8) {
      result.details.warning = `PNG de ${head[24]} bits por canal: el canvas del navegador lo decodifica a 8 bits.`;
    }
  } else if (head.length >= 4 && head[0] === 0xff && head[1] === 0xd8) {
    result.formatHint = 'JPEG';
    // Scan markers for SOF to read precision and dimensions.
    for (let i = 2; i + 9 < head.length; i += 1) {
      if (head[i] !== 0xff) continue;
      const marker = head[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        result.details.jpegPrecision = head[i + 4];
        result.details.height = u16be(i + 5);
        result.details.width = u16be(i + 7);
        if (head[i + 4] !== 8) {
          result.details.warning = `JPEG de ${head[i + 4]} bits: el canvas del navegador lo decodifica a 8 bits.`;
        }
        break;
      }
    }
  } else if (
    head.length >= 16 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46
  ) {
    result.formatHint = 'WebP';
    const chunk = String.fromCharCode(head[12], head[13], head[14], head[15]);
    result.details.webpChunk = chunk;
    if (chunk === 'VP8L') {
      result.details.webpMode = 'lossless';
    } else if (chunk === 'VP8 ') {
      result.details.webpMode = 'lossy';
    } else if (chunk === 'VP8X' && head.length >= 30) {
      result.details.width = 1 + (head[24] | (head[25] << 8) | (head[26] << 16));
      result.details.height = 1 + (head[27] | (head[28] << 8) | (head[29] << 16));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

export const TILE_GRID = 4; // 4x4 tiles spread over the image
export const TILE_SIZE = 96; // native pixels per tile side
const WHOLE_IMAGE_MAX = 256; // images up to this size are analysed whole
const MIN_TILE = 24;

/**
 * Builds a bounded sample of NATIVE pixels: a mosaic of up to 4x4 tiles of
 * 96x96 px (~147k px) taken around the centres of a regular grid. Tiles keep
 * local pixel structure intact; statistics never cross tile borders.
 *
 * @param {Uint8ClampedArray} data RGBA pixels of the full image
 * @returns {{data:Uint8ClampedArray,width:number,height:number,tileWidth:number,tileHeight:number}}
 */
export function sampleTiles(data, width, height) {
  if (width <= WHOLE_IMAGE_MAX && height <= WHOLE_IMAGE_MAX) {
    return { data, width, height, tileWidth: width, tileHeight: height };
  }
  const tile = Math.min(TILE_SIZE, Math.floor(width / TILE_GRID), Math.floor(height / TILE_GRID));
  if (tile < MIN_TILE) {
    // Extreme aspect ratio: use one centred native crop instead of tiles.
    const cw = Math.min(width, WHOLE_IMAGE_MAX);
    const ch = Math.min(height, WHOLE_IMAGE_MAX);
    const x0 = Math.floor((width - cw) / 2);
    const y0 = Math.floor((height - ch) / 2);
    const out = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y += 1) {
      const from = ((y0 + y) * width + x0) * 4;
      out.set(data.subarray(from, from + cw * 4), y * cw * 4);
    }
    return { data: out, width: cw, height: ch, tileWidth: cw, tileHeight: ch };
  }
  const sw = TILE_GRID * tile;
  const out = new Uint8ClampedArray(sw * sw * 4);
  for (let gy = 0; gy < TILE_GRID; gy += 1) {
    for (let gx = 0; gx < TILE_GRID; gx += 1) {
      const x0 = Math.min(width - tile, Math.max(0, Math.floor(((gx + 0.5) * width) / TILE_GRID - tile / 2)));
      const y0 = Math.min(height - tile, Math.max(0, Math.floor(((gy + 0.5) * height) / TILE_GRID - tile / 2)));
      for (let y = 0; y < tile; y += 1) {
        const from = ((y0 + y) * width + x0) * 4;
        const to = ((gy * tile + y) * sw + gx * tile) * 4;
        out.set(data.subarray(from, from + tile * 4), to);
      }
    }
  }
  return { data: out, width: sw, height: sw, tileWidth: tile, tileHeight: tile };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * @param {object} input
 * @param {File} input.file
 * @param {{formatHint?:string, details?:object}} input.header
 * @param {number} input.width  real image width
 * @param {number} input.height real image height
 * @param {{data:Uint8ClampedArray, width:number, height:number, tileWidth?:number, tileHeight?:number}} input.sample
 * @param {boolean} input.hasTransparency
 */
export function analyzeImage({ file, header, width, height, sample, hasTransparency }) {
  const megapixels = (width * height) / 1_000_000;
  const bytesPerPixel = file.size / Math.max(1, width * height);
  const format = header?.formatHint ?? formatFromMime(file.type);

  const stats = sampleStats(sample);
  const effectiveTransparency = Boolean(hasTransparency || stats.hasAlphaInSample);
  const kindInfo = classify({ stats, hasTransparency: effectiveTransparency, format });
  const recommendation = recommend({
    kind: kindInfo.kind,
    format,
    megapixels,
    bytesPerPixel,
    hasTransparency: effectiveTransparency,
    stats,
  });

  return {
    format,
    width,
    height,
    megapixels,
    bytesPerPixel,
    hasTransparency: effectiveTransparency,
    ...stats,
    kind: kindInfo.kind,
    kindConfidence: kindInfo.confidence,
    kindReason: kindInfo.reason,
    complexity: complexityLabel(stats),
    recommendedProfile: recommendation.profile,
    recommendationReason: recommendation.reason,
    details: header?.details ?? {},
    warning: header?.details?.warning ?? null,
  };
}

function formatFromMime(type) {
  if (type === 'image/jpeg') return 'JPEG';
  if (type === 'image/png') return 'PNG';
  if (type === 'image/webp') return 'WebP';
  return 'desconocido';
}

const EMPTY_STATS = {
  uniqueColors: 0,
  uniqueRatio: 0,
  colorDiversity: 0,
  topColorsCoverage: 0,
  exactFlatRatio: 0,
  smoothRatio: 0,
  entropy: 0,
  edgeRatio: 0,
  sharpEdgeRatio: 0,
  blankTileRatio: 0,
  partialAlphaRatio: 0,
  hasAlphaInSample: false,
  avgLuma: 0,
};

/**
 * Metrics (all measured inside tiles, never across tile borders):
 *  - colorDiversity    exact RGBA colours / pixels, over non-blank tiles. Photos
 *                      (noise, JPEG) are high; UI, text and vector art are tiny.
 *  - topColorsCoverage share of pixels covered by the 16 most common colours.
 *  - exactFlatRatio    neighbour pairs with IDENTICAL pixels.
 *  - smoothRatio       neighbour pairs differing by <= 2 levels (gradients).
 *  - sharpEdgeRatio    neighbour pairs differing by > 48 levels (text/UI edges).
 *  - blankTileRatio    tiles holding a single colour (backgrounds).
 *  - entropy/edgeRatio/uniqueColors legacy descriptive values.
 */
function sampleStats(sample) {
  const { data, width, height } = sample ?? {};
  if (!data || !width || !height) return { ...EMPTY_STATS };
  const tileWidth = sample.tileWidth ?? width;
  const tileHeight = sample.tileHeight ?? height;
  const tilesX = Math.max(1, Math.floor(width / tileWidth));
  const tilesY = Math.max(1, Math.floor(height / tileHeight));

  const freq = new Map();
  const colors4 = new Set();
  const histogram = new Uint32Array(32);
  let totalPixels = 0;
  let measuredPixels = 0;
  let blankTiles = 0;
  let tileCount = 0;
  let lumaSum = 0;
  let pairs = 0;
  let exact = 0;
  let smooth = 0;
  let sharp = 0;
  let edgeSum = 0;
  let partialAlpha = 0;
  let anyAlpha = 0;

  for (let ty = 0; ty < tilesY; ty += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      tileCount += 1;
      const x0 = tx * tileWidth;
      const y0 = ty * tileHeight;
      const first = (y0 * width + x0) * 4;
      let blank = true;

      for (let y = 0; y < tileHeight; y += 1) {
        for (let x = 0; x < tileWidth; x += 1) {
          const i = ((y0 + y) * width + x0 + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          totalPixels += 1;
          if (a < 255) {
            anyAlpha += 1;
            if (a > 0) partialAlpha += 1;
          }
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          lumaSum += luma;
          histogram[Math.min(31, Math.floor(luma / 8))] += 1;
          colors4.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
          if (blank && (r !== data[first] || g !== data[first + 1] || b !== data[first + 2] || a !== data[first + 3])) {
            blank = false;
          }
        }
      }

      if (blank) {
        blankTiles += 1;
        continue;
      }

      for (let y = 0; y < tileHeight; y += 1) {
        for (let x = 0; x < tileWidth; x += 1) {
          const i = ((y0 + y) * width + x0 + x) * 4;
          measuredPixels += 1;
          const key = ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) + data[i + 3] * 16777216;
          freq.set(key, (freq.get(key) ?? 0) + 1);

          const neighbours = [
            x + 1 < tileWidth ? i + 4 : -1,
            y + 1 < tileHeight ? i + width * 4 : -1,
          ];
          for (const j of neighbours) {
            if (j < 0) continue;
            const d = Math.max(
              Math.abs(data[i] - data[j]),
              Math.abs(data[i + 1] - data[j + 1]),
              Math.abs(data[i + 2] - data[j + 2]),
              Math.abs(data[i + 3] - data[j + 3]),
            );
            pairs += 1;
            edgeSum += d;
            if (d === 0) exact += 1;
            if (d <= 2) smooth += 1;
            if (d > 48) sharp += 1;
          }
        }
      }
    }
  }

  let entropy = 0;
  for (const count of histogram) {
    if (count === 0) continue;
    const p = count / totalPixels;
    entropy -= p * Math.log2(p);
  }

  const counts = [...freq.values()].sort((a, b) => b - a);
  let top = 0;
  for (let k = 0; k < Math.min(16, counts.length); k += 1) top += counts[k];

  return {
    uniqueColors: colors4.size,
    uniqueRatio: colors4.size / totalPixels,
    colorDiversity: measuredPixels ? freq.size / measuredPixels : 0,
    topColorsCoverage: measuredPixels ? top / measuredPixels : 1,
    exactFlatRatio: pairs ? exact / pairs : 1,
    smoothRatio: pairs ? smooth / pairs : 1,
    entropy,
    edgeRatio: pairs ? edgeSum / pairs / 255 : 0,
    sharpEdgeRatio: pairs ? sharp / pairs : 0,
    blankTileRatio: tileCount ? blankTiles / tileCount : 0,
    partialAlphaRatio: partialAlpha / totalPixels,
    hasAlphaInSample: anyAlpha > 0,
    avgLuma: lumaSum / totalPixels,
  };
}

// Thresholds measured on real photos / screenshots / vector art (see
// tests/analyzer.test.mjs for the fixtures-free regression cases). Photos sat
// at colorDiversity >= 0.066 and topColorsCoverage <= 0.23; UI, text and
// vector art at colorDiversity <= 0.021.
const PHOTO_DIVERSITY = 0.06;
const PALETTE_DIVERSITY = 0.03;
const GRADIENT_SMOOTH = 0.93;

function classify({ stats, hasTransparency, format }) {
  const { colorDiversity, topColorsCoverage, smoothRatio, sharpEdgeRatio, exactFlatRatio } = stats;

  // Nothing but backgrounds: flat vector art / logo on a plain canvas.
  if (stats.blankTileRatio >= 1 || colorDiversity === 0) {
    return {
      kind: KIND.GRAPHIC,
      confidence: 'media',
      reason: 'todas las zonas muestreadas son de un único color',
    };
  }

  // Many exact colours: natural noise (sensor, JPEG) => photograph, unless the
  // image is an almost perfectly smooth synthetic gradient.
  if (colorDiversity >= PHOTO_DIVERSITY && topColorsCoverage < 0.3) {
    if (smoothRatio >= GRADIENT_SMOOTH && sharpEdgeRatio < 0.01) {
      return {
        kind: KIND.ILLUSTRATION,
        confidence: 'media',
        reason: 'degradados muy suaves sin ruido ni bordes marcados',
      };
    }
    const strong = colorDiversity >= 0.2 && topColorsCoverage < 0.15;
    return {
      kind: KIND.PHOTO,
      confidence: strong ? 'media-alta' : 'media',
      reason: 'gran variedad de colores exactos y ruido natural en los píxeles',
    };
  }

  // Smooth synthetic gradients with a mid-size palette (CSS/vector shading).
  if (colorDiversity >= PALETTE_DIVERSITY && smoothRatio >= GRADIENT_SMOOTH && sharpEdgeRatio < 0.01) {
    return {
      kind: KIND.ILLUSTRATION,
      confidence: 'media',
      reason: 'degradados suaves con paleta amplia pero sin ruido',
    };
  }

  // Limited palette: text/UI (crisp, high-contrast edges) vs flat graphics.
  if (colorDiversity < PALETTE_DIVERSITY) {
    const crisp = sharpEdgeRatio >= 0.02 && !hasTransparency;
    if (crisp) {
      return {
        kind: KIND.SCREENSHOT,
        confidence: exactFlatRatio > 0.8 || topColorsCoverage > 0.85 ? 'media-alta' : 'media',
        reason: 'paleta muy acotada con bordes nítidos de alto contraste, típico de texto e interfaz',
      };
    }
    return {
      kind: KIND.GRAPHIC,
      confidence: topColorsCoverage > 0.85 ? 'media-alta' : 'media',
      reason: 'paleta muy acotada y zonas planas, típico de gráficos vectoriales o logotipos',
    };
  }

  return {
    kind: format === 'JPEG' ? KIND.PHOTO : KIND.ILLUSTRATION,
    confidence: 'baja',
    reason: 'métricas intermedias o mixtas sin predominio claro',
  };
}

function recommend({ kind, format, megapixels, bytesPerPixel, hasTransparency, stats }) {
  // JPEG files default to lossless bitstream reconstruction when supported,
  // independent of perceptual distance.
  if (format === 'JPEG') {
    return {
      profile: 'lossless',
      reason: 'JPEG reversible conserva el bitstream original; si buscas menor peso, evalúa recodificar con pérdida',
    };
  }

  if (kind === KIND.SCREENSHOT || kind === KIND.GRAPHIC) {
    if (format === 'PNG') {
      return {
        profile: 'lossless',
        reason: 'captura/gráfico en PNG: Lossless protege texto y bordes nítidos sin artefactos',
      };
    }
    return {
      profile: 'low-compression',
      reason: 'captura/gráfico ya comprimido: Baja compresión limita artefactos en bordes y texto',
    };
  }

  if (kind === KIND.ILLUSTRATION) {
    return {
      profile: 'low-compression',
      reason: 'ilustración: Baja compresión ayuda a preservar degradados y trazos',
    };
  }

  if (megapixels < 0.35) {
    return {
      profile: 'low-compression',
      reason: 'resolución pequeña: conviene priorizar calidad frente a un ahorro en bytes reducido',
    };
  }

  if (hasTransparency && stats.partialAlphaRatio > 0.02) {
    return {
      profile: 'low-compression',
      reason: 'transparencia con bordes suaves/parciales: Baja compresión cuida mejor las transiciones del alfa',
    };
  }

  if (megapixels > 20 || bytesPerPixel > 2.5) {
    return {
      profile: 'balanced',
      reason: 'imagen detallada o de gran tamaño: Equilibrado ofrece buen balance entre ahorro y fidelidad',
    };
  }

  return {
    profile: 'balanced',
    reason: 'fotografía típica: Equilibrado es el perfil de referencia',
  };
}

function complexityLabel(stats) {
  if (stats.colorDiversity > 0.3 || stats.sharpEdgeRatio > 0.06) return 'alta';
  if (stats.colorDiversity > 0.08 || stats.sharpEdgeRatio > 0.025) return 'media';
  return 'baja';
}

export function describeAnalysis(analysis) {
  if (!analysis) return 'Análisis pendiente.';
  const bits = [
    `${analysis.format} · ${analysis.width}×${analysis.height} (${formatMp(analysis.megapixels)})`,
    `tipo probable: ${analysis.kind} (confianza ${analysis.kindConfidence})`,
    `complejidad ${analysis.complexity}`,
    analysis.hasTransparency ? 'con transparencia' : 'sin transparencia',
    `perfil recomendado: ${PROFILE_LABEL[analysis.recommendedProfile] ?? analysis.recommendedProfile}`,
  ];
  return bits.join(' | ');
}
