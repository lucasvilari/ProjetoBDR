// Pergunta 6: a alternância de poder nas prefeituras. Cada eleição é comparada com a anterior do mesmo município: o
// partido do prefeito eleito mudou? a pessoa mudou? Como na consulta p06a, a troca de pessoa só conta quando se sabe
// quem era o prefeito anterior.

/** As trocas de uma lista de prefeitos em ordem de eleição ({ ano, pid, partido }): para cada eleição a partir da
 *  segunda, { ano, partido (mudou?), pessoa (mudou? null sem saber quem era) }. */
export function trocas(lista) {
  return lista.slice(1).map((atual, i) => {
    const antes = lista[i];
    return { ano: atual.ano, partido: atual.partido !== antes.partido,
      pessoa: antes.pid == null ? null : atual.pid != null && atual.pid !== antes.pid };
  });
}

/** A soma de vários municípios nos anos pedidos: municípios com prefeito eleito nesses anos, idade média dos eleitos,
 *  eleições comparadas e a porcentagem delas com troca de partido e de pessoa. */
export function alternancia(listas, anos) {
  let municipios = 0, somaIdade = 0, nIdade = 0, eleicoes = 0, partido = 0, comPessoa = 0, pessoa = 0;
  for (const lista of listas) {
    const nos = lista.filter(x => anos.includes(x.ano));
    if (!nos.length) continue;
    municipios += 1;
    for (const x of nos) if (x.idade != null) { somaIdade += x.idade; nIdade += 1; }
    for (const t of trocas(lista).filter(t => anos.includes(t.ano))) {
      eleicoes += 1; partido += t.partido;
      if (t.pessoa != null) { comPessoa += 1; pessoa += t.pessoa; }
    }
  }
  return { municipios, eleicoes, idade: nIdade ? somaIdade / nIdade : null,
    partido: eleicoes ? (100 * partido) / eleicoes : null, pessoa: comPessoa ? (100 * pessoa) / comPessoa : null };
}
