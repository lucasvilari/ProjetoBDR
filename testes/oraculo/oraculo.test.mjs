import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validaPedido, montaMensagens, textoDoEvento, validaPlano, mensagensDoPlano, lePlano } from '../../oraculo/src/pedido.js';

test('validaPedido aceita um retrato com a pergunta do leitor e o número da questão', () => {
  assert.deepEqual(validaPedido({ numero: 1, retrato: 'Pergunta 1: x', pergunta: '  resuma a página  ' }),
    { ok: true, numero: 1, retrato: 'Pergunta 1: x', pergunta: 'resuma a página' });
});

test('validaPedido exige uma pergunta escrita', () => {
  assert.equal(validaPedido({ numero: 7, retrato: 'r' }).ok, false);
  assert.equal(validaPedido({ numero: 7, retrato: 'r', pergunta: '   ' }).ok, false);
  assert.equal(validaPedido({ numero: 7, retrato: 'r', pergunta: 'a' }).ok, false);
});

test('validaPedido recusa retrato vazio ou grande demais, pergunta longa e questão inexistente', () => {
  assert.equal(validaPedido({ numero: 1, retrato: '' }).ok, false);
  assert.equal(validaPedido({ numero: 1, retrato: 'x'.repeat(20001) }).ok, false);
  assert.equal(validaPedido({ numero: 1, retrato: 'x', pergunta: 'y'.repeat(301) }).ok, false);
  assert.equal(validaPedido({ numero: 11, retrato: 'x', pergunta: 'p?' }).ok, false);
  assert.equal(validaPedido(null).ok, false);
});

test('montaMensagens põe as regras e o método da questão nas instruções, e o retrato e a pergunta na mensagem do leitor', () => {
  const [sistema, leitor] = montaMensagens({ numero: 5, retrato: 'RETRATO', pergunta: 'quem puxou?' });
  assert.equal(sistema.role, 'system');
  assert.match(sistema.content, /quociente/i);                 // o método da questão 5
  assert.match(sistema.content, /não .*(candidat|partido)/i);  // a regra de neutralidade
  assert.equal(leitor.role, 'user');
  assert.match(leitor.content, /RETRATO/);
  assert.match(leitor.content, /quem puxou\?/);
});

test('montaMensagens diz ao oráculo como recusar, no tom de oráculo, a pergunta que não dá para responder', () => {
  const [sistema] = montaMensagens({ numero: 1, retrato: 'R', pergunta: 'qual a capital da França?' });
  assert.match(sistema.content, /não entend/i);
  assert.match(sistema.content, /resum/i);       // pedir um resumo da página vale como pergunta
});

test('textoDoEvento lê os dois formatos do fluxo do Workers AI e ignora o resto', () => {
  assert.equal(textoDoEvento('data: {"response":"Olá"}'), 'Olá');
  assert.equal(textoDoEvento('data: {"choices":[{"delta":{"content":" mundo"}}]}'), ' mundo');
  assert.equal(textoDoEvento('data: {"choices":[{"delta":{"reasoning_content":"pensando"}}]}'), '');
  assert.equal(textoDoEvento('data: [DONE]'), '');
  assert.equal(textoDoEvento(''), '');
  assert.equal(textoDoEvento('data: {quebrado'), '');
});

test('montaMensagens pede uma resposta direta, apoiada no padrão dos números, antes das ressalvas', () => {
  const [sistema] = montaMensagens({ numero: 2, retrato: 'R', pergunta: 'o patrimônio ajuda a eleger?' });
  assert.match(sistema.content, /comece respondendo/i);
  assert.match(sistema.content, /padrão|tendência/i);
  assert.match(sistema.content, /não faça contas/i);    // o modelo erra contas: as comparações vêm prontas no retrato
  assert.match(sistema.content, /comparações prontas/i);
});

test('as instruções limitam a ressalva de causalidade, o tamanho e a frase das névoas, e pedem critérios objetivos', () => {
  const [sistema] = montaMensagens({ numero: 1, retrato: 'R', pergunta: 'a carreira foi bem-sucedida?' });
  assert.match(sistema.content, /só quando a resposta falar de uma relação/i);
  assert.match(sistema.content, /2 ou 3 parágrafos/i);
  assert.match(sistema.content, /nunca.*névoas.*e depois responda|depois de usá-la, não responda/i);
  assert.match(sistema.content, /critérios objetivos/i);
  assert.match(sistema.content, /praticamente igual/i);
});

test('o método da questão 8 explica que a parcela mede dependência, não quanto se recebeu', () => {
  const [sistema] = montaMensagens({ numero: 8, retrato: 'R', pergunta: 'p?' });
  assert.match(sistema.content, /dependência/i);
  assert.doesNotMatch(sistema.content, /tendem a dar mais a quem já/i);
});

test('o oráculo atende a questão 3 e conhece o método dela', () => {
  assert.equal(validaPedido({ numero: 3, retrato: 'r', pergunta: 'resuma' }).ok, true);
  const [sistema] = montaMensagens({ numero: 3, retrato: 'R', pergunta: 'p?' });
  assert.match(sistema.content, /isentos/i);
  assert.match(sistema.content, /IDHM/);
});

// ---------------------------------------------------------------- a cabine: perguntas gerais

test('validaPlano aceita só a pergunta, com o mesmo tamanho das perguntas das páginas', () => {
  assert.deepEqual(validaPlano({ modo: 'plano', pergunta: '  compare Lula e Ciro  ' }), { ok: true, pergunta: 'compare Lula e Ciro' });
  assert.equal(validaPlano({ modo: 'plano', pergunta: 'a' }).ok, false);
  assert.equal(validaPlano({ modo: 'plano', pergunta: 'y'.repeat(301) }).ok, false);
  assert.equal(validaPlano(null).ok, false);
});

test('mensagensDoPlano pede só um objeto JSON com os tipos de pedido que o site sabe buscar', () => {
  const [sistema, leitor] = mensagensDoPlano('como foi o segundo turno de 2026?');
  assert.match(sistema.content, /JSON/);
  for (const tipo of ['politicos', 'municipios', 'eleicao', 'fora']) assert.match(sistema.content, new RegExp(`"${tipo}"`));
  assert.match(leitor.content, /segundo turno de 2026/);
});

test('lePlano lê o JSON do modelo mesmo com texto ou cercas em volta e descarta o que não conhece', () => {
  const plano = lePlano('Claro! ```json\n{"tipo":"politicos","politicos":["Lula"," Ciro Gomes ","x"],"ano":2022}\n```');
  assert.deepEqual(plano.politicos, ['Lula', 'Ciro Gomes']);   // nomes curtos demais saem
  assert.equal(plano.tipo, 'politicos');
  assert.equal(plano.ano, 2022);
  assert.deepEqual(lePlano('não sei').tipo, 'fora');
  assert.deepEqual(lePlano('{"tipo":"hackear"}').tipo, 'fora');
});

test('lePlano normaliza cargo, UF, ano e municípios', () => {
  const plano = lePlano(JSON.stringify({ tipo: 'eleicao', cargo: 'Deputado Federal', uf: 'mg', ano: 2023,
    municipio: { nome: 'Belo Horizonte', uf: 'MG' }, municipios: ['João Pessoa', { nome: 'Macapá', uf: 'zz' }] }));
  assert.equal(plano.cargo, 'DEPUTADO FEDERAL');
  assert.equal(plano.uf, 'MG');
  assert.equal(plano.ano, null);                                  // 2023 não teve eleição
  assert.deepEqual(plano.municipio, { nome: 'Belo Horizonte', uf: 'MG' });
  assert.deepEqual(plano.municipios, [{ nome: 'João Pessoa', uf: null }, { nome: 'Macapá', uf: null }]);
  assert.equal(lePlano('{"tipo":"eleicao","cargo":"rei"}').cargo, null);
});

test('validaPedido aceita o retrato da cabine (questão 0) e as instruções explicam de onde ele vem', () => {
  assert.equal(validaPedido({ numero: 0, retrato: 'R', pergunta: 'compare os dois' }).ok, true);
  const [sistema] = montaMensagens({ numero: 0, retrato: 'R', pergunta: 'compare os dois' });
  assert.match(sistema.content, /cabine/i);
});

test('lePlano trata como eleição o "fora" que veio com cargo (o modelo às vezes recusa outro estado)', () => {
  const p = lePlano('{"tipo":"fora","ano":2022,"cargo":"GOVERNADOR","uf":"SP"}');
  assert.deepEqual([p.tipo, p.ano, p.cargo, p.uf], ['eleicao', 2022, 'GOVERNADOR', 'SP']);
  assert.equal(lePlano('{"tipo":"fora"}').tipo, 'fora');
});
