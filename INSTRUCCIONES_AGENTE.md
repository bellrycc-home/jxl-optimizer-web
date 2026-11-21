# Cambios entregados (revisar antes de aceptar)

Todo el código de este paquete está escrito pero **las suites de pruebas no se han ejecutado** (por indicación del usuario). Sí se hicieron: `npm ci`, `vite build`, `node scripts/check-dist.mjs` (OK), `node --check` de todos los archivos, y una comprobación manual en Chromium bajo `/jxl-optimizer-web/` (carga, conversión real de PNG/JPEG, ZIP, 0 peticiones externas, SW activo, tema claro/oscuro, móvil).

## Qué ejecutar
```
npm ci                      # regenera package-lock (se quitó @jsquash/jxl)
npm test                    # tests/unit: zip, cola, analyzer (node --test)
npm run build && npm run check:dist
npx playwright install chromium firefox
npm run test:browser        # E2E: subruta, red, lossless/JPEG reversible, corrupta, cancelación, actualización A→B
npm run bench               # tiempos y memoria; NO implementar pool de workers sin leer bench-results/bench.json
```
Si algún test falla, arreglar el código o el test con criterio; no marcar como superado lo que no se ejecutó. Safari/WebKit no está probado.

## Archivos
Nuevos: `.github/workflows/deploy.yml`, `.gitignore`, `src/core/{zip-safe,compat}.js`, `src/ui/{theme,tabs,profile-cards,zip-dialog,compat-banner,update-banner}.js`, `tests/unit/*`, `scripts/*`, `docs/ANALYZER.md`, `tools/analyzer-eval/*`.
Modificados: `index.html` (UI nueva, ids intactos), `src/styles/main.css` (reescrito), `src/main.js`, `src/core/analyzer.js`, `src/core/download-manager.js` (solo exporta `buildReport/buildReadme`), `src/workers/encoder.worker.js` (muestreo por teselas + sonda de funciones en el worker), `public/sw.js`, `vite.config.js`, `package.json`, `README.md`.
Eliminados: `tests/zip_unit.mjs`, `test_encode.mjs` (solo usaban `@jsquash/jxl`/`sharp` y rutas absolutas). Comprobar con `grep -r jsquash src` antes de confirmar.
No tocados: encoder, perfiles, parámetros, `engine/`, `public/wasm/`.

## Hallazgos verificados contra el código real
- El aviso de metadatos **ya existía** en la UI; se reescribió con matices (no afirma que todo se pierda).
- `lastZip` retenía `bytes` **y** `blob` (doble memoria). Ahora solo guarda metadatos.
- El ZIP se construía con `zipSync`; ahora se usa `Zip`/`ZipPassThrough` con cesión al bucle de eventos, estimación previa (2× conservador), aviso a 40 % y bloqueo al 100 % del límite configurable (800 MB por defecto, guardado en localStorage), con descarga individual como alternativa.
- El SW antiguo usaba `skipWaiting()` + `v1` fijo + cache-first en el HTML. Ahora: versión por hash, sin `skipWaiting` automático, aviso con botón inactivo durante conversiones.
- La UI de Gemini era una simulación y traía Tailwind CDN, unpkg y Google Fonts (peticiones externas) y distancias de perfil inventadas (0.8/2.2); se portó el diseño en CSS propio y las distancias salen de `PROFILES`. No se añadieron funciones inexistentes (perfil por imagen, «verificar» opcional, límite de 268 MP).
- La heurística anterior (y la de Gemini) fallaba con fotos reales: ver `docs/ANALYZER.md`.

## Límites pendientes
Sin fuentes web (pila del sistema). Safari sin probar. El ZIP aún mantiene los resultados en memoria hasta vaciar la cola. Heurística: zona intermedia con confianza «baja».

## IA_Alert
Nuevos: `src/vendor/ia-alert.js` (original + opción `css:false`), `src/styles/ia-alert.css`. Modificados: `src/main.js` (imports, `mount`, `refreshTheme` 260 ms después del cambio de tema por la transición del `body`), `src/styles/main.css` (1 regla). Verificado en Chromium con la CSP: sin errores, sin `<style>` inline, escritorio, popup, cambio de tema y móvil táctil. Los tests propios de IA_Alert no se copiaron al repositorio.
