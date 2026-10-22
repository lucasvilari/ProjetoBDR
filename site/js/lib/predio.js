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

/** Por onde passa alguém andando dentro de um andar: a fileira inteira de uma janela sorteada (as janelas quebram linha,
 *  e quem anda não atravessa o teto), quase sempre da última janela até a primeira e, uma vez em três, ao contrário.
 *  `topos`: a altura de cada janela no andar, na ordem; `sorteio()` dá números entre 0 e 1. Devolve os índices das
 *  janelas na ordem em que a pessoa passa, ou null se a fileira tem uma janela só. */
export function trechoDoPasseio(topos, sorteio) {
  if (topos.length < 2) return null;
  const k = Math.floor(sorteio() * topos.length);
  const fila = topos.map((t, i) => i).filter(i => topos[i] === topos[k]);
  if (fila.length < 2) return null;
  return sorteio() < 1 / 3 ? fila : fila.reverse();
}
