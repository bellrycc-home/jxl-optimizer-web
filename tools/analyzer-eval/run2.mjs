import fs from 'node:fs';
import * as OLD from './analyzer.old.mjs';
import * as GEM from './analyzer.gemini.mjs';
let MINE = null; try { MINE = await import('./analyzer.mine.mjs?' + Date.now()); } catch (e) { if (process.env.DEBUG) console.log(e.message); }
let TILES = null; try { TILES = (await import('./sampling.mjs?' + Date.now())).tileSample; } catch {}
const impls = { old: OLD, gemini: GEM, ...(MINE ? { mine: MINE } : {}) };

function pointSample(img) {
  const sw = Math.max(1, Math.min(img.w, 192)), sh = Math.max(1, Math.min(img.h, 192)), data = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y++) { const sy = Math.min(img.h - 1, Math.floor(y * img.h / sh)); for (let x = 0; x < sw; x++) { const sx = Math.min(img.w - 1, Math.floor(x * img.w / sw)); const f = (sy * img.w + sx) * 4, t = (y * sw + x) * 4; data[t] = img.d[f]; data[t + 1] = img.d[f + 1]; data[t + 2] = img.d[f + 2]; data[t + 3] = img.d[f + 3]; } }
  return { data, width: sw, height: sh };
}
const modes = { point192: pointSample, ...(TILES ? { tiles: TILES } : {}) };
const hasAlpha = (img) => { for (let i = 3; i < img.d.length; i += 4) if (img.d[i] !== 255) return true; return false; };
const meta = JSON.parse(fs.readFileSync('real/meta.json', 'utf8'));
const groupOf = (n) => n.startsWith('photo') ? 'foto' : n.startsWith('shot') || n.startsWith('text') ? 'captura' : n.startsWith('illus') ? 'ilustración' : 'gráfico';
const score = {}, rows = [];
for (const m of meta) {
  const buf = fs.readFileSync(`real/${m.name}.rgba`), img = { w: m.w, h: m.h, d: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length) };
  const alpha = hasAlpha(img), g = groupOf(m.name), bpp = g === 'foto' ? 3.0 : 0.3;
  for (const [mode, build] of Object.entries(modes)) {
    const sample = build(img);
    for (const [impl, mod] of Object.entries(impls)) {
      const a = mod.analyzeImage({ file: { size: Math.round(bpp * m.w * m.h), type: 'image/png' }, header: { formatHint: 'PNG', details: {} }, width: m.w, height: m.h, sample, hasTransparency: alpha });
      const kindOk = m.truth.split('|').includes(a.kind), profOk = m.profiles.includes(a.recommendedProfile), key = `${impl}/${mode}`;
      const s = ((score[key] ??= {})[g] ??= { kind: 0, prof: 0, n: 0 }); s.n++; s.kind += kindOk; s.prof += profOk;
      rows.push({ name: m.name, key, kind: a.kind, conf: a.kindConfidence, prof: a.recommendedProfile, kindOk, profOk, ent: +a.entropy.toFixed(2), edge: +a.edgeRatio.toFixed(3), uc: a.uniqueColors, flat: a.flatRatio === undefined ? '-' : +a.flatRatio.toFixed(2), sharp: a.sharpEdgeRatio === undefined ? '-' : +a.sharpEdgeRatio.toFixed(3) });
    }
  }
}
console.log('=== ACIERTOS por grupo (tipo / perfil) — imágenes REALES');
const groups = ['foto', 'captura', 'ilustración', 'gráfico'];
console.log('impl/muestreo'.padEnd(20), groups.map((g) => g.padEnd(14)).join(''), 'TOTAL');
for (const [k, v] of Object.entries(score)) {
  let tk = 0, tp = 0, tn = 0;
  const cells = groups.map((g) => { const s = v[g]; if (!s) return ''.padEnd(14); tk += s.kind; tp += s.prof; tn += s.n; return `${s.kind}/${s.n} · ${s.prof}/${s.n}`.padEnd(14); });
  console.log(k.padEnd(20), cells.join(''), `tipo ${tk}/${tn} perfil ${tp}/${tn}`);
}
if (process.env.FAILS) { console.log('\n=== FALLOS'); for (const r of rows.filter((r) => (!r.kindOk || !r.profOk) && r.key === process.env.FAILS)) console.log(r.name.padEnd(28), r.kind.padEnd(20), r.conf.padEnd(10), r.prof.padEnd(16), `ent ${r.ent} edge ${r.edge} uc ${r.uc} flat ${r.flat} sharp ${r.sharp}`); }
if (process.env.STATS) { console.log('\n=== MÉTRICAS crudas'); for (const r of rows.filter((r) => r.key === process.env.STATS)) console.log(r.name.padEnd(28), r.kind.slice(0, 8).padEnd(9), `ent ${r.ent} edge ${r.edge} uc ${r.uc} flat ${r.flat} sharp ${r.sharp}`); }
