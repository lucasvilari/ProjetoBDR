import { test } from 'node:test';
import assert from 'node:assert/strict';
import { achaNoTexto, recorteDoPedido } from '../../../site/js/lib/leitor.js';
import { cargosDoAno } from '../../../site/js/lib/recorte.js';

const MUNICIPIOS = [
  ['20516', 'João Pessoa', 'PB'], ['41238', 'Belo Horizonte', 'MG'], ['90514', 'Campo Grande', 'MS'],
  ['20000', 'Campo Grande', 'PB'], ['40000', 'Governador Valadares', 'MG'], ['00001', 'Presidente Médici', 'RO'],
  ['06000', 'Amapá', 'AP'], ['20100', 'Esperança', 'PB'], ['20200', 'Santa Luzia', 'PB'], ['40100', 'Santa Luzia', 'MG'], ['40200', 'Oliveira', 'MG'], ['40300', 'Uberlândia', 'MG'], ['19488', 'Mato Grosso', 'PB'], ['40400', 'Minas Novas', 'MG'],
];

test('achaNoTexto encontra ano, cargo e o Brasil numa pergunta', () => {
  const a = achaNoTexto('Como foi a disputa por cadeira para presidente em 2026?', MUNICIPIOS);
  assert.deepEqual(a.anos, [2026]);
  assert.deepEqual(a.cargos, ['PRESIDENTE']);
  assert.deepEqual(a.ufs, []);
  assert.deepEqual(a.municipios, []);
  assert.equal(a.brasil, false);
  assert.equal(achaNoTexto('quanto custou no Brasil inteiro?', MUNICIPIOS).brasil, true);
});

test('achaNoTexto reconhece os cargos no plural, no feminino e por apelido', () => {
  const cargos = t => achaNoTexto(t, MUNICIPIOS).cargos;
  assert.deepEqual(cargos('as deputadas federais eleitas'), ['DEPUTADO FEDERAL']);
  assert.deepEqual(cargos('quem foi para a Assembleia Legislativa'), ['DEPUTADO ESTADUAL']);
  assert.deepEqual(cargos('vereadoras e prefeitas'), ['PREFEITO', 'VEREADOR']);
  assert.deepEqual(cargos('a disputa pelo Senado'), ['SENADOR']);
  assert.deepEqual(cargos('quantos deputados?'), []);       // sem dizer qual, não escolhe
});

test('achaNoTexto acha os estados pelo nome e pela sigla em maiúsculas', () => {
  assert.deepEqual(achaNoTexto('e na Paraíba?', MUNICIPIOS).ufs, ['PB']);
  assert.deepEqual(achaNoTexto('governador de MG em 2022', MUNICIPIOS).ufs, ['MG']);
  assert.deepEqual(achaNoTexto('Minas e Mato Grosso do Sul', MUNICIPIOS).ufs, ['MG', 'MS']);
  assert.deepEqual(achaNoTexto('ms de diferença', MUNICIPIOS).ufs, []);   // sigla minúscula não é estado
  assert.deepEqual(achaNoTexto('no Amapá', MUNICIPIOS).ufs, ['AP']);       // o estado, não o município de mesmo nome
  assert.deepEqual(achaNoTexto('no Amapá', MUNICIPIOS).municipios, []);
});

test('achaNoTexto acha municípios escritos com maiúscula, e o nome deles não vira cargo', () => {
  const a = achaNoTexto('vereadores de joão pessoa e de Governador Valadares', MUNICIPIOS);
  assert.deepEqual(a.municipios.map(m => m.cod), ['40000']);              // "joão pessoa" minúsculo não conta
  assert.deepEqual(a.cargos, ['VEREADOR']);                               // "Governador" do nome não é cargo
  assert.deepEqual(achaNoTexto('em Presidente Médici', MUNICIPIOS).cargos, []);
  assert.deepEqual(achaNoTexto('a esperança do eleitor', MUNICIPIOS).municipios, []);
  assert.deepEqual(achaNoTexto('prefeito de Belo Horizonte', MUNICIPIOS).municipios, [{ cod: '41238', nome: 'Belo Horizonte', uf: 'MG' }]);
});

test('achaNoTexto só aceita nome de uma palavra depois de "em", "no", "na" ou de "município de", "prefeito de"', () => {
  const muns = t => achaNoTexto(t, MUNICIPIOS).municipios.map(m => m.nome);
  assert.deepEqual(muns('Quanto gastou José de Oliveira?'), []);
  assert.deepEqual(muns('E em Oliveira?'), ['Oliveira']);
  assert.deepEqual(muns('o prefeito de Uberlândia'), ['Uberlândia']);
  assert.deepEqual(muns('Uberlândia elegeu quem?'), []);
  assert.deepEqual(muns('Esperança, na Paraíba'), []);
  assert.deepEqual(muns('na cidade de Esperança'), ['Esperança']);
});

test('achaNoTexto não confunde o nome do estado com município de nome parecido', () => {
  const a = achaNoTexto('a idade em Mato Grosso do Sul', MUNICIPIOS);
  assert.deepEqual(a.municipios, []);
  assert.deepEqual(a.ufs, ['MS']);
  const b = achaNoTexto('e em Minas Novas?', MUNICIPIOS);
  assert.deepEqual(b.municipios.map(m => m.nome), ['Minas Novas']);
  assert.deepEqual(b.ufs, []);
  assert.equal(achaNoTexto('e nos seis estados?', MUNICIPIOS).brasil, true);
});

test('achaNoTexto resolve nomes repetidos pelo estado citado, e sem estado não escolhe', () => {
  assert.deepEqual(achaNoTexto('Campo Grande, na Paraíba', MUNICIPIOS).municipios.map(m => m.cod), ['20000']);
  const sem = achaNoTexto('prefeito de Santa Luzia', MUNICIPIOS);
  assert.deepEqual(sem.municipios, []);
  assert.deepEqual(sem.ambiguos, ['Santa Luzia']);
});

const OPCOES = { anos: [2018, 2020, 2022, 2024, 2026], cargosDoAno: ano => cargosDoAno(ano), lugar: 'mun', brasil: true };
const ATUAL = { ano: 2022, cargo: 'DEPUTADO FEDERAL', uf: 'MG' };

test('recorteDoPedido aplica o que a pergunta pede e diz se nada mudou', () => {
  const { novo, avisos } = recorteDoPedido(achaNoTexto('presidente em 2026', MUNICIPIOS), ATUAL, OPCOES);
  assert.deepEqual(novo, { ano: 2026, cargo: 'PRESIDENTE', uf: 'MG' });
  assert.deepEqual(avisos, []);
  assert.equal(recorteDoPedido(achaNoTexto('por que isso acontece?', MUNICIPIOS), ATUAL, OPCOES).novo, null);
  assert.equal(recorteDoPedido(achaNoTexto('deputado federal em 2022', MUNICIPIOS), ATUAL, OPCOES).novo, null);
});

test('recorteDoPedido acha o ano do cargo quando a pergunta não diz', () => {
  // vereador não existe em 2022: vai para a última eleição municipal
  assert.deepEqual(recorteDoPedido(achaNoTexto('e os vereadores?', MUNICIPIOS), ATUAL, OPCOES).novo,
    { ano: 2024, cargo: 'VEREADOR', uf: 'MG' });
});

test('recorteDoPedido avisa o que a página não tem, e um cargo que não houve no ano dito não muda nada', () => {
  const r = recorteDoPedido(achaNoTexto('presidente em 2024', MUNICIPIOS), ATUAL, OPCOES);
  assert.equal(r.novo, null);                               // nem o ano nem o cargo: o pedido não existe
  assert.deepEqual(r.avisos, ['Não houve eleição para presidente em 2024.']);
  const velho = recorteDoPedido(achaNoTexto('senador em 2014', MUNICIPIOS), ATUAL, OPCOES);
  assert.deepEqual(velho.novo, { ano: 2022, cargo: 'SENADOR', uf: 'MG' });
  assert.deepEqual(velho.avisos, ['Esta página não tem dados de 2014.']);
});

test('recorteDoPedido troca o lugar: município (com o estado dele), estado ou Brasil', () => {
  assert.deepEqual(recorteDoPedido(achaNoTexto('prefeitos de João Pessoa', MUNICIPIOS), ATUAL, OPCOES).novo,
    { ano: 2024, cargo: 'PREFEITO', uf: 'PB', mun: '20516' });
  assert.deepEqual(recorteDoPedido(achaNoTexto('e na Paraíba?', MUNICIPIOS), { ...ATUAL, mun: '41238' }, OPCOES).novo,
    { ano: 2022, cargo: 'DEPUTADO FEDERAL', uf: 'PB' });
  assert.deepEqual(recorteDoPedido(achaNoTexto('no Brasil todo', MUNICIPIOS), ATUAL, OPCOES).novo,
    { ano: 2022, cargo: 'DEPUTADO FEDERAL' });
  // página sem município: o município vira o estado dele
  assert.deepEqual(recorteDoPedido(achaNoTexto('em Belo Horizonte', MUNICIPIOS), { ...ATUAL, uf: 'PB' }, { ...OPCOES, lugar: 'uf' }).novo,
    { ano: 2022, cargo: 'DEPUTADO FEDERAL', uf: 'MG' });
  // página sem lugar e sem cargo
  assert.equal(recorteDoPedido(achaNoTexto('vereadores da Paraíba', MUNICIPIOS), { ano: 2022 }, { anos: OPCOES.anos }).novo, null);
});

test('recorteDoPedido avisa quando a página não mostra o cargo em ano nenhum', () => {
  const soProporcionais = { ...OPCOES, cargosDoAno: ano => cargosDoAno(ano).filter(c => c.startsWith('DEPUTADO') || c === 'VEREADOR') };
  const r = recorteDoPedido(achaNoTexto('e o presidente?', MUNICIPIOS), ATUAL, soProporcionais);
  assert.equal(r.novo, null);
  assert.deepEqual(r.avisos, ['Esta página não mostra presidente.']);
});

test('recorteDoPedido avisa o município de nome repetido', () => {
  const r = recorteDoPedido(achaNoTexto('prefeito de Santa Luzia', MUNICIPIOS), ATUAL, OPCOES);
  assert.deepEqual(r.avisos, ['Há mais de um município chamado Santa Luzia: diga também o estado.']);
});
