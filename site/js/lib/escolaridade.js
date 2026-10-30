// Pergunta 4: a escala de escolaridade de 0 (analfabeto) a 7 (superior completo), a taxa de eleição de cada degrau e
// a correlação entre o nível de quem votou e o de quem recebeu os votos.

export const NOMES_NIVEIS = ['analfabeto', 'lê e escreve', 'ensino fundamental incompleto', 'ensino fundamental completo',
  'ensino médio incompleto', 'ensino médio completo', 'superior incompleto', 'superior completo'];

/** Uma média da escala em palavras: o degrau, se ela está a menos de 0,05 dele, ou os dois degraus entre os quais cai. */
export function nivelEmPalavras(v) {
  if (v == null) return 'sem dado';
  const perto = Math.round(v);
  if (Math.abs(v - perto) < 0.05) return NOMES_NIVEIS[perto];
  return `entre ${NOMES_NIVEIS[Math.floor(v)]} e ${NOMES_NIVEIS[Math.ceil(v)]}`;
}

/** A porcentagem de eleitos de [candidatos, eleitos]; null sem candidatos. */
export const taxa = ([candidatos, eleitos]) => (candidatos ? (100 * eleitos) / candidatos : null);

/** A correlação de Pearson dos pares [x, y], arredondada a nove casas; null com menos de dois pares ou sem variação. */
export function pearson(pares) {
  const n = pares.length;
  if (n < 2) return null;
  const mx = pares.reduce((s, p) => s + p[0], 0) / n, my = pares.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pares) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  if (!sxx || !syy) return null;
  return Math.round((sxy / Math.sqrt(sxx * syy)) * 1e9) / 1e9;
}
