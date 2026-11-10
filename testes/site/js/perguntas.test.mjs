import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERGUNTAS } from '../../../site/js/lib/perguntas.js';

test('onze perguntas, todas com página', () => {
  assert.equal(PERGUNTAS.length, 11);
  assert.deepEqual(PERGUNTAS.filter(p => p.href).map(p => p.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  for (const p of PERGUNTAS) assert.ok(p.titulo && p.oQue && p.como);
});
