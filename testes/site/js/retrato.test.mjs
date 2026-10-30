import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retratoEmTexto, comparacao } from '../../../site/js/lib/retrato.js';

test('retratoEmTexto escreve a pergunta, o recorte e cada seção com suas linhas', () => {
  const texto = retratoEmTexto({
    numero: 1, pergunta: 'Quanto custa uma cadeira?', recorte: 'deputado federal · Minas Gerais · 2022',
    secoes: [
      { titulo: 'Números do recorte', linhas: [['Vagas', '53'], ['Candidatos', '1.103']] },
      { titulo: 'Partido em destaque', linhas: [['Partido', 'PT']] },
    ],
  });
  assert.equal(texto, [
    'Pergunta 1: Quanto custa uma cadeira?',
    'Recorte: deputado federal · Minas Gerais · 2022',
    '',
    'Números do recorte',
    '- Vagas: 53',
    '- Candidatos: 1.103',
    '',
    'Partido em destaque',
    '- Partido: PT',
  ].join('\n'));
});

test('retratoEmTexto deixa de fora linhas sem valor e seções vazias', () => {
  const texto = retratoEmTexto({
    numero: 1, pergunta: 'P', recorte: 'R',
    secoes: [{ titulo: 'A', linhas: [['x', null], ['y', '']] }, { titulo: 'B', linhas: [['z', '1']] }, { titulo: 'C', linhas: [] }],
  });
  assert.equal(texto, 'Pergunta 1: P\nRecorte: R\n\nB\n- z: 1');
});

test('retratoEmTexto aceita uma linha só de texto, sem rótulo', () => {
  const texto = retratoEmTexto({ numero: 2, pergunta: 'P', recorte: 'R', secoes: [{ titulo: 'Partidos', linhas: [[null, 'PT, 10 cadeiras']] }] });
  assert.equal(texto, 'Pergunta 2: P\nRecorte: R\n\nPartidos\n- PT, 10 cadeiras');
});

test('comparacao diz quantas vezes um valor é o outro, arredondando como se fala', () => {
  assert.equal(comparacao(15.3, 0.3), 'cerca de 51 vezes');
  assert.equal(comparacao(15.3, 5.4), 'cerca de 2,8 vezes');
  assert.equal(comparacao(13.3, 5.4), 'cerca de 2,5 vezes');
  assert.equal(comparacao(4.6, 8.9), 'cerca de metade (0,52 vez)');
  // só perto de 0,5 é "metade": 0,63 é 37% a menos, e 0,42 já é "2,4 vezes menor"
  assert.equal(comparacao(7.3, 11.6), 'cerca de 37% a menos');
  assert.equal(comparacao(4.2, 10), 'cerca de 2,4 vezes menor');
  assert.equal(comparacao(2069340, 1900752), 'cerca de 9% a mais');
  assert.equal(comparacao(100, 103), 'praticamente igual (3% a menos)');
  assert.equal(comparacao(5, 0), null);
});
