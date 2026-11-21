// Performance/memory measurements through the real UI (production build).
// Usage: npm run build && npm run bench. Output: bench-results/bench.json
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { attach, makeImages, serve, setEffort, setProfile, waitBatch, waitEngine } from './lib-browser.mjs';

const rssMB = () => {
  try {
    const out = execFileSync('ps', ['-eo', 'rss=,comm='], { encoding: 'utf8' });
    return Math.round(out.split('\n').filter((l) => /chrom|headless_shell/i.test(l)).reduce((s, l) => s + Number(l.trim().split(/\s+/)[0] || 0), 0) / 1024);
  } catch { return null; }
};
const site = await serve('dist');
const browser = await chromium.launch();
const out = [];

async function scenario(name, specs, effort) {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await page.goto(site.url); await waitEngine(page);
  await makeImages(page, specs);
  await setProfile(page, 'Personalizado'); await setEffort(page, effort);
  await attach(page, specs.map((s) => s.name));
  await page.waitForFunction((n) => document.querySelectorAll('.file-row').length === n && !document.querySelector('#startBtn').disabled, specs.length);
  const samples = [rssMB()]; let last = 0;
  const poll = setInterval(async () => { const d = Number(await page.innerText('#statDone').catch(() => 0)); if (d !== last) { last = d; samples.push(rssMB()); } }, 250);
  const t0 = Date.now();
  await page.click('#startBtn'); await waitBatch(page, specs.length);
  clearInterval(poll); samples.push(rssMB());
  const row = { scenario: name, effort, images: specs.length, totalMs: Date.now() - t0, perImageMs: Math.round((Date.now() - t0) / specs.length), rssMBAfterEach: samples, resultsPerImage: await page.$$eval('.file-result', (e) => e.map((x) => x.textContent.slice(0, 90))) };
  out.push(row); console.log(JSON.stringify(row));
  await page.context().close();
}
const k = (i, kind = 'photo', type = 'image/png', w = 3840, h = 2160) => ({ name: `i${i}.${type.split('/')[1].replace('jpeg', 'jpg')}`, type, w, h, kind });
await scenario('1 imagen 4K', [k(1)], 7);
await scenario('5 imágenes 4K consecutivas', [1, 2, 3, 4, 5].map((i) => k(i)), 7);
await scenario('lote mixto', [k(1), k(2, 'shot', 'image/png', 1920, 1080), k(3, 'photo', 'image/jpeg', 4000, 3000), k(4, 'photo', 'image/webp', 2560, 1440), k(5, 'shot', 'image/png', 800, 600)], 7);
await scenario('1 imagen 4K effort 10', [k(1)], 10);
mkdirSync('bench-results', { recursive: true });
writeFileSync('bench-results/bench.json', JSON.stringify(out, null, 2));
await browser.close(); await site.close();
