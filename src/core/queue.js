// Sequential batch queue. The queue only stores metadata and results; it
// never owns or deletes the user's original File objects on disk.

export const STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  DONE: 'done',
  SKIPPED: 'skipped',
  ERROR: 'error',
};

export const STATUS_LABEL = {
  [STATUS.PENDING]: 'Pendiente',
  [STATUS.PROCESSING]: 'Procesando',
  [STATUS.DONE]: 'Completado',
  [STATUS.SKIPPED]: 'Omitido',
  [STATUS.ERROR]: 'Error',
};

let nextId = 1;

export function createItem(file, path = '') {
  return {
    id: nextId++,
    file,
    path: path || file.webkitRelativePath || '',
    status: STATUS.PENDING,
    analysis: null,
    analysisError: null,
    result: null,
    error: null,
    skipReason: null,
    startedAt: null,
    finishedAt: null,
  };
}

export class SequentialQueue {
  constructor() {
    this.items = [];
    this.cancelled = false;
  }

  get length() {
    return this.items.length;
  }

  add(file, path) {
    const item = createItem(file, path);
    this.items.push(item);
    return item;
  }

  remove(id) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const [item] = this.items.splice(index, 1);
    if (item.result?.blob) item.result.blob = null;
    return item;
  }

  clear() {
    for (const item of this.items) {
      if (item.result?.blob) item.result.blob = null;
    }
    this.items = [];
    this.cancelled = false;
  }

  get(id) {
    return this.items.find((item) => item.id === id) ?? null;
  }

  pending() {
    return this.items.filter((item) => item.status === STATUS.PENDING);
  }

  completed() {
    return this.items.filter((item) => item.status === STATUS.DONE);
  }

  cancel() {
    this.cancelled = true;
  }

  resetCancel() {
    this.cancelled = false;
  }

  counts() {
    const counts = {
      total: this.items.length,
      pending: 0,
      processing: 0,
      done: 0,
      skipped: 0,
      error: 0,
    };
    for (const item of this.items) counts[item.status] += 1;
    return counts;
  }
}
