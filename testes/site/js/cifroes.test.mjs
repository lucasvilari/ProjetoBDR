import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faixaDePatrimonio, porFaixa } from '../../../site/js/lib/cifroes.js';

test('faixas de patrimônio iguais às da consulta', () => {
  assert.equal(faixaDePatrimonio(0), 0); assert.equal(faixaDePatrimonio(null), 0);
  assert.equal(faixaDePatrimonio(99_999), 1); assert.equal(faixaDePatrimonio(100_000), 2);
  assert.equal(faixaDePatrimonio(999_999), 3); assert.equal(faixaDePatrimonio(4_999_999), 4);
  assert.equal(faixaDePatrimonio(5_000_000), 5);
});
test('porFaixa junta os meios cifrões em faixas de 10%, com 100% público numa faixa só dele', () => {
  const fatias = [{ meio_cifrao: 0, candidatos: 10, eleitos: 1 }, { meio_cifrao: 1, candidatos: 2, eleitos: 1 },
    { meio_cifrao: 15, candidatos: 20, eleitos: 4 }, { meio_cifrao: 19, candidatos: 5, eleitos: 1 },
    { meio_cifrao: 20, candidatos: 8, eleitos: 0 }];
  const f = porFaixa(fatias);
  assert.equal(f.length, 11);
  assert.deepEqual(f[0], { faixa: 0, de: 0, ate: 10, candidatos: 12, eleitos: 2, taxa: 100 * 2 / 12 });
  assert.deepEqual(f[7], { faixa: 7, de: 70, ate: 80, candidatos: 20, eleitos: 4, taxa: 20 });
  assert.deepEqual(f[9], { faixa: 9, de: 90, ate: 100, candidatos: 5, eleitos: 1, taxa: 20 });
  assert.deepEqual(f[10], { faixa: 10, de: 100, ate: 100, candidatos: 8, eleitos: 0, taxa: 0 });
  assert.deepEqual(f[3], { faixa: 3, de: 30, ate: 40, candidatos: 0, eleitos: 0, taxa: null });
});
test('faixaDaParcela põe uma parcela de dinheiro público na sua faixa', async () => {
  const { faixaDaParcela } = await import('../../../site/js/lib/cifroes.js');
  assert.equal(faixaDaParcela(0), 0);
  assert.equal(faixaDaParcela(9.99), 0);
  assert.equal(faixaDaParcela(70), 7);
  assert.equal(faixaDaParcela(99.99), 9);
  assert.equal(faixaDaParcela(100), 10);
  assert.equal(faixaDaParcela(null), null);
});
