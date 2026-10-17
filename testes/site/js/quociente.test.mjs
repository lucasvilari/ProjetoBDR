import { test } from 'node:test';
import assert from 'node:assert/strict';
import { porLegenda, resumoPorPartido, enchimento } from '../../../site/js/lib/quociente.js';

test('abaixo do quociente é pela legenda', () => {
  assert.equal(porLegenda({ votos: 499 }, 500), true);
  assert.equal(porLegenda({ votos: 500 }, 500), false);
});
const fontes = (eleitos, q) => [...enchimento(eleitos, [], q).copos].filter(([, c]) => c.fontes.length)
  .flatMap(([para, c]) => c.fontes.map(f => ({ de: f.de, para, votos: f.votos })));
test('a sobra dos puxadores cobre a falta dentro da chapa', () => {
  const e = [{ pid: 1, votos: 900, unidade: 0 }, { pid: 2, votos: 200, unidade: 0 }, { pid: 3, votos: 150, unidade: 0 }];
  assert.deepEqual(fontes(e, 500), [{ de: 1, para: 2, votos: 300 }, { de: 1, para: 3, votos: 100 }]);
});
test('sem sobra, nada escorre', () => { assert.deepEqual(fontes([{ pid: 1, votos: 300, unidade: 0 }], 500), []); });
test('votos não passam de uma chapa para outra', () => {
  const e = [{ pid: 1, votos: 900, unidade: 0 }, { pid: 2, votos: 200, unidade: 1 }];
  assert.deepEqual(fontes(e, 500), []);
});
test('vários puxadores cobrem a falta em ordem', () => {
  const e = [{ pid: 1, votos: 600, unidade: 0 }, { pid: 2, votos: 700, unidade: 0 }, { pid: 3, votos: 100, unidade: 0 }];
  assert.deepEqual(fontes(e, 500), [{ de: 2, para: 3, votos: 200 }, { de: 1, para: 3, votos: 100 }]);
});
test('resumo por partido', () => {
  const e = [{ sigla: 'A', votos: 900 }, { sigla: 'A', votos: 100 }, { sigla: 'B', votos: 50 }];
  assert.deepEqual(resumoPorPartido(e, 500), [
    { partido: 'A', eleitos: 2, porLegenda: 1, pct: 50 },
    { partido: 'B', eleitos: 1, porLegenda: 1, pct: 100 },
  ]);
});
test('enchimento dos copos: próprios votos, sobra dos puxadores, depois a jarra da chapa; o que falta fica vazio', () => {
  const eleitos = [{ pid: 'A', unidade: 1, votos: 250 }, { pid: 'B', unidade: 1, votos: 60 }, { pid: 'C', unidade: 1, votos: 30 },
    { pid: 'D', unidade: 2, votos: 120 }, { pid: 'E', unidade: 2, votos: 50 }, { pid: 'F', unidade: 2, votos: 40 }];
  const chapas = [{ unidade: 1, nominais: 400, legenda: 20 }, { unidade: 2, nominais: 240, legenda: 10 }];
  const { copos, jarras } = enchimento(eleitos, chapas, 100);
  assert.deepEqual(copos.get('A'), { proprio: 100, transborda: 150, dosPuxadores: 0, daChapa: 0, vazio: 0, fontes: [] });
  assert.deepEqual(copos.get('B'), { proprio: 60, transborda: 0, dosPuxadores: 40, daChapa: 0, vazio: 0, fontes: [{ de: 'A', votos: 40 }] });
  assert.deepEqual(copos.get('C'), { proprio: 30, transborda: 0, dosPuxadores: 70, daChapa: 0, vazio: 0, fontes: [{ de: 'A', votos: 70 }] });
  assert.deepEqual(jarras.get(1), { inicio: 80, resta: 80 });
  assert.deepEqual(copos.get('E'), { proprio: 50, transborda: 0, dosPuxadores: 20, daChapa: 30, vazio: 0, fontes: [{ de: 'D', votos: 20 }, { de: 'chapa', votos: 30 }] });
  assert.deepEqual(copos.get('F'), { proprio: 40, transborda: 0, dosPuxadores: 0, daChapa: 10, vazio: 50, fontes: [{ de: 'chapa', votos: 10 }] });
  assert.deepEqual(jarras.get(2), { inicio: 40, resta: 0 });
});
test('sem os votos da chapa, a jarra fica vazia', () => {
  const { copos, jarras } = enchimento([{ pid: 'X', unidade: 3, votos: 70 }], [], 100);
  assert.equal(copos.get('X').vazio, 30);
  assert.deepEqual(jarras.get(3), { inicio: 0, resta: 0 });
});
