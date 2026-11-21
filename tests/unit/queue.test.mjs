import test from 'node:test';
import assert from 'node:assert/strict';
import { SequentialQueue, STATUS } from '../../src/core/queue.js';

const file = (name) => ({ name, size: 10 });

test('añadir, contar y quitar elementos', () => {
  const q = new SequentialQueue();
  const a = q.add(file('a.png'));
  q.add(file('b.png'));
  assert.equal(q.length, 2);
  assert.equal(q.counts().pending, 2);
  assert.equal(q.remove(a.id).file.name, 'a.png');
  assert.equal(q.length, 1);
  assert.equal(q.remove(99999), null);
});

test('cancelación: pending() sigue accesible y resetCancel limpia la bandera', () => {
  const q = new SequentialQueue();
  q.add(file('a.png'));
  q.add(file('b.png'));
  q.cancel();
  assert.equal(q.cancelled, true);
  // El bucle de main.js omite lo pendiente cuando cancelled=true:
  const processed = [];
  for (const item of q.pending()) {
    if (q.cancelled) break;
    processed.push(item);
  }
  assert.equal(processed.length, 0);
  assert.equal(q.counts().pending, 2);
  q.resetCancel();
  assert.equal(q.cancelled, false);
});

test('clear libera blobs de resultados y reinicia el estado', () => {
  const q = new SequentialQueue();
  const item = q.add(file('a.png'));
  item.status = STATUS.DONE;
  item.result = { blob: new Blob(['x']), bytes: new Uint8Array(1), size: 1 };
  q.cancel();
  const held = item.result;
  q.clear();
  assert.equal(held.blob, null);
  assert.equal(q.length, 0);
  assert.equal(q.cancelled, false);
});

test('un error en un elemento no afecta a los demás', () => {
  const q = new SequentialQueue();
  const bad = q.add(file('bad.png'));
  q.add(file('ok.png'));
  bad.status = STATUS.ERROR;
  assert.equal(q.counts().error, 1);
  assert.equal(q.pending().length, 1);
});
