import { test } from 'node:test';
import assert from 'node:assert/strict';
import { janelasDoAndar, ordemDosAndares } from '../../../site/js/lib/predio.js';

test('uma janela por candidato, ou por grupo de candidatos', () => {
  assert.deepEqual(janelasDoAndar(30, 4, 1), { janelas: 30, acesas: 4 });
  assert.deepEqual(janelasDoAndar(1234, 56, 10), { janelas: 123, acesas: 6 });
});
test('andar com alguém nunca fica sem janela, e eleito nunca fica apagado', () => {
  assert.deepEqual(janelasDoAndar(3, 1, 100), { janelas: 1, acesas: 1 });
  assert.deepEqual(janelasDoAndar(0, 0, 10), { janelas: 0, acesas: 0 });
  assert.deepEqual(janelasDoAndar(12, 12, 5), { janelas: 2, acesas: 2 });
});
test('os andares vão da cobertura (mais rico) ao térreo (sem bens)', () => {
  assert.deepEqual(ordemDosAndares(6), [5, 4, 3, 2, 1, 0]);
});
