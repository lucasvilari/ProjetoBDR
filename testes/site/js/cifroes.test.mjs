import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preenchimento, faixaDePatrimonio, comPeloMenos, meiosDoClique } from '../../../site/js/lib/cifroes.js';

const perto = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

test('cada cifrão vale 10%', () => {
  assert.ok(perto(preenchimento(75), [1, 1, 1, 1, 1, 1, 1, 0.5, 0, 0]));
  assert.ok(perto(preenchimento(0), Array(10).fill(0)));
  assert.ok(perto(preenchimento(100), Array(10).fill(1)));
  assert.ok(Math.abs(preenchimento(4.8)[0] - 0.48) < 1e-9);
});
test('fora de 0 a 100 é limitado', () => {
  assert.ok(perto(preenchimento(130), Array(10).fill(1)));
  assert.ok(perto(preenchimento(-5), Array(10).fill(0)));
  assert.ok(perto(preenchimento(null), Array(10).fill(0)));
});
test('faixas de patrimônio iguais às da consulta', () => {
  assert.equal(faixaDePatrimonio(0), 0); assert.equal(faixaDePatrimonio(null), 0);
  assert.equal(faixaDePatrimonio(99_999), 1); assert.equal(faixaDePatrimonio(100_000), 2);
  assert.equal(faixaDePatrimonio(999_999), 3); assert.equal(faixaDePatrimonio(4_999_999), 4);
  assert.equal(faixaDePatrimonio(5_000_000), 5);
});
test('a partir de N meios cifrões: soma as fatias de cima e as de baixo', () => {
  const fatias = [{ meio_cifrao: 0, candidatos: 10, eleitos: 1 }, { meio_cifrao: 14, candidatos: 5, eleitos: 0 },
    { meio_cifrao: 15, candidatos: 20, eleitos: 4 }, { meio_cifrao: 20, candidatos: 5, eleitos: 1 }];
  const r = comPeloMenos(fatias, 15);
  assert.deepEqual(r.com, { candidatos: 25, eleitos: 5, taxa: 20 });
  assert.deepEqual(r.sem, { candidatos: 15, eleitos: 1, taxa: 100 / 15 });
  assert.equal(comPeloMenos(fatias, 0).sem.taxa, null);
});
test('o clique num cifrão vale meio (metade esquerda) ou inteiro (metade direita)', () => {
  assert.equal(meiosDoClique(0, 0.2), 1);
  assert.equal(meiosDoClique(0, 0.8), 2);
  assert.equal(meiosDoClique(7, 0.3), 15);
  assert.equal(meiosDoClique(9, 0.99), 20);
});
