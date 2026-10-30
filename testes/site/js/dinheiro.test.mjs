import { test } from 'node:test';
import assert from 'node:assert/strict';
import { custoPorVoto, spearman, descreveCorrelacao, abreviaReais, forcaDaRelacao } from '../../../site/js/lib/dinheiro.js';

test('custo por voto', () => {
  assert.equal(custoPorVoto(1000, 100), 10); assert.equal(custoPorVoto(1000, 0), null);
  assert.equal(custoPorVoto(null, 100), null); assert.equal(custoPorVoto(1000, null), null);
});
test('spearman', () => {
  assert.equal(spearman([[1, 10], [2, 20], [3, 30]]), 1); assert.equal(spearman([[1, 3], [2, 2], [3, 1]]), -1);
  assert.equal(spearman([[1, 1], [2, 2]]), null);
});
test('descrição', () => { assert.match(descreveCorrelacao(0.7), /forte/); assert.equal(descreveCorrelacao(null), 'dados insuficientes'); });
test('reais abreviados para o número grande do santinho', () => {
  assert.equal(abreviaReais(131313037), 'R$ 131,3 mi');
  assert.equal(abreviaReais(2456215), 'R$ 2,5 mi');
  assert.equal(abreviaReais(14473283), 'R$ 14,5 mi');
  assert.equal(abreviaReais(1500000000), 'R$ 1,5 bi');
  assert.equal(abreviaReais(850000), 'R$ 850 mil');
  assert.equal(abreviaReais(999), 'R$ 999');
});

test('força da relação em palavras, sem falar de dinheiro', () => {
  assert.equal(forcaDaRelacao(0.05), 'quase nenhuma relação');
  assert.equal(forcaDaRelacao(-0.2), 'relação fraca');
  assert.equal(forcaDaRelacao(0.45), 'relação moderada');
  assert.equal(forcaDaRelacao(-0.7), 'relação forte');
  assert.equal(forcaDaRelacao(null), 'dados insuficientes');
});
