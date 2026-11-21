// Regression tests for the heuristic, built from synthetic pixels (no image
// fixtures committed). Real-photo validation lives in docs/ANALYZER.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeImage, sampleTiles } from '../../src/core/analyzer.js';

function rng(seed) { let s = seed; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function image(w, h, pixel) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { const i = (y * w + x) * 4; const [r, g, b, a = 255] = pixel(x, y); d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; }
  return d;
}
function analyze(w, h, data, { format = 'PNG', alpha = false } = {}) {
  return analyzeImage({
    file: { size: 1000, type: 'image/png' },
    header: { formatHint: format, details: {} },
    width: w, height: h, sample: sampleTiles(data, w, h), hasTransparency: alpha,
  });
}

test('ruido natural (foto) se clasifica como fotografía y recomienda Equilibrado', () => {
  const r = rng(7);
  const data = image(1200, 800, (x, y) => { const base = 90 + 60 * Math.sin(x / 80) + 40 * Math.cos(y / 60); return [base + r() * 14, base * 0.8 + r() * 14, base * 0.6 + r() * 14]; });
  const a = analyze(1200, 800, data);
  assert.equal(a.kind, 'fotografía');
  assert.equal(a.recommendedProfile, 'balanced');
});

test('texto sobre fondo plano (captura) recomienda Lossless', () => {
  const data = image(1280, 720, (x, y) => (((x >> 2) + (y >> 3)) % 7 === 0 && y % 24 < 10 ? [20, 20, 30] : [250, 250, 250]));
  const a = analyze(1280, 720, data);
  assert.ok(['captura de pantalla', 'gráfico'].includes(a.kind), a.kind);
  assert.equal(a.recommendedProfile, 'lossless');
});

test('imagen de un solo color es un gráfico', () => {
  const a = analyze(800, 600, image(800, 600, () => [255, 255, 255]));
  assert.equal(a.kind, 'gráfico');
});

test('JPEG siempre recomienda Lossless (reversible) sea cual sea el contenido', () => {
  const r = rng(3);
  const data = image(640, 480, () => [r() * 255, r() * 255, r() * 255]);
  assert.equal(analyze(640, 480, data, { format: 'JPEG' }).recommendedProfile, 'lossless');
});

test('muestreo acotado y casos límite sin excepciones', () => {
  const big = image(4096, 2160, (x, y) => [x & 255, y & 255, (x ^ y) & 255]);
  const s = sampleTiles(big, 4096, 2160);
  assert.ok(s.width * s.height <= 4 * 96 * 4 * 96);
  for (const [w, h] of [[1, 1], [16, 16], [40, 4000], [4000, 30]]) {
    const a = analyze(w, h, image(w, h, (x, y) => [x * 3 % 256, y * 5 % 256, 9]));
    assert.ok(a.kind && a.recommendedProfile, `${w}x${h}`);
  }
});

test('las métricas no cruzan bordes de tesela', () => {
  // Mosaico de teselas cada una de color uniforme y distinto: no hay bordes reales.
  const w = 1000, h = 1000;
  const data = image(w, h, (x, y) => { const k = (Math.floor(x / 250) + Math.floor(y / 250)) * 40; return [k, k, k]; });
  const a = analyze(w, h, data);
  assert.equal(a.sharpEdgeRatio, 0);
});
