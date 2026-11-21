# JXL Optimizer Web

Aplicación web estática para optimizar imágenes a JPEG XL (.jxl). Todo el
procesamiento ocurre en el navegador: no hay backend, no se sube ninguna
imagen y los archivos originales nunca se modifican ni se sobrescriben.

Motor principal: **libjxl 0.11.2** compilado a WebAssembly (build estándar +
build SIMD, con selección automática en el navegador).

## Características

- Formatos de entrada: JPEG, PNG, WebP.
- Perfiles: Lossless, Baja compresión, Equilibrado, Bajo, Ultraahorro,
  Personalizado (Distance 0..25, Effort 1..10, rango real de libjxl).
- JPEG reversible (`JxlEncoderStoreJPEGMetadata` + `JxlEncoderAddJPEGFrame`) con
  reconstrucción byte a byte verificable, y JPEG con pérdida (recodificación de
  píxeles).
- Análisis automático heurístico con perfil recomendado y explicación.
- Procesamiento secuencial, una imagen a la vez, en un Web Worker.
- Descarga directa para una imagen; ZIP (fflate) para varias, con
  `report.csv` y `README.txt`.
- Registro de operaciones con hora, tamaños, ahorro, tiempo y verificación.
- Verificación real: píxeles para PNG Lossless, reconstrucción JPEG exacta,
  decodificación para modos con pérdida.
- Límites preventivos configurables, cancelación segura, manejo de errores sin
  bloquear la interfaz.
- PWA + service worker para uso offline tras la primera carga.

## Requisitos

- Node.js 20+ y npm.
- Para recompilar el motor: Emscripten SDK 3.1.74+, cmake, ninja-build, git.

## Desarrollo

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. El motor WASM se sirve desde `public/wasm/`.

## Compilar el motor WebAssembly

```bash
npm run build:wasm
```

Esto compila libjxl 0.11.2 (estándar y SIMD) y copia los cuatro archivos a
`public/wasm/`. Ver `engine/README.md` para detalles y variables de entorno
(`EMSDK_DIR`, `LIBJXL_DIR`).

## Build de producción

```bash
npm run build        # usa los WASM ya generados
npm run build:all    # recompila el motor y luego el sitio
npm run preview      # sirve dist/
```

## Despliegue en GitHub Pages

El workflow `.github/workflows/deploy.yml` construye y despliega `dist/` en cada
push a `main`/`master`. Configura Pages en el repositorio para usar
"GitHub Actions".

## Pruebas realizadas

Probado con Chromium headless sobre `VRChat_2023-05-07_18-28-34.764_3840x2160.png`
(8.82 MB, 3840×2160), engine SIMD:

| Caso | Resultado |
|---|---|
| PNG 4K, Equilibrado, d=1.5, e=7 | 8.82 MB → 739.43 KB (-91.82 %), idéntico a `cjxl 0.11.2` (757.178 B vs 757.166 B) |
| PNG 4K, Lossless, d=0, e=7 | 8.82 MB → 4.87 MB (-44.82 %), píxeles idénticos (24.883.200 bytes) |
| PNG 4K, Ultraahorro, d=3.0, e=7 | 8.82 MB → 434.05 KB (-95.08 %) |
| JPEG reversible (1920×1080) | 445.72 KB → 362.50 KB (-18.67 %), reconstrucción byte a byte idéntica |
| JPEG con pérdida (1920×1080) | 445.72 KB → 239.40 KB (-46.29 %) |
| PNG con transparencia (512×512) | píxeles idénticos incluyendo alfa |
| WebP lossless / lossy | decodificación correcta; re-encode con pérdida puede crecer |
| Imagen pequeña, Effort 10 | OK |
| Lote mixto (PNG/JPEG/WebP) | ZIP con nombres, `report.csv`, `README.txt` |
| Colisión de nombres | sufijo `-1`, `-2` |
| Cancelación | imagen en curso termina, resto omitido |
| Límites preventivos | omitido antes de decodificar |
| Imagen corrupta | error registrado, el lote continúa |
| ZIP con subcarpetas | se conservan cuando el navegador las proporciona |

Tiempos (4K, single thread WASM): Lossless 24.0 s, Equilibrado 10.6 s,
Ultraahorro 13.1 s. El build nativo `cjxl 0.11.2` tarda ~9-12 s con 4 hilos.

## Limitaciones documentadas

- Los modos que recodifican píxeles usan el decodificador del navegador:
  normalización a 8 bits sRGB, pérdida de metadatos EXIF/XMP/ICC y de
  profundidad de bits mayor que 8. El JPEG reversible no decodifica el
  bitstream y conserva el JPEG original byte a byte.
- Effort 9-10 en imágenes muy grandes puede tardar varios minutos en un
  solo hilo; se recomienda Effort ≤ 8 para 4K en navegadores modestos.
- El análisis de tipo de imagen es heurístico; se indica la confianza y
  nunca se afirma certeza.
- Sin soporte para SharedArrayBuffer: single-thread.
- Nivel de codestream 5 (máx. 268.435.456 píxeles por imagen).
- No se implementa eliminación de originales.

## Privacidad

Durante la conversión no se realizan peticiones de red con los archivos del
usuario. El service worker solo cachea el shell de la aplicación y los
módulos WASM. Verificable en DevTools → Network.

## Publicación en GitHub Pages
1. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Haz push a `main`. El workflow `.github/workflows/deploy.yml` ejecuta `npm ci`, `npm test`, `npm run build`, `npm run check:dist` y publica `dist/`.
3. La app queda en `https://<usuario>.github.io/<repositorio>/` (la configuración `base: './'` la hace independiente de la subruta).

### Por qué los binarios WASM están en Git
`public/wasm/*.wasm` y sus `.js` se versionan a propósito: compilar libjxl exige Emscripten (largo y pesado), y así CI y GitHub Pages solo necesitan Node. Para regenerarlos: `npm run build:wasm` en local y commit de los nuevos binarios (~5 MB por cambio).

### Actualizaciones (PWA)
`sw.js` recibe en cada build un identificador derivado del hash de todos los archivos y precachea todo (incluido el WASM). `index.html` se pide primero a la red; los assets con hash y el WASM salen de la caché de su versión. Una versión nueva **nunca se aplica sola**: aparece un aviso y el botón queda desactivado mientras haya una conversión en curso.

### Iconos
Iconos [Lucide](https://lucide.dev) (licencia ISC) incrustados como SVG.

### Si en GitHub Pages ves el fondo blanco e iconos enormes
Significa que Pages está sirviendo el **código fuente** y no el resultado de `npm run build`: `/src/styles/main.css` da 404, no hay estilos y los SVG ocupan toda la pantalla. Solución: **Settings → Pages → Source: GitHub Actions** (no «Deploy from a branch») y que el workflow termine en verde. Si ocurre, la página ahora muestra un aviso rojo explicándolo.

### Seguridad
- CSP por `<meta>` generada en el build (`default-src 'self'`, sin `unsafe-inline`/`unsafe-eval`; solo `wasm-unsafe-eval` para WebAssembly y el hash del script inline). `connect-src 'self'`: la página no puede enviar datos a otro origen aunque hubiera un fallo.
- `referrer: no-referrer`, sin recursos de terceros, sin cookies ni analítica.
- Límite conocido: GitHub Pages no permite cabeceras, así que `frame-ancestors`/`X-Frame-Options` no se pueden aplicar.

### Rendimiento
El service worker precachea solo la app (~8 archivos, <100 KB); el motor WASM (2,6 MB por variante) se descarga y cachea la primera vez que se usa, sin bajar las dos variantes. Funciona sin conexión después de la primera carga.

### Aviso de contenido generado por IA (IA_Alert)
`src/vendor/ia-alert.js` (+ `src/styles/ia-alert.css`) es IA_Alert 2.0, incluido en el bundle. En escritorio es un icono ⚠ dentro de la cabecera que se expande y se colapsa solo a los 30 s; en móvil es un cartel superior con ×. Se monta en `src/main.js` (`IAAlert.mount({ before: '#themeToggle', css: false, … })`).
Cambios respecto al original, necesarios por la CSP (`style-src 'self'`): se añadió la opción `css: false` / `data-css="false"` para no inyectar el `<style>`, y su CSS vive en `ia-alert.css`. Si actualizas IA_Alert, vuelve a extraer el CSS de la constante `CSS` y conserva esa opción. Para cambiar el texto: `message:` en la llamada a `mount`; para quitarlo, borra esa llamada y los dos imports de `main.js`.
