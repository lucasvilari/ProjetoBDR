import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indiceDoMaior, limitesPorQuantis, limitesDivergentes, faixaDe, numeroBr, mandatoDe, rotuloMandato, extremos } from '../../../site/js/lib/retrospecto.js';

test('o setor que mais pesa ignora os ausentes', () => {
  assert.equal(indiceDoMaior([10, 40, 30, 20]), 1);
  assert.equal(indiceDoMaior([null, null, 5, null]), 2);
  assert.equal(indiceDoMaior([null, null]), null);
});
test('quantis dividem em faixas de tamanho parecido, sem limites repetidos', () => {
  const v = Array.from({ length: 100 }, (_, i) => i + 1);
  const lim = limitesPorQuantis(v, 4);
  assert.equal(lim.length, 3);
  assert.deepEqual([1, 25, 26, 50, 51, 75, 76, 100].map(x => faixaDe(x, lim)), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual(limitesPorQuantis([5, 5, 5, 5], 4), [5]);
  assert.deepEqual(limitesPorQuantis([null, null], 4), []);
});
test('limites divergentes são simétricos em torno de zero', () => {
  const lim = limitesDivergentes([-10, -4, -2, 0, 2, 4, 10]);
  assert.equal(lim.length, 5);
  assert.equal(lim[2], 0);
  assert.equal(lim[0], -lim[4]); assert.equal(lim[1], -lim[3]);
  assert.equal(faixaDe(-100, lim), 0); assert.equal(faixaDe(100, lim), 5);
});
test('formato brasileiro com sinal', () => {
  assert.equal(numeroBr(55.14, 1, true), '+55,1');
  assert.equal(numeroBr(-5.54, 1, true), '−5,5');
  assert.equal(numeroBr(20), '20,0');
  assert.equal(numeroBr(null), '—');
});
test('o mandato começa no ano seguinte à eleição e dura quatro anos', () => {
  assert.deepEqual(mandatoDe(2020), { de: 2021, ate: 2024 });
});

test('rotuloMandato diz o ano da eleição e os anos do mandato', () => {
  assert.equal(rotuloMandato(2018), 'eleito em 2018 (mandato de 2019 a 2022)');
});

test('extremos dá a mediana, os maiores e os menores, ignorando os ausentes', () => {
  const r = extremos([['a', 5], ['b', null], ['c', 1], ['d', 9], ['e', 3]], 2);
  assert.equal(r.total, 5);
  assert.equal(r.comDado, 4);
  assert.equal(r.mediana, 4);
  assert.deepEqual(r.maiores, [['d', 9], ['a', 5]]);
  assert.deepEqual(r.menores, [['c', 1], ['e', 3]]);
  assert.equal(extremos([['a', null]], 3).mediana, null);
});
