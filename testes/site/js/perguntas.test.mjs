import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERGUNTAS } from '../../../site/js/lib/perguntas.js';

test('dez perguntas, sete com página', () => {
  assert.equal(PERGUNTAS.length, 10);
  assert.deepEqual(PERGUNTAS.filter(p => p.href).map(p => p.n), [1, 2, 5, 7, 8, 9, 10]);
  for (const p of PERGUNTAS) assert.ok(p.titulo && p.oQue && p.como);
});
