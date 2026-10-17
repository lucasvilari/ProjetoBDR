// Pergunta 2: o prédio do patrimônio. Cada andar é uma faixa de patrimônio (o térreo, sem bens; a cobertura,
// acima de R$ 5 milhões), cada janela um candidato (ou um grupo deles) e cada janela acesa um eleito.

/** Janelas e janelas acesas de um andar quando cada janela vale `passo` candidatos. Andar com candidatos tem ao
 *  menos uma janela, e andar com eleito tem ao menos uma acesa. */
export function janelasDoAndar(candidatos, eleitos, passo) {
  const janelas = candidatos > 0 ? Math.max(1, Math.round(candidatos / passo)) : 0;
  const acesas = eleitos > 0 ? Math.min(janelas, Math.max(1, Math.round(eleitos / passo))) : 0;
  return { janelas, acesas };
}

/** As faixas na ordem em que aparecem de cima para baixo: da mais rica (cobertura) à sem bens (térreo). */
export const ordemDosAndares = n => Array.from({ length: n }, (_, i) => n - 1 - i);
