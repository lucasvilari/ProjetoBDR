import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assentos, ordenaPorLado, agrupa, bolinhasPorGrupo } from '../../../site/js/lib/plenario.js';

test('n assentos no semicírculo', () => {
  for (const n of [1, 9, 55, 513]) {
    const { pontos } = assentos(n); assert.equal(pontos.length, n);
    for (const s of pontos) { assert.ok(s.y >= -1e-9); assert.ok(Math.hypot(s.x, s.y) <= 1 + 1e-9); }
  }
});
test('assentos da esquerda para a direita', () => {
  const { pontos } = assentos(55);
  assert.ok(pontos[0].x < 0 && pontos.at(-1).x > 0);
  for (let i = 1; i < pontos.length; i += 1) assert.ok(pontos[i].angulo <= pontos[i - 1].angulo + 1e-9);
});
test('esquerda à esquerda', () => {
  const o = ordenaPorLado([{ partido: 'PL', nota: 8.8 }, { partido: 'PT', nota: 2.7 }, { partido: 'X', nota: null }, { partido: 'PT', nota: 2.7 }]);
  assert.deepEqual(o.map(e => e.partido), ['PT', 'PT', 'PL', 'X']);
});
test('agrupamento', () => { assert.equal(agrupa(300, 600), 1); assert.equal(agrupa(8500, 600), 20); assert.equal(agrupa(600, 600), 1); });
test('bolinhas por grupo somam o total e seguem a proporção', () => {
  const b = bolinhasPorGrupo([10, 5, 5], 2, 10);
  assert.equal(b.reduce((s, v) => s + v, 0), 10);
  assert.equal(b[0], 5); assert.equal(b[1] + b[2], 5); assert.ok(Math.abs(b[1] - b[2]) <= 1);
});
