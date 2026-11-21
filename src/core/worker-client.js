// Small request/response wrapper around the module worker. A single worker is
// enough because images are processed sequentially. If the worker dies (for
// example, an unrecoverable WASM abort), the client rejects pending requests
// and the next batch can create a fresh worker.

export class EncoderWorkerClient {
  constructor({ onLog, onProgress, onWorkerDied }) {
    this.onLog = onLog;
    this.onProgress = onProgress;
    this.onWorkerDied = onWorkerDied;
    this.worker = null;
    this.pending = new Map();
    this.nextId = 1;
    this.ready = false;
    this.readyPromise = null;
    this.engineInfo = null;
  }

  async init(baseUrl) {
    if (this.ready) return this.engineInfo;
    if (this.readyPromise) return this.readyPromise;

    // Drop a previous worker whose engine failed to load before retrying.
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.rejectAll(new Error('Reiniciando el worker del motor.'));
    }

    this.readyPromise = new Promise((resolve, reject) => {
      let worker;
      try {
        worker = new Worker(new URL('../workers/encoder.worker.js', import.meta.url), {
          type: 'module',
          name: 'jxl-encoder',
        });
      } catch (error) {
        this.readyPromise = null;
        reject(new Error(`No se pudo crear el Web Worker: ${error.message}`));
        return;
      }

      this.worker = worker;

      const handleMessage = (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        if (data.type === 'log') {
          this.onLog?.(data.message, data.level ?? 'info');
          return;
        }
        if (data.type === 'progress') {
          this.onProgress?.(data);
          return;
        }
        if (data.type === 'ready') {
          this.ready = true;
          this.engineInfo = {
            version: data.version,
            variant: data.variant,
            effortMin: data.effortMin,
            effortMax: data.effortMax,
          };
          resolve(this.engineInfo);
          return;
        }
        if (data.type === 'fatal') {
          this.ready = false;
          this.readyPromise = null;
          reject(new Error(data.message));
          return;
        }
        if (data.type === 'analyzed' || data.type === 'encoded') {
          const request = this.pending.get(data.id);
          if (request) {
            this.pending.delete(data.id);
            request.resolve(data);
          }
          return;
        }
        if (data.type === 'error') {
          const request = this.pending.get(data.id);
          if (request) {
            this.pending.delete(data.id);
            request.reject(new Error(data.message));
          } else {
            this.onLog?.(`Error del worker: ${data.message}`, 'error');
          }
        }
      };

      const handleError = (event) => {
        const message = event.message || 'El Web Worker se detuvo inesperadamente.';
        this.ready = false;
        this.readyPromise = null;
        this.rejectAll(new Error(`Fallo del worker (posible falta de memoria WASM): ${message}`));
        this.onWorkerDied?.(message);
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      worker.postMessage({
        type: 'init',
        baseUrl,
      });
    });

    return this.readyPromise;
  }

  request(type, payload, transfer = []) {
    if (!this.worker || !this.ready) {
      return Promise.reject(new Error('El motor JPEG XL no está listo.'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ type, id, ...payload }, transfer);
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  rejectAll(error) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }

  terminate() {
    this.rejectAll(new Error('Worker terminado.'));
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.readyPromise = null;
  }

  recreate(baseUrl) {
    this.terminate();
    return this.init(baseUrl);
  }
}
