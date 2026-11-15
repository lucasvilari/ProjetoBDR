import { test } from 'node:test';
import assert from 'node:assert/strict';
import { variacao, evolucaoDoPatrimonio } from '../../../site/js/lib/patrimonio.js';

test('variacao: porcentagem sobre o anterior; sem anterior positivo não há porcentagem', () => {
  assert.equal(variacao(150, 100), 50);
  assert.equal(variacao(50, 100), -50);
  assert.equal(variacao(100, 0), null);      // de nada para algo não tem porcentagem
  assert.equal(variacao(100, null), null);
});

test('evolucaoDoPatrimonio liga cada candidatura de 2018 em diante à anterior com bens', () => {
  const cands = [
    { ano: 2014, cargo: 'DEPUTADO ESTADUAL' },                       // antes de 2018: sem patrimônio
    { ano: 2018, cargo: 'DEPUTADO ESTADUAL', patrimonio: 100 },
    { ano: 2020, cargo: 'PREFEITO', patrimonio: 0 },                 // nenhum bem declarado
    { ano: 2022, cargo: 'DEPUTADO FEDERAL', patrimonio: 300 },
  ];
  const e = evolucaoDoPatrimonio(cands);
  assert.deepEqual(e.passos.map(p => [p.ano, p.patrimonio, p.anoAnterior, p.variacao]),
    [[2018, 100, null, null], [2020, 0, 2018, -100], [2022, 300, 2018, 200]]);
  assert.deepEqual([e.de.ano, e.ate.ano, e.variacao], [2018, 2022, 200]);
});

test('evolucaoDoPatrimonio não compara duas candidaturas do mesmo ano entre si', () => {
  const e = evolucaoDoPatrimonio([
    { ano: 2020, cargo: 'VEREADOR', patrimonio: 100 }, { ano: 2020, cargo: 'VICE-PREFEITO', patrimonio: 100 },
    { ano: 2024, cargo: 'PREFEITO', patrimonio: 200 }]);
  assert.deepEqual(e.passos.map(p => [p.anoAnterior, p.variacao]), [[null, null], [null, null], [2020, 100]]);
});

test('evolucaoDoPatrimonio sem duas candidaturas com bens não tem variação total', () => {
  const e = evolucaoDoPatrimonio([{ ano: 2022, cargo: 'PREFEITO', patrimonio: 500 }]);
  assert.equal(e.passos.length, 1);
  assert.equal(e.variacao, null);
  assert.equal(evolucaoDoPatrimonio([{ ano: 2010, cargo: 'PREFEITO' }]).passos.length, 0);
});
