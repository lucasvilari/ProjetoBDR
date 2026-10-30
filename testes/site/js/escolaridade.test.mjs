import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pearson, nivelEmPalavras, taxa, NOMES_NIVEIS } from '../../../site/js/lib/escolaridade.js';

test('pearson mede a relação linear entre os pares; sem variação, não há correlação', () => {
  assert.equal(pearson([[1, 2], [2, 4], [3, 6]]), 1);
  assert.equal(pearson([[1, 3], [2, 2], [3, 1]]), -1);
  assert.equal(pearson([[1, 1], [2, 1], [3, 1]]), null);
  assert.equal(pearson([[1, 1]]), null);
});

test('nivelEmPalavras diz em que degrau da escala de 0 a 7 está uma média', () => {
  assert.equal(nivelEmPalavras(5), 'ensino médio completo');
  assert.equal(nivelEmPalavras(5.04), 'ensino médio completo');
  assert.equal(nivelEmPalavras(4.6), 'entre ensino médio incompleto e ensino médio completo');
  assert.equal(nivelEmPalavras(2.78), 'entre ensino fundamental incompleto e ensino fundamental completo');
  assert.equal(nivelEmPalavras(null), 'sem dado');
  assert.equal(NOMES_NIVEIS.length, 8);
});

test('taxa é a porcentagem de eleitos, ou null sem candidatos', () => {
  assert.equal(taxa([200, 50]), 25);
  assert.equal(taxa([0, 0]), null);
});
