import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliza, achaMunicipios, escolhePolitico, resumoCarreira, votacao, citados, linksDoCandidato, linksDoMunicipio } from '../../../site/js/lib/cabine.js';

const LISTA = [['20516', 'João Pessoa', 'PB'], ['19011', 'Campina Grande', 'PB'], ['41238', 'Belo Horizonte', 'MG'],
  ['90514', 'Campo Grande', 'MS'], ['20001', 'Santa Luzia', 'PB'], ['41002', 'Santa Luzia', 'MG']];

test('normaliza ignora acentos, caixa e espaços', () => {
  assert.equal(normaliza('  João   PESSOA '), 'joao pessoa');
});

test('achaMunicipios acha pelo nome exato, filtra pela UF e só cai para o começo do nome sem nome exato', () => {
  assert.deepEqual(achaMunicipios({ nome: 'joao pessoa', uf: null }, LISTA).map(m => m.cod), ['20516']);
  assert.deepEqual(achaMunicipios({ nome: 'Santa Luzia', uf: null }, LISTA).map(m => m.cod), ['20001', '41002']);
  assert.deepEqual(achaMunicipios({ nome: 'Santa Luzia', uf: 'MG' }, LISTA).map(m => m.cod), ['41002']);
  assert.deepEqual(achaMunicipios({ nome: 'Campina', uf: null }, LISTA).map(m => m.cod), ['19011']);
  assert.deepEqual(achaMunicipios({ nome: 'Recife', uf: null }, LISTA), []);
});

test('escolhePolitico prefere o nome igual; depois quem venceu mais e concorreu por último, e guarda os parecidos', () => {
  const fichas = [
    { id: 1, nome: 'JAIR MESSIAS BOLSONARO', vitorias: 1, ultimo_ano: 2022 },
    { id: 2, nome: 'FLAVIO NANTES BOLSONARO', vitorias: 0, ultimo_ano: 2026 },
    { id: 3, nome: 'JOSE BOLSONARO', vitorias: 0, ultimo_ano: 2012 },
  ];
  assert.equal(escolhePolitico(fichas, 'Bolsonaro').escolhido.id, 1);
  assert.equal(escolhePolitico(fichas, 'Flávio Nantes Bolsonaro').escolhido.id, 2);
  assert.deepEqual(escolhePolitico(fichas, 'Bolsonaro').parecidos.map(f => f.id), [2, 3]);
  assert.equal(escolhePolitico([], 'Ninguém').escolhido, null);
});

test('escolhePolitico, sem nome igual, prefere quem disputou o cargo mais alto ao homônimo de cargo menor', () => {
  const fichas = [
    { id: 1, nome: 'CIRO GOMES DA SILVA', cargo: 'VEREADOR', vitorias: 0, ultimo_ano: 2024 },
    { id: 2, nome: 'CIRO FERREIRA GOMES', cargo: 'PRESIDENTE', vitorias: 0, ultimo_ano: 2022 },
  ];
  assert.equal(escolhePolitico(fichas, 'Ciro Gomes').escolhido.id, 2);
});

test('resumoCarreira conta candidaturas, vitórias, cargos e partidos e acha a maior votação', () => {
  const r = resumoCarreira([
    { ano: 2018, cargo: 'PRESIDENTE', sigla: 'PT', eleito: false, votos: null },
    { ano: 2022, cargo: 'PRESIDENTE', sigla: 'PT', eleito: true, votos: 57120571 },
    { ano: 2026, cargo: 'PRESIDENTE', sigla: 'PT', eleito: true, votos: 53722151 },
    { ano: 2014, cargo: 'GOVERNADOR', sigla: 'PSB', eleito: true, votos: null },
  ]);
  assert.equal(r.candidaturas, 4);
  assert.equal(r.vitorias, 3);
  assert.deepEqual(r.cargos, ['GOVERNADOR', 'PRESIDENTE']);
  assert.deepEqual(r.partidos, ['PSB', 'PT']);
  assert.deepEqual([r.maiorVotacao.ano, r.maiorVotacao.votos], [2022, 57120571]);
});

test('votacao ordena pelos votos e dá a porcentagem de cada um nos dois turnos', () => {
  const linhas = votacao([
    { nome: 'B', votos: 30, votos_2t: 40 }, { nome: 'A', votos: 60, votos_2t: 60 }, { nome: 'C', votos: 10, votos_2t: null },
  ]);
  assert.deepEqual(linhas.map(l => l.nome), ['A', 'B', 'C']);
  assert.deepEqual(linhas.map(l => l.pct), [60, 30, 10]);
  assert.deepEqual(linhas.map(l => l.pct2t), [60, 40, null]);
});

test('citados acha os nomes que a resposta cita: o nome inteiro ou duas palavras dele', () => {
  const texto = 'Luiz Inácio Lula da Silva (PT) teve 51,8%, contra 48,2% de Flavio Bolsonaro (PL).';
  const nomes = ['LUIZ INÁCIO LULA DA SILVA', 'FLAVIO NANTES BOLSONARO', 'JAIR MESSIAS BOLSONARO', 'Belo Horizonte'];
  assert.deepEqual(citados(texto, nomes), ['LUIZ INÁCIO LULA DA SILVA', 'FLAVIO NANTES BOLSONARO']);
  assert.deepEqual(citados('Em Belo Horizonte, o voto...', nomes), ['Belo Horizonte']);
  assert.deepEqual(citados('Macapá cresceu.', ['Macapá']), ['Macapá']);
});

test('linksDoCandidato leva à carreira e, de 2018 em diante nos seis estados ou para presidente, às páginas do recorte', () => {
  const presidente = linksDoCandidato({ pid: 7, ano: 2026, cargo: 'PRESIDENTE', uf: null, mun: null });
  assert.deepEqual(presidente.map(l => l.href), [
    'pergunta-10.html#7',
    'pergunta-1.html#ano=2026&cargo=PRESIDENTE&pid=7',
    'pergunta-2.html#ano=2026&cargo=PRESIDENTE&pid=7',
    'pergunta-8.html#ano=2026&cargo=PRESIDENTE&pid=7',
    'pergunta-9.html#ano=2026&cargo=PRESIDENTE&pid=7',
  ]);
  const prefeito = linksDoCandidato({ pid: 3, ano: 2024, cargo: 'PREFEITO', uf: 'AP', mun: '06050' });
  assert.equal(prefeito[1].href, 'pergunta-1.html#ano=2024&cargo=PREFEITO&uf=AP&mun=06050&pid=3');
  const deputado = linksDoCandidato({ pid: 4, ano: 2022, cargo: 'DEPUTADO FEDERAL', uf: 'MG', mun: '41238' });
  assert.equal(deputado[1].href, 'pergunta-1.html#ano=2022&cargo=DEPUTADO+FEDERAL&uf=MG&pid=4');
  assert.deepEqual(linksDoCandidato({ pid: 5, ano: 2022, cargo: 'GOVERNADOR', uf: 'CE', mun: null }).map(l => l.href), ['pergunta-10.html#5']);
  assert.deepEqual(linksDoCandidato({ pid: 6, ano: 2014, cargo: 'SENADOR', uf: 'PB', mun: null }).map(l => l.href), ['pergunta-10.html#6']);
  assert.deepEqual(linksDoCandidato({ pid: null, ano: 2026, cargo: 'PRESIDENTE', uf: null, mun: null }).length, 4);
});

test('linksDoMunicipio leva às páginas dos índices, da escolaridade, dos prefeitos, do voto e do custo da prefeitura', () => {
  assert.deepEqual(linksDoMunicipio({ cod: '20516', uf: 'PB' }, 2026).map(l => l.href), [
    'pergunta-3.html#ano=2026&mun=20516',
    'pergunta-4.html#lugar=20516',
    'pergunta-6.html#ano=2024&cargo=PREFEITO&lugar=20516',
    'pergunta-7.html#cargo=PRESIDENTE&ano=2026&uf=PB&mun=20516',
    'pergunta-1.html#ano=2024&cargo=PREFEITO&uf=PB&mun=20516',
  ]);
});
