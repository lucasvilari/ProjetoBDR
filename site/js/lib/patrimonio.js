// O patrimônio de um político ao longo da carreira: a soma dos bens declarados ao TSE em cada candidatura (o TSE publica
// os bens de 2018 em diante) e quanto ela mudou de uma candidatura para outra. Valores nominais, sem descontar a inflação.

/** A variação em %, de `anterior` para `atual`; sem anterior positivo (nenhum bem) não há porcentagem. */
export function variacao(atual, anterior) {
  if (atual == null || anterior == null || anterior <= 0) return null;
  return (100 * (atual - anterior)) / anterior;
}

/** As candidaturas com patrimônio, cada uma comparada com a de uma eleição anterior que declarou algum bem (qualquer cargo), como
 *  no ranking dos eleitos. Devolve { passos: [{ ...candidatura, anterior, anoAnterior, variacao }], de, ate, variacao }:
 *  `de` é a primeira candidatura com bens, `ate` a última, e `variacao` a mudança entre elas. */
export function evolucaoDoPatrimonio(cands) {
  const passos = [];
  const lista = cands.filter(c => c.patrimonio != null).sort((a, b) => a.ano - b.ano);
  for (const c of lista) {
    // a base é de uma eleição anterior: duas candidaturas do mesmo ano não se comparam
    const base = lista.filter(b => b.ano < c.ano && b.patrimonio > 0).at(-1);
    passos.push({ ...c, anterior: base?.patrimonio ?? null, anoAnterior: base?.ano ?? null, variacao: variacao(c.patrimonio, base?.patrimonio) });
  }
  const comBens = passos.filter(p => p.patrimonio > 0);
  const de = comBens[0] ?? null, ate = passos.at(-1) ?? null;
  return { passos, de, ate, variacao: de && ate && ate.ano > de.ano ? variacao(ate.patrimonio, de.patrimonio) : null };
}
