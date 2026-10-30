import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quintis, cortes, faixa, posicaoRelativa } from '../../../site/js/lib/indices.js';

test('quintis divide os pares pelo primeiro valor em cinco grupos e tira a média do segundo', () => {
  const pares = Array.from({ length: 10 }, (_, i) => [i + 1, i < 5 ? 4 : 6]);    // x de 1 a 10
  const q = quintis(pares);
  assert.equal(q.length, 5);
  assert.deepEqual(q.map(g => [g.de, g.ate, g.n]), [[1, 2, 2], [3, 4, 2], [5, 6, 2], [7, 8, 2], [9, 10, 2]]);
  assert.deepEqual(q.map(g => g.media), [4, 4, 5, 6, 6]);
});

test('quintis ignora pares sem um dos valores e reparte o resto quando não divide por cinco', () => {
  const pares = [[1, 1], [2, null], [null, 3], [3, 3], [4, 5], [5, 7], [6, 9], [7, 11]];
  const q = quintis(pares);
  assert.equal(q.reduce((s, g) => s + g.n, 0), 6);
  assert.ok(q.every(g => g.n >= 1));
  assert.ok(q.every((g, i) => i === 0 || g.de >= q[i - 1].ate));
});

test('cortes divide os valores em partes de mesmo tamanho e faixa diz em qual parte cada valor cai', () => {
  const valores = [5, 1, null, 3, 2, 6, 4];
  const c = cortes(valores, 3);
  assert.deepEqual(c, [3, 5]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(v => faixa(v, c)), [0, 0, 1, 1, 2, 2]);
  assert.equal(faixa(null, c), null);
  assert.deepEqual(cortes([null], 3), []);
});

test('posicaoRelativa vai de 0 (o menor) a 1 (o maior), empates no meio, vazios ficam vazios', () => {
  assert.deepEqual(posicaoRelativa([30, null, 10, 20, 20, 40]), [0.75, null, 0, 0.375, 0.375, 1]);
  assert.deepEqual(posicaoRelativa([7]), [0.5]);
  assert.deepEqual(posicaoRelativa([null]), [null]);
});

test('quintis tem os tamanhos do NTILE do banco: os primeiros grupos levam o que sobra', () => {
  const pares = Array.from({ length: 12 }, (_, i) => [i, 1]);
  assert.deepEqual(quintis(pares).map(g => g.n), [3, 3, 2, 2, 2]);
});
