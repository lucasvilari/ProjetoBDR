import { test } from 'node:test';
import assert from 'node:assert/strict';
import { porLegenda, escoamento, resumoPorPartido } from '../../../site/js/lib/quociente.js';

test('abaixo do quociente é pela legenda', () => {
  assert.equal(porLegenda({ votos: 499 }, 500), true);
  assert.equal(porLegenda({ votos: 500 }, 500), false);
});
test('escoamento cobre a falta dentro da unidade', () => {
  const e = [{ pid: 1, votos: 900, unidade: 0 }, { pid: 2, votos: 200, unidade: 0 }, { pid: 3, votos: 150, unidade: 0 }];
  assert.deepEqual(escoamento(e, 500), [{ de: 1, para: 2, votos: 300 }, { de: 1, para: 3, votos: 100 }]);
});
test('sem excedente não escoa', () => { assert.deepEqual(escoamento([{ pid: 1, votos: 300, unidade: 0 }], 500), []); });
test('votos não passam de uma unidade para outra', () => {
  const e = [{ pid: 1, votos: 900, unidade: 0 }, { pid: 2, votos: 200, unidade: 1 }];
  assert.deepEqual(escoamento(e, 500), []);
});
test('vários puxadores cobrem a falta em ordem', () => {
  const e = [{ pid: 1, votos: 600, unidade: 0 }, { pid: 2, votos: 700, unidade: 0 }, { pid: 3, votos: 100, unidade: 0 }];
  assert.deepEqual(escoamento(e, 500), [{ de: 2, para: 3, votos: 200 }, { de: 1, para: 3, votos: 100 }]);
});
test('resumo por partido', () => {
  const e = [{ sigla: 'A', votos: 900 }, { sigla: 'A', votos: 100 }, { sigla: 'B', votos: 50 }];
  assert.deepEqual(resumoPorPartido(e, 500), [
    { partido: 'A', eleitos: 2, porLegenda: 1, pct: 50 },
    { partido: 'B', eleitos: 1, porLegenda: 1, pct: 100 },
  ]);
});
