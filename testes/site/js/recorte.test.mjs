import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leRecorte, escreveRecorte, ueDoRecorte, cargosDoAno, ajustaLugar } from '../../../site/js/lib/recorte.js';

test('recorte ida e volta', () => {
  const r = { ano: 2022, cargo: 'DEPUTADO FEDERAL', uf: 'MG' };
  assert.deepEqual(leRecorte(escreveRecorte(r), {}, { anos: [2018, 2020, 2022, 2024], cargos: cargosDoAno(2022), ufs: ['MG'] }), r);
});
test('valores inválidos voltam ao padrão', () => {
  const r = leRecorte('ano=1999&cargo=REI', { ano: 2022, cargo: 'DEPUTADO FEDERAL' }, { anos: [2022], cargos: ['DEPUTADO FEDERAL'], ufs: [] });
  assert.equal(r.ano, 2022); assert.equal(r.cargo, 'DEPUTADO FEDERAL');
});
test('aceita o # do endereço e campos extras válidos', () => {
  const r = leRecorte('#ano=2024&cargo=VEREADOR&uf=PB&mun=20516&pid=12&modo=partido', {}, { anos: [2024], cargos: cargosDoAno(2024), ufs: ['PB'] });
  assert.deepEqual(r, { ano: 2024, cargo: 'VEREADOR', uf: 'PB', mun: '20516', pid: 12, modo: 'partido' });
});
test('unidade eleitoral', () => {
  assert.equal(ueDoRecorte({ cargo: 'PRESIDENTE', uf: 'MG' }), 'BR');
  assert.equal(ueDoRecorte({ cargo: 'VEREADOR', uf: 'PB', mun: '20516' }), '20516');
  assert.equal(ueDoRecorte({ cargo: 'SENADOR', uf: 'RR' }), 'RR');
  assert.equal(ueDoRecorte({ cargo: 'DEPUTADO FEDERAL' }), 'BR');
});
test('cargo que não existe no ano', () => {
  assert.ok(!cargosDoAno(2020).includes('SENADOR'));
  assert.ok(cargosDoAno(2022, 'DF').includes('DEPUTADO DISTRITAL'));
  assert.ok(!cargosDoAno(2022, 'DF').includes('DEPUTADO ESTADUAL'));
  assert.deepEqual(cargosDoAno(2024), ['PREFEITO', 'VEREADOR']);
});
test('endereço com recorte e sem uf é o Brasil; o lugar padrão só vale com o endereço vazio', () => {
  const validos = { anos: [2022], cargos: ['DEPUTADO FEDERAL'], ufs: ['MG', 'PB'] };
  const padrao = { ano: 2022, cargo: 'DEPUTADO FEDERAL', uf: 'PB' };
  assert.equal(leRecorte('#ano=2022&cargo=DEPUTADO+FEDERAL', padrao, validos).uf, undefined);
  assert.equal(leRecorte('', padrao, validos).uf, 'PB');
});
test('o município padrão vale com o endereço vazio, e o político sozinho no endereço também usa o padrão', () => {
  const validos = { anos: [2024], cargos: ['PREFEITO'], ufs: ['PB'] };
  const padrao = { ano: 2024, cargo: 'PREFEITO', uf: 'PB', mun: '20516' };
  assert.equal(leRecorte('', padrao, validos).mun, '20516');
  assert.deepEqual(leRecorte('#pid=7', padrao, validos), { ano: 2024, cargo: 'PREFEITO', uf: 'PB', mun: '20516', pid: 7 });
  assert.equal(leRecorte('#ano=2024&cargo=PREFEITO&uf=PB', padrao, validos).mun, undefined);
});
test('só presidente é nacional; os outros cargos ficam num dos estados do projeto', () => {
  const ufs = ['MG', 'PB'];
  assert.deepEqual(ajustaLugar({ ano: 2022, cargo: 'PRESIDENTE', uf: 'MG', mun: '41238' }, ufs, 'PB'), { ano: 2022, cargo: 'PRESIDENTE' });
  assert.deepEqual(ajustaLugar({ ano: 2022, cargo: 'SENADOR' }, ufs, 'PB'), { ano: 2022, cargo: 'SENADOR', uf: 'PB' });
  assert.deepEqual(ajustaLugar({ ano: 2022, cargo: 'SENADOR', uf: 'SP' }, ufs, 'PB'), { ano: 2022, cargo: 'SENADOR', uf: 'PB' });
  assert.deepEqual(ajustaLugar({ ano: 2024, cargo: 'VEREADOR', uf: 'MG', mun: '41238' }, ufs, 'PB'), { ano: 2024, cargo: 'VEREADOR', uf: 'MG', mun: '41238' });
  assert.deepEqual(ajustaLugar({ ano: 2022, cargo: 'GOVERNADOR', uf: 'MG', mun: '41238' }, ufs, 'PB'), { ano: 2022, cargo: 'GOVERNADOR', uf: 'MG' });
});
