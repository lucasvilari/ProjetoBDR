import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinoDe } from '../../../site/js/lib/redirecionamentos.js';

test('mapa vira a pergunta certa', () => {
  assert.equal(destinoDe('mapa', '#pergunta=vies&ano=2022&uf=PB'), 'pergunta-7.html#ano=2022&uf=PB');
  assert.equal(destinoDe('mapa', '#pergunta=patrimonio&ano=2022&cargo=DEPUTADO+FEDERAL&faixa=5'), 'pergunta-2.html#ano=2022&cargo=DEPUTADO+FEDERAL&faixa=5');
  assert.equal(destinoDe('mapa', '#pergunta=dependencia&ano=2024&cargo=VEREADOR&uf=MG&mun=41238'), 'pergunta-8.html#ano=2024&cargo=VEREADOR&uf=MG&mun=41238');
  assert.equal(destinoDe('mapa', '#pergunta=custo&ano=2022&cargo=SENADOR'), 'pergunta-1.html#ano=2022&cargo=SENADOR');
  assert.equal(destinoDe('mapa', ''), 'pergunta-1.html');
});
test('cadeiras leva o lugar de "onde" para "uf"', () => {
  assert.equal(destinoDe('cadeiras', '#ano=2022&cargo=DEPUTADO+FEDERAL&onde=MG'), 'pergunta-1.html#ano=2022&cargo=DEPUTADO+FEDERAL&uf=MG');
  assert.equal(destinoDe('cadeiras', '#ano=2022&cargo=DEPUTADO+FEDERAL&onde=BR'), 'pergunta-1.html#ano=2022&cargo=DEPUTADO+FEDERAL');
  assert.equal(destinoDe('cadeiras', ''), 'pergunta-1.html');
});
test('partido e político', () => {
  assert.equal(destinoDe('partido', '#PT'), 'pergunta-7.html#partido=PT');
  assert.equal(destinoDe('partido', '#PC%20DO%20B'), 'pergunta-7.html#partido=PC+DO+B');
  assert.equal(destinoDe('partido', ''), 'pergunta-7.html');
  assert.equal(destinoDe('politico', '#364652'), 'pergunta-10.html#364652');
  assert.equal(destinoDe('politico', ''), 'pergunta-10.html');
});
