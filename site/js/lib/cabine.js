// As partes puras da cabine do oráculo (js/cabine.js): achar municípios e políticos pelo nome que o leitor escreveu e
// resumir o que o retrato leva. Testadas em testes/site/js/cabine.test.mjs.

/** Sem acentos, em minúsculas, com um espaço só entre as palavras. */
export const normaliza = t => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Os municípios com o nome pedido ({ nome, uf }) na lista [código, nome, UF]: os de nome igual; sem nenhum, os que
 *  começam pelo nome. Com a UF, só os dela. Devolve [{ cod, nome, uf }]. */
export function achaMunicipios({ nome, uf }, lista) {
  const alvo = normaliza(nome);
  const daUf = lista.filter(([, , u]) => !uf || u === uf).map(([cod, n, u]) => ({ cod, nome: n, uf: u, chave: normaliza(n) }));
  const iguais = daUf.filter(m => m.chave === alvo);
  const achados = iguais.length ? iguais : daUf.filter(m => m.chave.startsWith(alvo));
  return achados.map(({ chave, ...m }) => m);
}

// do cargo mais alto ao mais baixo: com nomes parecidos, quem a pergunta cita costuma ser quem disputou o mais alto
const ALTURA = ['PRESIDENTE', 'GOVERNADOR', 'SENADOR', 'DEPUTADO FEDERAL', 'DEPUTADO ESTADUAL', 'PREFEITO', 'VEREADOR'];
const altura = cargo => (ALTURA.includes(cargo) ? ALTURA.length - ALTURA.indexOf(cargo) : 0);

/** Entre as fichas que a busca achou (com `cargo`, o último disputado, por extenso), o político de quem a pergunta
 *  fala: o de nome igual ao pedido; sem ele, o do cargo mais alto, depois o que mais venceu e, no empate, o que
 *  concorreu por último. Os outros vão em `parecidos`, para o oráculo avisar. */
export function escolhePolitico(fichas, nome) {
  const alvo = normaliza(nome);
  const ordem = [...fichas].sort((a, b) => (normaliza(b.nome) === alvo) - (normaliza(a.nome) === alvo)
    || altura(b.cargo) - altura(a.cargo) || b.vitorias - a.vitorias || b.ultimo_ano - a.ultimo_ano);
  return { escolhido: ordem[0] ?? null, parecidos: ordem.slice(1) };
}

/** O resumo de uma carreira: candidaturas, vitórias, cargos e partidos diferentes e a maior votação (de 2018 em
 *  diante, quando há votos). */
export function resumoCarreira(cands) {
  const comVotos = cands.filter(c => c.votos > 0);
  return {
    candidaturas: cands.length,
    vitorias: cands.filter(c => c.eleito).length,
    cargos: [...new Set(cands.map(c => c.cargo))].sort(),
    partidos: [...new Set(cands.map(c => c.sigla))].sort(),
    maiorVotacao: comVotos.length ? comVotos.reduce((a, b) => (b.votos > a.votos ? b : a)) : null,
  };
}

/** Os candidatos de uma eleição, do mais votado ao menos votado, com a porcentagem dos votos dados aos candidatos
 *  (pct) e a do 2º turno (pct2t, só para quem foi a ele). */
export function votacao(cands) {
  const total = cands.reduce((s, c) => s + (c.votos ?? 0), 0);
  const total2t = cands.reduce((s, c) => s + (c.votos_2t ?? 0), 0);
  const pct = (v, t) => (v == null || !t ? null : Math.round((1000 * v) / t) / 10);
  return [...cands].sort((a, b) => (b.votos ?? 0) - (a.votos ?? 0))
    .map(c => ({ ...c, pct: pct(c.votos ?? 0, total), pct2t: c.votos_2t ? pct(c.votos_2t, total2t) : null }));
}
