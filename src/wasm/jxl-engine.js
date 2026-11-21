// Loads the self-hosted libjxl WebAssembly engine. The generated Emscripten
// modules are plain ES modules served from public/wasm/. A SIMD build is
// preferred when the browser supports it; the standard build is the fallback.

const SIMD_TEST = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1,
  8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

export function supportsSimd() {
  try {
    return WebAssembly.validate(SIMD_TEST);
  } catch {
    return false;
  }
}

function readError(module) {
  try {
    const text = module.UTF8ToString(module._jxl_last_error());
    return text || 'Error desconocido del motor JPEG XL.';
  } catch {
    return 'Error desconocido del motor JPEG XL.';
  }
}

async function loadModule(baseUrl, variant) {
  const jsUrl = new URL(`wasm/jxl_engine_${variant}.js`, baseUrl).href;
  const moduleUrl = `${jsUrl}?v=1`;
  const factory = (await import(/* @vite-ignore */ moduleUrl)).default;
  const module = await factory({
    locateFile: (path) => new URL(`wasm/${path}`, baseUrl).href,
    print: () => {},
    printErr: () => {},
  });
  return module;
}

function bind(module) {
  const cwrap = module.cwrap;
  const api = {
    encodeRgba: cwrap('jxl_encode_rgba', 'number', [
      'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number',
    ]),
    encodeJpeg: cwrap('jxl_encode_jpeg', 'number', ['number', 'number', 'number', 'number']),
    decode: cwrap('jxl_decode', 'number', [
      'number', 'number', 'number', 'number', 'number', 'number', 'number',
    ]),
    reconstructJpeg: cwrap('jxl_reconstruct_jpeg', 'number', ['number', 'number', 'number']),
    version: cwrap('jxl_engine_version', 'string', []),
    lastError: cwrap('jxl_last_error', 'string', []),
    effortMin: cwrap('jxl_effort_min', 'number', []),
    effortMax: cwrap('jxl_effort_max', 'number', []),
    free: module._free,
    malloc: module._malloc,
  };

  function copyOutput(pointer, size) {
    if (!pointer) throw new Error(readError(module));
    try {
      const bytes = module.HEAPU8.slice(pointer, pointer + size);
      if (bytes.length !== size) throw new Error('El motor devolvió un búfer incompleto.');
      return bytes;
    } finally {
      api.free(pointer);
    }
  }

  return {
    variant: 'unknown',
    version: api.version(),
    effortMin: api.effortMin(),
    effortMax: api.effortMax(),

    encodeRGBA({ pixels, width, height, channels, distance, effort, lossless }) {
      const inputPtr = api.malloc(pixels.length);
      if (!inputPtr) throw new Error('Sin memoria WASM para copiar los píxeles de entrada.');
      const sizePtr = api.malloc(4);
      if (!sizePtr) {
        api.free(inputPtr);
        throw new Error('Sin memoria WASM para el tamaño de salida.');
      }
      let outputPtr = 0;
      try {
        module.HEAPU8.set(pixels, inputPtr);
        outputPtr = api.encodeRgba(
          inputPtr, width, height, channels, distance, effort, lossless ? 1 : 0, sizePtr,
        );
        const size = module.HEAPU32[sizePtr >> 2];
        // copyOutput takes ownership of outputPtr and frees it.
        return copyOutput(outputPtr, size);
      } finally {
        api.free(sizePtr);
        api.free(inputPtr);
      }
    },

    encodeJPEG({ bytes, effort }) {
      const inputPtr = api.malloc(bytes.length);
      if (!inputPtr) throw new Error('Sin memoria WASM para copiar el JPEG.');
      const sizePtr = api.malloc(4);
      if (!sizePtr) {
        api.free(inputPtr);
        throw new Error('Sin memoria WASM para el tamaño de salida.');
      }
      let outputPtr = 0;
      try {
        module.HEAPU8.set(bytes, inputPtr);
        outputPtr = api.encodeJpeg(inputPtr, bytes.length, effort, sizePtr);
        const size = module.HEAPU32[sizePtr >> 2];
        return copyOutput(outputPtr, size);
      } finally {
        api.free(sizePtr);
        api.free(inputPtr);
      }
    },

    decode({ bytes }) {
      const inputPtr = api.malloc(bytes.length);
      if (!inputPtr) throw new Error('Sin memoria WASM para copiar el JXL.');
      const widthPtr = api.malloc(4);
      const heightPtr = api.malloc(4);
      const channelsPtr = api.malloc(4);
      const alphaPtr = api.malloc(4);
      const sizePtr = api.malloc(4);
      if (!widthPtr || !heightPtr || !channelsPtr || !alphaPtr || !sizePtr) {
        api.free(inputPtr);
        for (const p of [widthPtr, heightPtr, channelsPtr, alphaPtr, sizePtr]) if (p) api.free(p);
        throw new Error('Sin memoria WASM para los parámetros de decodificación.');
      }
      let outputPtr = 0;
      try {
        module.HEAPU8.set(bytes, inputPtr);
        outputPtr = api.decode(
          inputPtr, bytes.length, widthPtr, heightPtr, channelsPtr, alphaPtr, sizePtr,
        );
        if (!outputPtr) throw new Error(readError(module));
        const width = module.HEAPU32[widthPtr >> 2];
        const height = module.HEAPU32[heightPtr >> 2];
        const channels = module.HEAPU32[channelsPtr >> 2];
        const hasAlpha = module.HEAPU32[alphaPtr >> 2] !== 0;
        const size = module.HEAPU32[sizePtr >> 2];
        const pixels = module.HEAPU8.slice(outputPtr, outputPtr + size);
        return { pixels, width, height, channels, hasAlpha };
      } finally {
        if (outputPtr) api.free(outputPtr);
        api.free(sizePtr);
        api.free(alphaPtr);
        api.free(channelsPtr);
        api.free(heightPtr);
        api.free(widthPtr);
        api.free(inputPtr);
      }
    },

    reconstructJPEG({ bytes }) {
      const inputPtr = api.malloc(bytes.length);
      if (!inputPtr) throw new Error('Sin memoria WASM para copiar el JXL.');
      const sizePtr = api.malloc(4);
      if (!sizePtr) {
        api.free(inputPtr);
        throw new Error('Sin memoria WASM para el tamaño de salida.');
      }
      let outputPtr = 0;
      try {
        module.HEAPU8.set(bytes, inputPtr);
        outputPtr = api.reconstructJpeg(inputPtr, bytes.length, sizePtr);
        const size = module.HEAPU32[sizePtr >> 2];
        return copyOutput(outputPtr, size);
      } finally {
        api.free(sizePtr);
        api.free(inputPtr);
      }
    },
  };
}

let cached = null;

/**
 * Loads the best available engine once per worker.
 * @param {string} baseUrl absolute URL of the app root (with trailing slash)
 * @param {(message:string)=>void} log
 */
export async function createEngine(baseUrl, log = () => {}) {
  if (cached) return cached;

  const simd = supportsSimd();
  const order = simd ? ['simd', 'std'] : ['std'];
  let lastError = null;

  for (const variant of order) {
    try {
      log(`Cargando motor WASM (${variant === 'simd' ? 'SIMD' : 'estándar'})...`);
      const module = await loadModule(baseUrl, variant);
      const engine = bind(module);
      engine.variant = variant;
      cached = engine;
      log(`Motor ${engine.version} cargado (${variant === 'simd' ? 'SIMD' : 'estándar'}).`);
      return engine;
    } catch (error) {
      lastError = error;
      log(`No se pudo cargar el motor ${variant}: ${error.message}`);
      if (variant === 'simd' && simd) {
        log('Se intentará el build estándar como fallback.');
      }
    }
  }

  throw new Error(`No se pudo cargar ningún motor JPEG XL. ${lastError?.message ?? ''}`);
}
