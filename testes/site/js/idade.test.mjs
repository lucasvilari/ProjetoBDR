import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trocas, alternancia } from '../../../site/js/lib/idade.js';

// prefeitos de um município: { ano, pid, partido, idade }
const p = (ano, pid, partido, idade) => ({ ano, pid, partido, idade });

test('trocas compara cada prefeito com o da eleição anterior: mudou o partido, a pessoa, ou nada', () => {
  const lista = [p(2016, 1, 'A', 50), p(2020, 1, 'B', 54), p(2024, 2, 'B', 41)];
  assert.deepEqual(trocas(lista), [
    { ano: 2020, partido: true, pessoa: false },
    { ano: 2024, partido: false, pessoa: true },
  ]);
  assert.deepEqual(trocas([p(2024, 2, 'B', 41)]), []);
});

test('trocas não conta a troca de pessoa quando falta quem era', () => {
  assert.deepEqual(trocas([p(2016, null, 'A', 50), p(2020, 3, 'A', 40)]), [{ ano: 2020, partido: false, pessoa: null }]);
});

test('alternancia soma os municípios nos anos pedidos: idade média e parcela de trocas de partido e de pessoa', () => {
  const listas = [
    [p(2016, 1, 'A', 50), p(2020, 1, 'B', 54), p(2024, 2, 'B', 40)],
    [p(2016, 5, 'C', 60), p(2020, 5, 'C', 64), p(2024, 5, 'C', 68)],
  ];
  const r = alternancia(listas, [2020, 2024]);
  assert.equal(r.municipios, 2);
  assert.equal(r.idade, (54 + 40 + 64 + 68) / 4);
  assert.equal(r.partido, 25);
  assert.equal(r.pessoa, 25);
  assert.equal(r.eleicoes, 4);
});
