// Static checks on dist/: relative paths, WASM present, SW placeholders replaced.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const problems = [];
const fail = (msg) => problems.push(msg);
const read = (f) => readFileSync(join(dist, f), 'utf8');

const html = read('index.html');
for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const url = m[1];
  if (/^(https?:|data:|#)/.test(url)) { if (/^https?:/.test(url) && !url.includes('lucide.dev')) fail(`recurso externo: ${url}`); continue; }
  if (url.startsWith('/')) fail(`ruta absoluta en index.html: ${url}`);
  else if (!existsSync(join(dist, url))) fail(`falta ${url}`);
}
for (const f of ['wasm/jxl_engine_std.js', 'wasm/jxl_engine_std.wasm', 'wasm/jxl_engine_simd.js', 'wasm/jxl_engine_simd.wasm', 'manifest.webmanifest', 'sw.js', 'favicon.svg']) {
  if (!existsSync(join(dist, f))) fail(`falta ${f}`);
}
if (/(?:href|src)="[^"]*\/?src\//.test(html)) fail('index.html referencia /src/ (no está compilado)');
if (!html.includes('Content-Security-Policy')) fail('falta la meta CSP');
if (!existsSync(join(dist, '.nojekyll'))) fail('falta .nojekyll');
const sw = read('sw.js');
if (sw.includes('__BUILD_ID__')) fail('sw.js sin BUILD_ID');
const list = sw.match(/const PRECACHE = (\[.*\]);/s);
if (!list) fail('sw.js sin lista de precaché');
else {
  const files = JSON.parse(list[1]);
  if (files.length < 8) fail(`precaché sospechosamente corto (${files.length})`);
  for (const f of files) if (!existsSync(join(dist, f))) fail(`precaché apunta a un archivo inexistente: ${f}`);
  if (files.some((f) => f.startsWith('wasm/'))) fail('el WASM no debe ir en el precaché (se cachea al usarse)');
}
const manifest = JSON.parse(read('manifest.webmanifest'));
for (const key of ['start_url', 'scope']) if (manifest[key] && manifest[key].startsWith('/')) fail(`manifest.${key} absoluto: ${manifest[key]}`);

if (problems.length) { console.error('check-dist FALLÓ:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('check-dist OK');
