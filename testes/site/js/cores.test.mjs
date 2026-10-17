import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COR, corIdeologia, contraste } from '../../../site/js/lib/cores.js';

test('pontas e centro', () => {
  assert.equal(corIdeologia(3), COR.esquerda); assert.equal(corIdeologia(8), COR.direita);
  assert.equal(corIdeologia(5), COR.centro); assert.equal(corIdeologia(0), COR.esquerda);
  assert.equal(corIdeologia(-100, 'camara'), COR.esquerda); assert.equal(corIdeologia(null), COR.semDado);
});
test('texto legível no bege', () => {
  for (const c of [COR.esquerdaTexto, COR.direitaTexto, COR.tecla]) assert.ok(contraste(c, COR.urna) >= 4.5);
});
test('esquerda não se confunde com derrota', () => { assert.notEqual(COR.esquerda, COR.derrota); });
