import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

/** Serves a directory under /jxl-optimizer-web/ (like a GitHub Pages project site). */
export function serve(rootDir, prefix = '/jxl-optimizer-web/') {
  let root = rootDir;
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === prefix.slice(0, -1)) { res.writeHead(301, { Location: prefix }); return res.end(); }
    if (!url.pathname.startsWith(prefix)) { res.writeHead(404); return res.end('outside prefix'); }
    let file = normalize(join(root, decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html'));
    if (!file.startsWith(normalize(root))) { res.writeHead(403); return res.end(); }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}${prefix}`,
    origin: `http://127.0.0.1:${server.address().port}`,
    setRoot: (dir) => { root = dir; },
    close: () => new Promise((r) => server.close(r)),
  })));
}

/** Generates test images inside the page (no files committed to the repo). */
export async function makeImages(page, specs) {
  await page.evaluate(async (list) => {
    window.__files = {};
    let seed = 1;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (const { name, type, w, h, kind } of list) {
      if (kind === 'corrupt') { window.__files[name] = new File([new Uint8Array(2048).map(() => rnd() * 255)], name, { type }); continue; }
      const c = new OffscreenCanvas(w, h); const g = c.getContext('2d');
      if (kind === 'photo') {
        const img = g.createImageData(w, h);
        for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { const i = (y * w + x) * 4; const b = 110 + 70 * Math.sin(x / 90) + 40 * Math.cos(y / 70); img.data[i] = b + rnd() * 12; img.data[i + 1] = b * 0.8 + rnd() * 12; img.data[i + 2] = b * 0.6 + rnd() * 12; img.data[i + 3] = 255; }
        g.putImageData(img, 0, 0);
      } else { g.fillStyle = '#f5f5f5'; g.fillRect(0, 0, w, h); g.fillStyle = '#1e40af'; g.fillRect(40, 40, w - 80, 40); g.fillStyle = '#111'; for (let y = 120; y < h - 40; y += 26) g.fillRect(40, y, 120 + rnd() * (w / 2), 10); }
      const blob = await c.convertToBlob({ type });
      window.__files[name] = new File([blob], name, { type: blob.type });
    }
  }, specs);
}
export const attach = (page, names) => page.evaluate((list) => {
  const dt = new DataTransfer(); list.forEach((n) => dt.items.add(window.__files[n]));
  const input = document.querySelector('#fileInput'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
}, names);
export const waitEngine = (page) => page.waitForFunction(() => /Motor: libjxl/.test(document.querySelector('#engineBadge')?.textContent ?? ''), null, { timeout: 60000 });
export const waitBatch = (page, n, timeout = 600000) => page.waitForFunction((count) => Number(document.querySelector('#statDone').textContent) + Number(document.querySelector('#statErrors').textContent) >= count && document.querySelector('#cancelBtn').disabled, n, { timeout });
export const setProfile = (page, label) => page.evaluate((text) => { const s = document.querySelector('#profile'); const o = [...s.options].find((x) => x.textContent.trim() === text); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); }, label);
export const setEffort = (page, v) => page.evaluate((e) => { const i = document.querySelector('#effort'); i.value = String(e); i.dispatchEvent(new Event('input', { bubbles: true })); }, v);
export const logText = (page) => page.locator('#logEntries').innerText();
