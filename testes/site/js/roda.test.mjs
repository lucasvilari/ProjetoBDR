import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posicoesNaRoda, olharPara, posicoesPorTamanho } from '../../../site/js/lib/roda.js';

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

// dois retângulos (centro x, y; largura w, altura h) se tocam ou ficam a menos de `folga` um do outro?
const perto = (a, b, folga) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + folga && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + folga;

test('onze botões largos não se encostam: o alto e o pé da roda ganham mais espaço que as laterais', () => {
  const largura = 723, tamanhos = Array.from({ length: 11 }, () => ({ w: 200, h: 53 }));
  const p = posicoesPorTamanho(tamanhos, 0.43 * largura, largura);
  assert.ok(Math.abs(p[0].x - largura / 2) < 1e-6 && p[0].y < largura / 2);      // a primeira, no alto
  const caixas = p.map((q, i) => ({ ...q, ...tamanhos[i] }));
  for (let i = 0; i < 11; i++) for (let j = i + 1; j < 11; j++) assert.ok(!perto(caixas[i], caixas[j], 6), `${i + 1} e ${j + 1}`);
  for (const c of caixas) assert.ok(c.x - c.w / 2 >= 0 && c.x + c.w / 2 <= largura, 'dentro da largura da roda');
  for (let i = 1; i < 11; i++) assert.ok(p[i].angulo > p[i - 1].angulo, 'em sentido horário');
});
