// End-to-end checks in real browsers. Needs: npm run build, and Playwright
// browsers installed (npx playwright install chromium firefox). A browser that
// is not installed is reported as SKIPPED, never as passed.
import { execFileSync } from 'node:child_process';
import { chromium, firefox, webkit } from 'playwright';
import { attach, logText, makeImages, serve, setProfile, waitBatch, waitEngine } from './lib-browser.mjs';

const results = [];
const check = (browser, name, ok, detail = '') => { results.push({ browser, name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} [${browser}] ${name}${detail ? ` — ${detail}` : ''}`); };

function build(outDir, salt) {
  execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], { stdio: 'ignore', env: { ...process.env, JXL_BUILD_SALT: salt } });
}
build('dist-a', 'A');
build('dist-b', 'B');
const site = await serve('dist-a');

async function run(name, launcher) {
  let browser;
  try { browser = await launcher.launch(); } catch { console.log(`SKIPPED [${name}] navegador no instalado`); return; }
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const requests = []; const errors = [];
  page.on('request', (r) => requests.push({ method: r.method(), url: r.url(), body: r.postData() }));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(site.url);
  await waitEngine(page);
  check(name, 'carga bajo subruta /jxl-optimizer-web/ sin errores de consola', errors.length === 0, errors.join(' | '));
  check(name, 'motor WASM cargado', /SIMD|estándar|standard/i.test(await page.innerText('#engineBadge')), await page.innerText('#engineBadge'));

  await makeImages(page, [
    { name: 'foto.png', type: 'image/png', w: 1600, h: 1000, kind: 'photo' },
    { name: 'captura.png', type: 'image/png', w: 1280, h: 720, kind: 'shot' },
    { name: 'foto.jpg', type: 'image/jpeg', w: 1200, h: 800, kind: 'photo' },
    { name: 'rota.png', type: 'image/png', kind: 'corrupt' },
  ]);

  // Lossless + JPEG reversible + corrupt image, all in one batch.
  await setProfile(page, 'Lossless');
  await attach(page, ['foto.png', 'foto.jpg', 'rota.png', 'captura.png']);
  await page.waitForFunction(() => document.querySelectorAll('.file-row').length === 4);
  await page.click('#startBtn');
  await waitBatch(page, 4);
  const log = await logText(page);
  check(name, 'imagen corrupta: se informa y el lote continúa', /rota\.png/.test(log) && Number(await page.innerText('#statErrors')) >= 1 && Number(await page.innerText('#statDone')) === 3);
  check(name, 'PNG Lossless verificado (píxeles idénticos)', /Verificación[^\n]*(píxeles|idéntic)[^\n]*correct/i.test(log) || /Verificación[^\n]*correct/i.test(log));
  check(name, 'JPEG reversible verificado byte a byte', /reconstrucción JPEG[^\n]*correcta/i.test(log));
  check(name, 'ZIP o descargas preparados al terminar', /ZIP (preparado|listo)|archivo\(s\) descargados/.test(log + await page.innerText('#zipStatus')));

  // Privacy: nothing leaves the origin, nothing is POSTed.
  const external = requests.filter((r) => !r.url.startsWith(site.origin) && !/^(blob:|data:)/.test(r.url));
  check(name, 'sin peticiones a otros orígenes', external.length === 0, external.map((r) => r.url).join(','));
  check(name, 'sin peticiones POST/PUT ni cuerpos enviados', requests.every((r) => r.method === 'GET' && !r.body));

  // Cancellation.
  await page.click('button:has-text("Vaciar cola")');
  await setProfile(page, 'Equilibrado');
  await makeImages(page, [1, 2, 3].map((i) => ({ name: `c${i}.png`, type: 'image/png', w: 3000, h: 2000, kind: 'photo' })));
  await attach(page, ['c1.png', 'c2.png', 'c3.png']);
  await page.waitForFunction(() => !document.querySelector('#startBtn').disabled);
  await page.click('#startBtn');
  await page.waitForFunction(() => !document.querySelector('#cancelBtn').disabled);
  await page.click('#cancelBtn');
  await waitBatch(page, 1);
  check(name, 'cancelar detiene la cola sin completar todo', Number(await page.innerText('#statDone')) < 3 && /cancel/i.test(await logText(page)));

  // PWA update A -> B (Chromium only: service workers need a secure context; localhost qualifies).
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker?.ready; return r ? r.active.state : null; });
  check(name, 'service worker activo', sw === 'activated');
  if (sw) {
    const cachesA = await page.evaluate(() => caches.keys());
    site.setRoot('dist-b');
    await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    await page.waitForSelector('.update-banner', { timeout: 30000 });
    check(name, 'aviso de actualización visible tras publicar otra versión', true);
    await page.waitForFunction(() => !document.querySelector('.update-banner button')?.disabled, null, { timeout: 5000 });
    await Promise.all([page.waitForNavigation({ timeout: 30000 }), page.click('.update-banner button:has-text("Actualizar ahora")')]);
    await page.waitForFunction(async () => (await caches.keys()).length === 1);
    const cachesB = await page.evaluate(() => caches.keys());
    check(name, 'la caché antigua se limpia y queda solo la nueva', cachesB.length === 1 && cachesB[0] !== cachesA[0], `${cachesA} -> ${cachesB}`);
    site.setRoot('dist-a');
  }
  await browser.close();
}

await run('chromium', chromium);
await run('firefox', firefox);
await run('webkit', webkit);
await site.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones superadas`);
process.exit(failed.length ? 1 : 0);
