import { test } from 'node:test';
import assert from 'node:assert/strict';
import { janelasDoAndar, ordemDosAndares, trechoDoPasseio } from '../../../site/js/lib/predio.js';

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

test('trechoDoPasseio percorre a fileira inteira, ora da direita para a esquerda, ora ao contrário', () => {
  // duas fileiras: janelas 0 a 5 no alto (topo 0), 6 a 9 embaixo (topo 20)
  const topos = [0, 0, 0, 0, 0, 0, 20, 20, 20, 20];
  const filas = [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9]];
  const vistos = new Set();
  for (let a = 0; a < 10; a++) {
    for (let b = 0; b < 10; b++) {
      const sorteios = [(a + 0.5) / 10, (b + 0.5) / 10];         // o primeiro escolhe a fileira, o segundo o sentido
      const t = trechoDoPasseio(topos, () => sorteios.shift());
      const fila = filas.find(f => f.includes(t[0]));
      assert.ok([fila, [...fila].reverse()].some(f => JSON.stringify(f) === JSON.stringify(t)), `trecho: ${t}`);
      vistos.add(`${fila[0]}:${t[0] < t.at(-1) ? 'direita' : 'esquerda'}`);
    }
  }
  assert.deepEqual([...vistos].sort(), ['0:direita', '0:esquerda', '6:direita', '6:esquerda']);
});

test('trechoDoPasseio não escolhe nada numa fileira de uma janela só', () => {
  assert.equal(trechoDoPasseio([0], Math.random), null);
  assert.equal(trechoDoPasseio([], Math.random), null);
});
