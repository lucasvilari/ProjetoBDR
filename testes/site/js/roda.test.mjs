import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posicoesNaRoda, olharPara } from '../../../site/js/lib/roda.js';

test('dez posições igualmente espaçadas, a primeira no alto', () => {
  const p = posicoesNaRoda(10, 100, 0, 0);
  assert.equal(p.length, 10); assert.ok(Math.abs(p[0].x) < 1e-9); assert.ok(Math.abs(p[0].y + 100) < 1e-9);
  for (const q of p) assert.ok(Math.abs(Math.hypot(q.x, q.y) - 100) < 1e-9);
  assert.ok(Math.abs(p[1].angulo - p[0].angulo - Math.PI / 5) < 1e-9);
});
test('a pupila olha na direção da pergunta, dentro do alcance', () => {
  const { dx, dy } = olharPara(0, 20, 10);
  assert.ok(Math.abs(dx - 20) < 1e-9 && Math.abs(dy) < 1e-9);
  const cima = olharPara(-Math.PI / 2, 20, 10);
  assert.ok(Math.abs(cima.dx) < 1e-9 && Math.abs(cima.dy + 10) < 1e-9);
});
