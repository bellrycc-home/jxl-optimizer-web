import test from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import { downloadBlob, downloadItem } from '../../src/core/download-manager.js';
import {
  buildZipAsync,
  decideDownload,
  downloadIndividually,
  limitsFromMaxMB,
  loadZipLimits,
  planZip,
  saveZipLimits,
} from '../../src/core/zip-safe.js';

const MB = 1024 * 1024;
const bytesOf = (text) => new TextEncoder().encode(text);

function item(path, content, status = 'done', extra = {}) {
  const name = path.split('/').pop();
  const bytes = bytesOf(content);
  return {
    id: Math.random(),
    file: { name, size: 100 },
    path,
    status,
    result: status === 'done'
      ? { bytes, size: bytes.length, blob: new Blob([bytes]), outputName: path.replace(/\.[^.]+$/, '.jxl'), profileLabel: 'Equilibrado', effort: 7, distance: 1.5, verification: { ok: true, message: 'ok' } }
      : null,
    error: status === 'error' ? 'fallo; con punto y coma' : null,
    ...extra,
  };
}
const fake = (size) => ({ status: 'done', file: { name: 'x.png', size: 1 }, result: { bytes: { length: size }, size } });
const unzip = async (blob) => unzipSync(new Uint8Array(await blob.arrayBuffer()));

test('ZIP válido con contenido íntegro, report.csv y README', async () => {
  const zip = await buildZipAsync([item('a.png', 'AAA'), item('b.png', 'BBBB')]);
  const files = await unzip(zip.blob);
  assert.deepEqual(Object.keys(files).sort(), ['README.txt', 'a.jxl', 'b.jxl', 'report.csv']);
  assert.equal(strFromU8(files['a.jxl']), 'AAA');
  assert.equal(strFromU8(files['b.jxl']), 'BBBB');
  assert.equal(zip.included, 2);
  assert.equal(zip.size, zip.blob.size);
});

test('nombres repetidos no se pisan', async () => {
  const zip = await buildZipAsync([item('photo.png', '1'), item('photo.png', '2'), item('photo.png', '3')]);
  const files = await unzip(zip.blob);
  assert.deepEqual(Object.keys(files).filter((n) => n.endsWith('.jxl')).sort(), ['photo-1.jxl', 'photo-2.jxl', 'photo.jxl']);
});

test('subcarpetas se conservan y .. se neutraliza', async () => {
  const zip = await buildZipAsync([item('a/b/c/img.png', 'x'), item('../../evil.png', 'y')]);
  const names = Object.keys(await unzip(zip.blob));
  assert.ok(names.includes('a/b/c/img.jxl'));
  assert.ok(names.every((n) => !n.includes('..')), names.join(','));
});

test('caracteres Unicode en nombres', async () => {
  const zip = await buildZipAsync([item('café/日本語/ñandú 🙂.png', 'u')]);
  assert.ok(Object.keys(await unzip(zip.blob)).includes('café/日本語/ñandú 🙂.jxl'));
});

test('report.csv: BOM, cabecera y una fila por elemento, con escapado', async () => {
  const items = [item('a.png', 'A'), item('bad.png', '', 'error')];
  const files = await unzip((await buildZipAsync(items)).blob);
  const text = strFromU8(files['report.csv']);
  assert.ok(text.startsWith('\uFEFF'));
  const lines = text.slice(1).split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, items.length + 1);
  assert.match(lines[0], /^archivo_original;archivo_jxl;estado/);
  assert.match(text, /"fallo; con punto y coma"/);
});

test('sin resultados completados el ZIP falla con mensaje claro', async () => {
  await assert.rejects(buildZipAsync([item('x.png', '', 'error')]), /No hay conversiones completadas/);
});

test('el resultado no retiene buffers (solo blob y metadatos)', async () => {
  const zip = await buildZipAsync([item('a.png', 'A'), item('b.png', 'B')]);
  assert.equal(zip.bytes, undefined);
  assert.ok(zip.blob instanceof Blob);
});

test('una sola imagen: descarga directa, sin ZIP', () => {
  assert.equal(decideDownload([item('a.png', 'A')], limitsFromMaxMB(800)).mode, 'single');
  assert.equal(decideDownload([], limitsFromMaxMB(800)).mode, 'none');
});

test('lotes pequeños siguen creando ZIP; grandes avisan; enormes se bloquean', () => {
  const limits = limitsFromMaxMB(100); // warn 40 MB, max 100 MB
  const mk = (...sizes) => sizes.map(fake);
  assert.equal(decideDownload(mk(5 * MB, 5 * MB), limits).mode, 'zip');
  assert.equal(decideDownload(mk(30 * MB, 30 * MB), limits).mode, 'confirm-zip');
  assert.equal(decideDownload(mk(60 * MB, 60 * MB), limits).mode, 'individual-only');
  const plan = planZip(mk(30 * MB, 30 * MB), limits);
  assert.equal(plan.totalBytes, 60 * MB);
  assert.equal(plan.estimatedPeakBytes, 120 * MB);
});

test('límite configurable: valores inválidos vuelven al valor por defecto', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(loadZipLimits(storage).maxMB, 800);
  assert.equal(saveZipLimits(250, storage).maxMB, 250);
  assert.equal(loadZipLimits(storage).maxMB, 250);
  assert.equal(limitsFromMaxMB(-5).maxMB, 800);
  assert.equal(loadZipLimits({ getItem() { throw new Error('denied'); } }).maxMB, 800);
});

test('liberación de recursos: la URL temporal se revoca y no hay temporizadores colgados', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const created = [];
  const revoked = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => { created.push(blob); return `blob:test/${created.length}`; };
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
  t.after(() => { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; delete globalThis.document; });

  downloadItem(item('a.png', 'A'));
  assert.equal(created.length, 1);
  assert.equal(revoked.length, 0);
  t.mock.timers.tick(60_000);
  assert.deepEqual(revoked, ['blob:test/1']);
});

test('descargas individuales: nombres únicos y una por resultado', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const downloads = [];
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = () => 'blob:x';
  globalThis.document = {
    createElement: () => ({ set download(name) { downloads.push(name); }, click() {}, remove() {} }),
    body: { appendChild() {} },
  };
  t.after(() => { URL.createObjectURL = originalCreate; delete globalThis.document; });
  const count = await downloadIndividually(
    [item('x/photo.png', '1'), item('y/photo.png', '2'), item('bad.png', '', 'error')],
    { sleep: async () => {} },
  );
  assert.equal(count, 2);
  assert.deepEqual(downloads.sort(), ['photo-1.jxl', 'photo.jxl']);
});
