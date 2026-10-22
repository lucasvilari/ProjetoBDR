import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ceuDePalavras } from '../../../site/js/rua.js';

test('ceuDePalavras põe uma nuvem por palavra, com a palavra escrita nela', () => {
  const g = ceuDePalavras([['santinhos', 40, 1000], ['adesivos', 10, 50], ['carro', 1, 5]], () => '#000');
  assert.equal((g.match(/class="nuvem"/g) || []).length, 3);
  for (const p of ['santinhos', 'adesivos', 'carro']) assert.match(g, new RegExp(`>${p}</text>`));
  assert.doesNotMatch(g, /NaN|undefined/);
});

test('ceuDePalavras faz maior a nuvem da palavra mais frequente', () => {
  const g = ceuDePalavras([['muito', 40, 1], ['pouco', 1, 1]], () => '#000');
  const fonte = p => Number(g.match(new RegExp(`font-size:([\\d.]+)px[^>]*>${p}<`))[1]);
  assert.ok(fonte('muito') > fonte('pouco'));
});

test('ceuDePalavras sem palavras não desenha céu', () => {
  assert.equal(ceuDePalavras([], () => '#000'), '');
});
