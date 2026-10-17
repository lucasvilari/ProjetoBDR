// Os dez cifrões da pergunta 8 (a parcela de dinheiro público que o leitor escolhe, em meios cifrões de 5%) e as
// faixas de patrimônio da pergunta 2.

/** Quanto de cada um dos 10 cifrões fica preenchido para um percentual (75 → sete cheios e meio). */
export function preenchimento(taxa) {
  const t = Math.max(0, Math.min(100, Number(taxa) || 0));
  return Array.from({ length: 10 }, (_, i) => Math.max(0, Math.min(1, (t - 10 * i) / 10)));
}

/** A faixa de patrimônio de um candidato, com os mesmos cortes da consulta do gerador
 *  (sem bens, até 100 mil, até 500 mil, até 1 milhão, até 5 milhões, acima de 5 milhões). */
export function faixaDePatrimonio(valor) {
  const v = Number(valor) || 0;
  if (v <= 0) return 0;
  return [100_000, 500_000, 1_000_000, 5_000_000].filter(c => v >= c).length + 1;
}


const soma = linhas => {
  const candidatos = linhas.reduce((t, l) => t + l.candidatos, 0), eleitos = linhas.reduce((t, l) => t + l.eleitos, 0);
  return { candidatos, eleitos, taxa: candidatos ? (100 * eleitos) / candidatos : null };
};

/** Pergunta 8: candidatos e eleitos com pelo menos `meios` meios cifrões de dinheiro público (cada meio = 5% da
 *  receita) e com menos que isso. `fatias`: [{meio_cifrao, candidatos, eleitos}]. */
export function comPeloMenos(fatias, meios) {
  return { com: soma(fatias.filter(f => f.meio_cifrao >= meios)), sem: soma(fatias.filter(f => f.meio_cifrao < meios)) };
}

/** Quantos meios cifrões vale um clique no cifrão `i` (0 a 9), na posição `x` (0 a 1) dentro dele. */
export const meiosDoClique = (i, x) => 2 * i + (x < 0.5 ? 1 : 2);
