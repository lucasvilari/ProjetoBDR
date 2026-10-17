import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBJETOS, objetoDoTipo } from '../../../site/js/lib/propaganda.js';

// os tipos de despesa que aparecem no banco (consulta p09a, 2018 a 2024)
const TIPOS_DO_BANCO = ['Publicidade por materiais impressos', 'Despesas com pessoal', 'Atividades de militância e mobilização de rua',
  'Serviços prestados por terceiros', 'Produção de programas de rádio, televisão ou vídeo', 'Publicidade por adesivos',
  'Despesa com Impulsionamento de Conteúdos', 'Serviços advocatícios', 'Cessão ou locação de veículos',
  'Doações financeiras a outros candidatos/partidos', 'Combustíveis e lubrificantes', 'Serviços contábeis', 'Diversas a especificar',
  'Pesquisas ou testes eleitorais', 'Despesas com transporte ou deslocamento', 'Produção de jingles, vinhetas e slogans',
  'Locação/cessão de bens imóveis', 'Criação e inclusão de páginas na internet', 'Serviços próprios prestados por terceiros',
  'Locação/cessão de bens móveis (exceto veículos)', 'Eventos de promoção da candidatura', 'Publicidade por jornais e revistas',
  'Alimentação', 'Correspondências e despesas postais', 'Publicidade por carros de som', 'Comícios', 'Materiais de expediente',
  'Despesas com Hospedagem', 'Encargos financeiros, taxas bancárias e/ou op. cartão de crédito', 'Passagem Aérea',
  'Pré-instalação física de comitê de campanha', 'Água', 'Taxa de Administração de Financiamento Coletivo',
  'Aquisição/Doação de bens móveis ou imóveis', 'Energia elétrica', 'Despesa com geradores de energia', 'Impostos, contribuições e taxas',
  'Multas eleitorais', 'Telefone', 'Encargos sociais', 'Reembolsos de gastos realizados por eleitores'];

test('cada tipo de despesa vira o seu objeto da rua', () => {
  assert.equal(objetoDoTipo('Publicidade por carros de som'), 'carro-de-som');
  assert.equal(objetoDoTipo('Publicidade por materiais impressos'), 'santinhos');
  assert.equal(objetoDoTipo('Despesa com Impulsionamento de Conteúdos'), 'celular');
  assert.equal(objetoDoTipo('Criação e inclusão de páginas na internet'), 'celular');
  assert.equal(objetoDoTipo('Produção de jingles, vinhetas e slogans'), 'tv-radio');
  assert.equal(objetoDoTipo('Comícios'), 'comicio');
  assert.equal(objetoDoTipo('Eventos de promoção da candidatura'), 'comicio');
  assert.equal(objetoDoTipo('Atividades de militância e mobilização de rua'), 'militancia');
  assert.equal(objetoDoTipo('Publicidade por jornais e revistas'), 'jornal');
  assert.equal(objetoDoTipo('Serviços contábeis'), 'comite');
});
test('todo tipo do banco cai num objeto da rua', () => {
  const ids = OBJETOS.map(o => o.id);
  for (const t of TIPOS_DO_BANCO) assert.ok(ids.includes(objetoDoTipo(t)), t);
  assert.deepEqual(ids, ['santinhos', 'carro-de-som', 'adesivos', 'celular', 'tv-radio', 'comicio', 'militancia', 'jornal', 'comite']);
});
