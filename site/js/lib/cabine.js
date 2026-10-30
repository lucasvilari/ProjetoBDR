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

// as palavras que não identificam ninguém num nome
const LIGACOES = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

/** Os nomes (políticos ou lugares) que o texto cita: o nome inteiro ou, num nome de três palavras ou mais, duas delas
 *  ("Flavio Bolsonaro" cita FLAVIO NANTES BOLSONARO, mas "Bolsonaro" sozinho não escolhe entre os Bolsonaros). */
export function citados(texto, nomes) {
  const alvo = ` ${normaliza(texto).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return nomes.filter(nome => {
    const n = normaliza(nome).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (alvo.includes(` ${n} `)) return true;
    const palavras = n.split(' ').filter(p => p.length >= 3 && !LIGACOES.has(p));
    return palavras.length >= 3 && palavras.filter(p => alvo.includes(` ${p} `)).length >= 2;
  });
}

const SEIS = ['AP', 'MG', 'MS', 'PB', 'RO', 'RR'];
const NO_MUNICIPIO = ['PREFEITO', 'VEREADOR'];

/** Os links de um candidato numa eleição: a carreira e, onde o site tem cada candidato (de 2018 em diante, nos seis
 *  estados ou para presidente), as perguntas 1, 2, 8 e 9 já no recorte dele, abertas nele (pid). */
export function linksDoCandidato({ pid, ano, cargo, uf, mun }) {
  const links = pid ? [{ rotulo: 'Carreira política', href: `pergunta-10.html#${pid}` }] : [];
  if (ano < 2018 || (cargo !== 'PRESIDENTE' && !SEIS.includes(uf))) return links;
  const r = new URLSearchParams({ ano, cargo });
  if (cargo !== 'PRESIDENTE') r.set('uf', uf);
  if (NO_MUNICIPIO.includes(cargo) && mun) r.set('mun', mun);
  if (pid) r.set('pid', pid);
  return [...links,
    { rotulo: `Gasto de campanha em ${ano}`, href: `pergunta-1.html#${r}` },
    { rotulo: `Patrimônio declarado em ${ano}`, href: `pergunta-2.html#${r}` },
    { rotulo: `Dinheiro público em ${ano}`, href: `pergunta-8.html#${r}` },
    { rotulo: `Onde gastou em propaganda em ${ano}`, href: `pergunta-9.html#${r}` }];
}

/** Os links de um município dos seis estados: índices e voto (no ano mais recente), escolaridade, prefeitos, para que
 *  lado vota e o custo da prefeitura em 2024. */
export function linksDoMunicipio({ cod, uf }, ultimoAno) {
  return [
    { rotulo: 'Riqueza, IDHM e voto', href: `pergunta-3.html#ano=${ultimoAno}&mun=${cod}` },
    { rotulo: 'Escolaridade de quem vota', href: `pergunta-4.html#lugar=${cod}` },
    { rotulo: 'Prefeitos desde 2000', href: `pergunta-6.html#ano=2024&cargo=PREFEITO&lugar=${cod}` },
    { rotulo: `Para que lado votou para presidente em ${ultimoAno}`, href: `pergunta-7.html#cargo=PRESIDENTE&ano=${ultimoAno}&uf=${uf}&mun=${cod}` },
    { rotulo: 'Custo da prefeitura em 2024', href: `pergunta-1.html#ano=2024&cargo=PREFEITO&uf=${uf}&mun=${cod}` },
  ];
}
