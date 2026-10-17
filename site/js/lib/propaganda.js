// A rua da campanha (pergunta 9): os objetos de propaganda e o tipo de despesa do TSE que cada um representa.
// Despesas de bastidor (pessoal, advogados, contadores, combustível, veículos, imóveis...) ficam no comitê.

export const OBJETOS = [
  { id: 'santinhos', nome: 'Santinhos e panfletos', tipos: ['Publicidade por materiais impressos'] },
  { id: 'carro-de-som', nome: 'Carro de som', tipos: ['Publicidade por carros de som'] },
  { id: 'adesivos', nome: 'Adesivos', tipos: ['Publicidade por adesivos'] },
  { id: 'celular', nome: 'Internet', tipos: ['Despesa com Impulsionamento de Conteúdos', 'Criação e inclusão de páginas na internet'] },
  { id: 'tv-radio', nome: 'TV e rádio', tipos: ['Produção de programas de rádio, televisão ou vídeo', 'Produção de jingles, vinhetas e slogans'] },
  { id: 'comicio', nome: 'Comícios e eventos', tipos: ['Comícios', 'Eventos de promoção da candidatura'] },
  { id: 'militancia', nome: 'Militância de rua', tipos: ['Atividades de militância e mobilização de rua'] },
  { id: 'jornal', nome: 'Jornais e revistas', tipos: ['Publicidade por jornais e revistas'] },
  { id: 'comite', nome: 'Comitê (bastidores)', tipos: [] },
];

const DO_TIPO = new Map(OBJETOS.flatMap(o => o.tipos.map(t => [t, o.id])));

/** O objeto da rua de um tipo de despesa; o que não é propaganda vai para o comitê. */
export const objetoDoTipo = tipo => DO_TIPO.get(tipo) ?? 'comite';
