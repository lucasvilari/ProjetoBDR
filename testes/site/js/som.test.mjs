import { test } from 'node:test';
import assert from 'node:assert/strict';
import { somLigado, guardaSom, mostraPortao, ehRecusa } from '../../../site/js/lib/som.js';

const memoria = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('o som começa ligado e o site lembra quando o leitor o desliga e religa', () => {
  const s = memoria();
  assert.equal(somLigado(s), true);
  guardaSom(s, false);
  assert.equal(somLigado(s), false);
  guardaSom(s, true);
  assert.equal(somLigado(s), true);
});

test('sem armazenamento (ou com ele bloqueado), o som fica ligado e guardar não quebra', () => {
  assert.equal(somLigado(null), true);
  const bloqueado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.equal(somLigado(bloqueado), true);
  assert.doesNotThrow(() => guardaSom(bloqueado, false));
});

test('a tela "toque para entrar" só aparece quando a abertura vai tocar e o som está ligado', () => {
  assert.equal(mostraPortao({ abertura: true, som: true }), true);
  assert.equal(mostraPortao({ abertura: true, som: false }), false);
  assert.equal(mostraPortao({ abertura: false, som: true }), false);
});

test('ehRecusa reconhece a frase das névoas, com ou sem acento, e só no começo da resposta', () => {
  assert.equal(ehRecusa('As névoas não me deixam ver'), true);
  assert.equal(ehRecusa('  As nevoas escondem'), true);
  assert.equal(ehRecusa('Romeu Zema foi o mais votado. As névoas…'), false);
  assert.equal(ehRecusa('As nev'), null);    // ainda cedo para saber
  assert.equal(ehRecusa('Lula'), false);   // já não pode virar a frase das névoas
  assert.equal(ehRecusa('Lula teve 51%'), false);
});
